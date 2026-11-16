// Validates explicit, local-only artwork references end-to-end through AHA Lists and Mindmap.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const store = new Map([["aha_profile_id", "artist-1"]]);
const localStorage = {
  getItem: (key) => store.has(key) ? store.get(key) : null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key)
};
const window = { localStorage, location: { hash: "" } };
const context = {
  window, localStorage, console, Date, Intl, setTimeout,
  document: { readyState: "loading", addEventListener() {}, getElementById: () => null }
};
for (const file of ["js/ahaKunstrommetReferences.js", "js/ahaLists.js", "js/ahaMindmap.js"]) {
  vm.runInNewContext(read(file), context, { filename: file });
}
const refs = window.AHAKunstrommetReferences;
const lists = window.AHALists;
const map = window.AHAMindmap;
assert.ok(refs && lists && map);
assert.deepEqual([...refs.load()], [], "No art is discoverable before opt-in");
let list = lists.createList({ title: "Mine malerier", type: "favorites" });
assert.ok(list?.id);
let result = lists.addItemToList(list.id, { source: "aha_kunstrommet", type: "artwork", refId: "art-1" });
assert.equal(result.ok, false, "Aha must reject unlinked artwork identity");
assert.equal(result.detail, "source_missing");

const art = { id: "art-1", owner: "artist-1", title: "Havet", note: "Hemmelig notat", strokes: [{ color: "#101010", points: [{ x: 1, y: 1 }] }] };
refs.upsert(art);
const rawMeta = store.get(refs.KEY);
assert.ok(rawMeta.includes("Havet"));
assert.ok(!rawMeta.includes("Hemmelig"));
assert.ok(!rawMeta.includes("strokes"));
assert.ok(!rawMeta.includes("#101010"));
assert.ok(!rawMeta.includes("points"));

const available = lists.collectAvailableItems().find((item) => item.refId === "art-1");
assert.equal(available.source, "aha_kunstrommet");
assert.equal(available.type, "artwork");
result = lists.addItemToList(list.id, { source: "aha_kunstrommet", type: "artwork", refId: "art-1", meta: { local_only: true } });
assert.equal(result.ok, true);
assert.equal(result.item.title, "Havet");
assert.equal(lists.addItemToList(list.id, { source: "aha_kunstrommet", type: "artwork", refId: "art-1" }).reason, "duplicate");
assert.equal(JSON.parse(store.get("aha_lists_v1"))[0].items.length, 0,
  "Shared AHA lists must never store artwork titles or project IDs");
assert.equal(lists.loadLists()[0].items[0].title, "Havet",
  "Current profile sees owner-scoped artwork membership");

let graph = map.collectGraphData();
const artwork = graph.nodes.find((node) => node.refId === "art-1" && node.type === "artwork");
assert.ok(artwork, "Opted-in artwork has a read-only mindmap node");
assert.equal(artwork.href, "kunstrommet.html#art-art-1");
assert.equal(artwork.meta.local_only, true);
assert.equal(artwork.meta.published_external, false);
assert.equal(artwork.meta.echonet_shared, false);
assert.ok(graph.edges.some((edge) => edge.type === "list_contains" && edge.to === artwork.id), "Explicit collection membership becomes a mindmap edge");

// Only the identity updates after an already opted-in project changes title.
refs.upsert({ ...art, title: "Havet i kveld" });
assert.equal(refs.load()[0].title, "Havet i kveld");
assert.equal(refs.load().length, 1);

// A different local profile must not discover the first profile's reference.
store.set("aha_profile_id", "artist-2");
assert.equal(refs.load().length, 0, "Artwork pointers are scoped by local profile");
assert.equal(lists.loadLists()[0].items.length, 0, "Other profile cannot see collection item or title");
graph = map.collectGraphData();
assert.ok(!graph.nodes.some((node) => node.refId === "art-1" && node.type === "artwork"));
assert.ok(!graph.edges.some((edge) => edge.type === "list_contains"));
assert.throws(() => refs.upsert(art), /ugyldig lokal identitet/);
store.set("aha_profile_id", "artist-1");

// Deletion removes the owner-scoped membership without modifying other list data.
assert.equal(refs.remove("art-1"), true);
assert.equal(refs.load().length, 0);
assert.equal(refs.memberships().length, 0);
assert.equal(lists.loadLists()[0].items.length, 0);
assert.equal(lists.validateListReference({ source: "aha_kunstrommet", type: "artwork", refId: "art-1" }).ok, false);
graph = map.collectGraphData();
assert.equal(graph.nodes.some((node) => node.type === "artwork"), false);
assert.equal(graph.edges.some((edge) => edge.type === "list_contains"), false);

const html = read("kunstrommet.html");
assert.match(html, /kunstrommet-link-collection/);
assert.match(html, /kunstrommet-collection-select/);
assert.match(read("lists.html"), /ahaKunstrommetReferences\.js/);
assert.match(read("mindmap.html"), /ahaKunstrommetReferences\.js/);
assert.doesNotMatch(read("js/ahaKunstrommetReferences.js"), /\bfetch\s*\(|\bXMLHttpRequest\b|AHAIngest|EchoNet.*send/i);
// Legacy bridge migration: old PR versions put artwork title into the shared
// AHA list. Migrate into the private overlay and scrub shared data.
refs.upsert(art);
store.set("aha_lists_v1", JSON.stringify([{
  id: list.id, title: "Mine malerier", type: "favorites",
  items: [{ id: "legacy-1", source: "aha_kunstrommet", type: "artwork",
    refId: "art-1", title: "Havet er privat" }]
}]));
const migrated = lists.loadLists();
assert.equal(migrated[0].items.length, 1);
assert.equal(migrated[0].items[0].title, "Havet");
assert.equal(refs.memberships().length, 1);
assert.equal(JSON.parse(store.get("aha_lists_v1"))[0].items.length, 0,
  "Legacy global art row must be removed after migration");
assert.equal(store.get("aha_lists_v1").includes("Havet er privat"), false,
  "Legacy artwork title must not survive in globally shared list storage");
store.set("aha_profile_id", "artist-2");
assert.equal(lists.loadLists()[0].items.length, 0,
  "Migrated legacy artwork must remain invisible to another local profile");
store.set("aha_profile_id", "artist-1");

console.log("Kunstrommet references: PASS (opt-in, owner-scoped memberships, legacy cleanup, lists, mindmap, profile and deletion)");
