// ahaMusicHistoryGoDiscovery.js
// History Go-side loader/index/audit for AHA Music bridge relations.

(function (global) {
  "use strict";

  const DEFAULT_PATHS = {
    artistRelations: "data/integrations/aha-music/musicArtistPlaceRelations.json",
    trackRelations: "data/integrations/aha-music/musicTrackPlaceRelations.json",
    bridgeReport: "data/integrations/aha-music/musicHistoryGoBridgeReport.json"
  };

  function asArray(value) { return Array.isArray(value) ? value : []; }
  function asObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function text(value, fallback = "") { const out = String(value ?? "").trim(); return out || fallback; }
  function uniq(values) { return [...new Set(asArray(values).map((value) => text(value)).filter(Boolean))]; }
  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
  function safeParse(raw, fallback) {
    if (!raw) return fallback;
    try { const parsed = JSON.parse(raw); return parsed ?? fallback; } catch { return fallback; }
  }

  async function loadJson(path, fallback) {
    if (typeof global.fetch !== "function") return fallback;
    try {
      const response = await global.fetch(path, { cache: "no-store" });
      if (!response.ok) return fallback;
      return await response.json();
    } catch {
      return fallback;
    }
  }

  async function loadBridgeData(paths = DEFAULT_PATHS) {
    const [artistRelations, trackRelations, bridgeReport] = await Promise.all([
      loadJson(paths.artistRelations || DEFAULT_PATHS.artistRelations, []),
      loadJson(paths.trackRelations || DEFAULT_PATHS.trackRelations, []),
      loadJson(paths.bridgeReport || DEFAULT_PATHS.bridgeReport, {})
    ]);
    return {
      artistRelations: asArray(artistRelations),
      trackRelations: asArray(trackRelations),
      bridgeReport: asObject(bridgeReport)
    };
  }

  function normalizeArtistRelation(relation) {
    const r = asObject(relation);
    return {
      artistId: text(r.artistId || r.artist_id || r.spotifyArtistId || r.spotify_artist_id),
      artistName: text(r.artistName || r.artist_name || r.spotifyArtistName || r.name, "Ukjent artist"),
      spotifyArtistId: text(r.spotifyArtistId || r.spotify_artist_id || r.spotifyId),
      historyGoPlaceId: text(r.historyGoPlaceId || r.history_go_place_id || r.placeId || r.place_id),
      candidatePlaceName: text(r.candidatePlaceName || r.placeName || r.place_name),
      relationType: text(r.relationType || r.relation_type, "knyttet_til"),
      confidence: Number(r.confidence ?? 0),
      status: text(r.status, "ukjent"),
      sourceNote: text(r.sourceNote || r.source_note),
      ahaMusicUrl: text(r.ahaMusicUrl || r.aha_music_url || r.url || r.route)
    };
  }

  function normalizeTrackRelation(relation) {
    const r = asObject(relation);
    return {
      trackId: text(r.trackId || r.track_id || r.spotifyTrackId || r.spotify_track_id),
      trackTitle: text(r.trackTitle || r.track_title || r.title || r.name, "Ukjent sang"),
      artistId: text(r.artistId || r.artist_id || r.spotifyArtistId || r.spotify_artist_id),
      artistName: text(r.artistName || r.artist_name, "Ukjent artist"),
      historyGoPlaceId: text(r.historyGoPlaceId || r.history_go_place_id || r.placeId || r.place_id),
      candidatePlaceName: text(r.candidatePlaceName || r.placeName || r.place_name),
      relationType: text(r.relationType || r.relation_type, "knyttet_til"),
      confidence: Number(r.confidence ?? 0),
      status: text(r.status, "ukjent"),
      sourceNote: text(r.sourceNote || r.source_note),
      ahaMusicUrl: text(r.ahaMusicUrl || r.aha_music_url || r.url || r.route)
    };
  }

  function addPlace(index, placeId) {
    if (!index[placeId]) index[placeId] = { artists: [], tracks: [], relationTypes: [], statuses: [], confidenceSummary: { min: null, max: null, average: 0, count: 0 } };
    return index[placeId];
  }

  function summarizeConfidence(bucket) {
    const values = [...bucket.artists, ...bucket.tracks].map((item) => Number(item.confidence)).filter(Number.isFinite);
    bucket.confidenceSummary = {
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
      average: values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3)) : 0,
      count: values.length
    };
  }

  function buildMusicByPlace(data) {
    const index = {};
    const candidates = { artists: [], tracks: [] };
    asArray(data?.artistRelations).map(normalizeArtistRelation).forEach((relation) => {
      if (!relation.historyGoPlaceId) { candidates.artists.push(relation); return; }
      const bucket = addPlace(index, relation.historyGoPlaceId);
      bucket.artists.push(relation);
    });
    asArray(data?.trackRelations).map(normalizeTrackRelation).forEach((relation) => {
      if (!relation.historyGoPlaceId) { candidates.tracks.push(relation); return; }
      const bucket = addPlace(index, relation.historyGoPlaceId);
      bucket.tracks.push(relation);
    });
    Object.values(index).forEach((bucket) => {
      bucket.relationTypes = uniq([...bucket.artists, ...bucket.tracks].map((item) => item.relationType));
      bucket.statuses = uniq([...bucket.artists, ...bucket.tracks].map((item) => item.status));
      summarizeConfidence(bucket);
    });
    return { musicByPlace: index, candidatesWithoutPlaceId: candidates };
  }

  function collectHistoryGoPlaceIds() {
    if (!global.localStorage) return new Set();
    const payload = asObject(safeParse(global.localStorage.getItem("aha_import_payload_v1"), {}));
    const places = [...asArray(safeParse(global.localStorage.getItem("visited_places"), [])), ...asArray(payload.visited_places || payload.visitedPlaces || payload.places)];
    return new Set(places.map((place) => text(place?.placeId || place?.place_id || place?.id)).filter(Boolean));
  }

  function auditBridgeData(data, knownPlaceIds = collectHistoryGoPlaceIds()) {
    const artistRelations = asArray(data?.artistRelations).map(normalizeArtistRelation);
    const trackRelations = asArray(data?.trackRelations).map(normalizeTrackRelation);
    const { musicByPlace } = buildMusicByPlace({ artistRelations, trackRelations });
    const missingPlaceId = [...artistRelations, ...trackRelations].filter((relation) => !relation.historyGoPlaceId).length;
    const known = knownPlaceIds instanceof Set ? knownPlaceIds : new Set(asArray(knownPlaceIds).map(text).filter(Boolean));
    const placeIds = Object.keys(musicByPlace);
    const missingInHistoryGo = known.size ? placeIds.filter((placeId) => !known.has(placeId)).length : 0;
    const topByTracks = placeIds.map((placeId) => ({ placeId, count: musicByPlace[placeId].tracks.length })).sort((a, b) => b.count - a.count).slice(0, 5);
    const topByArtists = placeIds.map((placeId) => ({ placeId, count: musicByPlace[placeId].artists.length })).sort((a, b) => b.count - a.count).slice(0, 5);
    return { artistRelationsRead: artistRelations.length, trackRelationsRead: trackRelations.length, uniquePlaceIdsWithMusic: placeIds.length, relationsMissingPlaceId: missingPlaceId, relationsWithUnknownPlaceId: missingInHistoryGo, topPlacesByTracks: topByTracks, topPlacesByArtists: topByArtists };
  }

  function statusText(status) {
    if (status === "verified") return "Denne koblingen er verifisert.";
    if (status === "auto_matched") return "Denne koblingen er automatisk matchet.";
    if (status === "suggested") return "Denne koblingen er foreslått.";
    if (status === "needs_place_review") return "Denne koblingen trenger stedsgjennomgang.";
    return "Status: " + status;
  }

  function renderPlaceMusic(placeId, bucket) {
    if (!bucket || (!bucket.artists.length && !bucket.tracks.length)) return "";
    return `<section class="aha-historygo-music-card" aria-label="Musikk"><div class="aha-historygo-music-chip">Musikk</div><h3>Knyttet til dette stedet</h3><div class="aha-historygo-content-summary"><span>Artister: ${escapeHtml(bucket.artists.length)}</span><span>Sanger: ${escapeHtml(bucket.tracks.length)}</span><span>Musikk</span></div><h4>Artister knyttet til stedet</h4>${bucket.artists.length ? `<ul>${bucket.artists.map((artist) => `<li><strong>${escapeHtml(artist.artistName)}</strong> · ${escapeHtml(artist.relationType)}<p>Artisten er knyttet til stedet som ${escapeHtml(artist.relationType)}. ${escapeHtml(statusText(artist.status))} Confidence: ${escapeHtml(String(artist.confidence))}.${artist.ahaMusicUrl ? ` <a href="${escapeHtml(artist.ahaMusicUrl)}">Åpne i AHA Music</a>` : ""}</p></li>`).join("")}</ul>` : "<p>Ingen artister registrert.</p>"}<h4>Sanger fra AHA Music</h4>${bucket.tracks.length ? `<ul>${bucket.tracks.map((track) => `<li><strong>${escapeHtml(track.trackTitle)}</strong> · ${escapeHtml(track.artistName)} · ${escapeHtml(track.relationType)}<p>Denne sangen er koblet til ${escapeHtml(placeId)} gjennom artisten ${escapeHtml(track.artistName)}. ${escapeHtml(statusText(track.status))} Confidence: ${escapeHtml(String(track.confidence))}.${track.ahaMusicUrl ? ` <a href="${escapeHtml(track.ahaMusicUrl)}">Åpne i AHA Music</a>` : ""}</p></li>`).join("")}</ul>` : "<p>Ingen sanger registrert.</p>"}</section>`;
  }

  function renderNearbyMusicPlaces(musicByPlace) {
    const entries = Object.entries(asObject(musicByPlace)).filter(([, bucket]) => bucket.artists.length || bucket.tracks.length);
    if (!entries.length) return "<p>Ingen steder i nærheten med musikkkoblinger ennå.</p>";
    return `<ul class="aha-historygo-nearby-music">${entries.map(([placeId, bucket]) => `<li><strong>${escapeHtml(placeId)}</strong><span>${escapeHtml(String(bucket.artists.length))} artister · ${escapeHtml(String(bucket.tracks.length))} sanger</span></li>`).join("")}</ul>`;
  }

  const api = { DEFAULT_PATHS, loadBridgeData, buildMusicByPlace, auditBridgeData, renderPlaceMusic, renderNearbyMusicPlaces, statusText };
  global.AHAMusicHistoryGoDiscovery = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
