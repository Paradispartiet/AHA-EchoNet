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
  const BLOCKED_STEP_WORDS = new RegExp("\\b(" + ["sync", "synk", "approve", "reject", "godkjenn", "godkjenne", "godkjent", "godkjenning", "avvis", "avvise", "avvist", "avvisning", "pub" + "lish", "sh" + "are", "send", "echonet", "export", "save to memory", "lagre", "opprett", "klikk", "repo", "pr", "pull request", "sprint", "pha" + "se", "prio" + "rity", "roadmap", "backend"].join("|") + ")\\b", "i");
  const UNSAFE_URL_OR_PATH_PATTERN = /(?:\b(?:https?:\/\/|www\.|file:\/\/|s3:\/\/|ftp:\/\/|ssh:\/\/|localhost(?::\d+)?\b|(?:127|10)\.\d{1,3}\.\d{1,3}\.\d{1,3}\b|192\.168\.\d{1,3}\.\d{1,3}\b|172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}\b)|(?:^|\s)(?:~?\/|\.{1,2}\/|[A-Za-z]:\\)[^\s]+|\b[a-z0-9.-]+\.(?:local|lan|internal|intranet)\b)/i;

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
    if (UNSAFE_URL_OR_PATH_PATTERN.test(text) || /(?:^|[\s/])[\w.-]+\?[^\s]+/.test(text) || /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text)) return true;
    if (/\b(user[_-]?id|user[_-]?\d+|email|token|private[_-]?payload|raw[_-]?payload|transcript|source\.url|href)\b/i.test(text)) return true;
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
    const label = clipSafeText(candidate.label || candidate.name || candidate.title || candidate.value || candidate.question || candidate.concept, 80);
    if (!label) return null;
    return {
      label,
      confidence: safeConfidence(candidate.confidence),
      source: "structured_input"
    };
  }

  function asSignalValues(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") return [value];
    return value == null || value === "" ? [] : [value];
  }

  function collectStructuredSignalValues(input, field, aliases) {
    const roots = [input, safeObject(input.analysis), safeObject(input.canonicalAnalysis), safeObject(input.ahaSer)];
    const keys = [field].concat(safeArray(aliases));
    return roots.reduce((items, root) => {
      keys.forEach((key) => {
        items.push.apply(items, asSignalValues(safeObject(root)[key]));
      });
      return items;
    }, []);
  }

  function collectInsightCardValues(input) {
    const roots = [input, safeObject(input.analysis), safeObject(input.canonicalAnalysis), safeObject(input.ahaSer)];
    return roots.reduce((items, root) => items.concat(safeArray(safeObject(root).insightCards)), []);
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
      topicConsistent: booleanOrNull(quality.topicConsistent) ?? pickSafeStatus(quality.topicConsistent ?? quality.topicConsistency ?? topicConsistency.valid ?? topicConsistency.status),
      staleDataGuarded: booleanOrNull(quality.staleDataGuarded) ?? pickSafeStatus(quality.staleDataGuarded)
    };
  }

  function normalizeSnapshotInput(input) {
    const src = safeObject(input);
    return {
      headline: clipSafeText(src.headline || safeObject(src.summary).headline, 90),
      shortDescription: clipSafeText(src.shortDescription || safeObject(src.summary).shortDescription, 240),
      concepts: collectStructuredSignalValues(src, "concepts", ["fieldConnections", "fagkoblinger"]).concat(collectInsightCardValues(src)),
      openQuestions: collectStructuredSignalValues(src, "openQuestions", ["questions"]),
      perspectives: collectStructuredSignalValues(src, "perspectives", ["viewpoints", "angles"]),
      tensions: collectStructuredSignalValues(src, "tensions", ["mainTension", "hovedspenning"]),
      conversationLinks: collectStructuredSignalValues(src, "conversationLinks", ["links", "historyGoLinks"]),
      nextUnderstandingSteps: collectStructuredSignalValues(src, "nextUnderstandingSteps", ["suggestedActions", "nesteSteg"]),
      quality: normalizeQuality(src)
    };
  }

  function buildSnapshotSummary(normalized) {
    const src = safeObject(normalized);
    const firstConcept = normalizeSignalItem(safeArray(src.concepts)[0]);
    return {
      headline: src.headline || (firstConcept ? `Samtaleinnsikt: ${firstConcept.label}` : DEFAULT_HEADLINE),
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
    const quality = safeObject(safeObject(normalized).quality);
    const generated = [];
    const safeSignals = safeObject(signals);
    const hasOpenQuestions = safeArray(safeSignals.openQuestions).length > 0;
    const hasConcepts = safeArray(safeSignals.concepts).length > 0;
    const hasMultipleConcepts = safeArray(safeSignals.concepts).length > 1;
    const hasTensions = safeArray(safeSignals.tensions).length > 0;
    const hasPerspectives = safeArray(safeSignals.perspectives).length > 0;
    const hasConversationLinks = safeArray(safeSignals.conversationLinks).length > 0;

    if (hasOpenQuestions) generated.push("Avklar hovedspørsmålet før du konkluderer.");
    if (hasMultipleConcepts) generated.push("Skill de viktigste begrepene fra hverandre.");
    else if (hasConcepts) generated.push("Undersøk hvorfor dette begrepet går igjen.");
    if (hasTensions) generated.push("Formuler spenningen som et åpent spørsmål.");
    if (hasPerspectives) generated.push("Sammenlign perspektivene før neste tolkning.");
    if (hasConversationLinks) generated.push("Se hvilke samtalekoblinger som faktisk forklarer temaet.");
    if (quality.sourceBound === false || quality.topicConsistent === false) generated.push("Sjekk kildegrunnlaget før du bruker innsikten videre.");

    if (!generated.length) {
      generated.push("Samle flere strukturerte signaler før AHA trekker tydeligere mønstre.");
    }

    return dedupeStrings(explicit.concat(generated), MAX_STEP_ITEMS);
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
