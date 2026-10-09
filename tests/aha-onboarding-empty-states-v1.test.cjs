const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function load(file, globals = {}) {
  const context = { console, Date, Math, JSON, Number, String, Array, Object, Set, Map, ...globals };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  return context;
}

const home = load("js/ahaHomeContinueExperience.js");
const start = home.AHAHomeContinueExperience.buildExperience({ home: { counts: {} } });
assert.equal(start.mode, "start_chat");
assert.equal(start.primaryAction.href, "chat.html");
assert.equal(start.onboardingAction.href, "demo.html");
assert.match(start.description, /Du trenger ikke fylle ut en profil/);
const returning = home.AHAHomeContinueExperience.buildExperience({ home: { counts: { chatMessages: 2 } } });
assert.equal(returning.mode, "continue_chat");
assert.equal(returning.onboardingAction, undefined, "tour should only appear for first-time empty Home");

const libraryNodes = new Map();
for (const id of ["search-library-groups", "search-library-recent", "search-library-recent-title", "search-library-status", "search-results-panel"]) {
  libraryNodes.set(id, { innerHTML: "", textContent: "", hidden: false });
}
const libraryDocument = {
  readyState: "loading",
  getElementById(id) { return libraryNodes.get(id) || null; },
  querySelectorAll() { return []; },
  addEventListener() {}
};
const library = load("js/ahaSearchLibraryExperience.js", {
  document: libraryDocument,
  AHASearch: { collectSearchItems() { return []; } }
});
const emptyModel = library.AHASearchLibraryExperience.render();
assert.equal(emptyModel.total, 0);
assert.match(libraryNodes.get("search-library-groups").innerHTML, /Her samles det du velger å lagre/);
assert.match(libraryNodes.get("search-library-groups").innerHTML, /href="notes.html"/);
assert.match(libraryNodes.get("search-library-groups").innerHTML, /href="demo.html"/);
assert.doesNotMatch(libraryNodes.get("search-library-groups").innerHTML, /data-library-group="all"/);
assert.match(libraryNodes.get("search-library-status").textContent, /Ingen lokale søkbare objekter/);
library.AHASearch = { collectSearchItems() {
  return [{ id: "n1", title: "Notat", text: "En idé", source: "aha_notes", type: "note",
    local_only: true, read_only: true, updatedAt: "2026-10-09T08:00:00Z", href: "notes.html" }];
} };
const full = library.AHASearchLibraryExperience.render();
assert.equal(full.total, 1);
assert.doesNotMatch(libraryNodes.get("search-library-groups").innerHTML, /Her samles det du velger å lagre/);
assert.match(libraryNodes.get("search-library-recent").innerHTML, /En idé/);

const aiNodes = new Map();
for (const id of ["personal-ai-experience", "personal-ai-overall", "personal-ai-modules", "personal-ai-recommendations", "personal-ai-empty"]) {
  aiNodes.set(id, { innerHTML: "", hidden: false });
}
const aiDocument = { readyState: "loading", getElementById(id) { return aiNodes.get(id) || null; }, addEventListener() {} };
let aiStatus = {
  overall: { label: "Kontrollert", score: 25, level: "0_data_needed" }, summary: "", nextAction: {},
  modules: { metaInsightsMemory: { counts: { confirmedClaims: 0, importantClaims: 0 } },
    trainingCorpus: { counts: { approved: 0 } }, trainingExamples: { counts: { approved: 0 } } }
};
const ai = load("js/ahaPersonalAiDashboard.js", {
  document: aiDocument,
  AHAPersonalAiControl: { buildControlStatus() { return aiStatus; } }
});
ai.AHAPersonalAiDashboard.refresh();
assert.equal(aiNodes.get("personal-ai-empty").hidden, false, "a positive overall score must not hide missing approved personal data");
aiStatus = { ...aiStatus, overall: { ...aiStatus.overall, score: 0 },
  modules: { ...aiStatus.modules, trainingCorpus: { counts: { approved: 1 } } } };
ai.AHAPersonalAiDashboard.refresh();
assert.equal(aiNodes.get("personal-ai-empty").hidden, true, "approved personal material should hide the empty state independently of overall score");

const profileNodes = new Map([["aha-profile-overview", { innerHTML: "" }]]);
const profileDocument = { readyState: "complete", getElementById(id) { return profileNodes.get(id) || null; }, addEventListener() {} };
const profile = load("js/ahaProfileOverview.js", { document: profileDocument, AHAProfile: {} });
assert.match(profileNodes.get("aha-profile-overview").innerHTML, /Din oversikt fylles med det du velger å lagre/);
assert.match(profileNodes.get("aha-profile-overview").innerHTML, /href="demo.html"/);
const profileFull = profile.AHAProfileOverview.buildOverviewModel({ collectProfileStatus() { return { notesCount: 1 }; } });
profile.AHAProfileOverview.renderOverview(profileNodes.get("aha-profile-overview"), profileFull);
assert.doesNotMatch(profileNodes.get("aha-profile-overview").innerHTML, /Din oversikt fylles med det du velger å lagre/);

const personalHtml = fs.readFileSync("personal-ai.html", "utf8");
assert.match(personalHtml, /id="personal-ai-empty"[^>]+aria-labelledby="personal-ai-empty-title"/);
assert.match(personalHtml, /Personlig grunnlag tas først i bruk når du selv har bekreftet/);
assert.match(personalHtml, /href="demo.html">Se kom-i-gang-guiden/);

for (const file of ["js/ahaHomeContinueExperience.js", "js/ahaSearchLibraryExperience.js", "js/ahaPersonalAiDashboard.js", "js/ahaProfileOverview.js"]) {
  const code = fs.readFileSync(file, "utf8");
  assert.doesNotMatch(code, /\bfetch\s*\(|XMLHttpRequest|sendBeacon/, file + " must not introduce networking");
}
console.log("AHA onboarding empty states V1 passed.");
