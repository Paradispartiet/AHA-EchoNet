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

CORPUS_PATH = Path(__file__).resolve().parents[4] / "data" / "integrations" / "history-go-fagverk-corpus.v1.json"

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


def _normalize(value: str) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).lower()
    return " ".join(text.split())


def _tokens(value: str) -> set[str]:
    return {token for token in TOKEN_RE.findall(_normalize(value)) if len(token) > 2 and token not in STOPWORDS}


def _phrase_present(message: str, term: str) -> bool:
    normalized_term = _normalize(term)
    if not normalized_term:
        return False
    if " " in normalized_term:
        return normalized_term in message
    return normalized_term in _tokens(message)


def _entry_score(message: str, entry: dict[str, Any]) -> tuple[float, tuple[str, ...]]:
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

    # Require more than one isolated token before a chapter can dominate.
    if len(matched) == 1 and " " not in matched[0]:
        score *= 0.35
    return score, tuple(matched)


def _confidence(score: float, matched_count: int) -> float:
    evidence = min(1.0, matched_count / 6.0)
    strength = 1.0 - math.exp(-max(0.0, score) / 16.0)
    return round(min(0.97, 0.35 * evidence + 0.65 * strength), 3)


@lru_cache(maxsize=1)
def load_fagverk_corpus(path: str | Path | None = None) -> dict[str, Any]:
    corpus_path = Path(path) if path else CORPUS_PATH
    with corpus_path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if payload.get("schema") != "aha_history_go_fagverk_corpus_v1":
        raise ValueError("Unsupported Fagverk corpus schema")
    if not isinstance(payload.get("entries"), list):
        raise ValueError("Fagverk corpus entries must be a list")
    return payload


def ground_message(message: str, corpus: dict[str, Any] | None = None) -> dict[str, Any]:
    normalized = _normalize(message)
    if len(normalized) < 24:
        return {"status": "unsupported", "reason": "source_too_short", "matches": []}

    payload = corpus or load_fagverk_corpus()
    matches: list[GroundingMatch] = []
    for entry in payload.get("entries", []):
        score, matched_terms = _entry_score(normalized, entry)
        if score <= 0:
            continue
        matches.append(
            GroundingMatch(
                subject_id=str(entry.get("subject_id") or ""),
                chapter_id=str(entry.get("chapter_id") or ""),
                primary_domain_id=str(entry.get("primary_domain_id") or entry.get("chapter_id") or ""),
                title=str(entry.get("title") or entry.get("chapter_id") or ""),
                source_path=str(entry.get("source_path") or ""),
                score=round(score, 3),
                confidence=_confidence(score, len(matched_terms)),
                matched_terms=matched_terms,
            )
        )

    matches.sort(key=lambda item: (-item.score, item.subject_id, item.chapter_id))
    if not matches:
        return {"status": "unsupported", "reason": "no_fagverk_evidence", "matches": []}

    top = matches[0]
    second = matches[1] if len(matches) > 1 else None
    minimum_score = 8.0
    minimum_terms = 2
    if top.score < minimum_score or len(top.matched_terms) < minimum_terms:
        return {
            "status": "unsupported",
            "reason": "insufficient_fagverk_evidence",
            "matches": [match.__dict__ for match in matches[:3]],
        }

    if second and second.score >= minimum_score and (top.score - second.score) < 3.0:
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
