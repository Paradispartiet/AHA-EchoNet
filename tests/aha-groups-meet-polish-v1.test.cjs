const assert = require("assert");
const fs = require("fs");

const groupsHtml = fs.readFileSync("groups.html", "utf8");
const groupsCss = fs.readFileSync("css/aha-groups.css", "utf8");
const meetHtml = fs.readFileSync("meet.html", "utf8");
const socialCss = fs.readFileSync("css/aha-social-surfaces.css", "utf8");
const groupsJs = fs.readFileSync("js/ahaGroups.js", "utf8");

for (const [name, html, pageClass] of [
  ["Groups", groupsHtml, "aha-groups-page"],
  ["Meet", meetHtml, "aha-meet-page"]
]) {
  assert.match(html, /css\/aha-social-surfaces\.css/, `${name} should load the shared social presentation layer`);
  assert.match(html, /aha-social-surface/, `${name} should use the social shell`);
  assert.match(html, new RegExp(pageClass), `${name} should expose its semantic page class`);
}

assert.match(groupsHtml, /aha-shell-workspace aha-social-surface aha-groups-page/, "Groups should use the canonical workspace shell");
assert.doesNotMatch(groupsHtml, /<main[^>]*style=["'][^"']*max-width/i, "Groups should not own its shell width inline");
assert.doesNotMatch(groupsCss, /#(?:ccd|e2e2ef|d8d8e8)\b/i, "Groups should not restore legacy light borders");
assert.match(groupsCss, /\.groups-badge,[\s\S]*?border-radius:\s*var\(--aha-radius-pill\)/, "Groups badges should use canonical pill geometry");
assert.match(groupsCss, /\.groups-report-card\s*\{[^}]*border-radius:\s*var\(--aha-radius-card\)/s, "Groups report cards should use canonical card geometry");
assert.match(groupsCss, /\.groups-card::before,[\s\S]*?background:\s*var\(--aha-color-violet\)/, "Groups cards should carry a restrained violet identity");
assert.match(groupsCss, /@media \(max-width: 720px\)[\s\S]*?\.groups-inline-form\s*\{[^}]*grid-template-columns:\s*1fr;/, "Groups inline forms should collapse on mobile");

assert.match(socialCss, /\.aha-groups-page\s*\{[^}]*aha-color-violet/s, "Groups should use the violet social accent");
assert.match(socialCss, /\.aha-meet-page\s*\{[^}]*aha-color-coral/s, "Meet should use the coral social accent");
assert.match(socialCss, /\.aha-social-surface input,[\s\S]*?background:\s*var\(--aha-color-input\)/, "social forms should use canonical dark fields");
assert.match(socialCss, /\.aha-meet-boundary-grid\s*\{[^}]*display:\s*grid;/s, "Meet boundary should use a readable responsive grid");

assert.match(meetHtml, /aha-shell-reading aha-social-surface aha-meet-page/, "Meet should keep the reading shell");
assert.match(meetHtml, /AHA Meet er foreløpig en shell/i, "Meet should continue to identify itself as a shell");
assert.match(meetHtml, /Local-only|lokalt/i, "Meet should retain local-only language");
assert.match(meetHtml, /Ingen invitasjoner|sender ikke invitasjoner/i, "Meet should retain the no-invitations boundary");
assert.match(meetHtml, /Ingen kalender|kalender.*ikke aktivert|Ingen kalenderintegrasjon/i, "Meet should retain the no-calendar boundary");
assert.match(meetHtml, /Ingen EchoNet|EchoNet.*ikke aktivert/i, "Meet should retain the no-EchoNet boundary");
assert.match(meetHtml, /Ingen backend|backend.*ikke aktivert/i, "Meet should retain the no-backend boundary");
assert.match(meetHtml, /Ingen History Go write-back|skal ikke skrive tilbake til History Go/i, "Meet should retain the no-History-Go-writeback boundary");
assert.match(meetHtml, /class="aha-meet-boundary-grid"/, "Meet should present its inactive capabilities as a structured boundary grid");

assert.match(groupsHtml, /id="groups-root"/, "Groups should preserve its runtime root");
assert.match(groupsHtml, /js\/ahaGroups\.js/, "Groups should preserve the existing Groups runtime");
assert.match(groupsHtml, /js\/ahaAvisa\.js/, "Groups should preserve its existing AHAavisa bridge");
assert.doesNotMatch(groupsJs, /aha-social-surfaces/, "Groups runtime should remain presentation-agnostic");

assert.doesNotMatch(meetHtml, /js\/ahaMeet\.js/, "Meet must not introduce a dedicated runtime");
for (const forbidden of ["fetch(", "AHARepository", "AHASyncHub", "sendInvite"]) {
  assert.equal(meetHtml.includes(forbidden), false, `Meet must not introduce runtime/API token ${forbidden}`);
}

console.log("AHA Groups/Meet polish V1 contract passed.");
