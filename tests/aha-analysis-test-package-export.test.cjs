const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const vm = require("node:vm");

const root = path.join(__dirname, "..");
const sourceText = "Research observed more visits in green areas. The study was cross-sectional and could not establish cause.";
const sha = crypto.createHash("sha256").update(sourceText).digest("hex");
const hash = value => crypto.createHash("sha256").update(String(value)).digest("hex");
const memory = new Map();
const storage = {
  getItem(key) { return memory.get(key) || null; },
  setItem(key, value) { memory.set(key, String(value)); },
  seed(key, value) { memory.set(key, JSON.stringify(value)); }
};
const trace = { status: "completed", provider: "test", model: "example", attempts: 1 };
const candidates = [
  { title: "Observed association", summary: "Green coverage and visits were associated.", evidence_quotes: ["Research observed more visits in green areas."], candidate_quality: { status: "needs_review" } },
  { title: "Causal claim", summary: "Green causes visits", rejection_reason: "causality_unsupported", evidence_quotes: [] }
];
let clickCount=0, downloadName="", downloadJson="";
const doc = {
  body: { appendChild() {} },
  createElement(tag) {
    assert.equal(tag, "a");
    return { href:"", download:"", click() { clickCount++; downloadName=this.download; }, remove() {} };
  }
};
const fakeURL={
  createObjectURL(blob) { downloadJson = blob.parts.join(""); return "blob:example"; },
  revokeObjectURL() {}
};
class FakeBlob { constructor(parts) { this.parts=parts; } }
const ctx={console,Date,JSON,WeakSet,Blob:FakeBlob,URL:fakeURL,document:doc};
ctx.window=ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root,"js/ahaChatExport.js"),"utf8"),ctx,{filename:"ahaChatExport.js"});
const api=ctx.AHAChatExport;
assert.equal(typeof api.buildAhaTestPackage,"function");
assert.equal(typeof api.exportAhaTestPackage,"function");
const bundle={
  version:"aha_analysis_export_v2",
  sourceText,source_sha256:sha,sourceTextHash:sha,
  analysisId:"analysis-1",analysisRunId:"run-1",sourceId:"source-1",
  activeRun:{analysisRunId:"run-1",sourceId:"source-1",sourceTextHash:sha,sourceKind:"pasted_text"},
  ahaReply:"AHA reply",canonicalAnalysis:{keyInsight:"Association, not cause"},
  insights:[{title:"Machine proposal",quality:"unreviewed"}],
  concepts:["green space"],subjectMatches:[],afterwork:{summary:"Active-run summary"},
  projectionProducts:{surfaces:{paths:[{title:"Inspect evidence"}]}},
  analysisBundleV2:{schema:"aha_analysis_bundle_v2",quality:{status:"ready"}},
  quality:{status:"valid"},sourceBinding:{valid:true}
};
storage.seed("aha_source_events_v1",[
  {id:"source-1",text:sourceText,title:"Real source",source_type:"article",created_at:"2026-10-24"},
  {id:"source-1",text:"Wrong source",title:"Unrelated"},
  {id:"other",text:sourceText,title:"Same text not bound"}
]);
storage.seed("aha_insight_chamber_v1",{insights:[
  {id:"in-1",analysisRunId:"run-1",sourceTextHash:sha,summary:"Exact run"},
  {id:"in-2",analysisRunId:"other-run",sourceTextHash:sha,summary:"Old same source"},
  {id:"in-3",analysisRunId:"run-1",sourceTextHash:"b".repeat(64),summary:"Wrong source"}
]});
storage.seed("aha_paths_v1",[
  {id:"p-1",meta:{analysisRunId:"run-1",sourceTextHash:sha},steps:[]},
  {id:"p-2",meta:{analysisRunId:"run-2",sourceTextHash:sha},steps:[]},
  {id:"p-3",meta:{analysisRunId:"run-1",sourceTextHash:sha},deletedAt:"today"}
]);
const afterworks=[
  {id:"work-1",analysisRunId:"run-1",sourceTextHash:sha,sourceText,insights:["Matched"]},
  {id:"work-2",analysisRunId:"run-2",sourceTextHash:sha,sourceText,insights:["Old run"]},
  {id:"work-3",analysisRunId:"run-1",sourceTextHash:"b".repeat(64),sourceText,insights:["Stale"]},
  {id:"work-4",analysisRunId:"run-1",sourceTextHash:sha,sourceText:"Other article",insights:["Forged"]}
];
const auto={
  analysisRunId:"run-1",sourceTextHash:sha,sourceText,
  payload:{analysisRunId:"run-1",sourceTextHash:sha,insightCandidatesV2:candidates,analysisRuntime:trace}
};
const deps={
  storage,sourceHash:hash,
  loadAutoOutputs:()=>auto,
  loadAfterworkEntries:()=>afterworks,
  document:doc,URL:fakeURL,Blob:FakeBlob,
  setStatusNote(){}
};
let result=api.buildAhaTestPackage(deps,()=>bundle);
assert.equal(result.schema,"aha_analysis_test_package_v1");
assert.equal(result.identity.analysis_run_id,"run-1");
assert.equal(result.source.text,sourceText);
assert.equal(result.candidate_audit.status,"recorded_current_run");
assert.equal(result.candidate_audit.candidates.length,2);
assert.equal(result.candidate_audit.candidates[1].rejection_reason,"causality_unsupported");
assert.equal(result.candidate_audit.runtime_trace.model,"example");
assert.equal(result.linked_local_records.saved_afterwork.length,1);
assert.equal(result.linked_local_records.saved_afterwork[0].id,"work-1");
assert.equal(result.source.exact_local_source_events.length,1);
assert.equal(result.linked_local_records.stored_insights.length,1);
assert.equal(result.linked_local_records.saved_paths.length,1);
assert.equal(result.evaluation.human_review.status,"not_reviewed");
assert.equal(result.scientifically_approved,false);
assert.equal(result.coverage.historical_model_attempts_complete,false);
assert.ok(result.coverage.missing.includes("historical_model_attempts_not_archived"));
assert.doesNotMatch(JSON.stringify(result), /Old same source|Forged|Wrong source|Old run|Stale|Wrong source/);

result=api.exportAhaTestPackage(deps,()=>bundle);
assert.equal(clickCount,1);
assert.equal(downloadName,"aha-testpakke-run-1.json");
assert.equal(JSON.parse(downloadJson).schema,"aha_analysis_test_package_v1");
assert.equal(JSON.parse(downloadJson).source.text,sourceText);

const otherCache={...auto,analysisRunId:"older",payload:{...auto.payload,analysisRunId:"older"}};
const missing=api.buildAhaTestPackage({...deps,loadAutoOutputs:()=>otherCache,loadAfterworkEntries:()=>[]},()=>bundle);
assert.equal(missing.candidate_audit.status,"not_available_for_this_run");
assert.equal(missing.candidate_audit.candidates.length,0);
assert.equal(missing.candidate_audit.runtime_trace,null);
assert.ok(missing.coverage.missing.includes("candidate_cache_not_bound_to_active_run"));
const corrupt={...bundle,source_sha256:"b".repeat(64)};
assert.throws(()=>api.buildAhaTestPackage(deps,()=>corrupt),/SHA-256/);
assert.throws(()=>api.buildAhaTestPackage(deps,()=>({...bundle,sourceText:""})),/SHA-256/);
assert.throws(()=>api.buildAhaTestPackage(deps,()=>({...bundle,analysisRunId:""})),/SHA-256/);
const html=fs.readFileSync(path.join(root,"chat.html"),"utf8");
const ui=fs.readFileSync(path.join(root,"js/ahaChatUiRuntime.js"),"utf8");
const composition=fs.readFileSync(path.join(root,"js/ahaChatRuntimeComposition.js"),"utf8");
assert.doesNotMatch(html,/id="btn-export-test-package"/, "Protected Chat HTML must remain unchanged");
assert.match(ui,/button\.id = "btn-export-test-package"/);
assert.match(ui,/ensureTestPackageButton\(\)/);
assert.match(ui,/btn-export-test-package/);
assert.match(composition,/exportTestPackage: exportRuntime.exportAhaTestPackage/);
console.log("AHA one-run test package: source hash, run identity, rejected candidates, local records, privacy and download passed.");
