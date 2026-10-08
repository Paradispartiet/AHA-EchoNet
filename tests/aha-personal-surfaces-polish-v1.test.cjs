const assert = require("assert");
const fs = require("fs");

const css = fs.readFileSync("css/aha-personal-surfaces.css", "utf8");
const pages = {
  profile: fs.readFileSync("profile.html", "utf8"),
  notes: fs.readFileSync("notes.html", "utf8"),
  feed: fs.readFileSync("feed.html", "utf8"),
  gallery: fs.readFileSync("gallery.html", "utf8"),
  insta: fs.readFileSync("insta.html", "utf8")
};

for (const [name, html] of Object.entries(pages)) {
  assert.match(html, /css\/aha-personal-surfaces\.css/, `${name} should load the shared personal surface layer`);
  assert.match(html, /aha-personal-page/, `${name} should opt into the shared personal surface shell`);
  assert.match(html, /aha-personal-header/, `${name} should use the flattened personal header`);
}

assert.match(pages.profile, /aha-profile-page/, "Mitt AHA should use the profile overview grid");
assert.match(pages.profile, /aha-profile-card-historygo/, "History Go should keep a dedicated profile card");
assert.match(pages.profile, /aha-profile-card-privacy/, "Privacy should keep a dedicated profile card");
assert.match(pages.profile, /aha-profile-card-meta/, "Meta profile should keep a dedicated profile card");
assert.match(pages.profile, /aha-profile-card-archive/, "Afterwork should keep a dedicated profile card");
for (const phrase of [
  "lokal statusflate",
  "Ingen profil deles eksternt",
  "Ingen EchoNet-identitet er aktivert",
  "History Go-statusen vises som lokal read-only importstatus",
  "AHA Profil skriver ikke tilbake til History Go"
]) {
  assert.ok(pages.profile.includes(phrase), `Mitt AHA boundary copy should preserve: ${phrase}`);
}

for (const [name, formId, listId] of [
  ["notes", "note-form", "notes-list"],
  ["feed", "feed-form", "feed-list"],
  ["gallery", "gallery-form", "gallery-list"]
]) {
  const html = pages[name];
  assert.match(html, new RegExp(`id="${formId}"`), `${name} should preserve its canonical form id`);
  assert.match(html, new RegExp(`id="${listId}"`), `${name} should preserve its canonical list mount`);
  assert.match(html, /aha-personal-compose/, `${name} should expose one primary composer surface`);
  assert.match(html, /aha-personal-collection/, `${name} should expose one collection surface`);
}

assert.match(css, /\.aha-profile-page\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s, "Mitt AHA should use a two-column overview on wider screens");
assert.match(css, /\.aha-gallery-page #gallery-list\s*\{[^}]*grid-template-columns:\s*repeat\(2,/s, "Gallery should use a media grid on wider screens");
assert.match(css, /\.aha-notes-page #notes-list \.module-card > p\s*\{[^}]*white-space:\s*pre-wrap;/s, "Notes should preserve written formatting");
assert.match(css, /\.aha-feed-page #feed-list \.module-card > p\s*\{[^}]*line-height:\s*1\.6;/s, "Feed posts should have readable text rhythm");
assert.match(css, /\.aha-insta-page > \.insta-feed-section\s*\{[^}]*background:\s*transparent;/s, "Insta feed shell should be flattened without replacing its dedicated feed UI");
assert.match(css, /button\[data-note-delete\],[\s\S]*button\[data-feed-delete\],[\s\S]*button\[data-gallery-delete\]/, "destructive personal-surface actions should share one visual treatment");

for (const jsPath of ["js/ahaNotes.js", "js/ahaFeed.js", "js/ahaGallery.js", "js/ahaInsta.js", "js/ahaProfile.js"]) {
  const js = fs.readFileSync(jsPath, "utf8");
  assert.doesNotMatch(js, /aha-personal-surfaces/, `${jsPath} should not gain presentation coupling`);
}

console.log("AHA personal surfaces polish V1 contract passed.");
