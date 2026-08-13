// ahaChatAnalysisPolicy.js
// Akademisk domenepolicy, normalisering og kanonisk kildegrunning for AHA Chat.

(function (global) {
  "use strict";

  function create(deps = {}) {
    const {
      signals,
      resolveConceptTerm,
      normalizeDisplayText,
      detectPublicAdministrationReformSignal,
      detectPublicAdministrationSignal,
      toSentences,
      cleanArticleText,
      sourceHash,
      takeKeywords,
      normalizeConceptKey,
      inferReligiousLexiconEvidence,
      detectTextType,
      applyRuntimeKnowledgePolicy,
      getRuntimeKnowledgePolicy
    } = deps;

  function normalizeConceptSurface(value) {
    return resolveConceptTerm(value)
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeVisibleAcademicLabel(value) {
    const text = String(value || "");
    if (!text) return "";
    return text
      .replace(/\bnavkontore\b/gi, "NAV-kontorene")
      .replace(/\bnavkontorene\b/gi, "NAV-kontorene")
      .replace(/\bnavkontorer\b/gi, "NAV-kontorene")
      .replace(/\bnav-kontorene\b/gi, "NAV-kontorene")
      .replace(/\bnav-kontorer\b/gi, "NAV-kontorene")
      .replace(/\bnav reformen\b/gi, "NAV-reformen")
      .replace(/\bnavreformen\b/gi, "NAV-reformen")
      .replace(/\bnav-reformen\b/gi, "NAV-reformen");
  }
  function normalizeAcademicConceptLabel(value) {
    return normalizeVisibleAcademicLabel(value);
  }

  function filterCrossDomainTextItems(items, sourceText) {
    const src = String(sourceText || "");
    const list = Array.isArray(items) ? items : [];
    const sourceHasPublicAdmin = Boolean(detectPublicAdministrationReformSignal(src)?.strong);
    const sourceHasSahelMali = /(sahel|mali|politisk økologi|knapphetsskolen|ressursknapphet|miljødegradering|miljøsikkerhet)/i.test(src);
    const blocked = sourceHasPublicAdmin
      ? /(sahel|mali|knapphetsskolen|politisk økologi|ressursknapphet|miljødegradering|miljøsikkerhet|klima og miljø kan være bakgrunnsfaktorer|konfliktutvikling|marginalisering av pastoralister|environmental security|makt- og produksjonsforhold)/i
      : (sourceHasSahelMali ? /(nav|nav-reformen|nav-kontorene|offentlig forvaltning|velferdsstat|arbeidslinja|bakkebyråkrati|stat–kommune|stat-kommune|arbeidsrettet oppfølging|kommunale målsetninger)/i : null);
    if (!blocked) return list;
    return list.filter((item) => !blocked.test(String(item || "")));
  }


  function detectLiteraryAttachmentSignal(text) {
    return signals.detectLiteraryAttachmentSignal(text);
  }
  function detectSahelClimateConflictSignal(text) {
    const src = String(text || "");
    const hasSahel = /\bsahel\b|\bmali\b/i.test(src);
    const hasConflict = /\bkonflikt\b|\bconflict\b/i.test(src);
    const hasClimate = /\bklima\b|\bclimate\b|\bmiljø\b/i.test(src);
    const hasTheory = /\bknapphetsskolen\b|\bressursknapphet\b|\bmiljøsikkerhet\b|\bpolitisk økologi\b|\benvironmental security\b/i.test(src);
    return { strong: (hasSahel && (hasConflict || hasClimate)) || (hasSahel && hasTheory), hasSahel, hasConflict, hasClimate, hasTheory };
  }
  function detectInstitutionalMediaHistorySignal(text) {
    return signals.detectInstitutionalMediaHistorySignal(text);
  }
  function extractMainInstitutionName(text) {
    const source = String(text || "");
    const sentences = toSentences(source).slice(0, 2);
    const head = sentences.join(" ");
    const scan = `${head} ${source}`;
    const tokens = scan.match(/\b[A-ZÆØÅ][A-Za-zÆØÅæøå-]{1,}(?:\s+[A-ZÆØÅ][A-Za-zÆØÅæøå-]{1,}){0,3}\b/g) || [];
    const blocked = new Set(["Det", "Den", "Dette", "I", "På", "For", "Og", "En", "Et", "Som", "Av", "Til"]);
    const counts = new Map();
    tokens.forEach((token) => {
      const clean = String(token || "").trim();
      if (!clean || blocked.has(clean)) return;
      counts.set(clean, (counts.get(clean) || 0) + 1);
    });
    const priorityPatterns = [
      /\b([A-ZÆØÅ][A-Za-zÆØÅæøå-]+(?:\s+[A-ZÆØÅ][A-Za-zÆØÅæøå-]+){0,3})\s+er\s+en?\b/g,
      /\b([A-ZÆØÅ][A-Za-zÆØÅæøå-]+(?:\s+[A-ZÆØÅ][A-Za-zÆØÅæøå-]+){0,3})\s+ble\s+grunnlagt\b/g,
      /\b([A-ZÆØÅ][A-Za-zÆØÅæøå-]+(?:\s+[A-ZÆØÅ][A-Za-zÆØÅæøå-]+){0,3})\s+vart\s+grunnlagd\b/g,
      /\b([A-ZÆØÅ][A-Za-zÆØÅæøå-]+(?:\s+[A-ZÆØÅ][A-Za-zÆØÅæøå-]+){0,3})\s+grunnlagt\b/g,
      /\b([A-ZÆØÅ][A-Za-zÆØÅæøå-]+(?:\s+[A-ZÆØÅ][A-Za-zÆØÅæøå-]+){0,3})\s+(avis|institusjon|organisasjon|universitet|museum|bibliotek|stiftelse)\b/g
    ];
    const priority = new Map();
    priorityPatterns.forEach((pattern) => {
      let m;
      while ((m = pattern.exec(head)) !== null) {
        const key = String(m[1] || "").trim();
        if (key && !blocked.has(key)) priority.set(key, (priority.get(key) || 0) + 2);
      }
    });
    const candidates = [...new Set([...counts.keys(), ...priority.keys()])];
    if (!candidates.length) return "institusjonen";
    const ranked = candidates
      .map((name) => ({
        name,
        score: (counts.get(name) || 0) + (priority.get(name) || 0) + (head.includes(name) ? 1 : 0)
      }))
      .sort((a, b) => b.score - a.score);
    return ranked[0]?.name || "hovedobjektet";
  }
  function subjectMatchesFromCalibration(calibrated) {
    const emner = Array.isArray(calibrated?.matched_emner) ? calibrated.matched_emner : [];
    if (!emner.length) return [];
    const bestScore = Math.max(...emner.map((item) => Number(item?.score || 0)), 0);
    const floor = Math.max(1.5, bestScore * 0.45);
    const rows = emner
      .filter((item) => item?.subject_id && item?.emne_id && Number(item?.score || 0) >= floor)
      .slice(0, 6)
      .map((item) => ({
        title: String(item?.title || item?.short_label || item?.emne_id || "").trim(),
        subject_label: String(item?.title || item?.short_label || item?.subject_id || "").trim(),
        subject_id: String(item?.subject_id || "").trim(),
        emne_id: String(item?.emne_id || "").trim(),
        id: String(item?.emne_id || item?.subject_id || "").trim(),
        score: Number(item?.score || 0),
        source: "historygo_fag_calibration"
      }));
    return normalizeSubjectMatches(rows);
  }

  function detectAutoAnalysisDomain(sourceText, payload = {}) {
    const src = String(sourceText || "");
    const payloadText = `${payload?.reflection || ""} ${(Array.isArray(payload?.sortItems) ? payload.sortItems : []).map((item) => `${item?.label || ""} ${item?.text || ""}`).join(" ")}`;
    const domainText = src.trim().length >= 25 ? src : `${src} ${payloadText}`;
    const canonicalDomain = signals.detectCanonicalAnalysisDomain(domainText);
    if (canonicalDomain) return canonicalDomain;
    if (detectPublicAdministrationSignal(domainText).strong) return "public_administration";
    if (detectSongLyricChildCultureSignal(src).strong) return "song_lyric_child_culture";
    if (detectSahelClimateConflictSignal(domainText).strong) return "sahel_climate_conflict";
    return "generic_academic";
  }

  function detectSongLyricChildCultureSignal(text) {
    const src = cleanArticleText(text || "").toLowerCase();
    const terms = [
      "barnesang", "barnesanger", "sanglyrikk", "sang og sanglyrikk", "barnekultur",
      "barnelitteratur", "barnelitterære", "sjangerrikdom", "rim", "rytme",
      "regler", "nonsens", "vuggesang", "bevegelsessang", "musikk", "oppdragelse",
      "utdanning", "identitetsdannelse", "ritualer", "kulturforskning", "litteraturforskning"
    ];
    const hits = terms.filter((term) => src.includes(term));
    const hasSang = /\bsang(?:en|er|lyrikk|tekster)?\b/i.test(src);
    const hasChildCulture = /\b(barne|barn|barnekultur|barnelitteratur|oppdragelse|utdanning)\b/i.test(src);
    return { strong: hits.length >= 2 || (hasSang && hasChildCulture), hits };
  }

  const CANONICAL_BLOCKED_DOMAIN_TERMS = [
    "redaksjonell", "eierskap", "eierskapsskifter", "medieoffentlighet", "presse",
    "institusjonell omforming", "økonomisk avhengighet", "medieaktør", "norsk politisk pressehistorie"
  ];
  const CANONICAL_MEDIA_SUPPORT_PATTERNS = [
    /\bredaksjon/i, /\bavis(?:a|en|er)?\b/i, /\bpresse\b/i, /\beierskap\b/i,
    /\boffentlighet\b/i, /\bøkonomisk avhengighet\b/i, /\bjournalistikk\b/i, /\bmedie(?:r|hus|aktør)?\b/i
  ];

  function sourceSupportsMediaInstitutionTerms(sourceText) {
    return CANONICAL_MEDIA_SUPPORT_PATTERNS.some((pattern) => pattern.test(String(sourceText || "")));
  }

  function firstUnsupportedCanonicalDomainTerm(value, sourceText) {
    const text = String(value || "").toLowerCase();
    if (!text) return "";
    if (sourceSupportsMediaInstitutionTerms(sourceText)) return "";
    return CANONICAL_BLOCKED_DOMAIN_TERMS.find((term) => text.includes(term)) || "";
  }

  function containsUnsupportedCanonicalDomainTerm(value, sourceText) {
    return Boolean(firstUnsupportedCanonicalDomainTerm(value, sourceText));
  }

  function logSkippedUnsupportedCanonicalField(field, term, sourceText) {
    const safeField = String(field || "unknown");
    const safeTerm = String(term || "unknown");
    const hash = sourceHash(sourceText || "");
    console.warn(`Skipped unsupported canonicalAnalysis field: field=${safeField}, term=${safeTerm}, sourceHash=${hash}`);
  }

  function stripUnsupportedCanonicalItems(items, sourceText, field = "unknown") {
    return (Array.isArray(items) ? items : []).filter((item) => {
      const text = typeof item === "string" ? item : `${item?.label || ""} ${item?.text || ""} ${item?.title || ""} ${item?.subject_label || ""}`;
      const term = firstUnsupportedCanonicalDomainTerm(text, sourceText);
      if (term) {
        logSkippedUnsupportedCanonicalField(field, term, sourceText);
        return false;
      }
      return true;
    });
  }

  function getSongLyricChildCultureSubjectMatches() {
    return normalizeSubjectMatches([
      "Barnelitteratur",
      "Barnekultur",
      "Lyrikk, rytme og språk",
      "Musikk",
      "Sanglyrikk",
      "Utdanning og oppdragelse",
      "Identitetsdannelse",
      "Ritualer",
      "Kultur- og litteraturforskning"
    ]);
  }

  function buildSongLyricChildCulturePayload(payload, sourceText) {
    const safe = payload && typeof payload === "object" ? payload : {};
    return {
      ...safe,
      textType: safe.textType || "academic_article",
      reflection: "Teksten handler om sang og sanglyrikk i barnekulturen, med vekt på barnelitteratur, musikk, språk, oppdragelse, identitetsdannelse og behovet for mer forskning.",
      sortItems: [
        { label: "Tema", text: "Sanglyrikk i barnekultur og barnelitteratur." },
        { label: "Sjangerrikdom", text: "Barnesang samler lyrikk, rytme, musikk, lek, ritualer og pedagogiske funksjoner." },
        { label: "Hovedspenning", text: "Kulturell praksis og kunstform ↔ forskningens behov for tydeligere begreper og mer empirisk kunnskap." },
        { label: "Faglig betydning", text: "Sanglyrikk knyttes til språk, utdanning, oppdragelse, fellesskap og identitetsdannelse." }
      ],
      day: "Kort fagoppsummering: Teksten analyserer barnesang og sanglyrikk som barnekultur, barnelitteratur, musikk, språkpraksis og forskningsfelt.",
      thoughts: {
        hovedspor: "Barnesang bør forstås som kulturell praksis, kunstform og lyrikk i barns hverdags- og læringskultur.",
        lose_tanker: "Skill mellom musikk, lyrikk, pedagogikk, ritualer, lek og identitetsdannelse før sporene kobles.",
        neste_steg: "Finn tekstbelegg for hvordan sanglyrikk virker i språk, oppdragelse, ritualer og barnekultur."
      },
      list: [
        "Les sang som kulturell praksis og kunstform, ikke som institusjonsnavn.",
        "Koble barnesang til barnelitteratur, lyrikk, rytme og musikk.",
        "Undersøk pedagogiske spor: utdanning, oppdragelse og språk.",
        "Se etter ritualer, fellesskap og identitetsdannelse.",
        "Marker hvor teksten etterlyser mer kultur- og litteraturforskning."
      ],
      path: [
        "Kartlegg hvordan teksten definerer sanglyrikk og barnesang.",
        "Sorter eksempler etter lyrikk, rytme, musikk, lek og ritual.",
        "Analyser pedagogiske og kulturelle funksjoner.",
        "Koble funn til barnelitteratur, barnekultur og identitetsdannelse.",
        "Formuler forskningsspørsmål der teksten peker på kunnskapshull."
      ],
      subjectMatches: getSongLyricChildCultureSubjectMatches(),
      subjectLinks: getSongLyricChildCultureSubjectMatches(),
      canonicalAnalysis: {
        ...(safe.canonicalAnalysis && typeof safe.canonicalAnalysis === "object" ? safe.canonicalAnalysis : {}),
        contentType: "Fagtekst om barnekultur og sanglyrikk",
        theme: "Sang og sanglyrikk i barnekulturen",
        mainTension: "Barnesang som kulturell praksis/kunstform ↔ behovet for mer forskning på sjanger, språk, oppdragelse og identitetsdannelse.",
        keyInsight: "Sanglyrikk i barnekulturen forstås gjennom barnelitteratur, musikk, lyrikk, språk, ritualer, utdanning og identitetsdannelse.",
        nextStep: "Undersøk tekstbelegg for hvordan sanglyrikk fungerer i barnekultur, læring, ritualer og identitetsdannelse.",
        fieldConnections: getSongLyricChildCultureSubjectMatches().map((item) => item.title)
      },
      ahaSer: {
        innholdstype: "Fagtekst om barnekultur og sanglyrikk",
        tema: "Sang og sanglyrikk i barnekulturen.",
        hovedspenning: "Barnesang som kulturell praksis/kunstform ↔ behovet for mer forskning på sjanger, språk, oppdragelse og identitetsdannelse.",
        viktigsteInnsikt: "Teksten viser at sanglyrikk i barnekulturen må forstås gjennom barnelitteratur, musikk, lyrikk, språk, ritualer, utdanning og identitetsdannelse.",
        fagkoblinger: getSongLyricChildCultureSubjectMatches().map((item) => item.title),
        nesteSteg: "Undersøk konkrete tekstbelegg for hvordan sanglyrikk fungerer i barnekultur, læring, ritualer og identitetsdannelse.",
        kortSvar: "Teksten handler om barnesang og sanglyrikk som del av barnekultur, barnelitteratur, musikk, språk og oppdragelse – ikke om mediehistorie eller institusjonshistorie."
      }
    };
  }

  function enforceCanonicalSourceGrounding(payload, sourceText) {
    const source = String(sourceText || "");
    const safe = payload && typeof payload === "object" ? payload : {};
    let out = { ...safe };
    if (detectSongLyricChildCultureSignal(source).strong) out = buildSongLyricChildCulturePayload(out, source);
    out.sortItems = stripUnsupportedCanonicalItems(out.sortItems, source, "structure");
    out.list = stripUnsupportedCanonicalItems(out.list, source, "list");
    out.path = stripUnsupportedCanonicalItems(out.path, source, "learningPath");
    out.insightCards = stripUnsupportedCanonicalItems(out.insightCards, source, "mainInsight");
    out.subjectMatches = stripUnsupportedCanonicalItems(out.subjectMatches, source, "fagkoblinger");
    out.subjectLinks = stripUnsupportedCanonicalItems(out.subjectLinks, source, "fagkoblinger");
    if (out.ahaSer && typeof out.ahaSer === "object") {
      out.ahaSer = { ...out.ahaSer };
      ["tema", "hovedspenning", "viktigsteInnsikt", "nesteSteg", "kortSvar"].forEach((key) => {
        const term = firstUnsupportedCanonicalDomainTerm(out.ahaSer[key], source);
        if (term) {
          logSkippedUnsupportedCanonicalField(key, term, source);
          out.ahaSer[key] = "";
        }
      });
      out.ahaSer.fagkoblinger = stripUnsupportedCanonicalItems(Array.isArray(out.ahaSer.fagkoblinger) ? out.ahaSer.fagkoblinger : String(out.ahaSer.fagkoblinger || "").split("·"), source, "fagkoblinger");
    }
    if (out.canonicalAnalysis && typeof out.canonicalAnalysis === "object") {
      out.canonicalAnalysis = { ...out.canonicalAnalysis };
      ["contentType", "topic", "theme", "mainTension", "keyInsight", "mainInsight", "nextStep", "reflection", "summary"].forEach((key) => {
        const term = firstUnsupportedCanonicalDomainTerm(out.canonicalAnalysis[key], source);
        if (term) {
          logSkippedUnsupportedCanonicalField(key, term, source);
          out.canonicalAnalysis[key] = "";
        }
      });
      out.canonicalAnalysis.fieldConnections = stripUnsupportedCanonicalItems(out.canonicalAnalysis.fieldConnections, source, "fagkoblinger");
      out.canonicalAnalysis.suggestedActions = stripUnsupportedCanonicalItems(out.canonicalAnalysis.suggestedActions, source, "nextStep");
      out.canonicalAnalysis.analysisRunId = out.canonicalAnalysis.analysisRunId || out.analysisRunId || out.runId || "";
      out.canonicalAnalysis.runId = out.canonicalAnalysis.runId || out.runId || out.analysisRunId || "";
      out.canonicalAnalysis.sourceHash = out.canonicalAnalysis.sourceHash || out.sourceHash || out.sourceTextHash || sourceHash(source);
      out.canonicalAnalysis.sourceTextHash = out.canonicalAnalysis.sourceTextHash || out.sourceTextHash || out.sourceHash || sourceHash(source);
      out.canonicalAnalysis.evidenceAnchors = buildCanonicalEvidenceAnchors(out, source);
    }
    const reflectionTerm = firstUnsupportedCanonicalDomainTerm(out.reflection, source);
    if (reflectionTerm) {
      logSkippedUnsupportedCanonicalField("mainInsight", reflectionTerm, source);
      out.reflection = "";
    }
    if (out.thoughts && typeof out.thoughts === "object") {
      out.thoughts = { ...out.thoughts };
      Object.keys(out.thoughts).forEach((key) => {
        const term = firstUnsupportedCanonicalDomainTerm(out.thoughts[key], source);
        if (term) {
          logSkippedUnsupportedCanonicalField(key === "neste_steg" ? "nextStep" : "mainInsight", term, source);
          out.thoughts[key] = "";
        }
      });
    }
    return out;
  }

  function buildCanonicalEvidenceAnchors(payload, sourceText) {
    const source = cleanArticleText(sourceText || "");
    const sentences = toSentences(source).filter(Boolean);
    const fields = {
      innholdstype: payload?.ahaSer?.innholdstype || payload?.contentType || payload?.textType || payload?.canonicalAnalysis?.contentType,
      tema: payload?.ahaSer?.tema || payload?.canonicalAnalysis?.theme,
      hovedspenning: payload?.ahaSer?.hovedspenning || payload?.canonicalAnalysis?.mainTension,
      viktigsteInnsikt: payload?.ahaSer?.viktigsteInnsikt || payload?.canonicalAnalysis?.keyInsight,
      nesteSteg: payload?.ahaSer?.nesteSteg || (Array.isArray(payload?.path) ? payload.path[0] : ""),
      fagkoblinger: Array.isArray(payload?.ahaSer?.fagkoblinger) ? payload.ahaSer.fagkoblinger.join(" ") : String(payload?.ahaSer?.fagkoblinger || "")
    };
    const anchors = {};
    Object.entries(fields).forEach(([key, value]) => {
      const fieldWords = takeKeywords(String(value || ""), 8).map((item) => item.toLowerCase());
      const match = sentences.find((sentence) => fieldWords.some((word) => word.length > 3 && sentence.toLowerCase().includes(word)));
      if (match) anchors[key] = short(match, 180);
    });
    return anchors;
  }

  function normalizeSubjectMatches(subjectMatches) {
    const list = Array.isArray(subjectMatches) ? subjectMatches : [];
    return list.map((item) => {
      if (typeof item === "string") return { title: item, subject_label: item, subject_id: normalizeConceptKey(item) || item.toLowerCase() };
      const title = String(item?.title || item?.subject_label || item?.subject_id || item?.id || "").trim();
      const subject_label = String(item?.subject_label || title).trim();
      const subject_id = String(item?.subject_id || normalizeConceptKey(title) || title.toLowerCase()).trim();
      return { ...item, title, subject_label, subject_id };
    }).filter((item) => item.title);
  }

  function getLiterarySubjectMatches() {
    return normalizeSubjectMatches(["Litteraturvitenskap", "Psykologi", "Tilknytningsteori", "Autofiksjon", "Narratologi", "Deiksis", "Nymaterialisme", "Virkelighetslitteratur"]);
  }
  function getInstitutionalMediaHistorySubjectMatches(sourceText, payload = {}) {
    const src = String(sourceText || "");
    const payloadText = `${payload?.reflection || ""} ${(Array.isArray(payload?.sortItems) ? payload.sortItems : []).map((item) => `${item?.label || ""} ${item?.text || ""}`).join(" ")}`;
    const combined = `${src} ${payloadText}`;
    const signal = detectInstitutionalMediaHistorySignal(combined);
    const isNewspaperText = /\b(morgenbladet|avis|redaksjon|journalistikk|kommentaravis|nisjeavis)\b/i.test(combined);
    const isMediaText = /\b(media|medie|presse|offentlighet|kulturjournalistikk|redaksjonell)\b/i.test(combined);
    if (signal?.strong && (isNewspaperText || isMediaText)) {
      return normalizeSubjectMatches([
        "Mediehistorie",
        "Presse og offentlighet",
        "Eierskap og redaksjonell uavhengighet",
        "Kulturjournalistikk",
        "Akademisk offentlighet",
        "Norsk politisk pressehistorie"
      ]);
    }
    return normalizeSubjectMatches([
      "Institusjonshistorie",
      "Offentlighet",
      "Eierskap og autonomi",
      "Styring og samfunnsrolle"
    ]);
  }
  function getLiteraryAttachmentLearningPath() {
    return [
      "Identifiser romanens bruk av tilknytningsteori.",
      "Analyser deiktisk poetikk og tiltaleform.",
      "Undersøk forholdet mellom far–barn-tilknytning og ekteskapelig løsrivelse.",
      "Sammenlign Knausgårds og Linda Boström Knausgårds perspektiver.",
      "Drøft hvordan nymaterialisme, sårbarhet og mytologi utfordrer en ren psykologisk forklaring."
    ];
  }

  function short(text, maxLen = 180) {
    const normalized = normalizeDisplayText(text).replace(/\s+/g, " ").trim();
    if (!normalized) return "";
    if (normalized.length <= maxLen) return normalized;
    return `${normalized.slice(0, Math.max(0, maxLen - 1)).trimEnd()}…`;
  }


  function hasAcademicSignals(payload, sourceText) {
    const sortItems = Array.isArray(payload?.sortItems) ? payload.sortItems : [];
    const labels = sortItems.map((item) => normalizeConceptKey(item?.label || ""));
    const reflection = normalizeConceptKey(payload?.reflection || "");
    const signalText = `${String(sourceText || "")} ${String(payload?.reflection || "")} ${sortItems.map((item) => `${item?.label || ""} ${item?.text || ""}`).join(" ")}`.toLowerCase();
    const hasSortLabelSignal = labels.some((label) => ["hovedargument", "motargument", "spenning i teksten", "teorikoblinger"].some((needle) => label.includes(needle)));
    const hasTopicSignal = /(sahel|mali|ressursknapphet|politisk økologi|knapphetsskolen)/i.test(signalText) || /(sahel|mali|ressursknapphet|politisk økologi|knapphetsskolen)/i.test(reflection);
    return hasSortLabelSignal || hasTopicSignal;
  }

  function filterDomainInsightCards(cards, sourceText) {
    const list = Array.isArray(cards) ? cards : [];
    const src = String(sourceText || "");
    const sourceHasPublicAdmin = Boolean(detectPublicAdministrationReformSignal(src)?.strong);
    const sourceHasSahelMali = /(sahel|mali|politisk økologi|knapphetsskolen|ressursknapphet|miljødegradering)/i.test(src);
    const blocked = sourceHasPublicAdmin
      ? /(sahel|mali|knapphetsskolen|politisk økologi|ressursknapphet|miljødegradering|miljøsikkerhet|klima og miljø kan være bakgrunnsfaktorer|konfliktutvikling|marginalisering av pastoralister|environmental security|makt- og produksjonsforhold)/i
      : (sourceHasSahelMali ? /(nav|nav-reformen|nav-kontorene|offentlig forvaltning|velferdsstat|arbeidslinja|bakkebyråkrati|stat–kommune|stat-kommune|arbeidsrettet oppfølging|kommunale målsetninger)/i : null);
    if (!blocked) return list;
    return list.filter((card) => {
      const body = `${card?.title || ""} ${card?.summary || ""} ${(Array.isArray(card?.concepts) ? card.concepts : []).join(" ")}`;
      return !blocked.test(body);
    });
  }

  function normalizeAcademicAfterworkPayload(payload, sourceText, textType) {
    const safePayload = payload && typeof payload === "object" ? payload : {};
    const src = String(sourceText || "");
    if (!getRuntimeKnowledgePolicy().legacyArticleTemplatesEnabled && (textType === "academic_article" || detectTextType(src) === "academic_article")) {
      return applyRuntimeKnowledgePolicy(safePayload, src);
    }
    const payloadSignalText = `${safePayload.reflection || ""} ${(Array.isArray(safePayload.sortItems) ? safePayload.sortItems : []).map((item) => `${item?.label || ""} ${item?.text || ""}`).join(" ")}`;
    const publicAdminSignal = detectPublicAdministrationReformSignal(src);
    const payloadPublicAdminSignal = detectPublicAdministrationReformSignal(payloadSignalText);
    const hasStrongSourceSahelMali = /(sahel|mali|politisk økologi|knapphetsskolen|ressursknapphet|miljødegradering)/i.test(src);
    const hasStrongPayloadSahelMali = /(sahel|mali|politisk økologi|knapphetsskolen|ressursknapphet|miljødegradering)/i.test(payloadSignalText);
    const sourceWeakOrEmpty = src.trim().length < 25;
    const hasSahelMali = hasStrongSourceSahelMali || (sourceWeakOrEmpty && hasStrongPayloadSahelMali);
    const hasPublicAdminSignal = Boolean(publicAdminSignal?.strong) || (sourceWeakOrEmpty && Boolean(payloadPublicAdminSignal?.strong));
    const domain = detectAutoAnalysisDomain(src, safePayload);
    if (domain === "literary_attachment") {
      return {
        ...safePayload,
        textType: "academic_article",
        path: getLiteraryAttachmentLearningPath().map(normalizeVisibleAcademicLabel),
        subjectMatches: getLiterarySubjectMatches(),
        subjectLinks: getLiterarySubjectMatches()
      };
    }
    const isAcademic = textType === "academic_article" || hasAcademicSignals(safePayload, src) || hasPublicAdminSignal;
    if (!isAcademic) return safePayload;
    const institutionalHistorySignal = detectInstitutionalMediaHistorySignal(src || payloadSignalText);
    if (institutionalHistorySignal?.strong) {
      return {
        ...safePayload,
        textType: "academic_article"
      };
    }

    const religiousLexiconSignal = inferReligiousLexiconEvidence(src || payloadSignalText);
    if (religiousLexiconSignal?.strong) {
      return {
        ...safePayload,
        textType: "academic_article",
        reflection: normalizeVisibleAcademicLabel(String(safePayload.reflection || "Teksten er en religionsfaglig leksikontekst med vekt på pinsefortelling, teologi, symbolikk og kirkelig praksis.")),
        sortItems: (Array.isArray(safePayload.sortItems) ? safePayload.sortItems : []).map((item) => ({
          label: normalizeVisibleAcademicLabel(item?.label || ""),
          text: normalizeVisibleAcademicLabel(item?.text || "")
        })),
        list: filterCrossDomainTextItems(Array.isArray(safePayload.list) ? safePayload.list : [], src).slice(0, 6).map(normalizeDisplayText),
        path: (Array.isArray(safePayload.path) ? safePayload.path : []).slice(0, 5).map(normalizeVisibleAcademicLabel),
        insightCards: filterDomainInsightCards(Array.isArray(safePayload.insightCards) ? safePayload.insightCards : [], src).slice(0, 4).map((entry) => typeof entry === "string" ? normalizeDisplayText(entry) : ({
          ...entry,
          title: normalizeDisplayText(entry?.title || ""),
          summary: normalizeDisplayText(entry?.summary || entry?.text || "")
        }))
      };
    }

    const isPublicAdmin = hasPublicAdminSignal && !hasSahelMali;
    const reflection = isPublicAdmin
      ? "Teksten undersøker om NAVs måloppnåelse best forklares av midlertidige omstillingskostnader eller mer varige strukturelle utfordringer i styring, organisering og stat–kommune-samspill. Den sentrale bevegelsen går fra en implementeringsforklaring til en strukturell analyse av forenklingsarbeid, statlig styring og motstridende mål mellom stat og kommune. Analysen bygger på data og argumentasjon i artikkelen og peker på at utfordringene ikke kan forstås som midlertidig reformstøy alene. Den faglige spenningen ligger mellom omstillingskostnad og strukturell forklaring."
      : (String(safePayload.reflection || "").trim() || "Teksten undersøker konkurrerende forklaringer og vurderer hvordan metode, funn og teori henger sammen i en akademisk analyse.");

    const academicSortItems = isPublicAdmin
      ? [
          { label: "Problemstilling", text: "Hvorfor har NAV-kontorene ikke nådd målene om flere i arbeid og aktivitet i samme grad som forventet?" },
          { label: "Hovedforklaring", text: "Tidligere forklaringer vektlegger omstillingsprosessen ved etableringen av NAV-kontorene." },
          { label: "Alternativ forklaring", text: "Artikkelen peker på mer langsiktige strukturelle utfordringer i lokalkontorene." },
          { label: "Empirisk grunnlag", text: "Analysen bygger på kvalitative og kvantitative data fra NAV-kontorer, inkludert prosess- og effektdata." },
          { label: "Strukturelle utfordringer", text: "Forenklingsarbeid, styringspraksis og målkonflikter mellom stat og kommune trekkes frem som sentrale forklaringer." },
          { label: "Implikasjon / videre analyse", text: "NAV-reformen krever organisatoriske og styringsmessige grep, ikke bare mer tid i implementeringsfasen." }
        ]
      : [
          { label: "Problemstilling", text: String((safePayload.sortItems || []).find((item) => /problem|hovedinnsikt/i.test(String(item?.label || "")))?.text || "Hva er den sentrale faglige problemstillingen i teksten?").trim() },
          { label: "Hovedpåstand", text: String((safePayload.sortItems || []).find((item) => /hovedargument|hovedpåstand/i.test(String(item?.label || "")))?.text || "").trim() },
          { label: "Alternativ forklaring", text: String((safePayload.sortItems || []).find((item) => /motargument|kritikk|alternativ/i.test(String(item?.label || "")))?.text || "").trim() },
          { label: "Faglig spenning", text: String((safePayload.sortItems || []).find((item) => /spenning/i.test(String(item?.label || "")))?.text || "").trim() },
          { label: "Neste analysegrep", text: "Presiser forholdet mellom metode, funn og teori for å styrke forklaringskraften." }
        ].filter((item) => item.text);

    const normalizedList = filterCrossDomainTextItems((isPublicAdmin
      ? [
          "Skille tydelig mellom omstillingsforklaring og strukturell forklaring.",
          "Koble effektforskning og prosessdata til NAV-kontorenes lokale organisering.",
          "Analysere hvordan statlig styring og kommunale mål trekker i ulik retning.",
          "Vurdere hvordan kontorstørrelse påvirker arbeidsrettet oppfølging.",
          "Presisere hvilke organisatoriske og styringsmessige grep som kan styrke måloppnåelsen."
        ]
      : (Array.isArray(safePayload.list) ? safePayload.list : [])), src).slice(0, 6);
    const navInsights = [
      "Hovedinnsikt: Artikkelen viser at NAVs manglende måloppnåelse ikke bare kan forklares med midlertidig omstilling, men også med varige strukturelle utfordringer.",
      "Hovedargument: NAV-kontorenes resultater påvirkes av forenklingsarbeid, statlig styring, kommunale mål og lokal organisering.",
      "Motargument/kritikk: En ren omstillingsforklaring undervurderer mer grunnleggende organisatoriske og styringsmessige problemer.",
      "Spenning: Spenningen ligger mellom omstillingskostnad og strukturell forklaring."
    ];
    const normalizedInsights = filterDomainInsightCards((isPublicAdmin ? navInsights : (Array.isArray(safePayload.insightCards) ? safePayload.insightCards : [])), src).slice(0, 4);
    return {
      ...safePayload,
      textType: "academic_article",
      reflection: normalizeVisibleAcademicLabel(reflection),
      sortItems: academicSortItems.map((item) => ({ label: normalizeVisibleAcademicLabel(item.label), text: normalizeVisibleAcademicLabel(item.text) })),
      thoughts: {
        hovedspor: normalizeVisibleAcademicLabel(isPublicAdmin
          ? "NAVs måloppnåelse analyseres som et mulig strukturelt styrings- og organisasjonsproblem."
          : String(safePayload?.thoughts?.hovedspor || "Teksten analyserer en faglig problemstilling med konkurrerende forklaringer.")),
        lose_tanker: normalizeVisibleAcademicLabel(isPublicAdmin
          ? "Omstillingskostnader, statlig styring, kommunale mål og arbeidsrettet oppfølging bør holdes analytisk adskilt."
          : String(safePayload?.thoughts?.lose_tanker || "Metode, funn og implikasjon bør kobles tydeligere i analysen.")),
        neste_steg: normalizeVisibleAcademicLabel(isPublicAdmin
          ? "Skille tydelig mellom midlertidige implementeringsproblemer og varige strukturelle utfordringer i NAV-kontorene."
          : String(safePayload?.thoughts?.neste_steg || "Formuler neste analysegrep som tester forklaringsmodellen mot empirien."))
      },
      path: (isPublicAdmin
        ? [
            "Identifiser hovedproblemstillingen om måloppnåelse i NAV-reformen.",
            "Skill mellom omstillingsforklaring og strukturell forklaring.",
            "Knytt metode/data til funn om NAV-kontorene.",
            "Analyser spenningen mellom statlig styring og kommunale mål.",
            "Vurder implikasjoner for arbeidsrettet oppfølging."
          ]
        : [
            "Identifiser hovedproblemstillingen.",
            "Skill mellom hovedforklaring og alternativ forklaring.",
            "Knytt metode/data til funn.",
            "Finn faglige spenninger i teksten.",
            "Formuler et konkret neste analysegrep."
          ]).map(normalizeVisibleAcademicLabel),
      list: normalizedList.map(normalizeDisplayText),
      insightCards: normalizedInsights.map((entry) => {
        if (typeof entry === "string") return normalizeDisplayText(entry);
        return {
          ...entry,
          title: normalizeDisplayText(entry?.title || ""),
          summary: normalizeDisplayText(entry?.summary || entry?.text || ""),
          concepts: (Array.isArray(entry?.concepts) ? entry.concepts : []).map(normalizeAcademicConceptLabel)
        };
      })
    };
  }

    return Object.freeze({
      normalizeConceptSurface,
      normalizeVisibleAcademicLabel,
      normalizeAcademicConceptLabel,
      filterCrossDomainTextItems,
      detectLiteraryAttachmentSignal,
      detectSahelClimateConflictSignal,
      detectInstitutionalMediaHistorySignal,
      extractMainInstitutionName,
      subjectMatchesFromCalibration,
      detectAutoAnalysisDomain,
      detectSongLyricChildCultureSignal,
      sourceSupportsMediaInstitutionTerms,
      firstUnsupportedCanonicalDomainTerm,
      containsUnsupportedCanonicalDomainTerm,
      stripUnsupportedCanonicalItems,
      getSongLyricChildCultureSubjectMatches,
      buildSongLyricChildCulturePayload,
      enforceCanonicalSourceGrounding,
      buildCanonicalEvidenceAnchors,
      normalizeSubjectMatches,
      getLiterarySubjectMatches,
      getInstitutionalMediaHistorySubjectMatches,
      getLiteraryAttachmentLearningPath,
      short,
      hasAcademicSignals,
      filterDomainInsightCards,
      normalizeAcademicAfterworkPayload
    });
  }

  const api = Object.freeze({ create });
  global.AHAChatAnalysisPolicy = api;
  global.AHAModuleApi?.register?.("chat.analysisPolicy", api, {
    version: 1,
    legacyGlobal: "AHAChatAnalysisPolicy",
    exports: ["create"]
  });
})(window);
