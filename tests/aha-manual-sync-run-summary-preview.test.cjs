const assert = require('assert');
const fs = require('fs');

const dashboardCode = fs.readFileSync('js/ahaDashboard.js', 'utf8');
const blockedTerms = [
  'fetch',
  'supabase',
  'firebase',
  'localStorage.setItem',
  'AHARepository.save',
  'AHARepository.load',
  'syncFromDatabase'
];

function extractFunction(name) {
  const start = dashboardCode.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} should exist`);
  const open = dashboardCode.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < dashboardCode.length; index += 1) {
    const char = dashboardCode[index];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return dashboardCode.slice(start, index + 1);
  }
  throw new Error(`${name} function body was not closed`);
}

(function run() {
  const builder = extractFunction('buildAhaManualSyncRunSummaryPreview');
  const renderer = extractFunction('renderAhaManualSyncRunSummaryPreview');
  const modalRenderer = extractFunction('renderAhaManualSyncConfirmationRunSummary');
  const summaryCode = `${builder}\n${renderer}\n${modalRenderer}`;

  for (const term of blockedTerms) {
    assert.equal(summaryCode.includes(term), false, `run summary preview must not contain ${term}`);
  }

  assert.ok(builder.includes('summaryStatus'), 'summary builder includes summaryStatus');
  assert.ok(builder.includes('ready'), 'summary builder includes ready status');
  assert.ok(builder.includes('canExecute: blockers.length === 0'), 'summary builder gates execution');
  assert.ok(builder.includes('canWrite: blockers.length === 0'), 'summary builder gates writes');
  assert.ok(builder.includes('adapterStatus'), 'summary builder includes adapter status');
  assert.ok(builder.includes('stateMachineState'), 'summary builder includes state machine state');
  assert.ok(builder.includes('nextRequiredSteps'), 'summary builder includes next required steps');
  assert.ok(renderer.includes('Manual sync remains gated'), 'expanded panel states Manual sync remains gated');
  assert.ok(renderer.includes('Confirm sync is enabled only when'), 'expanded panel states Confirm sync is gated');
  assert.ok(modalRenderer.includes('No data is written unless Confirm sync is enabled and clicked'), 'modal summary keeps confirmation gated');

  console.log('aha-manual-sync-run-summary-preview.test.cjs passed');
})();
