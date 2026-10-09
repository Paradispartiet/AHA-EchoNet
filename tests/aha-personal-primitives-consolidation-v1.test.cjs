const assert = require("assert");
const fs = require("fs");

const css = fs.readFileSync("css/aha-personal-surfaces.css", "utf8");
const pages = {
  gallery: fs.readFileSync("gallery.html", "utf8"),
  notes: fs.readFileSync("notes.html", "utf8"),
  insta: fs.readFileSync("insta.html", "utf8"),
  feed: fs.readFileSync("feed.html", "utf8")
};

for (const [name, html] of Object.entries(pages)) {
  assert.doesNotMatch(html, /css\/ahaModule\.css/, name + " should not load the legacy module compatibility stylesheet");
  assert.match(html, /css\/aha-personal-surfaces\.css/, name + " should keep the shared personal surface layer");
  assert.match(html, /aha-personal-page/, name + " should stay inside the scoped personal shell");
}

assert.match(css, /\.aha-personal-page \.module-form\s*\{[^}]*display:\s*grid;/s, "personal surfaces should own the module-form layout");
assert.match(css, /\.aha-personal-page \.module-form input,[\s\S]*?background:\s*var\(--aha-color-input\)/, "personal surfaces should own canonical form fields");
assert.match(css, /\.aha-personal-page \.module-list\s*\{[^}]*display:\s*grid;/s, "personal surfaces should own module-list layout");
assert.match(css, /\.aha-personal-page \.module-card\s*\{[^}]*border:\s*1px solid rgba\(255,255,255,.09\)/s, "personal surfaces should own module-card borders");
assert.match(css, /\.aha-personal-page \.module-card\s*\{[^}]*border-radius:\s*var\(--aha-radius-card\)/s, "personal surfaces should own canonical module-card geometry");
assert.match(css, /\.aha-personal-page \.module-card img,[\s\S]*?border-radius:\s*var\(--aha-radius-control\)/, "personal media should keep canonical media geometry");
assert.match(css, /\.aha-personal-page \.module-meta\s*\{[^}]*aha-subtle/s, "personal surfaces should own module metadata typography");
assert.match(css, /\.aha-personal-page \.module-form input:focus,[\s\S]*?personal-accent/s, "personal fields should use the page semantic accent on focus");

for (const [name, formId, listId] of [
  ["gallery", "gallery-form", "gallery-list"],
  ["notes", "note-form", "notes-list"],
  ["feed", "feed-form", "feed-list"]
]) {
  assert.match(pages[name], new RegExp('id="' + formId + '"'), name + " should preserve canonical form #" + formId);
  assert.match(pages[name], new RegExp('id="' + listId + '"'), name + " should preserve canonical list #" + listId);
}

for (const id of ["insta-profile-section","insta-stories","insta-list","insta-form","insta-import-files","insta-import-preview"]) {
  assert.match(pages.insta, new RegExp('id="' + id + '"'), "Insta should preserve runtime mount #" + id);
}

for (const jsPath of ["js/ahaGallery.js","js/ahaNotes.js","js/ahaFeed.js","js/ahaInsta.js"]) {
  const js = fs.readFileSync(jsPath, "utf8");
  assert.doesNotMatch(js, /aha-personal-surfaces/, jsPath + " should remain presentation-agnostic");
}

console.log("AHA personal primitives consolidation V1 contract passed.");
