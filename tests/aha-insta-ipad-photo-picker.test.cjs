const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const html = readFileSync(path.join(root, "insta.html"), "utf8");
const code = readFileSync(path.join(root, "js/ahaInsta.js"), "utf8");

assert.match(html, /id="insta-file"[^>]*type="file"[^>]*accept="image\/\*/);
assert.match(html, /id="insta-photo-preview"/);
assert.match(html, /id="insta-compose-status"/);
assert.match(html, /id="insta-submit"/);

class Element {
  constructor() {
    this.listeners = {};
    this.value = "";
    this.files = [];
    this.hidden = false;
    this.disabled = false;
    this.innerHTML = "";
    this.textContent = "";
    this.src = "";
    this.dataset = {};
  }
  addEventListener(event, callback) { this.listeners[event] = callback; }
  removeAttribute(key) { if (key === "src") this.src = ""; }
  focus() {}
}

function fixture(persistentStore) {
  const elements = Object.fromEntries([
    "insta-form", "insta-file", "insta-src", "insta-title", "insta-caption",
    "insta-submit", "insta-photo-preview", "insta-preview-image",
    "insta-clear-file", "insta-compose-status", "insta-list",
    "insta-profile-card", "insta-feed-controls", "insta-stories"
  ].map(id => [id, new Element()]));
  const localStorage = {
    getItem: key => persistentStore.get(key) ?? null,
    setItem: (key, value) => persistentStore.set(key, String(value)),
    removeItem: key => persistentStore.delete(key)
  };
  let init = null;
  const document = {
    readyState: "loading",
    getElementById: id => elements[id] ?? null,
    addEventListener: (event, callback) => { if (event === "DOMContentLoaded") init = callback; },
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: name => {
      assert.equal(name, "canvas");
      return {
        width: 0, height: 0,
        getContext: () => ({ fillRect() {}, drawImage() {}, set fillStyle(_) {} }),
        toDataURL: () => "data:image/jpeg;base64,QUhBVEVTVA=="
      };
    }
  };
  class Image {
    naturalWidth = 3000;
    naturalHeight = 2000;
    set src(_) { queueMicrotask(() => this.onload?.()); }
  }
  const window = {
    URL: { createObjectURL: () => "blob:photo", revokeObjectURL() {} },
    AHA_CONFIG: {},
    addEventListener() {}
  };
  const context = vm.createContext({ window, document, localStorage, Image, HTMLElement: Element, console, Date, Math, URLSearchParams, setTimeout });
  vm.runInContext(code, context, { filename: "ahaInsta.js" });
  assert.equal(typeof init, "function");
  init();
  return { elements, window };
}

(async () => {
  const storage = new Map();
  const { elements, window } = fixture(storage);
  const fileInput = elements["insta-file"];
  const form = elements["insta-form"];
  const status = elements["insta-compose-status"];

  await form.listeners.submit({ preventDefault() {} });
  assert.match(status.textContent, /Velg et bilde/);
  assert.equal(window.AHAInsta.load().length, 0, "Cannot submit image-free post from picker");

  fileInput.files = [{ name: "test.jpg", type: "image/jpeg", size: 2000 }];
  await fileInput.listeners.change();
  assert.equal(elements["insta-photo-preview"].hidden, false);
  assert.match(elements["insta-preview-image"].src, /^data:image\/jpeg;base64,/);
  elements["insta-caption"].value = "";
  await form.listeners.submit({ preventDefault() {} });

  let posts = window.AHAInsta.load();
  assert.equal(posts.length, 1);
  assert.equal(posts[0].local_only, true);
  assert.equal(posts[0].published_external, false);
  assert.equal(posts[0].echonet_shared, false);
  assert.ok(posts[0].source_signature.length < 500, "Never duplicate encoded image data inside signature");
  assert.ok(!JSON.stringify(posts[0].base || {}).includes("QUhBVEVTVA=="), "Never duplicate the image in base metadata");
  assert.match(status.textContent, /lagret lokalt/);
  assert.equal(elements["insta-photo-preview"].hidden, true);

  const refreshed = fixture(storage);
  posts = refreshed.window.AHAInsta.load();
  assert.equal(posts.length, 1, "Image survives reload from localStorage");
  assert.ok(refreshed.elements["insta-list"].innerHTML.includes("data:image/jpeg;base64,"));

  refreshed.window.AHAInsta.deletePost(posts[0].id);
  assert.equal(refreshed.window.AHAInsta.load()[0].deleted_at != null, true);
  assert.ok(!refreshed.elements["insta-list"].innerHTML.includes("data:image/jpeg;base64,"), "Deleted image removed from feed");

  const rejected = fixture(new Map());
  rejected.elements["insta-file"].files = [{ name: "not-image.pdf", type: "application/pdf", size: 3000 }];
  await rejected.elements["insta-file"].listeners.change();
  assert.match(rejected.elements["insta-compose-status"].textContent, /Velg et bilde/);
  assert.equal(rejected.elements["insta-photo-preview"].hidden, true);

  console.log("AHA Insta iPad photo picker: select → preview → local save → reload → delete OK; invalid file rejected.");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
