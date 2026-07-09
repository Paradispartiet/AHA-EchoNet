const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const searchCode = fs.readFileSync('js/ahaSearch.js', 'utf8');
const privacyCode = fs.readFileSync('js/ahaPrivacy.js', 'utf8');
const searchHtml = fs.readFileSync('search.html', 'utf8');
const privacyHtml = fs.readFileSync('privacy.html', 'utf8');
const matrix = fs.readFileSync('docs/AHA_MODULE_MATURITY_MATRIX.md', 'utf8');

[
  'aha_music_library','aha_music_historygo_bridge','aha_training_corpus','aha_training_examples',
  'aha_data_intake','aha_knowledge_curation','aha_knowledge_map','aha_knowledge_graph_intelligence',
  'aha_personal_answer_evaluations','SECRET_KEY_PATTERNS','isSecretKey','redactSearchText'
].forEach((term) => assert.ok(searchCode.includes(term), `search should include ${term}`));
assert.equal(/Object\.keys\s*\(\s*localStorage\s*\)/.test(searchCode), false, 'search must not blindly enumerate localStorage');
assert.equal(/localStorage\.setItem|localStorage\.removeItem|historygo.*setItem/i.test(searchCode), false, 'search must not write storage');
['fetch(','AHARepository','Supabase','createClient','EchoNet','AHASyncHub','navigator.sendBeacon','XMLHttpRequest'].forEach((term) => {
  assert.equal(searchCode.includes(term), false, `search forbidden ${term}`);
  assert.equal(privacyCode.includes(term), false, `privacy forbidden ${term}`);
});

function storage(seed = {}) {
  const map = new Map(Object.entries(seed).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
  return {
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { throw new Error(`unexpected write ${k}`); },
    removeItem(k) { throw new Error(`unexpected remove ${k}`); },
    has(k) { return map.has(k); }
  };
}

const searchSandbox = {
  console, JSON, Date, String, Array, Number, Boolean, Object,
  localStorage: storage({
    aha_music_library_v1: { tracks: [{ id: 't1', title: 'Safe Song', artist: 'Safe Artist', preview_url: 'https://example.invalid/preview.mp3', token: 'MUSIC_TOKEN' }], artists: [{ id: 'a1', name: 'Safe Artist' }], albums: [], playlists: [{ id: 'p1', name: 'Safe Playlist' }] },
    aha_training_corpus_v1: [{ id: 'c1', title: 'Corpus Local', text: 'local review corpus', pkce: 'PKCE_SECRET' }],
    aha_training_examples_v1: [{ id: 'e1', input: 'Question local', output: 'Answer local', apiKey: 'API_SECRET' }],
    aha_data_intake_queue_v1: [{ id: 'd1', title: 'Intake Candidate', text: 'safe candidate' }],
    aha_knowledge_curation_v1: [{ id: 'cur1', title: 'Curation Item', summary: 'safe curation' }],
    aha_knowledge_map_v1: { nodes: [{ id: 'n1', title: 'Graph Node' }], edges: [{ id: 'edge1', relation: 'relates to' }] },
    aha_knowledge_graph_intelligence_v1: { suggestions: [{ id: 's1', title: 'Graph Suggestion', reason: 'safe suggestion' }] },
    aha_personal_answer_evaluations_v1: [{ id: 'v1', query: 'Safe query', summary: 'score high', score: 88 }],
    aha_music_spotify_token_v1: { access_token: 'SPOTIFY_TOKEN', pkce: 'PKCE_VALUE' }
  }),
  document: { addEventListener() {}, getElementById() { return null; }, readyState: 'loading' }
};
searchSandbox.window = searchSandbox;
vm.createContext(searchSandbox);
vm.runInContext(searchCode, searchSandbox, { filename: 'js/ahaSearch.js' });
const items = searchSandbox.AHASearch.collectSearchItems();
const sources = new Set(items.map((item) => item.source));
['aha_music_library','aha_training_corpus','aha_training_examples','aha_data_intake','aha_knowledge_curation','aha_knowledge_map','aha_knowledge_graph_intelligence','aha_personal_answer_evaluations'].forEach((source) => assert.ok(sources.has(source), `runtime source ${source}`));
assert.ok(items.every((item) => item.local_only === true && item.read_only === true), 'all search items are local/read-only');
assert.ok(items.filter((item) => item.source === 'aha_music_library').every((item) => item.metadata_only === true && item.audio_playback_enabled === false && item.spotify_token_included === false), 'music metadata-only');
assert.ok(items.filter((item) => item.source.startsWith('aha_training')).every((item) => item.model_training_enabled === false), 'training no model training');
assert.ok(items.filter((item) => item.source === 'aha_knowledge_map').every((item) => item.canonical_truth === false), 'map not canonical truth');
const itemJson = JSON.stringify(items);
['SPOTIFY_TOKEN','PKCE_VALUE','MUSIC_TOKEN','PKCE_SECRET','API_SECRET'].forEach((secret) => assert.equal(itemJson.includes(secret), false, `secret leaked ${secret}`));

[
  'aha_music_library_v1','aha_music_history_go_bridge_v1','aha_music_historygo_bridge_v1','aha_training_corpus_v1','aha_training_examples_v1',
  'aha_data_intake_queue_v1','aha_source_connectors_last_scan_v1','aha_knowledge_curation_v1','aha_knowledge_map_v1','aha_knowledge_workbench_status_v1',
  'aha_knowledge_graph_intelligence_v1','aha_personal_ai_control_status_v1','aha_personal_ai_loop_audit_v1','aha_personal_answer_evaluations_v1',
  'aha_profile_name','aha_profile_id','aha_pending_chat_prompt_v1','isExportBlockedKey','SECRET_KEY_PATTERNS'
].forEach((term) => assert.ok(privacyCode.includes(term), `privacy should mention ${term}`));
assert.equal(/Object\.keys\s*\(\s*localStorage\s*\)/.test(privacyCode), false, 'privacy must not blindly enumerate localStorage');

const downloads = [];
const blobs = [];
class Blob { constructor(parts, options) { this.parts = parts; this.options = options; blobs.push(this); } }
const privacySandbox = {
  console, JSON, Date, String, Array, Number, Boolean, Object, Blob,
  localStorage: storage({
    aha_music_library_v1: { tracks: [{ id: 't1', title: 'Safe Song' }] },
    aha_training_corpus_v1: [{ id: 'c1', title: 'Corpus Local', model_training_enabled: false, remote_upload_enabled: false }],
    aha_personal_answer_evaluations_v1: [{ id: 'v1', query: 'Safe query' }],
    aha_data_intake_queue_v1: [{ id: 'd1', title: 'Intake Candidate' }],
    aha_music_spotify_token_v1: { access_token: 'RAW_TOKEN_VALUE', pkce: 'RAW_PKCE_VALUE' }
  }),
  sessionStorage: storage({ spotify_pkce_verifier: 'SESSION_PKCE' }),
  URL: { createObjectURL() { return 'blob:test'; }, revokeObjectURL() {} },
  document: { readyState: 'loading', addEventListener() {}, getElementById() { return null; }, createElement() { return { click() { downloads.push(this.download); }, remove() {} }; }, body: { appendChild() {} } },
  HTMLElement: function(){}, HTMLInputElement: function(){}, HTMLFormElement: function(){}
};
privacySandbox.window = privacySandbox;
vm.createContext(privacySandbox);
vm.runInContext(privacyCode, privacySandbox, { filename: 'js/ahaPrivacy.js' });
const report = privacySandbox.AHAPrivacy.collectStorageReport();
assert.ok(report.some((row) => row.key === 'aha_music_library_v1' && row.local_only === true), 'music report included');
assert.ok(report.some((row) => row.key === 'aha_music_spotify_token_v1' && row.blocked && row.redacted), 'token key blocked');
const exported = privacySandbox.AHAPrivacy.exportAllData();
const exportedJson = JSON.stringify(exported);
['RAW_TOKEN_VALUE','RAW_PKCE_VALUE','SESSION_PKCE'].forEach((secret) => assert.equal(exportedJson.includes(secret), false, `privacy leaked ${secret}`));
assert.equal(exported.data.aha_music_spotify_token_v1, undefined, 'token raw key not exported');
assert.ok(exported.meta.local_only, 'export is local-only');
assert.ok(exported.meta.sessionStorage_note.includes('not included'), 'session storage secret note');

assert.ok(searchHtml.includes('Søk leser bare eksplisitt godkjente lokale AHA-lag'));
assert.ok(searchHtml.includes('Music vises som metadata-only'));
assert.ok(searchHtml.includes('ikke som trent modell'));
assert.ok(privacyHtml.includes('hemmeligheter eksporteres ikke'));
assert.ok(privacyHtml.includes('ikke at modelltrening eller fine-tuning har skjedd'));
assert.ok(matrix.includes('Eksplisitt local-only søkeindeks'));
assert.ok(matrix.includes('Privacy dekker eksplisitt modne AHA-lag'));
