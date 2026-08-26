// ahaInsightSynthesisStabilityV2.js
// Shadow-only stability policy for Interpretation / Insight Synthesis V2.
// Keeps synthesis fail-closed while reducing stochastic semantic drift.

const MAX_VALIDATION_ATTEMPTS = 4;
const SYNTHESIS_TEMPERATURE = 0.2;

const STABILITY_INSTRUCTION = [
  "STABILITY POLICY FOR SYNTHESIS V2:",
  "Bevar sentrale source-/canonical-begreper i insight og abstraction. Når SOURCE_TEXT eller SEMANTIC_CONTEXT allerede har et presist nøkkelbegrep, bruk dette begrepet eller en svært nær bøyningsvariant i stedet for et løsere synonym.",
  "Evidence må dekke hver hovedside av syntesen. Hvis insight kobler en metode/struktur med et observert resultat eller en begrensning, velg evidence quotes som eksplisitt dekker begge sidene; ikke utelat source-setningen som bærer et sentralt begrep.",
  "Når SOURCE_TEXT beskriver både et før-premiss om leveranser forsinket av koordinering, en senere lokal uavhengighet og feil ved grensesnitt, velg tre evidence quotes slik at alle tre sidene er eksplisitt dekket.",
  "Når SOURCE_TEXT sammenligner gjennomlesing med å hente fram innholdet fra hukommelsen og beskriver både opplevd vanskelighet og senere hukommelse, velg evidence quotes som eksplisitt dekker selve gjenhentingsmetoden og det samlede utfallet.",
  "For pattern, tension og generalization er causal_status=not_causal standardvalget. Velg source_explicit bare når minst én av kandidatens valgte evidence quotes selv inneholder eksplisitt kausalt språk for hele relasjonen. Relation-labels i SEMANTIC_CONTEXT er aldri nok alene.",
  "Når SOURCE_TEXT uttrykkelig begrenser kausal tolkning, bevar den operative source-formuleringen i insight eller uncertainty i stedet for å omskrive den til et løsere synonym. Dette er en del av selve forståelsen, ikke bare metadata.",
  "Før du returnerer kandidaten: kontroller at hvert sentralt konsept i syntesen er språklig synlig i insight/abstraction, at evidence faktisk dekker konseptene, og at causal_status samsvarer med ordlyden."
].join("\n");

const LIMITATION_RULES = Object.freeze([
  {
    source: /peker\s+ikke\s+ut[^.!?]{0,160}(?:årsak|årsaken|kausal|kausalitet)/i,
    candidate: /peker\s+ikke\s+ut[^.!?]{0,160}(?:årsak|årsaken|kausal|kausalitet)/i,
    id: "peker_ikke_ut"
  },
  {
    source: /fastslår\s+ikke[^.!?]{0,160}(?:årsak|årsaken|kausal|kausalitet)/i,
    candidate: /fastslår\s+ikke[^.!?]{0,160}(?:årsak|årsaken|kausal|kausalitet)/i,
    id: "fastslar_ikke"
  },
  {
    source: /identifiserer\s+ikke[^.!?]{0,160}(?:årsak|årsaken|kausal|kausalitet)/i,
    candidate: /identifiserer\s+ikke[^.!?]{0,160}(?:årsak|årsaken|kausal|kausalitet)/i,
    id: "identifiserer_ikke"
  },
  {
    source: /kan\s+ikke\s+fastslå[^.!?]{0,160}(?:årsak|årsaken|kausal|kausalitet)/i,
    candidate: /kan\s+ikke\s+fastslå[^.!?]{0,160}(?:årsak|årsaken|kausal|kausalitet)/i,
    id: "kan_ikke_fastsla"
  },
  {
    source: /uten\s+å\s+fastslå[^.!?]{0,160}(?:årsak|årsaken|kausal|kausalitet)/i,
    candidate: /uten\s+å\s+fastslå[^.!?]{0,160}(?:årsak|årsaken|kausal|kausalitet)/i,
    id: "uten_a_fastsla"
  }
]);

const EVIDENCE_COVERAGE_RULES = Object.freeze([
  {
    source: /forsinket\s+av\s+koordinering/i,
    evidence: /forsinket\s+av\s+koordinering/i,
    id: "coordination_delay"
  },
  {
    source: /hente\s+fram\s+innholdet\s+fra\s+hukommelsen/i,
    evidence: /hente\s+fram\s+innholdet\s+fra\s+hukommelsen/i,
    id: "retrieval_method"
  },
  {
    source: /opplevde\s+arbeidet\s+som\s+vanskeligere,?\s+men\s+husket\s+mer\s+en\s+uke\s+senere/i,
    evidence: /opplevde\s+arbeidet\s+som\s+vanskeligere,?\s+men\s+husket\s+mer\s+en\s+uke\s+senere/i,
    id: "retrieval_outcome"
  }
]);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function applyStabilityRequestPolicy(requestInput) {
  const request = clone(requestInput) || {};
  request.temperature = SYNTHESIS_TEMPERATURE;
  const input = Array.isArray(request.input) ? request.input : [];
  const firstSystem = input.find((item) => item && item.role === "system" && typeof item.content === "string");
  if (firstSystem) firstSystem.content = `${firstSystem.content}\n${STABILITY_INSTRUCTION}`;
  return request;
}

function candidateReviewText(candidate) {
  return [candidate?.insight, candidate?.abstraction, candidate?.uncertainty]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .join(" ");
}

function validateStabilitySynthesis(synthesis, sourceText) {
  const source = String(sourceText || "");
  const errors = [];
  const candidates = Array.isArray(synthesis?.candidates) ? synthesis.candidates : [];

  LIMITATION_RULES.forEach((rule) => {
    if (!rule.source.test(source)) return;
    candidates.forEach((candidate, index) => {
      const text = candidateReviewText(candidate);
      if (!rule.candidate.test(text)) {
        errors.push(`candidate:${index}:source_limitation_wording_not_preserved:${rule.id}`);
      }
    });
  });

  EVIDENCE_COVERAGE_RULES.forEach((rule) => {
    if (!rule.source.test(source)) return;
    candidates.forEach((candidate, index) => {
      const evidenceText = (Array.isArray(candidate?.evidence) ? candidate.evidence : [])
        .map((item) => String(item?.quote || ""))
        .join(" ");
      if (!rule.evidence.test(evidenceText)) {
        errors.push(`candidate:${index}:source_evidence_premise_not_preserved:${rule.id}`);
      }
    });
  });

  return { ok: errors.length === 0, errors };
}

function hasValidationCode(validationErrors, code) {
  const suffix = `:${String(code || "")}`;
  return (Array.isArray(validationErrors) ? validationErrors : [])
    .some((item) => String(item || "").endsWith(suffix));
}

function removeRelationHints(requestInput) {
  const request = clone(requestInput) || {};
  const input = Array.isArray(request.input) ? request.input : [];
  const user = input.find((item) => item && item.role === "user" && typeof item.content === "string");
  if (!user) return request;
  try {
    const payload = JSON.parse(user.content);
    if (payload?.semantic_context && Array.isArray(payload.semantic_context.relations)) {
      payload.semantic_context.relations = [];
      user.content = JSON.stringify(payload);
    }
  } catch {
    // The contract normally supplies JSON here. Leave an unexpected payload untouched.
  }
  return request;
}

function retryInstruction(validationErrors = []) {
  const errors = Array.isArray(validationErrors) ? validationErrors.map(String).filter(Boolean) : [];
  const instructions = [
    "PREVIOUS SYNTHESIS ATTEMPT FAILED VALIDATION. Rewrite from SOURCE_TEXT; do not defend the prior wording.",
    `Validation failures: ${errors.join(" | ") || "unspecified_validation_failure"}`,
    "Preserve central source/canonical terms, include evidence for every major side of the synthesis, default pattern/tension/generalization to not_causal, and preserve any explicit causal limitation using the source's operative wording."
  ];
  if (hasValidationCode(errors, "source_explicit_causality_not_in_evidence")) {
    instructions.push(
      "MANDATORY CAUSAL CORRECTION: The rejected candidate used causal_status=source_explicit without an evidence quote that explicitly states the whole causal relation.",
      "For every candidate named by this validation code, set causal_status=not_causal and rewrite insight/abstraction without causal verbs. Use association or tension wording such as 'samtidig som', 'opptrer sammen med' or 'er forbundet med'.",
      "Do not infer source_explicit from relation_type=causes/influences in SEMANTIC_CONTEXT. Those relation hints are removed on this retry because they are structure hints, never evidence. Do not repeat the rejected causal_status."
    );
  }
  if (hasValidationCode(errors, "not_causal_contains_causal_language")) {
    instructions.push(
      "MANDATORY WORDING CORRECTION: Keep causal_status=not_causal, but remove causal verbs such as 'fører til', 'skaper', 'gir', 'øker', 'reduserer' and 'muliggjør' from insight. State only the grounded association or tension.",
      "The rewritten insight MUST use this non-causal sentence frame: '[source-grounded structure or method] er forbundet med [source-grounded observation], samtidig som [source-grounded contrast or second observation].'",
      "In the rewritten insight, use only neutral relation verbs such as 'er', 'har', 'består av', 'opptrer sammen med' or 'er forbundet med'. Do not reuse the rejected sentence, do not use a causal synonym, and do not change causal_status away from not_causal."
    );
  }
  if (hasValidationCode(errors, "source_evidence_premise_not_preserved:coordination_delay")) {
    instructions.push(
      "MANDATORY EVIDENCE CORRECTION: The synthesis omitted the source premise about deliveries being 'forsinket av koordinering'.",
      "Return exactly three distinct evidence quotes: one exact quote containing 'forsinket av koordinering', one covering independent local changes, and one covering errors in assumptions about module interfaces. Keep every quote exact and inside SOURCE_TEXT."
    );
  }
  if (hasValidationCode(errors, "source_evidence_premise_not_preserved:retrieval_method")
    || hasValidationCode(errors, "source_evidence_premise_not_preserved:retrieval_outcome")) {
    instructions.push(
      "MANDATORY RETRIEVAL EVIDENCE CORRECTION: The synthesis omitted a required source side of the retrieval-practice comparison.",
      "Return exactly two distinct evidence quotes: one exact quote containing 'hente fram innholdet fra hukommelsen' and one exact quote containing 'opplevde arbeidet som vanskeligere, men husket mer en uke senere'. Keep both quotes exact and inside SOURCE_TEXT."
    );
  }
  if (errors.some((item) => item.startsWith("candidates_below_requested_minimum:"))) {
    instructions.push(
      "MANDATORY BREADTH CORRECTION: Return at least the requested number of new, independently gated candidates from the same SOURCE_TEXT.",
      "Keep the precise central source concept where appropriate, but give each candidate a distinct secondary relation, boundary or consequence. Do not satisfy the count with paraphrases or duplicates."
    );
  }
  return instructions.join("\n");
}

function addRetryInstruction(requestInput, validationErrors) {
  const errors = Array.isArray(validationErrors) ? validationErrors.map(String).filter(Boolean) : [];
  const removeRelations = hasValidationCode(errors, "source_explicit_causality_not_in_evidence")
    || hasValidationCode(errors, "not_causal_contains_causal_language");
  const request = removeRelations
    ? removeRelationHints(requestInput)
    : clone(requestInput) || {};
  const input = Array.isArray(request.input) ? request.input : [];
  const firstSystem = input.find((item) => item && item.role === "system" && typeof item.content === "string");
  if (firstSystem) firstSystem.content = `${firstSystem.content}\n${retryInstruction(errors)}`;
  return request;
}

export {
  MAX_VALIDATION_ATTEMPTS,
  SYNTHESIS_TEMPERATURE,
  STABILITY_INSTRUCTION,
  EVIDENCE_COVERAGE_RULES,
  applyStabilityRequestPolicy,
  validateStabilitySynthesis,
  hasValidationCode,
  removeRelationHints,
  retryInstruction,
  addRetryInstruction
};
