const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const SCRIPT_PATH = path.join(ROOT, "js", "ahaPersonalMaterialStatus.js");
const SCRIPT = fs.readFileSync(SCRIPT_PATH, "utf8");

function loadAdapter() {
  let sourceReads = 0;
  const document = {
    readyState: "complete",
    getElementById() { return null; },
    addEventListener() {}
  };
  const context = {
    console,
    document,
    Promise,
    queueMicrotask,
    addEventListener() {}
  };
  context.window = context;
  Object.defineProperty(context, "AHASources", {
    configurable: true,
    get() {
      sourceReads += 1;
      throw new Error("AHASources must not be read outside a personal-material surface");
    }
  });
  vm.createContext(context);
  vm.runInContext(SCRIPT, context, { filename: "ahaPersonalMaterialStatus.js" });
  return { context, api: context.AHAPersonalMaterialStatus, sourceReads };
}

test("personal material status adapter is isolated outside its four surfaces", () => {
  const { api, sourceReads } = loadAdapter();
  assert.ok(api);
  assert.equal(sourceReads, 0);
});

test("source evidence is recognized without exposing technical IDs", () => {
  const { api } = loadAdapter();
  const notes = api.SURFACES.find((surface) => surface.key === "notes");
  const feed = api.SURFACES.find((surface) => surface.key === "feed");
  const gallery = api.SURFACES.find((surface) => surface.key === "gallery");
  const insta = api.SURFACES.find((surface) => surface.key === "insta");

  const events = [
    { id: "src_note_technical", source_type: "note", created_at: "2026-08-11T10:00:00Z", meta: { note_id: "note_1" } },
    { id: "src_feed_technical", source_type: "aha_feed_post", created_at: "2026-08-11T10:01:00Z", meta: { feed_post_id: "feed_1" } },
    { id: "src_gallery_technical", source_type: "aha_gallery_item", created_at: "2026-08-11T10:02:00Z", meta: { gallery_item_id: "gallery_1" } },
    { id: "src_insta_technical", source_type: "aha_insta_imported_post", created_at: "2026-08-11T10:03:00Z", meta: { insta_post_id: "insta_1" } }
  ];

  assert.equal(api.hasSourceEvidence({ id: "note_1" }, events, notes.sourceMetaKey), true);
  assert.equal(api.hasSourceEvidence({ id: "feed_1" }, events, feed.sourceMetaKey), true);
  assert.equal(api.hasSourceEvidence({ id: "gallery_1" }, events, gallery.sourceMetaKey), true);
  assert.equal(api.hasSourceEvidence({ id: "insta_1" }, events, insta.sourceMetaKey), true);
  assert.equal(api.hasSourceEvidence({ id: "legacy_1", last_source_event_id: "src_legacy" }, [], notes.sourceMetaKey), true);

  const noteStatus = api.getMaterialStatus({ id: "note_1" }, events, notes);
  const galleryStatus = api.getMaterialStatus({ id: "gallery_1" }, events, gallery);
  const instaStatus = api.getMaterialStatus({ id: "insta_1" }, events, insta);
  const disconnected = api.getMaterialStatus({ id: "note_missing" }, events, notes);

  assert.deepEqual(JSON.parse(JSON.stringify(noteStatus)), {
    connected: true,
    label: "Koblet til AHA",
    insightsHref: "insights.html",
    local_only: true,
    read_only: true,
    technical_id_visible: false,
    writes_to_ingest: false,
    writes_to_source_events: false,
    music_analysis_enabled: false
  });
  assert.equal(galleryStatus.label, "Teksten er koblet til AHA");
  assert.equal(instaStatus.label, "Tekst koblet til AHA");
  assert.equal(disconnected.connected, false);
  assert.equal(disconnected.insightsHref, "");
  assert.equal(JSON.stringify(noteStatus).includes("src_note_technical"), false);
});

test("technical source IDs are removed from personal-material metadata text", () => {
  const { api } = loadAdapter();
  assert.equal(api.stripTechnicalSourceText("2026-08-11 · source: src_note_123"), "2026-08-11");
  assert.equal(api.stripTechnicalSourceText("Lokal post · Ikke delt · nå · AHA source: src_feed_456"), "Lokal post · Ikke delt · nå");
  assert.equal(api.stripTechnicalSourceText("Ingen teknisk id her"), "Ingen teknisk id her");
});

test("adapter is loaded only on personal text/material surfaces and after their module", () => {
  const pages = [
    ["notes.html", "js/ahaNotes.js"],
    ["feed.html", "js/ahaFeed.js"],
    ["gallery.html", "js/ahaGallery.js"],
    ["insta.html", "js/ahaInsta.js"]
  ];

  for (const [page, moduleScript] of pages) {
    const html = fs.readFileSync(path.join(ROOT, page), "utf8");
    const moduleIndex = html.indexOf(moduleScript);
    const adapterIndex = html.indexOf("js/ahaPersonalMaterialStatus.js");
    assert.ok(moduleIndex >= 0, `${page} loads ${moduleScript}`);
    assert.ok(adapterIndex > moduleIndex, `${page} loads status adapter after its module`);
  }

  const musicHtml = fs.readFileSync(path.join(ROOT, "music.html"), "utf8");
  const musicJs = fs.readFileSync(path.join(ROOT, "js", "ahaMusic.js"), "utf8");
  assert.equal(musicHtml.includes("ahaPersonalMaterialStatus.js"), false);
  assert.ok(musicJs.includes("ai_classified: false"));
});

test("presentation adapter cannot write, ingest, sync or fetch", () => {
  assert.equal(/localStorage\.(?:setItem|removeItem)/.test(SCRIPT), false);
  assert.equal(/AHAIngest/.test(SCRIPT), false);
  assert.equal(/AHARepository/.test(SCRIPT), false);
  assert.equal(/\bfetch\s*\(/.test(SCRIPT), false);
  assert.ok(SCRIPT.includes("action.hidden = status.connected"));
  assert.ok(SCRIPT.includes("technical_id_visible: false"));
  assert.ok(SCRIPT.includes("music_analysis_enabled: false"));
});
