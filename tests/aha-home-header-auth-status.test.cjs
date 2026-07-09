const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('index.html', 'utf8');
const dashboardJs = fs.readFileSync('js/ahaDashboard.js', 'utf8');

const header = html.match(/<header class="aha-fixed-header"[\s\S]*?<\/header>/)?.[0] || '';
assert.ok(header, 'fixed home header should exist');
assert.equal((header.match(/id="aha-header-status"/g) || []).length, 0, 'loose header auth status chip should be removed');
assert.equal((header.match(/id="aha-auth-status"/g) || []).length, 0, 'hidden duplicate auth status text should not remain in header');
assert.equal((header.match(/Ikke innlogget/g) || []).length, 1, 'signed-out text should only appear once in the header fallback');
assert.ok(header.includes('<strong id="aha-profile-name">Din AHA-profil</strong>'), 'profile label should remain in profile section');
assert.ok(header.includes('<strong id="aha-profile-id">Ikke innlogget</strong>'), 'signed-out status should remain inside profile section');
assert.equal(header.includes('<span>AHA-ID</span><strong id="aha-profile-id">Ikke innlogget</strong>'), false, 'AHA-ID label should not be shown without an id');
assert.match(dashboardJs, /const profileTitle = "Din AHA-profil";/, 'runtime should keep the compact profile title');
assert.match(dashboardJs, /signedIn \? `AHA-ID \$\{shortId\(user\.id\)\}` : "Ikke innlogget"/, 'runtime should only add AHA-ID when signed in');

console.log('aha-home-header-auth-status passed');
