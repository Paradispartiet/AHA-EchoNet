from __future__ import annotations

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def write(path: str, value):
    (ROOT / path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def replace(path: str, old: str, new: str, count: int = 1):
    p = ROOT / path
    text = p.read_text(encoding="utf-8")
    actual = text.count(old)
    if actual != count:
        raise RuntimeError(f"{path}: expected {count} occurrences, got {actual}: {old[:100]}")
    p.write_text(text.replace(old, new), encoding="utf-8")

# 1) Register Subculture as an explicit runtime subject.
registry_path = "data/integrations/runtime/history-go-fagverk-runtime-registry.v1.json"
registry = read(registry_path)
registry["version"] = "1.3.0"
registry["active_subjects"]["subkultur"] = {
    "subject_id": "subkultur",
    "approval_path": "data/integrations/approvals/history-go-fagverk-subkultur.approved.v1.json",
    "candidate_corpus_path": "data/integrations/candidates/history-go-fagverk-subkultur.candidate.v1.json",
    "review_policy_path": "data/integrations/review/history-go-fagverk-subkultur.term-policy.v1.json",
    "review_policy_config_path": "data/integrations/review/history-go-fagverk-subkultur.policy-config.v1.json",
    "runtime_corpus_path": "data/integrations/runtime/history-go-fagverk-subkultur.corpus.v1.json",
    "runtime_policy_path": "data/integrations/runtime/history-go-fagverk-subkultur.policy.v1.json",
    "scoring_mode": "subject_policy_v1",
    "minimum_score": 7,
    "minimum_terms": 2,
    "minimum_reviewed_evidence_terms": 2,
    "ambiguity_margin": 3,
}
registry["active_subjects"] = {k: registry["active_subjects"][k] for k in sorted(registry["active_subjects"])}
write(registry_path, registry)

# 2) Update deterministic JS runtime contract.
runtime_test = "tests/aha-fagverk-runtime-activation.test.cjs"
replace(runtime_test,
        "assert.deepEqual(subjectIds, ['historie', 'naeringsliv', 'natur', 'politikk']);",
        "assert.deepEqual(subjectIds, ['historie', 'naeringsliv', 'natur', 'politikk', 'subkultur']);")
replace(runtime_test,
        "  natur: {\n    sourceRef: 'c16a187453d16a40f9cab4ca694c32e96014f31b',",
        "  subkultur: {\n    sourceRef: 'c16a187453d16a40f9cab4ca694c32e96014f31b',\n    corpusSha: 'e554b96513313139898a44e98f374d9fea2f01e8c8e8b015dcc5d6fdfa60d7f8',\n    chapterCount: 8,\n    thresholds: { minimum_score: 7, minimum_terms: 2, minimum_reviewed_evidence_terms: 2, ambiguity_margin: 3 },\n  },\n  natur: {\n    sourceRef: 'c16a187453d16a40f9cab4ca694c32e96014f31b',")
replace(runtime_test,
        "  } else if (subjectId === 'natur') {",
        "  } else if (subjectId === 'subkultur') {\n    assert.equal(policy.temporal_gate, undefined);\n    assert.equal(policy.domain_gate.required, true);\n    assert.equal(policy.domain_gate.terms.includes('moralpanikk'), true);\n    assert.equal(policy.domain_gate.terms.includes('subkulturell kapital'), true);\n    assert.equal(policy.policy_rules.candidate_title_concept_support_terms, 'non_decisive_review_context_only');\n    assert.equal(policy.source_policy_config_path, 'data/integrations/review/history-go-fagverk-subkultur.policy-config.v1.json');\n    assert.match(policy.source_policy_config_sha256, /^[0-9a-f]{64}$/);\n    assert.equal(Object.keys(policy.chapter_rules).length, 8);\n  } else if (subjectId === 'natur') {")
replace(runtime_test, "assert.equal(active.effective_entry_count, 59);", "assert.equal(active.effective_entry_count, 67);")

# 3) Review/approval transition guards: approval artifacts remain review-only; runtime materialization is separate.
replace("tests/aha-subculture-fagverk-review.test.cjs",
        'assert.equal(runtime.active_subjects?.subkultur,undefined);assert.deepEqual(Object.keys(runtime.active_subjects),["historie","naeringsliv","natur","politikk"]);assert.equal(runtime.effective_entry_count,59);',
        'const activeSubculture=runtime.active_subjects?.subkultur;assert.equal(activeSubculture.subject_id,"subkultur");assert.equal(activeSubculture.chapter_count,8);assert.equal(activeSubculture.activation_status,"runtime_subject_active");assert.deepEqual(Object.keys(runtime.active_subjects),["historie","naeringsliv","natur","politikk","subkultur"]);assert.equal(runtime.effective_entry_count,67);')

replace("tests/aha-business-fagverk-review.test.cjs",
        "assert.equal(runtime.effective_entry_count, 59);",
        "assert.equal(runtime.effective_entry_count, 67);")
replace("tests/aha-business-fagverk-review.test.cjs",
        "assert.deepEqual(Object.keys(runtime.active_subjects), ['historie', 'naeringsliv', 'natur', 'politikk']);",
        "assert.deepEqual(Object.keys(runtime.active_subjects), ['historie', 'naeringsliv', 'natur', 'politikk', 'subkultur']);")
replace("tests/aha-history-fagverk-review.test.cjs", "assert.equal(runtime.effective_entry_count, 59);", "assert.equal(runtime.effective_entry_count, 67);")
replace("tests/aha-nature-fagverk-review.test.cjs", "assert.equal(runtime.effective_entry_count, 59);", "assert.equal(runtime.effective_entry_count, 67);")
replace("tests/aha-nature-fagverk-review.test.cjs",
        "assert.deepEqual(Object.keys(runtime.active_subjects), [\"historie\", \"naeringsliv\", \"natur\", \"politikk\"]);",
        "assert.deepEqual(Object.keys(runtime.active_subjects), [\"historie\", \"naeringsliv\", \"natur\", \"politikk\", \"subkultur\"]);")

approval_test = "tests/aha-fagverk-subject-approvals.test.cjs"
replace(approval_test,
        "assert.deepEqual(Object.keys(runtimeActive.active_subjects), ['historie', 'naeringsliv', 'natur', 'politikk']);",
        "assert.deepEqual(Object.keys(runtimeActive.active_subjects), ['historie', 'naeringsliv', 'natur', 'politikk', 'subkultur']);")
replace(approval_test,
        "assert.equal(runtimeActive.active_subjects.subkultur, undefined);",
        "assert.equal(runtimeActive.active_subjects.subkultur.subject_id, 'subkultur');\nassert.equal(runtimeActive.active_subjects.subkultur.chapter_count, 8);\nassert.equal(runtimeActive.active_subjects.subkultur.activation_status, 'runtime_subject_active');")
replace(approval_test, "assert.equal(runtimeActive.effective_entry_count, 59);", "assert.equal(runtimeActive.effective_entry_count, 67);")

# 4) Observation boundary: observed whole release still stays distinct while five explicit subjects are active.
obs = "tests/aha-history-go-fagverk-release-observation.test.cjs"
for old, new in [
    ("['historie', 'naeringsliv', 'natur', 'politikk']", "['historie', 'naeringsliv', 'natur', 'politikk', 'subkultur']"),
]:
    replace(obs, old, new, count=4)
replace(obs,
        "  const approvedNature = approved.approved_subjects.natur;",
        "  const approvedSubculture = approved.approved_subjects.subkultur;\n  assert.equal(approvedSubculture.source_commit, observed.source_commit);\n  assert.equal(approvedSubculture.corpus_path.startsWith('data/integrations/runtime/'), true);\n  assert.equal(approvedSubculture.policy_path.startsWith('data/integrations/runtime/'), true);\n  assert.equal(approvedSubculture.chapter_count, 8);\n  assert.equal(approvedSubculture.scoring_mode, 'subject_policy_v1');\n\n  const approvedNature = approved.approved_subjects.natur;")
replace(obs,
        "  const activeNature = runtimeActive.active_subjects.natur;",
        "  const activeSubculture = runtimeActive.active_subjects.subkultur;\n  assert.equal(activeSubculture.source_commit, observed.source_commit);\n  assert.equal(activeSubculture.corpus_path, approvedSubculture.corpus_path);\n  assert.equal(activeSubculture.policy_path, approvedSubculture.policy_path);\n  assert.equal(activeSubculture.chapter_count, 8);\n  assert.equal(activeSubculture.scoring_mode, 'subject_policy_v1');\n\n  const activeNature = runtimeActive.active_subjects.natur;")
replace(obs, "  assert.equal(runtimeActive.effective_entry_count, 59);", "  assert.equal(runtimeActive.effective_entry_count, 67);")

# 5) Python parity for all reviewed Subculture cases and canonical abstentions.
py = "backend/aha_engine/tests/test_fagverk_grounding.py"
replace(py,
        'BUSINESS_CORRECTIONS_PATH = ROOT / "data" / "evaluation" / "aha-business-fixture-corrections.v1.json"\nACTIVE_MANIFEST_PATH',
        'BUSINESS_CORRECTIONS_PATH = ROOT / "data" / "evaluation" / "aha-business-fixture-corrections.v1.json"\nSUBCULTURE_MATRIX_PATH = ROOT / "data" / "evaluation" / "aha-subculture-fagverk-evaluation-matrix.v1.json"\nSUBCULTURE_CORRECTIONS_PATH = ROOT / "data" / "evaluation" / "aha-subculture-fixture-corrections.v1.json"\nACTIVE_MANIFEST_PATH')
replace(py,
        '\n\ndef test_corpus_schema_and_provenance() -> None:',
        '\n\ndef _subculture_only_corpus() -> dict:\n    corpus = load_fagverk_corpus()\n    return {\n        "schema": corpus["schema"],\n        "version": corpus["version"],\n        "source_repo": corpus["source_repo"],\n        "source_ref": corpus["source_ref"],\n        "entries": [entry for entry in corpus["entries"] if entry["subject_id"] == "subkultur"],\n        "subject_policies": {"subkultur": corpus["subject_policies"]["subkultur"]},\n    }\n\n\ndef test_corpus_schema_and_provenance() -> None:')
replace(py, '    assert len(corpus["entries"]) == 59', '    assert len(corpus["entries"]) == 67')
replace(py,
        '    assert set(corpus["subject_policies"]) == {"historie", "naeringsliv", "natur", "politikk"}',
        '    subculture_entries = [entry for entry in corpus["entries"] if entry["subject_id"] == "subkultur"]\n    assert len(subculture_entries) == 8\n    assert len({entry["chapter_id"] for entry in subculture_entries}) == 8\n    assert set(corpus["subject_policies"]) == {"historie", "naeringsliv", "natur", "politikk", "subkultur"}')
replace(py, '    assert manifest["effective_entry_count"] == 59', '    assert manifest["effective_entry_count"] == 67')
replace(py,
        '    assert set(manifest["active_subjects"]) == {"historie", "naeringsliv", "natur", "politikk"}',
        '    assert set(manifest["active_subjects"]) == {"historie", "naeringsliv", "natur", "politikk", "subkultur"}')
replace(py,
        '    politics = manifest["active_subjects"]["politikk"]',
        '    subculture = manifest["active_subjects"]["subkultur"]\n    assert subculture["chapter_count"] == 8\n    assert subculture["source_commit"] == "c16a187453d16a40f9cab4ca694c32e96014f31b"\n    assert subculture["corpus_path"].startswith("data/integrations/runtime/")\n    assert subculture["policy_path"].startswith("data/integrations/runtime/")\n    assert "/review/" not in subculture["corpus_path"]\n    assert "/review/" not in subculture["policy_path"]\n    politics = manifest["active_subjects"]["politikk"]')
insert = '''\n\ndef test_all_reviewed_subculture_matrix_cases_pass_in_python_runtime() -> None:\n    matrix = json.loads(SUBCULTURE_MATRIX_PATH.read_text(encoding="utf-8"))\n    subculture_corpus = _subculture_only_corpus()\n    cases = [\n        *(dict(item, kind="positive") for item in matrix["positive_cases"]),\n        *(dict(item, kind="confusion") for item in matrix["confusion_cases"]),\n        *(dict(item, kind="ambiguity") for item in matrix["ambiguity_cases"]),\n    ]\n    assert len(cases) == 28\n    for case in cases:\n        result = ground_message(case["text"], subculture_corpus)\n        if case["kind"] == "ambiguity":\n            assert result["status"] in case["allowed_statuses"], (case["id"], result)\n            continue\n        assert result["status"] == case["expected_status"], (case["id"], result)\n        assert result["match"]["subject_id"] == "subkultur", (case["id"], result)\n        assert result["match"]["chapter_id"] == case["expected_chapter_id"], (case["id"], result)\n        assert result["match"]["scoring_mode"] == "subject_policy_v1"\n\n\ndef test_all_reviewed_subculture_fixture_abstentions_pass_in_python_runtime() -> None:\n    corrections = json.loads(SUBCULTURE_CORRECTIONS_PATH.read_text(encoding="utf-8"))\n    subculture_corpus = _subculture_only_corpus()\n    assert len(corrections["cases"]) == 16\n    for correction in corrections["cases"]:\n        fixture = json.loads((ROOT / correction["fixture_path"]).read_text(encoding="utf-8"))\n        result = ground_message(fixture["inputText"], subculture_corpus)\n        assert result["status"] == correction["expected_subculture_status"], (correction["id"], result)\n        assert correction["expected_chapter_id"] is None\n'''
replace(py, '\n\ndef test_grounded_analysis_replaces_generic_canned_fallback() -> None:', insert + '\n\ndef test_grounded_analysis_replaces_generic_canned_fallback() -> None:')

# 6) Materialize runtime files and manifests, then verify deterministic JS contracts.
subprocess.run(["node", "scripts/build-history-go-fagverk-runtime-activation.mjs"], cwd=ROOT, check=True)
subprocess.run(["node", "tests/aha-fagverk-runtime-activation.test.cjs"], cwd=ROOT, check=True)
subprocess.run(["node", "tests/aha-subculture-fagverk-review.test.cjs"], cwd=ROOT, check=True)
subprocess.run(["node", "tests/aha-fagverk-subject-approvals.test.cjs"], cwd=ROOT, check=True)
subprocess.run(["node", "tests/aha-history-go-fagverk-release-observation.test.cjs"], cwd=ROOT, check=True)

print("Subculture runtime activation materialized: 5 active subjects, 67 effective entries")
