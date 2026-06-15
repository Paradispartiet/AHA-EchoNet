#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const exportDir = path.join(repoRoot, 'data/exports/history-go/aha-music');
const bridgeDir = path.join(repoRoot, 'data/aha-music/history-go');
const canonDir = path.join(repoRoot, 'data/aha-music/canon');
const OUTPUT = path.join(exportDir, 'ahaMusicHistoryGoExport.json');
const REPORT = path.join(exportDir, 'ahaMusicHistoryGoExport.report.json');
const SCHEMA = path.join(exportDir, 'ahaMusicHistoryGoExport.schema.json');

const asArray = (value) => Array.isArray(value) ? value : [];
const text = (value, fallback = '') => String(value ?? '').trim() || fallback;
const nullableText = (value) => text(value) || null;
const readJson = (file, fallback) => fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback;
const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
const compare = (a, b) => collator.compare(text(a), text(b));
const unique = (items) => [...new Set(items.filter(Boolean))];
const slug = (value) => text(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown';
const getArtistId = (artist) => text(artist.id || artist.artistId || artist.spotify_artist_id || artist.spotifyArtistId || artist.name);
const getSpotifyArtistId = (artist) => text(artist.spotify_artist_id || artist.spotifyArtistId || artist.spotifyId || artist.id);
const getTrackId = (track) => text(track.id || track.trackId || track.spotify_track_id || track.spotifyTrackId || track.name || track.title);
const getSpotifyTrackId = (track) => text(track.spotify_track_id || track.spotifyTrackId || track.spotifyId || track.id);

function parseArgs(argv) {
  const args = argv.slice(2);
  const audit = args.includes('--audit');
  const positional = args.filter((arg) => !arg.startsWith('--'));
  return { audit, inputPath: positional[0] ? path.resolve(process.cwd(), positional[0]) : null };
}

function generatedAtFor(library, artistRelations, trackRelations, canonLinks) {
  const explicit = text(process.env.AHA_MUSIC_EXPORT_GENERATED_AT || library.generatedAt || library.exportGeneratedAt);
  if (explicit) return new Date(explicit).toISOString();
  const dates = [...artistRelations, ...trackRelations, ...canonLinks]
    .flatMap((item) => [item.updatedAt, item.reviewedAt, item.createdAt])
    .filter(Boolean).map((value) => Date.parse(value)).filter(Number.isFinite);
  return new Date(dates.length ? Math.max(...dates) : 0).toISOString();
}

function normalizeCanonLinks(library) {
  const named = [
    ['artist', library.artistCanonNodes || library.artistCanonLinks],
    ['track', library.trackCanonNodes || library.trackCanonLinks],
    ['playlist', library.playlistCanonNodes || library.playlistCanonLinks]
  ];
  return named.flatMap(([fallbackType, links]) => asArray(links).map((link) => ({
    entityType: text(link.entityType, fallbackType),
    entityId: text(link.entityId || link.artistId || link.trackId || link.playlistId),
    canonNodeId: text(link.canonNodeId || link.nodeId || link.id),
    confidence: text(link.confidence, 'unreviewed'),
    source: text(link.source || link.sourceType, 'manual'),
    createdAt: nullableText(link.createdAt)
  }))).filter((link) => link.entityId && link.canonNodeId);
}

function artistIdsForTrack(track, library, artistsBySpotify, artistsById) {
  const spotifyTrackId = getSpotifyTrackId(track);
  const linked = asArray(library.trackArtists).filter((link) => text(link.spotify_track_id || link.spotifyTrackId || link.trackId) === spotifyTrackId || text(link.trackId) === getTrackId(track));
  const ids = linked.map((link) => {
    const spotifyId = text(link.spotify_artist_id || link.spotifyArtistId);
    return getArtistId(artistsBySpotify.get(spotifyId) || artistsById.get(text(link.artistId)) || link);
  });
  if (!ids.length) ids.push(...asArray(track.artistIds || track.artist_ids));
  return unique(ids.map(text));
}

function relationStatus(relation) {
  return nullableText(relation.historyGoPlaceId) ? text(relation.status, 'suggested') : 'needs_place_review';
}

function explanationFor(relation, kind) {
  const place = text(relation.candidatePlaceName, 'stedet');
  const artist = text(relation.artistName, 'artisten');
  if (!nullableText(relation.historyGoPlaceId)) return `Stedet ${place} må verifiseres før det brukes som sikker History Go-kobling.`;
  if (kind === 'track') return `Sangen er koblet til ${place} gjennom artisten ${artist}.`;
  return `Artisten er knyttet til ${place} som ${text(relation.relationType, 'associated_city')}.`;
}

function unlockTextFor(kind, place) {
  return kind === 'track'
    ? `Du har låst opp en musikkoppdagelse knyttet til ${place}.`
    : 'Du har funnet en artist knyttet til dette stedet.';
}

function buildExport(inputs) {
  const { library, artistRelations: rawArtistRelations, trackRelations: rawTrackRelations, canonNodes } = inputs;
  const canonLinks = normalizeCanonLinks(library);
  const generatedAt = generatedAtFor(library, rawArtistRelations, rawTrackRelations, canonLinks);
  const canonNodeIds = new Set(canonNodes.map((node) => text(node.id)));
  const validCanonLinks = canonLinks.filter((link) => canonNodeIds.has(link.canonNodeId));
  const artistRelations = rawArtistRelations.filter((relation) => text(relation.status) !== 'rejected');
  const trackRelations = rawTrackRelations.filter((relation) => text(relation.status) !== 'rejected');

  const artistsById = new Map(asArray(library.artists).map((artist) => [getArtistId(artist), artist]));
  const artistsBySpotify = new Map(asArray(library.artists).map((artist) => [getSpotifyArtistId(artist), artist]));
  const tracksById = new Map(asArray(library.tracks).map((track) => [getTrackId(track), track]));

  const relations = [];
  const relationIds = new Set();
  const addRelation = (source, kind) => {
    const fromId = kind === 'artist' ? text(source.artistId) : text(source.trackId);
    if ((kind === 'artist' && !artistsById.has(fromId)) || (kind === 'track' && !tracksById.has(fromId))) return;
    const inheritedArtistRelation = rawArtistRelations.find((relation) =>
      text(relation.id) === text(source.inheritedFromArtistRelationId)
      || (text(relation.artistId) === text(source.artistId) && text(relation.candidatePlaceName) === text(source.candidatePlaceName))
    );
    const candidateCountry = text(source.candidateCountry || inheritedArtistRelation?.candidateCountry);
    const placeKey = nullableText(source.historyGoPlaceId) || `candidate:${slug(source.candidatePlaceName)}:${slug(candidateCountry)}`;
    const baseId = text(source.id, `${kind}_place_${slug(fromId)}_${slug(placeKey)}_${slug(source.relationType)}`);
    let id = baseId;
    let suffix = 2;
    while (relationIds.has(id)) id = `${baseId}_${suffix++}`;
    relationIds.add(id);
    const status = relationStatus(source);
    const placeName = text(source.candidatePlaceName, text(source.historyGoPlaceName, 'Ukjent sted'));
    relations.push({
      id,
      relationType: text(source.relationType, 'associated_city'),
      fromType: kind,
      fromId,
      toType: 'place',
      toId: placeKey,
      historyGoPlaceId: nullableText(source.historyGoPlaceId),
      candidatePlaceName: placeName,
      candidateCountry,
      confidence: Number.isFinite(Number(source.confidence)) ? Number(source.confidence) : 0,
      status,
      sourceType: text(source.sourceType, kind === 'track' ? 'artist_inheritance' : 'imported_metadata'),
      sourceNote: text(source.sourceNote),
      explanation: explanationFor(source, kind),
      unlockText: nullableText(source.historyGoPlaceId) ? unlockTextFor(kind, placeName) : null,
      artistName: text(source.artistName || artistsById.get(text(source.artistId))?.name),
      trackTitle: kind === 'track' ? text(source.trackTitle || tracksById.get(fromId)?.name || tracksById.get(fromId)?.title) : ''
    });
  };
  artistRelations.forEach((relation) => addRelation(relation, 'artist'));
  trackRelations.forEach((relation) => addRelation(relation, 'track'));

  relations.sort((a, b) => compare(a.historyGoPlaceId || a.candidatePlaceName, b.historyGoPlaceId || b.candidatePlaceName) || compare(a.artistName, b.artistName) || compare(a.trackTitle, b.trackTitle) || compare(a.id, b.id));

  const relationIdsByEntity = new Map();
  for (const relation of relations) relationIdsByEntity.set(relation.fromId, [...asArray(relationIdsByEntity.get(relation.fromId)), relation.id]);
  const canonIdsByEntity = new Map();
  for (const link of validCanonLinks) canonIdsByEntity.set(`${link.entityType}:${link.entityId}`, [...asArray(canonIdsByEntity.get(`${link.entityType}:${link.entityId}`)), link.canonNodeId]);

  const tracks = asArray(library.tracks).map((track) => {
    const id = getTrackId(track);
    const artistIds = artistIdsForTrack(track, library, artistsBySpotify, artistsById);
    const artistNames = artistIds.map((artistId) => text(artistsById.get(artistId)?.name || artistsById.get(artistId)?.artistName)).filter(Boolean);
    return {
      id,
      spotifyTrackId: getSpotifyTrackId(track),
      spotifyUri: text(track.spotify_uri || track.spotifyUri || track.uri),
      title: text(track.name || track.title || track.trackTitle, 'Ukjent sang'),
      artistIds,
      artistNames: artistNames.length ? artistNames : asArray(track.artist_names || track.artistNames).map(text).filter(Boolean),
      albumTitle: text(track.album_name || track.albumTitle || track.album?.name),
      albumImageUrl: nullableText(track.album_image_url || track.albumImageUrl || track.album?.imageUrl),
      durationMs: Math.max(0, Number(track.duration_ms || track.durationMs || 0)),
      spotifyUrl: nullableText(track.spotify_url || track.spotifyUrl || track.external_urls?.spotify),
      canonNodeIds: unique(asArray(canonIdsByEntity.get(`track:${id}`))).sort(compare),
      placeRelationIds: unique(asArray(relationIdsByEntity.get(id))).sort(compare)
    };
  }).filter((track) => track.id);
  tracks.sort((a, b) => compare(a.artistNames.join(', '), b.artistNames.join(', ')) || compare(a.title, b.title) || compare(a.id, b.id));

  const trackIdsByArtist = new Map();
  for (const track of tracks) for (const artistId of track.artistIds) trackIdsByArtist.set(artistId, [...asArray(trackIdsByArtist.get(artistId)), track.id]);
  const artists = asArray(library.artists).map((artist) => {
    const id = getArtistId(artist);
    return {
      id,
      spotifyArtistId: getSpotifyArtistId(artist),
      name: text(artist.name || artist.artistName, 'Ukjent artist'),
      canonicalSlug: text(artist.canonicalSlug, slug(artist.name || artist.artistName)),
      imageUrl: nullableText(artist.image_url || artist.imageUrl || asArray(artist.images)[0]?.url),
      spotifyUrl: nullableText(artist.spotify_url || artist.spotifyUrl || artist.external_urls?.spotify),
      canonNodeIds: unique(asArray(canonIdsByEntity.get(`artist:${id}`))).sort(compare),
      placeRelationIds: unique(asArray(relationIdsByEntity.get(id))).sort(compare),
      trackIds: unique(asArray(trackIdsByArtist.get(id))).sort(compare)
    };
  }).filter((artist) => artist.id);
  artists.sort((a, b) => compare(a.name, b.name) || compare(a.id, b.id));

  const placeMap = new Map();
  for (const relation of relations) {
    const current = placeMap.get(relation.toId) || {
      historyGoPlaceId: relation.historyGoPlaceId,
      candidatePlaceName: relation.candidatePlaceName,
      candidateCountry: relation.candidateCountry,
      status: relation.historyGoPlaceId ? 'linked' : 'needs_place_review',
      artistIds: [], trackIds: [], unlockText: relation.historyGoPlaceId ? `Du har låst opp en musikkoppdagelse knyttet til ${relation.candidatePlaceName}.` : null
    };
    if (relation.fromType === 'artist') current.artistIds.push(relation.fromId);
    else current.trackIds.push(relation.fromId);
    placeMap.set(relation.toId, current);
  }
  const places = [...placeMap.values()].map((place) => ({ ...place, artistIds: unique(place.artistIds).sort(compare), trackIds: unique(place.trackIds).sort(compare) }))
    .sort((a, b) => compare(a.historyGoPlaceId || a.candidatePlaceName, b.historyGoPlaceId || b.candidatePlaceName));

  const canon = canonNodes.map((node) => ({
    canonNodeId: text(node.id), name: text(node.name), type: text(node.type), shortDescription: text(node.shortDescription),
    linkedArtistIds: validCanonLinks.filter((link) => link.entityType === 'artist' && link.canonNodeId === node.id).map((link) => link.entityId).sort(compare),
    linkedTrackIds: validCanonLinks.filter((link) => link.entityType === 'track' && link.canonNodeId === node.id).map((link) => link.entityId).sort(compare),
    linkedPlaylistIds: validCanonLinks.filter((link) => link.entityType === 'playlist' && link.canonNodeId === node.id).map((link) => link.entityId).sort(compare)
  })).filter((node) => node.canonNodeId).sort((a, b) => compare(a.name, b.name) || compare(a.canonNodeId, b.canonNodeId));

  const countStatus = (status) => relations.filter((relation) => relation.status === status).length;
  const summary = {
    artistCount: artists.length, trackCount: tracks.length, placeCount: places.length, relationCount: relations.length, canonNodeCount: canon.length,
    verifiedRelationCount: countStatus('verified'), autoMatchedRelationCount: countStatus('auto_matched'), suggestedRelationCount: countStatus('suggested'),
    needsPlaceReviewCount: countStatus('needs_place_review'), rejectedRelationCount: 0,
    tracksWithPlaceCount: tracks.filter((track) => track.placeRelationIds.length).length, artistsWithPlaceCount: artists.filter((artist) => artist.placeRelationIds.length).length,
    tracksWithCanonCount: tracks.filter((track) => track.canonNodeIds.length).length, artistsWithCanonCount: artists.filter((artist) => artist.canonNodeIds.length).length, generatedAt
  };
  const output = { schemaVersion: '1.0.0', generatedAt, source: 'aha_music', artists, tracks, places, relations: relations.map(({ artistName, trackTitle, candidateCountry, ...relation }) => relation), canon, summary };
  return { output, allCanonLinks: canonLinks, validCanonLinks };
}

function validateExport(output) {
  const errors = [];
  const uniqueIds = (items, field, label) => {
    const values = items.map((item) => item[field]);
    if (new Set(values).size !== values.length) errors.push(`${label} contains duplicate ${field} values.`);
  };
  uniqueIds(output.artists, 'id', 'artists'); uniqueIds(output.tracks, 'id', 'tracks'); uniqueIds(output.relations, 'id', 'relations'); uniqueIds(output.canon, 'canonNodeId', 'canon');
  const artistIds = new Set(output.artists.map((item) => item.id)); const trackIds = new Set(output.tracks.map((item) => item.id));
  const placeIds = new Set(output.places.map((place) => place.historyGoPlaceId || `candidate:${slug(place.candidatePlaceName)}:${slug(place.candidateCountry)}`));
  const canonIds = new Set(output.canon.map((item) => item.canonNodeId));
  for (const relation of output.relations) {
    if (relation.fromType === 'artist' ? !artistIds.has(relation.fromId) : !trackIds.has(relation.fromId)) errors.push(`Relation ${relation.id} references missing ${relation.fromType} ${relation.fromId}.`);
    if (!placeIds.has(relation.toId)) errors.push(`Relation ${relation.id} references missing place ${relation.toId}.`);
    if (!relation.historyGoPlaceId && relation.status !== 'needs_place_review') errors.push(`Relation ${relation.id} without place id must need review.`);
  }
  for (const entity of [...output.artists, ...output.tracks]) for (const canonNodeId of entity.canonNodeIds) if (!canonIds.has(canonNodeId)) errors.push(`${entity.id} references missing canon node ${canonNodeId}.`);
  return errors;
}

function buildReport(output, allCanonLinks, validCanonLinks, validationErrors) {
  const placeCounts = new Map();
  for (const place of output.places) placeCounts.set(place.historyGoPlaceId || place.candidatePlaceName, { historyGoPlaceId: place.historyGoPlaceId, candidatePlaceName: place.candidatePlaceName, trackCount: place.trackIds.length });
  return {
    schemaVersion: output.schemaVersion, generatedAt: output.generatedAt, valid: validationErrors.length === 0, validationErrors,
    exportedArtistCount: output.artists.length, exportedTrackCount: output.tracks.length, placeCount: output.places.length,
    safeHistoryGoPlaceRelationCount: output.relations.filter((relation) => relation.historyGoPlaceId).length,
    placeCandidateWithoutIdCount: output.places.filter((place) => !place.historyGoPlaceId).length,
    canonLinkCount: validCanonLinks.length, ignoredUnknownCanonLinkCount: allCanonLinks.length - validCanonLinks.length,
    top20PlacesByTrackCount: [...placeCounts.values()].sort((a, b) => b.trackCount - a.trackCount || compare(a.historyGoPlaceId || a.candidatePlaceName, b.historyGoPlaceId || b.candidatePlaceName)).slice(0, 20),
    top20ArtistsByPlaceRelationCount: output.artists.map((artist) => ({ artistId: artist.id, artistName: artist.name, placeRelationCount: artist.placeRelationIds.length })).filter((item) => item.placeRelationCount).sort((a, b) => b.placeRelationCount - a.placeRelationCount || compare(a.artistName, b.artistName)).slice(0, 20),
    tracksWithoutArtist: output.tracks.filter((track) => !track.artistIds.length).map((track) => ({ trackId: track.id, title: track.title })),
    tracksWithoutCanon: output.tracks.filter((track) => !track.canonNodeIds.length).map((track) => ({ trackId: track.id, title: track.title })),
    artistsWithoutPlace: output.artists.filter((artist) => !artist.placeRelationIds.length).map((artist) => ({ artistId: artist.id, name: artist.name }))
  };
}

function loadInputs(inputPath) {
  const library = inputPath ? readJson(inputPath, {}) : {};
  return {
    library,
    artistRelations: asArray(library.musicArtistPlaceRelations).length ? library.musicArtistPlaceRelations : readJson(path.join(bridgeDir, 'musicArtistPlaceRelations.json'), []),
    trackRelations: asArray(library.musicTrackPlaceRelations).length ? library.musicTrackPlaceRelations : readJson(path.join(bridgeDir, 'musicTrackPlaceRelations.json'), []),
    canonNodes: readJson(path.join(canonDir, 'musicCanonNodes.json'), [])
  };
}

function main() {
  const { audit, inputPath } = parseArgs(process.argv);
  if (inputPath && !fs.existsSync(inputPath)) throw new Error(`Library snapshot not found: ${inputPath}`);
  fs.mkdirSync(exportDir, { recursive: true });
  const { output, allCanonLinks, validCanonLinks } = buildExport(loadInputs(inputPath));
  const validationErrors = validateExport(output);
  const report = buildReport(output, allCanonLinks, validCanonLinks, validationErrors);
  writeJson(OUTPUT, output); writeJson(REPORT, report);
  if (!fs.existsSync(SCHEMA)) throw new Error(`Export schema not found: ${SCHEMA}`);
  console.log(`${audit ? 'Audited' : 'Exported'} AHA Music → History Go bundle: ${output.artists.length} artists, ${output.tracks.length} tracks, ${output.relations.length} relations.`);
  if (validationErrors.length) { console.error(validationErrors.join('\n')); process.exitCode = 1; }
}

if (require.main === module) main();
module.exports = { buildExport, buildReport, validateExport, loadInputs, slug };
