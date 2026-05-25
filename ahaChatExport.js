(function (global) {
  "use strict";

  function safeSerializeForExport(value) {
    const seen = new WeakSet();

    function walk(input) {
      if (input === null) return null;
      const t = typeof input;
      if (t === "string" || t === "number" || t === "boolean") return input;
      if (t === "bigint") return `${input.toString()}n`;
      if (t === "undefined") return "[Undefined]";
      if (t === "function") return `[Function ${input.name || "anonymous"}]`;
      if (t === "symbol") return `[Symbol ${String(input.description || "")}]`;
      if (input instanceof Date) return isNaN(input.getTime()) ? "[Invalid Date]" : input.toISOString();
      if (typeof Node !== "undefined" && input instanceof Node) {
        const name = input.nodeName || "NODE";
        const id = input.id ? `#${input.id}` : "";
        return `[DOMNode ${name}${id}]`;
      }
      if (Array.isArray(input)) {
        if (seen.has(input)) return "[Circular]";
        seen.add(input);
        return input.map((item) => walk(item));
      }
      if (t === "object") {
        if (seen.has(input)) return "[Circular]";
        seen.add(input);
        const out = {};
        Object.keys(input).forEach((key) => {
          out[key] = walk(input[key]);
        });
        return out;
      }
      return String(input);
    }

    try {
      return walk(value);
    } catch (err) {
      return { error: String(err?.message || err || "serialize_failed") };
    }
  }

  function formatJsonForMarkdown(value, fallback) {
    const seed = value == null ? fallback : value;
    const safeSeed = typeof fallback === "undefined" ? {} : fallback;
    try {
      return JSON.stringify(safeSerializeForExport(seed), null, 2);
    } catch (err) {
      try {
        const hardFallback = Array.isArray(safeSeed) ? [] : {};
        return JSON.stringify(hardFallback, null, 2);
      } catch (_innerErr) {
        return Array.isArray(safeSeed) ? "[]" : "{}";
      }
    }
  }

  function buildAhaAnalysisExportBundle(deps) {
    const nowIso = new Date().toISOString();
    const auto = deps.loadAutoOutputs() || {};
    const payload = auto?.payload && typeof auto.payload === "object" ? auto.payload : {};
    const explicitAhaSer = payload?.ahaSer && typeof payload.ahaSer === "object" ? payload.ahaSer : {};
    const chamber = deps.loadChamberFromStorage() || {};
    const afterworks = deps.loadAfterworkEntries();
    const latestAfterwork = afterworks.length ? afterworks[afterworks.length - 1] : {};
    const sourceText = String(auto?.sourceText || "");
    const sourceTextHash = String(auto?.sourceTextHash || latestAfterwork?.sourceTextHash || deps.sourceHash(sourceText));
    const relevantAfterworks = afterworks.filter((entry) => String(entry?.sourceTextHash || "") === sourceTextHash);
    const selectedAfterwork = relevantAfterworks.length
      ? relevantAfterworks[relevantAfterworks.length - 1]
      : (!sourceTextHash && latestAfterwork ? latestAfterwork : {});
    const chatLog = Array.isArray(chamber?.chatLog) ? chamber.chatLog : [];
    const latestAhaReplyText = deps.getLatestAhaReplyFromDom();
    const subjectMatches = deps.normalizeSubjectLinks(selectedAfterwork?.subjectLinks || payload?.subjectMatches || []);
    const insights = Array.isArray(selectedAfterwork?.insights) ? selectedAfterwork.insights : [];
    const concepts = Array.isArray(selectedAfterwork?.concepts) ? selectedAfterwork.concepts : [];
    const canonical = deps.buildCanonicalAnalysis(payload, sourceText);
    const selectedAfterworkType = String(selectedAfterwork?.textType || selectedAfterwork?.innholdstype || "").trim();
    const canonicalType = String(canonical?.contentType || "").trim();
    const isAcademicType = (type) => {
      const key = String(type || "").trim().toLowerCase();
      return key === "academic_article" || key === "theory_idea";
    };
    const allowAfterwork = !selectedAfterworkType || selectedAfterworkType === canonicalType || (isAcademicType(selectedAfterworkType) && isAcademicType(canonicalType));
    const forceCanonicalOverDayLog = String(selectedAfterworkType || "").toLowerCase() === "day_log" && isAcademicType(canonicalType);
    const calibrationStatus = deps.getCalibrationStatus();
    const metaProfile = deps.buildMetaProfile(chamber);
    const knowledgeMap = chamber?.knowledgeMap || chamber?.map || {};
    const mergedAfterwork = deps.ensureAcademicAfterworkShape({
      summary: String((allowAfterwork && !forceCanonicalOverDayLog && selectedAfterwork?.summary) || payload?.summary || canonical?.summary || payload?.day || ""),
      insight: String(payload?.insight || (insights[0] || "")),
      reflection: String((allowAfterwork && !forceCanonicalOverDayLog && selectedAfterwork?.reflection) || canonical?.reflection || payload?.reflection || ""),
      sortItems: (allowAfterwork && !forceCanonicalOverDayLog && Array.isArray(selectedAfterwork?.sortItems) && selectedAfterwork.sortItems.length) ? selectedAfterwork.sortItems : (canonical?.sortItems?.length ? canonical.sortItems : (Array.isArray(payload?.sortItems) ? payload.sortItems : [])),
      list: (allowAfterwork && !forceCanonicalOverDayLog && Array.isArray(selectedAfterwork?.list) && selectedAfterwork.list.length) ? selectedAfterwork.list : (canonical?.list?.length ? canonical.list : (Array.isArray(payload?.list) ? payload.list : [])),
      path: (allowAfterwork && !forceCanonicalOverDayLog && Array.isArray(selectedAfterwork?.learningPath) && selectedAfterwork.learningPath.length) ? selectedAfterwork.learningPath : (canonical?.path?.length ? canonical.path : (Array.isArray(payload?.path) ? payload.path : [])),
      thoughts: selectedAfterwork?.thoughtSorting || payload?.thoughts || {}
    }, canonical);

    return {
      version: "aha_analysis_export_v1",
      exportedAt: nowIso,
      createdAt: String(auto?.createdAt || selectedAfterwork?.createdAt || nowIso),
      sourceTextHash,
      sourceText,
      sourceTextPreview: String(auto?.sourceTextPreview || selectedAfterwork?.sourceTextPreview || sourceText.replace(/\s+/g, " ").slice(0, 180)),
      ahaReply: latestAhaReplyText || String(explicitAhaSer?.kortSvar || payload?.kortSvar || ""),
      ahaSer: {
        innholdstype: String(canonical?.contentType || payload?.innholdstype || payload?.textType || ""),
        tema: String(canonical?.ahaSer?.tema || explicitAhaSer?.tema || payload?.tema || ""),
        hovedspenning: String(canonical?.ahaSer?.hovedspenning || explicitAhaSer?.hovedspenning || payload?.hovedspenning || ""),
        viktigsteInnsikt: String(canonical?.ahaSer?.viktigsteInnsikt || explicitAhaSer?.viktigsteInnsikt || payload?.viktigsteInnsikt || ""),
        fagkoblinger: deps.normalizeFagkoblinger(canonical?.ahaSer?.fagkoblinger || explicitAhaSer?.fagkoblinger || payload?.fagkoblinger),
        nesteSteg: String(canonical?.ahaSer?.nesteSteg || explicitAhaSer?.nesteSteg || payload?.nesteSteg || ""),
        kortSvar: String(canonical?.ahaSer?.kortSvar || explicitAhaSer?.kortSvar || payload?.kortSvar || "")
      },
      afterwork: mergedAfterwork,
      insights,
      concepts: (allowAfterwork && !forceCanonicalOverDayLog && concepts.length) ? concepts : (canonical?.concepts || []),
      subjectMatches,
      metaProfile,
      knowledgeMap,
      rawAutoPayload: payload,
      selectedAfterwork,
      relevantAfterworks,
      allAfterworkCount: afterworks.length,
      chamberInsights: Array.isArray(chamber?.insights) ? chamber.insights : [],
      chamberChatLog: chatLog,
      chamberMeta: chamber?.meta || {},
      fullChamberSnapshot: chamber,
      chamberSummary: {
        insightCount: Array.isArray(chamber?.insights) ? chamber.insights.length : 0,
        recentAfterworkCount: relevantAfterworks.length,
        chatTurns: chatLog.length
      },
      calibrationStatus
    };
  }

  function formatAhaAnalysisExportMarkdown(bundle) {
    const b = bundle && typeof bundle === "object" ? bundle : {};
    const ser = b.ahaSer || {};
    const afterwork = b.afterwork || {};
    const sortItems = Array.isArray(afterwork.sortItems) ? afterwork.sortItems : [];
    const asBullet = (items) => (Array.isArray(items) && items.length ? items.map((item) => `- ${typeof item === "string" ? item : (item?.label ? `${item.label}: ${item.text || ""}` : JSON.stringify(item))}`).join("\n") : "- (ingen)");
    return `# AHA analyse

## Kildetekst
${b.sourceText || "(mangler)"}

## Kort svar
${ser.kortSvar || b.ahaReply || "(mangler)"}

## AHA SER
- Innholdstype: ${ser.innholdstype || ""}
- Tema: ${ser.tema || ""}
- Hovedspenning: ${ser.hovedspenning || ""}
- Viktigste innsikt: ${ser.viktigsteInnsikt || ""}
- Fagkoblinger: ${(Array.isArray(ser.fagkoblinger) ? ser.fagkoblinger.join(", ") : "")}
- Neste steg: ${ser.nesteSteg || ""}

## Oppsummer
${afterwork.summary || ""}

## Reflekter
${afterwork.reflection || ""}

## Sortert struktur
${sortItems.length ? sortItems.map((item) => `- ${item?.label || "Punkt"}: ${item?.text || ""}`).join("\n") : "- (ingen)"}

## Liste
${asBullet(afterwork.list)}

## Læringssti
${asBullet(afterwork.path)}

## Innsikter
${asBullet(b.insights)}

## Begreper
${asBullet(b.concepts)}

## Meta / Kunnskapskart
- Fagkoblinger/subjectMatches: ${(Array.isArray(b.subjectMatches) ? b.subjectMatches.map((m) => m?.title || m?.subject_id).filter(Boolean).join(", ") : "")}
- Meta-profil: ${JSON.stringify(safeSerializeForExport(b.metaProfile || {}))}
- Kunnskapskart/chamber-status: ${JSON.stringify(safeSerializeForExport(b.chamberSummary || {}))}

## Teknisk
- sourceTextHash: ${b.sourceTextHash || ""}
- createdAt: ${b.createdAt || ""}
- exportedAt: ${b.exportedAt || ""}
- calibrationStatus: ${JSON.stringify(safeSerializeForExport(b.calibrationStatus || {}))}

## Full eksportdata

### Full bundle
${"```"}json
${formatJsonForMarkdown(b, {})}
${"```"}

### Rå auto-output payload
${"```"}json
${formatJsonForMarkdown(b.rawAutoPayload, {})}
${"```"}

### Valgt afterwork
${"```"}json
${formatJsonForMarkdown(b.selectedAfterwork, {})}
${"```"}

### Relevante afterworks
${"```"}json
${formatJsonForMarkdown(b.relevantAfterworks, [])}
${"```"}

### Chamber insights
${"```"}json
${formatJsonForMarkdown(b.chamberInsights, [])}
${"```"}

### Chamber chatLog
${"```"}json
${formatJsonForMarkdown(b.chamberChatLog, [])}
${"```"}

### Meta-profil
${"```"}json
${formatJsonForMarkdown(b.metaProfile, {})}
${"```"}

### Chamber meta
${"```"}json
${formatJsonForMarkdown(b.chamberMeta, {})}
${"```"}

### KnowledgeMap / kunnskapstre
${"```"}json
${formatJsonForMarkdown(b.knowledgeMap, {})}
${"```"}

### Calibration status
${"```"}json
${formatJsonForMarkdown(b.calibrationStatus, {})}
${"```"}

### Full chamber snapshot
${"```"}json
${formatJsonForMarkdown(b.fullChamberSnapshot, {})}
${"```"}
`;
  }

  async function copyAhaAnalysisExportMarkdown(deps) {
    const bundle = buildAhaAnalysisExportBundle(deps);
    const markdown = formatAhaAnalysisExportMarkdown(bundle);
    try {
      await navigator.clipboard.writeText(markdown);
      deps.setStatusNote("AHA-analyse kopiert.");
    } catch (err) {
      deps.out(markdown);
      deps.setStatusNote("Kunne ikke kopiere automatisk. Viste analysen i Full analyse-panelet.");
    }
  }

  function exportAhaAnalysisJson(deps) {
    const bundle = buildAhaAnalysisExportBundle(deps);
    const json = JSON.stringify(safeSerializeForExport(bundle), null, 2);
    const now = new Date();
    const filename = `aha-analysis-${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,"0")}-${String(now.getUTCDate()).padStart(2,"0")}-${String(now.getUTCHours()).padStart(2,"0")}${String(now.getUTCMinutes()).padStart(2,"0")}.json`;
    try {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      deps.setStatusNote("AHA-analyse eksportert som JSON.");
    } catch (err) {
      deps.out(json);
      deps.setStatusNote("Kunne ikke laste ned JSON. Viste data i Full analyse-panelet.");
    }
  }

  global.AHAChatExport = {
    safeSerializeForExport,
    buildAhaAnalysisExportBundle,
    formatAhaAnalysisExportMarkdown,
    copyAhaAnalysisExportMarkdown,
    exportAhaAnalysisJson
  };
}(window));
