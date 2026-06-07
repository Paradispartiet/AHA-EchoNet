const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const modulesCode = fs.readFileSync('js/ahaModules.js', 'utf8');
const dashboardCode = fs.readFileSync('js/ahaDashboard.js', 'utf8');
const dashboardCss = fs.readFileSync('css/aha-dashboard.css', 'utf8');
const indexCode = fs.readFileSync('index.html', 'utf8');
const mount = { innerHTML: '' };
const context = {
  console,
  document: {
    getElementById(id) {
      return id === 'aha-modules-grid' ? mount : null;
    }
  }
};
context.window = context;
vm.createContext(context);
vm.runInContext(modulesCode, context, { filename: 'js/ahaModules.js' });

assert.ok(context.AHAModules, 'ahaModules should own the module menu renderer');
assert.deepEqual(
  [...context.AHAModules.healthStatuses].sort(),
  ['blocked', 'empty', 'missing', 'ready', 'unknown', 'warning'],
  'module health should support every documented badge status'
);

const healthByModule = {
  lists: { status: 'ready', count: 12, reason: 'Lists passed local validation.' },
  paths: { status: 'warning', count: 3, reason: 'Paths has a validation warning.' },
  groups: { status: 'blocked', reason: 'Groups has invalid local data.' },
  avisa: { status: 'missing', reason: 'No AHAavisa dataset was found.' },
  chat: { status: 'empty', count: 0, reason: 'Chat has no local items.' },
  insights: { status: 'unknown', reason: 'No read-only health source is available.' }
};
context.AHAModules.renderMenu({ healthByModule });

for (const moduleId of ['lists', 'paths', 'groups', 'avisa']) {
  assert.ok(mount.innerHTML.includes(`data-module="${moduleId}"`), `${moduleId} should render in the module menu`);
}
for (const status of ['ready', 'warning', 'blocked', 'empty', 'missing', 'unknown']) {
  assert.ok(mount.innerHTML.includes(`aha-module-health-${status}`), `${status} badge should render`);
}
assert.ok(mount.innerHTML.includes('aha-module-health-count'), 'safe module counts should render in badges');
assert.ok(mount.innerHTML.includes('>12</span>'), 'Lists count should render');
assert.ok(mount.innerHTML.includes('title="Lists passed local validation."'), 'badge reason should render as a title');
assert.ok(mount.innerHTML.includes('aria-label="Lists: Ready, 12. Lists passed local validation."'), 'badge should expose status, count and reason accessibly');

assert.ok(dashboardCode.includes('buildAhaSyncDryRunPlan().forEach'), 'Home badges should reuse the existing read-only Sync Hub plan');
assert.ok(dashboardCode.includes('status: "blocked"'), 'Sync Hub validation errors should map to blocked module health');
assert.ok(dashboardCode.includes('health?.status === "blocked"'), 'active blockers summary should include blocked modules');
assert.ok(dashboardCode.includes('Module status at a glance in the app menu.'), 'dashboard readiness details should point to the compact module menu');
assert.ok(dashboardCss.includes('.aha-module-health-badge'), 'compact module badge styling should exist');
assert.equal(modulesCode.includes('localStorage'), false, 'module menu rendering must not read or write localStorage directly');
assert.equal(/AHARepository|supabase|createClient|syncFromDatabase|autoSync/.test(modulesCode), false, 'module menu renderer must not introduce sync or database behavior');

for (const file of ['js/ahaLists.js', 'js/ahaPaths.js', 'js/ahaGroups.js', 'js/ahaAvisa.js']) {
  assert.equal(indexCode.includes(file), false, `Home must not load ${file}`);
  assert.equal(dashboardCode.includes(file), false, `dashboard must not import ${file}`);
  assert.equal(modulesCode.includes(file), false, `module menu must not import ${file}`);
}

console.log('aha-module-health-menu.test.cjs passed');
