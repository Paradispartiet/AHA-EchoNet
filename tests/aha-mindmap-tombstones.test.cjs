const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function forbiddenApi(name, calls) {
  return new Proxy({}, {
    get(_target, prop) {
      calls.push(`${name}.${String(prop)}`);
      throw new Error(`${name} must not be used by AHAMindmap`);
    }
  });
}

const storageSeed = new Map(Object.entries({
  aha_source_events_v1: JSON.stringify([
    { id: 'source-live', source_type: 'Live source' },
    { id: 'reanalysis-live', source_type: 'note_reanalysis', source_app: 'aha_notes', meta: { note_id: 'note-live', reanalyze: true } },
    { id: 'reanalysis-deleted-note-at', source_type: 'note_reanalysis', source_app: 'aha_notes', meta: { note_id: 'note-deleted-at', reanalyze: true } },
    { id: 'reanalysis-deleted-note_snake', source_type: 'note_reanalysis', source_app: 'aha_notes', meta: { note_id: 'note-deleted_snake', reanalyze: true } },
    { id: 'reanalysis-deleted-source-at', source_type: 'note_reanalysis', source_app: 'aha_notes', meta: { note_id: 'note-live', reanalyze: true }, deletedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'reanalysis-deleted-source_snake', source_type: 'note_reanalysis', source_app: 'aha_notes', meta: { note_id: 'note-live', reanalyze: true }, deleted_at: '2026-01-02T00:00:00.000Z' },
    { id: 'source-deleted-at', source_type: 'Deleted source', deletedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'source-deleted_snake', source_type: 'Deleted source snake', deleted_at: '2026-01-02T00:00:00.000Z' }
  ]),
  aha_insight_chamber_v1: JSON.stringify({ insights: [
    { id: 'insight-live', title: 'Live insight', source_event_id: 'source-live' },
    { id: 'insight-deleted-at', title: 'Deleted insight', source_event_id: 'source-live', deletedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'insight-deleted_snake', title: 'Deleted insight snake', source_event_id: 'source-live', deleted_at: '2026-01-02T00:00:00.000Z' }
  ] }),
  aha_lists_v1: JSON.stringify([
    { id: 'list-live', title: 'Live list', items: [
      { source: 'aha_source_events', refId: 'source-live', type: 'source_event', id: 'item-live' },
      { source: 'aha_source_events', refId: 'source-deleted-at', type: 'source_event', id: 'item-deleted-source' }
    ] },
    { id: 'list-deleted-at', title: 'Deleted list', deletedAt: '2026-01-01T00:00:00.000Z', items: [
      { source: 'aha_source_events', refId: 'source-live', type: 'source_event', id: 'item-from-deleted-list' }
    ] },
    { id: 'list-deleted_snake', title: 'Deleted list snake', deleted_at: '2026-01-02T00:00:00.000Z' }
  ]),
  aha_paths_v1: JSON.stringify([
    { id: 'path-live', title: 'Live path', steps: [{ source: 'aha_source_events', refId: 'source-live', type: 'source_event', id: 'step-live' }] },
    { id: 'path-deleted-at', title: 'Deleted path', deletedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'path-deleted_snake', title: 'Deleted path snake', deleted_at: '2026-01-02T00:00:00.000Z' }
  ]),
  aha_articles_v1: JSON.stringify([
    { id: 'article-live', title: 'Live article', references: [{ source: 'aha_source_events', refId: 'source-live', type: 'source_event', id: 'ref-live' }] },
    { id: 'article-deleted-at', title: 'Deleted article', deletedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'article-deleted_snake', title: 'Deleted article snake', deleted_at: '2026-01-02T00:00:00.000Z' }
  ]),
  aha_notes_v1: JSON.stringify([
    { id: 'note-live', title: 'Live note', last_reanalyzed_at: '2026-05-31T10:20:30.000Z' },
    { id: 'note-deleted-at', title: 'Deleted note', deletedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'note-deleted_snake', title: 'Deleted note snake', deleted_at: '2026-01-02T00:00:00.000Z' }
  ]),
  aha_feed_posts_v1: JSON.stringify([
    { id: 'feed-live', text: 'Live feed' },
    { id: 'feed-deleted-at', text: 'Deleted feed', deletedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'feed-deleted_snake', text: 'Deleted feed snake', deleted_at: '2026-01-02T00:00:00.000Z' }
  ]),
  aha_gallery_v1: JSON.stringify([
    { id: 'gallery-live', title: 'Live gallery' },
    { id: 'gallery-deleted-at', title: 'Deleted gallery', deletedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'gallery-deleted_snake', title: 'Deleted gallery snake', deleted_at: '2026-01-02T00:00:00.000Z' }
  ]),
  aha_insta_posts_v1: JSON.stringify([
    { id: 'insta-live', caption: 'Live insta' },
    { id: 'insta-deleted-at', caption: 'Deleted insta', deletedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'insta-deleted_snake', caption: 'Deleted insta snake', deleted_at: '2026-01-02T00:00:00.000Z' }
  ]),
  aha_groups_v1: JSON.stringify([
    { id: 'group-live', title: 'Live group', references: [{ source: 'aha_source_events', refId: 'source-live', type: 'source_event', id: 'group-ref-live' }] },
    { id: 'group-deleted-at', title: 'Deleted group', deletedAt: '2026-01-01T00:00:00.000Z', references: [{ source: 'aha_source_events', refId: 'source-live', type: 'source_event', id: 'group-ref-deleted' }] },
    { id: 'group-deleted_snake', title: 'Deleted group snake', deleted_at: '2026-01-02T00:00:00.000Z' }
  ])
}));

const forbiddenCalls = [];
const writes = [];
const context = {
  console,
  window: null,
  document: {
    readyState: 'loading',
    addEventListener() {},
    getElementById() { return null; },
    querySelectorAll() { return []; }
  },
  localStorage: {
    getItem(key) { return storageSeed.has(key) ? storageSeed.get(key) : null; },
    setItem(key, value) { writes.push(['setItem', key, value]); throw new Error('AHAMindmap must not write to localStorage'); },
    removeItem(key) { writes.push(['removeItem', key]); throw new Error('AHAMindmap must not write to localStorage'); },
    clear() { writes.push(['clear']); throw new Error('AHAMindmap must not write to localStorage'); }
  },
  AHAIngest: forbiddenApi('AHAIngest', forbiddenCalls),
  AHASources: forbiddenApi('AHASources', forbiddenCalls),
  AHARepository: forbiddenApi('AHARepository', forbiddenCalls)
};
context.window = context;
vm.createContext(context);

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'ahaMindmap.js'), 'utf8');
vm.runInContext(source, context, { filename: 'js/ahaMindmap.js' });

const graph = context.AHAMindmap.collectGraphData();
const ids = new Set(graph.nodes.map((node) => node.id));
const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));

for (const expected of [
  'source_event::aha_source_events::source-live',
  'source_event::aha_source_events::reanalysis-live',
  'source_event::aha_source_events::reanalysis-deleted-note-at',
  'source_event::aha_source_events::reanalysis-deleted-note_snake',
  'insight::aha_insights::insight-live',
  'list::aha_lists::list-live',
  'path::aha_paths::path-live',
  'article::aha_avisa::article-live',
  'note::aha_notes::note-live',
  'feed_post::aha_feed::feed-live',
  'gallery_item::aha_gallery::gallery-live',
  'insta_post::aha_insta::insta-live',
  'group::aha_groups::group-live'
]) {
  assert.ok(ids.has(expected), `${expected} should remain visible`);
}

for (const deletedId of [
  'source_event::aha_source_events::reanalysis-deleted-source-at',
  'source_event::aha_source_events::reanalysis-deleted-source_snake',
  'source_event::aha_source_events::source-deleted-at',
  'source_event::aha_source_events::source-deleted_snake',
  'insight::aha_insights::insight-deleted-at',
  'insight::aha_insights::insight-deleted_snake',
  'list::aha_lists::list-deleted-at',
  'list::aha_lists::list-deleted_snake',
  'path::aha_paths::path-deleted-at',
  'path::aha_paths::path-deleted_snake',
  'article::aha_avisa::article-deleted-at',
  'article::aha_avisa::article-deleted_snake',
  'note::aha_notes::note-deleted-at',
  'note::aha_notes::note-deleted_snake',
  'feed_post::aha_feed::feed-deleted-at',
  'feed_post::aha_feed::feed-deleted_snake',
  'gallery_item::aha_gallery::gallery-deleted-at',
  'gallery_item::aha_gallery::gallery-deleted_snake',
  'insta_post::aha_insta::insta-deleted-at',
  'insta_post::aha_insta::insta-deleted_snake',
  'group::aha_groups::group-deleted-at',
  'group::aha_groups::group-deleted_snake'
]) {
  assert.equal(ids.has(deletedId), false, `${deletedId} should be filtered`);
}


const noteNode = nodesById.get('note::aha_notes::note-live');
assert.equal(noteNode?.meta?.lastReanalyzedAt, '2026-05-31T10:20:30.000Z', 'note node should expose last_reanalyzed_at in meta');

const reanalysisEdges = graph.edges.filter((edge) => edge.type === 'note_reanalysis');
assert.equal(reanalysisEdges.length, 1, 'only visible note reanalysis records should create edges');
assert.equal(reanalysisEdges[0].from, 'source_event::aha_source_events::reanalysis-live', 'note_reanalysis source event should start at the source event node');
assert.equal(reanalysisEdges[0].to, 'note::aha_notes::note-live', 'note_reanalysis source event should point to its note node');
assert.equal(reanalysisEdges[0].type, 'note_reanalysis', 'note_reanalysis edge should use the expected type');
assert.equal(reanalysisEdges[0].label, 'analysert på nytt', 'note_reanalysis edge should use the Norwegian label');
assert.equal(reanalysisEdges[0].meta?.noteId, 'note-live', 'note_reanalysis edge meta should expose the note id');
assert.equal(reanalysisEdges[0].meta?.reanalyze, true, 'note_reanalysis edge meta should mark reanalysis');
assert.equal(
  reanalysisEdges.some((edge) => edge.from === 'source_event::aha_source_events::reanalysis-deleted-note-at'),
  false,
  'note_reanalysis edge should not be created for deletedAt note targets'
);
assert.equal(
  reanalysisEdges.some((edge) => edge.from === 'source_event::aha_source_events::reanalysis-deleted-note_snake'),
  false,
  'note_reanalysis edge should not be created for deleted_at note targets'
);
assert.equal(
  reanalysisEdges.some((edge) => edge.from === 'source_event::aha_source_events::reanalysis-deleted-source-at'),
  false,
  'deletedAt note_reanalysis source event should not create an edge'
);
assert.equal(
  reanalysisEdges.some((edge) => edge.from === 'source_event::aha_source_events::reanalysis-deleted-source_snake'),
  false,
  'deleted_at note_reanalysis source event should not create an edge'
);

for (const edge of graph.edges) {
  assert.ok(ids.has(edge.from), `edge ${edge.id} should start from a visible node`);
  assert.ok(ids.has(edge.to), `edge ${edge.id} should point to a visible node`);
  assert.notEqual(edge.from, 'list::aha_lists::list-deleted-at', 'deleted list should not create edges');
  assert.notEqual(edge.from, 'group::aha_groups::group-deleted-at', 'deleted group should not create edges');
  assert.notEqual(edge.to, 'source_event::aha_source_events::source-deleted-at', 'deleted source should not receive edges');
}

assert.equal(forbiddenCalls.length, 0, 'AHAMindmap should not call AHAIngest, AHASources or AHARepository');
assert.deepEqual(writes, [], 'AHAMindmap should not write to localStorage');

console.log('aha-mindmap-tombstones.test.cjs passed');
