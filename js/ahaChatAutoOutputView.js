// ahaChatAutoOutputView.js
// Presentasjon av autoanalysen, det kanoniske «AHA ser»-kortet og den
// versjonerte lokale auto-output-cachen.
//
// Analyse, run-binding og Explorer-oppdatering injiseres eksplisitt av
// ahaChat.js, slik at samme kilde- og stale-run-porter fortsatt gjelder.
// Eksponerer window.AHAChatAutoOutputView og window.AHAChatAutoOutputStore.
// Lastes før ahaChat.js.

(function (global) {
  "use strict";

  const AUTO_OUTPUT_STORAGE_KEY = "aha_chat_auto_outputs_v1";

  function displayText(value) {
    if (value == null) return "";
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
    if (Array.isArray(value)) return value.map(displayText).filter(Boolean).join(" · ");
    if (typeof value !== "object") return "";
    const keys = ["text", "title", "label", "summary", "insight", "name", "theme", "subject_label", "subject_id", "id"];
    for (const key of keys) {
      const candidate = value[key];
      if (typeof candidate === "string" || typeof candidate === "number") return String(candidate);
    }
    return "";
  }

  function uniqueText(values) {
    const seen = new Set();
    return (Array.isArray(values) ? values : []).map((value) => displayText(value).replace(/\s+/g, " ").trim()).filter((value) => {
      const key = value.toLowerCase().replace(/[.!?;,:\s]+$/u, "");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function harmonizeAnalysisPayload(payload, sourceText = "") {
    const safe = payload && typeof payload === "object" ? payload : {};
    const canonical = safe.canonicalAnalysis && typeof safe.canonicalAnalysis === "object"
      ? safe.canonicalAnalysis
      : null;
    if (!canonical?.theme || !canonical?.keyInsight) return safe;

    const theme = displayText(canonical.theme).trim();
    const tension = displayText(canonical.mainTension).trim();
    const insight = displayText(canonical.keyInsight).trim();
    const fields = uniqueText(canonical.fieldConnections).slice(0, 6);
    const actions = uniqueText(canonical.suggestedActions).slice(0, 3);
    const sourceItems = [];
    const seenSourceItems = new Set();
    (Array.isArray(safe.sortItems) ? safe.sortItems : []).forEach((item) => {
      const text = String(item?.text || "").replace(/\s+/g, " ").trim();
      const key = text.toLowerCase().replace(/[.!?;,:\s]+$/u, "");
      if (!text || seenSourceItems.has(key)) return;
      seenSourceItems.add(key);
      sourceItems.push({ ...item, text });
    });

    const path = uniqueText([
      theme ? `Avgrens hovedtemaet: ${theme}.` : "",
      tension ? `Undersøk hovedspenningen: ${tension}.` : "",
      ...actions,
      fields.length ? `Koble kildebelegget til ${fields.slice(0, 3).join(", ")} og marker hva kilden ikke avgjør.` : ""
    ]).slice(0, 5);
    const firstAction = actions[0] || path[0] || "Velg ett kildebundet neste steg.";
    const summary = theme ? `Temaet er ${theme}.` : insight;
    const reflection = tension
      ? `Den viktigste prøven på tolkningen er om kildebelegget faktisk belyser hovedspenningen «${tension}». ${actions[1] || firstAction}`
      : `Den viktigste prøven på tolkningen er om kildebelegget støtter hovedinnsikten. ${firstAction}`;

    const harmonized = {
      ...safe,
      reflection,
      sortItems: sourceItems.length ? sourceItems : safe.sortItems,
      list: uniqueText(Array.isArray(safe.list) ? safe.list : []).slice(0, 6),
      path: path.length ? path : safe.path,
      thoughts: {
        ...(safe.thoughts && typeof safe.thoughts === "object" ? safe.thoughts : {}),
        hovedspor: theme,
        lose_tanker: tension || "Skill mellom kildebelegg, tolkning og åpne spørsmål.",
        neste_steg: firstAction
      },
      ahaSer: {
        ...(safe.ahaSer && typeof safe.ahaSer === "object" ? safe.ahaSer : {}),
        innholdstype: String(canonical.contentType || safe.textType || "").trim(),
        tema: theme,
        hovedspenning: tension || "Ingen tydelig hovedspenning identifisert ennå.",
        viktigsteInnsikt: insight,
        fagkoblinger: fields,
        nesteSteg: firstAction,
        kortSvar: summary
      },
      qualityProfile: {
        version: "aha_visible_analysis_quality_v1",
        sourceBound: Boolean(String(sourceText || "").trim()),
        distinctSourceItems: sourceItems.length,
        specificPathSteps: path.length,
        canonicalFieldsUsed: ["theme", "mainTension", "keyInsight", "fieldConnections", "suggestedActions"]
          .filter((key) => Array.isArray(canonical[key]) ? canonical[key].length : Boolean(canonical[key]))
      }
    };
    const evaluator = global.AHAAnalysisQualityEvaluator;
    if (evaluator && typeof evaluator.evaluateAnalysis === "function") {
      harmonized.analysisQuality = evaluator.evaluateAnalysis(harmonized, sourceText);
    }
    return harmonized;
  }

  function finalizeAnalysisQuality(payload, sourceText = "") {
    const safe = payload && typeof payload === "object" ? payload : {};
    const evaluator = global.AHAAnalysisQualityEvaluator;
    if (!evaluator?.evaluateAnalysis || !evaluator?.improveAnalysisOnce) return safe;
    const profileApi = global.AHAAnalysisQualityProfile;
    const profile = profileApi?.buildProfile?.({
      domain: safe?.canonicalAnalysis?.domain || safe?.canonicalAnalysis?.contentType || safe?.textType,
      cache: { payload: safe, sourceHash: safe.sourceHash, sourceTextHash: safe.sourceTextHash }
    }) || null;
    const thresholds = profileApi?.adjustedThresholds?.(profile) || {};
    const revision = evaluator.improveAnalysisOnce(safe, sourceText, { profile, thresholds });
    const finalPayload = revision.payload && typeof revision.payload === "object" ? revision.payload : safe;
    const report = evaluator.evaluateAnalysis(finalPayload, sourceText, { thresholds });
    const payloadBound = finalPayload?.source_binding?.valid === true;
    const canonicalBound = !finalPayload?.canonicalAnalysis || finalPayload?.canonicalAnalysis?.source_binding?.valid === true;
    const ahaSerBound = !finalPayload?.ahaSer || finalPayload?.ahaSer?.source_binding?.valid === true;
    const isolationStatus = payloadBound && canonicalBound && ahaSerBound ? "verified" : "unknown";
    const effectiveStatus = report.status === "passed" && isolationStatus !== "verified" ? "needs_review" : report.status;
    finalPayload.analysisQuality = {
      ...report,
      status: effectiveStatus,
      analysisIsolation: {
        status: isolationStatus,
        isolated: isolationStatus === "verified",
        reason: isolationStatus === "verified" ? "explicit_source_and_run_identity_match" : "source_or_run_identity_unverified"
      },
      revision: {
        attempted: revision.attempted,
        improved: revision.improved,
        attempts: revision.attempted ? 1 : 0,
        initialOverall: revision.initialReport?.overall ?? report.overall,
        finalOverall: report.overall
      }
    };
    finalPayload.analysisQualityProfile = profile ? {
      version: profile.version,
      domain: profile.domain,
      sampleSize: profile.sampleSize,
      scope: profile.scope,
      recommendations: profile.recommendations,
      adaptive: profile.adaptive,
      boundary: profile.boundary
    } : null;
    finalPayload.qualityGate = {
      version: "aha_visible_analysis_quality_gate_v1",
      status: revision.needsMoreSource ? "needs_more_source" : effectiveStatus === "passed" ? (revision.attempted ? "improved" : "passed") : "needs_review",
      attempts: revision.attempted ? 1 : 0,
      suppressClaims: revision.needsMoreSource,
      message: revision.needsMoreSource
        ? "AHA trenger mer konkret kildetekst før den kan vise en trygg analyse. Legg til hvem eller hva teksten gjelder, ett konkret eksempel og relevant sammenheng."
        : revision.improved
          ? "AHA forbedret analysen én gang etter kvalitetskontrollen."
          : isolationStatus !== "verified"
            ? "Analysen kan ikke passere før kilde- og run-isoleringen er eksplisitt verifisert."
          : revision.attempted
            ? "AHA forsøkte én forbedring, men analysen bør fortsatt leses med forbehold."
            : "Analysen bestod kvalitetskontrollen."
    };
    return finalPayload;
  }

  function createStore(deps = {}) {
    if (typeof deps.sourceHash !== "function") {
      throw new Error("AHAChatAutoOutputStore mangler avhengighet: sourceHash");
    }
    const storage = deps.storage || global.localStorage;
    const storageKey = deps.storageKey || AUTO_OUTPUT_STORAGE_KEY;
    const defaultConversationId = deps.defaultConversationId || "default_thread";
    const now = typeof deps.now === "function" ? deps.now : () => new Date().toISOString();
    const analysisBundleV2 = deps.analysisBundleV2 || null;

    function load() {
      try {
        const raw = storage?.getItem?.(storageKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return null;
        // Bakoverkompatibilitet: gammel cache var ren payload.
        if (parsed.payload && typeof parsed.payload === "object") {
          if (analysisBundleV2?.hydrate) {
            if (parsed.payload.analysisBundleV2) {
              const bundle = analysisBundleV2.hydrate(parsed.payload.analysisBundleV2);
              if (!bundle) return null;
              parsed.payload.analysisBundleV2 = bundle;
            } else {
              parsed.legacy_analysis_bundle_missing = true;
            }
          }
          return parsed;
        }
        return { payload: parsed };
      } catch {
        return null;
      }
    }

    function save(input = {}) {
      const payload = input.payload;
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
      const sourceText = String(input.sourceText || "");
      const activeRun = input.activeRun && typeof input.activeRun === "object" ? input.activeRun : null;
      const fingerprint = deps.sourceHash(sourceText);
      const payloadHash = String(payload.source_sha256 || payload.sourceSha256 || payload.sourceTextHash || payload.sourceHash || "").trim();
      const payloadRunId = String(payload.analysisRunId || payload.runId || "").trim();
      if (!fingerprint || payloadHash !== fingerprint || !payloadRunId || payload.source_binding?.valid !== true) return null;
      if (analysisBundleV2?.hydrate) {
        const bundle = analysisBundleV2.hydrate(payload.analysisBundleV2);
        if (
          !bundle
          || bundle.identity.source_sha256 !== fingerprint
          || bundle.identity.analysis_run_id !== payloadRunId
          || bundle.identity.analysis_id !== String(payload.analysisId || "").trim()
          || bundle.identity.source_id !== String(payload.sourceId || "").trim()
        ) return null;
        payload.analysisBundleV2 = bundle;
      }
      const cache = {
        activeRun,
        payload,
        sourceText,
        analysisId: payload.analysisId || "",
        analysisRunId: payload.analysisRunId || payload.runId || "",
        runId: payload.runId || payload.analysisRunId || "",
        conversationId: payload.conversationId || payload.sessionId || defaultConversationId,
        turnId: payload.turnId || "",
        sourceId: payload.sourceId || "",
        sourceKind: payload.sourceKind || input.sourceKind || "pasted_text",
        sessionId: payload.sessionId || payload.conversationId || defaultConversationId,
        sourceHash: fingerprint,
        sourceSha256: fingerprint,
        source_sha256: fingerprint,
        sourceHashAlgorithm: "sha256",
        sourceFingerprint: fingerprint,
        sourceTextHash: fingerprint,
        sourceTextPreview: sourceText.replace(/\s+/g, " ").slice(0, 180),
        createdAt: now()
      };
      try {
        if (typeof storage?.setItem !== "function") return null;
        storage.setItem(storageKey, JSON.stringify(cache));
        return cache;
      } catch {
        return null;
      }
    }

    function clear() {
      try {
        if (typeof storage?.removeItem !== "function") return false;
        storage.removeItem(storageKey);
        return true;
      } catch {
        return false;
      }
    }

    return Object.freeze({ load, save, clear });
  }

  function create(deps = {}) {
    const required = [
      "enforceCanonicalSourceGrounding", "getActiveAnalysisRun", "artifactMatchesActiveRun",
      "analysisTopicMismatch", "renderAnalysisDebugPanel", "setExportButtonsEnabled",
      "escHtml", "cleanArticleText", "detectTextType", "saveAutoOutputAsAfterwork",
      "setStatusNote", "refreshAhaExplorer", "updateAnalysisRun", "normalizeConceptKey",
      "detectPublicAdministrationReformSignal", "detectAutoAnalysisDomain",
      "detectLiteraryAttachmentSignal", "filterConceptLabels", "canonicalizeDisplayConcept",
      "detectInstitutionalMediaHistorySignal", "parseLabeledInsightCards",
      "getSongLyricChildCultureSubjectMatches", "getLiterarySubjectMatches",
      "getLiteraryAttachmentLearningPath"
    ];
    required.forEach((name) => {
      if (typeof deps[name] !== "function") throw new Error(`AHAChatAutoOutputView mangler avhengighet: ${name}`);
    });

    function safeMarkupText(value) {
      return deps.escHtml(deps.cleanArticleText(displayText(value)).replace(/\s+/g, " ").trim());
    }

    function safeMarkupList(values) {
      return (Array.isArray(values) ? values : []).map((item) => safeMarkupText(item));
    }

    function safeMarkupSortItems(items) {
      return (Array.isArray(items) ? items : []).map((item) => ({
        label: safeMarkupText(item?.label),
        text: safeMarkupText(item?.text)
      }));
    }

    function buildClaimEvidenceMarkup(payload) {
      const claims = (Array.isArray(payload?.analysisQuality?.claims) ? payload.analysisQuality.claims : [])
        .filter((claim) => claim?.kind === "interpretation");
      if (!claims.length) return "";
      return `<details class="aha-claim-evidence"><summary>Belegg, tolkning og usikkerhet</summary><div class="aha-claim-evidence-list">
        ${claims.map((claim) => `<article class="aha-claim-evidence-item">
          <h5>${safeMarkupText(claim.label)}</h5>
          <p><strong>Tolkning:</strong> ${safeMarkupText(claim.text)}</p>
          <p><strong>Kildebelegg:</strong> ${claim.evidenceText ? `«${safeMarkupText(claim.evidenceText)}»` : "Mangler direkte kildebelegg."}</p>
          <p><strong>Usikkerhet:</strong> ${safeMarkupText(claim.uncertainty || "Tolkningen må prøves mot kilden.")}</p>
        </article>`).join("")}
      </div></details>`;
    }

    function buildHistoryGoSuggestion(payload, sourceText) {
      const source = String(sourceText || "");
      const text = `${source} ${(Array.isArray(payload?.insightCards) ? payload.insightCards.map(displayText).join(" ") : "")}`.toLowerCase();
      const navSignal = deps.detectPublicAdministrationReformSignal(source || text);
      const literarySignal = deps.detectLiteraryAttachmentSignal(source || text);
      if (navSignal?.strong) {
        return `<article class="auto-card" data-auto-card="historygo">
          <h4>History Go-kobling funnet</h4>
          <p><strong>Tema:</strong> Offentlig forvaltning</p>
          <p><strong>Mulig History Go-kategori:</strong> politikk — Politikk & samfunn</p>
          <p><strong>Kan brukes til:</strong> quizspørsmål · leksikonoppføring · læringssti · begrepskort · fagkobling</p>
        </article>`;
      }
      if (literarySignal?.strong) {
        return `<article class="auto-card" data-auto-card="historygo">
          <h4>History Go-kobling funnet</h4>
          <p><strong>Tema:</strong> Litteratur og psykologi</p>
          <p><strong>Mulig History Go-kategori:</strong> litteratur — Litteratur</p>
          <p><strong>Kan brukes til:</strong> forfatterkort · verk-leksikon · begrepskort · litteraturquiz · fagkobling mellom psykologi og litteratur</p>
        </article>`;
      }
      return "";
    }

    function filterCrossDomainAutoPayload(payload, sourceText) {
      const safe = payload && typeof payload === "object" ? payload : {};
      const src = String(sourceText || "").toLowerCase();
      const domain = deps.detectAutoAnalysisDomain(src, safe);
      if (domain !== "literary_attachment") return safe;
      const blocked = /(sahel|mali|klima som konfliktforklaring|klimaforklaring|knapphetsskolen|ressursknapphet|miljøsikkerhet|politisk økologi|environmental security|climate conflict|makt- og produksjonsforhold)/i;
      const filterArray = (arr) => (Array.isArray(arr) ? arr.filter((item) => !blocked.test(typeof item === "string" ? item : `${item?.label || ""} ${item?.text || ""} ${item?.title || ""} ${item?.summary || ""}`)) : []);
      return {
        ...safe,
        reflection: blocked.test(String(safe.reflection || "")) ? "" : String(safe.reflection || ""),
        sortItems: filterArray(safe.sortItems),
        list: filterArray(safe.list),
        insightCards: filterArray(safe.insightCards),
        path: deps.getLiteraryAttachmentLearningPath(),
        keywords: filterArray(safe.keywords),
        subjectMatches: deps.getLiterarySubjectMatches(),
        subjectLinks: deps.getLiterarySubjectMatches(),
        theoryLinks: filterArray(safe.theoryLinks),
        thoughts: {
          hovedspor: blocked.test(String(safe?.thoughts?.hovedspor || "")) ? "" : String(safe?.thoughts?.hovedspor || ""),
          lose_tanker: blocked.test(String(safe?.thoughts?.lose_tanker || "")) ? "" : String(safe?.thoughts?.lose_tanker || ""),
          neste_steg: blocked.test(String(safe?.thoughts?.neste_steg || "")) ? "" : String(safe?.thoughts?.neste_steg || "")
        }
      };
    }

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
        ? explicitAhaSer.fagkoblinger.map((item) => displayText(item).trim()).filter(Boolean)
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
      const bundleView = deps.analysisBundleV2?.toLegacyView?.(payload.analysisBundleV2);
      if (bundleView) {
        payload = Object.assign({}, payload, bundleView, {
          summary: bundleView.afterwork?.summary || "",
          reflection: bundleView.afterwork?.reflection || "",
          thoughts: bundleView.afterwork?.thoughts || {},
          analysisBundleV2: bundleView.analysisBundleV2
        });
      }
      const activeRun = deps.getActiveAnalysisRun();
      if (activeRun && !deps.artifactMatchesActiveRun(payload, activeRun)) {
        global.console.warn(`Skipped stale AHA analysis payload: expected ${activeRun.analysisRunId || activeRun.runId || activeRun.sourceHash}, got ${payload.analysisRunId || payload.runId || payload.sourceHash || payload.sourceTextHash || "unknown"}.`);
        host.innerHTML = '<div class="auto-output-head"><h2>AHA etterarbeid</h2><p>Venter på etterarbeid for aktiv analyse.</p></div>' + deps.renderAnalysisDebugPanel(payload);
        deps.setExportButtonsEnabled(false);
        return;
      }
      if (deps.analysisTopicMismatch(payload, activeRun, host.dataset.sourceText || "")) {
        host.innerHTML = '<div class="auto-output-head"><h2>AHA etterarbeid</h2><p>Analyseobjektet matcher ikke aktiv tekst. Kjør analysen på nytt.</p></div>' + deps.renderAnalysisDebugPanel(payload);
        deps.setExportButtonsEnabled(false);
        return;
      }
      if (payload?.qualityGate?.suppressClaims === true) {
        host.innerHTML = `<div class="auto-output-head"><h2>AHA etterarbeid</h2><p>Automatisk analyse av siste melding og svar.</p></div>
          <section class="auto-output-group auto-output-primary" data-group="quality-gate">
            <h3>AHA trenger mer grunnlag</h3>
            <article class="auto-card auto-card-primary"><p>${safeMarkupText(payload.qualityGate.message)}</p><p><strong>Ingen analysepåstander er lagret eller vist som kvalitetssikret.</strong></p></article>
          </section>${deps.renderAnalysisDebugPanel(payload)}`;
        deps.setExportButtonsEnabled(false);
        deps.refreshAhaExplorer();
        return;
      }
      const safeSortItems = safeMarkupSortItems(payload.sortItems);
      const safeList = safeMarkupList(payload.list);
      const safeInsightCards = safeMarkupList(payload.insightCards);
      const safePath = safeMarkupList(payload.path);
      const textTypeLabel = String(payload.contentType || "").trim() || humanizeTextType(payload.textType || deps.detectTextType(host.dataset.sourceText || ""));
      const ahaSer = buildAhaSerCard(payload, host.dataset.sourceText || "");
      deps.updateAnalysisRun({
        sourceText: host.dataset.sourceText || "",
        canonicalAnalysis: payload?.canonicalAnalysis,
        ahaSer,
        concepts: payload?.concepts || payload?.keywords,
        subjectMatches: payload?.subjectMatches || payload?.subjectLinks,
        analysisBundleV2: payload?.analysisBundleV2 || null,
        rawAutoPayload: payload
      }, activeRun);
      const historyGoSuggestion = buildHistoryGoSuggestion(payload, host.dataset.sourceText || "");
      host.innerHTML = `
        <div class="auto-output-head">
          <h2>AHA etterarbeid</h2>
          <p>Automatisk analyse av siste melding og svar.</p>
        </div>
        <section class="auto-output-group auto-output-primary" data-group="aha-ser">
          <h3>AHA ser</h3>
          <article class="auto-card auto-card-primary" data-auto-card="aha_ser">
            <dl class="aha-ser-list">
              <div><dt>Innholdstype</dt><dd>${safeMarkupText(textTypeLabel)}</dd></div>
              <div><dt>Tema</dt><dd>${safeMarkupText(ahaSer.tema)}</dd></div>
              <div><dt>Hovedspenning</dt><dd>${safeMarkupText(ahaSer.hovedspenning)}</dd></div>
              <div><dt>Viktigste innsikt</dt><dd>${safeMarkupText(ahaSer.viktigsteInnsikt)}</dd></div>
              <div><dt>Fagkoblinger</dt><dd>${safeMarkupText(ahaSer.fagkoblinger)}</dd></div>
              <div><dt>Neste steg</dt><dd>${safeMarkupText(ahaSer.nesteSteg)}</dd></div>
            </dl>
            ${buildClaimEvidenceMarkup(payload)}
          </article>
        </section>
        <section class="auto-output-group" data-group="samtale">
          <h3>Samtale</h3>
          <div class="auto-output-grid">
            <article class="auto-card" data-auto-card="oppsummer"><h4>Oppsummer · Hva sier teksten?</h4><p>${safeMarkupText(ahaSer.kortSvar)}</p></article>
            <article class="auto-card" data-auto-card="lag_innsikt"><h4>Lag innsikt · Hovedpoeng som kan lagres</h4><p>${safeMarkupText(ahaSer.viktigsteInnsikt)}</p></article>
            <article class="auto-card" data-auto-card="reflekter"><h4>Reflekter · Betydning, spenning, kritikk</h4><p>${safeMarkupText(payload.reflection)}</p></article>
            <article class="auto-card" data-auto-card="sorter"><h4>Sorter · Struktur videre</h4><ul>${safeSortItems.map((item)=>`<li><strong>${item.label}:</strong> ${item.text}</li>`).join("")}</ul></article>
            <article class="auto-card" data-auto-card="lag_laringssti"><h4>Lag læringssti · Neste progresjon</h4><ol>${safePath.map((step)=>`<li>${step}</li>`).join("")}</ol></article>
            <article class="auto-card" data-auto-card="oppsummer_dagen"><h4>Oppsummer dagen min</h4><p>${safeMarkupText(payload.day)}</p></article>
            <article class="auto-card" data-auto-card="sorter_tanker"><h4>Sorter tankene mine</h4><p><strong>Hovedspor:</strong> ${safeMarkupText(payload?.thoughts?.hovedspor)}</p><p><strong>Løse tanker:</strong> ${safeMarkupText(payload?.thoughts?.lose_tanker)}</p><p><strong>Mulig neste steg:</strong> ${safeMarkupText(payload?.thoughts?.neste_steg)}</p></article>
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
          const filteredPayload = filterCrossDomainAutoPayload(payload, host.dataset.sourceText || "");
          const result = deps.saveAutoOutputAsAfterwork(filteredPayload, host.dataset.sourceText || "", { subjectMatches: payload?.subjectMatches });
          if (result?.entry) deps.updateAnalysisRun({ afterwork: result.entry }, activeRun);
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

    return Object.freeze({
      humanizeTextType,
      buildAhaSerCard,
      renderAutoOutputPayload,
      safeMarkupText,
      safeMarkupList,
      safeMarkupSortItems,
      buildHistoryGoSuggestion,
      filterCrossDomainAutoPayload,
      buildClaimEvidenceMarkup
    });
  }

  function createRuntime(deps = {}) {
    const required = [
      "getActiveAnalysisRun", "sourceHash", "buildAutoOutputs", "detectTextType", "short",
      "buildAutoOutputFallbackPayload", "getUrlDominanceInfo", "buildArticleSourceTextFromAnalysis",
      "detectAutoAnalysisDomain", "normalizeSubjectMatches", "subjectMatchesFromCalibration",
      "getLiterarySubjectMatches", "getLiteraryAttachmentLearningPath", "isSportsArticleAnalysis",
      "applyRuntimeKnowledgePolicy", "filterCrossDomainAutoPayload", "enforceCanonicalSourceGrounding",
      "buildCanonicalAnalysis", "resolveCanonicalAnalysisWithOptionalPythonEngine", "isActiveAnalysisRun",
      "bindAnalysisArtifact", "artifactMatchesActiveRun", "renderAutoOutputPayload", "setExportButtonsEnabled", "loadAutoOutputs", "saveAutoOutputs",
      "setActiveAnalysisRun", "updateAnalysisRun", "takeKeywords", "refreshAhaExplorer"
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
      payload = harmonizeAnalysisPayload(payload, effectiveSourceText);
      payload = deps.enforceCanonicalSourceGrounding(payload, effectiveSourceText);
      deps.bindAnalysisArtifact(payload, activeRun, "rawAutoPayload", { producer: "current_analysis_run" });
      if (payload.canonicalAnalysis && typeof payload.canonicalAnalysis === "object") {
        deps.bindAnalysisArtifact(payload.canonicalAnalysis, activeRun, "canonicalAnalysis", { producer: "current_analysis_run" });
      }
      if (payload.ahaSer && typeof payload.ahaSer === "object") {
        deps.bindAnalysisArtifact(payload.ahaSer, activeRun, "ahaSer", { producer: "current_analysis_run" });
      }
      payload = finalizeAnalysisQuality(payload, effectiveSourceText);
      deps.bindAnalysisArtifact(payload, activeRun, "rawAutoPayload");
      if (payload.canonicalAnalysis && typeof payload.canonicalAnalysis === "object") deps.bindAnalysisArtifact(payload.canonicalAnalysis, activeRun, "canonicalAnalysis");
      if (payload.ahaSer && typeof payload.ahaSer === "object") deps.bindAnalysisArtifact(payload.ahaSer, activeRun, "ahaSer");
      if (deps.analysisBundleV2?.build) {
        payload.analysisBundleV2 = deps.analysisBundleV2.build({
          activeRun,
          payload,
          sourceText: effectiveSourceText,
          primarySourceKind: articleAnalysis ? "transient_article_full_text" : (linkInfo.isSourceAction ? "unavailable_full_text" : "pasted_text"),
          acquisitionStatus: articleAnalysis ? "full_text_used" : (linkInfo.isSourceAction ? "reference" : "full_text_used"),
          sourceReferences: articleAnalysis?.source ? [articleAnalysis.source] : []
        });
        if (payload.analysisBundleV2.validation?.valid !== true) {
          payload.qualityGate = Object.assign({}, payload.qualityGate, {
            status: "needs_review",
            suppressClaims: true,
            message: "AnalysisBundleV2 kunne ikke valideres for aktiv kilde og analyse-run."
          });
        }
      }
      deps.updateAnalysisRun({
        sourceText,
        sourceType: linkInfo.isSourceAction ? "url" : "pasted_text",
        rawAutoPayload: payload,
        canonicalAnalysis: payload.canonicalAnalysis,
        concepts: payload.concepts || payload.keywords,
        subjectMatches: payload.subjectMatches || payload.subjectLinks,
        analysisBundleV2: payload.analysisBundleV2 || null
      }, activeRun);
      if (options.persist !== false) {
        deps.saveAutoOutputs({
          activeRun: activeRun || null,
          payload,
          sourceText,
          sourceKind: linkInfo.isSourceAction ? "url" : "pasted_text"
        });
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
      const computedSourceSha256 = deps.sourceHash(sourceText);
      const cachedSourceSha256 = String(cache.source_sha256 || cache.sourceSha256 || cache.sourceTextHash || cache.sourceHash || "").trim();
      const payloadSourceSha256 = String(payload.source_sha256 || payload.sourceSha256 || payload.sourceTextHash || payload.sourceHash || "").trim();
      const cachedRunId = String(cache.analysisRunId || cache.runId || payload.analysisRunId || payload.runId || "").trim();
      if (!computedSourceSha256 || cachedSourceSha256 !== computedSourceSha256 || payloadSourceSha256 !== computedSourceSha256 || !cachedRunId) {
        deps.setExportButtonsEnabled(false);
        deps.setActiveAnalysisRun(null);
        deps.refreshAhaExplorer();
        return;
      }
      const cachedRun = {
        analysisId: cache.analysisId || payload.analysisId || `analysis_${cache.sourceTextHash || deps.sourceHash(sourceText)}`,
        analysisRunId: cachedRunId,
        runId: cachedRunId,
        conversationId: cache.conversationId || cache.sessionId || payload.conversationId || payload.sessionId || deps.defaultConversationId,
        turnId: cache.turnId || payload.turnId || "",
        sourceId: cache.sourceId || payload.sourceId || `source_${cache.sourceTextHash || deps.sourceHash(sourceText)}`,
        sourceKind: cache.sourceKind || payload.sourceKind || "chat",
        topicLabel: cache.topicLabel || payload.topicLabel || deps.takeKeywords(sourceText, 4).join(" · "),
        sessionId: cache.sessionId || cache.conversationId || payload.sessionId || payload.conversationId || deps.defaultConversationId,
        createdAt: cache.createdAt || payload.createdAt || new Date().toISOString(),
        sourceText,
        sourceTextHash: computedSourceSha256,
        sourceHash: computedSourceSha256,
        sourceSha256: computedSourceSha256,
        source_sha256: computedSourceSha256,
        sourceHashAlgorithm: "sha256",
        sourceFingerprint: computedSourceSha256
      };
      deps.setActiveAnalysisRun(cachedRun);
      if (deps.analysisBundleV2?.hydrate) {
        const bundle = deps.analysisBundleV2.hydrate(payload.analysisBundleV2);
        if (
          !bundle
          || bundle.identity.source_sha256 !== computedSourceSha256
          || bundle.identity.analysis_run_id !== cachedRunId
          || bundle.identity.analysis_id !== String(cachedRun.analysisId || "")
          || bundle.identity.source_id !== String(cachedRun.sourceId || "")
        ) {
          deps.setExportButtonsEnabled(false);
          deps.setActiveAnalysisRun(null);
          deps.refreshAhaExplorer();
          return;
        }
        payload.analysisBundleV2 = bundle;
      }
      deps.bindAnalysisArtifact(payload, cachedRun, "rawAutoPayload");
      if (payload.canonicalAnalysis && typeof payload.canonicalAnalysis === "object") deps.bindAnalysisArtifact(payload.canonicalAnalysis, cachedRun, "canonicalAnalysis");
      if (payload.ahaSer && typeof payload.ahaSer === "object") deps.bindAnalysisArtifact(payload.ahaSer, cachedRun, "ahaSer");
      if (
        !deps.artifactMatchesActiveRun(payload, cachedRun)
        || (payload.canonicalAnalysis && !deps.artifactMatchesActiveRun(payload.canonicalAnalysis, cachedRun))
        || (payload.ahaSer && !deps.artifactMatchesActiveRun(payload.ahaSer, cachedRun))
      ) {
        deps.setExportButtonsEnabled(false);
        deps.setActiveAnalysisRun(null);
        deps.refreshAhaExplorer();
        return;
      }
      deps.updateAnalysisRun({
        sourceText,
        rawAutoPayload: payload,
        canonicalAnalysis: payload.canonicalAnalysis,
        ahaSer: payload.ahaSer,
        concepts: payload.concepts || payload.keywords,
        subjectMatches: payload.subjectMatches || payload.subjectLinks,
        analysisBundleV2: payload.analysisBundleV2 || null
      }, cachedRun);
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

  const storeApi = { STORAGE_KEY: AUTO_OUTPUT_STORAGE_KEY, create: createStore };
  global.AHAChatAutoOutputStore = storeApi;
  global.AHAModuleApi?.register?.("chat.autoOutputStore", storeApi, { version: 1, legacyGlobal: "AHAChatAutoOutputStore", exports: Object.keys(storeApi) });

  const publicApi = Object.assign({}, global.AHAChatAutoOutputView || {}, { create, createRuntime, harmonizeAnalysisPayload, finalizeAnalysisQuality });
  global.AHAChatAutoOutputView = publicApi;
  global.AHAModuleApi?.register?.("chat.autoOutputView", publicApi, { version: 1, legacyGlobal: "AHAChatAutoOutputView", exports: Object.keys(publicApi) });
})(window);
