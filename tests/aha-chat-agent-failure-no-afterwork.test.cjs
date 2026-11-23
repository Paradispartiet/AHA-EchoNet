const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "js/ahaChatRunContext.js"), "utf8");

async function verifyFailure({ code, expectedText, savingEnabled, stale = false, agentResult }) {
  const events = [];
  const run = { analysisRunId: "run_failed", runId: "run_failed", sourceId: "source_failed" };
  const error = new Error(code);
  error.code = code;
  const context = {
    console: { warn() {} },
    AHAChatPersistence: {
      appendAssistantMessage(text, opts) {
        events.push(["persist_status", text, opts.tags]);
        return { id: "status_message" };
      }
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "ahaChatRunContext.js" });
  const runtime = context.AHAChatRunContext.createSubmissionRuntime({
    config: { threadId: "thread_failed" },
    analysis: {
      askAgent: async () => { if (agentResult !== undefined) return agentResult; throw error; },
      isActiveAnalysisRun: (candidate) => !stale && candidate === run,
      clearActiveAnalysisState(candidate, message) {
        assert.equal(candidate, run);
        assert.match(message, /Ingen nytt etterarbeid/);
        events.push(["clear_failed_analysis", message]);
      },
      renderAutoOutputs() { throw new Error("Never produce fallback analysis after model failure"); },
      ensureAfterworkForLatestAnalysis() { throw new Error("Never save afterwork after model failure"); },
      updateAnalysisRun() { throw new Error("Never persist failed afterwork"); }
    },
    memory: { updateMemoryStatus: () => events.push(["refresh_memory_status"]) },
    ui: {
      setProcessing: (active) => events.push(["processing", active]),
      renderChatMemoryStatus: () => events.push(["render_chat_memory_status"]),
      appendChat(role, message) { events.push(["show_status", role, message]); }
    }
  });

  const result = await runtime.executeAnalysis({
    cleanText: "Kildetekst fra brukeren som skal beholdes.",
    analysisInputText: "Kildetekst fra brukeren som skal beholdes.",
    analysisRun: run,
    savingEnabled,
    memoryContext: { used: false },
    personalContext: {},
    answerPackage: null,
    memoryUseEnabled: false,
    urlInfo: { isSourceAction: false },
    analysisInsightCandidatesPromise: Promise.resolve([])
  });

  if (stale) {
    assert.equal(result, null, "Older failed runs must not overwrite the current user's screen");
    assert.equal(events.some(([name]) => name === "clear_failed_analysis"), false);
    assert.equal(events.some(([name]) => name === "show_status"), false);
    return;
  }

  assert.equal(result.type, "agent_error");
  if (agentResult === undefined) assert.equal(result.error, error);
  else assert.equal(result.error.code, "empty_agent_reply");
  const cleared = events.findIndex(([name]) => name === "clear_failed_analysis");
  const shown = events.findIndex(([name]) => name === "show_status");
  assert.ok(cleared >= 0 && cleared < shown, "Clear failed previews before reporting the AI failure");
  const visible = events.find(([name]) => name === "show_status");
  assert.equal(visible[1], "aha");
  assert.match(visible[2], expectedText);
  assert.ok(events.some(([name, active]) => name === "processing" && active === false));
  const persisted = events.filter(([name]) => name === "persist_status");
  assert.equal(persisted.length, savingEnabled ? 1 : 0, "Only an explicit status message may be saved");
  if (savingEnabled) {
    assert.deepEqual(Array.from(persisted[0][2]), ["status"]);
    assert.equal(persisted[0][1], visible[2]);
  }
  assert.equal(events.some(([name]) => name === "render_auto_output"), false);
}

(async () => {
  await verifyFailure({ code: "openai_quota_exhausted", expectedText: /kvote eller kreditt/, savingEnabled: true });
  await verifyFailure({ code: "openai_rate_limited", expectedText: /midlertidig bruksgrense/, savingEnabled: false });
  await verifyFailure({ code: "missing_openai_api_key", expectedText: /API-nøkkel/, savingEnabled: true });
  await verifyFailure({ code: "chat_http_503", expectedText: /ikke tilgjengelig/, savingEnabled: true });
  await verifyFailure({ code: "empty_agent_reply", expectedText: /ikke et gyldig svar/, savingEnabled: true, agentResult: { ok: true, reply: "" } });
  await verifyFailure({ code: "empty_agent_reply", expectedText: /ikke et gyldig svar/, savingEnabled: true, agentResult: { ok: false, reply: "påstått svar" } });
  await verifyFailure({ code: "openai_quota_exhausted", expectedText: /kvote/, savingEnabled: true, stale: true });
  console.log("Chat AI failure preserves status and never materializes synthetic afterwork.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
