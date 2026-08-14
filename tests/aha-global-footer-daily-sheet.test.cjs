const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const read = (file) => fs.readFileSync(file, 'utf8');
const nav = read('js/ahaGlobalNav.js');
const css = read('css/aha-global-nav.css');
const home = read('index.html');
const chat = read('chat.html');
const workbench = read('knowledge-workbench.html');

assert.match(nav, /renderGlobalFooter\(activeFile\)/, 'the shared nav render must mount the footer on every AHA page');
assert.match(nav, /id="aha-global-footer"/);
assert.match(nav, /id="aha-global-footer-profile"/);
assert.match(nav, /id="aha-global-footer-daily-toggle"[^>]*aria-controls="aha-global-daily-sheet"/);
assert.match(nav, /id="aha-global-daily-sheet" hidden/);
assert.match(nav, /role="dialog" aria-modal="true"/);
assert.match(nav, /data-aha-global-daily-close/);
assert.match(nav, /event\.key === "Escape"/);
assert.match(nav, /buildDailyLoopStatus\?\.\(\{ save: false, lightweight: true \}\)/, 'global footer must read Daily Loop without creating a saved refresh');
assert.match(nav, /script\.src = "js\/ahaDailyOperatingLoop\.js"/, 'pages without a Daily Loop script must receive the shared module');
assert.match(nav, /aha_pending_chat_prompt_v1/, 'Daily suggestions should use the existing Chat handoff key');
assert.doesNotMatch(nav, /fetch\(|AHARepository|AHAChamberSync/, 'the global footer must not add backend or sync behavior');

assert.match(css, /\.aha-global-footer\s*\{[^}]*position:\s*fixed;[^}]*bottom:\s*0;/s);
assert.match(css, /\.aha-global-nav\s*\{[^}]*position:\s*fixed;[^}]*top:\s*0;[^}]*right:\s*0;[^}]*left:\s*0;/s, 'the shared header must stay fixed across AHA');
assert.match(css, /body\.aha-product-shell\s*\{[^}]*padding-top:\s*calc\(var\(--aha-global-header-height\) \+ env\(safe-area-inset-top\)\);[^}]*padding-bottom:\s*calc\(var\(--aha-global-footer-height\) \+ env\(safe-area-inset-bottom\)\)/s);
assert.match(css, /body\.aha-route-index \.aha-fixed-header\s*\{[^}]*position:\s*fixed;/s, 'Home header must use the same fixed contract');
assert.match(css, /\.aha-global-footer\s*\{[^}]*padding:\s*0;[^}]*background:/s, 'footer must touch the viewport edge without outer air');
assert.match(css, /\.aha-global-footer-inner\s*\{[^}]*width:\s*100%;[^}]*margin:\s*0;[^}]*padding:\s*0 env\(safe-area-inset-right\) env\(safe-area-inset-bottom\) env\(safe-area-inset-left\);[^}]*border-radius:\s*0;/s, 'footer must span the full page width and carry safe area inside its background');
assert.match(css, /\.aha-global-daily-sheet\s*\{[^}]*min-height:\s*100dvh;/s);
assert.match(css, /\.aha-global-daily-panel\s*\{[^}]*max-height:\s*min\(74dvh, 720px\);/s);
assert.match(css, /body\.aha-product-shell \.aha-mobile-nav,[\s\S]*\.aha-header-profile,[\s\S]*\.chat-profile-card\s*\{ display: none !important; \}/);
assert.match(css, /@media \(pointer: coarse\)[\s\S]*\.aha-global-footer-action,[\s\S]*min-height: 44px;/);

assert.doesNotMatch(home, /aha-home-app-card-daily|aha-local-home-daily-loop|aha-local-home-next-action/, 'Home must not retain a large Daily Loop card');
assert.doesNotMatch(chat, /aha-chat-daily-loop|chat-profile-card/, 'Chat must not retain local Daily Loop or profile cards');
assert.doesNotMatch(workbench, /workbench-daily-loop/, 'Workbench must use the same global Daily Loop sheet');

const allGlobalPages = fs.readdirSync('.').filter((file) => file.endsWith('.html') && read(file).includes('id="aha-global-nav"'));
assert.ok(allGlobalPages.length >= 20, 'the shared shell should cover the full AHA product');
for (const page of allGlobalPages) {
  const html = read(page);
  assert.match(html, /js\/ahaGlobalNav\.js/, `${page} must load the footer through the shared nav`);
  assert.match(html, /css\/aha-global-nav\.css/, `${page} must load global footer styles`);
}

const storage = new Map([['aha_profile_id', 'profile_1'], ['aha_profile_name', 'Mari']]);
const window = {
  document: { readyState: 'loading', addEventListener() {} },
  localStorage: { getItem: (key) => storage.get(key) || null },
  location: { pathname: '/chat.html' }
};
window.window = window;
vm.runInNewContext(nav, { window }, { filename: 'js/ahaGlobalNav.js' });
assert.deepEqual(
  JSON.parse(JSON.stringify(window.AHAGlobalNav.profileState())),
  { signedIn: true, label: 'Mari', initial: 'M' }
);

console.log(`aha-global-footer-daily-sheet.test.cjs passed (${allGlobalPages.length} pages)`);
