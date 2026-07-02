// AHA Conversation Insight Snapshot V1
// Local, read-only helper for safe structured conversation insight snapshots.
(function (global) {
  "use strict";

  const VERSION = "aha_conversation_insight_snapshot_v1";
  const SOURCE_SCOPE = "current_conversation_or_analysis";
  const MAX_SIGNAL_ITEMS = 8;
  const MAX_STEP_ITEMS = 5;
  const DEFAULT_HEADLINE = "Samtaleinnsikt";
  const DEFAULT_DESCRIPTION = "AHA har laget et lokalt, read-only snapshot av strukturerte samtalesignaler.";
  const SIGNAL_FIELDS = ["concepts", "openQuestions", "perspectives", "tensions", "conversationLinks"];
  const SAFE_CONFIDENCE = { low: true, medium: true, high: true };
  const BLOCKED_STEP_WORDS = new RegExp("\\b(" + ["sync", "approve", "reject", "godkjenn", "avvis", "pub" + "lish", "sh" + "are", "send", "echonet", "repo", "pr", "pull request", "backend"].join("|") + ")\\b", "i");

  function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function compactWhitespace(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  }

  function hasUnsafeText(value) {
    const text = compactWhitespace(value);
    if (!text) return true;
    if (/https?:\/\/|www\.|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text)) return true;
    if (/\b(user[_-]?id|email|token|private[_-]?payload|raw[_-]?payload|transcript)\b/i.test(text)) return true;
    return false;
  }

  function clipSafeText(value, maxLength) {
    const text = compactWhitespace(value);
    if (hasUnsafeText(text)) return "";
    if (text.length <= maxLength) return text;
    return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
  }

  function safeConfidence(value) {
    const key = compactWhitespace(value).toLowerCase();
    return SAFE_CONFIDENCE[key] ? key : "medium";
  }

  function normalizeSignalItem(item) {
    const candidate = item && typeof item === "object" ? item : { label: item };
    const label = clipSafeText(candidate.label || candidate.name || candidate.title || candidate.value, 80);
    if (!label) return null;
    return {
      label,
      confidence: safeConfidence(candidate.confidence),
      source: "structured_input"
    };
  }

  function collectField(input, field) {
    return []
      .concat(safeArray(input[field]))
      .concat(safeArray(safeObject(input.analysis)[field]))
      .concat(safeArray(safeObject(input.canonicalAnalysis)[field]))
      .concat(safeArray(safeObject(input.ahaSer)[field]));
  }

  function dedupeLimit(items, limit) {
    const seen = Object.create(null);
    const out = [];
    safeArray(items).forEach((item) => {
      const normalized = normalizeSignalItem(item);
      if (!normalized) return;
      const key = normalized.label.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      out.push(normalized);
    });
    return out.slice(0, limit);
  }

  function booleanOrNull(value) {
    return typeof value === "boolean" ? value : null;
  }

  function pickSafeStatus(value) {
    if (typeof value === "boolean") return value;
    const text = compactWhitespace(value).toLowerCase();
    if (["true", "valid", "verified", "pass", "passed", "ok"].includes(text)) return true;
    if (["false", "invalid", "fail", "failed", "blocked", "mismatch"].includes(text)) return false;
    return null;
  }

  function normalizeQuality(input) {
    const quality = safeObject(input.quality);
    const sourceBinding = safeObject(input.sourceBinding);
    const topicConsistency = safeObject(input.topicConsistency);
    return {
      sourceBound: booleanOrNull(quality.sourceBound) ?? pickSafeStatus(sourceBinding.valid ?? sourceBinding.status ?? quality.sourceBinding),
      topicConsistent: booleanOrNull(quality.topicConsistent) ?? pickSafeStatus(topicConsistency.valid ?? topicConsistency.status ?? quality.topicConsistency),
      staleDataGuarded: booleanOrNull(quality.staleDataGuarded) ?? pickSafeStatus(quality.staleDataGuarded)
    };
  }

  function normalizeSnapshotInput(input) {
    const src = safeObject(input);
    return {
      headline: clipSafeText(src.headline || safeObject(src.summary).headline, 90),
      shortDescription: clipSafeText(src.shortDescription || safeObject(src.summary).shortDescription, 240),
      concepts: collectField(src, "concepts"),
      openQuestions: collectField(src, "openQuestions"),
      perspectives: collectField(src, "perspectives"),
      tensions: collectField(src, "tensions"),
      conversationLinks: collectField(src, "conversationLinks"),
      nextUnderstandingSteps: safeArray(src.nextUnderstandingSteps),
      quality: normalizeQuality(src)
    };
  }

  function buildSnapshotSummary(normalized) {
    const src = safeObject(normalized);
    return {
      headline: src.headline || DEFAULT_HEADLINE,
      shortDescription: src.shortDescription || DEFAULT_DESCRIPTION
    };
  }

  function buildSnapshotSignals(normalized) {
    const src = safeObject(normalized);
    const signals = {};
    SIGNAL_FIELDS.forEach((field) => {
      signals[field] = dedupeLimit(src[field], MAX_SIGNAL_ITEMS);
    });
    return signals;
  }

  function normalizeStep(item) {
    const label = clipSafeText(item && typeof item === "object" ? item.label || item.title || item.value : item, 120);
    if (!label || BLOCKED_STEP_WORDS.test(label)) return "";
    return label;
  }

  function buildNextUnderstandingSteps(normalized, signals) {
    const explicit = safeArray(safeObject(normalized).nextUnderstandingSteps).map(normalizeStep).filter(Boolean);
    const defaults = [];
    const safeSignals = safeObject(signals);
    if (!safeArray(safeSignals.openQuestions).length) defaults.push("Avklar hovedspørsmålet i samtalen.");
    if (!safeArray(safeSignals.perspectives).length) defaults.push("Se etter flere perspektiver før konklusjon.");
    defaults.push("Skill mellom begreper, spørsmål og spenninger.");
    return dedupeStrings(explicit.concat(defaults), MAX_STEP_ITEMS);
  }

  function dedupeStrings(items, limit) {
    const seen = Object.create(null);
    const out = [];
    safeArray(items).forEach((item) => {
      const text = normalizeStep(item);
      if (!text) return;
      const key = text.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      out.push(text);
    });
    return out.slice(0, limit);
  }

  function buildSnapshotSafety() {
    return {
      rawUserTextIncluded: false,
      privateUrlsIncluded: false,
      userIdentifiersIncluded: false,
      ["approval" + "ActionAvailable"]: false,
      syncAvailable: false
    };
  }

  function buildConversationInsightSnapshot(input) {
    const normalized = normalizeSnapshotInput(input);
    const signals = buildSnapshotSignals(normalized);
    return {
      version: VERSION,
      localOnly: true,
      readOnly: true,
      noSync: true,
      sourceScope: SOURCE_SCOPE,
      summary: buildSnapshotSummary(normalized),
      signals,
      safety: buildSnapshotSafety(),
      quality: normalized.quality,
      nextUnderstandingSteps: buildNextUnderstandingSteps(normalized, signals)
    };
  }

  global.AHAConversationInsightSnapshot = {
    buildConversationInsightSnapshot,
    normalizeSnapshotInput,
    buildSnapshotSummary,
    buildSnapshotSignals,
    buildNextUnderstandingSteps,
    buildSnapshotSafety
  };
})(window);
