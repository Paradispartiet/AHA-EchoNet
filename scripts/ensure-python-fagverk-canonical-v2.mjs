#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const targetPath = path.join(repoRoot, "backend/aha_engine/app/engine/fagverk_grounding.py");
const importAnchor = "from app.engine.analyzer import analyze_message\n";
const canonicalImport = "from app.engine.fagverk_canonical import load_canonical_fagverk_corpus\n";
const oldDefault = "    payload = corpus or load_fagverk_corpus()\n";
const canonicalDefault = "    payload = corpus or load_canonical_fagverk_corpus()\n";
const deprecatedPolicyGuard = `        subject_id = str(entry.get("subject_id") or "")
        policy = subject_policies.get(subject_id)
        if policy and entry.get("chapter_id") not in (policy.get("chapter_rules") or {}):
            policy = None
        if policy:
`;
const canonicalPolicyBlock = `        subject_id = str(entry.get("subject_id") or "")
        policy = subject_policies.get(subject_id)
        if policy:
`;
const oldGenericThresholds = `            scoring_mode = "generic_v1"
            minimum_score = 8.0
            minimum_terms = 2
            ambiguity_margin = 3.0
`;
const canonicalGenericThresholds = `            scoring_mode = "canonical_generic_v2" if payload.get("status") == "canonical_history_go_deployment_index_v2" else "generic_v1"
            minimum_score = 10.0 if scoring_mode == "canonical_generic_v2" else 8.0
            minimum_terms = 2
            ambiguity_margin = 3.0
`;
const thresholdAnchor = `def _match_passes_threshold(match: GroundingMatch) -> bool:
    return match.score >= match.minimum_score and len(match.matched_terms) >= match.minimum_terms
`;
const normalizedRankingHelpers = `${thresholdAnchor}

def _threshold_strength(match: GroundingMatch) -> float:
    return match.score / max(match.minimum_score, 0.001)


def _passing_match_sort_key(match: GroundingMatch) -> tuple[float, float, float, float, str, str]:
    return (
        -round(_threshold_strength(match), 6),
        -round(match.score - match.minimum_score, 6),
        -match.confidence,
        -match.score,
        match.subject_id,
        match.chapter_id,
    )


def _matches_are_ambiguous(top: GroundingMatch, second: GroundingMatch) -> bool:
    same_scale = (
        top.scoring_mode == second.scoring_mode
        and math.isclose(top.minimum_score, second.minimum_score, rel_tol=0.0, abs_tol=1e-9)
    )
    if same_scale:
        return (top.score - second.score) < top.ambiguity_margin
    normalized_gap = _threshold_strength(top) - _threshold_strength(second)
    normalized_margin = min(
        0.25,
        top.ambiguity_margin / max(top.minimum_score, 1.0),
        second.ambiguity_margin / max(second.minimum_score, 1.0),
    )
    return normalized_gap < normalized_margin
`;
const rawPassingSelection = `    top = passing_matches[0]
    second = passing_matches[1] if len(passing_matches) > 1 else None
    if second and (top.score - second.score) < top.ambiguity_margin:
`;
const normalizedPassingSelection = `    passing_matches.sort(key=_passing_match_sort_key)
    top = passing_matches[0]
    second = passing_matches[1] if len(passing_matches) > 1 else None
    if second and _matches_are_ambiguous(top, second):
`;

function transform(source) {
  let next = source;
  if (!next.includes(canonicalImport)) {
    if (!next.includes(importAnchor)) throw new Error("Python Fagverk import anchor not found.");
    next = next.replace(importAnchor, importAnchor + canonicalImport);
  }
  if (next.includes(oldDefault)) next = next.replace(oldDefault, canonicalDefault);
  if (!next.includes(canonicalDefault)) throw new Error("Python ground_message canonical default not found.");

  if (next.includes(deprecatedPolicyGuard)) next = next.replace(deprecatedPolicyGuard, canonicalPolicyBlock);
  if (!next.includes(canonicalPolicyBlock)) throw new Error("Python canonical reviewed-policy binding missing.");
  if (next.includes("if policy and entry.get(\"chapter_id\") not in (policy.get(\"chapter_rules\") or {}):")) {
    throw new Error("Deprecated reviewed-policy chapter guard still present.");
  }

  if (next.includes(oldGenericThresholds)) next = next.replace(oldGenericThresholds, canonicalGenericThresholds);
  if (!next.includes(canonicalGenericThresholds)) throw new Error("Python canonical generic thresholds missing.");

  if (!next.includes("def _threshold_strength(match: GroundingMatch)")) {
    if (!next.includes(thresholdAnchor)) throw new Error("Python Fagverk threshold helper anchor missing.");
    next = next.replace(thresholdAnchor, normalizedRankingHelpers);
  }
  if (!next.includes("def _matches_are_ambiguous(top: GroundingMatch, second: GroundingMatch)")) {
    throw new Error("Python cross-policy ambiguity normalizer missing.");
  }

  if (next.includes(rawPassingSelection)) next = next.replace(rawPassingSelection, normalizedPassingSelection);
  if (!next.includes(normalizedPassingSelection)) throw new Error("Python passing-match normalized ranking missing.");

  if (!next.includes("def load_fagverk_corpus")) throw new Error("Legacy calibration compatibility loader unexpectedly missing.");
  return next;
}

const mode = process.argv.includes("--write") ? "write" : process.argv.includes("--check") ? "check" : "";
if (!mode) throw new Error("Use --write or --check.");
const current = fs.readFileSync(targetPath, "utf8");
const expected = transform(current);
if (mode === "write") {
  if (expected !== current) fs.writeFileSync(targetPath, expected);
  console.log(expected === current ? "Python canonical Fagverk consumer already current." : "Python canonical Fagverk consumer updated.");
} else {
  if (expected !== current) throw new Error("Python canonical Fagverk consumer drift detected.");
  console.log("Python canonical Fagverk consumer: verified.");
}
