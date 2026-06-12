const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const read = (file) => fs.readFileSync(file, 'utf8');
const html = read('music.html');
const js = read('js/ahaMusic.js');
const modules = read('js/ahaModules.js');
const schema = read('supabase/schema.sql');
const readme = read('README.md');

for (const text of [
  'Koble til Spotify',
  'Importer spillelister',
  'spotify-playlists',
  'spotify-import-status',
  'imported-tracks',
  'include-saved-tracks'
]) {
  assert.ok(html.includes(text), `music.html should expose ${text}`);
}

for (const scope of ['playlist-read-private', 'playlist-read-collaborative', 'user-library-read']) {
  assert.ok(js.includes(scope), `Spotify scope ${scope} should be requested`);
}

for (const endpoint of ['/me/playlists', '/playlists/${encodeURIComponent(playlist.id)}/items', '/me/tracks']) {
  assert.ok(js.includes(endpoint), `Spotify endpoint ${endpoint} should be used`);
}

assert.ok(js.includes('code_challenge_method'), 'OAuth flow should use PKCE challenge method');
assert.ok(js.includes('spotify_track_id'), 'tracks should keep Spotify track references');
assert.ok(js.includes('upsertByKey(library.tracks, normalizedTrack, "spotify_track_id")'), 'tracks should dedupe on spotify_track_id');
assert.equal(/audio|download/i.test(js.replace('no audio files', '')), false, 'music importer should not download audio files');
assert.ok(modules.includes('id: "music"'), 'AHA Music module should be registered');
assert.ok(modules.includes('Spotify-import, normalisert musikkmetadata'), 'AHA Music module should describe the Spotify importer');

for (const table of [
  'music_sources',
  'music_playlists',
  'music_tracks',
  'music_albums',
  'music_artists',
  'music_track_artists',
  'music_playlist_tracks'
]) {
  assert.ok(schema.includes(`public.${table}`), `${table} should be in Supabase schema`);
}

assert.ok(schema.includes('idx_music_tracks_profile_spotify'), 'schema should enforce profile-level track dedupe');
assert.ok(readme.includes('AHA Music: Spotify-import MVP v1'), 'README should document AHA Music import flow');
assert.ok(readme.includes('lagrer kun metadata og Spotify-referanser, aldri lydfiler'), 'README should document no-audio limitation');

const localStore = new Map();
const sandbox = {
  window: {},
  document: { readyState: 'loading', addEventListener: () => {}, getElementById: () => null },
  localStorage: {
    getItem: (key) => localStore.has(key) ? localStore.get(key) : null,
    setItem: (key, value) => localStore.set(key, String(value)),
    removeItem: (key) => localStore.delete(key)
  },
  console
};
sandbox.window = sandbox;
vm.runInNewContext(js, sandbox, { filename: 'js/ahaMusic.js' });

const track = {
  id: 'track-1',
  name: 'Song',
  duration_ms: 123,
  external_urls: { spotify: 'https://open.spotify.com/track/track-1' },
  album: { id: 'album-1', name: 'Album', external_urls: { spotify: 'https://open.spotify.com/album/album-1' } },
  artists: [{ id: 'artist-1', name: 'Artist', external_urls: { spotify: 'https://open.spotify.com/artist/artist-1' } }]
};
const playlist = { id: 'spotify_playlist_playlist-1', spotify_playlist_id: 'playlist-1' };
let library = sandbox.AHAMusic.loadLibrary();
library = sandbox.AHAMusic.mergeTrack(library, track, playlist, 0);
library = sandbox.AHAMusic.mergeTrack(library, track, playlist, 1);
assert.equal(library.tracks.length, 1, 'mergeTrack should dedupe duplicate tracks');
assert.equal(library.albums.length, 1, 'mergeTrack should normalize albums');
assert.equal(library.artists.length, 1, 'mergeTrack should normalize artists');
assert.equal(library.trackArtists.length, 1, 'mergeTrack should normalize track artists');
assert.equal(library.playlistTracks.length, 1, 'mergeTrack should dedupe playlist-track links');

console.log('aha-music-spotify-import.test.cjs passed');
