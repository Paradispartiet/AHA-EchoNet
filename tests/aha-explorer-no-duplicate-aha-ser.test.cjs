const assert = require('assert');
const fs = require('fs');

const explorerCode = fs.readFileSync('js/ahaExplorer.js', 'utf8');

const renderOversiktStart = explorerCode.indexOf('function renderOversikt(b)');
const renderOversiktEnd = explorerCode.indexOf('// ── Innsikter', renderOversiktStart);
assert.notEqual(renderOversiktStart, -1, 'Explorer should define renderOversikt');
assert.notEqual(renderOversiktEnd, -1, 'renderOversikt section should be bounded by Innsikter section');

const renderOversikt = explorerCode.slice(renderOversiktStart, renderOversiktEnd);
assert.ok(renderOversikt.includes('card("Kort svar"'), 'Explorer overview may keep the Kort svar card');
assert.equal(renderOversikt.includes('card("AHA SER"'), false, 'Explorer overview must not render a duplicate AHA SER card');
assert.equal(/<h3>\s*AHA SER\s*<\/h3>/i.test(renderOversikt), false, 'Explorer overview must not include a visible AHA SER heading');

const renderAhaNowStart = explorerCode.indexOf('function renderAhaNow(b)');
const renderAhaNowEnd = explorerCode.indexOf('function renderEtterarbeid', renderAhaNowStart);
assert.notEqual(renderAhaNowStart, -1, 'Explorer should define the top AHA-now renderer');
assert.notEqual(renderAhaNowEnd, -1, 'renderAhaNow section should be bounded by Etterarbeid renderer');

const renderAhaNow = explorerCode.slice(renderAhaNowStart, renderAhaNowEnd);
assert.ok(renderAhaNow.includes('AHAConversationInsightSnapshot'), 'Top AHA-now card should render the safe snapshot preview');
assert.ok(renderAhaNow.includes('buildConversationInsightSnapshot'), 'Top AHA-now card should use the snapshot builder');
for (const label of ['Innholdstype', 'Tema', 'Hovedspenning', 'Viktigste innsikt', 'Neste steg']) {
  assert.equal(renderOversikt.includes(`dlRow("${label}"`), false, `Explorer overview should not repeat live analysis field ${label}`);
}

console.log('aha-explorer-no-duplicate-aha-ser.test.cjs passed');
