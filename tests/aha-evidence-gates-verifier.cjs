#!/usr/bin/env node
const assert = require('assert');

function shouldAllow(source, tokenGroup) {
  const src = ` ${String(source || '').toLowerCase()} `;
  if (tokenGroup === 'media') return /\bgard\s+steiros?\b|\btv\s*2\b|\bvgs?\b|\baftenpostens?\b|\bschibsteds?\b/i.test(src);
  if (tokenGroup === 's_relation') return /\brelasjonen til s\b|\bs\b\s+(?:sa|skrev|ringte|svarte)\b|\b(?:til|fra)\s+s\b/i.test(src);
  if (tokenGroup === 'sahel') return /\bsahel\b|\bmali\b|\bknapphetsskolen\b|\bpolitisk økologi\b|\bressursknapphet\b/i.test(src);
  if (tokenGroup === 'knausgaard') return /\bkarl\s+ove\s+knausg[aå]rds?\b|\bknausg[aå]rds?\b|\bom\s+v[åa]ren\b|\blinda\s+bostr[öo]m\s+knausg[aå]rds?\b/i.test(src);
  return false;
}

const cases = [
  { name: 'boligpolitikk', source: 'Boligpolitikk og leiemarked i Oslo.', group: 'media', expected: false },
  { name: 'dagbok uten S', source: 'Jeg skrev dagbok om uro og søvn.', group: 's_relation', expected: false },
  { name: 'NAV uten Sahel', source: 'NAV-reformen og lokal måloppnåelse i kontorene.', group: 'sahel', expected: false },
  { name: 'litterær uten Knausgård', source: 'Romanen drøfter nære relasjoner og fortellerstemme.', group: 'knausgaard', expected: false },
  { name: 'tilknytning uten Knausgård', source: 'Teksten bruker tilknytningsteori i analysen.', group: 'knausgaard', expected: false }
];

for (const c of cases) {
  assert.strictEqual(shouldAllow(c.source, c.group), c.expected, c.name);
}

console.log('evidence gate verifier passed');
