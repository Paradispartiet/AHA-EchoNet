// End-to-end-ish Kunstrommet runtime test in a deterministic fake DOM + IndexedDB.
// No network access, no browser-specific dependencies. Real iOS Safari must still be tested.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const layersSource = fs.readFileSync(path.join(__dirname, "../js/ahaKunstrommetLayers.js"), "utf8");
const source = fs.readFileSync(path.join(__dirname, "../js/ahaKunstrommet.js"), "utf8");
const handlers = new Map();
let filesDownloaded = [];
let ingestion = [];
let idNumber = 0;
const data = new Map();
const allElements = new Map();
let domReady = null;

function makeNode(tag = "div") {
  return {
    tag, children: [], style: {}, attributes: {}, value: "", textContent: "", files: [],
    classList: { classes: [], add(name) { this.classes.push(name); }, remove(name) { this.classes = this.classes.filter(x => x !== name); } },
    events: {},
    addEventListener(name, fn) { this.events[name] = fn; },
    setAttribute(name, val) { this.attributes[name] = val; },
    append(...items) { this.children.push(...items); },
    appendChild(item) { this.children.push(item); },
    replaceChildren(...items) { this.children = items; },
    remove() {},
    click() { this.events.click?.({}); },
    dispatch(name, evt = {}) { return this.events[name]?.(evt); }
  };
}
function getEl(id) {
  if (!allElements.has(id)) allElements.set(id, makeNode());
  return allElements.get(id);
}
const ctx = {};
for (const fn of ["fillRect", "beginPath", "arc", "fill", "moveTo", "lineTo", "stroke"]) ctx[fn] = () => {};
const canvas = getEl("kunstrommet-canvas");
canvas.getContext = () => ctx;
canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1200, height: 800 });
canvas.setPointerCapture = () => {};
canvas.toBlob = (fn) => fn(new Blob(["png"], { type: "image/png" }));
getEl("kunstrommet-size").value = "6";
getEl("kunstrommet-color").value = "#1a2535";
const document = {
  readyState: "loading",
  body: { append() {} },
  getElementById: getEl,
  createElement: makeNode,
  addEventListener(type, fn) { if (type === "DOMContentLoaded") domReady = fn; }
};

function transaction() {
  const tx = { oncomplete: null, onerror: null, onabort: null };
  tx.objectStore = () => ({
    getAll() {
      const req = { onsuccess: null, onerror: null, result: null };
      queueMicrotask(() => { req.result = [...data.values()].map(v => JSON.parse(JSON.stringify(v))); req.onsuccess?.(); });
      return req;
    },
    put(record) {
      queueMicrotask(() => { data.set(record.id, JSON.parse(JSON.stringify(record))); tx.oncomplete?.(); });
    },
    delete(id) {
      queueMicrotask(() => { data.delete(id); tx.oncomplete?.(); });
    }
  });
  return tx;
}
let created = false;
const indexedDB = {
  open() {
    const db = {
      objectStoreNames: { contains: () => created },
      createObjectStore: () => { created = true; },
      transaction
    };
    const req = { result: db, onupgradeneeded: null, onsuccess: null, onerror: null };
    queueMicrotask(() => { if (!created) req.onupgradeneeded?.(); req.onsuccess?.(); });
    return req;
  }
};
const window = {
  indexedDB,
  localStorage: { getItem(key) { return key === "aha_profile_id" ? "test-person" : null; } },
  crypto: { randomUUID: () => "sketch-" + (++idNumber) },
  AHAIngest: {
    async ingest(value) { ingestion.push(value); return { ok: true, sourceEvent: { id: "src-test" } }; }
  },
  addEventListener(name, fn) { handlers.set(name, fn); },
  confirm() { return true; },
  setTimeout(fn) { fn(); }
};
let objectNumber = 0;
const urls = new Map();
const URL = {
  createObjectURL(blob) { const url = "blob:test-" + (++objectNumber); urls.set(url, blob); filesDownloaded.push(blob); return url; },
  revokeObjectURL(url) { urls.delete(url); }
};

vm.runInNewContext(layersSource, { window, document, console }, { filename: "ahaKunstrommetLayers.js" });
vm.runInNewContext(source, { window, document, Blob, URL, console, setTimeout, queueMicrotask }, { filename: "ahaKunstrommet.js" });
assert.ok(domReady, "DOM initialization should register");
assert.equal(data.size, 0, "No write on script load");
assert.equal(ingestion.length, 0, "No implicit AHA ingestion");

const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
(async () => {
  domReady();
  await flush();
  assert.equal(data.size, 0, "No automatic save on load");
  assert.equal(ingestion.length, 0, "No automatic ingest after DOM ready");

  canvas.dispatch("pointerdown", { pointerType: "touch", pointerId: 1, clientX: 25, clientY: 40, preventDefault() {} });
  canvas.dispatch("pointermove", { pointerType: "touch", pointerId: 1, clientX: 85, clientY: 90, preventDefault() {} });
  canvas.dispatch("pointerup");
  getEl("kunstrommet-title").value = "En skisse";
  getEl("kunstrommet-title").dispatch("input");
  getEl("kunstrommet-note").value = "Et personlig eksperiment";
  getEl("kunstrommet-note").dispatch("input");
  assert.equal(getEl("kunstrommet-save-state").textContent, "Ikke lagret");
  assert.equal(data.size, 0, "Drawing must not save automatically");
  getEl("kunstrommet-undo").dispatch("click");
  getEl("kunstrommet-redo").dispatch("click");
  getEl("kunstrommet-save").dispatch("click");
  await flush();
  assert.equal(data.size, 1, "Explicit save stores exactly one sketch");
  let saved = [...data.values()][0];
  assert.equal(saved.title, "En skisse");
  assert.equal(saved.strokes.length, 1);
  assert.equal(saved.strokes[0].points.length, 2);
  assert.equal(saved.note, "Et personlig eksperiment");
  assert.equal(saved.owner, "test-person");
  assert.equal(ingestion.length, 0, "Saving a sketch does not send any text to Aha");
  assert.equal(getEl("kunstrommet-projects").children[0].children[0].tag, "canvas",
    "Saved sketch has an ephemeral canvas thumbnail");

  getEl("kunstrommet-json").dispatch("click");
  assert.equal(filesDownloaded.length, 1);
  const exported = JSON.parse(await filesDownloaded[0].text());
  assert.equal(exported.format, "aha-kunstrommet-v1");
  assert.equal(exported.strokes.length, 1);

  getEl("kunstrommet-send-aha").dispatch("click");
  await flush();
  assert.equal(ingestion.length, 1, "Only explicit button click may trigger Aha ingest");
  assert.equal(ingestion[0].title, "En skisse");
  assert.equal(ingestion[0].meta.image_sent, false);
  assert.equal(ingestion[0].meta.explicit_user_action, true);
  assert.ok(!Object.prototype.hasOwnProperty.call(ingestion[0], "strokes"));
  assert.ok(!Object.prototype.hasOwnProperty.call(ingestion[0], "image"));

  const firstCard = getEl("kunstrommet-projects").children[0];
  const copyButton = firstCard.children[3].children.find(node => node.textContent === "Lag kopi");
  assert.ok(copyButton, "Copy button exists");
  copyButton.dispatch("click");
  await flush();
  assert.equal(data.size, 2, "Copy produces a second local sketch");
  assert.equal(ingestion.length, 1, "Copy must not trigger ingest");
  const copy = [...data.values()].find(item => item.title.includes("kopi"));
  assert.ok(copy, "Copied project gets a distinct name");
  assert.equal(copy.last_ingested_at, undefined, "Copy must not inherit Aha ingestion metadata");
  assert.equal(copy.last_source_event_id, undefined, "Copy must not inherit Aha source identity");
  getEl("kunstrommet-project-search").value = "kopi";
  getEl("kunstrommet-project-search").dispatch("input");
  await flush();
  assert.equal(getEl("kunstrommet-projects").children.length, 1, "Search filters local sketchbook");
  getEl("kunstrommet-project-search").value = "";
  getEl("kunstrommet-project-search").dispatch("input");
  await flush();

  getEl("kunstrommet-new").dispatch("click");
  getEl("kunstrommet-import").files = [{ size: 2500, async text() { return JSON.stringify(exported); } }];
  getEl("kunstrommet-import").dispatch("change", { target: getEl("kunstrommet-import") });
  await flush();
  assert.equal(data.size, 3, "Manual JSON import creates a new personal sketch");
  assert.equal(ingestion.length, 1, "Import must not auto ingest");
  assert.ok([...data.values()].every((record) => record.owner === "test-person"));

  // A malformed import is rejected rather than deserializing invalid shape into canvas drawing.
  getEl("kunstrommet-import").files = [{ size: 200, async text() { return '{"format":"aha-kunstrommet-v1","strokes":[{"color":"red"}]}'; } }];
  getEl("kunstrommet-import").dispatch("change", { target: getEl("kunstrommet-import") });
  await flush();
  assert.equal(data.size, 3, "Malformed project import must not create a record");
  assert.equal(ingestion.length, 1, "Malformed import must not invoke Aha");
  console.log("Kunstrommet interaction: PASS (touch, previews, copy, search, save, undo/redo, export, import, opt-in ingest)");
})().catch((err) => { console.error(err); process.exitCode = 1; });
