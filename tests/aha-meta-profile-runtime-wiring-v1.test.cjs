const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const profileHtml = read('profile.html');
const providerLoader = read('js/ahaChatProviderLoader.js');
const chatBootstrap = read('js/ahaChat.js');
const semanticCoreDoc = read('docs/AHA_INSIGHT_ENGINE_SEMANTIC_CORE_V1.md');

const insightsScript = profileHtml.indexOf('<script src="js/insightsChamber.js"></script>');
const metaScript = profileHtml.indexOf('<script src="js/metaInsightsEngine.js"></script>');
const profileScript = profileHtml.indexOf('<script src="js/ahaProfile.js"></script>');
assert(insightsScript >= 0, 'profile.html must load canonical InsightsEngine');
assert(metaScript > insightsScript, 'profile.html must load MetaInsightsEngine after InsightsEngine');
assert(profileScript > metaScript, 'profile.html must load ahaProfile only after MetaInsightsEngine');

assert.match(chatBootstrap, /MetaInsightsEngine\.buildUserMetaProfile\(chamber, "sub_laring"\)/,
  'chat export compatibility seam must delegate meta profile building to MetaInsightsEngine');
assert.doesNotMatch(providerLoader, /Semantic quality bridge v1/,
  'provider loader must not install the removed AI-reply semantic bridge');
assert.doesNotMatch(providerLoader, /assistantReply|bestReplySemanticSentence/,
  'AI reply text must not be a provider-level canonical insight fallback');
assert.match(semanticCoreDoc, /AI-agentens svar er ikke motorens sannhet/,
  'semantic core docs must lock the AI reply boundary');
assert.match(semanticCoreDoc, /Entity er ikke concept/,
  'semantic core docs must distinguish entities from concepts');
assert.match(semanticCoreDoc, /Source excerpt er ikke ferdig insight/,
  'semantic core docs must require insight transformation');

const IE = require('../js/insightsChamber.js');
const Meta = require('../js/metaInsightsEngine.js');
const chamber = IE.createEmptyChamber();
[
  ['kunst og rammer', 'Kunstneriske rammer kan påvirke hvordan form og innhold utvikles.'],
  ['historisk kontekst', 'Politiske institusjoner og historiske erfaringer påvirker kunstnerens arbeidsvilkår.'],
  ['teknikk', 'Teknisk mestring gjør det mulig å variere uttrykk og form mellom ulike oppgaver.'],
  ['frihet', 'Kreativ frihet kan oppstå innenfor tydelige forutsetninger og begrensninger.'],
  ['tolkning', 'Et verk kan forstås gjennom forbindelsen mellom materiale, form og idé.']
].forEach(([theme, text]) => {
  const signal = IE.createSignalFromMessage(text, 'sub_laring', theme, {});
  IE.addSignalToChamber(chamber, signal);
});

const profile = Meta.buildUserMetaProfile(chamber, 'sub_laring');
assert(profile && typeof profile === 'object', 'MetaInsightsEngine must return a profile object');
assert(Array.isArray(profile.insights) && profile.insights.length > 0,
  'meta profile must include active chamber insights');
assert(Array.isArray(profile.topics) && profile.topics.length > 0,
  'meta profile must include topic profiles');
assert(profile.meta_insight && profile.meta_insight.readiness,
  'meta profile must include the derived meta insight summary');
assert.notEqual(profile.meta_insight.readiness.level, 'tom',
  'non-empty chamber must not produce an empty meta profile');

console.log('aha meta profile runtime wiring v1: ok');
