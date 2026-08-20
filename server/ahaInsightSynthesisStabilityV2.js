// ahaInsightSynthesisStabilityV2.js
// Shadow-only stability policy for Interpretation / Insight Synthesis V2.
// Keeps synthesis fail-closed while reducing stochastic semantic drift.

const MAX_VALIDATION_ATTEMPTS = 4;
const SYNTHESIS_TEMPERATURE = 0.2;

const STABILITY_INSTRUCTION = [
  "STABILITY POLICY FOR SYNTHESIS V2:",
  "Bevar sentrale source-/canonical-begreper i insight og abstraction. Når SOURCE_TEXT eller SEMANTIC_CONTEXT allerede har et presist nøkkelbegrep, bruk dette begrepet eller en svært nær bøyningsvariant i stedet for et løsere synonym.",
  "Evidence må dekke hver hovedside av syntesen. Hvis insight kobler en metode/struktur med et observert resultat eller en begrensning, velg evidence quotes som eksplisitt dekker begge sidene; ikke utelat source-setningen som bærer et sentralt begrep.",
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

  return { ok: errors.length === 0, errors };
}

function retryInstruction(validationErrors = []) {
  const errors = Array.isArray(validationErrors) ? validationErrors.map(String).filter(Boolean) : [];
  return [
    "PREVIOUS SYNTHESIS ATTEMPT FAILED VALIDATION. Rewrite from SOURCE_TEXT; do not defend the prior wording.",
    `Validation failures: ${errors.join(" | ") || "unspecified_validation_failure"}`,
    "Preserve central source/canonical terms, include evidence for every major side of the synthesis, default pattern/tension/generalization to not_causal, and preserve any explicit causal limitation using the source's operative wording."
  ].join("\n");
}

function addRetryInstruction(requestInput, validationErrors) {
  const request = clone(requestInput) || {};
  const input = Array.isArray(request.input) ? request.input : [];
  const firstSystem = input.find((item) => item && item.role === "system" && typeof item.content === "string");
  if (firstSystem) firstSystem.content = `${firstSystem.content}\n${retryInstruction(validationErrors)}`;
  return request;
}

export {
  MAX_VALIDATION_ATTEMPTS,
  SYNTHESIS_TEMPERATURE,
  STABILITY_INSTRUCTION,
  applyStabilityRequestPolicy,
  validateStabilitySynthesis,
  retryInstruction,
  addRetryInstruction
};
