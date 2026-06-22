const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const dashboardCode = fs.readFileSync('js/ahaDashboard.js', 'utf8');

function createDashboard({ router, sources, channels } = {}) {
  const writes = [];
  const context = {
    console: { warn() {}, log() {} },
    localStorage: {
      getItem() { return null; },
      setItem(key, value) { writes.push([key, value]); },
      removeItem(key) { writes.push([key, null]); }
    },
    document: {
      readyState: 'loading',
      addEventListener() {},
      getElementById() { return null; },
      documentElement: { dataset: {} }
    },
    CustomEvent: function CustomEvent() {},
    URLSearchParams,
    window: {
      location: { search: '', hash: '', replace() {} },
      addEventListener() {},
      AHA_SYNC_CHANNELS: channels,
      AHASyncChannelRouter: router,
      AHASources: sources
    }
  };
  context.window.window = context.window;
  context.window.document = context.document;
  context.window.localStorage = context.localStorage;
  vm.runInNewContext(dashboardCode, context);
  return { dashboard: context.window.AHADashboard, writes };
}

const channels = [
  { id: 'conversation-insights', name: 'Samtaleinnsikter' },
  { id: 'open-questions', name: 'Åpne spørsmål' },
  { id: 'concept-links', name: 'Begrepskoblinger' }
];

{
  const { dashboard } = createDashboard({ sources: { loadSourceEvents() { return []; } }, channels });
  const html = dashboard.renderAhaSyncChannelPreview();
  assert.match(html, /Route preview ikke tilgjengelig ennå/);
}

{
  const { dashboard } = createDashboard({ router: { summarizeRoutes() { return {}; } }, channels });
  const html = dashboard.renderAhaSyncChannelPreview();
  assert.match(html, /Route preview ikke tilgjengelig ennå/);
}

{
  const sourceEvents = [{ text: 'Privat melding som ikke skal vises?', title: 'Hemmelig tittel' }];
  const { dashboard, writes } = createDashboard({
    channels,
    sources: { loadSourceEvents() { return sourceEvents; } },
    router: {
      summarizeRoutes(events) {
        assert.equal(events, sourceEvents, 'preview should pass existing events to the read-only router');
        return { total: 1, byChannel: { 'conversation-insights': 1, 'open-questions': 1, 'concept-links': 0 }, unrouted: 0 };
      }
    }
  });
  const html = dashboard.renderAhaSyncChannelPreview();
  assert.match(html, /Source events lest[\s\S]*1/);
  assert.match(html, /Ikke routet[\s\S]*0/);
  assert.match(html, /Samtaleinnsikter[\s\S]*1/);
  assert.match(html, /Åpne spørsmål[\s\S]*1/);
  assert.match(html, /Begrepskoblinger[\s\S]*0/);
  assert.doesNotMatch(html, /Privat melding/);
  assert.doesNotMatch(html, /Hemmelig tittel/);
  assert.deepEqual(writes, [], 'route preview must not write localStorage');
}

console.log('aha-sync-channel-route-preview.test.cjs passed');
