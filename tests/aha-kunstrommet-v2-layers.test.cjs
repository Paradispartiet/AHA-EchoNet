// Kunstrommet V2: isolated layer model contract and legacy backward compatibility.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.join(__dirname, "..");
const read = (pathName) => fs.readFileSync(path.join(root, pathName), "utf8");
const window = {};
vm.runInNewContext(read("js/ahaKunstrommetLayers.js"), { window }, { filename: "ahaKunstrommetLayers.js" });
const layers = window.AHAKunstrommetLayers;
assert.ok(layers);
const originalStroke = { color: "#aa3399", size: 6, points: [{ x: 25, y: 30 }, { x: 120, y: 160 }] };
const oldRecord = { id: "old-001", title: "Gammelt verk", strokes: [originalStroke] };
const migrated = layers.normalize(oldRecord);
assert.equal(migrated.layers.length, 1);
assert.equal(migrated.layers[0].id, layers.BASE_ID);
assert.equal(migrated.strokes[0].layerId, layers.BASE_ID);
assert.equal(migrated.strokes[0].color, "#aa3399");
assert.equal(oldRecord.strokes[0].layerId, undefined, "Migration must not change source record");

const second = layers.add(migrated, "layer-2");
assert.equal(second.layers.length, 2);
assert.equal(second.activeLayerId, "layer-2");
assert.equal(second.strokes.length, 1, "New layer must not touch original pixels");
const third = layers.add(second, "layer-3");
assert.equal(third.layers.length, 3);
assert.equal(layers.add(third, "layer-2"), null, "Duplicate IDs blocked");

const hidden = layers.edit(third, "layer-3", { visible: false });
assert.equal(layers.isEditable(hidden), false, "Cannot draw on hidden layer");
const locked = layers.edit(third, "layer-3", { locked: true });
assert.equal(layers.isEditable(locked), false, "Cannot draw on locked layer");
const transparent = layers.edit(third, "layer-3", { opacity: 0 });
assert.equal(layers.isEditable(transparent), false, "Cannot draw into fully transparent layer");
const named = layers.edit(third, "layer-3", { name: "Detaljer", opacity: .4 });
assert.equal(named.layers[2].name, "Detaljer");
assert.equal(named.layers[2].opacity, .4);

const moved = layers.move(named, "layer-3", -1);
assert.deepEqual(Array.from(moved.layers, (layer) => layer.id), ["layer-base", "layer-3", "layer-2"]);
assert.equal(layers.move(third, "layer-base", -1), null);
const withTwo = { ...third, strokes: [
  ...third.strokes,
  { ...originalStroke, layerId: "layer-2", color: "#00aa77" },
  { ...originalStroke, layerId: "layer-3", color: "#ff0000" }
]};
const deleted = layers.remove(withTwo, "layer-2");
assert.equal(deleted.strokes.length, 2, "Only selected layer's strokes should be deleted");
assert.ok(deleted.strokes.some((stroke) => stroke.layerId === "layer-base"));
assert.ok(deleted.strokes.some((stroke) => stroke.layerId === "layer-3"));
assert.equal(layers.remove(migrated, layers.BASE_ID), null, "Last layer cannot be deleted");

assert.equal(layers.validateImport(withTwo.layers, withTwo.strokes, withTwo.activeLayerId), true);
assert.equal(layers.validateImport(withTwo.layers, [{ ...originalStroke, layerId: "missing" }], withTwo.activeLayerId), false,
  "Foreign layer reference blocked");
assert.equal(layers.validateImport(withTwo.layers, withTwo.strokes, "missing"), false);
assert.equal(layers.validateImport([{ id: "x", name: "a", opacity: 2, visible: true, locked: false }], [], "x"), false);
assert.equal(layers.validateImport(withTwo.layers, [{ ...originalStroke, layerId: "layer-base", color: "url(javascript:alert(1))" }], withTwo.activeLayerId), false);
const html = read("kunstrommet.html");
for (const id of ["kunstrommet-layers", "kunstrommet-layer-add", "kunstrommet-layer-delete", "kunstrommet-layer-state"]) {
  assert.ok(html.includes('id="' + id + '"'), "Missing layer UI control: " + id);
}
assert.match(html, /<script src="js\/ahaKunstrommetLayers\.js"><\/script>/);
assert.match(read("js/ahaKunstrommet.js"), /paintComposition\(current, ctx\)/);
assert.doesNotMatch(read("js/ahaKunstrommetLayers.js"), /\bfetch\s*\(|\bXMLHttpRequest\b|AHAIngest/);
console.log("Kunstrommet V2 layer model: PASS (legacy, layers, lock, opacity, reorder, delete, import)");
