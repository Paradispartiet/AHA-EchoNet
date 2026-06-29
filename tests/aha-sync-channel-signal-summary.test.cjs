const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const dashboardPath = 'js/ahaDashboard.js';
const registryPath = 'js/ahaSyncChannelsRegistry.js';
const routerPath = 'js/ahaSyncChannelRouter.js';
const docsPaths = [
  'README.md',
  'docs/AHA_CONVERSATION_INSIGHT_SYNC_PLAN.md',
  'docs/AHA_SYNC_HUB_PLAN.md',
  'docs/AHA_IMPLEMENTATION_STATUS.md',
  'docs/AHA_PERSONAL_AI_LOOP_SOURCE_APPROVAL_SURFACE.md'
];

assert.equal(fs.existsSync(path.join(root, 'js/ahaSyncConfirmationGate.js')), false, 'must not create a sync confirmation gate');

const dashboardSource = read(dashboardPath);
const registrySource = read(registryPath);
const routerSource = read(routerPath);
const docsSource = docsPaths.map(read).join('\n');

assert.match(registrySource, /window\.AHA_SYNC_CHANNELS\s*=/, 'AHA_SYNC_CHANNELS must remain the main channel model');
assert.match(dashboardSource, /Samtale- og innsiktskanaler|Kanalsignaler|Channel signal summary/i, 'dashboard must expose a channel signal summary surface');
assert.match(dashboardSource, /AHASyncChannelRouter/, 'dashboard must use AHASyncChannelRouter');
assert.match(routerSource, /routeSourceEvent/, 'router must expose routeSourceEvent');
assert.match(dashboardSource, /AHA_SYNC_CHANNELS/, 'dashboard must render AHA_SYNC_CHANNELS');

const dashboardSignalSummary = dashboardSource.slice(
  dashboardSource.indexOf('function renderAhaSyncChannelPreview()'),
  dashboardSource.indexOf('function renderAhaSyncChannelsStatus()')
);
assert.ok(dashboardSignalSummary.length > 0, 'must find the channel signal summary/route preview function');
assert.match(dashboardSource, /renderAhaSyncChannelPreview/, 'dashboard must render the channel signal summary/route preview');

for (const [channelId, safeLabelPattern] of [
  ['conversation-insights', /conversation|Samtale(?:signal|innsikter)|Samtale-/i],
  ['open-questions', /question|Spørsmål(?:ssignal)?|Åpne spørsmål/i],
  ['concept-links', /concept|Begrep(?:ssignal|skoblinger)?/i],
  ['perspectives', /perspective|Perspektiv(?:signal|er)?/i],
  ['tensions', /tension|Spenning(?:ssignal|er)?|Uenigheter og spenninger/i],
  ['conversation-links', /link|Kobling(?:ssignal|er)?|Samtalekoblinger/i]
]) {
  assert.match(registrySource, new RegExp(channelId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `channel registry must include ${channelId}`);
  assert.match(`${registrySource}\n${dashboardSource}`, safeLabelPattern, `safe signal label must exist for ${channelId}`);
}

for (const forbidden of [
  'sourceEvent.text',
  'event.text',
  'candidate.text',
  'rawText',
  'rawPayload',
  'fullText',
  'privatePayload',
  'privateMetadata'
]) {
  assert.equal(dashboardSignalSummary.includes(forbidden), false, `channel signal summary must not render raw data field: ${forbidden}`);
}

for (const forbidden of [
  /localStorage\.setItem/,
  /localStorage\.removeItem/,
  /fetch\s*\(/,
  /XMLHttpRequest/,
  /sendBeacon/,
  /supabase\./,
  /\binsert\s*\(/,
  /\bupdate\s*\(/,
  /\bupsert\s*\(/,
  /\bdelete\s*\(/,
  /executeSync/,
  /runSync/,
  /performSync/,
  /startSync/,
  /manualSync/,
  /autoSync/,
  /backgroundSync/,
  /\bpublish\b/,
  /\bshare\b/
]) {
  assert.equal(forbidden.test(dashboardSignalSummary), false, `channel signal summary must not write or sync: ${forbidden}`);
}

assert.match(docsSource, /channel signal summary|kanalsignaler|samtale- og innsiktskanaler|route preview/i, 'docs must describe channel signal summary/kanalsignaler');
assert.match(docsSource, /read-only/i, 'docs must state read-only');
assert.match(docsSource, /no raw user data|ingen rå brukerdata|viser ikke rå brukerdata/i, 'docs must state no raw user data');
assert.match(docsSource, /no sync|ingen sync|Ingen sync kjøres/i, 'docs must state no sync');
assert.match(docsSource, /AHA_SYNC_CHANNELS/, 'docs must reference AHA_SYNC_CHANNELS');

console.log('aha-sync-channel-signal-summary.test.cjs passed');
