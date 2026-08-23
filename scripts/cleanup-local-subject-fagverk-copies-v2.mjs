#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const indexPath = path.join(root, "data/subjects/subjects_index.json");
const mode = process.argv.includes("--write") ? "write" : process.argv.includes("--check") ? "check" : "";
if (!mode) throw new Error("Use --write or --check.");

const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
if (index?.schema !== "aha_subject_overlays_v1" || index?.authority !== "overlay_only") {
  throw new Error("Local subject index must be overlay_only before cleanup.");
}

let removedCopies = 0;
let removedLegacyHeaders = 0;
let changedFiles = 0;
let keptOverlays = 0;

for (const entry of index.subjects || []) {
  const fileName = String(entry.file || "");
  if (!fileName || fileName.includes("/") || fileName.includes("..")) throw new Error(`${entry.subject_id}: invalid overlay file.`);
  const filePath = path.join(root, "data/subjects", fileName);
  const currentText = fs.readFileSync(filePath, "utf8");
  const current = JSON.parse(currentText);
  const next = { ...current };
  if (Object.prototype.hasOwnProperty.call(next, "history_go_fagverk")) {
    delete next.history_go_fagverk;
    removedLegacyHeaders += 1;
  }
  const sourceEmner = Array.isArray(current.emner) ? current.emner : [];
  const overlays = sourceEmner.filter((emne) => !emne?.fagverk);
  removedCopies += sourceEmner.length - overlays.length;
  keptOverlays += overlays.length;
  for (const emne of overlays) {
    if (!emne?.local_knowledge || !Array.isArray(emne.local_knowledge.canonical_subject_ids) || !emne.local_knowledge.canonical_subject_ids.length) {
      throw new Error(`${entry.subject_id}/${emne?.emne_id || "unknown"}: remaining local emne is not a governed AHA overlay.`);
    }
  }
  next.emner = overlays;
  next.authority = "aha_overlay_only";
  next.canonical_source = "data/integrations/history-go-fagverk-bridge.v2.json";
  const expectedText = `${JSON.stringify(next, null, 2)}\n`;
  if (currentText !== expectedText) {
    changedFiles += 1;
    if (mode === "write") fs.writeFileSync(filePath, expectedText);
  }
}

if (mode === "check" && changedFiles) {
  throw new Error(`${changedFiles} local subject files still contain legacy/generated Fagverk state. Run --write.`);
}
console.log(`Local subject cleanup V2: ${mode === "write" ? "processed" : "verified"}; removed ${removedCopies} generated Fagverk copies and ${removedLegacyHeaders} legacy headers; kept ${keptOverlays} governed AHA overlays.`);
