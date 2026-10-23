// Contract for the AHA user journey. No network, accounts or fixture writes.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const nav = read("js/ahaGlobalNav.js");
const navCss = read("css/aha-global-nav.css");
const modules = read("js/ahaModules.js");

const workMenu = nav.slice(nav.indexOf('id: "work"'), nav.indexOf('id: "organize"'));
assert.match(workMenu, /moduleId:\s*"personal-ai"/, "Compact Mer menu must expose Personal AI");
const organizeMenu = nav.slice(nav.indexOf('id: "organize"'), nav.indexOf('id: "create"'));
assert.match(organizeMenu, /moduleId:\s*"search"/, "Compact Mer menu must expose Library");
assert.match(modules, /id:\s*"personal-ai"/, "Personal AI must remain a real module");
assert.match(navCss, /\[data-primary="personal-ai"\][^{]*\{\s*display:\s*none;/, "Personal AI is deliberately hidden from narrow top nav; menu fallback is required");

const routes = ["index.html", "chat.html", "friend-chat.html", "search.html", "personal-ai.html", "profile.html", "insights.html"];
for (const file of routes) {
  const html = read(file);
  assert.match(html, /id="aha-global-nav"/, file + " must mount canonical navigation");
  assert.match(html, /<script src="js\/ahaModules\.js"><\/script>/, file + " must load module registry");
  assert.match(html, /<script src="js\/ahaGlobalNav\.js"><\/script>/, file + " must load global nav");
}

const aiChat = read("chat.html");
const friendChat = read("friend-chat.html");
const personalAI = read("personal-ai.html");
const insights = read("insights.html");

assert.match(aiChat, /id="msg"/, "AI chat composer must remain available");
assert.match(aiChat, /src="js\/ahaChat\.js"/, "Do not replace the existing AI chat");
assert.doesNotMatch(aiChat, /src="js\/ahaFriendChat\.js"/, "Do not initialize human chat in AI chat");
assert.match(friendChat, /src="js\/ahaFriendChat\.js"/, "Friends use their separate messenger");
assert.doesNotMatch(friendChat, /src="js\/ahaChat\.js"/, "Human conversations must not feed AI chat");
assert.doesNotMatch(friendChat, /class="aha-mobile-nav"/, "Remove obsolete duplicate mobile navigation");
assert.match(friendChat, /href="friend-chat\.html" aria-current="page"/, "Human-chat mode must be selected");
assert.match(friendChat, /Meldingene sendes ikke til AHA-AI/, "Human chat privacy notice must remain");
assert.match(personalAI, /id="personal-ai-experience"/, "Personal AI readiness surface must remain");
assert.match(insights, /id="insights-search"/, "Insight search must remain available");

console.log("AHA product journey contract: canonical navigation, phone discovery, AI/human chat separation and personal insights OK");
