const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const storage = new Map();
const context = {
  window: null,
  globalThis: null,
  console,
  localStorage: {
    getItem(key) { return storage.get(key) || null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); }
  },
  AHAModuleApi: { resolve() { return null; } }
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/ahaChatPythonSmoke.js', 'utf8'), context, { filename: 'js/ahaChatPythonSmoke.js' });

const sourceText = Array.from({ length: 12 }, () => (
  'Livsarket drøfter fortelling, identitet, representasjon og omsorg som deler av en kunnskapspraksis.'
)).join(' ');
const canonicalMatch = {
  subject_id: 'literature',
  subject_label: 'Litteratur',
  title: 'Litteratur',
  source: 'history_go_canonical_fagverk',
  provenance: {
    kind: 'canonical_fagverk',
    canonical_subject_id: 'literature',
    source_ref: 'a'.repeat(40)
  }
};
const artifact = {
  canonicalAnalysis: {
    theme: 'Livsarket og fortellinger om identitet og omsorg',
    mainTension: 'Fortelling og standardisering står i spenning i omsorgspraksisen.',
    keyInsight: 'Representasjon krever kritisk fortolkning av personens fortelling.'
  },
  ahaSer: { fagkoblinger: ['Litteratur'] },
  subjectMatches: [canonicalMatch]
};
const report = context.AHAAutoOutputSourceBinding.buildSemanticFieldReports(sourceText, artifact);
assert.equal(report.fields['ahaSer.fagkoblinger'].valid, true);
assert.equal(report.fields['ahaSer.fagkoblinger'].reason, 'canonical_subject_provenance_verified');
assert.equal(report.fields['ahaSer.fagkoblinger'].canonicalSubjectProvenance[0].id, 'literature');

const unproven = structuredClone(artifact);
unproven.subjectMatches[0].provenance = null;
const rejected = context.AHAAutoOutputSourceBinding.buildSemanticFieldReports(sourceText, unproven);
assert.equal(rejected.fields['ahaSer.fagkoblinger'].valid, false);
assert.equal(rejected.fields['ahaSer.fagkoblinger'].reason, 'field_has_no_source_topic_overlap');

console.log('aha-canonical-subject-topic-provenance.test.cjs passed');
