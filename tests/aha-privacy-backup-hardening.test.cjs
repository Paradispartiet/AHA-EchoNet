const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
function storage(seed = {}) {
  const data = new Map(Object.entries(seed));
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); }
  };
}
function load(files, seed = {}, doc = undefined) {
  const localStorage = storage(seed);
  const window = { localStorage, document: doc };
  const context = vm.createContext({ window, localStorage, document: doc, Blob, console, setTimeout() {} });
  for (const file of files) {
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context, { filename: file });
  }
  return { window, localStorage };
}
const sources = ["js/ahaPrivacy.js", "js/ahaPrivacyRestore.js", "js/ahaPrivacyPersonalAiMemory.js"];

{
  const { window, localStorage } = load(sources, {
    aha_chat_sessions_v1: JSON.stringify([{ id: "local-s1", messages: [{ id: "m1", text: "private chat" }] }]),
    aha_notes_v1: JSON.stringify([{ id: "note-local" }]),
    aha_meta_insights_memory_v1: JSON.stringify({ version: "v1", feedback: [{ id: "f1" }] })
  });
  assert.equal(window.AHAPrivacy.collectStorageReport().some((x) => x.key === "aha_chat_sessions_v1"), true);
  const chatOnly = window.AHAPrivacyPersonalAiMemory.buildExportPayload({ categories: ["chat"] });
  assert.deepEqual(Object.keys(chatOnly.data), ["aha_chat_sessions_v1"]);
  assert.equal(chatOnly.data.aha_chat_sessions_v1[0].messages[0].text, "private chat");
  assert.equal(chatOnly.privacyReport.some((item) => item.key === "aha_notes_v1"), false);
  const notesOnly = window.AHAPrivacyPersonalAiMemory.buildExportPayload({ categories: ["notes"] });
  assert.deepEqual(Object.keys(notesOnly.data), ["aha_notes_v1", "aha_articles_v1"]);
  assert.equal(Object.hasOwn(notesOnly.data, "aha_meta_insights_memory_v1"), false);
  const full = window.AHAPrivacyPersonalAiMemory.buildExportPayload();
  assert.equal(Object.hasOwn(full.data, "aha_chat_sessions_v1"), true);
  assert.equal(Object.hasOwn(full.data, "aha_meta_insights_memory_v1"), true);
  assert.equal(Object.hasOwn(full.data, "visited_places"), false);
  assert.equal(window.AHAPrivacyRestore.MAX_BACKUP_BYTES, 20_000_000);
  assert.equal(localStorage.getItem("aha_chat_sessions_v1").includes("private chat"), true);
}

{
  const current = [
    { id: "s1", title: "LOCAL", messages: [{ id: "m1", text: "KEEP", meta: { local: true } }] },
    { id: "s2", messages: [] }
  ];
  const { window, localStorage } = load(sources, {
    aha_chat_sessions_v1: JSON.stringify(current),
    aha_notes_v1: JSON.stringify([{ id: "n1", text: "LOCAL" }]),
    aha_profile_name: "LOCAL"
  });
  const backup = JSON.stringify({ meta: { app: "AHA", version: 1 }, data: {
    aha_chat_sessions_v1: [
      { id: "s1", title: "FROM-BACKUP", messages: [
        { id: "m1", text: "WRONG", meta: { imported: true } },
        { id: "m2", text: "ADDED" }
      ] },
      { id: "s3", messages: [{ id: "m3", text: "THIRD" }] }
    ],
    aha_notes_v1: [{ id: "n1", text: "REPLACEMENT" }, { id: "n2", text: "new" }],
    aha_profile_name: "BACKUP",
    hg_unlocks_v1: { stolen: true },
    aha_unknown_key_v20: { test: 1 },
    spotify_access_token: "SECRET"
  } });
  const preview = window.AHAPrivacyPersonalAiMemory.previewRestore(backup);
  assert.equal(preview.skipped.historyGo, 1);
  assert.equal(preview.skipped.unknown, 1);
  assert.equal(preview.skipped.secrets, 1);
  assert.equal(preview.restorableKeys.includes("aha_chat_sessions_v1"), true);
  window.AHAPrivacyPersonalAiMemory.applyRestore(backup);
  const sessions = JSON.parse(localStorage.getItem("aha_chat_sessions_v1"));
  assert.equal(sessions.length, 3);
  assert.equal(sessions[0].title, "LOCAL");
  assert.equal(sessions[0].messages.length, 2);
  assert.equal(sessions[0].messages[0].text, "KEEP");
  assert.equal(sessions[0].messages[0].meta.local, true);
  assert.equal(sessions[0].messages[0].meta.imported, true);
  assert.equal(sessions[0].messages[1].text, "ADDED");
  const notes = JSON.parse(localStorage.getItem("aha_notes_v1"));
  assert.deepEqual(notes.map((x) => x.id), ["n1", "n2"]);
  assert.equal(notes[0].text, "LOCAL");
  assert.equal(localStorage.getItem("aha_profile_name"), "LOCAL");
  assert.equal(localStorage.getItem("hg_unlocks_v1"), null);
  assert.equal(localStorage.getItem("spotify_access_token"), null);
  window.AHAPrivacyPersonalAiMemory.previewRestore(backup);
  const again = window.AHAPrivacyPersonalAiMemory.applyRestore(backup);
  assert.equal(JSON.parse(localStorage.getItem("aha_chat_sessions_v1")).length, 3);
  assert.equal(JSON.parse(localStorage.getItem("aha_chat_sessions_v1"))[0].messages.length, 2);
  assert.ok(again.unchangedCount > 0);
}

{
  const { window, localStorage } = load(sources, {
    aha_meta_insights_memory_v1: JSON.stringify({
      version: "v1", feedback: [{ id: "f-local", createdAt: "2026-01-01", response: "stemmer" }], selfModel: {}
    }),
    aha_personal_retrieval_index_v1: JSON.stringify({ stale: true })
  });
  const backup = JSON.stringify({ data: {
    aha_meta_insights_memory_v1: {
      version: "v1", feedback: [{ id: "f-backup", createdAt: "2026-02-01", response: "feil" }], selfModel: {}
    }
  } });
  const preview = window.AHAPrivacyPersonalAiMemory.previewRestore(backup);
  assert.equal(preview.personalAiMemory, true);
  window.AHAPrivacyPersonalAiMemory.applyRestore(backup);
  assert.deepEqual(JSON.parse(localStorage.getItem("aha_meta_insights_memory_v1")).feedback.map((f) => f.id), ["f-local", "f-backup"]);
  assert.equal(localStorage.getItem("aha_personal_retrieval_index_v1"), null);
}

function makeElement() {
  const handlers = {};
  return {
    disabled: false, value: "", files: [], textContent: "",
    addEventListener(name, fn) { handlers[name] = fn; },
    dispatch(name) { return handlers[name]?.(); }
  };
}
(async () => {
  const elements = {
    "privacy-export-complete": makeElement(),
    "privacy-restore-file": makeElement(),
    "privacy-restore-preview-complete": makeElement(),
    "privacy-restore-apply-complete": makeElement(),
    "privacy-restore-confirmation": makeElement(),
    "privacy-restore-preview-result": makeElement(),
    "privacy-action-message": makeElement()
  };
  const ready = [];
  const document = {
    readyState: "loading",
    getElementById(id) { return elements[id] || null; },
    querySelectorAll() { return []; },
    addEventListener(name, fn) { if (name === "DOMContentLoaded") ready.push(fn); }
  };
  const { localStorage } = load(["js/ahaPrivacyRestore.js", "js/ahaPrivacyPersonalAiMemory.js"], {}, document);
  ready.forEach((fn) => fn());
  const file = elements["privacy-restore-file"];
  const preview = elements["privacy-restore-preview-complete"];
  const apply = elements["privacy-restore-apply-complete"];
  const confirmation = elements["privacy-restore-confirmation"];
  file.files = [{ size: 100, async text() { return JSON.stringify({ data: { aha_notes_v1: [{ id: "note" }] } }); } }];
  file.dispatch("change");
  await preview.dispatch("click");
  assert.equal(apply.disabled, true, "Preview alone must not enable write");
  confirmation.value = "gjenopprett";
  confirmation.dispatch("input");
  assert.equal(apply.disabled, true, "Confirmation is exact and case-sensitive");
  apply.dispatch("click");
  assert.equal(localStorage.getItem("aha_notes_v1"), null);
  confirmation.value = "GJENOPPRETT";
  confirmation.dispatch("input");
  assert.equal(apply.disabled, false);
  apply.dispatch("click");
  assert.equal(JSON.parse(localStorage.getItem("aha_notes_v1"))[0].id, "note");
  assert.equal(apply.disabled, true, "Confirmation is consumed after restore");
  console.log("aha privacy backup hardening: ok");
})().catch((error) => { console.error(error); process.exitCode = 1; });
