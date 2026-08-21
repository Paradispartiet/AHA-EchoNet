const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

let storageCalls = 0;
const context = {
  console,
  localStorage: new Proxy({}, { get() { storageCalls += 1; throw new Error("evaluation pipeline must remain store-free"); } })
};
context.window = context;
context.globalThis = context;
vm.createContext(context);

for (const file of [
  "js/ahaChatIngestRuntime.js",
  "js/ahaInsightRelationClassifierV2.js",
  "js/ahaInsightSaturationV2.js",
  "js/ahaKnowledgeMigrationV2.js",
  "js/ahaSemanticProjectionsV2.js",
  "js/ahaV2ProductIntegrationGate.js",
  "js/ahaProjectionProductContractV2.js",
  "js/ahaProjectionArtifactQualityV2.js",
  "js/ahaProjectionProductReadModelV2.js"
]) vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });

const corpus = JSON.parse(fs.readFileSync("tests/fixtures/aha-projection-product-evaluation-v2.json", "utf8"));
assert.equal(corpus.cases.length, 24);
assert.equal(new Set(corpus.cases.map((entry) => entry.genre)).size, 8);

const STOPWORDS = new Set("og i på av til er et en det som med for den de å om men at fra har blir ble kan skal eller ikke når etter før ved også dette seg sine sin sitt være var mens mot mellom bare".split(" "));

function tokens(value) {
  return String(value || "").toLocaleLowerCase("no").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").match(/[a-zæøå0-9-]{4,}/gu)?.filter((token) => !STOPWORDS.has(token)) || [];
}

function sentenceSlices(sourceText) {
  const slices = [];
  const pattern = /[^.!?]+[.!?]+|[^.!?]+$/gu;
  let match;
  while ((match = pattern.exec(sourceText))) {
    const value = match[0].trim();
    if (value.length >= 35) slices.push({ text: value, start: match.index, end: match.index + match[0].length });
  }
  return slices.slice(0, 5);
}

function makeInsightsFromRawText(entry) {
  const semantic = context.AHASemanticDocument.buildShadowSemanticDocument({
    source_event_id: `${entry.id}_source`,
    source_text: entry.source_text,
    source_type: entry.genre,
    language: "no",
    generated_at: "2026-08-21T00:00:00.000Z"
  });
  assert.equal(context.AHASemanticDocument.validateSemanticDocument(semantic, entry.source_text).ok, true);
  const sentences = sentenceSlices(entry.source_text);
  const counts = new Map();
  tokens(entry.source_text).forEach((token) => counts.set(token, (counts.get(token) || 0) + 1));
  const commonConcept = [...counts].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] || "kilde";
  const eligible = entry.expected_visible === true && entry.source_text.length >= 80 && sentences.length >= 2;
  return sentences.slice(0, 3).map((sentence, index) => {
    const uniqueConcept = tokens(sentence.text).find((token) => token !== commonConcept) || `perspektiv_${index + 1}`;
    const supporting = sentences[(index + 1) % sentences.length]?.text || sentence.text;
    return {
      id: `${entry.id}_insight_${index + 1}`,
      source_event_id: `${entry.id}_source_${index + 1}`,
      source_text_hash: semantic.source_text_hash,
      semantic_concepts: [commonConcept, uniqueConcept],
      candidate: {
        insight: sentence.text,
        type: "source_claim",
        causal_status: "not_causal",
        evidence: [
          { quote: sentence.text, role: "supports", start_offset: sentence.start, end_offset: sentence.end },
          { quote: supporting, role: "context" }
        ]
      },
      gate_decision: {
        eligible_for_insight_review: eligible,
        blocking_reasons: eligible ? [] : ["raw_text_insufficient_for_product_evaluation"],
        metrics: { quality_score: eligible ? 0.86 - index * 0.01 : 0.42 }
      }
    };
  });
}

function refSet(items) {
  return [...new Set(items.map((item) => item.refId).filter(Boolean))].sort().join("|");
}

function narrativeHasSourceSignal(narrative, source) {
  const haystack = tokens(narrative);
  const sourceTokens = tokens(source);
  return sourceTokens.some((token) => haystack.includes(token));
}

const results = [];
const pathNarrativeSignatures = new Set();
let refinedWeakListAnchors = 0;
let sourceBoundPathSteps = 0;
let visiblePathSteps = 0;
let duplicateListRefSets = 0;
let duplicatePathRefSets = 0;

for (const entry of corpus.cases) {
  const rawInsights = makeInsightsFromRawText(entry);
  const semanticHash = context.AHASemanticDocument.sha256Hex(entry.source_text);
  assert.ok(rawInsights.every((insight) => insight.source_text_hash === semanticHash), `${entry.id} source identity drift`);
  rawInsights.forEach((insight) => insight.candidate.evidence.forEach((evidence) => {
    assert.ok(entry.source_text.includes(evidence.quote), `${entry.id} evidence escaped raw source`);
  }));
  const input = { legacy_insights: rawInsights, legacy_lists: [], legacy_paths: [], legacy_mindmaps: [] };
  const model = context.AHAProjectionProductReadModelV2.build(input);
  const replay = context.AHAProjectionProductReadModelV2.build({ ...input, legacy_insights: rawInsights.slice().reverse() });
  assert.equal(replay.projection_id, model.projection_id, `${entry.id} projection id is not deterministic`);
  assert.deepEqual(replay.surfaces, model.surfaces, `${entry.id} product surfaces are not deterministic`);
  const visible = model.status === "ready"
    && model.validation?.valid === true
    && model.surfaces.lists.length > 0
    && model.surfaces.paths.length > 0
    && model.surfaces.mindmap.nodes.length > 0;
  assert.equal(visible, entry.expected_visible, `${entry.id} visibility mismatch: ${JSON.stringify(model.artifact_quality || model.blocking_reasons)}`);
  if (visible) {
    assert.ok(model.surfaces.lists.every((item) => item.quality?.passed === true), `${entry.id} leaked weak list`);
    assert.ok(model.surfaces.paths.every((item) => item.quality?.passed === true), `${entry.id} leaked weak path`);
    assert.equal(model.surfaces.mindmap.quality?.passed, true, `${entry.id} leaked weak mindmap`);

    const listRefSets = model.surfaces.lists.map((list) => refSet(list.items));
    const pathRefSets = model.surfaces.paths.map((path) => refSet(path.steps));
    duplicateListRefSets += listRefSets.length - new Set(listRefSets).size;
    duplicatePathRefSets += pathRefSets.length - new Set(pathRefSets).size;
    assert.equal(new Set(listRefSets).size, listRefSets.length, `${entry.id} duplicate list ref set survived refinement`);
    assert.equal(new Set(pathRefSets).size, pathRefSets.length, `${entry.id} duplicate path ref set survived refinement`);

    for (const list of model.surfaces.lists) {
      assert.ok(list.title.length <= context.AHAProjectionArtifactQualityV2.MAX_PRODUCT_TITLE, `${entry.id} list title too long`);
      assert.equal(list.meta.display_refinement, "source_bound_usefulness_v2", `${entry.id} list missing usefulness refinement`);
      if (context.AHAProjectionArtifactQualityV2.isLowInformationLabel(list.meta.semantic_basis_label)) {
        refinedWeakListAnchors += 1;
        assert.equal(list.meta.display_theme_source, "source_bound_insight_text", `${entry.id} weak list anchor not source-refined`);
        assert.notEqual(list.title, list.meta.original_title, `${entry.id} weak list kept raw token title`);
      }
    }

    const insightById = new Map(model.surfaces.insights.map((insight) => [insight.id, insight]));
    for (const path of model.surfaces.paths) {
      assert.ok(path.title.length <= context.AHAProjectionArtifactQualityV2.MAX_PRODUCT_TITLE, `${entry.id} path title too long`);
      assert.equal(path.meta.display_refinement, "source_bound_usefulness_v2", `${entry.id} path missing usefulness refinement`);
      assert.equal(path.steps.map((step) => step.meta.stage).join("|"), "orientation|claim_evidence|tension_counterexample|uncertainty|synthesis_next_inquiry");
      pathNarrativeSignatures.add(path.steps.map((step) => step.narrative).join("||"));
      for (const step of path.steps) {
        visiblePathSteps += 1;
        assert.equal(step.meta.source_bound_narrative, true, `${entry.id} ${step.meta.stage} not marked source-bound`);
        const sourceInsight = insightById.get(step.refId);
        assert.ok(sourceInsight, `${entry.id} missing path source insight ${step.refId}`);
        assert.ok(narrativeHasSourceSignal(step.narrative, sourceInsight.insight || sourceInsight.summary || sourceInsight.title), `${entry.id} ${step.meta.stage} narrative not tied to referenced insight`);
        sourceBoundPathSteps += 1;
      }
    }

    const roots = model.surfaces.mindmap.nodes.filter((node) => node.type === "theme" && node.meta?.root === true);
    assert.equal(roots.length, 1, `${entry.id} mindmap root count`);
    assert.ok((roots[0].title || "").length >= 4, `${entry.id} mindmap root title missing`);
    assert.ok((roots[0].title || "").length <= context.AHAProjectionArtifactQualityV2.MAX_PRODUCT_TITLE, `${entry.id} mindmap root title too long`);
    const branchIds = new Set(model.surfaces.mindmap.edges.filter((edge) => edge.type === "theme_branch").map((edge) => edge.to));
    const branchNodes = model.surfaces.mindmap.nodes.filter((node) => branchIds.has(node.id));
    assert.ok(branchNodes.every((node) => (node.title || "").length >= 4), `${entry.id} weak empty mindmap branch display`);
    assert.ok(branchNodes.every((node) => (node.title || "").length <= context.AHAProjectionArtifactQualityV2.MAX_PRODUCT_TITLE), `${entry.id} mindmap branch title too long`);
  }
  results.push({ id: entry.id, genre: entry.genre, visible });
}

assert.equal(results.filter((entry) => entry.visible).length, 21);
assert.equal(results.filter((entry) => !entry.visible).length, 3);
assert.equal(duplicateListRefSets, 0);
assert.equal(duplicatePathRefSets, 0);
assert.equal(sourceBoundPathSteps, visiblePathSteps);
assert.ok(refinedWeakListAnchors >= 10, `corpus should exercise weak-anchor refinement; got ${refinedWeakListAnchors}`);
assert.ok(pathNarrativeSignatures.size >= 18, `paths remain too generic across cases: only ${pathNarrativeSignatures.size} distinct narrative signatures`);
assert.equal(storageCalls, 0);

const deterministicCase = corpus.cases.find((entry) => entry.expected_visible);
const forward = context.AHAProjectionProductReadModelV2.build({ legacy_insights: makeInsightsFromRawText(deterministicCase) });
const reverse = context.AHAProjectionProductReadModelV2.build({ legacy_insights: makeInsightsFromRawText(deterministicCase).reverse() });
assert.equal(forward.projection_id, reverse.projection_id);
assert.deepEqual(forward.surfaces, reverse.surfaces);

const review = JSON.parse(fs.readFileSync("ops/evaluation/aha-projection-product-human-review-v2.json", "utf8"));
assert.equal(review.release_rule.automatic_persistence_allowed, false);
assert.equal(review.review_rows.reduce((sum, row) => sum + row.cases, 0), 24);
assert.equal(review.case_reviews.length, 24);
assert.deepEqual(review.case_reviews.map((entry) => entry.case_id), corpus.cases.map((entry) => entry.id));
assert.ok(review.case_reviews.every((entry) => entry.lists === null && entry.paths === null && entry.mindmap === null && entry.review_status === "open"));
assert.equal(review.status, "agent_pre_review_complete_independent_human_review_open");
assert.equal(review.release_rule.minimum_acceptable_share, 0.8);
assert.equal(review.release_rule.independent_human_review_required, true);
assert.equal(review.release_rule.critical_provenance_errors_allowed, 0);
assert.equal(review.release_rule.automatic_persistence_allowed, false, "human review must remain a release blocker");

const lengths = corpus.cases.map((entry) => entry.source_text.length);
assert.ok(Math.min(...lengths) < 80, "corpus must contain deliberately insufficient short text");
assert.ok(Math.max(...lengths) >= 800, "corpus must contain genuinely long text");

console.log(`aha-projection-product-evaluation-v2.test.cjs: OK (24 raw-text cases; ${refinedWeakListAnchors} weak anchors source-refined; ${pathNarrativeSignatures.size} path signatures; human usefulness gate open)`);
