const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const { spawnSync } = require('child_process');

const read = (file) => fs.readFileSync(file, 'utf8');
const readJson = (file) => JSON.parse(read(file));

const schema = readJson('data/aha-music/history-go/musicHistoryGoBridgeSchema.json');
const seeds = readJson('data/aha-music/history-go/musicHistoryGoSeedCandidates.json');
const artistRelations = readJson('data/aha-music/history-go/musicArtistPlaceRelations.json');
const trackRelations = readJson('data/aha-music/history-go/musicTrackPlaceRelations.json');
const report = readJson('data/aha-music/history-go/musicHistoryGoBridgeReport.json');
const html = read('music.html');
const css = read('css/aha-music.css');
const musicJs = read('js/ahaMusic.js');
const bridgeJs = read('js/ahaMusicHistoryGoBridge.js');
const readme = read('README.md');

assert.equal(seeds.length, 15, 'bridge seed file should include the 15 requested candidates');
assert.ok(seeds.some((seed) => seed.spotifyArtistName === 'a-ha' && seed.candidatePlaceName === 'Oslo' && seed.relationType === 'formed_in'), 'a-ha Oslo seed should exist');
assert.ok(seeds.some((seed) => seed.spotifyArtistName === 'David Bowie' && seed.candidatePlaceName === 'Berlin'), 'David Bowie Berlin seed should exist');
assert.ok(seeds.every((seed) => Object.prototype.hasOwnProperty.call(seed, 'historyGoPlaceId')), 'seed candidates should explicitly keep nullable historyGoPlaceId');
assert.ok(seeds.every((seed) => seed.historyGoPlaceId === null), 'baseline seeds should not invent History Go place ids');
assert.deepEqual(artistRelations, [], 'baseline artist-place relations should be empty until a library snapshot is processed');
assert.deepEqual(trackRelations, [], 'baseline track-place relations should be empty until a library snapshot is processed');
assert.equal(report.importedArtistsAnalyzed, 0, 'baseline bridge report should not invent imported artists');
assert.deepEqual(report.playlistPlaceCoverage, [], 'baseline report should include empty playlist-place coverage');

for (const required of ['id', 'artistId', 'artistName', 'spotifyArtistId', 'historyGoPlaceId', 'candidatePlaceName', 'candidateCountry', 'relationType', 'confidence', 'status', 'sourceType', 'sourceNote', 'createdAt', 'reviewedAt']) {
  assert.ok(schema.$defs.musicArtistPlaceRelation.required.includes(required), `artist-place schema should require ${required}`);
}
for (const required of ['id', 'trackId', 'trackTitle', 'artistId', 'artistName', 'historyGoPlaceId', 'candidatePlaceName', 'relationType', 'inheritedFromArtistRelationId', 'confidence', 'status']) {
  assert.ok(schema.$defs.musicTrackPlaceRelation.required.includes(required), `track-place schema should require ${required}`);
}
for (const type of ['birthplace', 'hometown', 'formed_in', 'scene', 'studio', 'venue', 'festival', 'label_city', 'music_video_location', 'memorial', 'important_event', 'associated_city', 'associated_country']) {
  assert.ok(schema.$defs.relationType.enum.includes(type), `schema should allow relationType ${type}`);
}
for (const status of ['verified', 'auto_matched', 'suggested', 'needs_place_review', 'rejected']) {
  assert.ok(schema.$defs.status.enum.includes(status), `schema should allow status ${status}`);
}
for (const sourceType of ['manual_seed', 'imported_metadata', 'history_go_existing_place', 'later_external_source']) {
  assert.ok(schema.$defs.sourceType.enum.includes(sourceType), `schema should allow sourceType ${sourceType}`);
}

for (const text of ['Musikken din på kartet', 'music-historygo-map', 'js/ahaMusicHistoryGoBridge.js']) {
  assert.ok(html.includes(text), `music.html should expose ${text}`);
}
for (const text of ['Knyttet til steder', 'Kan oppdages i History Go', 'needs_place_review', 'exact', 'case_insensitive', 'normalized']) {
  assert.ok(bridgeJs.includes(text), `bridge JS should include ${text}`);
}
assert.ok(css.includes('.aha-music-historygo-summary'), 'CSS should style the History Go bridge summary');
assert.ok(musicJs.includes('musicArtistPlaceRelations'), 'music library model should reserve artist-place relations');
assert.ok(musicJs.includes('renderTrackPlaceRelations'), 'track cards should render inherited History Go place relations');
assert.ok(readme.includes('AHA Music → History Go Bridge v1'), 'README should document the bridge');
assert.ok(readme.includes('track → artist → place'), 'README should explain track to place inheritance');

const sandbox = {
  window: {},
  document: { readyState: 'loading', addEventListener: () => {}, getElementById: () => null },
  localStorage: { getItem: () => null, setItem: () => {} },
  fetch: async () => { throw new Error('not used in unit validation'); },
  console
};
sandbox.window = sandbox;
vm.runInNewContext(bridgeJs, sandbox, { filename: 'js/ahaMusicHistoryGoBridge.js' });
const validation = sandbox.AHAMusicHistoryGoBridge.validateBridgeData({ seedCandidates: seeds, artistRelations, trackRelations });
assert.equal(validation.ok, true, `bridge validation should pass: ${validation.errors.join('; ')}`);
assert.equal(sandbox.AHAMusicHistoryGoBridge.normalizeName('Jokke & Valentinerne!'), 'jokke and valentinerne', 'normalization should remove special characters consistently');

const library = {
  artists: [
    { id: 'spotify_artist_a-ha-id', spotify_artist_id: 'a-ha-id', name: 'a-ha' },
    { id: 'spotify_artist_bowie-id', spotify_artist_id: 'bowie-id', name: 'david bowie' },
    { id: 'spotify_artist_unknown-id', spotify_artist_id: 'unknown-id', name: 'Unknown Artist' }
  ],
  tracks: [
    { id: 'spotify_track_take-on-me', spotify_track_id: 'take-on-me', name: 'Take On Me', artist_names: ['a-ha'] },
    { id: 'spotify_track_heroes', spotify_track_id: 'heroes', name: 'Heroes', artist_names: ['David Bowie'] }
  ],
  trackArtists: [
    { spotify_track_id: 'take-on-me', spotify_artist_id: 'a-ha-id', artist_order: 0 },
    { spotify_track_id: 'heroes', spotify_artist_id: 'bowie-id', artist_order: 0 }
  ],
  playlists: [
    { id: 'spotify_playlist_music-history', spotify_playlist_id: 'music-history', name: 'Music History' }
  ],
  playlistTracks: [
    { spotify_playlist_id: 'music-history', spotify_track_id: 'take-on-me', position: 0 },
    { spotify_playlist_id: 'music-history', spotify_track_id: 'heroes', position: 1 }
  ]
};
const bridge = sandbox.AHAMusicHistoryGoBridge.buildBridge(library, { seedCandidates: seeds, createdAt: '2026-06-12T00:00:00.000Z' });
assert.equal(bridge.artistRelations.length, 3, 'a-ha should get one relation and David Bowie should get two relations');
assert.equal(bridge.trackRelations.length, 3, 'tracks should inherit place relations from matched artists');
assert.ok(bridge.artistRelations.every((relation) => relation.status === 'needs_place_review'), 'relations without local place ids should require place review');
assert.ok(bridge.artistRelations.every((relation) => relation.historyGoPlaceId === null), 'relations should preserve null History Go place ids when no local match exists');
assert.equal(bridge.report.importedArtistsAnalyzed, 3, 'report should count imported artists analyzed');
assert.equal(bridge.report.artistsWithPlaceCandidate, 2, 'report should count artists with place candidates');
assert.equal(bridge.report.needsPlaceReview, 3, 'report should count needs_place_review artist relations');
assert.equal(bridge.report.trackPlaceRelationsCreated, 3, 'report should count created track-place relations');
assert.equal(bridge.report.playlistPlaceCoverage.length, 1, 'report should include playlist to place coverage');
assert.deepEqual(bridge.report.playlistPlaceCoverage[0].candidatePlaces.sort(), ['Berlin', 'Brixton', 'Oslo'].sort(), 'playlist coverage should list candidate places');

const tmpLibrary = 'tests/.tmp-music-historygo-library.json';
fs.writeFileSync(tmpLibrary, `${JSON.stringify(library, null, 2)}\n`);
const run = spawnSync(process.execPath, ['scripts/build-music-history-go-bridge.cjs', tmpLibrary], { encoding: 'utf8' });
fs.unlinkSync(tmpLibrary);
assert.equal(run.status, 0, `bridge job should run successfully: ${run.stderr}`);
const generatedArtistRelations = readJson('data/aha-music/history-go/musicArtistPlaceRelations.json');
const generatedTrackRelations = readJson('data/aha-music/history-go/musicTrackPlaceRelations.json');
const generatedReport = readJson('data/aha-music/history-go/musicHistoryGoBridgeReport.json');
assert.equal(generatedArtistRelations.length, 3, 'bridge job should generate artist-place relations from snapshot');
assert.equal(generatedTrackRelations.length, 3, 'bridge job should generate inherited track-place relations from snapshot');
assert.equal(generatedReport.trackPlaceRelationsCreated, 3, 'bridge job report should include generated track-place count');

// Restore committed empty baseline after the write-test so repeated local test runs stay deterministic.
fs.writeFileSync('data/aha-music/history-go/musicArtistPlaceRelations.json', '[]\n');
fs.writeFileSync('data/aha-music/history-go/musicTrackPlaceRelations.json', '[]\n');
fs.writeFileSync('data/aha-music/history-go/musicHistoryGoBridgeReport.json', `${JSON.stringify({
  generatedAt: '2026-06-12T00:00:00.000Z',
  importedArtistsAnalyzed: 0,
  artistsWithPlaceCandidate: 0,
  verified: 0,
  autoMatched: 0,
  needsPlaceReview: 0,
  trackPlaceRelationsCreated: 0,
  topPlacesByTrackCount: [],
  topArtistsByPlaceLinks: [],
  playlistPlaceCoverage: []
}, null, 2)}\n`);

console.log('aha-music-historygo-bridge.test.cjs passed');
