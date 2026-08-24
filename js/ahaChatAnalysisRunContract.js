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

  function primarySourceEvidence(sourceText) {
    const source = String(sourceText || "");
    const lines = source.replace(/[\u2028\u2029]/gu, "\n").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const preferred = lines.find((line) => line.length >= 40
      && !/^(?:https?:\/\/|statistikk|artikkelvisninger|crossref|siteringer|side\s+\d|figur\s+\d|åpne\s+i\s+viewer)/iu.test(line)
      && !/@\S+\.\S+/u.test(line));
    if (preferred) {
      if (preferred.length <= 120 && preferred !== source.trim()) return preferred;
      let end = Math.min(120, preferred.length);
      const boundary = preferred.lastIndexOf(" ", end);
      if (boundary >= 60) end = boundary;
      return preferred.slice(0, end).trim();
    }
    const fallback = source.match(/[^\r\n\u2028\u2029]{40,240}/u)?.[0]?.trim() || "";
    return fallback;
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
    }, { valueType: "record", topicApplicable: false, additionalEvidence: pastedText ? [primarySourceEvidence(sourceText)] : [] });
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

  function semanticEvidence(spans) {
    return array(spans).map((span) => ({
      excerpt: text(span?.text),
      start: Number(span?.start_offset),
      end: Number(span?.end_offset)
    })).filter((item) => item.excerpt && Number.isInteger(item.start) && Number.isInteger(item.end) && item.end > item.start);
  }

  function semanticRecords(document) {
    const src = object(document);
    return {
      claim_records: array(src.claims).map((item) => ({
        id: text(item?.id),
        text: text(item?.text),
        mentioned_concept_ids: uniqueText(item?.mentioned_concept_ids),
        epistemic_status: text(item?.epistemic_status),
        origin: text(item?.origin),
        evidence: semanticEvidence(item?.spans)
      })).filter((item) => item.id && item.text),
      relation_records: array(src.relations).map((item) => ({
        id: text(item?.id),
        type: text(item?.type),
        from_id: text(item?.from_id),
        to_id: text(item?.to_id),
        epistemic_status: text(item?.epistemic_status),
        origin: text(item?.origin),
        evidence: semanticEvidence(item?.evidence_spans)
      })).filter((item) => item.id && item.type && item.from_id && item.to_id),
      tension_records: array(src.tensions).map((item) => ({
        id: text(item?.id),
        label: text(item?.label),
        epistemic_status: text(item?.epistemic_status),
        origin: text(item?.origin),
        evidence: semanticEvidence(item?.evidence_spans)
      })).filter((item) => item.id && item.label),
      approved_insight_records: array(src.candidate_insights).filter((item) => item?.status === "approved" && item?.eligible_for_current_analysis === true).map((item) => ({
        id: text(item?.id),
        insight: text(item?.insight),
        type: text(item?.type),
        abstraction: text(item?.abstraction),
        why_it_matters: text(item?.why_it_matters),
        confidence: text(item?.confidence),
        uncertainty: text(item?.uncertainty),
        causal_status: text(item?.causal_status),
        quality_score: Number.isFinite(Number(item?.quality_metrics?.quality_score)) ? Number(item.quality_metrics.quality_score) : null,
        quality_gate_schema: text(item?.quality_gate_schema),
        origin: text(item?.origin),
        evidence: array(item?.evidence).flatMap((entry) => semanticEvidence(entry?.spans))
      })).filter((item) => item.id && item.insight)
    };
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
    const semantic = object(value.semantic_document);
    if (semantic.source_sha256 !== identity.source_sha256) errors.push("semantic_document_source_mismatch");
    if (!Array.isArray(semantic.semantic_ids)) errors.push("semantic_document_semantic_ids_invalid");
    if (semantic.schema === "aha_semantic_document_v2") {
      if (!text(semantic.document_id)) errors.push("semantic_document_id_missing");
      if (semantic.analysis_id !== identity.analysis_id) errors.push("semantic_document_analysis_id_mismatch");
      if (semantic.analysis_run_id !== identity.analysis_run_id) errors.push("semantic_document_analysis_run_id_mismatch");
      if (semantic.source_id !== identity.source_id) errors.push("semantic_document_source_id_mismatch");
      for (const key of ["concept_ids", "claim_ids", "relation_ids", "tension_ids", "candidate_insight_ids", "approved_insight_ids", "blocked_candidate_insight_ids"]) {
        if (!Array.isArray(semantic[key])) errors.push(`semantic_document_${key}_invalid`);
      }
      for (const key of ["claim_records", "relation_records", "tension_records", "approved_insight_records"]) {
        if (key in semantic && !Array.isArray(semantic[key])) errors.push(`semantic_document_${key}_invalid`);
      }
      const candidateIds = new Set(array(semantic.candidate_insight_ids));
      const approvedIds = array(semantic.approved_insight_ids);
      const blockedIds = array(semantic.blocked_candidate_insight_ids);
      approvedIds.forEach((id) => { if (!candidateIds.has(id)) errors.push("semantic_document_approved_candidate_unknown"); });
      blockedIds.forEach((id) => { if (!candidateIds.has(id)) errors.push("semantic_document_blocked_candidate_unknown"); });
      if (approvedIds.some((id) => blockedIds.includes(id))) errors.push("semantic_document_candidate_status_overlap");
      const claimIds = new Set(array(semantic.claim_ids));
      const conceptIds = new Set(array(semantic.concept_ids));
      const relationIds = new Set(array(semantic.relation_ids));
      const tensionIds = new Set(array(semantic.tension_ids));
      array(semantic.claim_records).forEach((record) => {
        if (!claimIds.has(record?.id) || !text(record?.text)) errors.push("semantic_document_claim_record_invalid");
      });
      array(semantic.relation_records).forEach((record) => {
        if (!relationIds.has(record?.id) || !claimIds.has(record?.from_id) || !conceptIds.has(record?.to_id) || !text(record?.type)) {
          errors.push("semantic_document_relation_record_invalid");
        }
      });
      array(semantic.tension_records).forEach((record) => {
        if (!tensionIds.has(record?.id) || !text(record?.label)) errors.push("semantic_document_tension_record_invalid");
      });
      array(semantic.approved_insight_records).forEach((record) => {
        if (!approvedIds.includes(record?.id) || !text(record?.insight)) errors.push("semantic_document_approved_insight_record_invalid");
      });
      const gate = object(semantic.synthesis_gate);
      if (gate.authoritative !== true) errors.push("semantic_document_synthesis_gate_not_authoritative");
      if (gate.approved_count !== approvedIds.length || gate.blocked_count !== blockedIds.length || gate.candidate_count !== candidateIds.size) {
        errors.push("semantic_document_synthesis_gate_counts_invalid");
      }
    }
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
    const semanticDocument = object(input.semanticDocument);
    const authoritativeSemantic = semanticDocument.schema === "aha_semantic_document_v2"
      && semanticDocument.validation?.valid === true
      && text(semanticDocument.analysis_id) === identity.analysis_id
      && text(semanticDocument.analysis_run_id) === identity.analysis_run_id
      && text(semanticDocument.source_id) === identity.source_id
      && text(semanticDocument.source_sha256) === identity.source_sha256;
    const authoritativeTopicReport = authoritativeSemantic
      ? { valid: true, status: "authoritative_semantic_source_verified" }
      : undefined;
    const make = fieldFactory(identity, input, sourceText);
    const semanticInsightCandidates = authoritativeSemantic
      ? array(semanticDocument.candidate_insights).filter((item) => item?.status === "approved" && item?.eligible_for_current_analysis === true)
      : [];
    const rawInsights = authoritativeSemantic
      ? semanticInsightCandidates
      : array(payload.insights?.length ? payload.insights : payload.insightCards);
    const insights = rawInsights
      .map((item, index) => make("insights.item", text(item), {
        raw: item,
        itemId: text(item?.id) || `insight_${index + 1}_${stableToken(text(item))}`,
        semanticIds: [item?.semantic_id, item?.semanticId, item?.id],
        origin: authoritativeSemantic ? "semantic_document_v2_quality_approved" : "current_analysis_run",
        topicReport: authoritativeTopicReport,
        additionalEvidence: authoritativeSemantic
          ? array(item?.evidence).map((entry) => entry?.quote)
          : evidenceCandidates(item)
      }))
      .filter(Boolean);
    const rawConcepts = authoritativeSemantic
      ? array(semanticDocument.concepts)
      : array(payload.concepts?.length ? payload.concepts : payload.keywords);
    const concepts = rawConcepts
      .map((item, index) => make("concepts.item", text(item), {
        raw: item,
        itemId: text(item?.id) || `concept_${index + 1}_${stableToken(text(item))}`,
        semanticIds: [item?.semantic_id, item?.semanticId, item?.id],
        origin: authoritativeSemantic ? "semantic_document_v2_literal_concept" : "current_analysis_run",
        topicReport: authoritativeTopicReport,
        additionalEvidence: authoritativeSemantic ? array(item?.mentions).map((entry) => entry?.text) : []
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
        const score = Number(src.score);
        const explanation = text(src.explanation || src.reason);
        const subjectEvidence = uniqueText([...evidenceCandidates(item), ...array(src.matched_terms)]);
        if (!label || !Number.isFinite(score) || score < 0.8 || !explanation || !subjectEvidence.length) return null;
        return make("subjects.item", {
          subject_id: text(src.subject_id || src.id),
          label,
          score,
          explanation
        }, {
          valueType: "record",
          raw: item,
          itemId: text(src.subject_id || src.id) || `subject_${index + 1}_${stableToken(label)}`,
          semanticIds: [src.semantic_id, src.semanticId],
          additionalEvidence: subjectEvidence
        });
      })
      .filter(Boolean);
    const strongestInsight = authoritativeSemantic
      ? semanticInsightCandidates[0]?.insight || ""
      : canonical.keyInsight || ahaSer.viktigsteInnsikt || payload.insight || insights[0]?.value;
    const semanticTension = authoritativeSemantic ? array(semanticDocument.tensions)[0] : null;
    const overview = {
      theme: make("overview.theme", canonical.theme || ahaSer.tema || payload.tema, { reportField: "canonicalAnalysis.theme", additionalEvidence: claimEvidence(payload, canonical.theme || ahaSer.tema) }),
      central_tension: make("overview.central_tension", semanticTension?.label || canonical.mainTension || ahaSer.hovedspenning || payload.hovedspenning, {
        reportField: "canonicalAnalysis.mainTension",
        semanticIds: [semanticTension?.id],
        origin: semanticTension ? "semantic_document_v2_source_tension" : "current_analysis_run",
        topicReport: semanticTension ? authoritativeTopicReport : undefined,
        additionalEvidence: semanticTension ? array(semanticTension.evidence_spans).map((entry) => entry?.text) : claimEvidence(payload, canonical.mainTension || ahaSer.hovedspenning)
      }),
      strongest_insight: make("overview.strongest_insight", strongestInsight, {
        reportField: "canonicalAnalysis.keyInsight",
        semanticIds: [semanticInsightCandidates[0]?.id],
        origin: authoritativeSemantic ? "semantic_document_v2_quality_approved" : "current_analysis_run",
        topicReport: authoritativeTopicReport,
        additionalEvidence: authoritativeSemantic
          ? array(semanticInsightCandidates[0]?.evidence).map((entry) => entry?.quote)
          : claimEvidence(payload, strongestInsight)
      }),
      next_inquiry: make("overview.next_inquiry", ahaSer.nesteSteg || canonical.suggestedActions?.[0] || payload?.thoughts?.neste_steg, { reportField: "ahaSer.nesteSteg" })
    };
    const semanticInsightEvidence = semanticInsightCandidates.flatMap((item) => array(item?.evidence).map((entry) => entry?.quote)).filter(Boolean);
    const semanticInsightIds = semanticInsightCandidates.map((item) => item?.id).filter(Boolean);
    const semanticSummary = authoritativeSemantic
      ? semanticInsightCandidates.slice(0, 2).map((item) => text(item?.insight)).filter(Boolean).join(" ")
      : "";
    const semanticReflection = authoritativeSemantic
      ? text(semanticInsightCandidates[0]?.why_it_matters || semanticTension?.label)
      : "";
    const sourceStructure = {
      problem_statement: make("source_structure.problem_statement", payload.problemStatement || payload.problem_statement || canonical.theme, { reportField: "canonicalAnalysis.theme" }),
      main_claim: make("source_structure.main_claim", canonical.keyInsight || ahaSer.viktigsteInnsikt, {
        reportField: "canonicalAnalysis.keyInsight",
        semanticIds: semanticInsightIds.slice(0, 1),
        origin: authoritativeSemantic ? "semantic_document_v2_quality_approved" : "current_analysis_run",
        topicReport: authoritativeSemantic ? authoritativeTopicReport : undefined,
        additionalEvidence: authoritativeSemantic ? semanticInsightEvidence : claimEvidence(payload, canonical.keyInsight || ahaSer.viktigsteInnsikt)
      }),
      evidence_method: make("source_structure.evidence_method", array(payload.sortItems).map((item) => text(item)).filter(Boolean), { valueType: "text_list", reportField: "afterwork.sortItems" }),
      central_tension: make("source_structure.central_tension", canonical.mainTension || ahaSer.hovedspenning, { reportField: "canonicalAnalysis.mainTension" })
    };
    const afterwork = {
      summary: make("afterwork.summary", semanticSummary || payload.summary || canonical.summary || payload.day || ahaSer.kortSvar, {
        reportField: "afterwork.summary",
        semanticIds: semanticInsightIds.slice(0, 2),
        origin: semanticSummary ? "semantic_document_v2_cross_insight_summary" : "current_analysis_run",
        topicReport: semanticSummary ? authoritativeTopicReport : undefined,
        additionalEvidence: semanticSummary ? semanticInsightEvidence : []
      }),
      reflection: make("afterwork.reflection", semanticReflection || canonical.reflection || payload.reflection, {
        reportField: "afterwork.reflection",
        semanticIds: semanticInsightIds.slice(0, 1),
        origin: semanticReflection ? "semantic_document_v2_why_it_matters" : "current_analysis_run",
        topicReport: semanticReflection ? authoritativeTopicReport : undefined,
        additionalEvidence: semanticReflection ? semanticInsightEvidence : []
      }),
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
    if (semanticDocument.schema === "aha_semantic_document_v2" && !authoritativeSemantic) identityErrors.push("semantic_document_identity_mismatch");
    const status = identityErrors.length ? "invalid" : (incomplete.length || rejected.length) ? "incomplete" : "ready";
    const bundle = {
      schema: SCHEMA,
      version: VERSION,
      bundle_id: `analysis_bundle_${stableToken(`${identity.analysis_id}|${identity.analysis_run_id}|${identity.source_sha256}`)}`,
      status,
      identity,
      semantic_document: {
        schema: text(semanticDocument.schema) || "aha_semantic_document_v1",
        document_id: text(semanticDocument.id || semanticDocument.document_id) || null,
        analysis_id: text(semanticDocument.analysis_id) || null,
        analysis_run_id: text(semanticDocument.analysis_run_id) || null,
        source_id: text(semanticDocument.source_id) || null,
        source_sha256: text(semanticDocument.source_sha256) || identity.source_sha256,
        semantic_ids: uniqueText([
          ...array(input.semanticIds),
          ...array(semanticDocument.concepts).map((item) => item?.id),
          ...array(semanticDocument.claims).map((item) => item?.id),
          ...array(semanticDocument.relations).map((item) => item?.id),
          ...array(semanticDocument.tensions).map((item) => item?.id),
          ...array(semanticDocument.candidate_insights).map((item) => item?.id)
        ]),
        status: text(semanticDocument.status) || (authoritativeSemantic ? "incomplete" : "not_available"),
        quality_status: text(semanticDocument.quality?.status) || "not_available",
        concept_ids: uniqueText(array(semanticDocument.concepts).map((item) => item?.id)),
        claim_ids: uniqueText(array(semanticDocument.claims).map((item) => item?.id)),
        relation_ids: uniqueText(array(semanticDocument.relations).map((item) => item?.id)),
        tension_ids: uniqueText(array(semanticDocument.tensions).map((item) => item?.id)),
        candidate_insight_ids: uniqueText(array(semanticDocument.candidate_insights).map((item) => item?.id)),
        approved_insight_ids: uniqueText(array(semanticDocument.candidate_insights).filter((item) => item?.status === "approved").map((item) => item?.id)),
        blocked_candidate_insight_ids: uniqueText(array(semanticDocument.candidate_insights).filter((item) => item?.status === "blocked").map((item) => item?.id)),
        ...semanticRecords(semanticDocument),
        synthesis_gate: authoritativeSemantic ? {
          schema: text(semanticDocument.synthesis_gate?.schema),
          quality_gate_schema: text(semanticDocument.synthesis_gate?.quality_gate_schema),
          authoritative: semanticDocument.synthesis_gate?.authoritative === true,
          status: text(semanticDocument.synthesis_gate?.status),
          candidate_count: Number(semanticDocument.synthesis_gate?.candidate_count || 0),
          approved_count: Number(semanticDocument.synthesis_gate?.approved_count || 0),
          blocked_count: Number(semanticDocument.synthesis_gate?.blocked_count || 0)
        } : null
      },
      surfaces,
      quality: {
        status,
        field_count: fields.length,
        passed_field_count: fields.filter((field) => field.quality.status === "passed").length,
        incomplete_field_ids: incomplete,
        rejected_field_ids: rejected,
        reasons: [
          ...identityErrors,
          ...(incomplete.length ? ["item_level_evidence_or_topic_incomplete"] : []),
          ...(rejected.length ? ["one_or_more_fields_rejected"] : []),
          ...(authoritativeSemantic && semanticDocument.synthesis_gate?.status === "blocked" ? ["unsupported_synthesized_insights_blocked"] : [])
        ]
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
    return field?.schema === FIELD_SCHEMA && field?.quality?.status === "passed" ? clone(field.value) : fallback;
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

// Authoritative read-only projections for the analysis surface and Knowledge Map.
// Both models retain the immutable AnalysisBundleV2 identity and never read or
// write Chamber, product stores, remote services or raw source text.
(function (global) {
  "use strict";

  const ANALYSIS_SCHEMA = "aha_analysis_read_model_v2";
  const KNOWLEDGE_SCHEMA = "aha_knowledge_map_read_model_v2";
  const READ_ITEM_SCHEMA = "aha_analysis_read_item_v2";
  const VERSION = 2;
  const CLOSED_POLICY = Object.freeze({
    read_only: true,
    product_store_write: false,
    automatic_product_write: false,
    chamber_write: false,
    canonical_write: false,
    meta_write: false,
    remote_write: false,
    sync_write: false,
    direct_materialization: false,
    legacy_chamber_merge: false
  });

  function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function array(value) { return Array.isArray(value) ? value : []; }
  function text(value) {
    if (value == null) return "";
    if (["string", "number", "boolean"].includes(typeof value)) return String(value).replace(/\s+/g, " ").trim();
    const src = object(value);
    return text(src.insight || src.text || src.label || src.title || src.name || src.summary || src.value);
  }
  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function deepFreeze(value, seen = new Set()) {
    if (!value || typeof value !== "object" || seen.has(value)) return value;
    seen.add(value);
    Object.keys(value).forEach((key) => deepFreeze(value[key], seen));
    return Object.freeze(value);
  }
  function stableToken(value) {
    let hash = 2166136261;
    const input = String(value || "");
    for (let i = 0; i < input.length; i += 1) { hash ^= input.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return (hash >>> 0).toString(36);
  }
  function isSha256(value) { return /^[a-f0-9]{64}$/u.test(text(value).toLowerCase()); }
  function allItems(value, out = []) {
    if (!value || typeof value !== "object") return out;
    if (value.schema === READ_ITEM_SCHEMA) { out.push(value); return out; }
    if (Array.isArray(value)) value.forEach((item) => allItems(item, out));
    else Object.values(value).forEach((item) => allItems(item, out));
    return out;
  }
  function visibleField(field, surface) {
    if (field?.schema !== "aha_analysis_field_v2") return false;
    if (field.topic?.status === "rejected" || field.quality?.status === "rejected") return false;
    if (surface === "sources") return field.value_type === "record";
    if (field.quality?.status !== "passed") return false;
    if (surface === "subjects") {
      const value = object(field.value);
      return Number.isFinite(Number(value.score)) && Number(value.score) >= 0.8
        && Boolean(text(value.explanation)) && array(field.provenance?.evidence).length > 0;
    }
    return true;
  }
  function insightDisplay(field, semantic) {
    const semanticId = array(field?.semantic_ids)[0];
    const record = array(semantic?.approved_insight_records).find((item) => item?.id === semanticId) || {};
    return {
      insight: text(record.insight || field?.value),
      type: text(record.type),
      abstraction: text(record.abstraction),
      why_it_matters: text(record.why_it_matters),
      confidence: text(record.confidence),
      uncertainty: text(record.uncertainty),
      causal_status: text(record.causal_status)
    };
  }
  function readItem(field, semantic, identity) {
    return {
      schema: READ_ITEM_SCHEMA,
      item_id: text(field?.item_id),
      field_id: text(field?.field_id),
      value_type: text(field?.value_type),
      value: clone(field?.value),
      display: field?.field_id === "insights.item" ? insightDisplay(field, semantic) : clone(field?.value),
      analysis_id: text(identity?.analysis_id),
      source_sha256: text(field?.source_sha256),
      analysis_run_id: text(field?.analysis_run_id),
      source_id: text(field?.source_id),
      semantic_ids: clone(array(field?.semantic_ids)),
      provenance: clone(object(field?.provenance)),
      topic: clone(object(field?.topic)),
      quality: clone(object(field?.quality))
    };
  }
  function mapFields(value, surface, semantic, identity, blocked) {
    if (Array.isArray(value)) return value.map((field) => {
      if (!visibleField(field, surface)) { if (field?.item_id) blocked.push(field.item_id); return null; }
      return readItem(field, semantic, identity);
    }).filter(Boolean);
    return Object.fromEntries(Object.entries(object(value)).map(([key, field]) => {
      if (!field) return [key, null];
      if (!visibleField(field, surface)) { if (field?.item_id) blocked.push(field.item_id); return [key, null]; }
      return [key, readItem(field, semantic, identity)];
    }));
  }
  function validateAnalysis(model) {
    const value = object(model); const errors = [];
    if (value.schema !== ANALYSIS_SCHEMA || value.version !== VERSION) errors.push("schema_invalid");
    if (!text(value.identity?.analysis_id)) errors.push("analysis_id_missing");
    if (!text(value.identity?.analysis_run_id)) errors.push("analysis_run_id_missing");
    if (!text(value.identity?.source_id)) errors.push("source_id_missing");
    if (!isSha256(value.identity?.source_sha256)) errors.push("source_sha256_invalid");
    for (const surface of global.AHAAnalysisBundleV2?.SURFACES || []) {
      if (!(surface in object(value.sections))) errors.push(`section_missing:${surface}`);
    }
    for (const item of allItems(value.sections)) {
      if (item.analysis_id !== value.identity?.analysis_id) errors.push("item_analysis_mismatch");
      if (item.source_sha256 !== value.identity?.source_sha256) errors.push("item_source_mismatch");
      if (item.analysis_run_id !== value.identity?.analysis_run_id) errors.push("item_run_mismatch");
      if (item.source_id !== value.identity?.source_id) errors.push("item_source_id_mismatch");
    }
    if (Object.entries(CLOSED_POLICY).some(([key, expected]) => value.policy?.[key] !== expected)) errors.push("read_policy_open");
    return deepFreeze({ valid: errors.length === 0, errors: Array.from(new Set(errors)).sort() });
  }
  function buildAnalysis(bundle) {
    const bundleApi = global.AHAAnalysisBundleV2;
    const verified = bundleApi?.hydrate?.(bundle);
    if (!verified) return null;
    const blocked = [];
    const semantic = object(verified.semantic_document);
    const sections = Object.fromEntries(bundleApi.SURFACES.map((surface) => [surface, mapFields(verified.surfaces[surface], surface, semantic, verified.identity, blocked)]));
    const model = {
      schema: ANALYSIS_SCHEMA,
      version: VERSION,
      read_model_id: `analysis_read_${stableToken(verified.bundle_id)}`,
      status: verified.status === "invalid" ? "invalid" : blocked.length ? "incomplete" : "ready",
      identity: clone(verified.identity),
      semantic_document: clone(semantic),
      sections,
      blocked_field_ids: Array.from(new Set(blocked)).sort(),
      quality: {
        source_bundle_status: verified.status,
        visible_field_count: allItems(sections).length,
        blocked_field_count: new Set(blocked).size,
        synthesis_gate: clone(semantic.synthesis_gate)
      },
      validation: { valid: false, errors: [] },
      policy: clone(CLOSED_POLICY)
    };
    model.validation = clone(validateAnalysis(model));
    if (!model.validation.valid) return null;
    return deepFreeze(model);
  }
  function hydrateAnalysis(value) {
    const validation = validateAnalysis(value);
    if (!validation.valid) return null;
    const model = clone(value); model.validation = clone(validation); return deepFreeze(model);
  }

  function evidenceFor(item) { return clone(array(item?.provenance?.evidence)); }
  function node(identity, input) {
    const historical = text(input.origin_scope) === "historical";
    return {
      id: text(input.id), node_type: text(input.node_type), label: text(input.label), summary: text(input.summary),
      origin_scope: text(input.origin_scope) || "current_analysis",
      analysis_id: historical ? (text(input.analysis_id) || null) : identity.analysis_id,
      source_sha256: historical ? text(input.source_sha256) : identity.source_sha256,
      analysis_run_id: historical ? (text(input.analysis_run_id) || null) : identity.analysis_run_id,
      source_id: historical ? (text(input.source_id) || null) : identity.source_id,
      map_analysis_id: identity.analysis_id, map_analysis_run_id: identity.analysis_run_id, map_source_id: identity.source_id, map_source_sha256: identity.source_sha256,
      semantic_ids: clone(array(input.semantic_ids)), provenance: { origin: text(input.origin), evidence: clone(array(input.evidence)) }
    };
  }
  function edge(identity, input) {
    return {
      id: text(input.id) || `edge_${stableToken(`${input.from}|${input.to}|${input.relation_type}`)}`,
      from: text(input.from), to: text(input.to), relation_type: text(input.relation_type), explanation: text(input.explanation),
      origin_scope: text(input.origin_scope) || "current_analysis",
      analysis_id: identity.analysis_id, source_sha256: identity.source_sha256, analysis_run_id: identity.analysis_run_id, source_id: identity.source_id,
      semantic_ids: clone(array(input.semantic_ids)), provenance: { origin: text(input.origin), evidence: clone(array(input.evidence)) }
    };
  }
  function buildCurrentGraph(readModel) {
    const identity = readModel.identity;
    const sourceNodeId = `source_${stableToken(identity.source_id)}`;
    const nodes = [node(identity, { id: sourceNodeId, node_type: "source", label: "Aktiv primærkilde", summary: `SHA-256 ${identity.source_sha256.slice(0, 12)}…`, origin: "analysis_bundle_v2_identity" })];
    const addFieldNodes = (items, nodeType) => array(items).forEach((item) => {
      const semanticId = array(item.semantic_ids)[0];
      const label = nodeType === "insight" ? text(item.display?.insight) : text(item.display || item.value);
      if (!label) return;
      const id = semanticId || `${nodeType}_${stableToken(item.item_id)}`;
      nodes.push(node(identity, { id, node_type: nodeType, label, summary: nodeType === "insight" ? text(item.display?.why_it_matters) : "", semantic_ids: item.semantic_ids, evidence: evidenceFor(item), origin: item.provenance?.origin }));
    });
    addFieldNodes(readModel.sections.insights, "insight");
    addFieldNodes(readModel.sections.concepts, "concept");
    array(readModel.semantic_document?.claim_records).forEach((record) => nodes.push(node(identity, { id: record.id, node_type: "claim", label: record.text, semantic_ids: [record.id], evidence: record.evidence, origin: record.origin })));
    array(readModel.semantic_document?.tension_records).forEach((record) => nodes.push(node(identity, { id: record.id, node_type: "tension", label: record.label, semantic_ids: [record.id], evidence: record.evidence, origin: record.origin })));
    const dedupedNodes = Array.from(new Map(nodes.filter((item) => item.id).map((item) => [item.id, item])).values());
    const nodeIds = new Set(dedupedNodes.map((item) => item.id));
    const edges = dedupedNodes.filter((item) => item.id !== sourceNodeId).map((item) => edge(identity, { from: sourceNodeId, to: item.id, relation_type: "grounded_in_current_source", explanation: "Noden er utledet fra den aktive, SHA-256-bundne kilden.", semantic_ids: item.semantic_ids, evidence: item.provenance.evidence, origin: item.provenance.origin }));
    array(readModel.semantic_document?.relation_records).forEach((record) => {
      if (!nodeIds.has(record.from_id) || !nodeIds.has(record.to_id)) return;
      edges.push(edge(identity, { id: record.id, from: record.from_id, to: record.to_id, relation_type: record.type, explanation: "Eksplisitt semantisk relasjon fra den aktive kilden.", semantic_ids: [record.id], evidence: record.evidence, origin: record.origin }));
    });
    return { sourceNodeId, nodes: dedupedNodes, edges: Array.from(new Map(edges.map((item) => [item.id, item])).values()) };
  }
  function historicalGraph(readModel, current, historicalRelations) {
    const identity = readModel.identity; const nodes = []; const edges = [];
    array(historicalRelations).forEach((relation) => {
      const src = object(relation); const relationType = text(src.relation || src.relation_type); const historicalId = text(src.id || src.historical_id);
      const historicalSourceSha256 = text(src.source_sha256 || src.sourceSha256 || src.sourceTextHash);
      if (!historicalId || !isSha256(historicalSourceSha256) || !["historical_same_source_afterwork", "explicit_historical_relation"].includes(relationType)) return;
      const id = `historical_${stableToken(`${relationType}|${historicalId}`)}`;
      nodes.push(node(identity, {
        id, node_type: "historical_relation", label: text(src.label) || "Tidligere etterarbeid", summary: text(src.createdAt || src.created_at),
        origin_scope: "historical", origin: relationType, source_sha256: historicalSourceSha256,
        analysis_id: src.analysis_id || src.analysisId, analysis_run_id: src.analysis_run_id || src.analysisRunId || src.runId, source_id: src.source_id || src.sourceId
      }));
      edges.push(edge(identity, { from: current.sourceNodeId, to: id, relation_type: relationType, explanation: "Historisk materiale vises separat gjennom en eksplisitt typed relasjon og beholder egen kildeidentitet.", origin_scope: "historical", origin: relationType, semantic_ids: [] }));
    });
    return { nodes, edges };
  }
  function validateKnowledge(model) {
    const value = object(model); const errors = [];
    if (value.schema !== KNOWLEDGE_SCHEMA || value.version !== VERSION) errors.push("schema_invalid");
    if (!text(value.identity?.analysis_id)) errors.push("analysis_id_missing");
    if (!text(value.identity?.analysis_run_id)) errors.push("analysis_run_id_missing");
    if (!text(value.identity?.source_id)) errors.push("source_id_missing");
    if (!isSha256(value.identity?.source_sha256)) errors.push("source_sha256_invalid");
    for (const scopeName of ["current_analysis", "whole_map"]) {
      const scope = object(value.scopes?.[scopeName]); const ids = new Set(array(scope.nodes).map((item) => item?.id));
      array(scope.nodes).forEach((item) => {
        if (item?.map_analysis_id !== value.identity?.analysis_id || item?.map_analysis_run_id !== value.identity?.analysis_run_id || item?.map_source_id !== value.identity?.source_id || item?.map_source_sha256 !== value.identity?.source_sha256) errors.push(`${scopeName}:node_map_identity_mismatch`);
        if (item?.origin_scope === "historical") {
          if (!isSha256(item?.source_sha256) || !["historical_same_source_afterwork", "explicit_historical_relation"].includes(text(item?.provenance?.origin))) errors.push(`${scopeName}:historical_node_unbound`);
        } else if (item?.analysis_id !== value.identity?.analysis_id || item?.source_sha256 !== value.identity?.source_sha256 || item?.analysis_run_id !== value.identity?.analysis_run_id || item?.source_id !== value.identity?.source_id) errors.push(`${scopeName}:node_identity_mismatch`);
      });
      array(scope.edges).forEach((item) => {
        if (!ids.has(item?.from) || !ids.has(item?.to)) errors.push(`${scopeName}:dangling_edge`);
        if (!text(item?.relation_type) || !text(item?.explanation)) errors.push(`${scopeName}:unexplained_edge`);
        if (item?.analysis_id !== value.identity?.analysis_id || item?.source_sha256 !== value.identity?.source_sha256 || item?.analysis_run_id !== value.identity?.analysis_run_id || item?.source_id !== value.identity?.source_id) errors.push(`${scopeName}:edge_identity_mismatch`);
      });
    }
    if (array(value.scopes?.current_analysis?.nodes).some((item) => item?.origin_scope === "historical")) errors.push("historical_node_in_current_scope");
    if (value.policy?.direct_materialization !== false || value.policy?.read_only !== true) errors.push("read_policy_open");
    return deepFreeze({ valid: errors.length === 0, errors: Array.from(new Set(errors)).sort() });
  }
  function buildKnowledge(input = {}) {
    const readModel = input.analysisReadModel ? hydrateAnalysis(input.analysisReadModel) : buildAnalysis(input.analysisBundleV2 || input.bundle);
    if (!readModel) return null;
    const current = buildCurrentGraph(readModel); const historical = historicalGraph(readModel, current, input.historicalRelations);
    const model = {
      schema: KNOWLEDGE_SCHEMA, version: VERSION, read_model_id: `knowledge_map_${stableToken(readModel.read_model_id)}`, status: readModel.status,
      identity: clone(readModel.identity),
      scopes: {
        current_analysis: { label: "Denne analysen", nodes: current.nodes, edges: current.edges },
        whole_map: { label: "Hele Kunnskapskartet", nodes: [...current.nodes, ...historical.nodes], edges: [...current.edges, ...historical.edges] }
      },
      quality: { current_node_count: current.nodes.length, historical_node_count: historical.nodes.length, dangling_edge_count: 0 },
      validation: { valid: false, errors: [] }, policy: clone(CLOSED_POLICY)
    };
    model.validation = clone(validateKnowledge(model));
    if (!model.validation.valid) return null;
    return deepFreeze(model);
  }
  function hydrateKnowledge(value) {
    const validation = validateKnowledge(value); if (!validation.valid) return null;
    const model = clone(value); model.validation = clone(validation); return deepFreeze(model);
  }

  const analysisApi = Object.freeze({ SCHEMA: ANALYSIS_SCHEMA, READ_ITEM_SCHEMA, VERSION, build: buildAnalysis, validate: validateAnalysis, hydrate: hydrateAnalysis });
  const knowledgeApi = Object.freeze({ SCHEMA: KNOWLEDGE_SCHEMA, VERSION, build: buildKnowledge, validate: validateKnowledge, hydrate: hydrateKnowledge });
  global.AHAAnalysisReadModelV2 = analysisApi;
  global.AHAKnowledgeMapReadModelV2 = knowledgeApi;
  global.AHAModuleApi?.register?.("chat.analysisReadModelV2", analysisApi, { version: VERSION, legacyGlobal: "AHAAnalysisReadModelV2", exports: Object.keys(analysisApi) });
  global.AHAModuleApi?.register?.("chat.knowledgeMapReadModelV2", knowledgeApi, { version: VERSION, legacyGlobal: "AHAKnowledgeMapReadModelV2", exports: Object.keys(knowledgeApi) });
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
