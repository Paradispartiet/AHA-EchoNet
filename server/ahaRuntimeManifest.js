import {
  SYNTHESIS_CONTRACT,
  SYNTHESIS_OUTPUT_SCHEMA,
  SYNTHESIS_PROMPT_VERSION
} from "./ahaInsightSynthesisContractV2.js";

const ACTIVE_ANALYSIS_CONTRACT = "aha_active_analysis_contract_v3";
const QUALITY_GATE_SCHEMA = "aha_insight_quality_gate_v2";
const SEMANTIC_DOCUMENT_SCHEMA = "aha_semantic_document_v2";

function runtimeBuildSha() {
  return String(
    process.env.RENDER_GIT_COMMIT
    || process.env.GIT_COMMIT_SHA
    || process.env.VERCEL_GIT_COMMIT_SHA
    || "unknown"
  ).trim() || "unknown";
}

function buildRuntimeManifest() {
  return {
    schema: "aha_runtime_manifest_v1",
    analysis_contract: ACTIVE_ANALYSIS_CONTRACT,
    synthesis_contract: SYNTHESIS_CONTRACT,
    synthesis_output_schema: SYNTHESIS_OUTPUT_SCHEMA,
    prompt_version: SYNTHESIS_PROMPT_VERSION,
    quality_gate_schema: QUALITY_GATE_SCHEMA,
    semantic_document_schema: SEMANTIC_DOCUMENT_SCHEMA,
    backend_build_sha: runtimeBuildSha()
  };
}

export {
  ACTIVE_ANALYSIS_CONTRACT,
  QUALITY_GATE_SCHEMA,
  SEMANTIC_DOCUMENT_SCHEMA,
  buildRuntimeManifest
};
