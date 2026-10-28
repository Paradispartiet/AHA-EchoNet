const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const c = {
  console, Date, Math, Intl, JSON,
  localStorage: { getItem() { return null; } },
  document: { readyState: "loading", addEventListener() {} },
  location: { hash: "" },
  addEventListener() {},
  fetch() { throw Error("Reading local insights and paths must not fetch"); }
};
c.window = c;
vm.createContext(c);
for (const file of ["js/ahaPaths.js", "js/ahaInsights.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), c, { filename: file });
}
const insights = c.AHAInsights;
const paths = c.AHAPaths;
const source = { id: "s1", text: "I teksten står det at lokalt grønne områder er viktige." };

const proposed = insights.buildInsightJourneyModel({
  summary: "Grøntområder kan endre vanene våre.",
  uncertainty: "hypothesis",
  uncertaintyDetail: "Ingen sammenligningsgruppe.",
  whyItMatters: "Kan gi et spørsmål å undersøke.",
  nextTest: "Sammenlign to nabolag.",
  claimKind: "hypothesis"
}, source);
assert.equal(proposed.claimLabel, "Dette foreslår Aha");
assert.match(proposed.uncertainty, /hypotese/);
assert.match(proposed.uncertainty, /Ingen sammenligningsgruppe/);
assert.equal(proposed.next, "Sammenlign to nabolag.");
assert.equal(proposed.hasRecordedNextTest, true);

const noSource = insights.buildInsightJourneyModel({ summary: "Ubekreftet utsagn" }, null);
assert.match(noSource.source, /Ingen lokal kilde/);
assert.match(noSource.uncertainty, /ikke nok lokalt kildegrunnlag/);
assert.equal(noSource.hasRecordedNextTest, false);
assert.match(noSource.next, /Se etter en relevant kilde/);
assert.equal(noSource.claimLabel, "Dette foreslår Aha");

const unsupported = insights.buildInsightJourneyModel({
  summary: "Dette står ikke i kilden.",
  claimKind: "source_observation",
  uncertainty: "supported",
  qualityStatus: "blocked"
}, source);
assert.equal(unsupported.claimLabel, "Dette foreslår Aha", "a source claim must not be elevated on metadata alone");
assert.match(unsupported.uncertainty, /ikke kvalitetssikret/);

const quoted = insights.buildInsightJourneyModel({
  summary: "Dette står faktisk i kilden.",
  claimKind: "source_observation",
  uncertainty: "supported"
}, { text: "Dette står faktisk i kilden." });
assert.equal(quoted.claimLabel, "Dette står i kilden");
assert.match(quoted.uncertainty, /videre slutninger/);

const escaped = insights.renderInsightJourneyMarkup({
  summary: "<script>alert('bad')</script>",
  nextTest: "<img src=x onerror=alert(1)>",
  whyItMatters: "<b>farlig</b>"
}, { text: "<source>" });
assert.doesNotMatch(escaped, /<script>|<img|<source>|<b>farlig/);
assert.match(escaped, /&lt;script&gt;/);
for (const title of ["Dette bygger på", "Dette foreslår Aha", "Dette er fortsatt usikkert", "Et mulig neste steg"]) {
  assert.ok(escaped.includes(title), "missing visible section: " + title);
}
assert.match(escaped, /Generelt undersøkelsesforslag/);

const steps = [
  { id: "a", title: "Ferdig", status: "done", order: 0 },
  { id: "b", title: "Planlagt", status: "planned", order: 1 },
  { id: "c", title: "Pågår", status: "active", order: 2 }
];
assert.equal(paths.nextPathStep({ steps }).id, "c");
assert.equal(paths.nextPathStep({ steps: steps.filter(s => s.id !== "c") }).id, "b");
assert.equal(paths.nextPathStep({ steps: steps.filter(s => s.status === "done") }), null);
assert.equal(paths.nextPathStep({ steps: [] }), null);
assert.equal(paths.pathProgress({ steps }).done, 1, "existing progress contract must remain unchanged");

const insightsPage = fs.readFileSync(path.join(root, "insights.html"), "utf8");
const pathsPage = fs.readFileSync(path.join(root, "paths.html"), "utf8");
const insightsSource = fs.readFileSync(path.join(root, "js/ahaInsights.js"), "utf8");
const pathsSource = fs.readFileSync(path.join(root, "js/ahaPaths.js"), "utf8");
assert.match(insightsPage, /Forslagene er ikke bekreftede fakta/);
assert.match(insightsPage, /Mulige sammenslåinger/);
assert.match(insightsSource, /<summary>Tekniske opplysninger<\/summary>/);
assert.match(insightsSource, /Undersøk videre/);
assert.match(insightsSource, /Kildebelegg og vurdering/, "provenance detail must remain available");
assert.match(pathsSource, /\$\{nextStepMarkup\}/);
assert.match(pathsSource, /Lagret lokalt/);
assert.match(pathsPage, /Se hva som kommer nå/);
console.log("Aha human insight journey: source/proposal/uncertainty/next step, safe text, next path and existing progress passed.");
