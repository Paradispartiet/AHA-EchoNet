const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const originalFetch = global.fetch;
const originalSubjectEngine = global.AHASubjectEngine;

function localFetch(url) {
  const raw = String(url || '');
  const relative = raw.replace(/^\/+/, '');
  const filePath = path.resolve(repoRoot, relative);
  if (!filePath.startsWith(repoRoot + path.sep)) {
    return Promise.resolve({ ok: false, status: 400, json: async () => ({}) });
  }
  try {
    const body = fs.readFileSync(filePath, 'utf8');
    return Promise.resolve({ ok: true, status: 200, json: async () => JSON.parse(body) });
  } catch {
    return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
  }
}

(async () => {
  let fallbackCalls = 0;
  global.fetch = localFetch;
  global.AHASubjectEngine = {
    async matchText() {
      fallbackCalls += 1;
      return [{ id: 'legacy_fallback', subject_id: 'litteratur', title: 'Legacy fallback' }];
    }
  };

  delete require.cache[require.resolve('../js/ahaFagverkRuntime.js')];
  const runtime = require('../js/ahaFagverkRuntime.js');

  const source = `
    I denne artikkelen diskuterer vi ulike former for nytte og hvordan den norske statsforvaltningen bruker evalueringer.
    Oppdragsgiver kan bruke en evaluering til læring og forbedring, men også strategisk.
    Respondentene etterlyser mer systematikk, bedre oppfølging og bedre integrering av evalueringsresultater i mål- og resultatstyringssystemet.
    Direktoratet for økonomistyring har utgitt veiledere, og offentlig sektor arbeider med å tilrettelegge evalueringer i virksomhetenes styringssystemer.
    Potensialet for videreutvikling ligger ikke i å evaluere mer, men bedre.
  `;

  const grounding = await runtime.groundText(source);
  assert.equal(grounding.status, 'grounded', JSON.stringify(grounding, null, 2));
  assert.equal(grounding.match.subject_id, 'politikk');
  assert.equal(grounding.match.chapter_id, 'forvaltning');
  assert.equal(grounding.match.title, 'Offentlig forvaltning');
  assert.ok(grounding.match.matched_terms.includes('evaluering'), grounding.match.matched_terms.join(', '));
  assert.ok(grounding.match.matched_terms.includes('mål- og resultatstyring'), grounding.match.matched_terms.join(', '));

  const bridged = await global.AHASubjectEngine.matchText(source, { source: 'chat', textType: 'academic_article' });
  assert.equal(fallbackCalls, 0, 'reviewed runtime Fagverk must win before the legacy Subject Engine');
  assert.equal(bridged.length >= 1, true);
  assert.equal(bridged[0].subject_id, 'politikk');
  assert.equal(bridged[0].chapter_id, 'forvaltning');
  assert.equal(bridged[0].id, 'forvaltning');
  assert.equal(bridged[0].source, 'historygo_fagverk_runtime_active');
  assert.equal(bridged.some((item) => item.subject_id === 'litteratur'), false);

  const active = JSON.parse(fs.readFileSync(path.join(repoRoot, 'data/integrations/history-go-fagverk-release.runtime-active.json'), 'utf8'));
  assert.equal(active.active_subjects.politikk.activation_status, 'runtime_subject_active');
  assert.equal(active.active_subjects.politikk.corpus_path, 'data/integrations/runtime/history-go-fagverk-politikk.corpus.v1.json');

  console.log('aha-fagverk-browser-runtime-bridge passed: evaluation text -> Politikk / Offentlig forvaltning');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  global.fetch = originalFetch;
  global.AHASubjectEngine = originalSubjectEngine;
});
