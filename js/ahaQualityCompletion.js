// Completes the visible AHA quality loop without changing source text or model output.
// The module adds explicit claim confidence and a conservative final language pass.
(function (global) {
  "use strict";

  const VERSION = "aha_quality_completion_v1";
  const AUTO_OUTPUT_KEY = "aha_chat_auto_outputs_v1";
  const WEAK_KEYWORDS = new Set([
    "analyse", "analyser", "tolkning", "tolkninger", "perspektiv", "perspektiver",
    "tema", "innsikt", "innsikter", "kontekst", "prosess", "forståelse", "refleksjon"
  ]);
  const LANGUAGE_FIXES = Object.freeze([
    [/\bdet er viktig å (?:merke seg|påpeke) at\s*/gi, ""],
    [/\bi denne sammenhengen\s*,?\s*/gi, ""],
    [/\bkan sies å\s+/gi, ""],
    [/\bpå en måte som\s+/gi, "slik at "],
    [/\bhar en sentral rolle i å\s+/gi, "bidrar til å "],
    [/\bgjør det mulig for ([^.!?]{1,80}?) å\s+/gi, "lar $1 "],
    [/\bmed tanke på det faktum at\s+/gi, "fordi "],
    [/\bi stor grad\s+/gi, ""],
    [/\bveldig unik\b/gi, "unik"],
    [/\bframtidig fremtid\b/gi, "framtid"]
  ]);
  const GENERATED_SELECTORS = [
    "#aha-auto-output .auto-card p",
    "#aha-auto-output .auto-card li",
    "#aha-auto-output .aha-ser-list dd",
    "#chat-log .aha-structured-answer p",
    "#chat-log .aha-structured-answer li",
    "#aha-afterwork-archive .afterwork-entry p",
    "#aha-afterwork-archive .afterwork-entry li"
  ];
  const SOURCE_BOUNDARY_SELECTOR = [
    ".aha-source-full", ".aha-citation-section", ".aha-claim-evidence", "blockquote",
    "code", "pre", "textarea", "input", "[data-source-quote]", "[data-verbatim]"
  ].join(",");

  const text = (value) => String(value == null ? "" : value).replace(/\s+/g, " ").trim();

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function parse(raw, fallback) {
    try {
      const parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch {
      return fallback;
    }
  }

  function safeStorage() {
    try { return global.localStorage || null; } catch { return null; }
  }

  function activePayload(options = {}) {
    if (options.payload && typeof options.payload === "object") return options.payload;
    const storage = options.storage || safeStorage();
    const cache = parse(storage?.getItem?.(AUTO_OUTPUT_KEY) || "null", null);
    return cache?.payload && typeof cache.payload === "object" ? cache.payload : cache;
  }

  function normalizeConfidence(value) {
    const key = text(value).toLowerCase();
    if (["high", "høy", "strong", "supported"].includes(key)) return "high";
    if (["medium", "middels", "moderate", "interpretive"].includes(key)) return "medium";
    if (["low", "lav", "weak", "hypothesis"].includes(key)) return "low";
    return "";
  }

  function confidenceForClaim(claim = {}) {
    const explicit = normalizeConfidence(claim.confidence || claim.confidenceLevel || claim.uncertainty);
    const overlap = Number(claim.sourceOverlap);
    const score = Number.isFinite(overlap) ? Math.max(0, Math.min(1, overlap)) : null;
    const hasEvidence = text(claim.evidenceText) || text(claim.evidenceStatus) === "source_quote";
    let level = explicit;
    if (!level) {
      if (hasEvidence && score != null && score >= 0.58) level = "high";
      else if (hasEvidence && (score == null || score >= 0.12)) level = "medium";
      else level = "low";
    }
    // Never present an unsupported claim as highly certain merely because an upstream label says so.
    if (!hasEvidence && level === "high") level = "low";
    const labels = { high: "Høy", medium: "Middels", low: "Lav" };
    const explanations = {
      high: "Tolkningen har tydelig og nært kildebelegg.",
      medium: "Kilden støtter tolkningen, men avgjør den ikke alene.",
      low: "Tolkningen mangler direkte eller tilstrekkelig kildebelegg."
    };
    return {
      level,
      label: labels[level],
      score,
      percent: score == null ? null : Math.round(score * 100),
      explanation: explanations[level]
    };
  }

  function buildConfidenceMarkup(claim = {}) {
    const confidence = confidenceForClaim(claim);
    const measured = confidence.percent == null ? "" : ` · kildeoverlapp ${confidence.percent} %`;
    return `<p class="aha-claim-confidence" data-aha-confidence="${confidence.level}"><strong>Sikkerhetsnivå:</strong> ${confidence.label}${measured}. <span>${escapeHtml(confidence.explanation)}</span></p>`;
  }

  function interpretationClaims(payload) {
    return (Array.isArray(payload?.analysisQuality?.claims) ? payload.analysisQuality.claims : [])
      .filter((claim) => claim?.kind === "interpretation");
  }

  function enhanceClaimEvidence(root, options = {}) {
    if (!root?.querySelectorAll) return 0;
    const claims = interpretationClaims(activePayload(options));
    const cards = Array.from(root.querySelectorAll(".aha-claim-evidence-item"));
    let changed = 0;
    cards.forEach((card, index) => {
      const claim = claims[index];
      if (!claim) return;
      const expected = confidenceForClaim(claim);
      const existing = card.querySelector?.("[data-aha-confidence]");
      if (existing?.dataset?.ahaConfidence === expected.level) return;
      existing?.remove?.();
      const doc = card.ownerDocument || global.document;
      if (!doc?.createElement) return;
      const wrapper = doc.createElement("div");
      wrapper.innerHTML = buildConfidenceMarkup(claim);
      const node = wrapper.firstElementChild;
      if (!node) return;
      const uncertainty = Array.from(card.querySelectorAll?.("p") || [])
        .find((paragraph) => /^\s*Usikkerhet\s*:/i.test(String(paragraph.textContent || "")));
      if (uncertainty && typeof card.insertBefore === "function") card.insertBefore(node, uncertainty);
      else card.appendChild?.(node);
      changed += 1;
    });
    return changed;
  }

  function sentenceKey(value) {
    return text(value)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  }

  function dedupeSentences(value) {
    const raw = text(value);
    if (!raw) return "";
    const sentences = raw.split(/(?<=[.!?])\s+/u).map(text).filter(Boolean);
    if (sentences.length < 2) return raw;
    const seen = new Set();
    return sentences.filter((sentence) => {
      const key = sentenceKey(sentence);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).join(" ");
  }

  function editGeneratedText(value) {
    let output = String(value == null ? "" : value);
    LANGUAGE_FIXES.forEach(([pattern, replacement]) => { output = output.replace(pattern, replacement); });
    output = output
      .replace(/\s+([,.;:!?])/g, "$1")
      .replace(/([.!?]){2,}/g, "$1")
      .replace(/\s{2,}/g, " ")
      .replace(/^\s*[,;:]\s*/, "")
      .trim();
    if (output) output = output.charAt(0).toUpperCase() + output.slice(1);
    return dedupeSentences(output);
  }

  function filterWeakKeywords(values) {
    const list = Array.isArray(values) ? values.map(text).filter(Boolean) : [];
    const specific = list.filter((value) => !WEAK_KEYWORDS.has(sentenceKey(value)));
    return specific.length ? specific : list;
  }

  function insideSourceBoundary(node) {
    return Boolean(node?.closest?.(SOURCE_BOUNDARY_SELECTOR));
  }

  function editGeneratedNodes(root) {
    const doc = root?.ownerDocument || global.document;
    if (!doc?.querySelectorAll) return 0;
    let changed = 0;
    GENERATED_SELECTORS.forEach((selector) => {
      Array.from(doc.querySelectorAll(selector)).forEach((node) => {
        if (!node || insideSourceBoundary(node) || node.children?.length) return;
        const before = String(node.textContent || "");
        const after = editGeneratedText(before);
        if (after && after !== before) {
          node.textContent = after;
          changed += 1;
        }
      });
    });
    return changed;
  }

  function dedupeGeneratedListItems(root) {
    if (!root?.querySelectorAll) return 0;
    let removed = 0;
    Array.from(root.querySelectorAll("#aha-auto-output ul, #aha-auto-output ol, #chat-log .aha-structured-answer ul"))
      .forEach((list) => {
        if (insideSourceBoundary(list)) return;
        const seen = new Set();
        Array.from(list.children || []).forEach((item) => {
          const key = sentenceKey(item?.textContent);
          if (!key) return;
          if (seen.has(key)) {
            item.remove?.();
            removed += 1;
          } else {
            seen.add(key);
          }
        });
      });
    return removed;
  }

  let processing = false;
  let scheduled = false;
  function applyVisibleQuality(options = {}) {
    const doc = options.document || global.document;
    if (!doc || processing) return { claims: 0, edited: 0, duplicates: 0 };
    processing = true;
    try {
      const root = doc.getElementById?.("aha-auto-output") || doc.body || doc;
      return {
        claims: enhanceClaimEvidence(root, options),
        edited: editGeneratedNodes(root),
        duplicates: dedupeGeneratedListItems(root)
      };
    } finally {
      processing = false;
    }
  }

  function scheduleVisibleQuality() {
    if (scheduled) return;
    scheduled = true;
    const schedule = global.requestAnimationFrame || global.setTimeout || ((callback) => callback());
    schedule(() => {
      scheduled = false;
      applyVisibleQuality();
    }, 0);
  }

  function install() {
    const doc = global.document;
    if (!doc) return false;
    applyVisibleQuality({ document: doc });
    if (typeof global.MutationObserver === "function" && doc.body && !global.__ahaQualityCompletionObserver) {
      const observer = new global.MutationObserver(() => scheduleVisibleQuality());
      observer.observe(doc.body, { childList: true, subtree: true });
      global.__ahaQualityCompletionObserver = observer;
    }
    return true;
  }

  const api = Object.freeze({
    VERSION,
    confidenceForClaim,
    buildConfidenceMarkup,
    interpretationClaims,
    enhanceClaimEvidence,
    dedupeSentences,
    editGeneratedText,
    filterWeakKeywords,
    editGeneratedNodes,
    dedupeGeneratedListItems,
    applyVisibleQuality,
    install
  });

  global.AHAQualityCompletion = api;
  global.AHAModuleApi?.register?.("analysis.qualityCompletion", api, {
    version: 1,
    legacyGlobal: "AHAQualityCompletion",
    exports: Object.keys(api)
  });

  if (global.document?.readyState === "loading") global.document.addEventListener?.("DOMContentLoaded", install, { once: true });
  else install();
})(typeof window !== "undefined" ? window : globalThis);