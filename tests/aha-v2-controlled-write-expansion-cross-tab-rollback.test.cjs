const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const gateSource = fs.readFileSync("js/ahaV2ControlledWriteExpansionGate.js", "utf8");
const activationSource = fs.readFileSync("js/ahaV2ControlledWriteExpansionActivation.js", "utf8");
const expansionEvidence = JSON.parse(fs.readFileSync("ops/evidence/aha-v2-controlled-write-expansion-gate-current-v1.json", "utf8"));
const oneRecordPilotProof = JSON.parse(fs.readFileSync("ops/evidence/aha-v2-controlled-write-pilot-live-proof-v1.json", "utf8"));
const expansionLiveProof = JSON.parse(fs.readFileSync("ops/evidence/aha-v2-two-record-expansion-live-proof-v1.json", "utf8"));
const scopeContract = JSON.parse(fs.readFileSync("ops/contracts/aha-v2-controlled-write-expansion-scope-two-record-v1.json", "utf8"));

const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));

function loadApi(extra = {}) {
  const context = { console, setTimeout, clearTimeout, ...extra };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(gateSource, context, { filename: "js/ahaV2ControlledWriteExpansionGate.js" });
  vm.runInContext(activationSource, context, { filename: "js/ahaV2ControlledWriteExpansionActivation.js" });
  return context.AHAV2ControlledWriteExpansionActivation;
}

function currentGreenInput(api) {
  return {
    operatorIntent: api.OPERATOR_INTENT,
    expansionEvidence: clone(expansionEvidence),
    oneRecordPilotProof: clone(oneRecordPilotProof),
    expansionLiveProof: clone(expansionLiveProof),
    scopeContract: clone(scopeContract)
  };
}

function makeExclusiveLockManager() {
  let tail = Promise.resolve();
  let active = 0;
  let maxActive = 0;
  const names = [];
  const modes = [];

  return {
    async request(name, options, callback) {
      names.push(name);
      modes.push(options?.mode || null);
      const previous = tail;
      let release;
      tail = new Promise((resolve) => { release = resolve; });
      await previous;
      active += 1;
      maxActive = Math.max(maxActive, active);
      try {
        return await callback({ name, mode: options?.mode || null });
      } finally {
        active -= 1;
        release();
      }
    },
    stats() { return { active, maxActive, names: [...names], modes: [...modes] }; }
  };
}

function makeStaleSnapshotActivationApi(shared) {
  let controllerSequence = 0;
  let activeRawRollbacks = 0;
  let maxConcurrentRawRollbacks = 0;

  return {
    create() {
      controllerSequence += 1;
      const controllerId = controllerSequence;
      const rollbackRequests = new Map();
      let requestSequence = 0;

      return {
        listReviews() { return clone(shared.reviews); },
        prepareRollback({ review_id } = {}) {
          requestSequence += 1;
          const requestId = `raw_${controllerId}_${requestSequence}`;
          rollbackRequests.set(requestId, review_id);
          return { request_id: requestId, review_id };
        },
        async approveRollback({ request_id } = {}) {
          const reviewId = rollbackRequests.get(request_id);
          if (!reviewId) throw new Error("fake_request_missing");
          rollbackRequests.delete(request_id);

          // Deliberately model the stale-snapshot failure described by the
          // review: each controller snapshots shared state before an async gap
          // and then replaces the whole queue from that snapshot.
          const snapshot = clone(shared.reviews);
          activeRawRollbacks += 1;
          maxConcurrentRawRollbacks = Math.max(maxConcurrentRawRollbacks, activeRawRollbacks);
          await new Promise((resolve) => setTimeout(resolve, 12));
          const review = snapshot.find((item) => item.id === reviewId);
          if (!review || review.status !== "canonical_promoted") throw new Error("fake_not_promoted");
          review.status = "rolled_back";
          review.rolled_back_at = `controller-${controllerId}`;
          shared.reviews = snapshot;
          activeRawRollbacks -= 1;
          return clone(review);
        },
        getAudit() { return []; }
      };
    },
    stats() { return { activeRawRollbacks, maxConcurrentRawRollbacks }; }
  };
}

(async () => {
  const api = loadApi();
  assert.equal(expansionEvidence.current_decision, "BOUNDED_EXPANSION_PILOT_ELIGIBLE");
  assert.equal(expansionLiveProof.status, "production_evidence_verified");
  assert.equal(expansionLiveProof.proof_revision, "corrected_v2");
  assert.equal(api.ROLLBACK_LOCK_NAME, "aha-v2-controlled-write-expansion-rollback-v1");
  assert.equal(api.policy().cross_instance_rollback_serialization_required, true);
  assert.equal(api.policy().cross_instance_rollback_serialization, "web_locks_exclusive");

  const shared = {
    reviews: [
      {
        id: "review_1",
        status: "canonical_promoted",
        canonical_insight_id: "insight_1",
        candidate_signature: "1".repeat(64)
      },
      {
        id: "review_2",
        status: "canonical_promoted",
        canonical_insight_id: "insight_2",
        candidate_signature: "2".repeat(64)
      }
    ]
  };
  const lockManager = makeExclusiveLockManager();
  const activationApi = makeStaleSnapshotActivationApi(shared);
  const input = currentGreenInput(api);

  const first = api.create(input, { activationApi, rollbackLockManager: lockManager });
  const second = api.create(input, { activationApi, rollbackLockManager: lockManager });
  const firstRequest = first.prepareRollback({ review_id: "review_1" });
  const secondRequest = second.prepareRollback({ review_id: "review_2" });

  const [firstResult, secondResult] = await Promise.all([
    first.approveRollback({ request_id: firstRequest.request_id, approval: "unused-by-fake-controller" }),
    second.approveRollback({ request_id: secondRequest.request_id, approval: "unused-by-fake-controller" })
  ]);

  assert.equal(firstResult.status, "rolled_back");
  assert.equal(secondResult.status, "rolled_back");
  assert.deepEqual(
    shared.reviews.map((item) => [item.id, item.status]),
    [["review_1", "rolled_back"], ["review_2", "rolled_back"]],
    "serialized second rollback must snapshot the first rollback rather than resurrect it"
  );
  assert.equal(activationApi.stats().maxConcurrentRawRollbacks, 1, "raw rollback controllers must never overlap");
  assert.equal(lockManager.stats().maxActive, 1, "same-origin rollback lock must be exclusive");
  assert.deepEqual(lockManager.stats().names, [api.ROLLBACK_LOCK_NAME, api.ROLLBACK_LOCK_NAME]);
  assert.deepEqual(lockManager.stats().modes, ["exclusive", "exclusive"]);
  assert.equal(first.getStatus().created_record_count, 2, "rollback must not replenish lifetime budget");
  assert.equal(first.getStatus().promoted_review_ids.length, 0);
  assert.deepEqual(first.getStatus().rolled_back_review_ids.sort(), ["review_1", "review_2"]);

  // Production browser contexts must not silently fall back to a per-tab lock.
  const browserApi = loadApi({ document: {} });
  const browserInput = currentGreenInput(browserApi);
  const browserShared = {
    reviews: [{
      id: "review_browser",
      status: "canonical_promoted",
      canonical_insight_id: "insight_browser",
      candidate_signature: "a".repeat(64)
    }]
  };
  const browserController = browserApi.create(browserInput, {
    activationApi: makeStaleSnapshotActivationApi(browserShared)
  });
  const browserRequest = browserController.prepareRollback({ review_id: "review_browser" });
  await assert.rejects(
    () => browserController.approveRollback({ request_id: browserRequest.request_id, approval: "unused" }),
    (error) => error?.code === "expansion_rollback_lock_unavailable"
  );
  assert.equal(browserShared.reviews[0].status, "canonical_promoted", "missing cross-tab lock must fail before mutation");

  assert.match(activationSource, /navigator\?\.locks|global\.navigator\?\.locks/u);
  assert.match(activationSource, /ROLLBACK_LOCK_NAME/u);
  assert.match(activationSource, /mode: "exclusive"/u);

  console.log("aha-v2-controlled-write-expansion-cross-tab-rollback.test.cjs: OK");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
