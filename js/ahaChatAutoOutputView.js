// ahaChatAutoOutputView.js
// Presentasjon av autoanalysen og det kanoniske «AHA ser»-kortet.
//
// Modulen eier bare visningslaget. Analyse, run-binding, lagring og Explorer-
// oppdatering injiseres eksplisitt av ahaChat.js, slik at samme kilde- og
// stale-run-porter fortsatt gjelder. Eksponerer window.AHAChatAutoOutputView.
// Lastes før ahaChat.js.

(function (global) {
  "use strict";

  function create(deps = {}) {
    const required = [
      "enforceCanonicalSourceGrounding", "getActiveAnalysisRun", "artifactMatchesActiveRun",
      "analysisTopicMismatch", "renderAnalysisDebugPanel", "setExportButtonsEnabled",
      "safeMarkupSortItems", "safeMarkupList", "safeMarkupText", "detectTextType",
      "buildHistoryGoSuggestion", "filterCrossDomainAutoPayload", "saveAutoOutputAsAfterwork",
      "setStatusNote", "refreshAhaExplorer", "normalizeConceptKey",
      "detectPublicAdministrationReformSignal", "detectAutoAnalysisDomain",
      "detectLiteraryAttachmentSignal", "filterConceptLabels", "canonicalizeDisplayConcept",
      "detectInstitutionalMediaHistorySignal", "parseLabeledInsightCards",
      "getSongLyricChildCultureSubjectMatches", "getLiterarySubjectMatches"
    ];
    required.forEach((name) => {
      if (typeof deps[name] !== "function") throw new Error(`AHAChatAutoOutputView mangler avhengighet: ${name}`);
    });

    function humanizeTextType(type) {
      const key = String(type || "").trim().toLowerCase();
      const labels = {
        academic_article: "Fagtekst / akademisk tekst",
        day_log: "Dagbokmateriale",
        literary_diary: "Personlig refleksjon / dagbokprosa",
        literary_fragment: "Kreativ tekst",
        opinion_article: "Politisk / argumenterende tekst",
        theory_idea: "Teoritekst",
        project_note: "Prosjektarbeid",
        legal_text: "Juridisk tekst",
        technical_work: "Teknisk arbeid",
        learning_note: "Læringsnotat",
        general: "AHA venter på tekst"
      };
      return labels[key] || "AHA venter på tekst";
    }

    function buildAhaSerCard(payload, sourceText = "") {
      const insights = Array.isArray(payload?.insightCards) ? payload.insightCards : [];
      const sort = Array.isArray(payload?.sortItems) ? payload.sortItems : [];
      const lookup = (needle) => sort.find((item) => deps.normalizeConceptKey(item?.label || "").includes(needle))?.text || "";
      const subjectLinks = (Array.isArray(payload?.subjectMatches) ? payload.subjectMatches : Array.isArray(payload?.subjectLinks) ? payload.subjectLinks : [])
        .map((item) => item?.title || item?.subject_label || item?.subject_id || item?.id).filter(Boolean);
      const theoryLinks = (Array.isArray(payload?.theoryLinks) ? payload.theoryLinks : Array.isArray(payload?.theories) ? payload.theories : [])
        .map((item) => item?.thinker || item?.theory || item?.name || item).filter(Boolean);
      const navSignal = deps.detectPublicAdministrationReformSignal(sourceText || payload?.reflection || "");
      const domain = deps.detectAutoAnalysisDomain(sourceText || "", payload || {});
      const literarySignal = domain === "literary_attachment" ? { strong: true } : deps.detectLiteraryAttachmentSignal(sourceText || payload?.reflection || "");
      const themes = deps.filterConceptLabels(Array.isArray(payload?.keywords) ? payload.keywords : []).map(deps.canonicalizeDisplayConcept).slice(0, 4);
      const institutionalHistorySignal = deps.detectInstitutionalMediaHistorySignal(sourceText || payload?.reflection || "");
      const parsedInsights = deps.parseLabeledInsightCards(insights);
      const explicitAhaSer = payload?.ahaSer && typeof payload.ahaSer === "object" ? payload.ahaSer : null;
      const explicitFagkoblinger = Array.isArray(explicitAhaSer?.fagkoblinger)
        ? explicitAhaSer.fagkoblinger.map((item) => String(item || "").trim()).filter(Boolean)
        : (typeof explicitAhaSer?.fagkoblinger === "string"
          ? String(explicitAhaSer.fagkoblinger).split("·").map((item) => item.trim()).filter(Boolean)
          : []);
      const prioritizedLinks = explicitFagkoblinger.length
        ? explicitFagkoblinger
        : domain === "song_lyric_child_culture"
        ? deps.getSongLyricChildCultureSubjectMatches().map((item) => item?.title || item?.subject_label || "").filter(Boolean)
        : institutionalHistorySignal?.strong
        ? ["Mediehistorie", "Presse og offentlighet", "Eierskap og redaksjonell uavhengighet", "Kulturjournalistikk", "Akademisk offentlighet", "Norsk politisk pressehistorie"]
        : literarySignal?.strong
        ? deps.getLiterarySubjectMatches().map((item) => item?.title || item?.subject_label || "").filter(Boolean)
        : (subjectLinks.length ? subjectLinks : theoryLinks.length ? theoryLinks : (navSignal?.strong ? ["Offentlig forvaltning", "Organisasjonsteori", "Velferdsstat", "Implementeringsteori"] : themes));
      return {
        tema: explicitAhaSer?.tema || (domain === "song_lyric_child_culture" ? "Sang og sanglyrikk i barnekulturen" : (navSignal?.strong ? "NAV-reformen og måloppnåelse" : (literarySignal?.strong ? "Knausgårds Om våren, tilknytningsteori og litterær erkjennelse" : (parsedInsights.tema || lookup("tema") || lookup("hovedargument") || insights[1] || insights[0] || "Tema identifiseres fortløpende.")))),
        hovedspenning: explicitAhaSer?.hovedspenning || (domain === "song_lyric_child_culture" ? "Barnesang som kulturell praksis/kunstform ↔ behov for mer forskning på sjanger, språk, oppdragelse og identitetsdannelse" : (navSignal?.strong ? "Omstillingskostnad vs. strukturell utfordring" : (literarySignal?.strong ? "Tilknytningsteori vs. litterær/mytologisk utforskning av tilknytning, forknytning og løsrivelse" : (parsedInsights.hovedspenning || lookup("spenning") || insights.find((item) => /spenning|vs|mot/i.test(String(item || ""))) || "Spenning bygges fra flere meldinger.")))),
        viktigsteInnsikt: explicitAhaSer?.viktigsteInnsikt || (domain === "song_lyric_child_culture" ? "Teksten viser sanglyrikk som del av barnekultur, barnelitteratur, musikk, språk, ritualer, utdanning og identitetsdannelse." : (navSignal?.strong ? "NAVs manglende måloppnåelse skyldes ikke bare midlertidig omstilling, men også varige strukturelle utfordringer i styring, organisering og stat–kommune-samspill." : (literarySignal?.strong ? "Om våren bruker tilknytningsteori som ramme, men overskrider den gjennom autofiksjon, deiksis, performativ skriving, sårbarhet, nymaterialisme og mytologiske bilder." : (parsedInsights.viktigsteInnsikt || lookup("hovedinnsikt") || insights[0] || payload?.reflection || "Hovedinnsikten vises her når AHA har nok materiale.")))),
        fagkoblinger: prioritizedLinks.length ? prioritizedLinks.slice(0, 8).join(" · ") : "Fagkoblinger blir tydeligere når flere tekster analyseres.",
        nesteSteg: explicitAhaSer?.nesteSteg || (domain === "song_lyric_child_culture" ? "Undersøk konkrete tekstbelegg for hvordan sanglyrikk fungerer i barnekultur, læring, ritualer og identitetsdannelse." : (navSignal?.strong ? "Undersøk hvordan statlig styring, kommunale mål og lokal organisering påvirker arbeidsrettet oppfølging." : (literarySignal?.strong ? "Skill mellom hva Bowlbys tilknytningsteori forklarer, og hva romanens litterære form og materialistiske/mytologiske perspektiver tilfører." : (payload?.thoughts?.neste_steg || (Array.isArray(payload?.path) ? payload.path[0] : "") || "Velg ett konkret neste steg i teksten.")))),
        kortSvar: explicitAhaSer?.kortSvar || (domain === "song_lyric_child_culture" ? "Teksten handler om barnesang og sanglyrikk som barnekultur, barnelitteratur, musikk, språk og oppdragelse." : lookup("kort hovedinnsikt") || payload?.reflection || insights[0] || "AHA analyserer teksten fortløpende.")
      };
    }

    function renderAutoOutputPayload(payload) {
      const host = global.document.getElementById("aha-auto-output");
      if (!host || !payload) return;
      payload = deps.enforceCanonicalSourceGrounding(payload, host.dataset.sourceText || "");
      const activeRun = deps.getActiveAnalysisRun();
      if (activeRun && !deps.artifactMatchesActiveRun(payload, activeRun)) {
        global.console.warn(`Skipped stale AHA analysis payload: expected ${activeRun.analysisRunId || activeRun.runId || activeRun.sourceHash}, got ${payload.analysisRunId || payload.runId || payload.sourceHash || payload.sourceTextHash || "unknown"}.`);
        host.innerHTML = '<div class="auto-output-head"><h2>AHA etterarbeid</h2><p>Venter på etterarbeid for aktiv analyse.</p></div>' + deps.renderAnalysisDebugPanel(payload);
        deps.setExportButtonsEnabled(false);
        return;
      }
      if (deps.analysisTopicMismatch(payload, activeRun)) {
        host.innerHTML = '<div class="auto-output-head"><h2>AHA etterarbeid</h2><p>Analyseobjektet matcher ikke aktiv tekst. Kjør analysen på nytt.</p></div>' + deps.renderAnalysisDebugPanel(payload);
        deps.setExportButtonsEnabled(false);
        return;
      }
      const safeSortItems = deps.safeMarkupSortItems(payload.sortItems);
      const safeList = deps.safeMarkupList(payload.list);
      const safeInsightCards = deps.safeMarkupList(payload.insightCards);
      const safePath = deps.safeMarkupList(payload.path);
      const textTypeLabel = String(payload.contentType || "").trim() || humanizeTextType(payload.textType || deps.detectTextType(host.dataset.sourceText || ""));
      const ahaSer = buildAhaSerCard(payload, host.dataset.sourceText || "");
      const historyGoSuggestion = deps.buildHistoryGoSuggestion(payload, host.dataset.sourceText || "");
      host.innerHTML = `
        <div class="auto-output-head">
          <h2>AHA etterarbeid</h2>
          <p>Automatisk analyse av siste melding og svar.</p>
        </div>
        <section class="auto-output-group auto-output-primary" data-group="aha-ser">
          <h3>AHA ser</h3>
          <article class="auto-card auto-card-primary" data-auto-card="aha_ser">
            <dl class="aha-ser-list">
              <div><dt>Innholdstype</dt><dd>${deps.safeMarkupText(textTypeLabel)}</dd></div>
              <div><dt>Tema</dt><dd>${deps.safeMarkupText(ahaSer.tema)}</dd></div>
              <div><dt>Hovedspenning</dt><dd>${deps.safeMarkupText(ahaSer.hovedspenning)}</dd></div>
              <div><dt>Viktigste innsikt</dt><dd>${deps.safeMarkupText(ahaSer.viktigsteInnsikt)}</dd></div>
              <div><dt>Fagkoblinger</dt><dd>${deps.safeMarkupText(ahaSer.fagkoblinger)}</dd></div>
              <div><dt>Neste steg</dt><dd>${deps.safeMarkupText(ahaSer.nesteSteg)}</dd></div>
            </dl>
          </article>
        </section>
        <section class="auto-output-group" data-group="samtale">
          <h3>Samtale</h3>
          <div class="auto-output-grid">
            <article class="auto-card" data-auto-card="oppsummer"><h4>Oppsummer · Hva sier teksten?</h4><p>${deps.safeMarkupText(ahaSer.kortSvar)}</p></article>
            <article class="auto-card" data-auto-card="lag_innsikt"><h4>Lag innsikt · Hovedpoeng som kan lagres</h4><p>${deps.safeMarkupText(ahaSer.viktigsteInnsikt)}</p></article>
            <article class="auto-card" data-auto-card="reflekter"><h4>Reflekter · Betydning, spenning, kritikk</h4><p>${deps.safeMarkupText(payload.reflection)}</p></article>
            <article class="auto-card" data-auto-card="sorter"><h4>Sorter · Struktur videre</h4><ul>${safeSortItems.map((item)=>`<li><strong>${item.label}:</strong> ${item.text}</li>`).join("")}</ul></article>
            <article class="auto-card" data-auto-card="lag_laringssti"><h4>Lag læringssti · Neste progresjon</h4><ol>${safePath.map((step)=>`<li>${step}</li>`).join("")}</ol></article>
            <article class="auto-card" data-auto-card="oppsummer_dagen"><h4>Oppsummer dagen min</h4><p>${deps.safeMarkupText(payload.day)}</p></article>
            <article class="auto-card" data-auto-card="sorter_tanker"><h4>Sorter tankene mine</h4><p><strong>Hovedspor:</strong> ${deps.safeMarkupText(payload?.thoughts?.hovedspor)}</p><p><strong>Løse tanker:</strong> ${deps.safeMarkupText(payload?.thoughts?.lose_tanker)}</p><p><strong>Mulig neste steg:</strong> ${deps.safeMarkupText(payload?.thoughts?.neste_steg)}</p></article>
            ${historyGoSuggestion}
          </div>
        </section>
        <section class="auto-output-group" data-group="struktur">
          <h3>Mer / full analyse</h3>
          <div class="auto-output-grid">
            <article class="auto-card" data-auto-card="lag_liste"><h4>Liste</h4><ul>${safeList.map((point)=>`<li>${point}</li>`).join("")}</ul></article>
            <article class="auto-card" data-auto-card="innsikt_liste"><h4>Viktigste innsikter</h4><ul>${safeInsightCards.map((point)=>`<li>${point}</li>`).join("")}</ul></article>
          </div>
        </section>
        <div class="auto-output-actions">
          <button id="btn-save-afterwork" type="button">Lagre etterarbeid</button><p class="auto-output-save-status" id="auto-output-save-status"></p>
        </div>
        ${deps.renderAnalysisDebugPanel(payload)}`;

      const saveButton = host.querySelector("#btn-save-afterwork");
      if (saveButton) {
        const sourceText = String(host.dataset.sourceText || "").trim();
        const statusEl = host.querySelector("#auto-output-save-status");
        if (!sourceText) {
          saveButton.disabled = true;
          if (statusEl) statusEl.textContent = "Kildetekst mangler. Analyser teksten på nytt for å kunne lagre etterarbeid.";
        }
        saveButton.addEventListener("click", () => {
          const filteredPayload = deps.filterCrossDomainAutoPayload(payload, host.dataset.sourceText || "");
          const result = deps.saveAutoOutputAsAfterwork(filteredPayload, host.dataset.sourceText || "", { subjectMatches: payload?.subjectMatches });
          if (result.reason === "missing_source_text") {
            deps.setStatusNote("Kan ikke lagre: kildetekst mangler. Send teksten på nytt.");
            if (statusEl) statusEl.textContent = "Kildetekst mangler. Analyser teksten på nytt.";
            return;
          }
          if (result.saved) {
            saveButton.textContent = "Lagret";
            saveButton.disabled = true;
          }
          if (statusEl) statusEl.textContent = result.saved ? "Etterarbeid lagret." : "Dette etterarbeidet er allerede lagret.";
          deps.setStatusNote(result.saved ? "Etterarbeid lagret" : "Dette etterarbeidet er allerede lagret");
          deps.refreshAhaExplorer();
        });
      }
      deps.refreshAhaExplorer();
    }

    return { humanizeTextType, buildAhaSerCard, renderAutoOutputPayload };
  }

  function createRuntime(deps = {}) {
    const required = [
      "getActiveAnalysisRun", "sourceHash", "buildAutoOutputs", "detectTextType", "short",
      "buildAutoOutputFallbackPayload", "getUrlDominanceInfo", "buildArticleSourceTextFromAnalysis",
      "detectAutoAnalysisDomain", "normalizeSubjectMatches", "subjectMatchesFromCalibration",
      "getLiterarySubjectMatches", "getLiteraryAttachmentLearningPath", "isSportsArticleAnalysis",
      "applyRuntimeKnowledgePolicy", "filterCrossDomainAutoPayload", "enforceCanonicalSourceGrounding",
      "buildCanonicalAnalysis", "resolveCanonicalAnalysisWithOptionalPythonEngine", "isActiveAnalysisRun",
      "bindAnalysisArtifact", "renderAutoOutputPayload", "setExportButtonsEnabled", "loadAutoOutputs",
      "setActiveAnalysisRun", "takeKeywords", "refreshAhaExplorer"
    ];
    required.forEach((name) => {
      if (typeof deps[name] !== "function") throw new Error(`AHAChatAutoOutputRuntime mangler avhengighet: ${name}`);
    });
    if (!deps.runtimeKnowledgePolicy || typeof deps.runtimeKnowledgePolicy !== "object") {
      throw new Error("AHAChatAutoOutputRuntime mangler avhengighet: runtimeKnowledgePolicy");
    }

    async function renderAutoOutputs(userText, ahaReply, options = {}) {
      const sourceText = String(userText || "");
      const host = global.document.getElementById("aha-auto-output");
      if (!sourceText.trim()) {
        if (host) {
          const run = options.analysisRun || deps.getActiveAnalysisRun() || {};
          host.dataset.sourceText = sourceText;
          host.dataset.analysisId = run.analysisId || "";
          host.dataset.runId = run.runId || "";
          host.dataset.sourceId = run.sourceId || "";
          host.dataset.sourceTextHash = deps.sourceHash(sourceText);
          host.dataset.sourceTextPreview = sourceText.replace(/\s+/g, " ").slice(0, 180);
        }
        return;
      }
      let payload;
      try {
        payload = deps.buildAutoOutputs(userText, ahaReply);
      } catch (err) {
        global.console.warn("buildAutoOutputs feilet; bruker fallback-payload", {
          error: err?.message || String(err),
          stack: err?.stack || "",
          textType: deps.detectTextType(sourceText),
          sourcePreview: deps.short(sourceText, 220)
        });
        payload = deps.buildAutoOutputFallbackPayload(userText, ahaReply, options);
      }
      const linkInfo = deps.getUrlDominanceInfo(sourceText);
      const articleAnalysis = linkInfo.isSourceAction ? (payload.articleAnalysis || global.AHALinkReader?.getLatestArticleAnalysis?.()) : null;
      const effectiveSourceText = articleAnalysis ? deps.buildArticleSourceTextFromAnalysis(articleAnalysis) : sourceText;
      const domain = deps.detectAutoAnalysisDomain(effectiveSourceText, payload);
      const primarySubjectMatches = deps.normalizeSubjectMatches(Array.isArray(options.subjectMatches) ? options.subjectMatches : []);
      payload.subjectMatches = primarySubjectMatches;
      if (!articleAnalysis && !primarySubjectMatches.length && global.AHACalibration?.matchText) {
        try {
          const calibrated = global.AHACalibration.matchText(sourceText, { topN: 10 });
          const calibratedMatches = deps.subjectMatchesFromCalibration(calibrated);
          if (calibratedMatches.length) payload.subjectMatches = calibratedMatches;
        } catch (err) {
          global.console.warn("AHACalibration.matchText feilet", err);
        }
      }
      if (domain === "literary_attachment") {
        payload.subjectMatches = deps.getLiterarySubjectMatches();
        payload.subjectLinks = deps.getLiterarySubjectMatches();
        payload.path = deps.getLiteraryAttachmentLearningPath();
      }
      if (articleAnalysis && deps.isSportsArticleAnalysis(articleAnalysis)) {
        payload.subjectMatches = payload.subjectMatches || [];
        payload.subjectLinks = payload.subjectMatches;
        payload.theoryLinks = [];
        if (payload.ahaSer) payload.ahaSer.fagkoblinger = ["Sport", "Fotball", "Turneringsspill", "Prestasjon", "Psykologi/press", "Medier/sportsjournalistikk"].filter((item) => (articleAnalysis.concepts || []).join(" ").toLowerCase().includes(item.toLowerCase().split("/")[0]) || ["Sport", "Fotball", "Turneringsspill", "Prestasjon", "Psykologi/press", "Medier/sportsjournalistikk"].includes(item));
      }
      payload = (!deps.runtimeKnowledgePolicy.legacyArticleTemplatesEnabled && deps.detectTextType(effectiveSourceText) === "academic_article")
        ? deps.applyRuntimeKnowledgePolicy(payload, effectiveSourceText)
        : deps.filterCrossDomainAutoPayload(payload, effectiveSourceText);
      payload = deps.enforceCanonicalSourceGrounding(payload, effectiveSourceText);
      const jsCanonicalAnalysis = deps.buildCanonicalAnalysis(payload, effectiveSourceText);
      const resolvedCanonical = await deps.resolveCanonicalAnalysisWithOptionalPythonEngine({
        message: effectiveSourceText,
        assistantReply: ahaReply,
        historyGoContext: { subjectMatches: payload.subjectMatches || [] },
        fallbackAnalysis: jsCanonicalAnalysis
      });
      const activeRun = options.analysisRun || deps.getActiveAnalysisRun();
      if (!deps.isActiveAnalysisRun(activeRun)) return;
      payload.canonicalAnalysis = resolvedCanonical.analysis;
      payload.canonicalAnalysisMeta = resolvedCanonical.meta;
      payload = deps.enforceCanonicalSourceGrounding(payload, effectiveSourceText);
      deps.bindAnalysisArtifact(payload, activeRun);
      if (payload.canonicalAnalysis && typeof payload.canonicalAnalysis === "object") deps.bindAnalysisArtifact(payload.canonicalAnalysis, activeRun);
      if (options.persist !== false) {
        global.localStorage.setItem(deps.storageKey, JSON.stringify({
          activeRun: activeRun || null,
          payload,
          sourceText,
          analysisId: payload.analysisId || "",
          analysisRunId: payload.analysisRunId || payload.runId || "",
          runId: payload.runId || payload.analysisRunId || "",
          conversationId: payload.conversationId || payload.sessionId || deps.defaultConversationId,
          turnId: payload.turnId || "",
          sourceId: payload.sourceId || "",
          sourceKind: payload.sourceKind || (linkInfo.isSourceAction ? "url" : "pasted_text"),
          sessionId: payload.sessionId || payload.conversationId || deps.defaultConversationId,
          sourceHash: payload.sourceHash || deps.sourceHash(sourceText),
          sourceFingerprint: payload.sourceFingerprint || deps.sourceHash(sourceText),
          sourceTextHash: deps.sourceHash(sourceText),
          sourceTextPreview: sourceText.replace(/\s+/g, " ").slice(0, 180),
          createdAt: new Date().toISOString()
        }));
      }
      if (host) {
        host.dataset.sourceText = sourceText;
        host.dataset.analysisId = payload.analysisId || "";
        host.dataset.analysisRunId = payload.analysisRunId || payload.runId || "";
        host.dataset.runId = payload.runId || payload.analysisRunId || "";
        host.dataset.sourceId = payload.sourceId || "";
        host.dataset.sourceTextHash = deps.sourceHash(sourceText);
        host.dataset.sourceTextPreview = sourceText.replace(/\s+/g, " ").slice(0, 180);
      }
      deps.renderAutoOutputPayload(payload);
      deps.setExportButtonsEnabled(true);
    }

    function focusAutoCard(action) {
      const host = global.document.getElementById("aha-auto-output");
      if (!host) return;
      host.querySelectorAll(".auto-card").forEach((card) => card.classList.remove("is-focused"));
      const target = host.querySelector(`[data-auto-card="${action}"]`);
      if (!target) return;
      target.classList.add("is-focused");
      target.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function restoreAutoOutputFromStorage() {
      const cache = deps.loadAutoOutputs();
      deps.setExportButtonsEnabled(Boolean(cache?.payload));
      if (!cache) {
        deps.refreshAhaExplorer();
        return;
      }
      const payload = cache?.payload && typeof cache.payload === "object" ? cache.payload : cache;
      const sourceText = String(cache?.sourceText || "");
      const cachedRun = {
        analysisId: cache.analysisId || payload.analysisId || `analysis_${cache.sourceTextHash || deps.sourceHash(sourceText)}`,
        analysisRunId: cache.analysisRunId || cache.runId || payload.analysisRunId || payload.runId || "restored",
        runId: cache.runId || cache.analysisRunId || payload.runId || payload.analysisRunId || "restored",
        conversationId: cache.conversationId || cache.sessionId || payload.conversationId || payload.sessionId || deps.defaultConversationId,
        turnId: cache.turnId || payload.turnId || "",
        sourceId: cache.sourceId || payload.sourceId || `source_${cache.sourceTextHash || deps.sourceHash(sourceText)}`,
        sourceKind: cache.sourceKind || payload.sourceKind || "chat",
        topicLabel: cache.topicLabel || payload.topicLabel || deps.takeKeywords(sourceText, 4).join(" · "),
        sessionId: cache.sessionId || cache.conversationId || payload.sessionId || payload.conversationId || deps.defaultConversationId,
        createdAt: cache.createdAt || payload.createdAt || new Date().toISOString(),
        sourceHash: cache.sourceHash || cache.sourceTextHash || deps.sourceHash(sourceText),
        sourceFingerprint: cache.sourceFingerprint || cache.sourceTextHash || deps.sourceHash(sourceText)
      };
      deps.setActiveAnalysisRun(cachedRun);
      deps.bindAnalysisArtifact(payload, cachedRun);
      const host = global.document.getElementById("aha-auto-output");
      if (host) {
        host.dataset.sourceText = sourceText;
        host.dataset.analysisId = payload.analysisId || "";
        host.dataset.analysisRunId = payload.analysisRunId || payload.runId || "";
        host.dataset.runId = payload.runId || payload.analysisRunId || "";
        host.dataset.sourceId = payload.sourceId || "";
        host.dataset.sourceTextHash = deps.sourceHash(sourceText);
        host.dataset.sourceTextPreview = sourceText.replace(/\s+/g, " ").slice(0, 180);
      }
      deps.renderAutoOutputPayload(payload);
      deps.setExportButtonsEnabled(true);
    }

    return { renderAutoOutputs, focusAutoCard, restoreAutoOutputFromStorage };
  }

  const publicApi = Object.assign({}, global.AHAChatAutoOutputView || {}, { create, createRuntime });
  global.AHAChatAutoOutputView = publicApi;
  global.AHAModuleApi?.register?.("chat.autoOutputView", publicApi, { version: 1, legacyGlobal: "AHAChatAutoOutputView", exports: Object.keys(publicApi) });
})(window);
