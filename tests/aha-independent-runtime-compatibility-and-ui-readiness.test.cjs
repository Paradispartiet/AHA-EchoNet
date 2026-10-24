const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const root = path.resolve(__dirname,"..");

const pipelineSandbox = { console, window: null };
pipelineSandbox.window = pipelineSandbox;
pipelineSandbox.AHA_FRONTEND_BUILD_SHA = "7cb6beb1925a31275c8dbb308c6faf45490b0f8f";
vm.runInNewContext(fs.readFileSync(path.join(root,"js/ahaChatInsightPipeline.js"),"utf8"),pipelineSandbox);
const api = pipelineSandbox.AHAChatInsightPipeline;
const expected = api.expectedRuntimeManifest();
const backend = { ...expected, backend_build_sha: "87bf84cc5b2683ed275d503e782e25eb420eae5e", schema: "aha_runtime_manifest_v1" };
assert.equal(api.runtimeMismatchReasons(backend).length,0);
assert.deepEqual(Array.from(api.deploymentMismatchReasons(backend)),["runtime_build_mismatch:frontend_backend_sha"]);
assert.deepEqual(Array.from(api.runtimeCompatibilityReasons(backend)),[], "separately deployed, contract-compatible agents must not be blocked");
const wrongContract = {...backend, synthesis_contract: "aha_insight_synthesis_contract_v1"};
assert.deepEqual(Array.from(api.runtimeCompatibilityReasons(wrongContract)),["runtime_contract_mismatch:synthesis_contract"],"contract mismatch still blocks");
assert.ok(api.runtimeCompatibilityReasons({backend_build_sha:backend.backend_build_sha}).length>=6,"missing contract manifest fails closed");
assert.deepEqual(Array.from(api.runtimeCompatibilityReasons(null)),["runtime_manifest_missing:backend"],"missing health manifest remains blocked");
const withoutSha = {...expected};
assert.deepEqual(Array.from(api.runtimeCompatibilityReasons(withoutSha)),[], "contracts verified even if backend lacks provenance SHA");
assert.deepEqual(Array.from(api.deploymentMismatchReasons(withoutSha)),["runtime_build_sha_missing:backend"]);

const document={readyState:"loading",addEventListener(){},getElementById(){return null;}};
const ctx={window:null,document,console};ctx.window=ctx;
vm.runInNewContext(fs.readFileSync(path.join(root,"js/ahaExplorer.js"),"utf8"),ctx);
const explorer=ctx.AHAExplorer;
const incomplete={
  status:"incomplete",validation:{valid:true},quality:{required_missing_field_ids:["overview.strongest_insight"]},
  semantic_document:{synthesis_gate:{status:"not_run",authoritative:true,approved_count:0}}
};
const model={status:"ready",quality:{visible_field_count:12,blocked_field_count:8},sections:{overview:{}}};
const diagnostic=explorer.summarizeActiveReadiness(model,incomplete);
assert.equal(diagnostic.status,"incomplete","read-model ready must not mask incomplete source bundle");
assert.equal(diagnostic.label,"ufullstendig");
assert.equal(diagnostic.gateStatus,"not_run");
assert.match(diagnostic.reason,/ikke kjørt/);
assert.equal(diagnostic.sourceVerified,true);
const product=explorer.productDisplayState(
  {status:"not_relevant",label:"Ikke relevant for denne teksten",reason:"no candidates",href:null},incomplete
);
assert.equal(product.status,"needs_evidence");
assert.equal(product.label,"Ikke vurdert ennå");
const ready={
  status:"ready",validation:{valid:true},semantic_document:{synthesis_gate:{status:"ready",approved_count:2,authoritative:true}}
};
assert.equal(explorer.summarizeActiveReadiness(model,ready).status,"ready");
assert.equal(explorer.productDisplayState({status:"not_relevant",label:"Irrelevant"},ready).status,"not_relevant");
assert.equal(explorer.summarizeActiveReadiness(model,{...ready,status:"incomplete"}).status,"incomplete");

const explorerJs=fs.readFileSync(path.join(root,"js/ahaExplorer.js"),"utf8");
assert.match(explorerJs,/renderOversikt\(analysis\)/);
assert.match(explorerJs,/Kildens spenning – ikke verifisert syntese/);
assert.match(explorerJs,/Teknisk kildebinding er ikke faglig godkjenning/);
assert.match(fs.readFileSync(path.join(root,"js/ahaChatInsightPipeline.js"),"utf8"),/deployment_warnings: deploymentMismatchReasons\(data\.runtime\)/);
console.log("AHA independent deploy compatibility and user-visible incomplete gate regression passed.");
