// ahaSyncChannelSourceMatrix.js
// Read-only/local-only channel/source-type counters for AHA Sync Overview.

(function (global) {
  "use strict";

  const SAFE_FIELDS = [
    "totalSourceEvents",
    "totalRoutedEvents",
    "sourceTypes",
    "channels",
    "matrix",
    "localOnly",
    "noSync",
    "lines"
  ];

  function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function getChannels() {
    return Array.isArray(global.AHA_SYNC_CHANNELS) ? global.AHA_SYNC_CHANNELS : [];
  }

  function getChannelIds() {
    return getChannels().map((channel) => String(safeObject(channel).id || "").trim()).filter(Boolean);
  }

  function normalizeSourceType(item) {
    const helper = global.AHASyncSourceTypeSummary;
    if (typeof helper?.normalizeSourceType === "function") {
      const normalized = String(helper.normalizeSourceType(item) || "").trim();
      return normalized || "unknown";
    }
    const source = safeObject(item);
    return String(source.source_type || source.type || source.content_type || source.kind || "unknown").trim().toLowerCase().replace(/[\s-]+/g, "_") || "unknown";
  }

  function routeItem(item) {
    const router = global.AHASyncChannelRouter;
    if (typeof router?.routeSourceEvent !== "function") return { matchedChannels: [] };
    const result = router.routeSourceEvent(item);
    return safeObject(result);
  }

  function buildEmptyMatrix(channelIds, sourceTypes) {
    return channelIds.reduce((matrix, channelId) => {
      matrix[channelId] = sourceTypes.reduce((counts, type) => {
        counts[type] = 0;
        return counts;
      }, {});
      return matrix;
    }, {});
  }

  function summarizeChannelSourceMatrix(routes, sourceEvents) {
    const safeRoutes = Array.isArray(routes) ? routes : [];
    const safeEvents = Array.isArray(sourceEvents) ? sourceEvents : [];
    const channelIds = getChannelIds();
    const channelSeen = channelIds.reduce((seen, id) => {
      seen[id] = true;
      return seen;
    }, {});
    const sourceTypeSeen = {};
    const routedPairs = [];
    let totalRoutedEvents = 0;

    safeEvents.forEach((item, index) => {
      const sourceType = normalizeSourceType(item);
      sourceTypeSeen[sourceType] = true;
      const route = safeObject(safeRoutes[index]);
      const matched = Array.isArray(route.matchedChannels) ? route.matchedChannels : [];
      const matchedIds = matched.map((id) => String(id || "").trim()).filter((id) => id && channelSeen[id]);
      if (matchedIds.length) totalRoutedEvents += 1;
      matchedIds.forEach((channelId) => {
        routedPairs.push({ channelId, sourceType });
      });
    });

    const sourceTypes = Object.keys(sourceTypeSeen).sort();
    const matrix = buildEmptyMatrix(channelIds, sourceTypes);
    routedPairs.forEach((pair) => {
      matrix[pair.channelId][pair.sourceType] = Number(matrix[pair.channelId][pair.sourceType] || 0) + 1;
    });

    const summary = {
      totalSourceEvents: safeEvents.length,
      totalRoutedEvents,
      sourceTypes,
      channels: channelIds,
      matrix,
      localOnly: true,
      noSync: true,
      lines: []
    };
    return SAFE_FIELDS.reduce((safe, field) => {
      safe[field] = summary[field];
      return safe;
    }, {});
  }

  function buildChannelSourceMatrixLines(summary) {
    const data = safeObject(summary);
    const total = Number(data.totalSourceEvents || 0);
    const types = Array.isArray(data.sourceTypes) ? data.sourceTypes : [];
    const lines = [];

    if (total <= 0) {
      lines.push("Ingen lokale source events å fordele på kanaler ennå.");
    } else {
      lines.push("AHA ser lokale kanalsignaler fordelt på source types.");
      if (types.includes("chat")) lines.push("Chat-signaler bidrar til én eller flere innsiktskanaler.");
      if (types.includes("url_article")) lines.push("URL-artikler telles bare som url_article, ikke som rå URL eller tekst.");
    }
    lines.push("Ingen sync kjøres her.");
    return lines;
  }

  function buildChannelSourceMatrix(sourceEvents) {
    const events = Array.isArray(sourceEvents) ? sourceEvents : [];
    const routes = events.map(routeItem);
    const summary = summarizeChannelSourceMatrix(routes, events);
    summary.lines = buildChannelSourceMatrixLines(summary);
    return summary;
  }

  global.AHASyncChannelSourceMatrix = {
    buildChannelSourceMatrix,
    summarizeChannelSourceMatrix,
    buildChannelSourceMatrixLines
  };
}(window));
