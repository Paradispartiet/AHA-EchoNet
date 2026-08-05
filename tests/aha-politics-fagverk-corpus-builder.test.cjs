const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const script = path.resolve('scripts/build-history-go-fagverk-corpus.mjs');
assert.equal(fs.existsSync(script), true, 'Fagverk corpus builder exists');

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aha-politics-fagverk-'));
  const chapters = [];
  for (let index = 1; index <= 13; index += 1) {
    const chapterId = `chapter-${String(index).padStart(2, '0')}`;
    const sourcePath = `data/fagverk/politikk/${chapterId}.json`;
    chapters.push({
      id: chapterId,
      title: `Politikk kapittel ${index}`,
      subtitle: `Makt, institusjon og ansvar ${index}`,
      file: sourcePath,
      primary_domain_id: `politics_domain_${index}`,
      emne_ids: ['em_pol_makt_institusjoner', `em_pol_specific_${index}`]
    });
    writeJson(path.join(root, sourcePath), {
      schema: 'history_go_fagverk_chapter_v1',
      id: chapterId,
      title: `Politikk kapittel ${index}`,
      subtitle: `Makt, institusjon og ansvar ${index}`,
      lead: `Makt og institusjon former ansvar. Særbegrep${index} forklarer ansvar og institusjon i dette kapittelet.`,
      learningObjectives: [`forklare særbegrep ${index} og ansvar`],
      diagnosticQuestions: [{ question: `Hva er særbegrep ${index}?`, answer: `Et avgrenset politisk begrep ${index}.` }]
    });
  }
  writeJson(path.join(root, 'data/fagverk/natur/nature.json'), {
    schema: 'history_go_fagverk_chapter_v1',
    id: 'nature',
    title: 'Naturkapittel'
  });
  writeJson(path.join(root, 'data/fagverk/fagverk_registry.json'), {
    schema: 'history_go_fagverk_registry_v1',
    version: 'fixture-1.0.0',
    updatedAt: '2026-08-05',
    subjects: {
      politikk: { chapters },
      natur: { chapters: [{ id: 'nature', title: 'Naturkapittel', file: 'data/fagverk/natur/nature.json' }] }
    }
  });
  const init = spawnSync('git', ['init', '-q'], { cwd: root, encoding: 'utf8' });
  assert.equal(init.status, 0, init.stderr);
  spawnSync('git', ['config', 'user.email', 'fixture@example.test'], { cwd: root });
  spawnSync('git', ['config', 'user.name', 'Fixture'], { cwd: root });
  spawnSync('git', ['add', '.'], { cwd: root });
  const commit = spawnSync('git', ['commit', '-qm', 'fixture'], { cwd: root, encoding: 'utf8' });
  assert.equal(commit.status, 0, commit.stderr);
  return root;
}

function runBuilder(root, outputName, auditName, extra = []) {
  return spawnSync(process.execPath, [
    script,
    '--history-go-root', root,
    '--subject', 'politikk',
    '--expected-count', '13',
    '--output', outputName,
    '--audit-output', auditName,
    ...extra
  ], { cwd: process.cwd(), encoding: 'utf8' });
}

const fixture = makeFixture();
const outputA = path.join(fixture, 'out', 'politics-a.json');
const auditA = path.join(fixture, 'out', 'politics-a.audit.json');
const first = runBuilder(fixture, outputA, auditA);
assert.equal(first.status, 0, first.stderr);
assert.match(first.stdout, /Coverage gate passed: 13\/13/);

const corpus = JSON.parse(fs.readFileSync(outputA, 'utf8'));
const audit = JSON.parse(fs.readFileSync(auditA, 'utf8'));
assert.equal(corpus.schema, 'aha_history_go_fagverk_corpus_v1');
assert.equal(corpus.version, '1.1.0');
assert.equal(corpus.status, 'generated_subject_audit_corpus');
assert.equal(corpus.subject_filter, 'politikk');
assert.equal(corpus.entries.length, 13);
assert.equal(corpus.entries.every((entry) => entry.subject_id === 'politikk'), true, 'non-politics subjects must not leak');
assert.equal(new Set(corpus.entries.map((entry) => entry.chapter_id)).size, 13);
assert.equal(corpus.entries.every((entry) => entry.source_path.startsWith('data/fagverk/politikk/')), true);
assert.equal(corpus.entries.every((entry) => entry.provenance.source_kind === 'canonical_fagverk_chapter'), true);
assert.match(corpus.source_ref, /^[0-9a-f]{40}$/);

assert.equal(audit.schema, 'aha_fagverk_corpus_audit_v1');
assert.equal(audit.gate.passed, true);
assert.deepEqual(audit.coverage, {
  expected: 13,
  registered: 13,
  materialized: 13,
  missing: [],
  unexpected: [],
  duplicate_chapter_ids: []
});
assert.equal(audit.chapters.length, 13);
assert.ok(audit.term_collision_summary.high_risk > 0, 'shared single-token terms must be visible');
assert.ok(audit.high_risk_terms.some((item) => item.term === 'makt'));
assert.equal(audit.activation_recommendation, 'review_required_before_runtime_activation');

const outputB = path.join(fixture, 'out', 'politics-b.json');
const auditB = path.join(fixture, 'out', 'politics-b.audit.json');
const second = runBuilder(fixture, outputB, auditB);
assert.equal(second.status, 0, second.stderr);
assert.equal(
  crypto.createHash('sha256').update(fs.readFileSync(outputA)).digest('hex'),
  crypto.createHash('sha256').update(fs.readFileSync(outputB)).digest('hex'),
  'subject corpus output must be deterministic'
);
assert.equal(
  crypto.createHash('sha256').update(fs.readFileSync(auditA)).digest('hex'),
  crypto.createHash('sha256').update(fs.readFileSync(auditB)).digest('hex'),
  'audit output must be deterministic'
);

const wrongCount = spawnSync(process.execPath, [
  script,
  '--history-go-root', fixture,
  '--subject', 'politikk',
  '--expected-count', '12',
  '--output', path.join(fixture, 'out', 'wrong.json')
], { encoding: 'utf8' });
assert.notEqual(wrongCount.status, 0);
assert.match(`${wrongCount.stdout}\n${wrongCount.stderr}`, /Expected 12 chapters|Registry contains 13 chapters/);

const unknownSubject = spawnSync(process.execPath, [
  script,
  '--history-go-root', fixture,
  '--subject', 'ukjent',
  '--output', path.join(fixture, 'out', 'unknown.json')
], { encoding: 'utf8' });
assert.notEqual(unknownSubject.status, 0);
assert.match(`${unknownSubject.stdout}\n${unknownSubject.stderr}`, /Unknown Fagverk subject/);

fs.rmSync(fixture, { recursive: true, force: true });
console.log('aha-politics-fagverk-corpus-builder tests passed');
