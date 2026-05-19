// ahaAnalysisQualityLayer.js
// Lett etterfilter for AHA Chat-visning: rydder analyse-output uten å endre motor, schema eller rådata.

(function (global) {
  "use strict";

  const ROOT_SELECTORS = [
    "#aha-auto-output",
    "#panel",
    "#aha-meta-profile-home",
    "#aha-afterwork-archive"
  ];

  const TEXT_FIXES = [
    [/malthusianske\s+temperaturer/gi, "malthusianske forklaringer"],
    [/malthusianske\s+temperaturforklaringer/gi, "malthusianske forklaringer"],
    [/Påstand i teksten\s*:/g, "Sitat fra teksten:"],
    [/PÅSTANDER/g, "SITATER FRA TEKSTEN"]
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
  }

  function cleanConceptNetwork(root) {
    root.querySelectorAll?.(".concept-network-item").forEach((item) => {
      const hasLinks = Boolean(item.querySelector(".concept-network-links li"));
      const hasEmpty = Boolean(item.querySelector(".concept-network-empty"));
      if (!hasLinks && hasEmpty) item.remove();
    });

    root.querySelectorAll?.(".concept-network").forEach((network) => {
      if (network.querySelector(".concept-network-item")) return;
      const replacement = document.createElement("p");
      replacement.className = "knowledge-sub";
      replacement.textContent = "For få sikre koblinger til å bygge begrepsnettverk ennå.";
      network.replaceWith(replacement);
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
    fixTextNodes(root);
    relabelClaimSections(root);
    relabelAcademicAutoOutput(root);
    dedupeListItems(root);
    dedupeInsightCards(root);
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

  function init() {
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
