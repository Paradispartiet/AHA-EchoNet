// ahaAnalysisQualityLayer.js
// Lett etterfilter for AHA Chat-visning: rydder analyse-output uten å endre motor, schema eller rådata.

(function (global) {
  "use strict";

  const ROOT_SELECTORS = [
    "#aha-auto-output",
    "#chat-log",
    "#panel",
    "#aha-meta-profile-home",
    "#aha-afterwork-archive"
  ];

  const TEXT_FIXES = [
    [/malthusianske\s+temperaturer/gi, "malthusianske forklaringer"],
    [/malthusianske\s+temperaturforklaringer/gi, "malthusianske forklaringer"],
    [/Hovedargumentet\s+er\s+at\s+klima\/miljø\s+kan\s+være\s+bakgrunnsfaktorer,\s+men\s+at\s+konfliktutvikling\s+primært\s+formes\s+av/gi, "Klima og miljø kan være bakgrunnsfaktorer, men konfliktutviklingen formes primært av"],
    [/Motargumentet\s+er\s+at\s+knapphetsskolen\s+overvurderer/gi, "Knapphetsskolen overvurderer"],
    [/Påstand i teksten\s*:/g, "Sitat fra teksten:"],
    [/PÅSTANDER/g, "SITATER FRA TEKSTEN"],
    [/\bkonfl\s+ikter\b/gi, "konflikter"],
    [/\bkonfl\s+iktnivå\b/gi, "konfliktnivå"],
    [/\bprofi\s+leres\b/gi, "profileres"],
    [/\bfi\s+nnes\b/gi, "finnes"],
    [/\binnfl\s+ytelse\b/gi, "innflytelse"],
    [/\bfl\s+ere\b/gi, "flere"],
    [/\bkunn\s+skap\b/gi, "kunnskap"],
    [/\bmiljø\s+degradering\b/gi, "miljødegradering"],
    [/\bressurs\s+knapphet\b/gi, "ressursknapphet"],
    [/mangel på støttetørke-\s*og\s*ørkenspredningseffekter/gi, "manglende støtte for økt tørke og ørkenspredning"]
  ];

  let processing = false;
  let scheduled = false;

  function setTextIfChanged(el, value) {
    if (!el) return;
    const next = String(value || "");
    if (el.textContent !== next) el.textContent = next;
  }

  function fixDisplayText(value) {
    let text = String(value || "");
    TEXT_FIXES.forEach(([pattern, replacement]) => {
      text = text.replace(pattern, replacement);
    });
    return text;
  }

  function walkTextNodes(root, callback) {
    if (!root || typeof document === "undefined" || !document.createTreeWalker) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const nodes = [];
    let node = walker.nextNode();
    while (node) {
      nodes.push(node);
      node = walker.nextNode();
    }
    nodes.forEach(callback);
  }

  function normalizeComparableText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/sitat fra teksten\s*:/g, "")
      .replace(/påstand i teksten\s*:/g, "")
      .replace(/^(hovedinnsikt|hovedargument|motargument\/?kritikk|spenning i teksten|kort hovedinnsikt)\s*:/, "")
      .replace(/["'“”«»]/g, "")
      .replace(/\b(meta-count|styrke|npmi)\b/g, "")
      .replace(/×\d+/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function getSectionLabel(section) {
    return String(section?.querySelector?.(".meta-section-label, h4, h5, strong, .insight-section-label")?.textContent || "").trim();
  }

  function relabelClaimSections(root) {
    root.querySelectorAll?.(".insight-section-label").forEach((label) => {
      if (String(label.textContent || "").trim().toLowerCase() === "påstander") {
        setTextIfChanged(label, "Sitater fra teksten");
      }
    });
  }

  function fixTextNodes(root) {
    walkTextNodes(root, (node) => {
      if (node.parentElement?.closest?.(".aha-source-full")) return;
      const next = fixDisplayText(node.nodeValue);
      if (next !== node.nodeValue) node.nodeValue = next;
    });
  }

  function dedupeListItems(root) {
    root.querySelectorAll?.("ul, ol").forEach((list) => {
      const seen = new Set();
      Array.from(list.children || []).forEach((item) => {
        if (!item || !/^li$/i.test(item.tagName || "")) return;
        const key = normalizeComparableText(item.textContent);
        if (key.length < 70) return;
        if (seen.has(key)) {
          item.remove();
          return;
        }
        seen.add(key);
      });
    });
  }

  function dedupeInsightCards(root) {
    const seen = new Set();
    root.querySelectorAll?.(".insight-card").forEach((card) => {
      const title = normalizeComparableText(card.querySelector(".insight-card-title")?.textContent || "");
      const summary = normalizeComparableText(card.querySelector(".insight-card-summary")?.textContent || card.textContent || "");
      const key = summary || title;
      if (!key || key.length < 50) return;
      if (seen.has(key)) {
        card.remove();
        return;
      }
      seen.add(key);
    });
  }

  function findMetaSection(root, labelPart) {
    const needle = String(labelPart || "").toLowerCase();
    return Array.from(root.querySelectorAll?.(".meta-section") || []).find((section) =>
      getSectionLabel(section).toLowerCase().includes(needle)
    ) || null;
  }

  function readConceptCountsFromSection(section) {
    const counts = new Map();
    if (!section) return counts;
    section.querySelectorAll("li").forEach((item) => {
      const raw = String(item.textContent || "").replace(/\s+/g, " ").trim();
      const match = raw.match(/^(.+?)\s+×\s*(\d+)/i);
      if (!match) return;
      const key = match[1].trim().toLowerCase();
      const count = Number(match[2]) || 0;
      if (key) counts.set(key, Math.max(counts.get(key) || 0, count));
    });
    return counts;
  }

  function sectionItemKeys(section) {
    return Array.from(section?.querySelectorAll?.("li") || [])
      .map((item) => normalizeComparableText(item.textContent))
      .filter(Boolean)
      .join("|");
  }

  function removeDuplicateMetaSignalSections(profile) {
    const focus = findMetaSection(profile, "foreløpige hovedbegreper") || findMetaSection(profile, "det du tenker mest på");
    const emerging = findMetaSection(profile, "nye signaler") || findMetaSection(profile, "nye temaer");
    if (!focus || !emerging) return;
    if (sectionItemKeys(focus) === sectionItemKeys(emerging)) emerging.remove();
  }

  function removeWeakConceptRows(root) {
    const scopedSections = Array.from(root.querySelectorAll?.(".meta-section") || []);
    if (!scopedSections.length) scopedSections.push(root);
    scopedSections.forEach((section) => {
      const sectionLabel = getSectionLabel(section).toLowerCase();
      if (!/foreløpige hovedbegreper|det du tenker mest på|nye signaler|nye temaer/.test(sectionLabel)) return;
      const text = String(section.textContent || "").toLowerCase();
      const hasPoliticalEcology = text.includes("politisk økologi");
      const hasResourceScarcity = text.includes("ressursknapphet") || text.includes("knapphetsskolen");
      section.querySelectorAll?.("li").forEach((item) => {
        const raw = String(item.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
        if (hasPoliticalEcology && /^økologi\b/.test(raw)) item.remove();
        if (hasResourceScarcity && /^knapphet\b/.test(raw)) item.remove();
      });
    });
  }

  function adjustSmallDatasetMetaProfile(root) {
    const profile = root.matches?.(".meta-profile") ? root : root.querySelector?.(".meta-profile");
    if (!profile) return;

    const metaLine = profile.querySelector(".meta-meta");
    const totalMatch = String(metaLine?.textContent || "").match(/(\d+)\s+innsikter/i);
    const totalInsights = totalMatch ? Number(totalMatch[1]) : 0;

    if (totalInsights > 0 && totalInsights < 6) {
      const heading = profile.querySelector("h3");
      setTextIfChanged(heading, "Foreløpig mønster i dette chamberet");
      setTextIfChanged(metaLine, `Datagrunnlaget er lite: ${totalInsights} innsikter analysert. AHA viser foreløpige signaler, ikke en stabil profil.`);
      profile.querySelectorAll(".meta-section-label").forEach((label) => {
        const text = String(label.textContent || "").toLowerCase();
        if (text.includes("det du tenker mest på")) setTextIfChanged(label, "Foreløpige hovedbegreper");
        if (text.includes("nye temaer som dukker opp")) setTextIfChanged(label, "Nye signaler i materialet");
        if (text.includes("tankegods som har stilnet")) label.closest(".meta-section")?.remove();
      });
    }

    const focusSection = findMetaSection(profile, "foreløpige hovedbegreper") || findMetaSection(profile, "det du tenker mest på");
    const counts = readConceptCountsFromSection(focusSection);
    const underexplored = findMetaSection(profile, "nye begreper som trenger flere koblinger");
    if (underexplored && counts.size) {
      underexplored.querySelectorAll("li").forEach((item) => {
        const raw = String(item.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
        const concept = raw.split("×")[0].trim();
        if (concept && (counts.get(concept) || 0) >= 3) item.remove();
      });
      if (!underexplored.querySelector("li")) underexplored.remove();
    }
    removeDuplicateMetaSignalSections(profile);
  }

  function cleanConceptNetwork(root) {
    root.querySelectorAll?.(".concept-network-item").forEach((item) => {
      const hasLinks = Boolean(item.querySelector(".concept-network-links li"));
      if (!hasLinks) item.remove();
    });

    root.querySelectorAll?.(".concept-network").forEach((network) => {
      if (network.querySelector(".concept-network-item")) return;
      const replacement = document.createElement("p");
      replacement.className = "knowledge-sub";
      replacement.textContent = "Sterkeste koblinger vises over. For få sikre koblingslinjer til eget begrepsnettverk ennå.";
      network.replaceWith(replacement);
    });
  }

  function extractCitationItems(text) {
    const value = fixDisplayText(text).replace(/\s+/g, " ").trim();
    if (!/Sitat fra teksten\s*:/i.test(value)) return [];
    return value
      .split(/Sitat fra teksten\s*:/i)
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => part.replace(/^Sitater fra teksten\s*/i, "").trim())
      .map((part) => part.replace(/^Sitat fra teksten\s*:\s*/i, "").trim())
      .map((part) => part.replace(/\s+(Spenning i teksten|Mulig videre analyse|Dagsoppsummering|Tankesortering)\b.*$/i, "").trim())
      .filter((part) => part.length > 20)
      .slice(0, 8);
  }

  function makeCitationSection(items) {
    const section = document.createElement("section");
    section.className = "aha-citation-section";
    const heading = document.createElement("h4");
    heading.textContent = "Sitater fra teksten";
    section.appendChild(heading);
    const list = document.createElement("ul");
    items.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      list.appendChild(li);
    });
    section.appendChild(list);
    return section;
  }

  function formatCitationRuns(root) {
    const candidates = Array.from(root.querySelectorAll?.("p, div, li") || [])
      .filter((el) => !el.closest(".aha-citation-section") && !el.closest(".aha-source-details"));
    candidates.forEach((el) => {
      const hasOnlyLabelStrong = el.tagName === "LI"
        && el.querySelector(":scope > strong")
        && /Sitat fra teksten\s*:/i.test(String(el.textContent || ""));
      if (el.children.length && !hasOnlyLabelStrong) return;
      const text = String(el.textContent || "");
      if (text.length > 1600) return;
      const items = extractCitationItems(text);
      if (items.length < 2) return;
      el.replaceWith(makeCitationSection(items));
    });
  }

  function shouldCollapseAsSourceText(text) {
    const value = String(text || "").replace(/\s+/g, " ").trim();
    if (value.length < 1800) return false;
    const hasAcademicSource = /(Sammendrag|Nøkkelord|I denne artikkelen|Kritikken av knapphetsskolen|Homer-Dixon|Sahel|Mali)/i.test(value);
    const hasRawArticleShape = /(Nøkkelord|\(Johansen 2008\)|\(Homer-Dixon 1994|\(Peluso & Watts 2001|\(Said 1978\))/i.test(value);
    return hasAcademicSource && hasRawArticleShape;
  }

  function splitSourceAndFollowup(text) {
    const value = String(text || "");
    const marker = value.indexOf("✦");
    if (marker < 0) return { source: value, followup: "" };
    const source = value.slice(0, marker).trim();
    const followup = value.slice(marker).replace(/^✦\s*/, "").trim();
    if (!shouldCollapseAsSourceText(source) || followup.length < 80) return { source: value, followup: "" };
    return { source, followup };
  }

  function makeCollapsedSource(text, followupText) {
    const cleaned = fixDisplayText(text).replace(/\s+/g, " ").trim();
    const wrapper = document.createElement("div");
    wrapper.className = "aha-source-compact";

    const note = document.createElement("p");
    note.className = "aha-source-note";
    note.textContent = "Lang kildetekst er skjult i visningen. Analysen og innsiktene vises separat.";
    wrapper.appendChild(note);

    const preview = document.createElement("p");
    preview.className = "aha-source-preview";
    preview.textContent = `${cleaned.slice(0, 520).trim()}…`;
    wrapper.appendChild(preview);

    const details = document.createElement("details");
    details.className = "aha-source-details";
    const summary = document.createElement("summary");
    summary.textContent = "Kildetekst / råtekst";
    details.appendChild(summary);
    const pre = document.createElement("pre");
    pre.className = "aha-source-full";
    pre.textContent = cleaned;
    details.appendChild(pre);
    wrapper.appendChild(details);

    const followup = String(followupText || "").trim();
    if (followup) {
      const separator = document.createElement("div");
      separator.className = "aha-source-followup-separator";
      separator.textContent = "AHA-svar";
      wrapper.appendChild(separator);
      const followupBlock = document.createElement("div");
      followupBlock.className = "aha-source-followup";
      followupBlock.textContent = fixDisplayText(followup);
      wrapper.appendChild(followupBlock);
    }

    return wrapper;
  }

  function collapseLongSourceBlocks(root) {
    root.querySelectorAll?.(".chat-line, .afterwork-entry, .aha-afterwork-entry, .saved-afterwork-entry").forEach((el) => {
      if (el.dataset?.ahaSourceCollapsed === "true") return;
      if (el.closest(".aha-source-details")) return;
      const text = String(el.textContent || "");
      const parts = splitSourceAndFollowup(text);
      if (!shouldCollapseAsSourceText(parts.source)) return;
      el.dataset.ahaSourceCollapsed = "true";
      el.replaceChildren(makeCollapsedSource(parts.source, parts.followup));
    });
  }

  function relabelAcademicAutoOutput(root) {
    root.querySelectorAll?.("h3, h4, h5, strong, .auto-output-label, .section-label").forEach((el) => {
      const text = String(el.textContent || "").trim().toLowerCase();
      if (text === "påstander" || text === "påstander:") {
        setTextIfChanged(el, "Sitater fra teksten");
      }
    });
  }

  function cleanRoot(root) {
    if (!root) return;
    collapseLongSourceBlocks(root);
    fixTextNodes(root);
    relabelClaimSections(root);
    relabelAcademicAutoOutput(root);
    formatCitationRuns(root);
    dedupeListItems(root);
    dedupeInsightCards(root);
    removeWeakConceptRows(root);
    adjustSmallDatasetMetaProfile(root);
    cleanConceptNetwork(root);
  }

  function processAll() {
    if (processing) return;
    processing = true;
    try {
      ROOT_SELECTORS.forEach((selector) => {
        document.querySelectorAll(selector).forEach(cleanRoot);
      });
    } finally {
      processing = false;
    }
  }

  function scheduleProcess() {
    if (scheduled) return;
    scheduled = true;
    const raf = typeof global.requestAnimationFrame === "function"
      ? global.requestAnimationFrame
      : (callback) => global.setTimeout(callback, 0);
    raf(() => {
      scheduled = false;
      processAll();
    });
  }

  function injectQualityLayerStyles() {
    if (document.getElementById("aha-analysis-quality-layer-styles")) return;
    const style = document.createElement("style");
    style.id = "aha-analysis-quality-layer-styles";
    style.textContent = `
      .aha-source-compact { display: grid; gap: 8px; }
      .aha-source-note { margin: 0; color: var(--aha-accent, #ffd347); font-size: 12px; }
      .aha-source-preview { margin: 0; color: var(--aha-muted, rgba(245,245,245,.68)); font-size: 12px; line-height: 1.45; }
      .aha-source-details { border: 1px solid var(--aha-border, rgba(255,255,255,.12)); border-radius: 10px; padding: 8px 10px; background: rgba(5, 8, 20, 0.55); }
      .aha-source-details > summary { cursor: pointer; color: var(--aha-accent, #ffd347); font-size: 12px; }
      .aha-source-full { margin: 8px 0 0; max-height: 34vh; overflow: auto; white-space: pre-wrap; color: var(--aha-muted, rgba(245,245,245,.68)); font-size: 11px; line-height: 1.45; }
      .aha-source-followup-separator { margin-top: 4px; padding-top: 8px; border-top: 1px solid var(--aha-border, rgba(255,255,255,.12)); color: var(--aha-accent, #ffd347); font-size: 11px; text-transform: uppercase; letter-spacing: .05em; }
      .aha-source-followup { white-space: pre-wrap; color: var(--aha-text, #f5f5f5); font-size: 12px; line-height: 1.45; }
      .aha-citation-section { margin: 8px 0; padding: 8px 10px; border: 1px solid rgba(255,211,71,0.24); border-radius: 10px; background: rgba(255,211,71,0.06); }
      .aha-citation-section h4 { margin: 0 0 6px; font-size: 12px; color: var(--aha-accent, #ffd347); }
      .aha-citation-section ul { margin: 0; padding-left: 18px; display: grid; gap: 5px; }
      .aha-citation-section li { font-size: 12px; line-height: 1.42; color: var(--aha-text, #f5f5f5); }
    `;
    document.head.appendChild(style);
  }

  function init() {
    injectQualityLayerStyles();
    processAll();
    const observer = new MutationObserver(scheduleProcess);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    global.AHAAnalysisQualityLayer = { processAll };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})(window);
