const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const mindmapPath = path.join(__dirname, '..', 'js', 'ahaMindmap.js');
const source = fs.readFileSync(mindmapPath, 'utf8');

for (const forbidden of [
  'fetch(',
  'localStorage.setItem',
  'AHARepository',
  'AHAIngest',
  'AHAEmbeddings',
  'EchoNet',
  'Sync Hub',
  'AHASyncHub',
  'syncFromDatabase',
  'supabase',
  'createClient'
]) {
  assert.equal(source.includes(forbidden), false, `ahaMindmap.js must not contain ${forbidden}`);
}

const store = new Map(Object.entries({
  aha_source_events_v1: JSON.stringify([
    { id: 'source-1', source_type: 'chat', published_external: true },
    { id: 'source-deleted-at', source_type: 'deleted', deletedAt: '2026-01-01' },
    { id: 'source-deleted-snake', source_type: 'deleted', deleted_at: '2026-01-01' },
    { id: 'source-archived', source_type: 'archived', archived: true }
  ]),
  aha_insight_chamber_v1: JSON.stringify({ insights: [
    { id: 'insight-1', title: 'Insight one', source_event_id: 'source-1', echonet_shared: true },
    { id: 'insight-deleted-at', deletedAt: '2026-01-01' },
    { id: 'insight-deleted-snake', deleted_at: '2026-01-01' },
    { id: 'insight-archived', archived: true }
  ] }),
  aha_lists_v1: JSON.stringify([
    { id: 'list-1', title: 'List one', sync_enabled: true, items: [
      { id: 'item-1', source: 'aha_insights', refId: 'insight-1', type: 'insight' },
      { id: 'item-dup', source: 'aha_insights', refId: 'insight-1', type: 'insight' },
      { id: 'item-missing', source: 'aha_notes', refId: 'missing-note', type: 'note' }
    ] },
    { id: 'list-archived', archived: true, items: [{ source: 'aha_insights', refId: 'insight-1', type: 'insight' }] }
  ]),
  aha_paths_v1: JSON.stringify([
    { id: 'path-1', title: 'Path one', steps: [
      { id: 'step-1', source: 'aha_lists', refId: 'list-1', type: 'list' },
      { id: 'step-missing', source: 'aha_lists', refId: 'missing-list', type: 'list' }
    ] },
    { id: 'path-archived', archived: true }
  ]),
  aha_articles_v1: JSON.stringify([
    { id: 'article-1', title: 'Article one', references: [
      { id: 'ref-1', source: 'aha_paths', refId: 'path-1', type: 'path' },
      { id: 'ref-missing', source: 'aha_paths', refId: 'missing-path', type: 'path' }
    ] },
    { id: 'article-archived', archived: true }
  ]),
  aha_notes_v1: JSON.stringify([
    { id: 'note-1', title: 'Note one' },
    { id: 'note-deleted', deletedAt: '2026-01-01' }
  ]),
  aha_feed_posts_v1: JSON.stringify([
    { id: 'feed-1', text: 'Feed one' },
    { id: 'feed-archived', archived: true }
  ]),
  aha_gallery_v1: JSON.stringify([
    { id: 'gallery-1', title: 'Gallery one' },
    { id: 'gallery-archived', archived: true }
  ]),
  aha_insta_posts_v1: JSON.stringify([
    { id: 'insta-1', caption: 'Insta one' },
    { id: 'insta-archived', archived: true }
  ]),
  aha_groups_v1: JSON.stringify([
    { id: 'group-1', title: 'Group one', references: [
      { id: 'gref-1', source: 'aha_avisa', refId: 'article-1', type: 'article' },
      { id: 'gref-missing', source: 'aha_avisa', refId: 'missing-article', type: 'article' }
    ] },
    { id: 'group-archived', archived: true }
  ])
}));

const writes = [];
const context = {
  console,
  window: null,
  document: {
    readyState: 'loading',
    addEventListener() {},
    getElementById() { return null; },
    querySelectorAll() { return []; },
    createElement() { return { value: '', textContent: '', appendChild() {} }; }
  },
  localStorage: {
    getItem(key) { return store.get(key) || null; },
    setItem(key, value) { writes.push(['setItem', key, value]); throw new Error('no writes'); },
    removeItem(key) { writes.push(['removeItem', key]); throw new Error('no writes'); }
  }
};
context.window = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: 'js/ahaMindmap.js' });

const graph = context.AHAMindmap.collectGraphData();
const ids = new Set(graph.nodes.map((node) => node.id));

for (const expected of [
  'source_event::aha_source_events::source-1',
  'insight::aha_insights::insight-1',
  'list::aha_lists::list-1',
  'path::aha_paths::path-1',
  'article::aha_avisa::article-1',
  'note::aha_notes::note-1',
  'feed_post::aha_feed::feed-1',
  'gallery_item::aha_gallery::gallery-1',
  'insta_post::aha_insta::insta-1',
  'group::aha_groups::group-1'
]) assert.ok(ids.has(expected), `${expected} should be collected`);

for (const omitted of ['source-deleted-at', 'source-deleted-snake', 'source-archived', 'insight-deleted-at', 'insight-deleted-snake', 'insight-archived', 'list-archived']) {
  assert.equal([...ids].some((id) => id.endsWith(`::${omitted}`)), false, `${omitted} should be unavailable`);
}

assert.equal(context.AHAMindmap.isUnavailableRecord({ deletedAt: 'x' }), true);
assert.equal(context.AHAMindmap.isUnavailableRecord({ deleted_at: 'x' }), true);
assert.equal(context.AHAMindmap.isUnavailableRecord({ archived: true }), true);

assert.ok(graph.edges.some((edge) => edge.type === 'source_to_insight' && edge.from === 'source_event::aha_source_events::source-1' && edge.to === 'insight::aha_insights::insight-1'));
assert.ok(graph.edges.some((edge) => edge.type === 'list_contains' && edge.to === 'insight::aha_insights::insight-1'));
assert.ok(graph.edges.some((edge) => edge.type === 'path_contains' && edge.to === 'list::aha_lists::list-1'));
assert.ok(graph.edges.some((edge) => edge.type === 'article_references' && edge.to === 'path::aha_paths::path-1'));
assert.ok(graph.edges.some((edge) => edge.type === 'group_references' && edge.to === 'article::aha_avisa::article-1'));

for (const edge of graph.edges) {
  assert.ok(ids.has(edge.from), `${edge.id} source node should exist`);
  assert.ok(ids.has(edge.to), `${edge.id} target node should exist`);
  assert.equal(edge.meta.read_only, true);
  assert.equal(edge.meta.source, 'local_mindmap');
}
assert.equal(graph.edges.filter((edge) => edge.type === 'list_contains' && edge.to === 'insight::aha_insights::insight-1').length, 1, 'duplicate list_contains edges should be deduped');

for (const node of graph.nodes) {
  assert.equal(node.meta.read_only, true);
  assert.ok(node.meta.source_key, 'node meta should include source_key');
}

assert.equal(graph.summary.nodesBySource.aha_insights, 1);
assert.equal(graph.summary.nodesByType.insight, 1);
assert.equal(graph.summary.edgesByType.list_contains, 1);
assert.equal(graph.summary.localOnlyNodes, graph.nodes.length);
assert.equal(graph.summary.publishedExternalNodes, 1);
assert.equal(graph.summary.echonetSharedNodes, 1);
assert.equal(graph.summary.syncEnabledNodes, 1);
assert.ok(graph.summary.omittedUnavailableCount >= 10);

context.AHAMindmap.render();
context.AHAMindmap.refresh();
assert.deepEqual(writes, []);

console.log('aha-mindmap.test.cjs passed');
