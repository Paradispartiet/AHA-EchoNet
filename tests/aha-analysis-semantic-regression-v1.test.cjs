const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
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

assert.notEqual(
  context.AHAChatSignals.detectTextType(sourceText),
  'theory_idea',
  'physical models/modeller must not trigger theory_idea by substring'
);
assert.notEqual(
  context.AHAChatSignals.detectTextType('Scenografen bygget modeller og scenerom til utstillingen.'),
  'theory_idea',
  'modeller/scenerom must stay lexical, not abstract theory markers'
);
assert.equal(
  context.AHAChatSignals.detectTextType('Dette er en modell for hvordan en teori kan testes mot et premiss.'),
  'theory_idea',
  'explicit abstract theory language must still classify as theory_idea'
);

const payload = hooks.buildAutoOutputs(sourceText, assistantReply);
assert.equal(payload.assistantReply, assistantReply, 'same-run AI reply must be available to afterwork synthesis');
assert.doesNotMatch(
  JSON.stringify(payload.insightCards),
  /Mønster: .* går igjen og bærer teksten/i,
  'keyword recurrence must not masquerade as an insight'
);

const canonical = hooks.buildCanonicalAnalysis(payload, sourceText);
const canonicalText = JSON.stringify(canonical);
assert.doesNotMatch(canonicalText, /usikker årsaksforståelse|manglende spesifisitet|for få konkrete holdepunkter/i);
assert.match(
  canonical.keyInsight,
  /appen|brecht|form|innhold|scenograf|teknikk|kunstnerisk/i,
  'key insight must remain on the source topic'
);
assert.match(
  canonical.mainTension,
  /form|innhold|frihet|forutsetning|spennvidde/i,
  'main tension must be source-grounded'
);
assert.equal(canonical.semanticSynthesis?.sourceBound, true, 'generic semantic synthesis must be explicitly source-bound');

const harmonized = context.AHAChatAutoOutputView.harmonizeAnalysisPayload(
  { ...payload, canonicalAnalysis: canonical },
  sourceText
);
const finalized = context.AHAChatAutoOutputView.finalizeAnalysisQuality(harmonized, sourceText);
assert.notEqual(finalized.analysisQuality.status, 'blocked', JSON.stringify(finalized.analysisQuality));
assert.notEqual(finalized.qualityGate.status, 'needs_more_source', 'substantive source must not be treated as missing context');
assert.doesNotMatch(JSON.stringify(finalized.ahaSer), /usikker årsaksforståelse|manglende spesifisitet/i);

// Reproduce the exact failure class from the real export: verbatim source quotes
// must not allow a semantically unrelated low-information interpretation to pass.
const evaluatorCode = fs.readFileSync(path.resolve(__dirname, '../js/ahaAnalysisQualityEvaluator.js'), 'utf8');
const providerLoaderCode = fs.readFileSync(path.resolve(__dirname, '../js/ahaChatProviderLoader.js'), 'utf8');
const isolated = {
  window: null,
  globalThis: null,
  AHAModuleApi: { register() {}, resolve() { return null; } },
  AHAChatSignals: { detectTextType() { return 'general'; } },
  AHAChatAutoAnalysis: null,
  AHAChatCanonicalAnalysis: null
};
isolated.window = isolated;
isolated.globalThis = isolated;
vm.createContext(isolated);
vm.runInContext(evaluatorCode, isolated, { filename: 'js/ahaAnalysisQualityEvaluator.js' });
vm.runInContext(providerLoaderCode, isolated, { filename: 'js/ahaChatProviderLoader.js' });

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
  sortItems: sourceText
    .split(/(?<=[.!?])\s+/)
    .slice(0, 3)
    .map((text, index) => ({ label: `Kildebelegg ${index + 1}`, text }))
};
const badReport = isolated.AHAAnalysisQualityEvaluator.evaluateAnalysis(bad, sourceText);
assert.equal(badReport.status, 'blocked', 'the reported false-positive analysis must never pass again');
assert.ok(badReport.critical.includes('generic_low_information_fallback_on_substantive_source'));

console.log('AHA semantic analysis regression v1 passed');
