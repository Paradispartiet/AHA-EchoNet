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
from app.schemas import CanonicalAhaAnalysis, Confidence, HistoryGoLink, AnalyzeRequest

REPO_ROOT = Path(__file__).resolve().parents[4]
LEGACY_CORPUS_PATH = REPO_ROOT / "data" / "integrations" / "history-go-fagverk-corpus.v1.json"
ACTIVE_MANIFEST_PATH = REPO_ROOT / "data" / "integrations" / "history-go-fagverk-release.runtime-active.json"

STOPWORDS = {
    "og", "i", "på", "av", "for", "til", "med", "som", "er", "en", "et", "den", "det", "de",
    "fra", "eller", "om", "kan", "skal", "må", "ved", "etter", "mellom", "gjennom", "ikke", "også",
    "blir", "ble", "har", "hadde", "sin", "sine", "dette", "disse", "hvordan", "hva", "hvilke",
}

TOKEN_RE = re.compile(r"[a-zæøå0-9]+", re.IGNORECASE)


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
    scoring_mode: str = "generic_v1"
    minimum_score: float = 8.0
    minimum_terms: int = 2
    ambiguity_margin: float = 3.0


def _normalize(value: str) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).lower()
    return " ".join(text.split())


def _tokens(value: str) -> set[str]:
    return {token for token in TOKEN_RE.findall(_normalize(value)) if len(token) > 2 and token not in STOPWORDS}


def _all_tokens(value: str) -> set[str]:
    return set(TOKEN_RE.findall(_normalize(value)))


def _phrase_present(message: str, term: str) -> bool:
    normalized_term = _normalize(term)
    if not normalized_term:
        return False
    if " " in normalized_term:
        return normalized_term in message
    return normalized_term in _tokens(message)


def _policy_term_present(message: str, tokens: set[str], term: str) -> bool:
    normalized_term = _normalize(term)
    if not normalized_term:
        return False
    if " " in normalized_term or "-" in normalized_term:
        return normalized_term in message
    return normalized_term in tokens


def _generic_entry_score(message: str, entry: dict[str, Any]) -> tuple[float, tuple[str, ...], bool]:
    weighted_groups = (
        (entry.get("title_terms", []), 5.0),
        (entry.get("concept_terms", []), 3.0),
        (entry.get("support_terms", []), 1.5),
    )
    score = 0.0
    matched: list[str] = []
    for terms, weight in weighted_groups:
        for raw_term in terms:
            term = _normalize(raw_term)
            if not term or term in matched or not _phrase_present(message, term):
                continue
            matched.append(term)
            score += weight + (1.0 if " " in term else 0.0)

    if len(matched) == 1 and " " not in matched[0]:
        score *= 0.35
    return score, tuple(matched), True


def _policy_entry_score(
    message: str,
    entry: dict[str, Any],
    policy: dict[str, Any],
) -> tuple[float, tuple[str, ...], bool]:
    tokens = _all_tokens(message)
    policy_by_term = {_normalize(item.get("term", "")): item for item in policy.get("terms", [])}
    global_non_scoring = {_normalize(term) for term in policy.get("global_non_scoring_terms", [])}
    rule = policy.get("chapter_rules", {}).get(entry.get("chapter_id"), {})
    default_weights = policy.get("default_weights", {})
    group_weights = (
        ("title_terms", float(default_weights.get("title_term", 5.0))),
        ("concept_terms", float(default_weights.get("concept_term", 3.0))),
        ("support_terms", float(default_weights.get("support_term", 1.5))),
    )

    candidates: dict[str, tuple[str, float]] = {}
    for group, weight in group_weights:
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

    contributions: list[tuple[str, float]] = []
    score = 0.0
    for term, (_, base_weight) in candidates.items():
        if not _policy_term_present(message, tokens, term):
            continue
        term_policy = policy_by_term.get(term)
        if term in global_non_scoring:
            multiplier = 0.0
        elif term_policy is not None:
            multiplier = float(term_policy.get("multiplier", 0.0))
        else:
            multiplier = 1.0
        contribution = base_weight * multiplier
        if contribution <= 0:
            continue
        contributions.append((term, round(contribution, 3)))
        score += contribution

    required_anchors = [_normalize(term) for term in rule.get("required_anchor_terms", []) if _normalize(term)]
    matched_anchors = [term for term in required_anchors if _policy_term_present(message, tokens, term)]
    eligible = not required_anchors or bool(matched_anchors)
    contributions.sort(key=lambda item: (-item[1], item[0]))
    return round(score, 3), tuple(term for term, _ in contributions), eligible


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


def ground_message(message: str, corpus: dict[str, Any] | None = None) -> dict[str, Any]:
    normalized = _normalize(message)
    if len(normalized) < 24:
        return {"status": "unsupported", "reason": "source_too_short", "matches": []}

    payload = corpus or load_fagverk_corpus()
    subject_policies = payload.get("subject_policies", {})
    matches: list[GroundingMatch] = []
    for entry in payload.get("entries", []):
        subject_id = str(entry.get("subject_id") or "")
        policy = subject_policies.get(subject_id)
        if policy:
            score, matched_terms, eligible = _policy_entry_score(normalized, entry, policy)
            thresholds = policy.get("thresholds", {})
            scoring_mode = str(policy.get("scoring_mode") or "subject_policy_v1")
            minimum_score = float(thresholds.get("minimum_score", 6.0))
            minimum_terms = int(thresholds.get("minimum_terms", 2))
            ambiguity_margin = float(thresholds.get("ambiguity_margin", 3.0))
        else:
            score, matched_terms, eligible = _generic_entry_score(normalized, entry)
            scoring_mode = "generic_v1"
            minimum_score = 8.0
            minimum_terms = 2
            ambiguity_margin = 3.0
        if not eligible or score <= 0:
            continue
        matches.append(
            GroundingMatch(
                subject_id=subject_id,
                chapter_id=str(entry.get("chapter_id") or ""),
                primary_domain_id=str(entry.get("primary_domain_id") or entry.get("chapter_id") or ""),
                title=str(entry.get("title") or entry.get("chapter_id") or ""),
                source_path=str(entry.get("source_path") or ""),
                score=round(score, 3),
                confidence=_confidence(score, len(matched_terms)),
                matched_terms=matched_terms,
                scoring_mode=scoring_mode,
                minimum_score=minimum_score,
                minimum_terms=minimum_terms,
                ambiguity_margin=ambiguity_margin,
            )
        )

    matches.sort(key=lambda item: (-item.score, item.subject_id, item.chapter_id))
    if not matches:
        return {"status": "unsupported", "reason": "no_fagverk_evidence", "matches": []}

    top = matches[0]
    second = matches[1] if len(matches) > 1 else None
    if top.score < top.minimum_score or len(top.matched_terms) < top.minimum_terms:
        return {
            "status": "unsupported",
            "reason": "insufficient_fagverk_evidence",
            "matches": [match.__dict__ for match in matches[:3]],
        }

    if second and second.score >= second.minimum_score and (top.score - second.score) < top.ambiguity_margin:
        return {
            "status": "ambiguous",
            "reason": "multiple_chapters_close",
            "matches": [match.__dict__ for match in matches[:3]],
        }

    return {
        "status": "grounded",
        "reason": "chapter_evidence_threshold_met",
        "match": top.__dict__,
        "matches": [match.__dict__ for match in matches[:3]],
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
        if not cleaned or key in seen:
            continue
        seen.add(key)
        result.append(cleaned)
    return result


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

    match = grounding["match"]
    data = _model_dump(base)
    matched_terms = list(match.get("matched_terms", []))[:6]
    evidence_label = ", ".join(matched_terms)
    link = HistoryGoLink(
        type="fagverk_chapter",
        id=match["chapter_id"],
        title=match["title"],
        reason=f"Kildebundet Fagverk-treff basert på eksplisitte begreper: {evidence_label}.",
    )

    existing_links = [HistoryGoLink(**item) if isinstance(item, dict) else item for item in data.get("historyGoLinks", [])]
    if not any(item.type == link.type and item.id == link.id for item in existing_links):
        existing_links.append(link)

    base_confidence = data.get("confidence", {})
    domain_confidence = float(base_confidence.get("domain", 0.0))
    theme_confidence = float(base_confidence.get("theme", 0.0))
    grounding_confidence = float(match.get("confidence", 0.0))
    should_replace_generic = data.get("domain") == "generic_academic" or domain_confidence < 0.6

    if should_replace_generic:
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

    data["fieldConnections"] = _dedupe(
        list(data.get("fieldConnections", [])) + [match["subject_id"], match["title"]]
    )
    data["historyGoLinks"] = [_model_dump(item) for item in existing_links]
    data["confidence"] = _model_dump(
        Confidence(
            contentType=float(base_confidence.get("contentType", 0.0)),
            domain=max(domain_confidence, grounding_confidence),
            theme=max(theme_confidence, grounding_confidence),
            mainTension=min(float(base_confidence.get("mainTension", 0.0)), grounding_confidence),
            historyGoLinks=max(float(base_confidence.get("historyGoLinks", 0.0)), grounding_confidence),
        )
    )
    data["warnings"] = _dedupe(
        list(data.get("warnings", []))
        + ["Fagverk-grounding er referansestøtte, ikke automatisk sannhet eller modelltrening."]
    )
    return CanonicalAhaAnalysis(**data)


def analyze_message_with_fagverk(request: AnalyzeRequest) -> CanonicalAhaAnalysis:
    base = analyze_message(request)
    grounding = ground_message(request.message)
    return apply_fagverk_grounding(base, grounding)
