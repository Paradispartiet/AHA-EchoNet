const assert = require('node:assert/strict');
const fs = require('node:fs');

const builder = fs.readFileSync('js/ahaSyncCandidateBuilder.js', 'utf8');
const dashboard = fs.readFileSync('js/ahaDashboard.js', 'utf8');

assert.equal(fs.existsSync('js/ahaSyncConfirmationGate.js'), false, 'must not create a sync confirmation gate');
assert.match(builder, /approvalBoundary:\s*"personal_ai_loop_source_approval"/);
assert.match(builder, /approvalState:\s*"suggested"/);
assert.match(dashboard, /buildPersonalAiLoopSourceApprovalSummary/);
assert.match(dashboard, /Personal AI Loop source approval/);

for (const forbidden of [/approved:\s*true/, /approvalState:\s*"approved"/, /autoApprove/, /autoApproval/]) {
  assert.equal(forbidden.test(builder), false, `must not auto approve: ${forbidden}`);
}

console.log('aha-sync-candidates-approval-boundary.test.cjs passed');
