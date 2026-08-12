const assert = require('assert');
const fs = require('fs');

const explorerCode = fs.readFileSync('js/ahaExplorer.js', 'utf8');
const chatHtml = fs.readFileSync('chat.html', 'utf8');
const chatCss = fs.readFileSync('css/aha-chat.css', 'utf8');

function section(start, end) {
  const from = explorerCode.indexOf(start);
  const to = explorerCode.indexOf(end, from);
  assert.notEqual(from, -1, `Expected ${start}`);
  assert.notEqual(to, -1, `Expected ${end} after ${start}`);
  return explorerCode.slice(from, to);
}

function occurrences(source, value) {
  return source.split(value).length - 1;
}

const renderOversikt = section('function renderOversikt(b)', '// ── Innsikter');
assert.ok(renderOversikt.includes('dlRow("Viktigste innsikt"'), 'Hovedbildet should own the primary insight');
assert.ok(renderOversikt.includes('dlRow("Neste steg"'), 'Hovedbildet should own the primary next step');
for (const duplicateCard of ['card("Innsikter"', 'card("Begreper"', 'card("Fagkoblinger', 'card("Kilder"']) {
  assert.equal(renderOversikt.includes(duplicateCard), false, `Hovedbildet must not duplicate ${duplicateCard}`);
}

const renderSamtalespor = section('function renderSamtalespor(b)', 'function renderAhaNow(b)');
assert.ok(renderSamtalespor.includes('buildConversationSnapshot'), 'Samtalespor should keep the safe conversation snapshot');
assert.ok(renderSamtalespor.includes('Åpne spørsmål'), 'Samtalespor should preserve open questions');
assert.ok(renderSamtalespor.includes('Perspektiver'), 'Samtalespor should preserve perspectives');
assert.ok(renderSamtalespor.includes('Videre forståelsessteg'), 'Samtalespor should preserve additional next steps');
assert.equal(renderSamtalespor.includes('signals.concepts'), false, 'Begreper belong only in the Begreper card');
assert.equal(renderSamtalespor.includes('signals.conversationLinks'), false, 'Fag links belong only in the Fag card');

const renderBegreper = section('function renderBegreper(b)', '// ── Fag');
assert.ok(renderBegreper.includes('b.ahaSer?.begreper'), 'Begreper must retain AHA SER concepts after the merge');

const renderEtterarbeid = section('function renderEtterarbeid(b)', '// ── Verktøy');
assert.equal(renderEtterarbeid.includes('afterwork.sortItems'), false, 'Sortert struktur belongs only in Struktur');
assert.equal(renderEtterarbeid.includes('afterwork.list'), false, 'Liste belongs only in Struktur');
assert.equal(renderEtterarbeid.includes('afterwork.path'), false, 'Læringssti belongs only in Struktur');

assert.ok(chatHtml.includes('<h2 id="aha-analysis-title">AHA ser nå</h2>'), 'The merged surface should keep AHA ser nå as its title');
assert.equal(chatHtml.includes('Utforsk det AHA fant'), false, 'The old second surface should be removed');
assert.equal(chatHtml.includes('role="tablist"'), false, 'The merged surface must not use a tablist');
assert.equal(chatHtml.includes('role="tabpanel"'), false, 'The merged surface must not hide content in tabpanels');
assert.equal(chatHtml.includes('data-tab-panel='), false, 'The old tab-panel routing must be gone');
assert.equal(chatHtml.includes('data-open-tab='), false, 'Answer actions must target cards, not tabs');

for (const card of ['oversikt', 'innsikter', 'begreper', 'samtalespor', 'fag', 'kilder', 'struktur', 'etterarbeid', 'kart', 'verktoy', 'mer']) {
  assert.equal(occurrences(chatHtml, `data-analysis-card="${card}"`), 1, `${card} should have exactly one canonical card`);
}
for (const legacyId of ['aha-auto-output', 'afterwork-panel', 'panel', 'out', 'meta-profile-panel']) {
  assert.equal(occurrences(chatHtml, `id="${legacyId}"`), 1, `${legacyId} must remain available exactly once`);
}

assert.ok(chatHtml.includes('data-open-card="begreper"'), 'Answer actions should focus the Begreper card');
assert.ok(chatHtml.includes('window.AHAExplorer?.focus(card)'), 'Answer actions should use card focus routing');
assert.ok(explorerCode.includes('function focusCard(name)'), 'Explorer should expose card focus behavior');
assert.ok(explorerCode.includes('open: focusCard, focus: focusCard'), 'The old open API should remain as a compatibility alias');
assert.equal(explorerCode.includes('querySelectorAll("[data-tab-panel]")'), false, 'Explorer must not hide sibling cards');
assert.ok(chatCss.includes('.analysis-card-grid'), 'The merged surface should use a responsive card grid');
assert.equal(chatCss.includes('.explorer-tabs'), false, 'Tab styling should be removed');

console.log('aha-explorer-no-duplicate-aha-ser.test.cjs passed');
