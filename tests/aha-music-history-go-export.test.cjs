const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const exporter = require('../scripts/export-aha-music-history-go.cjs');

const fixture = {
  generatedAt: '2026-06-15T12:00:00.000Z',
  artists: [
    { id: 'artist_bowie', spotify_artist_id: 'bowie', name: 'David Bowie' },
    { id: 'artist_aha', spotify_artist_id: 'aha', name: 'a-ha', image_url: 'https://example.test/aha.jpg' }
  ],
  tracks: [
    { id: 'track_heroes', spotify_track_id: 'heroes', name: 'Heroes', artist_names: ['David Bowie'], duration_ms: 215000 },
    { id: 'track_take_on_me', spotify_track_id: 'take-on-me', name: 'Take On Me', artist_names: ['a-ha'], duration_ms: 225000 }
  ],
  trackArtists: [
    { spotify_track_id: 'heroes', spotify_artist_id: 'bowie' },
    { spotify_track_id: 'take-on-me', spotify_artist_id: 'aha' }
  ],
  artistCanonNodes: [{ entityId: 'artist_aha', canonNodeId: 'synthpop', confidence: 'high', source: 'curated' }],
  trackCanonNodes: [{ entityId: 'track_take_on_me', canonNodeId: 'music_video_culture', confidence: 'high', source: 'curated' }],
  musicArtistPlaceRelations: [
    { id: 'artist_oslo', artistId: 'artist_aha', artistName: 'a-ha', historyGoPlaceId: 'hg_oslo', candidatePlaceName: 'Oslo', candidateCountry: 'Norway', relationType: 'formed_in', confidence: 0.98, status: 'verified', sourceType: 'manual_seed', sourceNote: 'Formed in Oslo.' },
    { id: 'artist_berlin', artistId: 'artist_bowie', artistName: 'David Bowie', historyGoPlaceId: null, candidatePlaceName: 'Berlin', candidateCountry: 'Germany', relationType: 'important_event', confidence: 0.8, status: 'suggested', sourceType: 'manual_seed', sourceNote: 'Berlin period.' },
    { id: 'artist_rejected', artistId: 'artist_aha', artistName: 'a-ha', historyGoPlaceId: 'bad', candidatePlaceName: 'Bad', relationType: 'scene', confidence: 0.2, status: 'rejected' }
  ],
  musicTrackPlaceRelations: [
    { id: 'track_oslo', trackId: 'track_take_on_me', trackTitle: 'Take On Me', artistId: 'artist_aha', artistName: 'a-ha', historyGoPlaceId: 'hg_oslo', candidatePlaceName: 'Oslo', relationType: 'formed_in', confidence: 0.98, status: 'verified' },
    { id: 'track_berlin', trackId: 'track_heroes', trackTitle: 'Heroes', artistId: 'artist_bowie', artistName: 'David Bowie', historyGoPlaceId: null, candidatePlaceName: 'Berlin', relationType: 'important_event', confidence: 0.8, status: 'suggested' }
  ]
};

const canonNodes = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/aha-music/canon/musicCanonNodes.json'), 'utf8'));
const first = exporter.buildExport({ library: fixture, artistRelations: fixture.musicArtistPlaceRelations, trackRelations: fixture.musicTrackPlaceRelations, canonNodes });
const second = exporter.buildExport({ library: fixture, artistRelations: fixture.musicArtistPlaceRelations, trackRelations: fixture.musicTrackPlaceRelations, canonNodes });
assert.deepEqual(first.output, second.output, 'same input must produce identical output');
assert.deepEqual(first.output.artists.map((artist) => artist.name), ['a-ha', 'David Bowie'], 'artists sort alphabetically');
assert.deepEqual(first.output.tracks.map((track) => track.title), ['Take On Me', 'Heroes'], 'tracks sort by artist then title');
assert.equal(first.output.relations.length, 4, 'rejected relations are excluded');
assert.equal(first.output.relations.filter((relation) => relation.status === 'needs_place_review').length, 2, 'missing place IDs require review');
assert.ok(first.output.relations.filter((relation) => relation.historyGoPlaceId).every((relation) => relation.unlockText), 'safe relations include unlock text');
assert.ok(first.output.relations.filter((relation) => !relation.historyGoPlaceId).every((relation) => relation.unlockText === null), 'review relations do not unlock');
assert.equal(first.output.summary.artistsWithCanonCount, 1);
assert.equal(first.output.summary.tracksWithCanonCount, 1);
assert.deepEqual(exporter.validateExport(first.output), [], 'reference integrity validation passes');

const tmp = path.join(__dirname, '.tmp-music-export.json');
fs.writeFileSync(tmp, `${JSON.stringify(fixture, null, 2)}\n`);
const run = spawnSync(process.execPath, ['scripts/export-aha-music-history-go.cjs', tmp], { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
fs.unlinkSync(tmp);
assert.equal(run.status, 0, run.stderr);
const generated = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/exports/history-go/aha-music/ahaMusicHistoryGoExport.json'), 'utf8'));
const report = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/exports/history-go/aha-music/ahaMusicHistoryGoExport.report.json'), 'utf8'));
assert.equal(generated.summary.relationCount, 4);
assert.equal(report.safeHistoryGoPlaceRelationCount, 2);
assert.equal(report.placeCandidateWithoutIdCount, 1);
assert.equal(report.valid, true);

// Restore the committed no-private-library baseline.
const restore = spawnSync(process.execPath, ['scripts/export-aha-music-history-go.cjs'], { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
assert.equal(restore.status, 0, restore.stderr);
console.log('aha-music-history-go-export.test.cjs passed');
