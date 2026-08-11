// ahaContracts.js
// Fase 2: felles datakontrakt for AHA-modulobjekter.
// Browser-script uten build step / uten ES modules.

(function (global) {
  "use strict";

  const QUALITY_VERSION = "aha_insight_quality_contract_v1";
  const CHAMBER_KEY = "aha_insight_chamber_v1";

  function uid(prefix) {
    return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  }

  function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function normalizeTags(tags) {
    const raw = Array.isArray(tags) ? tags : (typeof tags === "string" ? tags.split(",") : []);
    const seen = new Set();
    return raw.map((tag) => String(tag || "").trim()).filter((tag) => {
      if (!tag) return false;
      const key = tag.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function createLinkedItem(input) {
    const src = safeObject(input);
    return {
      id: String(src.id || src.ref_id || "").trim(),
      type: String(src.type || "reference").trim() || "reference",
      source: String(src.source || src.source_app || src.source_type || "aha").trim() || "aha",
      title: String(src.title || "").trim()
    };
  }

  function normalizeLinkedItems(items) {
    if (!Array.isArray(items)) return [];
    return items.map(createLinkedItem).filter((item) => item.id || item.title);
  }

  function createBaseItem(input) {
    const src = safeObject(input);
    const now = new Date().toISOString();
    return {
      id: String(src.id || uid("aha")).trim(),
      title: String(src.title || "").trim(),
      type: String(src.type || "item").trim() || "item",
      source: String(src.source || src.source_app || src.source_type || "aha").trim() || "aha",
      createdAt: src.createdAt || src.created_at || now,
      updatedAt: src.updatedAt || src.updated_at || src.createdAt || src.created_at || now,
      tags: normalizeTags(src.tags),
      linkedItems: normalizeLinkedItems(src.linkedItems || src.linked_items),
      meta: safeObject(src.meta)
    };
  }

  function normalizeBaseItem(input, defaults) {
    const src = safeObject(input);
    const defs = safeObject(defaults);
    const now = new Date().toISOString();
    const merged = {
      id: src.id || defs.id || uid("aha"),
      title: src.title || defs.title || "",
      type: src.type || defs.type || "item",
      source: src.source || defs.source || src.source_app || src.source_type || defs.source_app || defs.source_type || "aha",
      createdAt: src.createdAt || src.created_at || defs.createdAt || defs.created_at || now,
      updatedAt: src.updatedAt || src.updated_at || defs.updatedAt || defs.updated_at || src.createdAt || src.created_at || defs.createdAt || defs.created_at || now,
      tags: src.tags !== undefined ? src.tags : defs.tags,
      linkedItems: src.linkedItems !== undefined ? src.linkedItems : (src.linked_items !== undefined ? src.linked_items : (defs.linkedItems !== undefined ? defs.linkedItems : defs.linked_items)),
      meta: src.meta !== undefined ? src.meta : defs.meta
    };
    const base = createBaseItem(merged);
    if (!String(src.type || "").trim() && defs.type !== undefined) base.type = String(defs.type).trim() || "item";
    const srcSource = String(src.source || src.source_app || src.source_type || "").trim();
    if (!srcSource && (defs.source !== undefined || defs.source_app !== undefined || defs.source_type !== undefined)) {
      base.source = String(defs.source || defs.source_app || defs.source_type || "").trim() || "aha";
    }
    return base;
  }

  function isValidBaseItem(item) {
    return Boolean(item && typeof item === "object" && String(item.id || "").trim() && String(item.type || "").trim() && String(item.source || "").trim());
  }

  function normalizeFingerprintText(value) {
    return String(value || "").toLowerCase().normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}\s-]/gu, " ")
      .replace(/\s+/g, " ").trim();
  }

  function stableFingerprint(value, prefix = "fp") {
    const text = normalizeFingerprintText(value);
    if (!text) return "";
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `${prefix}_${(hash >>> 0).toString(16).padStart(8, "0")}`;
  }

  function candidateText(candidate) {
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      return String(candidate.text || candidate.summary || candidate.title || "").trim();
    }
    return String(candidate || "").trim();
  }

  function candidateOrigin(candidate) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return "raw";
    return String(candidate.candidate_type || candidate.origin || candidate.source || "object").trim().toLowerCase() || "object";
  }

  function acceptanceBasis(origin) {
    if (origin === "ai") return "chat_candidate_filter";
    if (origin === "semantic") return "chat_semantic_candidate_builder";
    if (origin === "synthetic") return "chat_analysis_candidate_builder";
    return "caller_supplied_candidate";
  }

  function prepareInsightCandidates(candidates) {
    const list = Array.isArray(candidates) ? candidates : [];
    const seen = new Set();
    const prepared = [];
    const descriptors = [];
    let duplicatesSkipped = 0;
    let emptySkipped = 0;

    list.forEach((candidate) => {
      const text = candidateText(candidate);
      const fingerprint = stableFingerprint(text, "cand");
      if (!fingerprint) { emptySkipped += 1; return; }
      if (seen.has(fingerprint)) { duplicatesSkipped += 1; return; }
      seen.add(fingerprint);
      const origin = candidateOrigin(candidate);
      const quality = {
        version: QUALITY_VERSION,
        status: "accepted_for_ingest",
        origin,
        acceptance_basis: acceptanceBasis(origin),
        candidate_fingerprint: fingerprint
      };
      const confidence = candidate && typeof candidate === "object" ? Number(candidate.confidence) : NaN;
      if (Number.isFinite(confidence)) quality.confidence = confidence;
      const next = candidate && typeof candidate === "object" && !Array.isArray(candidate)
        ? Object.assign({}, candidate, { candidate_fingerprint: fingerprint, candidate_origin: origin, candidate_quality: quality })
        : candidate;
      prepared.push(next);
      descriptors.push({ fingerprint, origin, quality, text });
    });

    return { candidates: prepared, descriptors, candidateCount: list.length, uniqueCandidateCount: prepared.length, duplicatesSkipped, emptySkipped };
  }

  function loadChamber() {
    try {
      if (typeof global.loadChamberFromStorage === "function") return global.loadChamberFromStorage();
      const raw = global.localStorage?.getItem?.(CHAMBER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function saveChamber(chamber) {
    try {
      if (typeof global.saveChamberToStorage === "function") { global.saveChamberToStorage(chamber); return true; }
      global.localStorage?.setItem?.(CHAMBER_KEY, JSON.stringify(chamber));
      return true;
    } catch { return false; }
  }

  function enrichResultItem(item, descriptor, sourceEventId) {
    if (!item || !descriptor) return null;
    const quality = Object.assign({}, descriptor.quality, { source_event_id: sourceEventId || null });
    if (item.signal && typeof item.signal === "object") {
      item.signal.candidate_fingerprint = descriptor.fingerprint;
      item.signal.candidate_origin = descriptor.origin;
      item.signal.candidate_quality = quality;
    }
    return quality;
  }

  function persistCandidateProvenance(items, descriptors, sourceEventId) {
    if (!Array.isArray(items) || !items.length) return false;
    const chamber = loadChamber();
    if (!chamber || !Array.isArray(chamber.insights)) return false;
    let changed = false;
    items.forEach((item, index) => {
      const target = chamber.insights.find((insight) => String(insight?.id || "") === String(item?.meta?.insight_id || ""));
      if (!target) return;
      const signalFp = stableFingerprint(item?.signal?.text || "", "cand");
      const descriptor = descriptors.find((entry) => entry.fingerprint === signalFp) || descriptors[index];
      if (!descriptor) return;
      const quality = enrichResultItem(item, descriptor, sourceEventId);
      const evidence = {
        version: QUALITY_VERSION,
        source_event_id: sourceEventId || null,
        candidate_fingerprint: descriptor.fingerprint,
        candidate_origin: descriptor.origin,
        status: quality.status,
        acceptance_basis: quality.acceptance_basis
      };
      if (Number.isFinite(quality.confidence)) evidence.confidence = quality.confidence;
      const existing = Array.isArray(target.candidate_provenance) ? target.candidate_provenance.slice() : [];
      const key = `${evidence.source_event_id || ""}|${evidence.candidate_fingerprint}`;
      if (!existing.some((entry) => `${entry?.source_event_id || ""}|${entry?.candidate_fingerprint || ""}` === key)) existing.push(evidence);
      target.candidate_provenance = existing.slice(-20);
      target.candidate_fingerprint = descriptor.fingerprint;
      target.candidate_origin = descriptor.origin;
      target.candidate_quality = quality;
      if (!target.source_event_id && sourceEventId) target.source_event_id = sourceEventId;
      changed = true;
    });
    if (changed) saveChamber(chamber);
    return changed;
  }

  function installInsightQualityContract() {
    const ingestApi = global.AHAIngest;
    if (!ingestApi || typeof ingestApi.ingestWithCandidates !== "function") return false;
    if (ingestApi.__ahaInsightQualityContractInstalled === true) return true;
    const original = ingestApi.ingestWithCandidates;

    ingestApi.ingestWithCandidates = function qualityWrappedIngest(input, candidates) {
      const prepared = prepareInsightCandidates(candidates);
      const inputMeta = safeObject(input?.meta);
      const contractMeta = {
        version: QUALITY_VERSION,
        source_fingerprint: stableFingerprint(input?.text || input?.title || "", "src") || null,
        candidate_count: prepared.candidateCount,
        unique_candidate_count: prepared.uniqueCandidateCount,
        duplicates_skipped: prepared.duplicatesSkipped,
        empty_skipped: prepared.emptySkipped
      };
      const enrichedInput = Object.assign({}, input || {}, { meta: Object.assign({}, inputMeta, { insight_quality_contract: contractMeta }) });
      const result = original.call(this, enrichedInput, prepared.candidates);
      if (!result || typeof result !== "object") return result;
      const sourceEventId = String(result?.sourceEvent?.id || "").trim() || null;
      if (Array.isArray(result.items)) {
        result.items.forEach((item, index) => {
          const fp = stableFingerprint(item?.signal?.text || "", "cand");
          enrichResultItem(item, prepared.descriptors.find((entry) => entry.fingerprint === fp) || prepared.descriptors[index], sourceEventId);
        });
        persistCandidateProvenance(result.items, prepared.descriptors, sourceEventId);
      }
      result.duplicates_skipped = prepared.duplicatesSkipped;
      result.empty_candidates_skipped = prepared.emptySkipped;
      result.quality_contract = QUALITY_VERSION;
      return result;
    };

    ingestApi.__ahaInsightQualityContractInstalled = true;
    ingestApi.__ahaInsightQualityOriginal = original;
    return true;
  }

  function isChatRuntime() {
    return /(^|\/)chat\.html$/i.test(String(global.location?.pathname || "").trim());
  }

  global.AHAContracts = {
    createBaseItem,
    normalizeBaseItem,
    createLinkedItem,
    normalizeTags,
    normalizeLinkedItems,
    isValidBaseItem,
    normalizeFingerprintText,
    stableFingerprint,
    prepareInsightCandidates,
    persistCandidateProvenance,
    installInsightQualityContract,
    isChatRuntime,
    INSIGHT_QUALITY_CONTRACT_VERSION: QUALITY_VERSION
  };

  // Andre moduler kan laste AHAContracts uten at AHAIngest berøres.
  if (isChatRuntime()) installInsightQualityContract();
})(window);
