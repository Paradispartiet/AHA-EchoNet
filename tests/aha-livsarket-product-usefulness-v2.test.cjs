const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = { window: null, globalThis: null, console };
context.window = context;
context.globalThis = context;
vm.createContext(context);
for (const file of [
  'js/ahaInsightRelationClassifierV2.js',
  'js/ahaInsightSaturationV2.js',
  'js/ahaSemanticProjectionsV2.js'
]) vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });

function approved({ id, insight, type, concepts, evidence, abstraction, why, uncertainty = '' }) {
  return {
    id,
    source_event_id: 'livsarket_article',
    source_text_hash: 'a'.repeat(64),
    semantic_concepts: concepts,
    candidate: {
      insight,
      type,
      abstraction,
      why_it_matters: why,
      confidence: uncertainty ? 'medium' : 'high',
      uncertainty,
      causal_status: 'not_causal',
      evidence: evidence.map((quote, index) => ({ quote, role: index ? 'limits' : 'supports' }))
    },
    gate_decision: {
      eligible_for_insight_review: true,
      blocking_reasons: [],
      metrics: { quality_score: 0.88 }
    }
  };
}

const insights = [
  approved({
    id: 'livsarket_voice',
    insight: 'Livsarkets mål om individualisert omsorg står i spenning med faren for at skjemaets utvalg reduserer personens egen fortelling.',
    type: 'tension',
    concepts: ['individualisert omsorg', 'retten til egen fortelling', 'representasjon'],
    abstraction: 'Kobler omsorgsintensjonen til den etiske grensen som oppstår når et liv må velges ut og representeres av andre.',
    why: 'Skillet avgjør om livsarket brukes som dialogisk støtte eller som en autoritativ erstatning for personens stemme.',
    evidence: [
      'Et «livsark» er en kort tekst som skal gi en oversikt over en persons viktige livserfaringer, og fungere som et verktøy for helsepersonell for å kunne utøve best mulig individualisert omsorg.',
      'I livsarkets disposisjon ser vi hvordan det legges føringer for hva som regnes for å være sentrale elementer i et menneskes liv, i tillegg til føringer for hva som er vanlig å inkludere eller ekskludere i en livsfortelling.'
    ]
  }),
  approved({
    id: 'livsarket_selection',
    insight: 'Valg, perspektiv og utelatelse gjør livsarket til kunnskapsproduksjon, ikke en nøytral beholder for identitet.',
    type: 'principle',
    concepts: ['kunnskapsproduksjon', 'representasjon', 'fortellingspraksiser'],
    abstraction: 'Sammenfører biografisk seleksjon med hvordan dokumentformen konstruerer sammenheng og synlighet.',
    why: 'Prinsippet gjør det mulig å etterprøve hvem som fikk definere det relevante livet, og hva skjemaet lot falle bort.',
    evidence: [
      'Sentralt i denne debatten er erkjennelsen av at hva en velger å trekke fram og hvor en legger perspektivet, ikke er likegyldig.',
      'Formatet bestemmer dermed i stor grad hvordan fortellingen om dette levde livet blir formidlet, på fortellerens perspektiv og valg, og om i hvilken grad personen det omhandler, kommer fram i teksten.'
    ]
  }),
  approved({
    id: 'livsarket_journal_power',
    insight: 'I Høstreise vokser journalens strukturerende makt idet Sigrids egen stemme og handlekraft svekkes.',
    type: 'pattern',
    concepts: ['Høstreise', 'journalfortellingene', 'fortellingspraksiser'],
    abstraction: 'Leser journalnotatenes økende plass som en forskyvning i hvem som får strukturere fortellingen om Sigrids nåtid.',
    why: 'Mønsteret konkretiserer hvordan en omsorgstekst kan gå fra støtte til å bli den dominerende representasjonen av et menneske.',
    uncertainty: 'Romananalysen viser en fortellingsmessig parallell, ikke at alle livsark får denne virkningen.',
    evidence: [
      'Det er påfallende hvordan de kursiverte journalfortellingene blir mer framtredende utover i romanen.',
      'Det er som om de etter hvert tar over hele fortellingen om Sigrid Vangs nåtid: «Journalobservasjonane får stadig meir strukturerande makt» (Simonhjell, 2000).'
    ]
  })
];

const result = context.AHASemanticProjectionsV2.project({ insights });
assert.equal(result.validation.valid, true, JSON.stringify(result.validation));
assert.equal(result.status, 'ready');
assert.equal(result.projections.insights.length, 3);
assert.ok(result.projections.insights.every((item) => !item.title.includes('…')), 'product labels must not be truncated sentence openings');
assert.ok(result.projections.insights.some((item) => /individualisert omsorg|retten til egen fortelling/i.test(item.title)));
assert.ok(result.projections.insights.some((item) => /Høstreise|journalfortellingene/i.test(item.title)));
assert.ok(result.projections.lists.length >= 1 && result.projections.lists.length <= 3);
assert.equal(new Set(result.projections.lists.map((list) => [...list.meta.member_ref_ids].sort().join('|'))).size, result.projections.lists.length);
assert.equal(result.projections.paths.length, 1, 'the same analysis must not emit several copies of the generic five-stage path');
assert.ok(result.projections.paths[0].steps.some((step) => /Spenning eller moteksempel/.test(step.title)));
assert.ok(result.projections.mindmap.meta.branch_count >= 2);
assert.ok(result.projections.mindmap.nodes.some((node) => node.type === 'concept' && /representasjon/i.test(node.title)));
assert.ok(result.projections.mindmap.nodes.some((node) => node.type === 'concept' && /fortellingspraksiser/i.test(node.title)));
assert.equal(JSON.stringify(result.projections).includes('er forbundet med behovet for'), false);

console.log('aha-livsarket-product-usefulness-v2.test.cjs passed');
