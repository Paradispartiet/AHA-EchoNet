const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

function write(relative, content) {
  fs.writeFileSync(path.join(ROOT, relative), content);
}

function replaceOne(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, got ${count}`);
  return source.replace(before, after);
}

// 1) Lexical classification: do not treat physical "modeller" or compounds like
// "scenerom" as abstract theory/creative-text markers merely by substring.
{
  const file = 'js/ahaChatSignals.js';
  let source = read(file);
  source = replaceOne(
    source,
    String.raw`    const literaryFragmentSignals = /(scene|stemning|rytme|lys|mørke|rommet|gaten|kropp|språk|vind|lukt|hud|sans)/i;
    const theoryStrongSignals = /(teori|modell|bevissthet|hypotese|begrep|premiss|epistem)/i;
    const theoryWeakSignals = /(kunnskap|system|metode)/i;`,
    String.raw`    const literaryFragmentSignals = /\b(?:scene|stemning|rytme|lys|mørke|rommet|gaten|kropp|språk|vind|lukt|hud|sans)\b/i;
    const theoryStrongSignals = /\b(?:teori|modell|bevissthet|hypotese|begrep|premiss|epistem(?:ologi|isk)?)\b/i;
    const theoryWeakSignals = /\b(?:kunnskap|system|metode)\b/i;`,
    'lexical classifier boundaries'
  );
  write(file, source);
}

// 2) The regular AHA reply is already AI-generated and source-bound for the
// active run. Preserve it as a semantic input for the local afterwork layer and
// stop promoting the first keyword into a fake "pattern" insight.
{
  const file = 'js/ahaChatAutoAnalysis.js';
  let source = read(file);
  source = replaceOne(
    source,
    String.raw`      } else {
        localInsights.push(`Mønster: ${keywords[0] || "temaet"} går igjen og bærer teksten.`);
        localInsights.push(reply ? `AHA-responsen peker videre på: ${toSentences(reply)[0] || reply}` : "Videre innsikt kan styrkes med mer konkret tekst.");
      }`,
    String.raw`      } else {
        const replyLead = toSentences(reply)[0] || reply;
        const sourcePoint = [...sentences].reverse().find((item) =>
          /\b(i det hele tatt|viser|vitner|viktig|slår|derfor|sammenheng|forholdet mellom|betydning)\b/i.test(String(item || ""))
        ) || sentences[0] || "";
        if (replyLead) localInsights.push(`AHA-responsen peker videre på: ${replyLead}`);
        if (sourcePoint) localInsights.push(`Kildepunkt: ${sourcePoint}`);
        if (!localInsights.length) localInsights.push("Videre innsikt kan styrkes med mer konkret tekst.");
      }`,
    'generic insight fallback'
  );
  source = replaceOne(
    source,
    String.raw`        { textType, reflection, sortItems, day, thoughts, list: list.slice(0, 6), insightCards, path: path.slice(0, 5), ahaSer },`,
    String.raw`        { textType, assistantReply: reply, reflection, sortItems, day, thoughts, list: list.slice(0, 6), insightCards, path: path.slice(0, 5), ahaSer },`,
    'preserve assistant reply for semantic synthesis'
  );
  write(file, source);
}

// 3) Replace the fixed "usikker årsaksforståelse" fallback for substantive
// sources with source-bound synthesis that can use the same-run AI reply.
{
  const file = 'js/ahaChatCanonicalAnalysis.js';
  let source = read(file);
  source = replaceOne(
    source,
    String.raw`    function isUnclearFragment(text) {
      return text.length < 160 && containsAny(text, ["vet ikke", "klarer ikke forklare"]);
    }

    function buildDeterministicSemanticSummary(contentType, domain, sourceText) {`,
    String.raw`    function isUnclearFragment(text) {
      return text.length < 160 && containsAny(text, ["vet ikke", "klarer ikke forklare"]);
    }

    function splitSemanticSentences(value) {
      return String(value || "")
        .replace(/\s+/g, " ")
        .split(/(?<=[.!?])\s+/u)
        .map((item) => item.trim())
        .filter(Boolean);
    }

    function semanticWords(value) {
      const stop = new Set(["dette", "disse", "teksten", "artikkelen", "viser", "hvordan", "som", "med", "fra", "til", "for", "det", "den", "der", "har", "var", "blir", "ble", "kan", "skal", "vil", "og", "eller", "men", "seg", "sin", "sitt", "sine"]);
      return normalizeSemanticText(value)
        .match(/[a-zæøå0-9]{4,}/g)?.filter((word) => !stop.has(word)) || [];
    }

    function semanticOverlap(left, right) {
      const a = new Set(semanticWords(left));
      const b = new Set(semanticWords(right));
      if (!a.size || !b.size) return 0;
      let shared = 0;
      a.forEach((word) => { if (b.has(word)) shared += 1; });
      return shared / Math.max(1, Math.min(a.size, b.size));
    }

    function cleanGenericSemanticSignal(value) {
      const text = String(value || "")
        .replace(/^AHA-responsen peker videre på:\s*/i, "")
        .replace(/^Kildepunkt:\s*/i, "")
        .trim();
      if (!text) return "";
      if (/^(Mønster:|Spenning bygges fra flere meldinger|Tema identifiseres fortløpende)/i.test(text)) return "";
      if (/usikker årsaksforståelse|manglende spesifisitet|for få konkrete holdepunkter/i.test(text)) return "";
      return text;
    }

    function sourceInterpretiveSentence(sourceText) {
      const sentences = splitSemanticSentences(sourceText);
      if (!sentences.length) return "";
      return sentences
        .map((sentence, index) => {
          const normalized = normalizeSemanticText(sentence);
          let score = 0;
          if (/forholdet mellom|spenning|kontrast|balanse|versus|kontra/.test(normalized)) score += 6;
          if (/form og innhold|frihet|ramme|forutsetning|sammenheng/.test(normalized)) score += 4;
          if (/men|samtidig|likevel|derimot/.test(normalized)) score += 2;
          if (/viser|vitner|viktig|slår|betydning/.test(normalized)) score += 1;
          score += Math.min(1.5, semanticWords(sentence).length / 12);
          return { sentence, score, index };
        })
        .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.sentence || sentences[0];
    }

    function bestReplySemanticSentence(payload, sourceText) {
      const source = String(sourceText || "");
      const candidates = splitSemanticSentences(payload?.assistantReply || "")
        .filter((sentence) => !/^(hvis du|du kan|vil du|det kan være verdt)/i.test(sentence));
      if (!candidates.length) return "";
      return candidates
        .map((sentence, index) => {
          const normalized = normalizeSemanticText(sentence);
          const conceptualHits = ["viser", "illustrerer", "forhold", "betydning", "kombiner", "frihet", "form", "innhold", "teknikk", "sammenheng", "metode", "historisk", "politisk"]
            .filter((term) => normalized.includes(term)).length;
          const score = (semanticOverlap(source, sentence) * 5) + Math.min(2.5, conceptualHits * 0.45) + Math.min(1, semanticWords(sentence).length / 24);
          return { sentence, score, index };
        })
        .sort((left, right) => right.score - left.score || left.index - right.index)[0]?.sentence || "";
    }

    function isSubstantiveSemanticSource(sourceText) {
      return String(sourceText || "").trim().length >= 320 && semanticWords(sourceText).length >= 45 && splitSemanticSentences(sourceText).length >= 4;
    }

    function buildSourceBoundGenericSummary(contentType, sourceText, payload = {}) {
      if (!isSubstantiveSemanticSource(sourceText)) return null;
      const sourceSentences = splitSemanticSentences(sourceText);
      const replySentences = splitSemanticSentences(payload?.assistantReply || "");
      const replyTheme = cleanGenericSemanticSignal(replySentences[0] || payload?.ahaSer?.tema);
      const replyInsight = cleanGenericSemanticSignal(bestReplySemanticSentence(payload, sourceText) || payload?.ahaSer?.viktigsteInnsikt);
      const sourceFocus = cleanGenericSemanticSignal(sourceInterpretiveSentence(sourceText));
      const sourceConclusion = cleanGenericSemanticSignal([...sourceSentences].reverse().find((sentence) => /\b(i det hele tatt|viser|vitner|viktig|derfor|samlet|poeng|konklus)/i.test(sentence)) || "");
      const theme = replyTheme || sourceConclusion || sourceSentences[0];
      const mainTension = sourceFocus || "Ingen sikker hovedspenning er fastslått; behold analysen kildebundet.";
      const keyInsight = replyInsight || sourceConclusion || sourceFocus || theme;
      return {
        theme: String(theme || "").slice(0, 320),
        mainTension: String(mainTension || "").slice(0, 320),
        keyInsight: String(keyInsight || "").slice(0, 420)
      };
    }

    function buildDeterministicSemanticSummary(contentType, domain, sourceText, payload = {}) {`,
    'generic semantic synthesis helpers'
  );

  source = replaceOne(
    source,
    String.raw`      if (isUnclearFragment(text)) return { theme: "uklar problemforståelse uten tydelig kontekst", mainTension: "opplevd sammenheng kontra manglende konkretisering", keyInsight: "Teksten uttrykker en mulig frustrasjon, men gir for få holdepunkter til sikker tematisk eller faglig analyse." };
      return { theme: "usikker årsaksforståelse", mainTension: "behov for forklaring kontra manglende spesifisitet", keyInsight: "Teksten uttrykker frustrasjon, men gir for få konkrete holdepunkter til sikker klassifisering." };`,
    String.raw`      if (isUnclearFragment(text)) return { theme: "uklar problemforståelse uten tydelig kontekst", mainTension: "opplevd sammenheng kontra manglende konkretisering", keyInsight: "Teksten uttrykker en mulig frustrasjon, men gir for få holdepunkter til sikker tematisk eller faglig analyse." };
      const sourceBoundFallback = buildSourceBoundGenericSummary(contentType, sourceText, payload);
      if (sourceBoundFallback) return sourceBoundFallback;
      return { theme: "uklar problemforståelse uten tydelig kontekst", mainTension: "manglende konkretisering", keyInsight: "Kilden er for knapp til en trygg tematisk analyse." };`,
    'remove low-information fallback for substantive source'
  );

  source = replaceOne(
    source,
    String.raw`      if (isUnclearFragment(text)) return { fieldConnections: [], suggestedActions: ["Be avsenderen angi hvem eller hva teksten handler om.", "Etterspør ett konkret eksempel, tidspunkt og ønsket endring."] };
      return { fieldConnections: [], suggestedActions: ["Etterspør kontekst: hvem, hva, når og hvilke konsekvenser.", "Be om ett konkret eksempel som kan avgrense problemstillingen."] };`,
    String.raw`      if (isUnclearFragment(text)) return { fieldConnections: [], suggestedActions: ["Be avsenderen angi hvem eller hva teksten handler om.", "Etterspør ett konkret eksempel, tidspunkt og ønsket endring."] };
      if (isSubstantiveSemanticSource(sourceText)) {
        const focus = sourceInterpretiveSentence(sourceText);
        return { fieldConnections: [], suggestedActions: [
          focus ? `Knytt hovedinnsikten eksplisitt til kildepassasjen «${String(focus).slice(0, 180)}».` : "Knytt hovedinnsikten til ett eller to konkrete kildebelegg.",
          "Test hovedtolkningen mot en alternativ lesning av det samme materialet."
        ] };
      }
      return { fieldConnections: [], suggestedActions: ["Avklar tekstens konkrete tema før videre analyse.", "Knytt neste tolkning til et eksplisitt kildebelegg."] };`,
    'substantive generic recommendations'
  );

  source = replaceOne(
    source,
    String.raw`      if (isUnclearFragment(text)) return result(0.34, 0.2, 0.36, 0.32, 0.02, ["Teksten er kort og fragmentert, så analysen bør ha lav sikkerhet.", "Mangler konkrete aktører, hendelser og faglige begreper."]);
      return result(0.38, 0.22, 0.41, 0.35, 0.03, ["Lav informasjonsdensitet: teksten mangler konkrete referanser.", "Flere tolkninger er plausible; analyse bør behandles som foreløpig."]);`,
    String.raw`      if (isUnclearFragment(text)) return result(0.34, 0.2, 0.36, 0.32, 0.02, ["Teksten er kort og fragmentert, så analysen bør ha lav sikkerhet.", "Mangler konkrete aktører, hendelser og faglige begreper."]);
      if (isSubstantiveSemanticSource(sourceText)) return result(0.72, 0.52, 0.68, 0.62, 0.05, ["Tema og hovedspenning er syntetisert fra aktiv kildetekst og samme-run AHA-svar; faglig domene er ikke særklassifisert."]);
      return result(0.38, 0.22, 0.41, 0.35, 0.03, ["Kilden er for knapp til høy sikkerhet; analysen bør behandles som foreløpig."]);`,
    'substantive generic confidence'
  );

  source = replaceOne(
    source,
    String.raw`      const semanticSummary = buildDeterministicSemanticSummary(contentType, domain, sourceText);
      const recommendations = buildDeterministicRecommendations(contentType, domain, sourceText);
      const confidenceAndWarnings = buildDeterministicConfidence(contentType, domain, sourceText);`,
    String.raw`      const semanticSummary = buildDeterministicSemanticSummary(contentType, domain, sourceText, safePayload);
      const recommendations = buildDeterministicRecommendations(contentType, domain, sourceText, safePayload);
      const confidenceAndWarnings = buildDeterministicConfidence(contentType, domain, sourceText, safePayload);`,
    'pass same-run payload into semantic synthesis'
  );
  write(file, source);
}

// 4) The quality gate must not award a pass merely because unrelated verbatim
// quotes exist. Core interpretations must themselves overlap the source, and a
// long information-rich source may never be labelled as "low information".
{
  const file = 'js/ahaAnalysisQualityEvaluator.js';
  let source = read(file);
  source = replaceOne(
    source,
    String.raw`  function sourceGroundingScore(payload, sourceText, claims) {
    const evidence = claims.filter((claim) => claim.kind === "source_evidence");
    const evidenceScore = evidence.length
      ? evidence.reduce((sum, claim) => sum + (claim.sourceMatch === "verbatim" ? 1 : claim.sourceOverlap), 0) / evidence.length
      : 0;
    const canonical = payload?.canonicalAnalysis || payload || {};
    const interpretationValues = [canonical.theme, canonical.mainTension, canonical.keyInsight].filter(Boolean);
    const interpretationScore = interpretationValues.length
      ? interpretationValues.reduce((sum, value) => sum + Math.min(1, bestSourceOverlap(sourceText, value) + 0.2), 0) / interpretationValues.length
      : 0;
    return round((evidenceScore * 0.68) + (interpretationScore * 0.32));
  }`,
    String.raw`  function sourceGroundingScore(payload, sourceText, claims) {
    const evidence = claims.filter((claim) => claim.kind === "source_evidence");
    const evidenceScore = evidence.length
      ? evidence.reduce((sum, claim) => sum + (claim.sourceMatch === "verbatim" ? 1 : claim.sourceOverlap), 0) / evidence.length
      : 0;
    const interpretationClaims = claims.filter((claim) => claim.kind === "interpretation");
    const interpretationScore = interpretationClaims.length
      ? interpretationClaims.reduce((sum, claim) => {
          const direct = claim.sourceMatch === "verbatim" ? 1 : Number(claim.sourceOverlap) || 0;
          const linked = claim.evidenceStatus === "source_quote" ? Math.max(direct, 0.35) : direct;
          return sum + Math.min(1, linked);
        }, 0) / interpretationClaims.length
      : 0;
    return round((evidenceScore * 0.45) + (interpretationScore * 0.55));
  }`,
    'interpretation-aware source grounding'
  );

  source = replaceOne(
    source,
    String.raw`    if (!claims.some((claim) => claim.kind === "source_evidence" && claim.sourceMatch === "verbatim")) critical.push("missing_verbatim_source_evidence");
    if (dimensions.uncertaintyHonesty < 1) critical.push("uncertainty_not_disclosed");`,
    String.raw`    if (!claims.some((claim) => claim.kind === "source_evidence" && claim.sourceMatch === "verbatim")) critical.push("missing_verbatim_source_evidence");
    const substantiveSource = words(sourceText, true).length >= 80 || sentences(sourceText).length >= 6;
    const semanticCore = [canonical.theme, canonical.mainTension, canonical.keyInsight, ...(Array.isArray(canonical.warnings) ? canonical.warnings : []), ...actions].join(" ");
    if (substantiveSource && /usikker årsaksforståelse|manglende spesifisitet|for få konkrete holdepunkter|lav informasjonsdensitet|etterspør kontekst/i.test(semanticCore)) {
      critical.push("generic_low_information_fallback_on_substantive_source");
    }
    const interpretationClaims = claims.filter((claim) => claim.kind === "interpretation");
    if (substantiveSource && interpretationClaims.length && interpretationClaims.every((claim) => Number(claim.sourceOverlap || 0) < 0.12)) {
      critical.push("unanchored_core_interpretation");
    }
    if (dimensions.uncertaintyHonesty < 1) critical.push("uncertainty_not_disclosed");`,
    'semantic critical quality gates'
  );
  write(file, source);
}

// Permanent regression: the product must understand this as substantive arts /
// cultural material, not manufacture a theory-text / low-information story.
{
  const testPath = path.join(ROOT, 'tests/aha-analysis-semantic-regression-v1.test.cjs');
  const test = String.raw`const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createChatContext } = require('../scripts/compare-aha-engine-fixtures.cjs');

const sourceText = [
  'Brechts scenograf med lærestykker på Galleri F-15. Utstillingen «Brecht-bilder» viser skisser, tegninger og modeller Karl von Appen laget til Brecht-forestillinger ved Berliner Ensemble.',
  'Brecht ba von Appen bli sjefscenograf i 1954, og samarbeidet ga ham rom til å arbeide innen tydelige kunstneriske forutsetninger.',
  'Bildene sier noe viktig om forholdet mellom form og innhold. Appen skulle skape scenerom for det Brecht hadde tenkt; innholdet var gitt.',
  'Det slående er den formelle spennvidden som oppstår når han arbeider etter opptrukne retningslinjer.',
  'Utstillingen viser hvilken kunstnerisk frihet det kan gi å arbeide innen gitte forutsetninger. Von Appen varierer teknikk og form fra forestilling til forestilling.',
  'Noen tegninger er detaljerte og frodige, mens andre arbeider med tørre flater og avissats.',
  'I det hele tatt vitner utstillingen om hvor viktig det er for en kunstner å beherske samtidens formelle teknikker og bruke dem til å skape det innholdet som skal fram.'
].join(' ');

const assistantReply = [
  'Utstillingen «Brecht-bilder» viser hvordan Karl von Appen utviklet scenografi i tett samarbeid med Bertolt Brecht.',
  'Det mest interessante er hvordan von Appen varierer form og teknikk innenfor et gitt dramatisk innhold, slik at begrensningene blir en kilde til kunstnerisk frihet.',
  'Arbeidene gjør dermed forholdet mellom form, innhold og scenografisk metode til utstillingens sentrale spørsmål.'
].join(' ');

const context = createChatContext();
const hooks = context.AHATestHooks;
assert.ok(hooks, 'AHA test hooks must exist');
assert.notEqual(context.AHAChatSignals.detectTextType(sourceText), 'theory_idea', 'physical models/modeller must not trigger theory_idea by substring');
assert.notEqual(context.AHAChatSignals.detectTextType('Scenografen bygget modeller og scenerom til utstillingen.'), 'theory_idea', 'modeller/scenerom must stay lexical, not abstract theory markers');

const payload = hooks.buildAutoOutputs(sourceText, assistantReply);
assert.equal(payload.assistantReply, assistantReply, 'same-run AI reply must be available to afterwork synthesis');
assert.doesNotMatch(JSON.stringify(payload.insightCards), /Mønster: .* går igjen og bærer teksten/i, 'keyword recurrence must not masquerade as insight');

const canonical = hooks.buildCanonicalAnalysis(payload, sourceText);
const canonicalText = JSON.stringify(canonical);
assert.doesNotMatch(canonicalText, /usikker årsaksforståelse|manglende spesifisitet|for få konkrete holdepunkter/i);
assert.match(canonical.keyInsight, /appen|brecht|form|innhold|scenograf|teknikk|kunstnerisk/i, 'key insight must stay on the source topic');
assert.match(canonical.mainTension, /form|innhold|frihet|forutsetning|spennvidde/i, 'main tension must be source-grounded');

const harmonized = context.AHAChatAutoOutputView.harmonizeAnalysisPayload({ ...payload, canonicalAnalysis: canonical }, sourceText);
const finalized = context.AHAChatAutoOutputView.finalizeAnalysisQuality(harmonized, sourceText);
assert.notEqual(finalized.analysisQuality.status, 'blocked', JSON.stringify(finalized.analysisQuality));
assert.notEqual(finalized.qualityGate.status, 'needs_more_source', 'substantive source must not be treated as missing context');
assert.doesNotMatch(JSON.stringify(finalized.ahaSer), /usikker årsaksforståelse|manglende spesifisitet/i);

const evaluatorCode = fs.readFileSync(path.resolve(__dirname, '../js/ahaAnalysisQualityEvaluator.js'), 'utf8');
const isolated = { window: null, globalThis: null };
isolated.window = isolated;
isolated.globalThis = isolated;
vm.createContext(isolated);
vm.runInContext(evaluatorCode, isolated, { filename: 'js/ahaAnalysisQualityEvaluator.js' });
const bad = {
  canonicalAnalysis: {
    contentType: 'theory_idea',
    domain: 'generic_academic',
    theme: 'usikker årsaksforståelse',
    mainTension: 'behov for forklaring kontra manglende spesifisitet',
    keyInsight: 'Teksten uttrykker frustrasjon, men gir for få konkrete holdepunkter til sikker klassifisering.',
    fieldConnections: [],
    historyGoLinks: [],
    suggestedActions: ['Etterspør kontekst: hvem, hva, når og hvilke konsekvenser.'],
    confidence: { contentType: 0.38, domain: 0.22, theme: 0.41, mainTension: 0.35, historyGoLinks: 0.03 },
    warnings: ['Lav informasjonsdensitet: teksten mangler konkrete referanser.']
  },
  sortItems: sourceText.split(/(?<=[.!?])\s+/).slice(0, 3).map((text, index) => ({ label: 'Kildebelegg ' + (index + 1), text }))
};
const badReport = isolated.AHAAnalysisQualityEvaluator.evaluateAnalysis(bad, sourceText);
assert.notEqual(badReport.status, 'passed', 'the reported false-positive analysis must never pass again');
assert.ok(badReport.critical.includes('generic_low_information_fallback_on_substantive_source'));

console.log('AHA semantic analysis regression v1 passed');
`;
  fs.writeFileSync(testPath, test);
}

console.log('Applied AHA semantic analysis quality v1 transform');
