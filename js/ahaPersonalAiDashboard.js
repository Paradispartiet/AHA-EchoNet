// AHA Personal AI Dashboard V2 – user-facing status over existing local Personal AI control data.
// Technical controls remain available under the advanced section. No new storage, backend or model calls.
(function (global) {
  "use strict";

  const doc = global.document;
  let lastStatus = null;

  function $(id) { return doc && doc.getElementById(id); }
  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function arr(value) { return Array.isArray(value) ? value : []; }
  function obj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function num(value) { return Number(value) || 0; }
  function api() { return global.AHAPersonalAiControl; }

  function levelLabel(level) {
    const labels = {
      "0_data_needed": "Trenger personlig grunnlag",
      "1_memory_ready": "Personlig minne tilgjengelig",
      "2_training_ready": "Godkjent materiale tilgjengelig",
      "3_retrieval_ready": "Personlig søk klart",
      "4_answer_ready": "Personlig svargrunnlag klart",
      "5_evaluated_loop": "Evaluert svarsløyfe"
    };
    return labels[String(level || "")] || "Status bygges";
  }

  function buildExperienceModel(statusArg) {
    const status = obj(statusArg);
    const modules = obj(status.modules);
    const memory = obj(modules.metaInsightsMemory);
    const corpus = obj(modules.trainingCorpus);
    const examples = obj(modules.trainingExamples);
    const retrieval = obj(modules.personalRetrieval);
    const semantic = obj(modules.semanticRetrieval);
    const personalContext = obj(modules.chatPersonalContext);
    const composer = obj(modules.personalAnswerComposer);
    const evaluation = obj(modules.personalAnswerEvaluation);
    const readiness = obj(modules.personalModelReadiness);
    const audit = obj(modules.personalAiLoopAudit);

    const selfInsights = num(memory.counts?.confirmedClaims) + num(memory.counts?.importantClaims);
    const approvedCorpus = num(corpus.counts?.approved);
    const approvedExamples = num(examples.counts?.approved);
    const lexicalItems = num(retrieval.counts?.indexedItems);
    const semanticItems = num(semantic.counts?.indexedItems);
    const evaluationCount = num(evaluation.counts?.total);
    const averageEvaluation = num(evaluation.counts?.averageScore);

    let retrievalLabel = "Personlig søk er ikke bygget ennå";
    if (semanticItems > 0) retrievalLabel = "Hybrid personlig søk er aktivt";
    else if (lexicalItems > 0) retrievalLabel = "Personlig tekstsøk er aktivt";

    const knowledgeSummary = selfInsights || approvedCorpus || approvedExamples
      ? `${selfInsights} bekreftede/viktige selvinnsikter · ${approvedCorpus} godkjente kunnskapskilder · ${approvedExamples} godkjente eksempler.`
      : "Ingen godkjent personlig kunnskap er tilgjengelig ennå.";

    const answerReady = personalContext.status !== "empty" && composer.available === true;
    const answerSummary = answerReady
      ? `${retrievalLabel}. AHA kan bygge personlig svargrunnlag før et Chat-svar.`
      : `${retrievalLabel}. Personlig svargrunnlag bygges når godkjent kontekst og retrieval er tilgjengelig.`;

    let qualitySummary = "Svar-evaluering er tilgjengelig, men det finnes ingen lagrede evalueringer ennå.";
    if (evaluationCount > 0) {
      qualitySummary = `${evaluationCount} svar er evaluert${averageEvaluation ? ` · gjennomsnitt ${Math.round(averageEvaluation)}/100` : ""}.`;
    }
    if (["working", "strong"].includes(String(audit.status || ""))) {
      qualitySummary += ` Svarsløyfen er auditert${num(audit.score) ? ` (${num(audit.score)}/100)` : ""}.`;
    }

    return {
      knowledge: {
        title: "Hva AHA kan bruke",
        summary: knowledgeSummary,
        selfInsights,
        approvedCorpus,
        approvedExamples
      },
      answering: {
        title: "Hvordan AHA finner personlig grunnlag",
        summary: answerSummary,
        retrievalLabel,
        lexicalItems,
        semanticItems,
        answerReady
      },
      quality: {
        title: "Hvordan svarene kontrolleres",
        summary: qualitySummary,
        evaluationCount,
        averageEvaluation,
        auditStatus: String(audit.status || "empty"),
        auditScore: num(audit.score),
        readinessScore: num(readiness.counts?.score),
        readinessLevel: String(readiness.counts?.level || "")
      }
    };
  }

  function buildUserRecommendations(statusArg) {
    const status = obj(statusArg);
    const model = buildExperienceModel(status);
    const out = [];

    if (!model.knowledge.selfInsights) {
      out.push("Bekreft noen selvinnsikter slik at AHA kan skille trygg personlig kunnskap fra løse hypoteser.");
    }
    if (!model.knowledge.approvedCorpus) {
      out.push("Godkjenn materiale du faktisk vil at AHA skal kunne bruke som personlig kunnskapsgrunnlag.");
    }
    if (!model.answering.lexicalItems && !model.answering.semanticItems) {
      out.push("Bygg personlig søk når du har godkjent materiale, slik at AHA kan finne relevant grunnlag per spørsmål.");
    }
    if (!model.quality.evaluationCount) {
      out.push("Still et spørsmål om et aktivt prosjekt i Chat; AHA evaluerer automatisk hvor tydelig personlig grunnlag faktisk brukes.");
    } else {
      out.push("Se «Personlig grunnlag» under AHA-svarene for å kontrollere hva som ble identifisert som brukt.");
    }
    if (!out.length) {
      out.push("Bruk Chat med et konkret prosjektspørsmål og kontroller «Personlig grunnlag» under svaret.");
    }
    return out.slice(0, 4);
  }

  function renderExperience(status) {
    const host = $("personal-ai-experience");
    if (!host) return;
    const model = buildExperienceModel(status);
    const cards = [model.knowledge, model.answering, model.quality];
    host.innerHTML = cards.map((card) => `
      <article class="aha-panel">
        <h3>${esc(card.title)}</h3>
        <p>${esc(card.summary)}</p>
      </article>`).join("");
  }

  function renderOverall(status) {
    const host = $("personal-ai-overall");
    if (!host) return;
    const next = status.nextAction || {};
    host.innerHTML = `
      <div class="aha-training-stats">
        <div class="aha-mini-stat"><strong>${esc(status.overall.label)}</strong><span>Status</span></div>
        <div class="aha-mini-stat"><strong>${Number(status.overall.score) || 0}/100</strong><span>Modenhet</span></div>
        <div class="aha-mini-stat"><strong>${esc(levelLabel(status.overall.level))}</strong><span>Hva som er klart</span></div>
      </div>
      <p>${esc(status.summary)}</p>
      <p class="module-meta"><strong>Neste handling:</strong> ${esc(next.label)}${next.description ? ` — ${esc(next.description)}` : ""}</p>
      ${next.href ? `<a class="aha-tile-btn aha-tile-btn-primary" href="${esc(next.href)}">${esc(next.label)}</a>` : ""}`;
  }

  function renderModules(status) {
    const host = $("personal-ai-modules");
    if (!host) return;
    const map = [
      "metaInsightsMemory",
      "trainingCorpus",
      "trainingExamples",
      "personalModelReadiness",
      "chatPersonalContext",
      "personalRetrieval",
      "semanticRetrieval",
      "personalAiLoopAudit",
      "personalAnswerComposer",
      "personalAnswerEvaluation"
    ];
    host.innerHTML = map.map((key) => {
      const item = status.modules?.[key] || {};
      const counts = Object.entries(item.counts || {}).slice(0, 4).map(([name, value]) => `${name}: ${value}`).join(" · ");
      return `<article class="aha-panel"><h3>${esc(item.label || key)}</h3><p><strong>${esc(item.status || "unknown")}</strong> · ${Number(item.score) || 0}/100</p><p class="module-meta">${esc(counts || "ingen teller")}</p><p>${esc(arr(item.notes)[0] || "")}</p></article>`;
    }).join("");
  }

  function renderRecommendations(status) {
    const host = $("personal-ai-recommendations");
    if (!host) return;
    host.innerHTML = buildUserRecommendations(status).map((recommendation) => `<li>${esc(recommendation)}</li>`).join("");
  }

  function renderEmpty(status) {
    const host = $("personal-ai-empty");
    if (host) host.hidden = Boolean(status.overall.score > 0);
  }

  function refresh() {
    if (!api()) return;
    lastStatus = api().buildControlStatus();
    renderExperience(lastStatus);
    renderOverall(lastStatus);
    renderModules(lastStatus);
    renderRecommendations(lastStatus);
    renderEmpty(lastStatus);
  }

  function resultCount(value) { return arr(value && value.results).length; }

  function renderTest(result) {
    const host = $("personal-ai-result");
    if (!host) return;
    const sources = arr(result.answerPackage?.context?.selectedSources).slice(0, 6)
      .map((source) => `<li>${esc(source.title)} <small>${esc(source.sourceType || source.source || "")}</small></li>`).join("");
    host.innerHTML = `<h3>Resultat fra full kontrolltest</h3><p><strong>Query:</strong> ${esc(result.query)}</p><div class="aha-training-stats"><div class="aha-mini-stat"><strong>${resultCount(result.retrieval)}</strong><span>Lexical treff</span></div><div class="aha-mini-stat"><strong>${resultCount(result.semanticRetrieval)}</strong><span>Semantic treff</span></div><div class="aha-mini-stat"><strong>${Number(result.answerPackage?.status?.selectedSourceCount) || 0}</strong><span>Valgte kilder</span></div><div class="aha-mini-stat"><strong>${Number(result.answerEvaluation?.score) || 0}/100</strong><span>Evaluering</span></div><div class="aha-mini-stat"><strong>${Number(result.aiLoopAudit?.score) || 0}/100</strong><span>Audit</span></div></div><ul>${sources || "<li>Ingen valgte kilder.</li>"}</ul><p>${esc(result.summary)}</p><details><summary>Tekniske detaljer</summary><pre>${esc(JSON.stringify(result, null, 2)).slice(0, 6000)}</pre></details>`;
  }

  function setMessage(message) {
    const host = $("personal-ai-message");
    if (host) host.textContent = message || "";
  }

  function bind() {
    doc?.addEventListener("click", (event) => {
      const button = event.target;
      if (!(button instanceof global.HTMLElement)) return;
      const action = button.getAttribute("data-personal-ai-action");
      if (!action || !api()) return;

      if (action === "build_retrieval_index") {
        const result = global.AHAPersonalRetrieval?.refreshRetrievalIndex?.();
        setMessage(`Personlig søkeindeks bygget med ${Number(result?.stats?.total) || 0} items.`);
        refresh();
      }
      if (action === "build_semantic_index") {
        const result = global.AHASemanticRetrieval?.refreshSemanticIndex?.();
        setMessage(`Semantisk søkeindeks bygget med ${Number(result?.stats?.total) || 0} items.`);
        refresh();
      }
      if (action === "run_ai_loop_audit") {
        const result = global.AHAPersonalAiLoopAudit?.runAudit?.();
        setMessage(`AI-loop audit: ${result?.status || "ukjent"}, ${Number(result?.score) || 0}/100.`);
        refresh();
      }
      if (action === "test_answer_composer") {
        const result = global.AHAPersonalAnswerComposer?.buildAnswerPackage?.(api().DEFAULT_QUERY);
        setMessage(`Answer Composer: ${result?.status?.intent || "unknown"}, ${Number(result?.status?.selectedSourceCount) || 0} kilder.`);
        refresh();
      }
      if (action === "test_answer_evaluation") {
        const result = api().runFullControlTest();
        renderTest(result);
        setMessage("Answer Evaluation testet via full kontrolltest.");
        refresh();
      }
      if (action === "full_control_test") {
        const result = api().runFullControlTest();
        renderTest(result);
        setMessage("Full kontrolltest fullført.");
        refresh();
      }
    });
  }

  function init() {
    bind();
    refresh();
  }

  const out = {
    init,
    refresh,
    levelLabel,
    buildExperienceModel,
    buildUserRecommendations,
    renderExperience,
    renderOverall,
    renderModules,
    renderRecommendations,
    renderTest
  };
  if (typeof module !== "undefined" && module.exports) module.exports = out;
  global.AHAPersonalAiDashboard = out;
  if (doc) doc.readyState === "loading" ? doc.addEventListener("DOMContentLoaded", init) : init();
})(typeof window !== "undefined" ? window : globalThis);
