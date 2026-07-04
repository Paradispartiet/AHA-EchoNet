const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const modulesCode = fs.readFileSync('js/ahaModules.js', 'utf8');
const dashboardCss = fs.readFileSync('css/aha-dashboard.css', 'utf8');

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

const modules = context.AHA_MODULES;
assert.ok(Array.isArray(modules) && modules.length > 0, 'module catalog should exist');

// Every module must expose relevant, module-specific content, not just a title.
for (const module of modules) {
  assert.ok(
    typeof module.description === 'string' && module.description.trim().length > 0,
    `${module.id} must ship a relevant description for its Home tile`
  );
  assert.ok(
    typeof module.type === 'string' && module.type.trim().length > 0,
    `${module.id} must declare a type for its Home tile accent`
  );
  assert.ok(
    context.AHAModules.typeLabels[module.type],
    `${module.id} type "${module.type}" must map to a human-readable tag label`
  );
}

context.AHAModules.renderMenu({
  healthByModule: {
    chat: { status: 'ready', count: 4, reason: 'Chat has 4 available local items.' }
  }
});

const html = mount.innerHTML;

// Relevant content: the description renders on the tile.
assert.ok(html.includes('aha-module-summary'), 'tiles should render a module summary line');
const chat = modules.find((m) => m.id === 'chat');
assert.ok(
  html.includes(chat.description),
  'the chat tile should render its relevant description text'
);

// Design/stats: a type tag with a per-type accent hook renders next to the health badge.
assert.ok(html.includes('aha-module-tags'), 'tiles should group the type tag and health badge');
assert.ok(html.includes('aha-module-type-tag'), 'tiles should render a module type tag');
assert.ok(html.includes('data-module-type="core"'), 'chat tile should expose its type for accent styling');
assert.ok(html.includes('data-module-type="personal"'), 'personal modules should expose their type for accent styling');
assert.ok(html.includes('>Kjerne<'), 'the core type label should render in Norwegian');

// The health badge (stats) must still render alongside the new content.
assert.ok(html.includes('aha-module-health-ready'), 'ready health badge should still render');
assert.ok(html.includes('>4</span>'), 'the live item count should still render as a stat');

// Styling hooks for the new content must exist.
assert.ok(dashboardCss.includes('.aha-tile .aha-module-summary'), 'summary styling should exist');
assert.ok(dashboardCss.includes('.aha-module-type-tag'), 'type tag styling should exist');
assert.ok(
  dashboardCss.includes('.aha-tile[data-module-type="personal"]'),
  'per-type accent styling should exist'
);

// Guardrails: the menu renderer stays presentational (no storage/sync/database).
assert.equal(modulesCode.includes('localStorage'), false, 'module content display must not read or write localStorage');
assert.equal(
  /AHARepository|supabase|createClient|syncFromDatabase|autoSync/.test(modulesCode),
  false,
  'module content display must not introduce sync or database behavior'
);

console.log('aha-module-content-display.test.cjs passed');
