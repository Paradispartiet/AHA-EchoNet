// Build a Cloudflare Pages preview of AHA's static frontend only.
// Never upload the repository root: it also contains backend, CI and SQL.
import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const out = path.join(root, ".cloudflare-preview-dist");

const frontendDirs = [
  "js", "css", "assets", "images", "img", "icons", "fonts",
  "media", "static", "vendor", "components", "data", "locales", "i18n", "public"
];
const safeExtensions = new Set([
  ".html", ".htm", ".css", ".js", ".mjs", ".json", ".webmanifest",
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".avif", ".ico",
  ".woff", ".woff2", ".ttf", ".otf", ".wasm", ".mp3", ".m4a",
  ".ogg", ".wav", ".mp4", ".webm", ".vtt", ".txt", ".pdf"
]);
const rootStaticExtensions = new Set([
  ".html", ".htm", ".css", ".png", ".jpg", ".jpeg", ".gif",
  ".svg", ".webp", ".avif", ".ico", ".webmanifest",
  ".woff", ".woff2", ".ttf", ".otf", ".mp3", ".m4a", ".ogg",
  ".wav", ".mp4", ".webm", ".vtt"
]);
const rootStaticNames = new Set([
  "manifest.json", "site.webmanifest", "sw.js", "service-worker.js"
]);
const disabledProductionPages = new Set([
  "canonical-sync-production-pilot.html"
]);
const forbiddenNames = /(?:^\.|\.local(?:\.|$)|\.secret(?:\.|$)|^(?:secrets?|credentials?)(?:\.|$))/i;
const forbiddenDirs = new Set(["node_modules", "test", "tests", "__tests__", "fixtures"]);
const copied = [];

async function maybeCopy(source, relative, allowRoot = false) {
  const name = path.basename(relative);
  const ext = path.extname(name).toLowerCase();
  if (disabledProductionPages.has(relative.split(path.sep).join("/"))) return;
  if (forbiddenNames.test(name)) return;
  if (allowRoot
    ? !(rootStaticExtensions.has(ext) || rootStaticNames.has(name))
    : !safeExtensions.has(ext)) return;
  const dest = path.join(out, relative);
  await mkdir(path.dirname(dest), { recursive: true });
  await copyFile(source, dest);
  copied.push(relative.split(path.sep).join("/"));
}

async function copyTree(relative) {
  const source = path.join(root, relative);
  let entries;
  try { entries = await readdir(source, { withFileTypes: true }); }
  catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || forbiddenNames.test(entry.name)) continue;
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      if (!forbiddenDirs.has(entry.name)) await copyTree(child);
    } else if (entry.isFile()) {
      await maybeCopy(path.join(root, child), child);
    }
    // Symlinks are never followed into deployment output.
  }
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

for (const entry of await readdir(root, { withFileTypes: true })) {
  if (entry.isFile()) await maybeCopy(path.join(root, entry.name), entry.name, true);
}
for (const dir of frontendDirs) await copyTree(dir);

const required = [
  "index.html", "chat.html", "feed.html", "insta.html", "auth-callback.html",
  "js/ahaConfig.js", "js/ahaAuth.js", "js/ahaFeed.js", "js/ahaInsta.js",
  "js/ahaChatInsightPipeline.js", "css/aha-dashboard.css"
];
const missing = required.filter(file => !copied.includes(file));
if (missing.length) throw new Error("Cloudflare preview missing required frontend assets: " + missing.join(", "));

// The original chamber source is covered by historical production proof hashes.
// Never change it for preview. Block automatic legacy pull/push only in the
// copied Cloudflare bundle, so login tests cannot overwrite private local data.
const chamberSourceMarker = "  let syncDisabled = false;";
const chamberPreviewMarker = "  let syncDisabled = true; // AHA_CLOUDFLARE_PREVIEW_NO_CHAMBER_SYNC";
const chamberBundle = path.join(out, "js/ahaChamberSync.js");
if (!copied.includes("js/ahaChamberSync.js")) {
  throw new Error("Cloudflare preview missing legacy chamber script needed for fail-closed bundling.");
}
const chamberSource = await readFile(chamberBundle, "utf8");
if (!chamberSource.includes(chamberSourceMarker)) {
  throw new Error("Chamber sync marker changed: fail closed before Cloudflare deploy.");
}
await writeFile(chamberBundle, chamberSource.replace(chamberSourceMarker, chamberPreviewMarker));

// Auth was still upserting aha_profiles automatically after every login and
// during PKCE callbacks. Until AHA DB-03's hosted RLS/grants are inspected,
// preview sign-in must remain read-only apart from Supabase Auth session state.
// Patch ONLY the copied Cloudflare assets. Original GitHub Pages remains intact.
async function replacePreviewOnly(relative, replacements) {
  if (!copied.includes(relative)) throw new Error("Cloudflare preview missing " + relative);
  const target = path.join(out, relative);
  let source = await readFile(target, "utf8");
  for (const { from, to } of replacements) {
    const parts = source.split(from);
    if (parts.length !== 2) {
      throw new Error("Fail-closed preview Auth marker changed in " + relative);
    }
    source = parts.join(to);
  }
  await writeFile(target, source);
}

await replacePreviewOnly("js/ahaAuth.js", [
  {
    from: "    const existing = await loadProfile(user);",
    to: "    const existing = await loadProfile(user);\n    if (true) return existing; // AHA_CLOUDFLARE_PREVIEW_AUTH_PROFILE_READ_ONLY"
  },
  {
    from: "  async function saveProfileName(displayName) {",
    to: "  async function saveProfileName(displayName) {\n    return { ok: false, reason: \"preview_read_only\" }; // AHA_CLOUDFLARE_PREVIEW_NO_PROFILE_NAME_WRITE"
  }
]);

await replacePreviewOnly("js/ahaAuthCallback.js", [
  {
    from: "    if (!session?.user?.id) return { ok: false, reason: \"missing_user\" };",
    to: "    if (!session?.user?.id) return { ok: false, reason: \"missing_user\" };\n    if (true) {\n      // AHA_CLOUDFLARE_PREVIEW_CALLBACK_READ_ONLY: no fallback profile upsert.\n      const readProfile = global.AHAAuth?.loadProfile;\n      return typeof readProfile === \"function\"\n        ? await readProfile(session.user)\n        : { ok: false, reason: \"preview_read_only\" };\n    }"
  }
]);

// Lock down ALL PostgREST data writes in the Cloudflare preview copy.
// Protects AHARepository, Feed, Sources, Embeddings and other callers that
// access AHADb.getClient(). Auth is intentionally left operational.
const readOnlyPreviewSource = await readFile(
  path.join(root, "js/ahaPreviewDataApiReadOnly.js"), "utf8"
);
if (!readOnlyPreviewSource.includes("AHA_CLOUDFLARE_PREVIEW_DATA_API_READ_ONLY")) {
  throw new Error("Cloudflare Data API read-only module is missing its marker.");
}
const previewDbPath = path.join(out, "js/ahaDb.js");
if (!copied.includes("js/ahaDb.js")) {
  throw new Error("Cloudflare preview missing database client bootstrap.");
}
const previewDbSource = await readFile(previewDbPath, "utf8");
if (!previewDbSource.includes("  global.AHADb = {") ||
    previewDbSource.includes("AHA_CLOUDFLARE_PREVIEW_DATA_API_READ_ONLY")) {
  throw new Error("Unexpected Supabase client bootstrap: fail closed.");
}
await writeFile(previewDbPath, previewDbSource + "\n" + readOnlyPreviewSource);

const sha = process.env.AHA_BUILD_SHA || process.env.GITHUB_SHA;
if (sha) {
  if (!/^[a-f0-9]{40}$/i.test(sha)) throw new Error("AHA_BUILD_SHA must be a 40-character commit SHA.");
  const target = path.join(out, "js/ahaChatInsightPipeline.js");
  const source = await readFile(target, "utf8");
  const marker = 'global.AHA_FRONTEND_BUILD_SHA = global.AHA_FRONTEND_BUILD_SHA || "local"; // AHA_FRONTEND_REVISION_STAMP';
  if (!source.includes(marker)) throw new Error("Frontend revision marker changed; update Cloudflare builder before deploying.");
  await writeFile(target, source.replace(marker, 'global.AHA_FRONTEND_BUILD_SHA = "' + sha + '"; // AHA_FRONTEND_REVISION_STAMP'));
}

await writeFile(path.join(out, "robots.txt"), "User-agent: *\nDisallow: /\n");
await writeFile(
  path.join(out, "_headers"),
  "/*\n  X-Robots-Tag: noindex, nofollow, noarchive\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n"
);
console.log("Cloudflare staging static build: " + copied.length + " public frontend assets.");
console.log("Excluded: server, backend, SQL, workflows, secrets, docs, source tests.");
