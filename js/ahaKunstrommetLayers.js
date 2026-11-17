// Kunstrommet V2: pure local-only layer model. No remote calls or AHA ingestion.
(function (global) {
  "use strict";
  const BASE_ID = "layer-base";
  const MAX_LAYERS = 24;
  const MAX_STROKES = 3000;
  const MAX_POINTS = 2400;

  function normalize(record) {
    const strokes = Array.isArray(record?.strokes) ? record.strokes : [];
    let layers = Array.isArray(record?.layers) ? record.layers : [];
    const seen = new Set();
    layers = layers.filter((layer) => {
      if (!layer || typeof layer.id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(layer.id)
        || seen.has(layer.id)) return false;
      seen.add(layer.id);
      return true;
    }).slice(0, MAX_LAYERS).map((layer, i) => ({
      id: layer.id,
      name: String(layer.name || "Lag " + (i + 1)).slice(0, 80),
      visible: layer.visible !== false,
      locked: layer.locked === true,
      opacity: Math.min(1, Math.max(0, Number.isFinite(layer.opacity) ? layer.opacity : 1))
    }));
    if (!layers.length) layers = [{ id: BASE_ID, name: "Lag 1", visible: true, locked: false, opacity: 1 }];
    const available = new Set(layers.map((layer) => layer.id));
    const fallback = layers[0].id;
    const migrated = strokes.map((stroke) => ({
      ...stroke, layerId: available.has(stroke.layerId) ? stroke.layerId : fallback
    }));
    const activeLayerId = available.has(record?.activeLayerId) ? record.activeLayerId : fallback;
    return { ...record, layers, strokes: migrated, activeLayerId };
  }

  function active(record) {
    const model = normalize(record);
    return model.layers.find((layer) => layer.id === model.activeLayerId);
  }
  function add(record, id) {
    const model = normalize(record);
    if (model.layers.length >= MAX_LAYERS || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)
      || model.layers.some((layer) => layer.id === id)) return null;
    const layer = { id, name: "Lag " + (model.layers.length + 1), visible: true, locked: false, opacity: 1 };
    const at = model.layers.findIndex((entry) => entry.id === model.activeLayerId);
    model.layers.splice(at + 1, 0, layer);
    model.activeLayerId = id;
    return model;
  }
  function edit(record, id, patch) {
    const model = normalize(record);
    const i = model.layers.findIndex((layer) => layer.id === id);
    if (i < 0) return null;
    const layer = model.layers[i];
    if ("name" in patch) layer.name = String(patch.name || layer.name).slice(0, 80);
    if ("visible" in patch) layer.visible = patch.visible === true;
    if ("locked" in patch) layer.locked = patch.locked === true;
    if ("opacity" in patch && Number.isFinite(patch.opacity)) {
      layer.opacity = Math.max(0, Math.min(1, patch.opacity));
    }
    return model;
  }
  function move(record, id, direction) {
    const model = normalize(record);
    const from = model.layers.findIndex((layer) => layer.id === id);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= model.layers.length || ![-1, 1].includes(direction)) return null;
    [model.layers[from], model.layers[to]] = [model.layers[to], model.layers[from]];
    return model;
  }
  function remove(record, id) {
    const model = normalize(record);
    const i = model.layers.findIndex((layer) => layer.id === id);
    if (model.layers.length === 1 || i < 0) return null;
    model.layers.splice(i, 1);
    model.strokes = model.strokes.filter((stroke) => stroke.layerId !== id);
    if (model.activeLayerId === id) model.activeLayerId = model.layers[Math.min(i, model.layers.length - 1)].id;
    return model;
  }
  function select(record, id) {
    const model = normalize(record);
    if (!model.layers.some((layer) => layer.id === id)) return null;
    model.activeLayerId = id;
    return model;
  }
  function isEditable(record) {
    const layer = active(record);
    return layer?.visible === true && layer.locked !== true && layer.opacity > 0;
  }
  function validateImport(layers, strokes, activeLayerId) {
    if (!Array.isArray(layers) || layers.length < 1 || layers.length > MAX_LAYERS
      || !Array.isArray(strokes) || strokes.length > MAX_STROKES) return false;
    const ids = new Set();
    for (const layer of layers) {
      if (typeof layer?.id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(layer.id) || ids.has(layer.id)
        || typeof layer.name !== "string" || layer.name.length > 80
        || typeof layer.visible !== "boolean" || typeof layer.locked !== "boolean"
        || !Number.isFinite(layer.opacity) || layer.opacity < 0 || layer.opacity > 1) return false;
      ids.add(layer.id);
    }
    if (!ids.has(activeLayerId)) return false;
    return strokes.every((stroke) => ids.has(stroke?.layerId)
      && /^#[0-9a-f]{6}$/i.test(stroke.color) && Number.isFinite(stroke.size)
      && stroke.size >= 1 && stroke.size <= 100 && Array.isArray(stroke.points)
      && stroke.points.length >= 1 && stroke.points.length <= MAX_POINTS
      && stroke.points.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)
        && point.x >= 0 && point.x <= 1200 && point.y >= 0 && point.y <= 800));
  }

  global.AHAKunstrommetLayers = {
    BASE_ID, MAX_LAYERS, normalize, active, add, edit, move, remove, select, isEditable, validateImport
  };
})(window);
