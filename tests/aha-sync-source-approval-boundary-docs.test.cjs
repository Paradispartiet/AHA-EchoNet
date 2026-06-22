const assert = require('node:assert/strict');
const fs = require('node:fs');

const files = [
  'README.md',
  'docs/AHA_CONVERSATION_INSIGHT_SYNC_PLAN.md',
  'docs/AHA_SYNC_HUB_PLAN.md',
  'docs/AHA_IMPLEMENTATION_STATUS.md'
];

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  assert.match(text, /Personal AI Loop source approval/, `${file} must mention the reused source approval boundary`);
  assert.match(text, /ikke lages en separat sync confirmation gate|skal ikke ha en parallell confirmation gate/i, `${file} must forbid a separate sync confirmation gate`);
  assert.match(text, /AHASyncChannelRouter[\s\S]*AHASyncCandidateBuilder[\s\S]*existing Personal AI Loop source approval boundary[\s\S]*explicit user action required later/i, `${file} must document the correct flow`);
}

const plan = fs.readFileSync('docs/AHA_CONVERSATION_INSIGHT_SYNC_PLAN.md', 'utf8');
assert.match(plan, /## Approval boundary/);
for (const required of [
  'local-only',
  'explicit-action only',
  'compact/redacted only',
  'no raw private payload',
  'no write',
  'no sync',
  'no publish/share',
  'fail closed ved missing/unknown state',
  'docs/AHA_PERSONAL_AI_LOOP_SOURCE_APPROVAL_SURFACE.md'
]) {
  assert.ok(plan.includes(required), `conversation insight sync plan must include: ${required}`);
}

assert.equal(fs.existsSync('js/ahaSyncConfirmationGate.js'), false, 'must not create js/ahaSyncConfirmationGate.js');

console.log('aha-sync-source-approval-boundary-docs.test.cjs passed');
