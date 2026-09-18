(function (global) {
  "use strict";

  const CORPUS_URL = "tests/fixtures/aha-projection-product-evaluation-v2.json";
  const HUMAN_REVIEW_URL = "ops/evaluation/aha-projection-product-human-review-v2.json";
  const PRODUCT_KEYS = Object.freeze(["aha_lists_v1", "aha_paths_v1", "aha_concept_lists_v1"]);
  const GUARDED_KEYS = Object.freeze([...PRODUCT_KEYS, "aha_insight_chamber_v1"]);
  const PRODUCTS = Object.freeze(["lists", "paths", "mindmap"]);
  const SEED_TEXT = "Morgenbladet er en norsk avis. Teksten drøfter pressehistorie, redaksjonell uavhengighet, eierskapsskifter og akademisk offentlighet.";
  const ARCHIVED_LIVE_BASELINE = Object.freeze({
    workflow_run_id: 32633381518,
    artifact_id: 9491725428,
    head_sha: "5aab589eed30012c349f4679c201ee87f0a27602",
    generated_at: "2026-08-23T10:24:44.775Z",
    corpus_cases: 27,
    successful_chat_count: 29
  });
  const state = { corpus: null, results: [], running: false, frame: null, cost_control: null, review_source: null, review_contract: null };

  const byId = (id) => global.document.getElementById(id);
  const text = (value) => String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  const wait = (ms) => new Promise((resolve) => global.setTimeout(resolve, ms));
  const escapeHtml = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

  async function waitFor(check, label, timeout = 30000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      try { const value = check(); if (value) return value; } catch {}
      await wait(50);
    }
    throw new Error(`Tidsavbrudd: ${label}`);
  }

  function readStorage(win, key) {
    try { const raw = win.localStorage.getItem(key); return raw == null ? null : JSON.parse(raw); }
    catch { return null; }
  }

  function guardedSnapshot(win) {
    return Object.fromEntries(GUARDED_KEYS.map((key) => [key, win.localStorage.getItem(key)]));
  }

  function fullStorageSnapshot(storage) {
    const snapshot = {};
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index); if (key != null) snapshot[key] = storage.getItem(key);
    }
    return snapshot;
  }

  function restoreStorage(storage, snapshot) {
    storage.clear();
    Object.entries(snapshot || {}).forEach(([key, value]) => storage.setItem(key, value));
  }

  function normalizeReplay(value) {
    if (Array.isArray(value)) return value.map(normalizeReplay);
    if (!value || typeof value !== "object") return value;
    const dynamic = new Set(["analysis_id", "analysis_run_id", "source_id", "created_at", "bundle_id", "analysis_bundle_id"]);
    if (dynamic.has(text(value.field)) && Object.prototype.hasOwnProperty.call(value, "value")) {
      return Object.fromEntries(Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, key === "value" ? "<run-local-identity>" : normalizeReplay(child)]));
    }
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !dynamic.has(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, normalizeReplay(child)]));
  }

  function replayDifference(left, right, path = "surfaces") {
    if (same(left, right)) return null;
    if (Array.isArray(left) || Array.isArray(right)) {
      if (!Array.isArray(left) || !Array.isArray(right)) return { path, reason: "type_changed" };
      if (left.length !== right.length) return { path, reason: "array_length_changed", left: left.length, right: right.length };
      for (let index = 0; index < left.length; index += 1) {
        const difference = replayDifference(left[index], right[index], `${path}[${index}]`);
        if (difference) return difference;
      }
      return null;
    }
    if (!left || !right || typeof left !== "object" || typeof right !== "object") return { path, reason: "value_changed" };
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(left, key) || !Object.prototype.hasOwnProperty.call(right, key)) return { path: `${path}.${key}`, reason: "field_presence_changed" };
      const difference = replayDifference(left[key], right[key], `${path}.${key}`);
      if (difference) return difference;
    }
    return { path, reason: "value_changed" };
  }

  function runtimeFingerprint(win) {
    return {
      semantic_document: Number(win.AHASemanticDocument?.VERSION || 0),
      analysis_bundle: Number(win.AHAAnalysisBundleV2?.VERSION || 0),
      projection_runtime: Number(win.AHAProjectionRuntimeSourceV2?.MODULE_VERSION || 0),
      product_contract: Number(win.AHAProjectionProductContractV2?.CONTRACT_VERSION || win.AHAProjectionProductContractV2?.VERSION || win.AHAProjectionProductContractV2?.MODULE_VERSION || 0)
    };
  }

  function compareReplay(left, right) {
    if (!same(left.runtime_fingerprint, right.runtime_fingerprint)) return { comparable: false, reason: "runtime_version_changed" };
    const leftSurfaces = normalizeReplay(left.model?.surfaces);
    const rightSurfaces = normalizeReplay(right.model?.surfaces);
    if (same(leftSurfaces, rightSurfaces)) return { comparable: true, deterministic: true };
    return { comparable: true, deterministic: false, difference: replayDifference(leftSurfaces, rightSurfaces) };
  }

  async function loadFrame({ reload = false } = {}) {
    if (reload && state.frame?.contentWindow) {
      const loaded = new Promise((resolve) => state.frame.addEventListener("load", resolve, { once: true }));
      state.frame.contentWindow.location.reload();
      await loaded;
    } else if (!state.frame) {
      const frame = global.document.createElement("iframe");
      frame.className = "review-frame";
      frame.title = "Isolert AHA Chat-evalueringskontekst";
      frame.src = `chat.html?projection_review_v2=${Date.now()}`;
      const loaded = new Promise((resolve) => frame.addEventListener("load", resolve, { once: true }));
      global.document.body.appendChild(frame);
      state.frame = frame;
      await loaded;
    }
    const win = await waitFor(() => state.frame?.contentWindow?.AHAChat?.submitAhaChatMessage && state.frame.contentWindow, "AHA Chat runtime");
    win.AHA_SYNTHESIS_COST_CONTROL = clone(state.cost_control);
    win.AHAMemoryControls?.enableSaving?.();
    win.AHAMemoryControls?.disableMemoryUse?.();
    await win.AHAAnalysisArtifacts?.ensureV2Dependencies?.();
    await waitFor(() => win.AHAProjectionRuntimeSourceV2?.build, "ProjectionRuntimeSourceV2");
    return win;
  }

  function provenanceErrors(sourceText, bundle, model, cache) {
    const errors = [];
    const identity = bundle?.identity || {};
    const cacheIdentity = {
      analysis_id: text(cache?.analysisId || cache?.payload?.analysisId),
      analysis_run_id: text(cache?.analysisRunId || cache?.runId || cache?.payload?.analysisRunId || cache?.payload?.runId),
      source_id: text(cache?.sourceId || cache?.payload?.sourceId),
      source_sha256: text(cache?.sourceSha256 || cache?.sourceTextHash || cache?.payload?.sourceSha256 || cache?.payload?.sourceTextHash).toLowerCase()
    };
    for (const key of ["analysis_id", "analysis_run_id", "source_id", "source_sha256"]) {
      if (!text(identity[key]) || text(identity[key]) !== text(cacheIdentity[key])) errors.push(`cache_bundle_${key}_mismatch`);
      if (!text(model?.identity?.[key]) || text(model.identity[key]) !== text(identity[key])) errors.push(`bundle_projection_${key}_mismatch`);
    }
    if (!/^[a-f0-9]{64}$/u.test(text(identity.source_sha256))) errors.push("source_sha256_invalid");
    const insights = Array.isArray(model?.surfaces?.insights) ? model.surfaces.insights : [];
    for (const insight of insights) {
      const evidence = Array.isArray(insight?.provenance?.evidence) ? insight.provenance.evidence : [];
      for (const item of evidence) {
        const quote = text(item?.quote || item?.text || item?.excerpt);
        if (!quote || !sourceText.includes(quote)) errors.push(`evidence_not_in_source:${insight.id || "unknown"}`);
      }
    }
    const insightIds = new Set(insights.map((item) => item.id));
    for (const list of model?.surfaces?.lists || []) for (const item of list.items || []) if (!insightIds.has(item.refId)) errors.push(`list_ref_missing:${item.refId}`);
    for (const path of model?.surfaces?.paths || []) for (const step of path.steps || []) if (!insightIds.has(step.refId)) errors.push(`path_ref_missing:${step.refId}`);
    const nodeIds = new Set((model?.surfaces?.mindmap?.nodes || []).map((node) => node.id));
    for (const edge of model?.surfaces?.mindmap?.edges || []) if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) errors.push(`mindmap_edge_dangling:${edge.id}`);
    for (const product of ["list", "path", "mindmap"]) {
      const href = text(model?.product_states?.[product]?.href);
      if (href && (!href.includes(encodeURIComponent(identity.analysis_id)) || !href.includes(identity.source_sha256) || !href.includes(text(model.projection_id)))) errors.push(`deeplink_identity_mismatch:${product}`);
    }
    return [...new Set(errors)];
  }

  async function capture(win, entry) {
    const cache = readStorage(win, "aha_chat_auto_outputs_v1");
    const bundle = win.AHAAnalysisBundleV2?.hydrate?.(cache?.payload?.analysisBundleV2);
    const semanticDocument = cache?.payload?.semanticDocumentV2 || {};
    const model = win.AHAProjectionRuntimeSourceV2?.build?.({ ignoreRequest: true });
    if (!bundle) throw new Error(`${entry.id}: AnalysisBundleV2 mangler eller er ugyldig`);
    if (!model) throw new Error(`${entry.id}: ProjectionProductReadModelV2 mangler`);
    const critical = provenanceErrors(entry.source_text, bundle, model, cache);
    const serialized = JSON.stringify({ bundle, model });
    for (const forbidden of entry.forbidden_terms || []) if (serialized.includes(forbidden)) critical.push(`stale_or_forbidden_text:${forbidden}`);
    if (entry.inaccessible_url_with_pasted_text && serialized.includes("Kilde registrert")) critical.push("metadata_promoted_over_pasted_text");
    return clone({
      case_id: entry.id,
      genre: entry.genre,
      focus: entry.focus,
      expected_visible: entry.expected_visible,
      live_disposition: text(entry.live_disposition) || "coverage_case",
      live_rationale: text(entry.live_rationale),
      bundle_status: bundle.status,
      semantic_diagnostics: {
        document_status: text(semanticDocument.status),
        quality: clone(semanticDocument.quality || {}),
        synthesis_gate: clone(semanticDocument.synthesis_gate || {}),
        candidates: (Array.isArray(semanticDocument.candidate_insights) ? semanticDocument.candidate_insights : []).map((candidate) => ({
          id: text(candidate?.id),
          insight: text(candidate?.insight),
          status: text(candidate?.status),
          blocking_reasons: clone(candidate?.blocking_reasons || []),
          quality_metrics: clone(candidate?.quality_metrics || {})
        }))
      },
      identity: bundle.identity,
      projection_id: model.projection_id,
      model,
      runtime_fingerprint: runtimeFingerprint(win),
      critical_provenance_errors: [...new Set(critical)]
    });
  }

  async function submit(win, entry) {
    const beforeAnalysis = guardedSnapshot(win);
    await win.AHAChat.submitAhaChatMessage(entry.source_text);
    await waitFor(() => readStorage(win, "aha_chat_auto_outputs_v1")?.payload?.analysisBundleV2, `${entry.id} AnalysisBundleV2`, 45000);
    await win.AHAAnalysisArtifacts?.ensureV2Dependencies?.();
    const beforeProjection = guardedSnapshot(win);
    const result = await capture(win, entry);
    const afterProjection = guardedSnapshot(win);
    result.analysis_store_changes = GUARDED_KEYS.filter((key) => beforeAnalysis[key] !== beforeProjection[key]);
    result.guarded_store_writes = GUARDED_KEYS.filter((key) => beforeProjection[key] !== afterProjection[key]);
    if (result.guarded_store_writes.length) result.critical_provenance_errors.push(...result.guarded_store_writes.map((key) => `guarded_store_write:${key}`));
    return result;
  }

  function productOutput(model, product) {
    if (product === "lists") return model?.surfaces?.lists || [];
    if (product === "paths") return model?.surfaces?.paths || [];
    return model?.surfaces?.mindmap || { nodes: [], edges: [], read_only: true };
  }

  function currentProjectionApi() {
    return global.AHASemanticProjectionsV2 || null;
  }

  function currentQualityApi() {
    return global.AHAProjectionArtifactQualityV2 || null;
  }

  function archivedInsightForCurrentProjection(insight) {
    const next = clone(insight) || {};
    const qualityScore = Number(
      insight?.quality?.mean_score
      ?? insight?.quality?.representative_score
      ?? insight?.quality_score
    );
    const concepts = [...new Set([
      ...arr(insight?.semantic_concepts),
      ...arr(insight?.concept_keys)
    ].map(text).filter(Boolean))];

    if (!Number.isFinite(qualityScore)) throw new Error(`Arkivert innsikt mangler quality score: ${text(insight?.id) || "ukjent"}`);
    if (!concepts.length) throw new Error(`Arkivert innsikt mangler concept keys: ${text(insight?.id) || "ukjent"}`);

    next.semantic_concepts = concepts;
    next.eligible_for_insight_review = true;
    next.quality_score = qualityScore;
    return next;
  }

  function reprojectArchivedResult(result) {
    const next = clone(result) || {};
    const archivedModel = next.model || {};
    const archivedInsights = arr(archivedModel?.surfaces?.insights);
    const archivedProjectionId = text(archivedModel?.projection_id);

    if (archivedModel?.status !== "ready" || !archivedInsights.length) {
      next.review_reprojection = {
        mode: "archived_suppressed_output_preserved",
        source_head_sha: ARCHIVED_LIVE_BASELINE.head_sha,
        archived_projection_id: archivedProjectionId || null,
        current_projection_id: null,
        archived_insight_count: archivedInsights.length
      };
      return next;
    }

    const projections = currentProjectionApi();
    const quality = currentQualityApi();
    if (!projections?.project || !projections?.adapters || !quality?.filterReadModel) {
      throw new Error("Dagens projection/quality-runtime mangler; arkivert live-output kan ikke re-projiseres sikkert.");
    }

    const projection = projections.project({
      insights: archivedInsights.map(archivedInsightForCurrentProjection)
    });
    if (projection?.status === "blocked" || projection?.validation?.valid !== true) {
      throw new Error(`${text(next.case_id) || "ukjent_case"}: dagens review-reprojeksjon ble blokkert: ${arr(projection?.blocking_reasons).join(",") || arr(projection?.validation?.errors).join(",") || "ukjent årsak"}`);
    }

    const adapters = projections.adapters(projection);
    const replayModel = {
      ...archivedModel,
      status: "ready",
      projection_id: projection.projection_id,
      surfaces: {
        insights: clone(adapters.insights),
        concepts: clone(adapters.concepts),
        lists: clone(adapters.lists),
        paths: clone(adapters.paths),
        mindmap: clone(adapters.mindmap)
      },
      validation: { valid: true, errors: [] }
    };
    const currentModel = quality.filterReadModel(replayModel);
    if (currentModel?.status !== "ready" || currentModel?.validation?.valid !== true) {
      throw new Error(`${text(next.case_id) || "ukjent_case"}: dagens review-read-model er ikke ready etter reprojeksjon.`);
    }

    next.model = currentModel;
    next.review_reprojection = {
      mode: "current_read_only_projection_from_archived_live_insights",
      source_head_sha: ARCHIVED_LIVE_BASELINE.head_sha,
      archived_projection_id: archivedProjectionId || null,
      current_projection_id: text(currentModel.projection_id) || null,
      archived_insight_count: archivedInsights.length
    };
    return next;
  }

  function rubricModel(contract) {
    if (!contract || contract.schema !== "aha_projection_product_human_review_v2") {
      throw new Error("Canonical human-review-ledger mangler eller har ugyldig schema.");
    }
    const rubric = contract.rubric || {};
    const acceptable = Number(rubric.acceptable_score_minimum);
    if (rubric.scale !== "1-5" || !Number.isInteger(acceptable) || acceptable < 1 || acceptable > 5) {
      throw new Error("Canonical human-review-rubric har ugyldig skala eller terskel.");
    }
    const criteria = {};
    for (const product of PRODUCTS) {
      if (!Array.isArray(rubric[product]) || !rubric[product].length || rubric[product].some((entry) => !text(entry))) {
        throw new Error(`Canonical human-review-rubric mangler kriterier for ${product}.`);
      }
      criteria[product] = rubric[product].map(text);
    }
    return Object.freeze({ scale: rubric.scale, acceptable_score_minimum: acceptable, criteria: clone(criteria) });
  }

  function rubricCriterionLabel(value) {
    const known = {
      tematisk_koherens: "tematisk koherens",
      ikke_triviell: "ikke triviell",
      begrunnet_medlemskap: "begrunnet medlemskap",
      kildebevaring: "kildebevaring",
      progresjon: "progresjon",
      overganger: "overganger",
      laeringsutbytte: "læringsutbytte",
      aapent_spoersmaal: "åpent spørsmål",
      hierarki: "hierarki",
      meningsfulle_grener: "meningsfulle grener",
      stoeykontroll: "støykontroll",
      resonans_semantikk: "resonanssemantikk"
    };
    return known[value] || text(value).replace(/_/g, " ");
  }

  function renderReviewRubric() {
    const target = byId("rubric");
    if (!target) return null;
    if (!state.review_contract) {
      target.innerHTML = '<strong>Scoringskriterier</strong><p class="rubric-meta">Canonical human-review-ledger er ikke lastet ennå.</p>';
      return null;
    }
    const model = rubricModel(state.review_contract);
    const names = { lists: "Lister", paths: "Stier", mindmap: "Tankekart" };
    target.innerHTML = `<strong>Scoringskriterier</strong><p class="rubric-meta">Skala ${escapeHtml(model.scale)} · akseptabel score er ${model.acceptable_score_minimum} eller 5. Hver produktscore skal vurderes mot alle fire kriteriene under.</p><div class="rubric-grid">${PRODUCTS.map((product) => `<section class="rubric-card" data-rubric-product="${product}"><h4>${names[product]}</h4><ul>${model.criteria[product].map((criterion) => `<li data-rubric-criterion="${escapeHtml(criterion)}">${escapeHtml(rubricCriterionLabel(criterion))}</li>`).join("")}</ul></section>`).join("")}</div>`;
    return clone(model);
  }

  function validateArchivedLiveEvaluation(archive, corpus) {
    if (!archive || typeof archive !== "object") throw new Error("Arkivert live-evaluering mangler.");
    if (archive.schema !== "aha_projection_product_browser_evaluation_v2" || Number(archive.version) !== 2) {
      throw new Error("Ugyldig live-evaluation-schema.");
    }
    if (archive.generated_at !== ARCHIVED_LIVE_BASELINE.generated_at) throw new Error("Live-evalueringen er ikke den godkjente arkiverte baseline-runnen.");
    if (Number(archive.corpus_cases) !== ARCHIVED_LIVE_BASELINE.corpus_cases || !Array.isArray(archive.results) || archive.results.length !== ARCHIVED_LIVE_BASELINE.corpus_cases) {
      throw new Error("Arkivert live-evaluering må inneholde nøyaktig 27 cases.");
    }
    if (Number(archive?.live_transport?.successful_chat_count) !== ARCHIVED_LIVE_BASELINE.successful_chat_count) {
      throw new Error("Arkivert live-evaluering mangler 29/29 vellykkede Chat-svar.");
    }
    if ((archive?.live_transport?.backend_http_failures || []).length || (archive?.live_transport?.critical_failures || []).length) {
      throw new Error("Arkivert live-evaluering inneholder transportfeil.");
    }
    if (!corpus || !Array.isArray(corpus.cases) || corpus.cases.length !== ARCHIVED_LIVE_BASELINE.corpus_cases) {
      throw new Error("27-case corpus er utilgjengelig eller ugyldig.");
    }
    const expectedIds = corpus.cases.map((entry) => text(entry.id)).sort();
    const resultIds = archive.results.map((entry) => text(entry.case_id)).sort();
    if (new Set(resultIds).size !== resultIds.length || !same(expectedIds, resultIds)) {
      throw new Error("Case-IDene i arkivet samsvarer ikke med canonical 27-case corpus.");
    }
    for (const result of archive.results) {
      if (!result?.model?.surfaces || !result?.model?.product_states || !Array.isArray(result?.critical_provenance_errors)) {
        throw new Error(`${text(result?.case_id) || "ukjent_case"}: live-resultatet mangler produkt- eller proveniensdata.`);
      }
    }
    return {
      valid: true,
      cases: archive.results.length,
      generated_at: archive.generated_at,
      successful_chat_count: Number(archive.live_transport.successful_chat_count),
      critical_transport_failures: 0
    };
  }

  async function loadArchivedLiveEvaluation(archive) {
    if (state.running) throw new Error("Kan ikke importere mens en browser-evaluering kjører.");
    state.corpus ||= await global.fetch(CORPUS_URL).then((response) => response.json());
    state.review_contract ||= await global.fetch(HUMAN_REVIEW_URL).then((response) => response.json());
    rubricModel(state.review_contract);
    const validation = validateArchivedLiveEvaluation(archive, state.corpus);
    state.results = archive.results.map(reprojectArchivedResult);
    state.review_source = {
      mode: "archived_live",
      projection_mode: "current_read_only_projection_from_archived_live_insights",
      workflow_run_id: ARCHIVED_LIVE_BASELINE.workflow_run_id,
      artifact_id: ARCHIVED_LIVE_BASELINE.artifact_id,
      head_sha: ARCHIVED_LIVE_BASELINE.head_sha,
      generated_at: validation.generated_at,
      successful_chat_count: validation.successful_chat_count
    };
    if (byId("progress")) byId("progress").value = state.results.length;
    if (byId("status")) byId("status").textContent = `Arkivert live-evidens lastet og re-projisert med dagens read-only produktkode: ${state.results.length}/${state.corpus.cases.length} cases · ingen nye modellkall.`;
    updateSummary();
    return clone({ validation, review_source: state.review_source });
  }

  async function importArchivedLiveEvaluationFile(file) {
    if (!file?.text) throw new Error("Velg JSON-filen aha-projection-product-live-browser-evaluation-v2.json.");
    let archive;
    try { archive = JSON.parse(await file.text()); }
    catch { throw new Error("Kunne ikke lese live-evalueringen som JSON."); }
    return loadArchivedLiveEvaluation(archive);
  }

  function validateHumanReviewDraft(draft, options = {}) {
    if (!draft || typeof draft !== "object") throw new Error("Review-utkast mangler.");
    if (draft.schema !== "aha_projection_product_human_review_v2" || Number(draft.version) !== 2) {
      throw new Error("Ugyldig review-utkast-schema.");
    }
    const reviewResults = Array.isArray(options.results) ? options.results : state.results;
    const reviewCorpus = options.corpus || state.corpus;
    const reviewSource = options.review_source || state.review_source;
    if (!reviewResults.length || !reviewCorpus?.cases?.length) {
      throw new Error("Åpne live-evalueringen før review-utkastet.");
    }
    if (!Array.isArray(draft.case_reviews) || draft.case_reviews.length !== reviewResults.length) {
      throw new Error("Review-utkastet må inneholde de samme 27 casene som den åpne evalueringen.");
    }
    const expectedIds = reviewResults.map((entry) => text(entry.case_id)).sort();
    const actualIds = draft.case_reviews.map((entry) => text(entry.case_id)).sort();
    if (new Set(actualIds).size !== actualIds.length || !same(expectedIds, actualIds)) {
      throw new Error("Case-IDene i review-utkastet samsvarer ikke med den åpne evalueringen.");
    }
    if (reviewSource?.mode === "archived_live") {
      const source = draft?.browser_evaluation?.source;
      if (!source || Number(source.workflow_run_id) !== ARCHIVED_LIVE_BASELINE.workflow_run_id || Number(source.artifact_id) !== ARCHIVED_LIVE_BASELINE.artifact_id) {
        throw new Error("Review-utkastet er ikke knyttet til den samme arkiverte live-baselinen.");
      }
      if (text(source.projection_mode) !== text(reviewSource.projection_mode)) {
        throw new Error("Review-utkastet er ikke knyttet til samme current-code reprojeksjonsmodus.");
      }
    }
    const normalizedCases = draft.case_reviews.map((entry) => {
      const normalized = { case_id: text(entry.case_id) };
      for (const product of PRODUCTS) {
        const value = entry?.[product];
        if (value == null || value === "") normalized[product] = null;
        else {
          const score = Number(value);
          if (!Number.isInteger(score) || score < 1 || score > 5) throw new Error(`${normalized.case_id}: ugyldig ${product}-score i review-utkastet.`);
          normalized[product] = score;
        }
      }
      normalized.critical_provenance_error = entry?.critical_provenance_error === true;
      normalized.notes = text(entry?.notes);
      return normalized;
    });
    return {
      reviewer: {
        name: text(draft?.reviewer?.name),
        reviewed_at: text(draft?.reviewer?.reviewed_at)
      },
      case_reviews: normalizedCases
    };
  }

  function updateReviewProgress() {
    if (!state.results.length) {
      if (byId("review-progress")) byId("review-progress").textContent = "Review-fremdrift: 0/81 produktscorer · 0/27 cases komplette.";
      return { scored: 0, total: 81, complete_cases: 0, total_cases: 27 };
    }
    let scored = 0;
    let completeCases = 0;
    for (const result of state.results) {
      let caseScored = 0;
      for (const product of PRODUCTS) {
        const value = Number(global.document.querySelector(`[data-review-score="${result.case_id}:${product}"]`)?.value);
        if (Number.isInteger(value) && value >= 1 && value <= 5) {
          scored += 1;
          caseScored += 1;
        }
      }
      if (caseScored === PRODUCTS.length) completeCases += 1;
    }
    const total = state.results.length * PRODUCTS.length;
    if (byId("review-progress")) byId("review-progress").textContent = `Review-fremdrift: ${scored}/${total} produktscorer · ${completeCases}/${state.results.length} cases komplette.`;
    return { scored, total, complete_cases: completeCases, total_cases: state.results.length };
  }

  function applyHumanReviewDraft(draft) {
    const normalized = validateHumanReviewDraft(draft);
    if (byId("reviewer")) byId("reviewer").value = normalized.reviewer.name;
    if (byId("review-date")) byId("review-date").value = normalized.reviewer.reviewed_at;
    if (byId("attestation")) byId("attestation").checked = false;
    for (const entry of normalized.case_reviews) {
      for (const product of PRODUCTS) {
        const select = global.document.querySelector(`[data-review-score="${entry.case_id}:${product}"]`);
        if (select) select.value = entry[product] == null ? "" : String(entry[product]);
      }
      const critical = global.document.querySelector(`[data-critical="${entry.case_id}"]`);
      if (critical) critical.checked = entry.critical_provenance_error;
      const note = global.document.querySelector(`[data-review-note="${entry.case_id}"]`);
      if (note) note.value = entry.notes;
    }
    const progress = updateReviewProgress();
    if (byId("status")) byId("status").textContent = `Review-utkast lastet: ${progress.scored}/${progress.total} scorer. Menneskelig attestasjon må bekreftes på nytt før sluttresultat.`;
    return clone({ ...normalized, human_attestation_restored: false, progress });
  }

  async function importHumanReviewDraftFile(file) {
    if (!file?.text) throw new Error("Velg et eksportert human-review JSON-utkast.");
    let draft;
    try { draft = JSON.parse(await file.text()); }
    catch { throw new Error("Kunne ikke lese review-utkastet som JSON."); }
    return applyHumanReviewDraft(draft);
  }

  function renderResult(result) {
    const status = result.critical_provenance_errors.length ? "critical" : (result.model?.status === "ready" ? "ready" : "");
    const source = state.corpus?.cases?.find((entry) => entry.id === result.case_id) || {};
    const claims = Array.isArray(source.claims) ? source.claims : [];
    return `<article class="case" data-case-id="${escapeHtml(result.case_id)}"><div class="case-head"><div><span class="badge">${escapeHtml(result.genre || source.genre)}</span><h3>${escapeHtml(result.focus || source.focus)}</h3><p>${escapeHtml(result.case_id)} · ${escapeHtml(result.identity?.source_sha256 || "")}</p></div><span class="badge ${status}">${result.critical_provenance_errors.length ? `${result.critical_provenance_errors.length} kritiske feil` : escapeHtml(result.model?.status || "ukjent")}</span></div><details class="source-evidence" open><summary>Kildetekst og forventede kildepåstander</summary><p>${escapeHtml(source.source_text || "Kildetekst mangler.")}</p>${claims.length ? `<ul>${claims.map((claim) => `<li>${escapeHtml(claim)}</li>`).join("")}</ul>` : ""}<p>Forventet produktoutput: ${source.expected_visible === false ? "skal undertrykkes ved utilstrekkelig belegg" : "kan være synlig dersom kvalitetsportene består"}.</p></details><div class="products">${PRODUCTS.map((product) => `<section class="product"><h4>${product === "lists" ? "Lister" : product === "paths" ? "Stier" : "Tankekart"}</h4><pre>${escapeHtml(JSON.stringify(productOutput(result.model, product), null, 2))}</pre></section>`).join("")}</div><div class="review">${PRODUCTS.map((product) => `<label>${product === "lists" ? "Lister" : product === "paths" ? "Stier" : "Tankekart"} (1–5)<select data-review-score="${escapeHtml(result.case_id)}:${product}"><option value="">Ikke vurdert</option>${[1,2,3,4,5].map((score) => `<option value="${score}">${score}</option>`).join("")}</select></label>`).join("")}</div><label class="critical-row"><input type="checkbox" data-critical="${escapeHtml(result.case_id)}" /> Kritisk proveniensfeil funnet av reviewer</label><label>Notat<textarea rows="3" data-review-note="${escapeHtml(result.case_id)}"></textarea></label></article>`;
  }

  function updateSummary() {
    byId("results").innerHTML = state.results.map(renderResult).join("");
    byId("export").disabled = state.results.length !== state.corpus?.cases?.length;
    renderReviewRubric();
    updateReviewProgress();
  }

  async function runAll(options = {}) {
    if (state.running) return null;
    state.running = true; state.results = []; state.review_source = { mode: "runtime_generated" };
    const runButton = byId("run"); if (runButton) runButton.disabled = true;
    const originalStorage = fullStorageSnapshot(global.localStorage);
    try {
      state.corpus ||= await global.fetch(CORPUS_URL).then((response) => response.json());
      state.review_contract ||= await global.fetch(HUMAN_REVIEW_URL).then((response) => response.json());
      rubricModel(state.review_contract);
      global.localStorage.clear();
      let win = await loadFrame({ reload: Boolean(state.frame) });
      win.localStorage.clear();
      win.AHAMemoryControls?.enableSaving?.();
      win.AHAMemoryControls?.disableMemoryUse?.();
      for (let index = 0; index < state.corpus.cases.length; index += 1) {
        const entry = state.corpus.cases[index];
        if (entry.sequential_after === "morgenbladet_seed") await win.AHAChat.submitAhaChatMessage(SEED_TEXT);
        const result = await submit(win, entry);
        if (entry.hard_reload) {
          win = await loadFrame({ reload: true });
          const replay = await capture(win, entry);
          result.hard_reload = compareReplay(result, replay);
          if (!result.hard_reload.comparable || !result.hard_reload.deterministic) result.critical_provenance_errors.push("hard_reload_projection_changed");
        }
        state.results.push(result);
        if (byId("progress")) byId("progress").value = index + 1;
        if (byId("status")) byId("status").textContent = `${index + 1}/${state.corpus.cases.length}: ${entry.id}`;
        if (options.renderEach !== false) updateSummary();
      }
      const repeatEntry = state.corpus.cases.find((entry) => entry.id === "research_language");
      const first = state.results.find((entry) => entry.case_id === repeatEntry.id);
      const repeated = await submit(win, repeatEntry);
      const comparison = compareReplay(first, repeated);
      first.same_source_replay = comparison;
      if (!comparison.comparable || !comparison.deterministic) first.critical_provenance_errors.push("same_source_projection_not_deterministic");
      first.changed_runtime_version_guard = compareReplay(first, { ...repeated, runtime_fingerprint: { ...repeated.runtime_fingerprint, projection_runtime: repeated.runtime_fingerprint.projection_runtime + 1 } });
      updateSummary();
      return clone({ schema: "aha_projection_product_browser_evaluation_v2", version: 2, generated_at: new Date().toISOString(), corpus_cases: state.corpus.cases.length, results: state.results, policy: { product_store_write: false, chamber_write: false, canonical_write: false, remote_write: false, sync_write: false } });
    } finally {
      restoreStorage(global.localStorage, originalStorage);
      state.running = false; if (runButton) runButton.disabled = false;
    }
  }

  function configureCostControl(value) {
    if (state.running) throw new Error("Kan ikke endre kostnadsgrensen mens evalueringen kjører.");
    if (value == null) state.cost_control = null;
    else {
      const control = clone(value);
      if (control?.schema !== "aha_insight_synthesis_cost_control_v1") throw new Error("Ugyldig cost-control-schema.");
      if (!["live_smoke", "live_release"].includes(control?.mode)) throw new Error("Ugyldig cost-control-modus.");
      if (!Number.isInteger(Number(control?.synthesis_validation_attempt_limit)) || Number(control.synthesis_validation_attempt_limit) < 1) {
        throw new Error("Ugyldig synteseforsøksgrense.");
      }
      state.cost_control = control;
    }
    if (state.frame?.contentWindow) state.frame.contentWindow.AHA_SYNTHESIS_COST_CONTROL = clone(state.cost_control);
    return clone(state.cost_control);
  }

  async function runCases(caseIds = []) {
    if (state.running) return [];
    state.running = true;
    const originalStorage = fullStorageSnapshot(global.localStorage);
    try {
      state.corpus ||= await global.fetch(CORPUS_URL).then((response) => response.json());
      const selectedIds = new Set((Array.isArray(caseIds) ? caseIds : []).map(text).filter(Boolean));
      const entries = state.corpus.cases.filter((entry) => selectedIds.has(entry.id));
      global.localStorage.clear();
      let win = await loadFrame({ reload: Boolean(state.frame) });
      win.localStorage.clear();
      win.AHAMemoryControls?.enableSaving?.();
      win.AHAMemoryControls?.disableMemoryUse?.();
      const results = [];
      for (const entry of entries) {
        if (entry.sequential_after === "morgenbladet_seed") await win.AHAChat.submitAhaChatMessage(SEED_TEXT);
        results.push(await submit(win, entry));
      }
      return clone(results);
    } finally {
      restoreStorage(global.localStorage, originalStorage);
      state.running = false;
    }
  }

  async function prepareControlledJourney(caseId) {
    if (state.running) return null;
    state.running = true;
    try {
      state.corpus ||= await global.fetch(CORPUS_URL).then((response) => response.json());
      const entry = state.corpus.cases.find((candidate) => candidate.id === text(caseId));
      if (!entry) throw new Error(`Ukjent journey-case: ${text(caseId)}`);
      global.localStorage.clear();
      const win = await loadFrame({ reload: Boolean(state.frame) });
      win.localStorage.clear();
      win.AHAMemoryControls?.enableSaving?.();
      win.AHAMemoryControls?.disableMemoryUse?.();
      if (entry.sequential_after === "morgenbladet_seed") await win.AHAChat.submitAhaChatMessage(SEED_TEXT);
      const result = await submit(win, entry);
      const states = ["list", "path", "mindmap"].map((product) => result.model?.product_states?.[product]?.status);
      if (!states.every((status) => status === "ready")) throw new Error(`${entry.id}: alle tre produkter må være klare for den kontrollerte reisen`);
      return clone(result);
    } finally {
      state.running = false;
    }
  }

  function collectHumanReview() {
    const reviewer = text(byId("reviewer")?.value);
    const reviewedAt = text(byId("review-date")?.value);
    const attested = byId("attestation")?.checked === true;
    const caseReviews = state.results.map((result) => {
      const scores = Object.fromEntries(PRODUCTS.map((product) => {
        const value = Number(global.document.querySelector(`[data-review-score="${result.case_id}:${product}"]`)?.value);
        return [product, Number.isInteger(value) && value >= 1 && value <= 5 ? value : null];
      }));
      return { case_id: result.case_id, ...scores, critical_provenance_error: global.document.querySelector(`[data-critical="${result.case_id}"]`)?.checked === true, notes: text(global.document.querySelector(`[data-review-note="${result.case_id}"]`)?.value), review_status: PRODUCTS.every((product) => scores[product] != null) ? "complete" : "open" };
    });
    const shares = Object.fromEntries(PRODUCTS.map((product) => {
      const scores = caseReviews.map((entry) => entry[product]).filter(Number.isFinite);
      return [product, scores.length ? Number((scores.filter((score) => score >= 4).length / scores.length).toFixed(6)) : 0];
    }));
    const complete = Boolean(reviewer && reviewedAt && attested && caseReviews.every((entry) => entry.review_status === "complete"));
    const critical = caseReviews.filter((entry) => entry.critical_provenance_error).length + state.results.reduce((sum, entry) => sum + entry.critical_provenance_errors.length, 0);
    const passed = complete && critical === 0 && PRODUCTS.every((product) => shares[product] >= 0.8);
    return { schema: "aha_projection_product_human_review_v2", version: 2, reviewer: { name: reviewer, reviewed_at: reviewedAt, human_attestation: attested }, status: passed ? "independent_human_review_passed" : complete ? "independent_human_review_failed" : "independent_human_review_open", release_rule: { minimum_acceptable_share: 0.8, independent_human_review_required: true, critical_provenance_errors_allowed: 0, automatic_persistence_allowed: false }, acceptable_share: shares, critical_provenance_error_count: critical, browser_evaluation: { cases: state.results.length, runtime_generated: state.review_source?.mode !== "archived_live", source: clone(state.review_source) }, case_reviews: caseReviews };
  }

  function downloadReview() {
    const review = collectHumanReview();
    const blob = new Blob([`${JSON.stringify(review, null, 2)}\n`], { type: "application/json" });
    const anchor = global.document.createElement("a"); anchor.href = URL.createObjectURL(blob); anchor.download = "aha-projection-product-human-review-v2.json"; anchor.click(); URL.revokeObjectURL(anchor.href);
    byId("gate").textContent = review.status === "independent_human_review_passed" ? "Human-porten består i denne eksporten." : "Human-porten er fortsatt åpen eller under kravet i denne eksporten.";
  }

  byId("run")?.addEventListener("click", () => { void runAll().catch((error) => { byId("status").textContent = error.message; }); });
  byId("live-import")?.addEventListener("change", (event) => {
    const file = event.target?.files?.[0];
    if (!file) return;
    void importArchivedLiveEvaluationFile(file).catch((error) => { byId("status").textContent = error.message; });
  });
  byId("review-import")?.addEventListener("change", (event) => {
    const file = event.target?.files?.[0];
    if (!file) return;
    void importHumanReviewDraftFile(file).catch((error) => { byId("status").textContent = error.message; });
  });
  byId("results")?.addEventListener("change", updateReviewProgress);
  byId("results")?.addEventListener("input", updateReviewProgress);
  byId("export")?.addEventListener("click", downloadReview);

  global.AHAProjectionProductReviewV2 = Object.freeze({
    ARCHIVED_LIVE_BASELINE,
    runAll,
    runCases,
    prepareControlledJourney,
    configureCostControl,
    loadArchivedLiveEvaluation,
    importArchivedLiveEvaluationFile,
    validateArchivedLiveEvaluation,
    reprojectArchivedResult,
    validateHumanReviewDraft,
    applyHumanReviewDraft,
    importHumanReviewDraftFile,
    updateReviewProgress,
    rubricModel,
    renderReviewRubric,
    collectHumanReview,
    compareReplay,
    getState: () => clone(state)
  });
})(window);
