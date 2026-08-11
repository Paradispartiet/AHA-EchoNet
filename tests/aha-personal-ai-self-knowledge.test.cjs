const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const code = fs.readFileSync('js/ahaPersonalAiSelfKnowledge.js', 'utf8');
const html = fs.readFileSync('personal-ai.html', 'utf8');

function load(summary) {
  const context = {
    console,
    Array,
    Object,
    String,
    Number,
    Set,
    JSON,
    AHAMetaInsightsMemory: {
      summarizeMemory() { return summary; }
    }
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(code, context, { filename: 'js/ahaPersonalAiSelfKnowledge.js' });
  return context.AHAPersonalAiSelfKnowledge;
}

const summary = {
  confirmedClaims: [
    { claimId: 'secret-confirmed-id', claimText: 'Jeg bygger AHA som personlig innsiktsmotor.', basis: ['PRIVATE BASIS'], note: 'PRIVATE NOTE', confidence: 0.91 },
    { claimText: 'Jeg foretrekker tydelige arbeidsflyter.' }
  ],
  importantClaims: [
    { claimText: 'Jeg bygger AHA som personlig innsiktsmotor.' },
    { claimText: 'History Go er et viktig prosjekt.' }
  ],
  partialClaims: [
    { claimText: 'Jeg vil alltid ha lange svar.' },
    { claimText: 'History Go er et viktig prosjekt.' }
  ],
  rejectedClaims: [
    { claimText: 'REJECTED PRIVATE CLAIM' }
  ],
  outdatedClaims: [
    { claimText: 'OUTDATED PRIVATE CLAIM' }
  ],
  activeSelfModel: {
    activeProjects: ['AHA EchoNet', { label: 'History Go' }],
    activePatterns: [{ title: 'Arbeider iterativt' }],
    activeTensions: [{ name: 'Detaljgrad versus tempo' }]
  }
};

const api = load(summary);
assert.ok(api, 'self knowledge API should be exposed');
const model = api.buildSelfKnowledgeModel();

assert.deepEqual(Array.from(model.confirmed), [
  'Jeg bygger AHA som personlig innsiktsmotor.',
  'Jeg foretrekker tydelige arbeidsflyter.'
]);
assert.deepEqual(Array.from(model.important), ['History Go er et viktig prosjekt.'], 'important must not duplicate confirmed claims');
assert.deepEqual(Array.from(model.partial), ['Jeg vil alltid ha lange svar.'], 'partial must not duplicate stronger displayed buckets');
assert.deepEqual(Array.from(model.activeProjects), ['AHA EchoNet', 'History Go']);
assert.deepEqual(Array.from(model.activePatterns), ['Arbeider iterativt']);
assert.deepEqual(Array.from(model.activeTensions), ['Detaljgrad versus tempo']);
assert.equal(model.excluded.rejectedCount, 1);
assert.equal(model.excluded.outdatedCount, 1);
assert.equal(model.excluded.total, 2);
assert.equal(model.local_only, true);
assert.equal(model.read_only, true);

const serialized = JSON.stringify(model);
for (const secret of ['secret-confirmed-id', 'PRIVATE BASIS', 'PRIVATE NOTE', 'REJECTED PRIVATE CLAIM', 'OUTDATED PRIVATE CLAIM']) {
  assert.equal(serialized.includes(secret), false, `display model must not expose ${secret}`);
}
for (const forbiddenKey of ['claimId', 'basis', 'note', 'sessionId', 'confidence']) {
  assert.equal(serialized.includes(forbiddenKey), false, `display model must not copy ${forbiddenKey}`);
}

const emptyApi = load({ activeSelfModel: {} });
const empty = emptyApi.buildSelfKnowledgeModel();
assert.deepEqual(Array.from(empty.confirmed), []);
assert.deepEqual(Array.from(empty.important), []);
assert.deepEqual(Array.from(empty.partial), []);
assert.equal(empty.excluded.total, 0);

assert.match(html, /Dette vet AHA om deg/);
assert.match(html, /personal-ai-self-knowledge/);
assert.match(html, /AHA skal ikke blande det du har bekreftet med det som bare er viktig, delvis riktig eller et aktivt arbeidsmønster/);
assert.ok(html.includes('<script src="js/ahaPersonalAiSelfKnowledge.js"></script>'));
assert.ok(
  html.indexOf('js/metaInsightsMemory.js') < html.indexOf('js/ahaPersonalAiSelfKnowledge.js'),
  'Meta Insights Memory must load before the self knowledge adapter'
);

assert.match(code, /Bekreftet om deg/);
assert.match(code, /Viktig betyr prioritet, ikke automatisk at påstanden er bekreftet/);
assert.match(code, /Må nyanseres/);
assert.match(code, /arbeidskontekst – ikke bekreftede fakta om deg/);
assert.match(code, /Avvist og utdatert materiale vises ikke her som personlig kunnskap/);

assert.equal(/localStorage\s*\.\s*(setItem|removeItem|clear)\s*\(/.test(code), false, 'self knowledge surface must not persist state');
assert.equal(/\bfetch\s*\(/.test(code), false, 'self knowledge surface must not fetch');
assert.equal(/AHARepository|AHASyncHub|EchoNet|supabase|AHAIngest/i.test(code), false, 'self knowledge surface must stay read-only/local');

console.log('aha-personal-ai-self-knowledge.test.cjs passed');
