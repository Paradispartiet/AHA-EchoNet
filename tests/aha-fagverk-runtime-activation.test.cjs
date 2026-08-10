const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const registryPath = 'data/integrations/runtime/history-go-fagverk-runtime-registry.v1.json';
const legacyCorpusPath = 'data/integrations/history-go-fagverk-corpus.v1.json';
const approvedPath = 'data/integrations/history-go-fagverk-release.approved.json';
const activePath = 'data/integrations/history-go-fagverk-release.runtime-active.json';

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  return value;
}
function digestArtifact(value) {
  const { artifact_sha256: ignored, ...payload } = value;
  return crypto.createHash('sha256').update(JSON.stringify(stableValue(payload))).digest('hex');
}

const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
const legacy = JSON.parse(fs.readFileSync(legacyCorpusPath, 'utf8'));
const approved = JSON.parse(fs.readFileSync(approvedPath, 'utf8'));
const active = JSON.parse(fs.readFileSync(activePath, 'utf8'));
const subjectIds = Object.keys(registry.active_subjects).sort();

assert.equal(registry.schema, 'aha_history_go_fagverk_runtime_registry_v1');
assert.deepEqual(subjectIds, ['by', 'historie', 'kunst', 'naeringsliv', 'natur', 'politikk', 'subkultur']);
assert.equal(legacy.entries.length, 3, 'legacy seed must remain byte-stable and separate');
assert.deepEqual(Object.keys(approved.approved_subjects), subjectIds);
assert.deepEqual(Object.keys(active.active_subjects), subjectIds);

const expected = {
  by: { sourceRef: 'd52cebbe2c6c01e5780be301e9b0e4a9c61c5254', corpusSha: '823e79dcd7c767ee3251a924d7697b0b2cee51cbb89699dda7d318aa81c9e10b', chapterCount: 17, thresholds: { minimum_score: 6, minimum_terms: 2, ambiguity_margin: 3 } },
  historie: { sourceRef: 'c16a187453d16a40f9cab4ca694c32e96014f31b', corpusSha: 'e5123cb96d9b89c83aad56efc327c1089bfe5f887f29322d39a4a936c9f19444', chapterCount: 23, thresholds: { minimum_score: 7, minimum_terms: 2, ambiguity_margin: 3 } },
  kunst: { sourceRef: 'd52cebbe2c6c01e5780be301e9b0e4a9c61c5254', corpusSha: '0bd12a658e1b18bac17f1da8c6a251e88ebd8ca9db0ffce9328058a27ffa48bc', chapterCount: 6, thresholds: { minimum_score: 6, minimum_terms: 2, ambiguity_margin: 3 } },
  naeringsliv: { sourceRef: 'c16a187453d16a40f9cab4ca694c32e96014f31b', corpusSha: 'a1c399977c2656d567ee461228b8e7d21f457da8e0863bf53a7888a8ac5fbfea', chapterCount: 12, thresholds: { minimum_score: 7, minimum_terms: 2, minimum_reviewed_evidence_terms: 2, ambiguity_margin: 3 } },
  natur: { sourceRef: 'c16a187453d16a40f9cab4ca694c32e96014f31b', corpusSha: 'd29f05a0b08fd5673e4bc0d320e896e4f75ec67ff217284188d0e77bed14b00e', chapterCount: 11, thresholds: { minimum_score: 7, minimum_terms: 2, ambiguity_margin: 3 } },
  politikk: { sourceRef: 'c16a187453d16a40f9cab4ca694c32e96014f31b', corpusSha: '981ab3ad25f972bd13c70a0247f26b8796e43b8cd3cde7282b7d073bfcc79dec', chapterCount: 13, thresholds: { minimum_score: 6, minimum_terms: 2, ambiguity_margin: 3 } },
  subkultur: { sourceRef: 'c16a187453d16a40f9cab4ca694c32e96014f31b', corpusSha: 'e554b96513313139898a44e98f374d9fea2f01e8c8e8b015dcc5d6fdfa60d7f8', chapterCount: 8, thresholds: { minimum_score: 7, minimum_terms: 2, minimum_reviewed_evidence_terms: 2, ambiguity_margin: 3 } },
};

const checkedPaths = [approvedPath, activePath];
for (const subjectId of subjectIds) {
  const config = registry.active_subjects[subjectId];
  const corpus = JSON.parse(fs.readFileSync(config.runtime_corpus_path, 'utf8'));
  const policy = JSON.parse(fs.readFileSync(config.runtime_policy_path, 'utf8'));
  const item = expected[subjectId];
  assert.equal(corpus.schema, 'aha_history_go_fagverk_runtime_subject_corpus_v1');
  assert.equal(corpus.status, 'runtime_subject_corpus_active');
  assert.equal(corpus.subject_id, subjectId);
  assert.equal(corpus.source_ref, item.sourceRef);
  assert.equal(corpus.corpus_sha256, item.corpusSha);
  assert.equal(corpus.chapter_count, item.chapterCount);
  assert.equal(corpus.entries.length, item.chapterCount);
  assert.equal(new Set(corpus.entries.map((entry) => entry.chapter_id)).size, item.chapterCount);
  assert.equal(corpus.artifact_sha256, digestArtifact(corpus));
  assert.equal(policy.schema, 'aha_history_go_fagverk_runtime_subject_policy_v1');
  assert.equal(policy.status, 'runtime_subject_policy_active');
  assert.equal(policy.subject_id, subjectId);
  assert.equal(policy.source_ref, corpus.source_ref);
  assert.equal(policy.corpus_sha256, corpus.corpus_sha256);
  assert.deepEqual(policy.thresholds, item.thresholds);
  assert.equal(policy.artifact_sha256, digestArtifact(policy));

  if (subjectId === 'by' || subjectId === 'kunst') {
    assert.equal(corpus.projection_mode, 'reviewed_anchor_projection_v1');
    assert.equal(policy.runtime_corpus_projection, 'reviewed_anchor_projection_v1');
    assert.equal(policy.source_review_attestation_path, `data/integrations/review/history-go-fagverk-${subjectId}.review-attestation.v1.json`);
    assert.match(policy.source_review_artifact_sha256, /^[0-9a-f]{64}$/);
    assert.equal(policy.domain_gate.required, true);
    assert.equal(Object.keys(policy.chapter_rules).length, item.chapterCount);
    for (const entry of corpus.entries) {
      assert.deepEqual(entry.concept_terms, []);
      assert.deepEqual(entry.support_terms, []);
      assert.deepEqual(entry.title_terms, policy.chapter_rules[entry.chapter_id].required_anchor_terms);
      assert.equal(entry.provenance.runtime_projection, 'reviewed_anchor_projection_v1');
    }
    if (subjectId === 'by') {
      assert.equal(policy.domain_gate.terms.includes('planvedtak'), true);
      assert.equal(policy.domain_gate.terms.includes('fortetting'), true);
    } else {
      assert.equal(policy.domain_gate.terms.includes('ikonografi'), true);
      assert.equal(policy.domain_gate.terms.includes('kunstnerøkonomi'), true);
    }
  } else if (subjectId === 'historie') {
    assert.equal(policy.temporal_gate.required, true);
    assert.equal(policy.temporal_gate.terms.includes('over tid'), true);
    assert.equal(policy.domain_gate, undefined);
    assert.equal(Object.keys(policy.chapter_rules).length, 23);
  } else if (subjectId === 'naeringsliv') {
    assert.equal(policy.domain_gate.required, true);
    assert.equal(policy.domain_gate.terms.includes('bruttoprodukt'), true);
    assert.equal(policy.policy_rules.candidate_title_concept_support_terms, 'non_decisive_review_context_only');
    assert.equal(Object.keys(policy.chapter_rules).length, 12);
  } else if (subjectId === 'subkultur') {
    assert.equal(policy.domain_gate.required, true);
    assert.equal(policy.domain_gate.terms.includes('moralpanikk'), true);
    assert.equal(policy.policy_rules.candidate_title_concept_support_terms, 'non_decisive_review_context_only');
    assert.equal(Object.keys(policy.chapter_rules).length, 8);
  } else if (subjectId === 'natur') {
    assert.equal(policy.domain_gate.required, true);
    assert.equal(policy.domain_gate.terms.includes('artsbestemmelse'), true);
    assert.equal(Object.keys(policy.chapter_rules).length, 11);
  } else {
    assert.equal(policy.domain_gate, undefined);
    assert.equal(policy.chapter_rules.parlamentarisme.required_anchor_terms.includes('mistillit'), true);
  }

  assert.equal(approved.approved_subjects[subjectId].source_commit, corpus.source_ref);
  assert.equal(active.active_subjects[subjectId].source_commit, corpus.source_ref);
  checkedPaths.push(config.runtime_corpus_path, config.runtime_policy_path);
}

assert.equal(approved.artifact_sha256, digestArtifact(approved));
assert.equal(active.artifact_sha256, digestArtifact(active));
assert.equal(active.effective_entry_count, 90);
assert.equal(approved.approved_source_commit, legacy.source_ref);
assert.equal(active.active_source_commit, legacy.source_ref);

const runtimeCode = fs.readFileSync('backend/aha_engine/app/engine/fagverk_grounding.py', 'utf8');
assert.equal(runtimeCode.includes('data/integrations/review'), false);
assert.equal(runtimeCode.includes('data/integrations/approvals'), false);
assert.equal(runtimeCode.includes('history-go-fagverk-release.runtime-active.json'), true);
assert.equal(runtimeCode.includes('subject_policies'), true);
assert.equal(runtimeCode.includes('temporal_gate'), true);
assert.equal(runtimeCode.includes('domain_gate'), true);
assert.equal(runtimeCode.includes('minimum_reviewed_evidence_terms'), true);
assert.equal(runtimeCode.includes('non_decisive_review_context_only'), true);

const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aha-fagverk-runtime-'));
const result = spawnSync(process.execPath, ['scripts/build-history-go-fagverk-runtime-activation.mjs', '--output-root', outputRoot], { encoding: 'utf8' });
assert.equal(result.status, 0, result.stderr || result.stdout);
for (const checkedPath of checkedPaths) {
  const generatedPath = path.join(outputRoot, path.basename(checkedPath));
  assert.equal(fs.existsSync(generatedPath), true, `missing generated artifact: ${generatedPath}`);
  assert.equal(fs.readFileSync(generatedPath).equals(fs.readFileSync(checkedPath)), true, `stale runtime artifact: ${checkedPath}`);
}
fs.rmSync(outputRoot, { recursive: true, force: true });
console.log('aha-fagverk-runtime-activation tests passed');
