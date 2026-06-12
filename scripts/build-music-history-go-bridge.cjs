#!/usr/bin/env node
// Builds AHA Music → History Go bridge relation files from a local AHA Music library snapshot.
// Usage: node scripts/build-music-history-go-bridge.cjs [path/to/aha_music_library.json]

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const dataDir = path.join(repoRoot, 'data/aha-music/history-go');
const seedPath = path.join(dataDir, 'musicHistoryGoSeedCandidates.json');
const artistOut = path.join(dataDir, 'musicArtistPlaceRelations.json');
const trackOut = path.join(dataDir, 'musicTrackPlaceRelations.json');
const reportOut = path.join(dataDir, 'musicHistoryGoBridgeReport.json');

const asArray = (value) => Array.isArray(value) ? value : [];
const text = (value, fallback = '') => {
  const out = String(value ?? '').trim();
  return out || fallback;
};
const readJson = (file, fallback) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback;
const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

function normalizeName(value) {
  return text(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const slug = (value) => normalizeName(value).replace(/\s+/g, '_') || 'unknown';
const relationId = (prefix, parts) => `${prefix}_${parts.map(slug).filter(Boolean).join('_') || 'unknown'}`;

function buildCandidateIndex(candidates) {
  const index = { exact: new Map(), caseInsensitive: new Map(), normalized: new Map() };
  asArray(candidates).forEach((candidate) => {
    const name = text(candidate.spotifyArtistName);
    if (!name) return;
    for (const [mapName, key] of [
      ['exact', name],
      ['caseInsensitive', name.toLowerCase()],
      ['normalized', normalizeName(name)]
    ]) {
      index[mapName].set(key, [...asArray(index[mapName].get(key)), candidate]);
    }
  });
  return index;
}

function findCandidateMatches(artistName, index) {
  const exact = index.exact.get(text(artistName));
  if (exact?.length) return { strategy: 'exact', candidates: exact };
  const caseInsensitive = index.caseInsensitive.get(text(artistName).toLowerCase());
  if (caseInsensitive?.length) return { strategy: 'case_insensitive', candidates: caseInsensitive };
  const normalized = index.normalized.get(normalizeName(artistName));
  if (normalized?.length) return { strategy: 'normalized', candidates: normalized };
  return { strategy: 'none', candidates: [] };
}

function collectLocalHistoryGoPlaces() {
  const candidates = [];
  for (const file of [
    'docs/fixtures/aha-analysis/13-historygo-eidsvoll-grunnloven.json',
    'docs/fixtures/aha-analysis/14-historygo-bislett-byrom-stadion.json'
  ]) {
    const full = path.join(repoRoot, file);
    if (!fs.existsSync(full)) continue;
    const item = readJson(full, null);
    if (!item) continue;
    candidates.push({ id: item.id, placeId: item.placeId || item.place_id || item.id, name: item.placeName || item.title || item.name, country: item.country });
  }
  return candidates.filter((place) => text(place.placeId) && text(place.name));
}

function resolveHistoryGoPlace(candidate, places) {
  const name = normalizeName(candidate.candidatePlaceName);
  const country = normalizeName(candidate.candidateCountry);
  const matches = asArray(places).filter((place) => {
    const placeName = normalizeName(place.name || place.placeName || place.title);
    const placeCountry = normalizeName(place.country || place.countryName || place.country_name);
    return placeName === name && (!country || !placeCountry || placeCountry === country);
  });
  const ids = [...new Set(matches.map((place) => text(place.placeId || place.place_id || place.id)).filter(Boolean))];
  return ids.length === 1 ? ids[0] : null;
}

function buildArtistRelations(library, seeds, places, createdAt) {
  const index = buildCandidateIndex(seeds);
  return asArray(library.artists).flatMap((artist) => {
    const artistName = text(artist.name || artist.artistName || artist.spotifyArtistName, 'Ukjent artist');
    const spotifyArtistId = text(artist.spotify_artist_id || artist.spotifyArtistId || artist.spotifyId || artist.id || artistName);
    const match = findCandidateMatches(artistName, index);
    return match.candidates.map((candidate) => {
      const historyGoPlaceId = text(candidate.historyGoPlaceId) || resolveHistoryGoPlace(candidate, places);
      return {
        id: relationId('artist_place', [spotifyArtistId, artistName, candidate.candidatePlaceName, candidate.relationType]),
        artistId: text(artist.id || spotifyArtistId),
        artistName,
        spotifyArtistId,
        historyGoPlaceId: historyGoPlaceId || null,
        candidatePlaceName: text(candidate.candidatePlaceName),
        candidateCountry: text(candidate.candidateCountry),
        relationType: text(candidate.relationType),
        confidence: Number(candidate.confidence || 0),
        status: historyGoPlaceId ? 'auto_matched' : 'needs_place_review',
        sourceType: text(candidate.sourceType, 'manual_seed'),
        sourceNote: text(candidate.sourceNote),
        createdAt,
        reviewedAt: historyGoPlaceId ? createdAt : null,
        matchStrategy: match.strategy,
        seedCandidateId: candidate.id
      };
    });
  });
}

function buildTrackRelations(library, artistRelations) {
  const relationsByArtist = new Map();
  for (const relation of artistRelations) {
    for (const key of [relation.spotifyArtistId, relation.artistId, normalizeName(relation.artistName)].filter(Boolean)) {
      relationsByArtist.set(key, [...asArray(relationsByArtist.get(key)), relation]);
    }
  }
  const artistsBySpotifyId = new Map(asArray(library.artists).map((artist) => [text(artist.spotify_artist_id || artist.spotifyArtistId || artist.id), artist]));
  const output = [];
  const seen = new Set();
  for (const track of asArray(library.tracks)) {
    const spotifyTrackId = text(track.spotify_track_id || track.spotifyTrackId || track.id || track.name);
    const links = asArray(library.trackArtists).filter((link) => text(link.spotify_track_id || link.spotifyTrackId) === spotifyTrackId);
    const artists = links.length
      ? links.map((link) => artistsBySpotifyId.get(text(link.spotify_artist_id || link.spotifyArtistId)) || { name: link.artistName, spotify_artist_id: link.spotify_artist_id })
      : asArray(track.artist_names).map((name) => ({ name, spotify_artist_id: name }));
    for (const artist of artists) {
      const artistName = text(artist.name || artist.artistName || artist.spotifyArtistName, 'Ukjent artist');
      const spotifyArtistId = text(artist.spotify_artist_id || artist.spotifyArtistId || artist.id || artistName);
      const inherited = [spotifyArtistId, text(artist.id || spotifyArtistId), normalizeName(artistName)].flatMap((key) => asArray(relationsByArtist.get(key)));
      for (const relation of [...new Map(inherited.map((item) => [item.id, item])).values()]) {
        const id = relationId('track_place', [spotifyTrackId, relation.id]);
        if (seen.has(id)) continue;
        seen.add(id);
        output.push({
          id,
          trackId: text(track.id || spotifyTrackId),
          trackTitle: text(track.name || track.title || track.trackTitle, 'Ukjent sang'),
          artistId: relation.artistId,
          artistName: relation.artistName,
          historyGoPlaceId: relation.historyGoPlaceId || null,
          candidatePlaceName: relation.candidatePlaceName,
          relationType: relation.relationType,
          inheritedFromArtistRelationId: relation.id,
          confidence: relation.confidence,
          status: relation.status
        });
      }
    }
  }
  return output;
}

function buildReport(library, artistRelations, trackRelations, generatedAt) {
  const placeCounts = new Map();
  for (const relation of trackRelations) {
    const key = relation.historyGoPlaceId || relation.candidatePlaceName || 'Ukjent sted';
    const current = placeCounts.get(key) || { place: key, historyGoPlaceId: relation.historyGoPlaceId || null, candidatePlaceName: relation.candidatePlaceName, trackCount: 0 };
    current.trackCount += 1;
    placeCounts.set(key, current);
  }
  const artistCounts = new Map();
  for (const relation of artistRelations) {
    const current = artistCounts.get(relation.artistId) || { artistId: relation.artistId, artistName: relation.artistName, placeLinkCount: 0 };
    current.placeLinkCount += 1;
    artistCounts.set(relation.artistId, current);
  }
  const tracksBySpotifyId = new Map(asArray(library.tracks).map((track) => [text(track.spotify_track_id || track.spotifyTrackId || track.id), track]));
  const relationKeysByTrack = new Map();
  for (const relation of trackRelations) {
    const keys = [relation.trackId];
    for (const track of asArray(library.tracks).filter((item) => text(item.id || item.spotify_track_id || item.name) === relation.trackId)) {
      keys.push(text(track.spotify_track_id || track.spotifyTrackId || track.id));
    }
    for (const key of keys.filter(Boolean)) relationKeysByTrack.set(key, [...asArray(relationKeysByTrack.get(key)), relation]);
  }
  const playlistPlaceCoverage = asArray(library.playlists).map((playlist) => {
    const playlistTrackIds = asArray(library.playlistTracks)
      .filter((link) => text(link.spotify_playlist_id || link.spotifyPlaylistId) === text(playlist.spotify_playlist_id || playlist.spotifyPlaylistId))
      .map((link) => text(link.spotify_track_id || link.spotifyTrackId));
    const relations = playlistTrackIds.flatMap((trackId) => {
      const track = tracksBySpotifyId.get(trackId);
      const normalizedTrackId = track ? text(track.id || track.spotify_track_id || track.name) : '';
      return [...asArray(relationKeysByTrack.get(trackId)), ...asArray(relationKeysByTrack.get(normalizedTrackId))];
    });
    const places = [...new Set(relations.map((relation) => relation.historyGoPlaceId || relation.candidatePlaceName).filter(Boolean))];
    return {
      playlistId: text(playlist.id || playlist.spotify_playlist_id || playlist.spotifyPlaylistId),
      playlistName: text(playlist.name, 'Ukjent spilleliste'),
      linkedTrackPlaceRelations: relations.length,
      candidatePlaces: places
    };
  }).filter((coverage) => coverage.linkedTrackPlaceRelations > 0);
  return {
    generatedAt,
    importedArtistsAnalyzed: new Set(asArray(library.artists).map((artist) => text(artist.id || artist.spotify_artist_id || artist.name))).size,
    artistsWithPlaceCandidate: new Set(artistRelations.map((relation) => relation.artistId)).size,
    verified: artistRelations.filter((relation) => relation.status === 'verified').length,
    autoMatched: artistRelations.filter((relation) => relation.status === 'auto_matched').length,
    needsPlaceReview: artistRelations.filter((relation) => relation.status === 'needs_place_review').length,
    trackPlaceRelationsCreated: trackRelations.length,
    topPlacesByTrackCount: [...placeCounts.values()].sort((a, b) => b.trackCount - a.trackCount || text(a.place).localeCompare(text(b.place), 'no')).slice(0, 10),
    topArtistsByPlaceLinks: [...artistCounts.values()].sort((a, b) => b.placeLinkCount - a.placeLinkCount || text(a.artistName).localeCompare(text(b.artistName), 'no')).slice(0, 10),
    playlistPlaceCoverage: playlistPlaceCoverage.sort((a, b) => b.linkedTrackPlaceRelations - a.linkedTrackPlaceRelations || text(a.playlistName).localeCompare(text(b.playlistName), 'no'))
  };
}

const inputPath = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : null;
const library = inputPath ? readJson(inputPath, {}) : { artists: [], tracks: [], trackArtists: [], playlistTracks: [], playlists: [] };
const seeds = readJson(seedPath, []);
const generatedAt = new Date().toISOString();
const places = collectLocalHistoryGoPlaces();
const artistRelations = buildArtistRelations(library, seeds, places, generatedAt);
const trackRelations = buildTrackRelations(library, artistRelations);
const report = buildReport(library, artistRelations, trackRelations, generatedAt);

writeJson(artistOut, artistRelations);
writeJson(trackOut, trackRelations);
writeJson(reportOut, report);
console.log(`AHA Music → History Go bridge: ${artistRelations.length} artist-place relations, ${trackRelations.length} track-place relations.`);
