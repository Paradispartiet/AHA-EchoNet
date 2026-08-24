#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const BRIDGE_PATH = "data/integrations/history-go-fagverk-bridge.v2.json";
const OVERLAY_INDEX_PATH = "data/subjects/subjects_index.json";

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

function parseArgs(argv) {
  const args = { check: false, subject: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--check") args.check = true;
    else if (token === "--subject") args.subject = String(argv[++index] || "").trim();
    else if (token === "--help") args.help = true;
    else throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node scripts/materialize-history-go-fagverk-subjects.mjs [--subject canonical-id] [--check]");
    console.log("V2 does not materialize canonical History-Go knowledge into AHA subject files; it validates the canonical bridge and local overlays only.");
    return;
  }

  const bridge = readJson(BRIDGE_PATH);
  const overlays = readJson(OVERLAY_INDEX_PATH);
  if (bridge.schema !== "aha_history_go_fagverk_bridge_v2" || bridge.authority !== "history_go_canonical_fagverk") {
    throw new Error("History-Go Fagverk V2 bridge is missing or not authoritative.");
  }
  if (!/^[a-f0-9]{40}$/i.test(String(bridge.canonical_source?.source_ref || ""))) {
    throw new Error("History-Go Fagverk bridge must pin an exact commit SHA.");
  }
  if (bridge.consumer_policy?.fallback_to_partial_runtime_registry !== false || bridge.consumer_policy?.fallback_to_local_subject_index_as_authority !== false) {
    throw new Error("History-Go Fagverk bridge must fail closed instead of using legacy partial/local authority.");
  }
  if (overlays.schema !== "aha_subject_overlays_v1" || overlays.authority !== "overlay_only") {
    throw new Error("data/subjects/subjects_index.json must remain overlay_only.");
  }

  const records = Array.isArray(overlays.subjects) ? overlays.subjects : [];
  for (const record of records) {
    if (!Array.isArray(record.canonical_subject_ids) || !record.canonical_subject_ids.length) {
      throw new Error(`${record.subject_id || "unknown"}: overlay lacks canonical_subject_ids.`);
    }
  }
  if (args.subject) {
    const mapped = records.some((record) => record.canonical_subject_ids.includes(args.subject) || record.subject_id === args.subject);
    if (!mapped) console.log(`${args.subject}: no AHA-specific overlay; canonical History-Go knowledge remains available directly.`);
  }

  console.log(`${args.check ? "Verified" : "Validated"} canonical History-Go Fagverk bridge V2. No canonical subject copies were written to data/subjects.`);
}

main();
