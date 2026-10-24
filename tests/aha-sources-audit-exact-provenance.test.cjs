const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const store = new Map();
const context = {
  localStorage: {
    getItem(key) { return store.get(key) ?? null; },
    setItem(key, value) { store.set(key, String(value)); }
  },
  document: { addEventListener() {} },
  addEventListener() {}
};
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js/ahaSourcesAudit.js"), "utf8"), context, {
  filename: "js/ahaSourcesAudit.js"
});

function seed(events, insights) {
  store.set("aha_source_events_v1", JSON.stringify(events));
  store.set("aha_insight_chamber_v1", JSON.stringify({ insights }));
}

seed([
  { id: "source-a", source_app: "chat", source_type: "message", text: "Biblioteker kan være møteplasser." },
  { id: "source-b", source_app: "chat", source_type: "message", text: "En uavhengig diskusjon om bymiljø." },
  { event_id: "source-c", source_app: "notes", source_type: "note", text: "Lagring via alternativ kilde-ID." },
  { source_app: "chat", source_type: "message", text: "Uidentifiserbar hendelse." }
], [
  { id: "ins-a", source_event_id: "source-a", summary: "Knyttet til bibliotek." },
  { id: "ins-c", sourceEventId: "source-c", summary: "Knyttet til notatet." },
  { id: "orphan", source_event_id: "does-not-exist", summary: "Manglende kilde." },
  { id: "unlinked", source_app: "chat", source_type: "message", summary: "Samme app/type, men ingen kilde-ID." },
  { id: "unlinked-import", import_source: "chat", source_type: "message", summary: "Import uten dokumentert kobling." }
]);

let report = context.AHASourcesAudit.collectAuditReport();
const byId = new Map(report.events.map(event => [event.id, event]));
assert.deepEqual(Array.from(byId.get("source-a").linked_insights.map(x => x.id)), ["ins-a"]);
assert.equal(byId.get("source-b").has_insight, false, "same app and type must not fabricate provenance");
assert.deepEqual(Array.from(byId.get("source-c").linked_insights.map(x => x.id)), ["ins-c"], "event_id alias must be recognized");
assert.equal(report.events[3].has_insight, false, "event without ID cannot be linked by coincidence");
assert.equal(report.summary.sourceEventsWithInsight, 2);
assert.equal(report.summary.sourceEventsWithoutInsight, 2);
assert.equal(report.insightsWithoutSourceEventId.length, 2);
assert.equal(report.summary.insightsWithSourceEventId, 3);

seed([
  { id: "same-app-1", source_app: "chat", source_type: "message", text: "Første post." },
  { id: "same-app-2", source_app: "chat", source_type: "message", text: "Andre post." }
], [
  { id: "no-provenance", source_app: "chat", source_type: "message", summary: "Uspesifisert kildetilknytning." }
]);
report = context.AHASourcesAudit.collectAuditReport();
assert.equal(report.summary.sourceEventsWithInsight, 0);
assert.equal(report.summary.sourceEventsWithoutInsight, 2);
assert.equal(report.insightsWithoutSourceEventId.length, 1);
console.log("AHA source provenance: only exact explicit event IDs establish links.");
