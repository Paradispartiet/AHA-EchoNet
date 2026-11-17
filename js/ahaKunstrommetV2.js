// Kunstrommet V2: local-only, layer-based raster atelier. V1 remains untouched.
(function (global) {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const canvas = $("kv2-canvas");
  if (!canvas) return;
  const view = canvas.getContext("2d");
  if (!view) return;

  const WIDTH = 1200;
  const HEIGHT = 800;
  const MAX_LAYERS = 8;
  const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
  const MAX_PROJECT_BYTES = 36 * 1024 * 1024;
  const MAX_HISTORY = 12;
  const DB_NAME = "aha_kunstrommet_v2";
  const STORE = "projects";
  let dbPromise = null;
  let project = null;
  let selected = null;
  let tool = "brush";
  let pointerId = null;
  let pointerStart = null;
  let paintPrevious = null;
  let dirty = false;
  let busy = false;
  let framePending = false;
  let undoStack = [];
  let redoStack = [];
  const surfaces = new Map();

  function uid() {
    return global.crypto && global.crypto.randomUUID
      ? global.crypto.randomUUID() : "art_" + Date.now() + "_" + Math.random().toString(36).slice(2);
  }

  function owner() {
    try { return String(global.localStorage.getItem("aha_profile_id") || "local").slice(0, 120); }
    catch (_) { return "local"; }
  }

  function status(message) { $("kv2-status").textContent = message; }
  function changed() { dirty = true; status("Ulagrede endringer"); }
  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
  function imageCanvas() {
    const result = document.createElement("canvas");
    result.width = WIDTH;
    result.height = HEIGHT;
    return result;
  }

  function createLayer(name, kind) {
    const layer = {
      id: uid(), name: String(name || "Nytt lag").slice(0, 70),
      kind: kind || "paint", visible: true, locked: false,
      opacity: 1, x: 0, y: 0
    };
    surfaces.set(layer.id, imageCanvas());
    return layer;
  }

  function newProject() {
    const now = new Date().toISOString();
    surfaces.clear();
    const base = createLayer("Lag 1 · Tegning", "paint");
    project = {
      id: uid(), title: "", note: "", owner: owner(), layers: [base],
      created_at: now, updated_at: now, local_only: true, shared: false,
      analyzed_image: false
    };
    selected = base.id;
    undoStack = [];
    redoStack = [];
    dirty = false;
    $("kv2-title").value = "";
    $("kv2-note").value = "";
    status("Nytt prosjekt");
    refresh();
  }

  function currentLayer() {
    return project && project.layers.find((layer) => layer.id === selected);
  }

  function draw() {
    framePending = false;
    view.save();
    view.globalAlpha = 1;
    view.globalCompositeOperation = "source-over";
    view.fillStyle = "#ffffff";
    view.fillRect(0, 0, WIDTH, HEIGHT);
    if (project) project.layers.forEach((layer) => {
      if (!layer.visible) return;
      const bitmap = surfaces.get(layer.id);
      if (!bitmap) return;
      view.globalAlpha = layer.opacity;
      view.drawImage(bitmap, layer.x, layer.y);
    });
    view.restore();
  }

  function drawSoon() {
    if (!framePending) {
      framePending = true;
      global.requestAnimationFrame(draw);
    }
  }

  function snapshot() {
    return project.layers.map((layer) => ({
      id: layer.id, name: layer.name, kind: layer.kind,
      visible: layer.visible, locked: layer.locked, opacity: layer.opacity,
      x: layer.x, y: layer.y,
      bitmap: surfaces.get(layer.id).toDataURL("image/png")
    }));
  }

  function checkpoint(allowBusy) {
    if (busy && !allowBusy) return false;
    undoStack.push({ layers: snapshot(), selected: selected });
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack = [];
    return true;
  }

  function decodePng(url) {
    if (typeof url !== "string" ||
        !/^data:image\/png;base64,[a-zA-Z0-9+/=]+$/.test(url) ||
        url.length > MAX_PROJECT_BYTES) {
      return Promise.reject(new Error("Ugyldige bildedata i prosjektet."));
    }
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        if (image.width !== WIDTH || image.height !== HEIGHT) {
          reject(new Error("Prosjektlaget har feil størrelse."));
          return;
        }
        const surface = imageCanvas();
        surface.getContext("2d").drawImage(image, 0, 0);
        resolve(surface);
      };
      image.onerror = () => reject(new Error("Kunne ikke lese et prosjektlag."));
      image.src = url;
    });
  }

  async function installLayers(layers) {
    const loaded = await Promise.all(layers.map((layer) => decodePng(layer.bitmap)));
    const next = new Map();
    layers.forEach((layer, index) => next.set(layer.id, loaded[index]));
    surfaces.clear();
    next.forEach((value, key) => surfaces.set(key, value));
    project.layers = layers.map(({ bitmap, ...meta }) => meta);
  }

  async function historyStep(from, to) {
    if (busy || !from.length || !project) return;
    busy = true;
    const target = from[from.length - 1];
    const previous = { layers: snapshot(), selected: selected };
    try {
      await installLayers(target.layers);
      from.pop();
      to.push(previous);
      if (to.length > MAX_HISTORY) to.shift();
      selected = project.layers.some((layer) => layer.id === target.selected)
        ? target.selected : project.layers[project.layers.length - 1].id;
      changed();
      refresh();
    } catch (error) { status("Kunne ikke gjenopprette: " + error.message); }
    finally { busy = false; }
  }

  function makeButton(label, action, aria) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    if (aria) button.setAttribute("aria-label", aria);
    button.addEventListener("click", action);
    return button;
  }

  function renderLayerList() {
    const mount = $("kv2-layers");
    mount.replaceChildren();
    project.layers.slice().reverse().forEach((layer) => {
      const row = document.createElement("div");
      row.className = "kv2-layer" + (selected === layer.id ? " kv2-selected" : "");
      const choose = makeButton(layer.name, () => {
        selected = layer.id;
        renderLayerList();
        updateLayerControls();
      }, "Velg " + layer.name);
      choose.className = "kv2-layer-name";
      choose.setAttribute("aria-pressed", String(selected === layer.id));
      const visibility = makeButton(layer.visible ? "◉" : "○", () => {
        if (busy) return;
        checkpoint();
        layer.visible = !layer.visible;
        changed(); refresh();
      }, (layer.visible ? "Skjul " : "Vis ") + layer.name);
      const lock = makeButton(layer.locked ? "Låst" : "Åpen", () => {
        if (busy) return;
        checkpoint();
        layer.locked = !layer.locked;
        changed(); refresh();
      }, (layer.locked ? "Lås opp " : "Lås ") + layer.name);
      row.append(visibility, choose, lock);
      mount.appendChild(row);
    });
    const active = currentLayer();
    $("kv2-active-layer").textContent = active ? active.name : "Ingen lag";
  }

  function updateLayerControls() {
    const layer = currentLayer();
    $("kv2-opacity").value = layer ? Math.round(layer.opacity * 100) : 100;
    $("kv2-opacity-value").textContent = $("kv2-opacity").value + "%";
    $("kv2-rename").value = layer ? layer.name : "";
    $("kv2-layer-up").disabled = !layer || project.layers.indexOf(layer) === project.layers.length - 1;
    $("kv2-layer-down").disabled = !layer || project.layers.indexOf(layer) === 0;
    $("kv2-remove-layer").disabled = project.layers.length <= 1;
  }

  function refresh() {
    draw();
    renderLayerList();
    updateLayerControls();
    ["brush", "eraser", "move"].forEach((name) => {
      $("kv2-" + name).setAttribute("aria-pressed", String(tool === name));
    });
    $("kv2-layer-count").textContent = project.layers.length + " av " + MAX_LAYERS + " lag";
  }

  function point(event) {
    const box = canvas.getBoundingClientRect();
    return {
      x: clamp((event.clientX - box.left) * WIDTH / box.width, 0, WIDTH),
      y: clamp((event.clientY - box.top) * HEIGHT / box.height, 0, HEIGHT)
    };
  }

  function drawSegment(context, a, b) {
    const size = Number($("kv2-size").value) || 6;
    context.save();
    context.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
    context.strokeStyle = $("kv2-color").value;
    context.fillStyle = tool === "eraser" ? "#000000" : $("kv2-color").value;
    context.lineWidth = tool === "eraser" ? size * 2 : size;
    context.lineJoin = "round";
    context.lineCap = "round";
    context.beginPath();
    if (!b || (a.x === b.x && a.y === b.y)) {
      context.arc(a.x, a.y, context.lineWidth / 2, 0, Math.PI * 2);
      context.fill();
    } else {
      context.moveTo(a.x, a.y);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
    context.restore();
  }

  function begin(event) {
    if (busy || !project || pointerId !== null ||
        (event.pointerType === "mouse" && event.button !== 0)) return;
    const layer = currentLayer();
    if (!layer || layer.locked || !layer.visible) {
      status("Velg et synlig, ulåst lag før du arbeider.");
      return;
    }
    if (!checkpoint()) return;
    event.preventDefault();
    pointerId = event.pointerId;
    pointerStart = { point: point(event), x: layer.x, y: layer.y };
    paintPrevious = null;
    if (tool !== "move") {
      const at = point(event);
      const local = { x: at.x - layer.x, y: at.y - layer.y };
      drawSegment(surfaces.get(layer.id).getContext("2d"), local, local);
      paintPrevious = local;
      drawSoon();
    }
    try { canvas.setPointerCapture(pointerId); } catch (_) {}
  }

  function move(event) {
    if (pointerId === null || event.pointerId !== pointerId || busy) return;
    event.preventDefault();
    const layer = currentLayer();
    if (!layer) return;
    const at = point(event);
    if (tool === "move") {
      layer.x = Math.round(pointerStart.x + at.x - pointerStart.point.x);
      layer.y = Math.round(pointerStart.y + at.y - pointerStart.point.y);
    } else {
      const local = { x: at.x - layer.x, y: at.y - layer.y };
      drawSegment(surfaces.get(layer.id).getContext("2d"), paintPrevious, local);
      paintPrevious = local;
    }
    drawSoon();
  }

  function end(event) {
    if (pointerId === null || (event.pointerId != null && event.pointerId !== pointerId)) return;
    pointerId = null;
    pointerStart = null;
    paintPrevious = null;
    changed();
    draw();
  }

  function addLayer(name, kind) {
    if (busy) return null;
    if (project.layers.length >= MAX_LAYERS) {
      status("Du kan bruke inntil " + MAX_LAYERS + " lag i denne versjonen.");
      return null;
    }
    checkpoint();
    const layer = createLayer(name, kind);
    const activeIndex = project.layers.findIndex((item) => item.id === selected);
    project.layers.splice(activeIndex + 1, 0, layer);
    selected = layer.id;
    changed();
    refresh();
    return layer;
  }

  function reorder(direction) {
    if (busy) return;
    const index = project.layers.findIndex((layer) => layer.id === selected);
    const next = index + direction;
    if (next < 0 || next >= project.layers.length) return;
    checkpoint();
    const tmp = project.layers[index];
    project.layers[index] = project.layers[next];
    project.layers[next] = tmp;
    changed();
    refresh();
  }

  function removeLayer() {
    if (busy || project.layers.length <= 1) return;
    checkpoint();
    const index = project.layers.findIndex((layer) => layer.id === selected);
    surfaces.delete(selected);
    project.layers.splice(index, 1);
    selected = project.layers[Math.min(index, project.layers.length - 1)].id;
    changed(); refresh();
  }

  function formatRecord() {
    return {
      format: "aha-kunstrommet-v2",
      version: 2, width: WIDTH, height: HEIGHT,
      title: $("kv2-title").value.slice(0, 120),
      note: $("kv2-note").value.slice(0, 4000),
      layers: snapshot()
    };
  }

  function openDb() {
    if (!global.indexedDB) return Promise.reject(new Error("Lokal IndexedDB-lagring mangler."));
    if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
      const request = global.indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) {
          request.result.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Kunne ikke åpne skisseboken."));
    }).catch((error) => { dbPromise = null; throw error; });
    return dbPromise;
  }

  async function putRecord(record) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Kunne ikke lagre prosjektet."));
      tx.onabort = () => reject(tx.error || new Error("Lagring avbrutt. Eksporter en sikkerhetskopi."));
    });
  }

  async function getRecords() {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result.filter((item) => item.owner === owner()));
      req.onerror = () => reject(req.error || new Error("Kunne ikke lese skisseboken."));
    });
  }

  async function save() {
    if (busy || !project) return;
    busy = true;
    try {
      const data = formatRecord();
      const record = {
        ...data, id: project.id, owner: owner(), created_at: project.created_at,
        updated_at: new Date().toISOString(),
        local_only: true, shared: false, analyzed_image: false
      };
      if (JSON.stringify(record).length > MAX_PROJECT_BYTES) {
        throw new Error("Prosjektet er for stort for lokal lagring.");
      }
      await putRecord(record);
      project.updated_at = record.updated_at;
      dirty = false;
      status("Lagret på denne enheten");
      await renderProjects();
    } catch (error) { status("Lagring feilet: " + error.message); }
    finally { busy = false; }
  }

  function validateLayer(input) {
    if (!input || typeof input !== "object" || typeof input.bitmap !== "string" ||
        !/^data:image\/png;base64,[a-zA-Z0-9+/=]+$/.test(input.bitmap)) {
      throw new Error("Prosjektet har ugyldige lag.");
    }
    return {
      id: uid(), name: String(input.name || "Lag").slice(0, 70),
      kind: input.kind === "image" ? "image" : "paint",
      visible: input.visible !== false, locked: input.locked === true,
      opacity: clamp(Number.isFinite(input.opacity) ? input.opacity : 1, 0, 1),
      x: clamp(Number.isFinite(input.x) ? Math.round(input.x) : 0, -WIDTH * 2, WIDTH * 2),
      y: clamp(Number.isFinite(input.y) ? Math.round(input.y) : 0, -HEIGHT * 2, HEIGHT * 2),
      bitmap: input.bitmap
    };
  }

  function convertV1(data) {
    if (!Array.isArray(data.strokes) || data.strokes.length > 3000) {
      throw new Error("V1-prosjektet har ugyldige penselstrøk.");
    }
    const layer = createLayer("Importert V1-tegning", "paint");
    const context = surfaces.get(layer.id).getContext("2d");
    data.strokes.forEach((stroke) => {
      if (!stroke || !/^#[a-fA-F0-9]{6}$/.test(stroke.color) ||
          !Number.isFinite(stroke.size) || stroke.size < 1 || stroke.size > 200 ||
          !Array.isArray(stroke.points) || stroke.points.length > 2400) {
        throw new Error("V1-prosjektet har ugyldige penseldata.");
      }
      const points = stroke.points.map((p) => {
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) ||
            p.x < 0 || p.x > WIDTH || p.y < 0 || p.y > HEIGHT) {
          throw new Error("V1-prosjektet har koordinater utenfor lerretet.");
        }
        return p;
      });
      if (!points.length) return;
      context.save();
      context.strokeStyle = stroke.color;
      context.fillStyle = stroke.color;
      context.lineWidth = stroke.size;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.beginPath();
      if (points.length === 1) {
        context.arc(points[0].x, points[0].y, stroke.size / 2, 0, Math.PI * 2);
        context.fill();
      } else {
        context.moveTo(points[0].x, points[0].y);
        points.slice(1).forEach((p) => context.lineTo(p.x, p.y));
        context.stroke();
      }
      context.restore();
    });
    return [{ ...layer, bitmap: surfaces.get(layer.id).toDataURL("image/png") }];
  }

  async function loadData(data, isV1, sameRecord) {
    if (!data || typeof data !== "object") throw new Error("Ugyldig prosjekt.");
    let layers;
    if (isV1) {
      layers = convertV1(data);
    } else {
      if (data.format !== "aha-kunstrommet-v2" || data.width !== WIDTH ||
          data.height !== HEIGHT || !Array.isArray(data.layers) ||
          !data.layers.length || data.layers.length > MAX_LAYERS) {
        throw new Error("Ukjent eller ugyldig prosjektformat.");
      }
      layers = data.layers.map(validateLayer);
    }
    if (JSON.stringify(layers).length > MAX_PROJECT_BYTES) {
      throw new Error("Prosjektet er for stort.");
    }
    // Decode all imported images before installing the new document.
    const decoded = await Promise.all(layers.map((layer) => decodePng(layer.bitmap)));
    const now = new Date().toISOString();
    const next = {
      id: sameRecord ? data.id : uid(),
      owner: owner(), title: String(data.title || "").slice(0, 120),
      note: String(data.note || "").slice(0, 4000),
      layers: layers.map(({ bitmap, ...meta }) => meta),
      created_at: sameRecord ? data.created_at : now,
      updated_at: now, local_only: true, shared: false, analyzed_image: false
    };
    surfaces.clear();
    layers.forEach((layer, i) => surfaces.set(layer.id, decoded[i]));
    project = next;
    selected = project.layers[project.layers.length - 1].id;
    $("kv2-title").value = project.title;
    $("kv2-note").value = project.note;
    undoStack = [];
    redoStack = [];
    dirty = !sameRecord;
    status(sameRecord ? "Åpnet fra denne enheten" : "Importert – lagre for å beholde");
    refresh();
  }

  async function renderProjects() {
    const mount = $("kv2-projects");
    mount.replaceChildren();
    try {
      const items = (await getRecords()).sort((a, b) =>
        String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
      const heading = document.createElement("p");
      heading.textContent = items.length + " lagrede prosjekter på denne enheten";
      mount.appendChild(heading);
      items.forEach((item) => {
        const card = document.createElement("div");
        card.className = "kv2-project";
        const text = document.createElement("span");
        text.textContent = item.title || "Uten tittel";
        const open = makeButton("Åpne", async () => {
          if (busy || (dirty && !global.confirm("Forkaste endringer som ikke er lagret?"))) return;
          busy = true;
          try { await loadData(item, false, true); }
          catch (error) { status("Kunne ikke åpne: " + error.message); }
          finally { busy = false; }
        });
        card.append(text, open);
        mount.appendChild(card);
      });
    } catch (error) { status("Skissebok utilgjengelig: " + error.message); }
  }

  function download(filename, data, mime) {
    const blob = new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    global.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function filename() {
    return ($("kv2-title").value || "kunstverk").toLowerCase()
      .replace(/[^a-z0-9æøå_-]+/gi, "-").slice(0, 70);
  }

  async function importPhoto(file) {
    if (busy || !file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > MAX_IMAGE_BYTES) {
      status("Velg et JPG-, PNG- eller WebP-bilde på maks 12 MB.");
      return;
    }
    if (project.layers.length >= MAX_LAYERS) {
      status("Fjern et lag før du importerer et nytt bilde.");
      return;
    }
    busy = true;
    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Bildeformatet kunne ikke leses."));
        img.src = url;
      });
      if (!image.naturalWidth || !image.naturalHeight ||
          image.naturalWidth > 16000 || image.naturalHeight > 16000) {
        throw new Error("Bildet har ugyldige eller for store dimensjoner.");
      }
      checkpoint(true);
      const layer = createLayer(file.name.replace(/\.[^.]*$/, "").slice(0, 60) || "Fotografi", "image");
      const index = project.layers.findIndex((item) => item.id === selected);
      project.layers.splice(index + 1, 0, layer);
      selected = layer.id;
      const surface = surfaces.get(layer.id);
      const ratio = Math.min(WIDTH / image.naturalWidth, HEIGHT / image.naturalHeight);
      const w = image.naturalWidth * ratio;
      const h = image.naturalHeight * ratio;
      surface.getContext("2d").drawImage(image, (WIDTH - w) / 2, (HEIGHT - h) / 2, w, h);
      changed();
      refresh();
    } catch (error) { status("Import feilet: " + error.message); }
    finally { busy = false; URL.revokeObjectURL(url); $("kv2-photo").value = ""; }
  }

  async function importProject(file) {
    if (busy || !file) return;
    if (file.size > MAX_PROJECT_BYTES) { status("Prosjektfilen er for stor."); return; }
    busy = true;
    try {
      const data = JSON.parse(await file.text());
      const isV1 = data.format === "aha-kunstrommet-v1";
      if (dirty && !global.confirm("Forkaste ulagrede endringer og åpne det importerte prosjektet?")) return;
      await loadData(data, isV1, false);
    } catch (error) { status("Import feilet: " + error.message); }
    finally { busy = false; $("kv2-import").value = ""; }
  }

  function bind() {
    $("kv2-new").addEventListener("click", () => {
      if (busy || (dirty && !global.confirm("Forkaste endringer som ikke er lagret?"))) return;
      newProject();
    });
    $("kv2-add-layer").addEventListener("click", () => addLayer("Lag " + (project.layers.length + 1), "paint"));
    $("kv2-remove-layer").addEventListener("click", removeLayer);
    $("kv2-layer-up").addEventListener("click", () => reorder(1));
    $("kv2-layer-down").addEventListener("click", () => reorder(-1));
    $("kv2-save").addEventListener("click", save);
    $("kv2-undo").addEventListener("click", () => historyStep(undoStack, redoStack));
    $("kv2-redo").addEventListener("click", () => historyStep(redoStack, undoStack));
    $("kv2-title").addEventListener("input", changed);
    $("kv2-note").addEventListener("input", changed);
    $("kv2-color").addEventListener("input", () => { tool = "brush"; refresh(); });
    $("kv2-size").addEventListener("input", () => { $("kv2-size-value").textContent = $("kv2-size").value; });
    $("kv2-rename").addEventListener("change", () => {
      const layer = currentLayer();
      if (!layer || busy) return;
      const next = $("kv2-rename").value.trim().slice(0, 70);
      if (!next || next === layer.name) return;
      checkpoint(); layer.name = next; changed(); refresh();
    });
    $("kv2-opacity").addEventListener("change", () => {
      const layer = currentLayer();
      if (!layer || busy) return;
      const next = clamp(Number($("kv2-opacity").value) / 100, 0, 1);
      if (layer.opacity !== next) {
        checkpoint(); layer.opacity = next; changed(); refresh();
      }
    });
    ["brush", "eraser", "move"].forEach((name) => {
      $("kv2-" + name).addEventListener("click", () => { tool = name; refresh(); });
    });
    $("kv2-photo").addEventListener("change", (event) => importPhoto(event.target.files[0]));
    $("kv2-import").addEventListener("change", (event) => importProject(event.target.files[0]));
    $("kv2-json").addEventListener("click", () => {
      if (busy) return;
      const json = JSON.stringify(formatRecord());
      if (json.length > MAX_PROJECT_BYTES) { status("Prosjektet er for stort til eksport."); return; }
      download(filename() + ".kunstrommet.json", json, "application/json");
      status("Prosjektkopi eksportert");
    });
    $("kv2-png").addEventListener("click", () => {
      draw();
      canvas.toBlob((blob) => {
        if (!blob) { status("Kunne ikke eksportere PNG."); return; }
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename() + ".png";
        document.body.appendChild(anchor); anchor.click(); anchor.remove();
        global.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }, "image/png");
    });
    canvas.addEventListener("pointerdown", begin);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("lostpointercapture", end);
    global.addEventListener("keydown", (event) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z" ||
          /^(input|textarea)$/i.test(document.activeElement?.tagName || "")) return;
      event.preventDefault();
      historyStep(event.shiftKey ? redoStack : undoStack, event.shiftKey ? undoStack : redoStack);
    });
    global.addEventListener("beforeunload", (event) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    });
  }

  bind();
  newProject();
  renderProjects();
})(window);
