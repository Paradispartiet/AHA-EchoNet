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
const forbiddenNames = /(?:^\.|\.local(?:\.|$)|\.secret(?:\.|$)|^(?:secrets?|credentials?)(?:\.|$))/i;
const forbiddenDirs = new Set(["node_modules", "test", "tests", "__tests__", "fixtures"]);
const copied = [];

async function maybeCopy(source, relative, allowRoot = false) {
  const name = path.basename(relative);
  const ext = path.extname(name).toLowerCase();
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
  "index.html", "feed.html", "insta.html",
  "js/ahaConfig.js", "js/ahaFeed.js", "css/aha-dashboard.css"
];
const missing = required.filter(file => !copied.includes(file));
if (missing.length) throw new Error("Cloudflare preview missing required frontend assets: " + missing.join(", "));

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
console.log("Cloudflare staging static build: " + copied.length + " public frontend assets.");
console.log("Excluded: server, backend, SQL, workflows, secrets, docs, source tests.");
