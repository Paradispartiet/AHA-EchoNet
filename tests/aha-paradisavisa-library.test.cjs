"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const root = path.join(__dirname, "..");
const mindmapSource = fs.readFileSync(path.join(root, "js/ahaMindmap.js"), "utf8");
const librarySource = fs.readFileSync(path.join(root, "js/ahaParadisavisa.js"), "utf8");
const page = fs.readFileSync(path.join(root, "paradisavisa.html"), "utf8");
const search = fs.readFileSync(path.join(root, "search.html"), "utf8");
const ID = "/Paradisavisa/artikler/artikkel.html";
const article = { id: ID, url: "https://paradispartiet.github.io" + ID, title: "Nationaltheatret", category: "Kultur",
  summary: "Samfunn og kunst på Tøyen", excerpt: "Historisk bakgrunn for teateret", publishedAt: "2026-11-10",
  readAt: "2026-11-12T10:00:00.000Z", savedAt: "2026-11-12T11:00:00.000Z", tags: ["Byutvikling"] };
const storage = new Map(Object.entries({
  aha_paradisavisa_library_v1: JSON.stringify({ version: 1, trackingEnabled: false, articles: [
    article,
    { ...article, id: "/Paradisavisa/artikler/apnet.html", url: "https://paradispartiet.github.io/Paradisavisa/artikler/apnet.html", readAt: null, savedAt: null, excerpt: "Bare åpnet", openedAt: "2026-11-12" },
    { ...article, id: "/Paradisavisa/artikler/ondsinnet.html", url: "https://foreign.invalid/steal" }
  ] }),
  aha_lists_v1: JSON.stringify([{ id: "L", title: "Kultur", items: [{ id: "L1", title: article.title, source: "paradisavisa", refId: ID, type: "article" }] }]),
  aha_paths_v1: JSON.stringify([{ id: "P", title: "Tøyen", steps: [{ id: "P1", title: article.title, source: "paradisavisa", refId: ID, type: "article" }] }])
}));
let writes = 0;
const controls = {
  "aha-avisa-query": { value: "" }, "aha-avisa-scope": { value: "all" },
  "aha-avisa-category": { value: "all" }, "aha-avisa-period": { value: "all" },
  "aha-avisa-sort": { value: "recent" }
};
const context = { window: null, console, Date, URL,
  location: { origin: "https://paradispartiet.github.io" },
  document: { readyState: "loading", addEventListener() {}, getElementById: (id) => controls[id] || null },
  localStorage: { getItem: (key) => storage.get(key) ?? null, setItem() { writes++; throw Error("read-only gate"); } }
};
context.window = context;
vm.createContext(context);
vm.runInContext(librarySource, context, { filename: "js/ahaParadisavisa.js" });
vm.runInContext(mindmapSource, context, { filename: "js/ahaMindmap.js" });
const data = context.AHAParadisavisa.load();
assert.equal(data.articles.length, 2, "Malicious foreign URL must be rejected");
assert.equal(data.articles[0].id, ID);
const graph = context.AHAMindmap.collectGraphData();
const node = graph.nodes.find((item) => item.source === "paradisavisa" && item.refId === ID);
assert.ok(node, "Saved/marked-read article should appear in mindmap");
assert.equal(node.href, "paradisavisa.html");
assert.equal(graph.nodes.some((item) => item.refId === "/Paradisavisa/artikler/apnet.html"), false, "Opened-only article must not become a knowledge node");
assert.ok(graph.edges.some((e) => e.from === "list::aha_lists::L" && e.to === node.id && e.type === "list_contains"));
assert.ok(graph.edges.some((e) => e.from === "path::aha_paths::P" && e.to === node.id && e.type === "path_contains"));
assert.equal(writes, 0, "Read-only browsing and mindmap must not write");
controls["aha-avisa-query"].value = "teateret";
assert.equal(context.AHAParadisavisa.filtered(data.articles).length, 1, "Content search should match excerpt");
controls["aha-avisa-query"].value = "";
controls["aha-avisa-scope"].value = "read";
assert.equal(context.AHAParadisavisa.filtered(data.articles).length, 1);
controls["aha-avisa-scope"].value = "all";
controls["aha-avisa-category"].value = "Byutvikling";
assert.equal(context.AHAParadisavisa.filtered(data.articles).length, 2, "Manual topic tags should be searchable");
assert.match(page, /id="aha-avisa-query"/);
assert.match(page, /id="aha-avisa-category"/);
assert.match(page, /id="aha-avisa-sort"/);
assert.match(page, /id="aha-avisa-clear-history"/);
assert.match(search, /href="paradisavisa\.html"/);
for (const forbidden of ["fetch(", "XMLHttpRequest", "sendBeacon", "AHARepository", "AHAIngest", "supabase"]) {
  assert.equal(librarySource.includes(forbidden), false, "Library must not activate network or ingest: " + forbidden);
}
console.log("PASS: Paradisavisa library is local-only, filterable, source-linked and graph-compatible");