// ahaInsightExpansionOperatorV2.js
// UI adapter for the exact, production-evidenced two-record V2 expansion.

(function (global) {
  "use strict";

  const SYNTHESIS_PROOF_BASE = "tests/fixtures/semantic-live-reviewed-v2/post-stability-two-round-v1/";
  const EXPANSION_EVIDENCE = "ops/evidence/aha-v2-controlled-write-expansion-gate-current-v1.json";
  const ONE_RECORD_PROOF = "ops/evidence/aha-v2-controlled-write-pilot-live-proof-v1.json";
  const EXPANSION_LIVE_PROOF = "ops/evidence/aha-v2-two-record-expansion-live-proof-v1.json";
  const SCOPE_CONTRACT = "ops/contracts/aha-v2-controlled-write-expansion-scope-two-record-v1.json";
  const OPERATOR_INTENT = "bounded_local_chamber_two_record_candidate_v1";
  const FRAME_URL = "chat.html?ahaSemanticModelShadow=1&ahaInsightSynthesisV2=1";
  const FRAME_SCRIPTS = [
    "js/ahaSemanticInsightQualityGate.js",
    "js/ahaSemanticEvaluationRuntime.js",
    "js/ahaSemanticEvaluationBootstrap.js",
    "js/ahaInsightQualityGateV2.js",
    "js/ahaInsightSynthesisRuntimeV2.js",
    "js/ahaInsightSynthesisBootstrapV2.js",
    "js/ahaInsightActivationV2.js",
    "js/ahaV2ControlledWriteExpansionGate.js",
    "js/ahaV2ControlledWriteExpansionActivation.js"
  ];

  function $(id) { return global.document.getElementById(id); }

  function loadScript(doc, src) {
    return new Promise((resolve, reject) => {
      if ([...doc.scripts].some((script) => script.src.endsWith(src))) return resolve();
      const script = doc.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Kunne ikke laste ${src}`));
      doc.head.appendChild(script);
    });
  }

  async function readJson(path) {
    const response = await global.fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error(`Kunne ikke laste expansion-bevis: ${path}`);
    return response.json();
  }

  function boot() {
    const frame = $("chat-frame");
    const pageStatus = $("page-status");
    const gateStatus = $("gate-status");
    const candidateOutput = $("candidate-output");
    const auditOutput = $("audit-output");
    const approvalPhrase = $("approval-phrase");
    const approvalInput = $("approval-input");
    const candidateIndexInput = $("candidate-index");
    const rollbackSelect = $("rollback-review");
    const prepareReviewButton = $("prepare-review");
    const approveReviewButton = $("approve-review");
    const prepareCanonicalButton = $("prepare-canonical");
    const approveCanonicalButton = $("approve-canonical");
    const prepareRollbackButton = $("prepare-rollback");
    const approveRollbackButton = $("approve-rollback");

    let controller = null;
    let activeRequest = null;
    let activeRequestKind = null;
    let activeReviewId = null;
    let qualityGateEligible = false;
    let eligibleCandidateCount = 0;

    const operatorIntent = new URLSearchParams(global.location.search).get("pilot") || "";
    if (operatorIntent !== OPERATOR_INTENT) {
      pageStatus.textContent = "Expansion lukket: eksplisitt operator-intent mangler.";
      gateStatus.textContent = `Åpne bare kontrollert med ?pilot=${OPERATOR_INTENT}`;
      return;
    }

    function setRequest(request, kind, approveButton) {
      activeRequest = request;
      activeRequestKind = kind;
      approvalPhrase.textContent = request.approval_phrase;
      approvalInput.value = "";
      approvalInput.disabled = false;
      [approveReviewButton, approveCanonicalButton, approveRollbackButton].forEach((button) => { button.disabled = true; });
      approveButton.disabled = false;
      approvalInput.focus();
    }

    function clearRequest() {
      activeRequest = null;
      activeRequestKind = null;
      approvalPhrase.textContent = "Ingen aktiv engangsgodkjenning.";
      approvalInput.value = "";
      approvalInput.disabled = true;
      [approveReviewButton, approveCanonicalButton, approveRollbackButton].forEach((button) => { button.disabled = true; });
    }

    function refreshRollbackSelect(status) {
      const current = rollbackSelect.value;
      rollbackSelect.replaceChildren();
      const ids = Array.isArray(status?.promoted_review_ids) ? status.promoted_review_ids : [];
      if (!ids.length) {
        const option = global.document.createElement("option");
        option.value = "";
        option.textContent = "Ingen aktiv record";
        rollbackSelect.appendChild(option);
        rollbackSelect.disabled = true;
        return;
      }
      ids.forEach((id) => {
        const option = global.document.createElement("option");
        option.value = id;
        option.textContent = id;
        rollbackSelect.appendChild(option);
      });
      rollbackSelect.disabled = !!activeRequest;
      if (ids.includes(current)) rollbackSelect.value = current;
    }

    function refreshControls() {
      if (!controller) {
        [prepareReviewButton, prepareCanonicalButton, prepareRollbackButton].forEach((button) => { button.disabled = true; });
        candidateIndexInput.disabled = true;
        rollbackSelect.disabled = true;
        return null;
      }
      const status = controller.getStatus();
      activeReviewId = status.active_review_id || null;
      candidateIndexInput.disabled = !!activeRequest || !status.may_prepare_review;
      prepareReviewButton.disabled = !(status.may_prepare_review && qualityGateEligible && !activeRequest);
      prepareCanonicalButton.disabled = !(status.may_prepare_canonical && !activeRequest);
      prepareRollbackButton.disabled = !(status.may_prepare_rollback && !activeRequest && status.promoted_review_ids?.length);
      refreshRollbackSelect(status);
      return status;
    }

    function refreshAudit() {
      const status = controller?.getStatus?.();
      const events = controller?.getAudit?.() || [];
      auditOutput.textContent = JSON.stringify({ status, latest_events: events.slice(-12) }, null, 2);
      return status;
    }

    function statusCopy(status) {
      if (!status) return "Expansion-authority er ikke etablert.";
      if (status.created_record_count >= 2) {
        return status.promoted_review_ids?.length
          ? `Lifetime-budsjett brukt: ${status.created_record_count}/2. Ingen ny record kan opprettes; exact rollback er fortsatt tilgjengelig.`
          : `To-record-utvidelsen er ferdig/rullet tilbake. Lifetime-budsjettet er permanent brukt: ${status.created_record_count}/2.`;
      }
      if (status.active_review_id) {
        return `Review ${status.active_review_id} er godkjent. Separat CANONICAL-godkjenning kreves. Brukt budsjett: ${status.created_record_count}/2.`;
      }
      return `Expansion klar for manuell sekvens. Brukt budsjett: ${status.created_record_count}/2; igjen: ${status.remaining_record_budget}.`;
    }

    function reportError(error) {
      pageStatus.textContent = `Stoppet fail-closed: ${error?.code || error?.message || error}`;
      clearRequest();
      try { refreshControls(); } catch {}
      try { refreshAudit(); } catch {}
    }

    frame.addEventListener("load", async () => {
      try {
        const win = frame.contentWindow;
        const doc = win.document;
        win.addEventListener("aha:insight-quality-v2-shadow", (event) => {
          const detail = event?.detail || {};
          eligibleCandidateCount = Number(detail.eligible_count || 0);
          qualityGateEligible = detail.valid === true && eligibleCandidateCount > 0;
          const status = refreshControls();
          gateStatus.textContent = qualityGateEligible
            ? `V2 quality gate grønn: ${eligibleCandidateCount} kandidat(er). ${statusCopy(status)}`
            : `Ingen kvalifisert V2-kandidat. ${statusCopy(status)}`;
        });
        win.addEventListener("aha:insight-activation-v2", () => {
          try {
            const status = refreshControls();
            gateStatus.textContent = statusCopy(status);
          } catch {}
          try { refreshAudit(); } catch {}
        });

        for (const src of FRAME_SCRIPTS) await loadScript(doc, src);

        const [synthesisProvenance, synthesisSummary, expansionEvidence, oneRecordPilotProof, expansionLiveProof, scopeContract] = await Promise.all([
          readJson(`${SYNTHESIS_PROOF_BASE}provenance.json`),
          readJson(`${SYNTHESIS_PROOF_BASE}summary.json`),
          readJson(EXPANSION_EVIDENCE),
          readJson(ONE_RECORD_PROOF),
          readJson(EXPANSION_LIVE_PROOF),
          readJson(SCOPE_CONTRACT)
        ]);

        win.AHA_INSIGHT_ACTIVATION_PROOF_V2 = { provenance: synthesisProvenance, summary: synthesisSummary };
        win.AHAInsightActivationV2.validateProof(win.AHA_INSIGHT_ACTIVATION_PROOF_V2);
        controller = win.AHAV2ControlledWriteExpansionActivation.create({
          operatorIntent,
          expansionEvidence,
          oneRecordPilotProof,
          expansionLiveProof,
          scopeContract
        });

        const status = refreshControls();
        pageStatus.textContent = "12/12 expansion-evidence + permanent live proof er grønt. To-record-authority er etablert for eksakt scope.";
        gateStatus.textContent = `${status.expansion_gate_decision}. ${statusCopy(status)}`;
        frame.classList.add("ready");
        refreshAudit();
      } catch (error) {
        reportError(error);
      }
    });

    frame.src = FRAME_URL;

    prepareReviewButton.addEventListener("click", async () => {
      try {
        const candidateIndex = Number(candidateIndexInput.value || 0);
        const request = await controller.prepareReview({ candidate_index: candidateIndex });
        candidateOutput.textContent = JSON.stringify({
          candidate_index: request.candidate_index,
          candidate: request.candidate,
          gate_metrics: request.gate_metrics,
          candidate_signature: request.candidate_signature
        }, null, 2);
        setRequest(request, "review", approveReviewButton);
        pageStatus.textContent = `Review-kandidat ${candidateIndex} er forberedt. Skriv REVIEW-engangsfrasen nøyaktig.`;
        refreshControls();
      } catch (error) { reportError(error); }
    });

    approveReviewButton.addEventListener("click", async () => {
      try {
        if (activeRequestKind !== "review") throw new Error("operator_review_request_missing");
        const review = await controller.approveReview({ request_id: activeRequest?.request_id, approval: approvalInput.value });
        activeReviewId = review.id;
        clearRequest();
        const status = refreshControls();
        pageStatus.textContent = `Review ${review.id} ligger i separat review-kø. Chamber er fortsatt uendret.`;
        gateStatus.textContent = statusCopy(status);
        refreshAudit();
      } catch (error) { reportError(error); }
    });

    prepareCanonicalButton.addEventListener("click", async () => {
      try {
        const status = controller.getStatus();
        activeReviewId = status.active_review_id || activeReviewId;
        const request = await controller.prepareCanonical({ review_id: activeReviewId });
        setRequest(request, "canonical", approveCanonicalButton);
        pageStatus.textContent = "Neste lokale Chamber-write er forberedt. En separat CANONICAL-engangsgodkjenning kreves.";
        refreshControls();
      } catch (error) { reportError(error); }
    });

    approveCanonicalButton.addEventListener("click", async () => {
      try {
        if (activeRequestKind !== "canonical") throw new Error("operator_canonical_request_missing");
        const result = await controller.approveCanonical({ request_id: activeRequest?.request_id, approval: approvalInput.value });
        clearRequest();
        activeReviewId = null;
        const status = refreshControls();
        pageStatus.textContent = `Lokal Chamber-record opprettet: ${result.insight.id}. Brukt lifetime-budsjett: ${status.created_record_count}/2.`;
        gateStatus.textContent = statusCopy(status);
        refreshAudit();
      } catch (error) { reportError(error); }
    });

    prepareRollbackButton.addEventListener("click", () => {
      try {
        const reviewId = rollbackSelect.value;
        const request = controller.prepareRollback({ review_id: reviewId });
        setRequest(request, "rollback", approveRollbackButton);
        pageStatus.textContent = `Exact rollback for ${reviewId} er forberedt. Bare den signaturbundne recorden kan fjernes.`;
        refreshControls();
      } catch (error) { reportError(error); }
    });

    approveRollbackButton.addEventListener("click", async () => {
      try {
        if (activeRequestKind !== "rollback") throw new Error("operator_rollback_request_missing");
        const review = await controller.approveRollback({ request_id: activeRequest?.request_id, approval: approvalInput.value });
        clearRequest();
        const status = refreshControls();
        pageStatus.textContent = `Record for ${review.id} er rullet tilbake. Lifetime-budsjettet forblir brukt: ${status.created_record_count}/2.`;
        gateStatus.textContent = statusCopy(status);
        refreshAudit();
      } catch (error) { reportError(error); }
    });
  }

  if (global.document?.readyState === "loading") global.document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})(window);
