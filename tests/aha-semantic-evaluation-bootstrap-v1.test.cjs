const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("js/ahaSemanticEvaluationBootstrap.js", "utf8");

{
  let createCalls = 0;
  let bindCalls = 0;
  const runtime = { getStatus: () => ({ bound: true }), bind: () => { bindCalls += 1; } };
  const context = {
    window: null,
    AHAModuleApi: {
      resolve(name, legacy, options) {
        assert.equal(name, "semanticEvaluationRuntime");
        assert.equal(legacy, "AHASemanticEvaluationRuntime");
        assert.equal(options.version, 1);
        return {
          create() {
            createCalls += 1;
            return runtime;
          }
        };
      }
    }
  };
  context.window = context;
  vm.runInNewContext(source, context, { filename: "js/ahaSemanticEvaluationBootstrap.js" });
  assert.equal(createCalls, 1);
  assert.equal(bindCalls, 1);
  assert.equal(context.AHASemanticEvaluationShadowRuntime, runtime);
}

{
  let createCalls = 0;
  const existing = { getStatus: () => ({ bound: true }) };
  const context = {
    window: null,
    AHASemanticEvaluationShadowRuntime: existing,
    AHASemanticEvaluationRuntime: {
      create() {
        createCalls += 1;
        return { bind() {} };
      }
    }
  };
  context.window = context;
  vm.runInNewContext(source, context, { filename: "js/ahaSemanticEvaluationBootstrap.js" });
  assert.equal(createCalls, 0, "bootstrap skal være idempotent når runtime allerede finnes");
  assert.equal(context.AHASemanticEvaluationShadowRuntime, existing);
}

{
  const context = { window: null };
  context.window = context;
  vm.runInNewContext(source, context, { filename: "js/ahaSemanticEvaluationBootstrap.js" });
  assert.equal(context.AHASemanticEvaluationShadowRuntime, undefined, "manglende runtime-modul skal være sikker no-op");
}

console.log("aha-semantic-evaluation-bootstrap-v1 passed");
