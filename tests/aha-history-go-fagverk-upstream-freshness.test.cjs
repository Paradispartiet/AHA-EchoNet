const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const WORKFLOW_PATH = path.join(ROOT, '.github/workflows/aha-history-go-fagverk-release-sync.yml');
const SYNC_SCRIPT_PATH = path.join(ROOT, 'scripts/sync-history-go-fagverk-release.mjs');

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function releaseDigest(releaseWithoutDigest) {
  return crypto.createHash('sha256').update(JSON.stringify(stableValue(releaseWithoutDigest))).digest('hex');
}

function makeSubject(id, kind = 'subject') {
  return {
    title: id,
    kind,
    parent_subject_id: kind === 'specialization' ? 'subject_01' : null,
    schema_family: 'test_family',
    pilot: false,
    package_status: 'complete',
    chapter_status: 'materialized',
    missing_manifest_fields: [],
    missing_required_files: [],
    missing_optional_files: [],
    missing_chapter_files: [],
    package_file_count: 1,
    required_package_file_count: 1,
    optional_package_file_count: 0,
    chapter_count: 0,
    chapters: [],
    module_file_count: 0,
    brief_file_count: 0,
    claims_file_count: 0,
    chapter_referenced_file_count: 0,
    referenced_file_count: 1,
    package_content_sha256: `package-${id}`,
    chapter_content_sha256: `chapters-${id}`,
    structure_sha256: `structure-${id}`,
    content_sha256: `content-${id}`
  };
}

function makeDynamicRelease() {
  const subjects = {};
  for (let index = 1; index <= 18; index += 1) {
    const id = `subject_${String(index).padStart(2, '0')}`;
    subjects[id] = makeSubject(id);
  }
  subjects.specialization_01 = makeSubject('specialization_01', 'specialization');

  const release = {
    schema: 'history_go_fagverk_release_v2',
    version: '2.0.0-test',
    source: {
      repository: 'Paradispartiet/History-Go',
      branch: 'main',
      source_ref_mode: 'consumer_observed_head'
    },
    registry: { version: 'test' },
    subject_inventory: {
      root_subject_count: 18,
      specialization_count: 1
    },
    fag_manifest: {},
    summary: {
      subject_count: 19,
      root_subject_count: 18,
      specialization_count: 1,
      chapter_subject_count: 19,
      chapter_count: 0,
      module_file_count: 0,
      package_file_count: 19,
      chapter_referenced_file_count: 0,
      referenced_file_count: 19,
      missing_file_count: 0,
      optional_gap_count: 0
    },
    subjects
  };

  return { ...release, release_sha256: releaseDigest(release) };
}

(async () => {
  const workflow = fs.readFileSync(WORKFLOW_PATH, 'utf8');

  assert.match(workflow, /workflow_dispatch:/, 'Upstream observer must remain manually runnable.');
  assert.match(workflow, /schedule:\s*\n\s*- cron: ["']17 4 \* \* \*["']/, 'Upstream observer must run automatically every day.');
  assert.match(workflow, /Object\.entries\(subjects\)/, 'Producer package count must be derived from the release subject inventory.');
  assert.match(workflow, /summary\.subject_count !== subjectEntries\.length/, 'Producer summary must be checked against the dynamic subject inventory.');
  assert.doesNotMatch(workflow, /subject_count\s*!==\s*18|Expected 18 producer packages/, 'Observer must not pin the producer to a fixed package count.');
  assert.doesNotMatch(workflow, /build-history-go-fagverk-runtime-activation|gh pr merge|merge_pull_request/, 'Observer must never activate runtime or auto-merge review candidates.');
  assert.match(workflow, /runtime_activation_allowed !== false/, 'Candidate verification must enforce the non-activation boundary.');

  const syncModule = await import(pathToFileURL(SYNC_SCRIPT_PATH).href);
  const release = makeDynamicRelease();

  assert.doesNotThrow(() => syncModule.verifyRelease(release), 'A valid future release with 19 packages must pass dynamic verification.');

  const observed = syncModule.observedFromRelease(release, 'future-history-go-sha');
  assert.equal(observed.summary.subject_count, 19);
  assert.equal(Object.keys(observed.subjects).length, 19);
  assert.equal(observed.runtime_activation_allowed, false);
  assert.equal(observed.approval_required, true);
  assert.equal(observed.candidate_import_required, true);

  const report = syncModule.buildUpdateReport(null, observed);
  assert.equal(report.status, 'review_required');
  assert.equal(report.runtime_activation_allowed, false);
  assert.equal(report.changed_subjects.length, 19);
  assert.equal(report.activation_boundary.observed_release_is_not_approved, true);
  assert.equal(report.activation_boundary.imported_candidates_are_not_approved, true);
  assert.equal(report.activation_boundary.approved_release_is_not_runtime_active_without_explicit_pointer_update, true);
  assert.equal(report.activation_boundary.explicit_activation_pull_request_required, true);

  console.log('AHA History Go Fagverk upstream freshness: PASS');
  console.log(JSON.stringify({
    scheduled: true,
    dynamicProducerPackageCount: release.summary.subject_count,
    runtimeActivationAllowed: observed.runtime_activation_allowed,
    explicitActivationPullRequestRequired: report.activation_boundary.explicit_activation_pull_request_required
  }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
