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
  let history = [];
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

  function drawStroke(stroke) {
    const points = stroke.points;
    if (!Array.isArray(points) || !points.length) return;
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.lineWidth = stroke.size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (points.length === 1) {
      ctx.beginPath();
      ctx.arc(points[0].x, points[0].y, stroke.size / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.stroke();
  }

  function redraw() {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    (current?.strokes || []).forEach(drawStroke);
    if (activeStroke) drawStroke(activeStroke);
  }

  function setTool(next) {
    tool = next;
    $("kunstrommet-pen").setAttribute("aria-pressed", String(next === "pen"));
    $("kunstrommet-eraser").setAttribute("aria-pressed", String(next === "eraser"));
  }

  function start(event) {
    if (!current || (event.pointerType === "mouse" && event.button !== 0)) return;
    if (current.strokes.length >= MAX_STROKES) { status("Grense nådd. Eksporter eller start en ny skisse."); return; }
    event.preventDefault();
    const point = pointOf(event);
    activeStroke = {
      color: tool === "eraser" ? "#ffffff" : $("kunstrommet-color").value,
      size: tool === "eraser" ? Math.max(16, Number($("kunstrommet-size").value) * 2) : Number($("kunstrommet-size").value),
      points: [point]
    };
    try { canvas.setPointerCapture(event.pointerId); } catch {}
    redraw();
  }

  function move(event) {
    if (!activeStroke) return;
    event.preventDefault();
    const point = pointOf(event);
    const prior = activeStroke.points[activeStroke.points.length - 1];
    if (Math.hypot(point.x - prior.x, point.y - prior.y) < 2 || activeStroke.points.length >= MAX_POINTS) return;
    activeStroke.points.push(point);
    redraw();
  }

  function end() {
    if (!activeStroke) return;
    current.strokes.push(activeStroke);
    activeStroke = null;
    future = [];
    markDirty();
    redraw();
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
    if (!items.length) {
      const p = document.createElement("p");
      p.textContent = "Ingen lagrede skisser ennå. Lag din første på lerretet.";
      mount.appendChild(p);
      return;
    }
    for (const item of items) {
      const wrap = document.createElement("article");
      wrap.className = "kunstrommet-project";
      const name = document.createElement("strong");
      name.textContent = item.title || "Uten tittel";
      const date = document.createElement("small");
      date.textContent = new Date(item.updated_at).toLocaleDateString("no-NO");
      const actions = document.createElement("div");
      actions.append(
        button("Åpne", () => { if (confirmDiscard()) load(item); }),
        button("Slett", async () => {
          if (!global.confirm("Slette skissen permanent fra denne nettleseren?")) return;
          try {
            await erase(item.id);
            if (current?.id === item.id) { dirty = false; create(); }
            await refreshList();
          } catch (error) { status(error.message); }
        }, true)
      );
      wrap.append(name, date, actions);
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
    $("kunstrommet-undo").addEventListener("click", () => {
      if (!current.strokes.length) return;
      future.push(current.strokes.pop()); markDirty(); redraw();
    });
    $("kunstrommet-redo").addEventListener("click", () => {
      if (!future.length) return;
      current.strokes.push(future.pop()); markDirty(); redraw();
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
    global.addEventListener("beforeunload", (event) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } });
    refreshList();
  }

  global.AHAKunstrommet = { storage: DB_NAME, format: "aha-kunstrommet-v1" };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})(window);
