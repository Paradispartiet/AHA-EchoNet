const assert = require('node:assert/strict');
const fs = require('node:fs');

const server = fs.readFileSync('server.js', 'utf8');
const pipeline = fs.readFileSync('js/ahaChatInsightPipeline.js', 'utf8');
const contracts = fs.readFileSync('js/ahaContracts.js', 'utf8');

for (const field of ['evidence_quotes', 'claim_kind', 'uncertainty', 'why_it_matters', 'next_test']) {
  assert.match(server, new RegExp(field), `server candidate contract must request and sanitize ${field}`);
  assert.match(pipeline, new RegExp(field), `browser candidate contract must retain ${field}`);
}
assert.match(server, /source\.includes\(quote\)/, 'server must verify evidence quotes against the submitted source');
assert.match(server, /never construct quotes|aldri konstruer sitater/i, 'generation policy must prohibit invented evidence quotes');
assert.match(pipeline, /semantic_duplicate/, 'pipeline must reject semantic duplicates');
assert.match(pipeline, /below_quality_threshold/, 'pipeline must reject candidates below the quality threshold');
assert.match(contracts, /upstreamQuality/, 'ingest contract must preserve the candidate quality review');
assert.match(contracts, /Object\.assign\(\{\}, upstreamQuality/, 'canonical ingest metadata must extend rather than erase candidate quality');

console.log('aha-insight-candidate-quality-v2.test.cjs passed');
