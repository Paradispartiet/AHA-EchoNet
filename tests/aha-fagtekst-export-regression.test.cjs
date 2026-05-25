const assert = require('assert');
const fs = require('fs');

const code = fs.readFileSync('ahaChat.js','utf8');

assert.ok(code.includes('Kort fagoppsummering'), 'Expected academic summary label to be fagoppsummering');
assert.ok(code.includes('Definisjon') && code.includes('Fortelling / hendelse') && code.includes('Teologisk betydning'), 'Expected semantic academic sort structure');
assert.ok(code.includes('buildCanonicalAnalysis(payload, sourceText)'), 'Expected canonical analysis in export flow');
assert.ok(code.includes('den hellige ånd') && code.includes('tungetale') && code.includes('babels tårn'), 'Expected pinse fagbegreper as academic signals');

console.log('aha-fagtekst-export-regression passed');
