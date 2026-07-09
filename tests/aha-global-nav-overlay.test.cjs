const assert = require('assert');
const fs = require('fs');

const nav = fs.readFileSync('js/ahaGlobalNav.js', 'utf8');
const css = fs.readFileSync('css/aha-global-nav.css', 'utf8');

assert.match(nav, /<span>Moduler<\/span>/, 'Moduler button label should remain in the global nav');
assert.match(nav, /href="modules\.html">Åpne modulside<\/a>/, 'global nav should keep the module page link');
assert.match(nav, /id="aha-global-nav-overlay" hidden/, 'overlay should still render with the hidden attribute');
assert.match(nav, /const overlay = mount\.querySelector\("#aha-global-nav-overlay"\);[\s\S]*?global\.document\.body\.appendChild\(overlay\);/, 'render should move the overlay to document.body after rendering');
assert.match(nav, /function bindEvents\(mount, overlay\)/, 'event binding should use the direct overlay reference after the overlay is moved');
assert.match(nav, /function open\(\) \{[\s\S]*?overlay\.hidden = false;[\s\S]*?global\.document\.body\.classList\.add\("aha-global-nav-open"\);/, 'open should unhide the body-level overlay and keep the body open state');
assert.match(nav, /function close\(\) \{[\s\S]*?overlay\.hidden = true;[\s\S]*?global\.document\.body\.classList\.remove\("aha-global-nav-open"\);/, 'close should hide the overlay and clear the body open state');
assert.match(nav, /overlay\.querySelectorAll\("\[data-aha-global-nav-close\]"\)/, 'backdrop and close button handlers should be bound on the moved overlay');
assert.match(nav, /overlay\.addEventListener\("keydown", \(event\) => \{[\s\S]*?if \(event\.key === "Escape"\) close\(\);/, 'Escape should still close the overlay');
assert.match(css, /\.aha-global-nav-overlay\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0;[^}]*z-index:\s*1000;/, 'overlay should remain fixed fullscreen/sidepanel CSS');

console.log('aha-global-nav-overlay.test.cjs passed');
