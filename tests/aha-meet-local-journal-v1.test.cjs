const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const stored = new Map();
const localStorage = {
  getItem: (key) => stored.get(key) ?? null,
  setItem: (key, value) => stored.set(key, String(value))
};
const ctx = {
  window: null,
  globalThis: null,
  localStorage,
  Date, Math,
  crypto: { randomUUID: () => "uuid-" + stored.size },
  fetch: () => { throw Error("Meet must never fetch or share"); }
};
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js/ahaMeet.js"), "utf8"), ctx);
const meet = ctx.AHAMeet;
assert.equal(meet.KEY, "aha_meet_journal_v1");
assert.deepEqual(Array.from(meet.load()), []);
assert.equal(meet.save({ title: "A", date: "2026-10-23" }).ok, false, "invalid title must be rejected");
assert.equal(meet.save({ title: "Møte", date: "2026-02-31" }).ok, false, "nonexistent date must be rejected");

const created = meet.save({
  title: "Planlegging", date: "2026-10-23", kind: "meeting",
  notes: "Hva vi avtalte", takeaway: "Undersøk årsakene"
});
assert.equal(created.ok, true);
assert.equal(meet.load().length, 1);
assert.equal(meet.load()[0].local_only, true);
const originalId = created.item.id;

const edited = meet.save({
  id: originalId, title: "Planlegging – oppdatert", date: "2026-10-22",
  kind: "visit", notes: "Besøkte biblioteket", takeaway: "Les boken"
});
assert.equal(edited.ok, true);
assert.equal(edited.item.id, originalId);
assert.equal(meet.load().length, 1, "editing must never duplicate");
assert.equal(meet.getFiltered("biblioteket").length, 1);
assert.equal(meet.getFiltered("INGEN").length, 0);
assert.equal(meet.load()[0].kind, "visit");

assert.equal(meet.save({ id: "missing", title: "Test", date: "2026-10-22" }).ok, false);
assert.equal(meet.save({ title: "Lang", date: "2026-10-22", notes: "x".repeat(3001) }).ok, false);
assert.equal(meet.remove(originalId).ok, true);
assert.equal(meet.load().length, 0);
assert.equal(meet.remove(originalId).ok, false);

stored.set(meet.KEY, "{BROKEN");
assert.deepEqual(Array.from(meet.load()), [], "corrupt data must not crash the UI");
stored.clear();
const malicious = meet.save({
  title: '<img src=x onerror="alert(1)">',
  date: "2026-10-21",
  notes: "<script>exfiltrate()</script>"
});
assert.equal(malicious.ok, true);
assert.equal(meet.load()[0].notes, "<script>exfiltrate()</script>", "storage preserves notes; the DOM renders via textContent");
assert.equal(meet.load()[0].local_only, true);
const source = fs.readFileSync(path.join(__dirname, "..", "meet.html"), "utf8");
assert.match(source, /id="meet-form"/);
assert.match(source, /id="meet-list"/);
assert.match(source, /js\/ahaMeet\.js/);
assert.match(source, /css\/aha-meet\.css/);
assert.doesNotMatch(fs.readFileSync(path.join(__dirname, "..", "js/ahaMeet.js"), "utf8"), /\bfetch\s*\(/, "no network fetch");
console.log("AHA Meet local journal: CRUD, validation, search, corrupt-state handling and safety passed");
