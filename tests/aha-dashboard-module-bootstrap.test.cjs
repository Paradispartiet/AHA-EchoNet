const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'js/ahaDashboard.js'), 'utf8');

const modulesScript = index.indexOf('<script src="js/ahaModules.js"></script>');
const dashboardScript = index.indexOf('<script src="js/ahaDashboard.js"></script>');
assert.ok(modulesScript >= 0, 'index must load ahaModules.js');
assert.ok(dashboardScript > modulesScript, 'ahaModules.js must load before ahaDashboard.js');

const bindMatch = dashboard.match(/function bind\(\) \{([\s\S]*?)\n  \}/);
assert.ok(bindMatch, 'dashboard bind function should exist');
const bindBody = bindMatch[1];
const initialModuleRender = bindBody.indexOf('renderModules({});');
const asyncDashboardRender = bindBody.indexOf('renderDashboard();');
assert.ok(initialModuleRender >= 0, 'bind should mount modules synchronously');
assert.ok(
  asyncDashboardRender > initialModuleRender,
  'module cards must mount before the asynchronous dashboard refresh starts'
);

const renderDashboardMatch = dashboard.match(/async function renderDashboard\(\) \{([\s\S]*?)\n  \}\n\n  async function saveProfileName/);
assert.ok(renderDashboardMatch, 'renderDashboard function should exist');
assert.ok(
  renderDashboardMatch[1].includes('renderModules(moduleHealth);'),
  'the asynchronous dashboard refresh must retain the live-health module render'
);

console.log('aha-dashboard-module-bootstrap.test.cjs: all tests passed');
