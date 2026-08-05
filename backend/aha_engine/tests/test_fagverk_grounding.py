from __future__ import annotations

import json
from pathlib import Path

from app.engine.fagverk_grounding import analyze_message_with_fagverk, ground_message, load_fagverk_corpus
from app.schemas import AnalyzeRequest

ROOT = Path(__file__).resolve().parents[3]
EVALUATION_PATH = ROOT / "data" / "evaluation" / "aha-fagverk-grounding-cases.v1.json"


def test_corpus_schema_and_provenance() -> None:
    corpus = load_fagverk_corpus()
    assert corpus["schema"] == "aha_history_go_fagverk_corpus_v1"
    assert corpus["source_repo"] == "Paradispartiet/History-Go"
    assert corpus["source_ref"]
    assert all(entry.get("source_path") for entry in corpus["entries"])


def test_grounding_evaluation_cases() -> None:
    cases = json.loads(EVALUATION_PATH.read_text(encoding="utf-8"))["cases"]
    for case in cases:
        result = ground_message(case["text"])
        assert result["status"] in case["expected_status"], (case["id"], result)
        if result["status"] == "grounded":
            match = result["match"]
            assert match["subject_id"] == case["expected_subject_id"], (case["id"], result)
            assert match["chapter_id"] == case["expected_chapter_id"], (case["id"], result)
            assert len(match["matched_terms"]) >= 2


def test_grounded_analysis_replaces_generic_canned_fallback() -> None:
    request = AnalyzeRequest(
        message=(
            "Et enkelt artsfunn dokumenterer ikke en stabil bestand. Habitatkvalitet, konnektivitet, "
            "registreringsinnsats og utvikling over tid må vurderes før vi sier noe om økosystemets tilstand."
        )
    )
    analysis = analyze_message_with_fagverk(request)
    assert analysis.domain == "okosystem_mangfold_habitat"
    assert analysis.theme == "Økosystem, mangfold og habitat"
    assert "usikker årsaksforståelse" not in analysis.theme.casefold()
    assert any(link.type == "fagverk_chapter" and link.id == "okosystem_mangfold_habitat" for link in analysis.historyGoLinks)
    assert analysis.confidence.domain >= 0.65


def test_unsupported_personal_text_is_not_forced_into_fagverk() -> None:
    text = "Jeg sov dårlig og er litt sliten i dag, men håper ettermiddagen blir roligere."
    result = ground_message(text)
    assert result["status"] == "unsupported"
    analysis = analyze_message_with_fagverk(AnalyzeRequest(message=text))
    assert not any(link.type == "fagverk_chapter" for link in analysis.historyGoLinks)


def test_ambiguous_evidence_does_not_auto_choose_chapter() -> None:
    corpus = {
        "schema": "aha_history_go_fagverk_corpus_v1",
        "version": "test",
        "source_repo": "test",
        "source_ref": "test",
        "entries": [
            {
                "subject_id": "a",
                "chapter_id": "a",
                "primary_domain_id": "a",
                "title": "A",
                "source_path": "a.json",
                "title_terms": ["institusjon"],
                "concept_terms": ["makt", "representasjon"],
                "support_terms": [],
            },
            {
                "subject_id": "b",
                "chapter_id": "b",
                "primary_domain_id": "b",
                "title": "B",
                "source_path": "b.json",
                "title_terms": ["institusjon"],
                "concept_terms": ["makt", "representasjon"],
                "support_terms": [],
            },
        ],
    }
    result = ground_message("Institusjon, makt og representasjon må undersøkes sammen.", corpus)
    assert result["status"] == "ambiguous"
