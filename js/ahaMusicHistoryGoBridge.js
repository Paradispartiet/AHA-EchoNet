// ahaMusicHistoryGoBridge.js
// AHA Music → History Go Bridge v1: cautious local matching from imported artists to place candidates.

(function (global) {
  "use strict";

  const SEED_URL = "data/aha-music/history-go/musicHistoryGoSeedCandidates.json";
  const ARTIST_RELATIONS_URL = "data/aha-music/history-go/musicArtistPlaceRelations.json";
  const TRACK_RELATIONS_URL = "data/aha-music/history-go/musicTrackPlaceRelations.json";
  const STORAGE_KEY = "aha_music_history_go_bridge_v1";
  const allowedRelationTypes = new Set([
    "birthplace",
    "hometown",
    "formed_in",
    "scene",
    "studio",
    "venue",
    "festival",
    "label_city",
    "music_video_location",
    "memorial",
    "important_event",
    "associated_city",
    "associated_country"
  ]);
  const allowedStatuses = new Set(["verified", "auto_matched", "suggested", "needs_place_review", "rejected"]);
  const allowedSourceTypes = new Set(["manual_seed", "imported_metadata", "history_go_existing_place", "later_external_source"]);

  let cachedStaticData = { seeds: [], artistRelations: [], trackRelations: [] };

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function text(value, fallback = "") {
    const out = String(value ?? "").trim();
    return out || fallback;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function safeParse(raw, fallback) {
    try {
      const parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch {
      return fallback;
    }
  }

  function normalizeName(value) {
    return text(value)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  function slug(value) {
    return normalizeName(value).replace(/\s+/g, "_") || "unknown";
  }

  function candidateId(candidate, index) {
    return text(candidate.id) || `seed_${String(index + 1).padStart(2, "0")}_${slug(candidate.spotifyArtistName)}_${slug(candidate.candidatePlaceName)}_${slug(candidate.relationType)}`;
  }

  function makeRelationId(prefix, parts) {
    return `${prefix}_${parts.map(slug).filter(Boolean).join("_") || "unknown"}`;
  }

  async function loadJson(url, fallback = []) {
    if (typeof fetch !== "function") return fallback;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`Kunne ikke laste ${url}`);
    return response.json();
  }

  async function loadStaticBridgeData() {
    const [seeds, artistRelations, trackRelations] = await Promise.all([
      loadJson(SEED_URL, []),
      loadJson(ARTIST_RELATIONS_URL, []),
      loadJson(TRACK_RELATIONS_URL, [])
    ]);
    cachedStaticData = { seeds: asArray(seeds), artistRelations: asArray(artistRelations), trackRelations: asArray(trackRelations) };
    return cachedStaticData;
  }

  function buildCandidateIndex(candidates) {
    const exact = new Map();
    const caseInsensitive = new Map();
    const normalized = new Map();
    asArray(candidates).forEach((candidate, index) => {
      const enriched = { ...candidate, id: candidateId(candidate, index) };
      const name = text(enriched.spotifyArtistName || enriched.artistName);
      if (!name) return;
      const lower = name.toLowerCase();
      const normal = normalizeName(name);
      exact.set(name, [...asArray(exact.get(name)), enriched]);
      caseInsensitive.set(lower, [...asArray(caseInsensitive.get(lower)), enriched]);
      normalized.set(normal, [...asArray(normalized.get(normal)), enriched]);
    });
    return { exact, caseInsensitive, normalized };
  }

  function findCandidateMatches(artistName, candidateIndex) {
    const exact = candidateIndex.exact.get(text(artistName));
    if (exact?.length) return { strategy: "exact", candidates: exact };
    const insensitive = candidateIndex.caseInsensitive.get(text(artistName).toLowerCase());
    if (insensitive?.length) return { strategy: "case_insensitive", candidates: insensitive };
    const normalized = candidateIndex.normalized.get(normalizeName(artistName));
    if (normalized?.length) return { strategy: "normalized", candidates: normalized };
    return { strategy: "none", candidates: [] };
  }

  function historyGoPlacesFromStorage() {
    if (!global.localStorage) return [];
    const visited = safeParse(global.localStorage.getItem("visited_places"), []);
    const payload = safeParse(global.localStorage.getItem("aha_import_payload_v1"), {});
    const importedVisited = asArray(payload.visited_places || payload.visitedPlaces || payload.places);
    return [...asArray(visited), ...importedVisited]
      .map((place) => ({
        placeId: text(place.placeId || place.place_id || place.id),
        name: text(place.name || place.title || place.placeName || place.place_name),
        country: text(place.country || place.countryName || place.country_name)
      }))
      .filter((place) => place.placeId && place.name);
  }

  function resolveHistoryGoPlace(candidate, places = []) {
    const name = normalizeName(candidate.candidatePlaceName);
    const country = normalizeName(candidate.candidateCountry);
    const matches = asArray(places).filter((place) => {
      const placeName = normalizeName(place.name || place.placeName || place.title);
      const placeCountry = normalizeName(place.country || place.countryName || place.country_name);
      return placeName === name && (!country || !placeCountry || placeCountry === country);
    });
    const uniqueIds = [...new Set(matches.map((place) => text(place.placeId || place.place_id || place.id)).filter(Boolean))];
    return uniqueIds.length === 1 ? uniqueIds[0] : null;
  }

  function getArtistId(artist) {
    return text(artist.id || artist.artistId || artist.spotify_artist_id || artist.spotifyArtistId || artist.name);
  }

  function getSpotifyArtistId(artist) {
    return text(artist.spotify_artist_id || artist.spotifyArtistId || artist.spotifyId || artist.id);
  }

  function getArtistName(artist) {
    return text(artist.name || artist.artistName || artist.spotifyArtistName, "Ukjent artist");
  }

  function buildArtistPlaceRelations(library, candidates, options = {}) {
    const candidateIndex = buildCandidateIndex(candidates);
    const places = asArray(options.historyGoPlaces).length ? asArray(options.historyGoPlaces) : historyGoPlacesFromStorage();
    const createdAt = text(options.createdAt) || new Date().toISOString();
    const relations = [];
    asArray(library?.artists).forEach((artist) => {
      const artistName = getArtistName(artist);
      const match = findCandidateMatches(artistName, candidateIndex);
      match.candidates.forEach((candidate) => {
        const historyGoPlaceId = text(candidate.historyGoPlaceId) || resolveHistoryGoPlace(candidate, places);
        const status = historyGoPlaceId ? "auto_matched" : "needs_place_review";
        relations.push({
          id: makeRelationId("artist_place", [getSpotifyArtistId(artist), artistName, candidate.candidatePlaceName, candidate.relationType]),
          artistId: getArtistId(artist),
          artistName,
          spotifyArtistId: getSpotifyArtistId(artist),
          historyGoPlaceId: historyGoPlaceId || null,
          candidatePlaceName: text(candidate.candidatePlaceName),
          candidateCountry: text(candidate.candidateCountry),
          relationType: text(candidate.relationType),
          confidence: Number(candidate.confidence || 0),
          status,
          sourceType: text(candidate.sourceType, "manual_seed"),
          sourceNote: text(candidate.sourceNote),
          createdAt,
          reviewedAt: historyGoPlaceId ? createdAt : null,
          matchStrategy: match.strategy,
          seedCandidateId: candidate.id
        });
      });
    });
    return relations;
  }

  function getTrackId(track) {
    return text(track.id || track.trackId || track.spotify_track_id || track.spotifyTrackId || track.name);
  }

  function getSpotifyTrackId(track) {
    return text(track.spotify_track_id || track.spotifyTrackId || track.spotifyId || track.id);
  }

  function getTrackTitle(track) {
    return text(track.name || track.title || track.trackTitle, "Ukjent sang");
  }

  function buildTrackPlaceRelations(library, artistRelations) {
    const relationsByArtist = new Map();
    asArray(artistRelations).forEach((relation) => {
      const keys = [relation.spotifyArtistId, relation.artistId, normalizeName(relation.artistName)].filter(Boolean);
      keys.forEach((key) => relationsByArtist.set(key, [...asArray(relationsByArtist.get(key)), relation]));
    });
    const artistsBySpotifyId = new Map(asArray(library?.artists).map((artist) => [getSpotifyArtistId(artist), artist]));
    const output = [];
    const seen = new Set();
    asArray(library?.tracks).forEach((track) => {
      const spotifyTrackId = getSpotifyTrackId(track);
      const links = asArray(library?.trackArtists).filter((link) => text(link.spotify_track_id || link.spotifyTrackId) === spotifyTrackId);
      const fallbackArtists = links.length ? [] : asArray(track.artist_names).map((name) => ({ name, spotify_artist_id: name }));
      const linkedArtists = links.map((link) => artistsBySpotifyId.get(text(link.spotify_artist_id || link.spotifyArtistId)) || {
        name: text(link.artistName || link.spotify_artist_id),
        spotify_artist_id: text(link.spotify_artist_id || link.spotifyArtistId)
      });
      [...linkedArtists, ...fallbackArtists].forEach((artist) => {
        const artistKeys = [getSpotifyArtistId(artist), getArtistId(artist), normalizeName(getArtistName(artist))].filter(Boolean);
        const inherited = artistKeys.flatMap((key) => asArray(relationsByArtist.get(key)));
        [...new Map(inherited.map((relation) => [relation.id, relation])).values()].forEach((relation) => {
          const id = makeRelationId("track_place", [spotifyTrackId, relation.id]);
          if (seen.has(id)) return;
          seen.add(id);
          output.push({
            id,
            trackId: getTrackId(track),
            trackTitle: getTrackTitle(track),
            artistId: relation.artistId,
            artistName: relation.artistName,
            historyGoPlaceId: relation.historyGoPlaceId || null,
            candidatePlaceName: relation.candidatePlaceName,
            relationType: relation.relationType,
            inheritedFromArtistRelationId: relation.id,
            confidence: relation.confidence,
            status: relation.status
          });
        });
      });
    });
    return output;
  }

  function buildBridgeReport(library, artistRelations, trackRelations) {
    const importedArtistIds = new Set(asArray(library?.artists).map(getArtistId));
    const artistsWithCandidate = new Set(asArray(artistRelations).map((relation) => relation.artistId));
    const countStatus = (status) => asArray(artistRelations).filter((relation) => relation.status === status).length;
    const placeCounts = new Map();
    asArray(trackRelations).forEach((relation) => {
      const key = relation.historyGoPlaceId || relation.candidatePlaceName || "Ukjent sted";
      const current = placeCounts.get(key) || { place: key, historyGoPlaceId: relation.historyGoPlaceId || null, candidatePlaceName: relation.candidatePlaceName, trackCount: 0 };
      current.trackCount += 1;
      placeCounts.set(key, current);
    });
    const artistCounts = new Map();
    asArray(artistRelations).forEach((relation) => {
      const current = artistCounts.get(relation.artistId) || { artistId: relation.artistId, artistName: relation.artistName, placeLinkCount: 0 };
      current.placeLinkCount += 1;
      artistCounts.set(relation.artistId, current);
    });
    const tracksBySpotifyId = new Map(asArray(library?.tracks).map((track) => [getSpotifyTrackId(track), track]));
    const relationKeysByTrack = new Map();
    asArray(trackRelations).forEach((relation) => {
      const keys = [relation.trackId];
      asArray(library?.tracks).filter((track) => getTrackId(track) === relation.trackId).forEach((track) => keys.push(getSpotifyTrackId(track)));
      keys.filter(Boolean).forEach((key) => relationKeysByTrack.set(key, [...asArray(relationKeysByTrack.get(key)), relation]));
    });
    const playlistCoverage = asArray(library?.playlists).map((playlist) => {
      const playlistTrackIds = asArray(library?.playlistTracks)
        .filter((link) => text(link.spotify_playlist_id || link.spotifyPlaylistId) === text(playlist.spotify_playlist_id || playlist.spotifyPlaylistId))
        .map((link) => text(link.spotify_track_id || link.spotifyTrackId));
      const relations = playlistTrackIds.flatMap((trackId) => {
        const track = tracksBySpotifyId.get(trackId);
        return [...asArray(relationKeysByTrack.get(trackId)), ...asArray(relationKeysByTrack.get(track ? getTrackId(track) : ""))];
      });
      const places = [...new Set(relations.map((relation) => relation.historyGoPlaceId || relation.candidatePlaceName).filter(Boolean))];
      return {
        playlistId: text(playlist.id || playlist.spotify_playlist_id || playlist.spotifyPlaylistId),
        playlistName: text(playlist.name, "Ukjent spilleliste"),
        linkedTrackPlaceRelations: relations.length,
        candidatePlaces: places
      };
    }).filter((coverage) => coverage.linkedTrackPlaceRelations > 0);
    return {
      generatedAt: new Date().toISOString(),
      importedArtistsAnalyzed: importedArtistIds.size,
      artistsWithPlaceCandidate: artistsWithCandidate.size,
      verified: countStatus("verified"),
      autoMatched: countStatus("auto_matched"),
      needsPlaceReview: countStatus("needs_place_review"),
      trackPlaceRelationsCreated: asArray(trackRelations).length,
      topPlacesByTrackCount: [...placeCounts.values()].sort((a, b) => b.trackCount - a.trackCount || text(a.place).localeCompare(text(b.place), "no")).slice(0, 10),
      topArtistsByPlaceLinks: [...artistCounts.values()].sort((a, b) => b.placeLinkCount - a.placeLinkCount || text(a.artistName).localeCompare(text(b.artistName), "no")).slice(0, 10),
      playlistPlaceCoverage: playlistCoverage.sort((a, b) => b.linkedTrackPlaceRelations - a.linkedTrackPlaceRelations || text(a.playlistName).localeCompare(text(b.playlistName), "no"))
    };
  }

  function buildBridge(library, options = {}) {
    const seeds = asArray(options.seedCandidates || cachedStaticData.seeds);
    const artistRelations = buildArtistPlaceRelations(library, seeds, options);
    const trackRelations = buildTrackPlaceRelations(library, artistRelations);
    const report = buildBridgeReport(library, artistRelations, trackRelations);
    return { artistRelations, trackRelations, report };
  }

  function validateSeedCandidate(candidate) {
    const errors = [];
    for (const key of ["id", "spotifyArtistName", "candidatePlaceName", "candidateCountry", "relationType", "confidence", "sourceType", "sourceNote"]) {
      if (candidate?.[key] === undefined) errors.push(`Seed mangler ${key}`);
    }
    if (!allowedRelationTypes.has(candidate?.relationType)) errors.push(`Ugyldig relationType: ${candidate?.relationType}`);
    if (!allowedSourceTypes.has(candidate?.sourceType)) errors.push(`Ugyldig sourceType: ${candidate?.sourceType}`);
    if (!Number.isFinite(Number(candidate?.confidence))) errors.push(`Ugyldig confidence for ${candidate?.id}`);
    return errors;
  }

  function validateArtistRelation(relation) {
    const errors = [];
    for (const key of ["id", "artistId", "artistName", "spotifyArtistId", "historyGoPlaceId", "candidatePlaceName", "candidateCountry", "relationType", "confidence", "status", "sourceType", "sourceNote", "createdAt", "reviewedAt"]) {
      if (!Object.prototype.hasOwnProperty.call(relation || {}, key)) errors.push(`Artist-place-relasjon mangler ${key}`);
    }
    if (!allowedRelationTypes.has(relation?.relationType)) errors.push(`Ugyldig artist relationType: ${relation?.relationType}`);
    if (!allowedStatuses.has(relation?.status)) errors.push(`Ugyldig artist status: ${relation?.status}`);
    if (!allowedSourceTypes.has(relation?.sourceType)) errors.push(`Ugyldig artist sourceType: ${relation?.sourceType}`);
    return errors;
  }

  function validateTrackRelation(relation) {
    const errors = [];
    for (const key of ["id", "trackId", "trackTitle", "artistId", "artistName", "historyGoPlaceId", "candidatePlaceName", "relationType", "inheritedFromArtistRelationId", "confidence", "status"]) {
      if (!Object.prototype.hasOwnProperty.call(relation || {}, key)) errors.push(`Track-place-relasjon mangler ${key}`);
    }
    if (!allowedRelationTypes.has(relation?.relationType)) errors.push(`Ugyldig track relationType: ${relation?.relationType}`);
    if (!allowedStatuses.has(relation?.status)) errors.push(`Ugyldig track status: ${relation?.status}`);
    return errors;
  }

  function validateBridgeData({ seedCandidates = [], artistRelations = [], trackRelations = [] }) {
    const errors = [
      ...asArray(seedCandidates).flatMap(validateSeedCandidate),
      ...asArray(artistRelations).flatMap(validateArtistRelation),
      ...asArray(trackRelations).flatMap(validateTrackRelation)
    ];
    return {
      ok: errors.length === 0,
      errors,
      seedCandidateCount: asArray(seedCandidates).length,
      artistRelationCount: asArray(artistRelations).length,
      trackRelationCount: asArray(trackRelations).length
    };
  }

  function renderStatusChip(status) {
    const label = status === "needs_place_review" ? "må verifiseres" : status.replaceAll("_", " ");
    return `<span class="aha-music-historygo-status aha-music-historygo-status-${escapeHtml(status)}">${escapeHtml(label)}</span>`;
  }

  function placeExplanation(relation) {
    if (relation.status === "needs_place_review") return "Stedet må verifiseres før det brukes som sikker History Go-kobling.";
    return relation.historyGoPlaceId ? "History Go-sted er funnet i lokale data." : "Stedet er en kandidat.";
  }

  function renderMusicMap(library, bridge) {
    const mount = document.getElementById("music-historygo-map");
    if (!mount) return;
    const report = bridge.report || buildBridgeReport(library, bridge.artistRelations, bridge.trackRelations);
    const placeGroups = new Map();
    asArray(bridge.trackRelations).forEach((relation) => {
      const key = relation.historyGoPlaceId || relation.candidatePlaceName || "Ukjent sted";
      const group = placeGroups.get(key) || { place: key, relation, tracks: [] };
      group.tracks.push(relation);
      placeGroups.set(key, group);
    });
    const groups = [...placeGroups.values()].sort((a, b) => b.tracks.length - a.tracks.length || text(a.place).localeCompare(text(b.place), "no"));
    if (!groups.length) {
      mount.innerHTML = `<article class="aha-music-historygo-empty"><h3>Musikken din på kartet</h3><p>Importer sanger fra Spotify. Når en importert artist matcher seed-listen, vises steder som kandidater her.</p></article>`;
      return;
    }
    mount.innerHTML = `<div class="aha-music-historygo-summary" aria-label="Music History Go-oppsummering">
      <article><strong>${report.trackPlaceRelationsCreated}</strong><span>sanger med stedskobling</span></article>
      <article><strong>${report.artistsWithPlaceCandidate}</strong><span>artister med stedskobling</span></article>
      <article><strong>${report.needsPlaceReview}</strong><span>stedskandidater må verifiseres</span></article>
    </div>
    <div class="aha-music-historygo-places">
      ${groups.map((group) => `<article class="aha-music-historygo-place">
        <div class="aha-music-historygo-place-head">
          <div><h3>${escapeHtml(group.relation.candidatePlaceName)}</h3><p>${escapeHtml(placeExplanation(group.relation))}</p></div>
          ${renderStatusChip(group.relation.status)}
        </div>
        <ul>${group.tracks.map((relation) => `<li>Denne sangen kan kobles til ${escapeHtml(relation.candidatePlaceName)} gjennom artisten ${escapeHtml(relation.artistName)}. <strong>${escapeHtml(relation.trackTitle)}</strong></li>`).join("")}</ul>
      </article>`).join("")}
    </div>`;
  }

  function renderArtistPlaceRelations(artist, relations) {
    const artistRelations = asArray(relations).filter((relation) => relation.spotifyArtistId === getSpotifyArtistId(artist) || normalizeName(relation.artistName) === normalizeName(getArtistName(artist)));
    if (!artistRelations.length) return "";
    return `<div class="aha-music-historygo-inline"><h5>Knyttet til steder</h5>${artistRelations.map((relation) => `<p>Denne artisten er foreslått knyttet til ${escapeHtml(relation.candidatePlaceName)}. <span>${escapeHtml(relation.relationType)}</span> · ${escapeHtml(String(relation.confidence))} · ${renderStatusChip(relation.status)}</p>`).join("")}</div>`;
  }

  function renderTrackPlaceRelations(track, relations) {
    const trackRelations = asArray(relations).filter((relation) => relation.trackId === getTrackId(track) || relation.trackId === getSpotifyTrackId(track));
    if (!trackRelations.length) return "";
    return `<div class="aha-music-historygo-inline"><h5>Kan oppdages i History Go</h5>${trackRelations.map((relation) => `<p>Denne sangen kan kobles til ${escapeHtml(relation.candidatePlaceName)} gjennom artisten ${escapeHtml(relation.artistName)}. ${escapeHtml(placeExplanation(relation))}</p>`).join("")}</div>`;
  }

  function saveBridgeSnapshot(bridge) {
    if (!global.localStorage) return bridge;
    global.localStorage.setItem(STORAGE_KEY, JSON.stringify(bridge));
    return bridge;
  }

  function loadBridgeSnapshot() {
    if (!global.localStorage) return null;
    return safeParse(global.localStorage.getItem(STORAGE_KEY), null);
  }

  global.AHAMusicHistoryGoBridge = {
    SEED_URL,
    STORAGE_KEY,
    allowedRelationTypes,
    allowedStatuses,
    allowedSourceTypes,
    normalizeName,
    buildCandidateIndex,
    findCandidateMatches,
    buildArtistPlaceRelations,
    buildTrackPlaceRelations,
    buildBridgeReport,
    buildBridge,
    validateBridgeData,
    loadStaticBridgeData,
    renderMusicMap,
    renderArtistPlaceRelations,
    renderTrackPlaceRelations,
    saveBridgeSnapshot,
    loadBridgeSnapshot,
    historyGoPlacesFromStorage
  };

  async function init() {
    try {
      await loadStaticBridgeData();
      global.dispatchEvent?.(new CustomEvent("aha:music-historygo-bridge-ready", { detail: cachedStaticData }));
    } catch (error) {
      console.warn("AHA Music History Go bridge data unavailable", error);
    }
  }

  if (global.document?.readyState === "loading") global.document.addEventListener("DOMContentLoaded", init);
  else if (global.document) init();
})(window);
