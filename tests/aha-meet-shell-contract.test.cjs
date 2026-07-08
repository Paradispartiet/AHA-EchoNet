const assert = require('assert');
const fs = require('fs');
const path = require('path');

const read = (file) => fs.readFileSync(file, 'utf8');
const exists = (file) => fs.existsSync(file);
const meetHtml = read('meet.html');
const contractPath = 'docs/AHA_MEET_SHELL_CONTRACT.md';
const contract = read(contractPath);
const matrix = read('docs/AHA_MODULE_MATURITY_MATRIX.md');

assert.ok(exists('meet.html'), 'meet.html should exist');
assert.ok(/shell/i.test(meetHtml), 'meet.html should identify Meet as a shell');
assert.ok(/local-only|lokalt/i.test(meetHtml), 'meet.html should state local-only/local shell status');
assert.ok(/ingen invitasjoner|sender ikke invitasjoner/i.test(meetHtml), 'meet.html should explicitly say no invitations');
assert.ok(/ingen kalender|kalender.*ikke aktivert|ingen kalenderintegrasjon/i.test(meetHtml), 'meet.html should explicitly say no calendar integration');
assert.ok(/ingen EchoNet|EchoNet.*ikke aktivert/i.test(meetHtml), 'meet.html should explicitly say no EchoNet activation');
assert.ok(/ingen History Go write-back|skal ikke skrive tilbake til History Go/i.test(meetHtml), 'meet.html should explicitly say no History Go write-back');
assert.ok(/ingen backend|backend.*ikke aktivert/i.test(meetHtml), 'meet.html should explicitly say no backend');

assert.ok(exists(contractPath), 'AHA Meet shell contract document should exist');
for (const required of [
  /AHA Meet/,
  /History Go/,
  /personal reflection/i,
  /no write-back|must not write back/i,
  /no EchoNet|EchoNet/i,
  /no Sync Hub|Sync Hub/i,
  /no backend|backend/i,
  /no calendar|calendar/i,
  /no invitation|invitation/i
]) {
  assert.ok(required.test(contract), `contract should mention ${required}`);
}

assert.equal(exists('js/ahaMeet.js'), false, 'Meet must not introduce a dedicated runtime file yet');

const forbiddenRuntimeKeys = [
  'aha_' + 'meet_v1',
  'aha_' + 'meet_events_v1',
  'aha_' + 'meet_invites_v1',
  'aha_' + 'meet_calendar_v1'
];
for (const key of forbiddenRuntimeKeys) {
  assert.equal(meetHtml.includes(key), false, `meet.html must not introduce ${key}`);
}

for (const forbidden of [
  'fetch(',
  'AHARepository',
  'AHASyncHub',
  'SyncHub',
  'sendInvite'
]) {
  assert.equal(meetHtml.includes(forbidden), false, `meet.html must not contain runtime/API token ${forbidden}`);
}
assert.equal(/calendar[A-Z_.(]/.test(meetHtml), false, 'meet.html may only mention calendar/kalender as negative copy, not as an API token');

for (const key of [
  'visited_places',
  'hg_learning_log_v1',
  'knowledge_universe',
  'trivia_universe',
  'aha_import_payload_v1'
]) {
  assert.ok(contract.includes(key), `contract should list protected History Go key ${key}`);
}

const meetRow = matrix.split('\n').find((line) => line.startsWith('| meet |')) || '';
assert.ok(meetRow.includes('| shell |'), 'maturity matrix should keep Meet as shell');
assert.ok(/uten runtime, lagring, invitasjoner, kalender, backend, sync, EchoNet eller History Go write-back/.test(meetRow), 'maturity matrix should document the Meet shell boundary');

console.log('aha-meet-shell-contract.test.cjs passed');
