// Turns the active, source-bound AHA analysis into reusable local artifacts.
// The action is explicit and idempotent: nothing is published or synced.
(function (global) {
  "use strict";

  const VERSION = "aha_analysis_artifacts_v1";
  const AUTO_OUTPUT_KEY = "aha_chat_auto_outputs_v1";
  const text = (value) => String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  const arr = (value) => Array.isArray(value) ? value : [];

  function readActiveAnalysis() {
    try {
      const raw = global.localStorage?.getItem?.(AUTO_OUTPUT_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== "object") return null;
      return parsed.payload && typeof parsed.payload === "object" ? parsed : { payload: parsed };
    } catch {
      return null;
    }
  }

  function stableHash(value) {
    const input = text(value).toLocaleLowerCase("no");
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `analysis_${(hash >>> 0).toString(36)}`;
  }

  function unique(values) {
    const seen = new Set();
    return arr(values).filter((value) => {
      const key = text(value).toLocaleLowerCase("no").replace(/[.!?;,:\s]+$/u, "");
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function analysisParts(cacheArg) {
    const cache = cacheArg || readActiveAnalysis();
    const payload = cache?.payload && typeof cache.payload === "object" ? cache.payload : {};
    const canonical = payload.canonicalAnalysis && typeof payload.canonicalAnalysis === "object" ? payload.canonicalAnalysis : {};
    const seen = payload.ahaSer && typeof payload.ahaSer === "object" ? payload.ahaSer : {};
    const theme = text(canonical.theme || seen.tema || "Aktiv AHA-analyse");
    const tension = text(canonical.mainTension || seen.hovedspenning);
    const keyInsight = text(canonical.keyInsight || seen.viktigsteInnsikt);
    const fields = arr(canonical.fieldConnections).length ? arr(canonical.fieldConnections) : arr(seen.fagkoblinger);
    const actions = [...arr(canonical.suggestedActions), ...arr(payload.path), seen.nesteSteg]
      .map(text).filter(Boolean);
    const concepts = [...arr(payload.concepts), ...arr(payload.keywords), ...arr(payload.list)]
      .map((item) => text(typeof item === "string" ? item : item?.term || item?.title || item?.label || item?.key))
      .filter(Boolean);
    const sourceHash = text(cache?.sourceHash || cache?.sourceTextHash || canonical.sourceHash || canonical.sourceTextHash)
      || stableHash(`${cache?.sourceText || ""}|${theme}|${keyInsight}`);
    return {
      cache,
      payload,
      canonical,
      theme,
      tension,
      keyInsight,
      fields: unique(fields.map(text).filter(Boolean)).slice(0, 4),
      actions: unique(actions).slice(0, 6),
      concepts: unique(concepts).slice(0, 6),
      sourceHash,
      analysisId: text(cache?.analysisId || cache?.analysisRunId || cache?.runId || canonical.analysisRunId || canonical.runId)
    };
  }

  function tensionTerms(value) {
    const parts = text(value).split(/\s+(?:kontra|versus|vs\.?|mot)\s+|\s*[↔–—]\s*/iu).map(text).filter(Boolean);
    return parts.length >= 2 ? parts.slice(0, 2) : [];
  }

  function buildMindmapArtifact(cacheArg) {
    const parts = analysisParts(cacheArg);
    if (!parts.theme || (!parts.keyInsight && !parts.tension)) return null;
    const opposing = tensionTerms(parts.tension);
    const terms = unique([
      ...opposing,
      ...parts.fields,
      ...parts.concepts,
      parts.keyInsight ? "Hovedinnsikt" : ""
    ]).slice(0, 8).map((term) => ({
      term,
      definition: term === "Hovedinnsikt" ? parts.keyInsight : `Begrep i analysen av «${parts.theme}».`
    }));
    const fallbacks = ["Kildebelegg", "Tolkning", "Usikkerhet", "Neste test"];
    for (const fallback of fallbacks) {
      if (terms.length >= 4) break;
      if (!terms.some((item) => item.term === fallback)) terms.push({ term: fallback, definition: `Analysedimensjon for «${parts.theme}».` });
    }
    const relations = [];
    if (opposing.length >= 2) {
      relations.push({
        from: opposing[0], to: opposing[1], type: "stands_in_tension_with",
        label: "står i spenning med", explanation: parts.tension
      });
    }
    parts.fields.slice(1).forEach((field) => relations.push({
      from: parts.fields[0], to: field, type: "illuminates", label: "belyser",
      explanation: `Fagkobling i analysen av «${parts.theme}».`
    }));
    if (parts.fields[0] && terms.some((item) => item.term === "Hovedinnsikt")) {
      relations.push({
        from: parts.fields[0], to: "Hovedinnsikt", type: "supports_interpretation",
        label: "belyser tolkningen", explanation: parts.keyInsight
      });
    }
    return {
      title: `Tankekart: ${parts.theme}`,
      description: parts.keyInsight || parts.tension,
      terms,
      relations,
      meta: {
        createdBy: VERSION,
        analysisSourceHash: parts.sourceHash,
        analysisId: parts.analysisId,
        keyInsight: parts.keyInsight,
        mainTension: parts.tension,
        local_only: true
      }
    };
  }

  function findArtifact(records, sourceHash) {
    return arr(records).find((item) => !item?.deletedAt && text(item?.meta?.analysisSourceHash) === sourceHash) || null;
  }

  function saveMindmapFromActiveAnalysis(cacheArg) {
    const artifact = buildMindmapArtifact(cacheArg);
    if (!artifact) return { ok: false, reason: "no_active_analysis" };
    if (!global.AHALists?.loadConceptLists || !global.AHALists?.createConceptList) return { ok: false, reason: "lists_unavailable" };
    const existing = findArtifact(global.AHALists.loadConceptLists(), artifact.meta.analysisSourceHash);
    if (existing) return { ok: true, artifact: existing, existing: true };
    const created = global.AHALists.createConceptList(artifact);
    return created ? { ok: true, artifact: created, existing: false } : { ok: false, reason: "save_failed" };
  }

  function cleanStepTitle(value) {
    return text(value).replace(/^\d+[.)]\s*/, "").slice(0, 180);
  }

  function buildPathArtifact(cacheArg, conceptList) {
    const parts = analysisParts(cacheArg);
    if (!parts.theme || (!parts.keyInsight && !parts.tension)) return null;
    const planned = unique([
      parts.tension ? `Avklar hva kilden faktisk sier om ${parts.tension}.` : "Skill kildebelegg fra tolkning.",
      ...parts.actions,
      parts.keyInsight ? `Prøv hovedinnsikten mot et moteksempel: ${parts.keyInsight}` : "Prøv tolkningen mot et moteksempel.",
      "Oppsummer hva som holder, hva som er usikkert og hva som bør undersøkes videre."
    ]).map(cleanStepTitle).filter(Boolean).slice(0, 5);
    const fallbacks = [
      "Finn ett konkret kildebelegg.",
      "Formuler én alternativ tolkning.",
      "Velg en test som kan skille tolkningene.",
      "Dokumenter resultatet av testen."
    ];
    for (const fallback of fallbacks) {
      if (planned.length >= 4) break;
      if (!planned.includes(fallback)) planned.push(fallback);
    }
    const steps = [];
    if (conceptList?.id) {
      steps.push({
        title: `Orienter deg i tankekartet: ${parts.theme}`,
        type: "concept_list", source: "aha_concept_lists", refId: conceptList.id,
        status: "planned", narrative: "Start med begrepene og relasjonene AHA fant i den aktive teksten.",
        learningOutcome: "Kunne forklare temaet, hovedspenningen og fagkoblingene med egne ord.",
        meta: { analysisSourceHash: parts.sourceHash }
      });
    }
    planned.forEach((title, index) => steps.push({
      title,
      type: "analysis_step",
      source: "aha_analysis",
      refId: `${parts.sourceHash}:step_${index + 1}`,
      status: "planned",
      narrative: index === 0
        ? "Kontroller analysens påstand mot ordlyden i kilden før du bygger videre."
        : "Utfør handlingen og noter hvilket belegg som styrker eller svekker tolkningen.",
      learningOutcome: index === planned.length - 1
        ? "Kunne skille konklusjon, usikkerhet og neste undersøkelse."
        : "Kunne vise hvilket konkret funn dette steget bygger på.",
      meta: {
        inline: true,
        analysisSourceHash: parts.sourceHash,
        reason: index === 0 ? "Forankrer stien i kilden." : "Tester og videreutvikler analysen.",
        completionCriterion: index === planned.length - 1
          ? "En kort konklusjon, minst én usikkerhet og ett neste spørsmål er skrevet ned."
          : "Minst ett konkret kildebelegg eller motbelegg er notert."
      }
    }));
    return {
      title: `Læringssti: ${parts.theme}`,
      type: "learning",
      mode: "learning",
      description: parts.keyInsight || parts.tension,
      goal: `Undersøk om analysen av «${parts.theme}» holder når den prøves mot kilden.`,
      learningOutcome: "Kunne forklare hovedinnsikten med belegg, usikkerhet og et begrunnet neste steg.",
      tags: ["AHA-analyse", parts.theme],
      steps: steps.slice(0, 6),
      meta: {
        createdBy: VERSION,
        analysisSourceHash: parts.sourceHash,
        analysisId: parts.analysisId,
        keyInsight: parts.keyInsight,
        mainTension: parts.tension,
        local_only: true
      }
    };
  }

  function savePathFromActiveAnalysis(cacheArg) {
    const cache = cacheArg || readActiveAnalysis();
    const mindmap = saveMindmapFromActiveAnalysis(cache);
    if (!mindmap.ok) return mindmap;
    const artifact = buildPathArtifact(cache, mindmap.artifact);
    if (!artifact) return { ok: false, reason: "no_active_analysis" };
    if (!global.AHAPaths?.loadPaths || !global.AHAPaths?.createPath) return { ok: false, reason: "paths_unavailable" };
    const existing = findArtifact(global.AHAPaths.loadPaths(), artifact.meta.analysisSourceHash);
    if (existing) return { ok: true, artifact: existing, mindmap: mindmap.artifact, existing: true };
    const created = global.AHAPaths.createPath(artifact);
    return created ? { ok: true, artifact: created, mindmap: mindmap.artifact, existing: false } : { ok: false, reason: "save_failed" };
  }

  function setStatus(message) {
    global.document?.querySelectorAll?.("[data-analysis-artifact-status]")?.forEach?.((node) => { node.textContent = message; });
  }

  function feedbackLabel(response) {
    return {
      useful: "Takk – markert som nyttig.",
      too_generic: "Takk – AHA bør være mer konkret.",
      misinterpreted: "Takk – tolkningen er markert for ny vurdering.",
      missing_evidence: "Takk – manglende belegg er markert."
    }[response] || "Vurderingen ble lagret.";
  }

  function handleClick(event) {
    const artifactButton = event.target?.closest?.("[data-analysis-artifact]");
    if (artifactButton) {
      const result = artifactButton.dataset.analysisArtifact === "path"
        ? savePathFromActiveAnalysis()
        : saveMindmapFromActiveAnalysis();
      setStatus(result.ok
        ? (artifactButton.dataset.analysisArtifact === "path" ? "Læringsstien er klar under Stier." : "Tankekartet er klart under Kart.")
        : "Kunne ikke lagre: analyser en tekst først.");
      return;
    }
    const qualityButton = event.target?.closest?.("[data-analysis-quality]");
    if (!qualityButton) return;
    const response = qualityButton.dataset.analysisQuality;
    const result = global.AHAInsightQualityFeedback?.applyActiveAnalysisFeedback?.(response);
    setStatus(result?.ok ? feedbackLabel(response) : "Kunne ikke lagre vurderingen.");
  }

  function installStyles() {
    if (!global.document?.head || global.document.getElementById("aha-analysis-artifact-styles")) return;
    const style = global.document.createElement("style");
    style.id = "aha-analysis-artifact-styles";
    style.textContent = `
      .aha-analysis-artifact-actions,.aha-analysis-quality-actions{display:flex;flex-wrap:wrap;align-items:center;gap:7px;margin-top:12px}
      .aha-analysis-artifact-actions button,.aha-analysis-artifact-actions a,.aha-analysis-quality-actions button{border:1px solid rgba(255,210,74,.34);border-radius:999px;background:rgba(255,210,74,.07);color:inherit;padding:7px 11px;font:inherit;font-size:.78rem;text-decoration:none;cursor:pointer}
      .aha-analysis-quality-actions{padding-top:10px;border-top:1px solid rgba(255,255,255,.1)}
      .aha-analysis-quality-actions>span,.aha-analysis-artifact-status{font-size:.78rem;opacity:.78}
      .aha-analysis-artifact-status{min-height:1.2em;margin:8px 0 0}
      .aha-claim-evidence{margin-top:14px;padding-top:10px;border-top:1px solid rgba(255,255,255,.1)}
      .aha-claim-evidence summary{color:#ffd24a;font-size:.82rem;font-weight:750;cursor:pointer}
      .aha-claim-evidence-list{display:grid;gap:8px;margin-top:10px}
      .aha-claim-evidence-item{margin-top:8px;padding:9px 11px;border:1px solid rgba(255,255,255,.09);border-radius:10px;background:rgba(255,255,255,.025)}
      .aha-claim-evidence-item h5,.aha-claim-evidence-item p{margin:0 0 6px}
      .aha-claim-evidence-item p:last-child{margin-bottom:0}
    `;
    global.document.head.appendChild(style);
  }

  function init() {
    installStyles();
    global.document?.addEventListener?.("click", handleClick);
  }

  global.AHAAnalysisArtifacts = {
    VERSION,
    readActiveAnalysis,
    analysisParts,
    buildMindmapArtifact,
    buildPathArtifact,
    saveMindmapFromActiveAnalysis,
    savePathFromActiveAnalysis,
    init
  };

  if (global.document?.readyState === "loading") global.document.addEventListener("DOMContentLoaded", init, { once: true });
  else if (global.document) init();
})(typeof window !== "undefined" ? window : globalThis);
