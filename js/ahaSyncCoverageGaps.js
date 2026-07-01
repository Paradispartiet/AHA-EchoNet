// ahaSyncCoverageGaps.js
// Read-only/local-only coverage gap counters for AHA Sync Overview.

(function (global) {
  "use strict";

  const SAFE_FIELDS = [
    "totalSourceEvents",
    "totalRoutedEvents",
    "activeChannelCount",
    "emptyChannelCount",
    "activeChannels",
    "emptyChannels",
    "activeSourceTypes",
    "missingSourceTypes",
    "localOnly",
    "noSync",
    "lines"
  ];

  function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function channelIds() {
    return Array.isArray(global.AHA_SYNC_CHANNELS)
      ? global.AHA_SYNC_CHANNELS.map((channel) => String(safeObject(channel).id || "").trim()).filter(Boolean)
      : [];
  }

  function knownSourceTypes() {
    const helper = global.AHASyncSourceTypeSummary;
    const summary = typeof helper?.buildSourceTypeSummary === "function" ? helper.buildSourceTypeSummary([]) : null;
    const types = Array.isArray(summary?.knownTypes) ? summary.knownTypes.slice() : ["chat", "note", "reflection", "url_article", "import", "source_event"];
    if (!types.includes("unknown")) types.push("unknown");
    return types;
  }

  function buildFromMatrix(sourceItems) {
    const helper = global.AHASyncChannelSourceMatrix;
    if (typeof helper?.buildChannelSourceMatrix !== "function") return null;
    const summary = helper.buildChannelSourceMatrix(Array.isArray(sourceItems) ? sourceItems : []);
    return summary && typeof summary === "object" && !Array.isArray(summary) ? summary : null;
  }

  function summarizeCoverage(matrixSummary) {
    const matrixData = safeObject(matrixSummary);
    const channels = Array.isArray(matrixData.channels) ? matrixData.channels.map((id) => String(id || "").trim()).filter(Boolean) : channelIds();
    const sourceTypes = Array.isArray(matrixData.sourceTypes) ? matrixData.sourceTypes.map((type) => String(type || "").trim()).filter(Boolean) : [];
    const allTypes = knownSourceTypes();
    const matrix = safeObject(matrixData.matrix);
    const activeChannels = [];
    const emptyChannels = [];

    channels.forEach((id) => {
      const counts = safeObject(matrix[id]);
      const total = Object.keys(counts).reduce((sum, type) => sum + Number(counts[type] || 0), 0);
      if (total > 0) activeChannels.push(id);
      else emptyChannels.push(id);
    });

    const activeSourceTypes = sourceTypes.filter((type) => allTypes.includes(type)).sort();
    const missingSourceTypes = allTypes.filter((type) => !activeSourceTypes.includes(type));
    const summary = {
      totalSourceEvents: Number(matrixData.totalSourceEvents || 0),
      totalRoutedEvents: Number(matrixData.totalRoutedEvents || 0),
      activeChannelCount: activeChannels.length,
      emptyChannelCount: emptyChannels.length,
      activeChannels,
      emptyChannels,
      activeSourceTypes,
      missingSourceTypes,
      localOnly: true,
      noSync: true,
      lines: []
    };
    summary.lines = buildCoverageGapLines(summary);
    return SAFE_FIELDS.reduce((safe, field) => {
      safe[field] = summary[field];
      return safe;
    }, {});
  }

  function buildCoverageGapLines(summary) {
    const data = safeObject(summary);
    const activeChannelCount = Number(data.activeChannelCount || 0);
    const emptyChannelCount = Number(data.emptyChannelCount || 0);
    const activeSourceTypes = Array.isArray(data.activeSourceTypes) ? data.activeSourceTypes : [];
    const missingSourceTypes = Array.isArray(data.missingSourceTypes) ? data.missingSourceTypes : [];
    const lines = [];

    lines.push(`${activeChannelCount} aktive AHA_SYNC_CHANNELS har lokale counts.`);
    lines.push(`${emptyChannelCount} AHA_SYNC_CHANNELS er tomme i lokal preview.`);
    lines.push(`${activeSourceTypes.length} aktive source-event-typer vises som labels/counts.`);
    lines.push(`${missingSourceTypes.length} source-event-typer mangler lokale counts.`);
    if (activeSourceTypes.includes("url_article")) lines.push("URL-artikler telles bare som url_article/count.");
    lines.push("Coverage gaps er read-only, local-only, counts only, labels only og ingen sync.");
    lines.push("Ingen rå brukerdata, metadata, private lenker eller approval-action vises.");
    return lines;
  }

  function buildCoverageGaps(sourceItems) {
    return summarizeCoverage(buildFromMatrix(sourceItems));
  }

  global.AHASyncCoverageGaps = {
    buildCoverageGaps,
    summarizeCoverage,
    buildCoverageGapLines
  };
}(window));
