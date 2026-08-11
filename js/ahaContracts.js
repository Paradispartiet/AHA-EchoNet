// ahaContracts.js
// Fase 2: felles datakontrakt for AHA-modulobjekter.
// Browser-script uten build step / uten ES modules.

(function (global) {
  "use strict";

  const INSIGHT_QUALITY_CONTRACT_VERSION = "aha_insight_quality_contract_v1";
  const CHAMBER_KEY = "aha_insight_chamber_v1";

  function uid(prefix) {
    return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  }

  function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function normalizeTags(tags) {
    const raw = Array.isArray(tags)
      ? tags
      : (typeof tags === "string" ? tags.split(",") : []);

    const seen = new Set();
    const out = [];

    raw.forEach((tag) => {
      const value = String(tag || "").trim();
      if (!value) return;
      const key = value.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(value);
    });

    return out;
  }

  function createLinkedItem(input) {
    const src = safeObject(input);
    const id = String(src.id || src.ref_id || "").trim();

    return {
      id,
      type: String(src.type || "reference").trim() || "reference",
      source: String(src.source || src.source_app || src.source_type || "aha").trim() || "aha",
      title: String(src.title || "").trim()
    };
  }

  function normalizeLinkedItems(items) {
    if (!Array.isArray(items)) return [];

    return items
      .map((item) => createLinkedItem(item))
      .filter((item) => item.id || item.title);
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

    if (!String(src.type || "").trim() && defs.type !== undefined) {
      base.type = String(defs.type).trim() || "item";
    }

    const srcSource = String(src.source || src.source_app || src.source_type || "").trim();
    if (!srcSource && (defs.source !== undefined || defs.source_app !== undefined || defs.source_type !== undefined)) {
      const defaultSource = String(defs.source || defs.source_app || defs.source_type || "").trim();
      base.source = defaultSource || "aha";
    }

    return base;
  }

  function isValidBaseItem(item) {
    if (!item || typeof item !== "object") return false;
    if (!String(item.id || "").trim()) return false;
    if (!String(item.type || "").trim()) return false;
    if (!String(item.source || "").trim()) return false;
    return true;
  }

  function normalizeFingerprintText(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}\s-]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function stableHash(value) {
    const text = String(value || "");
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function stableFingerprint(value, prefix) {
    const normalized = normalizeFingerprintText(value);
    if (!normalized) return "";
    return `${String(prefix || "fp")}_${stableHash(normalized)}`;
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

  function candidateAcceptanceBasis(origin) {
    if (origin === "ai") return "chat_candidate_filter";
    if (origin === "semantic") return "chat_semantic_candidate_builder";
    if (origin === "synthetic") return "chat_analysis_candidate_builder";
    return "caller_supplied_candidate";
  }

  function candidateQualityDescriptor(candidate, fingerprint) {
    const origin = candidateOrigin(candidate);
    const rawConfidence = candidate && typeof candidate === "object" ? Number(candidate.confidence) : NaN;
    const quality = {
      version: INSIGHT_QUALITY_CONTRACT_VERSION,
      status: "accepted_for_ingest",
      origin,
      acceptance_basis: candidateAcceptanceBasis(origin),
      candidate_fingerprint: fingerprint
    };
    if (Number.isFinite(rawConfidence)) quality.confidence = rawConfidence;
    return quality;
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
      if (!fingerprint) {
        emptySkipped += 1;
        return;
      }
      if (seen.has(fingerprint)) {
        duplicatesSkipped += 1;
        return;
      }
      seen.add(fingerprint);

      const quality = candidateQualityDescriptor(candidate, fingerprint);
      const origin = quality.origin;
      const nextCandidate = candidate && typeof candidate === "object" && !Array.isArray(candidate)
        ? Object.assign({}, candidate, {
          candidate_fingerprint: fingerprint,
          candidate_origin: origin,
          candidate_quality: quality
        })
        : candidate;

      prepared.push(nextCandidate);
      descriptors.push({ fingerprint, origin, quality, text });
    });

    return {
      candidates: prepared,
      descriptors,
      candidateCount: list.length,
      uniqueCandidateCount: prepared.length,
      duplicatesSkipped,
      emptySkipped
    };
  }

  function loadInsightQualityChamber() {
    try {
      if (typeof global.loadChamberFromStorage === "function") return global.loadChamberFromStorage();
      const raw = global.localStorage?.getItem?.(CHAMBER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveInsightQualityChamber(chamber) {
    if (!chamber || typeof chamber !== "object") return false;
    try {
      if (typeof global.saveChamberToStorage === "function") {
        global.saveChamberToStorage(chamber);
        return true;
      }
      global.localStorage?.setItem?.(CHAMBER_KEY, JSON.stringify(chamber));
      return true;
    } catch {
      return false;
    }
  }

  function enrichCandidateResultItem(item, descriptor, sourceEventId) {
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
    const chamber = loadInsightQualityChamber();
    if (!chamber || !Array.isArray(chamber.insights)) return false;
    let changed = false;

    items.forEach((item, index) => {
      const insightId = String(item?.meta?.insight_id || "").trim();
      if (!insightId) return;
      const target = chamber.insights.find((insight) => String(insight?.id || "") === insightId);
      if (!target) return;

      const signalFingerprint = stableFingerprint(item?.signal?.text || "", "cand");
      const descriptor = descriptors.find((entry) => entry.fingerprint === signalFingerprint) || descriptors[index];
      if (!descriptor) return;
      const quality = enrichCandidateResultItem(item, descriptor, sourceEventId);
      const evidence = {
        version: INSIGHT_QUALITY_CONTRACT_VERSION,
        source_event_id: sourceEventId || null,
        candidate_fingerprint: descriptor.fingerprint,
        candidate_origin: descriptor.origin,
        status: quality.status,
        acceptance_basis: quality.acceptance_basis
      };
      if (Number.isFinite(quality.confidence)) evidence.confidence = quality.confidence;

      const existing = Array.isArray(target.candidate_provenance) ? target.candidate_provenance.slice() : [];
      const evidenceKey = `${evidence.source_event_id || ""}|${evidence.candidate_fingerprint}`;
      const alreadyPresent = existing.some((entry) => `${entry?.source_event_id || ""}|${entry?.candidate_fingerprint || ""}` === evidenceKey);
      if (!alreadyPresent) existing.push(evidence);

      target.candidate_provenance = existing.slice(-20);
      target.candidate_fingerprint = descriptor.fingerprint;
      target.candidate_origin = descriptor.origin;
      target.candidate_quality = quality;
      if (!target.source_event_id && sourceEventId) target.source_event_id = sourceEventId;
      changed = true;
    });

    if (changed) saveInsightQualityChamber(chamber);
    return changed;
  }

  function installInsightQualityContract() {
    const ingestApi = global.AHAIngest;
    if (!ingestApi || typeof ingestApi.ingestWithCandidates !== "function") return false;
    if (ingestApi.__ahaInsightQualityContractInstalled === true) return true;

    const originalIngestWithCandidates = ingestApi.ingestWithCandidates;
    ingestApi.ingestWithCandidates = function insightQualityIngestWithCandidates(input, candidates) {
      const prepared = prepareInsightCandidates(candidates);
      const sourceText = String(input?.text || input?.title || "").trim();
      const sourceFingerprint = stableFingerprint(sourceText, "src");
      const inputMeta = safeObject(input?.meta);
      const contractMeta = {
        version: INSIGHT_QUALITY_CONTRACT_VERSION,
        source_fingerprint: sourceFingerprint || null,
        candidate_count: prepared.candidateCount,
        unique_candidate_count: prepared.uniqueCandidateCount,
        duplicates_skipped: prepared.duplicatesSkipped,
        empty_skipped: prepared.emptySkipped
      };
      const enrichedInput = Object.assign({}, input || {}, {
        meta: Object.assign({}, inputMeta, { insight_quality_contract: contractMeta })
      });

      const result = originalIngestWithCandidates.call(this, enrichedInput, prepared.candidates);
      if (!result || typeof result !== "object") return result;

      const sourceEventId = String(result?.sourceEvent?.id || "").trim() || null;
      if (Array.isArray(result.items)) {
        result.items.forEach((item, index) => {
          const signalFingerprint = stableFingerprint(item?.signal?.text || "", "cand");
          const descriptor = prepared.descriptors.find((entry) => entry.fingerprint === signalFingerprint) || prepared.descriptors[index];
          enrichCandidateResultItem(item, descriptor, sourceEventId);
        });
        persistCandidateProvenance(result.items, prepared.descriptors, sourceEventId);
      }

      result.duplicates_skipped = prepared.duplicatesSkipped;
      result.empty_candidates_skipped = prepared.emptySkipped;
      result.quality_contract = INSIGHT_QUALITY_CONTRACT_VERSION;
      return result;
    };

    ingestApi.__ahaInsightQualityContractInstalled = true;
    ingestApi.__ahaInsightQualityOriginal = originalIngestWithCandidates;
    return true;
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
    INSIGHT_QUALITY_CONTRACT_VERSION
  };

  // chat.html laster ahaIngest.js umiddelbart før denne filen. Dermed kan
  // kontrakten legges rundt canonical ingest uten ny motor eller ny write-path.
  installInsightQualityContract();
})(window);
