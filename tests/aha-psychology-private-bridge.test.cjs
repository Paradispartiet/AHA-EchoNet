const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync("js/ahaPsychologyRoomBridge.js", "utf8");

function node() {
  return {
    value: "", checked: false, disabled: false, textContent: "", children: [], handlers: {},
    addEventListener(type, handler) { this.handlers[type] = handler; },
    replaceChildren(...items) { this.children = items; },
    append(...items) { this.children.push(...items); },
    focus() {}
  };
}
const ids = [
  "aha-psych-import-form", "aha-psych-selected-text",
  "aha-psych-import-consent", "aha-psych-import-status",
  "aha-psych-saved-list", "aha-psych-delete-all", "aha-psych-clear-preview"
];
const nodes = Object.fromEntries(ids.map((id) => [id, node()]));
const contents = new Map();
const accesses = [];
const messages = {};
const opener = { postMessage() {} };
const win = {
  opener, crypto: { randomUUID: () => "selected-1" },
  localStorage: {
    getItem(key) { accesses.push("read:" + key); return contents.get(key) ?? null; },
    setItem(key, value) { accesses.push("write:" + key); contents.set(key, value); }
  },
  addEventListener(type, handler) { messages[type] = handler; },
  confirm: () => true
};
const doc = {
  readyState: "complete",
  getElementById(id) { return nodes[id] || null; },
  createElement() { return node(); }
};
vm.runInNewContext(source, { window: win, document: doc, Date, Math, JSON }, {
  filename: "ahaPsychologyRoomBridge.js"
});
const key = "aha_psychology_private_reflections_v1";
assert.ok(messages.message, "bridge must listen for explicitly addressed message");
assert.ok(!accesses.some((entry) => entry.includes("hg_psychology_")));
assert.ok(!accesses.some((entry) => entry.startsWith("write:")));
const selected = nodes["aha-psych-selected-text"];
const consent = nodes["aha-psych-import-consent"];
const submit = nodes["aha-psych-import-form"].handlers.submit;
const expected = {
  type: "historygo.psychology.selection.v1",
  schema_version: "aha_psychology_selection_v1",
  source_app: "historygo",
  text: "Jeg vil prøve fem minutter først."
};
messages.message({ source: opener, origin: "https://evil.example", data: expected });
assert.equal(selected.value, "", "untrusted origins are rejected");
messages.message({ source: {}, origin: "https://paradispartiet.github.io", data: expected });
assert.equal(selected.value, "", "untrusted windows are rejected");
messages.message({ source: opener, origin: "https://paradispartiet.github.io", data: expected });
assert.equal(selected.value, expected.text);
assert.equal(consent.checked, false);
assert.equal(contents.has(key), false, "preview must never persist private text");
submit({ preventDefault() {} });
assert.equal(contents.has(key), false, "submit without separate consent cannot persist");
consent.checked = true;
submit({ preventDefault() {} });
assert.equal(JSON.parse(contents.get(key)).length, 1);
assert.equal(JSON.parse(contents.get(key))[0].text, expected.text);
assert.equal(selected.value, "");
assert.equal(consent.checked, false);
assert.ok(!accesses.some((entry) => entry.includes("aha_import_payload_v1")));
assert.ok(!accesses.some((entry) => entry.includes("hg_psychology_")));
nodes["aha-psych-delete-all"].handlers.click();
assert.equal(JSON.parse(contents.get(key)).length, 0);
console.log("aha-psychology-private-bridge.test.cjs passed");
