const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const code = fs.readFileSync('js/ahaChatInsightFeedback.js', 'utf8');

let evaluationCalls = 0;
let observerCallback = null;
let observedTarget = null;
const statusNode = { textContent: '' };
const chatLog = {};

class MockMutationObserver {
  constructor(callback) { observerCallback = callback; }
  observe(target, options) {
    observedTarget = target;
    this.options = options;
  }
}

const evaluations = [
  {
    score: 82,
    status: 'strong',
    dimensions: {
      sourceGrounding: { score: 88 },
      personalRelevance: { score: 91 },
      transparency: { score: 80 }
    },
    sourceUse: {
      usedSources: [
        {
          id: 'retrieval-secret-1',
          sourceId: 'claim-secret-1',
          source: 'meta_insights_memory',
          sourceType: 'confirmed_claim',
          title: 'AHA EchoNet er et aktivt prosjekt',
          excerpt: 'PRIVATE MEMORY BODY'
        }
      ],
      unusedSources: [
        {
          id: 'retrieval-secret-2',
          sourceId: 'corpus-secret-2',
          source: 'training_corpus',
          sourceType: 'corpus_item',
          title: 'Arkitektur for personlig kunnskap'
        }
      ]
    }
  },
  {
    score: 61,
    status: 'good',
    dimensions: {
      sourceGrounding: { score: 35 },
      personalRelevance: { score: 55 },
      transparency: { score: 70 }
    },
    sourceUse: {
      usedSources: [],
      unusedSources: [
        {
          id: 'retrieval-secret-3',
          sourceId: 'example-secret-3',
          source: 'training_examples',
          sourceType: 'training_example',
          title: 'Godkjent prosjekteksempel'
        }
      ]
    }
  },
  {
    score: 45,
    status: 'usable',
    dimensions: {
      sourceGrounding: { score: 45 },
      personalRelevance: { score: 25 },
      transparency: { score: 60 }
    },
    sourceUse: { usedSources: [], unusedSources: [] }
  }
];

const context = {
  console,
  Map,
  Set,
  Array,
  Object,
  String,
  Number,
  JSON,
  MutationObserver: MockMutationObserver,
  document: {
    readyState: 'complete',
    getElementById(id) {
      if (id === 'chat-status-note') return statusNode;
      if (id === 'chat-log') return chatLog;
      return null;
    },
    addEventListener() {}
  },
  setTimeout(callback) { callback(); return 1; },
  AHAIngest: {
    ingestWithCandidates() { return { ok: true, items: [] }; }
  },
  AHAPersonalAnswerEvaluation: {
    evaluateAnswer() {
      const result = evaluations[Math.min(evaluationCalls, evaluations.length - 1)];
      evaluationCalls += 1;
      return result;
    }
  }
};
context.window = context;
vm.createContext(context);
vm.runInContext(code, context, { filename: 'js/ahaChatInsightFeedback.js' });

const api = context.AHAChatInsightFeedback;
assert.ok(api, 'Chat feedback/transparency API should load');
assert.equal(context.AHAPersonalAnswerEvaluation.__ahaPersonalAnswerTransparencyCaptureInstalled, true,
  'Personal AI evaluation capture should install on the Chat surface');
assert.ok(observerCallback, 'Chat should observe rendered answer-evaluation nodes');
assert.strictEqual(observedTarget, chatLog);

function makeEvaluationNode() {
  const classes = [];
  return {
    dataset: {},
    innerHTML: '',
    classList: { add(value) { classes.push(value); } },
    matches(selector) { return selector === '.aha-answer-evaluation'; },
    querySelectorAll() { return []; },
    classes
  };
}

function renderNextEvaluation() {
  const result = context.AHAPersonalAnswerEvaluation.evaluateAnswer('spørsmål', 'svar', {});
  const node = makeEvaluationNode();
  observerCallback([{ addedNodes: [node] }]);
  return { result, node };
}

const first = renderNextEvaluation();
assert.strictEqual(first.result, evaluations[0], 'capture wrapper must preserve the exact evaluation result');
assert.equal(evaluationCalls, 1);
assert.equal(first.node.dataset.personalGrounding, 'true');
assert.ok(first.node.classes.includes('aha-personal-answer-grounding'));
assert.match(first.node.innerHTML, /Personlig grunnlag/);
assert.match(first.node.innerHTML, /1 personlig kilde ble identifisert som tydelig brukt/);
assert.match(first.node.innerHTML, /Bekreftet selvinnsikt/);
assert.match(first.node.innerHTML, /AHA EchoNet er et aktivt prosjekt/);
assert.match(first.node.innerHTML, /Hentet frem, men lite synlig i svaret/);
assert.match(first.node.innerHTML, /Godkjent kunnskapsgrunnlag/);
assert.match(first.node.innerHTML, /Arkitektur for personlig kunnskap/);
assert.match(first.node.innerHTML, /rest(?:en)? er AHA sin formulering og vurdering/i);
assert.match(first.node.innerHTML, /heuristisk kontroll/);
assert.match(first.node.innerHTML, /82\/100/);
assert.doesNotMatch(first.node.innerHTML, /retrieval-secret|claim-secret|corpus-secret|PRIVATE MEMORY BODY/,
  'Personal AI transparency must not expose internal retrieval IDs or raw memory excerpts');

const second = renderNextEvaluation();
assert.match(second.node.innerHTML, /Personlig materiale ble hentet frem, men ingen kilde ble identifisert som tydelig brukt/);
assert.match(second.node.innerHTML, /Godkjent eksempel/);
assert.match(second.node.innerHTML, /Godkjent prosjekteksempel/);
assert.doesNotMatch(second.node.innerHTML, /example-secret/);

const third = renderNextEvaluation();
assert.match(third.node.innerHTML, /Ingen personlige kilder ble identifisert som tydelig brukt/);
assert.match(third.node.innerHTML, /ikke dokumentert kildebruk fra ditt lagrede materiale/i);

const direct = api.buildPersonalAnswerTransparency(evaluations[0]);
assert.deepEqual(JSON.parse(JSON.stringify(direct.used)), [
  { label: 'Bekreftet selvinnsikt', title: 'AHA EchoNet er et aktivt prosjekt' }
]);
assert.equal(direct.usedCount, 1);
assert.equal(direct.selectedCount, 2);
assert.equal(direct.sourceGrounding, 88);
assert.doesNotMatch(JSON.stringify(direct), /retrieval-secret|claim-secret|PRIVATE MEMORY BODY/);

assert.equal(api.installPersonalAnswerEvaluationCapture(), true, 'capture installation should be idempotent');
assert.equal(api.installPersonalAnswerTransparencyObserver(), true, 'observer installation should be idempotent');

let forbiddenEvaluationReads = 0;
const isolated = {
  console,
  Map,
  Set,
  Array,
  Object,
  String,
  Number,
  JSON,
  document: {
    readyState: 'complete',
    getElementById() { return null; },
    addEventListener() {}
  },
  setTimeout(callback) { callback(); return 1; },
  AHAPersonalAnswerEvaluation: new Proxy({}, {
    get() {
      forbiddenEvaluationReads += 1;
      throw new Error('Personal Answer Evaluation must stay isolated outside Chat');
    }
  })
};
isolated.window = isolated;
vm.createContext(isolated);
vm.runInContext(code, isolated, { filename: 'js/ahaChatInsightFeedback.js' });
assert.equal(forbiddenEvaluationReads, 0,
  'Chat-log guard must run before the Personal Answer Evaluation API is read');

assert.equal(/localStorage\s*\.\s*(setItem|removeItem|clear)\s*\(/.test(code), false,
  'Personal AI Chat transparency must remain read-only');
assert.equal(/\bfetch\s*\(/.test(code), false,
  'Personal AI Chat transparency must not fetch');

console.log('aha-personal-ai-chat-transparency.test.cjs passed');
