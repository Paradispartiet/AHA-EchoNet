// Kunstrommet V1: personal local-only sketchbook with explicit text-only AHA ingest.
(function (global) {
  "use strict";

  const DB_NAME = "aha_kunstrommet_v1";
  const STORE = "projects";
  const WIDTH = 1200;
  const HEIGHT = 800;
  const MAX_STROKES = 3000;
  const MAX_POINTS = 2400;
  const $ = (id) => document.getElementById(id);
  const canvas = $("kunstrommet-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let dbPromise;
  let current = null;
  let dirty = false;
  let activeStroke = null;
  let activePointerId = null;
  let future = [];
  let tool = "pen";

  function scope() {
    // A local profile partition, not a server-enforced authorization boundary.
    try { return String(global.localStorage.getItem("aha_profile_id") || "local").slice(0, 120); }
    catch { return "local"; }
  }

  function uid() {
    return global.crypto?.randomUUID?.() || "art_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10);
  }

  function openDb() {
    if (!global.indexedDB) return Promise.reject(new Error("IndexedDB er ikke tilgjengelig i denne nettleseren."));
    if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
      const request = global.indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Kunne ikke åpne lokal lagring."));
    }).catch((error) => { dbPromise = null; throw error; });
    return dbPromise;
  }

  async function records() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
      request.onsuccess = () => resolve(request.result.filter((item) => item.owner === scope()));
      request.onerror = () => reject(request.error || new Error("Kunne ikke hente skisser."));
    });
  }

  async function put(record) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve(record);
      tx.onerror = () => reject(tx.error || new Error("Lagring mislyktes."));
      tx.onabort = () => reject(tx.error || new Error("Lagring ble avbrutt."));
    });
  }

  async function erase(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error("Sletting mislyktes."));
    });
  }

  function newRecord() {
    const now = new Date().toISOString();
    return { id: uid(), owner: scope(), title: "", note: "", strokes: [], created_at: now, updated_at: now,
      local_only: true, shared: false, analyzed_image: false };
  }

  function status(message) { $("kunstrommet-save-state").textContent = message; }
  function ahaStatus(message) { $("kunstrommet-aha-state").textContent = message; }
  function markDirty() { dirty = true; status("Ikke lagret"); }

  function pointOf(event) {
    const box = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(WIDTH, (event.clientX - box.left) * WIDTH / box.width)),
      y: Math.max(0, Math.min(HEIGHT, (event.clientY - box.top) * HEIGHT / box.height))
    };
  }

  function drawStroke(stroke, target = ctx) {
    const points = stroke.points;
    if (!Array.isArray(points) || !points.length) return;
    target.strokeStyle = stroke.color;
    target.fillStyle = stroke.color;
    target.lineWidth = stroke.size;
    target.lineCap = "round";
    target.lineJoin = "round";
    if (points.length === 1) {
      target.beginPath();
      target.arc(points[0].x, points[0].y, stroke.size / 2, 0, Math.PI * 2);
      target.fill();
      return;
    }
    target.beginPath();
    target.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((p) => target.lineTo(p.x, p.y));
    target.stroke();
  }

  function redraw() {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    (current?.strokes || []).forEach((stroke) => drawStroke(stroke));
    if (activeStroke) drawStroke(activeStroke);
  }

  function setTool(next) {
    tool = next;
    $("kunstrommet-pen").setAttribute("aria-pressed", String(next === "pen"));
    $("kunstrommet-eraser").setAttribute("aria-pressed", String(next === "eraser"));
  }

  function start(event) {
    if (!current || activeStroke || (event.pointerType === "mouse" && event.button !== 0)) return;
    if (current.strokes.length >= MAX_STROKES) { status("Grense nådd. Eksporter eller start en ny skisse."); return; }
    event.preventDefault();
    const point = pointOf(event);
    activeStroke = {
      color: tool === "eraser" ? "#ffffff" : $("kunstrommet-color").value,
      size: tool === "eraser" ? Math.max(16, Number($("kunstrommet-size").value) * 2) : Number($("kunstrommet-size").value),
      points: [point]
    };
    activePointerId = event.pointerId;
    try { canvas.setPointerCapture(event.pointerId); } catch {}
    drawStroke(activeStroke);
  }

  function move(event) {
    if (!activeStroke || (event.pointerId !== undefined && event.pointerId !== activePointerId)) return;
    event.preventDefault();
    const point = pointOf(event);
    const prior = activeStroke.points[activeStroke.points.length - 1];
    if (Math.hypot(point.x - prior.x, point.y - prior.y) < 2 || activeStroke.points.length >= MAX_POINTS) return;
    activeStroke.points.push(point);
    // Paint the new segment only. Replaying the entire drawing on every pointermove
    // grows quadratically for long strokes and becomes sluggish on mobile Safari.
    drawStroke({ color: activeStroke.color, size: activeStroke.size, points: [prior, point] });
  }

  function end(event = {}) {
    if (!activeStroke || (event.pointerId !== undefined && event.pointerId !== activePointerId)) return;
    current.strokes.push(activeStroke);
    activeStroke = null;
    activePointerId = null;
    future = [];
    markDirty();
    redraw();
  }

  function renderGalleryInspiration() {
    const mount = $("kunstrommet-gallery-inspiration");
    if (!mount) return;
    mount.replaceChildren();
    // Reuse Aha Gallery's canonical local collection. This is not a second gallery
    // or another store of media assets, and no image URLs are fetched here.
    const items = (global.AHAGallery?.load?.() || [])
      .filter((item) => item && !item.deleted_at && !item.deletedAt && item.archived !== true)
      .slice(0, 8);
    if (!items.length) {
      const empty = document.createElement("p");
      empty.textContent = "Ingen referanser i Galleriet ennå. Legg til inspirasjon i Aha Galleri.";
      mount.appendChild(empty);
      return;
    }
    items.forEach((item) => {
      const card = document.createElement("article");
      card.className = "kunstrommet-inspiration-item";
      const title = document.createElement("strong");
      title.textContent = String(item.title || "Uten tittel").slice(0, 120);
      const desc = document.createElement("p");
      desc.textContent = String(item.description || "").slice(0, 240);
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Bruk som inspirasjon";
      button.addEventListener("click", () => {
        // Text is copied only at an explicit user click. The source remains
        // unchanged in AHA Gallery; no pixels, paths or media URLs are copied.
        const titleText = String(item.title || "Uten tittel").trim().slice(0, 120);
        const description = String(item.description || "").trim().slice(0, 500);
        const addition = ["Inspirasjon fra Aha Galleri: " + titleText, description]
          .filter(Boolean).join("\n");
        const note = $("kunstrommet-note");
        const combined = [note.value.trim(), addition].filter(Boolean).join("\n\n");
        if (combined.length > 4000) {
          status("Notatet er for langt til å legge til inspirasjonen.");
          return;
        }
        note.value = combined;
        markDirty();
        note.focus();
      });
      card.append(title);
      if (desc.textContent) card.append(desc);
      card.append(button);
      mount.appendChild(card);
    });
  }

  function linkStatus(message) {
    const target = $("kunstrommet-link-state");
    if (target) target.textContent = message;
  }

  function renderCollectionOptions() {
    const select = $("kunstrommet-collection-select");
    if (!select) return;
    const previous = select.value;
    select.replaceChildren();
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Velg samling";
    select.appendChild(placeholder);
    const lists = global.AHALists?.loadLists?.() || [];
    lists.filter((list) => !list.deletedAt && !list.deleted_at && list.archived !== true).forEach((list) => {
      const option = document.createElement("option");
      option.value = list.id;
      option.textContent = list.title || "Uten tittel";
      select.appendChild(option);
    });
    if (lists.some((list) => list.id === previous && !list.deletedAt && !list.deleted_at)) select.value = previous;
    if (!lists.length) linkStatus("Du har ingen samlinger ennå. Opprett en under Samlinger i Aha.");
  }

  async function addCurrentToCollection() {
    if (!current) return;
    if (dirty) { linkStatus("Lagre skissen før du legger den i en Aha-samling."); return; }
    if (global.AHA_CONFIG?.lists?.enableDatabaseSync === true) {
      linkStatus("Samlingen har aktiv databasesynkronisering. Lokal tilkobling er blokkert for å beskytte kunstverket.");
      return;
    }
    const collectionId = $("kunstrommet-collection-select")?.value || "";
    if (!collectionId) { linkStatus("Velg en samling først."); return; }
    const adapter = global.AHAKunstrommetReferences;
    const lists = global.AHALists;
    if (!adapter || !lists?.addItemToList) {
      linkStatus("Ahas lokale samlinger er ikke tilgjengelige akkurat nå."); return;
    }
    try {
      const saved = (await records()).find((item) => item.id === current.id && item.owner === scope());
      if (!saved) { linkStatus("Skissen må lagres på denne enheten før den kan knyttes til Aha."); return; }
      // Explicit opt-in creates a title+ID pointer, never pixel data, notes or strokes.
      const previous = adapter.load().some((item) => item.id === saved.id);
      adapter.upsert(saved);
      let result;
      try {
        result = lists.addItemToList(collectionId, {
          title: saved.title || "Uten tittel",
          source: "aha_kunstrommet",
          type: "artwork",
          refId: saved.id,
          meta: { local_only: true, referenced_artwork: true }
        });
      } catch (error) {
        if (!previous) adapter.remove(saved.id);
        throw error;
      }
      if (!result?.ok && result?.reason !== "duplicate") {
        if (!previous) adapter.remove(saved.id);
        linkStatus("Kunne ikke koble skissen: " + (result?.detail || result?.reason || "ukjent feil"));
        return;
      }
      linkStatus(result?.reason === "duplicate"
        ? "Kunstverket finnes allerede i denne samlingen."
        : "Kunstverket er knyttet til samlingen. Du finner det også i Ahas tankekart.");
    } catch (error) {
      linkStatus("Kobling mislyktes: " + error.message);
    }
  }

  function removeArtworkCollectionLinks(artworkId) {
    if (global.AHA_CONFIG?.lists?.enableDatabaseSync === true) {
      throw new Error("Databasesynkronisering er aktiv. Kan ikke endre samlingskoblinger uten kontroll.");
    }
    const refs = global.AHAKunstrommetReferences;
    if (!refs?.unlinkArtwork || !refs?.remove) throw new Error("Lokale kunstverkreferanser er utilgjengelige.");
    // Artwork links live in a separate owner-scoped overlay, not aha_lists_v1.
    const removed = refs.unlinkArtwork(artworkId);
    refs.remove(artworkId);
    return removed;
  }

  function unlinkCurrentArtwork() {
    if (!current) return;
    if (!global.confirm("Fjerne kunstverket fra alle lokale Aha-samlinger? Selve skissen beholdes. Tekst som tidligere er sendt til Aha, påvirkes ikke.")) return;
    try {
      const removed = removeArtworkCollectionLinks(current.id);
      linkStatus(removed
        ? "Fjernet " + removed + " samlingskobling" + (removed === 1 ? "" : "er") + ". Kunstverket beholdes privat i Kunstrommet."
        : "Ingen samlingskoblinger å fjerne.");
    } catch (error) { linkStatus("Kunne ikke fjerne koblingene: " + error.message); }
  }

  async function openLinkedArtwork() {
    const hash = global.location?.hash || "";
    if (!hash.startsWith("#art-")) return;
    let id;
    try { id = decodeURIComponent(hash.slice(5)); }
    catch { linkStatus("Ugyldig lenke til kunstverk."); return; }
    if (!id || id.length > 128) { linkStatus("Ugyldig kunstverkreferanse."); return; }
    try {
      const saved = (await records()).find((item) => item.id === id && item.owner === scope());
      if (saved) { load(saved); await refreshList(); }
      else linkStatus("Kunstverket finnes ikke på denne enheten eller i denne lokale profilen.");
    } catch (error) { linkStatus("Kunne ikke åpne kunstverket: " + error.message); }
  }

  function getSnapshot() {
    return {
      ...current,
      title: $("kunstrommet-title").value.trim().slice(0, 120),
      note: $("kunstrommet-note").value.trim().slice(0, 4000),
      updated_at: new Date().toISOString()
    };
  }

  async function save() {
    if (!current) return;
    current = getSnapshot();
    await put(current);
    dirty = false;
    // Refresh only an existing opt-in pointer; saving alone creates no new AHA reference.
    if (global.AHAKunstrommetReferences?.load?.().some((item) => item.id === current.id)) {
      try { global.AHAKunstrommetReferences.upsert(current); }
      catch (error) { linkStatus("Skissen ble lagret, men Aha-referansen kunne ikke oppdateres: " + error.message); }
    }
    status("Lagret på denne enheten");
    await refreshList();
  }

  function confirmDiscard() {
    return !dirty || global.confirm("Denne skissen har ulagrede endringer. Vil du forkaste dem?");
  }

  function load(record) {
    current = { ...record, strokes: structuredCloneSafe(record.strokes || []) };
    future = [];
    activeStroke = null;
    activePointerId = null;
    dirty = false;
    $("kunstrommet-title").value = current.title || "";
    $("kunstrommet-note").value = current.note || "";
    status("Lagret på denne enheten");
    ahaStatus(current.last_ingested_at
      ? "Tekst ble sist sendt til Aha " + new Date(current.last_ingested_at).toLocaleDateString("no-NO") + "."
      : "Ingenting sendes uten at du trykker på knappen.");
    redraw();
  }

  function structuredCloneSafe(value) { return JSON.parse(JSON.stringify(value)); }

  function create() {
    if (!confirmDiscard()) return;
    load(newRecord());
    status("Ny skisse – ikke lagret");
  }

  function makePreview(item) {
    // A temporary canvas: no thumbnail files or base64 pixels are persisted or transmitted.
    const preview = document.createElement("canvas");
    preview.width = 240;
    preview.height = 160;
    preview.className = "kunstrommet-preview";
    preview.setAttribute("role", "img");
    preview.setAttribute("aria-label", "Forhåndsvisning av " + (item.title || "skisse uten tittel"));
    const painter = preview.getContext?.("2d");
    if (!painter) return preview;
    painter.fillStyle = "#ffffff";
    painter.fillRect(0, 0, preview.width, preview.height);
    painter.save();
    painter.scale(preview.width / WIDTH, preview.height / HEIGHT);
    (Array.isArray(item.strokes) ? item.strokes : []).forEach((stroke) => drawStroke(stroke, painter));
    painter.restore();
    return preview;
  }

  async function duplicateProject(item) {
    const copy = newRecord();
    copy.title = (String(item.title || "Skisse").slice(0, 105) + " – kopi").slice(0, 120);
    copy.note = String(item.note || "").slice(0, 4000);
    copy.strokes = structuredCloneSafe(item.strokes || []);
    // Copies never inherit an Aha source event, ingest timestamp or sharing state.
    await put(copy);
    await refreshList();
  }

  function button(text, click, dangerous = false) {
    const el = document.createElement("button");
    el.type = "button";
    el.textContent = text;
    if (dangerous) el.className = "kunstrommet-danger";
    el.addEventListener("click", click);
    return el;
  }

  async function refreshList() {
    const mount = $("kunstrommet-projects");
    mount.replaceChildren();
    let items;
    try { items = await records(); }
    catch (error) { mount.textContent = "Lokal lagring utilgjengelig: " + error.message; return; }
    items.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
    const search = $("kunstrommet-project-search").value.trim().toLocaleLowerCase("no-NO");
    const matches = search
      ? items.filter((item) => (String(item.title || "") + " " + String(item.note || "")).toLocaleLowerCase("no-NO").includes(search))
      : items;
    const visible = matches.slice(0, 40);
    $("kunstrommet-project-count").textContent = matches.length
      ? (matches.length === items.length ? items.length + " lagrede verk" : matches.length + " treff av " + items.length + " verk")
        + (matches.length > visible.length ? " · viser de 40 nyeste" : "")
      : (items.length ? "Ingen treff" : "Ingen lagrede verk");
    if (!visible.length) {
      const p = document.createElement("p");
      p.textContent = items.length
        ? "Ingen skisser matcher søket. Prøv et annet ord."
        : "Ingen lagrede skisser ennå. Lag din første på lerretet.";
      mount.appendChild(p);
      return;
    }
    for (const item of visible) {
      const wrap = document.createElement("article");
      wrap.className = "kunstrommet-project";
      if (current?.id === item.id) wrap.classList.add("kunstrommet-project-current");
      const preview = makePreview(item);
      const name = document.createElement("strong");
      name.textContent = item.title || "Uten tittel";
      const date = document.createElement("small");
      date.textContent = new Date(item.updated_at).toLocaleDateString("no-NO");
      const actions = document.createElement("div");
      actions.append(
        button("Åpne", () => { if (confirmDiscard()) { load(item); refreshList(); } }),
        button("Lag kopi", () => duplicateProject(item).catch((error) => { status("Kunne ikke kopiere: " + error.message); })),
        button("Slett", async () => {
          if (!global.confirm("Slette skissen permanent fra denne nettleseren?")) return;
          try {
            await erase(item.id);
            try { removeArtworkCollectionLinks(item.id); }
            catch (error) {
              // Never resurrect a deleted image merely because the collection index failed.
              try { global.AHAKunstrommetReferences?.remove?.(item.id); } catch {}
              linkStatus("Skissen er slettet, men noen gamle samlingskoblinger kan stå igjen: " + error.message);
            }
            if (current?.id === item.id) { dirty = false; create(); }
            await refreshList();
          } catch (error) { status(error.message); }
        }, true)
      );
      wrap.append(preview, name, date, actions);
      mount.appendChild(wrap);
    }
  }

  function download(blob, file) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = file;
    document.body.append(link);
    link.click();
    link.remove();
    global.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function filename() {
    return ($("kunstrommet-title").value.trim() || "kunstrommet").toLowerCase()
      .replace(/[^a-z0-9æøå_-]+/gi, "-").slice(0, 60) || "kunstrommet";
  }

  function exportPng() {
    if (!current) return;
    redraw();
    canvas.toBlob((blob) => {
      if (blob) download(blob, filename() + ".png");
      else status("Kunne ikke eksportere PNG.");
    }, "image/png");
  }

  function exportProject() {
    if (!current) return;
    const record = getSnapshot();
    const data = { format: "aha-kunstrommet-v1", title: record.title, note: record.note,
      strokes: record.strokes, created_at: record.created_at };
    download(new Blob([JSON.stringify(data)], { type: "application/json" }), filename() + ".json");
  }

  function validStrokes(strokes) {
    if (!Array.isArray(strokes) || strokes.length > MAX_STROKES) return false;
    return strokes.every((s) => /^#[0-9a-f]{6}$/i.test(s.color) && Number.isFinite(s.size) && s.size >= 1 && s.size <= 100
      && Array.isArray(s.points) && s.points.length > 0 && s.points.length <= MAX_POINTS
      && s.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.x <= WIDTH && p.y >= 0 && p.y <= HEIGHT));
  }

  async function importProject(file) {
    if (!file || !confirmDiscard()) return;
    if (file.size > 4000000) { status("Prosjektfilen er for stor."); return; }
    try {
      const json = JSON.parse(await file.text());
      if (json.format !== "aha-kunstrommet-v1" || !validStrokes(json.strokes)) throw new Error("Ukjent eller ugyldig prosjektfil.");
      const item = newRecord();
      item.title = String(json.title || "").slice(0, 120);
      item.note = String(json.note || "").slice(0, 4000);
      item.strokes = structuredCloneSafe(json.strokes);
      await put(item);
      load(item);
      await refreshList();
    } catch (error) { status("Import feilet: " + error.message); }
  }

  async function sendTextToAha() {
    if (!current) return;
    const record = getSnapshot();
    if (!record.title && !record.note) { ahaStatus("Skriv en tittel eller et notat før du sender."); return; }
    const ingest = global.AHAModuleApi?.resolve?.("ingest", "AHAIngest", { version: 1 }) || global.AHAIngest;
    if (!ingest?.ingest) { ahaStatus("Ahas innsiktsmotor er utilgjengelig her."); return; }
    try {
      ahaStatus("Kobler tekst til Aha …");
      // Only textual artist-authored metadata is sent. No pixels, data URL or strokes.
      const result = await ingest.ingest({
        id: "src_kunstrommet_" + record.id,
        source_app: "aha",
        source_type: "aha_kunstrommet_idea",
        content_type: "creative_note",
        user_created: true, imported: false, local_only: true,
        title: record.title || "Kunstrommet",
        text: [record.title, record.note].filter(Boolean).join("\n"),
        created_at: record.created_at,
        meta: { kunstrommet_project_id: record.id, local_only: true, image_sent: false, explicit_user_action: true }
      });
      if (!result?.ok) throw new Error("Aha bekreftet ikke importen.");
      current = { ...record, last_source_event_id: result.sourceEvent?.id || record.last_source_event_id,
        last_ingested_at: new Date().toISOString() };
      await put(current);
      dirty = false;
      status("Lagret på denne enheten");
      ahaStatus("Tittel og notat er sendt til Aha. Bildet er ikke sendt.");
      await refreshList();
    } catch (error) { ahaStatus("Kunne ikke sende til Aha: " + error.message); }
  }

  function undoStroke() {
    if (!current?.strokes.length) return;
    future.push(current.strokes.pop());
    markDirty();
    redraw();
  }

  function redoStroke() {
    if (!current || !future.length) return;
    current.strokes.push(future.pop());
    markDirty();
    redraw();
  }

  function handleShortcut(event) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    if (event.target?.closest?.("input,textarea,[contenteditable]")) return;
    const key = String(event.key || "").toLowerCase();
    if (key === "z" && event.shiftKey || key === "y" && !event.shiftKey) {
      event.preventDefault();
      redoStroke();
    } else if (key === "z") {
      event.preventDefault();
      undoStroke();
    }
  }

  function bind() {
    load(newRecord());
    status("Ny skisse – ikke lagret");
    canvas.addEventListener("pointerdown", start);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("lostpointercapture", end);
    $("kunstrommet-pen").addEventListener("click", () => setTool("pen"));
    $("kunstrommet-eraser").addEventListener("click", () => setTool("eraser"));
    $("kunstrommet-size").addEventListener("input", () => { $("kunstrommet-size-value").value = $("kunstrommet-size").value; });
    $("kunstrommet-title").addEventListener("input", markDirty);
    $("kunstrommet-note").addEventListener("input", markDirty);
    $("kunstrommet-undo").addEventListener("click", undoStroke);
    $("kunstrommet-redo").addEventListener("click", redoStroke);
    document.addEventListener("keydown", handleShortcut);
    $("kunstrommet-palette").addEventListener("click", (event) => {
      const swatch = event.target?.closest?.("button[data-kunstrommet-color]");
      const color = swatch?.dataset?.kunstrommetColor;
      if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return;
      $("kunstrommet-color").value = color;
      setTool("pen");
    });
    $("kunstrommet-project-search").addEventListener("input", () => {
      refreshList().catch((error) => { status("Søk feilet: " + error.message); });
    });
    $("kunstrommet-new").addEventListener("click", create);
    $("kunstrommet-save").addEventListener("click", () => save().catch((error) => status("Lagring feilet: " + error.message)));
    $("kunstrommet-png").addEventListener("click", exportPng);
    $("kunstrommet-json").addEventListener("click", exportProject);
    $("kunstrommet-import").addEventListener("change", (event) => {
      importProject(event.target.files?.[0]);
      event.target.value = "";
    });
    $("kunstrommet-send-aha").addEventListener("click", sendTextToAha);
    $("kunstrommet-link-collection")?.addEventListener("click", addCurrentToCollection);
    $("kunstrommet-unlink-aha")?.addEventListener("click", unlinkCurrentArtwork);
    $("kunstrommet-collection-select")?.addEventListener("focus", renderCollectionOptions);
    renderCollectionOptions();
    renderGalleryInspiration();
    openLinkedArtwork();
    global.addEventListener("beforeunload", (event) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } });
    refreshList();
  }

  global.AHAKunstrommet = { storage: DB_NAME, format: "aha-kunstrommet-v1" };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})(window);
