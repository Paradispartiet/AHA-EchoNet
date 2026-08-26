// server/ahaInsightSynthesisContractV2.js
// Strict shadow-only contract for higher-order Interpretation / Insight Synthesis V2.
// Source text remains the only evidence authority. No canonical, Chamber, Meta or persistent writes.

const SYNTHESIS_OUTPUT_SCHEMA = "aha_insight_synthesis_output_v2";
const SYNTHESIS_CONTRACT = "aha_insight_synthesis_contract_v2";
const SYNTHESIS_PROMPT_VERSION = "aha_insight_synthesis_prompt_v3";
const SYNTHESIS_MAX_SOURCE_CHARS = 8000;
const INSIGHT_TYPES = Object.freeze(["principle", "mechanism", "pattern", "tension", "consequence", "generalization"]);
const CONFIDENCE_VALUES = Object.freeze(["high", "medium", "low"]);
const CAUSAL_STATUS_VALUES = Object.freeze(["not_causal", "source_explicit", "interpretive"]);
const EVIDENCE_ROLE_VALUES = Object.freeze(["supports", "limits"]);
const RELATION_TYPES = Object.freeze(["associated_with", "part_of", "influences", "causes", "supports", "contradicts", "explains", "precedes", "other"]);
const EPISTEMIC_VALUES = Object.freeze(["source_explicit", "interpretation", "inference"]);
const FORBIDDEN_KEYS = Object.freeze(new Set([
  "assistantreply", "assistant_reply", "chatresponse", "chat_response", "airesponse", "ai_response",
  "candidate_insights", "candidateinsights", "meta_profile", "metaprofile", "chamber", "memory"
]));
const CAUSAL_LANGUAGE = /(?:\b(?:fordi|forårsaker|forårsaket|fører til|førte til|gjør at|gjorde at|resulterer i|resulterte i|på grunn av|som følge av|derfor|drivkraft|omformer|reduserer behovet|introduserer kompleksitet|bidrar til|causes?|caused|leads? to|led to|results? in|because)\b|\bfør(?:er|te)[^.!?]{0,100}\btil\b|(?:^|[^\p{L}\p{N}_])(?:skaper|skapes|skapte|skapt|gir|ga|øker|økte|reduserer|reduserte|muliggjør|muliggjorde|kanaliserer|kanaliserte)(?![\p{L}\p{N}_]))/iu;
const EXPLICIT_CAUSAL_SOURCE = /\b(fordi|forårsaker|forårsaket|fører til|førte til|gjør at|gjorde at|resulterer i|resulterte i|på grunn av|som følge av|derfor|kan\s+flytte|causes?|caused|leads? to|led to|results? in|because)\b/i;
const ANTI_CAUSAL_SOURCE = /(?:peker\s+ikke\s+ut|fastslår\s+ikke|viser\s+ikke|identifiserer\s+ikke|kan\s+ikke\s+fastslå|uten\s+å\s+fastslå)[^.!?]{0,160}(?:årsak|årsaken|kausal|kausalitet|forårsaker)/i;

const SYNTHESIS_JSON_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["schema", "candidates"],
  properties: {
    schema: { type: "string", enum: [SYNTHESIS_OUTPUT_SCHEMA] },
    candidates: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["insight", "type", "abstraction", "evidence", "why_it_matters", "confidence", "uncertainty", "causal_status"],
        properties: {
          insight: { type: "string", minLength: 1, maxLength: 600 },
          type: { type: "string", enum: INSIGHT_TYPES.slice() },
          abstraction: { type: "string", minLength: 1, maxLength: 400 },
          evidence: {
            type: "array",
            minItems: 2,
            maxItems: 3,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["quote", "role"],
              properties: {
                quote: { type: "string", minLength: 1, maxLength: 420 },
                role: { type: "string", enum: EVIDENCE_ROLE_VALUES.slice() }
              }
            }
          },
          why_it_matters: { type: "string", minLength: 1, maxLength: 400 },
          confidence: { type: "string", enum: CONFIDENCE_VALUES.slice() },
          uncertainty: { type: "string", maxLength: 320 },
          causal_status: { type: "string", enum: CAUSAL_STATUS_VALUES.slice() }
        }
      }
    }
  }
});

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeForComparison(value) {
  return normalizeWhitespace(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function synthesisResponseRequirements({ context, semanticContext } = {}) {
  const requestContext = safeObject(context) || {};
  const retry = safeObject(requestContext.authoritative_quality_retry) || {};
  const sourceClaims = Array.isArray(semanticContext?.source_claims)
    ? semanticContext.source_claims
    : [];
  const requested = Number(retry.required_new_candidate_count);
  const requestedCount = Number.isFinite(requested) ? Math.trunc(requested) : 0;
  const minimumCandidateCount = retry.mode === "projection_diversity_expansion"
    && sourceClaims.length >= 2
    && requestedCount >= 2
    ? Math.min(4, requestedCount, sourceClaims.length)
    : 0;

  return { minimum_candidate_count: minimumCandidateCount };
}

function containsForbiddenKeys(value) {
  const visit = (item) => {
    if (!item || typeof item !== "object") return false;
    for (const [key, nested] of Object.entries(item)) {
      if (FORBIDDEN_KEYS.has(String(key || "").toLowerCase())) return true;
      if (visit(nested)) return true;
    }
    return false;
  };
  return visit(value);
}

function exactKeys(value, allowedKeys, label, errors) {
  const object = safeObject(value);
  if (!object) {
    errors.push(`${label}_not_object`);
    return false;
  }
  const allowed = new Set(allowedKeys);
  Object.keys(object).forEach((key) => {
    if (!allowed.has(key)) errors.push(`${label}_unexpected_key:${key}`);
  });
  allowedKeys.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(object, key)) errors.push(`${label}_missing_key:${key}`);
  });
  return true;
}

function validateText(value, label, errors, maxLength, allowEmpty = false) {
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) {
    errors.push(`${label}_invalid_text`);
    return false;
  }
  if (value.length > maxLength) errors.push(`${label}_too_long`);
  return true;
}

function validateEnum(value, allowed, label, errors) {
  if (!allowed.includes(value)) errors.push(`${label}_invalid_enum`);
}

function validateSourceText(sourceText) {
  const source = String(sourceText || "");
  if (!source.trim()) throw new TypeError("insight_synthesis_source_text_required");
  if (source.length > SYNTHESIS_MAX_SOURCE_CHARS) {
    throw new RangeError(`insight_synthesis_source_text_too_long:${SYNTHESIS_MAX_SOURCE_CHARS}`);
  }
  return source;
}

function validateSemanticContext(input, sourceText) {
  const source = String(sourceText || "");
  const context = safeObject(input);
  if (!context) throw new TypeError("insight_synthesis_semantic_context_required");
  if (containsForbiddenKeys(context)) throw new TypeError("insight_synthesis_semantic_context_forbidden_data");
  const errors = [];
  exactKeys(context, ["entities", "concepts", "source_claims", "relations"], "semantic_context", errors);

  const entities = Array.isArray(context.entities) ? context.entities : [];
  const concepts = Array.isArray(context.concepts) ? context.concepts : [];
  const claims = Array.isArray(context.source_claims) ? context.source_claims : [];
  const relations = Array.isArray(context.relations) ? context.relations : [];
  if (!Array.isArray(context.entities)) errors.push("semantic_context_entities_not_array");
  if (!Array.isArray(context.concepts)) errors.push("semantic_context_concepts_not_array");
  if (!Array.isArray(context.source_claims)) errors.push("semantic_context_source_claims_not_array");
  if (!Array.isArray(context.relations)) errors.push("semantic_context_relations_not_array");
  if (entities.length > 16) errors.push("semantic_context_entities_too_many");
  if (concepts.length > 20) errors.push("semantic_context_concepts_too_many");
  if (claims.length > 16) errors.push("semantic_context_source_claims_too_many");
  if (relations.length > 20) errors.push("semantic_context_relations_too_many");

  entities.forEach((item, index) => {
    exactKeys(item, ["label", "entity_type"], `semantic_entity:${index}`, errors);
    validateText(item?.label, `semantic_entity:${index}:label`, errors, 180);
    validateText(item?.entity_type, `semantic_entity:${index}:entity_type`, errors, 40);
  });
  concepts.forEach((item, index) => {
    exactKeys(item, ["label"], `semantic_concept:${index}`, errors);
    validateText(item?.label, `semantic_concept:${index}:label`, errors, 180);
  });
  claims.forEach((item, index) => {
    exactKeys(item, ["text"], `semantic_claim:${index}`, errors);
    if (validateText(item?.text, `semantic_claim:${index}:text`, errors, 800) && !source.includes(item.text)) {
      errors.push(`semantic_claim:${index}:not_exact_source`);
    }
  });
  relations.forEach((item, index) => {
    exactKeys(item, ["relation_type", "from_label", "to_label", "epistemic_status"], `semantic_relation:${index}`, errors);
    validateEnum(item?.relation_type, RELATION_TYPES, `semantic_relation:${index}:relation_type`, errors);
    validateText(item?.from_label, `semantic_relation:${index}:from_label`, errors, 180);
    validateText(item?.to_label, `semantic_relation:${index}:to_label`, errors, 180);
    validateEnum(item?.epistemic_status, EPISTEMIC_VALUES, `semantic_relation:${index}:epistemic_status`, errors);
  });

  if (!claims.length) errors.push("semantic_context_source_claims_required");
  if (errors.length) {
    const error = new TypeError(`insight_synthesis_semantic_context_invalid:${errors.join(",")}`);
    error.validation = { ok: false, errors };
    throw error;
  }
  return JSON.parse(JSON.stringify(context));
}

function buildSynthesisInstruction() {
  return [
    `Du er AHA Interpretation / Insight Synthesis V2 (${SYNTHESIS_PROMPT_VERSION}). Returner bare data som passer JSON-schemaet.`,
    "SOURCE_TEXT er eneste evidensautoritet. SEMANTIC_CONTEXT er strukturhjelp, ikke selvstendig bevis.",
    "Ikke bruk tidligere interpretationer, assistant-svar, Meta, minne eller Chamber som råstoff.",
    "Målet er høyereordens forståelse: prinsipp, mekanisme, mønster, spenning, konsekvens eller generaliserbar forståelse.",
    "Et source-utdrag, en lett parafrase, en oppsummering av én setning eller en omdøpt source claim er IKKE en synthesized Insight.",
    "Hver kandidat må kombinere minst to distinkte ordrette evidence quotes fra SOURCE_TEXT og tilføre en tydelig semantisk transformasjon.",
    "Når context.deterministic_evidence_packets finnes, bruk pakkene som en deterministisk søkeplan for å dekke ulike deler av SOURCE_TEXT. Pakkene er ikke selvstendig bevis; evidence må fortsatt være ordrett i SOURCE_TEXT.",
    "Når context.authoritative_quality_retry finnes, rett hver oppgitt blocking_reason eksplisitt. Behold samme SOURCE_TEXT, samme terskler og samme evidensautoritet.",
    "Når SOURCE_TEXT har minst to distinkte source claims, søk etter 2–4 selvstendige kandidater som kan bestå porten hver for seg. Behold ett presist sentralt source-begrep på tvers der det er faglig riktig, men la kandidatene uttrykke ulike sekundære relasjoner, grenser eller konsekvenser. Ikke fyll kvoten med duplikater eller svake kandidater.",
    "Når authoritative_quality_retry.mode=projection_diversity_expansion, returner nye kandidater som utfyller covered_primary_types. Unngå excluded_primary_types, prioriter en source-støttet type fra preferred_primary_types, og ikke parafraser eller gjenta innsiktene i avoid_repeating_insights.",
    "abstraction skal kort forklare hva som er abstrahert eller koblet sammen utover de enkelte source claims.",
    "why_it_matters skal forklare hvorfor forståelsen er nyttig, ikke bare si at den er viktig.",
    "Foretrekk etablerte canonical concept-labels fra SEMANTIC_CONTEXT når de presist uttrykker forståelsen; unngå unødvendige synonymer som gjør betydningen mindre stabil.",
    "Når SOURCE_TEXT beskriver at en endring i koordinering eller beslutningsstruktur gjør lokale valg eller arbeid lettere samtidig som uenighet, feil eller koordineringspress samler seg ved grenser mellom ansvar, moduler eller team, skal insight eller abstraction navngi selve forskyvningen: hva som blir lettere og hvilken grense den nye spenningen konsentreres ved.",
    "Behold source-groundede boundary-begreper eksplisitt, for eksempel 'ansvarsgrenser', 'grensene mellom ansvarsområdene' eller konkrete modul-/teamgrensesnitt. Ikke generaliser dem bort til bare 'plasseringen av uenighet' eller 'konfliktlokalisering'. Når source bare viser før/etter eller samvariasjon, formuler dette som pattern eller tension uten kausal påstand; bruk interpretive + uncertainty bare dersom du uttrykkelig formulerer en mulig mekanisme.",
    "Vær særlig varsom med kausalitet. Co-occurrence, tidsrekkefølge, før/etter og flere samtidige observasjoner er ikke automatisk årsak.",
    "causal_status=source_explicit er bare tillatt når hele årsaksrelasjonen i selve synthesized insight er uttrykt eksplisitt i kandidatens evidence quotes, ikke bare én lokal delrelasjon et annet sted i SOURCE_TEXT.",
    "En mekanisme som kobler sammen flere source claims til en ny årsaksforklaring er interpretive selv om enkelte delrelasjoner er source-explicit.",
    "Når causal_status=interpretive må confidence være medium eller low og uncertainty må være ikke-tom og konkret beskrive hva source ikke beviser.",
    "Når causal_status=not_causal må selve insight-formuleringen også være ikke-kausal. Unngå uttrykk som 'fører ... til', 'skaper/skapes', 'gir', 'øker', 'reduserer', 'muliggjør', 'gjør at' og tilsvarende. Bruk heller 'samtidig som', 'opptrer sammen med', 'er forbundet med' eller en tydelig spenning/mønster-formulering.",
    "Hvis SOURCE_TEXT uttrykkelig sier at materialet ikke fastslår, peker ut eller identifiserer en årsak, skal kandidaten ikke bruke en kausal mekanisme. Velg pattern, tension eller generalization, sett causal_status=not_causal og gjør selve årsaksbegrensningen synlig i insight eller uncertainty.",
    "Ved observasjonelle før/etter-mønstre uten eksplisitt komplett kausalitet: foretrekk pattern eller tension. Hvis den mest nyttige forståelsen likevel er en mulig mekanisme, merk den interpretive med medium/low confidence og konkret uncertainty.",
    "Bruk uncertainty aktivt når evidensen begrenser generalisering, kausalitet eller rekkevidde. Tom streng er tillatt bare når ingen materiell usikkerhet må synliggjøres.",
    "Returner heller null kandidater enn svake, generiske, source-nære eller kausalt overtolkede kandidater.",
    "Ikke foreslå lagring, canonical write, Chamber-write eller Meta-write."
  ].join("\n");
}

function buildSynthesisResponsesRequest({ model, sourceText, semanticContext, context = {} } = {}) {
  const source = validateSourceText(sourceText);
  const semantic = validateSemanticContext(semanticContext, source);
  const requestContext = safeObject(context);
  if (!requestContext) throw new TypeError("insight_synthesis_context_must_be_object");
  if (containsForbiddenKeys(requestContext)) throw new TypeError("insight_synthesis_context_forbidden_data");
  const modelName = normalizeWhitespace(model);
  if (!modelName) throw new TypeError("insight_synthesis_model_required");
  const requirements = synthesisResponseRequirements({ context: requestContext, semanticContext: semantic });
  const responseSchema = JSON.parse(JSON.stringify(SYNTHESIS_JSON_SCHEMA));
  if (requirements.minimum_candidate_count > 0) {
    responseSchema.properties.candidates.minItems = requirements.minimum_candidate_count;
  }

  return {
    model: modelName,
    input: [
      { role: "system", content: buildSynthesisInstruction() },
      { role: "user", content: JSON.stringify({ contract: SYNTHESIS_CONTRACT, source_text: source, semantic_context: semantic, context: requestContext }) }
    ],
    text: {
      format: {
        type: "json_schema",
        name: SYNTHESIS_OUTPUT_SCHEMA,
        strict: true,
        schema: responseSchema
      }
    }
  };
}

function parseSynthesisPayload(raw) {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try { return parseSynthesisPayload(JSON.parse(trimmed)); }
    catch { return null; }
  }
  return safeObject(raw);
}

function validateSynthesisPayload(payloadInput, sourceText, requirementsInput = {}) {
  const source = String(sourceText || "");
  const payload = parseSynthesisPayload(payloadInput);
  const requirements = safeObject(requirementsInput) || {};
  const requestedMinimum = Number(requirements.minimum_candidate_count);
  const minimumCandidateCount = Number.isFinite(requestedMinimum)
    ? Math.max(0, Math.min(4, Math.trunc(requestedMinimum)))
    : 0;
  const errors = [];
  if (!payload) return { ok: false, errors: ["payload_not_object"] };
  if (!source.trim()) return { ok: false, errors: ["source_text_required"] };
  if (source.length > SYNTHESIS_MAX_SOURCE_CHARS) errors.push("source_text_too_long");
  if (containsForbiddenKeys(payload)) errors.push("forbidden_response_dependency");
  exactKeys(payload, ["schema", "candidates"], "payload", errors);
  if (payload.schema !== SYNTHESIS_OUTPUT_SCHEMA) errors.push("invalid_schema");
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  if (!Array.isArray(payload.candidates)) errors.push("candidates_not_array");
  if (candidates.length > 5) errors.push("candidates_too_many");
  if (minimumCandidateCount > 0 && candidates.length < minimumCandidateCount) {
    errors.push(`candidates_below_requested_minimum:${minimumCandidateCount}`);
  }

  candidates.forEach((candidate, index) => {
    const label = `candidate:${index}`;
    exactKeys(candidate, ["insight", "type", "abstraction", "evidence", "why_it_matters", "confidence", "uncertainty", "causal_status"], label, errors);
    validateText(candidate?.insight, `${label}:insight`, errors, 600);
    validateEnum(candidate?.type, INSIGHT_TYPES, `${label}:type`, errors);
    validateText(candidate?.abstraction, `${label}:abstraction`, errors, 400);
    validateText(candidate?.why_it_matters, `${label}:why_it_matters`, errors, 400);
    validateEnum(candidate?.confidence, CONFIDENCE_VALUES, `${label}:confidence`, errors);
    validateText(candidate?.uncertainty, `${label}:uncertainty`, errors, 320, true);
    validateEnum(candidate?.causal_status, CAUSAL_STATUS_VALUES, `${label}:causal_status`, errors);

    const insight = typeof candidate?.insight === "string" ? candidate.insight : "";
    if (insight && source.includes(insight)) errors.push(`${label}:insight_is_literal_source`);
    const evidence = Array.isArray(candidate?.evidence) ? candidate.evidence : [];
    if (!Array.isArray(candidate?.evidence) || evidence.length < 2 || evidence.length > 3) {
      errors.push(`${label}:evidence_count_invalid`);
    }
    const seenQuotes = new Set();
    evidence.forEach((item, evidenceIndex) => {
      const evidenceLabel = `${label}:evidence:${evidenceIndex}`;
      exactKeys(item, ["quote", "role"], evidenceLabel, errors);
      validateText(item?.quote, `${evidenceLabel}:quote`, errors, 420);
      validateEnum(item?.role, EVIDENCE_ROLE_VALUES, `${evidenceLabel}:role`, errors);
      if (typeof item?.quote === "string" && item.quote && !source.includes(item.quote)) {
        errors.push(`${evidenceLabel}:quote_not_in_source`);
      }
      const key = normalizeForComparison(item?.quote);
      if (key && seenQuotes.has(key)) errors.push(`${evidenceLabel}:duplicate_quote`);
      if (key) seenQuotes.add(key);
      if (insight && key && normalizeForComparison(insight) === key) errors.push(`${label}:insight_equals_evidence`);
    });

    const causalStatus = String(candidate?.causal_status || "");
    const confidence = String(candidate?.confidence || "");
    const uncertainty = String(candidate?.uncertainty || "").trim();
    const usesCausalLanguage = CAUSAL_LANGUAGE.test(insight);
    const evidenceHasExplicitCausality = evidence.some((item) => EXPLICIT_CAUSAL_SOURCE.test(String(item?.quote || "")));
    const sourceRejectsSimpleCausality = ANTI_CAUSAL_SOURCE.test(source);

    if (causalStatus === "interpretive") {
      if (confidence === "high") errors.push(`${label}:interpretive_causality_confidence_must_not_be_high`);
      if (!uncertainty) errors.push(`${label}:interpretive_causality_uncertainty_required`);
    }
    if (causalStatus === "not_causal" && usesCausalLanguage) {
      errors.push(`${label}:not_causal_contains_causal_language`);
    }
    if (causalStatus === "source_explicit" && !evidenceHasExplicitCausality) {
      errors.push(`${label}:source_explicit_causality_not_in_evidence`);
    }
    if (sourceRejectsSimpleCausality && (causalStatus !== "not_causal" || usesCausalLanguage)) {
      errors.push(`${label}:causal_claim_contradicts_source_limitation`);
    }
  });

  return { ok: errors.length === 0, errors };
}

function requireValidSynthesisPayload(payloadInput, sourceText, requirements = {}) {
  const payload = parseSynthesisPayload(payloadInput);
  const validation = validateSynthesisPayload(payload, sourceText, requirements);
  if (!validation.ok) {
    const error = new Error(`insight_synthesis_validation_failed:${validation.errors.join(",")}`);
    error.code = "insight_synthesis_validation_failed";
    error.validation = validation;
    throw error;
  }
  return JSON.parse(JSON.stringify(payload));
}

function buildSynthesisResponseEnvelope({ synthesis, model, responseId } = {}) {
  if (!safeObject(synthesis)) throw new TypeError("insight_synthesis_payload_required");
  return {
    ok: true,
    schema: SYNTHESIS_CONTRACT,
    synthesis: JSON.parse(JSON.stringify(synthesis)),
    model: normalizeWhitespace(model) || null,
    response_id: normalizeWhitespace(responseId) || null,
    policy: {
      source_text_returned: false,
      raw_model_output_returned: false,
      shadow_synthesis_generated: true,
      production_gate_authority: false,
      synthesis_allowed: false,
      canonical_write: false,
      chamber_write: false,
      persistent_write: false,
      meta_write: false
    }
  };
}

export {
  SYNTHESIS_OUTPUT_SCHEMA,
  SYNTHESIS_CONTRACT,
  SYNTHESIS_PROMPT_VERSION,
  SYNTHESIS_MAX_SOURCE_CHARS,
  SYNTHESIS_JSON_SCHEMA,
  INSIGHT_TYPES,
  buildSynthesisInstruction,
  synthesisResponseRequirements,
  buildSynthesisResponsesRequest,
  parseSynthesisPayload,
  validateSynthesisPayload,
  requireValidSynthesisPayload,
  validateSemanticContext,
  buildSynthesisResponseEnvelope
};
