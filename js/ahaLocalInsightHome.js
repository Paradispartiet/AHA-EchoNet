// AHA Local Insight Home V1
// Local, read-only composer for safe V1 insight surfaces.
(function (global) {
  "use strict";

  const VERSION = "aha_local_insight_home_v1";
  const SOURCE_SCOPE = "current_conversation_or_analysis";
  const QUALITY_VERSION = "aha_quality_status_surface_v1";
  const SNAPSHOT_VERSION = "aha_conversation_insight_snapshot_v1";
  const OVERVIEW_VERSION = "aha_sync_overview_v1";
  const MAX_QUALITY_LINES = 3;
  const MAX_SNAPSHOT_STEPS = 3;
  const MAX_OVERVIEW_LINES = 3;
  const URL_OR_IDENTIFIER_PATTERN = /(?:https?:\/\/|www\.|file:\/\/|s3:\/\/|ftp:\/\/|localhost(?::\d+)?\b|(?:127|10)\.\d{1,3}\.\d{1,3}\.\d{1,3}\b|192\.168\.\d{1,3}\.\d{1,3}\b|172\.(?:1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}\b|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|\buser[_-]?id\b|\btoken\b)/i;

  function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function compactText(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  }

  function safeShortText(value, maxLength) {
    const text = compactText(value);
    if (!text || URL_OR_IDENTIFIER_PATTERN.test(text)) return "";
    return text.length <= maxLength ? text : `${text.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
  }

  function safeStatus(value) {
    const status = compactText(value).toLowerCase();
    return { ok: true, warning: true, blocked: true, unknown: true }[status] ? status : "unknown";
  }

  function safeLines(lines, limit) {
    const seen = Object.create(null);
    const out = [];
    safeArray(lines).forEach((line) => {
      const text = safeShortText(line, 140);
      const key = text.toLowerCase();
      if (!text || seen[key]) return;
      seen[key] = true;
      out.push(text);
    });
    return out.slice(0, limit);
  }

  function maybeBuildWith(builderOwner, builderName, input) {
    if (!input) return null;
    const owner = safeObject(builderOwner);
    if (typeof owner[builderName] !== "function") return null;
    try {
      return owner[builderName](input);
    } catch (error) {
      return null;
    }
  }

  function normalizeLocalInsightHomeInput(input) {
    const src = safeObject(input);
    const qualityStatus = safeObject(src.qualityStatus).version === QUALITY_VERSION
      ? src.qualityStatus
      : maybeBuildWith(global.AHAQualityStatusSurface, "buildQualityStatusSurface", src.qualityStatusInput);
    const conversationSnapshot = safeObject(src.conversationSnapshot).version === SNAPSHOT_VERSION
      ? src.conversationSnapshot
      : maybeBuildWith(global.AHAConversationInsightSnapshot, "buildConversationInsightSnapshot", src.conversationSnapshotInput);
    const overviewBuilder = safeObject(global.AHASyncOverview);
    const syncOverview = safeObject(src.syncOverview).version === OVERVIEW_VERSION
      ? src.syncOverview
      : maybeBuildWith(overviewBuilder, "buildOverview", src.syncOverviewInput);

    return {
      qualityStatus: qualityStatus || null,
      conversationSnapshot: conversationSnapshot || null,
      syncOverview: syncOverview || null
    };
  }

  function mapQualityStatus(surface) {
    const src = safeObject(surface);
    const checks = safeObject(src.checks);
    const checkLines = Object.keys(checks).map((name) => {
      const status = safeStatus(safeObject(checks[name]).status);
      return status === "unknown" ? "" : `${name}: ${status}`;
    });
    return {
      enabled: true,
      source: QUALITY_VERSION,
      status: safeStatus(src.status),
      summaryLines: safeLines(safeArray(safeObject(src.safeSummary).lines).concat(checkLines), MAX_QUALITY_LINES)
    };
  }

  function mapConversationSnapshot(snapshot) {
    const src = safeObject(snapshot);
    const summary = safeObject(src.summary);
    return {
      enabled: true,
      source: SNAPSHOT_VERSION,
      headline: safeShortText(summary.headline, 90),
      shortDescription: safeShortText(summary.shortDescription, 220),
      nextUnderstandingSteps: safeLines(src.nextUnderstandingSteps, MAX_SNAPSHOT_STEPS)
    };
  }

  function mapOverview(overview) {
    const src = safeObject(overview);
    const summary = safeObject(src.summary);
    const headline = safeShortText(src.headline || summary.headline || src.status, 90);
    const lines = safeLines(safeArray(src.summaryLines).concat(safeArray(summary.lines)), MAX_OVERVIEW_LINES);
    return {
      enabled: true,
      source: OVERVIEW_VERSION,
      headline,
      summaryLines: lines
    };
  }

  function buildHomeSections(normalized) {
    const src = safeObject(normalized);
    return {
      qualityStatus: mapQualityStatus(src.qualityStatus),
      conversationSnapshot: mapConversationSnapshot(src.conversationSnapshot),
      syncOverview: mapOverview(src.syncOverview)
    };
  }

  function buildHomeDisplay() {
    return {
      compact: true,
      actionsAvailable: false,
      approvalAvailable: false,
      syncAvailable: false,
      echoNetAvailable: false
    };
  }

  function buildHomeSafety() {
    return {
      rawUserTextIncluded: false,
      privateUrlsIncluded: false,
      sourceExcerptsIncluded: false,
      userIdentifiersIncluded: false,
      ["approval" + "ActionAvailable"]: false,
      syncAvailable: false,
      echoNetAvailable: false
    };
  }

  function buildLocalInsightHome(input) {
    const normalized = normalizeLocalInsightHomeInput(input);
    return {
      version: VERSION,
      localOnly: true,
      readOnly: true,
      noSync: true,
      sourceScope: SOURCE_SCOPE,
      sections: buildHomeSections(normalized),
      display: buildHomeDisplay(),
      safety: buildHomeSafety()
    };
  }

  global.AHALocalInsightHome = {
    buildLocalInsightHome,
    normalizeLocalInsightHomeInput,
    buildHomeSections,
    buildHomeDisplay,
    buildHomeSafety
  };
})(typeof window !== "undefined" ? window : globalThis);
