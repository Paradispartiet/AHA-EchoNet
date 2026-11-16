// Offline guard for AHA Cloudflare's static preview bundle.
// No external requests, credentials, accounts, browser sessions or user data.
import { readFile, stat, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = path.join(root, ".cloudflare-preview-dist");
const criticalPages = {
  "index.html": ["id=\"aha-home-main\""],
  "chat.html": ["id=\"msg\"", "id=\"btn-send\""],
  "feed.html": ["id=\"feed-form\"", "id=\"feed-text\"", "id=\"feed-list\""],
  "insta.html": ["id=\"insta-profile-card\"", "id=\"insta-form\""],
  "auth-callback.html": ["id=\"auth-callback-status\""]
};
const requiredScripts = [
  "js/ahaConfig.js",
  "js/ahaAuth.js",
  "js/ahaFeed.js",
  "js/ahaInsta.js",
  "js/ahaChatInsightPipeline.js"
];
const disallowedPaths = [
  "server.js", "package.json", "package-lock.json",
  ".env", ".git", ".github", "backend", "supabase",
  "tests", "scripts", "docs", "node_modules"
];
const errors = [];
let checkedAssets = 0;

// Cost lockdown is enforced without talking to Azure or any remote provider.
// AHA's former Azure canonical pilot is disabled after unexpected charges.
// Do not allow preview publication if repository policy accidentally reactivates it.
const costHoldPolicy = path.join(root, "ops/canonical-sync-production-rollout-v1.json");
try {
  const policy = JSON.parse(await readFile(costHoldPolicy, "utf8"));
  const required = {
    "status": policy.status === "cost_hold_remote_disabled",
    "productionActivationEnabled": policy.productionActivationEnabled === false,
    "frontend.remoteProductionSyncAllowed": policy.frontend?.remoteProductionSyncAllowed === false,
    "frontend.egressCostHoldActive": policy.frontend?.egressCostHoldActive === true,
    "frontend.automaticSync": policy.frontend?.automaticSync === false,
    "frontend.loginTriggeredSync": policy.frontend?.loginTriggeredSync === false,
    "frontend.authReadyTriggeredSync": policy.frontend?.authReadyTriggeredSync === false,
    "frontend.backgroundSync": policy.frontend?.backgroundSync === false
  };
  for (const [key, ok] of Object.entries(required)) {
    if (!ok) errors.push("Azure cost hold must remain locked: " + key);
  }
} catch (err) {
  errors.push("Azure cost hold policy missing/unreadable: " + (err?.message || String(err)));
}

async function exists(filename) {
  try { await stat(path.join(dist, filename)); return true; }
  catch (err) { if (err?.code === "ENOENT") return false; throw err; }
}
async function requireFile(filename) {
  if (!(await exists(filename))) errors.push("Missing: " + filename);
}
function getAttr(tag, name) {
  return tag.match(new RegExp("\\b" + name + "\\s*=\\s*([\\\"'])(.*?)\\1", "i"))?.[2] || "";
}
async function checkLocalReference(page, raw) {
  if (!raw || /^(?:https?:|data:|blob:|mailto:|javascript:|#|\/\/)/i.test(raw)) return;
  const rawPath = raw.split(/[?#]/, 1)[0];
  if (!rawPath) return;
  let decoded;
  try { decoded = decodeURIComponent(rawPath); }
  catch { errors.push(page + ": invalid URL encoding in " + raw); return; }
  const normalized = path.posix.normalize(
    decoded.startsWith("/") ? decoded.slice(1) : path.posix.join(path.posix.dirname(page), decoded)
  );
  if (normalized === ".." || normalized.startsWith("../")) {
    errors.push(page + ": asset escapes preview root: " + raw);
    return;
  }
  if (!(await exists(normalized))) errors.push(page + ": missing local asset " + normalized);
  else checkedAssets++;
}

for (const filename of disallowedPaths) {
  if (await exists(filename)) errors.push("Non-frontend file included: " + filename);
}
if (await exists("canonical-sync-production-pilot.html")) {
  errors.push("Disabled Azure production pilot page must not ship in Cloudflare preview.");
}
for (const filename of requiredScripts) await requireFile(filename);

for (const [filename, identifiers] of Object.entries(criticalPages)) {
  if (!(await exists(filename))) {
    errors.push("Missing essential page: " + filename);
    continue;
  }
  const html = await readFile(path.join(dist, filename), "utf8");
  for (const identifier of identifiers) {
    if (!html.includes(identifier)) errors.push(filename + ": missing UI anchor " + identifier);
  }
  // Check only directly loaded scripts and stylesheet/manifest/icon assets:
  // navigational links and runtime API URLs are intentionally not crawled.
  for (const match of html.matchAll(/<script\b[^>]*>/gi)) {
    await checkLocalReference(filename, getAttr(match[0], "src"));
  }
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/^(?:stylesheet|icon|shortcut icon|manifest)$/i.test(getAttr(tag, "rel"))) continue;
    await checkLocalReference(filename, getAttr(tag, "href"));
  }
}

const headers = await readFile(path.join(dist, "_headers"), "utf8").catch(() => "");
if (!/X-Robots-Tag:\s*noindex/i.test(headers)) errors.push("Preview _headers missing X-Robots-Tag: noindex");
const robots = await readFile(path.join(dist, "robots.txt"), "utf8").catch(() => "");
if (!/Disallow:\s*\//i.test(robots)) errors.push("Preview robots.txt missing Disallow: /");

if (errors.length) {
  console.error("Cloudflare preview check FAILED:\n" + errors.map(e => " - " + e).join("\n"));
  process.exitCode = 1;
} else {
  const files = await readdir(dist);
  console.log("Cloudflare preview check OK.");
  console.log(Object.keys(criticalPages).length + " essential pages, " + checkedAssets + " local asset references, " + files.length + " root entries.");
  console.log("Not covered: Cloudflare Access policy, CORS/OAuth, AI calls, real iPad interactions or backend sync.");
}
