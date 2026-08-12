const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const registryPath = 'data/integrations/runtime/history-go-fagverk-runtime-registry.v1.json';
const reportPath = 'reports/subject-bridge/local-subject-knowledge-audit.v1.json';
const retiredPath = 'data/subjects/retired_local_subject_knowledge.v1.json';

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

function makeLocalFetch() {
  return async function localFetch(url) {
    const relativePath = String(url || '').replace(/^\/+/, '');
    const absolutePath = path.resolve(repoRoot, relativePath);
    const insideRepo = absolutePath === repoRoot || absolutePath.startsWith(`${repoRoot}${path.sep}`);
    if (!insideRepo || !fs.existsSync(absolutePath)) {
      return { ok: false, status: insideRepo ? 404 : 403, json: async () => ({}) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => JSON.parse(fs.readFileSync(absolutePath, 'utf8'))
    };
  };
}

const audit = spawnSync(
  process.execPath,
  ['scripts/audit-local-subject-knowledge.mjs', '--check'],
  { cwd: repoRoot, encoding: 'utf8' }
);
assert.equal(
  audit.status,
  0,
  `Local subject knowledge audit is stale or invalid:\n${audit.stdout || ''}\n${audit.stderr || ''}`
);

const registry = readJson(registryPath);
const report = readJson(reportPath);
const index = readJson('data/subjects/subjects_index.json');
const retired = readJson(retiredPath);
const activeSubjectIds = new Set(Object.keys(registry.active_subjects || {}));
const subjects = (index.subjects || []).map((meta) => readJson(`data/subjects/${meta.file}`));
const allEmner = subjects.flatMap((subject) =>
  (subject.emner || []).map((emne) => ({ subject_id: subject.subject_id, emne }))
);
const localEmner = allEmner.filter(({ emne }) => !emne.fagverk);
const activeChapterCount = [...activeSubjectIds].reduce((count, subjectId) => {
  const runtime = registry.active_subjects[subjectId];
  return count + (readJson(runtime.runtime_corpus_path).entries || []).length;
}, 0);

assert.equal(report.status, 'passed');
assert.equal(report.audit_basis.revalidate_on_every_runtime_change, true);
assert.equal(report.summary.active_subject_count, activeSubjectIds.size);
assert.equal(report.summary.active_chapter_count, activeChapterCount);
assert.equal(report.summary.local_emne_count, localEmner.length);
assert.equal(report.summary.retired_competing_mirror_count, (retired.entries || []).length);
assert.equal(report.summary.errors, 0);

const allKeys = new Set(allEmner.map(({ subject_id, emne }) => `${subject_id}/${emne.emne_id}`));
for (const { subject_id: subjectId, emne } of localEmner) {
  const declaration = emne.local_knowledge;
  assert.ok(declaration, `${subjectId}/${emne.emne_id} must classify its local knowledge`);
  assert.equal(declaration.revalidate_on_runtime_change, true);
  assert.ok(declaration.minimum_matched_terms >= 2);
  assert.ok(declaration.scope);
  assert.ok(declaration.rationale);

  const canonicalIds = declaration.canonical_subject_ids || [];
  if (declaration.classification === 'awaiting_canonical_activation') {
    assert.equal(canonicalIds.length, 1);
    assert.ok(
      !activeSubjectIds.has(canonicalIds[0]),
      `${subjectId}/${emne.emne_id} must be reviewed now that ${canonicalIds[0]} is runtime-active`
    );
  } else {
    assert.ok(canonicalIds.every((id) => activeSubjectIds.has(id)));
  }
}

for (const item of retired.entries || []) {
  const retiredKey = `${item.subject_id}/${item.emne_id}`;
  const replacementKey = `${item.replacement.subject_id}/${item.replacement.emne_id}`;
  assert.ok(!allKeys.has(retiredKey), `${retiredKey} must not be reintroduced`);
  assert.ok(allKeys.has(replacementKey), `${retiredKey} replacement ${replacementKey} must exist`);
}

const context = {
  window: null,
  globalThis: null,
  console,
  fetch: makeLocalFetch()
};
context.window = context;
context.globalThis = context;
vm.runInNewContext(
  fs.readFileSync(path.join(repoRoot, 'js/ahaSubjectEngine.js'), 'utf8'),
  context,
  { filename: 'js/ahaSubjectEngine.js' }
);

(async () => {
  for (const { subject_id: subjectId, emne } of localEmner) {
    const candidates = [...new Set([
      ...(emne.core_concepts || []),
      ...(emne.keywords || []),
      ...(emne.thinkers || [])
    ].map((term) => String(term || '').trim()).filter(Boolean))]
      .sort((left, right) => left.length - right.length || left.localeCompare(right));
    assert.ok(candidates.length, `${subjectId}/${emne.emne_id} needs a testable semantic term`);

    let guardedTerm = null;
    for (const candidate of candidates) {
      const matches = await context.AHASubjectEngine.matchText(candidate, {
        source: 'local_subject_single_term_guard',
        maxResults: 8
      });
      if (!matches.some((match) => match.subject_id === subjectId && match.emne_id === emne.emne_id)) {
        guardedTerm = candidate;
        break;
      }
    }
    assert.ok(
      guardedTerm,
      `${subjectId}/${emne.emne_id}: a single local term must not activate governed local knowledge`
    );
  }

  console.log(
    `aha-local-subject-knowledge audit tests passed (${activeSubjectIds.size} active subjects, ${activeChapterCount} active chapters, ${localEmner.length} governed local emner)`
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
