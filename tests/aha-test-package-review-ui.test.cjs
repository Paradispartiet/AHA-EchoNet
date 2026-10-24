const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { webcrypto, createHash } = require("node:crypto");
const api = require("../js/ahaTestPackageReview.js");

const root = path.join(__dirname, "..");
const source = "The cohort showed an association between green space and improved wellbeing. The authors warn that the observational design cannot establish causality.";
const sha = createHash("sha256").update(source).digest("hex");
const sample = (run, candidates, overrides = {}) => ({
  schema: "aha_analysis_test_package_v1",
  identity: { analysis_id: "analysis-"+run, analysis_run_id: run, source_id: "source-1", source_sha256: sha },
  source: { text: source, sha256: sha },
  analysis: {
    authoritative_bundle_v2: {
      identity: { analysis_id: "analysis-"+run, analysis_run_id: run, source_id: "source-1", source_sha256: sha }
    }
  },
  candidate_audit: { candidates, prefilter_rejections: [{ title: "Duplicate", reason: "semantic_duplicate" }] },
  coverage: { missing: ["historical_model_attempts_not_archived"], historical_model_attempts_complete: false },
  ...overrides
});
const first = sample("run-a", [
  { title: "<script>safe</script>", summary: "Green space is associated with wellbeing.", evidence_quotes: [
    "The cohort showed an association", "This text does not exist in the source" ],
    uncertainty_text: "Observational", next_test: "Compare matched cohorts" },
  { title: "No quote", summary: "Hypothesis for the next study", evidence: [] }
]);
const second = sample("run-b", [
  { title: "More careful", summary: "Association, not demonstrated causality.", evidence: [
    { quote: "The authors warn that the observational design cannot establish causality.", role: "limits" }
  ]}
]);
(async () => {
  const options = { subtle: webcrypto.subtle };
  assert.strictEqual(await api.validatePackage(first, options), first);
  assert.equal(await api.sha256(source, options.subtle), sha);
  await assert.rejects(api.validatePackage({ ...first, schema: "other" }, options), /ikke en AHA-testpakke/);
  await assert.rejects(api.validatePackage(sample("run-a", [], {source: {text:source+" changed",sha256:sha}}), options), /kontrollsummen/);
  await assert.rejects(api.validatePackage(sample("run-a", [], {identity: {source_sha256:sha}}), options), /run-ID/);
  await assert.rejects(api.validatePackage(sample("run-a", [], {analysis: {authoritative_bundle_v2:{
    identity: {analysis_run_id:"stale-run",source_sha256:sha,analysis_id:"analysis-run-a",source_id:"source-1"}
  }}}), options), /ulike analysekjøringer/);

  const c = api.quoteAudit(first);
  assert.equal(c.length,2);
  assert.equal(c[0].found,1);
  assert.equal(c[0].missing,1);
  assert.equal(c[0].quotes[0].offset,0);
  assert.equal(c[1].total,0);
  assert.equal(api.summarize(first).candidates_without_quotes,1);
  assert.equal(api.summarize(first).prefilter_rejections,1);
  const result = api.comparePackages(first,second);
  assert.equal(result.changes.candidates,-1);
  assert.equal(result.changes.quotes_missing,-1);
  assert.equal(result.changes.quotes_found,0);
  assert.equal(result.note.includes("ikke"),true);
  assert.throws(()=>api.comparePackages(first,first),/samme analysekjøring/);
  assert.throws(()=>api.comparePackages(first,sample("other",[],{identity:{
    analysis_run_id:"other",source_sha256:"c".repeat(64)
  }})),/Ulike kilder/);

  const review = api.buildReviewDocument(first,[
    {source_accuracy:"delvis",novel_understanding:"god",causal_discipline:"unknown"}
  ],["Needs full paper check"]);
  assert.equal(review.schema,"aha_test_package_human_review_v1");
  assert.equal(review.approval_status,"not_approved");
  assert.equal(review.automatic_training,false);
  assert.equal(review.candidates[0].ratings.source_accuracy,"delvis");
  assert.equal(review.candidates[0].ratings.novel_understanding,"god");
  assert.equal(review.candidates[0].ratings.causal_discipline,"ikke_vurdert");
  assert.equal(review.candidates[0].notes,"Needs full paper check");
  assert.equal(review.candidates[0].scientifically_approved,false);
  assert.equal(review.candidates[0].evidence_literal_status,"missing_quotes");
  assert.equal(review.candidates[1].evidence_literal_status,"no_quotes");
  assert.ok(!Object.prototype.hasOwnProperty.call(review,"source_text"),"Review output should not duplicate full original text");

  const html = fs.readFileSync(path.join(root,"testpakke.html"),"utf8");
  const ui = fs.readFileSync(path.join(root,"js/ahaChatUiRuntime.js"),"utf8");
  const implementation = fs.readFileSync(path.join(root,"js/ahaTestPackageReview.js"),"utf8");
  assert.match(html,/id="testpakke-input-a"/);
  assert.match(html,/id="testpakke-input-b"/);
  assert.match(html,/id="testpakke-download-review"/);
  assert.match(html,/src="js\/ahaTestPackageReview.js"/);
  assert.match(ui,/reviewLink.href = "testpakke.html"/);
  assert.ok(!implementation.includes("innerHTML"),"Review page must not interpret article text as HTML");
  assert.ok(!implementation.includes("fetch("),"Review page must never send imported files to backend");
  assert.ok(!implementation.includes("localStorage"),"Review data must stay in memory until user downloads");
  console.log("AHA private browser test-package review: digest, run isolation, safe UI, comparison and human rubric passed.");
})().catch(e=>{ console.error(e);process.exitCode=1; });
