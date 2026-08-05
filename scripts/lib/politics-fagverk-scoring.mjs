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

function chapterTerms(entry, rule) {
  const terms = new Map();
  for (const [group, weight] of [["title_terms", 5], ["concept_terms", 3], ["support_terms", 1.5]]) {
    for (const rawTerm of entry[group] || []) {
      const term = normalize(rawTerm);
      if (!term) continue;
      const current = terms.get(term);
      if (!current || weight > current.base_weight) terms.set(term, { term, group, base_weight: weight });
    }
  }
  for (const supplemental of rule?.supplemental_evidence_terms || []) {
    const term = normalize(supplemental.term);
    const weight = Number(supplemental.weight || 0);
    if (!term || weight <= 0) continue;
    const current = terms.get(term);
    if (!current || weight > current.base_weight) {
      terms.set(term, { term, group: "supplemental_evidence_terms", base_weight: weight });
    }
  }
  return [...terms.values()];
}

export function scorePolitics(textValue, corpus, policy) {
  const text = normalize(textValue);
  const tokens = tokenSet(text);
  const policyByTerm = new Map((policy.terms || []).map((item) => [normalize(item.term), item]));
  const globalNonScoring = new Set((policy.global_non_scoring_terms || []).map(normalize));
  const chapterRules = policy.chapter_rules || {};

  const scores = corpus.entries.map((entry) => {
    const rule = chapterRules[entry.chapter_id] || {};
    const matched = [];
    let score = 0;
    for (const candidate of chapterTerms(entry, rule)) {
      if (!termPresent(text, tokens, candidate.term)) continue;
      const termPolicy = policyByTerm.get(candidate.term);
      const multiplier = globalNonScoring.has(candidate.term)
        ? 0
        : termPolicy
          ? Number(termPolicy.multiplier || 0)
          : 1;
      const contribution = candidate.base_weight * multiplier;
      if (contribution <= 0) continue;
      matched.push({
        term: candidate.term,
        group: candidate.group,
        base_weight: candidate.base_weight,
        multiplier,
        contribution: Number(contribution.toFixed(3))
      });
      score += contribution;
    }

    const requiredAnchors = (rule.required_anchor_terms || []).map(normalize).filter(Boolean);
    const matchedAnchors = requiredAnchors.filter((term) => termPresent(text, tokens, term));
    const eligible = requiredAnchors.length === 0 || matchedAnchors.length > 0;
    matched.sort((a, b) => b.contribution - a.contribution || a.term.localeCompare(b.term, "nb"));
    return {
      chapter_id: entry.chapter_id,
      title: entry.title,
      score: Number(score.toFixed(3)),
      eligible,
      eligibility_reason: eligible ? "eligible" : "missing_required_anchor",
      matched_anchor_terms: matchedAnchors,
      matched_terms: matched
    };
  });

  const eligibleScores = scores
    .filter((item) => item.eligible)
    .sort((a, b) => b.score - a.score || a.chapter_id.localeCompare(b.chapter_id, "nb"));
  const top = eligibleScores[0];
  const second = eligibleScores[1];
  let status = "unsupported";
  if (top && top.score >= 6 && top.matched_terms.length >= 2) {
    status = second && second.score >= 6 && (top.score - second.score) < 3 ? "ambiguous" : "grounded";
  }

  return {
    status,
    selected_chapter_id: status === "grounded" ? top.chapter_id : null,
    top_score: top?.score || 0,
    second_score: second?.score || 0,
    ranking: scores
      .sort((a, b) => b.score - a.score || Number(b.eligible) - Number(a.eligible) || a.chapter_id.localeCompare(b.chapter_id, "nb"))
      .slice(0, 5)
  };
}
