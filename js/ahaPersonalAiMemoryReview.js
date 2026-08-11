// AHA Personal AI Memory Review
// Read-only review signals over the existing Meta Insights Memory.
// Detects conservative contradiction/staleness candidates; never changes memory automatically.
(function (global) {
  "use strict";

  const VERSION = "aha_personal_ai_memory_review_v1";
  const DEFAULT_STALE_DAYS = 180;
  const doc = global.document;
  const asArray = (value) => Array.isArray(value) ? value : [];
  const asObject = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const text = (value) => String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  const esc = (value) => String(value == null ? "" : value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);

  function normalize(value) {
    return text(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9æøå ]/g, " ").replace(/\s+/g, " ").trim();
  }

  function hasNegation(value) {
    return /\b(ikke|aldri|ingen|ingenting|ikke lenger)\b/i.test(text(value));
  }

  function polarityKey(value) {
    return normalize(value)
      .replace(/\b(ikke lenger|ikke|aldri|ingen|ingenting)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function claimObjects(summaryArg) {
    const summary = asObject(summaryArg);
    const buckets = [
      ["confirmed", summary.confirmedClaims],
      ["important", summary.importantClaims],
      ["partial", summary.partialClaims]
    ];
    const seen = new Set();
    const out = [];
    buckets.forEach(([status, values]) => {
      asArray(values).forEach((claim) => {
        const claimText = text(claim?.claimText || claim?.text || claim);
        const key = normalize(claimText);
        if (!claimText || !key || seen.has(key)) return;
        seen.add(key);
        out.push({
          claimText,
          status,
          createdAt: text(claim?.createdAt),
          claimId: text(claim?.claimId)
        });
      });
    });
    return out;
  }

  function detectConflicts(claimsArg) {
    const claims = asArray(claimsArg);
    const groups = new Map();
    claims.forEach((claim) => {
      const key = polarityKey(claim.claimText);
      if (!key || key.length < 8) return;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(claim);
    });
    const conflicts = [];
    groups.forEach((items, key) => {
      for (let i = 0; i < items.length; i += 1) {
        for (let j = i + 1; j < items.length; j += 1) {
          if (hasNegation(items[i].claimText) === hasNegation(items[j].claimText)) continue;
          conflicts.push({ key, first: items[i], second: items[j], reason: "motsatt_formulering" });
        }
      }
    });
    return conflicts;
  }

  function staleClaims(claimsArg, nowArg, staleDaysArg) {
    const now = Date.parse(nowArg) || Number(nowArg) || Date.now();
    const staleDays = Math.max(30, Number(staleDaysArg) || DEFAULT_STALE_DAYS);
    const threshold = staleDays * 24 * 60 * 60 * 1000;
    return asArray(claimsArg)
      .map((claim) => ({ ...claim, ageDays: Math.floor((now - (Date.parse(claim.createdAt) || now)) / 86400000) }))
      .filter((claim) => claim.createdAt && claim.ageDays >= staleDays)
      .sort((a, b) => b.ageDays - a.ageDays);
  }

  function buildReviewModel(optionsArg) {
    const options = asObject(optionsArg);
    let summary = options.summary;
    if (!summary) {
      try { summary = global.AHAMetaInsightsMemory?.summarizeMemory?.() || {}; }
      catch { summary = {}; }
    }
    const claims = claimObjects(summary);
    const conflicts = detectConflicts(claims);
    const stale = staleClaims(claims, options.now, options.staleDays);
    return {
      version: VERSION,
      localOnly: true,
      advisoryOnly: true,
      staleDays: Math.max(30, Number(options.staleDays) || DEFAULT_STALE_DAYS),
      activeClaims: claims.length,
      conflicts,
      stale,
      reviewCount: conflicts.length + stale.length
    };
  }

  function render(modelArg) {
    const host = doc?.getElementById?.("personal-ai-self-knowledge");
    if (!host) return null;
    host.querySelector?.("[data-personal-ai-memory-review]")?.remove?.();
    const model = modelArg || buildReviewModel();
    if (!model.reviewCount) return model;

    const section = doc.createElement("article");
    section.className = "aha-panel aha-personal-ai-memory-review";
    section.setAttribute("data-personal-ai-memory-review", "true");
    section.innerHTML = `
      <h3>Bør gjennomgås</h3>
      <p class="module-meta">AHA har funnet ${model.reviewCount} mulige ting å se på. Dette er bare varsler; ingenting endres før du gjør det selv.</p>
      ${model.conflicts.length ? `<div><strong>Mulige motsetninger</strong><ul class="aha-training-recommendations">${model.conflicts.slice(0, 5).map((item) => `<li>«${esc(item.first.claimText)}» ↔ «${esc(item.second.claimText)}»</li>`).join("")}</ul></div>` : ""}
      ${model.stale.length ? `<div><strong>Kan være utdatert</strong><ul class="aha-training-recommendations">${model.stale.slice(0, 5).map((item) => `<li>«${esc(item.claimText)}» <span class="module-meta">· sist bekreftet for ${item.ageDays} dager siden</span></li>`).join("")}</ul></div>` : ""}
      <p class="module-meta">Bruk kontrollene under den aktuelle påstanden for å bekrefte, nyansere, markere som utdatert eller erstatte formuleringen.</p>`;
    host.insertBefore(section, host.firstChild || null);
    return model;
  }

  function refresh() { return render(buildReviewModel()); }
  function init() { refresh(); }

  const api = { VERSION, DEFAULT_STALE_DAYS, hasNegation, polarityKey, claimObjects, detectConflicts, staleClaims, buildReviewModel, render, refresh };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AHAPersonalAiMemoryReview = api;

  if (doc) doc.readyState === "loading" ? doc.addEventListener("DOMContentLoaded", init) : init();
})(typeof window !== "undefined" ? window : globalThis);