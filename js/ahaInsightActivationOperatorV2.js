// ahaInsightActivationOperatorV2.js
// UI adapter for the dedicated Insight Synthesis V2 activation operator page.

(function (global) {
  "use strict";

  const PROOF_BASE = "tests/fixtures/semantic-live-reviewed-v2/post-stability-two-round-v1/";
  const FRAME_SCRIPTS = [
    "js/ahaSemanticInsightQualityGate.js",
    "js/ahaSemanticEvaluationRuntime.js",
    "js/ahaSemanticEvaluationBootstrap.js",
    "js/ahaInsightQualityGateV2.js",
    "js/ahaInsightSynthesisRuntimeV2.js",
    "js/ahaInsightSynthesisBootstrapV2.js",
    "js/ahaInsightActivationV2.js"
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
    if (!response.ok) throw new Error(`Kunne ikke laste aktiveringsbevis: ${path}`);
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

    function refreshAudit() {
      const status = controller?.getStatus?.();
      const events = controller?.getAudit?.() || [];
      auditOutput.textContent = JSON.stringify({ status, latest_events: events.slice(-8) }, null, 2);
    }

    function reportError(error) {
      pageStatus.textContent = `Stoppet fail-closed: ${error?.code || error?.message || error}`;
      clearRequest();
      refreshAudit();
    }

    frame.addEventListener("load", async () => {
      try {
        const win = frame.contentWindow;
        const doc = win.document;
        win.addEventListener("aha:insight-quality-v2-shadow", (event) => {
          const detail = event?.detail || {};
          const eligible = Number(detail.eligible_count || 0);
          gateStatus.textContent = detail.valid === true && eligible > 0
            ? `Klar for kontrollert review: ${eligible} kandidat(er)`
            : "Ingen kvalifisert V2-kandidat";
          prepareReviewButton.disabled = !(detail.valid === true && eligible > 0);
        });
        win.addEventListener("aha:insight-activation-v2", refreshAudit);
        for (const src of FRAME_SCRIPTS) await loadScript(doc, src);
        const [provenance, summary] = await Promise.all([
          readJson(`${PROOF_BASE}provenance.json`),
          readJson(`${PROOF_BASE}summary.json`)
        ]);
        win.AHA_INSIGHT_ACTIVATION_PROOF_V2 = { provenance, summary };
        win.AHAInsightActivationV2.validateProof(win.AHA_INSIGHT_ACTIVATION_PROOF_V2);
        controller = win.AHAInsightActivationV2.create();
        win.AHAInsightActivationV2Controller = controller;
        pageStatus.textContent = "Aktiveringsgrense klar — ingen write skjer uten to separate godkjenninger";
        frame.classList.add("ready");
        refreshAudit();
      } catch (error) {
        reportError(error);
      }
    });

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
        prepareReviewButton.disabled = true;
        prepareCanonicalButton.disabled = false;
        pageStatus.textContent = "Kandidaten ligger i separat review-kø. Chamber er fortsatt uendret.";
        refreshAudit();
      } catch (error) { reportError(error); }
    });

    prepareCanonicalButton.addEventListener("click", async () => {
      try {
        const request = await controller.prepareCanonical({ review_id: activeReviewId });
        setRequest(request, approveCanonicalButton);
        pageStatus.textContent = "Begrenset Chamber-write forberedt. En ny, separat godkjenning kreves.";
      } catch (error) { reportError(error); }
    });

    approveCanonicalButton.addEventListener("click", async () => {
      try {
        const result = await controller.approveCanonical({ request_id: activeRequest?.request_id, approval: approvalInput.value });
        clearRequest();
        prepareCanonicalButton.disabled = true;
        prepareRollbackButton.disabled = false;
        pageStatus.textContent = `Én lokal Chamber-innsikt opprettet: ${result.insight.id}. Backend-sync og Meta er fortsatt stengt.`;
        refreshAudit();
      } catch (error) { reportError(error); }
    });

    prepareRollbackButton.addEventListener("click", () => {
      try {
        const request = controller.prepareRollback({ review_id: activeReviewId });
        setRequest(request, approveRollbackButton);
        pageStatus.textContent = "Presis rollback forberedt. Bare den signerte V2-innsikten kan fjernes.";
      } catch (error) { reportError(error); }
    });

    approveRollbackButton.addEventListener("click", async () => {
      try {
        await controller.approveRollback({ request_id: activeRequest?.request_id, approval: approvalInput.value });
        clearRequest();
        prepareRollbackButton.disabled = true;
        pageStatus.textContent = "Den signerte V2-innsikten er rullet tilbake. Andre Chamber-data er urørt.";
        refreshAudit();
      } catch (error) { reportError(error); }
    });
  }

  if (global.document?.readyState === "loading") global.document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})(window);
