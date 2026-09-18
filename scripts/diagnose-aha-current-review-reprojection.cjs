const fs = require("node:fs");
const vm = require("node:vm");

const archivePath = process.argv[2];
if (!archivePath) throw new Error("usage: node scripts/diagnose-aha-current-review-reprojection.cjs <archive-json>");

const document = {
  getElementById: () => null,
  querySelector: () => null
};
const context = {
  window: null,
  globalThis: null,
  document,
  console,
  Date,
  JSON,
  Object,
  Array,
  Set,
  Map,
  String,
  Number,
  Boolean,
  Math,
  Promise,
  URL,
  Blob,
  setTimeout,
  clearTimeout
};
context.window = context;
context.globalThis = context;
vm.createContext(context);

for (const file of [
  "js/ahaInsightRelationClassifierV2.js",
  "js/ahaInsightSaturationV2.js",
  "js/ahaSemanticProjectionsV2.js",
  "js/ahaProjectionArtifactQualityV2.js",
  "ops/evaluation/ahaProjectionProductBrowserReviewV2.js"
]) {
  vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
}

const api = context.AHAProjectionProductReviewV2;
if (!api?.reprojectArchivedResult || !api?.currentReviewCoverage || !api?.requiresProductScore) {
  throw new Error("current review reprojection API unavailable");
}

const archive = JSON.parse(fs.readFileSync(archivePath, "utf8"));
const corpus = JSON.parse(fs.readFileSync("tests/fixtures/aha-projection-product-evaluation-v2.json", "utf8"));
const results = archive.results.map((entry) => api.reprojectArchivedResult(entry));
const coverage = api.currentReviewCoverage(results, corpus);

const coverageCases = new Set(corpus.cases
  .filter((entry) => entry.expected_visible === true && entry.live_disposition !== "calibration_observation")
  .map((entry) => entry.id));

const perCase = results
  .filter((entry) => coverageCases.has(entry.case_id))
  .map((entry) => {
    const source = corpus.cases.find((candidate) => candidate.id === entry.case_id);
    return {
      case_id: entry.case_id,
      reprojection_mode: entry.review_reprojection?.mode || null,
      lists: api.requiresProductScore(entry, source, "lists"),
      paths: api.requiresProductScore(entry, source, "paths"),
      mindmap: api.requiresProductScore(entry, source, "mindmap")
    };
  });

const proof = {
  schema: "aha_current_review_reprojection_diagnostic_v1",
  source_workflow_run_id: 32633381518,
  source_artifact_id: 9491725428,
  source_generated_at: archive.generated_at,
  corpus_cases: archive.results.length,
  archived_status_counts: archive.results.reduce((acc, entry) => {
    const status = entry?.model?.status || "unknown";
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {}),
  current_coverage: coverage,
  coverage_cases: perCase
};

console.log("AHA_CURRENT_REPROJECTION_PROOF_BEGIN");
console.log(JSON.stringify(proof, null, 2));
console.log("AHA_CURRENT_REPROJECTION_PROOF_END");
