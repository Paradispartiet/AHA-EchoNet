const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const registrations = [];
const context = {
  console,
  Object,
  Array,
  Set,
  AHAModuleApi: {
    register(name, source, options) {
      registrations.push({ name, source, options });
      return source;
    }
  }
};
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("js/ahaChatRuntimeComposition.js", "utf8"), context, {
  filename: "js/ahaChatRuntimeComposition.js"
});

const api = context.AHAChatRuntimeComposition;
assert.equal(Object.isFrozen(api), true);
assert.equal(Object.isFrozen(api.REQUIRED_BINDINGS), true);
assert.equal(registrations.some(({ name }) => name === "chat.runtimeComposition"), true);
assert.throws(() => api.create({}), /mangler avhengighet: config/);

const calls = {};
const exported = {
  buildAhaAnalysisExportBundle: () => "bundle",
  formatAhaAnalysisExportMarkdown: () => "markdown",
  copyAhaAnalysisExportMarkdown: () => "copy",
  exportAhaAnalysisJson: () => "json"
};
const auto = {
  renderAutoOutputs: () => "render-auto",
  focusAutoCard: () => "focus-auto",
  restoreAutoOutputFromStorage: () => "restore-auto"
};
const reply = {
  stripFagkoblingerSections: () => "strip",
  forceLiteraryFagkoblingerInReply: () => "literary",
  forceInstitutionalMediaHistoryFagkoblingerInReply: () => "media-history"
};
const meta = {
  getActiveMetaAiSession: () => "session",
  renderMetaAiSessionBox: () => "box",
  startMetaAiSession: () => "start",
  saveMetaAiClaimFeedback: () => "feedback",
  renderMetaAiClaims: () => "claims",
  maybeHandleMetaAiAgentReply: () => "meta-reply"
};
const submission = { submitAhaChatMessage: () => "submit" };
const knowledge = {
  showStatus: () => "status",
  showConcepts: () => "concepts",
  showMeta: () => "meta",
  showKnowledgeMap: () => "map"
};
const ui = { bind: () => "bind" };
const installed = { ok: true };

const modules = {
  export: { createRuntime(deps) { calls.export = deps; return exported; } },
  autoOutputView: { createRuntime(deps) { calls.auto = deps; return auto; } },
  replyFormat: { createSubjectPolicy(deps) { calls.reply = deps; return reply; } },
  metaInsightsAgent: { createChatSession(deps) { calls.meta = deps; return meta; } },
  runContext: { createSubmissionRuntime(deps) { calls.submission = deps; return submission; } },
  knowledgeView: { create(deps) { calls.knowledge = deps; return knowledge; } },
  uiRuntime: { create(deps) { calls.ui = deps; return ui; } },
  runtimeFacade: {
    create(deps) {
      calls.facade = deps;
      return { install() { calls.install = true; return installed; } };
    }
  }
};

const bindings = {};
api.REQUIRED_BINDINGS.forEach((name) => { bindings[name] = () => name; });
bindings.analysisRunContract = { version: "aha_analysis_run_v1" };
bindings.AHA_RUNTIME_KNOWLEDGE_POLICY = { legacyArticleTemplatesEnabled: false };
bindings.getInsightsApi = () => ({ buildMetaProfile: () => ({ profile: "meta" }) });
bindings.renderAhaMemoryTransparency = () => "transparency";
bindings.bindAhaMemoryControls = () => "bind-memory";
bindings.renderAhaPersonalAiLoopStatus = () => "personal-status";
bindings.buildAhaPersonalAiLoopChatReadinessStatus = () => "readiness";

const runtime = api.create({
  config: {
    subjectId: "sub_laring",
    threadId: "default_thread",
    pendingPromptKey: "pending",
    highlightsStorageKey: "highlights",
    afterworkStorageKey: "afterwork"
  },
  modules,
  bindings
});

assert.equal(Object.isFrozen(runtime), true);
assert.deepEqual(calls.export.buildMetaProfile({}), { profile: "meta" });
assert.equal(calls.auto.defaultConversationId, "default_thread");
assert.strictEqual(calls.submission.analysis.renderAutoOutputs, auto.renderAutoOutputs);
assert.strictEqual(calls.submission.analysis.maybeHandleMetaAiAgentReply, meta.maybeHandleMetaAiAgentReply);
assert.strictEqual(calls.submission.analysis.stripFagkoblingerSections, reply.stripFagkoblingerSections);
assert.strictEqual(calls.ui.submitMessage, submission.submitAhaChatMessage);
assert.strictEqual(calls.ui.showMeta, knowledge.showMeta);
assert.strictEqual(calls.ui.exportAnalysisJson, exported.exportAhaAnalysisJson);
assert.strictEqual(calls.ui.focusAutoCard, auto.focusAutoCard);
assert.strictEqual(calls.ui.startMetaAiSession, meta.startMetaAiSession);
assert.strictEqual(calls.facade.bindings.submitAhaChatMessage, submission.submitAhaChatMessage);
assert.strictEqual(calls.facade.bindings.buildAhaAnalysisExportBundle, exported.buildAhaAnalysisExportBundle);
assert.strictEqual(calls.facade.bindings.renderAutoOutputs, auto.renderAutoOutputs);
assert.strictEqual(calls.facade.bindings.showMeta, knowledge.showMeta);
assert.strictEqual(calls.facade.bindings.bind, ui.bind);
assert.strictEqual(runtime.install(), installed);
assert.equal(calls.install, true);

assert.throws(
  () => api.create({ config: { subjectId: "sub" }, modules, bindings }),
  /mangler config: threadId/
);
assert.throws(
  () => api.create({
    config: { subjectId: "sub", threadId: "thread", pendingPromptKey: "p", highlightsStorageKey: "h", afterworkStorageKey: "a" },
    modules: { ...modules, uiRuntime: {} },
    bindings
  }),
  /krever modulmetode: uiRuntime\.create/
);

console.log("aha-chat-runtime-composition.test.cjs passed");
