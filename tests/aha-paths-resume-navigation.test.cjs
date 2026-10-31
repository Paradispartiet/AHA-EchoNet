const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, '..', 'js', 'ahaPaths.js'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, '..', 'css', 'aha-paths.css'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'paths.html'), 'utf8');

function makeHarness(paths) {
  const values = new Map([['aha_paths_v1', JSON.stringify(paths)]]);
  const writes = [];
  const focused = [];
  const scrolled = [];
  let onReady;

  class HTMLElement {
    constructor(dataset = {}) {
      this.dataset = dataset;
      this.textContent = '';
      this.innerHTML = '';
      this.listeners = {};
    }
    addEventListener(type, callback) { this.listeners[type] = callback; }
    focus() { focused.push('preview'); }
    hasAttribute() { return false; }
  }

  const elements = {
    'paths-count': new HTMLElement(),
    'path-steps-count': new HTMLElement(),
    'paths-list': new HTMLElement()
  };
  const document = {
    readyState: 'loading',
    addEventListener(type, callback) { if (type === 'DOMContentLoaded') onReady = callback; },
    getElementById(id) {
      if (elements[id]) return elements[id];
      if (id === 'path-preview-title' && elements['paths-list'].innerHTML.includes('id="path-preview-title"')) {
        return { focus() { focused.push(id); } };
      }
      if (id.startsWith('path-step-') && elements['paths-list'].innerHTML.includes('id="' + id + '"')) {
        return {
          focus() { focused.push(id); },
          scrollIntoView() { scrolled.push(id); }
        };
      }
      return null;
    },
    querySelector() { return null; }
  };

  const context = {
    console, Date, Intl, Math, JSON, HTMLElement, document,
    localStorage: {
      getItem(key) { return values.has(key) ? values.get(key) : null; },
      setItem(key, value) { writes.push(key); values.set(key, String(value)); }
    },
    AHAGroups: { getActiveGroups() { return []; } },
    AHAModules: {
      localPageHealth() { return { status: 'ready' }; },
      updatePageHealth() {},
      buildModuleEmptyState() { return '<p>Ingen stier ennå.</p>'; }
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(script, context, { filename: 'js/ahaPaths.js' });
  onReady();
  return {
    Paths: context.AHAPaths,
    mount: elements['paths-list'],
    writes, focused, scrolled,
    click(dataset) {
      elements['paths-list'].listeners.click({ target: new HTMLElement(dataset) });
    }
  };
}

const learning = {
  id: 'path-A/B',
  title: 'Min læringssti',
  type: 'learning',
  steps: [
    { id: 'done/1', title: 'Les grunnlaget', status: 'done', order: 0, source: 'aha_notes', refId: 'n1' },
    { id: 'active/2', title: 'Tenk gjennom tema', status: 'active', order: 1, source: 'aha_notes', refId: 'n2' },
    { id: 'planned/3', title: 'Skriv oppsummering', status: 'planned', order: 2, source: 'aha_notes', refId: 'n3' },
    { id: 'skipped/4', title: 'Valgfri gjennomgang', status: 'skipped', order: 3, source: 'aha_notes', refId: 'n4' }
  ]
};

const test = makeHarness([learning]);
assert.match(test.mount.innerHTML, /Fremdrift: 1 av 4 steg fullført/);
assert.match(test.mount.innerHTML, /1 hoppet over/);
assert.match(test.mount.innerHTML, /Neste steg: Tenk gjennom tema/);
assert.match(test.mount.innerHTML, /data-path-resume="path-A\/B"/);
assert.equal(test.writes.length, 0, 'Rendering does not write to storage');

test.click({ pathResume: 'path-A/B' });
assert.match(test.mount.innerHTML, /Hopp til steg/);
assert.match(test.mount.innerHTML, /Neste åpne steg:.*Tenk gjennom tema/);
assert.match(test.mount.innerHTML, /data-path-step-jump="planned\/3"/);
assert.match(test.mount.innerHTML, /id="path-step-active%2F2"/);
assert.match(test.mount.innerHTML, /tabindex="-1"/);
assert.match(test.mount.innerHTML, /Forrige steg/);
assert.match(test.mount.innerHTML, /Neste steg/);
assert.equal(test.focused.at(-1), 'path-step-active%2F2', 'Resume focuses the active step first');
assert.equal(test.scrolled.at(-1), 'path-step-active%2F2', 'Resume scrolls to the active step');
assert.equal(test.writes.length, 0, 'Resuming does not modify saved progress');

test.click({ pathStepJump: 'planned/3' });
assert.equal(test.focused.at(-1), 'path-step-planned%2F3', 'Step navigation moves keyboard focus');
assert.equal(test.writes.length, 0, 'Moving between steps must be read-only');

// An explicit status update is the only operation here that writes saved progress.
test.Paths.updatePathStep('path-A/B', 'active/2', { status: 'done' });
assert.equal(test.writes.length, 1);
assert.match(test.mount.innerHTML, /Tenk gjennom tema/);
test.Paths.render();
assert.match(test.mount.innerHTML, /Fremdrift: 2 av 4 steg fullført/);
assert.match(test.mount.innerHTML, /Neste åpne steg:.*Skriv oppsummering/);

const skipped = makeHarness([{
  id: 'only-skipped', title: 'Hoppet over', steps: [
    { id: 'step-s', title: 'Hoppet over', order: 0, status: 'skipped' }
  ]
}]);
assert.doesNotMatch(skipped.mount.innerHTML, /data-path-resume=/, 'Skipped items are not suggested as next');
assert.match(skipped.mount.innerHTML, /Ingen åpne steg/);
skipped.Paths.selectPath('only-skipped');
assert.match(skipped.mount.innerHTML, /Hoppede steg er ikke markert som fullført/);

const completed = makeHarness([{
  id: 'completed', title: 'Ferdig', steps: [
    { id: 'step-d', title: 'Fullført', order: 0, status: 'done' }
  ]
}]);
assert.match(completed.mount.innerHTML, /Alle steg fullført/);
assert.doesNotMatch(completed.mount.innerHTML, /data-path-resume=/, 'Completed paths do not offer resume');

const empty = makeHarness([{ id: 'no-steps', title: 'Tom sti', steps: [] }]);
assert.match(empty.mount.innerHTML, /Ingen steg ennå/);
assert.doesNotMatch(empty.mount.innerHTML, /data-path-resume=/, 'Empty paths do not offer resume');

assert.match(styles, /\.aha-path-step-row:focus/, 'Focused step has a visible outline');
assert.match(styles, /max-width: 760px/, 'Small-screen navigation gets responsive layout');
assert.match(html, /css\/aha-paths\.css/, 'The Paths page loads navigation styles');
assert.doesNotMatch(script, /aha_path_resume_state|aha_path_current_step/, 'No separate navigation state is saved');
console.log('aha-paths-resume-navigation.test.cjs passed');
