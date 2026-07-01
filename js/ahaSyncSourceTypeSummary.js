// ahaSyncSourceTypeSummary.js
// Read-only/local-only source category counters for AHA Sync Overview.

(function (global) {
  "use strict";

  const KNOWN_TYPES = ["chat", "note", "reflection", "url_article", "import", "source_event"];
  const ALL_TYPES = KNOWN_TYPES.concat(["unknown"]);
  const LABELS = {
    chat: "Chat",
    note: "Notat",
    reflection: "Refleksjon",
    url_article: "URL-artikkel",
    import: "Import",
    source_event: "Source event",
    unknown: "Ukjent"
  };
  const TYPE_ALIASES = {
    chat: "chat",
    message: "chat",
    conversation: "chat",
    note: "note",
    notes: "note",
    reflection: "reflection",
    refleksjon: "reflection",
    url: "url_article",
    article: "url_article",
    url_article: "url_article",
    link_reader: "url_article",
    article_analysis: "url_article",
    import: "import",
    imported: "import",
    source_event: "source_event",
    event: "source_event"
  };

  function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function cleanType(value) {
    return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  }

  function normalizeSourceType(sourceEvent) {
    const event = safeObject(sourceEvent);
    const meta = safeObject(event.meta);
    const values = [event.source_type, event.type, event.content_type, event.kind, meta.sourceType];

    for (let index = 0; index < values.length; index += 1) {
      const canonical = TYPE_ALIASES[cleanType(values[index])];
      if (canonical) return canonical;
    }

    return "unknown";
  }

  function emptyCounts() {
    return ALL_TYPES.reduce((counts, type) => {
      counts[type] = 0;
      return counts;
    }, {});
  }

  function buildSourceTypeLines(summary) {
    const data = safeObject(summary);
    const byType = safeObject(data.byType);
    const total = Number(data.totalSourceEvents || 0);
    const activeTypes = KNOWN_TYPES.filter((type) => Number(byType[type] || 0) > 0).length;
    const lines = [];

    if (total <= 0) {
      lines.push("Ingen lokale source events å oppsummere etter kildetype ennå.");
    } else {
      lines.push(`AHA ser lokale source events fra ${activeTypes} ${activeTypes === 1 ? "type" : "typer"}.`);
      if (Number(byType.chat || 0) > 0) lines.push("Chat-signaler finnes som lokale tellere.");
      if (Number(byType.note || 0) > 0) lines.push("Notater finnes som lokale tellere.");
      if (Number(byType.reflection || 0) > 0) lines.push("Refleksjoner finnes som lokale tellere.");
      if (Number(byType.url_article || 0) > 0) lines.push("URL-artikler behandles som source actions, ikke rå tekst i Sync Overview.");
      if (Number(byType.import || 0) > 0) lines.push("Import-hendelser telles bare som type/count.");
      if (Number(byType.source_event || 0) > 0) lines.push("Generiske source events telles uten innhold.");
      if (Number(data.unknownCount || 0) > 0) lines.push("Noen lokale source events har ukjent trygg type.");
    }

    lines.push("Ingen sync kjøres her.");
    return lines;
  }

  function buildSourceTypeSummary(sourceEvents) {
    const events = Array.isArray(sourceEvents) ? sourceEvents : [];
    const byType = emptyCounts();

    events.forEach((item) => {
      const type = normalizeSourceType(item);
      byType[type] = (byType[type] || 0) + 1;
    });

    const summary = {
      totalSourceEvents: events.length,
      byType,
      knownTypes: KNOWN_TYPES.slice(),
      unknownCount: byType.unknown || 0,
      localOnly: true,
      noSync: true,
      lines: []
    };
    summary.lines = buildSourceTypeLines(summary);
    return summary;
  }

  global.AHASyncSourceTypeSummary = {
    buildSourceTypeSummary,
    normalizeSourceType,
    buildSourceTypeLines,
    labels: LABELS
  };
}(window));
