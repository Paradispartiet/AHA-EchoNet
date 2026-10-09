const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

function run(file, context) {
  vm.runInNewContext(fs.readFileSync(file, "utf8"), context, { filename: file });
}

function createStorage(seed = {}) {
  const values = new Map(Object.entries(seed).map(([key, value]) => [key, String(value)]));
  const writes = [];
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { writes.push(String(key)); values.set(String(key), String(value)); },
    removeItem(key) { writes.push(String(key)); values.delete(String(key)); },
    values,
    writes
  };
}

const userFeed = {
  id: "user_feed_keep",
  text: "Dette er ekte lokal brukerdata og skal beholdes.",
  created_at: "2026-01-01T09:00:00.000Z",
  local_only: true,
  meta: { local_only: true }
};
const userGallery = {
  id: "user_gallery_keep",
  title: "Egen referanse",
  description: "Denne skal overleve seed-fjerning.",
  created_at: "2026-01-01T09:01:00.000Z",
  local_only: true,
  meta: { local_only: true }
};

const storage = createStorage({
  aha_feed_posts_v1: JSON.stringify([userFeed]),
  aha_gallery_v1: JSON.stringify([userGallery])
});

const context = { window: {}, globalThis: null, console, localStorage: storage };
context.globalThis = context.window;
context.window.localStorage = storage;
run("js/ahaLocalExamples.js", context);

const api = context.window.AHALocalExamples;
assert.ok(api, "local examples API should load");

const preview = api.previewExamples();
assert.equal(preview.total, 4);
assert.equal(preview.explicit_install_required, true);
assert.equal(preview.reversible, true);
assert.equal(preview.notes_excluded, true);

const before = api.collectExampleStatus({ storage });
assert.equal(before.installed, 0);
assert.equal(before.fully_installed, false);

const first = api.installExamples({ storage });
assert.equal(first.ok, true);
assert.equal(first.added, 4);
assert.equal(first.skipped, 0);
assert.equal(first.status.fully_installed, true);

const feedAfterFirst = JSON.parse(storage.getItem("aha_feed_posts_v1"));
const galleryAfterFirst = JSON.parse(storage.getItem("aha_gallery_v1"));
assert.equal(feedAfterFirst.some((item) => item.id === userFeed.id), true, "existing Feed data must survive install");
assert.equal(galleryAfterFirst.some((item) => item.id === userGallery.id), true, "existing Gallery data must survive install");
assert.equal(feedAfterFirst.filter(api.isOwnExample).length, 2);
assert.equal(galleryAfterFirst.filter(api.isOwnExample).length, 2);

const second = api.installExamples({ storage });
assert.equal(second.ok, true);
assert.equal(second.added, 0, "second install must not duplicate examples");
assert.equal(second.skipped, 4);

const removed = api.removeExamples({ storage });
assert.equal(removed.ok, true);
assert.equal(removed.removed, 4);
assert.equal(removed.status.installed, 0);

const feedAfterRemove = JSON.parse(storage.getItem("aha_feed_posts_v1"));
const galleryAfterRemove = JSON.parse(storage.getItem("aha_gallery_v1"));
assert.deepEqual(feedAfterRemove, [userFeed], "remove must preserve existing Feed data");
assert.deepEqual(galleryAfterRemove, [userGallery], "remove must preserve existing Gallery data");

assert.deepEqual(
  [...new Set(storage.writes)].sort(),
  ["aha_feed_posts_v1", "aha_gallery_v1"],
  "seeder may write only the two explicit local stores"
);

const modelSource = fs.readFileSync("js/ahaLocalExamples.js", "utf8");
const dashboardSource = fs.readFileSync("js/ahaLocalExamplesDashboard.js", "utf8");
assert.doesNotMatch(modelSource, /aha_notes_v1/, "Notes must remain excluded from example storage");
assert.doesNotMatch(modelSource, /(?:window|global)\.AHAIngest/, "seeder must not call AHAIngest");
assert.doesNotMatch(modelSource, /(?:window|global)\.AHARepository/, "seeder must not call AHARepository");
assert.doesNotMatch(modelSource, /fetch\s*\(|XMLHttpRequest|sendBeacon/, "seeder must not use network APIs");
assert.doesNotMatch(dashboardSource, /installExamples\?\.\(\).*init|init\(\)[\s\S]{0,120}installExamples/s, "examples must not install automatically");

const html = fs.readFileSync("examples.html", "utf8");
assert.match(html, /Notes seedes ikke/, "page should explain why Notes are excluded");
assert.match(html, /id="aha-examples-install"/, "page should require explicit install action");
assert.match(html, /id="aha-examples-remove"/, "page should expose reversible removal");
assert.match(html, /aha-dashboard aha-shell-content aha-examples-page/, "page should use canonical shell");

console.log("AHA Local Examples V1 contract passed.");
