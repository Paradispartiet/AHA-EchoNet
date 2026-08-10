from __future__ import annotations

import json
from pathlib import Path

from app.engine.fagverk_grounding import analyze_message_with_fagverk, ground_message, load_fagverk_corpus
from app.schemas import AnalyzeRequest

ROOT = Path(__file__).resolve().parents[3]
EVALUATION_PATH = ROOT / "data" / "evaluation" / "aha-fagverk-grounding-cases.v1.json"
POLITICS_MATRIX_PATH = ROOT / "data" / "evaluation" / "aha-politics-fagverk-evaluation-matrix.v1.json"
POLITICS_CORRECTIONS_PATH = ROOT / "data" / "evaluation" / "aha-politics-fixture-corrections.v1.json"
NATURE_MATRIX_PATH = ROOT / "data" / "evaluation" / "aha-nature-fagverk-evaluation-matrix.v1.json"
NATURE_CORRECTIONS_PATH = ROOT / "data" / "evaluation" / "aha-nature-fixture-corrections.v1.json"
BUSINESS_MATRIX_PATH = ROOT / "data" / "evaluation" / "aha-business-fagverk-evaluation-matrix.v1.json"
BUSINESS_CORRECTIONS_PATH = ROOT / "data" / "evaluation" / "aha-business-fixture-corrections.v1.json"
SUBCULTURE_MATRIX_PATH = ROOT / "data" / "evaluation" / "aha-subculture-fagverk-evaluation-matrix.v1.json"
SUBCULTURE_CORRECTIONS_PATH = ROOT / "data" / "evaluation" / "aha-subculture-fixture-corrections.v1.json"
BY_MATRIX_PATH = ROOT / "data" / "evaluation" / "aha-by-fagverk-evaluation-matrix.v1.json"
ACTIVE_MANIFEST_PATH = ROOT / "data" / "integrations" / "history-go-fagverk-release.runtime-active.json"


def _subject_only_corpus(subject_id: str) -> dict:
    corpus = load_fagverk_corpus()
    return {
        "schema": corpus["schema"],
        "version": corpus["version"],
        "source_repo": corpus["source_repo"],
        "source_ref": corpus["source_ref"],
        "entries": [entry for entry in corpus["entries"] if entry["subject_id"] == subject_id],
        "subject_policies": {subject_id: corpus["subject_policies"][subject_id]},
    }


def _politics_only_corpus() -> dict:
    return _subject_only_corpus("politikk")


def _business_only_corpus() -> dict:
    return _subject_only_corpus("naeringsliv")


def _subculture_only_corpus() -> dict:
    return _subject_only_corpus("subkultur")


def _by_only_corpus() -> dict:
    return _subject_only_corpus("by")


def test_corpus_schema_and_provenance() -> None:
    corpus = load_fagverk_corpus()
    assert corpus["schema"] == "aha_history_go_fagverk_corpus_v1"
    assert corpus["version"] == "2.0.0"
    assert corpus["status"] == "composed_partial_subject_runtime_corpus"
    assert corpus["source_repo"] == "Paradispartiet/History-Go"
    assert corpus["source_ref"]
    assert len(corpus["entries"]) == 84
    assert all(entry.get("source_path") for entry in corpus["entries"])
    expected_counts = {"by": 17, "historie": 23, "naeringsliv": 12, "natur": 11, "politikk": 13, "subkultur": 8}
    for subject_id, count in expected_counts.items():
        entries = [entry for entry in corpus["entries"] if entry["subject_id"] == subject_id]
        assert len(entries) == count
        assert len({entry["chapter_id"] for entry in entries}) == count
    assert set(corpus["subject_policies"]) == set(expected_counts)


def test_runtime_manifest_uses_materialized_subject_artifacts_only() -> None:
    manifest = json.loads(ACTIVE_MANIFEST_PATH.read_text(encoding="utf-8"))
    assert manifest["schema"] == "aha_history_go_fagverk_runtime_active_v2"
    assert manifest["status"] == "partial_subject_runtime_active"
    assert manifest["effective_entry_count"] == 84
    assert set(manifest["active_subjects"]) == {"by", "historie", "naeringsliv", "natur", "politikk", "subkultur"}
    expected = {"by": 17, "historie": 23, "naeringsliv": 12, "natur": 11, "politikk": 13, "subkultur": 8}
    for subject_id, chapter_count in expected.items():
        item = manifest["active_subjects"][subject_id]
        assert item["chapter_count"] == chapter_count
        assert item["corpus_path"].startswith("data/integrations/runtime/")
        assert item["policy_path"].startswith("data/integrations/runtime/")
        assert "/review/" not in item["corpus_path"]
        assert "/review/" not in item["policy_path"]
        assert "/approvals/" not in item["corpus_path"]
        assert "/approvals/" not in item["policy_path"]
    assert manifest["active_subjects"]["by"]["source_commit"] == "d52cebbe2c6c01e5780be301e9b0e4a9c61c5254"


def test_by_runtime_uses_reviewed_anchor_projection_only() -> None:
    corpus = _by_only_corpus()
    policy = corpus["subject_policies"]["by"]
    assert len(corpus["entries"]) == 17
    assert policy["runtime_corpus_projection"] == "reviewed_anchor_projection_v1"
    assert policy["source_review_attestation_path"].endswith("history-go-fagverk-by.review-attestation.v1.json")
    for entry in corpus["entries"]:
        assert entry["title_terms"] == policy["chapter_rules"][entry["chapter_id"]]["required_anchor_terms"]
        assert entry["concept_terms"] == []
        assert entry["support_terms"] == []
        assert entry["provenance"]["runtime_projection"] == "reviewed_anchor_projection_v1"


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


def test_all_reviewed_by_matrix_cases_pass_in_python_runtime() -> None:
    matrix = json.loads(BY_MATRIX_PATH.read_text(encoding="utf-8"))
    by_corpus = _by_only_corpus()
    assert len(matrix["positive_cases"]) == 34
    assert len(matrix["abstention_cases"]) == 8
    for case in matrix["positive_cases"]:
        result = ground_message(case["text"], by_corpus)
        assert result["status"] == case["expected_status"], (case["id"], result)
        assert result["match"]["subject_id"] == "by"
        assert result["match"]["chapter_id"] == case["expected_chapter_id"], (case["id"], result)
        assert result["match"]["scoring_mode"] == "subject_policy_v1"
        assert len(result["match"]["matched_terms"]) >= 2
        assert result["match"]["evidence"]
        for evidence in result["match"]["evidence"]:
            assert case["text"][evidence["start"]:evidence["end"]] == evidence["quote"]
            assert evidence["term"] in result["match"]["matched_terms"]
    for case in matrix["abstention_cases"]:
        result = ground_message(case["text"], by_corpus)
        assert result["status"] == case["expected_status"], (case["id"], result)


def test_all_reviewed_politics_matrix_cases_pass_in_python_runtime() -> None:
    matrix = json.loads(POLITICS_MATRIX_PATH.read_text(encoding="utf-8"))
    politics_corpus = _politics_only_corpus()
    cases = [
        *(dict(item, kind="positive") for item in matrix["positive_cases"]),
        *(dict(item, kind="confusion") for item in matrix["confusion_cases"]),
        *(dict(item, kind="ambiguity") for item in matrix["ambiguity_cases"]),
    ]
    assert len(cases) == 34
    for case in cases:
        result = ground_message(case["text"], politics_corpus)
        if case["kind"] == "ambiguity":
            assert result["status"] in case["allowed_statuses"], (case["id"], result)
            continue
        assert result["status"] == case["expected_status"], (case["id"], result)
        assert result["match"]["subject_id"] == "politikk", (case["id"], result)
        assert result["match"]["chapter_id"] == case["expected_chapter_id"], (case["id"], result)
        assert result["match"]["scoring_mode"] == "subject_policy_v1"
        assert result["match"]["chapter_id"] not in case.get("forbidden_chapter_ids", [])


def test_all_reviewed_fixture_corrections_pass_in_python_runtime() -> None:
    corrections = json.loads(POLITICS_CORRECTIONS_PATH.read_text(encoding="utf-8"))
    politics_corpus = _politics_only_corpus()
    assert len(corrections["cases"]) == 16
    for correction in corrections["cases"]:
        fixture = json.loads((ROOT / correction["fixture_path"]).read_text(encoding="utf-8"))
        result = ground_message(fixture["inputText"], politics_corpus)
        expected_status = correction["expected_politics_status"]
        assert result["status"] == expected_status, (correction["id"], result)
        if expected_status == "grounded":
            assert result["match"]["subject_id"] == "politikk", (correction["id"], result)
            assert result["match"]["chapter_id"] == correction["expected_chapter_id"], (correction["id"], result)
            assert result["match"]["chapter_id"] not in correction.get("forbidden_chapter_ids", [])


def test_all_reviewed_business_matrix_cases_pass_in_python_runtime() -> None:
    matrix = json.loads(BUSINESS_MATRIX_PATH.read_text(encoding="utf-8"))
    business_corpus = _business_only_corpus()
    cases = [
        *(dict(item, kind="positive") for item in matrix["positive_cases"]),
        *(dict(item, kind="confusion") for item in matrix["confusion_cases"]),
        *(dict(item, kind="ambiguity") for item in matrix["ambiguity_cases"]),
    ]
    assert len(cases) == 36
    for case in cases:
        result = ground_message(case["text"], business_corpus)
        if case["kind"] == "ambiguity":
            assert result["status"] in case["allowed_statuses"], (case["id"], result)
            continue
        assert result["status"] == case["expected_status"], (case["id"], result)
        assert result["match"]["subject_id"] == "naeringsliv", (case["id"], result)
        assert result["match"]["chapter_id"] == case["expected_chapter_id"], (case["id"], result)
        assert result["match"]["scoring_mode"] == "subject_policy_v1"
        assert result["match"]["chapter_id"] not in case.get("forbidden_chapter_ids", [])


def test_all_reviewed_business_fixture_abstentions_pass_in_python_runtime() -> None:
    corrections = json.loads(BUSINESS_CORRECTIONS_PATH.read_text(encoding="utf-8"))
    business_corpus = _business_only_corpus()
    assert len(corrections["cases"]) == 16
    for correction in corrections["cases"]:
        fixture = json.loads((ROOT / correction["fixture_path"]).read_text(encoding="utf-8"))
        result = ground_message(fixture["inputText"], business_corpus)
        assert result["status"] == correction["expected_business_status"], (correction["id"], result)
        assert correction["expected_chapter_id"] is None


def test_all_reviewed_subculture_matrix_cases_pass_in_python_runtime() -> None:
    matrix = json.loads(SUBCULTURE_MATRIX_PATH.read_text(encoding="utf-8"))
    subculture_corpus = _subculture_only_corpus()
    cases = [
        *(dict(item, kind="positive") for item in matrix["positive_cases"]),
        *(dict(item, kind="confusion") for item in matrix["confusion_cases"]),
        *(dict(item, kind="ambiguity") for item in matrix["ambiguity_cases"]),
    ]
    assert len(cases) == 28
    for case in cases:
        result = ground_message(case["text"], subculture_corpus)
        if case["kind"] == "ambiguity":
            assert result["status"] in case["allowed_statuses"], (case["id"], result)
            continue
        assert result["status"] == case["expected_status"], (case["id"], result)
        assert result["match"]["subject_id"] == "subkultur", (case["id"], result)
        assert result["match"]["chapter_id"] == case["expected_chapter_id"], (case["id"], result)
        assert result["match"]["scoring_mode"] == "subject_policy_v1"


def test_all_reviewed_subculture_fixture_abstentions_pass_in_python_runtime() -> None:
    corrections = json.loads(SUBCULTURE_CORRECTIONS_PATH.read_text(encoding="utf-8"))
    subculture_corpus = _subculture_only_corpus()
    assert len(corrections["cases"]) == 16
    for correction in corrections["cases"]:
        fixture = json.loads((ROOT / correction["fixture_path"]).read_text(encoding="utf-8"))
        result = ground_message(fixture["inputText"], subculture_corpus)
        assert result["status"] == correction["expected_subculture_status"], (correction["id"], result)
        assert correction["expected_chapter_id"] is None


def test_grounded_analysis_exposes_source_evidence() -> None:
    message = (
        "Ett artsfunn er ikke det samme som en bestand. Næringsnett vurderes som økologisk "
        "næringsnett sammen med målt habitatkvalitet og populasjon og bestand før vi trekker "
        "en bestandskonklusjon."
    )
    result = ground_message(message)
    assert result["status"] == "grounded"
    assert result["match"]["evidence"]
    for evidence in result["match"]["evidence"]:
        assert message[evidence["start"]:evidence["end"]] == evidence["quote"]
    analysis = analyze_message_with_fagverk(AnalyzeRequest(message=message))
    assert analysis.domain == "okosystem_mangfold_habitat"
    primary = next(link for link in analysis.historyGoLinks if link.type == "fagverk_chapter" and link.id == "okosystem_mangfold_habitat")
    assert primary.evidence
    assert primary.evidence[0].quote in message
    assert analysis.confidence.domain >= 0.65


def test_related_cross_subject_matches_are_exposed_without_replacing_primary() -> None:
    corpus = {
        "schema": "aha_history_go_fagverk_corpus_v1",
        "version": "test",
        "source_repo": "test",
        "source_ref": "test",
        "entries": [
            {"subject_id":"a","chapter_id":"a","primary_domain_id":"a","title":"A","source_path":"a.json","title_terms":["anker_a","anker_b","anker_c"],"concept_terms":[],"support_terms":[]},
            {"subject_id":"b","chapter_id":"b","primary_domain_id":"b","title":"B","source_path":"b.json","title_terms":["bro_a","bro_b"],"concept_terms":[],"support_terms":[]},
        ],
    }
    result = ground_message("Anker_a anker_b anker_c og bro_a bro_b beskriver samme sak med ulike faglige innganger.", corpus)
    assert result["status"] == "grounded"
    assert result["match"]["subject_id"] == "a"
    assert len(result["related_matches"]) == 1
    assert result["related_matches"][0]["subject_id"] == "b"


def test_high_confidence_specialized_analysis_is_not_mutated() -> None:
    fixture = json.loads((ROOT / "docs/fixtures/aha-analysis/07-juridisk-tekst.json").read_text(encoding="utf-8"))
    expected = fixture["expectedCanonicalAnalysis"]
    analysis = analyze_message_with_fagverk(AnalyzeRequest(message=fixture["inputText"]))
    assert analysis.domain == expected["domain"]
    assert analysis.theme == expected["theme"]
    assert analysis.mainTension == expected["mainTension"]
    assert [link.model_dump() for link in analysis.historyGoLinks] == expected["historyGoLinks"]


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
            {"subject_id":"a","chapter_id":"a","primary_domain_id":"a","title":"A","source_path":"a.json","title_terms":["institusjon"],"concept_terms":["makt","representasjon"],"support_terms":[]},
            {"subject_id":"b","chapter_id":"b","primary_domain_id":"b","title":"B","source_path":"b.json","title_terms":["institusjon"],"concept_terms":["makt","representasjon"],"support_terms":[]},
        ],
    }
    result = ground_message("Institusjon, makt og representasjon må undersøkes sammen.", corpus)
    assert result["status"] == "ambiguous"
