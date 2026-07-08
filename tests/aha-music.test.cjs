const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const js = fs.readFileSync('js/ahaMusic.js', 'utf8');
const html = fs.readFileSync('music.html', 'utf8');
const privacy = fs.readFileSync('js/ahaPrivacy.js', 'utf8');

const store = new Map();
let saveCalls = 0;
let loadCalls = 0;
const sandbox = {
  window: {},
  document: { readyState: 'loading', addEventListener: () => {}, getElementById: () => null, querySelectorAll: () => [] },
  localStorage: {
    getItem: (key) => store.has(key) ? store.get(key) : null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key)
  },
  sessionStorage: {
    getItem: (key) => store.has(`session:${key}`) ? store.get(`session:${key}`) : null,
    setItem: (key, value) => store.set(`session:${key}`, String(value)),
    removeItem: (key) => store.delete(`session:${key}`)
  },
  AHARepository: {
    saveMusicLibrarySnapshot: async () => { saveCalls += 1; return { ok: true }; },
    loadMusicLibrarySnapshot: async () => { loadCalls += 1; return { ok: true, library: { tracks: [{ id: 'r', spotify_track_id: 'r' }] } }; }
  },
  AHA_CONFIG: {},
  console
};
sandbox.window = sandbox;
vm.runInNewContext(js, sandbox, { filename: 'js/ahaMusic.js' });
const music = sandbox.AHAMusic;

let library = music.loadLibrary();
for (const [key, expected] of Object.entries({ local_only: true, metadata_only: true, audio_stored: false, audio_playback_enabled: false, ai_classified: false, echonet_shared: false, sync_enabled: false, historygo_writeback_enabled: false })) {
  assert.strictEqual(library[key], expected, `library ${key}`);
}

const saved = music.saveLibrary(library);
assert.ok(store.has(music.STORAGE_KEY), 'saveLibrary writes localStorage library');
assert.strictEqual(saveCalls, 0, 'saveLibrary must not use repository without database sync flag');
assert.deepStrictEqual(music.databaseSyncDisabledResult(saved).database_sync_disabled, true);

music.hydrateRemoteLibrary().then(async (result) => {
  assert.strictEqual(result.database_sync_disabled, true, 'hydrateRemoteLibrary is localOnly by default');
  assert.strictEqual(loadCalls, 0, 'hydrateRemoteLibrary must not read repository without flag');

  sandbox.AHA_CONFIG.music = { enableDatabaseSync: true };
  await music.persistRemote(saved);
  assert.strictEqual(saveCalls, 1, 'repository save is allowed with explicit database sync flag');
  store.delete(music.STORAGE_KEY);
  await music.hydrateRemoteLibrary();
  assert.strictEqual(loadCalls, 1, 'repository load is allowed with explicit database sync flag');

  const artist = music.normalizeArtist({ id: 'artist-1', name: 'Artist' });
  const album = music.normalizeAlbum({ id: 'album-1', name: 'Album' });
  const track = music.normalizeTrack({ id: 'track-1', name: 'Song', preview_url: 'https://p.example/preview.mp3', album, artists: [artist] });
  const playlist = music.normalizePlaylist({ id: 'playlist-1', name: 'List' });
  for (const item of [artist, album, track, playlist]) {
    assert.strictEqual(item.local_only, true);
    assert.strictEqual(item.metadata_only, true);
    assert.strictEqual(item.audio_stored, false);
    assert.strictEqual(item.audio_playback_enabled, false);
    assert.strictEqual(item.ai_classified, false);
    assert.strictEqual(item.echonet_shared, false);
    assert.strictEqual(item.sync_enabled, false);
  }
  assert.strictEqual(track.preview_url, 'https://p.example/preview.mp3', 'preview_url remains metadata');

  let merged = music.loadLibrary();
  merged = music.mergeTrack(merged, { ...track, id: 'track-1', album: { id: 'album-1', name: 'Album' }, artists: [{ id: 'artist-1', name: 'Artist' }] }, playlist, 0);
  assert.strictEqual(merged.trackArtists[0].local_only, true);
  assert.strictEqual(merged.trackArtists[0].meta.object_type, 'track_artist_link');
  assert.strictEqual(merged.playlistTracks[0].local_only, true);
  assert.strictEqual(merged.playlistTracks[0].meta.object_type, 'playlist_track_link');

  merged.imports.push({ id: 'import-1', source_id: 'spotify' });
  const normalized = music.saveLibrary(merged);
  assert.strictEqual(normalized.imports[0].provider, 'spotify');
  assert.strictEqual(normalized.imports[0].local_only, true);
  assert.strictEqual(normalized.imports[0].metadata_only, true);
  assert.strictEqual(normalized.imports[0].audio_stored, false);
  assert.strictEqual(normalized.imports[0].ai_classified, false);
  assert.strictEqual(normalized.imports[0].echonet_shared, false);
  assert.strictEqual(normalized.imports[0].sync_enabled, false);

  sandbox.sessionStorage.setItem(music.TOKEN_KEY || 'aha_music_spotify_token_v1', JSON.stringify({ access_token: 'secret', refresh_token: 'refresh' }));
  assert.strictEqual(store.has('aha_music_spotify_token_v1'), false, 'token key is not in localStorage');
  assert.strictEqual(store.has('aha_music_spotify_pkce_v1'), false, 'PKCE key is not in localStorage');
  const storedLibrary = store.get(music.STORAGE_KEY);
  assert.ok(!storedLibrary.includes('access_token'));
  assert.ok(!storedLibrary.includes('refresh_token'));
  assert.ok(privacy.includes('aha_music_library_v1'));
  assert.ok(privacy.includes('aha_music_history_go_bridge_v1'));
  assert.ok(!privacy.includes('aha_music_spotify_token_v1'));

  assert.ok(html.includes('AHA Music importerer metadata fra Spotify til et lokalt bibliotek'));
  assert.ok(html.includes('Den skriver ikke tilbake til History Go'));
  assert.ok(js.includes('Import fullført: metadata lagret lokalt.'));

  const forbidden = [/<audio/i, /new Audio\b/, /\.play\s*\(/, /fetch\([^)]*preview_url/, /Blob\s*\(/, /InsightsEngine/, /MetaInsightsEngine/, /AHAIngest/, /createClient/, /AHASyncHub/, /navigator\.share/];
  for (const pattern of forbidden) assert.ok(!pattern.test(js), `forbidden runtime pattern ${pattern}`);
  assert.ok(js.includes('Fetch boundary'));
  assert.ok(js.includes('SPOTIFY_API_URL'));
  console.log('aha-music.test.cjs passed');
}).catch((error) => { console.error(error); process.exit(1); });
