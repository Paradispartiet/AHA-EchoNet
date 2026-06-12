const assert = require('assert');
const fs = require('fs');

const HOME_FILE = 'index.html';
const DASHBOARD_FILE = 'js/ahaDashboard.js';
const DRY_RUN_TARGET_ADAPTER_FILE = 'js/ahaManualSyncDryRunTargetAdapter.js';
const STRATEGY_FILE = 'docs/AHA_SYNC_HUB_MODULE_LOADING_STRATEGY.md';

const HOME_ALLOWED_SYNC_SCRIPTS = [
  'js/ahaSyncHub.js',
  'js/ahaManualSyncDryRunTargetAdapter.js',
  'js/ahaDashboard.js'
];
const HOME_FORBIDDEN_RUNTIME_SCRIPTS = [
  'js/ahaLists.js',
  'js/ahaPaths.js',
  'js/ahaGroups.js',
  'js/ahaAvisa.js'
];
const RUNTIME_LOADING_PATTERNS = [
  [/ahaLists\.js/, 'Lists runtime file'],
  [/ahaPaths\.js/, 'Paths runtime file'],
  [/ahaGroups\.js/, 'Groups runtime file'],
  [/ahaAvisa\.js/, 'AHAavisa runtime file'],
  [/\bimport\s*\(/, 'dynamic import'],
  [/createElement\s*\(\s*["']script["']\s*\)/, 'script element creation'],
  [/\.appendChild\s*\(\s*script\b/, 'script append'],
  [/\bappendChild\s*\(\s*moduleScript\b/, 'module script append']
];
const SYNC_EXECUTION_PATTERNS = [
  [/\bsyncFromDatabase\s*\(/, 'syncFromDatabase call'],
  [/\bAHARepository\s*\.\s*save\b/, 'AHARepository.save call'],
  [/\bAHARepository\s*\.\s*load\b/, 'AHARepository.load call'],
  [/\bsupabase\s*\.\s*from\s*\(/i, 'Supabase query'],
  [/\bfetch\s*\(/, 'fetch call'],
  [/\blocalStorage\s*\.\s*setItem\s*\(/, 'localStorage write'],
  [/\blocalStorage\s*\.\s*removeItem\s*\(/, 'localStorage removal'],
  [/\bdispatchEvent\s*\(\s*new\s+CustomEvent\b/, 'source event dispatch'],
  [/\bsource_events\b/, 'source_events creation path'],
  [/\bcreateInsight\s*\(/, 'insight creation'],
  [/\bpublish\s*\(/, 'publish call']
];

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

function assertNoPatterns(source, patterns, scope) {
  for (const [pattern, label] of patterns) {
    assert.equal(pattern.test(source), false, `${scope} must not contain ${label}`);
  }
}

const homeCode = read(HOME_FILE);
const dashboardCode = read(DASHBOARD_FILE);
const adapterCode = read(DRY_RUN_TARGET_ADAPTER_FILE);
const strategyCode = read(STRATEGY_FILE);

// Home keeps the read-only Sync Hub scripts and excludes execution runtimes.
for (const script of HOME_ALLOWED_SYNC_SCRIPTS) {
  assert.match(homeCode, new RegExp(`<script\\s+[^>]*src=["']${script.replaceAll('.', '\\.')}(?:["'][^>]*)>`), `Home must load ${script}`);
}
for (const script of HOME_FORBIDDEN_RUNTIME_SCRIPTS) {
  assert.equal(homeCode.includes(script), false, `Home must not load ${script}`);
}

const syncHubIndex = homeCode.indexOf('js/ahaSyncHub.js');
const dryRunAdapterIndex = homeCode.indexOf('js/ahaManualSyncDryRunTargetAdapter.js');
const dashboardIndex = homeCode.indexOf('js/ahaDashboard.js');
assert.ok(syncHubIndex < dryRunAdapterIndex, 'Sync Hub must load before the dry-run target adapter');
assert.ok(dryRunAdapterIndex < dashboardIndex, 'the dry-run target adapter must load before the dashboard');

// Dashboard source cannot import or inject the four sync module runtimes.
assertNoPatterns(dashboardCode, RUNTIME_LOADING_PATTERNS, 'dashboard');

// Sync Hub status and preview render paths remain no-sync/no-write/no-side-effect.
const previewFunctions = [
  'renderAhaManualSyncDryRunTargetPreview',
  'renderSyncHubStatus'
];
for (const functionName of previewFunctions) {
  const functionCode = extractFunction(dashboardCode, functionName);
  assertNoPatterns(functionCode, RUNTIME_LOADING_PATTERNS, functionName);
  assertNoPatterns(functionCode, SYNC_EXECUTION_PATTERNS, functionName);
}

// Page-load/render/storage/auth/timer paths cannot hide runtime loading or sync execution.
const triggerFunctions = [
  'renderDashboard',
  'renderSyncHubStatus',
  'bind'
];
for (const functionName of triggerFunctions) {
  const functionCode = extractFunction(dashboardCode, functionName);
  assertNoPatterns(functionCode, RUNTIME_LOADING_PATTERNS, functionName);
  assertNoPatterns(functionCode, SYNC_EXECUTION_PATTERNS, functionName);
}
assert.match(dashboardCode, /addEventListener\s*\(\s*["']DOMContentLoaded["']\s*,\s*bind\s*\)/, 'DOMContentLoaded may only enter through the inspected bind path');
assert.match(dashboardCode, /addEventListener\s*\(\s*["']aha:auth-ready["']\s*,\s*renderDashboard\s*\)/, 'auth-ready may only enter through the inspected dashboard render path');
assert.match(dashboardCode, /addEventListener\s*\(\s*["']storage["']\s*,/, 'storage refresh path should remain explicit and inspectable');
assert.equal(/addEventListener\s*\(\s*["']visibilitychange["']/.test(dashboardCode), false, 'visibilitychange must not trigger dashboard loading or execution');
assert.equal(/\bsetInterval\s*\(/.test(dashboardCode), false, 'intervals must not trigger dashboard loading or execution');
assert.equal(/\bsetTimeout\s*\(/.test(dashboardCode), false, 'timers must not trigger dashboard loading or execution');

// The dry-run target adapter may inspect local records, but cannot load runtime or write/execute.
assertNoPatterns(adapterCode, RUNTIME_LOADING_PATTERNS, 'dry-run target adapter');
assertNoPatterns(adapterCode, SYNC_EXECUTION_PATTERNS.slice(0, 9), 'dry-run target adapter');

// The architecture decision and permanent safety boundary remain documented evidence.
for (const evidence of [
  'Option A',
  'dedicated sync execution page',
  'Home remains read-only',
  'Manual sync execution remains **NO-GO**',
  'Auto-sync is permanently forbidden',
  'feat: activate manual AHA Sync Hub execution',
  ...HOME_FORBIDDEN_RUNTIME_SCRIPTS
]) {
  assert.ok(strategyCode.includes(evidence), `module loading strategy must retain: ${evidence}`);
}

console.log('aha-sync-hub-module-loading-boundary.test.cjs passed');
