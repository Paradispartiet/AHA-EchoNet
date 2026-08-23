#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const bridgePath = path.join(root, "data/integrations/history-go-fagverk-bridge.v2.json");
const indexPath = path.join(root, "data/integrations/runtime/history-go-fagverk-canonical-index.v2.json");
const mode = process.argv.includes("--write") ? "write" : process.argv.includes("--check") ? "check" : "";
if (!mode) throw new Error("Use --write or --check.");

function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function sha256(text) { return crypto.createHash("sha256").update(text, "utf8").digest("hex"); }
function normalize(value) { return String(value || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim(); }
function unique(values) {
  const seen = new Set();
  return values.map((value) => String(value || "").trim()).filter((value) => { const key = normalize(value); if (!key || seen.has(key)) return false; seen.add(key); return true; });
}
const STOP = new Set(["data","fagverk","json","og","eller","med","for","til","fra","som","chapter","module"]);
function pathTerms(value) {
  const base = path.posix.basename(String(value || ""), ".json").replace(/^\d+[-_]?/, "").replace(/[_-]+/g, " ").trim();
  if (!base) return [];
  return unique([base, ...base.split(" ").filter((term) => term.length >= 4 && !STOP.has(normalize(term)))]);
}
function chapterTerms(chapter) {
  const out = [];
  pathTerms(chapter?.id).forEach((term) => out.push(term));
  pathTerms(chapter?.source_path).forEach((term) => out.push(term));
  for (const moduleFile of chapter?.moduleFiles || []) pathTerms(moduleFile).forEach((term) => out.push(term));
  const objectives = Array.isArray(chapter?.learningObjectives) ? chapter.learningObjectives : [];
  for (const objective of objectives) {
    const words = normalize(objective).split(" ").filter((term) => term.length >= 8 && !STOP.has(term));
    out.push(...words);
  }
  return unique(out).slice(0, 80);
}

const bridge = readJson(bridgePath);
const index = readJson(indexPath);
if (bridge.schema !== "aha_history_go_fagverk_bridge_v2" || index.schema !== "aha_history_go_fagverk_canonical_index_v2") throw new Error("Canonical bridge/index missing.");
if (index.canonical_source?.source_ref !== bridge.canonical_source?.source_ref) throw new Error("Canonical source-ref mismatch.");
const base = `https://raw.githubusercontent.com/${bridge.canonical_source.repository}/${bridge.canonical_source.source_ref}/`;

async function fetchChapter(sourcePath) {
  if (!/^data\/fagverk\/.+\.json$/u.test(String(sourcePath || ""))) return null;
  const response = await fetch(`${base}${sourcePath}`, { headers: { "user-agent": "AHA-Fagverk-Bridge-V2" } });
  if (!response.ok) throw new Error(`${sourcePath}: HTTP ${response.status}`);
  const text = await response.text();
  return { data: JSON.parse(text), digest: sha256(text) };
}

const next = structuredClone(index);
let enriched = 0;
for (const subject of next.subjects || []) {
  const chapters = subject.chapters || [];
  const assets = await Promise.all(chapters.map((chapter) => fetchChapter(chapter.source_path)));
  chapters.forEach((chapter, idx) => {
    const asset = assets[idx];
    if (!asset) return;
    const source = asset.data || {};
    chapter.semantic_terms = unique([...(chapter.semantic_terms || []), ...chapterTerms({ ...source, id: chapter.chapter_id, source_path: chapter.source_path })]);
    chapter.chapter_transport_sha256 = asset.digest;
    enriched += 1;
  });
}
next.summary = { ...(next.summary || {}), enriched_chapter_count: enriched };
const serialized = `${JSON.stringify(next, null, 2)}\n`;
const current = fs.readFileSync(indexPath, "utf8");
if (mode === "write") {
  if (serialized !== current) fs.writeFileSync(indexPath, serialized);
  console.log(`Canonical Fagverk chapter semantics: enriched ${enriched} chapters.`);
} else {
  if (serialized !== current) throw new Error("Canonical Fagverk chapter semantic enrichment drift; run --write.");
  console.log(`Canonical Fagverk chapter semantics: verified ${enriched} chapters.`);
}
