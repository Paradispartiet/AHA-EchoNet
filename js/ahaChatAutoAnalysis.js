// ahaChatAutoAnalysis.js
// Bygger kildebundne autoanalyse-payloads for AHA Chat.
//
// Modulen eier teksttype-ruting, runtime-kunnskapspolitikk og selve
// autoanalysebyggingen. DOM, run-state, lagring og rendering ligger fortsatt
// utenfor. Eksponerer window.AHAChatAutoAnalysis. Lastes før ahaChat.js.

(function (global) {
  "use strict";

  function create(deps = {}) {
    const required = [
      "cleanArticleText", "toSentences", "takeKeywords", "short",
      "detectTextType", "normalizeSubjectMatches", "normalizeAcademicAfterworkPayload",
      "collectLiteraryDiaryEvidence", "buildLiteraryDiarySortItems",
      "collectOpinionArticleEvidence", "buildOpinionArticleQualityAnalysis",
      "currentInsights", "sourceHasAny", "inferReligiousLexiconEvidence",
      "detectAutoAnalysisDomain", "detectInstitutionalMediaHistorySignal",
      "detectLiteraryAttachmentSignal", "detectPublicAdministrationReformSignal",
      "extractAcademicPhraseConcepts", "extractAcademicTheoryLinks",
      "extractMainInstitutionName", "lowerFirst", "sentence"
    ];
    required.forEach((name) => {
      if (typeof deps[name] !== "function") throw new Error(`AHAChatAutoAnalysis mangler avhengighet: ${name}`);
    });
    const {
      cleanArticleText, toSentences, takeKeywords, short, detectTextType,
      normalizeSubjectMatches, normalizeAcademicAfterworkPayload,
      collectLiteraryDiaryEvidence, buildLiteraryDiarySortItems,
      collectOpinionArticleEvidence, buildOpinionArticleQualityAnalysis, currentInsights,
      sourceHasAny, inferReligiousLexiconEvidence, detectAutoAnalysisDomain,
      detectInstitutionalMediaHistorySignal, detectLiteraryAttachmentSignal,
      detectPublicAdministrationReformSignal, extractAcademicPhraseConcepts,
      extractAcademicTheoryLinks, extractMainInstitutionName, lowerFirst, sentence
    } = deps;

    function getUrlDominanceInfo(text) {
      const raw = String(text || "").trim();
      const urls = global.AHALinkReader?.detectUrls?.(raw) || [];
      const urlLength = urls.reduce((sum, url) => sum + String(url || "").length, 0);
      const withoutUrls = urls.reduce((acc, url) => acc.replace(url, " "), raw).replace(/https?:\/\/[^\s<>'"]+/gi, " ").replace(/\s+/g, " ").trim();
      const helperOnly = !withoutUrls || /^(?:(?:les|lese|sjekk|se|åpne|apne|analyser|vurder|hva|med|denne|dette|her|artikkelen|lenken|linken|url|kilden|kan|du|please|pls|ta|en|på|pa|om|kort|oppsummer)[\s.,!?-]*)+$/i.test(withoutUrls);
      const urlOnly = Boolean(raw && urls.length && !withoutUrls);
      const urlDominated = Boolean(raw && urls.length && urlLength / Math.max(raw.length, 1) > 0.7 && helperOnly);
      return { urls, urlLength, withoutUrls, helperOnly, urlOnly, urlDominated, isSourceAction: urlOnly || urlDominated };
    }

    function isSportsArticleAnalysis(analysis = {}) {
      const haystack = [analysis.title, analysis.short_summary, ...(analysis.main_points || []), ...(analysis.concepts || [])].join(" ").toLowerCase();
      return /\b(sport|fotball|kamp|straffe|straffer|straffespark|turnering|marokko|nederland|spiller|mål|maal|utslagskamp)\b/i.test(haystack);
    }

    function buildArticleSourceTextFromAnalysis(analysis = {}) {
      return [analysis.title, analysis.short_summary, ...(analysis.main_points || []), ...(analysis.concepts || []), ...(analysis.conflict_lines || [])].filter(Boolean).join("\n");
    }

    function buildArticleAutoOutputsFromAnalysis(analysis = {}) {
      const sports = isSportsArticleAnalysis(analysis);
      const mainPoints = (Array.isArray(analysis.main_points) ? analysis.main_points : []).filter(Boolean);
      const concepts = (Array.isArray(analysis.concepts) ? analysis.concepts : []).filter(Boolean);
      const candidates = (Array.isArray(analysis.candidates) ? analysis.candidates : []).filter(Boolean);
      const title = String(analysis.title || "Nyhetsartikkel").trim();
      const summary = String(analysis.short_summary || mainPoints[0] || title).trim();
      const conflict = (analysis.conflict_lines || [])[0] || (sports ? "Mentalt press i utslagskamp" : "Kildens hovedspenning må leses i artikkelens hendelser og konsekvenser.");
      const subjectMatches = sports ? [
        { title: "Sport", subject_label: "Sport", score: 0.95 },
        { title: "Fotball", subject_label: "Fotball", score: 0.95 },
        { title: "Turneringsspill", subject_label: "Turneringsspill", score: 0.82 },
        { title: "Psykologi/press", subject_label: "Psykologi/press", score: 0.78 },
        { title: "Medier/sportsjournalistikk", subject_label: "Medier/sportsjournalistikk", score: 0.72 }
      ] : concepts.slice(0, 5).map((c) => ({ title: c, subject_label: c, score: 0.7 }));
      const sortItems = (mainPoints.length ? mainPoints : [summary]).slice(0, 6).map((point, idx) => ({
        label: sports ? (["Kampforløp", "Avgjørelse", "Konsekvens", "Menneskelig drama", "Kontekst", "Neste spor"][idx] || `Punkt ${idx + 1}`) : `Punkt ${idx + 1}`,
        text: point
      }));
      return {
        contentType: sports ? "Sportsartikkel" : "Nyhetsartikkel",
        reflection: summary,
        keywords: concepts.slice(0, 8),
        sortItems,
        day: sports ? `Kort artikkeloppsummering: ${summary}` : `Kort nyhetsoppsummering: ${summary}`,
        thoughts: {
          hovedspor: title,
          lose_tanker: mainPoints.slice(1, 3).join(" ") || summary,
          neste_steg: sports ? "Se hvilke spillere, hendelser og turneringskonsekvenser saken peker mot." : "Kontroller aktører, påstander og konsekvenser i kilden."
        },
        list: (mainPoints.length ? mainPoints : [summary]).slice(0, 6),
        path: sports ? ["Forstå kampforløpet.", "Skill avgjørende hendelser fra emosjonelle øyeblikk.", "Se turneringskonsekvensene."] : ["Forstå hovedhendelsen.", "Identifiser aktører og påstander.", "Vurder konsekvenser og videre spørsmål."],
        insightCards: candidates.map((c) => c.summary || c.title).filter(Boolean).slice(0, 5),
        subjectMatches,
        subjectLinks: subjectMatches,
        theoryLinks: [],
        ahaSer: {
          innholdstype: sports ? "Sportsartikkel" : "Nyhetsartikkel",
          tema: title,
          hovedspenning: conflict,
          viktigsteInnsikt: candidates[0]?.summary || summary,
          fagkoblinger: subjectMatches.map((m) => m.title),
          nesteSteg: sports ? "Se hvilke spillere, hendelser og turneringskonsekvenser saken peker mot." : "Kontroller aktører, påstander og konsekvenser i kilden.",
          kortSvar: summary
        },
        articleAnalysis: analysis
      };
    }


    // Runtime-kunnskapspolitikk: Fagverk er den varige kunnskapsbasen.
    // Dokumentet i aktiv run er analysemateriale, ikke en mal eller en automatisk
    // varig kunnskapskilde. Legacy-artikkelmaler beholdes midlertidig som død
    // kompatibilitetskode, men får ikke autorisere runtime-innhold.
    const AHA_RUNTIME_KNOWLEDGE_POLICY = Object.freeze({
      durableKnowledgeSource: "fagverk",
      currentDocumentRole: "analysis_source",
      legacyArticleTemplatesEnabled: false,
      persistAnalysisDocumentsAsMemory: false
    });

    function pickAcademicSourceSentence(sentences, patterns, fallbackIndex = 0) {
      const list = Array.isArray(sentences) ? sentences.filter(Boolean) : [];
      const hit = list.find((sentenceText) => (Array.isArray(patterns) ? patterns : []).some((pattern) => pattern.test(sentenceText)));
      return String(hit || list[fallbackIndex] || list[0] || "").trim();
    }


    function pickBestAcademicSourceSentence(sentences, kind, fallbackIndex = 0) {
      const list = Array.isArray(sentences) ? sentences.filter(Boolean) : [];
      if (!list.length) return "";
      const rules = kind === "finding"
        ? [
            [/\bpotensialet\b[^.!?]{0,120}\bikke\b[^.!?]{0,80}\bevaluere mer, men bedre\b/i, 12],
            [/\brespondentene\b[^.!?]{0,80}\b(etterlyser|mener)\b/i, 9],
            [/\b(undersøkelsen|resultatene|funnene)\b[^.!?]{0,60}\b(vis(?:er|te)|bekrefter|tyder)\b/i, 7],
            [/\bviser\b/i, 2]
          ]
        : [
            [/\bundersøkelsen ble sendt til\b/i, 10],
            [/\bdatainnsamlingsperioden\b/i, 9],
            [/\bsurveyen ble gjennomført\b/i, 9],
            [/\brespondent(?:ene|er)\b/i, 5],
            [/\b(survey|datainnsamling|intervju|utvalg|metode|empiri)\b/i, 5],
            [/\banalyse\b/i, 1]
          ];
      let best = { text: String(list[fallbackIndex] || list[0] || "").trim(), score: -1 };
      list.forEach((sentenceText, index) => {
        const text = String(sentenceText || "").trim();
        let score = 0;
        rules.forEach(([pattern, weight]) => { if (pattern.test(text)) score += weight; });
        if (kind === "evidence" && /\b\d+\s*(?:prosent|%)\b/i.test(text)) score += 4;
        if (kind === "finding" && index >= Math.floor(list.length * 0.45)) score += 0.75;
        if (score > best.score) best = { text, score };
      });
      return best.score > 0 ? best.text : String(list[fallbackIndex] || list[0] || "").trim();
    }

    function buildSourceGroundedAcademicPayload(sourceText) {
      const source = cleanArticleText(String(sourceText || "")).trim();
      const sentences = toSentences(source).map((item) => String(item || "").trim()).filter(Boolean);
      const keywords = takeKeywords(source, 8);
      const first = sentences[0] || "";
      const problem = pickAcademicSourceSentence(sentences, [/\b(formål|problemstilling|undersøker|undersøke|spørsmål|hensikt|målet med|denne artikkelen|studien)\b/i], 0);
      const finding = pickBestAcademicSourceSentence(sentences, "finding", 0);
      const evidence = pickBestAcademicSourceSentence(sentences, "evidence", 1);
      const tension = pickAcademicSourceSentence(sentences, [/\b(men|samtidig|imidlertid|derimot|på den ene siden|på den andre siden|utfordring|kritikk|spenning)\b/i], 1);
      const sortItems = [
        { label: "Problemstilling / formål", text: problem },
        { label: "Hovedfunn / hovedpoeng", text: finding || first },
        { label: "Empiri / metode", text: evidence },
        { label: "Faglig spenning", text: tension }
      ].filter((item) => item.text);
      const insightCards = sortItems.slice(0, 4).map((item, index) => ({
        id: `academic_source_${index + 1}`,
        candidate_type: "synthetic",
        candidate_title: item.label,
        candidate_summary: item.text,
        title: item.label,
        summary: item.text,
        concepts: keywords.slice(0, 4),
        source_role: "analysis_source"
      }));
      const mainText = finding || problem || first;
      const tensionText = tension || "Ingen eksplisitt hovedspenning er identifisert i kilden ennå.";
      return {
        textType: "academic_article",
        contentType: "academic_article",
        reflection: mainText,
        keywords,
        sortItems,
        day: "Ikke dagbokmateriale – ingen dagsoppsummering laget.",
        thoughts: {
          hovedspor: mainText,
          lose_tanker: evidence || "Skill tydelig mellom kildebelegg, tolkning og fagverkets begreper.",
          neste_steg: "Koble relevante begreper og metoder fra Fagverk til eksplisitte belegg i denne kilden."
        },
        list: sentences.slice(0, 6),
        path: [
          "Avklar kildens problemstilling og hovedpåstand.",
          "Skill empiri, metode og tolkning fra hverandre.",
          "Koble relevante begreper og metoder fra Fagverk til konkrete tekstbelegg.",
          "Test hovedtolkningen mot alternative forklaringer.",
          "Formuler en kildebundet faglig syntese."
        ],
        insightCards,
        subjectMatches: [],
        subjectLinks: [],
        theoryLinks: [],
        ahaSer: {
          innholdstype: "Fagtekst",
          tema: keywords.slice(0, 4).join(" · ") || short(first, 120),
          hovedspenning: tensionText,
          viktigsteInnsikt: mainText,
          fagkoblinger: [],
          nesteSteg: "Bruk Fagverk-koblingene til å analysere denne kilden videre; ikke tidligere artikler som innholdsmal.",
          kortSvar: short(mainText, 320)
        },
        analysisKnowledgePolicy: {
          durableKnowledgeSource: AHA_RUNTIME_KNOWLEDGE_POLICY.durableKnowledgeSource,
          currentDocumentRole: AHA_RUNTIME_KNOWLEDGE_POLICY.currentDocumentRole,
          legacyArticleTemplatesEnabled: false,
          persistAsMemory: false
        }
      };
    }

    function applyRuntimeKnowledgePolicy(payload, sourceText) {
      const safe = payload && typeof payload === "object" ? payload : {};
      if (AHA_RUNTIME_KNOWLEDGE_POLICY.legacyArticleTemplatesEnabled || detectTextType(sourceText) !== "academic_article") return safe;
      const grounded = buildSourceGroundedAcademicPayload(sourceText);
      const subjectMatches = normalizeSubjectMatches(Array.isArray(safe.subjectMatches) ? safe.subjectMatches : []);
      const subjectLabels = subjectMatches.map((item) => String(item?.title || item?.label || item?.subject_label || item?.subject_id || "").trim()).filter(Boolean);
      return {
        ...grounded,
        subjectMatches,
        subjectLinks: subjectMatches,
        theoryLinks: [],
        ahaSer: { ...grounded.ahaSer, fagkoblinger: subjectLabels }
      };
    }

    function isTransientAnalysisDocument(text, urlInfo = {}) {
      if (urlInfo?.isSourceAction) return true;
      return detectTextType(String(text || "")) === "academic_article";
    }

    function buildAutoOutputs(userText, ahaReply) {
      const raw = String(userText || "").trim();
      const linkInfo = getUrlDominanceInfo(raw);
      const latestArticleAnalysis = global.AHALinkReader?.getLatestArticleAnalysis?.();
      if (linkInfo.isSourceAction && latestArticleAnalysis) return buildArticleAutoOutputsFromAnalysis(latestArticleAnalysis);
      const reply = String(ahaReply || "").trim();
      const textType = detectTextType(raw);
      if (textType === "academic_article" && !AHA_RUNTIME_KNOWLEDGE_POLICY.legacyArticleTemplatesEnabled) {
        return buildSourceGroundedAcademicPayload(raw);
      }
      const analysisText = cleanArticleText(raw);
      const sentences = toSentences(analysisText);
      const keywords = takeKeywords(analysisText, 5);
      const baseList = sentences.slice(0,6).map((item) => item.replace(/^[-•]\s*/, ""));
      let reflection = "Jeg ser et tydelig tema. Del gjerne litt mer for skarpere sortering.";
      let sortItems = (keywords.length ? keywords : ["retning","utfordring","handling"]).slice(0, 4).map((key, idx) => ({ label: key.charAt(0).toUpperCase() + key.slice(1), text: sentences[idx] || `Dette peker på et tema rundt ${key}.` }));
      let day = "Ikke nok dagsmateriale ennå.";
      let thoughts = { hovedspor: sentences[0] || "Trenger mer tekst for å finne hovedspor.", lose_tanker: sentences.slice(1,3).join(" ") || "Noen løse tanker vil dukke opp når du skriver mer.", neste_steg: "Velg ett tydelig spor og skriv én presis setning videre." };
      let list = baseList;
      let path = ["Forstå hva teksten egentlig handler om.", "Sorter materialet i 2–3 tydelige spor.", "Velg ett neste grep og skriv videre."];
      let ahaSer = null;

      if (textType === "literary_diary") {
        const evidence = collectLiteraryDiaryEvidence(raw, sentences);
        const reflectionParts = ["Dette er en dagboktekst der fortelleren beveger seg mellom observasjon og selvforklaring."];
        if (evidence.hasPlaceScene) reflectionParts.push("Stedsscener gir teksten forankring.");
        if (evidence.hasSRelation) reflectionParts.push("Relasjonen til S samler lengsel og selvforsvar.");
        if (evidence.hasStrangers) reflectionParts.push("Møter med fremmede utvider teksten sosialt.");
        if (evidence.hasTravel && evidence.hasNomadism) reflectionParts.push("Reise- og nomademotivet åpner mot frihet og drift.");
        else if (evidence.hasTravel) reflectionParts.push("Reisemotivet åpner mot frihet og drift.");
        else if (evidence.hasNomadism) reflectionParts.push("Nomademotivet åpner mot frihet og drift.");
        if (evidence.hasWriterLife) reflectionParts.push("Forfatterlivet ligger som et selvbilde og en mulig retning.");
        if (evidence.hasShameGuilt) reflectionParts.push("Skyld og skam skaper indre friksjon.");
        if (evidence.matchedThemes.length <= 2) reflectionParts.push("Teksten bør analyseres som dagbokprosa, men trenger tydeligere motivspor for skarpere etterarbeid.");
        reflection = reflectionParts.join(" ");
        sortItems = buildLiteraryDiarySortItems(raw, sentences);
        const dayBits = [];
        if (evidence.hasPlaceScene) dayBits.push("sted");
        if (evidence.hasSRelation) dayBits.push("relasjon");
        if (evidence.hasPhone) dayBits.push("telefonkontakt");
        if (evidence.hasStrangers) dayBits.push("møtepunkt");
        if (evidence.hasTravel || evidence.hasNomadism) dayBits.push("drift mot frihet");
        if (evidence.hasShameGuilt || evidence.hasSocialUnease) dayBits.push("indre uro");
        day = dayBits.length ? `Dagbokfragmentet beveger seg gjennom ${dayBits.slice(0, 4).join(", ")}.` : "Dagbokfragmentet samler observasjoner og indre vurderinger i en assosiativ bevegelse.";

        let hovedspor = "Fortelleren forsøker å forstå seg selv gjennom dagbokformens bevegelser.";
        if (evidence.hasPlaceScene && evidence.hasInnerMonologue) hovedspor = "Fortelleren bruker ytre observasjoner til å nærme seg egen uro.";
        else if (evidence.hasSRelation) hovedspor = "Relasjonen til S fungerer som tekstens emosjonelle anker.";
        else if (evidence.hasTravel || evidence.hasNomadism || evidence.hasWriterLife) hovedspor = "Teksten søker mot frihet, bevegelse og et skrivende selvbilde.";
        const loose = [];
        if (evidence.hasPhone) loose.push("telefonkontakt");
        if (evidence.hasStrangers) loose.push("møter med fremmede");
        if (evidence.hasShameGuilt) loose.push("skyld/skam");
        if (evidence.hasSocialUnease) loose.push("sosial uro");
        if (evidence.hasWriterLife) loose.push("forfatterspor");
        const loseTanker = loose.length ? `Løse spor i teksten: ${loose.slice(0, 4).join(", ")}.` : "Løse spor finnes, men motivene er foreløpig svakt markert.";
        let nesteSteg = "Velg ett motiv og la de andre scenene speile det.";
        if (evidence.hasSRelation) nesteSteg = "Velg om relasjonen skal være tekstens hovedakse eller bare ett spor.";
        else if (evidence.hasTravel || evidence.hasNomadism) nesteSteg = "Velg om reisemotivet skal bære slutten.";
        else if (evidence.hasPlaceScene) nesteSteg = "Stram stedsscenene slik at de peker mot samme indre bevegelse.";
        thoughts = { hovedspor, lose_tanker: loseTanker, neste_steg: nesteSteg };

        const evidenceList = [];
        if (evidence.hasPlaceScene) evidenceList.push("Stedsscener åpner dagbokbevegelsen.");
        if (evidence.hasSRelation) evidenceList.push("Relasjonen til S skaper emosjonelt anker.");
        if (evidence.hasPhone) evidenceList.push("Telefonkontakt gir konflikt og nærhet på avstand.");
        if (evidence.hasStrangers) evidenceList.push("Møter med fremmede bryter teksten opp.");
        if (evidence.hasTravel) evidenceList.push("Reiseplaner åpner mot frihet og forflytning.");
        if (evidence.hasWriterLife) evidenceList.push("Forfatterliv brukes som selvbilde.");
        if (evidence.hasShameGuilt) evidenceList.push("Skyld/skam gir indre friksjon.");
        if (evidence.hasSocialUnease) evidenceList.push("Sosial uro preger fortellerens selvbilde.");
        if (evidenceList.length < 3) {
          evidenceList.push("Jeg-fortelleren samler observasjoner og vurderinger.");
          evidenceList.push("Teksten beveger seg assosiativt mer enn lineært.");
        }
        list = evidenceList.slice(0, 6);

        const motive = evidence.hasSRelation ? "relasjon" : evidence.hasTravel ? "reise" : evidence.hasPlaceScene ? "stedsscener" : evidence.hasInnerMonologue ? "indre monolog" : "observasjon";
        const structure = evidence.hasPlaceScene ? "sted" : evidence.hasSRelation ? "relasjon" : evidence.hasStrangers ? "møte" : evidence.hasInnerMonologue ? "indre monolog" : "vandring";
        const tighten = evidence.hasSRelation
          ? "Avklar om relasjonen skal være hovedakse eller sidebevegelse."
          : evidence.hasPlaceScene
            ? "La stedsscenene peke tydeligere mot samme indre uro."
            : evidence.hasTravel
              ? "La reisen fungere som avslutning eller kontrapunkt."
              : "Kutt forklaringer som gjentar samme selvforsvar.";
        path = [
          `Finn bærende motiv: ${motive}.`,
          `Velg struktur: ${structure}.`,
          `Stram teksten: ${tighten}`
        ];
      } else if (textType === "day_log") {
        reflection = `Dette leses som en dagslogg med fokus på ${keywords[0] || "hendelser"}, og et tydelig behov for å se mønster i dagen.`;
        day = `Kort dagsoppsummering: ${sentences.slice(0,2).join(" ") || "Flere hendelser gjennom dagen."} Viktigst nå: ${keywords[0] || "ett tydelig neste punkt"}.`;
        path = ["Oppsummer hendelsene kort.", "Finn ett mønster eller én følelse som gikk igjen.", "Velg én ting du tar med videre i morgen."];
      } else if (textType === "literary_fragment") {
        reflection = "Teksten drives av scene, motiv, sansning og rytme mer enn av dagboklogg. Konflikten ligger i spenningen mellom stemning og bevegelse.";
        day = "Ikke dagbokmateriale – ingen dagsoppsummering laget.";
      } else if (textType === "opinion_article") {
        const evidence = collectOpinionArticleEvidence(raw, sentences);
        const quality = buildOpinionArticleQualityAnalysis(raw, evidence, sentences);
        reflection = [
          sentence(`Teksten forsøker å ${lowerFirst(quality.textIntent)}`),
          sentence(`Den sentrale bevegelsen går fra ${lowerFirst(quality.centralMovement)}`),
          sentence(`Den retoriske styrken ligger i ${lowerFirst(quality.rhetoricalPower)}`),
          sentence(`Det som bør skjerpes, er ${lowerFirst(quality.weaknessPhrase)}`)
        ].filter(Boolean).join(" ");
        sortItems = [
          { label: "Hovedpåstand", text: quality.thesis },
          { label: "Motpart / konflikt", text: quality.conflict },
          { label: "Tekstens vendepunkt", text: quality.argumentLine },
          { label: "Belegg", text: quality.strengths[1] || quality.strengths[0] || "Teksten har flere belegg, men de bør prioriteres tydeligere." },
          { label: "Retorisk grep", text: quality.strengths[2] || "Teksten løfter konflikten med tydelige kontraster mellom dagens kurs og alternativ retning." },
          { label: "Politisk løsning", text: quality.policySolution || "Teksten antyder en løsning, men den bør formuleres tydeligere." },
          { label: "Svak overgang", text: quality.missingLinks[0] || "Overgangen mellom konflikt og tiltak må bli tydeligere for leseren." },
          { label: "Mulig sluttpoeng", text: quality.sharperEnding }
        ];
        day = "Ikke dagbokmateriale – ingen dagsoppsummering laget.";
        thoughts = {
          hovedspor: quality.thesis,
          lose_tanker: quality.weaknesses.slice(0, 3).join(" "),
          neste_steg: quality.editorialNextStep
        };
        list = [
          `Gjør hovedpåstanden kortere og tidligere: ${quality.thesis}`,
          `Spiss konfliktlinjen: ${quality.conflict}`,
          `Flytt vendepunktet frem: ${quality.suggestedStructure[1] || "fra kritikk til plan tidligere i teksten"}`,
          `Definer nøkkelbegrepene tydeligere: ${(quality.keyConcepts || []).slice(0, 3).join(", ")}.`,
          `Konkretiser belegg: ${quality.strengths[1] || "legg inn ett eksempel eller tall der argumentet nå er mest prinsipielt."}`,
          `Skjerp avslutningen: ${quality.sharperEnding}`
        ].slice(0, 6);
        path = quality.suggestedStructure.slice(0, 5);
      } else if (textType === "academic_article") {
        const religiousLexiconSignal = inferReligiousLexiconEvidence(raw);
        day = "Kort fagoppsummering: Teksten forklarer et faglig tema gjennom definisjoner, nøkkelbegreper, historisk kontekst og tolkning.";
        path = [
          "Forstå grunnfortellingen i teksten.",
          "Lær nøkkelbegreper og bruk dem presist.",
          "Sammenlign forklaringen med andre tekster/tradisjoner.",
          "Undersøk variasjoner mellom kirkesamfunn eller tolkningstradisjoner.",
          "Formuler en egen faglig forklaring med begrepsbruk."
        ];
        sortItems = [
          { label: "Definisjon", text: "Avklar hva fenomenet betyr og hvordan det avgrenses." },
          { label: "Fortelling / hendelse", text: "Beskriv hovedhendelsen eller grunnfortellingen teksten bygger på." },
          { label: "Teologisk betydning", text: "Vis hvilken tros- eller idémessig betydning fenomenet får." },
          { label: "Historisk bakgrunn", text: "Sett temaet inn i en historisk kontekst og utviklingslinje." },
          { label: "Symbolsk kontrast", text: "Forklar sentrale kontraster/symboler som bærer tolkningen." },
          { label: "Feiring / praksis", text: "Beskriv hvordan temaet praktiseres eller markeres." },
          { label: "Sentrale begreper", text: "Trekk ut fagbegreper, ikke bare hyppige ord." }
        ];
        const literaryAttachmentSignal = detectLiteraryAttachmentSignal(analysisText);
        const literaryAttachmentEvidence = sourceHasAny(raw, [/\bknausgård\b/i, /\bkarl ove\b/i, /\bom våren\b/i, /\blinda boström knausgård\b/i, /\btilknytningsteori\b/i, /\bbowlby\b/i]);
        const publicAdminSignal = detectPublicAdministrationReformSignal(analysisText);
        const institutionalHistorySignal = detectInstitutionalMediaHistorySignal(analysisText);
        if (religiousLexiconSignal?.strong) {
          reflection = "Teksten er en religionsfaglig leksikontekst om pinse med vekt på bibelsk fortelling, teologisk betydning, symbolsk kontrast og kirkelig praksis.";
          sortItems = [
            { label: "Definisjon", text: "Pinse er en kristen høytid som feires femti dager etter påske (den sjuende søndagen etter påske)." },
            { label: "Bibelsk fortelling", text: "I Apostlenes gjerninger mottar apostlene Den hellige ånd; ildtunger og språkforståelse knyttes til tungetale og tydning." },
            { label: "Teologisk betydning", text: "Pinse forstås som kirkens fødselsdag og som Åndens gave til alle døpte i kristent fellesskap." },
            { label: "Symbolsk kontrast", text: "Pinse tolkes ofte som et motbilde til Babels tårn: fra språkforvirring til språkforståelse." },
            { label: "Kirkelig praksis", text: "Tungetale, nådegave og tydning tolkes ulikt i protestantisk, karismatisk og østlig tradisjon." },
            { label: "Kalender og feiring", text: "Feiringen følger vestlig/gregoriansk og østlig/juliansk tradisjon, med markering frem mot treenighetssøndag." },
            { label: "Historiske røtter", text: "Høytiden knyttes til jødisk høsttakkefest og minnet om Moseloven i eldre tradisjoner." },
            { label: "Begreper", text: "Pinse, pentekosté, Den hellige ånd, tungetale, nådegave, tydning, apostlene, Babels tårn, kirkens fødselsdag, gregoriansk kalender, juliansk kalender, treenighetssøndag." }
          ];
          day = "Kort fagoppsummering: Pinse er en kristen høytid femti dager etter påske der apostlene mottar Den hellige ånd; tungetale, Babel-kontrast, kirkens fødsel og variasjoner i kalender og kirkelig praksis står sentralt.";
          thoughts = {
            hovedspor: "Pinse forklarer hvordan Den hellige ånd, tungetale og språkforståelse markerer kirkens begynnelse på tvers av språk.",
            lose_tanker: "Hold bibelsk fortelling, teologisk tolkning, symbolikk og kirkelig praksis tydelig adskilt før de kobles.",
            neste_steg: "Sammenlign pinsefortellingen med Babels tårn og drøft hvordan tungetale tolkes i ulike kirketradisjoner."
          };
          list = [
            "Pinse feires den sjuende søndagen etter påske.",
            "Navnet kommer fra gresk pentekosté, den femtiende dag.",
            "Apostlene mottar Den hellige ånd i Apostlenes gjerninger.",
            "Tungetale forstås som nådegave.",
            "Babels tårn fungerer som symbolsk kontrast.",
            "Feiringen varierer mellom vestlig og østlig kirketradisjon."
          ];
          path = [
            "Forstå pinsefortellingen i Apostlenes gjerninger.",
            "Lær nøkkelbegrepene: Den hellige ånd, tungetale, nådegave og tydning.",
            "Sammenlign pinse med Babels tårn.",
            "Undersøk forskjeller mellom protestantisk, karismatisk og østlig tradisjon.",
            "Forklar hvorfor pinse kalles kirkens fødselsdag."
          ];
          ahaSer = {
            tema: "Pinse som kristen høytid, Den hellige ånd, tungetale og kirkens fødsel.",
            hovedspenning: "Språkforvirring ↔ språkforståelse / utvalgte mottakere ↔ gave til alle døpte.",
            viktigsteInnsikt: "Pinse markerer Den hellige ånds komme til apostlene og forstås som begynnelsen på kirkens utbredelse og kristent fellesskap på tvers av språk.",
            fagkoblinger: ["Kristendom", "Kirkehistorie", "Det nye testamentet", "Det gamle testamentet", "Liturgi", "Religionshistorie", "Språk og symbolikk", "Pinsebevegelsen"],
            nesteSteg: "Sammenlign pinsefortellingen med Babels tårn og undersøk hvordan tungetale tolkes ulikt i kristne tradisjoner.",
            kortSvar: "Pinse er den kristne høytiden femti dager etter påske der apostlene mottar Den hellige ånd. Fortellingen om tungetale og språkforståelse i Apostlenes gjerninger tolkes som kirkens fødsel, settes i kontrast til Babels tårn og feires ulikt i vestlig og østlig kalendertradisjon."
          };
        } else if (institutionalHistorySignal?.strong) {
          const entityName = extractMainInstitutionName(analysisText);
          const hasMorgenbladet = /\bmorgenbladet\b/i.test(analysisText);
          const usesMediaTemplate = Boolean(institutionalHistorySignal?.isNewspaperText || institutionalHistorySignal?.isMediaText);
          const hasNicheTerms = /\b(nisjeavis|kulturavis)\b/i.test(analysisText);
          const themeText = hasMorgenbladet
            ? "Morgenbladets historiske utvikling, eierskap, politiske profil og rolle som norsk nisjeavis."
            : `${entityName}s historiske utvikling, eierskap, profil og rolle i offentligheten.`;
          const insightText = hasMorgenbladet
            ? "Morgenbladets historie viser hvordan en avis kan overleve gjennom skiftende eierskap, politiske profiler og økonomiske kriser ved å redefinere seg fra konservativ dagsavis til intellektuell kultur- og kommentaravis."
            : `${entityName}s historie viser hvordan en institusjon kan endre rolle gjennom skiftende eierskap, profil, økonomiske rammer og offentlig funksjon over tid.`;
          const objectText = hasMorgenbladet
            ? "Morgenbladet som medieinstitusjon."
            : `${entityName} som ${usesMediaTemplate ? "medie-" : ""}samfunnsinstitusjon.`;
          const developmentText = hasMorgenbladet
            ? "Fra eldre politisk dagsavis til moderne nisjeavis med kultur- og kommentarprofil."
            : "Fra tidligere profil og organisering til nyere rolle, eierskap og offentlig posisjon.";
          reflection = "Teksten er en faktabasert mediehistorisk framstilling av en institusjon over tid, med vekt på utvikling, eierskap, politisk profil og samfunnsrolle.";
          sortItems = [
            { label: "Kort hovedinnsikt", text: insightText },
            { label: "Tema", text: themeText },
            { label: "Hovedspenning", text: usesMediaTemplate ? "Redaksjonell uavhengighet ↔ økonomisk avhengighet." : "Institusjonell kontinuitet ↔ institusjonell omforming." },
            { label: "Hovedobjekt", text: objectText },
            { label: "Historisk utvikling", text: developmentText },
            { label: "Eierskap/profil", text: usesMediaTemplate ? "Skiftende eierskap og redaksjonelle prioriteringer former politisk og kulturell profil." : "Skiftende styringsformer og eierskap påvirker institusjonens profil, mandat og handlingsrom." },
            { label: "Konfliktlinjer", text: usesMediaTemplate ? `Politisk profil ↔ ${hasNicheTerms ? "uavhengig kulturavis" : "uavhengig offentlig rolle"}; akademisk kvalitet ↔ smal offentlighet; kontinuitet ↔ institusjonell omforming.` : "Formål/samfunnsrolle ↔ økonomiske/organisatoriske rammer; styring/eierskap ↔ faglig/offentlig autonomi; kontinuitet ↔ institusjonell omforming." },
            { label: "Nåværende posisjon", text: usesMediaTemplate ? (hasNicheTerms ? "Nisjeavis med tydelig offentlig rolle i kultur- og idédebatt." : "Medieaktør med tydelig offentlig rolle i samfunns- og idédebatt.") : "Institusjon med definert samfunnsrolle under løpende organisatorisk og økonomisk tilpasning." }
          ];
          day = "Ikke dagbokmateriale – ingen dagsoppsummering laget.";
          thoughts = {
            hovedspor: "Teksten viser institusjonell overlevelse gjennom historisk omforming.",
            lose_tanker: usesMediaTemplate ? "Skille mellom perioder, eierskapsskifter og redaksjonelle vendepunkt." : "Skille mellom perioder, styringsendringer, eierskap og mandatutvikling.",
            neste_steg: usesMediaTemplate ? "Lag en tidslinje med nøkkelvendepunkt og drøft hvordan økonomi og redaksjonell linje påvirker offentlig rolle." : "Lag en tidslinje med nøkkelvendepunkt og drøft hvordan styring, økonomi og mandat påvirker samfunnsrollen."
          };
          list = [
            `Identifiser hovedobjektet: ${entityName}.`,
            "Beskriv historisk utvikling i tydelige perioder.",
            usesMediaTemplate ? "Koble eierskapsskifter til endret politisk/redaksjonell profil." : "Koble styrings- og eierskapsendringer til institusjonell profil og mandat.",
            "Analyser konfliktlinjene mellom autonomi, økonomi og offentlig rolle.",
            usesMediaTemplate ? (hasNicheTerms ? "Vurder nåværende posisjon som nisje- og kulturavis." : "Vurder nåværende posisjon i medieoffentligheten.") : "Vurder nåværende institusjonell posisjon i offentligheten.",
            usesMediaTemplate ? "Formuler læringsspørsmål om mediehistorie, presse og offentlighet." : "Formuler læringsspørsmål om institusjonell utvikling, styring og samfunnsrolle."
          ];
          path = [
            "Definer hovedobjekt og tidsavgrensning.",
            "Sorter funn etter historisk utvikling.",
            "Analyser eierskap/profil og konfliktlinjer.",
            "Vurder nåværende posisjon i offentligheten.",
            "Lag mulige læringsspørsmål for videre arbeid."
          ];
          ahaSer = {
            tema: themeText,
            hovedspenning: usesMediaTemplate ? "Redaksjonell uavhengighet ↔ økonomisk avhengighet." : "Institusjonell kontinuitet ↔ institusjonell omforming.",
            viktigsteInnsikt: hasMorgenbladet
              ? "Morgenbladet overlever ved institusjonell omforming fra konservativ dagsavis til kultur- og kommentaravis."
              : `${entityName} viser institusjonell omforming gjennom skiftende eierskap, profil og offentlig rolle.`,
            fagkoblinger: usesMediaTemplate
              ? ["Mediehistorie", "Presse og offentlighet", "Eierskap og redaksjonell uavhengighet", "Kulturjournalistikk", "Akademisk offentlighet", "Norsk politisk pressehistorie"]
              : ["Institusjonshistorie", "Offentlighet", "Eierskap og autonomi"],
            nesteSteg: usesMediaTemplate
              ? "Lag en tidslinje med nøkkelvendepunkt og drøft hvordan økonomi og redaksjonell linje påvirker offentlig rolle."
              : "Lag en tidslinje med nøkkelvendepunkt og drøft hvordan styring, økonomi og mandat påvirker samfunnsrollen.",
            kortSvar: insightText
          };
        } else if (publicAdminSignal?.strong) {
          reflection = "Teksten analyserer NAV-reformen og spør hvorfor måloppnåelsen uteblir: skyldes dette hovedsakelig omstillingskostnader, eller mer varige strukturelle utfordringer i styring og organisering?";
          sortItems = [
            { label: "Kort hovedinnsikt", text: "NAVs manglende måloppnåelse kan ikke forklares som midlertidig reformstøy alene." },
            { label: "Tema", text: "NAV-reformen og måloppnåelse." },
            { label: "Hovedspenning", text: "Omstillingskostnad vs. strukturell utfordring." },
            { label: "Hovedargument", text: "Varige problemer i styring, organisering og stat–kommune-samspill svekker måloppnåelsen i NAV-kontorene." },
            { label: "Begreper", text: "NAV-reformen, NAV-kontor, måloppnåelse, statlig styring, kommunale mål, arbeidsrettet oppfølging." },
            { label: "Mulig videre analyse", text: "Undersøk hvordan kontorstørrelse, governance/samstyring og bakkebyråkrati påvirker arbeidsrettet oppfølging." }
          ];
          day = "Ikke dagbokmateriale – ingen dagsoppsummering laget.";
          thoughts = {
            hovedspor: "NAVs resultater må leses som et strukturelt styrings- og organisasjonsproblem, ikke bare implementeringsstøy.",
            lose_tanker: "Skille mellom omstillingsprosess, reformevaluering, kontorstørrelse og stat–kommune-samspill.",
            neste_steg: "Undersøk hvordan statlig styring, kommunale mål og lokal organisering påvirker arbeidsrettet oppfølging."
          };
          list = [
            "Skill mellom midlertidig omstillingsprosess og varige strukturelle utfordringer.",
            "Koble reformevaluering til måloppnåelse i NAV-kontor.",
            "Analyser statlig styring opp mot kommunale mål.",
            "Vurder betydningen av kontorstørrelse for arbeidsrettet oppfølging.",
            "Bruk organisasjonsteori, bakkebyråkrati og governance/samstyring som tolkningsramme."
          ];
          path = [
            "Definer hva måloppnåelse betyr i denne analysen.",
            "Sorter funn etter omstillingskostnad vs. strukturell forklaring.",
            "Analyser stat–kommune-samspill i lokale NAV-kontor.",
            "Sammenlign med teori om bakkebyråkrati og governance.",
            "Formuler konkrete styrings- og organisasjonsimplikasjoner."
          ];
        } else if (literaryAttachmentSignal?.strong && literaryAttachmentEvidence) {
          reflection = "Teksten undersøker hvordan Karl Ove Knausgårds Om våren kan leses i dialog med tilknytningsteori. Den viser hvordan romanen både bruker psykologiske begreper om tilknytning, trygghet, arbeidsmodeller og relasjonell sårbarhet, og samtidig overskrider teorien gjennom autofiksjon, deiksis, performativ skriving, mytologiske bilder og nymaterialistiske perspektiver. Den faglige spenningen ligger mellom psykologisk teori og litterær erkjennelse.";
          sortItems = [
            { label: "Problemstilling", text: "Hvordan kan Knausgårds Om våren leses i dialog med tilknytningsteori?" },
            { label: "Hovedpåstand", text: "Romanen bekrefter deler av tilknytningsteorien, men overskrider den gjennom litterære, mytologiske og nymaterialistiske perspektiver." },
            { label: "Teoretisk ramme", text: "Bowlbys tilknytningsteori, utviklingspsykologi, parterapi og litteraturvitenskapelig analyse." },
            { label: "Litterær metode", text: "Analyse av autofiksjon, deiksis, tiltaleform, performativitet og relasjonen mellom liv og tekst." },
            { label: "Hovedspenning", text: "Psykologisk tilknytningsteori vs. litterær/mytologisk utforskning av tilknytning, forknytning og løsrivelse." },
            { label: "Implikasjon", text: "Litteraturen kan belyse psykologiske problemstillinger på måter fagpsykologien ikke fullt ut fanger." }
          ];
          day = "Ikke dagbokmateriale – ingen dagsoppsummering laget.";
          thoughts = {
            hovedspor: "Knausgårds Om våren leses som en litterær utforskning av tilknytning, løsrivelse og sårbarhet i dialog med psykologisk tilknytningsteori.",
            lose_tanker: "Autofiksjon, deiksis, Bowlby, Linda Boström Knausgård, nymaterialisme og Valborg-motivet bør holdes analytisk adskilt før de kobles.",
            neste_steg: "Skill tydelig mellom hva tilknytningsteorien forklarer, og hva romanens litterære form, materialitet og mytologi tilfører."
          };
          list = [
            "Skill mellom tilknytning som psykologisk teori og tilknytning som litterært motiv.",
            "Analyser hvordan deiksis og tiltaleformen skaper et performativt tilknytningsrom.",
            "Vis hvordan romanen skildrer både tilknytning til barnet og løsrivelse fra ektefellen.",
            "Koble Bowlbys teori til autofiksjonens problem om liv, tekst og ansvar.",
            "Drøft hvordan nymaterialisme og mytologiske bilder utvider analysen utover psykologi."
          ];
          path = [
            "Identifiser romanens bruk av tilknytningsteori.",
            "Analyser deiktisk poetikk og tiltaleform.",
            "Undersøk forholdet mellom far–barn-tilknytning og ekteskapelig løsrivelse.",
            "Sammenlign Knausgårds og Linda Boström Knausgårds perspektiver.",
            "Drøft hvordan nymaterialisme, sårbarhet og mytologi utfordrer en ren psykologisk forklaring."
          ];
        } else {
        const theoryLinks = extractAcademicTheoryLinks(analysisText).slice(0, 5);
        const phraseConcepts = extractAcademicPhraseConcepts(analysisText).slice(0, 8);
        const hasSahelMali = detectAutoAnalysisDomain(analysisText) === "sahel_climate_conflict";
        reflection = hasSahelMali ? "Teksten drøfter klimakonflikt i Sahel/Mali gjennom konkurrerende forklaringsmodeller." : "Teksten drøfter konkurrerende forklaringsmodeller og argumenterer for en mer sammensatt, kontekstuell forståelse.";
        const hovedargument = hasSahelMali ? "Hovedargumentet er at klima/miljø kan være bakgrunnsfaktorer, men at konfliktutvikling primært formes av politikk, historie, maktforhold og marginalisering." : "Hovedargumentet bygger en faglig tolkning som veier teori, metode og funn mot alternative forklaringer.";
        const motargument = hasSahelMali ? "Motargumentet er at knapphetsskolen overvurderer lineære årsakskjeder fra ressursknapphet til vold, og undervurderer institusjoner og aktørmakt." : "Motargumentet viser hvilke alternative forklaringer som utfordrer hovedpåstanden.";
        const teoriKort = theoryLinks.length
          ? theoryLinks.map((item) => `${item.thinker}: ${item.theory}`).join("; ")
          : (hasSahelMali
            ? "Teksten setter miljøsikkerhet og politisk økologi opp mot hverandre."
            : "Teksten kobler teori, metode og analyse for å belyse hovedproblemstillingen.");
        const begreperKort = phraseConcepts.length
          ? phraseConcepts.join(", ")
          : (hasSahelMali ? "ressursknapphet, politisk økologi, miljødegradering" : "problemstilling, teori, metode, funn, tolkning");
        const sitatSetninger = sentences.filter((line) => /["“”«»]|\bifølge\b|\bhevder\b|\bviser til\b/i.test(line)).slice(0, 3);
        const pastander = sitatSetninger.length
          ? sitatSetninger.map((line) => `Påstand i teksten: ${short(line)}`)
          : [hasSahelMali
            ? "Påstand i teksten: Konflikter i Sahel kan ikke forklares tilfredsstillende med klima alene."
            : "Påstand i teksten: Tekstens hovedforklaring må vurderes opp mot alternative tolkninger."];
        sortItems = [
          { label: "Kort hovedinnsikt", text: reflection },
          { label: "Hovedargument", text: hovedargument },
          { label: "Motargument / kritikk", text: motargument },
          { label: "Teorikoblinger", text: teoriKort },
          { label: "Begreper", text: begreperKort },
          { label: "Påstander", text: pastander.join(" ") },
          { label: "Spenning i teksten", text: hasSahelMali ? "Spenningen står mellom en lineær miljø-knapphetsforklaring og en politisk-økologisk forklaring som vektlegger makt og historisk kontekst." : "Spenningen står mellom tekstens hovedforklaring og alternative tolkningsmuligheter." },
          { label: "Mulig videre analyse", text: hasSahelMali ? "Undersøk hvordan lokale maktforhold, statlig politikk og sikkerhetsdynamikk samspiller med klima- og ressursstress i konkrete caser." : "Presiser hvordan metode, teori og empiri støtter hovedpåstanden." }
        ];
        day = "Ikke dagbokmateriale – ingen dagsoppsummering laget.";
        thoughts = {
          hovedspor: hovedargument,
          lose_tanker: "Behold sitater som dokumentasjon, men løft syntesen i egne formuleringer.",
          neste_steg: hasSahelMali ? "Velg én konfliktcase og test forklaringskraften i hver modell mot samme empiriske materiale." : "Velg ett analysegrep som tydelig tester hovedforklaring mot alternativ tolkning."
        };
        list = hasSahelMali
          ? [
              "Skille tydelig mellom empiri, teori og normativ vurdering.",
              "Vis hvilke antakelser som ligger i knapphetsskolen versus politisk økologi.",
              "Bruk sitater som belegg, ikke som ferdig innsikt.",
              "Knytt teori direkte til caser fra Sahel/Mali.",
              "Avslutt med hva analysen endrer i forståelsen av konfliktårsaker."
            ]
          : [
              "Skille tydelig mellom problemstilling, teori, metode og funn.",
              "Vis hvilke antakelser som ligger i hovedforklaringen.",
              "Bruk sitater og eksempler som belegg, ikke som ferdig innsikt.",
              "Knytt teori direkte til tekstens eget materiale.",
              "Avslutt med hva analysen endrer i forståelsen av emnet."
            ];
        path = [
          "Kartlegg hovedpåstand og motpåstand.",
          hasSahelMali ? "Sorter belegg etter forklaringsmodell." : "Sorter belegg etter teori, metode og empiri.",
          hasSahelMali ? "Test modellene mot samme case." : "Test forklaringene mot samme tekstmateriale.",
          "Vurder forklaringskraft og blinde soner.",
          "Formuler en syntetiserende konklusjon."
        ];
        }
      } else if (textType === "project_note") {
        reflection = "Dette er et prosjektnotat med tydelig problem og mål. Neste gevinst ligger i å koble løsning til konkrete filer/funksjoner.";
        sortItems = ["Problem","Løsning","Filer/funksjoner","Neste steg"].map((label, idx) => ({ label, text: sentences[idx] || "Trenger kort presisering i teksten." }));
        path = ["Definer målet i én setning.", "Sorter oppgaver etter problem/løsning/filer.", "Velg neste konkrete handling."];
      } else if (textType === "theory_idea") {
        reflection = "Dette er en idé-/teoritekst der begreper og premisser bygges opp stegvis.";
        sortItems = ["Hovedpåstand","Begreper","Premisser","Mulige innvendinger","Videre utvikling"].slice(0,4).map((label, idx) => ({ label, text: sentences[idx] || "Presiser dette punktet videre." }));
      }

      if (!list.length) list.push("Legg inn litt mer kontekst, så lager jeg en skarp liste.");
      const localInsights = [];
      if (textType === "literary_diary") {
        const evidence = collectLiteraryDiaryEvidence(raw, sentences);
        if (evidence.hasPlaceScene && evidence.hasInnerMonologue) localInsights.push("Ytre steder brukes til å speile fortellerens indre bevegelse.");
        if (evidence.hasSRelation) localInsights.push("Relasjonen fungerer som et emosjonelt anker i dagbokbevegelsen.");
        if (evidence.hasStrangers) localInsights.push("Møter med fremmede gjør teksten sosialt urolig og uforutsigbar.");
        if (evidence.hasTravel && evidence.hasNomadism) localInsights.push("Reise og nomadisme brukes som bilder på frihet og ny identitet.");
        else if (evidence.hasTravel) localInsights.push("Reisemotivet brukes som bilde på frihet og ny retning.");
        else if (evidence.hasNomadism) localInsights.push("Nomadisme brukes som bilde på frihet og identitet i bevegelse.");
        if (evidence.hasWriterLife) localInsights.push("Forfatterlivet blir en måte å gi uro form og retning.");
        if (evidence.hasShameGuilt) localInsights.push("Skyld, skam og selvforsvar skaper tekstens indre friksjon.");
        if (!localInsights.length) localInsights.push("Dagbokformen bærer en assosiativ bevegelse som kan strammes med tydeligere motivspor.");
      } else if (textType === "opinion_article") {
        const evidence = collectOpinionArticleEvidence(raw, sentences);
        const quality = buildOpinionArticleQualityAnalysis(raw, evidence, sentences);
        localInsights.push(`Argumentets kjerne: ${quality.thesis}`);
        localInsights.push(`Retorisk styrke: ${quality.strengths[0] || "Teksten binder flere politiske felt inn i én omstillingsfortelling."}`);
        localInsights.push(`Svakhet/manglende bro: ${quality.missingLinks[0] || quality.weaknesses[0] || "Broen mellom kritikk og konkret gjennomføring er for svak."}`);
        localInsights.push(`Utviklingsmulighet: ${quality.editorialNextStep} ${quality.sharperEnding}`);
      } else if (textType === "academic_article") {
        const literaryAttachmentSignal = detectLiteraryAttachmentSignal(raw);
        const literaryAttachmentEvidence = sourceHasAny(raw, [/\bknausgård\b/i, /\bkarl ove\b/i, /\bom våren\b/i]);
        const hasSahelMaliEvidence = sourceHasAny(raw, [/\bsahel\b/i, /\bmali\b/i, /\bknapphetsskolen\b/i, /\bressursknapphet\b/i, /\bmiljøsikkerhet\b/i, /\bpolitisk økologi\b/i]);
        const religiousLexiconSignal = inferReligiousLexiconEvidence(raw);
        if (religiousLexiconSignal?.strong) {
          localInsights.push("Hovedinnsikt: Pinse markerer Den hellige ånds komme til apostlene og forstås som kirkens fødselsdag.");
          localInsights.push("Hovedspenning: Språkforvirring ↔ språkforståelse, og utvalgte mottakere ↔ gave til alle døpte.");
          localInsights.push("Symbolsk kontrast: Babels tårn fungerer som motbilde til pinsefortellingens språkfellesskap.");
          localInsights.push("Videre analyse: Sammenlign tungetale og tydning på tvers av protestantisk, karismatisk og østlig tradisjon.");
        } else if (literaryAttachmentSignal?.strong && literaryAttachmentEvidence) {
          localInsights.push("Hovedinnsikt: Om våren gjør tilknytning til et eksistensielt og litterært nøkkelbegrep, ikke bare et psykologisk fagbegrep.");
          localInsights.push("Hovedargument: Romanen bekrefter deler av tilknytningsteorien, men viser også dens begrensninger gjennom skildringer av sårbarhet, sykdom, kropp, materialitet og uforklarlige vekstkrefter.");
          localInsights.push("Motargument/kritikk: En ren tilknytningsteoretisk lesning blir for smal fordi romanen åpner for mytologiske, autofiksjonelle og nymaterialistiske forklaringsnivåer.");
          localInsights.push("Spenning: Psykologisk tilknytningsteori står mot romanens bredere litterære utforskning av tilknytning, forknytning og løsrivelse.");
        } else {
        const hovedargument = (sortItems.find((item) => String(item?.label || "").toLowerCase() === "hovedargument") || {}).text
          || "Hovedargumentet bygger en faglig tolkning som veier problemstilling, teori, metode og empiri.";
        const motargument = (sortItems.find((item) => String(item?.label || "").toLowerCase().includes("motargument")) || {}).text
          || "Motargumentet viser hvilke alternative forklaringer som utfordrer hovedpåstanden.";
        const institutionalHistorySignal = detectInstitutionalMediaHistorySignal(raw);
        if (institutionalHistorySignal?.strong) {
          const entityName = extractMainInstitutionName(raw);
          const hasMorgenbladet = /\bmorgenbladet\b/i.test(raw);
          const usesMediaTemplate = Boolean(institutionalHistorySignal?.isNewspaperText || institutionalHistorySignal?.isMediaText);
          localInsights.push(`Tema: ${hasMorgenbladet ? "Morgenbladets historiske utvikling, eierskap, politiske profil og rolle som norsk nisjeavis." : `${entityName}s historiske utvikling, eierskap, profil og rolle i offentligheten.`}`);
          localInsights.push(`Hovedspenning: ${usesMediaTemplate ? "Redaksjonell uavhengighet ↔ økonomisk avhengighet." : "Institusjonell kontinuitet ↔ institusjonell omforming."}`);
          localInsights.push(`Viktigste innsikt: ${hasMorgenbladet ? "Morgenbladet overlever ved institusjonell omforming fra konservativ dagsavis til kultur- og kommentaravis." : `${entityName} viser institusjonell omforming gjennom skiftende eierskap, profil og offentlig rolle.`}`);
        } else {
          localInsights.push(`Hovedinnsikt: ${reflection}`);
          localInsights.push(`Hovedargument: ${hovedargument}`);
          localInsights.push(`Motargument/kritikk: ${motargument}`);
          localInsights.push(hasSahelMaliEvidence
            ? "Spenningen i teksten ligger mellom knapphetsskolen og politisk økologi."
            : "Spenningen i teksten ligger mellom hovedforklaring og alternative tolkninger.");
        }
        }
      } else {
        localInsights.push(`Mønster: ${keywords[0] || "temaet"} går igjen og bærer teksten.`);
        localInsights.push(reply ? `AHA-responsen peker videre på: ${toSentences(reply)[0] || reply}` : "Videre innsikt kan styrkes med mer konkret tekst.");
      }
      const overlap = currentInsights()
        .map((ins) => String(ins.summary || ins.title || ""))
        .filter((text) => keywords.some((k) => text.toLowerCase().includes(k)))
        .slice(-2);
      const maxInsightCards = textType === "opinion_article" || textType === "academic_article" ? 4 : 3;
      const insightCards = [...localInsights, ...overlap].slice(0, maxInsightCards);

      return normalizeAcademicAfterworkPayload(
        { textType, reflection, sortItems, day, thoughts, list: list.slice(0, 6), insightCards, path: path.slice(0, 5), ahaSer },
        raw,
        textType
      );
    }

    function buildAutoOutputFallbackPayload(userText, ahaReply, options = {}) {
      const sourceText = String(userText || "");
      if (!AHA_RUNTIME_KNOWLEDGE_POLICY.legacyArticleTemplatesEnabled && detectTextType(sourceText) === "academic_article") {
        return buildSourceGroundedAcademicPayload(sourceText);
      }
      const replyText = String(ahaReply || "");
      const combined = `${sourceText} ${replyText}`.toLowerCase();
      const hasSahelAcademicEvidence = sourceHasAny(sourceText, [/\bsahel\b/i, /\bmali\b/i, /\bressursknapphet\b/i, /\bpolitisk økologi\b/i, /\bknapphetsskolen\b/i, /\bmiljøsikkerhet\b/i, /\benvironmental security\b/i, /\bclimate conflict\b/i]);
      const hasKnausgardEvidence = sourceHasAny(sourceText, [/\bknausgård\b/i, /\bkarl ove\b/i]);
      const hasOmVaarenEvidence = sourceHasAny(sourceText, [/\bom våren\b/i]);
      const hasLindaEvidence = sourceHasAny(sourceText, [/\blinda boström knausgård\b/i]);
      const hasAttachmentTheoryEvidence = sourceHasAny(sourceText, [/\btilknytningsteori\b/i, /\bbowlby\b/i, /\battachment\b/i]);
      const hasLiteraryWorkEvidence = hasKnausgardEvidence || hasOmVaarenEvidence || hasLindaEvidence;
      const academicSignals = /(ressursknapphet|politisk økologi|knapphetsskolen|miljøsikkerhet|climate conflict|environmental security|tilknytningsteori|autofiksjon|deiksis|knausgård)/i;
      const publicAdminSignal = detectPublicAdministrationReformSignal(sourceText);
      const baseTextType = detectTextType(sourceText);
      const isAcademic = baseTextType === "academic_article" || academicSignals.test(combined) || Boolean(publicAdminSignal?.strong) || hasSahelAcademicEvidence || hasAttachmentTheoryEvidence || hasLiteraryWorkEvidence;
      const literaryAttachmentSignal = hasLiteraryWorkEvidence ? detectLiteraryAttachmentSignal(combined) : { strong: false };
      const isNavAcademic = Boolean(publicAdminSignal?.strong);
      const isSahelClimateAcademic = hasSahelAcademicEvidence;
      const isLiteraryAttachmentAcademic = hasLiteraryWorkEvidence && literaryAttachmentSignal?.strong;
      const reflectionCandidate = [replyText, sourceText]
        .flatMap((text) => String(text || "").split(/(?<=[.!?])\s+/))
        .map((part) => part.trim())
        .find((part) => part && part.length >= 20 && /[a-zæøå]/i.test(part));

      const payload = {
        textType: baseTextType,
        reflection: reflectionCandidate || sourceText || replyText || "Teksten peker på flere mulige tolkninger.",
        sortItems: [],
        day: "",
        thoughts: {},
        list: [],
        insightCards: [],
        path: [],
        subjectMatches: Array.isArray(options.subjectMatches) ? options.subjectMatches : []
      };

      if (isAcademic) {
        payload.textType = "academic_article";
        payload.day = "Ikke dagbokmateriale – ingen dagsoppsummering laget.";
        if (isNavAcademic) {
          payload.sortItems = [
            { label: "Kort hovedinnsikt", text: "NAVs manglende måloppnåelse skyldes ikke bare midlertidig omstilling, men også varige strukturelle utfordringer." },
            { label: "Tema", text: "NAV-reformen og måloppnåelse." },
            { label: "Hovedspenning", text: "Omstillingskostnad vs. strukturell utfordring." },
            { label: "Hovedargument", text: "Styring, organisering og stat–kommune-samspill påvirker måloppnåelsen i NAV-kontorene." }
          ];
          payload.list = [
            "Skill mellom omstillingsprosess og varige strukturelle utfordringer.",
            "Analyser hvordan statlig styring og kommunale mål påvirker måloppnåelse.",
            "Vurder kontorstørrelse og lokal organisering i arbeidsrettet oppfølging.",
            "Koble reformevaluering til organisasjonsteori, bakkebyråkrati og governance/samstyring."
          ];
          payload.insightCards = [
            "Hovedinnsikt: NAVs manglende måloppnåelse kan ikke forklares som midlertidig reformstøy alene.",
            "Hovedargument: Statlig styring, kommunale mål og lokal organisering skaper varige strukturelle utfordringer.",
            "Spenning i teksten: Omstillingskostnad versus strukturell forklaring.",
            "Neste analyse: Undersøk hvordan stat–kommune-samspill former arbeidsrettet oppfølging."
          ];
          payload.path = [
            "Definer måloppnåelse i NAV-reformen.",
            "Sorter funn etter omstillingskostnad vs. strukturell forklaring.",
            "Analyser stat–kommune-samspill og kontorstørrelse.",
            "Test tolkningene mot organisasjonsteori og bakkebyråkrati."
          ];
          payload.thoughts = {
            hovedspor: "NAV-reformen bør forstås gjennom strukturelle styrings- og organisasjonsforhold.",
            lose_tanker: "Skille tydelig mellom implementeringsstøy, kommunale mål og varige organisasjonsutfordringer.",
            neste_steg: "Undersøk hvordan statlig styring, kommunale mål og lokal organisering påvirker arbeidsrettet oppfølging."
          };
        } else if (isSahelClimateAcademic) {
          payload.sortItems = [
            { label: "Kort hovedinnsikt", text: "Teksten utfordrer en enkel klimaforklaring på konflikt og peker mot politiske, historiske og maktmessige årsaker." },
            { label: "Hovedargument", text: "Klima og miljø kan være bakgrunnsfaktorer, men konfliktutvikling forklares bedre gjennom politikk, historie, marginalisering og institusjonelle forhold." },
            { label: "Motargument / kritikk", text: "Knapphetsskolens lineære årsakskjede fra miljøforringelse til vold kritiseres for svak empirisk og kontekstuell forklaringskraft." },
            { label: "Spenning i teksten", text: "Spenningen står mellom miljøsikkerhet/knapphetsskolen og politisk økologi." }
          ];
          payload.list = [
            "Skille tydelig mellom empiri, teori og normativ vurdering.",
            "Sammenlikn knapphetsskolen og politisk økologi med samme casegrunnlag.",
            "Vis hvordan politisk marginalisering påvirker konfliktforløp.",
            "Bruk sitater som belegg, men la syntesen være i egne ord.",
            "Avslutt med hva analysen endrer i konfliktforståelsen."
          ];
          payload.insightCards = [
            "Hovedinnsikt: Konflikter i Sahel/Mali kan ikke forklares lineært med klima alene.",
            "Hovedargument: Politikk, historie og maktforhold gir sterkere forklaringskraft enn ressursdeterminisme.",
            "Motargument/kritikk: Knapphetsskolen undervurderer institusjoner, aktørmakt og lokal kontekst.",
            "Spenning i teksten: Miljøsikkerhet og politisk økologi peker på ulike årsakslogikker."
          ];
          payload.path = [
            "Kartlegg hovedpåstand og motpåstand.",
            "Sorter belegg etter forklaringsmodell.",
            "Test modellene mot samme Mali-case.",
            "Formuler syntese med blinde soner og forklaringskraft."
          ];
          payload.thoughts = {
            hovedspor: "Konfliktutvikling forklares best når politiske og historiske forhold vektes tyngre enn lineær knapphet.",
            lose_tanker: "Begreper som miljøsikkerhet, marginalisering og ressursknapphet må avgrenses tydelig for å unngå begrepsglidning.",
            neste_steg: "Velg én empirisk case og vis konkret hva hver modell forklarer – og overser."
          };
        } else if (isLiteraryAttachmentAcademic) {
          payload.reflection = "Teksten undersøker hvordan Karl Ove Knausgårds Om våren kan leses i dialog med tilknytningsteori. Den viser hvordan romanen både bruker psykologiske begreper om tilknytning, trygghet, arbeidsmodeller og relasjonell sårbarhet, og samtidig overskrider teorien gjennom autofiksjon, deiksis, performativ skriving, mytologiske bilder og nymaterialistiske perspektiver. Den faglige spenningen ligger mellom psykologisk teori og litterær erkjennelse.";
          payload.sortItems = [
            { label: "Problemstilling", text: "Hvordan kan Knausgårds Om våren leses i dialog med tilknytningsteori?" },
            { label: "Hovedpåstand", text: "Romanen bekrefter deler av tilknytningsteorien, men overskrider den gjennom litterære, mytologiske og nymaterialistiske perspektiver." },
            { label: "Teoretisk ramme", text: "Bowlbys tilknytningsteori, utviklingspsykologi, parterapi og litteraturvitenskapelig analyse." },
            { label: "Litterær metode", text: "Analyse av autofiksjon, deiksis, tiltaleform, performativitet og relasjonen mellom liv og tekst." },
            { label: "Hovedspenning", text: "Psykologisk tilknytningsteori vs. litterær/mytologisk utforskning av tilknytning, forknytning og løsrivelse." },
            { label: "Implikasjon", text: "Litteraturen kan belyse psykologiske problemstillinger på måter fagpsykologien ikke fullt ut fanger." }
          ];
          payload.insightCards = [
            "Hovedinnsikt: Om våren gjør tilknytning til et eksistensielt og litterært nøkkelbegrep, ikke bare et psykologisk fagbegrep.",
            "Hovedargument: Romanen bekrefter deler av tilknytningsteorien, men viser også dens begrensninger gjennom skildringer av sårbarhet, sykdom, kropp, materialitet og uforklarlige vekstkrefter.",
            "Motargument/kritikk: En ren tilknytningsteoretisk lesning blir for smal fordi romanen åpner for mytologiske, autofiksjonelle og nymaterialistiske forklaringsnivåer.",
            "Spenning: Psykologisk tilknytningsteori står mot romanens bredere litterære utforskning av tilknytning, forknytning og løsrivelse."
          ];
          payload.list = ["Skill mellom tilknytning som psykologisk teori og tilknytning som litterært motiv.","Analyser hvordan deiksis og tiltaleformen skaper et performativt tilknytningsrom.","Vis hvordan romanen skildrer både tilknytning til barnet og løsrivelse fra ektefellen.","Koble Bowlbys teori til autofiksjonens problem om liv, tekst og ansvar.","Drøft hvordan nymaterialisme og mytologiske bilder utvider analysen utover psykologi."];
          payload.path = ["Identifiser romanens bruk av tilknytningsteori.","Analyser deiktisk poetikk og tiltaleform.","Undersøk forholdet mellom far–barn-tilknytning og ekteskapelig løsrivelse.","Sammenlign Knausgårds og Linda Boström Knausgårds perspektiver.","Drøft hvordan nymaterialisme, sårbarhet og mytologi utfordrer en ren psykologisk forklaring."];
          payload.thoughts = { hovedspor: "Knausgårds Om våren leses som en litterær utforskning av tilknytning, løsrivelse og sårbarhet i dialog med psykologisk tilknytningsteori.", lose_tanker: "Autofiksjon, deiksis, Bowlby, Linda Boström Knausgård, nymaterialisme og Valborg-motivet bør holdes analytisk adskilt før de kobles.", neste_steg: "Skill tydelig mellom hva tilknytningsteorien forklarer, og hva romanens litterære form, materialitet og mytologi tilfører." };
          payload.subjectMatches = ["Litteraturvitenskap","Psykologi","Tilknytningsteori","Autofiksjon","Narratologi","Deiksis","Nymaterialisme","Virkelighetslitteratur"];
        } else if (hasAttachmentTheoryEvidence) {
          payload.sortItems = [
            { label: "Problemstilling", text: "Hvordan brukes tilknytningsteori i tekstens analyse?" },
            { label: "Hovedpåstand", text: "Teksten bruker tilknytning som tolkningsramme for relasjon, trygghet og sårbarhet." },
            { label: "Teori", text: "Tydeliggjør hvilke begreper fra tilknytningsteori som faktisk brukes i materialet." },
            { label: "Implikasjon", text: "Skill mellom hva teorien forklarer, og hva teksten selv tilfører gjennom form og tolkning." }
          ];
          payload.list = [
            "Definer sentrale tilknytningsbegreper presist.",
            "Koble teori direkte til konkrete tekstbelegg.",
            "Skill mellom observasjon, tolkning og teoretisk påstand.",
            "Vurder alternative forklaringer på samme materiale."
          ];
          payload.insightCards = [
            "Hovedinnsikt: Tilknytningsteori brukes som analytisk ramme for relasjonelle mønstre.",
            "Hovedargument: Teorien må forankres i konkrete tekstbelegg for å gi forklaringskraft.",
            "Motargument/kritikk: En for bred teorianvendelse kan skjule tekstens egne nyanser.",
            "Neste analyse: Skill tydelig mellom teori, metode, empiri og tolkning."
          ];
          payload.path = [
            "Avklar problemstilling og begrepsbruk.",
            "Sorter belegg etter teori, metode og empiri.",
            "Test hovedtolkning mot et alternativ.",
            "Formuler en nøktern faglig syntese."
          ];
        } else {
          payload.sortItems = [
            { label: "Problemstilling", text: "Hva er tekstens sentrale faglige spørsmål?" },
            { label: "Hovedpåstand", text: "Teksten argumenterer for en tydelig faglig tolkning som bør testes mot alternative forklaringer." },
            { label: "Faglig spenning", text: "Spenningen ligger mellom hovedforklaring og alternative forståelser i materialet." },
            { label: "Implikasjon", text: "Presiser metode, teori og empiri for å styrke analysens forklaringskraft." }
          ];
        }
      }
      return payload;
    }

    return {
      getUrlDominanceInfo,
      isSportsArticleAnalysis,
      buildArticleSourceTextFromAnalysis,
      buildArticleAutoOutputsFromAnalysis,
      AHA_RUNTIME_KNOWLEDGE_POLICY,
      buildSourceGroundedAcademicPayload,
      applyRuntimeKnowledgePolicy,
      isTransientAnalysisDocument,
      buildAutoOutputs,
      buildAutoOutputFallbackPayload
    };
  }

  const publicApi = Object.assign({}, global.AHAChatAutoAnalysis || {}, { create });
  global.AHAChatAutoAnalysis = publicApi;
  global.AHAModuleApi?.register?.("chat.autoAnalysis", publicApi, { version: 1, legacyGlobal: "AHAChatAutoAnalysis", exports: Object.keys(publicApi) });
})(window);
