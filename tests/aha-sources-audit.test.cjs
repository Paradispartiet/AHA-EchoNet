const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const auditCode = fs.readFileSync('js/ahaSourcesAudit.js', 'utf8');
const sourcesHtml = fs.readFileSync('sources.html', 'utf8');

function buildContext() {
  const store = new Map();
  const writes = [];
  const forbiddenCalls = [];
  const forbiddenApi = (name) => new Proxy({}, {
    get(_target, prop) {
      forbiddenCalls.push(`${name}.${String(prop)}`);
      throw new Error(`forbidden ${name}.${String(prop)}`);
    }
  });
  const context = {
    console,
    window: null,
    localStorage: {
      getItem: (key) => (store.has(key) ? store.get(key) : null),
      setItem: (key, value) => { writes.push([key, String(value)]); store.set(key, String(value)); },
      removeItem: (key) => { writes.push([key, null]); store.delete(key); }
    },
    document: { addEventListener() {}, getElementById() { return null; } },
    addEventListener() {},
    AHAIngest: forbiddenApi('AHAIngest'),
    AHARepository: forbiddenApi('AHARepository'),
    EchoNet: forbiddenApi('EchoNet'),
    fetch() { forbiddenCalls.push('fetch'); throw new Error('fetch forbidden'); },
    JSON, String, Number, Array, Object, Map, Set, Date, Math
  };
  context.window = context;
  context.__store = store;
  context.__writes = writes;
  context.__forbiddenCalls = forbiddenCalls;
  vm.createContext(context);
  vm.runInContext(auditCode, context, { filename: 'js/ahaSourcesAudit.js' });
  return context;
}

const ctx = buildContext();
ctx.__store.set('aha_source_events_v1', JSON.stringify([
  { id: 'src-chat-1', source_app: 'chat', source_type: 'chat_message', title: 'Chat title', text: 'Chat text', local_only: true, imported: false, created_at: '2026-01-01T00:00:00.000Z', tags: ['chat'], meta: { local_only: true } },
  { id: 'src-feed-1', source_app: 'feed', source_type: 'feed_post', title: 'Feed title', text: 'Feed text', imported: true, created_at: '2026-01-02T00:00:00.000Z' },
  { id: 'src-notes-empty', source_app: 'notes', source_type: 'note', title: 'Empty note', text: '', local_only: true, created_at: '2026-01-03T00:00:00.000Z' }
]));
ctx.__store.set('aha_insight_chamber_v1', JSON.stringify({ insights: [
  { id: 'insight-linked', source_event_id: 'src-chat-1', source_app: 'chat', source_type: 'chat_message', summary: 'Linked summary', created_at: '2026-01-04T00:00:00.000Z' },
  { id: 'insight-orphan', source_app: 'feed', summary: 'No source id', created_at: '2026-01-05T00:00:00.000Z' }
] }));

const report = ctx.AHASourcesAudit.collectAuditReport();
assert.equal(report.summary.totalSourceEvents, 3, 'collectAuditReport should count source events');
assert.equal(report.summary.perSourceApp.chat, 1, 'report should count per source_app');
assert.equal(report.summary.perSourceApp.feed, 1, 'report should count feed source_app');
assert.equal(report.summary.perSourceType.chat_message, 1, 'report should count per source_type');
assert.equal(report.summary.localOnlyCount, 2, 'report should count local_only');
assert.equal(report.summary.importedCount, 1, 'report should count imported');
assert.equal(report.summary.emptyTextCandidateCount, 1, 'empty text candidate should be detected');
assert.equal(report.events.find((event) => event.id === 'src-chat-1').has_insight, true, 'matching source_event_id should mark source event as linked');
assert.equal(report.events.find((event) => event.id === 'src-feed-1').has_insight, false, 'source event without matching insight should be unlinked');
assert.equal(report.insightsWithoutSourceEventId.length, 1, 'insight without source_event_id should be counted as orphan/unlinked');
assert.deepEqual(ctx.AHASourcesAudit.filterAuditReport(report, 'local-only').events.map((event) => event.id).sort(), ['src-chat-1', 'src-notes-empty'], 'local-only filter should work');
assert.deepEqual(ctx.AHASourcesAudit.filterAuditReport(report, 'imported').events.map((event) => event.id), ['src-feed-1'], 'imported filter should work');
assert.deepEqual(ctx.AHASourcesAudit.filterAuditReport(report, 'without-insight').events.map((event) => event.id).sort(), ['src-feed-1', 'src-notes-empty'], 'without insight filter should work');
assert.equal(ctx.__writes.length, 0, 'audit functions must not write to localStorage');
assert.deepEqual(ctx.__forbiddenCalls, [], 'audit must not call fetch, AHAIngest, AHARepository or EchoNet');

assert.equal(/\bfetch\s*\(/.test(auditCode), false, 'audit JS must not call fetch');
assert.equal(/AHAIngest\s*\./.test(auditCode), false, 'audit JS must not call AHAIngest');
assert.equal(/AHARepository\s*\./.test(auditCode), false, 'audit JS must not call AHARepository');
assert.equal(/EchoNet|syncFromDatabase|autoSync|createClient|supabase/i.test(auditCode), false, 'audit JS must not activate EchoNet/sync/backend');
assert.equal(sourcesHtml.includes('js/ahaIngest.js'), false, 'sources page must not load AHAIngest');
assert.equal(/AHARepository|Sync Hub|supabase|createClient|autoSync/i.test(sourcesHtml), false, 'sources page must not load backend/sync surfaces');
assert.ok(sourcesHtml.includes('<script src="js/ahaSources.js"></script>'), 'sources page should load AHASources first');
assert.ok(sourcesHtml.includes('<script src="js/ahaSourcesAudit.js"></script>'), 'sources page should load audit JS');

console.log('aha-sources-audit.test.cjs passed');
