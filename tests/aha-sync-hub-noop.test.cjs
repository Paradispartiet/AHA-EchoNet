const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function read(path) { return fs.readFileSync(path, 'utf8'); }
function runBrowserScript(path, extra = {}) {
  const calls = [];
  const window = {
    localStorage: {
      getItem(key) {
        if (key === 'aha_lists_v1') return JSON.stringify([{ id: 1 }, { id: 2, deletedAt: 'x' }, { id: 3, archived: true }]);
        if (key === 'aha_paths_v1') return JSON.stringify([{ id: 1 }]);
        if (key === 'aha_groups_v1') return JSON.stringify([{ id: 1 }]);
        if (key === 'aha_articles_v1') return JSON.stringify([{ id: 1 }]);
        return '[]';
      }
    },
    AHALists: { syncFromDatabase() { calls.push('lists'); } },
    AHAPaths: { syncFromDatabase() { calls.push('paths'); } },
    AHAGroups: { syncFromDatabase() { calls.push('groups'); } },
    AHAAvisa: { syncFromDatabase() { calls.push('avisa'); } },
    ...extra
  };
  const context = vm.createContext({ window, console, module: { exports: {} }, exports: {} });
  vm.runInContext(read(path), context, { filename: path });
  return { window, calls, context };
}

// A. Module registry remains planned/no-op.
{
  const code = read('js/ahaModules.js');
  const block = code.match(/id:\s*"sync-hub"[\s\S]*?phase:\s*2/)[0];
  assert.match(block, /status:\s*"planned"/);
  assert.match(block, /Planlagt local-only oversikt.*dry-run.*Ingen auto-sync/s);
  assert.doesNotMatch(block, /status:\s*"active"/);
}

// B/C. Sync Hub inspection is planned/no-op and never calls module sync functions.
{
  const { window, calls } = runBrowserScript('js/ahaSyncHub.js');
  const result = window.AHASyncHub.inspectAll();
  assert.equal(result.mode, 'planned_noop');
  assert.equal(result.local_only, true);
  assert.equal(result.dry_run_only, true);
  assert.equal(result.autoSync, false);
  assert.equal(result.sync_enabled, false);
  assert.equal(result.echonet_enabled, false);
  assert.equal(result.backend_enabled, false);
  assert.deepEqual(calls, []);
  assert.equal(window.AHASyncHub.countActiveRecords('aha_lists_v1'), 1);
  const lists = result.modules.find((module) => module.moduleId === 'lists');
  assert.equal(lists.syncFunctionAvailable, true);
  assert.equal(lists.canAutoSyncHere, false);
  assert.equal(lists.canSyncHere, false);
  assert.equal(lists.deprecatedCanSyncHere, true);

  const code = read('js/ahaSyncHub.js');
  for (const forbidden of ['AHARepository', 'fetch(', 'Supabase', 'createClient']) assert.equal(code.includes(forbidden), false, forbidden);
  assert.equal(/\.syncFromDatabase\s*\(/.test(code), false, 'must not call syncFromDatabase');
}

// D. Conceptual channels carry no-op metadata.
{
  const { window } = runBrowserScript('js/ahaSyncChannelsRegistry.js');
  assert.ok(window.AHA_SYNC_CHANNELS.length > 0);
  for (const channel of window.AHA_SYNC_CHANNELS) {
    assert.equal(channel.local_only, true);
    assert.equal(channel.planned_only, true);
    assert.equal(channel.dry_run_only, true);
    assert.equal(channel.sync_enabled, false);
    assert.equal(channel.echonet_enabled, false);
  }
}

// E. Project registry remains later/no backend/no write-back.
{
  const { window } = runBrowserScript('js/ahaSyncHubRegistry.js');
  const echonet = window.AHA_SYNC_HUB_PROJECTS.find((p) => p.id === 'echonet');
  assert.equal(echonet.status, 'senere');
  assert.match(`${echonet.note} ${echonet.next}`, /Ikke aktivert|Ingen data deles|ingen sync|ingen backend/i);
  const history = window.AHA_SYNC_HUB_PROJECTS.find((p) => p.id === 'history-go');
  assert.match(`${history.status} ${history.note} ${history.next}`, /read\/import|write-back|ikke skrive tilbake/i);
}

// F. Contract doc exists and states the boundary.
{
  const doc = read('docs/AHA_SYNC_HUB_NOOP_CONTRACT.md');
  for (const phrase of ['planned/no-op', 'dry-run', 'automatic sync', 'backend', 'EchoNet', 'History Go write-back', 'AHARepository', 'fetch for remote sync']) {
    assert.match(doc, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  }
}

// G. UI copy says planned/no-op and does not claim live sync.
{
  const ui = read('js/ahaDashboard.js') + read('index.html');
  assert.match(ui, /Sync Hub er planlagt\/no-op.*dry-run-status/s);
  assert.match(ui, /Moduler kan ha egne database-flagg, men Sync Hub kaller dem ikke automatisk/);
  assert.match(ui, /EchoNet er et senere kollektivt lag og er ikke aktivert/);
  assert.doesNotMatch(ui, /sync is live|sync er live|aktiv sync kjører/i);
}

// H. Forbidden implementation patterns across Sync Hub files.
{
  const files = [
    'js/ahaSyncHub.js','js/ahaSyncHubRegistry.js','js/ahaSyncChannelsRegistry.js','js/ahaSyncChannelRouter.js',
    'js/ahaSyncCandidateBuilder.js','js/ahaSyncReviewQueue.js','js/ahaSyncInsightDigest.js','js/ahaSyncSourceTypeSummary.js',
    'js/ahaSyncChannelSourceMatrix.js','js/ahaSyncCoverageGaps.js','js/ahaManualSyncDryRunTargetAdapter.js',
    'js/ahaManualSyncStateMachine.js','js/ahaManualSyncAdapter.js','js/ahaManualSyncHistory.js'
  ];
  const forbidden = [/AHARepository/, /Supabase/, /createClient/, /fetch\s*\(/, /\.syncFromDatabase\s*\(/, /navigator\.share/, /sendInvite/, /visited_places/, /hg_learning_log_v1/, /knowledge_universe/, /trivia_universe/];
  for (const file of files) {
    const code = read(file);
    for (const pattern of forbidden) assert.equal(pattern.test(code), false, `${file} contains ${pattern}`);
  }
}

// I. Matrix keeps Sync Hub planned and not ready.
{
  const matrix = read('docs/AHA_MODULE_MATURITY_MATRIX.md');
  const row = matrix.split('\n').find((line) => line.startsWith('| sync-hub |'));
  assert.match(row, /\| planned \|/);
  assert.doesNotMatch(row, /\| ready \|/);
  assert.match(row, /Planned\/no-op boundary dokumentert/);
  assert.match(row, /backend-\/samtykke-\/EchoNet-kontrakt/);
}

console.log('aha-sync-hub-noop tests passed');
