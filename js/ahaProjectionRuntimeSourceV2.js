// ahaProjectionRuntimeSourceV2.js
// Authoritative read boundary from the active immutable AnalysisBundleV2 to
// V2 product previews. It never reads Chamber or product stores and never
// writes local, remote, sync, canonical or Meta state.
(function (global) {
  "use strict";

  const MODULE_SCHEMA = "aha_projection_runtime_source_v2";
  const MODULE_VERSION = 2;
  const STORAGE_KEYS = Object.freeze({ activeAnalysis: "aha_chat_auto_outputs_v1" });
  const PRODUCTS = Object.freeze({ list: "lists.html", path: "paths.html", mindmap: "mindmap.html" });
  const STATUS_LABELS = Object.freeze({
    ready: "Klar til forhåndsvisning",
    needs_evidence: "Trenger mer belegg",
    not_relevant: "Ikke relevant for denne teksten"
  });

  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function arr(value) { return Array.isArray(value) ? value : []; }
  function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function text(value) { return String(value == null ? "" : value).replace(/\s+/g, " ").trim(); }
  function isSha256(value) { return /^[a-f0-9]{64}$/u.test(text(value).toLowerCase()); }

  function read(key, fallback) {
    try {
      const raw = global.localStorage?.getItem?.(key);
      if (raw == null) return clone(fallback);
      const parsed = JSON.parse(raw);
      return parsed == null ? clone(fallback) : parsed;
    } catch {
      return clone(fallback);
    }
  }

  function bundleIdentity(bundle) {
    const identity = object(bundle?.identity);
    return {
      analysis_id: text(identity.analysis_id),
      analysis_run_id: text(identity.analysis_run_id),
      source_id: text(identity.source_id),
      source_sha256: text(identity.source_sha256).toLowerCase(),
      topic_label: text(identity.topic_label),
      created_at: text(identity.created_at)
    };
  }

  function cacheIdentity(cache) {
    const payload = object(cache?.payload);
    const run = object(cache?.activeRun);
    return {
      analysis_id: text(cache?.analysisId || payload.analysisId || run.analysisId),
      analysis_run_id: text(cache?.analysisRunId || cache?.runId || payload.analysisRunId || payload.runId || run.analysisRunId || run.runId),
      source_id: text(cache?.sourceId || payload.sourceId || run.sourceId),
      source_sha256: text(cache?.sourceSha256 || cache?.source_sha256 || cache?.sourceTextHash || payload.sourceSha256 || payload.source_sha256 || payload.sourceTextHash || run.sourceSha256 || run.source_sha256 || run.sourceTextHash).toLowerCase()
    };
  }

  function sameIdentity(left, right) {
    return Boolean(left?.analysis_id && left.analysis_id === right?.analysis_id)
      && left.analysis_run_id === right.analysis_run_id
      && left.source_id === right.source_id
      && isSha256(left.source_sha256)
      && left.source_sha256 === right.source_sha256;
  }

  function hydrateBundle(value) {
    return global.AHAAnalysisBundleV2?.hydrate?.(value) || null;
  }

  function resolveBundle(input = {}) {
    const explicit = input.analysisBundleV2 || input.analysis_bundle_v2 || input.bundle;
    if (explicit) {
      const bundle = hydrateBundle(explicit);
      return bundle ? { bundle, cache: null } : { bundle: null, cache: null, reason: "analysis_bundle_v2_invalid" };
    }
    const cache = read(STORAGE_KEYS.activeAnalysis, null);
    if (!cache || typeof cache !== "object") return { bundle: null, cache: null, reason: "active_analysis_unavailable" };
    const bundle = hydrateBundle(object(cache.payload).analysisBundleV2);
    if (!bundle) return { bundle: null, cache, reason: "active_analysis_bundle_v2_unavailable" };
    if (!sameIdentity(bundleIdentity(bundle), cacheIdentity(cache))) {
      return { bundle: null, cache, reason: "active_analysis_bundle_identity_mismatch" };
    }
    return { bundle, cache };
  }

  function activeIdentity(input = {}) {
    const resolved = resolveBundle(input);
    return resolved.bundle ? clone(bundleIdentity(resolved.bundle)) : null;
  }

  function passedConcepts(bundle) {
    const identity = bundleIdentity(bundle);
    return arr(bundle?.surfaces?.concepts).filter((field) => (
      field?.schema === "aha_analysis_field_v2"
      && field?.quality?.status === "passed"
      && ["verified", "not_applicable"].includes(field?.topic?.status)
      && field?.source_sha256 === identity.source_sha256
      && field?.analysis_run_id === identity.analysis_run_id
      && field?.source_id === identity.source_id
    )).map((field) => ({
      id: text(arr(field.semantic_ids)[0] || field.item_id),
      label: text(field.value),
      evidence: clone(arr(field?.provenance?.evidence))
    })).filter((item) => item.id && item.label);
  }

  function approvedInsights(bundle) {
    const identity = bundleIdentity(bundle);
    const concepts = passedConcepts(bundle);
    const approvedIds = new Set(arr(bundle?.semantic_document?.approved_insight_ids).map(text).filter(Boolean));
    return arr(bundle?.semantic_document?.approved_insight_records).filter((record) => (
      approvedIds.has(text(record?.id))
      && text(record?.insight)
      && Number.isFinite(Number(record?.quality_score))
      && Number(record.quality_score) >= 0.55
      && ["not_causal", "source_explicit", "interpretive"].includes(text(record?.causal_status))
      && arr(record?.evidence).length >= 2
    )).map((record) => {
      const evidence = arr(record.evidence).map((entry) => ({
        quote: text(entry?.excerpt),
        text: text(entry?.excerpt),
        role: "supports",
        start: Number(entry?.start),
        end: Number(entry?.end),
        exact_source_match: true
      })).filter((entry) => entry.quote && Number.isInteger(entry.start) && Number.isInteger(entry.end) && entry.end > entry.start);
      const semanticText = [record.insight, record.abstraction, record.why_it_matters, ...arr(record.evidence).map((entry) => entry?.excerpt)]
        .map(text).join(" ").toLocaleLowerCase("no");
      const relatedConcepts = concepts.filter((concept) => semanticText.includes(text(concept.label).toLocaleLowerCase("no")));
      return {
        id: text(record.id),
        insight: text(record.insight),
        type: text(record.type) || "insight",
        abstraction: text(record.abstraction),
        why_it_matters: text(record.why_it_matters),
        confidence: text(record.confidence),
        uncertainty: text(record.uncertainty),
        causal_status: text(record.causal_status),
        semantic_concepts: clone(relatedConcepts),
        evidence,
        source_id: identity.source_id,
        source_text_hash: identity.source_sha256,
        analysis_id: identity.analysis_id,
        analysis_run_id: identity.analysis_run_id,
        quality_score: Number(record.quality_score),
        eligible_for_insight_review: true,
        gate_decision: {
          eligible_for_insight_review: true,
          metrics: { quality_score: Number(record.quality_score) }
        },
        provenance: {
          origin: "approved_active_analysis_bundle_v2",
          source_id: identity.source_id,
          source_text_hash: identity.source_sha256,
          analysis_id: identity.analysis_id,
          analysis_run_id: identity.analysis_run_id,
          evidence: clone(evidence)
        }
      };
    });
  }

  function requestContext() {
    try {
      const params = new global.URLSearchParams(global.location?.search || "");
      return {
        product: text(params.get("product")),
        analysis_id: text(params.get("analysis_id")),
        projection_id: text(params.get("projection_id")),
        source_sha256: text(params.get("source_sha256")).toLowerCase()
      };
    } catch {
      return { product: "", analysis_id: "", projection_id: "", source_sha256: "" };
    }
  }

  function requestMismatch(identity, request) {
    if (request.analysis_id && request.analysis_id !== identity.analysis_id) return "deeplink_analysis_id_mismatch";
    if (request.source_sha256 && request.source_sha256 !== identity.source_sha256) return "deeplink_source_sha256_mismatch";
    return "";
  }

  function snapshot(input = {}) {
    const resolved = resolveBundle(input);
    if (!resolved.bundle) return clone({ active_analysis: null, analysis_bundle_v2: null, approved_active_insights: [], legacy_insights: [], blocking_reason: resolved.reason || "active_analysis_unavailable" });
    const identity = bundleIdentity(resolved.bundle);
    const mismatch = requestMismatch(identity, input.ignoreRequest === true ? {} : requestContext());
    if (mismatch) return clone({ active_analysis: identity, analysis_bundle_v2: null, approved_active_insights: [], legacy_insights: [], blocking_reason: mismatch });
    const insights = approvedInsights(resolved.bundle);
    return clone({
      active_analysis: identity,
      analysis_bundle_v2: resolved.bundle,
      approved_active_insights: insights,
      // Existing V2 integration gate still names this pure input seam
      // legacy_insights. The records themselves are authoritative Bundle V2
      // projections and never come from Chamber.
      legacy_insights: insights,
      legacy_lists: [],
      legacy_paths: [],
      legacy_mindmaps: [],
      blocking_reason: ""
    });
  }

  function blocked(reason, identity = null, projectionId = null) {
    return {
      schema: "aha_projection_product_read_model_v2",
      version: 2,
      mode: "read_only",
      status: "blocked",
      projection_id: projectionId || null,
      blocking_reasons: [reason],
      active_analysis: identity ? clone(identity) : null,
      identity: identity ? clone(identity) : null,
      surfaces: { insights: [], concepts: [], lists: [], paths: [], mindmap: { nodes: [], edges: [], read_only: true } },
      validation: { valid: false, errors: [reason] },
      policy: {
        product_store_write: false, automatic_product_write: false, chamber_write: false,
        canonical_write: false, meta_write: false, persistent_write: false,
        remote_write: false, sync_write: false
      }
    };
  }

  function rawProductState(product, model, snap) {
    const ready = model?.status === "ready" && model?.validation?.valid === true;
    const count = product === "list" ? arr(model?.surfaces?.lists).length
      : product === "path" ? arr(model?.surfaces?.paths).length
        : arr(model?.surfaces?.mindmap?.nodes).length;
    if (ready && count > 0) return { status: "ready", reason: "Kvalitetsgodkjent og kildeforankret forslag er tilgjengelig.", candidate_count: count };
    const candidateCount = arr(snap?.analysis_bundle_v2?.semantic_document?.candidate_insight_ids).length;
    if (snap?.analysis_bundle_v2 && candidateCount === 0) {
      return { status: "not_relevant", reason: "Analysen fant ingen semantisk kandidat som gjør dette produktet relevant for teksten.", candidate_count: 0 };
    }
    const quality = model?.artifact_quality;
    const qualityReasons = product === "list" ? arr(quality?.lists).flatMap((item) => arr(item?.reasons))
      : product === "path" ? arr(quality?.paths).flatMap((item) => arr(item?.reasons))
        : arr(quality?.mindmap?.reasons);
    const reasons = [...new Set([...qualityReasons, ...arr(model?.blocking_reasons)])].filter(Boolean);
    return {
      status: "needs_evidence",
      reason: reasons.length ? `Forslaget ble holdt tilbake: ${reasons.join(", ")}.` : "Analysen mangler nok godkjente innsikter eller relasjoner for dette produktet.",
      candidate_count: 0
    };
  }

  function productUrl(product, model) {
    if (!PRODUCTS[product] || !model?.projection_id || !model?.identity?.analysis_id) return null;
    const values = {
      product,
      analysis_id: model.identity.analysis_id,
      projection_id: model.projection_id,
      source_sha256: model.identity.source_sha256
    };
    const query = typeof global.URLSearchParams === "function"
      ? new global.URLSearchParams(values).toString()
      : Object.entries(values).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("&");
    return `${PRODUCTS[product]}?${query}`;
  }

  function productStates(model, snap = null) {
    const source = snap || snapshot({ ignoreRequest: true });
    return Object.fromEntries(Object.keys(PRODUCTS).map((product) => {
      const state = rawProductState(product, model, source);
      return [product, { ...state, label: STATUS_LABELS[state.status], href: productUrl(product, model) }];
    }));
  }

  function build(input = {}) {
    const builder = global.AHAProjectionProductReadModelV2;
    if (!builder?.build) return blocked("projection_product_read_model_v2_unavailable");
    const snap = snapshot(input);
    if (snap.blocking_reason) {
      const result = blocked(snap.blocking_reason, snap.active_analysis);
      result.product_states = productStates(result, snap);
      return result;
    }
    if (!snap.active_analysis || !snap.analysis_bundle_v2) return blocked("active_analysis_bundle_v2_unavailable");
    if (!snap.legacy_insights.length) {
      const result = blocked("active_analysis_has_no_projection_ready_insights", snap.active_analysis);
      result.product_states = productStates(result, snap);
      return result;
    }
    let model = builder.build(snap);
    const request = input.ignoreRequest === true ? {} : requestContext();
    if (request.projection_id && model?.projection_id !== request.projection_id) {
      model = blocked("deeplink_projection_id_mismatch", snap.active_analysis, model?.projection_id || null);
    }
    model.active_analysis = clone(snap.active_analysis);
    model.identity = clone(snap.active_analysis);
    model.analysis_bundle_id = text(snap.analysis_bundle_v2.bundle_id) || null;
    model.product_states = productStates(model, snap);
    model.policy = Object.assign({}, model.policy, {
      product_store_write: false, automatic_product_write: false, chamber_write: false,
      canonical_write: false, meta_write: false, persistent_write: false,
      remote_write: false, sync_write: false
    });
    return clone(model);
  }

  function surface(name, input = {}) {
    const model = build(input);
    if (model.status !== "ready" || model.validation?.valid !== true) return null;
    return clone(model.surfaces?.[name] ?? null);
  }

  function shouldOpenProduct(product) {
    const request = requestContext();
    if (request.product !== product || !request.analysis_id || !request.projection_id) return false;
    const model = build();
    return model.status === "ready" && model.validation?.valid === true && model.projection_id === request.projection_id;
  }

  const api = Object.freeze({
    MODULE_SCHEMA, MODULE_VERSION, STORAGE_KEYS, PRODUCTS, STATUS_LABELS,
    activeIdentity, approvedInsights, requestContext, snapshot, build, surface,
    productStates, productUrl, shouldOpenProduct
  });
  global.AHAProjectionRuntimeSourceV2 = api;
  global.AHAModuleApi?.register?.("projectionRuntimeSourceV2", api, {
    version: MODULE_VERSION,
    legacyGlobal: "AHAProjectionRuntimeSourceV2",
    exports: Object.keys(api)
  });
})(typeof window !== "undefined" ? window : globalThis);
