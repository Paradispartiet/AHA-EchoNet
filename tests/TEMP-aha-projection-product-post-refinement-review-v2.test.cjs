const fs = require("fs");
const vm = require("vm");

const context = { console };
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

for (const entry of corpus.cases) {
  const model = context.AHAProjectionProductReadModelV2.build({
    legacy_insights: makeInsightsFromRawText(entry),
    legacy_lists: [],
    legacy_paths: [],
    legacy_mindmaps: []
  });
  const insights = new Map((model.surfaces?.insights || []).map((insight) => [insight.id, insight]));
  const nodes = new Map((model.surfaces?.mindmap?.nodes || []).map((node) => [node.id, node]));
  const branchIds = (model.surfaces?.mindmap?.edges || []).filter((edge) => edge.type === "theme_branch").map((edge) => edge.to);
  const packet = {
    case_id: entry.id,
    genre: entry.genre,
    focus: entry.focus,
    source_text: entry.source_text,
    expected_visible: entry.expected_visible,
    status: model.status,
    blocking_reasons: model.blocking_reasons || [],
    lists: (model.surfaces?.lists || []).map((list) => ({
      title: list.title,
      description: list.description,
      semantic_basis: list.meta?.semantic_basis,
      semantic_basis_label: list.meta?.semantic_basis_label,
      display_theme: list.meta?.display_theme,
      display_theme_source: list.meta?.display_theme_source,
      score: list.quality?.score,
      items: (list.items || []).map((item) => ({
        title: item.title,
        source_insight: insights.get(item.refId)?.insight || insights.get(item.refId)?.summary || null
      }))
    })),
    paths: (model.surfaces?.paths || []).map((path) => ({
      title: path.title,
      description: path.description,
      goal: path.goal,
      score: path.quality?.score,
      steps: (path.steps || []).map((step) => ({
        stage: step.meta?.stage,
        source_insight: insights.get(step.refId)?.insight || insights.get(step.refId)?.summary || null,
        narrative: step.narrative,
        learning_outcome: step.learningOutcome
      }))
    })),
    mindmap: {
      score: model.surfaces?.mindmap?.quality?.score || null,
      root: (model.surfaces?.mindmap?.nodes || []).filter((node) => node.type === "theme" && node.meta?.root === true).map((node) => node.title || node.label),
      branches: branchIds.map((id) => ({
        label: nodes.get(id)?.title || nodes.get(id)?.label || null,
        children: (model.surfaces?.mindmap?.edges || [])
          .filter((edge) => edge.type === "supports_insight" && edge.from === id)
          .map((edge) => nodes.get(edge.to)?.title || nodes.get(edge.to)?.label || null)
          .filter(Boolean)
      }))
    }
  };
  console.log(`POST_REFINEMENT_REVIEW ${JSON.stringify(packet)}`);
}
console.log("TEMP post-refinement review probe complete");
