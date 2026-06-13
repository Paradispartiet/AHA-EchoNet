const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

function makeContext(extra = {}) {
  const context = {
    console,
    window: null,
    globalThis: null,
    Date,
    Math,
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {}
    },
    ...extra
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  return context;
}

function run(file, context) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

// 1. buildPersonalContext() håndterer tomme lagre.
{
  const ctx = makeContext();
  run('js/ahaChatPersonalContext.js', ctx);
  const pack = ctx.AHAChatPersonalContext.buildPersonalContext();
  assert.equal(pack.version, 'v1');
  assert.deepEqual(pack.corpus, []);
  assert.deepEqual(pack.examples, []);
  assert.equal(pack.evidence.confirmedClaims, 0);
}

const baseMemory = {
  confirmedClaims: [{ claimText: 'Brukeren bygger AHA Chat Personal Context.' }],
  partialClaims: [{ claimText: 'Brukeren tester RAG senere.' }],
  importantClaims: [{ claimText: 'Prosjektet AHA-EchoNet er viktig for brukeren.' }],
  activeSelfModel: {
    activeProjects: ['AHA-EchoNet'],
    activePatterns: ['local-first arbeid'],
    activeTensions: ['balanse mellom kort og presist']
  }
};

function richContext() {
  return makeContext({
    AHAMetaInsightsMemory: {
      summarizeMemory: () => baseMemory,
      buildMemoryPack: () => ({ confirmed_claims: ['Brukeren bygger AHA Chat Personal Context.'] })
    },
    AHATrainingCorpus: {
      loadCorpus: () => [
        {
          id: 'c1',
          title: 'AHA kontekstarkitektur',
          source: 'manual',
          project: 'AHA-EchoNet',
          concepts: ['personlig kontekst', 'readiness'],
          text: 'Godkjent tekst om personlig kontekst og chatflyt.',
          status: 'approved',
          consent: { useForKnowledge: true, useForMemory: false }
        },
        {
          id: 'c2',
          title: 'Ikke godkjent',
          concepts: ['hemmelig'],
          text: 'Skal ikke med.',
          status: 'raw',
          consent: { useForKnowledge: true, useForMemory: true }
        },
        {
          id: 'c3',
          title: 'Mangler samtykke',
          concepts: ['privat'],
          text: 'Skal heller ikke med.',
          status: 'approved',
          consent: { useForKnowledge: false, useForMemory: false }
        }
      ]
    },
    AHATrainingExamples: {
      loadExamples: () => [
        { id: 'e1', taskType: 'memory_fact', input: 'Hva vet AHA?', output: 'Brukeren jobber med AHA-EchoNet.', language: 'no', status: 'approved' },
        { id: 'e2', taskType: 'style_example', input: 'Svar kort', output: 'Kort, tydelig og varm stil.', language: 'no', status: 'approved' },
        { id: 'e3', taskType: 'summary', input: 'Utkast', output: 'Ikke bruk', language: 'no', status: 'draft' }
      ]
    },
    AHAPersonalModelReadiness: {
      buildReadinessReport: () => ({ level: 'klar', score: 72 }),
      buildCompactPack: (report) => ({ level: report.level, score: report.score, approvedCorpus: 1, approvedExamples: 2 })
    }
  });
}

// 2-8 og 12. Personlig kontekst bygger bare godkjent, samtykket materiale.
{
  const ctx = richContext();
  run('js/ahaChatPersonalContext.js', ctx);
  const api = ctx.AHAChatPersonalContext;
  const pack = api.buildPersonalContext();
  assert.equal(pack.memory.confirmedClaims[0].claimText, 'Brukeren bygger AHA Chat Personal Context.');
  assert.equal(pack.corpus.length, 1, 'kun approved corpus med knowledge/memory consent skal brukes');
  assert.equal(pack.corpus[0].id, 'c1');
  assert.equal(pack.examples.length, 2, 'kun approved examples skal brukes');
  assert.ok(pack.examples.some((example) => example.taskType === 'memory_fact'));
  assert.ok(pack.compactPrompt.includes('Personlig AHA-kontekst'));
  assert.ok(pack.compactPrompt.includes('Bekreftet selvinnsikt'));
  const relevant = api.selectRelevantContext('Hvordan bruker vi personlig kontekst i AHA-EchoNet?', pack);
  assert.ok(relevant.relevantCorpus.some((item) => item.id === 'c1'), 'concept/title/project skal matche brukerens melding');
  const messagePack = api.buildMessageContext('Forklar personlig kontekst i AHA-EchoNet');
  assert.ok(messagePack.prompt.includes('AHA personal context'));
  assert.ok(messagePack.prompt.includes('Godkjent kunnskapsgrunnlag'));
  const status = api.getPersonalContextStatus();
  assert.equal(status.approvedCorpus, 1);
  assert.equal(status.approvedExamples, 2);
  assert.equal(status.confirmedClaims, 1);
  assert.equal(status.readinessLevel, 'klar');
  assert.equal(status.hasStyleProfile, true);
  assert.equal(status.hasProjectContext, true);
  assert.equal(JSON.stringify(pack).includes('Ikke godkjent'), false);
  assert.equal(JSON.stringify(pack).includes('Mangler samtykke'), false);
}

// 9-10. Chat laster scriptet og viser Personlig kontekst.
{
  const html = fs.readFileSync('chat.html', 'utf8');
  assert.ok(html.includes('js/ahaChatPersonalContext.js'), 'chat.html skal laste ahaChatPersonalContext.js');
  assert.ok(html.includes('Personlig kontekst'), 'chat.html skal vise panelet Personlig kontekst');
}

// Chat-integrasjon: riktig felt sendes til agentpayload.
{
  const chat = fs.readFileSync('js/ahaChat.js', 'utf8');
  assert.ok(chat.includes('buildAhaPersonalMessageContext'), 'chat skal bygge personlig kontekst før svar');
  assert.ok(chat.includes('personal_context'), 'chat skal sende personal_context i agentpayload');
  assert.ok(chat.includes('AHA personlig kontekst aktiv'), 'chat skal vise aktiv status');
}

// 11. MetaInsightsAgent får chatPersonalContextPack.
{
  const ctx = richContext();
  run('js/ahaChatPersonalContext.js', ctx);
  run('js/metaInsightsAgent.js', ctx);
  const agentContext = ctx.AHAMetaInsightsAgent.buildAgentContext({ meta_insight: {}, temporal: {} });
  assert.ok(agentContext.chatPersonalContextPack, 'agentContext skal ha chatPersonalContextPack');
  assert.equal(agentContext.chatPersonalContextPack.approvedCorpus, 1);
  assert.equal(agentContext.chatPersonalContextPack.approvedExamples, 2);
  assert.equal(agentContext.chatPersonalContextPack.confirmedClaims, 1);
}

console.log('aha-chat-personal-context tests passed');
