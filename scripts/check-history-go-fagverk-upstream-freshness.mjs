#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const DEFAULT_REGISTRY = "data/integrations/runtime/history-go-fagverk-runtime-registry.v1.json";
const DEFAULT_UPSTREAM_REPO = "Paradispartiet/History-Go";
const DEFAULT_UPSTREAM_REF = "main";
const DEFAULT_API_BASE = "https://api.github.com";

function parseArgs(argv) {
  const args = {
    registry: DEFAULT_REGISTRY,
    upstreamRepo: DEFAULT_UPSTREAM_REPO,
    upstreamRef: DEFAULT_UPSTREAM_REF,
    apiBase: DEFAULT_API_BASE,
    advisory: false,
    jsonOutput: ""
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--registry") args.registry = argv[++index] || args.registry;
    else if (token === "--upstream-repo") args.upstreamRepo = argv[++index] || args.upstreamRepo;
    else if (token === "--upstream-ref") args.upstreamRef = argv[++index] || args.upstreamRef;
    else if (token === "--api-base") args.apiBase = argv[++index] || args.apiBase;
    else if (token === "--json-output") args.jsonOutput = argv[++index] || "";
    else if (token === "--advisory") args.advisory = true;
    else if (token === "--help") args.help = true;
    else throw new Error(`Unknown argument: ${token}`);
  }
  return args;
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.resolve(repoRoot, relativePath), "utf8"));
}

function buildSubjectConfigs(registry, readJsonFn = readJson) {
  if (registry?.schema !== "aha_history_go_fagverk_runtime_registry_v1") {
    throw new Error("Unsupported runtime registry schema.");
  }
  return Object.entries(registry.active_subjects || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([subjectId, config]) => {
      if (config?.subject_id !== subjectId) throw new Error(`${subjectId}: registry key and subject_id differ.`);
      const candidate = readJsonFn(config.candidate_corpus_path);
      const sourceRepo = String(candidate?.source_repo || "").trim();
      const sourceRef = String(candidate?.source_ref || "").trim();
      if (!sourceRepo || !sourceRef) throw new Error(`${subjectId}: candidate is missing source_repo/source_ref.`);
      return {
        subjectId,
        sourceRepo,
        pinnedSourceRef: sourceRef,
        candidatePath: config.candidate_corpus_path,
        upstreamPath: String(config.upstream_fagverk_path || `data/fagverk/${subjectId}`)
      };
    });
}

async function defaultRequestJson(url, token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "") {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "AHA-EchoNet-Fagverk-Freshness"
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, { headers });
  const body = await response.text();
  let json;
  try { json = body ? JSON.parse(body) : null; } catch { json = null; }
  if (!response.ok) {
    const detail = json?.message || body || response.statusText;
    throw new Error(`GitHub API ${response.status} for ${url}: ${detail}`);
  }
  return json;
}

function repoApiPath(repo) {
  const parts = String(repo || "").split("/").map((part) => part.trim()).filter(Boolean);
  if (parts.length !== 2) throw new Error(`Invalid GitHub repository: ${repo}`);
  return parts.map(encodeURIComponent).join("/");
}

async function checkSubjectFreshness(subject, requestJson = defaultRequestJson, options = {}) {
  const apiBase = String(options.apiBase || DEFAULT_API_BASE).replace(/\/$/, "");
  const upstreamRepo = String(options.upstreamRepo || subject.sourceRepo || DEFAULT_UPSTREAM_REPO);
  const upstreamRef = String(options.upstreamRef || DEFAULT_UPSTREAM_REF);
  if (subject.sourceRepo !== upstreamRepo) {
    throw new Error(`${subject.subjectId}: candidate source_repo ${subject.sourceRepo} differs from configured upstream ${upstreamRepo}.`);
  }

  const commitsUrl = `${apiBase}/repos/${repoApiPath(upstreamRepo)}/commits?sha=${encodeURIComponent(upstreamRef)}&path=${encodeURIComponent(subject.upstreamPath)}&per_page=1`;
  const commits = await requestJson(commitsUrl);
  const latestRelevantCommit = Array.isArray(commits) ? commits[0] : null;
  const latestRelevantSha = String(latestRelevantCommit?.sha || "").trim();
  if (!latestRelevantSha) throw new Error(`${subject.subjectId}: no upstream commit found for ${subject.upstreamPath}.`);

  if (latestRelevantSha === subject.pinnedSourceRef) {
    return {
      subject_id: subject.subjectId,
      status: "current",
      upstream_review_required: false,
      auto_activation_allowed: false,
      source_repo: upstreamRepo,
      upstream_ref: upstreamRef,
      upstream_path: subject.upstreamPath,
      pinned_source_ref: subject.pinnedSourceRef,
      latest_relevant_upstream_commit: latestRelevantSha,
      comparison_status: "identical",
      action: "none"
    };
  }

  const compareUrl = `${apiBase}/repos/${repoApiPath(upstreamRepo)}/compare/${encodeURIComponent(latestRelevantSha)}...${encodeURIComponent(subject.pinnedSourceRef)}`;
  const comparison = await requestJson(compareUrl);
  const comparisonStatus = String(comparison?.status || "unknown");
  const pinContainsLatestRelevantCommit = comparisonStatus === "ahead" || comparisonStatus === "identical";

  return {
    subject_id: subject.subjectId,
    status: pinContainsLatestRelevantCommit ? "current" : "upstream_review_required",
    upstream_review_required: !pinContainsLatestRelevantCommit,
    auto_activation_allowed: false,
    source_repo: upstreamRepo,
    upstream_ref: upstreamRef,
    upstream_path: subject.upstreamPath,
    pinned_source_ref: subject.pinnedSourceRef,
    latest_relevant_upstream_commit: latestRelevantSha,
    comparison_status: comparisonStatus,
    ahead_by: Number(comparison?.ahead_by || 0),
    behind_by: Number(comparison?.behind_by || 0),
    action: pinContainsLatestRelevantCommit ? "none" : "review_rebuild_approve_and_materialize_subject_before_activation"
  };
}

function summarizeFreshness(subjects, meta = {}) {
  const reviewRequired = subjects.filter((item) => item.upstream_review_required === true);
  return {
    schema: "aha_history_go_fagverk_upstream_freshness_v1",
    version: "1.0.0",
    status: reviewRequired.length ? "upstream_review_required" : "current",
    checked_at: meta.checkedAt || new Date().toISOString(),
    upstream_repo: meta.upstreamRepo || DEFAULT_UPSTREAM_REPO,
    upstream_ref: meta.upstreamRef || DEFAULT_UPSTREAM_REF,
    active_subject_count: subjects.length,
    review_required_count: reviewRequired.length,
    review_required_subject_ids: reviewRequired.map((item) => item.subject_id),
    contract: {
      detection_only: true,
      auto_sync: false,
      auto_activation: false,
      runtime_remains_pinned_until_review_approval_and_materialization: true
    },
    subjects
  };
}

async function runFreshnessAudit(args, requestJson = defaultRequestJson) {
  const registry = readJson(args.registry);
  const subjects = buildSubjectConfigs(registry);
  const results = [];
  for (const subject of subjects) {
    results.push(await checkSubjectFreshness(subject, requestJson, args));
  }
  return summarizeFreshness(results, {
    upstreamRepo: args.upstreamRepo,
    upstreamRef: args.upstreamRef
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node scripts/check-history-go-fagverk-upstream-freshness.mjs [--advisory] [--json-output path]");
    return;
  }
  const report = await runFreshnessAudit(args);
  const rendered = `${JSON.stringify(report, null, 2)}\n`;
  process.stdout.write(rendered);
  if (args.jsonOutput) {
    const output = path.resolve(repoRoot, args.jsonOutput);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, rendered, "utf8");
  }
  if (report.status !== "current" && !args.advisory) process.exitCode = 2;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  });
}

export {
  buildSubjectConfigs,
  checkSubjectFreshness,
  parseArgs,
  runFreshnessAudit,
  summarizeFreshness
};
