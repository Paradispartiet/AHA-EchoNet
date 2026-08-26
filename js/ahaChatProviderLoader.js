// Versjonert provider-manifest og lastesøm for AHA Chat.

(function (global) {
  "use strict";

  function spec(legacyGlobal, functions = [], factory = null, version = 1) {
    return Object.freeze({
      legacyGlobal,
      label: legacyGlobal,
      functions: Object.freeze(functions.slice()),
      factory,
      version
    });
  }

  const CHAT_PROVIDERS = Object.freeze({
    textUtils: spec("AHAChatTextUtils", ["shortHash", "takeKeywords", "sourceHash", "cleanArticleText", "toSentences", "collectOpinionArticleEvidence"]),
    signals: spec("AHAChatSignals", [
      "detectTextType", "detectPublicAdministrationReformSignal", "detectPublicAdministrationSignal",
      "inferReligiousLexiconEvidence", "detectCanonicalAnalysisDomain",
      "detectInstitutionalMediaHistorySignal", "detectLiteraryAttachmentSignal"
    ]),
    subjects: spec("AHAChatSubjects", ["normalizeSubjectLinks", "enrichSubjectMatchesForClimateConflict", "enrichSubjectMatchesForPublicAdministration", "normalizeFagkoblinger", "isAcademicLikeType"]),
    analysis: spec("AHAChatAnalysis", ["buildOpinionArticleQualityAnalysis"]),
    replyFormat: spec("AHAChatReplyFormat", ["normalizeAhaVisibleReply", "createSubjectPolicy"]),
    chamberStore: spec("AHAChatChamberStore", ["create"], "create"),
    autoOutputStore: spec("AHAChatAutoOutputStore", ["create"], "create"),
    uiRuntime: spec("AHAChatUiRuntime", ["createShell", "create"]),
    analysisPolicy: spec("AHAChatAnalysisPolicy", ["create"], "create"),
    conceptPolicy: spec("AHAChatConceptPolicy", ["create"], "create"),
    analysisRunContract: spec("AHAChatAnalysisRunContract"),
    analysisBundleV2: spec("AHAAnalysisBundleV2", [], null, 2),
    analysisReadModelV2: spec("AHAAnalysisReadModelV2", ["build", "validate", "hydrate"], null, 2),
    knowledgeMapReadModelV2: spec("AHAKnowledgeMapReadModelV2", ["build", "validate", "hydrate"], null, 2),
    liveSemanticBridgeV2: spec("AHALiveSemanticBridgeV2", ["build", "validate", "hydrate"], null, 2),
    memoryControls: spec("AHAChatMemoryControls", ["create"], "create"),
    afterwork: spec("AHAChatAfterwork", ["create", "createAutoOutputAdapter"], "create"),
    memoryRuntime: spec("AHAChatMemoryRuntime", ["create"], "create"),
    runContext: spec("AHAChatRunContext", ["create", "createSubmissionRuntime"], "create"),
    insightPipeline: spec("AHAChatInsightPipeline", ["create"], "create"),
    agentRuntime: spec("AHAChatAgentRuntime", ["create"], "create"),
    ingestRuntime: spec("AHAChatIngestRuntime", ["create"], "create"),
    academicInsightView: spec("AHAChatAcademicInsightView", ["create"], "create"),
    insightView: spec("AHAChatInsightView", ["create"], "create"),
    personalUi: spec("AHAChatPersonalUi", ["create"], "create"),
    conversationView: spec("AHAChatConversationView", ["create"], "create"),
    analysisStateView: spec("AHAChatAnalysisStateView", ["create"], "create"),
    autoAnalysis: spec("AHAChatAutoAnalysis", ["create"], "create"),
    autoOutputView: spec("AHAChatAutoOutputView", ["create", "createRuntime"], "create"),
    canonicalAnalysis: spec("AHAChatCanonicalAnalysis", ["create"], "create"),
    capabilityBindings: spec("AHAChatCapabilityBindings", ["bind"]),
    export: spec("AHAChatExport", ["createRuntime"]),
    knowledgeView: spec("AHAChatKnowledgeView", ["create"]),
    runtimeFacade: spec("AHAChatRuntimeFacade", ["create"]),
    runtimeComposition: spec("AHAChatRuntimeComposition", ["create"], "create"),
    applicationComposition: spec("AHAChatApplicationComposition", ["create"], "create")
  });

  // V2 semantic quality repair. This remains a provider adapter rather than a
  // second semantic engine: SemanticDocumentV2 and the Insight Quality Gate stay
  // authoritative. The adapter improves long-source reach/salience and prevents
  // optional enrichment from masquerading as a failed core analysis.
  const QUALITY_REPAIR_SCHEMA = "aha_semantic_quality_repair_v2";
  const MIN_PRODUCT_READY_APPROVED_INSIGHTS = 2;
  const LONG_SOURCE_LIMIT = 7600;
  const SUBSTANTIVE_SOURCE_MIN = 1200;
  const MAX_VISIBLE_CONCEPTS = 16;
  const MAX_VISIBLE_CLAIMS = 12;
  const MAX_VISIBLE_TENSIONS = 6;
  const providerRepairCache = new WeakMap();

  const CONCEPT_NOISE = new Set([
    "skrev", "skrive", "skriver", "skrevet", "henne", "hennes", "ham", "hans", "hun", "han",
    "wrote", "write", "written", "about", "https", "http", "www",
    "statistikk", "artikkelvisninger", "crossref", "siteringer", "sitering", "siteringsvarsel",
    "referanser", "figurer", "figur", "dele", "favoritt", "lagre", "informasjon", "forfattere",
    "siste", "måneder", "maaneder", "side", "abstract", "sammendragabstract"
  ].map(normalize));
  const TITLE_NOISE = /(?:https?:\/\/|@|\b(?:statistikk|artikkelvisninger|crossref|siteringer|siteringsvarsel|lagre favoritt|referanser|figurer|informasjon og forfattere)\b)/iu;
  const SOURCE_CHROME_LINE = /^(?:\*\s*)?(?:statistikk|artikkelvisninger|crossref\s+siteringer|siteringsvarsel|lagre\s+favoritt|siter\s+artikkel|informasjon\s+og\s+forfattere|referanser|figurer|dele|åpne\s+i\s+viewer|siste\s+12\s+måneder|side\s+\d+(?:\s*[–-]\s*\d+)?|figur\s+\d+\b|figurkilde\b|takkenote\s*:)/iu;
  const GENERIC_SECTION_HEADING = /^(?:sammendrag(?:abstract)?|abstract|nøkkelord|keywords?|innledning|bakgrunn|metode|materiale\s+og\s+metode|resultater?|funn|diskusjon|drøfting|begrensninger?|konklusjon|avslutning|referanser|takkenote)\s*:?$/iu;
  const TENSION_SIGNAL = /\b(?:men|mens|samtidig|derimot|likevel|kontrast|kontrasteres|på den ene siden|på den andre siden|spenning(?:sfelt)? mellom|utfordring|problematisk)\b/iu;
  const CONCLUSION_SIGNAL = /\b(?:konklusjon|avslutning|vi har argumentert|vi har vist|vår analyse|dette viser|dermed|derfor|sentralt|viktig|problematiserer)\b/iu;
  const ACADEMIC_ROLE_ORDER = Object.freeze([
    "research_question", "method", "framework", "findings", "limitations", "conclusion"
  ]);
  const ACADEMIC_ROLE_SIGNALS = Object.freeze({
    research_question: /\b(?:problemstilling(?:en)?|forskningsspørsmål(?:et|ene)?|research question|formål(?:et)? med (?:studien|artikkelen)|hensikt(?:en)? med (?:studien|artikkelen)|vi (?:undersøker|diskuterer|drøfter|analyserer)|artikkelen (?:undersøker|diskuterer|drøfter|analyserer)|studien undersøker|vårt utgangspunkt er|sentralt for vår analyse|(?:the|this) (?:article|study) asks|the study asks)\b/iu,
    method: /\b(?:metode(?:n|r)?|metodisk|datamateriale|materiale og metode|utvalg(?:et)?|informant(?:er|ene)?|intervju(?:er|ene)?|observasjon(?:er|ene)?|casestudie|case study|kvalitativ|kvantitativ|empiri(?:sk)?|analysemetode|vi (?:trekker veksler på|leser|analyserer)|med utgangspunkt i|kontekstualiserer?|semi-structured interviews?|thematic analysis|qualitative|quantitative)\b/iu,
    framework: /\b(?:teori(?:en|er)?|teoretisk|vitenskapsteoretisk|rammeverk(?:et)?|perspektiv(?:et|er)?|begrep(?:et|er)?|litteraturteori|omsorgsforsk(?:ing|ning)|narrativ gerontologi|situert kunnskap|conceptual framework|theoretical framework|analytisk tilnærming)\b/iu,
    findings: /\b(?:resultat(?:er|ene)?|funn(?:ene)?|analysen viser|vår analyse (?:viser|peker|synliggjør)|studien viser|vi finner|vi fant|vi (?:argumenterer|problematiserer|understreker|fremhever)|hovedtema(?:ene)?|temaene|informantene (?:beskriver|forteller)|deltakerne (?:beskriver|forteller)|findings?|results?|the analysis identifies|the study finds)\b/iu,
    limitations: /\b(?:begrensning(?:er|ene)?|forbehold|usikkerhet|kan ikke fastslå|ikke nødvendigvis|videre forskning|videre diskusjon|mye mer kan og bør sies|limitations?|cannot establish|further research)\b/iu,
    conclusion: /\b(?:konklusjon(?:en)?|avslutning|åpning til videre diskusjon|vi konkluderer|vi har vist|vi har argumentert|vi har kommet med et innspill|dette viser|samlet sett|overall|conclusion|the study concludes)\b/iu
  });
  const ROLE_HEADING_SIGNALS = Object.freeze({
    research_question: /^(?:problemstilling|forskningsspørsmål|research question)\b/iu,
    method: /^(?:metode|materiale og metode|method|methods)\b/iu,
    framework: /^(?:teori|teoretisk rammeverk|theory|theoretical framework)\b/iu,
    findings: /^(?:resultat|resultater|funn|results|findings)\b/iu,
    limitations: /^(?:begrensninger?|limitations?)\b/iu,
    conclusion: /^(?:konklusjon|avslutning|conclusion)\b/iu
  });

  function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function array(value) { return Array.isArray(value) ? value : []; }
  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function text(value) {
    if (value == null) return "";
    if (["string", "number", "boolean"].includes(typeof value)) return String(value).replace(/\s+/g, " ").trim();
    const source = object(value);
    return text(source.insight || source.text || source.label || source.title || source.summary || source.term || source.value);
  }
  function normalize(value) {
    return text(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ").trim();
  }
  function contentTokens(value) {
    const stop = new Set(["og","i","på","til","av","for","med","som","det","den","de","et","en","er","var","blir","kan","skal","har","om","at","fra","the","and","of","to","in","with","this","that"]);
    return normalize(value).split(/\s+/).filter((token) => token.length > 2 && !stop.has(token));
  }
  function deepFreeze(value, seen = new Set()) {
    if (!value || typeof value !== "object" || seen.has(value)) return value;
    seen.add(value);
    Object.keys(value).forEach((key) => deepFreeze(value[key], seen));
    return Object.freeze(value);
  }
  function unique(values, keyFn = text) {
    const seen = new Set();
    return array(values).filter((item) => {
      const key = normalize(keyFn(item));
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  function wholeWordCount(sourceText, label) {
    const source = String(sourceText || "");
    const needle = text(label);
    if (!source || !needle) return 0;
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let expression;
    try { expression = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, "giu"); }
    catch { return source.toLowerCase().split(needle.toLowerCase()).length - 1; }
    let count = 0;
    while (expression.exec(source)) count += 1;
    return count;
  }

  function isSourceChromeLine(value) {
    const line = String(value || "").trim();
    if (!line) return true;
    if (SOURCE_CHROME_LINE.test(line) || /^https?:\/\/\S+$/iu.test(line) || /@\S+\.\S+/u.test(line)) return true;
    if (/^(?:\d[\d\s.,]*|\d{1,2}[./-]\d{1,2}[./-]\d{2,4})$/u.test(line)) return true;
    return false;
  }

  function sourceSentenceChunks(value, limit = 1400) {
    const input = String(value || "").trim();
    if (!input) return [];
    const sentences = input.match(/[^.!?…]+(?:[.!?…]+|$)/gu)?.map((part) => part.trim()).filter(Boolean) || [input];
    const chunks = [];
    let current = "";
    const flush = () => { if (current.trim()) chunks.push(current.trim()); current = ""; };
    sentences.forEach((sentence) => {
      if (sentence.length > limit) {
        flush();
        let cursor = 0;
        while (cursor < sentence.length) {
          let end = Math.min(sentence.length, cursor + limit);
          if (end < sentence.length) {
            const boundary = sentence.lastIndexOf(" ", end);
            if (boundary > cursor + Math.floor(limit * 0.6)) end = boundary;
          }
          chunks.push(sentence.slice(cursor, end).trim());
          cursor = end;
        }
        return;
      }
      const next = current ? `${current} ${sentence}` : sentence;
      if (current && next.length > limit) flush();
      current = current ? `${current} ${sentence}` : sentence;
    });
    flush();
    return chunks.filter((part) => part.length >= 35);
  }

  function splitSourceUnits(sourceText) {
    const source = String(sourceText || "").replace(/\r\n?/g, "\n").replace(/[\u2028\u2029]/gu, "\n");
    const lines = source.split(/\n+/).map((part) => part.trim()).filter(Boolean);
    const units = [];
    let pendingHeading = "";
    const pushContent = (value) => sourceSentenceChunks(value).forEach((part) => units.push(part));
    lines.forEach((line) => {
      if (isSourceChromeLine(line)) return;
      const heading = line.length < 70 && !/[.!?…]$/u.test(line) && line.split(/\s+/).length <= 10;
      if (heading) {
        if (pendingHeading && !GENERIC_SECTION_HEADING.test(pendingHeading)) pushContent(pendingHeading);
        pendingHeading = line;
        return;
      }
      const combined = pendingHeading ? `${pendingHeading}\n${line}` : line;
      pendingHeading = "";
      pushContent(combined);
    });
    if (pendingHeading && !GENERIC_SECTION_HEADING.test(pendingHeading)) pushContent(pendingHeading);
    if (units.length) return units;
    return sourceSentenceChunks(source);
  }

  function rolesForUnit(unit) {
    const value = String(unit || "");
    return ACADEMIC_ROLE_ORDER.filter((role) => ACADEMIC_ROLE_SIGNALS[role].test(value));
  }

  function detectAcademicCoverage(sourceText) {
    const units = splitSourceUnits(sourceText);
    const counts = Object.fromEntries(ACADEMIC_ROLE_ORDER.map((role) => [role, 0]));
    units.forEach((unit) => rolesForUnit(unit).forEach((role) => { counts[role] += 1; }));
    return deepFreeze({
      schema: QUALITY_REPAIR_SCHEMA,
      roles: ACADEMIC_ROLE_ORDER.filter((role) => counts[role] > 0),
      counts,
      unit_count: units.length
    });
  }

  function roleUnitScore(unit, role, index) {
    const value = String(unit || "").trim();
    let score = ACADEMIC_ROLE_SIGNALS[role].test(value) ? 10 : 0;
    if (ROLE_HEADING_SIGNALS[role]?.test(value)) score += 8;
    score += Math.min(4, rolesForUnit(value).length * 2);
    if (value.length >= 100 && value.length <= 1400) score += 2;
    score += Math.max(0, 2 - (index * 0.01));
    return score;
  }

  function focusAcademicSource(sourceText, limit = LONG_SOURCE_LIMIT) {
    const source = String(sourceText || "").trim();
    if (!source || source.length <= limit) return source;
    const coverage = detectAcademicCoverage(source);
    if (coverage.roles.length < 3) return "";
    const units = splitSourceUnits(source);
    if (units.length <= 1) return source.slice(0, limit);
    const unitOrder = new Map(units.map((unit, index) => [normalize(unit), index]));
    const chosen = [];
    const chosenKeys = new Set();
    let used = 0;
    const add = (unit) => {
      const value = String(unit || "").trim();
      const key = normalize(value);
      if (!value || chosenKeys.has(key)) return false;
      const extra = value.length + (chosen.length ? 2 : 0);
      if (used + extra > limit) return false;
      chosen.push(value);
      chosenKeys.add(key);
      used += extra;
      return true;
    };
    add(units[0]);
    const rolePriority = ["research_question", "conclusion", "framework", "method", "findings", "limitations"];
    rolePriority.forEach((role) => {
      const candidate = units.map((unit, index) => ({ unit, index, score: roleUnitScore(unit, role, index) }))
        .filter((item) => item.score >= 10)
        .sort((left, right) => right.score - left.score || left.index - right.index)[0];
      if (candidate) add(candidate.unit);
    });
    units.slice(0, Math.min(8, units.length)).forEach(add);
    units.slice(Math.max(0, units.length - 5)).forEach(add);
    units.map((unit, index) => ({
      unit,
      index,
      score: (rolesForUnit(unit).length * 6)
        + (TENSION_SIGNAL.test(unit) ? 3 : 0)
        + (CONCLUSION_SIGNAL.test(unit) ? 4 : 0)
        + Math.min(3, contentTokens(unit).length / 45)
    })).sort((left, right) => right.score - left.score || left.index - right.index)
      .forEach(({ unit }) => add(unit));
    return chosen.sort((left, right) => (unitOrder.get(normalize(left)) ?? Number.MAX_SAFE_INTEGER) - (unitOrder.get(normalize(right)) ?? Number.MAX_SAFE_INTEGER)).join("\n\n").slice(0, limit);
  }

  function focusLongSource(sourceText, limit = LONG_SOURCE_LIMIT) {
    const source = String(sourceText || "").trim();
    if (!source || source.length <= limit) return source;
    const academic = focusAcademicSource(source, limit);
    if (academic) return academic;
    const units = splitSourceUnits(source);
    if (units.length <= 1) return source.slice(0, limit);
    const unitOrder = new Map(units.map((unit, index) => [normalize(unit), index]));

    const chosen = [];
    const chosenKeys = new Set();
    let used = 0;
    const add = (unit) => {
      const value = String(unit || "").trim();
      const key = normalize(value);
      if (!value || chosenKeys.has(key)) return false;
      const extra = value.length + (chosen.length ? 2 : 0);
      if (used + extra > limit) return false;
      chosen.push(value);
      chosenKeys.add(key);
      used += extra;
      return true;
    };

    for (let index = 0; index < Math.min(5, units.length); index += 1) add(units[index]);
    for (let index = Math.max(0, units.length - 4); index < units.length; index += 1) add(units[index]);

    const middle = units.slice(5, Math.max(5, units.length - 4)).map((unit, index) => {
      let score = 0;
      if (TENSION_SIGNAL.test(unit)) score += 5;
      if (CONCLUSION_SIGNAL.test(unit)) score += 4;
      if (/\b(?:etikk|representasjon|fortolk|mekanisme|årsak|konsekvens|prinsipp|rettighet|dilemma|kritisk)\w*/iu.test(unit)) score += 2;
      score += Math.min(3, contentTokens(unit).length / 35);
      return { unit, index, score };
    }).sort((left, right) => right.score - left.score || left.index - right.index);
    middle.forEach(({ unit }) => add(unit));

    return chosen.sort((left, right) => (unitOrder.get(normalize(left)) ?? Number.MAX_SAFE_INTEGER) - (unitOrder.get(normalize(right)) ?? Number.MAX_SAFE_INTEGER)).join("\n\n").slice(0, limit);
  }

  function candidateConceptKeys(payload) {
    return new Set(array(payload?.insightCandidatesV2)
      .flatMap((candidate) => array(candidate?.concepts))
      .map(normalize).filter(Boolean));
  }

  function headerMetadataConceptKeys(sourceText) {
    const keys = new Set();
    String(sourceText || "").replace(/[\u2028\u2029]/gu, "\n").split(/\r?\n/).slice(0, 30).forEach((line) => {
      if (!/@\S+\.\S+/u.test(line)) return;
      line.replace(/[^\p{L}\p{M}'’.-]+/gu, " ").split(/\s+/).filter((token) => token.length >= 3)
        .forEach((token) => keys.add(normalize(token)));
    });
    return keys;
  }

  function alternateLanguageTitleConceptKeys(sourceText) {
    const source = String(sourceText || "").replace(/[\u2028\u2029]/gu, "\n");
    const norwegianBody = (source.match(/\b(?:og|som|ikke|denne|artikkelen|fortelling|omsorg)\b/giu) || []).length >= 8;
    if (!norwegianBody) return new Set();
    const keys = new Set();
    source.split(/\r?\n/).slice(0, 25).forEach((line) => {
      const englishSignals = line.match(/\b(?:the|and|of|about|with|from|into)\b/giu) || [];
      if (englishSignals.length < 2) return;
      normalize(line).split(/\s+/).filter((token) => token.length >= 4 && !["with", "from", "into", "about"].includes(token))
        .forEach((token) => keys.add(token));
    });
    return keys;
  }

  function closeMorphologicalDuplicate(leftValue, rightValue) {
    const left = normalize(leftValue).replace(/-/gu, ""), right = normalize(rightValue).replace(/-/gu, "");
    if (!left || !right) return false;
    if (left === right) return true;
    const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
    return shorter.length >= 6 && longer.startsWith(shorter) && longer.length - shorter.length <= 4;
  }

  function candidateEvidencePositions(candidate) {
    return array(candidate?.evidence).flatMap((entry) => array(entry?.spans))
      .map((span) => Number(span?.start_offset)).filter((value) => Number.isInteger(value) && value >= 0);
  }

  function academicCandidateSalience(candidate, sourceText, coreUnits) {
    const sourceLength = Math.max(1, String(sourceText || "").length);
    const positions = candidateEvidencePositions(candidate).sort((left, right) => left - right);
    const candidateKeys = new Set(contentTokens([candidate?.insight, candidate?.abstraction, candidate?.why_it_matters].filter(Boolean).join(" ")));
    const coreKeys = new Set(contentTokens(coreUnits.join(" ")));
    let score = Number(candidate?.quality_metrics?.quality_score || 0) * 4;
    candidateKeys.forEach((key) => { if (coreKeys.has(key)) score += 0.35; });
    if (positions.some((position) => position <= sourceLength * 0.25)) score += 2;
    if (positions.some((position) => position >= sourceLength * 0.72)) score += 4;
    if (positions.length >= 2) {
      const spread = (positions[positions.length - 1] - positions[0]) / sourceLength;
      score += Math.min(5, spread * 8);
      if (spread < 0.035) score -= 4;
    }
    const representedRoles = new Set();
    positions.forEach((position) => rolesForUnit(String(sourceText || "").slice(Math.max(0, position - 500), Math.min(sourceLength, position + 700))).forEach((role) => representedRoles.add(role)));
    score += Math.min(4, representedRoles.size);
    return score;
  }

  function rankAcademicCandidates(candidates, sourceText) {
    const coverage = detectAcademicCoverage(sourceText);
    if (coverage.roles.length < 3) return array(candidates);
    const coreUnits = splitSourceUnits(sourceText).filter((unit) => rolesForUnit(unit).some((role) => ["research_question", "findings", "conclusion"].includes(role)));
    return array(candidates).map((candidate, index) => ({ candidate, index, score: academicCandidateSalience(candidate, sourceText, coreUnits) }))
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .map((item) => item.candidate);
  }

  function citationLikeConcept(label, sourceText) {
    const value = text(label);
    if (!/^\p{Lu}[\p{L}\p{M}'’.-]+$/u.test(value)) return false;
    const source = String(sourceText || "");
    return source.includes(`${value},`) || source.includes(`${value} (`) || source.includes(`${value} et al`);
  }

  function repairSemanticDocument(document, input = {}, originalProvider = null) {
    const sourceText = String(input.sourceText || "");
    const payload = object(input.payload);
    const repaired = clone(document);
    if (!repaired || repaired.schema !== "aha_semantic_document_v2") return document;
    if (sourceText.length < SUBSTANTIVE_SOURCE_MIN) return document;
    const supplied = candidateConceptKeys(payload);
    const headerMetadata = headerMetadataConceptKeys(sourceText);
    const alternateTitleNoise = alternateLanguageTitleConceptKeys(sourceText);
    const claimMentionCounts = new Map();
    array(repaired.claims).forEach((claim) => array(claim?.mentioned_concept_ids).forEach((id) => {
      claimMentionCounts.set(id, (claimMentionCounts.get(id) || 0) + 1);
    }));

    const rankedConcepts = array(repaired.concepts).map((concept, index) => {
      const label = text(concept?.label);
      const key = normalize(label);
      const occurrences = wholeWordCount(sourceText, label);
      const suppliedByCandidate = supplied.has(key);
      const wordCount = key.split(/\s+/).filter(Boolean).length;
      let score = (suppliedByCandidate ? 10 : 0) + Math.min(6, occurrences) * 2 + Math.min(5, claimMentionCounts.get(concept?.id) || 0);
      if (wordCount > 1) score += 3;
      if (CONCEPT_NOISE.has(key) || TITLE_NOISE.test(label)) score = -100;
      if (headerMetadata.has(key) || alternateTitleNoise.has(key) || (citationLikeConcept(label, sourceText) && occurrences < 2)) score = -100;
      if (!suppliedByCandidate && wordCount === 1 && occurrences < 2) score -= 6;
      return { concept, index, score };
    }).filter((item) => item.score >= 4)
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .filter((item, index, ranked) => !ranked.slice(0, index).some((earlier) => closeMorphologicalDuplicate(earlier.concept?.label, item.concept?.label)))
      .slice(0, MAX_VISIBLE_CONCEPTS);

    const keptConceptIds = new Set(rankedConcepts.map((item) => item.concept.id));
    repaired.concepts = rankedConcepts.sort((left, right) => left.index - right.index).map((item) => item.concept);
    repaired.claims = array(repaired.claims).map((claim) => ({
      ...claim,
      mentioned_concept_ids: array(claim?.mentioned_concept_ids).filter((id) => keptConceptIds.has(id))
    }));
    repaired.relations = array(repaired.relations).filter((relation) => relation?.type !== "claim_mentions_concept" || keptConceptIds.has(relation?.to_id));

    const tensionConceptLabels = repaired.concepts.map((concept) => normalize(concept.label));
    repaired.tensions = array(repaired.tensions).map((tension, index) => {
      const label = text(tension?.label);
      let score = TENSION_SIGNAL.test(label) ? 4 : 0;
      if (/\b(?:på den ene siden|på den andre siden|spenning(?:sfelt)? mellom|kontrasteres)\b/iu.test(label)) score += 4;
      if (label.length >= 70 && label.length <= 330) score += 2;
      const normalized = normalize(label);
      score += Math.min(3, tensionConceptLabels.filter((concept) => concept && normalized.includes(concept)).length);
      return { tension, index, score };
    }).filter((item) => item.score >= 4)
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .slice(0, 8)
      .sort((left, right) => left.index - right.index)
      .map((item) => item.tension);

    repaired.candidate_insights = rankAcademicCandidates(repaired.candidate_insights, sourceText);
    if (repaired.synthesis_gate && typeof repaired.synthesis_gate === "object") {
      repaired.synthesis_gate.approved_candidate_ids = repaired.candidate_insights.filter((item) => item?.status === "approved").map((item) => item.id);
      repaired.synthesis_gate.blocked_candidate_ids = repaired.candidate_insights.filter((item) => item?.status === "blocked").map((item) => item.id);
    }

    const synthesisStatus = text(repaired.synthesis_gate?.status);
    repaired.status = synthesisStatus === "not_run" ? "incomplete" : repaired.status;
    repaired.quality = {
      ...object(repaired.quality),
      status: synthesisStatus === "not_run" ? "incomplete" : repaired.quality?.status,
      concept_count: repaired.concepts.length,
      relation_count: repaired.relations.length,
      tension_count: repaired.tensions.length,
      reasons: unique([
        ...array(repaired.quality?.reasons),
        QUALITY_REPAIR_SCHEMA,
        ...(synthesisStatus === "not_run" ? ["semantic_synthesis_not_run_for_substantive_source"] : [])
      ])
    };
    repaired.policy = { ...object(repaired.policy), current_analysis_read_available: array(repaired.candidate_insights).some((item) => item?.status === "approved") };
    if (originalProvider?.validate) {
      repaired.validation = clone(originalProvider.validate(repaired, input));
      if (repaired.validation?.valid !== true) return document;
    }
    return deepFreeze(repaired);
  }

  function titleLineScore(line, semanticDocument) {
    const value = String(line || "").trim();
    if (!value || value.length < 20 || value.length > 180 || TITLE_NOISE.test(value)) return -100;
    if (/^(?:side\s+\d|\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d[\d\s.,-]*)$/iu.test(value)) return -100;
    if ((value.match(/\d/g) || []).length > value.length * 0.3) return -100;
    let score = 1;
    const normalized = normalize(value);
    array(semanticDocument?.concepts).forEach((concept) => {
      const key = normalize(concept?.label);
      if (key && normalized.includes(key)) score += key.includes(" ") ? 4 : 2;
    });
    if (/\b(?:og|om|mellom|i|for)\b/iu.test(value)) score += 1;
    if (!/[.!?…]$/u.test(value)) score += 2;
    if (/^[«"'“].*[»"'”]$/u.test(value)) score -= 1;
    return score;
  }

  function deriveSourceTheme(sourceText, semanticDocument) {
    const source = String(sourceText || "");
    const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 40);
    const ranked = lines.map((line, index) => ({
      line, index,
      score: titleLineScore(line, semanticDocument) + Math.max(0, 6 - (index * 0.6))
    }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || left.index - right.index);
    if (ranked.length) return ranked[0].line;
    const firstSentence = source.match(/[^.!?\n]{30,180}[.!?]?/u)?.[0]?.trim() || "";
    return firstSentence && !TITLE_NOISE.test(firstSentence) ? firstSentence : "";
  }

  function approvedInsight(semanticDocument) {
    return array(semanticDocument?.candidate_insights).find((item) => item?.status === "approved" && item?.eligible_for_current_analysis === true) || null;
  }

  function repairPayloadSourceFields(payload, sourceText, semanticDocument) {
    const source = object(payload);
    if (!Object.keys(source).length || semanticDocument?.schema !== "aha_semantic_document_v2") return source;
    if (String(sourceText || "").length < SUBSTANTIVE_SOURCE_MIN) return source;
    const theme = deriveSourceTheme(sourceText, semanticDocument);
    const insight = approvedInsight(semanticDocument);
    const tension = array(semanticDocument?.tensions)[0] || null;
    let canonical = source.canonicalAnalysis && typeof source.canonicalAnalysis === "object"
      ? { ...source.canonicalAnalysis }
      : null;
    let ahaSer = source.ahaSer && typeof source.ahaSer === "object" ? { ...source.ahaSer } : null;
    let thoughts = source.thoughts && typeof source.thoughts === "object" ? { ...source.thoughts } : null;
    if (theme) {
      if (canonical) canonical.theme = theme;
      if (ahaSer) ahaSer.tema = theme;
      if (thoughts) thoughts.hovedspor = theme;
    }
    if (insight) {
      if (canonical) canonical.keyInsight = insight.insight;
      if (ahaSer) ahaSer.viktigsteInnsikt = insight.insight;
      const rawCandidate = array(source.insightCandidatesV2).find((candidate) => normalize(candidate?.summary || candidate?.text) === normalize(insight.insight));
      const nextTest = text(rawCandidate?.next_test);
      if (nextTest && ahaSer) ahaSer.nesteSteg = nextTest;
      if (nextTest && thoughts) thoughts.neste_steg = nextTest;
    }
    if (tension?.label) {
      if (canonical) canonical.mainTension = tension.label;
      if (ahaSer) ahaSer.hovedspenning = tension.label;
    }
    if (canonical) source.canonicalAnalysis = canonical;
    if (ahaSer) source.ahaSer = ahaSer;
    if (thoughts) source.thoughts = thoughts;
    return source;
  }

  function verifiedThemeField(bundle, sourceText, semanticDocument) {
    const theme = deriveSourceTheme(sourceText, semanticDocument);
    const identity = object(bundle?.identity);
    if (!theme || !identity.source_sha256 || !identity.analysis_run_id || !identity.source_id) return null;
    const start = String(sourceText || "").indexOf(theme);
    if (start < 0) return null;
    const semanticIds = array(semanticDocument?.concepts)
      .filter((concept) => normalize(theme).includes(normalize(concept?.label)))
      .map((concept) => concept.id).filter(Boolean);
    const previous = bundle?.surfaces?.overview?.theme;
    return {
      schema: "aha_analysis_field_v2",
      field_id: "overview.theme",
      item_id: previous?.item_id || `overview.theme_${normalize(theme).slice(0, 24).replace(/\s+/g, "_")}`,
      value_type: "text",
      value: theme,
      source_sha256: identity.source_sha256,
      analysis_run_id: identity.analysis_run_id,
      source_id: identity.source_id,
      semantic_ids: semanticIds,
      provenance: {
        source_sha256: identity.source_sha256,
        analysis_run_id: identity.analysis_run_id,
        source_id: identity.source_id,
        origin: "semantic_quality_repair_v2_source_heading",
        evidence: [{ excerpt: theme, start, end: start + theme.length, exact_source_match: true }],
        status: "verified"
      },
      topic: { status: "verified", valid: true, reason: "exact_source_heading" },
      quality: { status: "passed", reason: "evidence_and_topic_verified" }
    };
  }

  function claimRecordScore(record, semanticDocument, index, count) {
    const value = text(record?.text);
    let score = 0;
    if (array(record?.mentioned_concept_ids).length) score += Math.min(5, record.mentioned_concept_ids.length * 2);
    if (TENSION_SIGNAL.test(value)) score += 3;
    if (CONCLUSION_SIGNAL.test(value)) score += 3;
    if (index < 5 || index >= count - 5) score += 2;
    const approvedQuotes = array(semanticDocument?.candidate_insights)
      .filter((candidate) => candidate?.status === "approved")
      .flatMap((candidate) => array(candidate?.evidence).map((entry) => text(entry?.quote)));
    if (approvedQuotes.some((quote) => quote && (value.includes(quote) || quote.includes(value)))) score += 10;
    return score;
  }

  function trimSemanticRecords(bundle, semanticDocument) {
    const semantic = object(bundle?.semantic_document);
    const claims = array(semantic.claim_records);
    semantic.claim_records = claims.map((record, index) => ({ record, index, score: claimRecordScore(record, semanticDocument, index, claims.length) }))
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .slice(0, MAX_VISIBLE_CLAIMS)
      .sort((left, right) => left.index - right.index)
      .map((item) => item.record);
    semantic.tension_records = array(semantic.tension_records).slice(0, MAX_VISIBLE_TENSIONS);
    return bundle;
  }

  function collectBundleFields(value, out = []) {
    if (!value || typeof value !== "object") return out;
    if (value.schema === "aha_analysis_field_v2") { out.push(value); return out; }
    if (Array.isArray(value)) value.forEach((item) => collectBundleFields(item, out));
    else Object.values(value).forEach((item) => collectBundleFields(item, out));
    return out;
  }

  function isCoreReadinessField(field) {
    const id = text(field?.field_id);
    return id === "overview.theme"
      || id === "overview.strongest_insight"
      || id === "overview.central_tension"
      || id === "insights.item"
      || id === "sources.primary";
  }

  function fieldPassed(field) {
    return field?.quality?.status === "passed"
      && field?.provenance?.status === "verified"
      && ["verified", "not_applicable"].includes(text(field?.topic?.status));
  }

  function semanticGateState(bundle, semanticDocument) {
    const gate = object(semanticDocument?.synthesis_gate && Object.keys(object(semanticDocument.synthesis_gate)).length
      ? semanticDocument.synthesis_gate
      : bundle?.semantic_document?.synthesis_gate);
    const status = text(gate.status);
    const approvedCount = Number(gate.approved_count ?? bundle?.semantic_document?.approved_insight_ids?.length ?? 0);
    return {
      status,
      authoritative: gate.authoritative === true,
      approvedCount: Number.isFinite(approvedCount) ? approvedCount : 0,
      ready: gate.authoritative === true && Boolean(status) && !["not_run", "blocked"].includes(status) && approvedCount > 0
    };
  }

  function analyzeCoreReadiness(bundle, semanticDocument) {
    const fields = collectBundleFields(bundle?.surfaces);
    const coreFields = fields.filter(isCoreReadinessField);
    const coreBlocked = coreFields.filter((field) => !fieldPassed(field));
    const requiredSingles = ["overview.theme", "overview.strongest_insight", "sources.primary"];
    const missingRequired = requiredSingles.filter((fieldId) => !coreFields.some((field) => text(field?.field_id) === fieldId && fieldPassed(field)));
    const insightFields = coreFields.filter((field) => text(field?.field_id) === "insights.item");
    const allBlocked = fields.filter((field) => !fieldPassed(field));
    const coreBlockedIds = new Set(coreBlocked.map((field) => text(field?.item_id)).filter(Boolean));
    const optionalBlockedIds = allBlocked.map((field) => text(field?.item_id)).filter((id) => id && !coreBlockedIds.has(id));
    const gate = semanticGateState(bundle, semanticDocument);
    const ready = bundle?.status !== "invalid"
      && bundle?.validation?.valid !== false
      && gate.ready
      && missingRequired.length === 0
      && insightFields.length > 0
      && coreBlocked.length === 0;
    return { ready, gate, fields, coreBlocked, optionalBlockedIds, missingRequired };
  }

  function probeAuthoritativeInsightCandidates(sourceText, candidates) {
    const source = String(sourceText || "");
    const items = array(candidates);
    const semanticApi = global.AHAModuleApi?.resolve?.("semanticDocument", "AHASemanticDocument", { version: 1 })
      || global.AHASemanticDocument;
    const bridgeApi = global.AHAModuleApi?.resolve?.("chat.liveSemanticBridgeV2", "AHALiveSemanticBridgeV2", { version: 2 })
      || global.AHALiveSemanticBridgeV2;
    const gateApi = global.AHAModuleApi?.resolve?.("insightQualityGateV2", "AHAInsightQualityGateV2", { version: 2 })
      || global.AHAInsightQualityGateV2;
    if (!source || !items.length || typeof semanticApi?.sha256Hex !== "function"
      || typeof bridgeApi?.build !== "function" || typeof gateApi?.evaluateCandidate !== "function") {
      return { available: false, ready: null, candidateCount: items.length, approvedCount: 0, blockingReasons: [] };
    }
    try {
      const sourceSha256 = semanticApi.sha256Hex(source);
      const document = bridgeApi.build({
        sourceText: source,
        activeRun: {
          analysisId: "analysis_quality_probe",
          analysisRunId: "run_quality_probe",
          sourceId: "source_quality_probe",
          sourceSha256
        },
        payload: { insightCandidatesV2: items },
        semanticDocumentApi: semanticApi,
        qualityGateApi: gateApi
      });
      const approvedCount = Number(document?.synthesis_gate?.approved_count || 0);
      return {
        available: true,
        ready: approvedCount > 0,
        candidateCount: Number(document?.synthesis_gate?.candidate_count || items.length),
        approvedCount,
        blockingReasons: unique(array(document?.candidate_insights).flatMap((item) => array(item?.blocking_reasons)))
      };
    } catch (_) {
      return { available: false, ready: null, candidateCount: items.length, approvedCount: 0, blockingReasons: [] };
    }
  }

  function hasCrossClaimSource(value) {
    const claims = String(value || "").match(/[^.!?…\n]+[.!?…]+|[^.!?…\n]+$/gu) || [];
    return claims.map(text).filter(Boolean).length >= 2;
  }

  function mergeDistinctInsightCandidates(instance, sourceText, first, second) {
    const combined = [...array(first), ...array(second)];
    if (typeof instance?.reviewInsightCandidates !== "function") {
      const seen = new Set();
      return combined.filter((candidate) => {
        const key = normalize(candidate?.summary || candidate?.text || candidate?.title);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 5);
    }
    return instance.reviewInsightCandidates(combined, sourceText, { limit: 5 }).selected;
  }

  function repairAnalysisBundle(bundle, input = {}, originalProvider = null) {
    const repaired = clone(bundle);
    if (!repaired || repaired.schema !== "aha_analysis_bundle_v2") return bundle;
    const sourceText = String(input.sourceText || "");
    if (sourceText.length < SUBSTANTIVE_SOURCE_MIN) return bundle;
    const semanticDocument = input.semanticDocument;
    const themeField = verifiedThemeField(repaired, sourceText, semanticDocument);
    if (themeField && repaired.surfaces?.overview) repaired.surfaces.overview.theme = themeField;
    trimSemanticRecords(repaired, semanticDocument);
    const fields = collectBundleFields(repaired.surfaces);
    if (repaired.quality && typeof repaired.quality === "object") {
      repaired.quality.field_count = fields.length;
      repaired.quality.passed_field_count = fields.filter((field) => field?.quality?.status === "passed").length;
      repaired.quality.incomplete_field_ids = fields.filter((field) => field?.quality?.status === "incomplete").map((field) => field.item_id);
      repaired.quality.rejected_field_ids = fields.filter((field) => field?.quality?.status === "rejected").map((field) => field.item_id);
      const readiness = analyzeCoreReadiness(repaired, semanticDocument);
      repaired.quality.blocking_field_ids = readiness.coreBlocked.map((field) => text(field?.item_id)).filter(Boolean);
      repaired.quality.optional_withheld_field_ids = unique(readiness.optionalBlockedIds);
      repaired.quality.required_missing_field_ids = readiness.missingRequired.slice();
      repaired.quality.release_readiness_schema = QUALITY_REPAIR_SCHEMA;
      if (readiness.ready) {
        repaired.status = "ready";
        repaired.quality.status = "ready";
        repaired.quality.reasons = unique([
          ...array(repaired.quality.reasons).filter((reason) => ![
            "item_level_evidence_or_topic_incomplete", "one_or_more_fields_rejected"
          ].includes(text(reason))),
          ...(readiness.optionalBlockedIds.length ? ["optional_enrichment_withheld_fail_closed"] : []),
          QUALITY_REPAIR_SCHEMA
        ]);
      } else if (repaired.status !== "invalid") {
        repaired.status = "incomplete";
        repaired.quality.status = "incomplete";
        repaired.quality.reasons = unique([
          ...array(repaired.quality.reasons),
          ...(readiness.gate.ready ? [] : ["authoritative_semantic_synthesis_not_ready"]),
          ...(readiness.coreBlocked.length || readiness.missingRequired.length ? ["core_analysis_readiness_blocked"] : []),
          ...(semanticDocument?.synthesis_gate?.status === "not_run" ? ["semantic_synthesis_not_run_for_substantive_source"] : []),
          QUALITY_REPAIR_SCHEMA
        ]);
      }
    }
    if (originalProvider?.validate) {
      repaired.validation = clone(originalProvider.validate(repaired));
      if (repaired.validation?.valid !== true) return bundle;
    }
    return deepFreeze(repaired);
  }

  function repairAnalysisReadModel(model, bundle, originalProvider = null) {
    const repaired = clone(model);
    if (!repaired || repaired.schema !== "aha_analysis_read_model_v2") return model;
    const readiness = analyzeCoreReadiness(bundle, bundle?.semantic_document);
    const blocked = unique(repaired.blocked_field_ids);
    const coreBlockedIds = new Set(readiness.coreBlocked.map((field) => text(field?.item_id)).filter(Boolean));
    const blocking = blocked.filter((id) => coreBlockedIds.has(id));
    repaired.quality = {
      ...object(repaired.quality),
      source_bundle_status: bundle?.status || repaired.quality?.source_bundle_status,
      blocking_field_count: blocking.length,
      optional_withheld_field_count: Math.max(0, blocked.length - blocking.length),
      release_readiness_schema: QUALITY_REPAIR_SCHEMA
    };
    if (repaired.status !== "invalid" && bundle?.status === "ready" && readiness.ready && blocking.length === 0) repaired.status = "ready";
    else if (repaired.status !== "invalid") repaired.status = "incomplete";
    if (originalProvider?.validate) {
      repaired.validation = clone(originalProvider.validate(repaired));
      if (repaired.validation?.valid !== true) return model;
    }
    return deepFreeze(repaired);
  }

  function repairHydratedReadModel(model, originalProvider = null) {
    const repaired = clone(model);
    if (!repaired || repaired.schema !== "aha_analysis_read_model_v2") return model;
    if (repaired.status !== "invalid"
      && text(repaired.quality?.source_bundle_status) === "ready"
      && Number(repaired.quality?.blocking_field_count || 0) === 0
      && text(repaired.quality?.release_readiness_schema) === QUALITY_REPAIR_SCHEMA) {
      repaired.status = "ready";
    }
    if (originalProvider?.validate) {
      repaired.validation = clone(originalProvider.validate(repaired));
      if (repaired.validation?.valid !== true) return model;
    }
    return deepFreeze(repaired);
  }

  function wrapInsightPipeline(provider) {
    return Object.freeze({
      ...provider,
      create(deps) {
        const instance = provider.create(deps);
        if (!instance || typeof instance.generateAIInsightCandidates !== "function") return instance;
        return Object.freeze({
          ...instance,
          async generateAIInsightCandidates(sourceText, context) {
            const raw = String(sourceText || "");
            const coverage = raw.length >= SUBSTANTIVE_SOURCE_MIN ? detectAcademicCoverage(raw) : { roles: [] };
            const focused = focusLongSource(raw);
            const academicSample = raw.length > focused.length && coverage.roles.length >= 3;
            const nextContext = {
              ...object(context),
              semantic_source_focus: {
                schema: QUALITY_REPAIR_SCHEMA,
                source_length: raw.length,
                focused_length: focused.length,
                verbatim_excerpt: raw.length > focused.length,
                ...(academicSample ? {
                  academic_roles_present: coverage.roles.slice(),
                  minimum_distinct_roles: Math.min(4, coverage.roles.length),
                  require_cross_section_semantic_diversity: true,
                  preserve_source_uncertainty: true
                } : {}),
                authoritative_gate_contract: {
                  minimum_exact_evidence_quotes: 2,
                  maximum_exact_evidence_quotes: 3,
                  require_distinct_source_sentences: true,
                  require_semantic_transformation: true,
                  require_explicit_usefulness: true,
                  require_causal_discipline: true
                }
              }
            };
            const candidates = await instance.generateAIInsightCandidates(focused, nextContext);
            if (Array.isArray(candidates) && candidates.length) {
              const firstGate = probeAuthoritativeInsightCandidates(raw, candidates);
              const firstGateTrace = {
                attempt: 0,
                available: firstGate.available,
                ready: firstGate.ready,
                candidate_count: firstGate.candidateCount,
                approved_count: firstGate.approvedCount,
                blocking_reasons: firstGate.blockingReasons
              };
              global.AHAChatInsightPipeline?.recordRuntimeTrace?.({
                authoritative_gate_attempts: [firstGateTrace],
                final_authoritative_gate_status: firstGate.available !== true ? "unavailable" : (firstGate.ready ? "passed" : "blocked")
              });
              if (firstGate.available !== true) return candidates;

              const needsQualityRepair = firstGate.ready !== true;
              const needsProjectionBreadth = firstGate.ready === true
                && firstGate.approvedCount < MIN_PRODUCT_READY_APPROVED_INSIGHTS
                && hasCrossClaimSource(focused);
              if (!needsQualityRepair && !needsProjectionBreadth) return candidates;

              // One bounded repair attempt is allowed after either an all-blocked
              // authoritative gate or an approved result that is too narrow to
              // form a meaningful multi-insight projection. It uses the unchanged
              // source and gates; product breadth never lowers a quality threshold.
              const retryReasons = needsQualityRepair
                ? firstGate.blockingReasons
                : ["projection_approved_insight_count_below_minimum", "projection_semantic_diversity_insufficient"];
              const coveredTypes = unique(array(candidates).map((candidate) => text(candidate?.type || candidate?.functional_type)).filter(Boolean));
              const retry = await instance.generateAIInsightCandidates(focused, {
                ...nextContext,
                authoritative_quality_retry: {
                  schema: QUALITY_REPAIR_SCHEMA,
                  attempt: 1,
                  mode: needsQualityRepair ? "quality_repair" : "projection_diversity_expansion",
                  candidate_count: firstGate.candidateCount,
                  approved_count: firstGate.approvedCount,
                  blocking_reasons: retryReasons,
                  required_total_approved_count: MIN_PRODUCT_READY_APPROVED_INSIGHTS,
                  required_new_candidate_count: needsProjectionBreadth ? 2 : 1,
                  covered_primary_types: coveredTypes,
                  instruction: needsProjectionBreadth
                    ? "Return 2–4 new candidates from the same SOURCE_TEXT. Keep one precise central source concept explicit across candidates, but synthesize distinct secondary relations or boundaries. Do not repeat the already covered primary semantic types. Every candidate must independently satisfy the unchanged evidence, transformation, usefulness and causal-discipline gates."
                    : "Return new candidates that satisfy the authoritative gate while preserving source uncertainty and exact evidence."
                }
              });
              if (Array.isArray(retry) && retry.length) {
                const finalCandidates = needsProjectionBreadth
                  ? mergeDistinctInsightCandidates(instance, focused, candidates, retry)
                  : retry;
                const retryGate = probeAuthoritativeInsightCandidates(raw, finalCandidates);
                global.AHAChatInsightPipeline?.recordRuntimeTrace?.({
                  authoritative_gate_attempts: [
                    firstGateTrace,
                    {
                      attempt: 1,
                      available: retryGate.available,
                      ready: retryGate.ready,
                      candidate_count: retryGate.candidateCount,
                      approved_count: retryGate.approvedCount,
                      blocking_reasons: retryGate.blockingReasons
                    }
                  ],
                  final_authoritative_gate_status: retryGate.available !== true ? "unavailable" : (retryGate.ready ? "passed" : "blocked"),
                  projection_breadth_target: MIN_PRODUCT_READY_APPROVED_INSIGHTS,
                  projection_breadth_ready: retryGate.approvedCount >= MIN_PRODUCT_READY_APPROVED_INSIGHTS
                });
                return finalCandidates;
              }
              return candidates;
            }
            if (provider?.ACTIVE_ANALYSIS_CONTRACT === "aha_active_analysis_contract_v3") {
              global.AHAChatInsightPipeline?.recordRuntimeTrace?.({
                final_authoritative_gate_status: "blocked",
                blocking_reasons: global.AHAChatInsightPipeline?.getLastRuntimeTrace?.()?.blocking_reasons || ["strict_synthesis_returned_no_candidates"]
              });
              return [];
            }
            if (raw.length >= SUBSTANTIVE_SOURCE_MIN && typeof instance.buildSemanticInsightCandidates === "function") {
              return instance.buildSemanticInsightCandidates(focused, { minInsights: 2, maxInsights: 4 });
            }
            return Array.isArray(candidates) ? candidates : [];
          }
        });
      }
    });
  }

  function wrapLiveSemanticBridge(provider) {
    return Object.freeze({
      ...provider,
      build(input) {
        return repairSemanticDocument(provider.build(input), input, provider);
      },
      hydrate(value, input = {}) {
        const hydrated = provider.hydrate(value, input);
        return hydrated ? repairSemanticDocument(hydrated, input, provider) : null;
      }
    });
  }

  function wrapAnalysisBundle(provider) {
    return Object.freeze({
      ...provider,
      build(input = {}) {
        repairPayloadSourceFields(input.payload, input.sourceText, input.semanticDocument);
        return repairAnalysisBundle(provider.build(input), input, provider);
      }
    });
  }

  function wrapAnalysisReadModel(provider) {
    return Object.freeze({
      ...provider,
      build(bundle) {
        return repairAnalysisReadModel(provider.build(bundle), bundle, provider);
      },
      hydrate(value) {
        const hydrated = provider.hydrate(value);
        return hydrated ? repairHydratedReadModel(hydrated, provider) : null;
      }
    });
  }

  function wrapProvider(name, provider) {
    if (!provider || (typeof provider !== "object" && typeof provider !== "function")) return provider;
    let byName = providerRepairCache.get(provider);
    if (!byName) { byName = new Map(); providerRepairCache.set(provider, byName); }
    if (byName.has(name)) return byName.get(name);
    let wrapped = provider;
    if (name === "chat.insightPipeline" && typeof provider.create === "function") wrapped = wrapInsightPipeline(provider);
    else if (name === "chat.liveSemanticBridgeV2" && typeof provider.build === "function") wrapped = wrapLiveSemanticBridge(provider);
    else if (name === "chat.analysisBundleV2" && typeof provider.build === "function") wrapped = wrapAnalysisBundle(provider);
    else if (name === "chat.analysisReadModelV2" && typeof provider.build === "function") wrapped = wrapAnalysisReadModel(provider);
    byName.set(name, wrapped);
    return wrapped;
  }

  const QUALITY_REPAIR_V2 = Object.freeze({
    schema: QUALITY_REPAIR_SCHEMA,
    longSourceLimit: LONG_SOURCE_LIMIT,
    substantiveSourceMin: SUBSTANTIVE_SOURCE_MIN,
    detectAcademicCoverage,
    focusAcademicSource,
    focusLongSource,
    deriveSourceTheme,
    repairSemanticDocument,
    repairPayloadSourceFields,
    analyzeCoreReadiness,
    repairAnalysisBundle,
    repairAnalysisReadModel,
    probeAuthoritativeInsightCandidates,
    wrapInsightPipeline,
    wrapProvider
  });

  function create(deps = {}) {
    const moduleApi = deps.moduleApi || global.AHAModuleApi;
    const legacyRoot = deps.legacyRoot || global;
    let insightsCompatBase = null;
    let insightsCompatMeta = null;
    let insightsCompatView = null;

    function resolveBase(name, legacyGlobal, version = 1) {
      const provider = moduleApi?.resolve?.(name, legacyGlobal, { version }) || legacyRoot[legacyGlobal] || null;
      return QUALITY_REPAIR_V2.wrapProvider(name, provider);
    }

    function buildInsightsCompatibilityView(insights) {
      if (!insights || typeof insights.buildMetaProfile === "function") return insights;
      const metaInsights = resolveBase("meta", "MetaInsightsEngine");
      if (typeof metaInsights?.buildUserMetaProfile !== "function") return insights;
      if (insightsCompatView && insightsCompatBase === insights && insightsCompatMeta === metaInsights) {
        return insightsCompatView;
      }

      const view = Object.create(insights);
      Object.defineProperty(view, "buildMetaProfile", {
        configurable: false,
        enumerable: false,
        writable: false,
        value(chamber) {
          return metaInsights.buildUserMetaProfile(chamber, "sub_laring") || {};
        }
      });
      insightsCompatBase = insights;
      insightsCompatMeta = metaInsights;
      insightsCompatView = Object.freeze(view);
      return insightsCompatView;
    }

    function resolve(name, legacyGlobal, version = 1) {
      const provider = resolveBase(name, legacyGlobal, version);
      if (name === "insights" || legacyGlobal === "InsightsEngine") {
        return buildInsightsCompatibilityView(provider);
      }
      return provider;
    }

    function getSpec(key) {
      const providerSpec = CHAT_PROVIDERS[key];
      if (!providerSpec) throw new Error(`Ukjent AHA Chat-provider: ${key}`);
      return providerSpec;
    }

    function validateFunctions(provider, providerSpec, label) {
      const missing = providerSpec.functions.filter((name) => typeof provider?.[name] !== "function");
      if (missing.length) {
        throw new Error(`${label} må eksponere: ${missing.join(", ")}.`);
      }
      return provider;
    }

    function requireProvider(key) {
      const providerSpec = getSpec(key);
      const provider = resolve(`chat.${key}`, providerSpec.legacyGlobal, providerSpec.version);
      if (!provider) throw new Error(`${providerSpec.label} må lastes før ahaChat.js.`);
      return validateFunctions(provider, providerSpec, providerSpec.label);
    }

    function instantiate(key, factoryDeps, options = {}) {
      const providerSpec = getSpec(key);
      const label = options.label || providerSpec.label;
      const factoryName = options.factory || providerSpec.factory || "create";
      const provider = resolve(`chat.${key}`, providerSpec.legacyGlobal, providerSpec.version);
      if (!provider) throw new Error(`${label} må lastes før ahaChat.js.`);
      validateFunctions(provider, providerSpec, providerSpec.label);
      if (typeof provider[factoryName] !== "function") {
        throw new Error(`${label} må eksponere: ${factoryName}.`);
      }
      const instance = provider[factoryName](factoryDeps);
      if (!instance) throw new Error(`${label} må lastes før ahaChat.js.`);
      return instance;
    }

    return Object.freeze({ resolve, require: requireProvider, instantiate });
  }

  const publicApi = Object.freeze({ create, CHAT_PROVIDERS, QUALITY_REPAIR_V2 });
  global.AHAChatProviderLoader = publicApi;
  global.AHAModuleApi?.register?.("chat.providerLoader", publicApi, {
    version: 1,
    legacyGlobal: "AHAChatProviderLoader",
    exports: Object.keys(publicApi)
  });
})(window);
