const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const bridge = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data/integrations/history-go-fagverk-bridge.v2.json'), 'utf8'));
const canonicalIndex = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data/integrations/runtime/history-go-fagverk-canonical-index.v2.json'), 'utf8'));
const overlays = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data/subjects/subjects_index.json'), 'utf8'));
const engineSource = fs.readFileSync(path.join(repoRoot, 'js/ahaSubjectEngine.js'), 'utf8');

function response(data, ok = true, status = 200) {
  return { ok, status, async json() { return structuredClone(data); } };
}

async function localFetch(url) {
  const key = String(url);
  if (!key.startsWith('/')) return response({}, false, 404);
  const target = path.resolve(repoRoot, key.replace(/^\//, ''));
  if (!target.startsWith(repoRoot) || !fs.existsSync(target)) return response({}, false, 404);
  return response(JSON.parse(fs.readFileSync(target, 'utf8')));
}

const context = { console: { warn() {}, log() {} }, structuredClone, fetch: localFetch, window: null };
context.window = context;
vm.createContext(context);
vm.runInContext(engineSource, context, { filename: 'ahaSubjectEngine.js' });

(async () => {
  assert.equal(canonicalIndex.summary.subject_count, 20);
  assert.equal(canonicalIndex.summary.root_subject_count, 19);
  assert.equal(canonicalIndex.summary.specialization_count, 1);
  assert.equal(canonicalIndex.summary.chapter_count, 174);
  assert.equal(canonicalIndex.canonical_source.source_ref, bridge.canonical_source.source_ref);
  assert.equal(overlays.authority, 'overlay_only');

  const subjects = await context.AHASubjectEngine.listSubjects();
  assert.equal(subjects.length, 20);
  assert.deepEqual(
    Array.from(subjects, (subject) => subject.subject_id).sort(),
    canonicalIndex.subjects.map((subject) => subject.subject_id).sort()
  );

  for (const meta of subjects) {
    const subject = await context.AHASubjectEngine.loadSubject(meta.subject_id);
    assert.ok(subject, meta.subject_id);
    assert.equal(subject.authority, 'history_go_canonical_fagverk');
    assert.equal(subject.source_ref, bridge.canonical_source.source_ref);
    assert.ok(subject.emner.some((item) => item?.fagverk?.canonical_subject_id === meta.subject_id), `${meta.subject_id}: no canonical Fagverk entries`);
    for (const entry of subject.emner.filter((item) => item?.fagverk)) {
      assert.equal(entry.fagverk.source_repo, 'Paradispartiet/History-Go');
      assert.equal(entry.fagverk.source_ref, bridge.canonical_source.source_ref);
      assert.equal(entry.fagverk.evidence_role, undefined);
    }
  }

  const canonicalIds = new Set(subjects.map((subject) => subject.subject_id));
  for (const overlay of overlays.subjects) {
    assert.ok(Array.isArray(overlay.canonical_subject_ids) && overlay.canonical_subject_ids.length, overlay.subject_id);
    for (const canonicalId of overlay.canonical_subject_ids) assert.ok(canonicalIds.has(canonicalId), `${overlay.subject_id}: unknown canonical target ${canonicalId}`);
  }

  const legacyRuntime = path.join(repoRoot, 'data/integrations/runtime/history-go-fagverk-runtime-registry.v1.json');
  assert.ok(fs.existsSync(legacyRuntime), 'legacy evidence artifact may remain for compatibility');
  assert.doesNotMatch(engineSource, /history-go-fagverk-runtime-registry\.v1\.json/);
  assert.doesNotMatch(engineSource, /history-go-fagverk-release\.runtime-active\.json/);

  const check = spawnSync(process.execPath, ['scripts/materialize-history-go-fagverk-subjects.mjs', '--check'], { cwd: repoRoot, encoding: 'utf8' });
  assert.equal(check.status, 0, check.stderr || check.stdout);
  assert.match(check.stdout, /No canonical subject copies were written/i);

  const literatureMatches = await context.AHASubjectEngine.matchText(
    'Livsskriving, autobiografisk fortelling, selvframstilling og narrativ identitet står sentralt i teksten.',
    { maxResults: 8 }
  );
  assert.ok(literatureMatches.some((match) => match.subject_id === 'litteratur'));
  assert.ok(literatureMatches.every((match) => match.subject_id !== 'kultur_kunst'));
  assert.ok(literatureMatches.filter((match) => match.subject_id === 'litteratur').every((match) => match.provenance?.evidence_role === 'reference_support_not_source_evidence'));

  console.log('AHA History-Go canonical Fagverk subject bridge integration: passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
