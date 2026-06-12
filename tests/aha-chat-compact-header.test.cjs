const assert = require('assert');
const fs = require('fs');

const chat = fs.readFileSync('chat.html', 'utf8');
const css = fs.readFileSync('css/aha-chat.css', 'utf8');
const header = chat.match(/<header class="chat-header"[\s\S]*?<\/header>/)?.[0] || '';

assert.ok(header, 'chat should render the AHA chat header');
assert.equal(header.includes('chat-header-top'), false, 'header should not retain a separate top row');
assert.equal(header.includes('chat-header-main'), false, 'header should not retain a separate main row');
assert.ok(header.includes('class="back-link" href="index.html"'), 'AHA Home should remain linked');
assert.ok(header.includes('class="chat-brand" href="index.html"'), 'AHA identity should remain linked');
assert.ok(header.includes('<h1>AHA Chat</h1>'), 'chat title should remain visible');
assert.ok(header.includes('class="status-pill">Klar</span>'), 'ready status should remain visible');
assert.ok(header.includes('id="aha-chat-profile-name"'), 'profile name binding should remain intact');
assert.ok(header.includes('id="aha-chat-auth-status"'), 'profile mode binding should remain intact');
assert.ok(header.includes('id="aha-chat-profile-id"'), 'profile id binding should remain intact');
assert.ok(header.includes('class="profile-indicator" href="profile.html"'), 'Min AHA should link to the profile page');

assert.match(css, /\.chat-header\s*\{[^}]*display:flex;[^}]*align-items:center;[^}]*justify-content:space-between;/, 'chat header should be a single flex row');
assert.match(css, /\.chat-header\s*\{[^}]*padding:\s*8px 12px;/, 'desktop header padding should stay compact');
assert.match(css, /\.chat-title-wrap h1\s*\{[^}]*font-size:17px;/, 'header title should use the compact size');
assert.match(css, /\.chat-profile-card\s*\{[^}]*flex:0 1 226px;[^}]*padding:5px 8px;/, 'profile card should be low and horizontally compact');
assert.equal(css.includes('.chat-header-main {'), false, 'obsolete multi-row header layout should be removed');
assert.equal(css.includes('.chat-header-meta {'), false, 'obsolete header meta wrapper layout should be removed');
assert.match(css, /@media \(max-width: 1024px\)[\s\S]*?\.chat-title-wrap p\s*\{\s*display:none;/, 'tablet layout should hide the subtitle instead of stacking the header');
assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.chat-header\s*\{[^}]*overflow-x:auto;/, 'small screens should preserve a compact row without creating a hero header');
assert.equal((css.match(/\.chat-title-wrap h1\s*\{/g) || []).length, 2, 'mobile title sizing should not be overridden by a legacy rule');

console.log('aha-chat-compact-header.test.cjs passed');
