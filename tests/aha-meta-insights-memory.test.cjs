// Tester for AHAMetaInsightsMemory – lokalt meta-minne for
// brukerbekreftet selvinnsikt. Feedback på AI-claims bygger en aktiv
// selvmodell (bekreftet/delvis/avvist/viktig/utdatert) som agenten og
// MetaInsightsEngine kan bruke i senere meta-vurderinger.

const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const store = new Map();
const context = {
  console, Date, Math, JSON, setTimeout, clearTimeout,
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => store.delete(k)
  }
};
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("js/metaInsightsMemory.js", "utf8"), context, { filename: "js/metaInsightsMemory.js" });

const Memory = context.AHAMetaInsightsMemory;
assert.ok(Memory, "window.AHAMetaInsightsMemory skal eksporteres");
for (const fn of ["loadMemory", "saveMemory", "addFeedback", "summarizeMemory", "updateSelfModelFromFeedback", "buildMemoryPack"]) {
  assert.equal(typeof Memory[fn], "function", `${fn} skal eksporteres`);
}

// 8. loadMemory håndterer tomt lager.
{
  const memory = Memory.loadMemory();
  assert.equal(memory.version, "v1");
  assert.deepEqual(memory.feedback, []);
  for (const key of ["confirmedClaims", "partialClaims", "rejectedClaims", "importantClaims", "outdatedClaims", "activePatterns", "activeProjects", "activeTensions"]) {
    assert.ok(Array.isArray(memory.selfModel[key]), `selfModel.${key} skal være en liste`);
    assert.equal(memory.selfModel[key].length, 0, `selfModel.${key} skal være tom`);
  }

  // Korrupt lager skal også tåles.
  store.set("aha_meta_insights_memory_v1", "ikke-json{{{");
  const recovered = Memory.loadMemory();
  assert.equal(recovered.version, "v1");
  assert.deepEqual(recovered.feedback, []);
  store.delete("aha_meta_insights_memory_v1");
}

// 9. addFeedback lagrer feedback-entry.
{
  const result = Memory.addFeedback({
    sessionId: "meta_ai_session_1",
    claimId: "claim_1",
    claimText: "Du bygger et arbeid rundt kapitalisme.",
    response: "stemmer",
    note: "ja, helt riktig",
    basis: ["2 innsikter om klimapolitikk"],
    confidence: 0.7
  });
  assert.equal(result.ok, true, "gyldig feedback skal lagres");
  assert.ok(result.entry.id, "entry skal få id");
  assert.ok(result.entry.createdAt, "entry skal få createdAt");
  assert.equal(result.entry.source, "meta_insights_ai", "entry skal merkes med source meta_insights_ai");
  assert.equal(result.entry.response, "stemmer");
  assert.equal(result.entry.confidence, 0.7);

  const stored = JSON.parse(store.get("aha_meta_insights_memory_v1"));
  assert.equal(stored.feedback.length, 1, "feedback skal persisteres i localStorage");
  assert.equal(stored.feedback[0].claimText, "Du bygger et arbeid rundt kapitalisme.");
  assert.ok(stored.updatedAt, "updatedAt skal settes ved lagring");

  // Ugyldig response-verdi skal avvises.
  const invalid = Memory.addFeedback({ claimId: "claim_x", claimText: "Noe", response: "kanskje" });
  assert.equal(invalid.ok, false, "ugyldig response skal avvises");
  assert.equal(JSON.parse(store.get("aha_meta_insights_memory_v1")).feedback.length, 1, "ugyldig feedback skal ikke lagres");
}

// 10. summarizeMemory teller stemmer/delvis/feil/viktig/utdatert korrekt.
{
  Memory.addFeedback({ sessionId: "s1", claimId: "claim_2", claimText: "Du utvider begreper raskt.", response: "delvis", confidence: 0.5 });
  Memory.addFeedback({ sessionId: "s1", claimId: "claim_3", claimText: "Du er mest opptatt av idrett.", response: "feil", confidence: 0.3 });
  Memory.addFeedback({ sessionId: "s1", claimId: "claim_4", claimText: "Klimaspørsmålet er viktig for deg.", response: "viktig", confidence: 0.8 });
  Memory.addFeedback({ sessionId: "s1", claimId: "claim_5", claimText: "Du jobber med en skoleoppgave.", response: "utdatert", confidence: 0.4 });

  const summary = Memory.summarizeMemory();
  assert.equal(summary.totalFeedback, 5);
  assert.equal(summary.confirmed, 1);
  assert.equal(summary.partial, 1);
  assert.equal(summary.rejected, 1);
  assert.equal(summary.important, 1);
  assert.equal(summary.outdated, 1);
  assert.equal(summary.confirmedClaims[0].claimText, "Du bygger et arbeid rundt kapitalisme.");
  assert.equal(summary.partialClaims[0].claimText, "Du utvider begreper raskt.");
  assert.equal(summary.rejectedClaims[0].claimText, "Du er mest opptatt av idrett.");
  assert.equal(summary.importantClaims[0].claimText, "Klimaspørsmålet er viktig for deg.");
  assert.equal(summary.outdatedClaims[0].claimText, "Du jobber med en skoleoppgave.");
  assert.ok(summary.activeSelfModel && Array.isArray(summary.activeSelfModel.confirmedClaims), "activeSelfModel skal følge med");
}

// 11. updateSelfModelFromFeedback bygger selfModel med riktige claim-lister,
//     nyeste først og dedup på normalisert claimText.
{
  const memory = {
    version: "v1",
    feedback: [
      { id: "f1", createdAt: "2026-06-01T00:00:00.000Z", claimId: "c1", claimText: "Du bygger et arbeid rundt kapitalisme.", response: "stemmer", confidence: 0.6 },
      { id: "f2", createdAt: "2026-06-03T00:00:00.000Z", claimId: "c1b", claimText: "du bygger   et arbeid rundt KAPITALISME.", response: "stemmer", confidence: 0.9 },
      { id: "f3", createdAt: "2026-06-02T00:00:00.000Z", claimId: "c2", claimText: "Du utvider begreper raskt.", response: "delvis", confidence: 0.5 },
      { id: "f4", createdAt: "2026-06-02T00:00:00.000Z", claimId: "c3", claimText: "Du er mest opptatt av idrett.", response: "feil", confidence: 0.2 },
      { id: "f5", createdAt: "2026-06-02T00:00:00.000Z", claimId: "c4", claimText: "Klima er viktig for deg.", response: "viktig", confidence: 0.8 },
      { id: "f6", createdAt: "2026-06-02T00:00:00.000Z", claimId: "c5", claimText: "Du jobber med skoleoppgave.", response: "utdatert", confidence: 0.4 }
    ],
    selfModel: { activeProjects: ["vekstkritikk-prosjekt"] }
  };
  const selfModel = Memory.updateSelfModelFromFeedback(memory);
  assert.equal(selfModel.confirmedClaims.length, 1, "samme claimText skal dedupes (normalisert)");
  assert.equal(selfModel.confirmedClaims[0].claimId, "c1b", "nyeste feedback skal vinne ved dedup");
  assert.equal(selfModel.confirmedClaims[0].confidence, 0.9);
  assert.equal(selfModel.partialClaims[0].claimId, "c2");
  assert.equal(selfModel.rejectedClaims[0].claimId, "c3");
  assert.equal(selfModel.importantClaims[0].claimId, "c4");
  assert.equal(selfModel.outdatedClaims[0].claimId, "c5");
  assert.deepEqual(selfModel.activeProjects, ["vekstkritikk-prosjekt"], "kuraterte aktive prosjekter skal bevares");
  assert.ok(Array.isArray(selfModel.activePatterns) && Array.isArray(selfModel.activeTensions), "aktive mønstre/spenninger skal være lister");
}

// 12. buildMemoryPack returnerer kompakt aktiv selvmodell.
{
  const pack = Memory.buildMemoryPack();
  assert.deepEqual(pack.confirmed_claims, ["Du bygger et arbeid rundt kapitalisme."]);
  assert.deepEqual(pack.partial_claims, ["Du utvider begreper raskt."]);
  assert.deepEqual(pack.rejected_claims, ["Du er mest opptatt av idrett."]);
  assert.deepEqual(pack.important_claims, ["Klimaspørsmålet er viktig for deg."]);
  assert.deepEqual(pack.outdated_claims, ["Du jobber med en skoleoppgave."]);
  assert.equal(pack.active_self_model.confirmed_count, 1);
  assert.equal(pack.active_self_model.important_count, 1);
  assert.ok(Array.isArray(pack.active_self_model.active_projects), "active_projects skal være liste");
}

console.log("aha-meta-insights-memory passed");
