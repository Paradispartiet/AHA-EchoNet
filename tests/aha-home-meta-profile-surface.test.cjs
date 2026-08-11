const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/ahaProfile.js'), 'utf8');

const store = new Map();
store.set('aha_insight_chamber_v1', JSON.stringify({
  subject_id: 'sub_laring',
  insights: [{ id: 'i1', theme: 'By', concepts: [{ label: 'makt', count: 2 }] }]
}));

const metaInsight = {
  readiness: { level: 'middels', score: 55 },
  evidence: { insight_count: 4 },
  summary: 'AHA ser et mønster.',
  learning_mode: 'bygger forståelse',
  dominant_themes: [{ theme_id: 'By', insight_count: 2 }],
  dominant_concepts: [{ key: 'makt', total_count: 3 }],
  recurring_patterns: [],
  tension_summary: { strongest: null },
  next_actions: ['Skriv videre om makt.', 'Sammenlign to perspektiver.']
};

const fullMeta = {
  temporal: {
    recent_focus: {
      concepts: [{ key: 'makt', count: 3 }],
      emerging: [{ key: 'sted', count: 2 }]
    }
  },
  recommendations: {
    resurface_insights: [{ theme_id: 'Historie', summary: 'En eldre tanke', reason: 'Relevant igjen.' }],
    bridging_pairs: [{ source: 'makt', target: 'sted', reason: 'Sterk, sjelden kobling.' }],
    underexplored_concepts: [{ key: 'institusjon', reason: 'Smalt forankret.' }],
    unstick_prompts: [{ prompt: 'Hva endret seg?' }]
  },
  tensions: {},
  meta_insight: metaInsight
};

const metaEl = { innerHTML: '', onclick: null };
const panelEyebrow = { textContent: 'Meta-profil' };
const panelTitle = { textContent: 'Hva AHA ser i materialet ditt', id: '' };
const mineEyebrow = { textContent: '4' };
const feed = {
  inserted: null,
  insertBefore(panel, mine) {
    this.inserted = { panel, mine };
    panel.parentElement = this;
  }
};
const mine = {
  parentElement: feed,
  querySelector: (selector) => selector === '.eyebrow' ? mineEyebrow : null
};
const panel = {
  parentElement: mine,
  classList: {
    added: [],
    add(...names) { this.added.push(...names); }
  },
  attrs: {},
  setAttribute(key, value) { this.attrs[key] = value; },
  querySelector(selector) {
    if (selector === '.eyebrow') return panelEyebrow;
    if (selector === 'h3') return panelTitle;
    return null;
  }
};

const context = {
  console,
  Date,
  Math,
  JSON,
  setTimeout,
  clearTimeout,
  localStorage: {
    getItem: (key) => store.get(key) || null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key)
  },
  document: {
    readyState: 'loading',
    addEventListener: () => {},
    querySelector: (selector) => selector === '.aha-meta-profile-panel'
      ? panel
      : selector === '.aha-home-app-card-mine'
        ? mine
        : null,
    getElementById: (id) => id === 'aha-meta-profile-home' ? metaEl : null
  },
  MetaInsightsEngine: {
    buildUserMetaProfile: () => fullMeta,
    buildMetaInsightPrompt: () => 'prompt'
  }
};
context.window = context;
vm.createContext(context);
vm.runInContext(source, context, { filename: 'js/ahaProfile.js' });
context.AHAProfile.render();

assert.equal(feed.inserted.panel, panel, 'meta-profilen skal flyttes ut av Mine ting');
assert.equal(feed.inserted.mine, mine, 'meta-profilen skal settes inn før Mine ting');
assert.ok(panel.classList.added.includes('aha-home-app-card'), 'meta-profilen skal bruke eksisterende Home-kortstil');
assert.equal(panel.attrs['aria-labelledby'], 'aha-home-meta-title');
assert.equal(panelEyebrow.textContent, '4');
assert.equal(mineEyebrow.textContent, '5');

for (const text of [
  'Nylig fokus',
  'Nytt i materialet',
  'Eldre tanker som er relevante nå',
  'Sterke, sjeldne koblinger',
  'Underutforskede begreper',
  'Spørsmål å tenke videre på',
  'Neste gode steg',
  'makt',
  'sted',
  'En eldre tanke',
  'institusjon',
  'Hva endret seg?',
  'Skriv videre om makt.'
]) {
  assert.ok(metaEl.innerHTML.includes(text), `meta-profilen mangler: ${text}`);
}

assert.ok(metaEl.innerHTML.includes('meta-confirm-insight'), 'eksisterende Bekreft med AHA-handling skal bevares');
assert.match(source, /MetaInsightsEngine/);
assert.match(source, /fullMeta\?\.temporal/);
assert.match(source, /recommendations\.resurface_insights/);
assert.match(source, /recommendations\.bridging_pairs/);
assert.match(source, /recommendations\.underexplored_concepts/);
assert.match(source, /recommendations\.unstick_prompts/);
assert.doesNotMatch(source, /scanAllSources\(|approveIntake\(|approveCuration\(|sendToTraining\(/);

console.log('aha-home-meta-profile-surface.test.cjs passed');
