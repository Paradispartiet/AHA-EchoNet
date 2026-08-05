from __future__ import annotations

import json
from pathlib import Path

from app.engine.fagverk_grounding import ground_message, load_fagverk_corpus

ROOT = Path(__file__).resolve().parents[3]
MATRIX_PATH = ROOT / "data" / "evaluation" / "aha-nature-fagverk-evaluation-matrix.v1.json"
CORRECTIONS_PATH = ROOT / "data" / "evaluation" / "aha-nature-fixture-corrections.v1.json"


def _nature_only_corpus() -> dict:
    corpus = load_fagverk_corpus()
    return {
        "schema": corpus["schema"],
        "version": corpus["version"],
        "source_repo": corpus["source_repo"],
        "source_ref": corpus["source_ref"],
        "entries": [entry for entry in corpus["entries"] if entry["subject_id"] == "natur"],
        "subject_policies": {"natur": corpus["subject_policies"]["natur"]},
    }


def test_nature_runtime_policy_preserves_review_domain_gate() -> None:
    corpus = _nature_only_corpus()
    policy = corpus["subject_policies"]["natur"]
    assert policy["thresholds"] == {"minimum_score": 7, "minimum_terms": 2, "ambiguity_margin": 3}
    assert policy["domain_gate"]["required"] is True
    assert "artsbestemmelse" in policy["domain_gate"]["terms"]
    assert "hydrologi" in policy["domain_gate"]["terms"]
    assert "temporal_gate" not in policy

    generic = ground_message(
        "Forvaltning, ressurser, tiltak og langsiktig utvikling må vurderes samlet.",
        corpus,
    )
    assert generic["status"] == "unsupported"

    ecological = ground_message(
        "Næringsnett vurderes som økologisk næringsnett sammen med målt habitatkvalitet og populasjon og bestand.",
        corpus,
    )
    assert ecological["status"] == "grounded"
    assert ecological["match"]["chapter_id"] == "okosystem_mangfold_habitat"


def test_all_reviewed_nature_matrix_cases_pass_in_python_runtime() -> None:
    matrix = json.loads(MATRIX_PATH.read_text(encoding="utf-8"))
    corpus = _nature_only_corpus()
    assert len(matrix["positive_cases"]) == 11
    assert len(matrix["confusion_cases"]) == 11
    assert len(matrix["ambiguity_cases"]) == 12

    for case in [*matrix["positive_cases"], *matrix["confusion_cases"]]:
        result = ground_message(case["text"], corpus)
        assert result["status"] == case["expected_status"], (case["id"], result)
        assert result["match"]["subject_id"] == "natur", (case["id"], result)
        assert result["match"]["chapter_id"] == case["expected_chapter_id"], (case["id"], result)
        assert result["match"]["scoring_mode"] == "subject_policy_v1"
        assert result["match"]["chapter_id"] not in case.get("forbidden_chapter_ids", [])

    for case in matrix["ambiguity_cases"]:
        result = ground_message(case["text"], corpus)
        assert result["status"] in case["allowed_statuses"], (case["id"], result)


def test_all_reviewed_nature_fixture_corrections_pass_in_python_runtime() -> None:
    corrections = json.loads(CORRECTIONS_PATH.read_text(encoding="utf-8"))
    corpus = _nature_only_corpus()
    assert len(corrections["cases"]) == 16

    for correction in corrections["cases"]:
        fixture = json.loads((ROOT / correction["fixture_path"]).read_text(encoding="utf-8"))
        result = ground_message(fixture["inputText"], corpus)
        assert result["status"] == correction["expected_nature_status"], (correction["id"], result)
        assert result.get("match", {}).get("chapter_id") == correction["expected_chapter_id"]


def test_nature_positive_cases_win_in_composed_runtime() -> None:
    matrix = json.loads(MATRIX_PATH.read_text(encoding="utf-8"))
    for case in matrix["positive_cases"]:
        result = ground_message(case["text"])
        assert result["status"] == "grounded", (case["id"], result)
        assert result["match"]["subject_id"] == "natur", (case["id"], result)
        assert result["match"]["chapter_id"] == case["expected_chapter_id"], (case["id"], result)


def test_nature_abstentions_do_not_override_other_subjects() -> None:
    corrections = json.loads(CORRECTIONS_PATH.read_text(encoding="utf-8"))
    for correction in corrections["cases"]:
        fixture = json.loads((ROOT / correction["fixture_path"]).read_text(encoding="utf-8"))
        result = ground_message(fixture["inputText"])
        assert not (
            result["status"] == "grounded" and result["match"]["subject_id"] == "natur"
        ), (correction["id"], result)
