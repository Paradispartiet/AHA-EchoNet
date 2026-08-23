#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const mode = process.argv.includes("--write") ? "write" : process.argv.includes("--check") ? "check" : "";
if (!mode) throw new Error("Use --write or --check.");

function migrate(relativePath, replacements, options = {}) {
  const file = path.join(root, relativePath);
  const current = fs.readFileSync(file, "utf8");
  let next = current;
  for (const [before, after] of replacements) if (next.includes(before)) next = next.replace(before, after);
  if (options.rejectLegacyRegistry !== false && /history-go-fagverk-runtime-registry\.v1\.json/.test(next)) throw new Error(`${relativePath}: active contract still references the legacy partial runtime registry.`);
  if (mode === "write") { if (next !== current) fs.writeFileSync(file, next); return next !== current; }
  if (next !== current) throw new Error(`${relativePath}: canonical Fagverk migration drift.`);
  return false;
}

const qualityChanged = migrate("tests/aha-production-analysis-quality-matrix.test.cjs", [
  ["const REGISTRY_PATH = path.join(ROOT, 'data/integrations/runtime/history-go-fagverk-runtime-registry.v1.json');", "const CANONICAL_INDEX_PATH = path.join(ROOT, 'data/integrations/runtime/history-go-fagverk-canonical-index.v2.json');"]
]);
const pipelineChanged = migrate("tests/aha-production-analysis-pipeline-audit.test.cjs", [
  ["const REGISTRY_PATH = 'data/integrations/runtime/history-go-fagverk-runtime-registry.v1.json';", "const CANONICAL_INDEX_PATH = 'data/integrations/runtime/history-go-fagverk-canonical-index.v2.json';"],
  ["        source_ref: corpus.source_ref,", "        source_ref: canonicalIndex.canonical_source.source_ref,"]
]);
const engineChanged = migrate("js/ahaSubjectEngine.js", [
  [
    'const NOISE = new Set(["og","eller","som","det","den","de","til","fra","for","med","på","av","i","om","at","er","var","kan","fag","emne","tekst","tema","analyse","canonical","active"]);',
    'const NOISE = new Set(["og","eller","som","det","den","de","til","fra","for","med","på","av","i","om","at","er","var","kan","fag","emne","tekst","tema","analyse","canonical","active","hvordan","hvem","hva","hvorfor","får","få","styring","makt","samfunn","institusjon","institusjoner"]);'
  ],
  [
    'score += Math.max(0, found.length - 1) * (kind === "method" ? 0.25 : 1.5) + (strong ? 2 : 0) + (kind === "overlay" && strong ? 1 : 0);',
    'const phraseBonus = kind === "method" ? 0 : found.reduce((sum, term) => sum + (normalize(term).includes(" ") ? 3 : 0), 0);\n        score += Math.max(0, found.length - 1) * (kind === "method" ? 0.25 : 1.5) + (strong ? 2 : 0) + (kind === "overlay" && strong ? 1 : 0) + phraseBonus;'
  ]
]);

console.log(`Canonical Fagverk contracts: ${mode === "write" ? "updated" : "verified"}${qualityChanged || pipelineChanged || engineChanged ? " with changes" : ""}.`);
