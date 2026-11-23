const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { URL } = require("node:url");

const root = path.join(__dirname, "..");
const serverCode = fs.readFileSync(path.join(root, "server.js"), "utf8");
const fallbackStart = serverCode.indexOf("function safeArticleAnalysisFallback(");
const fallbackEnd = serverCode.indexOf("\nconst INSIGHT_FUNCTIONAL_TYPES", fallbackStart);
assert.ok(fallbackStart >= 0 && fallbackEnd > fallbackStart, "Server article analysis implementation must exist");
const articleFunctions = serverCode.slice(fallbackStart, fallbackEnd);

function makeServerContext(openai) {
  const ctx = {
    openai, OPENAI_MODEL: "test-model", JSON,
    console: { warn() {} },
    safeParseJsonCandidatePayload: (raw) => raw.candidates,
    sanitizeInsightCandidate: (item) => item
  };
  vm.createContext(ctx);
  vm.runInContext(articleFunctions, ctx, { filename: "server-article-analysis.js" });
  return ctx;
}

async function verifyServer() {
  const source = { title: "Vann i byen", description: "En beskrivelse fra kilden.", publisher: "Kildeavisen" };
  const missingModel = await makeServerContext(null).analyzeArticleTextForAha({ source, text: "Kildeinnhold" });
  assert.equal(missingModel.ai_analysis_status, "model_unavailable");
  assert.deepEqual(Array.from(missingModel.candidates), []);
  assert.deepEqual(Array.from(missingModel.claims), []);
  assert.match(missingModel.short_summary, /ikke AI-analyse/);

  const brokenModel = makeServerContext({ responses: { create: async () => { throw Error("simulert 429"); } } });
  const failure = await brokenModel.analyzeArticleTextForAha({ source, text: "Kildeinnhold" });
  assert.equal(failure.ai_analysis_status, "model_failed");
  assert.deepEqual(Array.from(failure.candidates), []);

  const malformedModel = makeServerContext({ responses: { create: async () => ({ output_text: "{}" }) } });
  const malformed = await malformedModel.analyzeArticleTextForAha({ source, text: "Kildeinnhold" });
  assert.equal(malformed.ai_analysis_status, "model_failed");
  assert.deepEqual(Array.from(malformed.candidates), []);

  const validModel = makeServerContext({ responses: {
    create: async () => ({ output_text: JSON.stringify({
      short_summary: "AI vurderte kildeinnholdet.",
      candidates: [{ title: "Mulig innsikt", summary: "Kvalifiseres senere", text: "Kvalifiseres senere" }]
    }) })
  } });
  const completed = await validModel.analyzeArticleTextForAha({ source, text: "Kildeinnhold" });
  assert.equal(completed.ai_analysis_status, "completed");
  assert.equal(completed.candidates.length, 1);
  assert.ok(!completed.short_summary.includes("ikke AI-analyse"));

  assert.match(serverCode, /const modelCompleted = aiAnalysisStatus === "completed"/);
  assert.match(serverCode, /candidates: modelCompleted && Array\.isArray\(candidates\) \? candidates : \[\]/);
  assert.doesNotMatch(serverCode, /candidates: Array\.isArray\(candidates\) && candidates\.length \? candidates : safeArticleAnalysisFallback/);
}

async function verifyClient(aiStatus, candidateCount, referenceOnly = false) {
  const captures = [];
  const statusElement = { textContent: "" };
  const serverResponse = {
    ok: true,
    access_status: "full",
    ...(aiStatus == null ? {} : { ai_analysis_status: aiStatus }),
    source: { url: "https://example.org/article", title: "Vann i byen", publisher: "Kildeavisen" },
    analysis: { short_summary: "Et uverifisert sammendrag", main_points: ["Kildens tekst"] },
    candidates: [{ title: "Kandidat", text: "AI merket denne kandidaten", candidate_type: "ai" }],
    policy: { transient_fulltext_read: true, raw_article_stored: false }
  };
  const ctx = {
    URL, Date, console, AHA_AGENT_API: "https://agent.example.invalid",
    document: { getElementById: (id) => id === "chat-status-note" ? statusElement : null },
    fetch: async () => ({ ok: true, json: async () => serverResponse }),
    AHAIngest: {
      ingestWithCandidates(source, candidates) {
        captures.push({ source, candidates });
        return { ok: true };
      }
    }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, "js/ahaLinkReader.js"), "utf8"), ctx);
  const results = await ctx.AHALinkReader.processUrlsFromMessage(
    "https://example.org/article", { reference_only: referenceOnly }
  );
  assert.equal(results[0].access_status, "full", "Source extraction still succeeds");
  assert.equal(results[0].candidate_count, candidateCount);
  assert.equal(captures.length, 1);
  assert.equal(captures[0].candidates.length, candidateCount);
  const eligible = aiStatus === "completed" && !referenceOnly;
  assert.equal(captures[0].source.meta.semantic_insight_eligible, eligible);
  assert.equal(captures[0].source.meta.source_event_only, !eligible);
  assert.equal(captures[0].source.content_type, eligible ? "transient_article_analysis" : "article_reference");
  assert.equal(ctx.AHALinkReader.getLatestArticleAnalysis().ai_analysis_status, aiStatus || "not_run");
  if (!eligible && !referenceOnly) {
    assert.match(statusElement.textContent, /AI-analysen ble ikke fullført/);
    assert.match(captures[0].source.text, /AI-analysen ble ikke fullført/);
  }
  return results;
}

(async () => {
  await verifyServer();
  await verifyClient("model_unavailable", 0);
  await verifyClient("model_failed", 0);
  await verifyClient(null, 0);
  await verifyClient("completed", 1);
  await verifyClient("completed", 0, true);
  console.log("Article extraction does not become a fabricated AI insight after model failure.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
