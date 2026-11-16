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
assert.equal(JSON.parse(contents.get(key))[0].source_app, "historygo");
assert.equal(selected.value, "");
assert.equal(consent.checked, false);
assert.ok(!accesses.some((entry) => entry.includes("aha_import_payload_v1")));
assert.ok(!accesses.some((entry) => entry.includes("hg_psychology_")));
const chamberKey = "aha_insight_chamber_v1";
const savedCard = nodes["aha-psych-saved-list"].children[0];
const buttons = savedCard.children.find((child) => child.className === "aha-psych-actions").children;
const promote = buttons.find((child) => child.textContent === "Bruk som AHA-innsikt");
assert.ok(promote, "only saved private reflections may be opted into the regular insight archive");
assert.equal(contents.has(chamberKey), false, "private save must not create an AHA insight");
const allowConfirmation = win.confirm;
win.confirm = () => false;
promote.handlers.click();
assert.equal(contents.has(chamberKey), false, "cancelled promotion must not write to the common chamber");
win.confirm = allowConfirmation;
contents.set(chamberKey, JSON.stringify({ insights: [{ id: "existing", title: "Uendret" }], other: { keep: true } }));
promote.handlers.click();
let chamber = JSON.parse(contents.get(chamberKey));
assert.equal(chamber.insights.length, 2);
assert.equal(chamber.insights[0].id, "existing");
assert.equal(chamber.other.keep, true);
const copy = chamber.insights[1];
assert.equal(copy.summary, expected.text);
assert.equal(copy.claim_kind, "personal_reflection");
assert.equal(copy.status, "draft");
assert.equal(copy.meta.manual_promotion, true);
assert.equal(copy.published_external, false);
assert.equal(copy.echonet_shared, false);
assert.ok(copy.id.startsWith("aha_psych_insight_"));
assert.equal(JSON.parse(contents.get(key)).length, 1, "original private note must remain intact");
const promotedCard = nodes["aha-psych-saved-list"].children[0];
const promotedActions = promotedCard.children.find((child) => child.className === "aha-psych-actions").children;
const openLink = promotedActions.find((child) => child.textContent === "Åpne i Innsikter");
assert.equal(openLink.href, "insights.html#insight-" + encodeURIComponent(copy.id));
const retract = promotedActions.find((child) => child.textContent === "Fjern AHA-kopien");
assert.ok(retract);
win.confirm = () => false;
retract.handlers.click();
assert.equal(JSON.parse(contents.get(chamberKey)).insights.length, 2);
win.confirm = allowConfirmation;
retract.handlers.click();
chamber = JSON.parse(contents.get(chamberKey));
assert.equal(chamber.insights.length, 1);
assert.equal(chamber.insights[0].id, "existing");
assert.equal(JSON.parse(contents.get(key)).length, 1);

nodes["aha-psych-delete-all"].handlers.click();
assert.equal(JSON.parse(contents.get(key)).length, 0);

selected.value = "Egen tekst skrevet i AHA";
selected.handlers.input();
consent.checked = true;
submit({ preventDefault() {} });
assert.equal(JSON.parse(contents.get(key))[0].source_app, "aha", "manually typed notes must not claim History GO provenance");

const full = Array.from({ length: 30 }, (_, i) => ({
  ...JSON.parse(contents.get(key))[0],
  id: "stored-" + i,
  text: "Historisk notat " + i
}));
contents.set(key, JSON.stringify(full));
selected.value = "Denne skal ikke overskrive noe";
selected.handlers.input();
consent.checked = true;
submit({ preventDefault() {} });
assert.equal(JSON.parse(contents.get(key)).length, 30, "overfull archive cannot silently discard the oldest note");
assert.match(nodes["aha-psych-import-status"].textContent, /30 refleksjoner/);
console.log("aha-psychology-private-bridge.test.cjs passed");
