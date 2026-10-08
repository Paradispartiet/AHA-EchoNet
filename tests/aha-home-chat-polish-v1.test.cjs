const assert = require("assert");
const fs = require("fs");

const homeHtml = fs.readFileSync("index.html", "utf8");
const dashboardCss = fs.readFileSync("css/aha-dashboard.css", "utf8");
const chatCss = fs.readFileSync("css/aha-chat.css", "utf8");

for (const label of ["Innsikt", "Arbeid", "Mitt AHA"]) {
  assert.match(homeHtml, new RegExp(`<p class="eyebrow">${label}</p>`), `Home should use semantic label ${label}`);
}
assert.doesNotMatch(homeHtml, /<p class="eyebrow">[123]<\/p>/, "Home should not use prototype step numbers");

assert.match(
  dashboardCss,
  /\.aha-home-panel\s*\{[^}]*padding:\s*0;[^}]*background:\s*transparent;[^}]*border:\s*0;[^}]*box-shadow:\s*none;/s,
  "Home outer shell should not render a box around the app cards"
);
for (const [card, color] of [
  ["insight", "aha-color-blue"],
  ["work", "aha-color-violet"],
  ["mine", "aha-color-cyan"]
]) {
  assert.match(
    dashboardCss,
    new RegExp(`\\.aha-home-app-card-${card}::before\\s*\\{[^}]*${color}`, "s"),
    `Home ${card} card should have its semantic accent`
  );
}

assert.match(
  chatCss,
  /\.chat-header\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;[^}]*box-shadow:\s*none;/s,
  "Chat local header should not compete with the global product nav"
);
assert.match(
  chatCss,
  /\.composer-wrap\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;/s,
  "Chat composer should not have a second outer card shell"
);
assert.match(
  chatCss,
  /#msg\s*\{[^}]*background:\s*var\(--aha-color-input\);[^}]*border-color:\s*var\(--aha-line\);/s,
  "Chat input should use canonical black-first field styling"
);
assert.match(
  chatCss,
  /body:has\(#chat-log \.chat-line\) \.chat-hero-copy\s*\{\s*display:\s*none;/,
  "Chat intro should collapse after the conversation starts"
);
assert.match(
  chatCss,
  /\.analysis-card\s*\{[^}]*background:\s*var\(--aha-color-panel\);/s,
  "Analysis cards should use canonical black surfaces"
);
for (const [card, color] of [
  ["innsikter", "aha-color-violet"],
  ["begreper", "aha-color-cyan"],
  ["kilder", "aha-color-blue"],
  ["struktur", "aha-color-green"],
  ["etterarbeid", "aha-color-coral"]
]) {
  assert.match(
    chatCss,
    new RegExp(`data-analysis-card="${card}"[^}]*\\}[^\\n]*\\n?\\.analysis-card\\[data-analysis-card="${card}"\\] \\.analysis-card-head h3 \\{[^}]*${color}`, "s"),
    `Analysis card ${card} should use semantic color ${color}`
  );
}

console.log("AHA Home/Chat polish V1 contract passed.");
