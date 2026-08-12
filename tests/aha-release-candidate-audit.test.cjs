const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');

const ROOT = path.join(__dirname, '..');
const QUALITY_FIXTURE = path.join(ROOT, 'tests/fixtures/aha-release-candidate-quality-cases.json');
const RC_VERSION = 'aha_release_candidate_audit_v1';

class StorageMock {
  constructor(seed = {}) {
    this.map = new Map(Object.entries(seed).map(([key, value]) => [String(key), String(value)]));
  }
  get length() { return this.map.size; }
  key(index) { return [...this.map.keys()][index] ?? null; }
  getItem(key) { return this.map.has(String(key)) ? this.map.get(String(key)) : null; }
  setItem(key, value) { this.map.set(String(key), String(value)); }
  removeItem(key) { this.map.delete(String(key)); }
  clear() { this.map.clear(); }
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function makeContext(seed = {}) {
  const storage = new StorageMock(seed);
  const document = {
    readyState: 'loading',
    body: null,
    head: null,
    addEventListener() {},
    removeEventListener() {},
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    createElement() { return { style: {}, dataset: {}, addEventListener() {}, appendChild() {}, setAttribute() {} }; }
  };
  const context = {
    console,
    Date,
    Math,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Set,
    Map,
    Promise,
    Blob,
    document,
    localStorage: storage,
    location: { pathname: '/index.html' },
    addEventListener() {},
    dispatchEvent() {},
    setTimeout() {},
    clearTimeout() {},
    setInterval() { return 1; },
    clearInterval() {},
    CustomEvent: function CustomEvent(type, init) { this.type = type; this.detail = init?.detail; }
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  return { context, storage };
}

function load(context, relativePath) {
  vm.runInContext(read(relativePath), context, { filename: relativePath });
}

function runCriticalTest(relativePath) {
  const started = performance.now();
  const result = spawnSync(process.execPath, [path.join(ROOT, relativePath)], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, AHA_RC_CHILD: '1' },
    maxBuffer: 8 * 1024 * 1024
  });
  const durationMs = Number((performance.now() - started).toFixed(1));
  assert.equal(
    result.status,
    0,
    `${relativePath} failed inside ${RC_VERSION}\n${result.stdout || ''}\n${result.stderr || ''}`
  );
  return durationMs;
}

function auditInsightQuality() {
  const fixture = JSON.parse(fs.readFileSync(QUALITY_FIXTURE, 'utf8'));
  assert.equal(fixture.version, 'aha_release_candidate_quality_cases_v1');
  assert.ok(Array.isArray(fixture.weakCases) && fixture.weakCases.length >= 8, 'RC quality corpus must keep at least eight reviewed weak/useful cases');
  assert.ok(Array.isArray(fixture.duplicateCases) && fixture.duplicateCases.length >= 3, 'RC quality corpus must keep reviewed duplicate/non-duplicate cases');

  const { context } = makeContext();
  load(context, 'js/ahaInsightQualityFeedback.js');
  const api = context.AHAInsightQualityFeedback;
  assert.ok(api, 'Insight quality feedback API must load');

  for (const item of fixture.weakCases) {
    assert.equal(
      api.weakHeuristic(item.insight),
      item.expectedWeak,
      `quality fixture ${item.id} changed classification`
    );
  }
  for (const item of fixture.duplicateCases) {
    const duplicate = api.similarity(item.a, item.b) >= 0.82;
    assert.equal(duplicate, item.expectedDuplicate, `duplicate fixture ${item.id} changed classification`);
  }

  const chamber = { insights: fixture.weakCases.map((item) => JSON.parse(JSON.stringify(item.insight))) };
  const audit = api.buildQualityAudit(chamber);
  assert.equal(audit.advisoryOnly, true, 'quality audit must remain advisory-only');
  assert.equal(audit.weakCandidates, fixture.weakCases.filter((item) => item.expectedWeak).length);
  assert.ok(audit.reviewCount >= audit.weakCandidates);

  let result = api.applyFeedback('q_banal', 'not_insight', { chamber, save: false, now: '2026-08-12T04:00:00.000Z' });
  assert.equal(result.ok, true);
  assert.equal(api.activeInsight(result.insight), false, 'user rejection must deactivate the canonical insight');
  result = api.applyFeedback('q_banal', 'undo', { chamber, save: false, now: '2026-08-12T04:01:00.000Z' });
  assert.equal(result.ok, true);
  assert.equal(api.activeInsight(result.insight), true, 'undo must restore the insight to active state');
  result = api.applyFeedback('q_supported_pattern', 'important', { chamber, save: false, now: '2026-08-12T04:02:00.000Z' });
  assert.equal(result.ok, true);
  assert.equal(result.insight.user_priority, 'important');

  return {
    reviewedWeakCases: fixture.weakCases.length,
    reviewedDuplicateCases: fixture.duplicateCases.length,
    weakCandidates: audit.weakCandidates,
    advisoryOnly: audit.advisoryOnly
  };
}

function auditCriticalUserJourney() {
  const criticalTests = [
    'tests/aha-longitudinal-user-robustness.test.cjs',
    'tests/aha-chat-insight-end-to-end-audit.test.cjs',
    'tests/aha-product-user-journey-end-to-end.test.cjs',
    'tests/aha-personal-ai-memory-control-end-to-end.test.cjs',
    'tests/aha-search-library-end-to-end-audit.test.cjs',
    'tests/aha-privacy-restore.test.cjs'
  ];
  const durations = {};
  criticalTests.forEach((testPath) => {
    assert.equal(fs.existsSync(path.join(ROOT, testPath)), true, `missing critical RC dependency: ${testPath}`);
    durations[path.basename(testPath)] = runCriticalTest(testPath);
  });
  return { criticalTests: criticalTests.length, durationsMs: durations };
}

function auditDataRobustness() {
  const { context, storage } = makeContext({
    aha_insight_chamber_v1: '{"insights":"not-an-array"}',
    aha_notes_v1: '{broken-json',
    aha_lists_v1: JSON.stringify([null, { id: 'list_ok', title: 'Bevart liste', items: [] }]),
    aha_paths_v1: 'not-json',
    unrelated_local_key: 'must-survive'
  });
  load(context, 'js/ahaSearch.js');
  load(context, 'js/ahaMindmap.js');
  load(context, 'js/ahaPrivacyRestore.js');

  const searchItems = context.AHASearch.collectSearchItems();
  assert.ok(Array.isArray(searchItems), 'Search must survive malformed local data');
  assert.equal(searchItems.some((item) => item.refId === 'list_ok'), true, 'valid records must survive beside malformed stores');
  assert.equal(searchItems.some((item) => item.type === 'note'), false, 'malformed notes store must fail closed');

  const graph = context.AHAMindmap.collectGraphData();
  assert.ok(Array.isArray(graph.nodes) && Array.isArray(graph.edges), 'Mindmap must survive malformed local data');
  assert.equal(graph.nodes.some((node) => node.type === 'list' && node.refId === 'list_ok'), true);

  assert.throws(() => context.AHAPrivacyRestore.previewRestore('{broken'), /ugyldig JSON/i);
  const legacyBackup = {
    version: 'legacy-local-v0',
    storage: {
      aha_notes_v1: [{ id: 'restored_note', title: 'Gjenopprettet', text: 'Bevart innhold' }],
      hg_unlocks_v1: { place: true },
      aha_access_token_v1: 'never-restore-this',
      aha_unknown_future_v9: { value: 1 }
    }
  };
  const preview = context.AHAPrivacyRestore.previewRestore(legacyBackup);
  assert.deepEqual(Array.from(preview.restorableKeys), ['aha_notes_v1']);
  assert.ok(preview.skipped.historyGo >= 1, 'History Go data must remain outside AHA restore');
  assert.ok(preview.skipped.secrets >= 1, 'secret-like data must be rejected');
  assert.ok(preview.skipped.unknown >= 1, 'unknown future keys must fail closed');
  const applied = context.AHAPrivacyRestore.applyRestore(legacyBackup);
  assert.equal(applied.appliedCount, 1);
  assert.equal(storage.getItem('unrelated_local_key'), 'must-survive', 'additive restore must preserve unrelated local data');
  assert.equal(JSON.parse(storage.getItem('aha_notes_v1'))[0].id, 'restored_note');
  assert.equal(storage.getItem('hg_unlocks_v1'), null);
  assert.equal(storage.getItem('aha_access_token_v1'), null);

  return {
    malformedSearchSurvived: true,
    malformedMindmapSurvived: true,
    legacyRestoreApplied: applied.appliedCount,
    historyGoSkipped: preview.skipped.historyGo,
    secretsSkipped: preview.skipped.secrets,
    unknownSkipped: preview.skipped.unknown
  };
}

function auditResponsiveContract() {
  const pages = [
    'index.html',
    'chat.html',
    'search.html',
    'personal-ai.html',
    'profile.html',
    'lists.html',
    'paths.html',
    'mindmap.html',
    'privacy.html'
  ];
  pages.forEach((page) => {
    const html = read(page);
    assert.match(html, /<meta[^>]+name=["']viewport["'][^>]+width=device-width/i, `${page} must declare a device-width viewport`);
    assert.match(html, /aha-global-nav/i, `${page} must keep the canonical product navigation mount or asset`);
  });

  const navCss = read('css/aha-global-nav.css');
  assert.match(navCss, /@media\s*\(max-width:\s*760px\)/, 'tablet/mobile navigation breakpoint missing');
  assert.match(navCss, /@media\s*\(max-width:\s*520px\)/, 'small-mobile navigation breakpoint missing');
  assert.match(navCss, /100dvh/, 'Safari/mobile overlay must use dynamic viewport height');
  assert.match(navCss, /safe-area-inset-bottom/, 'Safari/mobile overlay must respect the bottom safe area');
  assert.match(navCss, /@media\s*\(pointer:\s*coarse\)/, 'coarse-pointer touch target gate missing');
  assert.match(navCss, /min-height:\s*44px/, 'touch controls must expose a 44px minimum target on coarse pointers');
  assert.match(navCss, /-webkit-overflow-scrolling:\s*touch/, 'iOS momentum scrolling contract missing for the nav panel');

  const chatCss = read('css/aha-chat.css');
  assert.match(chatCss, /@media\s*\(max-width:/, 'Chat must keep an explicit responsive breakpoint');

  return {
    deviceWidthPages: pages.length,
    tabletBreakpoint: 760,
    smallMobileBreakpoint: 520,
    coarsePointerMinimumPx: 44,
    safariDynamicViewport: true,
    manualDeviceGate: 'required: real iPad/iPhone Safari and split-view verification cannot be certified by Node CI'
  };
}

function buildLargeSeed() {
  const notes = Array.from({ length: 2000 }, (_, index) => ({
    id: `perf_note_${index}`,
    title: `Notat ${index}`,
    text: `Lokalt AHA-notat om makt, sted og institusjoner nummer ${index}.`,
    tags: ['makt', `gruppe_${index % 20}`],
    local_only: true
  }));
  const insights = Array.from({ length: 800 }, (_, index) => ({
    id: `perf_insight_${index}`,
    title: `Innsikt ${index}`,
    summary: `Mønster ${index} knytter sted og institusjonell praksis sammen.`,
    status: 'suggested',
    tags: ['sted', `tema_${index % 25}`],
    local_only: true,
    strength: { evidence_count: 2, total_score: 30 },
    depth_score: 2,
    concepts: [{ key: 'sted', label: 'Sted' }]
  }));
  const lists = Array.from({ length: 250 }, (_, index) => ({
    id: `perf_list_${index}`,
    title: `Liste ${index}`,
    items: [0, 1, 2].map((offset) => ({
      id: `list_item_${index}_${offset}`,
      source: 'aha_notes',
      refId: `perf_note_${(index * 3 + offset) % notes.length}`,
      type: 'note',
      title: `Notat ${(index * 3 + offset) % notes.length}`
    })),
    local_only: true
  }));
  const paths = Array.from({ length: 250 }, (_, index) => ({
    id: `perf_path_${index}`,
    title: `Sti ${index}`,
    steps: [{
      id: `path_step_${index}`,
      source: 'aha_lists',
      refId: `perf_list_${index}`,
      type: 'list',
      title: `Liste ${index}`
    }],
    local_only: true
  }));
  return {
    expectedItems: notes.length + insights.length + lists.length + paths.length,
    seed: {
      aha_notes_v1: JSON.stringify(notes),
      aha_insight_chamber_v1: JSON.stringify({ version: 'v1', insights }),
      aha_lists_v1: JSON.stringify(lists),
      aha_paths_v1: JSON.stringify(paths)
    }
  };
}

function auditLocalPerformance() {
  const large = buildLargeSeed();
  const { context } = makeContext(large.seed);
  load(context, 'js/ahaSearch.js');
  load(context, 'js/ahaMindmap.js');

  const searchStart = performance.now();
  const items = context.AHASearch.collectSearchItems();
  const searchMs = Number((performance.now() - searchStart).toFixed(1));
  assert.equal(items.length, large.expectedItems, 'large local Search corpus must be fully collected');

  const graphStart = performance.now();
  const graph = context.AHAMindmap.collectGraphData();
  const graphMs = Number((performance.now() - graphStart).toFixed(1));
  assert.ok(graph.nodes.length >= large.expectedItems, 'large Mindmap corpus must materialize the expected nodes');
  assert.ok(graph.edges.length >= 1000, 'large Mindmap corpus must materialize list/path relations');

  const SEARCH_BUDGET_MS = 1500;
  const GRAPH_BUDGET_MS = 1500;
  assert.ok(searchMs < SEARCH_BUDGET_MS, `Search RC budget exceeded: ${searchMs}ms >= ${SEARCH_BUDGET_MS}ms`);
  assert.ok(graphMs < GRAPH_BUDGET_MS, `Mindmap RC budget exceeded: ${graphMs}ms >= ${GRAPH_BUDGET_MS}ms`);

  return {
    localObjects: large.expectedItems,
    searchMs,
    searchBudgetMs: SEARCH_BUDGET_MS,
    graphMs,
    graphBudgetMs: GRAPH_BUDGET_MS,
    graphNodes: graph.nodes.length,
    graphEdges: graph.edges.length
  };
}

const gates = {
  insightQuality: auditInsightQuality(),
  criticalUserJourney: auditCriticalUserJourney(),
  dataRobustness: auditDataRobustness(),
  responsiveContract: auditResponsiveContract(),
  localPerformance: auditLocalPerformance()
};

const summary = {
  version: RC_VERSION,
  status: 'pass',
  automatedGateCount: Object.keys(gates).length,
  gates,
  releaseBoundary: {
    localFirst: true,
    backendActivationRequired: false,
    syncActivationRequired: false,
    echoNetActivationRequired: false,
    historyGoWritebackRequired: false,
    manualSafariDeviceVerificationRequired: true
  }
};

console.log(`AHA Release Candidate Audit: PASS\n${JSON.stringify(summary, null, 2)}`);
