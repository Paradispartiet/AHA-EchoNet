// Authoritative immutable analysis contract for one active Chat analysis run.
// The bundle contains typed derived values only. Raw source text and historical
// afterwork/Chamber state are deliberately outside this boundary.
(function (global) {
  "use strict";

  const SCHEMA = "aha_analysis_bundle_v2";
  const FIELD_SCHEMA = "aha_analysis_field_v2";
  const VERSION = 2;
  const SURFACES = Object.freeze([
    "overview", "insights", "concepts", "conversation_tracks", "subjects",
    "sources", "source_structure", "afterwork"
  ]);
  const CLOSED_WRITE_POLICY = Object.freeze([
    "product_store_write", "automatic_product_write", "remote_write", "sync_write",
    "chamber_write", "meta_write", "canonical_write", "afterwork_history_merge"
  ]);
  const VALUE_TYPES = Object.freeze(["text", "text_list", "record"]);
  const TOPIC_STATES = Object.freeze(["verified", "unknown", "rejected", "not_applicable"]);

  function object(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function array(value) { return Array.isArray(value) ? value : []; }

  function text(value) {
    if (value == null) return "";
    if (["string", "number", "boolean"].includes(typeof value)) return String(value).replace(/\s+/g, " ").trim();
    const src = object(value);
    for (const key of ["text", "claim", "label", "title", "name", "summary", "insight", "term", "value"]) {
      if (["string", "number", "boolean"].includes(typeof src[key])) return text(src[key]);
    }
    return "";
  }

  function uniqueText(values) {
    const seen = new Set();
    return array(values).map(text).filter((value) => {
      const key = value.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function clone(value) {
    if (value == null) return value;
    return JSON.parse(JSON.stringify(value));
  }

  function deepFreeze(value, seen = new Set()) {
    if (!value || typeof value !== "object" || seen.has(value)) return value;
    seen.add(value);
    Object.keys(value).forEach((key) => deepFreeze(value[key], seen));
    return Object.freeze(value);
  }

  function isSha256(value) { return /^[a-f0-9]{64}$/.test(text(value).toLowerCase()); }

  function stableToken(value) {
    let hash = 2166136261;
    const input = String(value || "");
    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function readSourceSha(value) {
    const src = object(value);
    return text(src.source_sha256 || src.sourceSha256 || src.sourceTextHash || src.sourceHash || src.normalizedSourceHash);
  }

  function readRunId(value) {
    const src = object(value);
    return text(src.analysis_run_id || src.analysisRunId || src.runId);
  }

  function readAnalysisId(value) {
    const src = object(value);
    return text(src.analysis_id || src.analysisId);
  }

  function readSourceId(value) {
    const src = object(value);
    return text(src.source_id || src.sourceId);
  }

  function identityFrom(input) {
    const src = object(input);
    const run = object(src.activeRun || src.run);
    const payload = object(src.payload);
    return {
      analysis_id: readAnalysisId(run) || readAnalysisId(payload),
      analysis_run_id: readRunId(run) || readRunId(payload),
      source_id: readSourceId(run) || readSourceId(payload),
      source_sha256: readSourceSha(run) || readSourceSha(payload),
      topic_label: text(run.topicLabel || payload.topicLabel),
      created_at: text(run.createdAt || payload.createdAt || src.createdAt) || new Date().toISOString()
    };
  }

  function exactEvidence(candidate, sourceText) {
    const excerpt = text(candidate);
    const source = String(sourceText || "");
    if (!excerpt || !source) return null;
    let start = source.indexOf(excerpt);
    if (start < 0) start = source.toLowerCase().indexOf(excerpt.toLowerCase());
    if (start < 0) return null;
    return {
      excerpt,
      start,
      end: start + excerpt.length,
      exact_source_match: true
    };
  }

  function evidenceCandidates(raw, additional = []) {
    const src = object(raw);
    const candidates = [];
    const push = (value) => {
      if (Array.isArray(value)) value.forEach(push);
      else {
        const candidate = text(value);
        if (candidate) candidates.push(candidate);
      }
    };
    push(src.evidence);
    push(src.evidenceText);
    push(src.evidence_text);
    push(src.quote);
    push(src.excerpt);
    push(src.source_excerpt);
    push(additional);
    if (typeof raw === "string") push(raw);
    return uniqueText(candidates);
  }

  function provenance(identity, raw, sourceText, origin, additionalEvidence = []) {
    const evidence = evidenceCandidates(raw, additionalEvidence)
      .map((candidate) => exactEvidence(candidate, sourceText))
      .filter(Boolean);
    return {
      source_sha256: identity.source_sha256,
      analysis_run_id: identity.analysis_run_id,
      source_id: identity.source_id,
      origin: text(origin) || "current_analysis_run",
      evidence,
      status: evidence.length ? "verified" : "identity_only"
    };
  }

  function topicState(report, provenanceValue, applicable = true) {
    if (!applicable) return { status: "not_applicable", valid: true, reason: "topic_check_not_applicable" };
    if (report?.valid === false) return { status: "rejected", valid: false, reason: text(report.status || report.reason) || "topic_mismatch" };
    if (report?.valid === true) return { status: "verified", valid: true, reason: "field_topic_check_passed" };
    if (provenanceValue?.status === "verified") return { status: "verified", valid: true, reason: "exact_evidence_occurs_in_source" };
    return { status: "unknown", valid: null, reason: "field_topic_check_unavailable" };
  }

  function normalizeValue(value, valueType) {
    if (valueType === "text") return text(value);
    if (valueType === "text_list") return uniqueText(array(value));
    if (valueType === "record") return clone(object(value));
    return null;
  }

  function hasValue(value, valueType) {
    if (valueType === "text") return Boolean(value);
    if (valueType === "text_list") return value.length > 0;
    return Boolean(value && Object.keys(value).length);
  }

  function makeField(identity, input) {
    const valueType = VALUE_TYPES.includes(input.valueType) ? input.valueType : "text";
    const value = normalizeValue(input.value, valueType);
    if (!hasValue(value, valueType)) return null;
    const prov = provenance(identity, input.raw ?? input.value, input.sourceText, input.origin, input.additionalEvidence);
    const topic = topicState(input.topicReport, prov, input.topicApplicable !== false);
    const qualityStatus = prov.status === "verified" && ["verified", "not_applicable"].includes(topic.status)
      ? "passed"
      : topic.status === "rejected" ? "rejected" : "incomplete";
    return {
      schema: FIELD_SCHEMA,
      field_id: text(input.fieldId),
      item_id: text(input.itemId) || `${text(input.fieldId)}_${stableToken(JSON.stringify(value))}`,
      value_type: valueType,
      value,
      source_sha256: identity.source_sha256,
      analysis_run_id: identity.analysis_run_id,
      source_id: identity.source_id,
      semantic_ids: uniqueText(input.semanticIds),
      provenance: prov,
      topic,
      quality: {
        status: qualityStatus,
        reason: qualityStatus === "passed" ? "evidence_and_topic_verified" : qualityStatus === "rejected" ? "topic_rejected" : "evidence_or_topic_incomplete"
      }
    };
  }

  function reportFor(input, field) {
    const reports = object(input.fieldReports || input.payload?.quality?.topicConsistency?.fields || input.payload?.analysisQuality?.topicConsistency?.fields);
    return object(reports[field]);
  }

  function claimEvidence(payload, value) {
    const target = text(value).toLowerCase();
    const claims = array(payload?.analysisQuality?.claims);
    const match = claims.find((claim) => {
      const candidate = text(claim?.text).toLowerCase();
      return candidate && target && (candidate === target || candidate.includes(target) || target.includes(candidate));
    });
    return match ? [match.evidenceText, match.evidence_text] : [];
  }

  function fieldFactory(identity, input, sourceText) {
    return (fieldId, value, options = {}) => makeField(identity, {
      fieldId,
      value,
      raw: options.raw ?? value,
      valueType: options.valueType || "text",
      itemId: options.itemId,
      semanticIds: options.semanticIds,
      origin: options.origin || "current_analysis_run",
      additionalEvidence: options.additionalEvidence,
      topicApplicable: options.topicApplicable,
      topicReport: options.topicReport || reportFor(input, options.reportField || fieldId),
      sourceText
    });
  }

  function buildSources(identity, input, sourceText, make) {
    const urls = Array.from(new Set((String(sourceText || "").match(/https?:\/\/[^\s)\]}>,]+/gi) || []).map((value) => value.replace(/[.,;:!?]+$/u, ""))));
    const pastedText = String(sourceText || "").replace(/https?:\/\/[^\s)\]}>,]+/gi, " ").replace(/\s+/g, " ").trim();
    const primaryKind = text(input.primarySourceKind) || (pastedText.length >= 40 ? "pasted_text" : "transient_source");
    const primary = make("sources.primary", {
      role: "primary",
      kind: primaryKind,
      acquisition_status: text(input.acquisitionStatus) || (primaryKind === "pasted_text" ? "full_text_used" : "derived_source_used"),
      source_sha256: identity.source_sha256
    }, { valueType: "record", topicApplicable: false, additionalEvidence: pastedText ? [pastedText.slice(0, 240)] : [] });
    const explicitReferences = array(input.sourceReferences || input.payload?.sourceReferences || input.payload?.references);
    const seenReferenceUrls = new Set();
    const references = [...explicitReferences, ...urls.map((url) => ({ url, status: "reference" }))]
      .map((reference, index) => {
        const src = object(reference);
        const url = text(src.url || (typeof reference === "string" ? reference : ""));
        if (!url || seenReferenceUrls.has(url)) return null;
        seenReferenceUrls.add(url);
        return make("sources.reference", {
          role: "reference",
          kind: "url",
          url,
          acquisition_status: text(src.access_status || src.status) || "reference"
        }, { valueType: "record", topicApplicable: false, itemId: `source_reference_${index + 1}_${stableToken(url)}` });
      })
      .filter(Boolean);
    return [primary, ...references].filter(Boolean);
  }

  function validateField(field, identity, path, errors) {
    if (!field || typeof field !== "object" || Array.isArray(field)) {
      errors.push(`${path}:field_invalid`);
      return;
    }
    if (field.schema !== FIELD_SCHEMA) errors.push(`${path}:schema_invalid`);
    if (!text(field.field_id)) errors.push(`${path}:field_id_missing`);
    if (!text(field.item_id)) errors.push(`${path}:item_id_missing`);
    if (!VALUE_TYPES.includes(field.value_type)) errors.push(`${path}:value_type_invalid`);
    if (field.source_sha256 !== identity.source_sha256 || field.provenance?.source_sha256 !== identity.source_sha256) errors.push(`${path}:source_mismatch`);
    if (field.analysis_run_id !== identity.analysis_run_id || field.provenance?.analysis_run_id !== identity.analysis_run_id) errors.push(`${path}:run_mismatch`);
    if (field.source_id !== identity.source_id || field.provenance?.source_id !== identity.source_id) errors.push(`${path}:source_id_mismatch`);
    if (!TOPIC_STATES.includes(field.topic?.status)) errors.push(`${path}:topic_status_invalid`);
    if (!Array.isArray(field.provenance?.evidence)) errors.push(`${path}:evidence_invalid`);
    array(field.provenance?.evidence).forEach((item, index) => {
      if (!text(item?.excerpt) || item?.exact_source_match !== true || !Number.isInteger(item?.start) || !Number.isInteger(item?.end)) {
        errors.push(`${path}:evidence_${index}_invalid`);
      }
    });
    if (field.quality?.status === "passed" && (field.provenance?.status !== "verified" || !["verified", "not_applicable"].includes(field.topic?.status))) {
      errors.push(`${path}:false_quality_pass`);
    }
  }

  function collectFields(bundle) {
    const out = [];
    const walk = (value, path) => {
      if (!value) return;
      if (value?.schema === FIELD_SCHEMA) {
        out.push({ field: value, path });
        return;
      }
      if (Array.isArray(value)) value.forEach((item, index) => walk(item, `${path}[${index}]`));
      else if (typeof value === "object") Object.entries(value).forEach(([key, item]) => walk(item, path ? `${path}.${key}` : key));
    };
    walk(bundle?.surfaces, "surfaces");
    return out;
  }

  function validate(bundle) {
    const value = object(bundle);
    const errors = [];
    if (value.schema !== SCHEMA) errors.push("schema_invalid");
    if (value.version !== VERSION) errors.push("version_invalid");
    const identity = object(value.identity);
    if (!text(identity.analysis_id)) errors.push("analysis_id_missing");
    if (!text(identity.analysis_run_id)) errors.push("analysis_run_id_missing");
    if (!text(identity.source_id)) errors.push("source_id_missing");
    if (!isSha256(identity.source_sha256)) errors.push("source_sha256_invalid");
    if (!value.surfaces || typeof value.surfaces !== "object") errors.push("surfaces_missing");
    SURFACES.forEach((surface) => { if (!(surface in object(value.surfaces))) errors.push(`surface_missing:${surface}`); });
    collectFields(value).forEach(({ field, path }) => validateField(field, identity, path, errors));
    CLOSED_WRITE_POLICY.forEach((key) => { if (value.policy?.[key] !== false) errors.push(`write_policy_not_closed:${key}`); });
    const forbiddenKeys = new Set(["sourceText", "raw_text", "rawAutoPayload", "fullChamberSnapshot", "historicalAfterwork"]);
    const inspectKeys = (node, path = "bundle") => {
      if (!node || typeof node !== "object") return;
      Object.entries(node).forEach(([key, child]) => {
        if (forbiddenKeys.has(key)) errors.push(`${path}:forbidden_key:${key}`);
        inspectKeys(child, `${path}.${key}`);
      });
    };
    inspectKeys(value);
    return deepFreeze({ valid: errors.length === 0, errors: Array.from(new Set(errors)).sort() });
  }

  function build(input = {}) {
    const payload = object(input.payload);
    const canonical = object(payload.canonicalAnalysis);
    const ahaSer = object(payload.ahaSer);
    const sourceText = String(input.sourceText || "");
    const identity = identityFrom(input);
    const make = fieldFactory(identity, input, sourceText);
    const insights = array(payload.insights?.length ? payload.insights : payload.insightCards)
      .map((item, index) => make("insights.item", text(item), {
        raw: item,
        itemId: text(item?.id) || `insight_${index + 1}_${stableToken(text(item))}`,
        semanticIds: [item?.semantic_id, item?.semanticId, item?.id],
        additionalEvidence: evidenceCandidates(item)
      }))
      .filter(Boolean);
    const concepts = array(payload.concepts?.length ? payload.concepts : payload.keywords)
      .map((item, index) => make("concepts.item", text(item), {
        raw: item,
        itemId: text(item?.id) || `concept_${index + 1}_${stableToken(text(item))}`,
        semanticIds: [item?.semantic_id, item?.semanticId, item?.id]
      }))
      .filter(Boolean);
    const tracks = uniqueText([
      ...array(payload.conversationTracks),
      ...array(payload.followUpQuestions),
      ...array(canonical.suggestedActions)
    ]).map((item, index) => make("conversation_tracks.item", item, { itemId: `track_${index + 1}_${stableToken(item)}` })).filter(Boolean);
    const subjects = array(payload.subjectMatches?.length ? payload.subjectMatches : payload.subjectLinks)
      .map((item, index) => {
        const src = object(item);
        const label = text(src.title || src.label || src.subject_label || src.subject_id || item);
        if (!label) return null;
        return make("subjects.item", {
          subject_id: text(src.subject_id || src.id),
          label,
          score: Number.isFinite(Number(src.score)) ? Number(src.score) : null,
          explanation: text(src.explanation || src.reason)
        }, {
          valueType: "record",
          raw: item,
          itemId: text(src.subject_id || src.id) || `subject_${index + 1}_${stableToken(label)}`,
          semanticIds: [src.semantic_id, src.semanticId],
          additionalEvidence: evidenceCandidates(item)
        });
      })
      .filter(Boolean);
    const strongestInsight = canonical.keyInsight || ahaSer.viktigsteInnsikt || payload.insight || insights[0]?.value;
    const overview = {
      theme: make("overview.theme", canonical.theme || ahaSer.tema || payload.tema, { reportField: "canonicalAnalysis.theme", additionalEvidence: claimEvidence(payload, canonical.theme || ahaSer.tema) }),
      central_tension: make("overview.central_tension", canonical.mainTension || ahaSer.hovedspenning || payload.hovedspenning, { reportField: "canonicalAnalysis.mainTension", additionalEvidence: claimEvidence(payload, canonical.mainTension || ahaSer.hovedspenning) }),
      strongest_insight: make("overview.strongest_insight", strongestInsight, { reportField: "canonicalAnalysis.keyInsight", additionalEvidence: claimEvidence(payload, strongestInsight) }),
      next_inquiry: make("overview.next_inquiry", ahaSer.nesteSteg || canonical.suggestedActions?.[0] || payload?.thoughts?.neste_steg, { reportField: "ahaSer.nesteSteg" })
    };
    const sourceStructure = {
      problem_statement: make("source_structure.problem_statement", payload.problemStatement || payload.problem_statement || canonical.theme, { reportField: "canonicalAnalysis.theme" }),
      main_claim: make("source_structure.main_claim", canonical.keyInsight || ahaSer.viktigsteInnsikt, { reportField: "canonicalAnalysis.keyInsight", additionalEvidence: claimEvidence(payload, canonical.keyInsight || ahaSer.viktigsteInnsikt) }),
      evidence_method: make("source_structure.evidence_method", array(payload.sortItems).map((item) => text(item)).filter(Boolean), { valueType: "text_list", reportField: "afterwork.sortItems" }),
      central_tension: make("source_structure.central_tension", canonical.mainTension || ahaSer.hovedspenning, { reportField: "canonicalAnalysis.mainTension" })
    };
    const afterwork = {
      summary: make("afterwork.summary", payload.summary || canonical.summary || payload.day || ahaSer.kortSvar, { reportField: "afterwork.summary" }),
      reflection: make("afterwork.reflection", canonical.reflection || payload.reflection, { reportField: "afterwork.reflection" }),
      main_thread: make("afterwork.main_thread", payload?.thoughts?.hovedspor || canonical.theme || ahaSer.tema, { reportField: "canonicalAnalysis.theme" }),
      unresolved_thought: make("afterwork.unresolved_thought", payload?.thoughts?.lose_tanker || canonical.mainTension || ahaSer.hovedspenning, { reportField: "canonicalAnalysis.mainTension" }),
      next_step: make("afterwork.next_step", payload?.thoughts?.neste_steg || ahaSer.nesteSteg || canonical.suggestedActions?.[0], { reportField: "ahaSer.nesteSteg" })
    };
    const surfaces = {
      overview,
      insights,
      concepts,
      conversation_tracks: tracks,
      subjects,
      sources: buildSources(identity, input, sourceText, make),
      source_structure: sourceStructure,
      afterwork
    };
    const fields = collectFields({ surfaces }).map(({ field }) => field);
    const incomplete = fields.filter((field) => field.quality.status === "incomplete").map((field) => field.item_id);
    const rejected = fields.filter((field) => field.quality.status === "rejected").map((field) => field.item_id);
    const identityErrors = [];
    if (!identity.analysis_id) identityErrors.push("analysis_id_missing");
    if (!identity.analysis_run_id) identityErrors.push("analysis_run_id_missing");
    if (!identity.source_id) identityErrors.push("source_id_missing");
    if (!isSha256(identity.source_sha256)) identityErrors.push("source_sha256_invalid");
    const status = identityErrors.length ? "invalid" : (incomplete.length || rejected.length) ? "incomplete" : "ready";
    const bundle = {
      schema: SCHEMA,
      version: VERSION,
      bundle_id: `analysis_bundle_${stableToken(`${identity.analysis_id}|${identity.analysis_run_id}|${identity.source_sha256}`)}`,
      status,
      identity,
      semantic_document: {
        schema: text(input.semanticDocument?.schema) || "aha_semantic_document_v1",
        document_id: text(input.semanticDocument?.id || input.semanticDocument?.document_id) || null,
        source_sha256: identity.source_sha256,
        semantic_ids: uniqueText(input.semanticIds)
      },
      surfaces,
      quality: {
        status,
        field_count: fields.length,
        passed_field_count: fields.filter((field) => field.quality.status === "passed").length,
        incomplete_field_ids: incomplete,
        rejected_field_ids: rejected,
        reasons: [...identityErrors, ...(incomplete.length ? ["item_level_evidence_or_topic_incomplete"] : []), ...(rejected.length ? ["one_or_more_fields_rejected"] : [])]
      },
      validation: { valid: false, errors: [] },
      policy: Object.fromEntries(CLOSED_WRITE_POLICY.map((key) => [key, false]))
    };
    const validation = validate(bundle);
    bundle.validation = clone(validation);
    if (!validation.valid) {
      bundle.status = "invalid";
      bundle.quality.status = "invalid";
      bundle.quality.reasons = uniqueText([...bundle.quality.reasons, ...validation.errors]);
    }
    return deepFreeze(bundle);
  }

  function hydrate(value) {
    const validation = validate(value);
    if (!validation.valid) return null;
    if (Object.isFrozen(value) && value?.validation?.valid === true) return value;
    const candidate = clone(value);
    candidate.validation = clone(validation);
    return deepFreeze(candidate);
  }

  function fieldValue(field, fallback = "") {
    return field?.schema === FIELD_SCHEMA && field?.quality?.status !== "rejected" ? clone(field.value) : fallback;
  }

  function toLegacyView(bundle) {
    const verified = hydrate(bundle);
    if (!verified) return null;
    const identity = verified.identity;
    const overview = verified.surfaces.overview;
    const afterwork = verified.surfaces.afterwork;
    const concepts = verified.surfaces.concepts.map((field) => fieldValue(field)).filter(Boolean);
    const insights = verified.surfaces.insights.map((field) => fieldValue(field)).filter(Boolean);
    const subjectMatches = verified.surfaces.subjects.map((field) => fieldValue(field, {})).filter((item) => Object.keys(item).length);
    const canonicalAnalysis = {
      theme: fieldValue(overview.theme),
      mainTension: fieldValue(overview.central_tension),
      keyInsight: fieldValue(overview.strongest_insight),
      suggestedActions: verified.surfaces.conversation_tracks.map((field) => fieldValue(field)).filter(Boolean),
      analysisRunId: identity.analysis_run_id,
      runId: identity.analysis_run_id,
      sourceId: identity.source_id,
      sourceSha256: identity.source_sha256,
      source_sha256: identity.source_sha256,
      sourceTextHash: identity.source_sha256,
      topicLabel: identity.topic_label,
      source_binding: { field: "canonicalAnalysis", status: "derived_from_analysis_bundle_v2", valid: true, inferred: false }
    };
    const ahaSer = {
      tema: canonicalAnalysis.theme,
      hovedspenning: canonicalAnalysis.mainTension,
      viktigsteInnsikt: canonicalAnalysis.keyInsight,
      fagkoblinger: subjectMatches.map((item) => item.label).filter(Boolean),
      nesteSteg: fieldValue(overview.next_inquiry),
      kortSvar: fieldValue(afterwork.summary) || canonicalAnalysis.keyInsight,
      analysisRunId: identity.analysis_run_id,
      runId: identity.analysis_run_id,
      sourceId: identity.source_id,
      sourceSha256: identity.source_sha256,
      source_sha256: identity.source_sha256,
      sourceTextHash: identity.source_sha256,
      topicLabel: identity.topic_label,
      source_binding: { field: "ahaSer", status: "derived_from_analysis_bundle_v2", valid: true, inferred: false }
    };
    return {
      analysisBundleV2: verified,
      analysisId: identity.analysis_id,
      analysisRunId: identity.analysis_run_id,
      runId: identity.analysis_run_id,
      sourceId: identity.source_id,
      sourceSha256: identity.source_sha256,
      source_sha256: identity.source_sha256,
      sourceTextHash: identity.source_sha256,
      canonicalAnalysis,
      ahaSer,
      afterwork: {
        summary: fieldValue(afterwork.summary),
        reflection: fieldValue(afterwork.reflection),
        thoughts: {
          hovedspor: fieldValue(afterwork.main_thread),
          lose_tanker: fieldValue(afterwork.unresolved_thought),
          neste_steg: fieldValue(afterwork.next_step)
        },
        analysisRunId: identity.analysis_run_id,
        runId: identity.analysis_run_id,
        sourceId: identity.source_id,
        sourceSha256: identity.source_sha256,
        source_sha256: identity.source_sha256,
        sourceTextHash: identity.source_sha256,
        source_binding: { field: "afterwork", status: "derived_from_analysis_bundle_v2", valid: true, inferred: false }
      },
      insights,
      insightCards: insights,
      concepts,
      keywords: concepts,
      subjectMatches,
      subjectLinks: subjectMatches,
      analysisQuality: clone(verified.quality)
    };
  }

  function surface(bundle, name) {
    const verified = hydrate(bundle);
    if (!verified || !SURFACES.includes(name)) return null;
    return clone(verified.surfaces[name]);
  }

  const api = Object.freeze({
    SCHEMA, FIELD_SCHEMA, VERSION, SURFACES, CLOSED_WRITE_POLICY,
    build, validate, hydrate, toLegacyView, surface, isSha256
  });
  global.AHAAnalysisBundleV2 = api;
  global.AHAModuleApi?.register?.("chat.analysisBundleV2", api, {
    version: VERSION,
    legacyGlobal: "AHAAnalysisBundleV2",
    exports: Object.keys(api)
  });
})(typeof window !== "undefined" ? window : globalThis);

// ahaChatAnalysisRunContract.js
// Versjonert, DOM-fri view-model for én kildebundet AHA-analyse.

(function (global) {
  "use strict";

  const CONTRACT_VERSION = "aha_analysis_run_v1";
  const SOURCE_LOCKED_FIELDS = Object.freeze([
    "canonicalAnalysis", "afterwork", "ahaSer", "concepts", "subjectMatches",
    "rawAutoPayload", "answerEvaluation", "analysisBundleV2"
  ]);

  function object(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function array(value) {
    return Array.isArray(value) ? value.slice() : [];
  }

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function uniqueText(values) {
    const seen = new Set();
    return array(values).map(text).filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
  }

  function readSourceHash(value) {
    const src = object(value);
    return text(
      src.source_sha256 || src.sourceSha256 || src.sourceTextHash || src.sourceHash || src.normalizedSourceHash ||
      src.sourceFingerprint || src.identity?.source_sha256 || src.source_binding?.currentSourceTextHash
    );
  }

  function isSha256(value) {
    return /^[a-f0-9]{64}$/.test(text(value).toLowerCase());
  }

  function runIdentity(value) {
    const src = object(value);
    if (!Object.keys(src).length) return {};
    return {
      contractVersion: CONTRACT_VERSION,
      analysisId: text(src.analysisId),
      analysisRunId: text(src.analysisRunId || src.runId),
      runId: text(src.runId || src.analysisRunId),
      conversationId: text(src.conversationId || src.sessionId),
      sessionId: text(src.sessionId || src.conversationId),
      turnId: text(src.turnId),
      sourceId: text(src.sourceId),
      sourceKind: text(src.sourceKind || src.sourceType || "chat"),
      sourceType: text(src.sourceType || src.sourceKind || "chat"),
      sourceTextHash: readSourceHash(src),
      sourceHash: readSourceHash(src),
      sourceSha256: readSourceHash(src),
      source_sha256: readSourceHash(src),
      sourceHashAlgorithm: "sha256",
      createdAt: text(src.createdAt),
      memoryAllowed: src.memoryAllowed === true,
      memoryMode: text(src.memoryMode) || (src.memoryAllowed === true ? "allowed" : "off")
    };
  }

  function collectInvalidFields(input) {
    const src = object(input);
    const fromQuality = src.quality?.sourceBinding?.invalidFields || src.quality?.invalidFields;
    return array(src.invalidFields?.length ? src.invalidFields : fromQuality)
      .map((item) => item && typeof item === "object" ? { ...item } : { field: text(item) })
      .filter((item) => text(item.field));
  }

  function validateSourceLockedFields(input, currentHash, currentRunId) {
    const src = object(input);
    const invalid = [];
    SOURCE_LOCKED_FIELDS.forEach((field) => {
      const value = src[field];
      const hasValue = Array.isArray(value) ? value.length > 0 : Boolean(value && typeof value === "object" && Object.keys(value).length);
      if (!hasValue) return;
      // Array projections are validated through their producer-owned field
      // reports. The run contract only accepts/rejects object artifacts here.
      if (Array.isArray(value)) return;
      const fieldHash = readSourceHash(value);
      const fieldRunId = text(value?.analysisRunId || value?.runId || value?.identity?.analysis_run_id);
      const fieldAnalysisId = text(value?.analysisId || value?.identity?.analysis_id);
      const fieldSourceId = text(value?.sourceId || value?.identity?.source_id);
      const binding = object(value?.source_binding || value?.sourceBinding);
      const dataKeys = Object.keys(value).filter((key) => key !== "source_binding" && key !== "sourceBinding");
      if (text(binding.status) === "no_data" && dataKeys.length === 0) return;
      if (binding.valid === false) {
        invalid.push({ field, status: text(binding.status) || "invalid_source_binding", reason: text(binding.reason) || "binding_rejected" });
        return;
      }
      if (!isSha256(fieldHash) || !fieldRunId) {
        invalid.push({ field, status: "invalid_unbound_artifact", reason: "explicit_sha256_and_run_id_required" });
        return;
      }
      if (fieldHash && currentHash && fieldHash !== currentHash) {
        invalid.push({ field, status: "invalid_hash_mismatch", reason: "hash_mismatch", currentSourceTextHash: currentHash, fieldSourceTextHash: fieldHash });
        return;
      }
      if (currentRunId && fieldRunId !== currentRunId) {
        invalid.push({ field, status: "invalid_run_mismatch", reason: "run_mismatch", currentAnalysisRunId: currentRunId, fieldAnalysisRunId: fieldRunId });
        return;
      }
      if (field === "analysisBundleV2") {
        const bundleValidation = global.AHAAnalysisBundleV2?.validate?.(value);
        if (bundleValidation?.valid !== true) {
          invalid.push({ field, status: "invalid_bundle_schema", reason: "analysis_bundle_v2_validation_failed" });
          return;
        }
        if (text(src.analysisId) && fieldAnalysisId !== text(src.analysisId)) {
          invalid.push({ field, status: "invalid_analysis_id_mismatch", reason: "analysis_id_mismatch" });
          return;
        }
        if (text(src.sourceId) && fieldSourceId !== text(src.sourceId)) {
          invalid.push({ field, status: "invalid_source_id_mismatch", reason: "source_id_mismatch" });
        }
      }
    });
    return invalid;
  }

  function create(input = {}) {
    const src = object(input);
    const active = object(src.activeRun);
    const sourceText = String(src.sourceText ?? active.sourceText ?? "");
    const sourceTextHash = text(readSourceHash(src) || readSourceHash(active));
    const runId = text(src.analysisRunId || src.runId || active.analysisRunId || active.runId);
    const invalidFields = collectInvalidFields(src);
    validateSourceLockedFields(src, sourceTextHash, runId).forEach((item) => {
      if (!invalidFields.some((existing) => existing.field === item.field && existing.status === item.status)) invalidFields.push(item);
    });
    const invalidationReasons = uniqueText([
      ...array(src.invalidationReasons),
      ...invalidFields.map((item) => `${item.field}:${item.status || item.reason || "invalid"}`),
      ...(!sourceTextHash ? ["missing_source_text_hash"] : []),
      ...(!runId ? ["missing_run_id"] : [])
    ]);
    const quality = { ...object(src.quality) };
    const failClosed = quality.failClosed === true || invalidFields.length > 0;
    const memoryAllowed = src.memoryAllowed === true || active.memoryAllowed === true;

    return Object.assign({}, src, {
      contractVersion: CONTRACT_VERSION,
      activeRun: runIdentity(active),
      analysisId: text(src.analysisId || active.analysisId),
      analysisRunId: runId,
      runId,
      conversationId: text(src.conversationId || src.sessionId || active.conversationId || active.sessionId),
      sessionId: text(src.sessionId || src.conversationId || active.sessionId || active.conversationId),
      turnId: text(src.turnId || active.turnId),
      sourceId: text(src.sourceId || active.sourceId),
      sourceKind: text(src.sourceKind || src.sourceType || active.sourceKind || active.sourceType || "chat"),
      sourceType: text(src.sourceType || src.sourceKind || active.sourceType || active.sourceKind || "chat"),
      sourceText,
      sourceTextHash,
      sourceHash: sourceTextHash,
      sourceSha256: sourceTextHash,
      source_sha256: sourceTextHash,
      sourceHashAlgorithm: "sha256",
      normalizedSourceHash: sourceTextHash,
      sourceFingerprint: sourceTextHash,
      sourcePreview: text(src.sourcePreview || src.sourceTextPreview || active.sourcePreview || sourceText.replace(/\s+/g, " ").slice(0, 180)),
      sourceTextPreview: text(src.sourceTextPreview || src.sourcePreview || active.sourceTextPreview || sourceText.replace(/\s+/g, " ").slice(0, 180)),
      createdAt: text(src.createdAt || active.createdAt) || new Date().toISOString(),
      memoryAllowed,
      memoryMode: text(src.memoryMode || active.memoryMode) || (memoryAllowed ? "allowed" : "off"),
      canonicalAnalysis: { ...object(src.canonicalAnalysis) },
      afterwork: { ...object(src.afterwork) },
      ahaSer: { ...object(src.ahaSer) },
      concepts: array(src.concepts),
      subjectMatches: array(src.subjectMatches),
      rawAutoPayload: { ...object(src.rawAutoPayload) },
      ahaReply: String(src.ahaReply ?? active.ahaReply ?? ""),
      answerEvaluation: { ...object(src.answerEvaluation) },
      analysisBundleV2: src.analysisBundleV2 && typeof src.analysisBundleV2 === "object" ? src.analysisBundleV2 : null,
      quality,
      invalidFields,
      invalidationReasons,
      analysisBinding: {
        status: failClosed ? "invalid" : (text(quality.status) || (sourceTextHash && runId ? "bound" : "incomplete")),
        valid: !failClosed && Boolean(isSha256(sourceTextHash) && runId),
        runId: runId || null,
        sourceTextHash: sourceTextHash || null,
        sourceSha256: sourceTextHash || null,
        sourceHashAlgorithm: "sha256"
      }
    });
  }

  function update(run, patch = {}) {
    if (!run || typeof run !== "object") return create(patch);
    const next = create(Object.assign({}, run, object(patch), { activeRun: run }));
    Object.keys(run).forEach((key) => { if (!(key in next)) delete run[key]; });
    Object.assign(run, next);
    return run;
  }

  function bindArtifact(artifact, run, field = "", options = {}) {
    if (!artifact || typeof artifact !== "object" || !run) return artifact;
    const runId = text(run.analysisRunId || run.runId);
    const sourceTextHash = readSourceHash(run);
    const producerBound = options.producer === "current_analysis_run";
    if (producerBound) {
      if (!runId || !isSha256(sourceTextHash)) throw new Error("Cannot produce a source-bound artifact without run id and SemanticDocument SHA-256.");
      Object.assign(artifact, {
        analysisId: text(run.analysisId),
        analysisRunId: runId,
        runId,
        conversationId: text(run.conversationId || run.sessionId),
        sessionId: text(run.sessionId || run.conversationId),
        turnId: text(run.turnId),
        sourceId: text(run.sourceId),
        sourceKind: text(run.sourceKind || run.sourceType || artifact.sourceKind || "chat"),
        createdAt: artifact.createdAt || run.createdAt,
        sourceHash: sourceTextHash,
        normalizedSourceHash: sourceTextHash,
        sourceTextHash,
        sourceSha256: sourceTextHash,
        source_sha256: sourceTextHash,
        sourceFingerprint: sourceTextHash,
        sourceHashAlgorithm: "sha256",
        sourcePreview: text(run.sourcePreview || artifact.sourcePreview || artifact.sourceTextPreview)
      });
    }
    const artifactRunId = text(artifact.analysisRunId || artifact.runId);
    const artifactHash = readSourceHash(artifact);
    const valid = Boolean(
      isSha256(sourceTextHash) &&
      isSha256(artifactHash) &&
      artifactHash === sourceTextHash &&
      artifactRunId && artifactRunId === runId
    );
    artifact.source_binding = Object.assign({}, object(artifact.source_binding), {
      field: field || text(artifact.source_binding?.field) || "artifact",
      status: valid ? (producerBound ? "producer_bound" : "verified") : (!artifactHash || !artifactRunId ? "invalid_unbound_artifact" : "invalid_source_or_run_mismatch"),
      valid,
      inferred: false,
      currentSourceTextHash: sourceTextHash || null,
      fieldSourceTextHash: artifactHash || null,
      currentAnalysisRunId: runId || null,
      fieldAnalysisRunId: artifactRunId || null,
      reason: valid ? (producerBound ? "created_by_current_analysis_run" : "explicit_identity_match") : "explicit_identity_required"
    });
    if (SOURCE_LOCKED_FIELDS.includes(field)) update(run, { [field]: artifact });
    return artifact;
  }

  function finalizeExport(bundle = {}) {
    const src = object(bundle);
    return create(Object.assign({}, src, {
      version: src.version || "aha_analysis_export_v1",
      activeRun: object(src.activeRun),
      memoryAllowed: src.memoryAllowed === true || src.activeRun?.memoryAllowed === true,
      memoryMode: src.memoryMode || src.activeRun?.memoryMode,
      invalidFields: collectInvalidFields(src)
    }));
  }

  function validate(run) {
    const value = create(run);
    const errors = [];
    if (!value.runId) errors.push("missing_run_id");
    if (!value.sourceTextHash) errors.push("missing_source_text_hash");
    else if (!isSha256(value.sourceTextHash)) errors.push("invalid_source_sha256");
    value.invalidFields.forEach((item) => errors.push(`${item.field}:${item.status || item.reason || "invalid"}`));
    return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors), value });
  }

  const api = Object.freeze({
    CONTRACT_VERSION,
    SOURCE_LOCKED_FIELDS,
    create,
    update,
    bindArtifact,
    isSha256,
    finalizeExport,
    validate
  });
  global.AHAChatAnalysisRunContract = api;
  global.AHAModuleApi?.register?.("chat.analysisRunContract", api, {
    version: 1,
    legacyGlobal: "AHAChatAnalysisRunContract",
    exports: Object.keys(api)
  });
})(typeof window !== "undefined" ? window : globalThis);
