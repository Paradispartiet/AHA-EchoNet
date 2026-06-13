const assert = require('assert');
const fs = require('fs');

const REQUIREMENTS_FILE = 'docs/AHA_SYNC_HUB_AUDIT_HISTORY_ACTIVATION_REQUIREMENTS.md';
const CHECKLIST_FILE = 'docs/AHA_SYNC_HUB_ACTIVATION_CHECKLIST_REVIEW.md';
const DASHBOARD_FILE = 'js/ahaDashboard.js';
const DRY_RUN_ADAPTER_FILE = 'js/ahaManualSyncDryRunTargetAdapter.js';
const HOME_FILE = 'index.html';
const EXECUTION_PAGE_FILE = 'sync.html';
const ACTIVATION_PR = 'feat: activate manual AHA Sync Hub execution';

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} should exist`);
  const bodyStart = source.indexOf('{', start);
  let depth = 0;

  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }

  assert.fail(`could not extract ${name}`);
}

function assertIncludesAll(source, values, scope) {
  for (const value of values) {
    assert.ok(source.includes(value), `${scope} must retain: ${value}`);
  }
}

function assertNoPatterns(source, patterns, scope) {
  for (const [pattern, label] of patterns) {
    assert.equal(pattern.test(source), false, `${scope} must not contain ${label}`);
  }
}

assert.ok(fs.existsSync(REQUIREMENTS_FILE), 'audit/history activation requirements document must exist');

const requirements = read(REQUIREMENTS_FILE);
const checklist = read(CHECKLIST_FILE);
const dashboard = read(DASHBOARD_FILE);
const dryRunAdapter = read(DRY_RUN_ADAPTER_FILE);
const home = read(HOME_FILE);

assertIncludesAll(requirements, [
  'Manual sync execution remains **NO-GO**',
  'Dedicated execution page remains planned, not implemented',
  'Home remains preview-only',
  'Auto-sync is permanently forbidden',
  'No audit/history write path may activate before all gates are **GO**'
], 'current decision');

assertIncludesAll(requirements, [
  '`runId`', '`timestamp`', '`trigger`', '`operator/session identity placeholder`', '`target`',
  '`targetStatus`', '`includedModules`', '`excludedModules`', '`dryRunSummary`', '`readinessSummary`',
  '`checklistSummary`', '`confirmationSummary`', '`perModuleResults`', '`perModuleErrors`', '`writeStatus`',
  '`rollbackStatus`', '`auditStatus`', '`warnings`', '`errors`', '`payloadChecksum`', '`noSecretsStored`',
  '`noFullPayloadStoredByDefault`'
], 'run-level audit contract');

assertIncludesAll(requirements, ['`lists`', '`paths`', '`groups`', '`avisa`'], 'module history contract');
assertIncludesAll(requirements, [
  '`module id`', '`label`', '`target id`', '`startedAt`', '`finishedAt`', '`previewStatus`',
  '`executionStatus`', '`recordsPlanned`', '`recordsAttempted`', '`recordsWritten`', '`recordsSkipped`',
  '`tombstonesDetected`', '`errors`', '`warnings`', '`rollbackRequired`', '`rollbackStatus`'
], 'per-module history contract');

assertIncludesAll(requirements, [
  'audit write must be explicit in the execution contract',
  'audit write must not happen on Home',
  'audit write must not happen during preview',
  'audit write must not happen during dry-run plan creation',
  'audit write must not happen on page load',
  'audit write must not happen on render',
  'audit write must not happen on storage event',
  'audit write must not happen on auth-ready',
  'audit write must not happen through timer/interval',
  'failed remote sync must not delete `localStorage`',
  'audit failure must not hide module failure',
  'audit failure must not mark sync as success'
], 'write safety requirements');

assertIncludesAll(requirements, [
  '`not_configured`', '`preview_only`', '`disabled_no_go`', '`pending`', '`writing`', '`written`',
  '`write_failed`', '`skipped`', '`partial_success`', '`failed`'
], 'audit status model');

assertIncludesAll(requirements, [
  'no source events from preview',
  'no insights creation',
  'no publishing',
  'no social sharing',
  'no AHAavisa publish side effects',
  'no Groups social operations',
  'no storing secrets',
  'no storing full payloads by default',
  'no silent success when audit failed',
  'no auto-run audit entry on page load'
], 'forbidden behavior');

for (const gate of ['Gate F', 'Gate G', 'Gate H', 'Gate I', 'Gate J']) {
  assert.ok(requirements.includes(gate), `audit/history requirements must remain connected to ${gate}`);
}
assert.ok(requirements.includes(ACTIVATION_PR), 'requirements must name the activation PR exactly');
assert.match(requirements, /activation PR still required/, 'activation PR must remain required before execution');

const forbiddenRuntimePatterns = [
  [/auditHistory\s*\.\s*write/, 'auditHistory.write'],
  [/\bwriteAudit\s*\(/, 'writeAudit call'],
  [/\bsaveAudit\s*\(/, 'saveAudit call'],
  [/\brecordAudit\s*\(/, 'recordAudit call'],
  [/\bsyncFromDatabase\s*\(/, 'syncFromDatabase call'],
  [/\bAHARepository\s*\.\s*save\b/, 'AHARepository.save call'],
  [/\bAHARepository\s*\.\s*load\b/, 'AHARepository.load call'],
  [/\bsupabase\s*\.\s*from\s*\(/i, 'Supabase query'],
  [/\bfetch\s*\(/, 'fetch call'],
  [/\blocalStorage\s*\.\s*setItem\s*\(/, 'localStorage write'],
  [/\blocalStorage\s*\.\s*removeItem\s*\(/, 'localStorage removal'],
  [/\bdispatchEvent\s*\(\s*new\s+CustomEvent\b/, 'CustomEvent dispatch'],
  [/\bsource_events\b/, 'source_events path'],
  [/\bcreateInsight\s*\(/, 'insight creation'],
  [/\bpublish\s*\(/, 'publish call']
];

// The dashboard has unrelated legacy Home storage/repository behavior, so lock the
// active Sync Hub preview boundary rather than treating the entire dashboard as sync execution.
for (const functionName of ['renderAhaManualSyncDryRunTargetPreview', 'renderSyncHubStatus']) {
  assertNoPatterns(extractFunction(dashboard, functionName), forbiddenRuntimePatterns, functionName);
}
assertNoPatterns(dryRunAdapter, forbiddenRuntimePatterns, 'dry-run target adapter');
assertNoPatterns(home, forbiddenRuntimePatterns, 'Home HTML');
assert.equal(fs.existsSync(EXECUTION_PAGE_FILE), false, 'sync.html must remain absent');

assert.match(checklist, /Audit\/history activation requirements[\s\S]*Test-locked, not implemented; NO-GO for execution/, 'audit/history requirements must be test-locked evidence');
assert.match(checklist, /\*\*H\*\*[\s\S]*\*\*TEST-LOCKED, NOT IMPLEMENTED\*\*/, 'Gate H must remain reviewed/test-locked and not implemented');
assert.match(checklist, /Gates F, G, H, I, and J are still not full \*\*GO for execution\*\*/, 'Gates F/G/H/I/J must not be full GO for execution');
assert.match(checklist, /all gates A–J must be \*\*GO for execution\*\*/, 'all gates must be GO before activation');
assert.match(checklist, /Auto-sync is permanently forbidden/, 'auto-sync must remain permanently forbidden');
assert.ok(checklist.includes(ACTIVATION_PR), 'checklist must retain the exact activation PR name');

console.log('aha-manual-sync-audit-history-activation-requirements.test.cjs passed');
