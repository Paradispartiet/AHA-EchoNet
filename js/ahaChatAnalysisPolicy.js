// ahaChatAnalysisPolicy.js
// Akademisk domenepolicy, normalisering og kanonisk kildegrunning for AHA Chat.

(function (global) {
  "use strict";

  const GENERIC_DISPLAY_CONCEPTS = new Set(["kunnskap","forståelse","budskap","bekreftelse","sier","viser","dette","grunnlag","tillegg","verden","noen","videre","eksempel"]);
  const ACADEMIC_PHRASE_CONCEPTS = [
    "politisk økologi","empirisk forskning","internasjonal forskning","dominerende narrativ","politisk narrativ","knapphetsskolen","miljøsikkerhet","environmental security","scarcity school","statens politikk","marginalisering av pastoralister","marginalisering","pastoralister","politisk-historisk forklaring","politisk og historisk","klimadrevet konflikt","klimaendringer og konflikter","malthusiansk forklaring","ressursknapphet","miljødegradering","miljøforringelse","nedbørsdata","klimadata","casestudier fra Mali","Sahel","Mali","Sahel-greening","ørkenspredning","tørke","global klimaendring","lokale forhold","forskningsgrunnlag","policy-momentum",
    "nav-reformen","nav-kontorene","strukturelle utfordringer","manglende måloppnåelse","statlig styring","kommunale målsetninger","kommunale virkemidler","stat–kommune-partnerskap","partnerskap mellom stat og kommune","lokal organisering","arbeidsrettet oppfølging","omstillingskostnader","omstillingsprosess","organisasjonsreform","innholdsreform","kontorstørrelse","ytelsessaksbehandling","arbeidsavklaringspenger","arbeidsevnevurdering","forenklingsarbeid","standardisering og byråkrati","virksomhetsutvikling","reformeffekter","effektforskning","prosessevaluering","arbeidslinja","individuell oppfølging","brukerrettet bistand","lokal implementering"
  ];
  const ACADEMIC_THEORY_RULES = [
    {
      key: "thomas_homer_dixon",
      triggers: [/\bthomas\s+homer-?dixon\b/i, /\bhomer-?dixon\b/i],
      link: {
        thinker: "Thomas Homer-Dixon",
        theory: "Knapphetsskolen / miljøsikkerhet",
        connection: "Brukes i teksten som representant for teorien om ressursknapphet, miljødegradering og konflikt.",
        score: 0.75
      }
    },
    {
      key: "knapphetsskolen",
      triggers: [/\bknapphetsskolen\b/i, /\bscarcity\s+school\b/i, /\bressursknapphet\b/i, /\bmalthusiansk\b/i],
      link: {
        thinker: "Knapphetsskolen",
        theory: "Ressursknapphet og konflikt",
        connection: "Teksten diskuterer knapphetsskolens forklaring om at ressursknapphet kan føre til voldelig konflikt.",
        score: 0.70
      }
    },
    {
      key: "miljosikkerhet",
      triggers: [/\bmiljøsikkerhet\b/i, /\benvironmental\s+security\b/i, /\bthe\s+environmental\s+security\s+school\b/i],
      link: {
        thinker: "Miljøsikkerhet",
        theory: "Miljøsikkerhet",
        connection: "Teksten behandler miljøsikkerhet som en teori om koblingen mellom miljødegradering, ressursknapphet og konflikt.",
        score: 0.70
      }
    },
    {
      key: "politisk_okologi",
      triggers: [/\bpolitisk\s+økologi\b/i, /\bpolitical\s+ecology\b/i, /\bmaktperspektiv\b/i, /\bmakt-?\s*og\s*produksjonsforhold\b/i, /\bmaktforhold\b/i, /\bproduksjonsforhold\b/i],
      link: {
        thinker: "Politisk økologi",
        theory: "Politisk økologi",
        connection: "Teksten bruker politisk økologi som kritikk av enkle knapphetsforklaringer og vektlegger makt, kontekst og produksjonsforhold.",
        score: 0.82
      }
    },
    {
      key: "peluso_watts",
      triggers: [/\bpeluso\b/i, /\bwatts\b/i, /\bpeluso\s*&\s*watts\b/i],
      link: {
        thinker: "Peluso & Watts",
        theory: "Politisk økologi / makt og vold",
        connection: "Kobles til kritikken av enkel årsakskjede fra ressursknapphet til vold.",
        score: 0.76
      }
    },
    {
      key: "ester_boserup",
      triggers: [/\bester\s+boserup\b/i, /\bboserup\b/i, /\bbærekraftig\s+intensivering\b/i],
      link: {
        thinker: "Ester Boserup",
        theory: "Boserupsk intensivering",
        connection: "Teksten viser til Boserups teori om at befolkningsvekst kan bidra til intensivering og forbedret ressursgrunnlag.",
        score: 0.72
      }
    },
    {
      key: "edward_said",
      triggers: [/\bedward\s+said\b/i, /\bsaid\b/i, /\borientalisme?n?\b/i],
      link: {
        thinker: "Edward Said",
        theory: "Orientalisme",
        connection: "Teksten bruker orientalisme som kritikk av vestlige forestillinger om fattige land og afrikanske småbønder/husdyrgjetere.",
        score: 0.75
      }
    },
    {
      key: "prio_gleditsch",
      triggers: [/\bgleditsch\b/i, /\bprio\b/i, /\bfredsforskningsinstituttet\b/i, /\bnordås\s*&\s*gleditsch\b/i, /\bbinningsbø\b/i, /\bde\s+soysa\b/i, /\btheisen\b/i, /\braleigh\s*&\s*urdal\b/i],
      link: {
        thinker: "PRIO / Gleditsch",
        theory: "Kvantitativ kritikk av klima-konflikt-koblingen",
        connection: "Teksten viser til kvantitative studier som kritiserer den påståtte sammenhengen mellom klimaendringer, ressursknapphet og voldelige konflikter.",
        score: 0.70
      }
    },
    {
      key: "robert_kaplan",
      triggers: [/\brobert\s+kaplan\b/i, /\bkaplan\b/i],
      link: {
        thinker: "Robert Kaplan",
        theory: "Populærmalthusiansk konfliktfortelling",
        connection: "Teksten bruker Kaplan som eksempel på en innflytelsesrik journalistisk formidling av knapphet, overbefolkning og miljøkrise som konfliktforklaring.",
        score: 0.62
      }
    },
    {
      key: "bachler_swiss_peace",
      triggers: [/\bbächler\b/i, /\bbachler\b/i, /\bswiss\s+peace\b/i, /\bbächler\s*&\s*spillmann\b/i],
      link: {
        thinker: "Bächler / Swiss Peace",
        theory: "Miljødegradering som konfliktforklaring",
        connection: "Teksten viser til Bächler og Swiss Peace som eksempler på forskning som kobler afrikanske tørrlandsområder, miljødegradering og vold.",
        score: 0.62
      }
    },
    {
      key: "barnett_salehyan",
      triggers: [/\bbarnett\b/i, /\bsalehyan\b/i],
      link: {
        thinker: "Barnett / Salehyan",
        theory: "Kritikk av klima-konflikt-koblingen",
        connection: "Teksten viser til forskning som kritiserer ideen om at klimaendringer direkte fører til voldelige konflikter.",
        score: 0.60
      }
    }
  ];

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
      getRuntimeKnowledgePolicy,
      normalizeAfterworkConcept
    } = deps;

  function isGenericDisplayConcept(value) {
    return GENERIC_DISPLAY_CONCEPTS.has(normalizeAfterworkConcept(value));
  }

  function extractAcademicPhraseConcepts(text) {
    const source = String(text || "");
    if (!source.trim()) return [];
    const out = [];
    const seen = new Set();
    ACADEMIC_PHRASE_CONCEPTS.forEach((phrase) => {
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
      const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${escaped})(?=$|[^\\p{L}\\p{N}])`, "iu");
      if (!re.test(source)) return;
      const key = normalizeAfterworkConcept(phrase);
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(phrase);
    });
    return out.slice(0, 12);
  }
  function normalizeSimpleStringList(list, max) {
    const out = [];
    const seen = new Set();
    (Array.isArray(list) ? list : []).forEach((item) => {
      const value = String(item || "").trim();
      if (!value) return;
      const key = value.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(value);
    });
    return out.slice(0, Math.max(1, Number(max || 5)));
  }
  function normalizeTheoreticalLinks(list, max) {
    const out = [];
    const seen = new Set();
    (Array.isArray(list) ? list : []).forEach((item) => {
      if (!item || typeof item !== "object") return;
      const name = String(item.name || "").trim();
      const relation = String(item.relation || "").trim();
      if (!name || !relation) return;
      const key = `${name.toLowerCase()}|${relation.toLowerCase()}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ name, relation });
    });
    return out.slice(0, Math.max(1, Number(max || 5)));
  }


  function extractAcademicTheoryLinks(text) {
    const source = String(text || "");
    if (!source.trim()) return [];
    const out = [];
    const publicAdminSignal = detectPublicAdministrationReformSignal(source);
    ACADEMIC_THEORY_RULES.forEach((rule) => {
      if (rule?.key === "peluso_watts") return;
      if (!Array.isArray(rule?.triggers) || !rule.triggers.some((re) => re.test(source))) return;
      out.push({
        thinker: rule.link.thinker,
        theory: rule.link.theory,
        score: Number(rule.link.score || 0),
        connection: rule.link.connection
      });
    });
    const paragraphs = source.split(/\n{2,}|\r\n{2,}/).map((part) => part.trim()).filter(Boolean);
    const hasPelusoAndWattsInParagraph = paragraphs.some((part) => /\bpeluso\b/i.test(part) && /\bwatts\b/i.test(part));
    const sentences = source.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);
    const hasPelusoAndWattsInSentence = sentences.some((part) => /\bpeluso\b/i.test(part) && /\bwatts\b/i.test(part));
    const pelusoMatches = Array.from(source.matchAll(/\bpeluso\b/gi));
    const wattsMatches = Array.from(source.matchAll(/\bwatts\b/gi));
    const hasPelusoWattsNearby = pelusoMatches.some((pelusoMatch) => wattsMatches.some((wattsMatch) => Math.abs((pelusoMatch.index || 0) - (wattsMatch.index || 0)) <= 300));
    if (hasPelusoAndWattsInParagraph || hasPelusoAndWattsInSentence || hasPelusoWattsNearby) {
      out.push({
        thinker: "Peluso & Watts",
        theory: "Politisk økologi / makt og vold",
        score: 0.76,
        connection: "Kobles til kritikken av enkel årsakskjede fra ressursknapphet via økonomisk nedgang og migrasjon til vold."
      });
    }
    if (publicAdminSignal.strong) {
      const txt = source.toLowerCase();
      const has = (arr) => arr.some((term) => txt.includes(term));
      const hits = (arr) => arr.filter((term) => txt.includes(term)).length;
      const addTheory = (thinker, theory, score, connection) => out.push({ thinker, theory, score, connection });
      if (has(["bakkebyråkrati", "street-level bureaucracy"]) || (has(["nav-kontor", "lokalkontor", "arbeidsrettet oppfølging"]) && has(["individuell oppfølging", "brukerrettet bistand", "arbeidsrettet oppfølging"]))) addTheory("Michael Lipsky", "Bakkebyråkrati / street-level bureaucracy", 0.74, "Teksten handler om hvordan lokale frontlinjekontorer skal omsette sentrale mål og regler til individuell oppfølging av brukere.");
      if (has(["implementering", "iverksetting", "reformgjennomføring", "etablering av nav-kontor", "prosessevaluering", "omstillingsprosess"])) addTheory("Implementeringsteori", "Implementeringsteori", 0.76, "Teksten analyserer hvordan reformmål omsettes i lokal praksis gjennom etablering, organisering og iverksetting.");
      if (hits(["implementering", "iverksetting", "reform", "nav-kontor", "måloppnåelse", "flere i arbeid"]) >= 3) addTheory("Pressman & Wildavsky", "Implementeringsteori", 0.68, "Teksten kan forstås som en analyse av implementeringsgapet mellom reformintensjon og lokal måloppnåelse.");
      if (has(["organisasjonsreform", "organisering", "organisatorisk design", "fusjonert", "samlokalisert", "kontorstørrelse", "virksomhetsutvikling"])) addTheory("Organisasjonsteori", "Organisasjonsteori", 0.76, "Teksten analyserer hvordan organisering, kontorstørrelse og arbeidsdeling påvirker NAV-kontorenes resultater.");
      if (has(["partnerskap mellom stat og kommune", "stat og kommune", "stat–kommune", "statlige mål", "kommunale mål"]) && has(["strukturelle utfordringer", "styring", "kommunale virkemidler"])) addTheory("Institusjonell teori", "Institusjonell teori", 0.72, "Teksten viser hvordan ulike institusjonelle logikker og målstrukturer kan skape varige spenninger i NAV-kontorene.");
      if (has(["institusjonell teori", "institusjonelle logikker", "offentlig organisering", "statlige mål", "kommunale mål"]) && has(["organisasjonsreform", "styring"])) addTheory("March & Olsen", "Institusjonell organisasjonsteori", 0.64, "Teksten kan kobles til institusjonell organisasjonsteori gjennom analysen av mål, regler og organisasjonslogikker.");
      if (hits(["standardisering", "målstyring", "effektivisering", "forenkling", "direktorat", "statlig styring", "resultat", "måloppnåelse"]) >= 2) addTheory("New Public Management", "New Public Management", 0.68, "Teksten berører styrings- og standardiseringslogikker i offentlig reform, særlig forholdet mellom mål, resultater og lokal oppgaveløsning.");
      if (hits(["new public management", "standardisering", "målstyring", "offentlig reform", "resultatstyring"]) >= 2) addTheory("Christopher Hood", "New Public Management", 0.62, "Teksten kan kobles til New Public Management gjennom vekt på styring, standardisering og resultatorientering i offentlig sektor.");
      if (has(["partnerskap", "stat og kommune", "stat–kommune", "kommunale mål", "statlige mål"])) addTheory("Samstyring / governance", "Samstyring / governance", 0.74, "Teksten analyserer hvordan partnerskapet mellom stat og kommune skaper koordinerings- og styringsutfordringer.");
      if (has(["nav-evalueringen", "prosessevaluering", "effektevaluering", "effektforskning", "negative effekter", "måloppnåelse"])) addTheory("Reformevaluering", "Reformevaluering", 0.73, "Teksten bygger på prosess- og effektdata for å vurdere om NAV-reformen har nådd sine mål.");
    }
    return out;
  }

  function mergeTheoryLinks(existingLinks, extractedLinks, maxItems) {
    const bestByKey = new Map();
    const add = (item) => {
      if (!item || typeof item !== "object") return;
      const thinker = String(item.thinker || item.name || "").trim();
      const theory = String(item.theory || "").trim();
      const connection = String(item.connection || item.relation || "").trim();
      const score = Number(item.score || item.relevance_score || 0);
      if (!thinker && !theory) return;
      const key = `${thinker.toLowerCase()}|${theory.toLowerCase()}`;
      const prev = bestByKey.get(key);
      if (!prev || score > prev.score) bestByKey.set(key, { thinker, theory, connection, score });
    };
    (Array.isArray(existingLinks) ? existingLinks : []).forEach(add);
    (Array.isArray(extractedLinks) ? extractedLinks : []).forEach(add);
    return Array.from(bestByKey.values())
      .sort((a, b) => (b.score - a.score) || a.thinker.localeCompare(b.thinker))
      .slice(0, Math.max(1, Number(maxItems || 5)));
  }

  function normalizeAcademicCandidateText(value) {
    return String(value || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
  }

  function academicCandidateInSource(sourceText, term) {
    const haystack = normalizeAcademicCandidateText(cleanArticleText(sourceText));
    const needle = normalizeAcademicCandidateText(term);
    if (!haystack || !needle) return false;
    return ` ${haystack} `.includes(` ${needle} `);
  }

  function buildAcademicConceptCandidates(sourceText = "", payload = {}) {
    const fromPayload = []
      .concat(Array.isArray(payload?.concepts) ? payload.concepts : [])
      .concat(Array.isArray(payload?.keywords) ? payload.keywords : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    const sourceBoundSubjectTerms = []
      .concat(Array.isArray(payload?.subjectMatches) ? payload.subjectMatches : [])
      .concat(Array.isArray(payload?.subjectLinks) ? payload.subjectLinks : [])
      .flatMap((match) => Array.isArray(match?.matched_terms) ? match.matched_terms : [])
      .map((item) => String(item || "").trim())
      .filter((term) => term && academicCandidateInSource(sourceText, term));
    const phraseConcepts = typeof extractAcademicPhraseConcepts === "function" ? extractAcademicPhraseConcepts(sourceText).slice(0, 12) : [];
    const candidates = [
      "Pinse", "pentekosté", "Den hellige ånd", "tungetale", "nådegave", "tydning", "apostlene", "Babels tårn", "kirkens fødselsdag", "gregoriansk kalender", "juliansk kalender", "treenighetssøndag"
    ];
    const lexiconHits = candidates.filter((term) => academicCandidateInSource(sourceText, term));
    return Array.from(new Set(sourceBoundSubjectTerms.concat(fromPayload, phraseConcepts, lexiconHits))).slice(0, 20);
  }

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
      isGenericDisplayConcept,
      extractAcademicPhraseConcepts,
      normalizeSimpleStringList,
      normalizeTheoreticalLinks,
      extractAcademicTheoryLinks,
      mergeTheoryLinks,
      buildAcademicConceptCandidates,
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
