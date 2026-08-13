const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const source = fs.readFileSync("js/ahaChatPersonalUi.js", "utf8");
const chatSource = fs.readFileSync("js/ahaChatAcademicInsightView.js", "utf8") + "\n" + fs.readFileSync("js/ahaChat.js", "utf8");
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
assert.equal(chatSource.includes("Lagre som training example"), false, "Personal AI UI implementation must live outside ahaChat.js");
assert.ok(chatHtml.indexOf("js/ahaChatPersonalUi.js") < chatHtml.indexOf("js/ahaChat.js"));

console.log("aha-chat-personal-ui passed");
