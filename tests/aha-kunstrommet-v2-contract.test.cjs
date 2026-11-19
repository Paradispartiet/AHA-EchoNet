// Deterministic smoke/contract test for the independent Kunstrommet V2 editor.
// Browser-level pixel and IndexedDB checks live in tests/browser/aha-kunstrommet-v2.spec.cjs.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const js = fs.readFileSync(path.join(root, "js/ahaKunstrommetV2.js"), "utf8");
const html = fs.readFileSync(path.join(root, "kunstrommet.html"), "utf8");
const v1 = fs.readFileSync(path.join(root, "js/ahaKunstrommet.js"), "utf8");
const bridge = fs.readFileSync(path.join(root, "js/ahaKunstrommetBridge.js"), "utf8");
const redirect = fs.readFileSync(path.join(root, "kunstrommet-v2.html"), "utf8");
assert.match(html, /src="js\/ahaKunstrommetBridge\.js"/);
assert.doesNotMatch(html, /src="js\/ahaKunstrommet\.js"/);
assert.match(redirect, /window\.location\.replace\("kunstrommet\.html"/);
assert.match(bridge, /aha_kunstrommet_v1/);
assert.match(bridge, /AHAGallery/);
assert.match(bridge, /AHAKunstrommetReferences/);

assert.doesNotThrow(() => new Function(js));
assert.match(js, /destination-out/);
assert.match(js, /aha_kunstrommet_v2/);
assert.doesNotMatch(js, /\bfetch\s*\(|\bXMLHttpRequest\b|\bAHAIngest\b/);
assert.match(html, /ahaKunstrommetV2\.js/);
assert.match(html, /<title>Kunstrommet \| AHA<\/title>/); // canonical page, not a link to itself
assert.match(html, /gallery\.html/);
assert.match(v1, /aha_kunstrommet_v1/);

const ids = Array.from(js.matchAll(/\$\("([^"]+)"\)/g), (match) => match[1]);
for (const id of ids) {
  assert.match(html, new RegExp('id="' + id + '"'), "Missing DOM element " + id);
}

let nextId = 0;
const data = new Map();
const nodes = new Map();
const globals = {};
const downloaded = [];
const noop = () => {};
const methods = [
  "save", "restore", "fillRect", "drawImage", "beginPath", "arc", "fill",
  "moveTo", "lineTo", "stroke"
];
function canvasContext() {
  const ctx = {};
  methods.forEach((name) => { ctx[name] = noop; });
  // The Node DOM fake must support the real editor's lossless layer path.
  // Pixel fidelity itself is verified by the separate browser tests.
  const pixels = new Uint8ClampedArray(1200 * 800 * 4);
  ctx.getImageData = () => ({ data: new Uint8ClampedArray(pixels) });
  ctx.putImageData = (image) => pixels.set(image.data);
  return ctx;
}
function createNode(tag = "div") {
  const listeners = {};
  const node = {
    tag, tagName: tag.toUpperCase(), value: "", textContent: "", children: [],
    dataset: {}, style: {}, disabled: false, files: [], attributes: {},
    width: 1200, height: 800,
    addEventListener(name, fn) { listeners[name] = fn; },
    dispatch(name, event = {}) { return listeners[name]?.(event); },
    append(...items) { this.children.push(...items); },
    appendChild(item) { this.children.push(item); },
    replaceChildren(...items) { this.children = items; },
    setAttribute(name, value) { this.attributes[name] = value; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 1200, height: 800 }; },
    getContext() { return this.context || (this.context = canvasContext()); },
    toDataURL() { return "data:image/png;base64,QUJDRA=="; },
    toBlob(callback) { callback(new Blob(["png"], { type: "image/png" })); },
    setPointerCapture: noop,
    click() { return this.dispatch("click"); },
    remove: noop
  };
  return node;
}
function get(id) {
  if (!nodes.has(id)) nodes.set(id, createNode(id === "kv2-canvas" ? "canvas" : "div"));
  return nodes.get(id);
}
get("kv2-color").value = "#123456";
get("kv2-size").value = "6";

function transaction() {
  const tx = { oncomplete: null, onabort: null, onerror: null };
  tx.objectStore = () => ({
    getAll() {
      const req = { onsuccess: null, onerror: null, result: null };
      queueMicrotask(() => {
        req.result = Array.from(data.values()).map((item) => JSON.parse(JSON.stringify(item)));
        req.onsuccess?.();
      });
      return req;
    },
    put(record) {
      queueMicrotask(() => {
        data.set(record.id, JSON.parse(JSON.stringify(record)));
        tx.oncomplete?.();
      });
    }
  });
  return tx;
}
let created = false;
const indexedDB = {
  open(name) {
    assert.equal(name, "aha_kunstrommet_v2");
    const db = {
      objectStoreNames: { contains: () => created },
      createObjectStore() { created = true; },
      transaction
    };
    const req = { result: db, onupgradeneeded: null, onsuccess: null, onerror: null };
    queueMicrotask(() => {
      if (!created) req.onupgradeneeded?.();
      req.onsuccess?.();
    });
    return req;
  }
};
class ImageFake {
  constructor() {
    this.width = 1200; this.height = 800;
    this.naturalWidth = 1200; this.naturalHeight = 800;
  }
  set src(value) { this._src = value; queueMicrotask(() => this.onload?.()); }
}
let urlNumber = 0;
const URLMock = {
  createObjectURL(blob) { downloaded.push(blob); return "blob:test-" + (++urlNumber); },
  revokeObjectURL: noop
};
const document = {
  body: { appendChild: noop },
  activeElement: { tagName: "BODY" },
  getElementById: get,
  createElement: createNode
};
const window = {
  indexedDB,
  crypto: { randomUUID: () => "v2-id-" + (++nextId) },
  localStorage: { getItem: () => "test-profile" },
  requestAnimationFrame: (callback) => callback(),
  setTimeout: (callback) => callback(),
  confirm: () => true,
  addEventListener(name, fn) { globals[name] = fn; }
};
vm.runInNewContext(js, { window, document, Image: ImageFake, URL: URLMock, Blob,
  queueMicrotask, console }, { filename: "ahaKunstrommetV2.js" });
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
(async () => {
  await flush();
  assert.equal(data.size, 0, "No implicit save or backend transfer");
  assert.equal(get("kv2-layer-count").textContent, "1 av 8 lag");
  get("kv2-title").value = "Mine lag";
  get("kv2-title").dispatch("input");
  get("kv2-add-layer").dispatch("click");
  assert.equal(get("kv2-layer-count").textContent, "2 av 8 lag");

  const canvas = get("kv2-canvas");
  const pointer = { pointerId: 9, pointerType: "pen", button: 0,
    clientX: 50, clientY: 60, preventDefault: noop };
  canvas.dispatch("pointerdown", pointer);
  canvas.dispatch("pointermove", { ...pointer, clientX: 70, clientY: 80 });
  canvas.dispatch("pointerup", pointer);
  assert.equal(get("kv2-status").textContent, "Ulagrede endringer");

  get("kv2-photo").files = [{ type: "image/png", size: 1200, name: "foto.png" }];
  get("kv2-photo").dispatch("change", { target: get("kv2-photo") });
  await flush();
  assert.equal(get("kv2-layer-count").textContent, "3 av 8 lag");

  get("kv2-save").dispatch("click");
  await flush();
  assert.equal(data.size, 1, "Explicit save persists one V2 project");
  const record = [...data.values()][0];
  assert.equal(record.title, "Mine lag");
  assert.equal(record.layers.length, 3);
  assert.equal(record.owner, "test-profile");
  assert.equal(record.shared, false);
  assert.equal(record.analyzed_image, false);
  assert.ok(record.layers.every((layer) => layer.bitmap.startsWith("data:image/png;base64,")));
  assert.equal(get("kv2-status").textContent, "Lagret på denne enheten");

  get("kv2-json").dispatch("click");
  assert.equal(downloaded.length >= 2, true, "Image and project export/preview use local blobs");
  assert.equal(data.size, 1, "Export doesn't change database");
  console.log("Kunstrommet V2 contract: PASS (separate DB, local layers, photo, drawing, save, export)");
})().catch((error) => { console.error(error); process.exitCode = 1; });
