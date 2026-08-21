const assert = require('node:assert/strict');
const fs = require('node:fs');

const explorer = fs.readFileSync('js/ahaExplorer.js', 'utf8');
const knowledgeView = fs.readFileSync('js/ahaChatKnowledgeView.js', 'utf8');
const chatHtml = fs.readFileSync('chat.html', 'utf8');
const chatCss = fs.readFileSync('css/aha-chat.css', 'utf8');

function occurrences(source, value) { return source.split(value).length - 1; }

assert.ok(explorer.includes('AHAAnalysisReadModelV2?.build'), 'Explorer must consume AnalysisReadModelV2');
assert.ok(explorer.includes('AHAKnowledgeMapReadModelV2?.build'), 'Explorer must consume KnowledgeMapReadModelV2');
assert.ok(explorer.includes('model.sections.overview'), 'Overview must read the typed overview section');
assert.ok(explorer.includes('model.sections.insights'), 'Insights must read the typed insight section');
assert.ok(explorer.includes('model.sections.concepts'), 'Concepts must read the typed concept section');
assert.ok(explorer.includes('model.sections.conversation_tracks'), 'Conversation tracks must read the typed section');
assert.ok(explorer.includes('model.sections.subjects'), 'Subjects must read the typed section');
assert.ok(explorer.includes('model.sections.sources'), 'Sources must read the typed section');
assert.ok(explorer.includes('model.sections.source_structure'), 'Source structure must read the typed section');
assert.ok(explorer.includes('model.sections.afterwork'), 'Afterwork must read the typed section');

assert.equal(explorer.includes('chamberInsights'), false, 'Explorer must not merge Chamber insights into the current analysis');
assert.equal(explorer.includes('rawAutoPayload'), false, 'Explorer must not render legacy raw auto payload');
assert.equal(explorer.includes('afterwork.list'), false, 'Legacy List output must not appear under source structure');
assert.equal(explorer.includes('afterwork.path'), false, 'Legacy Path output must not appear under source structure');
assert.equal(explorer.includes('loadWebArticleSourceEvents'), false, 'Source events must not replace AnalysisBundleV2 source records');
assert.equal(explorer.includes('global.showMeta'), false, 'Knowledge Map focus must not open the legacy Chamber map');
assert.ok(explorer.includes('Kildens struktur'));
assert.ok(explorer.includes('Kunnskapskart'));
assert.ok(explorer.includes('Tankekart'));
assert.ok(explorer.includes('origin_scope === "historical"'), 'Historical map nodes must be rendered separately');

assert.equal(knowledgeView.includes('data-analysis-artifact="mindmap"'), false, 'Knowledge Map must not materialize the first Mindmap candidate');
assert.equal(knowledgeView.includes('data-analysis-artifact="path"'), false, 'Knowledge Map must not materialize the first Path candidate');
assert.ok(knowledgeView.includes('Åpne separat Tankekart-forhåndsvisning'));

assert.ok(chatHtml.includes('<h2 id="aha-analysis-title">AHA ser nå</h2>'));
assert.equal(chatHtml.includes('role="tablist"'), false);
assert.equal(chatHtml.includes('role="tabpanel"'), false);
for (const card of ['oversikt', 'innsikter', 'begreper', 'samtalespor', 'fag', 'kilder', 'struktur', 'etterarbeid', 'kart', 'verktoy', 'mer']) {
  assert.equal(occurrences(chatHtml, `data-analysis-card="${card}"`), 1, `${card} should have one canonical card`);
}
assert.ok(explorer.includes('function focusCard(name)'));
assert.ok(explorer.includes('open: focusCard, focus: focusCard'));
assert.ok(chatCss.includes('.analysis-card-grid'));

console.log('aha-explorer-no-duplicate-aha-ser.test.cjs passed');
