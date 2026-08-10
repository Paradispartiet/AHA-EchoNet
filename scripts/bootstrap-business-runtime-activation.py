from __future__ import annotations

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_REF = "c16a187453d16a40f9cab4ca694c32e96014f31b"
CORPUS_SHA = "a1c399977c2656d567ee461228b8e7d21f457da8e0863bf53a7888a8ac5fbfea"


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")


def read_json(path: str):
    return json.loads(read(path))


def write_json(path: str, value) -> None:
    write(path, json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one occurrence, found {count}")
    return text.replace(old, new)


# 1. Register Business as an explicitly activated subject.
registry_path = "data/integrations/runtime/history-go-fagverk-runtime-registry.v1.json"
registry = read_json(registry_path)
registry["version"] = "1.2.0"
registry["active_subjects"]["naeringsliv"] = {
    "subject_id": "naeringsliv",
    "approval_path": "data/integrations/approvals/history-go-fagverk-naeringsliv.approved.v1.json",
    "candidate_corpus_path": "data/integrations/candidates/history-go-fagverk-naeringsliv.candidate.v1.json",
    "review_policy_path": "data/integrations/review/history-go-fagverk-naeringsliv.term-policy.v1.json",
    "review_policy_config_path": "data/integrations/review/history-go-fagverk-naeringsliv.policy-config.v1.json",
    "runtime_corpus_path": "data/integrations/runtime/history-go-fagverk-naeringsliv.corpus.v1.json",
    "runtime_policy_path": "data/integrations/runtime/history-go-fagverk-naeringsliv.policy.v1.json",
    "scoring_mode": "subject_policy_v1",
    "minimum_score": 7,
    "minimum_terms": 2,
    "minimum_reviewed_evidence_terms": 2,
    "ambiguity_margin": 3,
}
registry["active_subjects"] = {key: registry["active_subjects"][key] for key in sorted(registry["active_subjects"])}
write_json(registry_path, registry)

# 2. Teach the generic materializer how to hydrate a separately reviewed policy config.
builder_path = "scripts/build-history-go-fagverk-runtime-activation.mjs"
builder = read(builder_path)
validate_marker = '''function validateApproval(config, approval) {
  if (approval.schema !== "aha_history_go_fagverk_subject_approval_v1") throw new Error(`${config.subject_id}: unsupported approval schema.`);
  if (approval.status !== "subject_review_approved_not_runtime_active") throw new Error(`${config.subject_id}: subject review is not approved.`);
  if (approval.subject_id !== config.subject_id) throw new Error(`${config.subject_id}: approval subject mismatch.`);
  if (approval.gate_summary?.failed !== 0 || approval.gate_summary?.passed !== approval.gate_summary?.total) {
    throw new Error(`${config.subject_id}: one or more subject approval gates failed.`);
  }
  if (approval.runtime_activation_allowed !== false || approval.explicit_runtime_activation_pull_request_required !== true) {
    throw new Error(`${config.subject_id}: approval does not require this explicit activation boundary.`);
  }
}
'''
hydrator = validate_marker + '''
function hydrateReviewPolicy(config, reviewPolicy, candidate) {
  const configPath = config.review_policy_config_path;
  if (!configPath) return reviewPolicy;
  const policyConfig = readJson(configPath);
  if (policyConfig.subject_id !== config.subject_id) throw new Error(`${config.subject_id}: policy config subject mismatch.`);
  if (policyConfig.source_ref !== reviewPolicy.source_ref || policyConfig.source_ref !== candidate.source_ref) {
    throw new Error(`${config.subject_id}: policy config source mismatch.`);
  }
  if (policyConfig.corpus_sha256 !== reviewPolicy.corpus_sha256 || policyConfig.corpus_sha256 !== candidate.content_sha256) {
    throw new Error(`${config.subject_id}: policy config corpus digest mismatch.`);
  }
  const configThresholds = policyConfig.thresholds || {};
  for (const key of ["minimum_score", "minimum_terms", "ambiguity_margin"]) {
    if (Number(configThresholds[key]) !== Number(config[key])) throw new Error(`${config.subject_id}: ${key} differs between runtime registry and policy config.`);
  }
  if (config.minimum_reviewed_evidence_terms != null
      && Number(configThresholds.minimum_reviewed_evidence_terms) !== Number(config.minimum_reviewed_evidence_terms)) {
    throw new Error(`${config.subject_id}: minimum_reviewed_evidence_terms differs between runtime registry and policy config.`);
  }
  const chapterRules = policyConfig.chapter_rules || {};
  const candidateChapterIds = new Set((candidate.entries || []).map((entry) => entry.chapter_id));
  const configuredChapterIds = new Set(Object.keys(chapterRules));
  if (candidateChapterIds.size !== configuredChapterIds.size
      || [...candidateChapterIds].some((chapterId) => !configuredChapterIds.has(chapterId))) {
    throw new Error(`${config.subject_id}: policy config chapter rules do not match candidate chapters.`);
  }
  const domainTerms = [...new Set(Object.values(chapterRules).flatMap((rule) => rule.required_anchor_terms || []))].sort();
  if (!domainTerms.length) throw new Error(`${config.subject_id}: policy config produced an empty domain gate.`);
  return {
    ...reviewPolicy,
    thresholds: policyConfig.thresholds,
    default_weights: policyConfig.default_weights,
    global_non_scoring_terms: policyConfig.global_non_scoring_terms,
    domain_gate: { required: true, terms: domainTerms },
    chapter_rules: chapterRules,
    policy_config_path: configPath,
    policy_config_version: policyConfig.version,
    policy_config_sha256: sha256(policyConfig)
  };
}
'''
builder = replace_once(builder, validate_marker, hydrator, "insert policy hydrator")
old_thresholds = '''    thresholds: {
      minimum_score: Number(config.minimum_score),
      minimum_terms: Number(config.minimum_terms),
      ambiguity_margin: Number(config.ambiguity_margin)
    },'''
new_thresholds = '''    thresholds: {
      minimum_score: Number(config.minimum_score),
      minimum_terms: Number(config.minimum_terms),
      ...(config.minimum_reviewed_evidence_terms != null
        ? { minimum_reviewed_evidence_terms: Number(config.minimum_reviewed_evidence_terms) }
        : {}),
      ambiguity_margin: Number(config.ambiguity_margin)
    },'''
builder = replace_once(builder, old_thresholds, new_thresholds, "runtime thresholds")
old_source = '''    source_policy_sha256: sha256(sourcePolicyPayload),
    scoring_mode: config.scoring_mode,'''
new_source = '''    source_policy_sha256: sha256(sourcePolicyPayload),
    ...(reviewPolicy.policy_config_path ? {
      source_policy_config_path: reviewPolicy.policy_config_path,
      source_policy_config_version: reviewPolicy.policy_config_version,
      source_policy_config_sha256: reviewPolicy.policy_config_sha256
    } : {}),
    scoring_mode: config.scoring_mode,'''
builder = replace_once(builder, old_source, new_source, "runtime policy config provenance")
old_loop = '''    const approval = readJson(config.approval_path);
    const candidate = readJson(config.candidate_corpus_path);
    const reviewPolicy = readJson(config.review_policy_path);
    validateApproval(config, approval);
    const runtimeCorpus = buildRuntimeCorpus(config, approval, candidate);
    const runtimePolicy = buildRuntimePolicy(config, approval, candidate, reviewPolicy);'''
new_loop = '''    const approval = readJson(config.approval_path);
    const candidate = readJson(config.candidate_corpus_path);
    const sourceReviewPolicy = readJson(config.review_policy_path);
    validateApproval(config, approval);
    const reviewPolicy = hydrateReviewPolicy(config, sourceReviewPolicy, candidate);
    const runtimeCorpus = buildRuntimeCorpus(config, approval, candidate);
    const runtimePolicy = buildRuntimePolicy(config, approval, candidate, reviewPolicy);'''
builder = replace_once(builder, old_loop, new_loop, "hydrate review policy in activation loop")
write(builder_path, builder)

# 3. Preserve Business review semantics in the generic Python subject-policy scorer.
engine_path = "backend/aha_engine/app/engine/fagverk_grounding.py"
engine = read(engine_path)
old_candidates = '''    candidates: dict[str, tuple[str, float]] = {}
    for group, weight in group_weights:
        for raw_term in entry.get(group, []):
            term = _normalize(raw_term)
            current = candidates.get(term)
            if term and (current is None or weight > current[1]):
                candidates[term] = (group, weight)
'''
new_candidates = '''    policy_rules = policy.get("policy_rules") or {}
    candidate_terms_decisive = policy_rules.get("candidate_title_concept_support_terms") != "non_decisive_review_context_only"
    candidates: dict[str, tuple[str, float]] = {}
    if candidate_terms_decisive:
        for group, weight in group_weights:
            for raw_term in entry.get(group, []):
                term = _normalize(raw_term)
                current = candidates.get(term)
                if term and (current is None or weight > current[1]):
                    candidates[term] = (group, weight)
'''
engine = replace_once(engine, old_candidates, new_candidates, "candidate term decision gate")
engine = replace_once(
    engine,
    '''    contributions: list[tuple[str, float]] = []
    score = 0.0
    for term, (_, base_weight) in candidates.items():''',
    '''    contributions: list[tuple[str, float, str]] = []
    score = 0.0
    for term, (group, base_weight) in candidates.items():''',
    "contribution group tracking",
)
engine = replace_once(
    engine,
    '''        contributions.append((term, round(contribution, 3)))
        score += contribution

    domain_gate = policy.get("domain_gate") or {}''',
    '''        contributions.append((term, round(contribution, 3), group))
        score += contribution

    minimum_reviewed_evidence_terms = int(policy.get("thresholds", {}).get("minimum_reviewed_evidence_terms", 0))
    reviewed_evidence_count = sum(1 for _, _, group in contributions if group == "supplemental_evidence_terms")
    reviewed_evidence_eligible = reviewed_evidence_count >= minimum_reviewed_evidence_terms

    domain_gate = policy.get("domain_gate") or {}''',
    "reviewed evidence threshold",
)
engine = replace_once(
    engine,
    '''    eligible = domain_eligible and temporal_eligible and anchor_eligible
    contributions.sort(key=lambda item: (-item[1], item[0]))
    return round(score, 3), tuple(term for term, _ in contributions), eligible''',
    '''    eligible = domain_eligible and temporal_eligible and anchor_eligible and reviewed_evidence_eligible
    contributions.sort(key=lambda item: (-item[1], item[0]))
    return round(score, 3), tuple(term for term, _, _ in contributions), eligible''',
    "reviewed evidence eligibility",
)
write(engine_path, engine)

# 4. Update runtime contract tests.
runtime_test_path = "tests/aha-fagverk-runtime-activation.test.cjs"
runtime_test = read(runtime_test_path)
runtime_test = replace_once(runtime_test, "assert.deepEqual(subjectIds, ['historie', 'natur', 'politikk']);", "assert.deepEqual(subjectIds, ['historie', 'naeringsliv', 'natur', 'politikk']);", "runtime subject inventory")
runtime_test = replace_once(runtime_test, '''  natur: {
    sourceRef: 'c16a187453d16a40f9cab4ca694c32e96014f31b',''', '''  naeringsliv: {
    sourceRef: 'c16a187453d16a40f9cab4ca694c32e96014f31b',
    corpusSha: 'a1c399977c2656d567ee461228b8e7d21f457da8e0863bf53a7888a8ac5fbfea',
    chapterCount: 12,
    thresholds: { minimum_score: 7, minimum_terms: 2, minimum_reviewed_evidence_terms: 2, ambiguity_margin: 3 },
  },
  natur: {
    sourceRef: 'c16a187453d16a40f9cab4ca694c32e96014f31b',''', "Business runtime expectation")
runtime_test = replace_once(runtime_test, '''  if (subjectId === 'historie') {
    assert.equal(policy.temporal_gate.required, true);''', '''  if (subjectId === 'historie') {
    assert.equal(policy.temporal_gate.required, true);''', "history branch anchor")
runtime_test = replace_once(runtime_test, '''  } else if (subjectId === 'natur') {
    assert.equal(policy.temporal_gate, undefined);''', '''  } else if (subjectId === 'naeringsliv') {
    assert.equal(policy.temporal_gate, undefined);
    assert.equal(policy.domain_gate.required, true);
    assert.equal(policy.domain_gate.terms.includes('bruttoprodukt'), true);
    assert.equal(policy.domain_gate.terms.includes('nettverkseffekt'), true);
    assert.equal(policy.policy_rules.candidate_title_concept_support_terms, 'non_decisive_review_context_only');
    assert.equal(policy.source_policy_config_path, 'data/integrations/review/history-go-fagverk-naeringsliv.policy-config.v1.json');
    assert.match(policy.source_policy_config_sha256, /^[0-9a-f]{64}$/);
    assert.equal(Object.keys(policy.chapter_rules).length, 12);
  } else if (subjectId === 'natur') {
    assert.equal(policy.temporal_gate, undefined);''', "Business policy assertions")
runtime_test = replace_once(runtime_test, "assert.equal(active.effective_entry_count, 47);", "assert.equal(active.effective_entry_count, 59);", "runtime total")
runtime_test = replace_once(runtime_test, "assert.equal(runtimeCode.includes('domain_gate'), true);", "assert.equal(runtimeCode.includes('domain_gate'), true);\nassert.equal(runtimeCode.includes('minimum_reviewed_evidence_terms'), true);\nassert.equal(runtimeCode.includes('non_decisive_review_context_only'), true);", "runtime code guards")
write(runtime_test_path, runtime_test)

# 5. Update existing subject/review transition guards from 47 -> 59.
subject_test_path = "tests/aha-fagverk-subject-approvals.test.cjs"
subject_test = read(subject_test_path)
subject_test = replace_once(subject_test, "assert.deepEqual(Object.keys(runtimeActive.active_subjects), ['historie', 'natur', 'politikk']);\nassert.equal(runtimeActive.active_subjects.naeringsliv, undefined);", "assert.deepEqual(Object.keys(runtimeActive.active_subjects), ['historie', 'naeringsliv', 'natur', 'politikk']);\nassert.equal(runtimeActive.active_subjects.naeringsliv.subject_id, 'naeringsliv');\nassert.equal(runtimeActive.active_subjects.naeringsliv.chapter_count, 12);\nassert.equal(runtimeActive.active_subjects.naeringsliv.activation_status, 'runtime_subject_active');", "subject approval runtime inventory")
subject_test = replace_once(subject_test, "assert.equal(runtimeActive.effective_entry_count, 47);", "assert.equal(runtimeActive.effective_entry_count, 59);", "subject approval runtime total")
write(subject_test_path, subject_test)

business_test_path = "tests/aha-business-fagverk-review.test.cjs"
business_test = read(business_test_path)
business_test = replace_once(business_test, '''assert.equal(runtime.active_subjects?.naeringsliv, undefined);
assert.deepEqual(Object.keys(runtime.active_subjects), ['historie', 'natur', 'politikk']);
assert.equal(runtime.full_release_active, false);
assert.equal(runtime.effective_entry_count, 47);''', '''const activeBusiness = runtime.active_subjects?.naeringsliv;
assert.equal(activeBusiness.subject_id, 'naeringsliv');
assert.equal(activeBusiness.source_commit, candidate.source_ref);
assert.equal(activeBusiness.chapter_count, 12);
assert.equal(activeBusiness.corpus_path, 'data/integrations/runtime/history-go-fagverk-naeringsliv.corpus.v1.json');
assert.equal(activeBusiness.policy_path, 'data/integrations/runtime/history-go-fagverk-naeringsliv.policy.v1.json');
assert.equal(activeBusiness.activation_status, 'runtime_subject_active');
assert.deepEqual(Object.keys(runtime.active_subjects), ['historie', 'naeringsliv', 'natur', 'politikk']);
assert.equal(runtime.full_release_active, false);
assert.equal(runtime.effective_entry_count, 59);''', "Business review activation boundary")
write(business_test_path, business_test)

history_test_path = "tests/aha-history-fagverk-review.test.cjs"
history_test = read(history_test_path)
history_test = replace_once(history_test, "assert.equal(runtime.effective_entry_count, 47);", "assert.equal(runtime.effective_entry_count, 59);", "History runtime total")
write(history_test_path, history_test)

nature_test_path = "tests/aha-nature-fagverk-review.test.cjs"
nature_test = read(nature_test_path)
nature_test = replace_once(nature_test, 'assert.deepEqual(Object.keys(runtime.active_subjects), ["historie", "natur", "politikk"]);', 'assert.deepEqual(Object.keys(runtime.active_subjects), ["historie", "naeringsliv", "natur", "politikk"]);', "Nature runtime subjects")
nature_test = replace_once(nature_test, "assert.equal(runtime.effective_entry_count, 47);", "assert.equal(runtime.effective_entry_count, 59);", "Nature runtime total")
write(nature_test_path, nature_test)

# 6. Extend Python runtime regression with Business review parity.
py_test_path = "backend/aha_engine/tests/test_fagverk_grounding.py"
py_test = read(py_test_path)
py_test = replace_once(py_test, '''NATURE_CORRECTIONS_PATH = ROOT / "data" / "evaluation" / "aha-nature-fixture-corrections.v1.json"
ACTIVE_MANIFEST_PATH''', '''NATURE_CORRECTIONS_PATH = ROOT / "data" / "evaluation" / "aha-nature-fixture-corrections.v1.json"
BUSINESS_MATRIX_PATH = ROOT / "data" / "evaluation" / "aha-business-fagverk-evaluation-matrix.v1.json"
BUSINESS_CORRECTIONS_PATH = ROOT / "data" / "evaluation" / "aha-business-fixture-corrections.v1.json"
ACTIVE_MANIFEST_PATH''', "Business Python constants")
helper_marker = '''def _politics_only_corpus() -> dict:
    corpus = load_fagverk_corpus()
    return {
        "schema": corpus["schema"],
        "version": corpus["version"],
        "source_repo": corpus["source_repo"],
        "source_ref": corpus["source_ref"],
        "entries": [entry for entry in corpus["entries"] if entry["subject_id"] == "politikk"],
        "subject_policies": {"politikk": corpus["subject_policies"]["politikk"]},
    }
'''
helper_new = helper_marker + '''

def _business_only_corpus() -> dict:
    corpus = load_fagverk_corpus()
    return {
        "schema": corpus["schema"],
        "version": corpus["version"],
        "source_repo": corpus["source_repo"],
        "source_ref": corpus["source_ref"],
        "entries": [entry for entry in corpus["entries"] if entry["subject_id"] == "naeringsliv"],
        "subject_policies": {"naeringsliv": corpus["subject_policies"]["naeringsliv"]},
    }
'''
py_test = replace_once(py_test, helper_marker, helper_new, "Business Python corpus helper")
py_test = replace_once(py_test, '    assert len(corpus["entries"]) == 47', '    assert len(corpus["entries"]) == 59', "Python composed corpus count")
py_test = replace_once(py_test, '''    history_entries = [entry for entry in corpus["entries"] if entry["subject_id"] == "historie"]
    assert len(history_entries) == 23
    assert len({entry["chapter_id"] for entry in history_entries}) == 23
    assert set(corpus["subject_policies"]) == {"historie", "natur", "politikk"}''', '''    history_entries = [entry for entry in corpus["entries"] if entry["subject_id"] == "historie"]
    assert len(history_entries) == 23
    assert len({entry["chapter_id"] for entry in history_entries}) == 23
    business_entries = [entry for entry in corpus["entries"] if entry["subject_id"] == "naeringsliv"]
    assert len(business_entries) == 12
    assert len({entry["chapter_id"] for entry in business_entries}) == 12
    assert set(corpus["subject_policies"]) == {"historie", "naeringsliv", "natur", "politikk"}''', "Python Business corpus inventory")
py_test = replace_once(py_test, '    assert manifest["effective_entry_count"] == 47\n    assert set(manifest["active_subjects"]) == {"historie", "natur", "politikk"}', '    assert manifest["effective_entry_count"] == 59\n    assert set(manifest["active_subjects"]) == {"historie", "naeringsliv", "natur", "politikk"}', "Python runtime manifest inventory")
py_test = replace_once(py_test, '''    nature = manifest["active_subjects"]["natur"]''', '''    business = manifest["active_subjects"]["naeringsliv"]
    assert business["chapter_count"] == 12
    assert business["source_commit"] == "c16a187453d16a40f9cab4ca694c32e96014f31b"
    assert business["corpus_path"].startswith("data/integrations/runtime/")
    assert business["policy_path"].startswith("data/integrations/runtime/")
    assert "/review/" not in business["corpus_path"]
    assert "/review/" not in business["policy_path"]
    nature = manifest["active_subjects"]["natur"]''', "Python Business manifest assertions")
business_tests = '''

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
'''
py_test = replace_once(py_test, '\n\ndef test_grounded_analysis_replaces_generic_canned_fallback() -> None:', business_tests + '\n\ndef test_grounded_analysis_replaces_generic_canned_fallback() -> None:', "insert Business Python regression")
write(py_test_path, py_test)

# 7. Materialize runtime artifacts and validate JS contracts before allowing a commit.
subprocess.run(["node", "scripts/build-history-go-fagverk-runtime-activation.mjs"], cwd=ROOT, check=True)
for test in [
    "tests/aha-fagverk-runtime-activation.test.cjs",
    "tests/aha-fagverk-subject-approvals.test.cjs",
    "tests/aha-business-fagverk-review.test.cjs",
    "tests/aha-history-fagverk-review.test.cjs",
    "tests/aha-nature-fagverk-review.test.cjs",
]:
    subprocess.run(["node", test], cwd=ROOT, check=True)
subprocess.run(["python", "-m", "py_compile", engine_path, py_test_path], cwd=ROOT, check=True)
print("Business runtime activation materialized: 4 subjects, 59 effective chapters.")
