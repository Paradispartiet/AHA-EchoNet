(function (global) {
  "use strict";

  const CORPUS_URL = "tests/fixtures/aha-projection-product-evaluation-v2.json";
  const PRODUCT_KEYS = Object.freeze(["aha_lists_v1", "aha_paths_v1", "aha_concept_lists_v1"]);
  const GUARDED_KEYS = Object.freeze([...PRODUCT_KEYS, "aha_insight_chamber_v1"]);
  const PRODUCTS = Object.freeze(["lists", "paths", "mindmap"]);
  const SEED_TEXT = "Morgenbladet er en norsk avis. Teksten drøfter pressehistorie, redaksjonell uavhengighet, eierskapsskifter og akademisk offentlighet.";
  const state = { corpus: null, results: [], running: false, frame: null };

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
      product_contract: Number(win.AHAProjectionProductContractV2?.VERSION || win.AHAProjectionProductContractV2?.MODULE_VERSION || 0)
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

  function renderResult(result) {
    const status = result.critical_provenance_errors.length ? "critical" : (result.model?.status === "ready" ? "ready" : "");
    return `<article class="case" data-case-id="${escapeHtml(result.case_id)}"><div class="case-head"><div><span class="badge">${escapeHtml(result.genre)}</span><h3>${escapeHtml(result.focus)}</h3><p>${escapeHtml(result.case_id)} · ${escapeHtml(result.identity?.source_sha256 || "")}</p></div><span class="badge ${status}">${result.critical_provenance_errors.length ? `${result.critical_provenance_errors.length} kritiske feil` : escapeHtml(result.model?.status || "ukjent")}</span></div><div class="products">${PRODUCTS.map((product) => `<section class="product"><h4>${product === "lists" ? "Lister" : product === "paths" ? "Stier" : "Tankekart"}</h4><pre>${escapeHtml(JSON.stringify(productOutput(result.model, product), null, 2))}</pre></section>`).join("")}</div><div class="review">${PRODUCTS.map((product) => `<label>${product === "lists" ? "Lister" : product === "paths" ? "Stier" : "Tankekart"} (1–5)<select data-review-score="${escapeHtml(result.case_id)}:${product}"><option value="">Ikke vurdert</option>${[1,2,3,4,5].map((score) => `<option value="${score}">${score}</option>`).join("")}</select></label>`).join("")}</div><label class="critical-row"><input type="checkbox" data-critical="${escapeHtml(result.case_id)}" /> Kritisk proveniensfeil funnet av reviewer</label><label>Notat<textarea rows="3" data-review-note="${escapeHtml(result.case_id)}"></textarea></label></article>`;
  }

  function updateSummary() {
    byId("results").innerHTML = state.results.map(renderResult).join("");
    byId("export").disabled = state.results.length !== state.corpus?.cases?.length;
  }

  async function runAll(options = {}) {
    if (state.running) return null;
    state.running = true; state.results = [];
    const runButton = byId("run"); if (runButton) runButton.disabled = true;
    const originalStorage = fullStorageSnapshot(global.localStorage);
    try {
      state.corpus ||= await global.fetch(CORPUS_URL).then((response) => response.json());
      global.localStorage.clear();
      let win = await loadFrame();
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
    return { schema: "aha_projection_product_human_review_v2", version: 2, reviewer: { name: reviewer, reviewed_at: reviewedAt, human_attestation: attested }, status: passed ? "independent_human_review_passed" : complete ? "independent_human_review_failed" : "independent_human_review_open", release_rule: { minimum_acceptable_share: 0.8, independent_human_review_required: true, critical_provenance_errors_allowed: 0, automatic_persistence_allowed: false }, acceptable_share: shares, critical_provenance_error_count: critical, browser_evaluation: { cases: state.results.length, runtime_generated: true }, case_reviews: caseReviews };
  }

  function downloadReview() {
    const review = collectHumanReview();
    const blob = new Blob([`${JSON.stringify(review, null, 2)}\n`], { type: "application/json" });
    const anchor = global.document.createElement("a"); anchor.href = URL.createObjectURL(blob); anchor.download = "aha-projection-product-human-review-v2.json"; anchor.click(); URL.revokeObjectURL(anchor.href);
    byId("gate").textContent = review.status === "independent_human_review_passed" ? "Human-porten består i denne eksporten." : "Human-porten er fortsatt åpen eller under kravet i denne eksporten.";
  }

  byId("run")?.addEventListener("click", () => { void runAll().catch((error) => { byId("status").textContent = error.message; }); });
  byId("export")?.addEventListener("click", downloadReview);

  global.AHAProjectionProductReviewV2 = Object.freeze({ runAll, collectHumanReview, compareReplay, getState: () => clone(state) });
})(window);
