const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function makeStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(key, String(value)); },
    removeItem(key) { map.delete(key); }
  };
}

function load(seed = {}) {
  const localStorage = makeStorage(seed);
  const window = { localStorage, AHAPrivacy: { refresh() {} } };
  const context = vm.createContext({ window, Blob });
  const source = fs.readFileSync(path.join(__dirname, "..", "js", "ahaPrivacyRestore.js"), "utf8");
  vm.runInContext(source, context);
  return { api: window.AHAPrivacyRestore, localStorage };
}

{
  const { api, localStorage } = load({ untouched: "keep", aha_profile_name: "Old" });
  const backup = JSON.stringify({
    meta: { app: "AHA", version: 1 },
    data: {
      aha_profile_name: "New",
      aha_notes_v1: [{ id: 1 }],
      visited_places: ["x"],
      aha_unknown_v9: { x: 1 },
      spotify_access_token: "NOPE"
    }
  });
  const preview = api.previewRestore(backup);
  assert.deepEqual([...preview.restorableKeys], ["aha_notes_v1", "aha_profile_name"]);
  assert.equal(preview.skipped.historyGo, 1);
  assert.equal(preview.skipped.unknown, 1);
  assert.equal(preview.skipped.secrets, 1);
  const result = api.applyRestore(backup);
  assert.equal(result.appliedCount, 2);
  assert.equal(localStorage.getItem("untouched"), "keep");
  assert.equal(localStorage.getItem("aha_profile_name"), "New");
  assert.equal(localStorage.getItem("visited_places"), null);
  assert.equal(localStorage.getItem("spotify_access_token"), null);
}

{
  const { api, localStorage } = load({
    aha_identity_v3: JSON.stringify({ name: "Old", token: "KEEP-ME", nested: { credential: "KEEP-CRED", x: 1 } })
  });
  const backup = JSON.stringify({
    identity: { name: "New", token: "ATTACK", nested: { credential: "ATTACK-CRED", y: 2 } }
  });
  const preview = api.previewRestore(backup);
  assert.equal(preview.restorableCount, 1);
  assert.equal(preview.skipped.secrets, 2);
  api.applyRestore(backup);
  const identity = JSON.parse(localStorage.getItem("aha_identity_v3"));
  assert.equal(identity.name, "New");
  assert.equal(identity.token, "KEEP-ME");
  assert.equal(identity.nested.credential, "KEEP-CRED");
  assert.equal(identity.nested.x, 1);
  assert.equal(identity.nested.y, 2);
}

{
  const { api, localStorage } = load({ aha_notes_v1: JSON.stringify([{ id: "old" }]) });
  assert.throws(() => api.applyRestore(JSON.stringify({ data: { aha_notes_v1: [] } })), /forhåndsvisning/i);
  assert.deepEqual(JSON.parse(localStorage.getItem("aha_notes_v1")), [{ id: "old" }]);
}

{
  const { api, localStorage } = load({ preserved: "yes" });
  assert.throws(() => api.previewRestore("{bad json"), /ugyldig JSON/i);
  assert.equal(localStorage.getItem("preserved"), "yes");
}

{
  const { api } = load();
  const preview = api.previewRestore(JSON.stringify({
    settings: { localOnly: false, allowAnalytics: true, token: "skip" },
    profile: { ahaProfile: { displayName: "Ada" } },
    history: { visited_places: ["x"] }
  }));
  assert.deepEqual([...preview.restorableKeys], ["aha_privacy_settings_v1", "ahaProfile"]);
  assert.equal(preview.skipped.historyGo, 1);
  assert.equal(preview.skipped.secrets, 1);
}

{
  const { api } = load();
  const preview = api.previewRestore(JSON.stringify({ data: { aha_notes_v1: { wrong: true } } }));
  assert.equal(preview.restorableCount, 0);
  assert.equal(preview.skipped.invalid, 1);
}

console.log("aha privacy restore contract: ok");
