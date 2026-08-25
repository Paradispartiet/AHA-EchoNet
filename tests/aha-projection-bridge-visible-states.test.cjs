const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

let writes = 0;
const storage = new Map();
const context = {
  console, Date, Math, JSON, Object, Array, Set, Map, URLSearchParams,
  location: { search: "" },
  localStorage: {
    getItem(key) { return storage.get(key) || null; },
    setItem() { writes += 1; throw new Error("projection preview must not write"); },
    removeItem() { writes += 1; throw new Error("projection preview must not delete"); }
  }
};
context.window = context;
context.globalThis = context;
vm.createContext(context);
for (const file of [
  "js/ahaInsightRelationClassifierV2.js",
  "js/ahaInsightSaturationV2.js",
  "js/ahaKnowledgeMigrationV2.js",
  "js/ahaSemanticProjectionsV2.js",
  "js/ahaV2ProductIntegrationGate.js",
  "js/ahaProjectionProductContractV2.js",
  "js/ahaProjectionArtifactQualityV2.js",
  "js/ahaProjectionProductReadModelV2.js",
  "js/ahaChatAnalysisRunContract.js",
  "js/ahaProjectionRuntimeSourceV2.js"
]) vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });

const sourceText = [
  "Livsarket samler erfaringer, kilder og ideer i ett system.",
  "Feltvis kildebelegg gjør analysen kontrollerbar for leseren.",
  "Tolkning må skilles tydelig fra dokumenterte påstander.",
  "Begreper blir nyttige når de beholder konteksten fra kilden.",
  "Relasjoner viser hvordan ulike påstander belyser samme tema.",
  "Usikkerhet må følge innsikten fram til neste undersøkelse."
].join(" ");
const sha = "a".repeat(64);
const run = {
  analysisId: "analysis_livsarket_products",
  analysisRunId: "run_livsarket_products",
  runId: "run_livsarket_products",
  sourceId: "source_livsarket_products",
  sourceSha256: sha,
  source_sha256: sha,
  sourceTextHash: sha,
  topicLabel: "Livsarket",
  createdAt: "2026-08-22T06:30:00.000Z"
};
function span(quote) {
  const start = sourceText.indexOf(quote);
  assert.ok(start >= 0);
  return { anchor_id: `anchor_${start}`, text: quote, start_offset: start, end_offset: start + quote.length };
}
const quotes = sourceText.split(". ").map((item, index, all) => index < all.length - 1 ? `${item}.` : item);
const concepts = ["Livsarket", "kildebelegg", "dokumenterte påstander"].map((label, index) => ({
  id: `concept_${index + 1}`,
  label,
  mentions: [span(label)]
}));
const candidates = [
  {
    id: "insight_control",
    insight: "Feltvis kildebelegg og tydelig tolkningsgrense gjør analyser kontrollerbare.",
    evidenceQuotes: [quotes[1], quotes[2]]
  },
  {
    id: "insight_context",
    insight: "Kontekstbevarte begreper og kildebelegg gjør kildeforankrede relasjoner mer nyttige.",
    evidenceQuotes: [quotes[3], quotes[4]]
  },
  {
    id: "insight_uncertainty",
    insight: "Usikkerhet og kildebelegg må være en del av innsikten og styre neste undersøkelse.",
    evidenceQuotes: [quotes[2], quotes[5]]
  }
].map((item) => ({
  id: item.id,
  insight: item.insight,
  type: "generalization",
  abstraction: "Sammenstiller flere kildeutsagn uten å gjøre dem kausale.",
  why_it_matters: "Gjør analyseprodukter etterprøvbare.",
  confidence: "high",
  uncertainty: "Gjelder innenfor denne kildens dokumenterte ramme.",
  causal_status: "not_causal",
  evidence: item.evidenceQuotes.map((quote) => ({ quote, role: "supports", spans: [span(quote)] })),
  status: "approved",
  eligible_for_current_analysis: true,
  blocking_reasons: [],
  quality_metrics: { quality_score: 0.9 },
  quality_gate_schema: "aha_insight_quality_gate_v2",
  origin: "current_chat_analysis_candidate"
}));
const semanticDocument = {
  schema: "aha_semantic_document_v2",
  id: "semantic_livsarket_products",
  analysis_id: run.analysisId,
  analysis_run_id: run.analysisRunId,
  source_id: run.sourceId,
  source_sha256: sha,
  concepts,
  claims: [], relations: [], tensions: [], candidate_insights: candidates,
  status: "ready",
  quality: { status: "passed" },
  synthesis_gate: {
    schema: "aha_live_semantic_synthesis_gate_v2",
    quality_gate_schema: "aha_insight_quality_gate_v2",
    authoritative: true,
    status: "passed",
    candidate_count: 3,
    approved_count: 3,
    blocked_count: 0
  },
  validation: { valid: true, errors: [] }
};
const payload = {
  ...run,
  source_binding: { valid: true },
  canonicalAnalysis: {
    theme: quotes[0],
    mainTension: quotes[2],
    keyInsight: candidates[0].insight
  },
  ahaSer: { tema: quotes[0], hovedspenning: quotes[2], viktigsteInnsikt: candidates[0].insight }
};
const bundle = context.AHAAnalysisBundleV2.build({ activeRun: run, payload, sourceText, semanticDocument, primarySourceKind: "pasted_text" });
assert.equal(bundle.validation.valid, true);
assert.equal(bundle.semantic_document.approved_insight_records.length, 3);
assert.ok(bundle.semantic_document.approved_insight_records.every((item) => item.quality_score === 0.9));

storage.set("aha_chat_auto_outputs_v1", JSON.stringify({
  analysisId: run.analysisId,
  analysisRunId: run.analysisRunId,
  sourceId: run.sourceId,
  sourceSha256: sha,
  payload: { ...payload, analysisBundleV2: bundle }
}));

const model = context.AHAProjectionRuntimeSourceV2.build();
assert.equal(model.status, "ready");
assert.equal(model.validation.valid, true);
assert.equal(model.source_mode, "active_analysis_bundle_v2");
assert.ok(model.projection_id.startsWith("projection_v2_"));
assert.deepEqual(JSON.parse(JSON.stringify(model.identity)), JSON.parse(JSON.stringify(bundle.identity)));
for (const product of ["list", "path", "mindmap"]) {
  assert.equal(model.product_states[product].status, "ready", `${product} should have a qualified preview in the rich-source fixture`);
  assert.equal(model.product_states[product].label, "Klar til forhåndsvisning");
  assert.match(model.product_states[product].href, new RegExp(`analysis_id=${run.analysisId}`));
  assert.match(model.product_states[product].href, new RegExp(`projection_id=${model.projection_id}`));
  assert.match(model.product_states[product].href, new RegExp(`source_sha256=${sha}`));
}
assert.ok(model.surfaces.lists.length > 0);
assert.ok(model.surfaces.paths.length > 0);
assert.ok(model.surfaces.mindmap.nodes.length > 0);
assert.equal(model.policy.product_store_write, false);
assert.equal(model.policy.remote_write, false);
assert.equal(model.policy.chamber_write, false);
assert.equal(writes, 0);

context.location.search = `?product=mindmap&analysis_id=${run.analysisId}&projection_id=${model.projection_id}&source_sha256=${sha}`;
assert.equal(context.AHAProjectionRuntimeSourceV2.shouldOpenProduct("mindmap"), true);
assert.equal(context.AHAProjectionRuntimeSourceV2.build().projection_id, model.projection_id);

const weakSemantic = JSON.parse(JSON.stringify(semanticDocument));
weakSemantic.id = "semantic_weak";
weakSemantic.candidate_insights = weakSemantic.candidate_insights.map((item) => ({ ...item, status: "blocked", eligible_for_current_analysis: false }));
weakSemantic.synthesis_gate = { ...weakSemantic.synthesis_gate, status: "blocked", approved_count: 0, blocked_count: 3 };
const weakBundle = context.AHAAnalysisBundleV2.build({ activeRun: run, payload, sourceText, semanticDocument: weakSemantic, primarySourceKind: "pasted_text" });
assert.equal(weakBundle.validation.valid, true);
context.location.search = "";
const weakModel = context.AHAProjectionRuntimeSourceV2.build({ analysisBundleV2: weakBundle, ignoreRequest: true });
assert.equal(weakModel.status, "blocked");
for (const product of ["list", "path", "mindmap"]) {
  assert.equal(weakModel.product_states[product].status, "needs_evidence");
  assert.equal(weakModel.product_states[product].label, "Trenger mer belegg");
  assert.match(weakModel.product_states[product].reason, /Ingen innsikt bestod den kildebundne kvalitetskontrollen ennå/);
  assert.doesNotMatch(weakModel.product_states[product].reason, /active_analysis_has_no_projection_ready_insights/);
}
assert.equal(writes, 0);

const irrelevantSemantic = JSON.parse(JSON.stringify(semanticDocument));
irrelevantSemantic.id = "semantic_irrelevant";
irrelevantSemantic.candidate_insights = [];
irrelevantSemantic.synthesis_gate = { ...irrelevantSemantic.synthesis_gate, status: "passed", candidate_count: 0, approved_count: 0, blocked_count: 0 };
const irrelevantBundle = context.AHAAnalysisBundleV2.build({ activeRun: run, payload, sourceText, semanticDocument: irrelevantSemantic, primarySourceKind: "pasted_text" });
assert.equal(irrelevantBundle.validation.valid, true);
const irrelevantModel = context.AHAProjectionRuntimeSourceV2.build({ analysisBundleV2: irrelevantBundle, ignoreRequest: true });
for (const product of ["list", "path", "mindmap"]) {
  assert.equal(irrelevantModel.product_states[product].status, "not_relevant");
  assert.equal(irrelevantModel.product_states[product].label, "Ikke relevant for denne teksten");
}

for (const file of ["lists.html", "paths.html", "mindmap.html"]) {
  const html = fs.readFileSync(file, "utf8");
  assert.match(html, /ahaChatAnalysisRunContract\.js/);
  assert.match(html, /ahaProjectionRuntimeSourceV2\.js/);
}
const explorer = fs.readFileSync("js/ahaExplorer.js", "utf8");
assert.match(explorer, /Produkter fra denne analysen/);
assert.match(explorer, /Listeforslag/);
assert.match(explorer, /Stiforslag/);
assert.match(explorer, /Tankekartforslag/);
assert.doesNotMatch(explorer, /AHAProjectionMaterializerV2|\.materialize\s*\(/);
const listsSource = fs.readFileSync("js/ahaLists.js", "utf8");
assert.match(listsSource, /shell\.hidden = false;[\s\S]*product_states\?\.list/);
assert.match(listsSource, /membership_reason[\s\S]*Medlemsgrunn:/, "List preview must expose the semantic membership reason to the user");
assert.match(fs.readFileSync("js/ahaPaths.js", "utf8"), /shell\.hidden = false;[\s\S]*product_states\?\.path/);
assert.match(fs.readFileSync("js/ahaMindmap.js", "utf8"), /shouldOpenProduct\?\.\("mindmap"\)/);
assert.equal(writes, 0);

console.log("aha-projection-bridge-visible-states.test.cjs: OK");
