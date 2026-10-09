const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function load(file) {
  const context = {
    console, Date, JSON, Math, Map, Set, Number, String, Array, Object,
    document: { readyState: "loading", addEventListener() {}, getElementById() { return null; } },
    localStorage: { getItem() { throw Error("empty-state copy must not read stored records"); },
      setItem() { throw Error("empty-state copy must not write records"); } },
    sessionStorage: { getItem() { throw Error("empty-state copy must not access tokens"); } }
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  return context;
}

const insta = load("js/ahaInsta.js").AHAInsta;
const firstPost = insta.buildEmptyFeedMarkup(0, "all");
assert.match(firstPost, /data-empty-state="no_data"/);
assert.match(firstPost, /data-insta-open-compose="1"/);
assert.match(firstPost, /Ingenting publiseres eksternt/);
assert.doesNotMatch(firstPost, /data-insta-show-all/);
for (const filter of ["mine", "following"]) {
  const filtered = insta.buildEmptyFeedMarkup(3, filter);
  assert.match(filtered, /data-empty-state="filtered_empty"/);
  assert.match(filtered, /data-insta-show-all="1"/);
  assert.doesNotMatch(filtered, /data-insta-open-compose/);
}
const instaHtml = fs.readFileSync("insta.html", "utf8");
assert.match(instaHtml, /id="insta-compose-panel"/);
assert.match(instaHtml, /id="insta-src"/);

const music = load("js/ahaMusic.js").AHAMusic;
const disconnected = music.buildMusicOnboarding({ tracks: [], playlists: [], sources: [{ id: "old" }] }, false);
assert.match(disconnected, /Begynn med Spotify-tilkoblingen/);
assert.match(disconnected, /href="#spotify-connect-title"/);
const connected = music.buildMusicOnboarding({ tracks: [], playlists: [], sources: [] }, true);
assert.match(connected, /Importer musikken du vil samle/);
assert.match(connected, /href="#spotify-import-title"/);
assert.equal(music.buildMusicOnboarding({ tracks: [{ id: "t" }], playlists: [] }, true), "");
assert.equal(music.buildMusicOnboarding({ tracks: [], playlists: [{ id: "p" }] }, false), "");
const musicHtml = fs.readFileSync("music.html", "utf8");
for (const id of ["spotify-connect-title", "spotify-import-title"]) {
  assert.ok(musicHtml.includes('id="' + id + '"'));
}

const insights = load("js/ahaInsights.js").AHAInsights;
const noArchive = insights.buildInsightsEmptyMarkup(0, 0);
assert.match(noArchive, /data-empty-state="no_data"/);
assert.match(noArchive, /href="chat.html"/);
assert.doesNotMatch(noArchive, /href="sources.html"/);
const withSources = insights.buildInsightsEmptyMarkup(0, 3);
assert.match(withSources, /href="sources.html"/);
const filtered = insights.buildInsightsEmptyMarkup(4, 2);
assert.match(filtered, /data-empty-state="filtered_empty"/);
assert.match(filtered, /data-insights-reset-filters="1"/);
assert.doesNotMatch(filtered, /href="chat.html"/);
const source = fs.readFileSync("js/ahaInsights.js", "utf8");
assert.match(source, /if \(target\.dataset\.insightsResetFilters\)/);
assert.match(source, /if \(search\) search\.value = ""/);
assert.match(source, /if \(filter\) filter\.value = "all"/);

for (const file of ["js/ahaInsta.js", "js/ahaMusic.js", "js/ahaInsights.js"]) {
  const text = fs.readFileSync(file, "utf8");
  const match = text.match(/function build(?:EmptyFeedMarkup|MusicOnboarding|InsightsEmptyMarkup)\([^]*?\n  }\n/);
  assert.ok(match, file + " should have a pure empty-state builder");
  assert.doesNotMatch(match[0], /(?:localStorage|sessionStorage|fetch\s*\(|AHAIngest)/);
}
console.log("AHA Insta, Music and Insights empty-state V1 passed.");
