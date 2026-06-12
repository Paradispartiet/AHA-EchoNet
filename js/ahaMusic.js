// ahaMusic.js
// AHA Music Spotify import MVP: OAuth PKCE, metadata-only import and local-first normalized storage.

(function (global) {
  "use strict";

  const STORAGE_KEY = "aha_music_library_v1";
  const TOKEN_KEY = "aha_music_spotify_token_v1";
  const PKCE_KEY = "aha_music_spotify_pkce_v1";
  const CLIENT_KEY = "aha_music_spotify_client_id_v1";
  const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize";
  const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
  const SPOTIFY_API_URL = "https://api.spotify.com/v1";
  const SCOPES = ["playlist-read-private", "playlist-read-collaborative", "user-library-read"];

  const emptyLibrary = () => ({
    sources: [],
    playlists: [],
    tracks: [],
    albums: [],
    artists: [],
    trackArtists: [],
    playlistTracks: [],
    imports: []
  });

  let availablePlaylists = [];

  function safeParse(raw, fallback) {
    try {
      const parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch {
      return fallback;
    }
  }

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function text(value, fallback = "") {
    const out = String(value ?? "").trim();
    return out || fallback;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function id(prefix, value) {
    return `${prefix}_${String(value || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function spotifyUrl(entity) {
    return text(entity?.external_urls?.spotify || entity?.spotify_url || "");
  }

  function loadLibrary() {
    const stored = safeParse(localStorage.getItem(STORAGE_KEY), emptyLibrary());
    return {
      ...emptyLibrary(),
      ...stored,
      sources: asArray(stored.sources),
      playlists: asArray(stored.playlists),
      tracks: asArray(stored.tracks),
      albums: asArray(stored.albums),
      artists: asArray(stored.artists),
      trackArtists: asArray(stored.trackArtists),
      playlistTracks: asArray(stored.playlistTracks),
      imports: asArray(stored.imports)
    };
  }

  function saveLibrary(library) {
    const normalized = { ...emptyLibrary(), ...(library || {}) };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    persistRemote(normalized);
    return normalized;
  }

  async function persistRemote(library) {
    if (!global.AHARepository?.saveMusicLibrarySnapshot) return;
    try {
      await global.AHARepository.saveMusicLibrarySnapshot(library);
    } catch (error) {
      console.warn("AHA Music remote persistence skipped", error);
    }
  }

  function upsertByKey(items, item, key) {
    const next = asArray(items).filter((existing) => existing?.[key] !== item?.[key]);
    next.push(item);
    return next;
  }

  function uniqueJoin(items, item, keys) {
    const duplicate = asArray(items).some((existing) => keys.every((key) => existing?.[key] === item?.[key]));
    return duplicate ? items : [...asArray(items), item];
  }

  function normalizeArtist(artist) {
    return {
      id: id("spotify_artist", artist?.id),
      spotify_artist_id: text(artist?.id),
      name: text(artist?.name, "Ukjent artist"),
      spotify_url: spotifyUrl(artist),
      source: "spotify",
      updated_at: nowIso()
    };
  }

  function normalizeAlbum(album) {
    return {
      id: id("spotify_album", album?.id),
      spotify_album_id: text(album?.id),
      name: text(album?.name, "Ukjent album"),
      album_type: text(album?.album_type),
      release_date: text(album?.release_date),
      total_tracks: Number(album?.total_tracks || 0),
      image_url: text(album?.images?.[0]?.url),
      spotify_url: spotifyUrl(album),
      source: "spotify",
      updated_at: nowIso()
    };
  }

  function normalizeTrack(track) {
    const album = normalizeAlbum(track?.album || {});
    return {
      id: id("spotify_track", track?.id),
      spotify_track_id: text(track?.id),
      spotify_album_id: album.spotify_album_id,
      name: text(track?.name, "Ukjent spor"),
      duration_ms: Number(track?.duration_ms || 0),
      explicit: track?.explicit === true,
      popularity: Number(track?.popularity || 0),
      preview_url: text(track?.preview_url),
      spotify_url: spotifyUrl(track),
      album_name: album.name,
      artist_names: asArray(track?.artists).map((artist) => text(artist?.name)).filter(Boolean),
      source: "spotify",
      updated_at: nowIso()
    };
  }

  function normalizePlaylist(playlist) {
    return {
      id: id("spotify_playlist", playlist?.id),
      spotify_playlist_id: text(playlist?.id),
      name: text(playlist?.name, "Ukjent spilleliste"),
      description: text(playlist?.description),
      owner_name: text(playlist?.owner?.display_name || playlist?.owner?.id),
      track_count: Number(playlist?.tracks?.total || 0),
      image_url: text(playlist?.images?.[0]?.url),
      spotify_url: spotifyUrl(playlist),
      source: "spotify",
      updated_at: nowIso()
    };
  }

  function mergeTrack(library, track, playlist, position) {
    if (!track?.id || track?.is_local || (track.type && track.type !== "track")) return library;
    const normalizedTrack = normalizeTrack(track);
    const album = normalizeAlbum(track.album || {});
    library.tracks = upsertByKey(library.tracks, normalizedTrack, "spotify_track_id");
    if (album.spotify_album_id) library.albums = upsertByKey(library.albums, album, "spotify_album_id");

    asArray(track.artists).forEach((artist, artistIndex) => {
      const normalizedArtist = normalizeArtist(artist);
      if (!normalizedArtist.spotify_artist_id) return;
      library.artists = upsertByKey(library.artists, normalizedArtist, "spotify_artist_id");
      library.trackArtists = uniqueJoin(library.trackArtists, {
        id: `${normalizedTrack.id}_${normalizedArtist.id}`,
        spotify_track_id: normalizedTrack.spotify_track_id,
        spotify_artist_id: normalizedArtist.spotify_artist_id,
        artist_order: artistIndex
      }, ["spotify_track_id", "spotify_artist_id"]);
    });

    if (playlist?.spotify_playlist_id) {
      library.playlistTracks = uniqueJoin(library.playlistTracks, {
        id: `${playlist.id}_${normalizedTrack.id}`,
        spotify_playlist_id: playlist.spotify_playlist_id,
        spotify_track_id: normalizedTrack.spotify_track_id,
        position: Number(position || 0),
        added_at: nowIso()
      }, ["spotify_playlist_id", "spotify_track_id"]);
    }
    return library;
  }

  function getRedirectUri() {
    return `${location.origin}${location.pathname}`;
  }

  function getClientId() {
    return text(document.getElementById("spotify-client-id")?.value || localStorage.getItem(CLIENT_KEY) || global.AHA_SPOTIFY_CLIENT_ID || "");
  }

  function base64Url(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  }

  function randomVerifier() {
    const bytes = new Uint8Array(64);
    crypto.getRandomValues(bytes);
    return base64Url(bytes);
  }

  async function sha256(value) {
    const data = new TextEncoder().encode(value);
    return crypto.subtle.digest("SHA-256", data);
  }

  async function connectSpotify(event) {
    event?.preventDefault?.();
    const clientId = getClientId();
    if (!clientId) return setAuthStatus("Legg inn Spotify Client ID først.");
    localStorage.setItem(CLIENT_KEY, clientId);

    const verifier = randomVerifier();
    const challenge = base64Url(await sha256(verifier));
    const state = randomVerifier().slice(0, 32);
    sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state, created_at: nowIso() }));

    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      scope: SCOPES.join(" "),
      redirect_uri: getRedirectUri(),
      code_challenge_method: "S256",
      code_challenge: challenge,
      state
    });
    location.assign(`${SPOTIFY_AUTH_URL}?${params.toString()}`);
  }

  function getToken() {
    const token = safeParse(localStorage.getItem(TOKEN_KEY), null);
    if (!token?.access_token) return null;
    if (Number(token.expires_at || 0) <= Date.now() + 30000) return null;
    return token;
  }

  async function handleSpotifyCallback() {
    const params = new URLSearchParams(location.search);
    const code = params.get("code");
    const state = params.get("state");
    const error = params.get("error");
    if (error) setAuthStatus(`Spotify avbrøt innlogging: ${error}`);
    if (!code) return;

    const pkce = safeParse(sessionStorage.getItem(PKCE_KEY), null);
    if (!pkce?.verifier || pkce.state !== state) return setAuthStatus("Spotify state-validering feilet. Prøv å koble til på nytt.");

    const body = new URLSearchParams({
      client_id: getClientId(),
      grant_type: "authorization_code",
      code,
      redirect_uri: getRedirectUri(),
      code_verifier: pkce.verifier
    });

    setAuthStatus("Fullfører Spotify-tilkobling …");
    const response = await fetch(SPOTIFY_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    if (!response.ok) throw new Error(`Spotify token exchange failed: ${response.status}`);
    const token = await response.json();
    localStorage.setItem(TOKEN_KEY, JSON.stringify({
      ...token,
      expires_at: Date.now() + Number(token.expires_in || 3600) * 1000,
      scopes: SCOPES
    }));
    sessionStorage.removeItem(PKCE_KEY);
    history.replaceState({}, document.title, location.pathname);
    setAuthStatus("Spotify er koblet til. Du kan hente spillelister.");
  }

  async function spotifyFetch(path) {
    const token = getToken();
    if (!token) throw new Error("Spotify er ikke koblet til eller token er utløpt.");
    const response = await fetch(path.startsWith("http") ? path : `${SPOTIFY_API_URL}${path}`, {
      headers: { Authorization: `Bearer ${token.access_token}` }
    });
    if (!response.ok) throw new Error(`Spotify API-feil ${response.status}`);
    return response.json();
  }

  async function fetchPaged(path) {
    const rows = [];
    let next = path;
    while (next) {
      const page = await spotifyFetch(next);
      rows.push(...asArray(page.items));
      next = page.next || "";
    }
    return rows;
  }

  async function loadSpotifyPlaylists() {
    setImportStatus("Henter spillelister fra Spotify …");
    availablePlaylists = await fetchPaged("/me/playlists?limit=50");
    renderPlaylists();
    setImportStatus(`Fant ${availablePlaylists.length} spillelister.`);
  }

  async function importSelected() {
    const selectedIds = [...document.querySelectorAll("[data-spotify-playlist]:checked")].map((input) => input.value);
    const includeSaved = document.getElementById("include-saved-tracks")?.checked !== false;
    if (!selectedIds.length && !includeSaved) return setImportStatus("Velg minst én spilleliste eller lagrede sanger.");

    const startedAt = nowIso();
    let library = loadLibrary();
    library.sources = upsertByKey(library.sources, {
      id: "spotify",
      name: "Spotify",
      type: "spotify",
      scopes: SCOPES,
      metadata_only: true,
      updated_at: startedAt
    }, "id");

    let importedPlaylistCount = 0;
    for (const playlist of availablePlaylists.filter((item) => selectedIds.includes(item.id))) {
      const normalizedPlaylist = normalizePlaylist(playlist);
      library.playlists = upsertByKey(library.playlists, normalizedPlaylist, "spotify_playlist_id");
      setImportStatus(`Importerer ${normalizedPlaylist.name} …`);
      const items = await fetchPaged(`/playlists/${encodeURIComponent(playlist.id)}/items?limit=100&additional_types=track`);
      items.forEach((item, index) => { library = mergeTrack(library, item.track, normalizedPlaylist, index); });
      importedPlaylistCount += 1;
    }

    if (includeSaved) {
      const savedPlaylist = {
        id: "spotify_saved_tracks",
        spotify_playlist_id: "spotify_saved_tracks",
        name: "Lagrede sanger",
        description: "Spotify-bibliotekets lagrede sanger fra GET /me/tracks",
        owner_name: "Spotify",
        track_count: 0,
        spotify_url: "https://open.spotify.com/collection/tracks",
        source: "spotify",
        updated_at: nowIso()
      };
      library.playlists = upsertByKey(library.playlists, savedPlaylist, "spotify_playlist_id");
      setImportStatus("Importerer lagrede sanger …");
      const savedItems = await fetchPaged("/me/tracks?limit=50");
      savedItems.forEach((item, index) => { library = mergeTrack(library, item.track, savedPlaylist, index); });
    }

    const completedAt = nowIso();
    library.imports.push({
      id: `spotify_import_${Date.now()}`,
      source_id: "spotify",
      playlist_count: importedPlaylistCount,
      include_saved_tracks: includeSaved,
      track_count: library.tracks.length,
      started_at: startedAt,
      completed_at: completedAt
    });
    saveLibrary(library);
    renderLibrary();
    setImportStatus(`Import fullført: ${library.tracks.length} unike spor lagret som metadata.`);
  }


  function normalizeSearch(value) {
    return text(value).toLocaleLowerCase("no");
  }

  function formatDuration(ms) {
    const totalSeconds = Math.max(0, Math.round(Number(ms || 0) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  }

  function releaseYear(value) {
    const match = text(value).match(/^\d{4}/);
    return match ? match[0] : "";
  }

  function formatDate(value) {
    return text(value, "Ukjent dato");
  }

  function formatSyncedAt(value) {
    const stamp = text(value);
    if (!stamp) return "Ukjent synk";
    const date = new Date(stamp);
    if (Number.isNaN(date.getTime())) return stamp;
    return new Intl.DateTimeFormat("no", { dateStyle: "medium", timeStyle: "short" }).format(date);
  }

  function spotifyLink(url, label = "Åpne i Spotify") {
    return url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>` : "";
  }

  function imageMarkup(url, alt, fallback = "♫") {
    return url
      ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="lazy" />`
      : `<span aria-hidden="true">${escapeHtml(fallback)}</span>`;
  }

  function emptyState(type, title, message) {
    return global.AHAModules?.buildModuleEmptyState?.({ type, moduleId: "music", title, message })
      || `<article class="aha-module-empty"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(message)}</p></article>`;
  }

  function buildLibraryIndex(library) {
    const playlistsById = new Map(asArray(library.playlists).map((playlist) => [playlist.spotify_playlist_id, playlist]));
    const albumsById = new Map(asArray(library.albums).map((album) => [album.spotify_album_id, album]));
    const artistsById = new Map(asArray(library.artists).map((artist) => [artist.spotify_artist_id, artist]));
    const trackArtists = new Map();
    asArray(library.trackArtists).forEach((link) => {
      const current = trackArtists.get(link.spotify_track_id) || [];
      current.push(link);
      trackArtists.set(link.spotify_track_id, current);
    });
    const playlistTracks = new Map();
    const trackPlaylists = new Map();
    asArray(library.playlistTracks).forEach((link) => {
      const playlistList = playlistTracks.get(link.spotify_playlist_id) || [];
      playlistList.push(link);
      playlistTracks.set(link.spotify_playlist_id, playlistList);
      const trackList = trackPlaylists.get(link.spotify_track_id) || [];
      trackList.push(link);
      trackPlaylists.set(link.spotify_track_id, trackList);
    });
    return { playlistsById, albumsById, artistsById, trackArtists, playlistTracks, trackPlaylists };
  }

  function getTrackArtists(track, index) {
    const links = asArray(index.trackArtists.get(track.spotify_track_id)).sort((a, b) => Number(a.artist_order || 0) - Number(b.artist_order || 0));
    const artists = links.map((link) => index.artistsById.get(link.spotify_artist_id)).filter(Boolean);
    if (artists.length) return artists;
    return asArray(track.artist_names).map((name) => ({ name, spotify_artist_id: name }));
  }

  function getTrackPlaylists(track, index) {
    return asArray(index.trackPlaylists.get(track.spotify_track_id))
      .sort((a, b) => Number(a.position || 0) - Number(b.position || 0))
      .map((link) => index.playlistsById.get(link.spotify_playlist_id))
      .filter(Boolean);
  }

  function trackMatchesFilters(track, state, index) {
    const album = index.albumsById.get(track.spotify_album_id) || {};
    const artists = getTrackArtists(track, index);
    const playlists = getTrackPlaylists(track, index);
    const haystack = normalizeSearch([
      track.name,
      track.album_name,
      album.name,
      asArray(track.artist_names).join(" "),
      artists.map((artist) => artist.name).join(" "),
      playlists.map((playlist) => playlist.name).join(" ")
    ].join(" "));
    if (state.query && !haystack.includes(state.query)) return false;
    if (state.playlist && !playlists.some((playlist) => playlist.spotify_playlist_id === state.playlist)) return false;
    if (state.artist && !artists.some((artist) => artist.spotify_artist_id === state.artist || artist.name === state.artist)) return false;
    if (state.album && track.spotify_album_id !== state.album) return false;
    if (state.year && releaseYear(album.release_date) !== state.year) return false;
    return true;
  }

  function currentLibraryState() {
    return {
      query: normalizeSearch(document.getElementById("music-search")?.value),
      playlist: text(document.getElementById("music-filter-playlist")?.value),
      artist: text(document.getElementById("music-filter-artist")?.value),
      album: text(document.getElementById("music-filter-album")?.value),
      year: text(document.getElementById("music-filter-year")?.value)
    };
  }

  function selectOptions(items, valueKey, labelKey, placeholder, selected = "") {
    const sorted = [...asArray(items)].sort((a, b) => text(a[labelKey]).localeCompare(text(b[labelKey]), "no"));
    return `<option value="">${escapeHtml(placeholder)}</option>` + sorted.map((item) => {
      const value = text(item[valueKey]);
      return `<option value="${escapeHtml(value)}"${value === selected ? " selected" : ""}>${escapeHtml(item[labelKey])}</option>`;
    }).join("");
  }

  function fillFilters(library, state) {
    const years = [...new Set(asArray(library.albums).map((album) => releaseYear(album.release_date)).filter(Boolean))]
      .sort((a, b) => b.localeCompare(a));
    const playlistSelect = document.getElementById("music-filter-playlist");
    const artistSelect = document.getElementById("music-filter-artist");
    const albumSelect = document.getElementById("music-filter-album");
    const yearSelect = document.getElementById("music-filter-year");
    if (playlistSelect) playlistSelect.innerHTML = selectOptions(library.playlists, "spotify_playlist_id", "name", "Alle spillelister", state.playlist);
    if (artistSelect) artistSelect.innerHTML = selectOptions(library.artists, "spotify_artist_id", "name", "Alle artister", state.artist);
    if (albumSelect) albumSelect.innerHTML = selectOptions(library.albums, "spotify_album_id", "name", "Alle album", state.album);
    if (yearSelect) yearSelect.innerHTML = `<option value="">Alle år</option>` + years.map((year) => `<option value="${escapeHtml(year)}"${year === state.year ? " selected" : ""}>${escapeHtml(year)}</option>`).join("");
  }

  function renderTrackCard(track, index) {
    const album = index.albumsById.get(track.spotify_album_id) || { name: track.album_name };
    const artists = getTrackArtists(track, index);
    const playlists = getTrackPlaylists(track, index);
    return `<article class="aha-music-track">
      <div class="aha-music-cover aha-music-cover-small">${imageMarkup(album.image_url, album.name || track.name)}</div>
      <div>
        <h4>${escapeHtml(track.name)}</h4>
        <div class="aha-music-meta">
          <span>${escapeHtml(artists.map((artist) => artist.name).join(", ") || "Ukjent artist")}</span>
          <span>${escapeHtml(album.name || track.album_name || "Ukjent album")}</span>
          <span>${escapeHtml(formatDuration(track.duration_ms))}</span>
        </div>
        <div class="aha-music-chips">${playlists.length ? playlists.map((playlist) => `<span>${escapeHtml(playlist.name)}</span>`).join("") : "<span>Ingen spillelistekobling</span>"}</div>
      </div>
      <div class="aha-music-links">${spotifyLink(track.spotify_url)}</div>
    </article>`;
  }

  function renderTracks(library, filteredTracks, index) {
    const mount = document.getElementById("imported-tracks");
    if (!mount) return;
    if (!filteredTracks.length) {
      mount.innerHTML = library.tracks.length
        ? emptyState("no_match", "Ingen treff i søk", "Prøv et annet søk eller fjern ett av filtrene.")
        : emptyState("no_data", "Ingen importerte sanger ennå", "Importer Spotify-spillelister for å bygge AHA Music-biblioteket.");
      return;
    }
    mount.innerHTML = filteredTracks
      .sort((a, b) => text(a.name).localeCompare(text(b.name), "no"))
      .map((track) => renderTrackCard(track, index))
      .join("");
  }

  function renderPlaylistView(library, filteredTracks, index) {
    const mount = document.getElementById("music-playlists-library");
    if (!mount) return;
    const filteredIds = new Set(filteredTracks.map((track) => track.spotify_track_id));
    const state = currentLibraryState();
    const playlists = asArray(library.playlists).filter((playlist) => {
      const links = asArray(index.playlistTracks.get(playlist.spotify_playlist_id));
      const haystack = normalizeSearch(playlist.name);
      return (!state.query || haystack.includes(state.query) || links.some((link) => filteredIds.has(link.spotify_track_id)))
        && (!state.playlist || playlist.spotify_playlist_id === state.playlist);
    });
    if (!playlists.length) {
      mount.innerHTML = library.playlists.length
        ? emptyState("no_match", "Ingen treff i søk", "Ingen importerte spillelister matcher søket eller filtrene.")
        : emptyState("no_data", "Ingen spillelister importert", "Importer en Spotify-spilleliste for å se den her.");
      return;
    }
    mount.innerHTML = playlists.sort((a, b) => text(a.name).localeCompare(text(b.name), "no")).map((playlist) => {
      const links = asArray(index.playlistTracks.get(playlist.spotify_playlist_id)).sort((a, b) => Number(a.position || 0) - Number(b.position || 0));
      const rows = links.map((link) => asArray(library.tracks).find((track) => track.spotify_track_id === link.spotify_track_id)).filter(Boolean);
      return `<article class="aha-music-card aha-music-playlist-card">
        <div class="aha-music-card-head">
          <div class="aha-music-cover">${imageMarkup(playlist.image_url, playlist.name, "♪")}</div>
          <div>
            <h4>${escapeHtml(playlist.name)}</h4>
            <p>${escapeHtml(Number(playlist.track_count || rows.length))} spor · sist synkronisert ${escapeHtml(formatSyncedAt(playlist.updated_at))}</p>
            <div class="aha-music-links">${spotifyLink(playlist.spotify_url)}</div>
          </div>
        </div>
        <ol class="aha-music-ordered-tracks">${rows.map((track) => `<li><span>${escapeHtml(track.name)}</span><small>${escapeHtml(asArray(track.artist_names).join(", ") || "Ukjent artist")}</small></li>`).join("")}</ol>
      </article>`;
    }).join("");
  }

  function renderArtists(library, filteredTracks, index) {
    const mount = document.getElementById("music-artists-library");
    if (!mount) return;
    const state = currentLibraryState();
    const filteredTrackIds = new Set(filteredTracks.map((track) => track.spotify_track_id));
    const artists = asArray(library.artists).map((artist) => {
      const links = asArray(library.trackArtists).filter((link) => link.spotify_artist_id === artist.spotify_artist_id && filteredTrackIds.has(link.spotify_track_id));
      const tracks = links.map((link) => asArray(library.tracks).find((track) => track.spotify_track_id === link.spotify_track_id)).filter(Boolean);
      const albums = [...new Map(tracks.map((track) => [track.spotify_album_id, index.albumsById.get(track.spotify_album_id)]).filter((entry) => entry[1])).values()];
      const playlists = [...new Map(tracks.flatMap((track) => getTrackPlaylists(track, index)).map((playlist) => [playlist.spotify_playlist_id, playlist])).values()];
      return { artist, tracks, albums, playlists };
    }).filter((item) => item.tracks.length || (!state.query && !state.playlist && !state.album && !state.year && (!state.artist || item.artist.spotify_artist_id === state.artist)));
    if (!artists.length) {
      mount.innerHTML = emptyState("no_match", "Ingen treff i søk", "Ingen artister matcher søket eller filtrene.");
      return;
    }
    mount.innerHTML = artists.sort((a, b) => text(a.artist.name).localeCompare(text(b.artist.name), "no")).map(({ artist, tracks, albums, playlists }) => `<article class="aha-music-card">
      <div class="aha-music-card-head">
        <div class="aha-music-cover aha-music-artist-cover">${imageMarkup(artist.image_url, artist.name, "♬")}</div>
        <div>
          <h4>${escapeHtml(artist.name)}</h4>
          <p>${tracks.length} importerte sanger</p>
          <div class="aha-music-links">${spotifyLink(artist.spotify_url)}</div>
        </div>
      </div>
      <p><strong>Album:</strong> ${escapeHtml(albums.map((album) => album.name).join(", ") || "Ingen albumkobling")}</p>
      <p><strong>Spillelister:</strong> ${escapeHtml(playlists.map((playlist) => playlist.name).join(", ") || "Ingen spillelistekobling")}</p>
    </article>`).join("");
  }

  function renderAlbums(library, filteredTracks, index) {
    const mount = document.getElementById("music-albums-library");
    if (!mount) return;
    const filteredTrackIds = new Set(filteredTracks.map((track) => track.spotify_track_id));
    const albums = asArray(library.albums).map((album) => {
      const tracks = asArray(library.tracks).filter((track) => track.spotify_album_id === album.spotify_album_id && filteredTrackIds.has(track.spotify_track_id));
      const artistNames = [...new Set(tracks.flatMap((track) => asArray(track.artist_names)))];
      return { album, tracks, artistNames };
    }).filter((item) => item.tracks.length);
    if (!albums.length) {
      mount.innerHTML = emptyState("no_match", "Ingen treff i søk", "Ingen album matcher søket eller filtrene.");
      return;
    }
    mount.innerHTML = albums.sort((a, b) => text(a.album.name).localeCompare(text(b.album.name), "no")).map(({ album, tracks, artistNames }) => `<article class="aha-music-card">
      <div class="aha-music-card-head">
        <div class="aha-music-cover">${imageMarkup(album.image_url, album.name, "▣")}</div>
        <div>
          <h4>${escapeHtml(album.name)}</h4>
          <p>${escapeHtml(artistNames.join(", ") || "Ukjent artist")}</p>
          <p>${escapeHtml(formatDate(album.release_date))} · ${tracks.length} importerte sanger</p>
          <div class="aha-music-links">${spotifyLink(album.spotify_url)}</div>
        </div>
      </div>
    </article>`).join("");
  }

  function setAuthStatus(message) {
    const el = document.getElementById("spotify-auth-status");
    if (el) el.textContent = message;
  }

  function setImportStatus(message) {
    const el = document.getElementById("spotify-import-status");
    if (el) el.textContent = message;
  }

  function renderPlaylists() {
    const mount = document.getElementById("spotify-playlists");
    if (!mount) return;
    if (!availablePlaylists.length) {
      mount.innerHTML = global.AHAModules?.buildModuleEmptyState?.({ type: "no_data", moduleId: "music", title: "Ingen Spotify-spillelister hentet", message: "Koble til Spotify og hent spillelister for å importere." }) || "";
      return;
    }
    mount.innerHTML = availablePlaylists.map((playlist) => `
      <article class="aha-music-playlist">
        <input data-spotify-playlist type="checkbox" value="${escapeHtml(playlist.id)}" aria-label="Velg ${escapeHtml(playlist.name)}" />
        <div>
          <h3>${escapeHtml(playlist.name)}</h3>
          <div class="aha-music-meta"><span>${Number(playlist.tracks?.total || 0)} spor</span><span>${escapeHtml(playlist.owner?.display_name || playlist.owner?.id || "Spotify")}</span></div>
        </div>
        ${spotifyUrl(playlist) ? `<a href="${escapeHtml(spotifyUrl(playlist))}" target="_blank" rel="noopener">Åpne i Spotify</a>` : ""}
      </article>
    `).join("");
  }

  function renderLibrary() {
    const library = loadLibrary();
    const state = currentLibraryState();
    const index = buildLibraryIndex(library);
    global.AHAModules?.updatePageHealth?.("music", global.AHAModules.localPageHealth({ count: library.tracks.length, datasetExists: true }));
    renderStats(library);
    fillFilters(library, state);

    const emptyMount = document.getElementById("music-empty-state");
    if (emptyMount) {
      if (!library.sources.length && !library.tracks.length && !library.playlists.length) {
        emptyMount.innerHTML = emptyState("not_connected", "Ingen Spotify-konto koblet til", "Koble til Spotify og importer spillelister for å bygge AHA Music-biblioteket.");
      } else if (!library.playlists.length && !library.tracks.length) {
        emptyMount.innerHTML = emptyState("no_data", "Ingen spillelister importert", "Importer Spotify-spillelister for å fylle biblioteket.");
      } else {
        emptyMount.innerHTML = "";
      }
    }

    const filteredTracks = asArray(library.tracks).filter((track) => trackMatchesFilters(track, state, index));
    renderTracks(library, filteredTracks, index);
    renderPlaylistView(library, filteredTracks, index);
    renderArtists(library, filteredTracks, index);
    renderAlbums(library, filteredTracks, index);
  }

  function renderStats(library) {
    const mount = document.getElementById("music-stats");
    if (!mount) return;
    const stats = [
      ["Spor", library.tracks.length],
      ["Spillelister", library.playlists.length],
      ["Album", library.albums.length],
      ["Artister", library.artists.length]
    ];
    mount.innerHTML = stats.map(([label, value]) => `<article class="aha-music-stat"><strong>${value}</strong><span>${label}</span></article>`).join("");
  }

  function bind() {
    const clientInput = document.getElementById("spotify-client-id");
    if (clientInput) clientInput.value = getClientId();
    document.getElementById("spotify-config-form")?.addEventListener("submit", connectSpotify);
    document.getElementById("load-playlists-button")?.addEventListener("click", () => loadSpotifyPlaylists().catch((error) => setImportStatus(error.message)));
    document.getElementById("import-playlists-button")?.addEventListener("click", () => importSelected().catch((error) => setImportStatus(error.message)));
    document.getElementById("clear-local-music-button")?.addEventListener("click", () => {
      localStorage.removeItem(STORAGE_KEY);
      renderLibrary();
      setImportStatus("Lokal musikkcache er tømt.");
    });
    document.getElementById("music-library-controls")?.addEventListener("input", renderLibrary);
    document.getElementById("music-library-controls")?.addEventListener("change", renderLibrary);
    document.querySelectorAll("[data-music-tab]").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll("[data-music-tab]").forEach((item) => item.classList.toggle("is-active", item === button));
        document.querySelectorAll(".aha-music-section").forEach((section) => section.classList.toggle("is-active", section.id === `music-${button.dataset.musicTab}-view`));
      });
    });
  }

  async function hydrateRemoteLibrary() {
    if (!global.AHARepository?.loadMusicLibrarySnapshot) return;
    const local = loadLibrary();
    if (local.tracks.length || local.playlists.length) return;
    const result = await global.AHARepository.loadMusicLibrarySnapshot();
    if (result?.ok && (result.library?.tracks?.length || result.library?.playlists?.length)) saveLibrary(result.library);
  }

  async function init() {
    bind();
    renderPlaylists();
    await hydrateRemoteLibrary();
    renderLibrary();
    const token = getToken();
    setAuthStatus(token ? "Spotify er koblet til." : "Ikke koblet til Spotify.");
    try {
      await handleSpotifyCallback();
    } catch (error) {
      setAuthStatus(error.message);
    }
  }

  global.AHAMusic = {
    SCOPES,
    STORAGE_KEY,
    loadLibrary,
    saveLibrary,
    normalizePlaylist,
    normalizeTrack,
    normalizeAlbum,
    normalizeArtist,
    mergeTrack,
    buildLibraryIndex,
    formatDuration
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(window);
