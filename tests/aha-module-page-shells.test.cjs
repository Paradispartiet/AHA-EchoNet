const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const read = (file) => fs.readFileSync(file, 'utf8');
const index = read('index.html');
const modulesCode = read('js/ahaModules.js');
const dashboardCss = read('css/aha-dashboard.css');
const pages = {
  lists: { html: read('lists.html'), js: read('js/ahaLists.js'), title: 'Lists', purpose: 'Organize saved AHA items.', action: 'Create list', empty: 'No lists yet.' },
  paths: { html: read('paths.html'), js: read('js/ahaPaths.js'), title: 'Paths', purpose: 'Build ordered learning routes.', action: 'Create path', empty: 'No paths yet.' },
  groups: { html: read('groups.html'), js: read('js/ahaGroups.js'), title: 'Groups', purpose: 'Group related AHA material.', action: 'Create group', empty: 'No groups yet.' },
  avisa: { html: read('avisa.html'), js: read('js/ahaAvisa.js'), title: 'AHAavisa', purpose: 'Collect drafts and published AHA notes.', action: 'New note', empty: 'No AHAavisa notes yet.' }
};

for (const [moduleId, page] of Object.entries(pages)) {
  const shellSource = `${page.html}\n${page.js}`;
  assert.ok(shellSource.includes(`>${page.title}<`), `${page.title} shell should render its normalized title`);
  assert.ok(shellSource.includes(page.purpose), `${page.title} shell should render its short purpose`);
  assert.ok(shellSource.includes(page.action), `${page.title} shell should expose its existing primary action`);
  assert.ok(shellSource.includes(page.empty), `${page.title} should render its normalized empty state`);
  assert.ok(shellSource.includes('aha-module-health-badge'), `${page.title} shell should render a health badge`);
  assert.ok(shellSource.includes('role="status"'), `${page.title} health badge should expose textual status semantics`);
  assert.ok(shellSource.includes('aha-module-content'), `${page.title} should expose a consistent content area`);
  assert.ok(page.js.includes(`updatePageHealth?.("${moduleId}"`), `${page.title} renderer should update health without a database call`);
  assert.ok(/Could not (read module data|render module)\./.test(page.js), `${page.title} should render a normalized error state`);
  assert.equal(/syncFromDatabase\s*\(\s*\)\s*;/.test(page.js), false, `${page.title} should not auto-call syncFromDatabase`);
  assert.equal(/autoSync/.test(page.js), false, `${page.title} should not introduce autoSync`);
  assert.equal(/createClient\s*\(/.test(page.js), false, `${page.title} should not create a database client`);
  assert.equal(/localStorage\.setItem\([^\n]*(shell|health|expanded|details)/i.test(page.js), false, `${page.title} should not persist shell UI state`);
  assert.equal(/JSON\.stringify\s*\([^\n]*(payload|audit)/i.test(page.js), false, `${page.title} should not render a full payload or audit dump`);
}

assert.ok(pages.avisa.html.includes('<summary>Advanced details</summary>'), 'AHAavisa technical publishing details should be collapsed');
assert.ok(pages.groups.js.includes('<summary>Advanced details</summary>'), 'Groups technical sharing details should be collapsed');
assert.ok(dashboardCss.includes('.aha-module-shell-header'), 'shared module shell styling should exist');
assert.ok(dashboardCss.includes('.aha-module-actions'), 'shared action-row styling should exist');
assert.ok(dashboardCss.includes('@media (max-width: 640px)'), 'module shells should include a narrow-screen layout');
assert.ok(dashboardCss.includes('flex-direction: column'), 'module shell headers should stack on narrow screens');

const sandbox = { window: {}, document: { getElementById: () => null } };
vm.runInNewContext(modulesCode, sandbox, { filename: 'js/ahaModules.js' });
const health = sandbox.window.AHAModules;
assert.deepEqual(health.healthStatuses, ['ready', 'warning', 'blocked', 'empty', 'missing', 'unknown'], 'all required module health statuses should remain supported');
assert.equal(health.localPageHealth({ count: 2, datasetExists: true }).status, 'ready');
assert.equal(health.localPageHealth({ count: 0, datasetExists: true }).status, 'empty');
assert.equal(health.localPageHealth({ count: 0, datasetExists: false }).status, 'missing');
assert.equal(health.localPageHealth({ error: true }).status, 'blocked');
assert.equal(health.normalizeModuleHealth({ status: 'unexpected' }).status, 'unknown');

for (const file of ['js/ahaLists.js', 'js/ahaPaths.js', 'js/ahaGroups.js', 'js/ahaAvisa.js']) {
  assert.equal(index.includes(file), false, `Home must not load ${file} on initial load`);
}

console.log('aha-module-page-shells.test.cjs passed');
