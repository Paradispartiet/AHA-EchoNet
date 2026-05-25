const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const textUtilsCode = fs.readFileSync('ahaChatTextUtils.js', 'utf8');
const signalsCode = fs.readFileSync('ahaChatSignals.js', 'utf8');
const exportCode = fs.readFileSync('ahaChatExport.js', 'utf8');
const chatCode = fs.readFileSync('ahaChat.js', 'utf8');

const store = new Map();
const text = `USA og Kina konkurrerer om global makt. Nominelt BNP favoriserer fortsatt USA, mens PPP viser at Kina har hentet inn mye. Demografi, militærmakt, Taiwan og KI-investeringer påvirker styrkeforholdet. USA har allierte og større forskningsøkosystem, mens Kina moderniserer militær kapasitet raskt.`;

const context = { window: null, console, navigator: { clipboard: { writeText: async () => {} } }, document: { readyState: 'loading', addEventListener: () => {}, getElementById: () => null, querySelectorAll: () => [], querySelector: () => null, body: { appendChild: () => {} }, createElement: () => ({ click: () => {}, remove: () => {} }) },
  localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
  setTimeout, clearTimeout, URL: { createObjectURL: () => 'blob:dummy', revokeObjectURL: () => {} }, Blob: function Blob(){}, Date, Math, JSON,
  InsightsEngine: { createEmptyChamber: () => ({ insights: [], chatLog: [] }), buildMetaProfile: () => ({ profile: 'meta' }) }
};
context.window = context;
context.addEventListener = () => {};
vm.createContext(context);
vm.runInContext(textUtilsCode, context, { filename: 'ahaChatTextUtils.js' });
vm.runInContext(signalsCode, context, { filename: 'ahaChatSignals.js' });
vm.runInContext(exportCode, context, { filename: 'ahaChatExport.js' });
vm.runInContext(chatCode, context, { filename: 'ahaChat.js' });

const hooks = context.AHATestHooks;
const signal = context.AHAChatSignals.detectGeopoliticalPowerSignal(text);
assert.ok(signal.strong);

const noKiText = "USA og Kina omtales sammen med allierte, men teksten nevner ikke kunstig intelligens eller KI som eget tema.";
const noKiSignal = context.AHAChatSignals.detectGeopoliticalPowerSignal(noKiText);
assert.ok(!noKiSignal.matchedTerms.includes("ki"), "Kina must not create a false KI match");

const realKiText = "USA og Kina konkurrerer om KI, kunstig intelligens, militær teknologi og global makt.";
const realKiSignal = context.AHAChatSignals.detectGeopoliticalPowerSignal(realKiText);
assert.ok(realKiSignal.matchedTerms.includes("ki") || realKiSignal.matchedTerms.includes("kunstig intelligens"));

const payload = hooks.buildAutoOutputs(text, 'USA holder ledelsen, Kina nærmer seg regionalt og teknologisk.');
assert.ok(/usa/i.test(payload.reflection) || /kina/i.test(payload.reflection) || (Array.isArray(payload.sortItems) && payload.sortItems.length > 0));

context.localStorage.setItem('aha_chat_auto_outputs_v1', JSON.stringify({
  createdAt: new Date().toISOString(), sourceText: text, sourceTextHash: 'geo_hash', payload
}));
context.localStorage.setItem('aha_afterwork_v1', JSON.stringify([
  { id: 'wrong_afterwork', createdAt: '2026-05-24T10:00:00.000Z', sourceTextHash: 'old_hash', textType: 'academic_article', reflection: 'USAs historiske utvikling, eierskap, profil og rolle i offentligheten', sortItems: [{label:'Hovedspenning', text:'Institusjonell kontinuitet ↔ institusjonell omforming'}], list:['eierskap'], learningPath:['mandat'], concepts:['usa'] }
]));

const bundle = hooks.buildAhaAnalysisExportBundle();
const md = hooks.formatAhaAnalysisExportMarkdown(bundle);

assert.equal(bundle.sourceTextHash, 'geo_hash');
assert.deepEqual(bundle.selectedAfterwork, {});
assert.ok(md.includes('USA'));
assert.ok(md.includes('Kina'));
for (const phrase of ['eierskap, profil og rolle i offentligheten','Institusjonell kontinuitet ↔ institusjonell omforming']) {
  assert.ok(!md.includes(phrase), `should not include stale institutional fallback: ${phrase}`);
}

console.log('aha-geopolitics-consistency passed');
