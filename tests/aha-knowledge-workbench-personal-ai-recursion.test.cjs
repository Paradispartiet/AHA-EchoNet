const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

function run(file, context) {
  vm.runInNewContext(fs.readFileSync(file, "utf8"), context, { filename: file });
}

function store() {
  const values = {};
  return {
    getItem(key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
    setItem(key, value) { values[key] = String(value); },
    removeItem(key) { delete values[key]; }
  };
}

const context = {
  window: null,
  globalThis: null,
  console,
  localStorage: store(),
  document: null
};
context.window = context;
context.globalThis = context;

run("js/ahaPersonalAiControl.js", context);
run("js/ahaKnowledgeWorkbench.js", context);

context.AHAPersonalAiControl.saveLastControlStatus({
  overall: { status: "working", score: 73 },
  modules: {},
  local_only: true
});

const originalBuildControlStatus = context.AHAPersonalAiControl.buildControlStatus;
let forbiddenBuildCalls = 0;
context.AHAPersonalAiControl.buildControlStatus = function () {
  forbiddenBuildCalls += 1;
  throw new Error("Workbench must not rebuild Personal AI while building Workbench status");
};

const workbench = context.AHAKnowledgeWorkbench.buildWorkbenchStatus({ save: false });
assert.ok(workbench.overall, "Workbench status should build");
assert.equal(workbench.counts.personalAiScore, 73, "Workbench should read the last Personal AI status score");
assert.equal(forbiddenBuildCalls, 0, "Workbench status must not recursively rebuild Personal AI status");

context.AHAPersonalAiControl.buildControlStatus = originalBuildControlStatus;
const personal = context.AHAPersonalAiControl.buildControlStatus({ save: false });
assert.ok(personal.overall, "Personal AI status should build with Workbench loaded");
assert.equal(personal.modules.knowledgeWorkbench.available, true, "Personal AI should still see Workbench as available");

console.log("AHA Workbench/Personal AI recursion regression passed.");
