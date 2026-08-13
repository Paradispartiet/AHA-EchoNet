// ahaChatAcademicInsightView.js
// Akademisk kontekst og syntetiske innsiktskort for AHA Chat.

(function (global) {
  "use strict";

  function create(deps = {}) {
    const {
      loadAutoOutputs,
      loadAfterworkEntries,
      detectTextType,
      hasAcademicSignals,
      extractAcademicPhraseConcepts,
      getRuntimeKnowledgePolicy,
      buildSourceGroundedAcademicPayload,
      buildAutoOutputs,
      isFragmentaryInsightCard,
      normalizeConceptKey,
      detectAutoAnalysisDomain,
      extractMainInstitutionName
    } = deps;

  function parseLabeledInsightCards(insights) {
    const list = Array.isArray(insights) ? insights : [];
    const parsed = { tema: "", hovedspenning: "", viktigsteInnsikt: "" };
    list.forEach((item) => {
      const text = String(item?.summary || item?.text || item || "").trim();
      const lower = text.toLowerCase();
      if (!parsed.tema && lower.startsWith("tema:")) parsed.tema = text.replace(/^tema:\s*/i, "").trim();
      if (!parsed.hovedspenning && lower.startsWith("hovedspenning:")) parsed.hovedspenning = text.replace(/^hovedspenning:\s*/i, "").trim();
      if (!parsed.viktigsteInnsikt && (lower.startsWith("viktigste innsikt:") || lower.startsWith("hovedinnsikt:"))) {
        parsed.viktigsteInnsikt = text.replace(/^(viktigste innsikt|hovedinnsikt):\s*/i, "").trim();
      }
    });
    return parsed;
  }

  function readLatestAcademicContext() {
    const empty = { textType: "", sourceText: "", phraseConcepts: [], payload: null };
    try {
      const cache = loadAutoOutputs();
      const payload = cache?.payload && typeof cache.payload === "object" ? cache.payload : null;
      const sourceText = String(cache?.sourceText || payload?.sourceText || "").trim();
      const payloadTextType = String(payload?.textType || "").trim();
      const detectedTextType = sourceText ? detectTextType(sourceText) : "";
      const inferredAcademic = payloadTextType === "academic_article" || detectedTextType === "academic_article" || hasAcademicSignals(payload, sourceText);
      if (sourceText && inferredAcademic) {
        return { textType: "academic_article", sourceText, phraseConcepts: extractAcademicPhraseConcepts(sourceText).slice(0, 8), payload };
      }
    } catch (err) {
      console.warn("Kunne ikke lese auto-output for akademisk kontekst", err);
    }

    try {
      const latestAcademic = loadAfterworkEntries()
        .slice()
        .reverse()
        .find((entry) => String(entry?.textType || "").trim() === "academic_article");
      const sourceText = String(latestAcademic?.sourceText || latestAcademic?.sourceTextPreview || "").trim();
      if (sourceText) {
        return { textType: "academic_article", sourceText, phraseConcepts: extractAcademicPhraseConcepts(sourceText).slice(0, 8), payload: null };
      }
    } catch (err) {
      console.warn("Kunne ikke lese lagret etterarbeid for akademisk kontekst", err);
    }
    return empty;
  }

  function buildAcademicSyntheticInsightCards() {
    const context = readLatestAcademicContext();
    const text = String(context?.sourceText || "").trim();
    const payload = context?.payload && typeof context.payload === "object" ? context.payload : null;
    const payloadSortItems = Array.isArray(payload?.sortItems) ? payload.sortItems : [];
    const payloadInsightCards = Array.isArray(payload?.insightCards) ? payload.insightCards : [];
    const payloadReflection = String(payload?.reflection || "").trim();
    if (!getRuntimeKnowledgePolicy().legacyArticleTemplatesEnabled) {
      if (!text) return [];
      return buildSourceGroundedAcademicPayload(text).insightCards;
    }
    const sourceSortItems = payloadSortItems.length ? payloadSortItems : [];

    let fallbackSynthesis = null;
    if (!sourceSortItems.length && !payloadReflection && !payloadInsightCards.length && text) {
      try {
        fallbackSynthesis = buildAutoOutputs(text, "");
      } catch (err) {
        console.warn("Kunne ikke bygge syntetiske akademiske innsikter", err);
      }
    }

    const sortItems = sourceSortItems.length ? sourceSortItems : (Array.isArray(fallbackSynthesis?.sortItems) ? fallbackSynthesis.sortItems : []);
    const normalizedCards = payloadInsightCards
      .map((card) => ({ ...card, title: String(card?.title || card?.candidate_title || "").trim(), summary: String(card?.summary || card?.candidate_summary || card?.text || "").trim() }))
      .filter((card) => card.title && card.summary && !isFragmentaryInsightCard(card));
    const byTitle = (needle) => normalizedCards.find((card) => normalizeConceptKey(card.title).includes(needle));
    const pickSort = (matcher) => {
      const hit = sortItems.find((item) => matcher(normalizeConceptKey(item?.label || "")));
      return String(hit?.text || "").trim();
    };
    const pick = (kind, fallback) => {
      const fromCards = byTitle(kind);
      if (fromCards?.summary) return fromCards.summary;
      if (kind === "hovedinnsikt") return pickSort((label) => label.includes("kort hovedinnsikt")) || payloadReflection || fallbackSynthesis?.reflection || fallback;
      if (kind === "hovedargument") return pickSort((label) => label.includes("hovedargument")) || fallback;
      if (kind === "motargument") return pickSort((label) => label.includes("motargument")) || fallback;
      if (kind === "spenning") return pickSort((label) => label.includes("spenning")) || fallback;
      return fallback;
    };

    const domain = detectAutoAnalysisDomain(text, payload || {});
    const sourceHasPublicAdmin = domain === "public_admin_nav" || domain === "public_administration_reform";
    const sourceHasSahelMali = domain === "sahel_climate_conflict";
    const domainBlockedTerms = sourceHasPublicAdmin
      ? /(knapphetsskolen|politisk økologi|sahel|mali|ressursknapphet|miljødegradering)/i
      : (sourceHasSahelMali ? /(nav|offentlig forvaltning|velferdsstat|arbeidslinja|bakkebyråkrati|stat–kommune|stat-kommune)/i : null);
    if (domain === "institutional_media_history") {
      const explicitAhaSer = payload?.ahaSer && typeof payload.ahaSer === "object" ? payload.ahaSer : {};
      const sourceEntityName = extractMainInstitutionName(text);
      const isMorgenbladet = /\bmorgenbladet\b/i.test(text);
      const hasNicheTerms = /\bnisjeavis|kulturavis|kommentaravis\b/i.test(text);
      const entityName = sourceEntityName && sourceEntityName !== "institusjonen" ? sourceEntityName : (isMorgenbladet ? "Morgenbladet" : "Institusjonen");
      const hovedspenning = String(explicitAhaSer?.hovedspenning || "").trim();
      const kortSvar = String(explicitAhaSer?.kortSvar || payloadReflection || "").trim();
      const tema = String(explicitAhaSer?.tema || "").trim();
      const mediaConcepts = hasNicheTerms
        ? ["mediehistorie", "eierskap", "politisk profil", "kulturavis"]
        : ["mediehistorie", "eierskap", "politisk profil", "redaksjonell linje"];
      const spenningTitle = hovedspenning || "Autonomi og økonomiske rammer";
      const spenningSummary = hovedspenning
        ? `Teksten synliggjør spenningen ${hovedspenning.toLowerCase()}, og hvordan denne former institusjonens utvikling over tid.`
        : `Teksten synliggjør en varig spenning mellom redaksjonell autonomi og økonomiske rammer i ${entityName}.`;
      const rolleSummary = tema
        ? `${entityName} forstås gjennom ${tema.toLowerCase()}, med vekt på offentlig rolle og faglig profil over tid.`
        : (kortSvar || `${entityName} framstår som en medieinstitusjon der offentlig rolle, faglig profil og historisk utvikling må leses samlet.`);
      return [
        { title: isMorgenbladet ? "Morgenbladets institusjonelle omforming" : `${entityName}s institusjonelle omforming`, summary: pick("hovedinnsikt", String(explicitAhaSer?.viktigsteInnsikt || `${entityName} overlever gjennom institusjonell omforming i samspill mellom redaksjonell profil, eierskap og økonomi.`).trim()), concepts: mediaConcepts, candidate_type: "synthetic" },
        { title: spenningTitle, summary: spenningSummary, concepts: ["redaksjonell uavhengighet", "økonomisk avhengighet", "eierskap", "statsstøtte"], candidate_type: "synthetic" },
        { title: "Offentlig rolle og faglig profil", summary: rolleSummary, concepts: hasNicheTerms ? ["nisjeavis", "akademisk offentlighet", "kulturjournalistikk", "kvalitetsjournalistikk"] : ["offentlighet", "faglig profil", "medierolle", "institusjonell utvikling"], candidate_type: "synthetic" }
      ];
    }

    return [
      { title: "Hovedinnsikt", summary: pick("hovedinnsikt", domain === "literary_attachment" ? "Om våren gjør tilknytning til et eksistensielt og litterært nøkkelbegrep, ikke bare et psykologisk fagbegrep." : "Teksten argumenterer for en sammensatt faglig forklaring."), concepts: domain === "literary_attachment" ? ["Knausgård", "Om våren", "tilknytningsteori"] : ["problemstilling", "teori", "funn"], candidate_type: "synthetic" },
      { title: "Hovedargument", summary: pick("hovedargument", domain === "literary_attachment" ? "Romanen bekrefter deler av tilknytningsteorien, men viser også dens begrensninger gjennom skildringer av sårbarhet, sykdom, kropp, materialitet og uforklarlige vekstkrefter." : "Hovedargumentet underbygges gjennom tekstnær analyse og teoretisk sammenstilling."), concepts: domain === "literary_attachment" ? ["Bowlby", "autofiksjon", "sårbarhet"] : ["hovedargument", "metode", "analyse"], candidate_type: "synthetic" },
      { title: "Motargument/kritikk", summary: pick("motargument", domain === "literary_attachment" ? "En ren tilknytningsteoretisk lesning blir for smal fordi romanen åpner for mytologiske, autofiksjonelle og nymaterialistiske forklaringsnivåer." : "Alternative forklaringer tester hovedpåstanden og synliggjør begrensninger."), concepts: domain === "literary_attachment" ? ["nymaterialisme", "performativitet", "litteraturvitenskap"] : ["motargument", "kritikk", "alternativ forklaring"], candidate_type: "synthetic" },
      { title: "Spenning i teksten", summary: pick("spenning", domain === "literary_attachment" ? "Psykologisk tilknytningsteori står mot romanens bredere litterære utforskning av tilknytning, forknytning og løsrivelse." : "Spenningen står mellom konkurrerende faglige tolkningsnivåer."), concepts: domain === "literary_attachment" ? ["deiksis", "løsrivelse", "virkelighetslitteratur"] : ["spenning", "teori", "tolkning"], candidate_type: "synthetic" }
    ]
      .filter((card) => String(card?.summary || "").trim())
      .filter((card) => !isFragmentaryInsightCard(card))
      .filter((card) => {
        if (!domainBlockedTerms) return true;
        const body = `${card?.title || ""} ${card?.summary || ""} ${(Array.isArray(card?.concepts) ? card.concepts : []).join(" ")}`;
        return !domainBlockedTerms.test(body);
      });
  }

    return Object.freeze({
      parseLabeledInsightCards,
      readLatestAcademicContext,
      buildAcademicSyntheticInsightCards
    });
  }

  const api = Object.freeze({ create });
  global.AHAChatAcademicInsightView = api;
  global.AHAModuleApi?.register?.("chat.academicInsightView", api, {
    version: 1,
    legacyGlobal: "AHAChatAcademicInsightView",
    exports: ["create"]
  });
})(window);
