const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const cases = [
  {
    file: "js/ahaNotes.js", page: "notes.html", api: "AHANotes", mount: "notes-list",
    target: "note-text", emptyHeading: "Begynn med en tanke", emptyAction: "Skriv første notat",
    record: { id: "note-1", title: "Min idé", text: "Et tidlig utkast" },
    content: /Min idé/, deleted: { id: "deleted-note", title: "Skjult", deleted_at: "2026-10-01" }
  },
  {
    file: "js/ahaFeed.js", page: "feed.html", api: "AHAFeed", mount: "feed-list",
    target: "feed-text", emptyHeading: "Ingen oppdateringer ennå", emptyAction: "Skriv første post",
    record: { id: "post-1", text: "Første lokale post" },
    content: /Første lokale post/, deleted: { id: "deleted-post", text: "Skjult", deleted_at: "2026-10-01" }
  },
  {
    file: "js/ahaGallery.js", page: "gallery.html", api: "AHAGallery", mount: "gallery-list",
    target: "gallery-title", emptyHeading: "Samle det du vil huske", emptyAction: "Legg til første minne",
    record: { id: "media-1", title: "Oslo", description: "Et minne", src: "" },
    content: /Oslo/, deleted: { id: "deleted-media", title: "Skjult", deleted_at: "2026-10-01" }
  }
];

for (const entry of cases) {
  const mount = { innerHTML: "" };
  const reads = [];
  const storageWrites = [];
  const document = {
    readyState: "loading",
    addEventListener() {},
    getElementById(id) { return id === entry.mount ? mount : null; }
  };
  const storage = {
    getItem(key) { reads.push(key); return null; },
    setItem(key) { storageWrites.push(key); throw Error("render must not write storage"); }
  };
  const context = { console, Date, Math, JSON, Number, String, Array, Object, Set, Map, document, localStorage: storage };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  const code = fs.readFileSync(entry.file, "utf8");
  vm.runInContext(code, context, { filename: entry.file });
  const api = context[entry.api];
  assert.equal(typeof api.render, "function", entry.api + " must expose render");

  api.render([]);
  assert.match(mount.innerHTML, /data-empty-state="no_data"/);
  assert.match(mount.innerHTML, new RegExp(entry.emptyHeading));
  assert.match(mount.innerHTML, new RegExp(entry.emptyAction));
  assert.match(mount.innerHTML, new RegExp('href="#' + entry.target + '"'));
  assert.match(mount.innerHTML, /role="status"/);
  assert.ok(!mount.innerHTML.includes('href="demo-seed.html"'), "empty state must not seed data");

  api.render([entry.record, entry.deleted]);
  assert.match(mount.innerHTML, entry.content);
  assert.doesNotMatch(mount.innerHTML, /data-empty-state="no_data"/);
  assert.doesNotMatch(mount.innerHTML, /Skjult/);

  api.render([entry.deleted]);
  assert.match(mount.innerHTML, /data-empty-state="no_data"/);
  assert.equal(storageWrites.length, 0, entry.file + " must not write storage when rendering");
  assert.equal(reads.length, 0, entry.file + " should use supplied data without reading storage");

  const html = fs.readFileSync(entry.page, "utf8");
  assert.match(html, new RegExp('id="' + entry.target + '"'), "CTA target must be an existing compose field");
  assert.match(html, new RegExp('id="' + entry.mount + '"'));
}
const css = fs.readFileSync("css/aha-personal-surfaces.css", "utf8");
assert.match(css, /\.aha-personal-page \.aha-personal-empty/);
console.log("AHA personal empty collection journey V1 passed.");
