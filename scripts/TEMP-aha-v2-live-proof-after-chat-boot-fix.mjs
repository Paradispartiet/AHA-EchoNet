import fs from "node:fs";
import { chromium } from "playwright";

const origin = String(process.env.PAGES_ORIGIN || "").replace(/\/$/, "");
const expectedMain = String(process.env.EXPECTED_MAIN || "");
const runId = Number(process.env.RUN_ID || 0);
const runAttempt = Number(process.env.RUN_ATTEMPT || 0);
const outDir = "probe-evidence";
fs.mkdirSync(outDir, { recursive: true });

const evidenceQuoteA = "Live rehearsal evidence A for standardisering and fleksibilitet.";
const evidenceQuoteB = "Live rehearsal evidence B for sammenlignbarhet and lokal tilpasning.";
const candidateSignature = "live_probe_candidate_signature_v2";
const trustedId = "ins_v2_live_probe_trusted";

const trusted = {
  id: trustedId,
  title: "Standardisering, sammenlignbarhet og fleksibilitet",
  summary: "Standardisering kan bevare sammenlignbarhet når fleksibilitet og lokal tilpasning er eksplisitt avgrenset.",
  concepts: [
    { label: "standardisering" },
    { label: "sammenlignbarhet" },
    { label: "fleksibilitet" },
    { label: "lokal tilpasning" }
  ],
  status: "suggested",
  activation_v2: {
    schema: "aha_insight_activation_v2",
    review_id: "review_v2_live_probe_trusted",
    candidate_signature: candidateSignature,
    source_event_id: "source_v2_live_probe",
    source_text_hash: "a".repeat(64),
    type: "principle",
    evidence: [
      { quote: evidenceQuoteA, role: "supports" },
      { quote: evidenceQuoteB, role: "supports" }
    ],
    causal_status: "not_causal",
    gate_metrics: { quality_score: 0.93 },
    production_proof: {
      workflow_run_id: 32369823544,
      production_main: "ed1db452088232146702fabdf9f9543bb9f0d959"
    },
    backend_sync_allowed: false,
    meta_write_allowed: false
  }
};

const weak = {
  id: "legacy_v2_live_probe_weak",
  title: "Standardisering uten V2 trust",
  summary: "Et eldre signal om standardisering og fleksibilitet mangler kvalitet og full provenance.",
  concepts: [{ label: "standardisering" }, { label: "fleksibilitet" }],
  status: "suggested"
};

const chamber = {
  insights: [trusted, weak],
  meta: {},
  _local_updated_at: "2026-08-20T17:10:00.000Z"
};
const controls = {
  saveNewInsights: false,
  useExistingMemory: true,
  lastUpdated: "2026-08-20T17:10:00.000Z"
};

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}
function same(a, b) {
  return JSON.stringify(stable(a)) === JSON.stringify(stable(b));
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function noTrueAuthority(policy) {
  const forbidden = [
    "authoritative_for_chat",
    "current_user_claim_authority",
    "production_gate_authority",
    "activation_authority",
    "chamber_write",
    "canonical_write",
    "meta_write",
    "persistent_write",
    "remote_write",
    "normal_chat_persistence_authority"
  ];
  return forbidden.every((key) => policy?.[key] === false);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();
page.setDefaultTimeout(30000);

const browserDiagnostics = {
  page_errors: [],
  console_errors: [],
  request_failures: [],
  bad_responses: []
};
page.on("pageerror", (error) => browserDiagnostics.page_errors.push({
  name: error.name,
  message: String(error.message || error).slice(0, 2000),
  stack: String(error.stack || "").slice(0, 4000)
}));
page.on("console", (message) => {
  if (message.type() === "error") browserDiagnostics.console_errors.push(message.text().slice(0, 2000));
});
page.on("requestfailed", (request) => browserDiagnostics.request_failures.push({
  method: request.method(),
  url: request.url(),
  failure: request.failure()?.errorText || ""
}));
page.on("response", (response) => {
  if (response.status() >= 400) browserDiagnostics.bad_responses.push({ url: response.url(), status: response.status() });
});

async function seedStorage() {
  await page.evaluate(({ chamber, controls }) => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem("aha_insight_chamber_v1", JSON.stringify(chamber));
    localStorage.setItem("aha_memory_controls_v1", JSON.stringify(controls));
  }, { chamber, controls });
}

async function localStorageSnapshot() {
  return page.evaluate(() => Object.fromEntries(
    Array.from({ length: localStorage.length }, (_, index) => {
      const key = localStorage.key(index);
      return [key, localStorage.getItem(key)];
    }).sort(([a], [b]) => a.localeCompare(b))
  ));
}

async function indexedDbSnapshot() {
  return page.evaluate(async () => {
    if (typeof indexedDB.databases !== "function") return { supported: false, databases: [] };
    const dbs = await indexedDB.databases();
    const output = [];
    for (const info of dbs) {
      if (!info.name) continue;
      const opened = await new Promise((resolve, reject) => {
        const request = indexedDB.open(info.name);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const counts = {};
      for (const storeName of Array.from(opened.objectStoreNames)) {
        counts[storeName] = await new Promise((resolve, reject) => {
          const tx = opened.transaction(storeName, "readonly");
          const request = tx.objectStore(storeName).count();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      }
      opened.close();
      output.push({ name: info.name, version: info.version, counts });
    }
    return { supported: true, databases: output.sort((a, b) => a.name.localeCompare(b.name)) };
  });
}

try {
  // ----- Live migration rehearsal -----
  await page.goto(`${origin}/chat.html?aha_v2_live_seed=${runId}`, { waitUntil: "domcontentloaded" });
  await seedStorage();
  await page.goto(`${origin}/v2-production-migration-rehearsal.html?ahaV2ProductionRehearsal=1&aha_v2_live=${runId}`, {
    waitUntil: "networkidle"
  });
  await page.waitForFunction(() => document.getElementById("gate-status")?.textContent?.includes("READY"));

  const migrationStorageBefore = await localStorageSnapshot();
  const migrationDbBefore = await indexedDbSnapshot();

  await page.click("#preview-btn");
  await page.waitForFunction(() => {
    try {
      return JSON.parse(document.getElementById("preview-output")?.textContent || "{}").status === "review_required";
    } catch {
      return false;
    }
  });
  const preview = await page.evaluate(() => JSON.parse(document.getElementById("preview-output").textContent));
  assert(preview.plan?.trusted_candidate_count >= 1, "migration preview missing trusted candidate");
  assert(preview.plan?.enrichment_candidate_count >= 1, "migration preview missing enrichment candidate");
  assert(preview.plan?.conflict_count === 0, "migration preview contains conflict");
  assert(preview.dry_run?.write_count === 0, "migration dry-run wrote data");

  await page.check("#review-check");
  await page.fill("#confirmation", "RUN_AHA_V2_PRODUCTION_MIGRATION_REHEARSAL");
  await page.click("#rehearse-btn");
  await page.waitForFunction(() => {
    try {
      return JSON.parse(document.getElementById("evidence-output")?.textContent || "{}").status === "verified";
    } catch {
      return false;
    }
  });

  const migration = await page.evaluate(() => JSON.parse(document.getElementById("evidence-output").textContent));
  const migrationStorageAfter = await localStorageSnapshot();
  const migrationDbAfter = await indexedDbSnapshot();

  assert(migration.production_like_target === true, "migration did not use production-like IndexedDB target");
  assert(migration.migration_dry_run_reviewed === true, "migration dry-run was not reviewed");
  assert(migration.staging_apply_rollback_production_proof === true, "migration staging apply/rollback proof failed");
  assert(migration.first_apply?.write_count === migration.plan?.planned_write_count, "first staging apply count mismatch");
  assert(migration.second_apply?.write_count === 0, "second staging apply was not idempotent");
  assert(migration.second_apply?.idempotent === true, "second staging apply idempotence flag missing");
  assert(migration.rollback?.staging_count_after === 0, "rollback did not empty staging");
  assert(migration.rollback?.exact === true, "rollback was not exact");
  assert(same(migrationStorageBefore, migrationStorageAfter), "operator rehearsal changed localStorage/Chamber state");
  assert(!JSON.stringify(migration).includes(evidenceQuoteA), "migration evidence leaked raw insight evidence A");
  assert(!JSON.stringify(migration).includes(evidenceQuoteB), "migration evidence leaked raw insight evidence B");
  assert(!JSON.stringify(migration).includes(candidateSignature), "migration evidence leaked candidate signature");
  const stagingAfter = migrationDbAfter.databases.find((entry) => entry.name === "aha_v2_backfill_staging_v1");
  if (stagingAfter) {
    assert(Object.values(stagingAfter.counts).every((count) => count === 0), "IndexedDB staging contains records after rollback");
  }

  const migrationEvidence = {
    schema: "aha_v2_live_migration_rehearsal_proof_v1",
    version: 1,
    observed_at: new Date().toISOString(),
    workflow_run_id: runId,
    workflow_run_attempt: runAttempt,
    expected_main: expectedMain,
    frontend_origin: origin,
    status: migration.status,
    production_like_target: migration.production_like_target,
    migration_dry_run_reviewed: migration.migration_dry_run_reviewed,
    staging_apply_rollback_production_proof: migration.staging_apply_rollback_production_proof,
    trusted_candidate_count: migration.plan?.trusted_candidate_count || 0,
    enrichment_candidate_count: migration.plan?.enrichment_candidate_count || 0,
    planned_write_count: migration.plan?.planned_write_count || 0,
    first_apply_write_count: migration.first_apply?.write_count || 0,
    second_apply_write_count: migration.second_apply?.write_count || 0,
    second_apply_idempotent: migration.second_apply?.idempotent === true,
    rollback_count: migration.rollback?.rolled_back_count || 0,
    staging_count_after_rollback: migration.rollback?.staging_count_after,
    exact_rollback: migration.rollback?.exact === true,
    chamber_unchanged: true,
    local_storage_unchanged: true,
    staging_database_empty_after_rollback: true,
    raw_insight_text_in_evidence: false,
    raw_candidate_signature_in_evidence: false,
    user_production_data_modified: false,
    representative_fixture_only: true
  };
  fs.writeFileSync(`${outDir}/migration-proof.json`, JSON.stringify(migrationEvidence, null, 2));
  console.log("MIGRATION_PROOF_VERIFIED", JSON.stringify(migrationEvidence));

  // ----- Real deployed Chat bootstrap and canaries -----
  await page.goto(`${origin}/chat.html?aha_v2_live_chat=${runId}`, { waitUntil: "domcontentloaded" });
  await seedStorage();
  await page.reload({ waitUntil: "networkidle" });

  try {
    await page.waitForFunction(() => Boolean(
      window.AHAChat?.buildAhaMemoryContext &&
      window.AHAChat?.askAhaAgent &&
      window.AHAChat?.isAhaSavingEnabled &&
      window.AHAChat?.isAhaMemoryUseEnabled
    ), null, { timeout: 30000 });
  } catch (error) {
    const bootState = await page.evaluate(() => ({
      ready_state: document.readyState,
      AHAChat: Boolean(window.AHAChat),
      AHAChatRuntimeFacade: Boolean(window.AHAChatRuntimeFacade),
      AHAChatApplicationComposition: Boolean(window.AHAChatApplicationComposition),
      AHAChatProviderLoader: Boolean(window.AHAChatProviderLoader),
      AHAChatAgentRuntime: Boolean(window.AHAChatAgentRuntime),
      AHAChatMemoryRuntime: Boolean(window.AHAChatMemoryRuntime),
      chat_exports: window.AHAChat ? Object.keys(window.AHAChat).sort() : []
    }));
    fs.writeFileSync(`${outDir}/chat-boot-failure.json`, JSON.stringify({ bootState, browserDiagnostics }, null, 2));
    throw error;
  }

  const controlsState = await page.evaluate(() => ({
    saving: window.AHAChat.isAhaSavingEnabled(),
    memory: window.AHAChat.isAhaMemoryUseEnabled()
  }));
  assert(controlsState.saving === false, "saveNewInsights is not disabled");
  assert(controlsState.memory === true, "useExistingMemory is not enabled");

  const chatStorageBefore = await localStorageSnapshot();
  const chatDbBefore = await indexedDbSnapshot();
  const capturedChatRequests = [];
  const mutationRequests = [];
  const requestListener = (request) => {
    const method = request.method().toUpperCase();
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
      const entry = { method, url: request.url(), postData: request.postData() || "" };
      mutationRequests.push(entry);
      if (/\/api\/aha-agent\/chat(?:\?|$)/.test(entry.url)) capturedChatRequests.push(entry);
    }
  };
  page.on("request", requestListener);

  const canaryMessages = [
    "Bruk innsikten om standardisering og fleksibilitet: hvordan bør vi balansere sammenlignbarhet og lokal tilpasning?",
    "Bygg videre på innsikten om fleksibilitet og sammenlignbarhet. Hva er viktigst når lokale behov varierer?",
    "Som vi snakket om: hvordan kan standardisering bevare sammenlignbarhet uten å bli rigid?"
  ];
  const canaryResults = [];

  for (let index = 0; index < canaryMessages.length; index += 1) {
    const result = await page.evaluate(async ({ message, trustedId }) => {
      const memoryContext = await window.AHAChat.buildAhaMemoryContext(message, {
        embeddingHealth: { ok: false, status: "not_signed_in", reason: "not_signed_in" }
      });
      if (memoryContext?.used !== true) throw new Error("live_memory_context_not_used");
      if (!(memoryContext.selectedInsights || []).some((entry) => entry.id === trustedId)) {
        throw new Error("live_trusted_memory_not_selected");
      }
      const response = await Promise.race([
        window.AHAChat.askAhaAgent(message, { memoryContext }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("live_chat_timeout")), 60000))
      ]);
      return {
        memory_used: true,
        selected_ids: (memoryContext.selectedInsights || []).map((entry) => entry.id),
        response_received: Boolean(response && typeof response === "object"),
        reply_present: Boolean(String(response?.reply || "").trim())
      };
    }, { message: canaryMessages[index], trustedId });
    canaryResults.push({ sample: index + 1, ...result });
  }

  page.off("request", requestListener);
  assert(capturedChatRequests.length === 3, `expected 3 live chat requests, got ${capturedChatRequests.length}`);

  const requestProofs = capturedChatRequests.map((entry, index) => {
    const body = JSON.parse(entry.postData || "{}");
    const v2 = body.profile?.semantic_context_v2;
    assert(v2?.schema === "aha_v2_chat_readonly_context_v1", `sample ${index + 1} missing V2 context`);
    assert(v2?.mode === "read_only", `sample ${index + 1} V2 mode is not read_only`);
    assert(noTrueAuthority(v2?.policy), `sample ${index + 1} has V2 authority leak`);
    assert(Array.isArray(v2?.insights) && v2.insights.length >= 1, `sample ${index + 1} has no trusted V2 insight`);
    assert(v2.insights.every((insight) => Number(insight.quality_score) >= 0.55), `sample ${index + 1} contains low-quality V2 insight`);
    assert(body.memory_context?.used === true, `sample ${index + 1} lost legacy memory context`);
    assert((body.memory_context?.selectedInsights || []).some((item) => item.id === trustedId), `sample ${index + 1} lost trusted selection`);
    const serializedMemory = JSON.stringify(body.memory_context || {});
    assert(!serializedMemory.includes("activation_v2"), `sample ${index + 1} leaked activation_v2 through memory_context`);
    assert(!entry.postData.includes(evidenceQuoteA), `sample ${index + 1} leaked evidence A`);
    assert(!entry.postData.includes(evidenceQuoteB), `sample ${index + 1} leaked evidence B`);
    assert(!entry.postData.includes(candidateSignature), `sample ${index + 1} leaked candidate signature`);
    return {
      sample: index + 1,
      endpoint: new URL(entry.url).origin + new URL(entry.url).pathname,
      memory_used: true,
      v2_context_used: true,
      v2_insight_count: v2.insights.length,
      min_quality_score: Math.min(...v2.insights.map((insight) => Number(insight.quality_score) || 0)),
      all_authority_flags_false: true,
      raw_trust_payload_in_memory_context: false
    };
  });

  const forbiddenMutations = mutationRequests.filter((entry) => !/\/api\/aha-agent\/chat(?:\?|$)/.test(entry.url));
  assert(forbiddenMutations.length === 0, `unexpected browser write requests: ${JSON.stringify(forbiddenMutations.map(({ method, url }) => ({ method, url })))}`);

  const chatStorageAfter = await localStorageSnapshot();
  const chatDbAfter = await indexedDbSnapshot();
  assert(same(chatStorageBefore, chatStorageAfter), "read-only Chat canaries changed localStorage");
  assert(same(chatDbBefore, chatDbAfter), "read-only Chat canaries changed IndexedDB state");

  const chatEvidence = {
    schema: "aha_v2_live_readonly_chat_proof_v1",
    version: 1,
    observed_at: new Date().toISOString(),
    workflow_run_id: runId,
    workflow_run_attempt: runAttempt,
    expected_main: expectedMain,
    frontend_origin: origin,
    live_readonly_chat_proof: true,
    sample_count: 3,
    samples: requestProofs,
    responses: canaryResults,
    save_new_insights: false,
    use_existing_memory: true,
    no_persistence_write_observed: true,
    no_authority_leak_observed: true,
    local_storage_unchanged: true,
    indexeddb_unchanged: true,
    unexpected_browser_write_request_count: 0,
    raw_activation_payload_in_memory_context: false,
    raw_evidence_in_request: false,
    raw_candidate_signature_in_request: false,
    policy: {
      normal_chat_persistence_open: false,
      automatic_backfill_open: false,
      canonical_write_open: false,
      meta_write_open: false,
      projection_store_write_open: false
    },
    representative_fixture_only: true,
    user_production_data_modified: false
  };
  fs.writeFileSync(`${outDir}/chat-proof.json`, JSON.stringify(chatEvidence, null, 2));
  fs.writeFileSync(`${outDir}/browser-diagnostics.json`, JSON.stringify(browserDiagnostics, null, 2));
  console.log("CHAT_PROOF_VERIFIED", JSON.stringify(chatEvidence));

  const combined = {
    schema: "aha_v2_live_production_evidence_bundle_v1",
    version: 1,
    expected_main: expectedMain,
    workflow_run_id: runId,
    migration: migrationEvidence,
    chat: chatEvidence
  };
  fs.writeFileSync(`${outDir}/combined-proof.json`, JSON.stringify(combined, null, 2));
} finally {
  await browser.close();
}
