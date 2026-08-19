// server/ahaSemanticModelContract.js
// Pure contract for source-direct semantic model analysis in the AHA agent backend.
// No network, storage, canonical write, Meta write, or synthesized Insight write.

const SEMANTIC_MODEL_SCHEMA = "aha_semantic_model_output_v1";
const SEMANTIC_MODEL_CONTRACT = "aha_semantic_model_contract_v1";
const SEMANTIC_MODEL_MAX_SOURCE_CHARS = 8000;
const CONFIDENCE_VALUES = Object.freeze(["high", "medium", "low"]);
const ENTITY_TYPE_VALUES = Object.freeze(["person", "organization", "place", "work", "event", "other"]);
const PROPOSITION_KIND_VALUES = Object.freeze(["source_claim", "interpretation", "inference"]);
const RELATION_TYPE_VALUES = Object.freeze([
  "associated_with",
  "part_of",
  "influences",
  "causes",
  "supports",
  "contradicts",
  "explains",
  "precedes",
  "other"
]);
const RELATION_EPISTEMIC_VALUES = Object.freeze(["source_explicit", "interpretation", "inference"]);
const FORBIDDEN_RESPONSE_KEYS = Object.freeze(new Set([
  "assistantreply",
  "assistant_reply",
  "chatresponse",
  "chat_response",
  "airesponse",
  "ai_response",
  "modelresponse",
  "model_response",
  "candidate_insights",
  "candidateinsights",
  "meta_profile",
  "metaprofile"
]));

const evidenceQuotesSchema = Object.freeze({
  type: "array",
  minItems: 1,
  maxItems: 3,
  items: { type: "string", minLength: 1, maxLength: 320 }
});

const SEMANTIC_MODEL_JSON_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["schema", "entities", "concepts", "propositions", "relations", "unresolved_inferences"],
  properties: {
    schema: { type: "string", enum: [SEMANTIC_MODEL_SCHEMA] },
    entities: {
      type: "array",
      maxItems: 16,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["source_surface", "canonical_label", "entity_type", "evidence_quotes", "confidence"],
        properties: {
          source_surface: { type: "string", minLength: 1, maxLength: 180 },
          canonical_label: { type: "string", minLength: 1, maxLength: 180 },
          entity_type: { type: "string", enum: ENTITY_TYPE_VALUES.slice() },
          evidence_quotes: evidenceQuotesSchema,
          confidence: { type: "string", enum: CONFIDENCE_VALUES.slice() }
        }
      }
    },
    concepts: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["source_surface", "canonical_label", "evidence_quotes", "confidence"],
        properties: {
          source_surface: { type: "string", minLength: 1, maxLength: 180 },
          canonical_label: { type: "string", minLength: 1, maxLength: 180 },
          evidence_quotes: evidenceQuotesSchema,
          confidence: { type: "string", enum: CONFIDENCE_VALUES.slice() }
        }
      }
    },
    propositions: {
      type: "array",
      maxItems: 16,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "text", "evidence_quotes", "confidence"],
        properties: {
          kind: { type: "string", enum: PROPOSITION_KIND_VALUES.slice() },
          text: { type: "string", minLength: 1, maxLength: 800 },
          evidence_quotes: evidenceQuotesSchema,
          confidence: { type: "string", enum: CONFIDENCE_VALUES.slice() }
        }
      }
    },
    relations: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["relation_type", "from_label", "to_label", "epistemic_status", "evidence_quotes", "confidence"],
        properties: {
          relation_type: { type: "string", enum: RELATION_TYPE_VALUES.slice() },
          from_label: { type: "string", minLength: 1, maxLength: 180 },
          to_label: { type: "string", minLength: 1, maxLength: 180 },
          epistemic_status: { type: "string", enum: RELATION_EPISTEMIC_VALUES.slice() },
          evidence_quotes: evidenceQuotesSchema,
          confidence: { type: "string", enum: CONFIDENCE_VALUES.slice() }
        }
      }
    },
    unresolved_inferences: {
      type: "array",
      maxItems: 10,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "evidence_quotes", "confidence"],
        properties: {
          text: { type: "string", minLength: 1, maxLength: 800 },
          evidence_quotes: evidenceQuotesSchema,
          confidence: { type: "string", enum: CONFIDENCE_VALUES.slice() }
        }
      }
    }
  }
});

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function containsForbiddenResponseKeys(value) {
  const visit = (item) => {
    if (!item || typeof item !== "object") return false;
    for (const [key, nested] of Object.entries(item)) {
      if (FORBIDDEN_RESPONSE_KEYS.has(String(key || "").toLowerCase())) return true;
      if (visit(nested)) return true;
    }
    return false;
  };
  return visit(value);
}

function buildSemanticModelInstruction() {
  return [
    "Du er AHA Semantic Model V1. Returner bare data som passer det oppgitte JSON-schemaet.",
    "SOURCE_TEXT er eneste evidensautoritet. Bruk aldri et brukerrettet chat-svar, assistant response eller modellens tidligere formulering som kildebelegg.",
    "Hver entity og concept må ha source_surface som finnes ordrett i SOURCE_TEXT, og minst ett kort evidence_quote som finnes ordrett i SOURCE_TEXT.",
    "source_claim betyr at proposition.text selv må finnes ordrett i SOURCE_TEXT. Ikke parafraser source_claim.",
    "interpretation og inference kan formulere en analyse, men må merkes eksplisitt og bindes til ordrette evidence_quotes fra SOURCE_TEXT.",
    "Relasjoner må ha epistemic_status. Ikke presenter co-occurrence som årsak, støtte, motsetning eller påvirkning uten at typen og evidensen forsvarer det.",
    "unresolved_inferences er spørsmål eller antakelser som ikke bør behandles som etablert source-sannhet. De må fortsatt ha ordrett evidence.",
    "Ikke produser candidate_insights, Meta-profil, brukerrettet svar, anbefalinger om lagring eller annen produkt-output.",
    "Ikke gjengi lange utdrag. Evidence quotes skal være korte og minimale."
  ].join("\n");
}

function validateSourceText(sourceText) {
  const source = String(sourceText || "");
  if (!source.trim()) throw new TypeError("semantic_model_source_text_required");
  if (source.length > SEMANTIC_MODEL_MAX_SOURCE_CHARS) {
    throw new RangeError(`semantic_model_source_text_too_long:${SEMANTIC_MODEL_MAX_SOURCE_CHARS}`);
  }
  return source;
}

function buildSemanticModelResponsesRequest({ model, sourceText, context = {} } = {}) {
  const source = validateSourceText(sourceText);
  const contextObject = safeObject(context);
  if (!contextObject) throw new TypeError("semantic_model_context_must_be_object");
  if (containsForbiddenResponseKeys(contextObject)) throw new TypeError("semantic_model_context_contains_response_data");
  const modelName = normalizeWhitespace(model);
  if (!modelName) throw new TypeError("semantic_model_model_required");

  return {
    model: modelName,
    input: [
      { role: "system", content: buildSemanticModelInstruction() },
      {
        role: "user",
        content: JSON.stringify({
          contract: SEMANTIC_MODEL_CONTRACT,
          source_text: source,
          context: contextObject
        })
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: SEMANTIC_MODEL_SCHEMA,
        strict: true,
        schema: SEMANTIC_MODEL_JSON_SCHEMA
      }
    }
  };
}

function parseSemanticModelPayload(raw) {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    try { return parseSemanticModelPayload(JSON.parse(trimmed)); }
    catch { return null; }
  }
  return safeObject(raw);
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

function validateText(value, label, errors, maxLength) {
  if (typeof value !== "string" || !value.trim()) {
    errors.push(`${label}_invalid_text`);
    return false;
  }
  if (value.length > maxLength) errors.push(`${label}_too_long`);
  return true;
}

function validateEnum(value, allowed, label, errors) {
  if (!allowed.includes(value)) errors.push(`${label}_invalid_enum`);
}

function validateEvidenceQuotes(quotes, source, label, errors) {
  if (!Array.isArray(quotes) || quotes.length < 1 || quotes.length > 3) {
    errors.push(`${label}_invalid_evidence_quotes`);
    return;
  }
  quotes.forEach((quote, index) => {
    if (typeof quote !== "string" || !quote.trim() || quote.length > 320) {
      errors.push(`${label}_invalid_evidence_quote:${index}`);
      return;
    }
    if (!source.includes(quote)) errors.push(`${label}_evidence_not_in_source:${index}`);
  });
}

function validateItemArray(payload, key, maxItems, errors) {
  const list = payload[key];
  if (!Array.isArray(list)) {
    errors.push(`${key}_not_array`);
    return [];
  }
  if (list.length > maxItems) errors.push(`${key}_too_many_items`);
  return list;
}

function validateSemanticModelPayload(payloadInput, sourceText) {
  const source = String(sourceText || "");
  const errors = [];
  const payload = parseSemanticModelPayload(payloadInput);
  if (!payload) return { ok: false, errors: ["payload_not_object"] };
  if (!source.trim()) return { ok: false, errors: ["source_text_required"] };
  if (source.length > SEMANTIC_MODEL_MAX_SOURCE_CHARS) errors.push("source_text_too_long");
  if (containsForbiddenResponseKeys(payload)) errors.push("forbidden_response_dependency");

  exactKeys(
    payload,
    ["schema", "entities", "concepts", "propositions", "relations", "unresolved_inferences"],
    "payload",
    errors
  );
  if (payload.schema !== SEMANTIC_MODEL_SCHEMA) errors.push("invalid_schema");

  const entities = validateItemArray(payload, "entities", 16, errors);
  entities.forEach((item, index) => {
    const label = `entity:${index}`;
    exactKeys(item, ["source_surface", "canonical_label", "entity_type", "evidence_quotes", "confidence"], label, errors);
    validateText(item?.source_surface, `${label}:source_surface`, errors, 180);
    validateText(item?.canonical_label, `${label}:canonical_label`, errors, 180);
    validateEnum(item?.entity_type, ENTITY_TYPE_VALUES, `${label}:entity_type`, errors);
    validateEnum(item?.confidence, CONFIDENCE_VALUES, `${label}:confidence`, errors);
    if (typeof item?.source_surface === "string" && item.source_surface && !source.includes(item.source_surface)) {
      errors.push(`${label}:source_surface_not_in_source`);
    }
    validateEvidenceQuotes(item?.evidence_quotes, source, label, errors);
  });

  const concepts = validateItemArray(payload, "concepts", 20, errors);
  concepts.forEach((item, index) => {
    const label = `concept:${index}`;
    exactKeys(item, ["source_surface", "canonical_label", "evidence_quotes", "confidence"], label, errors);
    validateText(item?.source_surface, `${label}:source_surface`, errors, 180);
    validateText(item?.canonical_label, `${label}:canonical_label`, errors, 180);
    validateEnum(item?.confidence, CONFIDENCE_VALUES, `${label}:confidence`, errors);
    if (typeof item?.source_surface === "string" && item.source_surface && !source.includes(item.source_surface)) {
      errors.push(`${label}:source_surface_not_in_source`);
    }
    validateEvidenceQuotes(item?.evidence_quotes, source, label, errors);
  });

  const propositions = validateItemArray(payload, "propositions", 16, errors);
  propositions.forEach((item, index) => {
    const label = `proposition:${index}`;
    exactKeys(item, ["kind", "text", "evidence_quotes", "confidence"], label, errors);
    validateEnum(item?.kind, PROPOSITION_KIND_VALUES, `${label}:kind`, errors);
    validateText(item?.text, `${label}:text`, errors, 800);
    validateEnum(item?.confidence, CONFIDENCE_VALUES, `${label}:confidence`, errors);
    validateEvidenceQuotes(item?.evidence_quotes, source, label, errors);
    if (item?.kind === "source_claim" && typeof item?.text === "string" && item.text && !source.includes(item.text)) {
      errors.push(`${label}:source_claim_text_not_in_source`);
    }
  });

  const relations = validateItemArray(payload, "relations", 20, errors);
  relations.forEach((item, index) => {
    const label = `relation:${index}`;
    exactKeys(item, ["relation_type", "from_label", "to_label", "epistemic_status", "evidence_quotes", "confidence"], label, errors);
    validateEnum(item?.relation_type, RELATION_TYPE_VALUES, `${label}:relation_type`, errors);
    validateText(item?.from_label, `${label}:from_label`, errors, 180);
    validateText(item?.to_label, `${label}:to_label`, errors, 180);
    validateEnum(item?.epistemic_status, RELATION_EPISTEMIC_VALUES, `${label}:epistemic_status`, errors);
    validateEnum(item?.confidence, CONFIDENCE_VALUES, `${label}:confidence`, errors);
    validateEvidenceQuotes(item?.evidence_quotes, source, label, errors);
  });

  const unresolved = validateItemArray(payload, "unresolved_inferences", 10, errors);
  unresolved.forEach((item, index) => {
    const label = `unresolved_inference:${index}`;
    exactKeys(item, ["text", "evidence_quotes", "confidence"], label, errors);
    validateText(item?.text, `${label}:text`, errors, 800);
    validateEnum(item?.confidence, CONFIDENCE_VALUES, `${label}:confidence`, errors);
    validateEvidenceQuotes(item?.evidence_quotes, source, label, errors);
  });

  return { ok: errors.length === 0, errors };
}

function requireValidSemanticModelPayload(payloadInput, sourceText) {
  const payload = parseSemanticModelPayload(payloadInput);
  const validation = validateSemanticModelPayload(payload, sourceText);
  if (!validation.ok) {
    const error = new Error(`semantic_model_validation_failed:${validation.errors.join(",")}`);
    error.code = "semantic_model_validation_failed";
    error.validation = validation;
    throw error;
  }
  return JSON.parse(JSON.stringify(payload));
}

function buildSemanticModelResponseEnvelope({ analysis, model, responseId } = {}) {
  if (!safeObject(analysis)) throw new TypeError("semantic_model_analysis_required");
  return {
    ok: true,
    schema: SEMANTIC_MODEL_CONTRACT,
    analysis: JSON.parse(JSON.stringify(analysis)),
    model: normalizeWhitespace(model) || null,
    response_id: normalizeWhitespace(responseId) || null,
    policy: {
      source_text_returned: false,
      canonical_write: false,
      persistent_write: false,
      meta_write: false,
      synthesis_allowed: false
    }
  };
}

export {
  SEMANTIC_MODEL_SCHEMA,
  SEMANTIC_MODEL_CONTRACT,
  SEMANTIC_MODEL_MAX_SOURCE_CHARS,
  SEMANTIC_MODEL_JSON_SCHEMA,
  buildSemanticModelInstruction,
  buildSemanticModelResponsesRequest,
  parseSemanticModelPayload,
  validateSemanticModelPayload,
  requireValidSemanticModelPayload,
  buildSemanticModelResponseEnvelope
};
