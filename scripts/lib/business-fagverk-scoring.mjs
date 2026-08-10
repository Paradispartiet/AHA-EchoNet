export function normalize(value) {
  return String(value ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

export function tokenSet(value) {
  return new Set(normalize(value).match(/[a-zæøå0-9]+/gi) || []);
}

export function termPresent(text, tokens, term) {
  const value = normalize(term);
  if (!value) return false;
  if (/\s|-/.test(value)) return text.includes(value);
  return tokens.has(value);
}

export function hydrateBusinessPolicy(policy, config) {
  if (policy.subject_id !== "naeringsliv" || config.subject_id !== "naeringsliv") throw new Error("Business policy identity mismatch.");
  if (policy.source_ref !== config.source_ref || policy.corpus_sha256 !== config.corpus_sha256) throw new Error("Business policy config binding mismatch.");
  const domainTerms = [...new Set(Object.values(config.chapter_rules || {}).flatMap((rule) => rule.required_anchor_terms || []))];
  return {
    ...policy,
    thresholds: config.thresholds,
    default_weights: config.default_weights,
    global_non_scoring_terms: config.global_non_scoring_terms,
    domain_gate: { required: true, terms: domainTerms },
    chapter_rules: config.chapter_rules
  };
}

function reviewedEvidence(rule) {
  return (rule?.supplemental_evidence_terms || [])
    .map((item) => ({ term: normalize(item.term), weight: Number(item.weight || 0) }))
    .filter((item) => item.term && item.weight > 0);
}

function domainEvidence(text, tokens, domainGate) {
  const terms = (domainGate?.terms || []).map(normalize).filter(Boolean);
  const matchedTerms = terms.filter((term) => termPresent(text, tokens, term));
  return {
    matched_terms: matchedTerms,
    eligible: domainGate?.required === false || matchedTerms.length > 0
  };
}

export function scoreBusiness(textValue, corpus, policy) {
  const text = normalize(textValue);
  const tokens = tokenSet(text);
  const chapterRules = policy.chapter_rules || {};
  const thresholds = {
    minimum_score: Number(policy.thresholds?.minimum_score ?? 7),
    minimum_terms: Number(policy.thresholds?.minimum_terms ?? 2),
    minimum_reviewed_evidence_terms: Number(policy.thresholds?.minimum_reviewed_evidence_terms ?? 2),
    ambiguity_margin: Number(policy.thresholds?.ambiguity_margin ?? 3)
  };
  const domain = domainEvidence(text, tokens, policy.domain_gate || { required: true, terms: [] });

  const scores = corpus.entries.map((entry) => {
    const rule = chapterRules[entry.chapter_id] || {};
    const matchedReviewedEvidence = reviewedEvidence(rule)
      .filter((item) => termPresent(text, tokens, item.term))
      .map((item) => ({ term: item.term, group: "supplemental_evidence_terms", base_weight: item.weight, multiplier: 1, contribution: item.weight }))
      .sort((a, b) => b.contribution - a.contribution || a.term.localeCompare(b.term, "nb"));
    const score = matchedReviewedEvidence.reduce((sum, item) => sum + item.contribution, 0);
    const requiredAnchors = (rule.required_anchor_terms || []).map(normalize).filter(Boolean);
    const matchedAnchors = requiredAnchors.filter((term) => termPresent(text, tokens, term));
    const anchorEligible = requiredAnchors.length > 0 && matchedAnchors.length > 0;
    const evidenceEligible = matchedReviewedEvidence.length >= thresholds.minimum_reviewed_evidence_terms;
    const eligible = domain.eligible && anchorEligible && evidenceEligible;
    return {
      chapter_id: entry.chapter_id,
      title: entry.title,
      score: Number(score.toFixed(3)),
      eligible,
      eligibility_reason: !domain.eligible ? "missing_business_domain_anchor" : !anchorEligible ? "missing_required_anchor" : evidenceEligible ? "eligible" : "insufficient_reviewed_evidence",
      matched_anchor_terms: matchedAnchors,
      matched_reviewed_evidence_terms: matchedReviewedEvidence,
      matched_terms: matchedReviewedEvidence
    };
  });

  const eligibleScores = scores.filter((item) => item.eligible).sort((a, b) => b.score - a.score || a.chapter_id.localeCompare(b.chapter_id, "nb"));
  const top = eligibleScores[0];
  const second = eligibleScores[1];
  let status = "unsupported";
  if (top && top.score >= thresholds.minimum_score && top.matched_terms.length >= thresholds.minimum_terms) {
    status = second && second.score >= thresholds.minimum_score && second.matched_terms.length >= thresholds.minimum_terms && (top.score - second.score) < thresholds.ambiguity_margin ? "ambiguous" : "grounded";
  }
  return {
    status,
    selected_chapter_id: status === "grounded" ? top.chapter_id : null,
    top_score: top?.score || 0,
    second_score: second?.score || 0,
    thresholds,
    domain_evidence: domain,
    ranking: scores.sort((a, b) => b.score - a.score || Number(b.eligible) - Number(a.eligible) || a.chapter_id.localeCompare(b.chapter_id, "nb")).slice(0, 5)
  };
}
