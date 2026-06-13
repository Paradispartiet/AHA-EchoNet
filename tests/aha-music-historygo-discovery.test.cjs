const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('js/ahaMusicHistoryGoDiscovery.js', 'utf8');
const context = { console, globalThis: {}, window: undefined };
context.globalThis = context;
vm.runInNewContext(source, context);
const discovery = context.AHAMusicHistoryGoDiscovery;

const data = {
  artistRelations: [
    { artistId: 'artist_aha', artistName: 'a-ha', spotifyArtistId: 'spotify_aha', historyGoPlaceId: 'oslo', relationType: 'formed_in', confidence: 0.98, status: 'verified', sourceNote: 'Formed in Oslo.' },
    { artistId: 'artist_unknown', artistName: 'Unknown', historyGoPlaceId: null, relationType: 'scene', confidence: 0.4, status: 'needs_place_review' }
  ],
  trackRelations: [
    { trackId: 'take_on_me', trackTitle: 'Take On Me', artistId: 'artist_aha', artistName: 'a-ha', historyGoPlaceId: 'oslo', relationType: 'formed_in', confidence: 0.98, status: 'auto_matched' },
    { trackId: 'candidate_track', trackTitle: 'Candidate', artistName: 'Unknown', historyGoPlaceId: '', relationType: 'scene', confidence: 0.2, status: 'needs_place_review' }
  ]
};

const indexed = discovery.buildMusicByPlace(data);
assert.equal(JSON.stringify(Object.keys(indexed.musicByPlace)), JSON.stringify(['oslo']));
assert.equal(indexed.musicByPlace.oslo.artists.length, 1);
assert.equal(indexed.musicByPlace.oslo.tracks.length, 1);
assert.equal(JSON.stringify(indexed.musicByPlace.oslo.relationTypes), JSON.stringify(['formed_in']));
assert.equal(JSON.stringify(indexed.musicByPlace.oslo.statuses.sort()), JSON.stringify(['auto_matched', 'verified']));
assert.equal(indexed.candidatesWithoutPlaceId.artists.length, 1);
assert.equal(indexed.candidatesWithoutPlaceId.tracks.length, 1);

const audit = discovery.auditBridgeData(data, new Set(['oslo']));
assert.equal(audit.artistRelationsRead, 2);
assert.equal(audit.trackRelationsRead, 2);
assert.equal(audit.uniquePlaceIdsWithMusic, 1);
assert.equal(audit.relationsMissingPlaceId, 2);
assert.equal(audit.relationsWithUnknownPlaceId, 0);
assert.equal(JSON.stringify(audit.topPlacesByTracks), JSON.stringify([{ placeId: 'oslo', count: 1 }]));
assert.equal(JSON.stringify(audit.topPlacesByArtists), JSON.stringify([{ placeId: 'oslo', count: 1 }]));

const placeHtml = discovery.renderPlaceMusic('oslo', indexed.musicByPlace.oslo);
assert.ok(placeHtml.includes('Musikk'));
assert.ok(placeHtml.includes('Artister knyttet til stedet'));
assert.ok(placeHtml.includes('Sanger fra AHA Music'));
assert.ok(placeHtml.includes('Denne koblingen er verifisert'));
assert.ok(placeHtml.includes('Denne koblingen er automatisk matchet'));

const html = fs.readFileSync('historygo.html', 'utf8');
assert.ok(html.includes('js/ahaMusicHistoryGoDiscovery.js'));
assert.ok(html.includes('Musikk på History Go-steder'));
assert.ok(html.includes('hg-nearby-music'));

const css = fs.readFileSync('css/aha-dashboard.css', 'utf8');
assert.ok(css.includes('.aha-historygo-music-card'));
assert.ok(css.includes('.aha-historygo-nearby-music'));

const readme = fs.readFileSync('README.md', 'utf8');
assert.ok(readme.includes('History Go Music Discovery v1'));
assert.ok(readme.includes('data/integrations/aha-music/musicArtistPlaceRelations.json'));

console.log('aha-music-historygo-discovery.test.cjs passed');
