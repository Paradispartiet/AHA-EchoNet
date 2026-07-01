const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const file = (relativePath) => path.join(root, relativePath);
const exists = (relativePath) => fs.existsSync(file(relativePath));
const read = (relativePath) => fs.readFileSync(file(relativePath), 'utf8');

function listAhaSyncFiles() {
  return fs.readdirSync(file('js'))
    .filter((name) => /^ahaSync.*\.js$/.test(name))
    .map((name) => `js/${name}`)
    .sort();
}

function assertDoesNotMatch(source, patterns, label) {
  for (const pattern of patterns) {
    assert.equal(pattern.test(source), false, `${label} must not match ${pattern}`);
  }
}

function stripSafetyLists(source) {
  return source
    .replace(/assertDoesNotMatch\([\s\S]*?\n\);/g, '')
    .replace(/forbidden[A-Za-z]*\s*=\s*\[[\s\S]*?\];/g, '')
    .replace(/deny[A-Za-z]*\s*=\s*\[[\s\S]*?\];/g, '');
}

function indexOfScript(html, scriptPath) {
  const escaped = scriptPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = html.match(new RegExp(`<script[^>]+src=["']${escaped}["'][^>]*>`, 'i'));
  return match ? match.index : -1;
}

const ahaSyncFiles = listAhaSyncFiles();
assert.ok(ahaSyncFiles.length > 0, 'must find existing js/ahaSync*.js files');
const relevantFiles = [...ahaSyncFiles, 'js/ahaDashboard.js', 'index.html'];
for (const relativePath of relevantFiles) {
  assert.ok(exists(relativePath), `must include/read ${relativePath}`);
  assert.ok(read(relativePath).length > 0, `${relativePath} must not be empty`);
}

assert.equal(fs.existsSync(file('js/ahaSyncConfirmationGate.js')), false);

const forbiddenWriteOrSync = [
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
  /autoSync\s*[:=]\s*(?!false\b)(?:true|["'\w])/,
  /backgroundSync/,
  /\bpublish\b/,
  /\bshare\b/,
  /approveCandidate/,
  /rejectCandidate/,
  /approvalAction/
];

const forbiddenRawOutputReads = [
  /sourceEvent\.text/,
  /event\.text/,
  /candidate\.text/,
  /candidate\.previewLabel/,
  /sourceEvent\.url/,
  /source\.url/,
  /\brawText\b/,
  /\brawPayload\b/,
  /\bfullText\b/,
  /\bprivatePayload\b/,
  /\bprivateMetadata\b/,
  /\buserId\b/,
  /\bemail\b/
];

const forbiddenProjectManagementFields = [
  /\bphase\b/,
  /\bpriority\b/,
  /\bhealth\b/,
  /\bnextPr\b/,
  /\brepoStatus\b/,
  /\bbuildStage\b/,
  /\bprojectRoadmap\b/
];

for (const relativePath of ahaSyncFiles) {
  const source = stripSafetyLists(read(relativePath));
  assertDoesNotMatch(source, forbiddenWriteOrSync, relativePath);
  assertDoesNotMatch(source, forbiddenRawOutputReads, relativePath);
  assertDoesNotMatch(source, forbiddenProjectManagementFields, relativePath);
}

const builderSource = read('js/ahaSyncCandidateBuilder.js');
for (const required of [
  /approvalBoundary/,
  /personal_ai_loop_source_approval/,
  /approvalState/,
  /suggested/,
  /requiresUserConfirmation/,
  /local_only/
]) {
  assert.match(builderSource, required, `candidate builder must keep approval boundary invariant: ${required}`);
}
assertDoesNotMatch(builderSource, [
  /approved:\s*true/,
  /approvalState:\s*"approved"/,
  /approvalState:\s*'approved'/,
  /autoApprove/,
  /autoApproval/,
  /allowed:\s*true/
], 'js/ahaSyncCandidateBuilder.js');

const dashboardSource = read('js/ahaDashboard.js');
assert.match(dashboardSource, /AHA Sync Overview|AHA Sync-oversikt/i, 'dashboard must keep AHA Sync Overview copy');
assert.match(dashboardSource, /read-only/i, 'dashboard must state read-only');
assert.match(dashboardSource, /local-only|local_only/i, 'dashboard must state local-only');
assert.match(dashboardSource, /no sync|ingen sync/i, 'dashboard must state no sync');
const dashboardHelpers = {
  AHASyncInsightDigest: 'js/ahaSyncInsightDigest.js',
  AHASyncReviewQueue: 'js/ahaSyncReviewQueue.js',
  AHASyncCandidateBuilder: 'js/ahaSyncCandidateBuilder.js',
  AHASyncSourceTypeSummary: 'js/ahaSyncSourceTypeSummary.js',
  AHASyncChannelSourceMatrix: 'js/ahaSyncChannelSourceMatrix.js',
  AHASyncCoverageGaps: 'js/ahaSyncCoverageGaps.js',
  AHA_SYNC_CHANNELS: 'js/ahaSyncChannelsRegistry.js'
};
for (const [helper, helperPath] of Object.entries(dashboardHelpers)) {
  if (exists(helperPath)) {
    assert.match(dashboardSource, new RegExp(helper), `dashboard must use existing helper/model: ${helper}`);
  }
}

const indexSource = read('index.html');
const dashboardScriptIndex = indexOfScript(indexSource, 'js/ahaDashboard.js');
assert.ok(dashboardScriptIndex >= 0, 'index.html must load js/ahaDashboard.js');
for (const helperPath of [
  'js/ahaSyncSourceTypeSummary.js',
  'js/ahaSyncChannelSourceMatrix.js',
  'js/ahaSyncCoverageGaps.js',
  'js/ahaSyncInsightDigest.js',
  'js/ahaSyncReviewQueue.js',
  'js/ahaSyncCandidateBuilder.js',
  'js/ahaSyncChannelRouter.js'
]) {
  if (!exists(helperPath)) continue;
  const helperScriptIndex = indexOfScript(indexSource, helperPath);
  assert.ok(helperScriptIndex >= 0, `index.html must load existing helper ${helperPath}`);
  assert.ok(helperScriptIndex < dashboardScriptIndex, `${helperPath} must load before js/ahaDashboard.js`);
}

for (const docPath of [
  'docs/AHA_IMPLEMENTATION_STATUS.md',
  'docs/AHA_SYNC_HUB_PLAN.md',
  'docs/AHA_CONVERSATION_INSIGHT_SYNC_PLAN.md'
]) {
  assert.ok(exists(docPath), `${docPath} must exist`);
  const text = read(docPath);
  assert.match(text, /read-only/i, `${docPath} must document read-only`);
  assert.match(text, /local-only|local_only/i, `${docPath} must document local-only`);
  assert.match(text, /ingen sync|no sync/i, `${docPath} must document no sync`);
  assert.match(text, /ingen rå brukerdata|no raw user data|viser ikke rå brukerdata|rå brukerdata/i, `${docPath} must document no raw user data`);
  assert.match(text, /AHA_SYNC_CHANNELS/, `${docPath} must document AHA_SYNC_CHANNELS`);
  assert.match(text, /Personal AI Loop source approval boundary/i, `${docPath} must document approval boundary`);
  assert.match(text, /Sync er fortsatt\s*(?:\*\*)?NO-GO|fortsatt\s*(?:\*\*)?NO-GO/i, `${docPath} must document Sync remains NO-GO`);
}

console.log('aha-sync-global-safety.test.cjs passed');
