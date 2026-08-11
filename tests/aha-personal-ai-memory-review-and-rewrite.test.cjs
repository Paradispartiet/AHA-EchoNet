const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class StorageMock {
  constructor(seed = {}) { this.map = new Map(Object.entries(seed)); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(String(key), String(value)); }
  removeItem(key) { this.map.delete(String(key)); }
  clear() { this.map.clear(); }
}

const memoryCode = fs.readFileSync('js/metaInsightsMemory.js', 'utf8');
const reviewCode = fs.readFileSync('js/ahaPersonalAiMemoryReview.js', 'utf8');
const controlCode = fs.readFileSync('js/ahaPersonalAiMemoryControl.js', 'utf8');
const selfKnowledgeCode = fs.readFileSync('js/ahaPersonalAiSelfKnowledge.js', 'utf8');
const page = fs.readFileSync('personal-ai.html', 'utf8');

const seededMemory = {
  version: 'v1',
  updatedAt: '2026-01-01T00:00:00.000Z',
  feedback: [{
    id: 'fb_old',
    createdAt: '2026-01-01T00:00:00.000Z',
    source: 'meta_insights_ai',
    sessionId: 'session_1',
    claimId: 'claim_1',
    claimText: 'Jeg arbeider i Oslo',
    response: 'stemmer',
    note: '',
    basis: ['brukerfeedback'],
    confidence: 0.9
  }],
  selfModel: {
    confirmedClaims: [], partialClaims: [], rejectedClaims: [], importantClaims: [], outdatedClaims: [],
    activePatterns: [], activeProjects: [], activeTensions: []
  }
};

const storage = new StorageMock({
  aha_meta_insights_memory_v1: JSON.stringify(seededMemory),
  aha_personal_retrieval_index_v1: JSON.stringify({ stale: true }),
  aha_personal_semantic_index_v1: JSON.stringify({ stale: true })
});

const memoryContext = { console, Date, Math, JSON, Array, Object, String, Number, localStorage: storage };
memoryContext.window = memoryContext;
vm.createContext(memoryContext);
vm.runInContext(memoryCode, memoryContext, { filename: 'js/metaInsightsMemory.js' });
const memory = memoryContext.AHAMetaInsightsMemory;
assert.ok(memory);
assert.equal(typeof memory.replaceClaim, 'function');

const replaced = memory.replaceClaim('Jeg arbeider i Oslo', 'Jeg arbeider hovedsakelig i Tromsø', {
  createdAt: '2026-08-12T00:20:00.000Z',
  note: 'Presiserer hvor arbeidet faktisk skjer.'
});
assert.equal(replaced.ok, true);
assert.equal(replaced.response, 'stemmer', 'replacement should inherit active confirmation state');
assert.equal(replaced.newEntry.claimId, 'claim_1', 'replacement should preserve internal claim lineage');
assert.equal(replaced.oldEntry.response, 'utdatert');
assert.equal(replaced.newEntry.response, 'stemmer');
assert.equal(storage.getItem('aha_personal_retrieval_index_v1'), null, 'replacement must invalidate lexical retrieval cache');
assert.equal(storage.getItem('aha_personal_semantic_index_v1'), null, 'replacement must invalidate semantic retrieval cache');

const summary = memory.summarizeMemory();
assert.equal(summary.confirmed, 1);
assert.equal(summary.outdated, 1);
assert.equal(summary.confirmedClaims[0].claimText, 'Jeg arbeider hovedsakelig i Tromsø');
assert.equal(summary.outdatedClaims[0].claimText, 'Jeg arbeider i Oslo');
assert.equal(summary.confirmedClaims.some((claim) => claim.claimText === 'Jeg arbeider i Oslo'), false, 'old wording must not remain active');

const unchanged = memory.replaceClaim('Jeg arbeider hovedsakelig i Tromsø', '  Jeg arbeider hovedsakelig i Tromsø  ');
assert.equal(unchanged.ok, false);
assert.equal(unchanged.error, 'unchanged_claim_text');

const reviewContext = { console, Date, Array, Object, String, Number, Map, Set, document: null };
reviewContext.window = reviewContext;
reviewContext.globalThis = reviewContext;
vm.createContext(reviewContext);
vm.runInContext(reviewCode, reviewContext, { filename: 'js/ahaPersonalAiMemoryReview.js' });
const review = reviewContext.AHAPersonalAiMemoryReview;
assert.ok(review);

const reviewModel = review.buildReviewModel({
  now: '2026-08-12T00:00:00.000Z',
  staleDays: 180,
  summary: {
    confirmedClaims: [
      { claimText: 'Jeg liker kaffe', createdAt: '2026-08-01T00:00:00.000Z' },
      { claimText: 'Jeg liker ikke kaffe', createdAt: '2026-08-02T00:00:00.000Z' },
      { claimText: 'Jeg bor i Oslo', createdAt: '2025-01-01T00:00:00.000Z' }
    ],
    importantClaims: [],
    partialClaims: []
  }
});
assert.equal(reviewModel.advisoryOnly, true);
assert.equal(reviewModel.conflicts.length, 1, 'conservative negation pair should be flagged for review');
assert.equal(reviewModel.conflicts[0].first.claimText, 'Jeg liker kaffe');
assert.equal(reviewModel.conflicts[0].second.claimText, 'Jeg liker ikke kaffe');
assert.equal(reviewModel.stale.length, 1, 'old active claim should be flagged as possibly stale');
assert.equal(reviewModel.stale[0].claimText, 'Jeg bor i Oslo');
assert.ok(reviewModel.stale[0].ageDays >= 180);

const noInventedConflict = review.buildReviewModel({
  now: '2026-08-12T00:00:00.000Z',
  summary: {
    confirmedClaims: [
      { claimText: 'Jeg bor i Oslo', createdAt: '2026-08-01T00:00:00.000Z' },
      { claimText: 'Jeg jobber i Bergen', createdAt: '2026-08-01T00:00:00.000Z' }
    ]
  }
});
assert.equal(noInventedConflict.conflicts.length, 0, 'review must not guess semantic contradictions it cannot establish safely');

assert.match(controlCode, /function replaceClaim\(/);
assert.match(controlCode, /api\.replaceClaim\(claimText, replacement/);
assert.match(controlCode, /refreshDerivedIndexes\(\)/, 'replacement must refresh derived retrieval immediately');
assert.match(selfKnowledgeCode, /data-personal-ai-memory-replacement/);
assert.match(selfKnowledgeCode, /data-personal-ai-memory-replace/);
assert.match(selfKnowledgeCode, /Endre formuleringen/);
assert.ok(page.indexOf('ahaPersonalAiMemoryControl.js') < page.indexOf('ahaPersonalAiMemoryReview.js'), 'review layer should load after memory control');
assert.equal(/localStorage\s*\.\s*(setItem|removeItem|clear)\s*\(/.test(reviewCode), false, 'review detector must be read-only');
assert.equal(/\bfetch\s*\(/.test(reviewCode), false, 'review detector must remain local');
assert.equal(/AHAIngest|EchoNet|sync_enabled/.test(reviewCode), false, 'review detector must not activate downstream systems');

console.log('aha-personal-ai-memory-review-and-rewrite.test.cjs passed');
