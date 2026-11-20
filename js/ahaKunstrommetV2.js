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
  const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
  const viewport = $("kv2-paper");
  let zoomIndex = 2;
  let dbPromise = null;
  let project = null;
  let selected = null;
  let tool = "brush";
  let selection = null; // Transient document-coordinate marquee, never saved as pixels.
  let pointerId = null;
  let pointerStart = null;
  let paintPrevious = null;
  let dirty = false;
  let busy = false;
  let framePending = false;
  let undoStack = [];
  let redoStack = [];
  const surfaces = new Map();
  // Masks are separate, editable alpha images; a layer's original bitmap stays intact.
  const masks = new Map();
  let maskEditing = false;
  const maskedComposite = imageCanvas();

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
    masks.clear();
    leaveMaskEdit();
    selection = null;
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
      const mask = layer.maskEnabled !== false && masks.get(layer.id);
      if (!mask) {
        view.drawImage(bitmap, layer.x, layer.y);
      } else {
        const context = maskedComposite.getContext("2d");
        context.save();
        context.globalAlpha = 1;
        context.globalCompositeOperation = "source-over";
        context.clearRect(0, 0, WIDTH, HEIGHT);
        context.drawImage(bitmap, 0, 0);
        context.globalCompositeOperation = "destination-in";
        context.drawImage(mask, 0, 0);
        context.restore();
        view.drawImage(maskedComposite, layer.x, layer.y);
      }
    });
    view.restore();
  }

  function renderSelection() {
    const overlay = $("kv2-selection-overlay");
    if (!overlay) return;
    const rect = canvas.getBoundingClientRect();
    const valid = selection && selection.w >= 2 && selection.h >= 2;
    overlay.hidden = !valid;
    if (valid) {
      overlay.style.left = (selection.x * rect.width / WIDTH) + "px";
      overlay.style.top = (selection.y * rect.height / HEIGHT) + "px";
      overlay.style.width = (selection.w * rect.width / WIDTH) + "px";
      overlay.style.height = (selection.h * rect.height / HEIGHT) + "px";
    }
    $("kv2-clear-selection").disabled = !selection;
    $("kv2-crop-layer").disabled = !valid;
    const active = currentLayer();
    const canExtract = valid && active && active.visible && !active.locked &&
      project.layers.length < MAX_LAYERS;
    $("kv2-copy-selection").disabled = !canExtract;
    $("kv2-cut-selection").disabled = !canExtract;
    $("kv2-export-selection").disabled = !valid;
  }

  function normalizedSelection(a, b) {
    const x = Math.round(clamp(Math.min(a.x, b.x), 0, WIDTH));
    const y = Math.round(clamp(Math.min(a.y, b.y), 0, HEIGHT));
    const right = Math.round(clamp(Math.max(a.x, b.x), 0, WIDTH));
    const bottom = Math.round(clamp(Math.max(a.y, b.y), 0, HEIGHT));
    return { x, y, w: right - x, h: bottom - y };
  }

  function paintOnLayer(layer, a, b) {
    const targetMask = maskEditing ? masks.get(layer.id) : null;
    const context = (targetMask || surfaces.get(layer.id)).getContext("2d");
    if (!selection || selection.w < 2 || selection.h < 2) {
      drawSegment(context, a, b, !!targetMask);
      return;
    }
    context.save();
    context.beginPath();
    context.rect(selection.x - layer.x, selection.y - layer.y, selection.w, selection.h);
    context.clip();
    drawSegment(context, a, b, !!targetMask);
    context.restore();
  }

  function drawSoon() {
    if (!framePending) {
      framePending = true;
      global.requestAnimationFrame(draw);
    }
  }

  // Canvas PNG decoders on some WebKit builds round semi-transparent
  // channel values on import. Preserve those exact RGBA values alongside the
  // standard PNG so that editable layers survive a backup round-trip.
  function encodeEdgePixels(surface) {
    const data = surface.getContext("2d").getImageData(0, 0, WIDTH, HEIGHT).data;
    const bytes = new Uint8Array(WIDTH * HEIGHT * 8);
    let used = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0 || data[i + 3] === 255) continue;
      const index = i / 4;
      bytes[used++] = index & 255;
      bytes[used++] = (index >>> 8) & 255;
      bytes[used++] = (index >>> 16) & 255;
      bytes[used++] = (index >>> 24) & 255;
      bytes[used++] = data[i];
      bytes[used++] = data[i + 1];
      bytes[used++] = data[i + 2];
      bytes[used++] = data[i + 3];
    }
    if (!used) return "";
    let binary = "";
    for (let i = 0; i < used; i += 32768) {
      binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + 32768, used)));
    }
    return global.btoa(binary);
  }

  function restoreEdgePixels(surface, encoded) {
    if (!encoded) return;
    if (typeof encoded !== "string" || encoded.length > MAX_PROJECT_BYTES ||
        !/^[a-zA-Z0-9+/]+={0,2}$/.test(encoded)) {
      throw new Error("Ugyldige eksakte lagpiksler.");
    }
    const binary = global.atob(encoded);
    if (binary.length % 8 !== 0 || binary.length > WIDTH * HEIGHT * 8) {
      throw new Error("Ugyldig pikselkorreksjon i prosjektet.");
    }
    const context = surface.getContext("2d");
    const image = context.getImageData(0, 0, WIDTH, HEIGHT);
    const pixels = image.data;
    let previousIndex = -1;
    for (let i = 0; i < binary.length; i += 8) {
      const index = (binary.charCodeAt(i) | (binary.charCodeAt(i + 1) << 8) |
        (binary.charCodeAt(i + 2) << 16) | (binary.charCodeAt(i + 3) << 24)) >>> 0;
      if (index <= previousIndex || index >= WIDTH * HEIGHT) {
        throw new Error("Ugyldig pikselplassering i prosjektet.");
      }
      previousIndex = index;
      const at = index * 4;
      for (let channel = 0; channel < 4; channel++) {
        pixels[at + channel] = binary.charCodeAt(i + 4 + channel);
      }
    }
    context.putImageData(image, 0, 0);
  }

  function snapshot() {
    return project.layers.map((layer) => {
      const surface = surfaces.get(layer.id);
      const pixelFixups = encodeEdgePixels(surface);
      const mask = masks.get(layer.id);
      const maskPixelFixups = mask ? encodeEdgePixels(mask) : "";
      return {
        id: layer.id, name: layer.name, kind: layer.kind,
        visible: layer.visible, locked: layer.locked, opacity: layer.opacity,
        x: layer.x, y: layer.y,
        bitmap: surface.toDataURL("image/png"),
        ...(pixelFixups ? { pixelFixups } : {}),
        ...(mask ? {
          maskBitmap: mask.toDataURL("image/png"),
          maskEnabled: layer.maskEnabled !== false,
          ...(maskPixelFixups ? { maskPixelFixups } : {})
        } : {})
      };
    });
  }

  function checkpoint(allowBusy) {
    if (busy && !allowBusy) return false;
    undoStack.push({ layers: snapshot(), selected: selected });
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack = [];
    return true;
  }

  function decodePng(url, pixelFixups) {
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
        try { restoreEdgePixels(surface, pixelFixups); }
        catch (error) { reject(error); return; }
        resolve(surface);
      };
      image.onerror = () => reject(new Error("Kunne ikke lese et prosjektlag."));
      image.src = url;
    });
  }

  async function decodeLayerBitmaps(layers) {
    // Decode all layer and mask data before mutating the open project.
    return Promise.all(layers.map(async (layer) => ({
      bitmap: await decodePng(layer.bitmap, layer.pixelFixups),
      mask: layer.maskBitmap ? await decodePng(layer.maskBitmap, layer.maskPixelFixups) : null
    })));
  }

  function installDecodedLayers(layers, decoded) {
    surfaces.clear();
    masks.clear();
    layers.forEach((layer, index) => {
      surfaces.set(layer.id, decoded[index].bitmap);
      if (decoded[index].mask) masks.set(layer.id, decoded[index].mask);
    });
    project.layers = layers.map(({ bitmap, pixelFixups, maskBitmap, maskPixelFixups, ...meta }) => meta);
  }

  async function installLayers(layers) {
    const decoded = await decodeLayerBitmaps(layers);
    installDecodedLayers(layers, decoded);
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
      if (!masks.has(selected) || currentLayer()?.maskEnabled === false) leaveMaskEdit();
      changed();
      refresh();
    } catch (error) { status("Kunne ikke gjenopprette: " + error.message); }
    finally {
      busy = false;
      updateMaskControls();
    }
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
      const choose = makeButton(layer.name + (masks.has(layer.id) ? " · maske" : ""), () => {
        leaveMaskEdit();
        selected = layer.id;
        renderLayerList();
        updateLayerControls();
        renderSelection();
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
    updateMaskControls();
  }

  function updateMaskControls() {
    const layer = currentLayer();
    const hasMask = !!layer && masks.has(layer.id);
    const editable = !!layer && layer.visible && !layer.locked && !busy;
    if (!hasMask || layer?.maskEnabled === false) leaveMaskEdit();
    $("kv2-mask-add").disabled = !editable || hasMask;
    $("kv2-mask-edit").disabled = !editable || !hasMask || layer.maskEnabled === false;
    $("kv2-mask-edit").setAttribute("aria-pressed", String(hasMask && maskEditing));
    $("kv2-mask-toggle").disabled = !hasMask || busy;
    $("kv2-mask-toggle").textContent = layer?.maskEnabled === false ? "Aktiver maske" : "Skru av maske";
    $("kv2-mask-remove").disabled = !editable || !hasMask;
    $("kv2-mask-status").textContent = !hasMask
      ? "Ingen maske på valgt lag"
      : "Lagmaske: " + (layer.maskEnabled === false ? "av" : "på") +
        (maskEditing ? " · Du redigerer masken" : " · Du redigerer bildet");
  }

  function refresh() {
    draw();
    renderLayerList();
    updateLayerControls();
    ["brush", "eraser", "move", "hand", "select", "eyedropper"].forEach((name) => {
      $("kv2-" + name).setAttribute("aria-pressed", String(tool === name));
    });
    canvas.style.cursor = tool === "hand" ? "grab" : tool === "move" ? "move" : "crosshair";
    $("kv2-zoom-value").textContent = Math.round(ZOOM_LEVELS[zoomIndex] * 100) + "%";
    $("kv2-zoom-out").disabled = zoomIndex === 0;
    $("kv2-zoom-in").disabled = zoomIndex === ZOOM_LEVELS.length - 1;
    $("kv2-layer-count").textContent = project.layers.length + " av " + MAX_LAYERS + " lag";
    $("kv2-duplicate-layer").disabled = project.layers.length >= MAX_LAYERS;
    renderSelection();
  }

  function point(event) {
    const box = canvas.getBoundingClientRect();
    return {
      x: clamp((event.clientX - box.left) * WIDTH / box.width, 0, WIDTH),
      y: clamp((event.clientY - box.top) * HEIGHT / box.height, 0, HEIGHT)
    };
  }

  function penPressure(event) {
    if (event.pointerType !== "pen") return 1;
    // Pen pressure is optional; unreported/zero readings use the old fixed-width stroke.
    const pressure = Number.isFinite(event.pressure) && event.pressure > 0
      ? event.pressure : 0.5;
    return clamp(0.35 + clamp(pressure, 0, 1) * 1.3, 0.35, 1.65);
  }

  function setZoom(nextIndex) {
    nextIndex = clamp(nextIndex, 0, ZOOM_LEVELS.length - 1);
    if (zoomIndex === nextIndex) return;
    // Keep the viewed center approximately stable when the CSS-only zoom changes.
    // Neither the layer bitmaps nor the fixed 1200x800 PNG export are rescaled.
    const oldZoom = ZOOM_LEVELS[zoomIndex];
    const newZoom = ZOOM_LEVELS[nextIndex];
    const width = viewport.clientWidth || 0;
    const height = viewport.clientHeight || 0;
    const centerX = ((viewport.scrollLeft || 0) + width / 2) / oldZoom;
    const centerY = ((viewport.scrollTop || 0) + height / 2) / oldZoom;
    zoomIndex = nextIndex;
    canvas.style.width = Math.round(newZoom * 100) + "%";
    viewport.scrollLeft = Math.max(0, centerX * newZoom - width / 2);
    viewport.scrollTop = Math.max(0, centerY * newZoom - height / 2);
    refresh();
  }

  function drawSegment(context, a, b, onMask) {
    const size = Number($("kv2-size").value) || 6;
    context.save();
    context.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
    context.strokeStyle = onMask ? "#ffffff" : $("kv2-color").value;
    context.fillStyle = tool === "eraser" ? "#000000" : onMask ? "#ffffff" : $("kv2-color").value;
    const first = Number.isFinite(a.pressureFactor) ? a.pressureFactor : 1;
    const last = b && Number.isFinite(b.pressureFactor) ? b.pressureFactor : first;
    context.lineWidth = tool === "eraser" ? size * 2 : size * (first + last) / 2;
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
    if (tool === "eyedropper") {
      // Read the visible composition (including opacity and the white paper).
      // Sampling is view-only: never checkpoint, paint, or change the document.
      event.preventDefault();
      draw();
      const at = point(event);
      const rgba = view.getImageData(
        Math.min(WIDTH - 1, Math.floor(at.x)),
        Math.min(HEIGHT - 1, Math.floor(at.y)), 1, 1
      ).data;
      $("kv2-color").value = "#" + Array.from(rgba.slice(0, 3))
        .map((channel) => channel.toString(16).padStart(2, "0")).join("");
      tool = "brush";
      refresh();
      status("Farge hentet fra lerretet");
      return;
    }
    const layer = currentLayer();
    if (tool !== "hand" && tool !== "select" && (!layer || layer.locked || !layer.visible)) {
      status("Velg et synlig, ulåst lag før du arbeider.");
      return;
    }
    // Moving the viewport is never an artwork edit and must not create undo history.
    if (tool !== "hand" && tool !== "select" && !checkpoint()) return;
    event.preventDefault();
    pointerId = event.pointerId;
    pointerStart = {
      point: point(event), x: layer?.x || 0, y: layer?.y || 0,
      clientX: event.clientX, clientY: event.clientY,
      scrollLeft: viewport.scrollLeft || 0, scrollTop: viewport.scrollTop || 0
    };
    paintPrevious = null;
    if (tool === "select") {
      selection = normalizedSelection(pointerStart.point, pointerStart.point);
      renderSelection();
    }
    if (tool === "brush" || tool === "eraser") {
      const at = point(event);
      const local = {
        x: at.x - layer.x, y: at.y - layer.y,
        pressureFactor: penPressure(event)
      };
      paintOnLayer(layer, local, local);
      paintPrevious = local;
      drawSoon();
    }
    try { canvas.setPointerCapture(pointerId); } catch (_) {}
  }

  function move(event) {
    if (pointerId === null || event.pointerId !== pointerId || busy) return;
    event.preventDefault();
    if (tool === "hand") {
      viewport.scrollLeft = Math.max(0, pointerStart.scrollLeft + pointerStart.clientX - event.clientX);
      viewport.scrollTop = Math.max(0, pointerStart.scrollTop + pointerStart.clientY - event.clientY);
      return;
    }
    if (tool === "select") {
      selection = normalizedSelection(pointerStart.point, point(event));
      renderSelection();
      return;
    }
    const layer = currentLayer();
    if (!layer) return;
    const at = point(event);
    if (tool === "move") {
      layer.x = Math.round(pointerStart.x + at.x - pointerStart.point.x);
      layer.y = Math.round(pointerStart.y + at.y - pointerStart.point.y);
    } else {
      const local = {
        x: at.x - layer.x, y: at.y - layer.y,
        pressureFactor: penPressure(event)
      };
      paintOnLayer(layer, paintPrevious, local);
      paintPrevious = local;
    }
    drawSoon();
  }

  function end(event) {
    if (pointerId === null || (event.pointerId != null && event.pointerId !== pointerId)) return;
    const changedArtwork = tool !== "hand" && tool !== "select";
    if (tool === "select") {
      if (selection && (selection.w < 2 || selection.h < 2)) selection = null;
      renderSelection();
      status(selection ? "Område markert – arbeid på valgt lag" : "Ingen markering");
    }
    pointerId = null;
    pointerStart = null;
    paintPrevious = null;
    if (changedArtwork) {
      changed();
      draw();
    }
  }

  function leaveMaskEdit() {
    // A mask eraser must never silently become a destructive image eraser.
    if (maskEditing && (tool === "brush" || tool === "eraser")) tool = "hand";
    maskEditing = false;
  }

  function addLayerMask() {
    const layer = editableLayer();
    if (!layer || masks.has(layer.id)) return;
    if (!checkpoint()) return;
    const mask = imageCanvas();
    const context = mask.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, WIDTH, HEIGHT);
    masks.set(layer.id, mask);
    layer.maskEnabled = true;
    maskEditing = true;
    tool = "eraser"; // Viskelær skjuler i masken; pensel viser innholdet igjen.
    changed();
    refresh();
  }

  function toggleMaskEdit() {
    const layer = currentLayer();
    if (busy || !layer || !layer.visible || layer.locked || !masks.has(layer.id)) return;
    if (maskEditing) {
      leaveMaskEdit();
    } else {
      maskEditing = true;
      tool = "eraser";
    }
    refresh();
    status(maskEditing ? "Rediger maske: Viskelær skjuler, Pensel viser." : "Redigerer lagets originalpiksler.");
  }

  function toggleLayerMask() {
    const layer = currentLayer();
    if (busy || !layer || !masks.has(layer.id)) return;
    if (!checkpoint()) return;
    layer.maskEnabled = layer.maskEnabled === false;
    if (!layer.maskEnabled) leaveMaskEdit();
    changed();
    refresh();
  }

  function removeLayerMask() {
    const layer = editableLayer();
    if (!layer || !masks.has(layer.id)) return;
    if (!checkpoint()) return;
    masks.delete(layer.id);
    delete layer.maskEnabled;
    leaveMaskEdit();
    changed();
    refresh();
  }

  function editableLayer() {
    const layer = currentLayer();
    if (busy || !layer || layer.locked || !layer.visible) {
      status("Velg et synlig, ulåst lag for å redigere.");
      return null;
    }
    return layer;
  }

  function cropActiveLayer() {
    const layer = editableLayer();
    if (!layer || !selection || selection.w < 2 || selection.h < 2) return;
    checkpoint();
    const context = surfaces.get(layer.id).getContext("2d");
    const image = context.getImageData(0, 0, WIDTH, HEIGHT);
    const values = image.data;
    const left = selection.x - layer.x;
    const top = selection.y - layer.y;
    const right = left + selection.w;
    const bottom = top + selection.h;
    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        if (x >= left && x < right && y >= top && y < bottom) continue;
        const index = (y * WIDTH + x) * 4;
        values[index] = values[index + 1] = values[index + 2] = values[index + 3] = 0;
      }
    }
    context.putImageData(image, 0, 0);
    changed();
    refresh();
  }

  function extractSelectionToLayer(removeFromSource) {
    const layer = editableLayer();
    if (!layer || !selection || selection.w < 2 || selection.h < 2) return;
    if (project.layers.length >= MAX_LAYERS) {
      status("Du kan bruke inntil " + MAX_LAYERS + " lag i denne versjonen.");
      return;
    }
    // Marquee coordinates are in document space; layer pixels are local.
    // Read raw RGBA before clearing the source, preserving semi-transparent
    // pixels and exact positioning even when the source layer has moved.
    const x = selection.x - layer.x;
    const y = selection.y - layer.y;
    const context = surfaces.get(layer.id).getContext("2d");
    const pixels = context.getImageData(x, y, selection.w, selection.h);
    let hasPixels = false;
    for (let i = 3; i < pixels.data.length; i += 4) {
      if (pixels.data[i] !== 0) { hasPixels = true; break; }
    }
    if (!hasPixels) {
      status("Ingen piksler i markeringen på valgt lag.");
      return;
    }
    if (!checkpoint()) return;
    const extracted = createLayer(layer.name + (removeFromSource ? " – klippet" : " – utsnitt"), layer.kind);
    Object.assign(extracted, { x: layer.x, y: layer.y, opacity: layer.opacity });
    surfaces.get(extracted.id).getContext("2d").putImageData(pixels, x, y);
    if (masks.has(layer.id)) {
      const maskCopy = imageCanvas();
      const sourceMask = masks.get(layer.id).getContext("2d").getImageData(0, 0, WIDTH, HEIGHT);
      maskCopy.getContext("2d").putImageData(sourceMask, 0, 0);
      masks.set(extracted.id, maskCopy);
      extracted.maskEnabled = layer.maskEnabled !== false;
    }
    if (removeFromSource) context.clearRect(x, y, selection.w, selection.h);
    project.layers.splice(project.layers.indexOf(layer) + 1, 0, extracted);
    selected = extracted.id;
    changed();
    refresh();
  }

  function copySelectionToLayer() { extractSelectionToLayer(false); }
  function cutSelectionToLayer() { extractSelectionToLayer(true); }

  function duplicateActiveLayer() {
    const layer = editableLayer();
    if (!layer || project.layers.length >= MAX_LAYERS) {
      status("Det er ikke plass til flere lag.");
      return;
    }
    checkpoint();
    const clone = createLayer(layer.name + " – kopi", layer.kind);
    Object.assign(clone, { visible: layer.visible, locked: false, opacity: layer.opacity, x: layer.x, y: layer.y });
    const source = surfaces.get(layer.id).getContext("2d").getImageData(0, 0, WIDTH, HEIGHT);
    surfaces.get(clone.id).getContext("2d").putImageData(source, 0, 0);
    if (masks.has(layer.id)) {
      const maskCopy = imageCanvas();
      const sourceMask = masks.get(layer.id).getContext("2d").getImageData(0, 0, WIDTH, HEIGHT);
      maskCopy.getContext("2d").putImageData(sourceMask, 0, 0);
      masks.set(clone.id, maskCopy);
      clone.maskEnabled = layer.maskEnabled !== false;
    }
    project.layers.splice(project.layers.indexOf(layer) + 1, 0, clone);
    selected = clone.id;
    changed(); refresh();
  }

  function transformLayer(mode) {
    const layer = editableLayer();
    if (!layer) return;
    const original = surfaces.get(layer.id);
    const output = imageCanvas();
    const ctx = output.getContext("2d");
    const scale = mode === "smaller" ? 0.75 : mode === "larger" ? 1.25 : 1;
    ctx.save();
    // Layers are drawn at (layer.x, layer.y). Transform in document space,
    // then convert back to local bitmap coordinates before compositing.
    // Without this, a moved layer flips/rotates around the wrong pivot.
    ctx.translate(-layer.x, -layer.y);
    ctx.translate(WIDTH / 2, HEIGHT / 2);
    if (mode === "flip") ctx.scale(-1, 1);
    if (mode === "rotate") ctx.rotate(Math.PI / 2);
    if (scale !== 1) ctx.scale(scale, scale);
    ctx.translate(layer.x, layer.y);
    ctx.drawImage(original, -WIDTH / 2, -HEIGHT / 2);
    ctx.restore();
    let transformedMask = null;
    if (masks.has(layer.id)) {
      transformedMask = imageCanvas();
      const mc = transformedMask.getContext("2d");
      mc.save();
      mc.translate(-layer.x, -layer.y);
      mc.translate(WIDTH / 2, HEIGHT / 2);
      if (mode === "flip") mc.scale(-1, 1);
      if (mode === "rotate") mc.rotate(Math.PI / 2);
      if (scale !== 1) mc.scale(scale, scale);
      mc.translate(layer.x, layer.y);
      mc.drawImage(masks.get(layer.id), -WIDTH / 2, -HEIGHT / 2);
      mc.restore();
    }
    checkpoint();
    surfaces.set(layer.id, output);
    if (transformedMask) masks.set(layer.id, transformedMask);
    changed(); refresh();
  }

  function exportSelection() {
    if (busy || !selection || selection.w < 2 || selection.h < 2) return;
    draw();
    const output = document.createElement("canvas");
    output.width = selection.w;
    output.height = selection.h;
    output.getContext("2d").drawImage(canvas, selection.x, selection.y,
      selection.w, selection.h, 0, 0, selection.w, selection.h);
    output.toBlob((blob) => {
      if (!blob) { status("Kunne ikke eksportere markeringen."); return; }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename() + "-utsnitt.png";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      global.setTimeout(() => URL.revokeObjectURL(url), 1000);
      status("Utsnitt eksportert – prosjektet er uendret");
    }, "image/png");
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
    masks.delete(selected);
    leaveMaskEdit();
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

  async function deleteRecord(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Kunne ikke slette kunstverket."));
      tx.onabort = () => reject(tx.error || new Error("Sletting ble avbrutt."));
    });
  }

  function thumbnail() {
    try {
      draw(); // Thumbnail is the visible composite, not just the active layer.
      const preview = document.createElement("canvas");
      preview.width = 180;
      preview.height = 120;
      preview.getContext("2d").drawImage(canvas, 0, 0, 180, 120);
      return preview.toDataURL("image/png");
    } catch (_) {
      // An image or canvas error must never block saving the editable project.
      return "";
    }
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
    if (project.owner !== owner()) {
      status("Lokal profil er endret. Åpne prosjektet på nytt i riktig profil før lagring.");
      return;
    }
    busy = true;
    try {
      const data = formatRecord();
      const record = {
        ...data, id: project.id, owner: owner(), created_at: project.created_at,
        updated_at: new Date().toISOString(), preview: thumbnail(),
        local_only: true, shared: false, analyzed_image: false
      };
      if (JSON.stringify(record).length > MAX_PROJECT_BYTES) {
        throw new Error("Prosjektet er for stort for lokal lagring.");
      }
      await putRecord(record);
      project.updated_at = record.updated_at;
      dirty = false;
      // Update only an ALREADY explicitly opted-in Aha reference.
      // Saving never creates new references or transfers pixels.
      if (global.AHAKunstrommetReferences?.load?.().some((item) => item.id === record.id)) {
        try { global.AHAKunstrommetReferences.upsert(record); }
        catch (error) { console.warn("Kunne ikke oppdatere eksisterende lokal samlingsreferanse.", error); }
      }
      status("Lagret på denne enheten");
      await renderProjects();
    } catch (error) {
      const isQuotaError = error?.name === "QuotaExceededError" ||
        error?.name === "NS_ERROR_DOM_QUOTA_REACHED";
      status(isQuotaError
        ? "Lagring feilet: Lagringsplassen er full. Eksporter redigerbart prosjekt som sikkerhetskopi før du rydder plass."
        : "Lagring feilet: " + (error?.message || "Ukjent feil") +
          " Eksporter redigerbart prosjekt som sikkerhetskopi.");
    }
    finally { busy = false; }
  }

  function validateMaskBitmap(value) {
    if (typeof value !== "string" ||
        !/^data:image\/png;base64,[a-zA-Z0-9+/=]+$/.test(value) ||
        value.length > MAX_PROJECT_BYTES) {
      throw new Error("Ugyldig lagmaske i prosjektfilen.");
    }
    return value;
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
      bitmap: input.bitmap,
      ...(typeof input.pixelFixups === "string" ? { pixelFixups: input.pixelFixups } : {}),
      ...(Object.prototype.hasOwnProperty.call(input, "maskBitmap") ? {
        maskBitmap: validateMaskBitmap(input.maskBitmap),
        maskEnabled: input.maskEnabled !== false,
        ...(typeof input.maskPixelFixups === "string" ? { maskPixelFixups: input.maskPixelFixups } : {})
      } : {})
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
    const decoded = await decodeLayerBitmaps(layers);
    const now = new Date().toISOString();
    const next = {
      id: sameRecord ? data.id : uid(),
      owner: owner(), title: String(data.title || "").slice(0, 120),
      note: String(data.note || "").slice(0, 4000),
      layers: layers.map(({ bitmap, pixelFixups, maskBitmap, maskPixelFixups, ...meta }) => meta),
      created_at: sameRecord ? data.created_at : now,
      updated_at: now, local_only: true, shared: false, analyzed_image: false
    };
    surfaces.clear();
    masks.clear();
    selection = null;
    maskEditing = false;
    layers.forEach((layer, i) => {
      surfaces.set(layer.id, decoded[i].bitmap);
      if (decoded[i].mask) masks.set(layer.id, decoded[i].mask);
    });
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

  async function duplicateSaved(item) {
    if (busy || item.owner !== owner()) {
      status("Prosjektet kan bare kopieres i riktig lokal profil.");
      return;
    }
    busy = true;
    try {
      const saved = (await getRecords()).find((record) => record.id === item.id);
      if (!saved || !Array.isArray(saved.layers)) throw new Error("Fant ikke originalen i skisseboken.");
      const now = new Date().toISOString();
      const copy = {
        format: "aha-kunstrommet-v2", version: 2, width: WIDTH, height: HEIGHT,
        layers: saved.layers.map((layer) => ({
          id: uid(), name: String(layer.name || "Lag").slice(0, 70),
          kind: layer.kind === "image" ? "image" : "paint",
          visible: layer.visible !== false, locked: layer.locked === true,
          opacity: Number.isFinite(layer.opacity) ? layer.opacity : 1,
          x: Number.isFinite(layer.x) ? layer.x : 0,
          y: Number.isFinite(layer.y) ? layer.y : 0, bitmap: layer.bitmap,
          ...(typeof layer.pixelFixups === "string" ? { pixelFixups: layer.pixelFixups } : {}),
          ...(typeof layer.maskBitmap === "string" ? {
            maskBitmap: layer.maskBitmap,
            maskEnabled: layer.maskEnabled !== false,
            ...(typeof layer.maskPixelFixups === "string" ? { maskPixelFixups: layer.maskPixelFixups } : {})
          } : {})
        })),
        id: uid(), owner: owner(),
        title: (String(saved.title || "Kunstverk").slice(0, 105) + " – kopi").slice(0, 120),
        note: String(saved.note || "").slice(0, 4000),
        preview: typeof saved.preview === "string" ? saved.preview : "",
        created_at: now, updated_at: now,
        local_only: true, shared: false, analyzed_image: false
      };
      if (JSON.stringify(copy).length > MAX_PROJECT_BYTES) {
        throw new Error("Kopien er for stor til å lagres lokalt.");
      }
      await putRecord(copy);
      status("Kopi opprettet i skisseboken – originalen er uendret");
      await renderProjects();
    } catch (error) { status("Kopiering feilet: " + error.message); }
    finally { busy = false; }
  }

  async function deleteSaved(item) {
    if (busy || item.owner !== owner()) {
      status("Prosjektet kan bare slettes i riktig lokal profil.");
      return;
    }
    if (!global.confirm("Slette «" + (item.title || "Uten tittel") +
        "» permanent fra denne nettleseren? Eksporter en prosjektkopi først om du vil beholde det.")) return;
    if (project?.id === item.id && dirty &&
        !global.confirm("Dette er også det åpne prosjektet. Forkaste ulagrede endringer?")) return;
    busy = true;
    let referencesWarning = "";
    try {
      const saved = (await getRecords()).find((record) => record.id === item.id);
      if (!saved) throw new Error("Kunstverket finnes ikke lenger i skisseboken.");
      await deleteRecord(item.id);
      try {
        // Only local, opt-in metadata. The gallery and old V1 database stay intact.
        global.AHAKunstrommetReferences?.remove?.(item.id);
      } catch (error) { referencesWarning = " Noen lokale Aha-lenker kunne ikke ryddes: " + error.message; }
      if (project?.id === item.id) {
        newProject();
      }
      status("Kunstverket er slettet fra den lokale skisseboken." + referencesWarning);
      await renderProjects();
    } catch (error) { status("Sletting feilet: " + error.message); }
    finally { busy = false; }
  }

  async function renderProjects() {
    const mount = $("kv2-projects");
    if (!mount) return;
    mount.replaceChildren();
    try {
      const items = (await getRecords()).sort((a, b) =>
        String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
      const search = String($("kv2-project-search")?.value || "").trim().toLocaleLowerCase("no-NO");
      const found = search ? items.filter((item) =>
        (String(item.title || "") + " " + String(item.note || ""))
          .toLocaleLowerCase("no-NO").includes(search)) : items;
      const visible = found.slice(0, 40);
      const count = $("kv2-project-count");
      if (count) count.textContent = !found.length ? (items.length ? "Ingen treff" : "Ingen lagrede verk ennå")
        : found.length === items.length ? items.length + " lagrede verk"
        : found.length + " treff av " + items.length + " verk";
      if (!visible.length) {
        const empty = document.createElement("p");
        empty.className = "kv2-tip";
        empty.textContent = items.length ? "Prøv et annet søkeord." : "Lag ditt første kunstverk på lerretet.";
        mount.appendChild(empty);
      }
      visible.forEach((item) => {
        const card = document.createElement("article");
        card.className = "kv2-project kv2-project--saved";
        const details = document.createElement("div");
        details.className = "kv2-project-info";
        const text = document.createElement("span");
        text.textContent = item.title || "Uten tittel";
        const date = document.createElement("small");
        const parsed = Date.parse(item.updated_at);
        date.textContent = Number.isFinite(parsed)
          ? new Date(parsed).toLocaleDateString("no-NO") : "";
        details.append(text, date);
        if (typeof item.preview === "string" &&
            /^data:image\/png;base64,[a-zA-Z0-9+/=]+$/.test(item.preview)) {
          const preview = document.createElement("img");
          preview.className = "kv2-project-preview";
          preview.alt = "Forhåndsvisning av " + (item.title || "kunstverket");
          preview.loading = "lazy";
          preview.src = item.preview;
          card.appendChild(preview);
        }
        const actions = document.createElement("div");
        actions.className = "kv2-project-actions";
        actions.append(
          makeButton("Åpne", async () => {
            if (busy || (dirty && !global.confirm("Forkaste endringer som ikke er lagret?"))) return;
            busy = true;
            try { await loadData(item, false, true); }
            catch (error) { status("Kunne ikke åpne: " + error.message); }
            finally { busy = false; }
          }),
          makeButton("Lag kopi", () => duplicateSaved(item)),
          makeButton("Slett", () => deleteSaved(item))
        );
        card.append(details, actions);
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
    $("kv2-duplicate-layer").addEventListener("click", duplicateActiveLayer);
    $("kv2-mask-add").addEventListener("click", addLayerMask);
    $("kv2-mask-edit").addEventListener("click", toggleMaskEdit);
    $("kv2-mask-toggle").addEventListener("click", toggleLayerMask);
    $("kv2-mask-remove").addEventListener("click", removeLayerMask);
    $("kv2-crop-layer").addEventListener("click", cropActiveLayer);
    $("kv2-copy-selection").addEventListener("click", copySelectionToLayer);
    $("kv2-cut-selection").addEventListener("click", cutSelectionToLayer);
    $("kv2-export-selection").addEventListener("click", exportSelection);
    $("kv2-clear-selection").addEventListener("click", () => {
      selection = null; renderSelection(); status("Markering fjernet");
    });
    ["flip", "rotate", "smaller", "larger"].forEach((mode) => {
      $("kv2-transform-" + mode).addEventListener("click", () => transformLayer(mode));
    });
    $("kv2-save").addEventListener("click", save);
    $("kv2-project-search")?.addEventListener("input", () => {
      renderProjects().catch((error) => status("Søk feilet: " + error.message));
    });
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
    ["brush", "eraser", "move", "hand", "select", "eyedropper"].forEach((name) => {
      $("kv2-" + name).addEventListener("click", () => { tool = name; refresh(); });
    });
    $("kv2-zoom-in").addEventListener("click", () => setZoom(zoomIndex + 1));
    $("kv2-zoom-out").addEventListener("click", () => setZoom(zoomIndex - 1));
    $("kv2-zoom-reset").addEventListener("click", () => setZoom(2));
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

  // Stable interface for the gallery/collection bridge: one editor, no second canvas.
  global.AHAKunstrommetV2 = {
    format: "aha-kunstrommet-v2",
    storage: DB_NAME,
    summary() {
      if (!project) return null;
      return {
        id: project.id, owner: project.owner, created_at: project.created_at,
        title: $("kv2-title").value.trim().slice(0, 120),
        note: $("kv2-note").value.trim().slice(0, 4000), dirty
      };
    },
    savedProjects: getRecords,
    async openSaved(id) {
      if (busy || (dirty && !global.confirm("Forkaste endringer som ikke er lagret?"))) return false;
      const record = (await getRecords()).find((item) => item.id === id);
      if (!record) return false;
      busy = true;
      try { await loadData(record, false, true); return true; }
      finally { busy = false; }
    },
    async openLegacyCopy(record) {
      if (busy || (dirty && !global.confirm("Forkaste endringer som ikke er lagret?"))) return false;
      if (!record || record.owner !== owner() || record.format === "aha-kunstrommet-v2") return false;
      busy = true;
      try {
        await loadData({
          format: "aha-kunstrommet-v1",
          title: record.title, note: record.note, strokes: record.strokes
        }, true, false);
        return true;
      } finally { busy = false; }
    }
  };

  bind();
  newProject();
  renderProjects();
})(window);
