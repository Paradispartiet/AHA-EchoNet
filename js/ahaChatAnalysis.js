// ahaChatAnalysis.js
// Rene analyse-hjelpere for AHA Chat, skilt ut fra ahaChat.js.
// Bygger og normaliserer kanonisk analyse (confidence, warnings, History Go-lenker
// fra domene, gyldig form, fallback-meta) og kvalitetsanalyse for meningsartikler.
//
// Selvinneholdt: ingen DOM, lagring, chamber eller motor-tilgang, og ingen
// avhengighet tilbake til ahaChat.js. Eksponerer window.AHAChatAnalysis.
// Lastes før ahaChat.js.

(function (global) {
  "use strict";

  function detectOpinionDomain(evidence) {
    if (evidence?.hasClimateTransition && evidence?.hasOilFossil) return "climate_transition";
    if (evidence?.hasMediaPolicy || evidence?.hasVatOrTax || evidence?.hasPressFreedom) return "media_policy";
    if (evidence?.hasPoliticalCritique || evidence?.hasSocialDemocracy || evidence?.hasPowerDistribution) return "general_political";
    return "general_argument";
  }

  function buildOpinionArticleQualityAnalysis(raw, evidence, sentences) {
    const s = Array.isArray(sentences) ? sentences : [];
    const first = s[0] || "Teksten argumenterer for en tydelig politisk kursendring.";
    const domain = detectOpinionDomain(evidence);
    let textIntent = "klargjøre en politisk hovedpåstand og overbevise leseren om en tydeligere kurs.";
    let centralMovement = "kritikk av dagens linje til en mer forpliktende løsning.";
    let rhetoricalPower = "kontrasten mellom status quo og et mulig alternativ.";
    let thesis = first;
    let conflict = "Teksten setter dagens politiske kurs opp mot behovet for en mer forpliktende retning.";
    let argumentLine = "Argumentasjonen går fra problemforståelse til forslag om løsning.";
    let strengths = ["Teksten tydeliggjør en konfliktlinje som gir retning for argumentet.", "Flere partier peker mot en konkret samfunnskonsekvens.", "Kontraster brukes for å løfte hva som står på spill."];
    let weaknesses = ["Overgangen mellom kritikk og konkret gjennomføring blir tidvis for brå.", "Noen belegg er prinsipielle uten nok konkretisering.", "Avslutningen kan tydeligere samle hva leseren skal sitte igjen med."];
    let missingLinks = ["Leseren trenger en tydeligere bro mellom problembeskrivelse og prioriterte tiltak.", "Det bør synliggjøres hvem som faktisk får ansvar og effekt av tiltakene."];
    let sharperEnding = "Avslutt med én tydelig konsekvens: hva samfunnet taper hvis kursen ikke endres.";
    let keyConcepts = ["hovedpåstand", "konflikt", "belegg", "konsekvens"];
    let policySolution = "Teksten antyder en løsning, men den bør formuleres tydeligere.";
    let weaknessPhrase = "overgangen mellom problemforståelse og løsning";

    if (domain === "climate_transition") {
      textIntent = "svare på hva Norge skal omstilles fra og til";
      centralMovement = "kritikk av oljeavhengighet til forslag om fornybar energi, lokal verdiskaping og sirkulærøkonomi";
      rhetoricalPower = "at omstilling løftes fra teknologispråk til samfunnsspråk: natur, arbeid og beslutningsmakt";
      thesis = "Norge må omstilles fra fossil oljeavhengighet til et bærekraftig samfunn innenfor naturens tålegrenser.";
      conflict = "Teksten retter seg mot en politikk som lover grønn retning, men fortsatt binder ressurser til fossil logikk.";
      argumentLine = "Argumentasjonen går fra kritikk av dagens modell til en plan for energiomstilling, lokal makt og naturhensyn.";
      strengths = [
        "Teksten samler klima, natur, energi og maktspørsmål i én sammenhengende argumentasjon.",
        evidence.hasCircularEconomy ? "Sirkulærøkonomi kobles til arbeid og lokal verdiskaping på en konkret måte." : "Konflikten blir tydelig når teksten viser hvilke ressurser som bindes i dagens kurs.",
        "Kontrastene mellom dagens kurs og alternativ retning gir teksten retorisk driv."
      ];
      weaknesses = [
        "Overgangen mellom kritikk og konkret plan kan strammes slik at argumentrekken blir tydeligere.",
        evidence.hasIndigenousRights ? "Samiske rettigheter bør få en mer eksplisitt funksjon i hovedargumentet." : "Noen prinsipielle partier trenger et tydeligere eksempel.",
        "Avslutningen kan tydeliggjøre hva som faktisk står på spill ved å utsette omstillingen."
      ];
      missingLinks = [
        "Det trengs en klarere bro mellom kritikk av oljeavhengighet og hvilke grep som flytter investeringer og prioriteringer.",
        "Begrepet «omstilling» bør avgrenses: hva fases ned, hva bygges opp, og hvem får beslutningsmakt."
      ];
      sharperEnding = "Avslutt med hva Norge risikerer å tape økonomisk, økologisk og sosialt dersom omstillingen utsettes.";
      keyConcepts = ["omstilling", "oljeavhengighet", "naturhensyn", "lokal verdiskaping"];
      policySolution = "Teksten peker på en overgang fra fossil kapitalbinding til fornybar energi, lokal verdiskaping og sirkulærøkonomi.";
      weaknessPhrase = "overgangen mellom kritikk og konkret plan";
      if (evidence.hasCircularEconomy) keyConcepts.push("sirkulærøkonomi");
      if (evidence.hasIndigenousRights) keyConcepts.push("samiske rettigheter");
    } else if (domain === "media_policy") {
      textIntent = "vurdere hvordan mediepolitikk og avgiftsregler påvirker ytringsrom, journalistikk og redaktørstyrte medier.";
      centralMovement = "kritikk av dagens økonomiske rammer til forslag om mer treffsikre mediepolitiske virkemidler.";
      rhetoricalPower = "koblingen mellom demokratiske hensyn og konkrete økonomiske rammevilkår for redaktørstyrte medier.";
      thesis = evidence.hasVatOrTax ? "Moms- og avgiftsregler for medier må utformes slik at de styrker redaktørstyrt journalistikk og reelt ytringsrom." : first;
      conflict = "Teksten peker på spenningen mellom markedslogikk og behovet for mediepolitikk som sikrer redaksjonell bærekraft.";
      argumentLine = "Argumentasjonen går fra problemene i dagens ordninger til forslag som gir bedre økonomisk handlingsrom for journalistikk.";
      strengths = ["Teksten kobler ytringsfrihet til konkrete økonomiske virkemidler.", "Konflikten mellom kortsiktig lønnsomhet og langsiktig offentlighet blir tydelig.", "Resonnementet binder sammen politikk, økonomi og redaksjonelt ansvar."];
      weaknesses = ["Noen påstander trenger tydeligere dokumentasjon eller eksempel.", "Skillet mellom kritikk av ordningen og foreslått modell kan markeres skarpere.", "Avslutningen kan tydeligere formulere demokratisk konsekvens."];
      missingLinks = ["Det bør vises tydeligere hvordan foreslåtte virkemidler faktisk påvirker redaksjonell kapasitet.", "Argumentet trenger en klar prioritering mellom ulike mediepolitiske tiltak."];
      sharperEnding = "Avslutt med hva offentligheten mister når økonomiske rammer svekker redaktørstyrt journalistikk.";
      keyConcepts = ["mediepolitikk", "ytringsfrihet", "moms", "redaktørstyrte medier"];
      policySolution = "Teksten peker mot mediepolitiske rammer som styrker redaktørstyrt journalistikk og økonomisk handlingsrom.";
      weaknessPhrase = "broen mellom prinsipiell mediekritikk og konkret virkemiddel";
    } else if (domain === "general_political") {
      textIntent = "tolke en politisk konflikt og argumentere for en alternativ prioritering.";
      centralMovement = "diagnose av dagens politiske kurs til et mer forpliktende forslag om retning.";
      rhetoricalPower = "at teksten tydeliggjør hvem som vinner og taper på dagens prioriteringer.";
      keyConcepts = ["politisk konflikt", "prioritering", "belegg", "konsekvens"];
      policySolution = "Teksten peker mot en tydeligere politisk prioritering enn dagens kurs.";
      weaknessPhrase = "overgangen mellom problemforståelse og løsning";
    }
    const suggestedStructure = [
      "Spiss hovedpåstanden til én setning tidlig i teksten.",
      "Flytt den konkrete planen tidligere: hva vi går fra, hva vi går til, og hvem som får makt i overgangen.",
      "Bygg hvert hovedledd med ett konkret belegg (eksempel, tall eller konsekvens).",
      "Marker tydelig vendepunktet fra kritikk til løsning.",
      "Avslutt med en tydelig samfunnskonsekvens dersom kursen videreføres."
    ];
    const editorialNextStepByDomain = {
      climate_transition: "Stram overgangen mellom kritikk og konkret plan ved å vise hvilke grep som flytter investeringer, kraft og kompetanse.",
      media_policy: "Vis tydeligere hvordan foreslåtte virkemidler påvirker redaksjonell kapasitet og økonomisk handlingsrom.",
      general_political: "Bygg en klarere bro fra kritikk til forslag, med ett konkret belegg."
    };
    const editorialNextStep = editorialNextStepByDomain[domain] || (weaknesses[0] || "Stram overgangen mellom kritikk og konkret plan.");
    return { domain, textIntent, centralMovement, rhetoricalPower, thesis, conflict, argumentLine, strengths, weaknesses, weaknessPhrase, missingLinks, suggestedStructure, editorialNextStep, sharperEnding, keyConcepts, policySolution };
  }

  function isValidCanonicalAnalysisShape(value) {
    const candidate = value && typeof value === "object" ? value : null;
    if (!candidate) return false;
    if (typeof candidate.contentType !== "string") return false;
    if (typeof candidate.domain !== "string") return false;
    if (typeof candidate.theme !== "string") return false;
    if (typeof candidate.mainTension !== "string") return false;
    if (typeof candidate.keyInsight !== "string") return false;
    if (!Array.isArray(candidate.fieldConnections)) return false;
    if (!Array.isArray(candidate.historyGoLinks)) return false;
    if (!Array.isArray(candidate.suggestedActions)) return false;
    if (!Array.isArray(candidate.warnings)) return false;

    const confidence = candidate.confidence && typeof candidate.confidence === "object" ? candidate.confidence : null;
    if (!confidence) return false;
    const confidenceKeys = ["contentType", "domain", "theme", "mainTension", "historyGoLinks"];
    for (const key of confidenceKeys) {
      const n = Number(confidence[key]);
      if (!Number.isFinite(n) || n < 0 || n > 1) return false;
    }

    if (candidate.historyGoLinks.length > 0) {
      for (const link of candidate.historyGoLinks) {
        if (!link || typeof link !== "object") return false;
        if (typeof link.type !== "string") return false;
        if (typeof link.id !== "string") return false;
        if (typeof link.title !== "string") return false;
        if (typeof link.reason !== "string") return false;
      }
    }

    return true;
  }

  function buildPythonFallbackMeta(baseMeta, reason, details = {}) {
    const meta = Object.assign({}, baseMeta, { source: "javascript_fallback", reason: reason || "python_error" });
    if (typeof details.status === "number") meta.status = details.status;
    if (typeof details.url === "string" && details.url) meta.url = details.url;
    return meta;
  }

  function normalizeAnalysisConfidence(value) {
    const src = value && typeof value === "object" ? value : {};
    const pick = (key, fallback) => {
      const n = Number(src[key]);
      const v = Number.isFinite(n) ? n : fallback;
      return Math.max(0, Math.min(1, v));
    };
    return {
      contentType: pick("contentType", 0.7),
      domain: pick("domain", 0.6),
      theme: pick("theme", 0.6),
      mainTension: pick("mainTension", 0.55),
      historyGoLinks: pick("historyGoLinks", 0.5)
    };
  }

  function normalizeAnalysisWarnings(value) {
    const items = Array.isArray(value) ? value : [];
    return items.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 8);
  }

  function buildHistoryGoLinksFromDomain(domain, sourceText, canonicalSer) {
    if (domain === "institutional_media_history") {
      return [{
        type: "topic",
        id: "morgenbladet",
        title: "Morgenbladet",
        reason: "Teksten handler om pressehistorie, offentlighet og institusjonell utvikling."
      }];
    }
    if (domain === "public_administration_reform") {
      return [{
        type: "topic",
        id: "nav_reformen",
        title: "NAV-reformen",
        reason: "Teksten drøfter måloppnåelse, styring og organisering i offentlig forvaltning."
      }];
    }
    if (domain === "literary_attachment") {
      return [{
        type: "topic",
        id: "tilknytningsteori_litteratur",
        title: "Tilknytningsteori i litteratur",
        reason: "Teksten kobler litterær analyse og psykologiske begreper."
      }];
    }
    return [];
  }

  global.AHAChatAnalysis = Object.assign({}, global.AHAChatAnalysis || {}, {
    detectOpinionDomain,
    buildOpinionArticleQualityAnalysis,
    isValidCanonicalAnalysisShape,
    buildPythonFallbackMeta,
    normalizeAnalysisConfidence,
    normalizeAnalysisWarnings,
    buildHistoryGoLinksFromDomain
  });
})(window);
