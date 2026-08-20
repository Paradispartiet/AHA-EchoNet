// ahaInsightActivationOperatorV2.js
// UI adapter for the dedicated, production-gated Insight V2 controlled write pilot.

(function (global) {
  "use strict";

  const SYNTHESIS_PROOF_BASE = "tests/fixtures/semantic-live-reviewed-v2/post-stability-two-round-v1/";
  const ROLLBACK_PROOF_BASE = "tests/fixtures/semantic-live-reviewed-v2/controlled-activation-production-v1/";
  const PRODUCTION_EVIDENCE = "ops/evidence/aha-v2-production-write-gate-current-v1.json";
  const OPERATOR_INTENT = "single_local_chamber_insight_v1";
  const FRAME_URL = "chat.html?ahaSemanticModelShadow=1&ahaInsightSynthesisV2=1";
  const FRAME_SCRIPTS = [
    "js/ahaSemanticInsightQualityGate.js",
    "js/ahaSemanticEvaluationRuntime.js",
    "js/ahaSemanticEvaluationBootstrap.js",
    "js/ahaInsightQualityGateV2.js",
    "js/ahaInsightSynthesisRuntimeV2.js",
    "js/ahaInsightSynthesisBootstrapV2.js",
    "js/ahaInsightActivationV2.js",
    "js/ahaV2ProductionWriteGate.js",
    "js/ahaV2ControlledWritePilotRollback.js",
    "js/ahaV2ControlledWritePilotActivation.js"
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
    if (!response.ok) throw new Error(`Kunne ikke laste pilotbevis: ${path}`);
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
    const prepareReviewButton = $("prepare-review");
    const approveReviewButton = $("approve-review");
    const prepareCanonicalButton = $("prepare-canonical");
    const approveCanonicalButton = $("approve-canonical");
    const prepareRollbackButton = $("prepare-rollback");
    const approveRollbackButton = $("approve-rollback");
    let controller = null;
    let activeRequest = null;
    let activeReviewId = null;
    let qualityGateEligible = false;

    const operatorIntent = new URLSearchParams(global.location.search).get("pilot") || "";
    if (operatorIntent !== OPERATOR_INTENT) {
      pageStatus.textContent = "Pilot lukket: eksplisitt operator-intent mangler.";
      gateStatus.textContent = `Åpne bare kontrollert med ?pilot=${OPERATOR_INTENT}`;
      return;
    }

    function setRequest(request, approveButton) {
      activeRequest = request;
      approvalPhrase.textContent = request.approval_phrase;
      approvalInput.value = "";
      approvalInput.disabled = false;
      [approveReviewButton, approveCanonicalButton, approveRollbackButton].forEach((button) => { button.disabled = true; });
      approveButton.disabled = false;
      approvalInput.focus();
    }

    function clearRequest() {
      activeRequest = null;
      approvalPhrase.textContent = "Ingen aktiv engangsgodkjenning.";
      approvalInput.value = "";
      approvalInput.disabled = true;
      [approveReviewButton, approveCanonicalButton, approveRollbackButton].forEach((button) => { button.disabled = true; });
    }

    function refreshControls() {
      if (!controller) {
        [prepareReviewButton, prepareCanonicalButton, prepareRollbackButton].forEach((button) => { button.disabled = true; });
        return null;
      }
      const status = controller.getStatus();
      activeReviewId = status.review_id || activeReviewId;
      prepareReviewButton.disabled = !(status.may_prepare_review && qualityGateEligible && !activeRequest);
      prepareCanonicalButton.disabled = !(status.may_prepare_canonical && !activeRequest);
      prepareRollbackButton.disabled = !(status.may_prepare_rollback && !activeRequest);
      return status;
    }

    function refreshAudit() {
      const status = controller?.getStatus?.();
      const events = controller?.getAudit?.() || [];
      auditOutput.textContent = JSON.stringify({ status, latest_events: events.slice(-10) }, null, 2);
      return status;
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
          const eligible = Number(detail.eligible_count || 0);
          qualityGateEligible = detail.valid === true && eligible > 0;
          const pilotStatus = refreshControls();
          if (pilotStatus?.created_record_count >= 1) {
            gateStatus.textContent = pilotStatus.phase === "canonical_promoted"
              ? "Pilotens ene record er opprettet. Bare exact rollback er tillatt nå."
              : "Pilot fullført: record-budsjettet er brukt og åpnes ikke igjen etter rollback.";
          } else {
            gateStatus.textContent = qualityGateEligible
              ? `V2 quality gate grønn: ${eligible} kandidat(er); pilot-authority ${pilotStatus?.production_gate_decision || "ukjent"}`
              : "Ingen kvalifisert V2-kandidat";
          }
        });
        win.addEventListener("aha:insight-activation-v2", () => {
          try { refreshControls(); } catch {}
          try { refreshAudit(); } catch {}
        });
        for (const src of FRAME_SCRIPTS) await loadScript(doc, src);

        const [synthesisProvenance, synthesisSummary, productionEvidence, rollbackProof, rollbackProvenance] = await Promise.all([
          readJson(`${SYNTHESIS_PROOF_BASE}provenance.json`),
          readJson(`${SYNTHESIS_PROOF_BASE}summary.json`),
          readJson(PRODUCTION_EVIDENCE),
          readJson(`${ROLLBACK_PROOF_BASE}proof.json`),
          readJson(`${ROLLBACK_PROOF_BASE}provenance.json`)
        ]);

        win.AHA_INSIGHT_ACTIVATION_PROOF_V2 = { provenance: synthesisProvenance, summary: synthesisSummary };
        win.AHAInsightActivationV2.validateProof(win.AHA_INSIGHT_ACTIVATION_PROOF_V2);
        controller = win.AHAV2ControlledWritePilotActivation.create({
          operatorIntent,
          productionEvidence,
          rollbackProof,
          rollbackProvenance
        });

        const status = refreshControls();
        activeReviewId = status.review_id || null;
        pageStatus.textContent = status.phase === "rolled_back_complete"
          ? "Kontrollert pilot fullført og rullet tilbake. Record-budsjettet er permanent brukt."
          : status.phase === "canonical_promoted"
            ? "Én lokal Chamber-record er aktiv. Bare exact rollback er tillatt."
            : status.phase === "review_committed"
              ? "Review er godkjent. Én separat canonical-godkjenning kan nå opprette pilotens eneste lokale Chamber-record."
              : "12/12 production gate + rollback-proof grønn. Pilot klar for én manuelt godkjent lokal Chamber-record.";
        gateStatus.textContent = `Production gate: ${status.production_gate_decision}; rollback: ${status.rollback_status}; created=${status.created_record_count}/1`;
        frame.classList.add("ready");
        refreshAudit();
      } catch (error) {
        reportError(error);
      }
    });

    // The iframe starts at about:blank in HTML. Only exact operator intent may
    // navigate it to Chat, and the load handler is installed before navigation.
    frame.src = FRAME_URL;

    prepareReviewButton.addEventListener("click", async () => {
      try {
        const request = await controller.prepareReview({ candidate_index: 0 });
        candidateOutput.textContent = JSON.stringify({
          candidate: request.candidate,
          gate_metrics: request.gate_metrics,
          candidate_signature: request.candidate_signature
        }, null, 2);
        setRequest(request, approveReviewButton);
        pageStatus.textContent = "Review-kandidat forberedt. Skriv engangsfrasen nøyaktig.";
      } catch (error) { reportError(error); }
    });

    approveReviewButton.addEventListener("click", async () => {
      try {
        const review = await controller.approveReview({ request_id: activeRequest?.request_id, approval: approvalInput.value });
        activeReviewId = review.id;
        clearRequest();
        refreshControls();
        pageStatus.textContent = "Kandidaten ligger i separat review-kø. Chamber er fortsatt uendret.";
        refreshAudit();
      } catch (error) { reportError(error); }
    });

    prepareCanonicalButton.addEventListener("click", async () => {
      try {
        const request = await controller.prepareCanonical({ review_id: activeReviewId });
        setRequest(request, approveCanonicalButton);
        pageStatus.textContent = "Pilotens eneste Chamber-write er forberedt. En ny, separat engangsgodkjenning kreves.";
      } catch (error) { reportError(error); }
    });

    approveCanonicalButton.addEventListener("click", async () => {
      try {
        const result = await controller.approveCanonical({ request_id: activeRequest?.request_id, approval: approvalInput.value });
        clearRequest();
        refreshControls();
        pageStatus.textContent = `Pilotens ene lokale Chamber-innsikt er opprettet: ${result.insight.id}. Backend-sync, Meta, remote writes og normal Chat-persistens er fortsatt stengt.`;
        refreshAudit();
      } catch (error) { reportError(error); }
    });

    prepareRollbackButton.addEventListener("click", () => {
      try {
        const request = controller.prepareRollback({ review_id: activeReviewId });
        setRequest(request, approveRollbackButton);
        pageStatus.textContent = "Exact rollback er forberedt. Bare den signerte pilot-recorden kan fjernes.";
      } catch (error) { reportError(error); }
    });

    approveRollbackButton.addEventListener("click", async () => {
      try {
        await controller.approveRollback({ request_id: activeRequest?.request_id, approval: approvalInput.value });
        clearRequest();
        refreshControls();
        pageStatus.textContent = "Pilot-recorden er rullet tilbake. Andre Chamber-data er urørt, og record-budsjettet forblir brukt.";
        refreshAudit();
      } catch (error) { reportError(error); }
    });
  }

  if (global.document?.readyState === "loading") global.document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})(window);
