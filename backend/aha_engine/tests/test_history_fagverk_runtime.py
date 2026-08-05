from __future__ import annotations

import json
from pathlib import Path

from app.engine.fagverk_grounding import ground_message, load_fagverk_corpus

ROOT = Path(__file__).resolve().parents[3]
MATRIX_PATH = ROOT / "data" / "evaluation" / "aha-history-fagverk-evaluation-matrix.v1.json"
CORRECTIONS_PATH = ROOT / "data" / "evaluation" / "aha-history-fixture-corrections.v1.json"


def _history_only_corpus() -> dict:
    corpus = load_fagverk_corpus()
    return {
        "schema": corpus["schema"],
        "version": corpus["version"],
        "source_repo": corpus["source_repo"],
        "source_ref": corpus["source_ref"],
        "entries": [entry for entry in corpus["entries"] if entry["subject_id"] == "historie"],
        "subject_policies": {"historie": corpus["subject_policies"]["historie"]},
    }


def test_history_runtime_policy_preserves_review_temporal_gate() -> None:
    corpus = _history_only_corpus()
    policy = corpus["subject_policies"]["historie"]
    assert policy["thresholds"] == {"minimum_score": 7, "minimum_terms": 2, "ambiguity_margin": 3}
    assert policy["temporal_gate"]["required"] is True

    without_time = ground_message(
        "Byfornyelse, gentrifisering og urban morfologi endrer eierskap og bruk av kvartalet.",
        corpus,
    )
    assert without_time["status"] == "unsupported"

    with_time = ground_message(
        "Over tid endret byfornyelse og gentrifisering både eierskap og bruk; urban morfologi viser stedsendringen.",
        corpus,
    )
    assert with_time["status"] == "grounded"
    assert with_time["match"]["chapter_id"] == "byhistorie_stedsendring"


def test_all_reviewed_history_matrix_cases_pass_in_python_runtime() -> None:
    matrix = json.loads(MATRIX_PATH.read_text(encoding="utf-8"))
    corpus = _history_only_corpus()
    positive = matrix["positive_cases"]
    confusion = matrix["confusion_cases"]
    ambiguity = matrix["ambiguity_cases"]
    assert len(positive) == 23
    assert len(confusion) == 23
    assert len(ambiguity) == 12

    for case in [*positive, *confusion]:
        result = ground_message(case["text"], corpus)
        assert result["status"] == case["expected_status"], (case["id"], result)
        assert result["match"]["subject_id"] == "historie", (case["id"], result)
        assert result["match"]["chapter_id"] == case["expected_chapter_id"], (case["id"], result)
        assert result["match"]["scoring_mode"] == "subject_policy_v1"
        assert result["match"]["chapter_id"] not in case.get("forbidden_chapter_ids", [])

    for case in ambiguity:
        result = ground_message(case["text"], corpus)
        assert result["status"] in case["allowed_statuses"], (case["id"], result)


def test_all_reviewed_history_fixture_corrections_pass_in_python_runtime() -> None:
    corrections = json.loads(CORRECTIONS_PATH.read_text(encoding="utf-8"))
    corpus = _history_only_corpus()
    assert len(corrections["cases"]) == 16

    for correction in corrections["cases"]:
        fixture = json.loads((ROOT / correction["fixture_path"]).read_text(encoding="utf-8"))
        result = ground_message(fixture["inputText"], corpus)
        assert result["status"] == correction["expected_history_status"], (correction["id"], result)
        if result["status"] == "grounded":
            assert result["match"]["subject_id"] == "historie", (correction["id"], result)
            assert result["match"]["chapter_id"] == correction["expected_chapter_id"], (correction["id"], result)


def test_grounded_history_fixtures_win_in_composed_runtime() -> None:
    corrections = json.loads(CORRECTIONS_PATH.read_text(encoding="utf-8"))
    for correction in corrections["cases"]:
        if correction["expected_history_status"] != "grounded":
            continue
        fixture = json.loads((ROOT / correction["fixture_path"]).read_text(encoding="utf-8"))
        result = ground_message(fixture["inputText"])
        assert result["status"] == "grounded", (correction["id"], result)
        assert result["match"]["subject_id"] == "historie", (correction["id"], result)
        assert result["match"]["chapter_id"] == correction["expected_chapter_id"], (correction["id"], result)
