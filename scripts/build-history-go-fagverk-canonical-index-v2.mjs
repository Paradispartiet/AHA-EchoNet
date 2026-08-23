#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const BRIDGE_PATH = "data/integrations/history-go-fagverk-bridge.v2.json";
const DEFAULT_OUTPUT = "data/integrations/runtime/history-go-fagverk-canonical-index.v2.json";
const SEMANTIC_KEY = /(?:title|label|name|term|concept|keyword|topic|theme|method|theor|thinker|framework|dimension|genre|scope|area|field|focus|foundation|chapter|files?)/iu;
const TERM_NOISE = new Set(["json", "canonical", "active", "complete", "schema", "version", "file", "files", "data", "fag"]);
const CHAPTER_TERM_NOISE = new Set(["data", "fagverk", "json", "og", "eller", "med", "for", "til", "fra", "som", "chapter", "module", "forklare", "anvende", "analysere", "vurdere", "identifisere"]);

function parseArgs(argv) {
  const out = { check: false, write: false, output: DEFAULT_OUTPUT };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--check") out.check = true;
    else if (token === "--write") out.write = true;
    else if (token === "--output") out.output = String(argv[++i] || "").trim();
    else if (token === "--help") out.help = true;
    else throw new Error(`Unknown argument: ${token}`);
  }
  if (out.check && out.write) throw new Error("Choose either --check or --write.");
  return out;
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
}
function sha256(text) { return crypto.createHash("sha256").update(text, "utf8").digest("hex"); }
function stableJson(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function unique(values) {
  const seen = new Set();
  return (Array.isArray(values) ? values : [values]).flatMap((value) => Array.isArray(value) ? value : [value]).map((value) => String(value ?? "").trim()).filter((value) => value && !seen.has(value) && seen.add(value));
}
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function normalize(value) { return String(value || "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim(); }
function rawBase(bridge) {
  const repository = String(bridge?.canonical_source?.repository || "");
  const ref = String(bridge?.canonical_source?.source_ref || "");
  if (!/^[-\w.]+\/[-\w.]+$/u.test(repository) || !/^[a-f0-9]{40}$/iu.test(ref)) throw new Error("Bridge must pin an exact History-Go commit.");
  return `https://raw.githubusercontent.com/${repository}/${ref}/`;
}
function canonicalPath(relativePath) {
  const rel = String(relativePath || "").trim();
  if (!rel) return "";
  const normalized = path.posix.normalize(path.posix.join("data/fag", rel));
  if (!normalized.startsWith("data/fag/")) throw new Error(`Canonical package path escapes data/fag: ${rel}`);
  return normalized;
}
function safeCanonicalPath(relativePath) {
  try { return canonicalPath(relativePath); } catch { return ""; }
}
async function fetchText(url, label) {
  const response = await fetch(url, { headers: { "user-agent": "AHA-Fagverk-Bridge-V2" } });
  if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`);
  return response.text();
}
async function fetchJson(url, label) {
  const text = await fetchText(url, label);
  return { text, data: JSON.parse(text), transport_digest: sha256(text) };
}
function inventoryEntries(inventory) {
  const out = [];
  for (const root of Array.isArray(inventory?.subjects) ? inventory.subjects : []) {
    if (!root?.id) continue;
    out.push({ ...root, kind: "subject", parent_subject_id: null });
    for (const specialization of Array.isArray(root.specializations) ? root.specializations : []) if (specialization?.id) out.push({ ...specialization, kind: "specialization", parent_subject_id: root.id });
  }
  return out;
}
function manifestNode(entry, manifest) {
  return entry.parent_subject_id ? object(manifest?.[entry.parent_subject_id]?.specializations?.[entry.id]) : object(manifest?.[entry.id]);
}
function arraysFrom(item, keys) { return unique(keys.flatMap((key) => Array.isArray(item?.[key]) ? item[key] : [])); }

function manifestJsonPointers(value, prefix = "") {
  const out = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => out.push(...manifestJsonPointers(item, `${prefix}[${index}]`)));
    return out;
  }
  if (!value || typeof value !== "object") return out;
  for (const [key, item] of Object.entries(value)) {
    const field = prefix ? `${prefix}.${key}` : key;
    if (typeof item === "string" && /\.json$/iu.test(item.trim())) {
      const sourcePath = safeCanonicalPath(item);
      if (sourcePath) out.push({ field, source_path: sourcePath });
    } else if (item && typeof item === "object") {
      out.push(...manifestJsonPointers(item, field));
    }
  }
  return out;
}

function pathTerms(value) {
  const base = path.posix.basename(String(value || ""), ".json").replace(/^\d+[-_]?/, "").replace(/[_-]+/g, " ").replace(/\bv\d+(?: \d+)*\b/giu, " ").replace(/\s+/g, " ").trim();
  if (!base) return [];
  const parts = base.split(" ").filter((part) => part.length >= 4 && !TERM_NOISE.has(part.toLowerCase()));
  return unique([base, ...parts]);
}

function extractSupplementTerms(data) {
  const terms = [];
  function add(value) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (!text || text.length < 3 || text.length > 160) return;
    const normalized = text.toLowerCase();
    if (TERM_NOISE.has(normalized)) return;
    terms.push(text);
  }
  function walk(value, key = "") {
    if (typeof value === "string") {
      if (/\.json$/iu.test(value.trim())) pathTerms(value).forEach(add);
      if (SEMANTIC_KEY.test(key)) add(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, key));
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [childKey, child] of Object.entries(value)) walk(child, childKey);
  }
  walk(data);
  return unique(terms);
}

function chapterSemanticTerms(chapter, sourcePath) {
  const source = object(chapter);
  const terms = [];
  pathTerms(source.id || source.chapter_id).forEach((term) => terms.push(term));
  pathTerms(sourcePath).forEach((term) => terms.push(term));
  for (const moduleFile of Array.isArray(source.moduleFiles) ? source.moduleFiles : []) pathTerms(moduleFile).forEach((term) => terms.push(term));
  for (const objective of Array.isArray(source.learningObjectives) ? source.learningObjectives : []) {
    const words = normalize(objective).split(" ").filter((term) => term.length >= 8 && !CHAPTER_TERM_NOISE.has(term));
    terms.push(...words);
  }
  return unique(terms).slice(0, 80);
}

function compactSupplement(pointer, asset, subjectId, sourceRef) {
  const data = object(asset.data);
  return {
    package_field: pointer.field,
    title: String(data.subject_title || data.title || data.name || pointer.field),
    summary: String(data.scope || data.description || data.summary || ""),
    semantic_terms: extractSupplementTerms(asset.data),
    source_path: pointer.source_path,
    transport_sha256: asset.transport_digest,
    source_ref: sourceRef,
    canonical_subject_id: subjectId
  };
}

function compactEmne(raw, subjectId, sourceRef, sourcePath, index) {
  const item = object(raw);
  const id = String(item.emne_id || item.id || item.topic_id || `canonical_${subjectId}_${index + 1}`);
  return { emne_id: id, title: String(item.title || item.name || item.label || item.short_label || id), definition: String(item.definition || item.summary || ""), why_it_matters: String(item.why_it_matters || item.description || ""), core_concepts: arraysFrom(item, ["core_concepts", "key_concepts", "sub_concepts", "concepts"]), keywords: arraysFrom(item, ["keywords", "dimensions", "analysis_axes", "conflicts", "ideological_dimensions", "tags"]), thinkers: arraysFrom(item, ["canonical_thinkers", "thinkers", "theorists"]), methods: arraysFrom(item, ["methods", "method_ids", "method_affinities"]), source_path: sourcePath, source_ref: sourceRef };
}
function compactMethod(raw, subjectId, sourceRef, sourcePath, index) {
  const item = object(raw);
  const id = String(item.method_id || item.id || `canonical_method_${subjectId}_${index + 1}`);
  return { method_id: id, title: String(item.title || item.name || item.short_label || id), short_label: String(item.short_label || ""), description: String(item.description || item.method_use_note || ""), data_forms: arraysFrom(item, ["data_forms", "coverage_domains", "question_moves", "hook_affinities"]), emne_affinities: arraysFrom(item, ["emne_affinities", "best_for_emne_kinds"]), source_path: sourcePath, source_ref: sourceRef };
}
function compactChapter(raw, subjectId, sourceRef, index, emneById, chapterAsset) {
  const chapter = object(raw);
  const id = String(chapter.id || chapter.chapter_id || `canonical_chapter_${subjectId}_${index + 1}`);
  const emneIds = unique(chapter.emne_ids || []);
  const linked = emneIds.map((emneId) => emneById.get(emneId)).filter(Boolean);
  const sourcePath = String(chapter.file || chapter.source_path || "");
  const semanticTerms = chapterSemanticTerms(chapterAsset?.data || chapter, sourcePath);
  return {
    chapter_id: id,
    title: String(chapter.title || chapterAsset?.data?.title || id),
    subtitle: String(chapter.subtitle || chapterAsset?.data?.subtitle || ""),
    primary_domain_id: String(chapter.primary_domain_id || ""),
    emne_ids: emneIds,
    core_concepts: unique([...linked.flatMap((item) => item.core_concepts || []), ...semanticTerms]),
    keywords: unique([chapter.primary_domain_id, ...linked.flatMap((item) => item.keywords || [])]),
    thinkers: unique(linked.flatMap((item) => item.thinkers || [])),
    methods: unique(linked.flatMap((item) => item.methods || [])),
    semantic_terms: semanticTerms,
    source_path: sourcePath,
    chapter_transport_sha256: String(chapterAsset?.transport_digest || ""),
    source_ref: sourceRef
  };
}

async function build() {
  const bridge = readJson(BRIDGE_PATH);
  if (bridge.schema !== "aha_history_go_fagverk_bridge_v2" || bridge.authority !== "history_go_canonical_fagverk") throw new Error("Unsupported bridge contract.");
  const base = rawBase(bridge);
  const paths = object(bridge.canonical_source.paths);
  const [releaseAsset, inventoryAsset, registryAsset, manifestAsset] = await Promise.all([
    fetchJson(`${base}${paths.release}`, "release"), fetchJson(`${base}${paths.subject_inventory}`, "subject_inventory"), fetchJson(`${base}${paths.registry}`, "registry"), fetchJson(`${base}${paths.fag_manifest}`, "fag_manifest")
  ]);
  const expected = object(bridge.expected);
  const release = releaseAsset.data;
  if (release?.schema !== "history_go_fagverk_release_v2" || release?.summary?.missing_file_count !== 0) throw new Error("Pinned History-Go release is not complete.");
  if (release.registry?.content_sha256 !== expected.registry_sha256 || release.subject_inventory?.content_sha256 !== expected.subject_inventory_sha256 || release.fag_manifest?.content_sha256 !== expected.fag_manifest_sha256) throw new Error("History-Go release and AHA bridge disagree on canonical content digests.");
  const inventory = inventoryAsset.data, registry = registryAsset.data, manifest = manifestAsset.data;
  const entries = inventoryEntries(inventory);
  const roots = entries.filter((entry) => entry.kind === "subject").length;
  const specializations = entries.filter((entry) => entry.kind === "specialization").length;
  if (roots !== Number(expected.root_subject_count) || specializations !== Number(expected.specialization_count)) throw new Error(`Subject inventory mismatch: ${roots}+${specializations}`);

  const subjects = [];
  for (const entry of entries) {
    const node = manifestNode(entry, manifest);
    const required = Array.isArray(entry.requiredManifestFields) ? entry.requiredManifestFields : [];
    const missing = required.filter((field) => !node[field]);
    if (missing.length) throw new Error(`${entry.id}: missing manifest fields ${missing.join(", ")}`);
    const emnerPath = canonicalPath(node.emner), methodsPath = canonicalPath(node.methods);
    const pointers = manifestJsonPointers(node).filter((pointer) => pointer.source_path !== emnerPath && pointer.source_path !== methodsPath);
    const dedupPointers = [...new Map(pointers.map((pointer) => [pointer.source_path, pointer])).values()];
    const [emnerAsset, methodsAsset, ...supplementAssets] = await Promise.all([
      fetchJson(`${base}${emnerPath}`, `${entry.id}.emner`),
      fetchJson(`${base}${methodsPath}`, `${entry.id}.methods`),
      ...dedupPointers.map((pointer) => fetchJson(`${base}${pointer.source_path}`, `${entry.id}.${pointer.field}`))
    ]);
    const emnerRaw = Array.isArray(emnerAsset.data) ? emnerAsset.data : Array.isArray(emnerAsset.data?.emner) ? emnerAsset.data.emner : [];
    const methodsRaw = Array.isArray(methodsAsset.data) ? methodsAsset.data : Array.isArray(methodsAsset.data?.methods) ? methodsAsset.data.methods : [];
    const registrySubject = object(registry?.subjects?.[entry.id]);
    const releaseSubject = object(release?.subjects?.[entry.id]);
    const registryChapters = Array.isArray(registrySubject.chapters) ? registrySubject.chapters : [];
    const chapterAssets = await Promise.all(registryChapters.map((chapter, chapterIndex) => {
      const sourcePath = String(chapter?.file || chapter?.source_path || "").trim();
      if (!/^data\/fagverk\/.+\.json$/u.test(sourcePath)) return null;
      return fetchJson(`${base}${sourcePath}`, `${entry.id}.chapter.${chapter?.id || chapter?.chapter_id || chapterIndex + 1}`);
    }));
    const compactedEmner = emnerRaw.map((item, index) => compactEmne(item, entry.id, bridge.canonical_source.source_ref, emnerPath, index));
    const emneById = new Map(compactedEmner.map((item) => [item.emne_id, item]));
    subjects.push({
      subject_id: entry.id,
      subject_label: String(registrySubject.title || releaseSubject.title || entry.label || entry.id),
      description: String(registrySubject.description || releaseSubject.description || ""),
      kind: entry.kind,
      parent_subject_id: entry.parent_subject_id,
      schema_family: String(entry.schemaFamily || ""),
      source_ref: bridge.canonical_source.source_ref,
      package: { emner_path: emnerPath, emner_transport_sha256: emnerAsset.transport_digest || "", methods_path: methodsPath, methods_transport_sha256: methodsAsset.transport_digest || "" },
      emner: compactedEmner,
      methods: methodsRaw.map((item, index) => compactMethod(item, entry.id, bridge.canonical_source.source_ref, methodsPath, index)),
      chapters: registryChapters.map((item, index) => compactChapter(item, entry.id, bridge.canonical_source.source_ref, index, emneById, chapterAssets[index])),
      supplements: dedupPointers.map((pointer, index) => compactSupplement(pointer, supplementAssets[index], entry.id, bridge.canonical_source.source_ref))
    });
  }

  return {
    schema: "aha_history_go_fagverk_canonical_index_v2", version: "2.2.0", authority: "derived_cache_only",
    canonical_source: { repository: bridge.canonical_source.repository, source_ref: bridge.canonical_source.source_ref, bridge_path: BRIDGE_PATH, release_path: paths.release, subject_inventory_path: paths.subject_inventory, registry_path: paths.registry, fag_manifest_path: paths.fag_manifest, registry_content_sha256: expected.registry_sha256, subject_inventory_content_sha256: expected.subject_inventory_sha256, fag_manifest_content_sha256: expected.fag_manifest_sha256, registry_transport_sha256: registryAsset.transport_digest, subject_inventory_transport_sha256: inventoryAsset.transport_digest, fag_manifest_transport_sha256: manifestAsset.transport_digest },
    summary: { root_subject_count: roots, specialization_count: specializations, subject_count: subjects.length, emne_count: subjects.reduce((sum, subject) => sum + subject.emner.length, 0), method_count: subjects.reduce((sum, subject) => sum + subject.methods.length, 0), chapter_count: subjects.reduce((sum, subject) => sum + subject.chapters.length, 0), chapter_semantic_source_count: subjects.reduce((sum, subject) => sum + subject.chapters.filter((chapter) => chapter.chapter_transport_sha256).length, 0), supplement_count: subjects.reduce((sum, subject) => sum + subject.supplements.length, 0), missing_file_count: 0 },
    subjects
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log("Usage: node scripts/build-history-go-fagverk-canonical-index-v2.mjs --write|--check [--output path]"); return; }
  const built = await build();
  const outputPath = path.resolve(repoRoot, args.output), serialized = stableJson(built);
  if (args.check) {
    if (!fs.existsSync(outputPath)) throw new Error(`Canonical index missing: ${args.output}`);
    const current = fs.readFileSync(outputPath, "utf8");
    if (current !== serialized) throw new Error(`Canonical index drift: run generator for ${args.output}`);
    console.log(`History-Go Fagverk canonical index V2: verified ${built.summary.subject_count} subjects, ${built.summary.emne_count} emner, ${built.summary.method_count} methods, ${built.summary.chapter_count} chapters, ${built.summary.supplement_count} manifest supplements.`);
    return;
  }
  if (!args.write) throw new Error("Use --write to generate or --check to verify.");
  fs.mkdirSync(path.dirname(outputPath), { recursive: true }); fs.writeFileSync(outputPath, serialized);
  console.log(`History-Go Fagverk canonical index V2: wrote ${args.output} (${built.summary.subject_count} subjects, ${built.summary.emne_count} emner, ${built.summary.method_count} methods, ${built.summary.chapter_count} chapters, ${built.summary.supplement_count} manifest supplements).`);
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
