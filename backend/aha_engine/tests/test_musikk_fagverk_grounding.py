from __future__ import annotations

import json
from pathlib import Path

from app.engine.fagverk_grounding import ground_message, load_fagverk_corpus

ROOT = Path(__file__).resolve().parents[3]
MATRIX_PATH = ROOT / "data" / "evaluation" / "aha-musikk-fagverk-evaluation-matrix.v1.json"
MANIFEST_PATH = ROOT / "data" / "integrations" / "history-go-fagverk-release.runtime-active.json"


def _musikk_only_corpus() -> dict:
    corpus = load_fagverk_corpus()
    return {
        "schema": corpus["schema"],
        "version": corpus["version"],
        "source_repo": corpus["source_repo"],
        "source_ref": corpus["source_ref"],
        "entries": [entry for entry in corpus["entries"] if entry["subject_id"] == "musikk"],
        "subject_policies": {"musikk": corpus["subject_policies"]["musikk"]},
    }


def test_musikk_is_materialized_in_shared_runtime() -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    musikk = manifest["active_subjects"]["musikk"]
    assert musikk["source_commit"] == "d52cebbe2c6c01e5780be301e9b0e4a9c61c5254"
    assert musikk["chapter_count"] == 8
    assert musikk["activation_status"] == "runtime_subject_active"
    assert musikk["corpus_path"] == "data/integrations/runtime/history-go-fagverk-musikk.corpus.v1.json"
    assert musikk["policy_path"] == "data/integrations/runtime/history-go-fagverk-musikk.policy.v1.json"
    assert manifest["effective_entry_count"] == 98


def test_musikk_runtime_uses_reviewed_anchor_projection_only() -> None:
    corpus = _musikk_only_corpus()
    policy = corpus["subject_policies"]["musikk"]
    assert len(corpus["entries"]) == 8
    assert policy["runtime_corpus_projection"] == "reviewed_anchor_projection_v1"
    assert policy["source_review_attestation_path"].endswith("history-go-fagverk-musikk.review-attestation.v1.json")
    assert policy["domain_gate"]["required"] is True
    for entry in corpus["entries"]:
        rule = policy["chapter_rules"][entry["chapter_id"]]
        assert entry["title_terms"] == rule["required_anchor_terms"]
        assert entry["concept_terms"] == []
        assert entry["support_terms"] == []
        assert entry["provenance"]["runtime_projection"] == "reviewed_anchor_projection_v1"


def test_all_reviewed_musikk_matrix_cases_pass_in_shared_python_runtime() -> None:
    matrix = json.loads(MATRIX_PATH.read_text(encoding="utf-8"))
    corpus = _musikk_only_corpus()
    assert len(matrix["positive_cases"]) == 16
    assert len(matrix["abstention_cases"]) == 8
    assert len({case["expected_chapter_id"] for case in matrix["positive_cases"]}) == 8

    for case in matrix["positive_cases"]:
        result = ground_message(case["text"], corpus)
        assert result["status"] == "grounded", (case["id"], result)
        assert result["match"]["subject_id"] == "musikk"
        assert result["match"]["chapter_id"] == case["expected_chapter_id"], (case["id"], result)
        assert result["match"]["scoring_mode"] == "subject_policy_v1"
        assert len(result["match"]["matched_terms"]) >= 2
        assert result["match"]["evidence"]
        for evidence in result["match"]["evidence"]:
            assert case["text"][evidence["start"]:evidence["end"]] == evidence["quote"]
            assert evidence["term"] in result["match"]["matched_terms"]

    for case in matrix["abstention_cases"]:
        result = ground_message(case["text"], corpus)
        assert result["status"] == "unsupported", (case["id"], result)
