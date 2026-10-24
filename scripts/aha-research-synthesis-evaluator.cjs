// Read-only, source-specific evaluation for short, attributed research excerpts.
// A grounded quote is not proof that an interpretation is scientifically correct.
const crypto = require("node:crypto");
const { pathToFileURL } = require("node:url");
const path = require("node:path");

function sourceText(item) {
  if (!item || typeof item.observation !== "string" || typeof item.limitation !== "string")
    throw new TypeError("research_excerpt_invalid");
  return item.observation + "\n" + item.limitation;
}
function fingerprint(value) {
  return "sha256:" + crypto.createHash("sha256").update(value, "utf8").digest("hex");
}
function wordMatch(haystack, needle) {
  return String(haystack || "").toLocaleLowerCase("en").includes(String(needle || "").toLocaleLowerCase("en"));
}
async function evaluateResearchSynthesis(item, synthesis) {
  const source = sourceText(item);
  const { validateSynthesisPayload } = await import(
    pathToFileURL(path.resolve(__dirname, "../server/ahaInsightSynthesisContractV2.js")).href
  );
  if (synthesis?.schema !== "aha_insight_synthesis_output_v2" || !Array.isArray(synthesis?.candidates))
    throw new TypeError("research_synthesis_missing_contract");
  const candidateResults = [];
  for (const candidate of synthesis.candidates) {
    const data = { schema: "aha_insight_synthesis_output_v2", candidates: [candidate] };
    const validation = validateSynthesisPayload(data, source);
    const evidence = Array.isArray(candidate?.evidence) ? candidate.evidence : [];
    const exactEvidenceCount = evidence.filter((entry) => typeof entry?.quote === "string"
      && entry.quote.length > 0 && source.includes(entry.quote)).length;
    const topicText = [candidate?.insight, candidate?.abstraction, candidate?.why_it_matters]
      .filter(Boolean).join(" ");
    const topicMatches = (Array.isArray(item.topic_terms) ? item.topic_terms : [])
      .filter((term) => wordMatch(topicText, term));
    const sourceLimitationCited = evidence.some((entry) => entry?.role === "limits"
      && typeof entry?.quote === "string" && item.limitation.includes(entry.quote));
    const uncertain = String(candidate?.uncertainty || "").trim().length > 0;
    const causalOverreach = validation.errors.some((error) =>
      error.includes("causal_claim_contradicts_source_limitation") ||
      error.includes("source_explicit_causality_not_in_evidence") ||
      error.includes("not_causal_contains_causal_language"));
    candidateResults.push({
      insight: String(candidate?.insight || "").slice(0, 600),
      abstraction: String(candidate?.abstraction || "").slice(0, 1500),
      why_it_matters: String(candidate?.why_it_matters || "").slice(0, 1500),
      uncertainty_text: String(candidate?.uncertainty || "").slice(0, 1500),
      type: String(candidate?.type || "").slice(0, 80),
      confidence: String(candidate?.confidence || "").slice(0, 80),
      evidence_review_material: evidence.map((entry) => ({
        quote: String(entry?.quote || "").slice(0, 1000),
        role: String(entry?.role || "").slice(0, 80),
        exact_in_supplied_excerpt: typeof entry?.quote === "string" &&
          entry.quote.length > 0 && source.includes(entry.quote)
      })),
      human_quality_review: {
        status: "pending",
        scientific_accuracy: null,
        nontrivial_knowledge_gain: null,
        non_paraphrase: null,
        useful_followup_question: null,
        reviewer_notes: null
      },
      causal_status: String(candidate?.causal_status || ""),
      contract_valid: validation.ok,
      validation_errors: validation.errors,
      evidence_count: evidence.length,
      exact_evidence_count: exactEvidenceCount,
      grounded_evidence: evidence.length >= 2 && exactEvidenceCount === evidence.length,
      source_limitation_cited: sourceLimitationCited,
      source_topic_terms_in_reasoning: topicMatches,
      topic_specificity_flag: topicMatches.length > 0,
      uncertainty_disclosed: uncertain,
      causal_overreach_flag: causalOverreach,
      human_review_required: true
    });
  }
  const totalQuotes = candidateResults.reduce((count, candidate) => count + candidate.evidence_count, 0);
  const exactQuotes = candidateResults.reduce((count, candidate) => count + candidate.exact_evidence_count, 0);
  const contractValid = candidateResults.filter((candidate) => candidate.contract_valid).length;
  const grounded = candidateResults.filter((candidate) => candidate.grounded_evidence).length;
  const topicSpecific = candidateResults.filter((candidate) => candidate.topic_specificity_flag).length;
  const citedLimitations = candidateResults.filter((candidate) => candidate.source_limitation_cited).length;
  const causalFlags = candidateResults.filter((candidate) => candidate.causal_overreach_flag).length;
  return {
    schema: "aha_research_excerpt_evaluation_v1",
    id: item.id,
    source_url: item.url,
    source_doi: item.doi,
    source_scope: "short_noncontiguous_verbatim_excerpts_not_full_paper",
    source_sha256: fingerprint(source),
    provided_observation: item.observation,
    provided_limitation: item.limitation,
    candidate_count: candidateResults.length,
    contract_valid_count: contractValid,
    grounded_candidate_count: grounded,
    topic_specific_candidate_count: topicSpecific,
    source_limitation_cited_count: citedLimitations,
    causal_overreach_flag_count: causalFlags,
    exact_evidence_quotes: exactQuotes,
    total_evidence_quotes: totalQuotes,
    quote_integrity_ratio: totalQuotes ? exactQuotes / totalQuotes : null,
    scientific_validity_verified: false,
    human_review_required: true,
    zero_candidates_is_not_a_failure: true,
    candidates: candidateResults
  };
}
module.exports = { sourceText, fingerprint, evaluateResearchSynthesis };
