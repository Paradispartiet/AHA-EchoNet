from __future__ import annotations

import json
import math
import re
import unicodedata
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.engine.analyzer import analyze_message
from app.engine.fagverk_canonical import load_canonical_fagverk_corpus
from app.schemas import AnalyzeRequest, CanonicalAhaAnalysis, Confidence, HistoryGoLink

REPO_ROOT = Path(__file__).resolve().parents[4]
LEGACY_CORPUS_PATH = REPO_ROOT / "data" / "integrations" / "history-go-fagverk-corpus.v1.json"
ACTIVE_MANIFEST_PATH = REPO_ROOT / "data" / "integrations" / "history-go-fagverk-release.runtime-active.json"

STOPWORDS = {
    "og", "i", "på", "av", "for", "til", "med", "som", "er", "en", "et", "den", "det", "de",
    "fra", "eller", "om", "kan", "skal", "må", "ved", "etter", "mellom", "gjennom", "ikke", "også",
    "blir", "ble", "har", "hadde", "sin", "sine", "dette", "disse", "hvordan", "hva", "hvilke",
}
TOKEN_RE = re.compile(r"[a-zæøå0-9]+", re.IGNORECASE)
SEGMENT_RE = re.compile(r"[^.!?\n]+(?:[.!?]+|$)", re.MULTILINE)


@dataclass(frozen=True)
class GroundingMatch:
    subject_id: str
    chapter_id: str
    primary_domain_id: str
    title: str
    source_path: str
    score: float
    confidence: float
    matched_terms: tuple[str, ...]
    evidence: tuple[dict[str, Any], ...] = ()
    scoring_mode: str = "generic_v1"
    minimum_score: float = 8.0
    minimum_terms: int = 2
    ambiguity_margin: float = 3.0


def _normalize(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", str(value or "")).lower().split())


def _tokens(value: str) -> set[str]:
    return {token for token in TOKEN_RE.findall(_normalize(value)) if len(token) > 2 and token not in STOPWORDS}


def _all_tokens(value: str) -> set[str]:
    return set(TOKEN_RE.findall(_normalize(value)))


def _term_present(message: str, tokens: set[str], term: str) -> bool:
    term = _normalize(term)
    if not term:
        return False
    if " " in term or "-" in term:
        return term in message
    return term in tokens


def _generic_entry_score(
    message: str,
    entry: dict[str, Any],
) -> tuple[float, tuple[str, ...], bool, tuple[tuple[str, float, str], ...]]:
    tokens = _tokens(message)
    groups = (
        ("title_terms", 5.0),
        ("concept_terms", 3.0),
        ("support_terms", 1.5),
    )
    contributions: list[tuple[str, float, str]] = []
    seen: set[str] = set()
    for group, weight in groups:
        for raw_term in entry.get(group, []):
            term = _normalize(raw_term)
            if not term or term in seen or not _term_present(message, tokens, term):
                continue
            seen.add(term)
            contributions.append((term, weight + (1.0 if " " in term else 0.0), group))
    if len(contributions) == 1 and " " not in contributions[0][0]:
        term, weight, group = contributions[0]
        contributions = [(term, round(weight * 0.35, 3), group)]
    contributions.sort(key=lambda item: (-item[1], item[0]))
    return (
        round(sum(weight for _, weight, _ in contributions), 3),
        tuple(term for term, _, _ in contributions),
        True,
        tuple(contributions),
    )


def _policy_entry_score(
    message: str,
    entry: dict[str, Any],
    policy: dict[str, Any],
) -> tuple[float, tuple[str, ...], bool, tuple[tuple[str, float, str], ...]]:
    tokens = _all_tokens(message)
    policy_by_term = {_normalize(item.get("term", "")): item for item in policy.get("terms", [])}
    global_non_scoring = {_normalize(term) for term in policy.get("global_non_scoring_terms", [])}
    rule = policy.get("chapter_rules", {}).get(entry.get("chapter_id"), {})
    weights = policy.get("default_weights", {})
    candidate_terms_decisive = (policy.get("policy_rules") or {}).get(
        "candidate_title_concept_support_terms"
    ) != "non_decisive_review_context_only"

    candidates: dict[str, tuple[str, float]] = {}
    if candidate_terms_decisive:
        for group, weight in (
            ("title_terms", float(weights.get("title_term", 5.0))),
            ("concept_terms", float(weights.get("concept_term", 3.0))),
            ("support_terms", float(weights.get("support_term", 1.5))),
        ):
            for raw_term in entry.get(group, []):
                term = _normalize(raw_term)
                current = candidates.get(term)
                if term and (current is None or weight > current[1]):
                    candidates[term] = (group, weight)

    for supplemental in rule.get("supplemental_evidence_terms", []):
        term = _normalize(supplemental.get("term", ""))
        weight = float(supplemental.get("weight", 0.0))
        current = candidates.get(term)
        if term and weight > 0 and (current is None or weight > current[1]):
            candidates[term] = ("supplemental_evidence_terms", weight)

    contributions: list[tuple[str, float, str]] = []
    for term, (group, base_weight) in candidates.items():
        if not _term_present(message, tokens, term):
            continue
        if term in global_non_scoring:
            multiplier = 0.0
        elif term in policy_by_term:
            multiplier = float(policy_by_term[term].get("multiplier", 0.0))
        else:
            multiplier = 1.0
        contribution = base_weight * multiplier
        if contribution > 0:
            contributions.append((term, round(contribution, 3), group))

    thresholds = policy.get("thresholds", {})
    minimum_reviewed = int(thresholds.get("minimum_reviewed_evidence_terms", 0))
    reviewed_count = sum(1 for _, _, group in contributions if group == "supplemental_evidence_terms")

    domain_gate = policy.get("domain_gate") or {}
    domain_terms = [_normalize(term) for term in domain_gate.get("terms", []) if _normalize(term)]
    domain_eligible = domain_gate.get("required") is not True or any(
        _term_present(message, tokens, term) for term in domain_terms
    )

    temporal_gate = policy.get("temporal_gate") or {}
    temporal_terms = [_normalize(term) for term in temporal_gate.get("terms", []) if _normalize(term)]
    year_pattern = str(temporal_gate.get("year_pattern") or r"\b(?:1[0-9]{3}|20[0-9]{2})\b")
    try:
        year_matched = bool(re.search(year_pattern, message))
    except re.error as exc:
        raise ValueError(f"Invalid runtime Fagverk temporal year pattern: {year_pattern}") from exc
    temporal_eligible = temporal_gate.get("required") is not True or year_matched or any(
        _term_present(message, tokens, term) for term in temporal_terms
    )

    required_anchors = [_normalize(term) for term in rule.get("required_anchor_terms", []) if _normalize(term)]
    anchor_eligible = not required_anchors or any(_term_present(message, tokens, term) for term in required_anchors)
    reviewed_eligible = reviewed_count >= minimum_reviewed
    eligible = domain_eligible and temporal_eligible and anchor_eligible and reviewed_eligible
    contributions.sort(key=lambda item: (-item[1], item[0]))
    return (
        round(sum(weight for _, weight, _ in contributions), 3),
        tuple(term for term, _, _ in contributions),
        eligible,
        tuple(contributions),
    )


def _evidence_for_contributions(
    original_message: str,
    contributions: tuple[tuple[str, float, str], ...],
) -> tuple[dict[str, Any], ...]:
    segments: list[tuple[int, int, str, str, set[str]]] = []
    for match in SEGMENT_RE.finditer(original_message):
        raw = match.group(0)
        leading = len(raw) - len(raw.lstrip())
        trailing = len(raw) - len(raw.rstrip())
        quote = raw.strip()
        if not quote:
            continue
        start = match.start() + leading
        end = match.end() - trailing
        normalized = _normalize(quote)
        segments.append((start, end, quote, normalized, _all_tokens(normalized)))

    evidence: list[dict[str, Any]] = []
    for term, contribution, group in contributions:
        selected = next(
            (segment for segment in segments if _term_present(segment[3], segment[4], term)),
            None,
        )
        if selected is None:
            quote = original_message.strip()[:280]
            start = original_message.find(quote) if quote else 0
            start = max(0, start)
            end = start + len(quote)
        else:
            start, end, quote = selected[0], selected[1], selected[2]
        evidence.append({
            "term": term,
            "quote": quote[:280],
            "start": start,
            "end": end,
            "group": group,
            "contribution": round(float(contribution), 3),
        })
    return tuple(evidence)


def _confidence(score: float, matched_count: int) -> float:
    evidence = min(1.0, matched_count / 6.0)
    strength = 1.0 - math.exp(-max(0.0, score) / 16.0)
    return round(min(0.97, 0.35 * evidence + 0.65 * strength), 3)


def _read_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _resolve_repo_path(relative_path: str) -> Path:
    candidate = (REPO_ROOT / relative_path).resolve()
    if REPO_ROOT not in candidate.parents and candidate != REPO_ROOT:
        raise ValueError(f"Runtime Fagverk path escapes repository root: {relative_path}")
    return candidate


def _validate_legacy_corpus(payload: dict[str, Any]) -> None:
    if payload.get("schema") != "aha_history_go_fagverk_corpus_v1":
        raise ValueError("Unsupported legacy Fagverk corpus schema")
    if not isinstance(payload.get("entries"), list):
        raise ValueError("Legacy Fagverk corpus entries must be a list")


def _load_composed_runtime_corpus() -> dict[str, Any]:
    legacy = _read_json(LEGACY_CORPUS_PATH)
    _validate_legacy_corpus(legacy)
    if not ACTIVE_MANIFEST_PATH.exists():
        return legacy

    active = _read_json(ACTIVE_MANIFEST_PATH)
    if active.get("schema") != "aha_history_go_fagverk_runtime_active_v2":
        return legacy

    active_subjects = active.get("active_subjects", {})
    active_subject_ids = set(active_subjects)
    entries = [entry for entry in legacy.get("entries", []) if entry.get("subject_id") not in active_subject_ids]
    subject_policies: dict[str, Any] = {}

    for subject_id, config in sorted(active_subjects.items()):
        corpus = _read_json(_resolve_repo_path(str(config.get("corpus_path", ""))))
        if corpus.get("schema") != "aha_history_go_fagverk_runtime_subject_corpus_v1":
            raise ValueError(f"{subject_id}: unsupported active subject corpus schema")
        if corpus.get("subject_id") != subject_id or corpus.get("source_ref") != config.get("source_commit"):
            raise ValueError(f"{subject_id}: active subject corpus identity mismatch")
        if corpus.get("corpus_sha256") != config.get("corpus_sha256"):
            raise ValueError(f"{subject_id}: active subject corpus digest mismatch")
        if len(corpus.get("entries", [])) != int(config.get("chapter_count", -1)):
            raise ValueError(f"{subject_id}: active subject chapter count mismatch")
        entries.extend(corpus.get("entries", []))

        policy_path = config.get("policy_path")
        if policy_path:
            policy = _read_json(_resolve_repo_path(str(policy_path)))
            if policy.get("schema") != "aha_history_go_fagverk_runtime_subject_policy_v1":
                raise ValueError(f"{subject_id}: unsupported active subject policy schema")
            if policy.get("subject_id") != subject_id or policy.get("source_ref") != config.get("source_commit"):
                raise ValueError(f"{subject_id}: active subject policy identity mismatch")
            if policy.get("corpus_sha256") != config.get("corpus_sha256"):
                raise ValueError(f"{subject_id}: active subject policy corpus mismatch")
            subject_policies[subject_id] = policy

    if len(entries) != int(active.get("effective_entry_count", -1)):
        raise ValueError("Effective Fagverk runtime entry count mismatch")
    return {
        "schema": "aha_history_go_fagverk_corpus_v1",
        "version": "2.0.0",
        "status": "composed_partial_subject_runtime_corpus",
        "source_repo": legacy.get("source_repo"),
        "source_ref": legacy.get("source_ref"),
        "entries": entries,
        "subject_policies": subject_policies,
        "runtime_active": active,
    }


@lru_cache(maxsize=1)
def load_fagverk_corpus(path: str | Path | None = None) -> dict[str, Any]:
    if path is None:
        return _load_composed_runtime_corpus()
    payload = _read_json(Path(path))
    _validate_legacy_corpus(payload)
    return payload


def _match_passes_threshold(match: GroundingMatch) -> bool:
    return match.score >= match.minimum_score and len(match.matched_terms) >= match.minimum_terms


def ground_message(message: str, corpus: dict[str, Any] | None = None) -> dict[str, Any]:
    normalized = _normalize(message)
    if len(normalized) < 24:
        return {"status": "unsupported", "reason": "source_too_short", "matches": []}

    payload = corpus or load_canonical_fagverk_corpus()
    subject_policies = payload.get("subject_policies", {})
    matches: list[GroundingMatch] = []
    for entry in payload.get("entries", []):
        subject_id = str(entry.get("subject_id") or "")
        policy = subject_policies.get(subject_id)
        if policy and entry.get("chapter_id") not in (policy.get("chapter_rules") or {}):
            policy = None
        if policy:
            score, matched_terms, eligible, contributions = _policy_entry_score(normalized, entry, policy)
            thresholds = policy.get("thresholds", {})
            scoring_mode = str(policy.get("scoring_mode") or "subject_policy_v1")
            minimum_score = float(thresholds.get("minimum_score", 6.0))
            minimum_terms = int(thresholds.get("minimum_terms", 2))
            ambiguity_margin = float(thresholds.get("ambiguity_margin", 3.0))
        else:
            score, matched_terms, eligible, contributions = _generic_entry_score(normalized, entry)
            scoring_mode = "canonical_generic_v2" if payload.get("status") == "canonical_history_go_deployment_index_v2" else "generic_v1"
            minimum_score = 10.0 if scoring_mode == "canonical_generic_v2" else 8.0
            minimum_terms = 2
            ambiguity_margin = 3.0
        if not eligible or score <= 0:
            continue
        matches.append(GroundingMatch(
            subject_id=subject_id,
            chapter_id=str(entry.get("chapter_id") or ""),
            primary_domain_id=str(entry.get("primary_domain_id") or entry.get("chapter_id") or ""),
            title=str(entry.get("title") or entry.get("chapter_id") or ""),
            source_path=str(entry.get("source_path") or ""),
            score=round(score, 3),
            confidence=_confidence(score, len(matched_terms)),
            matched_terms=matched_terms,
            evidence=_evidence_for_contributions(message, contributions),
            scoring_mode=scoring_mode,
            minimum_score=minimum_score,
            minimum_terms=minimum_terms,
            ambiguity_margin=ambiguity_margin,
        ))

    matches.sort(key=lambda item: (-item.score, item.subject_id, item.chapter_id))
    if not matches:
        return {"status": "unsupported", "reason": "no_fagverk_evidence", "matches": []}

    passing_matches = [match for match in matches if _match_passes_threshold(match)]
    if not passing_matches:
        return {
            "status": "unsupported",
            "reason": "insufficient_fagverk_evidence",
            "matches": [match.__dict__ for match in matches[:3]],
        }

    top = passing_matches[0]
    second = passing_matches[1] if len(passing_matches) > 1 else None
    if second and (top.score - second.score) < top.ambiguity_margin:
        return {
            "status": "ambiguous",
            "reason": "multiple_chapters_close",
            "matches": [match.__dict__ for match in passing_matches[:3]],
        }

    related_matches = [
        match for match in passing_matches[1:]
        if match.subject_id != top.subject_id
    ][:2]
    return {
        "status": "grounded",
        "reason": "chapter_evidence_threshold_met",
        "match": top.__dict__,
        "related_matches": [match.__dict__ for match in related_matches],
        "matches": [match.__dict__ for match in passing_matches[:3]],
        "corpus": {
            "schema": payload.get("schema"),
            "version": payload.get("version"),
            "source_repo": payload.get("source_repo"),
            "source_ref": payload.get("source_ref"),
        },
    }


def _model_dump(model: Any) -> dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump()
    return model.dict()


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        cleaned = str(value or "").strip()
        key = cleaned.casefold()
        if cleaned and key not in seen:
            seen.add(key)
            result.append(cleaned)
    return result


def _history_go_link(match: dict[str, Any], link_type: str) -> HistoryGoLink:
    evidence_label = ", ".join(list(match.get("matched_terms", []))[:6])
    return HistoryGoLink(
        type=link_type,
        id=match["chapter_id"],
        title=match["title"],
        reason=f"Kildebundet Fagverk-treff basert på eksplisitte begreper: {evidence_label}.",
    )


def apply_fagverk_grounding(base: CanonicalAhaAnalysis, grounding: dict[str, Any]) -> CanonicalAhaAnalysis:
    if grounding.get("status") != "grounded":
        if grounding.get("status") == "ambiguous":
            data = _model_dump(base)
            data["warnings"] = _dedupe(
                list(data.get("warnings", []))
                + ["Fagverk-treffene er tvetydige; AHA avstår fra å velge ett fagkapittel uten mer kildebelegg."]
            )
            return CanonicalAhaAnalysis(**data)
        return base

    data = _model_dump(base)
    base_confidence = data.get("confidence", {})
    domain_confidence = float(base_confidence.get("domain", 0.0))
    if domain_confidence >= 0.6:
        return base

    match = grounding["match"]
    related_matches = list(grounding.get("related_matches", []))[:2]
    matched_terms = list(match.get("matched_terms", []))[:6]
    evidence_label = ", ".join(matched_terms)

    links = [_history_go_link(match, "fagverk_chapter")]
    links.extend(_history_go_link(item, "fagverk_chapter_related") for item in related_matches)
    existing_links = [HistoryGoLink(**item) if isinstance(item, dict) else item for item in data.get("historyGoLinks", [])]
    for link in links:
        if not any(item.type == link.type and item.id == link.id for item in existing_links):
            existing_links.append(link)

    data["domain"] = match["primary_domain_id"]
    data["theme"] = match["title"]
    data["mainTension"] = "tydelig faglig begrepsbruk kontra utilstrekkelig belegg for mer spesifikk fortolkning"
    data["keyInsight"] = (
        f"Teksten har tydeligst faglig støtte i «{match['title']}» gjennom begrepene {evidence_label}. "
        "Mer detaljert tolkning må fortsatt dokumenteres direkte i kildeteksten."
    )
    data["suggestedActions"] = [
        "Marker hvilke konkrete setninger som støtter hvert fagbegrep.",
        "Skill tekstens egne påstander fra Fagverkets referanseforklaring.",
    ]
    generic_warning_fragments = ("lav informasjonsdensitet", "flere tolkninger er plausible")
    data["warnings"] = [
        warning for warning in data.get("warnings", [])
        if not any(fragment in warning.casefold() for fragment in generic_warning_fragments)
    ]

    connections = [match["subject_id"], match["title"]]
    for related in related_matches:
        connections.extend([related["subject_id"], related["title"]])
    data["fieldConnections"] = _dedupe(list(data.get("fieldConnections", [])) + connections)
    data["historyGoLinks"] = [_model_dump(item) for item in existing_links]
    grounding_confidence = float(match.get("confidence", 0.0))
    data["confidence"] = _model_dump(Confidence(
        contentType=float(base_confidence.get("contentType", 0.0)),
        domain=max(domain_confidence, grounding_confidence),
        theme=max(float(base_confidence.get("theme", 0.0)), grounding_confidence),
        mainTension=min(float(base_confidence.get("mainTension", 0.0)), grounding_confidence),
        historyGoLinks=max(float(base_confidence.get("historyGoLinks", 0.0)), grounding_confidence),
    ))
    data["warnings"] = _dedupe(
        list(data.get("warnings", []))
        + ["Fagverk-grounding er referansestøtte, ikke automatisk sannhet eller modelltrening."]
    )
    return CanonicalAhaAnalysis(**data)


def analyze_message_with_fagverk(request: AnalyzeRequest) -> CanonicalAhaAnalysis:
    base = analyze_message(request)
    grounding = ground_message(request.message)
    return apply_fagverk_grounding(base, grounding)
