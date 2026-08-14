const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const storage = new Map([
  ['aha_source_events_v1', '{broken json'],
  ['aha_notes_v1', JSON.stringify([{ id: 'note_active' }, { id: 'note_deleted', deleted_at: '2026-08-14' }])],
  ['aha_gallery_v1', JSON.stringify({ items: [] })],
  ['aha_feed_posts_v1', '[]'],
  ['aha_insta_posts_v1', '[]'],
  ['aha_imports_v1', '[]']
]);
const context = {
  window: null,
  console,
  JSON,
  URLSearchParams,
  Date,
  Intl,
  localStorage: {
    getItem(key) { return storage.get(key) || null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); }
  },
  location: { search: '', replace() {} },
  document: {
    readyState: 'loading',
    addEventListener() {},
    getElementById() { return null; },
    documentElement: { dataset: {} }
  },
  addEventListener() {}
};
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/ahaDashboard.js', 'utf8'), context, { filename: 'js/ahaDashboard.js' });

const stats = context.AHADashboard.localStats();
assert.deepEqual(JSON.parse(JSON.stringify(stats)), {
  source_events: 0,
  notes: 1,
  gallery: 0,
  feed: 0,
  insta: 0,
  imports: 0
});
console.log('aha-dashboard-local-stats-resilience.test.cjs passed');
