// Kunstrommet must reuse the existing Gallery module, not clone its media store.
// A user must explicitly click before inspiration text enters an unsaved art note.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const gallerySrc = fs.readFileSync(path.join(root, "js/ahaGallery.js"), "utf8");
const atelierSrc = fs.readFileSync(path.join(root, "js/ahaKunstrommet.js"), "utf8");
const galleryHtml = fs.readFileSync(path.join(root, "gallery.html"), "utf8");
const atelierHtml = fs.readFileSync(path.join(root, "kunstrommet.html"), "utf8");

assert.match(atelierHtml, /<script src="js\/ahaGallery\.js"><\/script>/);
assert.match(galleryHtml, /href="kunstrommet\.html"/);
assert.match(atelierHtml, /id="kunstrommet-gallery-inspiration"/);
assert.match(atelierSrc, /global\.AHAGallery\?\.load\?\.\(\)/);
assert.doesNotMatch(atelierSrc, /aha_gallery_v1/); // No second loader/store.
assert.doesNotMatch(atelierSrc, /addItem\(/); // Do not automatically publish art to Gallery.

const original = [{
  id: "gal-1", title: "Inspirerende farger",
  description: "Lys over havet", src: "https://example.org/reference-image.jpg",
  type: "image", local_only: true
}];
const storage = new Map([["aha_gallery_v1", JSON.stringify(original)]]);
const localStorage = {
  getItem(key) { return storage.get(key) ?? null; },
  setItem(key, val) { storage.set(key, String(val)); },
  removeItem(key) { storage.delete(key); }
};
let listeners = new Map();
function node(tag = "div") {
  return {
    tag, children: [], value: "", textContent: "", attributes: {},
    classList: { add() {}, remove() {} },
    events: {},
    addEventListener(name, fn) { this.events[name] = fn; },
    setAttribute(name, value) { this.attributes[name] = value; },
    append(...items) { this.children.push(...items); },
    appendChild(el) { this.children.push(el); },
    replaceChildren(...items) { this.children = [...items]; },
    focus() { this.focused = true; },
    click() { this.events.click?.(); },
    remove() {}
  };
}
const elements = new Map();
const getEl = (id) => {
  if (!elements.has(id)) elements.set(id, node());
  return elements.get(id);
};
const context2d = {};
for (const fn of ["fillRect", "beginPath", "arc", "fill", "moveTo", "lineTo", "stroke"]) {
  context2d[fn] = () => {};
}
const canvas = getEl("kunstrommet-canvas");
canvas.getContext = () => context2d;
canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1200, height: 800 });
canvas.setPointerCapture = () => {};
const doc = {
  readyState: "loading",
  getElementById(id) { return id === "gallery-form" ? null : getEl(id); },
  createElement: node,
  addEventListener(name, fn) {
    if (!listeners.has(name)) listeners.set(name, []);
    listeners.get(name).push(fn);
  }
};
let sent = 0;
const win = {
  localStorage, location: { hash: "" },
  addEventListener() {},
  crypto: { randomUUID: () => "test-artwork" },
  AHAIngest: { ingest() { sent += 1; return { ok: true }; } }
};
const context = vm.createContext({ window: win, document: doc, localStorage, console, Date, setTimeout });
vm.runInContext(gallerySrc, context, { filename: "ahaGallery.js" });
assert.ok(win.AHAGallery);
assert.equal(win.AHAGallery.load()[0].title, "Inspirerende farger");
const galleryBefore = storage.get("aha_gallery_v1");
vm.runInContext(atelierSrc, context, { filename: "ahaKunstrommet.js" });
for (const fn of listeners.get("DOMContentLoaded") || []) fn();
const mount = getEl("kunstrommet-gallery-inspiration");
assert.equal(mount.children.length, 1, "Show only existing Gallery references");
assert.equal(mount.children[0].children[0].textContent, "Inspirerende farger");
const note = getEl("kunstrommet-note");
assert.equal(note.value, "", "Do not copy inspiration before user click");
assert.equal(sent, 0, "Do not ingest automatically");
const button = mount.children[0].children.find((item) => item.tag === "button");
assert.ok(button);
button.click();
assert.match(note.value, /Inspirasjon fra Aha Galleri: Inspirerende farger/);
assert.match(note.value, /Lys over havet/);
assert.equal(getEl("kunstrommet-save-state").textContent, "Ikke lagret");
assert.equal(note.focused, true);
assert.equal(storage.get("aha_gallery_v1"), galleryBefore, "Existing Gallery is unchanged");
assert.equal(sent, 0, "No automatic Aha ingest");
assert.ok(!note.value.includes("https://example.org/"), "Do not copy media URLs");
console.log("Kunstrommet existing Gallery reuse: PASS");
