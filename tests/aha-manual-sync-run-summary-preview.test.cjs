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
  assert.ok(builder.includes('ready_preview_only'), 'summary builder includes ready_preview_only');
  assert.ok(builder.includes('canExecute: false'), 'summary builder hard-disables execution');
  assert.ok(builder.includes('canWrite: false'), 'summary builder hard-disables writes');
  assert.ok(builder.includes('adapterStatus'), 'summary builder includes adapter status');
  assert.ok(builder.includes('stateMachineState'), 'summary builder includes state machine state');
  assert.ok(builder.includes('nextRequiredSteps'), 'summary builder includes next required steps');
  assert.ok(renderer.includes('Manual sync remains disabled'), 'expanded panel states Manual sync remains disabled');
  assert.ok(renderer.includes('Confirm sync remains disabled'), 'expanded panel states Confirm sync remains disabled');
  assert.ok(modalRenderer.includes('Confirm sync remains disabled'), 'modal summary keeps confirmation disabled');
})();
