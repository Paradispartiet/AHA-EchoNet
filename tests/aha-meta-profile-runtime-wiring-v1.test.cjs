const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const profileHtml = read('profile.html');
const providerLoader = read('js/ahaChatProviderLoader.js');
const chatBootstrap = read('js/ahaChat.js');
const metaEngine = read('js/metaInsightsEngine.js');
const semanticCoreDoc = read('docs/AHA_INSIGHT_ENGINE_SEMANTIC_CORE_V1.md');

const insightsScript = profileHtml.indexOf('<script src="js/insightsChamber.js"></script>');
const metaScript = profileHtml.indexOf('<script src="js/metaInsightsEngine.js"></script>');
const profileScript = profileHtml.indexOf('<script src="js/ahaProfile.js"></script>');
assert(insightsScript >= 0, 'profile.html must load canonical InsightsEngine');
assert(metaScript > insightsScript, 'profile.html must load MetaInsightsEngine after InsightsEngine');
assert(profileScript > metaScript, 'profile.html must load ahaProfile only after MetaInsightsEngine');

assert.match(providerLoader, /metaInsights\.buildUserMetaProfile\(chamber, "sub_laring"\)/,
  'legacy export seam must delegate meta profile building to MetaInsightsEngine');
assert.doesNotMatch(chatBootstrap, /buildMetaProfile/,
  'ahaChat.js must remain a minimal bootstrap without meta compatibility logic');
assert.match(metaEngine, /function buildUserMetaProfile\(chamber, subjectId\)/,
  'MetaInsightsEngine must keep the canonical meta-profile builder');
assert.match(metaEngine, /buildUserMetaProfile/,
  'MetaInsightsEngine public API must expose the meta-profile builder');
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

console.log('aha meta profile runtime wiring v1: ok');
