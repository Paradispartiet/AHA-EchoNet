const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("js/ahaChatPersonalUi.js", "utf8");
const memoryControlsSource = fs.readFileSync("js/ahaChatMemoryControls.js", "utf8");
const chatSource = fs.readFileSync("js/ahaChatAnalysisRunContract.js", "utf8") + "\n" + fs.readFileSync("js/ahaChatAcademicInsightView.js", "utf8") + "\n" + fs.readFileSync("js/ahaChatUiRuntime.js", "utf8") + "\n" + fs.readFileSync("js/ahaChatRuntimeFacade.js", "utf8") + "\n" + fs.readFileSync("js/ahaChat.js", "utf8");
const chatHtml = fs.readFileSync("chat.html", "utf8");
const context = { window: null, console, document: { getElementById() { return null; } } };
context.window = context;
vm.runInNewContext(source, context, { filename: "js/ahaChatPersonalUi.js" });

assert.equal(typeof context.AHAChatPersonalUi?.create, "function");
const ui = context.AHAChatPersonalUi.create({});
for (const name of [
  "buildAhaPersonalMessageContext",
  "buildAhaAnswerPackage",
  "renderAhaAnswerComposer",
  "evaluateAhaAnswerForChat",
  "renderAhaPersonalAiLoopStatus",
  "renderAhaMemoryTransparency",
  "renderAhaMemoryStatus",
  "renderAhaMemoryControls",
  "updateAhaMemoryStatus"
]) {
  assert.equal(typeof ui[name], "function", `${name} must be exported by AHAChatPersonalUi`);
}

const unknown = ui.buildAhaPersonalAiLoopChatReadinessStatus(null);
assert.equal(unknown.state, "unknown");
assert.equal(unknown.compactOnly, true);
assert.equal(unknown.redacted, true);
assert.equal(unknown.requiresManualReview, true);

assert.ok(chatSource.includes('chatModule("personalUi", "AHAChatPersonalUi")?.create?.('));
assert.ok(chatSource.includes("AHAChatPersonalUi må lastes før ahaChat.js."));
assert.ok(chatSource.includes("memoryControls.bindView({"), "memory controls must bind to Personal UI through the explicit view contract");
assert.equal(chatSource.includes("let personalUi = null"), false, "Personal UI must not rely on a mutable late-binding placeholder");
assert.equal(/function\s+(?:getAhaPersonalContextApi|buildAhaPersonalMessageContext|buildAhaAnswerPackage|renderAhaAnswerComposer|renderAhaAnswerEvaluation|evaluateAhaAnswerForChat|renderAhaPersonalContextStatus|renderAhaPersonalRetrieval|buildAhaPersonalAiLoopChatReadinessStatus|renderAhaPersonalAiLoopStatus|renderAhaMemoryTransparency|renderAhaMemoryStatus|renderAhaMemoryControls|bindAhaMemoryControls|updateAhaMemoryStatus)\s*\(/.test(chatSource), false, "Personal UI methods must be wired directly without orchestration wrappers");
assert.equal(chatSource.includes("Lagre som training example"), false, "Personal AI UI implementation must live outside ahaChat.js");
assert.ok(chatHtml.indexOf("js/ahaChatPersonalUi.js") < chatHtml.indexOf("js/ahaChat.js"));

const storage = new Map();
const memoryContext = {
  window: null,
  localStorage: {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key)
  }
};
memoryContext.window = memoryContext;
vm.runInNewContext(memoryControlsSource, memoryContext, { filename: "js/ahaChatMemoryControls.js" });
const memoryControls = memoryContext.AHAChatMemoryControls.create();
const notifications = [];
const binding = memoryControls.bindView({
  renderControls: (controls) => notifications.push(["render", controls.saveNewInsights]),
  updateStatus: () => notifications.push(["status"])
});
assert.deepEqual({ ...binding }, { renderControlsBound: true, updateStatusBound: true });
assert.equal(Object.isFrozen(binding), true, "view binding status must be immutable");
memoryControls.setAhaMemoryControl("saveNewInsights", false);
assert.deepEqual(notifications, [["render", false], ["status"]], "bound Personal UI callbacks must receive control changes once");
memoryControls.bindView();
memoryControls.setAhaMemoryControl("saveNewInsights", true);
assert.equal(notifications.length, 2, "empty binding must remove callbacks without hidden UI writes");

console.log("aha-chat-personal-ui passed");
