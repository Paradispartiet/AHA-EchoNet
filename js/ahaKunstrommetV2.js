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
  // Only standard artistic blend modes; never permit destructive Porter-Duff operations.
  const BLEND_MODES = new Set([
    "normal", "multiply", "screen", "darken", "lighten", "overlay",
    "soft-light", "hard-light", "color-dodge", "color-burn", "difference",
    "exclusion", "hue", "saturation", "color", "luminosity"
  ]);

  // Optional adjustment metadata in the existing V2 project format.
  // Values are bounded before composing CSS Canvas filters from them.
  const ADJUSTMENT_LIMITS = Object.freeze({
    brightness: [50, 150], contrast: [50, 150], saturation: [0, 200]
  });
  const TONE_LIMITS = Object.freeze({ exposure: [-200, 200], temperature: [-100, 100], tint: [-100, 100] });
  const LEVEL_DEFAULTS = Object.freeze({ black: 0, white: 255, gamma: 100 });
  function safeLevels(value) {
    const from = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const black = clamp(Number.isFinite(from.black) ? Math.round(from.black) : 0, 0, 254);
    const white = clamp(Number.isFinite(from.white) ? Math.round(from.white) : 255, black + 1, 255);
    const gamma = clamp(Number.isFinite(from.gamma) ? Math.round(from.gamma) : 100, 25, 400);
    return { black, white, gamma };
  }
  function neutralLevels(levels) {
    return Object.keys(LEVEL_DEFAULTS).every(name => levels[name] === LEVEL_DEFAULTS[name]);
  }
  function levelTable(levels) {
    return Float32Array.from({length: 256}, (_, n) =>
      255 * Math.pow(clamp((n - levels.black) / (levels.white - levels.black), 0, 1), 100 / levels.gamma));
  }
  function mappedLevel(value, table) {
    const n = clamp(value, 0, 255);
    if (!table) return n;
    const low = Math.floor(n), high = Math.min(255, low + 1);
    return table[low] + (table[high] - table[low]) * (n - low);
  }
  const CURVE_CHANNELS = ["rgb", "red", "green", "blue"];
  const CURVE_INPUTS = [0, 64, 128, 192, 255];
  function safeCurves(value) {
    return Object.fromEntries(CURVE_CHANNELS.map(channel => {
      const points = Array.isArray(value?.[channel]) && value[channel].length === 5 ? value[channel] : CURVE_INPUTS;
      return [channel, CURVE_INPUTS.map((n, i) => clamp(Number.isFinite(points[i]) ? Math.round(points[i]) : n, 0, 255))];
    }));
  }
  function neutralCurves(curves) {
    return CURVE_CHANNELS.every(channel => curves[channel].every((n,i) => n === CURVE_INPUTS[i]));
  }
  function curveTable(points) {
    return Float32Array.from({length:256}, (_, n) => {
      const i = n < 64 ? 0 : n < 128 ? 1 : n < 192 ? 2 : 3;
      const t = (n - CURVE_INPUTS[i]) / (CURVE_INPUTS[i+1] - CURVE_INPUTS[i]);
      return points[i] + (points[i+1] - points[i]) * t;
    });
  }
  function selectedCurveChannel() {
    const channel = $("kv2-curve-channel").value;
    return CURVE_CHANNELS.includes(channel) ? channel : "rgb";
  }
  function drawCurveGraph(points) {
    $("kv2-curve-line").setAttribute("points", points.map((n,i) => CURVE_INPUTS[i] + "," + (255-n)).join(" "));
    points.forEach((n,i) => {
      $("kv2-curve-point-" + i).setAttribute("cy", String(255-n));
      $("kv2-curve-value-" + i).textContent = String(n);
    });
  }
  function updateCurveControls(layer = currentLayer()) {
    const active = layer?.kind === "adjustment";
    $("kv2-curve-controls").hidden = !active;
    if (!active) return;
    const curves = safeCurves(layer.curves), channel = selectedCurveChannel();
    const disabled = busy || layer.locked;
    $("kv2-curve-channel").disabled = disabled;
    curves[channel].forEach((n,i) => {
      const control = $("kv2-curve-input-" + i);
      control.value = n;
      control.disabled = disabled;
    });
    $("kv2-curve-reset").disabled = disabled || curves[channel].every((n,i) => n === CURVE_INPUTS[i]);
    drawCurveGraph(curves[channel]);
  }
  function safeTone(value) {
    const from = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return Object.fromEntries(Object.entries(TONE_LIMITS).map(([name, [lo, hi]]) =>
      [name, clamp(Number.isFinite(from[name]) ? Math.round(from[name]) : 0, lo, hi)]));
  }
  function toneLabel(name, value) {
    return name === "exposure" ? (value / 100).toFixed(2) + " EV" : (value > 0 ? "+" : "") + value;
  }
  function safeAdjustments(value) {
    const from = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const result = {};
    Object.keys(ADJUSTMENT_LIMITS).forEach((key) => {
      const n = Number.isFinite(from[key]) ? Math.round(from[key]) : 100;
      const [lo, hi] = ADJUSTMENT_LIMITS[key];
      result[key] = clamp(n, lo, hi);
    });
    return result;
  }
  // Safari/WebKit does not reliably support CanvasRenderingContext2D.filter.
  // Compute a deterministic, non-destructive RGBA preview in ordinary pixels
  // and cache it until either the bitmap or its adjustment values change.
  const adjustedBitmaps = new Map();
  let bitmapRevision = 0;
  function adjustedBitmap(layer, source) {
    const a = safeAdjustments(layer.adjustments);
    if (a.brightness === 100 && a.contrast === 100 && a.saturation === 100) return source;
    const key = [a.brightness, a.contrast, a.saturation].join(":");
    const cached = adjustedBitmaps.get(layer.id);
    if (cached && cached.source === source && cached.revision === bitmapRevision &&
        cached.key === key) return cached.canvas;
    const image = source.getContext("2d").getImageData(0, 0, WIDTH, HEIGHT);
    const pixels = image.data;
    const brightness = a.brightness / 100;
    const contrast = a.contrast / 100;
    const saturation = a.saturation / 100;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] === 0) continue;
      // Apply brightness, then contrast, then saturation consistently on all
      // supported browsers. Keep the original alpha channel exactly intact.
      const r = (pixels[i] * brightness - 128) * contrast + 128;
      const g = (pixels[i + 1] * brightness - 128) * contrast + 128;
      const b = (pixels[i + 2] * brightness - 128) * contrast + 128;
      const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      pixels[i] = gray + (r - gray) * saturation;
      pixels[i + 1] = gray + (g - gray) * saturation;
      pixels[i + 2] = gray + (b - gray) * saturation;
    }
    const result = imageCanvas();
    result.getContext("2d").putImageData(image, 0, 0);
    adjustedBitmaps.set(layer.id, { source, key, revision: bitmapRevision, canvas: result });
    return result;
  }

  const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
  const MAX_PROJECT_BYTES = 36 * 1024 * 1024;
  const MAX_HISTORY = 12;
  const DB_NAME = "aha_kunstrommet_v2";
  const STORE = "projects";
  const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

  // Presets affect drawing only; no project-format or database migration.
  const BRUSH_PRESETS = Object.freeze({
    normal: { width: 1, opacity: 1 },
    blyant: { width: 0.5, opacity: 1 },
    tusj: { width: 1.6, opacity: 1 },
    lasur: { width: 2, opacity: 0.35 }
  });
  const PALETTE = Object.freeze([
    ["blekk", "#23242c"], ["skog", "#2c6557"],
    ["himmel", "#4a83bf"], ["korall", "#d15c4d"],
    ["oker", "#be8e3d"], ["lavendel", "#846eac"],
    ["krem", "#f4e8d3"], ["hvit", "#ffffff"]
  ]);
  function refreshPalette() {
    const color = $("kv2-color").value.toLowerCase();
    PALETTE.forEach(([name, value]) => {
      $("kv2-swatch-" + name).setAttribute("aria-pressed", String(value === color));
    });
  }

  const viewport = $("kv2-paper");
  let zoomIndex = 2;
  let dbPromise = null;
  let project = null;
  let selected = null;
  const moveTogether = new Set(); // Transient selection, not project metadata.
  let tool = "brush";
  let selection = null; // Transient document-coordinate marquee, never saved as pixels.
  let shapeDraft = null; // Transient preview until pointerup.
  let gradientFramePending = false;
  let textEditId = null;
  let freeTransform = null; // UI-only draft, never stored in a project.
  let textAnchor = null; // Local document coordinates; never persisted before commit.
  const TEXT_FONTS = Object.freeze({
    sans: "Arial, sans-serif", serif: "Georgia, serif",
    mono: "Courier New, monospace"
  });
  const textMetrics = imageCanvas().getContext("2d");
  let pointerId = null;
  let pointerStart = null;
  let paintPrevious = null;
  let advancedStroke = null; // Disposable stroke, committed only on pointerup.
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
  function changed() {
    cancelFreeTransform();
    bitmapRevision++;
    dirty = true;
    status("Ulagrede endringer");
  }
  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
  function imageCanvas() {
    const result = document.createElement("canvas");
    result.width = WIDTH;
    result.height = HEIGHT;
    return result;
  }

  function safeGroupName(value) {
    return typeof value === "string" ? value.trim().slice(0, 50) : "";
  }

  function createLayer(name, kind) {
    const layer = {
      id: uid(), name: String(name || "Nytt lag").slice(0, 70),
      kind: kind || "paint", visible: true, locked: false,
      opacity: 1, blendMode: "normal", adjustments: safeAdjustments(null), x: 0, y: 0
    };
    surfaces.set(layer.id, imageCanvas());
    return layer;
  }

  function newProject() {
    moveTogether.clear();
    const now = new Date().toISOString();
    surfaces.clear();
    masks.clear();
    adjustedBitmaps.clear();
    leaveMaskEdit();
    selection = null;
    shapeDraft = null;
    textAnchor = null;
    textEditId = null;
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
    drawComposition(view);
    renderAdvancedStroke();
    $("kv2-histogram-status").textContent = "Oppdater for å måle gjeldende bilde.";
    $("kv2-histogram").hidden = true;
  }

  function updateHistogram() {
    if (busy || pointerId !== null) return;
    draw();
    const pixels = view.getImageData(0, 0, WIDTH, HEIGHT).data;
    const bins = new Uint32Array(32);
    for (let i = 0; i < pixels.length; i += 4) {
      const value = Math.round(.2126 * pixels[i] + .7152 * pixels[i + 1] + .0722 * pixels[i + 2]);
      bins[Math.min(31, Math.floor(value / 8))]++;
    }
    const chart = $("kv2-histogram"), ctx = chart.getContext("2d");
    ctx.clearRect(0, 0, chart.width, chart.height);
    ctx.fillStyle = "#537669";
    const peak = Math.max(1, ...bins), width = chart.width / bins.length;
    bins.forEach((count, i) => {
      const height = count / peak * chart.height;
      ctx.fillRect(i * width, chart.height - height, Math.max(1, width - 1), height);
    });
    const summary = "Synlig bilde: " + Math.round(bins[0] / (WIDTH * HEIGHT) * 100) +
      " % i mørkeste intervall, " + Math.round(bins[31] / (WIDTH * HEIGHT) * 100) + " % i lyseste intervall.";
    $("kv2-histogram-status").textContent = summary;
    chart.hidden = false;
  }

  // An adjustment layer modifies only the composite accumulated below it.
  // Its own opacity and optional mask mix the original and adjusted RGB.
  function applyAdjustmentLayer(target, layer, previewMask = masks.get(layer.id)) {
    const a = safeAdjustments(layer.adjustments);
    const tone = safeTone(layer.toneAdjustments);
    const levels = safeLevels(layer.levels);
    const table = neutralLevels(levels) ? null : levelTable(levels);
    const curves = safeCurves(layer.curves);
    const curveTables = neutralCurves(curves) ? null : CURVE_CHANNELS.map(channel => curveTable(curves[channel]));
    const map = (value, channel) => {
      const leveled = mappedLevel(value, table);
      return curveTables ? mappedLevel(mappedLevel(leveled, curveTables[0]), curveTables[channel]) : leveled;
    };
    if (layer.opacity <= 0 || (a.brightness === 100 && a.contrast === 100 && a.saturation === 100 &&
        Object.values(tone).every(value => value === 0) && !table && !curveTables)) return;
    // Exposure-like RGB gain and relative color balance, not Kelvin calibration.
    const exposure = Math.pow(2, tone.exposure / 100);
    const warmth = tone.temperature / 400, tint = tone.tint / 400;
    const gainR = exposure * (1 + warmth + tint / 2);
    const gainG = exposure * (1 - tint);
    const gainB = exposure * (1 - warmth + tint / 2);
    const image = target.getImageData(0, 0, WIDTH, HEIGHT);
    const p = image.data;
    const mask = layer.maskEnabled !== false && previewMask;
    const alpha = mask ? mask.getContext("2d").getImageData(0, 0, WIDTH, HEIGHT).data : null;
    const brightness = a.brightness / 100, contrast = a.contrast / 100, saturation = a.saturation / 100;
    for (let i = 0; i < p.length; i += 4) {
      const amount = layer.opacity * (alpha ? alpha[i + 3] / 255 : 1);
      if (!amount || !p[i + 3]) continue;
      const r = (p[i] * brightness * gainR - 128) * contrast + 128;
      const g = (p[i + 1] * brightness * gainG - 128) * contrast + 128;
      const b = (p[i + 2] * brightness * gainB - 128) * contrast + 128;
      const gray = .2126 * r + .7152 * g + .0722 * b;
      p[i] += (map(gray + (r - gray) * saturation, 1) - p[i]) * amount;
      p[i + 1] += (map(gray + (g - gray) * saturation, 2) - p[i + 1]) * amount;
      p[i + 2] += (map(gray + (b - gray) * saturation, 3) - p[i + 2]) * amount;
    }
    target.putImageData(image, 0, 0);
  }

  function drawComposition(target, preview = null) {
    target.save();
    target.globalAlpha = 1;
    target.globalCompositeOperation = "source-over";
    target.fillStyle = "#ffffff";
    target.fillRect(0, 0, WIDTH, HEIGHT);
    if (project) project.layers.forEach((layer) => {
      if (!layer.visible) return;
      const activePreview = Array.isArray(preview) ? preview.find(item => item.id === layer.id) : preview?.id === layer.id ? preview : null;
      if (layer.kind === "adjustment") {
        applyAdjustmentLayer(target, layer, activePreview ? activePreview.mask : masks.get(layer.id));
        return;
      }
      const bitmap = activePreview ? activePreview.bitmap : surfaces.get(layer.id);
      if (!bitmap) return;
      target.globalAlpha = layer.opacity;
      // Composite into the document after mask application; don't blend
      // the mask bitmap itself, and don't modify any layer's source pixels.
      // Reset first: browsers ignore unsupported assignments, so a prior layer
      // must never leak its blend mode into the next layer.
      target.globalCompositeOperation = "source-over";
      if (BLEND_MODES.has(layer.blendMode) && layer.blendMode !== "normal") {
        target.globalCompositeOperation = layer.blendMode;
      }
      // Filter the source non-destructively before its mask and blend mode.
      const adjusted = adjustedBitmap(layer, bitmap);
      const mask = layer.maskEnabled !== false && (activePreview ? activePreview.mask : masks.get(layer.id));
      if (!mask) {
        target.drawImage(adjusted, layer.x, layer.y);
      } else {
        const context = maskedComposite.getContext("2d");
        context.save();
        context.globalAlpha = 1;
        context.globalCompositeOperation = "source-over";
        context.clearRect(0, 0, WIDTH, HEIGHT);
        context.drawImage(adjusted, 0, 0);
        context.globalCompositeOperation = "destination-in";
        context.drawImage(mask, 0, 0);
        context.restore();
        target.drawImage(maskedComposite, layer.x, layer.y);
      }
    });
    target.restore();
  }


  // A lasso is a transient polygon in document coordinates; the project format is unchanged.
  function lassoActive() { return selection?.type === "lasso"; }
  function polygonArea(points) {
    let twice = 0;
    points.forEach((p, i) => {
      const q = points[(i + 1) % points.length];
      twice += p.x * q.y - q.x * p.y;
    });
    return Math.abs(twice) / 2;
  }
  function validSelection() {
    return !!selection && selection.w >= 2 && selection.h >= 2 &&
      (!lassoActive() || (selection.points.length >= 3 && polygonArea(selection.points) >= 6));
  }
  function addLassoPoint(p) {
    if (!lassoActive() || selection.points.length >= 2048) return;
    const prev = selection.points[selection.points.length - 1];
    if (Math.hypot(p.x - prev.x, p.y - prev.y) < 1.5) return;
    selection.points.push(p);
    let minX = WIDTH, minY = HEIGHT, maxX = 0, maxY = 0;
    selection.points.forEach((at) => {
      minX = Math.min(minX, at.x); minY = Math.min(minY, at.y);
      maxX = Math.max(maxX, at.x); maxY = Math.max(maxY, at.y);
    });
    selection.x = Math.floor(minX); selection.y = Math.floor(minY);
    selection.w = Math.ceil(maxX) - selection.x;
    selection.h = Math.ceil(maxY) - selection.y;
  }
  function selectionPath(ctx, xOffset, yOffset) {
    ctx.beginPath();
    if (!lassoActive()) {
      ctx.rect(selection.x - xOffset, selection.y - yOffset, selection.w, selection.h);
      return;
    }
    selection.points.forEach((p, i) => {
      if (!i) ctx.moveTo(p.x - xOffset, p.y - yOffset);
      else ctx.lineTo(p.x - xOffset, p.y - yOffset);
    });
    ctx.closePath();
  }
  // Ordered scanline spans: exact pixel-center classification, O(height * vertices + pixels).
  function selectedSpans(y) {
    if (!lassoActive()) return y >= selection.y && y < selection.y + selection.h
      ? [[selection.x, selection.x + selection.w]] : [];
    const points = selection.points, crossing = [];
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      if ((a.y <= y && y < b.y) || (b.y <= y && y < a.y)) {
        crossing.push(a.x + (y - a.y) * (b.x - a.x) / (b.y - a.y));
      }
    }
    crossing.sort((a, b) => a - b);
    const spans = [];
    for (let i = 0; i + 1 < crossing.length; i += 2) {
      const left = Math.ceil(crossing[i] - 0.5);
      const right = Math.ceil(crossing[i + 1] - 0.5);
      if (right > left) spans.push([left, right]);
    }
    return spans;
  }
  function insideSpans(x, spans) {
    return spans.some(([left, right]) => x >= left && x < right);
  }

  function renderSelection() {
    const overlay = $("kv2-selection-overlay");
    if (!overlay) return;
    const rect = canvas.getBoundingClientRect();
    const valid = validSelection();
    const lasso = lassoActive();
    overlay.hidden = !valid || lasso;
    const lassoOverlay = $("kv2-lasso-overlay");
    // SVGElement.hidden is not consistently reflected into the HTML hidden attribute.
    // Explicitly toggle the attribute for both Chromium and iPad WebKit.
    lassoOverlay.toggleAttribute("hidden", !lasso || selection.points.length < 2);
    if (lasso) {
      const path = selection.points.map((p, i) =>
        (i ? "L" : "M") + p.x.toFixed(2) + " " + p.y.toFixed(2)).join(" ");
      $("kv2-lasso-path").setAttribute("d", path + (valid ? " Z" : ""));
    }
    if (valid && !lasso) {
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
    $("kv2-fill-selection").disabled = !(valid && active && active.visible && !active.locked && !maskEditing);
    $("kv2-export-selection").disabled = !valid;
  }

  function normalizedSelection(a, b) {
    const x = Math.round(clamp(Math.min(a.x, b.x), 0, WIDTH));
    const y = Math.round(clamp(Math.min(a.y, b.y), 0, HEIGHT));
    const right = Math.round(clamp(Math.max(a.x, b.x), 0, WIDTH));
    const bottom = Math.round(clamp(Math.max(a.y, b.y), 0, HEIGHT));
    return { x, y, w: right - x, h: bottom - y };
  }



  function textLayout() {
    const raw = $("kv2-text-content").value.replace(/\r\n?/g, "\n");
    if (raw.length > 280) return { error: "Bruk høyst 280 tegn." };
    if (!raw.trim()) return { error: "Skriv tekst før du legger den til." };
    const lines = raw.split("\n");
    if (lines.length > 5) return { error: "Bruk høyst fem tekstlinjer." };
    const fontSize = clamp(Math.round(Number($("kv2-text-size").value) || 48), 14, 120);
    const family = TEXT_FONTS[$("kv2-text-font").value] || TEXT_FONTS.sans;
    const bold = $("kv2-text-bold").checked;
    const font = (bold ? "bold " : "") + fontSize + "px " + family;
    textMetrics.font = font;
    const width = Math.max(...lines.map(line => textMetrics.measureText(line).width));
    const lineHeight = Math.ceil(fontSize * 1.25), height = lineHeight * lines.length;
    if (width > WIDTH - 24) return { error: "Tekstlinjen er for bred. Del teksten over flere linjer eller velg mindre størrelse." };
    if (height > HEIGHT - 24) return { error: "Teksten er for høy. Bruk færre linjer eller mindre skrift." };
    // Keep the entire raster text inside the 1200×800 document after a tap.
    const left = textAnchor ? clamp(Math.round(textAnchor.x), 12, Math.max(12, Math.floor(WIDTH - width - 12))) : 12;
    const top = textAnchor ? clamp(Math.round(textAnchor.y), 12, Math.max(12, HEIGHT - height - 12)) : 12;
    return { lines, font, family, fontSize, lineHeight, left, top, bold, width, height };
  }

  function renderTextPreview() {
    const overlay = $("kv2-text-overlay"), label = $("kv2-text-preview");
    const editing = textEditId && currentLayer()?.id === textEditId && currentLayer()?.textData;
    const layout = tool === "text" && textAnchor ? textLayout() : null;
    const valid = !!layout && !layout.error;
    const visible = valid && !editing;
    const preview = $("kv2-text-edit-preview");
    const showEdit = editing && valid;
    preview.hidden = !showEdit;
    if (showEdit) {
      const bitmap = imageCanvas();
      paintText(bitmap, layout, $("kv2-color").value);
      drawComposition(preview.getContext("2d"), {
        id: textEditId, bitmap, mask: masks.get(textEditId)
      });
    }
    // WebKit may fire a textarea change event while the confirmation button
    // is being pressed. Do not replace its text node or relayout the panel
    // during that pointer sequence when the visible state has not changed.
    const commit = $("kv2-text-commit");
    const hint = $("kv2-text-hint");
    const warning = $("kv2-text-warning");
    const caption = editing ? "Oppdater tekstlag" : "Legg tekst på lag";
    const tip = editing
      ? "Se endringene på lerretet. Bekreft for å oppdatere laget."
      : "Skriv tekst og trykk på lerretet for å velge plassering. Teksten kan redigeres etterpå.";
    const message = tool === "text" && layout?.error ? layout.error : "";
    if (commit.textContent !== caption) commit.textContent = caption;
    if (hint.textContent !== tip) hint.textContent = tip;
    if (warning.textContent !== message) warning.textContent = message;
    overlay.toggleAttribute("hidden", !visible);
    label.replaceChildren();
    if (visible) {
      label.setAttribute("font-family", layout.family);
      label.setAttribute("font-size", String(layout.fontSize));
      label.setAttribute("font-weight", layout.bold ? "700" : "400");
      label.setAttribute("fill", $("kv2-color").value);
      layout.lines.forEach((line, index) => {
        const span = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
        span.setAttribute("x", String(layout.left));
        span.setAttribute("y", String(layout.top + index * layout.lineHeight + layout.fontSize));
        span.textContent = line;
        label.appendChild(span);
      });
    }
    const disabled = busy || !project || maskEditing || !textAnchor ||
      (editing ? currentLayer().locked || !currentLayer().visible : project.layers.length >= MAX_LAYERS) || !valid;
    if (commit.disabled !== disabled) commit.disabled = disabled;
  }

  function clearTextDraft() {
    textAnchor = null;
    textEditId = null;
  }

  function editTextLayer() {
    const layer = currentLayer();
    if (busy || maskEditing || !layer?.textData || layer.locked || !layer.visible) return;
    const data = layer.textData;
    textEditId = layer.id;
    textAnchor = { x: data.left, y: data.top };
    $("kv2-text-content").value = data.content;
    $("kv2-text-font").value = data.family;
    $("kv2-text-size").value = data.size;
    $("kv2-text-bold").checked = data.bold;
    $("kv2-color").value = data.color;
    tool = "text";
    refresh();
    status("Rediger tekstlaget og bekreft når du er ferdig.");
  }

  function rasterizeTextLayer() {
    const layer = currentLayer();
    if (busy || maskEditing || !layer?.textData || layer.locked || !layer.visible) return;
    if (!checkpoint()) return;
    delete layer.textData;
    clearTextDraft();
    tool = "move";
    changed();
    refresh();
    status("Teksten er gjort om til piksler. Angre for å få tilbake redigerbar tekst.");
  }

  function paintText(bitmap, layout, color) {
    const context = bitmap.getContext("2d");
    context.clearRect(0, 0, WIDTH, HEIGHT);
    context.save();
    context.font = layout.font;
    context.textBaseline = "top";
    context.fillStyle = color;
    context.globalAlpha = 1;
    layout.lines.forEach((line, index) => {
      context.fillText(line, layout.left, layout.top + index * layout.lineHeight);
    });
    context.restore();
  }

  function commitText() {
    const existing = textEditId ? currentLayer() : null;
    if (busy || !project || maskEditing || (textEditId
      ? !existing?.textData || existing.id !== textEditId || existing.locked || !existing.visible
      : project.layers.length >= MAX_LAYERS)) {
      status("Avslutt maskeredigering eller velg et tilgjengelig lag.");
      return;
    }
    if (!textAnchor) { status("Trykk på lerretet der teksten skal begynne."); return; }
    const layout = textLayout();
    if (layout.error) { status(layout.error); return; }
    if (!checkpoint()) return;
    const text = layout.lines.join(" ").trim();
    const layer = existing || createLayer("Tekst · " + text.slice(0, 55), "paint");
    if (!existing) {
      const pos = project.layers.findIndex(item => item.id === selected);
      project.layers.splice(pos + 1, 0, layer);
    }
    layer.textData = {
      content: layout.lines.join("\n"),
      family: $("kv2-text-font").value,
      size: layout.fontSize, bold: layout.bold,
      color: $("kv2-color").value, left: layout.left, top: layout.top
    };
    paintText(surfaces.get(layer.id), layout, layer.textData.color);
    selected = layer.id;
    clearTextDraft();
    tool = "move";
    changed();
    refresh();
    status(existing ? "Tekstlaget er oppdatert." : "Tekst lagt på eget lag. Flytt laget for å plassere det videre.");
  }

  function isShapeTool() {
    return ["rectangle", "ellipse", "line", "arrow", "gradient"].includes(tool);
  }
  function isLinearShape(kind) { return kind === "line" || kind === "arrow" || kind === "gradient"; }
  function shapeValid(draft) {
    if (!draft) return false;
    if (isLinearShape(draft.kind)) {
      return Math.hypot(draft.end.x - draft.start.x, draft.end.y - draft.start.y) >= 3;
    }
    const bounds = normalizedSelection(draft.start, draft.end);
    return bounds.w >= 2 && bounds.h >= 2;
  }
  function arrowTip(start, end, width) {
    const dx = end.x - start.x, dy = end.y - start.y;
    const len = Math.hypot(dx, dy);
    if (len < 3) return null;
    const length = Math.min(len * 0.45, Math.max(10, Math.min(42, width * 3)));
    const wing = length * 0.48, ux = dx / len, uy = dy / len;
    return [
      { x: end.x - ux * length - uy * wing, y: end.y - uy * length + ux * wing },
      { x: end.x - ux * length + uy * wing, y: end.y - uy * length - ux * wing }
    ];
  }
  function shapeGeometry(context, box, offsetX, offsetY, kind) {
    const x = box.x - offsetX, y = box.y - offsetY;
    context.beginPath();
    if (kind === "rectangle") context.rect(x, y, box.w, box.h);
    else context.ellipse(x + box.w / 2, y + box.h / 2,
      box.w / 2, box.h / 2, 0, 0, Math.PI * 2);
  }
  function renderShapePreview() {
    const svg = $("kv2-shape-overlay"), path = $("kv2-shape-path");
    const visible = shapeValid(shapeDraft);
    if (visible && shapeDraft.kind === "gradient") queueGradientPreview();
    else $("kv2-gradient-live").hidden = true;
    svg.toggleAttribute("hidden", !visible);
    if (!visible) { path.setAttribute("d", ""); return; }
    const draft = shapeDraft, b = normalizedSelection(draft.start, draft.end);
    let outline;
    if (isLinearShape(draft.kind)) {
      // Direction matters for arrows: never normalize the two endpoints.
      const a = draft.start, z = draft.end;
      outline = "M " + a.x + " " + a.y + " L " + z.x + " " + z.y;
      if (draft.kind === "arrow") {
        const tips = arrowTip(a, z, Number($("kv2-size").value) || 6);
        outline += " M " + tips[0].x + " " + tips[0].y +
          " L " + z.x + " " + z.y + " L " + tips[1].x + " " + tips[1].y;
      }
    } else if (draft.kind === "rectangle") {
      outline = "M " + b.x + " " + b.y + " h " + b.w +
        " v " + b.h + " h " + (-b.w) + " Z";
    } else {
      const x = b.x, y = b.y, w = b.w, h = b.h;
      outline = "M " + (x + w) + " " + (y + h / 2) +
        " A " + (w / 2) + " " + (h / 2) + " 0 1 0 " + x + " " + (y + h / 2) +
        " A " + (w / 2) + " " + (h / 2) + " 0 1 0 " + (x + w) + " " + (y + h / 2) + " Z";
    }
    const filled = !isLinearShape(draft.kind) && $("kv2-shape-style").value === "fill";
    path.setAttribute("d", outline);
    path.setAttribute("stroke", $("kv2-color").value);
    path.setAttribute("stroke-width", draft.kind === "gradient" ? "3" : filled ? "1" : String(Number($("kv2-size").value) || 6));
    path.setAttribute("fill", filled ? $("kv2-color").value : "none");
    path.setAttribute("fill-opacity", filled ? "0.3" : "1");
  }
  function gradientLayer(draft) {
    const layer = currentLayer();
    if (!shapeValid(draft) || !layer || draft.layerId !== layer.id || layer.locked ||
        !layer.visible || busy || draft.onMask !== maskEditing) return null;
    if (draft.onMask ? !masks.has(layer.id) || layer.maskEnabled === false :
        layer.textData || layer.kind === "adjustment") return null;
    return layer;
  }

  function queueGradientPreview() {
    if (gradientFramePending) return;
    gradientFramePending = true;
    global.requestAnimationFrame(() => {
      gradientFramePending = false;
      const draft = shapeDraft, layer = draft?.kind === "gradient" && tool === "gradient" ? gradientLayer(draft) : null;
      const live = $("kv2-gradient-live");
      if (!layer) { live.hidden = true; return; }
      // Copy the exact source pixels into a disposable surface. The real
      // bitmap, mask, history, export and save paths remain untouched.
      const original = draft.onMask ? masks.get(layer.id) : surfaces.get(layer.id);
      const scratch = imageCanvas(), context = scratch.getContext("2d");
      context.putImageData(original.getContext("2d").getImageData(0, 0, WIDTH, HEIGHT), 0, 0);
      paintGradient(context, draft, layer, draft.onMask);
      const preview = { id: layer.id,
        bitmap: draft.onMask ? surfaces.get(layer.id) : scratch,
        mask: draft.onMask ? scratch : masks.get(layer.id) };
      drawComposition(live.getContext("2d"), preview);
      adjustedBitmaps.delete(layer.id);
      live.hidden = false;
    });
  }

  function paintGradient(context, draft, layer, mask) {
    const x = draft.start.x - layer.x, y = draft.start.y - layer.y;
    const ex = draft.end.x - layer.x, ey = draft.end.y - layer.y;
    const gradient = draft.radial
      ? context.createRadialGradient(x, y, 0, x, y, Math.hypot(ex-x, ey-y))
      : context.createLinearGradient(x, y, ex, ey);
    const colors = mask ? ["#ffffff", "rgba(255,255,255,0)"]
      : [draft.first, draft.transparent ? draft.first + "00" : draft.last];
    if (draft.reverse) colors.reverse();
    gradient.addColorStop(0, colors[0]); gradient.addColorStop(1, colors[1]);
    context.save();
    context.globalCompositeOperation = "source-over";
    context.globalAlpha = 1;
    if (validSelection()) { selectionPath(context, layer.x, layer.y); context.clip(); }
    // A mask gradient replaces alpha only within the chosen region.
    // A raster gradient paints over the existing pixels normally.
    if (mask) context.clearRect(0, 0, WIDTH, HEIGHT);
    context.fillStyle = gradient;
    context.fillRect(0, 0, WIDTH, HEIGHT);
    context.restore();
  }

  function commitGradient(draft) {
    const layer = gradientLayer(draft);
    if (!layer || !checkpoint()) return false;
    const mask = draft.onMask ? masks.get(layer.id) : null;
    paintGradient((mask || surfaces.get(layer.id)).getContext("2d"), draft, layer, !!mask);
    changed();
    return true;
  }

  function commitShape() {
    if (shapeDraft?.kind === "gradient") return commitGradient(shapeDraft);
    const layer = currentLayer();
    if (!shapeValid(shapeDraft) || !layer || layer.textData || layer.locked || !layer.visible || busy || maskEditing ||
        !checkpoint()) return false;
    const context = surfaces.get(layer.id).getContext("2d");
    context.save();
    context.globalCompositeOperation = "source-over";
    context.globalAlpha = 1;
    context.fillStyle = $("kv2-color").value;
    context.strokeStyle = $("kv2-color").value;
    context.lineWidth = Number($("kv2-size").value) || 6;
    context.lineJoin = "round";
    context.lineCap = "round";
    if (validSelection()) {
      selectionPath(context, layer.x, layer.y);
      context.clip();
    }
    if (isLinearShape(shapeDraft.kind)) {
      const a = shapeDraft.start, b = shapeDraft.end;
      context.beginPath();
      context.moveTo(a.x - layer.x, a.y - layer.y);
      context.lineTo(b.x - layer.x, b.y - layer.y);
      context.stroke();
      if (shapeDraft.kind === "arrow") {
        const tips = arrowTip(a, b, context.lineWidth);
        context.beginPath();
        context.moveTo(b.x - layer.x, b.y - layer.y);
        context.lineTo(tips[0].x - layer.x, tips[0].y - layer.y);
        context.lineTo(tips[1].x - layer.x, tips[1].y - layer.y);
        context.closePath();
        context.fill();
      }
    } else {
      const bounds = normalizedSelection(shapeDraft.start, shapeDraft.end);
      shapeGeometry(context, bounds, layer.x, layer.y, shapeDraft.kind);
      if ($("kv2-shape-style").value === "fill") context.fill();
      else context.stroke();
    }
    context.restore();
    changed();
    return true;
  }

  function paintOnLayer(layer, a, b) {
    // Live strokes must invalidate cached adjusted rasters before redraw.
    bitmapRevision++;
    const targetMask = maskEditing ? masks.get(layer.id) : null;
    const context = (targetMask || surfaces.get(layer.id)).getContext("2d");
    if (!selection || selection.w < 2 || selection.h < 2) {
      drawSegment(context, a, b, !!targetMask);
      return;
    }
    context.save();
    selectionPath(context, layer.x, layer.y);
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
        ...(safeGroupName(layer.groupName) ? { groupName: safeGroupName(layer.groupName) } : {}),
        visible: layer.visible, locked: layer.locked, opacity: layer.opacity,
        blendMode: BLEND_MODES.has(layer.blendMode) ? layer.blendMode : "normal",
        adjustments: safeAdjustments(layer.adjustments),
        ...(layer.kind === "adjustment" ? { toneAdjustments: safeTone(layer.toneAdjustments), levels: safeLevels(layer.levels), curves: safeCurves(layer.curves) } : {}),
        x: layer.x, y: layer.y,
        ...(layer.textData ? { textData: { ...layer.textData } } : {}),
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
    cancelFreeTransform();
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
    adjustedBitmaps.clear();
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
      clearTextDraft();
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
      // refresh() ran while busy was true, so restore disabled sliders and
      // reset control after undo/redo completes.
      updateLayerControls();
      renderTextPreview();
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
    for (const id of moveTogether) {
      if (!project.layers.some(layer => layer.id === id && layer.visible && !layer.locked)) moveTogether.delete(id);
    }
    mount.replaceChildren();
    project.layers.slice().reverse().forEach((layer) => {
      const row = document.createElement("div");
      row.className = "kv2-layer" + (selected === layer.id ? " kv2-selected" : "");
      const choose = makeButton(layer.name + (layer.kind === "adjustment" ? " · justering" : "") + (masks.has(layer.id) ? " · maske" : ""), () => {
        leaveMaskEdit();
        selected = layer.id;
        clearTextDraft();
        refresh();
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
      const include = document.createElement("input");
      include.type = "checkbox";
      include.className = "kv2-move-together";
      include.setAttribute("aria-label", "Flytt sammen med aktivt lag: " + layer.name);
      include.checked = moveTogether.has(layer.id);
      include.disabled = layer.kind === "adjustment" || !layer.visible || layer.locked;
      include.addEventListener("change", () => {
        if (busy || pointerId !== null) { include.checked = moveTogether.has(layer.id); return; }
        cancelFreeTransform();
        if (include.checked) moveTogether.add(layer.id);
        else moveTogether.delete(layer.id);
        updateMoveCount();
      });
      row.append(visibility, choose, lock, include);
      if (safeGroupName(layer.groupName)) {
        const label = document.createElement("small");
        label.className = "kv2-group-label";
        label.textContent = "Gruppe: " + layer.groupName;
        row.appendChild(label);
      }
      mount.appendChild(row);
    });
    const active = currentLayer();
    $("kv2-active-layer").textContent = active ? active.name : "Ingen lag";
    updateMoveCount();
  }

  function updateMoveCount() {
    const count = project.layers.filter(layer => layer.kind !== "adjustment" && layer.visible && !layer.locked &&
      (layer.id === selected || moveTogether.has(layer.id))).length;
    $("kv2-move-count").textContent = count + " lag ved Flytt lag";
    $("kv2-clear-move-group").disabled = moveTogether.size === 0;
    $("kv2-group-save").disabled = count < 2;
    $("kv2-transform-group").disabled = count < 2;
    renderNamedGroups();
  }

  function renderNamedGroups() {
    const control = $("kv2-group-select");
    const previous = control.value;
    const option = (label, value) => {
      const node = document.createElement("option");
      node.textContent = label;
      node.value = value;
      return node;
    };
    const names = [...new Set(project.layers.map(layer => safeGroupName(layer.groupName)).filter(Boolean))];
    control.replaceChildren(option("Velg laggruppe", ""), ...names.map(name => option(name, name)));
    control.value = names.includes(previous) ? previous : "";
    ["select", "dissolve", "hide", "show", "lock", "unlock"].forEach(action => {
      $("kv2-group-" + action + "-action").disabled = !control.value;
    });
  }

  function groupAction(action) {
    if (busy || pointerId !== null) return;
    const name = $("kv2-group-select").value;
    const members = project.layers.filter(layer => name && layer.groupName === name);
    if (!members.length) return;
    if (action === "select") {
      const movable = members.filter(layer => layer.kind !== "adjustment" && layer.visible && !layer.locked);
      if (!movable.length) { status("Gruppen har ingen synlige, ulåste lag."); return; }
      leaveMaskEdit();
      clearTextDraft();
      selected = movable[movable.length - 1].id;
      moveTogether.clear();
      movable.forEach(layer => { if (layer.id !== selected) moveTogether.add(layer.id); });
      tool = "move";
      refresh();
      status("Valgt laggruppe: " + name);
      return;
    }
    if (!checkpoint()) return;
    members.forEach(layer => {
      if (action === "dissolve") delete layer.groupName;
      else if (action === "hide" || action === "show") layer.visible = action === "show";
      else if (action === "lock" || action === "unlock") layer.locked = action === "lock";
    });
    if (!currentLayer()?.visible || currentLayer()?.locked) leaveMaskEdit();
    changed(); refresh();
  }

  function saveNamedGroup() {
    if (busy || pointerId !== null) return;
    const name = safeGroupName($("kv2-group-name").value);
    const members = project.layers.filter(layer => layer.kind !== "adjustment" && layer.visible && !layer.locked &&
      (layer.id === selected || moveTogether.has(layer.id)));
    if (!name || members.length < 2) { status("Skriv gruppenavn og velg minst to lag."); return; }
    if (project.layers.some(layer => layer.groupName === name && !members.includes(layer))) {
      status("Gruppenavnet finnes allerede. Velg et annet navn."); return;
    }
    if (members.some(layer => layer.groupName && layer.groupName !== name)) {
      status("Løs opp eksisterende grupper før du omgrupperer disse lagene."); return;
    }
    if (!checkpoint()) return;
    members.forEach(layer => { layer.groupName = name; });
    $("kv2-group-name").value = "";
    changed(); refresh();
    $("kv2-group-select").value = name;
    renderNamedGroups();
    status("Laggruppe opprettet: " + name);
  }

  function updateLayerControls() {
    const layer = currentLayer();
    $("kv2-transform-free").disabled = !layer || layer.kind === "adjustment" || !layer.visible || layer.locked || !!layer.textData || busy || maskEditing;
    $("kv2-opacity").value = layer ? Math.round(layer.opacity * 100) : 100;
    $("kv2-opacity-value").textContent = $("kv2-opacity").value + "%";
    $("kv2-blend-mode").value = layer?.blendMode || "normal";
    $("kv2-blend-mode").disabled = !layer || layer.kind === "adjustment" || busy;
    $("kv2-adjust-scope").textContent = layer?.kind === "adjustment"
      ? "Justeringslag: påvirker alle synlige lag under, inkludert papiret. Opasitet styrer effekten."
      : "Bildejusteringer påvirker bare aktivt lag.";
    const adjustments = safeAdjustments(layer?.adjustments);
    Object.keys(ADJUSTMENT_LIMITS).forEach((name) => {
      $("kv2-adjust-" + name).value = adjustments[name];
      $("kv2-adjust-" + name).disabled = !layer || layer.locked || busy;
      $("kv2-adjust-" + name + "-value").textContent = adjustments[name] + "%";
    });
    const isAdjustment = layer?.kind === "adjustment";
    const tone = safeTone(layer?.toneAdjustments);
    $("kv2-tone-controls").hidden = !isAdjustment;
    Object.keys(TONE_LIMITS).forEach(name => {
      $("kv2-tone-" + name).value = tone[name];
      $("kv2-tone-" + name).disabled = !isAdjustment || layer.locked || busy;
      $("kv2-tone-" + name + "-value").textContent = toneLabel(name, tone[name]);
    });
    const levels = safeLevels(layer?.levels);
    $("kv2-level-controls").hidden = !isAdjustment;
    $("kv2-level-black").max = "254";
    $("kv2-level-white").min = "1";
    updateCurveControls(layer);
    Object.keys(LEVEL_DEFAULTS).forEach(name => {
      const control = $("kv2-level-" + name);
      control.value = levels[name];
      control.disabled = !isAdjustment || layer.locked || busy;
      $("kv2-level-" + name + "-value").textContent = name === "gamma" ? (levels[name] / 100).toFixed(2) : String(levels[name]);
    });
    $("kv2-level-black").max = String(levels.white - 1);
    $("kv2-level-white").min = String(levels.black + 1);
    $("kv2-level-reset").disabled = !isAdjustment || layer.locked || busy || neutralLevels(levels);
    $("kv2-adjust-reset").disabled = !layer || layer.locked || busy ||
      (Object.values(adjustments).every(value => value === 100) &&
        (!isAdjustment || (Object.values(tone).every(value => value === 0) && neutralLevels(levels) &&
          neutralCurves(safeCurves(layer.curves)))));
    $("kv2-rename").value = layer ? layer.name : "";
    $("kv2-layer-up").disabled = !layer || project.layers.indexOf(layer) === project.layers.length - 1;
    $("kv2-layer-down").disabled = !layer || project.layers.indexOf(layer) === 0;
    $("kv2-remove-layer").disabled = project.layers.length <= 1;
    const textEditable = !!layer?.textData && layer.visible && !layer.locked && !busy && !maskEditing;
    $("kv2-text-edit").disabled = !textEditable;
    $("kv2-text-rasterize").disabled = !textEditable;
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
    showSnapGuides();
    cancelFreeTransform();
    if (textEditId && (tool !== "text" || currentLayer()?.id !== textEditId ||
        !currentLayer()?.textData || currentLayer().locked || !currentLayer().visible || maskEditing)) clearTextDraft();
    draw();
    renderLayerList();
    updateLayerControls();
    ["brush", "eraser", "move", "hand", "select", "lasso", "eyedropper", "rectangle", "ellipse", "line", "arrow", "gradient", "text"].forEach((name) => {
      $("kv2-" + name).setAttribute("aria-pressed", String(tool === name));
    });
    canvas.style.cursor = tool === "hand" ? "grab" : tool === "move" ? "move" : "crosshair";
    refreshPalette();
    $("kv2-zoom-value").textContent = Math.round(ZOOM_LEVELS[zoomIndex] * 100) + "%";
    $("kv2-zoom-out").disabled = zoomIndex === 0;
    $("kv2-zoom-in").disabled = zoomIndex === ZOOM_LEVELS.length - 1;
    $("kv2-layer-count").textContent = project.layers.length + " av " + MAX_LAYERS + " lag";
    $("kv2-duplicate-layer").disabled = project.layers.length >= MAX_LAYERS;
    renderSelection();
    $("kv2-shape-style").disabled = isLinearShape(tool);
    renderShapePreview();
    $("kv2-brush-advanced").hidden = !advancedBrushEnabled();
    if (advancedBrushEnabled()) renderBrushLibrary();
    $("kv2-gradient-panel").hidden = tool !== "gradient";
    $("kv2-gradient-mask-note").textContent = maskEditing
      ? "Maskemodus: synlig til skjult, eller motsatt ved Reverser. Fargene ignoreres."
      : "Dra fra start til slutt. Se fargeovergangen direkte før du slipper. Bruk eget lag for å bevare originalen.";
    $("kv2-text-panel").hidden = tool !== "text";
    renderTextPreview();
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

  function advancedBrushEnabled() {
    return tool === "brush" && !maskEditing && $("kv2-brush-preset").value === "advanced";
  }

  function brushSettings() {
    const pct = (name, fallback, min = 0) => {
      const value = Number($("kv2-brush-" + name).value);
      return clamp(Number.isFinite(value) ? value : fallback, min, 100) / 100;
    };
    return { size: clamp(Number($("kv2-size").value) || 6, 1, 60),
      color: $("kv2-color").value, hardness: pct("hardness", 50),
      opacity: pct("opacity", 100), flow: pct("flow", 35, 1),
      spacing: pct("spacing", 20, 5), pressureWidth: $("kv2-brush-pressure-width").checked,
      pressureFlow: $("kv2-brush-pressure-flow").checked };
  }

  const BRUSH_LIBRARY_LIMIT = 30;
  const BRUSH_DEFAULTS = Object.freeze({size:6, color:"#23242c", hardness:.5, opacity:1, flow:.35, spacing:.2, pressureWidth:true, pressureFlow:false});
  function safeBrushSettings(value) {
    const input = value && typeof value === "object" ? value : {};
    const number = (name, lo, hi) => clamp(Number.isFinite(input[name]) ? input[name] : BRUSH_DEFAULTS[name], lo, hi);
    return {size:Math.round(number("size",1,60)),
      color:typeof input.color === "string" && /^#[0-9a-f]{6}$/i.test(input.color) ? input.color.toLowerCase() : BRUSH_DEFAULTS.color,
      hardness:number("hardness",0,1), opacity:number("opacity",0,1),
      flow:number("flow",.01,1), spacing:number("spacing",.05,1),
      pressureWidth:typeof input.pressureWidth === "boolean" ? input.pressureWidth : true,
      pressureFlow:input.pressureFlow === true};
  }
  function brushLibraryKey() {
    return "aha_kunstrommet_v2_brushes:" + encodeURIComponent(owner());
  }
  function readBrushLibrary() {
    const raw = global.localStorage.getItem(brushLibraryKey());
    if (!raw) return [];
    if (raw.length > 40000) throw new Error("Penselbiblioteket er for stort.");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("Ugyldig penselbibliotek.");
    const names = new Set();
    return parsed.slice(0,BRUSH_LIBRARY_LIMIT).map(item => ({
      name:typeof item?.name === "string" ? item.name.trim().slice(0,50) : "",
      settings:safeBrushSettings(item?.settings)
    })).filter(item => {
      if (!item.name || names.has(item.name)) return false;
      names.add(item.name); return true;
    });
  }
  function brushLibraryMessage(message) {
    $("kv2-brush-library-status").textContent = message;
  }
  function renderBrushLibrary(preferred) {
    const select = $("kv2-brush-library");
    const previous = typeof preferred === "string" ? preferred : select.value;
    let entries;
    try { entries = readBrushLibrary(); }
    catch (_) {
      select.replaceChildren();
      ["save","load","delete","export","import"].forEach(action => { $("kv2-brush-library-" + action).disabled = true; });
      brushLibraryMessage("Kunne ikke lese lokale pensler. Eksisterende data er ikke overskrevet.");
      return;
    }
    const option = (name,value) => {
      const node = document.createElement("option"); node.textContent=name; node.value=value; return node;
    };
    select.replaceChildren(option("Velg egen pensel",""),...entries.map(item=>option(item.name,item.name)));
    select.value=entries.some(item=>item.name===previous) ? previous : "";
    $("kv2-brush-library-save").disabled = false;
    $("kv2-brush-library-export").disabled = !entries.length;
    $("kv2-brush-library-import").disabled = false;
    $("kv2-brush-library-load").disabled = !select.value;
    $("kv2-brush-library-delete").disabled = !select.value;
    brushLibraryMessage(entries.length + " av " + BRUSH_LIBRARY_LIMIT + " egne pensler på denne enheten.");
  }
  function writeBrushLibrary(entries, preferred, message) {
    try {
      global.localStorage.setItem(brushLibraryKey(), JSON.stringify(entries));
      renderBrushLibrary(preferred);
      brushLibraryMessage(message);
    } catch (_) { brushLibraryMessage("Kunne ikke lagre penselbiblioteket. Kontroller lokal lagring."); }
  }
  function saveOwnBrush() {
    if (busy || pointerId !== null || !advancedBrushEnabled()) return;
    const name = $("kv2-brush-name").value.trim().slice(0,50);
    if (!name) { brushLibraryMessage("Skriv et navn på penselen."); return; }
    try {
      const entries = readBrushLibrary();
      const index = entries.findIndex(item=>item.name===name);
      if (index < 0 && entries.length >= BRUSH_LIBRARY_LIMIT) { brushLibraryMessage("Biblioteket er fullt. Slett en pensel først."); return; }
      if (index >= 0 && !global.confirm("Erstatt den lagrede penselen «" + name + "»?")) return;
      const item = {name,settings:safeBrushSettings(brushSettings())};
      if (index >= 0) entries[index]=item; else entries.push(item);
      writeBrushLibrary(entries,name,"Pensel lagret lokalt: " + name);
    } catch (_) { brushLibraryMessage("Kunne ikke lese lokale pensler. Ingen overskriving."); }
  }
  function applyBrushSettings(value) {
    const settings = safeBrushSettings(value);
    $("kv2-brush-preset").value="advanced";
    $("kv2-size").value=settings.size;
    $("kv2-size-value").textContent=String(settings.size);
    $("kv2-color").value=settings.color;
    ["hardness","opacity","flow","spacing"].forEach(name=>{
      const n=Math.round(settings[name]*100);
      $("kv2-brush-"+name).value=n;
      $("kv2-brush-"+name+"-value").textContent=n+"%";
    });
    $("kv2-brush-pressure-width").checked=settings.pressureWidth;
    $("kv2-brush-pressure-flow").checked=settings.pressureFlow;
    tool="brush"; refresh();
  }
  function loadOwnBrush() {
    if (busy || pointerId !== null || !advancedBrushEnabled()) return;
    try {
      const item=readBrushLibrary().find(item=>item.name===$("kv2-brush-library").value);
      if (!item) return;
      $("kv2-brush-name").value=item.name;
      applyBrushSettings(item.settings);
      brushLibraryMessage("Pensel valgt: " + item.name);
    } catch (_) { brushLibraryMessage("Kunne ikke åpne penselen."); }
  }
  function deleteOwnBrush() {
    if (busy || pointerId !== null || !advancedBrushEnabled()) return;
    try {
      const name=$("kv2-brush-library").value;
      const entries=readBrushLibrary();
      if (!entries.some(item=>item.name===name) || !global.confirm("Slett penselen «" + name + "»?")) return;
      writeBrushLibrary(entries.filter(item=>item.name!==name),"","Pensel slettet: " + name);
    } catch (_) { brushLibraryMessage("Kunne ikke lese lokale pensler. Ingen sletting."); }
  }

  function exportBrushLibrary() {
    if (busy || pointerId !== null || !advancedBrushEnabled()) return;
    try {
      const brushes = readBrushLibrary();
      download("mine-pensler.kunstrommet.json",
        JSON.stringify({format:"aha-kunstrommet-brushes",version:1,brushes},null,2), "application/json");
      brushLibraryMessage("Eksporterte " + brushes.length + " pensler. Ingen kunstverk eller profil-ID følger med.");
    } catch (_) { brushLibraryMessage("Kunne ikke eksportere penselbiblioteket."); }
  }
  async function importBrushLibrary(file) {
    const input = $("kv2-brush-library-import");
    if (!file || busy || pointerId !== null || !advancedBrushEnabled()) { input.value=""; return; }
    const key = brushLibraryKey();
    try {
      if (file.size > 40000) throw new Error("Penselfilen er for stor.");
      const data = JSON.parse(await file.text());
      if (data?.format !== "aha-kunstrommet-brushes" || data.version !== 1 ||
          !Array.isArray(data.brushes) || data.brushes.length > BRUSH_LIBRARY_LIMIT) {
        throw new Error("Velg en gyldig penselbibliotekfil.");
      }
      const names = new Set();
      const incoming = data.brushes.map(item => {
        const name = typeof item?.name === "string" ? item.name.trim() : "";
        const s = item?.settings;
        if (!name || name.length > 50 || names.has(name) || !s ||
            typeof s !== "object" || Array.isArray(s) ||
            !["size","hardness","opacity","flow","spacing"].every(k=>Number.isFinite(s[k])) ||
            typeof s.color !== "string" || !/^#[0-9a-f]{6}$/i.test(s.color) ||
            typeof s.pressureWidth !== "boolean" || typeof s.pressureFlow !== "boolean") {
          throw new Error("Penselfilen har ugyldige eller gjentatte pensler.");
        }
        names.add(name);
        return {name,settings:safeBrushSettings(s)};
      });
      // Re-read after awaiting the file. Never write into a changed profile.
      if (key !== brushLibraryKey() || busy || pointerId !== null || !advancedBrushEnabled()) {
        throw new Error("Profilen eller verktøyet er endret. Prøv igjen.");
      }
      const existing = readBrushLibrary();
      const used = new Set(existing.map(item=>item.name));
      const added = incoming.filter(item=>!used.has(item.name));
      if (existing.length + added.length > BRUSH_LIBRARY_LIMIT) {
        throw new Error("Ikke nok plass. Ingen pensler er importert.");
      }
      if (!added.length) {
        brushLibraryMessage("Ingen nye pensler. " + (incoming.length-added.length) + " navn finnes allerede.");
        return;
      }
      writeBrushLibrary([...existing,...added],added[0].name,
        "Importerte " + added.length + " pensler. Hoppet over " + (incoming.length-added.length) + " eksisterende navn.");
    } catch (error) { brushLibraryMessage("Import avbrutt: " + error.message); }
    finally { input.value=""; }
  }

  function advancedPoint(event, layer) {
    const at = point(event), pressure = event.pointerType === "pen" &&
      Number.isFinite(event.pressure) && event.pressure > 0 ? clamp(event.pressure, 0, 1) : 0.5;
    return { x: at.x - layer.x, y: at.y - layer.y,
      pressure, width: penPressure(event), pen: event.pointerType === "pen" };
  }

  function brushDab(stroke, at) {
    const { settings: s, layer } = stroke;
    const ctx = stroke.ink.getContext("2d");
    const radius = Math.max(.5, s.size * (s.pressureWidth ? at.width : 1) / 2);
    const flow = s.flow * (s.pressureFlow && at.pen ? at.pressure : 1);
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = flow;
    if (validSelection()) { selectionPath(ctx, layer.x, layer.y); ctx.clip(); }
    if (s.hardness >= .999) ctx.fillStyle = s.color;
    else {
      const gradient = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, radius);
      gradient.addColorStop(0, s.color);
      gradient.addColorStop(s.hardness, s.color);
      gradient.addColorStop(1, s.color + "00");
      ctx.fillStyle = gradient;
    }
    ctx.beginPath(); ctx.arc(at.x, at.y, radius, 0, 2*Math.PI); ctx.fill();
    ctx.restore();
  }

  function beginAdvancedStroke(layer, event) {
    const settings = brushSettings(), first = advancedPoint(event, layer);
    advancedStroke = { layer, source: surfaces.get(layer.id), settings,
      ink: imageCanvas(), composite: imageCanvas(), previous: first,
      spacing: Math.max(.5, settings.size * settings.spacing), remaining: 0 };
    brushDab(advancedStroke, first);
    advancedStroke.remaining = advancedStroke.spacing;
    drawSoon();
  }

  function advanceBrush(event) {
    const stroke = advancedStroke;
    if (!stroke) return;
    const a = stroke.previous, b = advancedPoint(event, stroke.layer);
    const length = Math.hypot(b.x-a.x,b.y-a.y);
    if (length > 0) {
      let distance = stroke.remaining;
      while (distance <= length) {
        const t = distance / length;
        brushDab(stroke, { x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t,
          pressure:a.pressure+(b.pressure-a.pressure)*t, width:a.width+(b.width-a.width)*t, pen:b.pen });
        distance += stroke.spacing;
      }
      stroke.remaining = distance - length;
    }
    stroke.previous = b;
  }

  function validAdvancedStroke(stroke) {
    return stroke && currentLayer() === stroke.layer && surfaces.get(stroke.layer.id) === stroke.source &&
      !busy && advancedBrushEnabled() && stroke.layer.visible && !stroke.layer.locked;
  }

  function advancedComposite(stroke) {
    const ctx = stroke.composite.getContext("2d");
    ctx.putImageData(stroke.source.getContext("2d").getImageData(0,0,WIDTH,HEIGHT),0,0);
    ctx.save(); ctx.globalCompositeOperation="source-over"; ctx.globalAlpha=stroke.settings.opacity;
    ctx.drawImage(stroke.ink,0,0); ctx.restore();
    return stroke.composite;
  }

  function renderAdvancedStroke() {
    const live = $("kv2-brush-live"), stroke = advancedStroke;
    if (!validAdvancedStroke(stroke)) { live.hidden = true; return; }
    adjustedBitmaps.delete(stroke.layer.id);
    drawComposition(live.getContext("2d"), { id:stroke.layer.id, bitmap:advancedComposite(stroke), mask:masks.get(stroke.layer.id) });
    adjustedBitmaps.delete(stroke.layer.id);
    live.hidden = false;
  }

  function finishAdvancedStroke(event) {
    const stroke = advancedStroke;
    const commit = event.type === "pointerup" && validAdvancedStroke(stroke) && stroke.settings.opacity > 0;
    if (commit && Number.isFinite(event.clientX) && Number.isFinite(event.clientY) && event.pressure > 0) advanceBrush(event);
    advancedStroke = null;
    pointerId = null; pointerStart = null; paintPrevious = null;
    $("kv2-brush-live").hidden = true;
    if (commit && checkpoint()) {
      const ctx = stroke.source.getContext("2d");
      ctx.save(); ctx.globalCompositeOperation="source-over"; ctx.globalAlpha=stroke.settings.opacity;
      ctx.drawImage(stroke.ink,0,0); ctx.restore();
      changed();
    }
    draw();
  }

  function drawSegment(context, a, b, onMask) {
    const size = Number($("kv2-size").value) || 6;
    // Eraser and white mask-restoring strokes always retain original, opaque
    // behavior. Only ordinary bitmap brush strokes use the chosen preset.
    const chosen = BRUSH_PRESETS[$("kv2-brush-preset").value] || BRUSH_PRESETS.normal;
    const preset = tool === "brush" && !onMask ? chosen : BRUSH_PRESETS.normal;
    context.save();
    context.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
    context.globalAlpha = preset.opacity;
    context.strokeStyle = onMask ? "#ffffff" : $("kv2-color").value;
    context.fillStyle = tool === "eraser" ? "#000000" : onMask ? "#ffffff" : $("kv2-color").value;
    const first = Number.isFinite(a.pressureFactor) ? a.pressureFactor : 1;
    const last = b && Number.isFinite(b.pressureFactor) ? b.pressureFactor : first;
    context.lineWidth = tool === "eraser" ? size * 2 : size * (first + last) / 2 * preset.width;
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

  // Snapshot the original nontransparent bitmap bounds only once per move gesture.
  // Masked-out pixels are deliberately included; this is the layer's geometry.
  function snapBounds(layer) {
    const data = surfaces.get(layer.id).getContext("2d").getImageData(0, 0, WIDTH, HEIGHT).data;
    let left = WIDTH, right = 0, top = HEIGHT, bottom = 0;
    for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
      if (!data[(y * WIDTH + x) * 4 + 3]) continue;
      left = Math.min(left, x); right = Math.max(right, x + 1);
      top = Math.min(top, y); bottom = Math.max(bottom, y + 1);
    }
    return right > left && bottom > top ? { left, right, top, bottom } : null;
  }

  function groupSnapBounds(moving, active) {
    let result = null;
    for (const layer of moving) {
      const b = snapBounds(layer);
      if (!b) continue;
      const dx = layer.x - active.x, dy = layer.y - active.y;
      const p = { left: b.left + dx, right: b.right + dx, top: b.top + dy, bottom: b.bottom + dy };
      result = result ? { left: Math.min(result.left, p.left), right: Math.max(result.right, p.right),
        top: Math.min(result.top, p.top), bottom: Math.max(result.bottom, p.bottom) } : p;
    }
    return result;
  }

  function snapTargets(moving) {
    const movingIds = new Set(moving.map(layer => layer.id));
    const x = [WIDTH / 2, 0, WIDTH], y = [HEIGHT / 2, 0, HEIGHT];
    for (const layer of project.layers) {
      if (movingIds.has(layer.id) || !layer.visible || layer.opacity <= 0) continue;
      const b = snapBounds(layer);
      if (!b) continue;
      x.push(layer.x + (b.left + b.right) / 2, layer.x + b.left, layer.x + b.right);
      y.push(layer.y + (b.top + b.bottom) / 2, layer.y + b.top, layer.y + b.bottom);
    }
    return { x: x.filter(v => v >= 0 && v <= WIDTH), y: y.filter(v => v >= 0 && v <= HEIGHT) };
  }

  function nearestSnap(offset, anchors, targets, tolerance) {
    let best = null;
    for (const anchor of anchors) for (const target of targets) {
      const delta = target - (offset + anchor);
      if (Math.abs(delta) <= tolerance && (!best || Math.abs(delta) < Math.abs(best.delta))) {
        best = { delta, target };
      }
    }
    return best;
  }

  function showSnapGuides(x = null, y = null) {
    const overlay = $("kv2-snap-guides");
    const vertical = $("kv2-snap-x"), horizontal = $("kv2-snap-y");
    overlay.toggleAttribute("hidden", x === null && y === null);
    vertical.style.display = x === null ? "none" : "";
    horizontal.style.display = y === null ? "none" : "";
    if (x !== null) {
      vertical.setAttribute("x1", x); vertical.setAttribute("x2", x);
    }
    if (y !== null) {
      horizontal.setAttribute("y1", y); horizontal.setAttribute("y2", y);
    }
    if (x !== null || y !== null) {
      const box = canvas.getBoundingClientRect();
      overlay.style.width = box.width + "px";
      overlay.style.height = box.height + "px";
    }
  }

  function begin(event) {
    if (busy || !project || pointerId !== null ||
        (event.pointerType === "mouse" && event.button !== 0)) return;
    cancelFreeTransform();
    if (tool === "text") {
      event.preventDefault();
      if (maskEditing) { status("Avslutt maskeredigering før du legger til tekst."); return; }
      if (textEditId) { status("Bekreft teksten først; flytt deretter laget med Flytt."); return; }
      textAnchor = point(event);
      renderTextPreview();
      status("Tekstposisjon valgt. Trykk «Legg tekst på lag» når du er fornøyd.");
      return;
    }
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
    if (tool !== "hand" && tool !== "select" && tool !== "lasso" &&
        (!layer || layer.locked || !layer.visible)) {
      status("Velg et synlig, ulåst lag før du arbeider.");
      return;
    }
    if (layer?.kind === "adjustment" && (tool === "move" || (isShapeTool() && tool !== "gradient") ||
        (!maskEditing && (tool === "brush" || tool === "eraser" || tool === "gradient")))) {
      status("Justeringslag har ingen tegnbare piksler. Rediger justeringene eller lagmasken.");
      return;
    }
    if (layer?.textData && !maskEditing && (tool === "brush" || tool === "eraser" || isShapeTool())) {
      status("Gjør tekstlaget om til piksler før du tegner direkte på det.");
      return;
    }
    // Moving the viewport is never an artwork edit and must not create undo history.
    const advanced = advancedBrushEnabled();
    if (tool !== "hand" && tool !== "select" && tool !== "lasso" && !isShapeTool() && !advanced && !checkpoint()) return;
    event.preventDefault();
    pointerId = event.pointerId;
    const moving = tool === "move" && layer ? project.layers.filter(item =>
      item.kind !== "adjustment" && item.visible && !item.locked && (item.id === layer.id || moveTogether.has(item.id))) : [];
    pointerStart = {
      point: point(event), x: layer?.x || 0, y: layer?.y || 0,
      clientX: event.clientX, clientY: event.clientY,
      scrollLeft: viewport.scrollLeft || 0, scrollTop: viewport.scrollTop || 0,
      moving: moving.map(item => ({ id: item.id, x: item.x, y: item.y })),
      snapBounds: moving.length && $("kv2-snap-enabled").checked ? groupSnapBounds(moving, layer) : null,
      snapTargets: moving.length && $("kv2-snap-enabled").checked ? snapTargets(moving) : null
    };
    paintPrevious = null;
    if (isShapeTool()) {
      if (maskEditing && tool !== "gradient") {
        pointerId = null; pointerStart = null;
        status("Avslutt maskeredigering før du tegner figurer.");
        return;
      }
      shapeDraft = { kind: tool, start: pointerStart.point, end: pointerStart.point,
        ...(tool === "gradient" ? {
          layerId: layer.id, onMask: maskEditing,
          radial: $("kv2-gradient-type").value === "radial",
          transparent: $("kv2-gradient-end").value === "transparent",
          first: $("kv2-color").value, last: $("kv2-gradient-color").value,
          reverse: $("kv2-gradient-reverse").checked
        } : {}) };
      renderShapePreview();
    }
    if (tool === "select") {
      selection = normalizedSelection(pointerStart.point, pointerStart.point);
      renderSelection();
    } else if (tool === "lasso") {
      const p = pointerStart.point;
      selection = { type: "lasso", points: [p], x: Math.floor(p.x),
        y: Math.floor(p.y), w: 0, h: 0 };
      renderSelection();
    }
    if (advanced) beginAdvancedStroke(layer, event);
    else if (tool === "brush" || tool === "eraser") {
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
    if (advancedStroke) {
      if (validAdvancedStroke(advancedStroke)) {
        const samples = event.getCoalescedEvents?.() || [];
        for (const sample of samples) advanceBrush(sample);
        advanceBrush(event);
        drawSoon();
      }
      return;
    }
    if (tool === "hand") {
      viewport.scrollLeft = Math.max(0, pointerStart.scrollLeft + pointerStart.clientX - event.clientX);
      viewport.scrollTop = Math.max(0, pointerStart.scrollTop + pointerStart.clientY - event.clientY);
      return;
    }
    if (isShapeTool()) {
      if (shapeDraft) shapeDraft.end = point(event);
      renderShapePreview();
      return;
    }
    if (tool === "select") {
      selection = normalizedSelection(pointerStart.point, point(event));
      renderSelection();
      return;
    }
    if (tool === "lasso") {
      addLassoPoint(point(event));
      renderSelection();
      return;
    }
    const layer = currentLayer();
    if (!layer) return;
    const at = point(event);
    if (tool === "move") {
      let x = pointerStart.x + at.x - pointerStart.point.x;
      let y = pointerStart.y + at.y - pointerStart.point.y;
      const b = pointerStart.snapBounds;
      if (b && pointerStart.snapTargets && $("kv2-snap-enabled").checked && !event.altKey) {
        const box = canvas.getBoundingClientRect();
        const sx = nearestSnap(x, [(b.left + b.right) / 2, b.left, b.right],
          pointerStart.snapTargets.x, 8 * WIDTH / Math.max(1, box.width));
        const sy = nearestSnap(y, [(b.top + b.bottom) / 2, b.top, b.bottom],
          pointerStart.snapTargets.y, 8 * HEIGHT / Math.max(1, box.height));
        if (sx) x += sx.delta;
        if (sy) y += sy.delta;
        showSnapGuides(sx?.target ?? null, sy?.target ?? null);
      } else showSnapGuides();
      const dx = Math.round(x) - pointerStart.x, dy = Math.round(y) - pointerStart.y;
      for (const start of pointerStart.moving) {
        const item = project.layers.find(candidate => candidate.id === start.id);
        if (item && item.visible && !item.locked) {
          item.x = start.x + dx;
          item.y = start.y + dy;
        }
      }
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
    showSnapGuides();
    if (advancedStroke) { finishAdvancedStroke(event); return; }
    if (isShapeTool()) {
      const complete = event.type === "pointerup" && !!shapeDraft;
      if (complete && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
        shapeDraft.end = point(event);
      }
      const painted = complete && commitShape();
      shapeDraft = null;
      pointerId = null; pointerStart = null; paintPrevious = null;
      renderShapePreview();
      if (painted) { draw(); status(tool === "gradient" ? "Gradient lagt til" : "Figur lagt til på valgt lag"); }
      return;
    }
    const changedArtwork = tool !== "hand" && tool !== "select" && tool !== "lasso";
    if (tool === "select" || tool === "lasso") {
      if (tool === "lasso" && event?.clientX != null) addLassoPoint(point(event));
      if (!validSelection()) selection = null;
      renderSelection();
      status(selection ? (lassoActive()
        ? "Frihåndsområde markert – arbeid på valgt lag"
        : "Område markert – arbeid på valgt lag") : "Ingen markering");
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
    if (maskEditing && (tool === "brush" || tool === "eraser" || tool === "gradient")) tool = "hand";
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

  function requiresRaster(layer) {
    if (layer?.kind === "adjustment") {
      status("Justeringslag har ingen rasterpiksler å redigere.");
      return true;
    }
    if (!layer?.textData) return false;
    status("Gjør tekstlaget om til piksler før denne redigeringen.");
    return true;
  }

  function fillSelection() {
    const layer = editableLayer();
    if (!layer || maskEditing || !selection || selection.w < 2 || selection.h < 2) {
      if (maskEditing) status("Avslutt maskeredigering før du fyller bildelaget.");
      return;
    }
    if (requiresRaster(layer)) return;
    // The marquee is in document coordinates, while raster layer pixels
    // are local. Intersect the two rectangles so moved layers behave
    // correctly and an off-canvas selection never adds an undo entry.
    const x0 = Math.max(0, selection.x - layer.x);
    const y0 = Math.max(0, selection.y - layer.y);
    const x1 = Math.min(WIDTH, selection.x + selection.w - layer.x);
    const y1 = Math.min(HEIGHT, selection.y + selection.h - layer.y);
    if (x1 <= x0 || y1 <= y0) {
      status("Markeringen er utenfor valgt lag.");
      return;
    }
    if (!checkpoint()) return;
    const context = surfaces.get(layer.id).getContext("2d");
    context.save();
    context.globalAlpha = 1;
    context.globalCompositeOperation = "source-over";
    context.fillStyle = $("kv2-color").value;
    selectionPath(context, layer.x, layer.y);
    context.clip();
    context.fillRect(x0, y0, x1 - x0, y1 - y0);
    context.restore();
    changed();
    refresh();
  }

  function cropActiveLayer() {
    const layer = editableLayer();
    if (!layer || !selection || selection.w < 2 || selection.h < 2 || requiresRaster(layer)) return;
    checkpoint();
    const context = surfaces.get(layer.id).getContext("2d");
    const image = context.getImageData(0, 0, WIDTH, HEIGHT);
    const values = image.data;
    const left = selection.x - layer.x;
    const top = selection.y - layer.y;
    const right = left + selection.w;
    const bottom = top + selection.h;
    for (let y = 0; y < HEIGHT; y++) {
      const spans = lassoActive() ? selectedSpans(y + layer.y + 0.5) : null;
      for (let x = 0; x < WIDTH; x++) {
        const keep = spans ? insideSpans(x + layer.x, spans)
          : x >= left && x < right && y >= top && y < bottom;
        if (keep) continue;
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
    if (layer.kind === "adjustment" || (removeFromSource && requiresRaster(layer))) return;
    // Marquee coordinates are in document space; layer pixels are local.
    // Read raw RGBA before clearing the source, preserving semi-transparent
    // pixels and exact positioning even when the source layer has moved.
    const x = selection.x - layer.x;
    const y = selection.y - layer.y;
    const context = surfaces.get(layer.id).getContext("2d");
    const pixels = context.getImageData(x, y, selection.w, selection.h);
    const maskedCut = lassoActive() && removeFromSource
      ? context.getImageData(x, y, selection.w, selection.h) : null;
    if (lassoActive()) {
      for (let row = 0; row < selection.h; row++) {
        const spans = selectedSpans(selection.y + row + 0.5);
        for (let col = 0; col < selection.w; col++) {
          const index = (row * selection.w + col) * 4;
          if (insideSpans(selection.x + col, spans)) {
            if (maskedCut) maskedCut.data.fill(0, index, index + 4);
          } else pixels.data.fill(0, index, index + 4);
        }
      }
    }
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
    Object.assign(extracted, {
      x: layer.x, y: layer.y, opacity: layer.opacity, blendMode: layer.blendMode || "normal",
      adjustments: safeAdjustments(layer.adjustments)
    });
    surfaces.get(extracted.id).getContext("2d").putImageData(pixels, x, y);
    if (masks.has(layer.id)) {
      const maskCopy = imageCanvas();
      const sourceMask = masks.get(layer.id).getContext("2d").getImageData(0, 0, WIDTH, HEIGHT);
      maskCopy.getContext("2d").putImageData(sourceMask, 0, 0);
      masks.set(extracted.id, maskCopy);
      extracted.maskEnabled = layer.maskEnabled !== false;
    }
    if (maskedCut) context.putImageData(maskedCut, x, y);
    else if (removeFromSource) context.clearRect(x, y, selection.w, selection.h);
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
    Object.assign(clone, { visible: layer.visible, locked: false, opacity: layer.opacity,
      blendMode: layer.blendMode || "normal", adjustments: safeAdjustments(layer.adjustments),
      x: layer.x, y: layer.y });
    if (layer.textData) clone.textData = { ...layer.textData };
    if (layer.kind === "adjustment") {
      clone.toneAdjustments = safeTone(layer.toneAdjustments);
      clone.levels = safeLevels(layer.levels);
      clone.curves = safeCurves(layer.curves);
    }
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

  // Same document-center pivot and local bitmap bounds as the preset transforms.
  function transformedSurface(source, layer, degrees, scaleX, scaleY, pivot = { x: WIDTH / 2, y: HEIGHT / 2 }) {
    const output = imageCanvas();
    const ctx = output.getContext("2d");
    ctx.translate(-layer.x, -layer.y);
    ctx.translate(pivot.x, pivot.y);
    ctx.rotate(degrees * Math.PI / 180);
    ctx.scale(scaleX, scaleY);
    ctx.translate(layer.x, layer.y);
    ctx.drawImage(source, -pivot.x, -pivot.y);
    return output;
  }

  function transformResult(layer, degrees, scaleX, scaleY, pivot) {
    return {
      id: layer.id,
      bitmap: transformedSurface(surfaces.get(layer.id), layer, degrees, scaleX, scaleY, pivot),
      mask: masks.has(layer.id)
        ? transformedSurface(masks.get(layer.id), layer, degrees, scaleX, scaleY, pivot) : null
    };
  }

  function applyTransform(result) {
    if (!checkpoint()) return;
    for (const item of Array.isArray(result) ? result : [result]) {
      surfaces.set(item.id, item.bitmap);
      if (item.mask) masks.set(item.id, item.mask);
    }
    changed();
    refresh();
  }

  function transformLayer(mode) {
    const layer = editableLayer();
    if (!layer || requiresRaster(layer)) return;
    const scale = mode === "smaller" ? 0.75 : mode === "larger" ? 1.25 : 1;
    applyTransform(transformResult(layer, mode === "rotate" ? 90 : 0,
      mode === "flip" ? -1 : scale, scale));
  }

  function cancelFreeTransform() {
    if (!freeTransform) return;
    const drag = freeTransform.drag;
    freeTransform = null;
    const overlay = $("kv2-transform-overlay");
    if (drag && overlay.hasPointerCapture?.(drag.id)) overlay.releasePointerCapture(drag.id);
    overlay.toggleAttribute("hidden", true);
    $("kv2-transform-live").hidden = true;
    $("kv2-free-transform-panel").hidden = true;
    // Drop any preview-only adjusted bitmap cache entry.
    adjustedBitmaps.clear();
  }

  function freeTransformLayer() {
    const layer = currentLayer();
    if (!freeTransform || layer?.id !== freeTransform.id || busy || maskEditing ||
        pointerId !== null) return null;
    return freeTransform.ids.every(id => {
      const item = project.layers.find(candidate => candidate.id === id);
      return item && item.kind !== "adjustment" && item.visible && !item.locked && !item.textData;
    }) ? layer : null;
  }

  function freeTransformResults(values) {
    return freeTransform.ids.map(id => transformResult(
      project.layers.find(layer => layer.id === id), values.degrees, values.x, values.y, freeTransform.pivot));
  }

  function freeTransformValues() {
    const controls = ["angle", "x", "y"].map(name => $("kv2-free-" + name));
    if (controls.some(control => !control.validity.valid || !control.value.trim())) return null;
    const [degrees, x, y] = controls.map(control => Number(control.value));
    if (![degrees, x, y].every(Number.isFinite)) return null;
    return { degrees, x: x / 100, y: y / 100 };
  }

  function renderFreeTransform() {
    const layer = freeTransformLayer();
    if (!layer) { cancelFreeTransform(); return; }
    const values = freeTransformValues();
    $("kv2-free-commit").disabled = !values ||
      (values.degrees === 0 && values.x === 1 && values.y === 1);
    $("kv2-free-warning").textContent = values ? "" : "Bruk vinkel −180 til 180 og skala 10 til 300 %.";
    const result = values ? freeTransformResults(values) : null;
    const preview = $("kv2-free-preview").getContext("2d");
    drawComposition(preview, result);
    const live = $("kv2-transform-live"), overlay = $("kv2-transform-overlay");
    const rect = canvas.getBoundingClientRect();
    [live, overlay].forEach(node => { node.style.width = rect.width + "px"; node.style.height = rect.height + "px"; });
    live.hidden = false;
    live.getContext("2d").drawImage($("kv2-free-preview"), 0, 0);
    overlay.toggleAttribute("hidden", false);
    renderTransformHandles(values || { degrees: 0, x: 1, y: 1 });
  }

  // Bounds are computed once from original alpha, not from the preview or mask.
  function transformBounds(layer) {
    const pixels = surfaces.get(layer.id).getContext("2d").getImageData(0, 0, WIDTH, HEIGHT).data;
    let left = WIDTH, right = 0, top = HEIGHT, bottom = 0;
    for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
      if (!pixels[(y * WIDTH + x) * 4 + 3]) continue;
      left = Math.min(left, x); right = Math.max(right, x + 1);
      top = Math.min(top, y); bottom = Math.max(bottom, y + 1);
    }
    if (right <= left || bottom <= top) return { left: 150, right: WIDTH - 150, top: 100, bottom: HEIGHT - 100 };
    // Provide a usable grab area even for a dot; it is a UI frame, not a crop.
    const cx = (left + right) / 2 + layer.x, cy = (top + bottom) / 2 + layer.y;
    const hw = Math.max(70, (right - left) / 2), hh = Math.max(70, (bottom - top) / 2);
    return { left: cx - hw, right: cx + hw, top: cy - hh, bottom: cy + hh };
  }

  function transformPoint(p, values, pivot) {
    const theta = values.degrees * Math.PI / 180, c = Math.cos(theta), s = Math.sin(theta);
    const x = (p.x - pivot.x) * values.x, y = (p.y - pivot.y) * values.y;
    return { x: pivot.x + x * c - y * s, y: pivot.y + x * s + y * c };
  }

  function renderTransformHandles(values) {
    const { bounds: b, pivot } = freeTransform;
    const cx = (b.left + b.right) / 2, cy = (b.top + b.bottom) / 2;
    const points = {
      nw: [b.left, b.top], n: [cx, b.top], ne: [b.right, b.top],
      w: [b.left, cy], e: [b.right, cy], sw: [b.left, b.bottom],
      s: [cx, b.bottom], se: [b.right, b.bottom]
    };
    const mapped = {};
    Object.entries(points).forEach(([key, p]) => {
      mapped[key] = transformPoint({ x: p[0], y: p[1] }, values, pivot);
    });
    const overlay = $("kv2-transform-overlay");
    const units = WIDTH / Math.max(1, overlay.getBoundingClientRect().width);
    const theta = values.degrees * Math.PI / 180;
    mapped.rotate = { x: mapped.n.x + Math.sin(theta) * 30 * units,
      y: mapped.n.y - Math.cos(theta) * 30 * units };
    mapped.pivot = pivot;
    $("kv2-transform-frame").setAttribute("points", ["nw", "ne", "se", "sw"].map(key => mapped[key].x + "," + mapped[key].y).join(" "));
    const stem = $("kv2-transform-stem");
    ["x1", "y1", "x2", "y2"].forEach((name, i) => stem.setAttribute(name, [mapped.n.x, mapped.n.y, mapped.rotate.x, mapped.rotate.y][i]));
    Object.entries(mapped).forEach(([key, p]) => {
      const handle = $("kv2-handle-" + key);
      handle.setAttribute("cx", p.x); handle.setAttribute("cy", p.y);
      handle.setAttribute("r", (key === "pivot" ? 8 : 9) * units);
    });
  }

  function transformPointer(event) {
    const rect = $("kv2-transform-overlay").getBoundingClientRect();
    return { x: (event.clientX - rect.left) * WIDTH / rect.width,
      y: (event.clientY - rect.top) * HEIGHT / rect.height };
  }

  function beginTransformDrag(event) {
    const key = event.target.getAttribute("data-transform-handle");
    const values = freeTransformValues();
    if (!freeTransformLayer() || freeTransform.drag || !key || !values ||
        (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    const p = transformPointer(event);
    freeTransform.drag = { id: event.pointerId, key, p, values, pivot: { ...freeTransform.pivot } };
    try { $("kv2-transform-overlay").setPointerCapture(event.pointerId); } catch (_) {}
  }

  function moveTransformDrag(event) {
    const drag = freeTransform?.drag;
    if (!drag || drag.id !== event.pointerId) return;
    event.preventDefault();
    const p = transformPointer(event), origin = drag.pivot, v = drag.values;
    if (drag.key === "pivot") {
      freeTransform.pivot = { x: clamp(origin.x + p.x - drag.p.x, 0, WIDTH),
        y: clamp(origin.y + p.y - drag.p.y, 0, HEIGHT) };
    } else if (drag.key === "rotate") {
      const a = Math.atan2(drag.p.y - origin.y, drag.p.x - origin.x);
      const b = Math.atan2(p.y - origin.y, p.x - origin.x);
      const degrees = ((v.degrees + (b - a) * 180 / Math.PI + 540) % 360) - 180;
      $("kv2-free-angle").value = Math.round(degrees);
    } else {
      const theta = v.degrees * Math.PI / 180, c = Math.cos(theta), s = Math.sin(theta);
      const local = q => ({ x: (q.x - origin.x) * c + (q.y - origin.y) * s,
        y: -(q.x - origin.x) * s + (q.y - origin.y) * c });
      const start = local(drag.p), end = local(p);
      const xAxis = /[ew]/.test(drag.key), yAxis = /[ns]/.test(drag.key);
      let x = v.x, y = v.y;
      if ($("kv2-free-ratio").checked) {
        const denominator = (xAxis ? start.x ** 2 : 0) + (yAxis ? start.y ** 2 : 0);
        if (denominator > 1) {
          const ratio = ((xAxis ? start.x * end.x : 0) + (yAxis ? start.y * end.y : 0)) / denominator;
          x = y = v.x * ratio;
        }
      } else {
        if (xAxis && Math.abs(start.x) > 1) x = v.x * end.x / start.x;
        if (yAxis && Math.abs(start.y) > 1) y = v.y * end.y / start.y;
      }
      $("kv2-free-x").value = Math.round(clamp(x * 100, 10, 300));
      $("kv2-free-y").value = Math.round(clamp(y * 100, 10, 300));
    }
    renderFreeTransform();
  }

  function endTransformDrag(event) {
    const drag = freeTransform?.drag;
    if (!drag || drag.id !== event.pointerId) return;
    if (event.type === "pointerup") moveTransformDrag(event);
    else if (event.type === "pointercancel") {
      freeTransform.pivot = drag.pivot;
      $("kv2-free-angle").value = drag.values.degrees;
      $("kv2-free-x").value = Math.round(drag.values.x * 100);
      $("kv2-free-y").value = Math.round(drag.values.y * 100);
      renderFreeTransform();
    }
    freeTransform.drag = null;
    const overlay = $("kv2-transform-overlay");
    if (overlay.hasPointerCapture?.(event.pointerId)) overlay.releasePointerCapture(event.pointerId);
  }

  function openFreeTransform(group = false) {
    const layer = editableLayer();
    if (!layer || requiresRaster(layer) || maskEditing || pointerId !== null) return;
    const members = group === true ? project.layers.filter(item =>
      item.visible && !item.locked && (item.id === layer.id || moveTogether.has(item.id))) : [layer];
    if (group === true && members.length < 2) { status("Velg minst to synlige, ulåste lag."); return; }
    if (members.some(item => item.kind === "adjustment")) {
      status("Justeringslag kan ikke transformeres som rasterlag."); return;
    }
    if (members.some(item => item.textData)) {
      status("Gjør alle valgte tekstlag om til piksler før gruppetransformering."); return;
    }
    cancelFreeTransform();
    clearTextDraft();
    renderTextPreview();
    const b = members.map(transformBounds);
    const bounds = { left: Math.min(...b.map(item => item.left)), right: Math.max(...b.map(item => item.right)),
      top: Math.min(...b.map(item => item.top)), bottom: Math.max(...b.map(item => item.bottom)) };
    const pivot = group === true ? { x: clamp((bounds.left + bounds.right) / 2, 0, WIDTH),
      y: clamp((bounds.top + bounds.bottom) / 2, 0, HEIGHT) } : { x: WIDTH / 2, y: HEIGHT / 2 };
    freeTransform = { id: layer.id, ids: members.map(item => item.id), pivot, bounds, drag: null };
    $("kv2-free-target").textContent = group === true ? members.length + " lag transformeres samlet." : "Bare aktivt lag transformeres.";
    $("kv2-free-angle").value = "0";
    $("kv2-free-x").value = "100";
    $("kv2-free-y").value = "100";
    $("kv2-free-ratio").checked = true;
    $("kv2-free-transform-panel").hidden = false;
    renderFreeTransform();
  }

  function updateFreeTransform(axis) {
    if ($("kv2-free-ratio").checked && (axis === "x" || axis === "y")) {
      $("kv2-free-" + (axis === "x" ? "y" : "x")).value = $("kv2-free-" + axis).value;
    }
    renderFreeTransform();
  }

  function commitFreeTransform() {
    const layer = freeTransformLayer(), values = freeTransformValues();
    if (!layer || !values || (values.degrees === 0 && values.x === 1 && values.y === 1)) return;
    // Compute from the original surfaces, not from any prior preview.
    applyTransform(freeTransformResults(values));
    status("Transformering utført – kan angres.");
  }

  function exportSelection() {
    if (busy || !selection || selection.w < 2 || selection.h < 2) return;
    draw();
    const output = document.createElement("canvas");
    output.width = selection.w;
    output.height = selection.h;
    const outputContext = output.getContext("2d");
    outputContext.save();
    if (lassoActive()) {
      selectionPath(outputContext, selection.x, selection.y);
      outputContext.clip();
    }
    outputContext.drawImage(canvas, selection.x, selection.y,
      selection.w, selection.h, 0, 0, selection.w, selection.h);
    outputContext.restore();
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
    adjustedBitmaps.delete(selected);
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

  // Keep the raster fallback for older files. Only accept bounded, plain text metadata.
  function validateTextData(value) {
    if (!value || typeof value !== "object" || typeof value.content !== "string" ||
        !value.content.trim() || value.content.length > 280 || value.content.split("\n").length > 5 ||
        !Object.prototype.hasOwnProperty.call(TEXT_FONTS, value.family) ||
        !Number.isInteger(value.size) || value.size < 14 || value.size > 120 ||
        typeof value.bold !== "boolean" || typeof value.color !== "string" ||
        !/^#[a-fA-F0-9]{6}$/.test(value.color) ||
        !Number.isInteger(value.left) || value.left < 0 || value.left >= WIDTH ||
        !Number.isInteger(value.top) || value.top < 0 || value.top >= HEIGHT) return null;
    return { content: value.content, family: value.family, size: value.size, bold: value.bold,
      color: value.color, left: value.left, top: value.top };
  }

  function validateLayer(input) {
    if (!input || typeof input !== "object" || typeof input.bitmap !== "string" ||
        !/^data:image\/png;base64,[a-zA-Z0-9+/=]+$/.test(input.bitmap)) {
      throw new Error("Prosjektet har ugyldige lag.");
    }
    const textData = input.kind === "adjustment" ? null : validateTextData(input.textData);
    return {
      ...(textData ? { textData } : {}),
      id: uid(), name: String(input.name || "Lag").slice(0, 70),
      ...(safeGroupName(input.groupName) ? { groupName: safeGroupName(input.groupName) } : {}),
      kind: input.kind === "adjustment" ? "adjustment" : input.kind === "image" ? "image" : "paint",
      visible: input.visible !== false, locked: input.locked === true,
      opacity: clamp(Number.isFinite(input.opacity) ? input.opacity : 1, 0, 1),
      // Older projects default to normal; unknown or unsafe modes are ignored.
      blendMode: BLEND_MODES.has(input.blendMode) ? input.blendMode : "normal",
      adjustments: safeAdjustments(input.adjustments),
      ...(input.kind === "adjustment" ? { toneAdjustments: safeTone(input.toneAdjustments), levels: safeLevels(input.levels), curves: safeCurves(input.curves) } : {}),
      x: input.kind === "adjustment" ? 0 : clamp(Number.isFinite(input.x) ? Math.round(input.x) : 0, -WIDTH * 2, WIDTH * 2),
      y: input.kind === "adjustment" ? 0 : clamp(Number.isFinite(input.y) ? Math.round(input.y) : 0, -HEIGHT * 2, HEIGHT * 2),
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
    adjustedBitmaps.clear();
    selection = null;
    shapeDraft = null;
    clearTextDraft();
    maskEditing = false;
    layers.forEach((layer, i) => {
      surfaces.set(layer.id, decoded[i].bitmap);
      if (decoded[i].mask) masks.set(layer.id, decoded[i].mask);
    });
    moveTogether.clear();
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
          ...(safeGroupName(layer.groupName) ? { groupName: safeGroupName(layer.groupName) } : {}),
          kind: layer.kind === "adjustment" ? "adjustment" : layer.kind === "image" ? "image" : "paint",
          adjustments: safeAdjustments(layer.adjustments),
          ...(layer.kind === "adjustment" ? { toneAdjustments: safeTone(layer.toneAdjustments), levels: safeLevels(layer.levels), curves: safeCurves(layer.curves) } : {}),
          visible: layer.visible !== false, locked: layer.locked === true,
          opacity: Number.isFinite(layer.opacity) ? layer.opacity : 1,
          blendMode: BLEND_MODES.has(layer.blendMode) ? layer.blendMode : "normal",
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
            finally { busy = false; updateLayerControls(); renderTextPreview(); }
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
    finally { busy = false; $("kv2-import").value = ""; updateLayerControls(); renderTextPreview(); }
  }

  function bind() {
    $("kv2-new").addEventListener("click", () => {
      if (busy || (dirty && !global.confirm("Forkaste endringer som ikke er lagret?"))) return;
      newProject();
    });
    $("kv2-group-save").addEventListener("click", saveNamedGroup);
    $("kv2-group-select").addEventListener("change", renderNamedGroups);
    ["select", "dissolve", "hide", "show", "lock", "unlock"].forEach(action => {
      $("kv2-group-" + action + "-action").addEventListener("click", () => groupAction(action));
    });
    $("kv2-clear-move-group").addEventListener("click", () => {
      if (busy || pointerId !== null) return;
      cancelFreeTransform();
      moveTogether.clear();
      renderLayerList();
    });
    $("kv2-add-layer").addEventListener("click", () => addLayer("Lag " + (project.layers.length + 1), "paint"));
    $("kv2-add-adjustment").addEventListener("click", () => {
      if (busy || pointerId !== null) return;
      leaveMaskEdit();
      if (addLayer("Justeringslag", "adjustment")) {
        tool = "hand";
        moveTogether.clear();
        refresh();
        status("Justeringslag opprettet – bruk bildejusteringene i lagpanelet.");
      }
    });
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
    $("kv2-fill-selection").addEventListener("click", fillSelection);
    $("kv2-export-selection").addEventListener("click", exportSelection);
    $("kv2-clear-selection").addEventListener("click", () => {
      selection = null; renderSelection(); status("Markering fjernet");
    });
    ["flip", "rotate", "smaller", "larger"].forEach((mode) => {
      $("kv2-transform-" + mode).addEventListener("click", () => transformLayer(mode));
    });
    $("kv2-transform-free").addEventListener("click", () => openFreeTransform());
    $("kv2-transform-group").addEventListener("click", () => openFreeTransform(true));
    const transformOverlay = $("kv2-transform-overlay");
    transformOverlay.addEventListener("pointerdown", beginTransformDrag);
    transformOverlay.addEventListener("pointermove", moveTransformDrag);
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(type => transformOverlay.addEventListener(type, endTransformDrag));
    ["angle", "x", "y"].forEach(axis => {
      $("kv2-free-" + axis).addEventListener("input", () => updateFreeTransform(axis));
    });
    $("kv2-free-ratio").addEventListener("change", () => updateFreeTransform("x"));
    $("kv2-free-cancel").addEventListener("click", () => {
      cancelFreeTransform();
      status("Transformering avbrutt – ingen endringer.");
    });
    $("kv2-free-commit").addEventListener("click", commitFreeTransform);
    $("kv2-save").addEventListener("click", save);
    $("kv2-project-search")?.addEventListener("input", () => {
      renderProjects().catch((error) => status("Søk feilet: " + error.message));
    });
    $("kv2-undo").addEventListener("click", () => historyStep(undoStack, redoStack));
    $("kv2-redo").addEventListener("click", () => historyStep(redoStack, undoStack));
    $("kv2-title").addEventListener("input", changed);
    $("kv2-note").addEventListener("input", changed);
    $("kv2-color").addEventListener("input", () => {
      if (tool !== "text") tool = "brush";
      refresh();
    });
    ["hardness","opacity","flow","spacing"].forEach(name => {
      const control = $("kv2-brush-" + name);
      control.addEventListener("input", () => { $("kv2-brush-" + name + "-value").textContent = control.value + "%"; });
    });
    $("kv2-brush-library").addEventListener("change", () => renderBrushLibrary());
    $("kv2-brush-library-save").addEventListener("click", saveOwnBrush);
    $("kv2-brush-library-load").addEventListener("click", loadOwnBrush);
    $("kv2-brush-library-delete").addEventListener("click", deleteOwnBrush);
    $("kv2-brush-library-export").addEventListener("click", exportBrushLibrary);
    $("kv2-brush-library-import").addEventListener("change", event=>importBrushLibrary(event.target.files[0]));
    $("kv2-brush-library-reset").addEventListener("click", () => {
      if (busy || pointerId !== null || !advancedBrushEnabled()) return;
      applyBrushSettings(BRUSH_DEFAULTS);
      brushLibraryMessage("Penselinnstillingene er nullstilt. Lagrede pensler er beholdt.");
    });
    $("kv2-brush-preset").addEventListener("change", () => {
      // Changing brush settings doesn't create an art edit or undo step.
      tool = "brush"; refresh();
    });
    PALETTE.forEach(([name, color]) => {
      $("kv2-swatch-" + name).addEventListener("click", () => {
        $("kv2-color").value = color;
        if (tool !== "text") tool = "brush";
        refresh();
      });
    });
    $("kv2-size").addEventListener("input", () => { $("kv2-size-value").textContent = $("kv2-size").value; });
    $("kv2-rename").addEventListener("change", () => {
      const layer = currentLayer();
      if (!layer || busy) return;
      const next = $("kv2-rename").value.trim().slice(0, 70);
      if (!next || next === layer.name) return;
      checkpoint(); layer.name = next; changed(); refresh();
    });
    Object.keys(ADJUSTMENT_LIMITS).forEach((name) => {
      const control = $("kv2-adjust-" + name);
      control.addEventListener("input", () => {
        // Always show the value while dragging; commit only on release so
        // every slider adjustment creates exactly one undo checkpoint.
        $("kv2-adjust-" + name + "-value").textContent = control.value + "%";
      });
      control.addEventListener("change", () => {
        const layer = currentLayer();
        if (!layer || layer.locked || busy) return;
        const [lo, hi] = ADJUSTMENT_LIMITS[name];
        const next = clamp(Math.round(Number(control.value)), lo, hi);
        const current = safeAdjustments(layer.adjustments);
        if (!Number.isFinite(next) || current[name] === next) return;
        if (!checkpoint()) return;
        layer.adjustments = { ...current, [name]: next };
        changed();
        refresh();
      });
    });
    Object.keys(TONE_LIMITS).forEach(name => {
      const control = $("kv2-tone-" + name);
      control.addEventListener("input", () => {
        $("kv2-tone-" + name + "-value").textContent = toneLabel(name, Number(control.value));
      });
      control.addEventListener("change", () => {
        const layer = currentLayer();
        if (layer?.kind !== "adjustment" || layer.locked || busy) return;
        const current = safeTone(layer.toneAdjustments);
        const [lo, hi] = TONE_LIMITS[name];
        const next = clamp(Math.round(Number(control.value)), lo, hi);
        if (!Number.isFinite(next) || current[name] === next || !checkpoint()) return;
        layer.toneAdjustments = { ...current, [name]: next };
        changed(); refresh();
      });
    });
    $("kv2-curve-channel").addEventListener("change", () => updateCurveControls());
    CURVE_INPUTS.forEach((_, i) => {
      const control = $("kv2-curve-input-" + i);
      control.addEventListener("input", () => {
        const layer = currentLayer();
        if (layer?.kind !== "adjustment" || busy || layer.locked) return;
        const points = safeCurves(layer.curves)[selectedCurveChannel()];
        points[i] = clamp(Math.round(Number(control.value)), 0, 255);
        drawCurveGraph(points);
      });
      control.addEventListener("change", () => {
        const layer = currentLayer();
        if (layer?.kind !== "adjustment" || busy || layer.locked) return;
        const curves = safeCurves(layer.curves), channel = selectedCurveChannel();
        const n = clamp(Math.round(Number(control.value)), 0, 255);
        if (!Number.isFinite(n) || n === curves[channel][i] || !checkpoint()) return;
        curves[channel][i] = n;
        layer.curves = curves;
        changed(); refresh();
      });
    });
    $("kv2-curve-reset").addEventListener("click", () => {
      const layer = currentLayer();
      if (layer?.kind !== "adjustment" || busy || layer.locked) return;
      const curves = safeCurves(layer.curves), channel = selectedCurveChannel();
      if (curves[channel].every((n,i) => n === CURVE_INPUTS[i]) || !checkpoint()) return;
      curves[channel] = CURVE_INPUTS.slice();
      layer.curves = curves;
      changed(); refresh();
    });
    $("kv2-histogram-refresh").addEventListener("click", updateHistogram);
    Object.keys(LEVEL_DEFAULTS).forEach(name => {
      const control = $("kv2-level-" + name);
      control.addEventListener("input", () => {
        $("kv2-level-" + name + "-value").textContent = name === "gamma" ? (Number(control.value) / 100).toFixed(2) : control.value;
      });
      control.addEventListener("change", () => {
        const layer = currentLayer();
        if (layer?.kind !== "adjustment" || layer.locked || busy) return;
        const current = safeLevels(layer.levels);
        let value = Number(control.value);
        if (!Number.isFinite(value)) return;
        if (name === "black") value = Math.min(value, current.white - 1);
        if (name === "white") value = Math.max(value, current.black + 1);
        const next = safeLevels({ ...current, [name]: value });
        if (next[name] === current[name] || !checkpoint()) return;
        layer.levels = next;
        changed(); refresh();
      });
    });
    $("kv2-level-reset").addEventListener("click", () => {
      const layer = currentLayer();
      if (layer?.kind !== "adjustment" || layer.locked || busy || neutralLevels(safeLevels(layer.levels)) || !checkpoint()) return;
      layer.levels = safeLevels(null);
      changed(); refresh();
    });
    $("kv2-adjust-reset").addEventListener("click", () => {
      const layer = currentLayer();
      if (!layer || layer.locked || busy) return;
      const current = safeAdjustments(layer.adjustments);
      if (Object.values(current).every(value => value === 100) &&
          (layer.kind !== "adjustment" || (Object.values(safeTone(layer.toneAdjustments)).every(value => value === 0) &&
            neutralLevels(safeLevels(layer.levels)) && neutralCurves(safeCurves(layer.curves))))) return;
      if (!checkpoint()) return;
      layer.adjustments = safeAdjustments(null);
      if (layer.kind === "adjustment") {
        layer.toneAdjustments = safeTone(null);
        layer.levels = safeLevels(null);
        layer.curves = safeCurves(null);
      }
      changed(); refresh();
    });
    $("kv2-blend-mode").addEventListener("change", () => {
      const layer = currentLayer();
      if (!layer || busy) return;
      if (layer.kind === "adjustment") return;
      const next = $("kv2-blend-mode").value;
      if (!BLEND_MODES.has(next) || (layer.blendMode || "normal") === next) return;
      if (!checkpoint()) return;
      layer.blendMode = next;
      changed();
      refresh();
    });
    $("kv2-opacity").addEventListener("change", () => {
      const layer = currentLayer();
      if (!layer || busy) return;
      const next = clamp(Number($("kv2-opacity").value) / 100, 0, 1);
      if (layer.opacity !== next) {
        checkpoint(); layer.opacity = next; changed(); refresh();
      }
    });
    ["brush", "eraser", "move", "hand", "select", "lasso", "eyedropper", "rectangle", "ellipse", "line", "arrow", "gradient", "text"].forEach((name) => {
      $("kv2-" + name).addEventListener("click", () => {
        if (["rectangle", "ellipse", "line", "arrow", "text"].includes(name) && maskEditing) {
          status("Avslutt maskeredigering før du tegner figurer.");
          return;
        }
        shapeDraft = null;
        clearTextDraft();
        tool = name;
        refresh();
      });
    });
    $("kv2-shape-style").addEventListener("change", renderShapePreview);
    ["kv2-text-content", "kv2-text-size", "kv2-text-font", "kv2-text-bold"].forEach(id => {
      // input already covers typing, number changes, font selection and bold.
      // A second render on blur can interrupt WebKit's click on confirmation.
      $(id).addEventListener("input", renderTextPreview);
    });
    $("kv2-text-edit").addEventListener("click", editTextLayer);
    $("kv2-text-rasterize").addEventListener("click", rasterizeTextLayer);
    $("kv2-text-commit").addEventListener("click", commitText);
    $("kv2-text-cancel").addEventListener("click", () => {
      clearTextDraft();
      renderTextPreview();
      status("Tekstplassering avbrutt – ingen endringer.");
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
      if (event.key === "Escape" && freeTransform) {
        event.preventDefault();
        cancelFreeTransform();
        status("Transformering avbrutt – ingen endringer.");
        return;
      }
      if (event.key === "Escape" && tool === "text" && textAnchor &&
          !/^(input|textarea|select)$/i.test(document.activeElement?.tagName || "")) {
        event.preventDefault();
        clearTextDraft();
        renderTextPreview();
        status("Tekstplassering avbrutt – ingen endringer.");
        return;
      }
      if (event.key === "Escape" && advancedStroke) {
        event.preventDefault();
        const captured = pointerId;
        finishAdvancedStroke({type:"pointercancel"});
        if (captured !== null && canvas.hasPointerCapture?.(captured)) canvas.releasePointerCapture(captured);
        status("Penselstrøk avbrutt – ingen endringer");
        return;
      }
      if (event.key === "Escape" && shapeDraft) {
        event.preventDefault();
        const captured = pointerId;
        shapeDraft = null; pointerId = null; pointerStart = null; paintPrevious = null;
        renderShapePreview();
        if (captured !== null && canvas.hasPointerCapture?.(captured)) {
          canvas.releasePointerCapture(captured);
        }
        status("Figur avbrutt – ingen endringer");
        return;
      }
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
      finally { busy = false; updateLayerControls(); renderTextPreview(); }
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
      } finally { busy = false; updateLayerControls(); renderTextPreview(); }
    }
  };

  bind();
  newProject();
  renderProjects();
})(window);
