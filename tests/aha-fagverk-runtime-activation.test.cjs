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
const runtimeCorpusPath = 'data/integrations/runtime/history-go-fagverk-politikk.corpus.v1.json';
const runtimePolicyPath = 'data/integrations/runtime/history-go-fagverk-politikk.policy.v1.json';

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
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
const runtimeCorpus = JSON.parse(fs.readFileSync(runtimeCorpusPath, 'utf8'));
const runtimePolicy = JSON.parse(fs.readFileSync(runtimePolicyPath, 'utf8'));

assert.equal(registry.schema, 'aha_history_go_fagverk_runtime_registry_v1');
assert.deepEqual(Object.keys(registry.active_subjects), ['politikk']);
assert.equal(legacy.entries.length, 3, 'legacy seed must remain byte-stable and separate');

assert.equal(runtimeCorpus.schema, 'aha_history_go_fagverk_runtime_subject_corpus_v1');
assert.equal(runtimeCorpus.status, 'runtime_subject_corpus_active');
assert.equal(runtimeCorpus.subject_id, 'politikk');
assert.equal(runtimeCorpus.source_ref, 'c16a187453d16a40f9cab4ca694c32e96014f31b');
assert.equal(runtimeCorpus.corpus_sha256, '981ab3ad25f972bd13c70a0247f26b8796e43b8cd3cde7282b7d073bfcc79dec');
assert.equal(runtimeCorpus.chapter_count, 13);
assert.equal(runtimeCorpus.entries.length, 13);
assert.equal(new Set(runtimeCorpus.entries.map((entry) => entry.chapter_id)).size, 13);
assert.equal(runtimeCorpus.artifact_sha256, digestArtifact(runtimeCorpus));

assert.equal(runtimePolicy.schema, 'aha_history_go_fagverk_runtime_subject_policy_v1');
assert.equal(runtimePolicy.status, 'runtime_subject_policy_active');
assert.equal(runtimePolicy.subject_id, 'politikk');
assert.equal(runtimePolicy.source_ref, runtimeCorpus.source_ref);
assert.equal(runtimePolicy.corpus_sha256, runtimeCorpus.corpus_sha256);
assert.deepEqual(runtimePolicy.thresholds, { minimum_score: 6, minimum_terms: 2, ambiguity_margin: 3 });
assert.equal(runtimePolicy.terms.length, 143);
assert.equal(runtimePolicy.global_non_scoring_terms.length > 0, true);
assert.equal(runtimePolicy.chapter_rules.parlamentarisme.required_anchor_terms.includes('mistillit'), true);
assert.equal(runtimePolicy.artifact_sha256, digestArtifact(runtimePolicy));

assert.equal(approved.schema, 'aha_history_go_fagverk_approved_runtime_v2');
assert.equal(approved.status, 'partial_subject_runtime_approved');
assert.equal(approved.approved_source_commit, legacy.source_ref, 'legacy compatibility pointer remains seed-bound');
assert.equal(approved.approved_subjects.politikk.source_commit, runtimeCorpus.source_ref);
assert.equal(approved.approved_subjects.politikk.corpus_path, runtimeCorpusPath);
assert.equal(approved.approved_subjects.politikk.policy_path, runtimePolicyPath);
assert.equal(approved.full_release_approved, false);
assert.equal(approved.artifact_sha256, digestArtifact(approved));

assert.equal(active.schema, 'aha_history_go_fagverk_runtime_active_v2');
assert.equal(active.status, 'partial_subject_runtime_active');
assert.equal(active.active_source_commit, legacy.source_ref, 'legacy compatibility pointer remains seed-bound');
assert.equal(active.active_subjects.politikk.source_commit, runtimeCorpus.source_ref);
assert.equal(active.active_subjects.politikk.corpus_path, runtimeCorpusPath);
assert.equal(active.active_subjects.politikk.policy_path, runtimePolicyPath);
assert.equal(active.effective_entry_count, 15);
assert.equal(active.full_release_active, false);
assert.equal(active.artifact_sha256, digestArtifact(active));

const runtimeCode = fs.readFileSync('backend/aha_engine/app/engine/fagverk_grounding.py', 'utf8');
assert.equal(runtimeCode.includes('data/integrations/review'), false, 'runtime must not read review artifacts');
assert.equal(runtimeCode.includes('data/integrations/approvals'), false, 'runtime must not read approval artifacts');
assert.equal(runtimeCode.includes('history-go-fagverk-release.runtime-active.json'), true);
assert.equal(runtimeCode.includes('subject_policies'), true);

const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aha-fagverk-runtime-'));
const result = spawnSync(process.execPath, [
  'scripts/build-history-go-fagverk-runtime-activation.mjs',
  '--output-root', outputRoot,
], { encoding: 'utf8' });
assert.equal(result.status, 0, result.stderr || result.stdout);
for (const checkedPath of [runtimeCorpusPath, runtimePolicyPath, approvedPath, activePath]) {
  const generatedPath = path.join(outputRoot, path.basename(checkedPath));
  assert.equal(fs.existsSync(generatedPath), true, `missing generated artifact: ${generatedPath}`);
  assert.equal(fs.readFileSync(generatedPath).equals(fs.readFileSync(checkedPath)), true, `stale runtime artifact: ${checkedPath}`);
}
fs.rmSync(outputRoot, { recursive: true, force: true });

console.log('aha-fagverk-runtime-activation tests passed');
