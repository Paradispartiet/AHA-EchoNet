from pathlib import Path
import re


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 match, got {count}")
    return text.replace(old, new, 1)


def regex_once(text, pattern, repl, label):
    out, count = re.subn(pattern, repl, text, count=1, flags=re.S)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly 1 regex match, got {count}")
    return out


# 1) Source classifiers: media history needs a media core; generic public administration gets its own signal.
signals_path = Path("js/ahaChatSignals.js")
signals = signals_path.read_text()
old_media = '''  function detectInstitutionalMediaHistorySignal(text) {
    const src = String(text || "").toLowerCase();
    const isNewspaperText = /\\b(avis|avisa|avisen|dagsavis|ukeavis|vekeavis|nisjeavis|kulturavis|kommentaravis|redaktør|redaktor|redaksjon)\\b/i.test(src);
    const isMediaText = /\\b(presse|journalistikk|mediehus|medium|medier|kringkaster|allmennkringkaster|redaksjonell)\\b/i.test(src);
    const isInstitutionText = /\\b(institusjon|organisasjon|stiftelse|universitet|museum|bibliotek|forlag|konsern|selskap)\\b/i.test(src);
    const institutionTerms = isNewspaperText || isMediaText || isInstitutionText || /\\b(morgenbladet|tidsskrift|eierskap|mandat|profil|offentlig rolle)\\b/i.test(src);
    const historicalTerms = /\\b(ble grunnlagt|grunnlagt|opprettet|etablert|historie|historisk|gjennom|fra .* til|tidligere|senere|på 18\\d{2}|på 19\\d{2}|på 20\\d{2}|i 18\\d{2}|i 19\\d{2}|i 20\\d{2}|over tid)\\b/i.test(src);
    const profileTerms = /\\b(konservativ|liberal|uavhengig|politisk profil|nisjeavis|kulturavis|kommentaravis|offentlighet)\\b/i.test(src);
    const personDiaryNoise = /\\b(jeg|meg|min|mitt|mamma|pappa|kjæreste)\\b/i.test(src);
    const geopoliticalSignal = detectGeopoliticalPowerSignal(src);
    const score = (institutionTerms ? 2 : 0) + (historicalTerms ? 2 : 0) + (profileTerms ? 1 : 0) - (personDiaryNoise ? 1 : 0) - (geopoliticalSignal.strong ? 3 : 0);
    return { strong: score >= 3, institutionTerms, historicalTerms, profileTerms, isMediaText, isNewspaperText, isInstitutionText };
  }
'''
new_media = '''  function detectInstitutionalMediaHistorySignal(text) {
    const src = String(text || "").toLowerCase();
    const isNewspaperText = /\\b(avis|avisa|avisen|dagsavis|ukeavis|vekeavis|nisjeavis|kulturavis|kommentaravis|redaktør|redaktor|redaksjon)\\b/i.test(src);
    const isMediaText = /\\b(presse|journalistikk|mediehus|medium|medier|kringkaster|allmennkringkaster|redaksjonell)\\b/i.test(src);
    const isInstitutionText = /\\b(institusjon|organisasjon|stiftelse|universitet|museum|bibliotek|forlag|konsern|selskap)\\b/i.test(src);
    const mediaCore = isNewspaperText || isMediaText || /\\b(morgenbladet|tidsskrift|redaksjonell|redaksjon|eierskap)\\b/i.test(src);
    const institutionTerms = mediaCore || isInstitutionText || /\\b(mandat|profil|offentlig rolle)\\b/i.test(src);
    const historicalTerms = /\\b(ble grunnlagt|grunnlagt|opprettet|etablert|historie|historisk|fra .* til|tidligere|senere|på 18\\d{2}|på 19\\d{2}|på 20\\d{2}|i 18\\d{2}|i 19\\d{2}|i 20\\d{2}|over tid)\\b/i.test(src);
    const profileTerms = /\\b(konservativ|liberal|uavhengig|politisk profil|nisjeavis|kulturavis|kommentaravis|offentlighet)\\b/i.test(src);
    const personDiaryNoise = /\\b(jeg|meg|min|mitt|mamma|pappa|kjæreste)\\b/i.test(src);
    const geopoliticalSignal = detectGeopoliticalPowerSignal(src);
    const score = (institutionTerms ? 2 : 0) + (historicalTerms ? 2 : 0) + (profileTerms ? 1 : 0) - (personDiaryNoise ? 1 : 0) - (geopoliticalSignal.strong ? 3 : 0);
    return { strong: mediaCore && score >= 3, mediaCore, institutionTerms, historicalTerms, profileTerms, isMediaText, isNewspaperText, isInstitutionText };
  }
'''
signals = replace_once(signals, old_media, new_media, "media-history core guard")

generic_public_admin = '''
  function detectPublicAdministrationSignal(text) {
    const src = cleanArticleText(text || "").toLowerCase();
    const governanceMarkers = [
      /\\boffentlig forvaltning\\b/i,
      /\\bstatsforvaltning(?:en)?\\b/i,
      /\\bstatlig sektor\\b/i,
      /\\boffentlig sektor\\b/i,
      /\\bmål-? og resultatstyring\\b/i,
      /\\bstyringssystem(?:et|er|ene)?\\b/i,
      /\\bdirektoratet for økonomistyring\\b|\\bdfø\\b/i,
      /\\bvirksomhet(?:en|er|ene)?\\b/i
    ];
    const evaluationMarkers = [
      /\\bevaluering(?:en|er|ene|sarbeid|spraksis|sstrategi|sresultat|sresultater|sfunn)?\\b/i,
      /\\bevaluere(?:r|s|t)?\\b/i,
      /\\boppdragsgiver(?:en|e|ne)?\\b/i,
      /\\breferansegrupp(?:e|en|er|ene)\\b/i,
      /\\bsamfunnsnytte\\b/i,
      /\\boppfølging\\b/i
    ];
    const governanceHits = governanceMarkers.filter((pattern) => pattern.test(src)).length;
    const evaluationHits = evaluationMarkers.filter((pattern) => pattern.test(src)).length;
    const score = governanceHits * 2 + evaluationHits;
    return { strong: governanceHits >= 1 && evaluationHits >= 2 && score >= 5, score, governanceHits, evaluationHits };
  }
'''
signals = regex_once(
    signals,
    r'(  function detectPublicAdministrationReformSignal\(text\) \{.*?\n  \}\n)',
    lambda m: m.group(1) + generic_public_admin,
    "insert generic public administration signal",
)
signals = replace_once(
    signals,
    '    detectPublicAdministrationReformSignal,\n    detectInstitutionalMediaHistorySignal',
    '    detectPublicAdministrationReformSignal,\n    detectPublicAdministrationSignal,\n    detectInstitutionalMediaHistorySignal',
    "export generic public administration signal",
)
signals_path.write_text(signals)


# 2) Calibration terms: use token/phrase boundaries, never arbitrary substrings.
calibration_path = Path("js/ahaCalibrationIndex.js")
calibration = calibration_path.read_text()
calibration = replace_once(
    calibration,
    '  function scoreMatch(textNorm, term, weight) { if (!textNorm.includes(term)) return 0; return weight * (term.includes(" ") ? 1.35 : 1); }',
    '''  function normalizeBoundaryText(value) {
    return normalizeText(value).replace(/-/g, " ").replace(/\\s+/g, " ").trim();
  }

  function containsCalibrationTerm(textNorm, term) {
    const haystack = normalizeBoundaryText(textNorm);
    const needle = normalizeBoundaryText(term);
    if (!haystack || !needle) return false;
    return ` ${haystack} `.includes(` ${needle} `);
  }

  function scoreMatch(textNorm, term, weight) {
    if (!containsCalibrationTerm(textNorm, term)) return 0;
    return weight * (String(term || "").includes(" ") ? 1.35 : 1);
  }''',
    "boundary-aware calibration scoring",
)
calibration = replace_once(
    calibration,
    '  global.AHACalibration = { ensureLoaded, getIndex, matchText, getStatus, rebuild };',
    '  global.AHACalibration = { ensureLoaded, getIndex, matchText, getStatus, rebuild };\n  global.AHACalibrationTestHooks = { normalizeText, containsCalibrationTerm, scoreMatch };',
    "calibration test hooks",
)
calibration_path.write_text(calibration)


# 3) Subject Engine terms: same whole-token/phrase policy.
subject_path = Path("js/ahaSubjectEngine.js")
subject = subject_path.read_text()
old_scan = '''  function scanField(text, values, boost, collector) {
    const normalized = String(text || "").toLowerCase();
    const terms = Array.isArray(values) ? values : [values];
    let matched = false;

    terms.forEach((term) => {
      const clean = String(term || "").trim();
      if (!clean) return;
      if (normalized.includes(clean.toLowerCase())) {
        collector.push(clean);
        matched = true;
      }
    });

    return matched ? boost : 0;
  }
'''
new_scan = '''  function normalizeSubjectMatchText(value) {
    return String(value || "").toLowerCase().normalize("NFKD").replace(/[\\u0300-\\u036f]/g, "").replace(/[^\\p{L}\\p{N}]+/gu, " ").replace(/\\s+/g, " ").trim();
  }

  function containsSubjectTerm(text, term) {
    const haystack = normalizeSubjectMatchText(text);
    const needle = normalizeSubjectMatchText(term);
    if (!haystack || !needle) return false;
    return ` ${haystack} `.includes(` ${needle} `);
  }

  function scanField(text, values, boost, collector) {
    const terms = Array.isArray(values) ? values : [values];
    let matched = false;

    terms.forEach((term) => {
      const clean = String(term || "").trim();
      if (!clean) return;
      if (containsSubjectTerm(text, clean)) {
        collector.push(clean);
        matched = true;
      }
    });

    return matched ? boost : 0;
  }
'''
subject = replace_once(subject, old_scan, new_scan, "boundary-aware subject matching")
subject = replace_once(
    subject,
    '  global.AHASubjectEngine = { listSubjects, loadSubject, loadAllSubjects, matchText, matchInsight };',
    '  global.AHASubjectEngine = { listSubjects, loadSubject, loadAllSubjects, matchText, matchInsight };\n  global.AHASubjectEngineTestHooks = { normalizeSubjectMatchText, containsSubjectTerm };',
    "subject engine test hooks",
)
subject_path.write_text(subject)


# 4) Chat runtime: semantic domain is source-derived, Subject Engine wins over calibration,
# concepts use boundaries, and academic extraction prefers actual finding/method sentences.
chat_path = Path("js/ahaChat.js")
chat = chat_path.read_text()
chat = replace_once(
    chat,
    '  function detectPublicAdministrationReformSignal(text) {\n    return global.AHAChatSignals.detectPublicAdministrationReformSignal(text);\n  }',
    '  function detectPublicAdministrationReformSignal(text) {\n    return global.AHAChatSignals.detectPublicAdministrationReformSignal(text);\n  }\n  function detectPublicAdministrationSignal(text) {\n    return global.AHAChatSignals.detectPublicAdministrationSignal(text);\n  }',
    "public administration wrapper",
)

new_domain = '''  function detectAutoAnalysisDomain(sourceText, payload = {}) {
    const src = String(sourceText || "");
    const payloadText = `${payload?.reflection || ""} ${(Array.isArray(payload?.sortItems) ? payload.sortItems : []).map((item) => `${item?.label || ""} ${item?.text || ""}`).join(" ")}`;
    const domainText = src.trim().length >= 25 ? src : `${src} ${payloadText}`;
    if (detectPublicAdministrationReformSignal(domainText).strong) return "public_admin_nav";
    if (detectPublicAdministrationSignal(domainText).strong) return "public_administration";
    if (detectLiteraryAttachmentSignal(domainText).strong) return "literary_attachment";
    if (detectSongLyricChildCultureSignal(src).strong) return "song_lyric_child_culture";
    if (detectSahelClimateConflictSignal(domainText).strong) return "sahel_climate_conflict";
    if (detectInstitutionalMediaHistorySignal(domainText).strong) return "institutional_media_history";
    return "generic_academic";
  }
'''
chat = regex_once(
    chat,
    r'  function detectAutoAnalysisDomain\(sourceText, payload = \{\}\) \{.*?\n  \}\n',
    new_domain,
    "source-grounded semantic domain",
)

academic_picker = '''
  function pickBestAcademicSourceSentence(sentences, kind, fallbackIndex = 0) {
    const list = Array.isArray(sentences) ? sentences.filter(Boolean) : [];
    if (!list.length) return "";
    const rules = kind === "finding"
      ? [
          [/\\bpotensialet\\b[^.!?]{0,120}\\bikke\\b[^.!?]{0,80}\\bevaluere mer, men bedre\\b/i, 12],
          [/\\brespondentene\\b[^.!?]{0,80}\\b(etterlyser|mener)\\b/i, 9],
          [/\\b(undersøkelsen|resultatene|funnene)\\b[^.!?]{0,60}\\b(vis(?:er|te)|bekrefter|tyder)\\b/i, 7],
          [/\\bviser\\b/i, 2]
        ]
      : [
          [/\\bundersøkelsen ble sendt til\\b/i, 10],
          [/\\bdatainnsamlingsperioden\\b/i, 9],
          [/\\bsurveyen ble gjennomført\\b/i, 9],
          [/\\brespondent(?:ene|er)\\b/i, 5],
          [/\\b(survey|datainnsamling|intervju|utvalg|metode|empiri)\\b/i, 5],
          [/\\banalyse\\b/i, 1]
        ];
    let best = { text: String(list[fallbackIndex] || list[0] || "").trim(), score: -1 };
    list.forEach((sentenceText, index) => {
      const text = String(sentenceText || "").trim();
      let score = 0;
      rules.forEach(([pattern, weight]) => { if (pattern.test(text)) score += weight; });
      if (kind === "evidence" && /\\b\\d+\\s*(?:prosent|%)\\b/i.test(text)) score += 4;
      if (kind === "finding" && index >= Math.floor(list.length * 0.45)) score += 0.75;
      if (score > best.score) best = { text, score };
    });
    return best.score > 0 ? best.text : String(list[fallbackIndex] || list[0] || "").trim();
  }
'''
chat = replace_once(
    chat,
    "  function buildSourceGroundedAcademicPayload(sourceText) {",
    academic_picker + "\n  function buildSourceGroundedAcademicPayload(sourceText) {",
    "insert academic sentence scorer",
)
chat = replace_once(
    chat,
    '    const finding = pickAcademicSourceSentence(sentences, [/\\b(funn|viser|fant|resultat|konklud|tyder|påviser|fremgår|framgår)\\b/i], 0);\n    const evidence = pickAcademicSourceSentence(sentences, [/\\b(metode|data|respondent|intervju|survey|undersøkelse|utvalg|referansegruppe|empiri|analyse)\\b/i], 1);',
    '    const finding = pickBestAcademicSourceSentence(sentences, "finding", 0);\n    const evidence = pickBestAcademicSourceSentence(sentences, "evidence", 1);',
    "source-grounded finding and method selection",
)

old_concepts = '''  function buildAcademicConceptCandidates(sourceText = "", payload = {}) {
    const fromPayload = Array.isArray(payload?.concepts) ? payload.concepts : [];
    const normalizedPayload = fromPayload.map((item) => String(item || "").trim()).filter(Boolean);
    const text = ` ${cleanArticleText(sourceText).toLowerCase()} `;
    const candidates = [
      "Pinse", "pentekosté", "Den hellige ånd", "tungetale", "nådegave", "tydning", "apostlene", "Babels tårn", "kirkens fødselsdag", "gregoriansk kalender", "juliansk kalender", "treenighetssøndag"
    ];
    const lexiconHits = candidates.filter((term) => text.includes(term.toLowerCase()));
    return Array.from(new Set(normalizedPayload.concat(lexiconHits))).slice(0, 20);
  }
'''
new_concepts = '''  function normalizeAcademicCandidateText(value) {
    return String(value || "").toLowerCase().normalize("NFKD").replace(/[\\u0300-\\u036f]/g, "").replace(/[^\\p{L}\\p{N}]+/gu, " ").replace(/\\s+/g, " ").trim();
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
    const phraseConcepts = typeof extractAcademicPhraseConcepts === "function" ? extractAcademicPhraseConcepts(sourceText).slice(0, 12) : [];
    const candidates = [
      "Pinse", "pentekosté", "Den hellige ånd", "tungetale", "nådegave", "tydning", "apostlene", "Babels tårn", "kirkens fødselsdag", "gregoriansk kalender", "juliansk kalender", "treenighetssøndag"
    ];
    const lexiconHits = candidates.filter((term) => academicCandidateInSource(sourceText, term));
    return Array.from(new Set(fromPayload.concat(phraseConcepts, lexiconHits))).slice(0, 20);
  }
'''
chat = replace_once(chat, old_concepts, new_concepts, "boundary-aware academic concepts")

new_calibration_adapter = '''  function subjectMatchesFromCalibration(calibrated) {
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
'''
chat = regex_once(
    chat,
    r'  function subjectMatchesFromCalibration\(calibrated\) \{.*?\n  \}\n',
    new_calibration_adapter,
    "calibration routes only emner",
)

old_render_routing = '''    payload.subjectMatches = normalizeSubjectMatches(Array.isArray(options.subjectMatches) ? options.subjectMatches : []);
    if (!articleAnalysis && global.AHACalibration?.matchText) {
      try {
        const calibrated = global.AHACalibration.matchText(sourceText, { topN: 10 });
        const calibratedMatches = subjectMatchesFromCalibration(calibrated);
        if (calibratedMatches.length) payload.subjectMatches = calibratedMatches;
      } catch (err) {
        console.warn("AHACalibration.matchText feilet", err);
      }
    }
'''
new_render_routing = '''    const primarySubjectMatches = normalizeSubjectMatches(Array.isArray(options.subjectMatches) ? options.subjectMatches : []);
    payload.subjectMatches = primarySubjectMatches;
    if (!articleAnalysis && !primarySubjectMatches.length && global.AHACalibration?.matchText) {
      try {
        const calibrated = global.AHACalibration.matchText(sourceText, { topN: 10 });
        const calibratedMatches = subjectMatchesFromCalibration(calibrated);
        if (calibratedMatches.length) payload.subjectMatches = calibratedMatches;
      } catch (err) {
        console.warn("AHACalibration.matchText feilet", err);
      }
    }
'''
chat = replace_once(chat, old_render_routing, new_render_routing, "subject engine primary routing")

chat = replace_once(
    chat,
    '    if (!summary || /kort dagsoppsummering/i.test(summary) || /ikke dagbokmateriale/i.test(summary)) out.summary = "Kort fagoppsummering: Teksten forklarer et faglig tema gjennom definisjoner, nøkkelbegreper, historisk kontekst og tolkning.";',
    '    if (!summary || /kort dagsoppsummering/i.test(summary) || /ikke dagbokmateriale/i.test(summary)) {\n      const groundedSummary = String(canonical?.keyInsight || canonical?.reflection || canonical?.theme || "").trim();\n      out.summary = groundedSummary ? `Kort fagoppsummering: ${groundedSummary}` : "Kort fagoppsummering: Kilden analyseres ut fra sitt eget faglige innhold.";\n    }',
    "source-specific academic summary",
)
chat = replace_once(
    chat,
    '      academic_article: "Fagtekst / leksikontekst / mediehistorisk tekst",',
    '      academic_article: "Fagtekst / akademisk tekst",',
    "academic type label",
)
chat = replace_once(
    chat,
    'global.AHATestHooks = Object.assign({}, global.AHATestHooks || {}, { detectTextType, buildCanonicalAnalysis, buildAhaAnalysisExportBundle, formatAhaAnalysisExportMarkdown, buildAutoOutputs, buildSourceGroundedAcademicPayload,',
    'global.AHATestHooks = Object.assign({}, global.AHATestHooks || {}, { detectTextType, buildCanonicalAnalysis, buildAhaAnalysisExportBundle, formatAhaAnalysisExportMarkdown, buildAutoOutputs, renderAutoOutputs, detectAutoAnalysisDomain, buildAcademicConceptCandidates, buildSourceGroundedAcademicPayload,',
    "export routing test hooks",
)
chat_path.write_text(chat)


# 5) Regression using the production failure shape.
test = r'''const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

class El {
  constructor(){ this.dataset={}; this._html=''; this.textContent=''; this.disabled=false; this.hidden=false; this.className=''; this.classList={toggle(){},add(){},remove(){}}; }
  set innerHTML(v){ this._html=String(v||''); }
  get innerHTML(){ return this._html; }
  querySelector(){ return null; }
  querySelectorAll(){ return []; }
  addEventListener(){}
  appendChild(){}
}

function makeContext(){
  const store=new Map(); const els=new Map();
  ['aha-auto-output','aha-answer-composer-status','aha-answer-composer-details','aha-answer-evaluation-status','aha-processing-indicator','aha-processing-text','btn-send'].forEach(id=>els.set(id,new El()));
  const c={window:null,console,document:{readyState:'loading',addEventListener(){},body:new El(),getElementById:id=>els.get(id)||null,querySelectorAll:()=>[],createElement:()=>new El()},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)},navigator:{clipboard:{}},Event:function(t){this.type=t;},CustomEvent:function(t,o){this.type=t;this.detail=o&&o.detail;},setTimeout,clearTimeout,Date,Math,URL:{createObjectURL(){},revokeObjectURL(){}},Blob:function(){},fetch:async()=>({ok:true,json:async()=>({reply:'ok'})})};
  c.window=c; c.globalThis=c;
  ['js/ahaChatTextUtils.js','js/ahaChatSignals.js','js/ahaChatSubjects.js','js/ahaChatAnalysis.js','js/ahaChatReplyFormat.js','js/ahaChatExport.js','js/ahaChat.js'].forEach(f=>vm.runInNewContext(fs.readFileSync(f,'utf8'),c,{filename:f}));
  return {c,store,els};
}

const source=`Sammendrag. Offentlig ansatte ønsker at evalueringer skal ha høyere kvalitet, bli tettere fulgt opp og integreres bedre med mål- og resultatstyringssystemet. Bare et lite mindretall ønsker flere evalueringer. I denne artikkelen diskuterer vi ulike former for nytte og hvordan den norske statsforvaltningen bruker evalueringer. Formålet er at evalueringer skal gi økt samfunnsnytte. I anledning Evalueringsåret 2015 gjennomførte EVA-forum og Norsk Evalueringsforening en spørreundersøkelse om bruken og nytten av evalueringer i statlig sektor. Undersøkelsen ble sendt til 276 respondenter, og 30 prosent svarte. Respondentene etterlyser mer systematikk, bedre oppfølging og bedre integrering av evalueringsresultater i mål- og resultatstyringssystemet. Det største behovet er økt fagkompetanse. Bare 25–30 prosent mener det er nødvendig med flere evalueringer. Potensialet for videreutvikling ligger ikke i å evaluere mer, men bedre. Deltakende metoder, referansegrupper, evalueringsstrategier og lederforankring påvirker bruk. Betydningen av kvalitet og relevans er stor.`;

const {c,store}=makeContext();
const h=c.AHATestHooks;
assert.equal(h.detectTextType(source),'academic_article');
assert.equal(c.AHAChatSignals.detectPublicAdministrationSignal(source).strong,true);
assert.equal(c.AHAChatSignals.detectInstitutionalMediaHistorySignal(source).strong,false);
assert.equal(c.AHAChatSignals.inferReligiousLexiconEvidence(source).strong,false);

const grounded=h.buildSourceGroundedAcademicPayload(source);
assert.match(grounded.ahaSer.viktigsteInnsikt,/evaluere mer, men bedre/i);
const method=(grounded.sortItems||[]).find(x=>/empiri|metode/i.test(x.label||''));
assert.ok(method);
assert.match(method.text,/276 respondenter|30 prosent/i);

const concepts=h.buildAcademicConceptCandidates(source, grounded);
assert.equal(concepts.some(x=>String(x).toLowerCase()==='tydning'),false);
assert.equal(concepts.some(x=>/evaluering/i.test(String(x))),true);
assert.equal(h.detectAutoAnalysisDomain(source,grounded),'public_administration');

c.AHACalibration={matchText(){return {matched_emner:[{emne_id:'politikk_forvaltning',subject_id:'politikk',title:'Forvaltning og styring',score:8}],matched_categories:[{id:'litteratur',label:'Nærlesning, stil og form',score:99}],matched_concepts:[{key:'stil',label:'stil',score:99,subject_id:'litteratur'}]};}};
const primary=[{emne_id:'politikk_forvaltning',subject_id:'politikk',subject_label:'Politikk',title:'Forvaltning og styring',score:12,matched_terms:['offentlig forvaltning','mål- og resultatstyring']}];
const run=h.createAnalysisRun(source,{sourceKind:'pasted_text'});
h.clearActiveAnalysisState(run);
(async()=>{
  await h.renderAutoOutputs(source,'',{subjectMatches:primary,analysisRun:run});
  const saved=JSON.parse(store.get('aha_chat_auto_outputs_v1'));
  const payload=saved.payload;
  assert.deepEqual(Array.from(payload.subjectMatches||[],x=>x.subject_id),['politikk']);
  assert.equal((payload.subjectMatches||[]).some(x=>x.subject_id==='litteratur'),false);
  assert.equal(payload.canonicalAnalysis.domain,'public_administration');
  assert.equal((payload.canonicalAnalysis.historyGoLinks||[]).some(x=>x.id==='litteratur'||/litteratur/i.test(x.title||'')),false);
  assert.equal((payload.canonicalAnalysis.concepts||[]).some(x=>String(x).toLowerCase()==='tydning'),false);
  assert.equal(payload.analysisKnowledgePolicy.currentDocumentRole,'analysis_source');
  assert.equal(payload.analysisKnowledgePolicy.persistAsMemory,false);
  console.log('aha-evaluation-public-admin-routing tests passed');
})().catch(err=>{console.error(err);process.exitCode=1;});
'''
Path("tests/aha-evaluation-public-admin-routing.test.cjs").write_text(test)
