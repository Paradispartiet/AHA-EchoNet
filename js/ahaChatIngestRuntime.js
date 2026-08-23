// ahaChatIngestRuntime.js
// Orkestrerer AHA Chat-kandidater inn i kanonisk AHAIngest med eksplisitt legacy-fallback.
// Filen eier også shadow-implementasjonen av SemanticDocumentV1. SemanticDocument
// er en separat modulkontrakt (AHASemanticDocument), men er fortsatt samlokalisert
// her mens V2 bygges i shadow mode uten å endre canonical Insight-output.

(function (global) {
  "use strict";

  const SEMANTIC_DOCUMENT_SCHEMA = "aha_semantic_document_v1";
  const SEMANTIC_DOCUMENT_VERSION = 1;
  const SEMANTIC_DOCUMENT_MODE = "shadow";
  const SEMANTIC_DOCUMENT_STATUS = "claims_relations_shadow";
  const ANALYSIS_CANDIDATE_CACHE_SCHEMA = "aha_analysis_candidate_session_cache_v2";
  const ANALYSIS_CANDIDATE_CACHE_INDEX_KEY = "aha_analysis_candidate_session_cache_v2:index";
  const ANALYSIS_CANDIDATE_CACHE_PREFIX = "aha_analysis_candidate_session_cache_v2:";
  const ANALYSIS_CANDIDATE_CACHE_LIMIT = 32;
  const SEMANTIC_GENERIC_TERMS = new Set([
    "kunnskap", "mennesker", "sted", "samfunn", "refleksjon", "innsikt", "samtale", "analyse",
    "illustrasjon", "logo", "annonse", "sponset", "nødvendighet", "nodvendighet"
  ]);
  const ALLOWED_STRUCTURAL_RELATION_TYPES = Object.freeze(new Set([
    "claim_mentions_entity",
    "claim_mentions_concept"
  ]));
  const SHA256_K = Object.freeze([
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ]);
  let lastShadowSemanticDocument = null;

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function utf8Bytes(value) {
    const bytes = [];
    for (const symbol of String(value || "")) {
      const codePoint = symbol.codePointAt(0);
      if (codePoint <= 0x7f) bytes.push(codePoint);
      else if (codePoint <= 0x7ff) {
        bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
      } else if (codePoint <= 0xffff) {
        bytes.push(
          0xe0 | (codePoint >> 12),
          0x80 | ((codePoint >> 6) & 0x3f),
          0x80 | (codePoint & 0x3f)
        );
      } else {
        bytes.push(
          0xf0 | (codePoint >> 18),
          0x80 | ((codePoint >> 12) & 0x3f),
          0x80 | ((codePoint >> 6) & 0x3f),
          0x80 | (codePoint & 0x3f)
        );
      }
    }
    return bytes;
  }

  function rotr(value, bits) {
    return (value >>> bits) | (value << (32 - bits));
  }

  function sha256Hex(value) {
    const bytes = utf8Bytes(value);
    const bitLength = bytes.length * 8;
    bytes.push(0x80);
    while ((bytes.length % 64) !== 56) bytes.push(0);
    const high = Math.floor(bitLength / 0x100000000);
    const low = bitLength >>> 0;
    bytes.push(
      (high >>> 24) & 0xff, (high >>> 16) & 0xff, (high >>> 8) & 0xff, high & 0xff,
      (low >>> 24) & 0xff, (low >>> 16) & 0xff, (low >>> 8) & 0xff, low & 0xff
    );

    const h = [
      0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,
      0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19
    ];
    const w = new Array(64);

    for (let offset = 0; offset < bytes.length; offset += 64) {
      for (let index = 0; index < 16; index += 1) {
        const base = offset + (index * 4);
        w[index] = (
          (bytes[base] << 24) |
          (bytes[base + 1] << 16) |
          (bytes[base + 2] << 8) |
          bytes[base + 3]
        ) >>> 0;
      }
      for (let index = 16; index < 64; index += 1) {
        const s0 = (rotr(w[index - 15], 7) ^ rotr(w[index - 15], 18) ^ (w[index - 15] >>> 3)) >>> 0;
        const s1 = (rotr(w[index - 2], 17) ^ rotr(w[index - 2], 19) ^ (w[index - 2] >>> 10)) >>> 0;
        w[index] = (w[index - 16] + s0 + w[index - 7] + s1) >>> 0;
      }

      let [a,b,c,d,e,f,g,hh] = h;
      for (let index = 0; index < 64; index += 1) {
        const s1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
        const ch = ((e & f) ^ ((~e) & g)) >>> 0;
        const temp1 = (hh + s1 + ch + SHA256_K[index] + w[index]) >>> 0;
        const s0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
        const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
        const temp2 = (s0 + maj) >>> 0;
        hh = g;
        g = f;
        f = e;
        e = (d + temp1) >>> 0;
        d = c;
        c = b;
        b = a;
        a = (temp1 + temp2) >>> 0;
      }
      h[0] = (h[0] + a) >>> 0;
      h[1] = (h[1] + b) >>> 0;
      h[2] = (h[2] + c) >>> 0;
      h[3] = (h[3] + d) >>> 0;
      h[4] = (h[4] + e) >>> 0;
      h[5] = (h[5] + f) >>> 0;
      h[6] = (h[6] + g) >>> 0;
      h[7] = (h[7] + hh) >>> 0;
    }

    return h.map((word) => word.toString(16).padStart(8, "0")).join("");
  }

  function normalizeSemanticKey(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}\s-]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function trimRange(source, rawStart, rawEnd) {
    let start = Math.max(0, rawStart);
    let end = Math.min(source.length, rawEnd);
    while (start < end && /\s/u.test(source[start])) start += 1;
    while (end > start && /\s/u.test(source[end - 1])) end -= 1;
    return { start, end };
  }

  function buildEvidenceAnchors(sourceText, options = {}) {
    const source = String(sourceText || "");
    if (!source.trim()) return [];
    const sourceHash = String(options.source_text_hash || sha256Hex(source)).trim();
    const ranges = [];
    const blankLineBoundary = /(?:\r?\n)[\t ]*(?:\r?\n)+/g;
    let cursor = 0;
    let match;

    const addRange = (rawStart, rawEnd) => {
      const range = trimRange(source, rawStart, rawEnd);
      if (range.end <= range.start) return;
      ranges.push(range);
    };

    while ((match = blankLineBoundary.exec(source)) !== null) {
      addRange(cursor, match.index);
      cursor = blankLineBoundary.lastIndex;
    }
    addRange(cursor, source.length);

    return ranges.map((range, index) => ({
      id: `ev_${sourceHash.slice(0, 16)}_${String(index + 1).padStart(3, "0")}`,
      index,
      start_offset: range.start,
      end_offset: range.end,
      text: source.slice(range.start, range.end)
    }));
  }

  function countNonWhitespace(value) {
    return (String(value || "").match(/\S/gu) || []).length;
  }

  function buildSemanticQualityGate(overrides = {}) {
    return Object.assign({
      stage: "claims_relations_shadow",
      source_grounded: true,
      structural_relations_only: true,
      interpretation_count: 0,
      unresolved_inference_count: 0,
      synthesis_allowed: false,
      blocking_reasons: [
        "dedicated_semantic_model_not_authoritative",
        "synthesized_insight_quality_gate_not_implemented"
      ]
    }, overrides);
  }

  function buildShadowSemanticDocument(input = {}, options = {}) {
    const sourceText = String(input.source_text ?? input.text ?? "");
    if (!sourceText.trim()) throw new Error("semantic_document_empty_source");
    const sourceTextHash = String(input.source_text_hash || sha256Hex(sourceText)).trim().toLowerCase();
    const evidenceAnchors = buildEvidenceAnchors(sourceText, { source_text_hash: sourceTextHash });
    const sourceNonWhitespace = countNonWhitespace(sourceText);
    const coveredNonWhitespace = evidenceAnchors.reduce((sum, anchor) => sum + countNonWhitespace(anchor.text), 0);
    const generatedAt = String(options.now || input.generated_at || new Date().toISOString());
    const sourceEventId = input.source_event_id == null ? null : String(input.source_event_id).trim() || null;

    return {
      id: `sem_${sourceTextHash.slice(0, 24)}`,
      schema: SEMANTIC_DOCUMENT_SCHEMA,
      version: SEMANTIC_DOCUMENT_VERSION,
      mode: SEMANTIC_DOCUMENT_MODE,
      status: SEMANTIC_DOCUMENT_STATUS,
      source_event_id: sourceEventId,
      source_text_hash: sourceTextHash,
      source_text_hash_algorithm: "sha256",
      source_type: String(input.source_type || "unknown").trim() || "unknown",
      language: String(input.language || "und").trim() || "und",
      analyzer_origin: "deterministic_shadow",
      analyzer_version: SEMANTIC_DOCUMENT_SCHEMA,
      evidence_anchors: evidenceAnchors,
      entities: [],
      concepts: [],
      claims: [],
      relations: [],
      tensions: [],
      candidate_insights: [],
      quality: {
        status: "shadow_claims_relations_pending",
        anchor_count: evidenceAnchors.length,
        entity_count: 0,
        concept_count: 0,
        claim_count: 0,
        relation_count: 0,
        canonical_subject_match_count: 0,
        subject_engine_status: "not_run",
        semantic_quality_gate: buildSemanticQualityGate(),
        source_coverage_non_whitespace: sourceNonWhitespace
          ? Number(Math.min(1, coveredNonWhitespace / sourceNonWhitespace).toFixed(6))
          : 0
      },
      provenance: {
        source_event_id: sourceEventId,
        source_text_hash: sourceTextHash,
        generated_at: generatedAt,
        canonical_write: false,
        persistent_write: false,
        visible_output_changed: false,
        source_evidence_authority: "source_text_offsets",
        reference_support_authority: "subject_engine_fagverk_not_source_evidence"
      }
    };
  }

  function anchorForOffset(anchors, start, end) {
    return (Array.isArray(anchors) ? anchors : []).find((anchor) => (
      start >= anchor.start_offset && end <= anchor.end_offset
    )) || null;
  }

  function escapeRegex(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function findLiteralMentions(sourceText, term, anchors) {
    const source = String(sourceText || "");
    const needle = String(term || "").trim();
    if (!source || !needle) return [];
    let expression;
    try {
      expression = new RegExp(escapeRegex(needle), "giu");
    } catch {
      return [];
    }
    const mentions = [];
    let match;
    while ((match = expression.exec(source)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      const before = start > 0 ? source[start - 1] : "";
      const after = end < source.length ? source[end] : "";
      if ((before && /[\p{L}\p{N}]/u.test(before)) || (after && /[\p{L}\p{N}]/u.test(after))) continue;
      const anchor = anchorForOffset(anchors, start, end);
      if (!anchor) continue;
      mentions.push({
        anchor_id: anchor.id,
        start_offset: start,
        end_offset: end,
        text: source.slice(start, end)
      });
      if (match[0].length === 0) expression.lastIndex += 1;
    }
    return mentions;
  }

  function uniqueMentions(mentions) {
    const seen = new Set();
    return (Array.isArray(mentions) ? mentions : []).filter((mention) => {
      const key = `${mention?.start_offset}:${mention?.end_offset}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => a.start_offset - b.start_offset);
  }

  function looksLikeEntitySurface(value) {
    const text = String(value || "").trim();
    if (!text) return false;
    if (/^[\p{Lu}]{2,}$/u.test(text)) return true;
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 1) return /^\p{Lu}[\p{L}\p{M}'’.-]{2,}$/u.test(text);
    return /^\p{Lu}/u.test(words[0]) && words.some((word, index) => (
      index > 0 && /^\p{Lu}/u.test(word)
    ));
  }

  function collectProperEntitySurfaces(sourceText) {
    const source = String(sourceText || "");
    const out = [];
    const seen = new Set();
    const add = (value) => {
      const label = String(value || "").trim();
      const key = normalizeSemanticKey(label);
      if (!label || !key || seen.has(key)) return;
      seen.add(key);
      out.push(label);
    };

    const multiword = /\p{Lu}[\p{L}\p{M}'’.-]*(?:\s+(?:(?:von|van|de|da|del|di|du|af|av|la|le)\s+)?\p{Lu}[\p{L}\p{M}'’.-]*)+/gu;
    let match;
    while ((match = multiword.exec(source)) !== null) add(match[0]);

    const acronym = /(?:^|[^\p{L}\p{N}])(\p{Lu}{2,})(?=$|[^\p{L}\p{N}])/gu;
    while ((match = acronym.exec(source)) !== null) add(match[1]);
    return out;
  }

  function compactCanonicalSupport(match) {
    if (!match || typeof match !== "object") return null;
    return {
      subject_id: match.subject_id || null,
      subject_label: match.subject_label || null,
      emne_id: match.emne_id || null,
      title: match.title || null,
      match_type: match.type || null,
      score: Number.isFinite(Number(match.score)) ? Number(match.score) : null,
      provenance: match.provenance && typeof match.provenance === "object" ? clone(match.provenance) : null
    };
  }

  function supportKey(support) {
    return [support?.subject_id || "", support?.emne_id || "", support?.title || "", support?.match_type || ""].join("|");
  }

  function mergeEntity(map, surface, type, sourceText, anchors, canonicalSupport) {
    const label = String(surface || "").trim();
    const key = normalizeSemanticKey(label);
    if (!key) return;
    const mentions = findLiteralMentions(sourceText, label, anchors);
    if (!mentions.length) return;
    const current = map.get(key) || {
      id: "",
      label,
      normalized_key: key,
      type: type || "unknown",
      evidence_anchor_ids: [],
      mentions: [],
      canonical_matches: [],
      source: "literal_source_entity"
    };
    if (current.type === "unknown" && type && type !== "unknown") current.type = type;
    current.mentions = uniqueMentions(current.mentions.concat(mentions));
    current.evidence_anchor_ids = Array.from(new Set(current.mentions.map((mention) => mention.anchor_id)));
    if (canonicalSupport) {
      const existing = new Set(current.canonical_matches.map(supportKey));
      const support = compactCanonicalSupport(canonicalSupport);
      const keySupport = supportKey(support);
      if (support && !existing.has(keySupport)) current.canonical_matches.push(support);
    }
    map.set(key, current);
  }

  function conceptTermEligible(term, match, siblingTerms) {
    const label = String(term || "").trim();
    const key = normalizeSemanticKey(label);
    if (!key || key.length < 4 || SEMANTIC_GENERIC_TERMS.has(key)) return false;
    if (/[.!?]\s*$/u.test(label)) return false;
    const words = key.split(/\s+/).filter(Boolean);
    if (words.length > 6) return false;
    if (words.length === 1) {
      if (match?.type !== "concept" || key.length < 5) return false;
      const richerSibling = (Array.isArray(siblingTerms) ? siblingTerms : []).some((other) => {
        const otherKey = normalizeSemanticKey(other);
        return otherKey !== key && otherKey.split(/\s+/).length > 1 && otherKey.split(/\s+/).includes(key);
      });
      if (richerSibling) return false;
    }
    return true;
  }

  function mergeConcept(map, surface, sourceText, anchors, canonicalSupport, entityKeys) {
    const sourceTerm = String(surface || "").trim();
    const key = normalizeSemanticKey(sourceTerm);
    if (!key || entityKeys.has(key)) return;
    const mentions = findLiteralMentions(sourceText, sourceTerm, anchors);
    if (!mentions.length) return;
    const current = map.get(key) || {
      id: "",
      label: sourceTerm,
      normalized_key: key,
      source_term: sourceTerm,
      evidence_anchor_ids: [],
      mentions: [],
      canonical_matches: [],
      source: "subject_engine_literal_match"
    };
    current.mentions = uniqueMentions(current.mentions.concat(mentions));
    current.evidence_anchor_ids = Array.from(new Set(current.mentions.map((mention) => mention.anchor_id)));
    if (canonicalSupport) {
      const existing = new Set(current.canonical_matches.map(supportKey));
      const support = compactCanonicalSupport(canonicalSupport);
      const keySupport = supportKey(support);
      if (support && !existing.has(keySupport)) current.canonical_matches.push(support);
    }
    map.set(key, current);
  }

  function applyEntitiesConcepts(document, sourceText, subjectMatches = [], options = {}) {
    const doc = clone(document);
    const source = String(sourceText || "");
    const anchors = Array.isArray(doc?.evidence_anchors) ? doc.evidence_anchors : [];
    const matches = Array.isArray(subjectMatches) ? subjectMatches : [];
    const entityMap = new Map();

    collectProperEntitySurfaces(source).forEach((surface) => {
      mergeEntity(entityMap, surface, /^[\p{Lu}]{2,}$/u.test(surface) ? "organization" : "unknown", source, anchors, null);
    });

    matches.forEach((match) => {
      if (match?.type !== "thinker") return;
      (Array.isArray(match.matched_terms) ? match.matched_terms : []).forEach((term) => {
        if (!looksLikeEntitySurface(term)) return;
        mergeEntity(entityMap, term, "person", source, anchors, match);
      });
    });

    const entities = Array.from(entityMap.values()).sort((a, b) => (
      (a.mentions[0]?.start_offset ?? Number.MAX_SAFE_INTEGER) - (b.mentions[0]?.start_offset ?? Number.MAX_SAFE_INTEGER)
      || a.normalized_key.localeCompare(b.normalized_key)
    ));
    entities.forEach((entity, index) => {
      entity.id = `ent_${doc.source_text_hash.slice(0, 12)}_${String(index + 1).padStart(3, "0")}`;
    });
    const entityKeys = new Set(entities.map((entity) => entity.normalized_key));

    const conceptMap = new Map();
    matches.forEach((match) => {
      const terms = Array.from(new Set((Array.isArray(match?.matched_terms) ? match.matched_terms : [])
        .map((term) => String(term || "").trim()).filter(Boolean)));
      terms.forEach((term) => {
        if (!conceptTermEligible(term, match, terms)) return;
        mergeConcept(conceptMap, term, source, anchors, match, entityKeys);
      });
    });

    const concepts = Array.from(conceptMap.values()).sort((a, b) => (
      (a.mentions[0]?.start_offset ?? Number.MAX_SAFE_INTEGER) - (b.mentions[0]?.start_offset ?? Number.MAX_SAFE_INTEGER)
      || a.normalized_key.localeCompare(b.normalized_key)
    ));
    concepts.forEach((concept, index) => {
      concept.id = `con_${doc.source_text_hash.slice(0, 12)}_${String(index + 1).padStart(3, "0")}`;
    });

    doc.entities = entities;
    doc.concepts = concepts;
    doc.quality = Object.assign({}, doc.quality, {
      status: "shadow_entities_concepts_ready",
      entity_count: entities.length,
      concept_count: concepts.length,
      canonical_subject_match_count: matches.length,
      subject_engine_status: String(options.subject_engine_status || (matches.length ? "matched" : "no_matches"))
    });
    doc.analyzer_origin = matches.length
      ? "deterministic_shadow+subject_engine_reference"
      : "deterministic_shadow";
    return doc;
  }

  function sentenceSpansForAnchor(sourceText, anchor) {
    const source = String(sourceText || "");
    if (!anchor || typeof anchor !== "object") return [];
    const localText = source.slice(anchor.start_offset, anchor.end_offset);
    const pattern = /[^.!?\n]+(?:[.!?]+|$)/gu;
    const spans = [];
    let match;
    while ((match = pattern.exec(localText)) !== null) {
      const rawStart = anchor.start_offset + match.index;
      const rawEnd = rawStart + match[0].length;
      const range = trimRange(source, rawStart, rawEnd);
      if (range.end <= range.start) continue;
      spans.push({
        anchor_id: anchor.id,
        start_offset: range.start,
        end_offset: range.end,
        text: source.slice(range.start, range.end)
      });
    }
    return spans;
  }

  function isSourceClaimSpan(span) {
    const text = String(span?.text || "").trim();
    if (!text || !/\.$/u.test(text) || /\?/u.test(text)) return false;
    const words = normalizeSemanticKey(text).split(/\s+/).filter(Boolean);
    return words.length >= 5 && words.length <= 80 && /\p{L}/u.test(text);
  }

  function mentionsInsideSpan(items, span) {
    return (Array.isArray(items) ? items : []).filter((item) => (
      (Array.isArray(item?.mentions) ? item.mentions : []).some((mention) => (
        mention.start_offset >= span.start_offset && mention.end_offset <= span.end_offset
      ))
    ));
  }

  function buildSourceClaims(document, sourceText) {
    const doc = document && typeof document === "object" ? document : {};
    const source = String(sourceText || "");
    const spans = (Array.isArray(doc.evidence_anchors) ? doc.evidence_anchors : [])
      .flatMap((anchor) => sentenceSpansForAnchor(source, anchor))
      .filter(isSourceClaimSpan)
      .sort((a, b) => a.start_offset - b.start_offset);

    return spans.map((span, index) => {
      const mentionedEntities = mentionsInsideSpan(doc.entities, span);
      const mentionedConcepts = mentionsInsideSpan(doc.concepts, span);
      return {
        id: `clm_${doc.source_text_hash.slice(0, 12)}_${String(index + 1).padStart(3, "0")}`,
        kind: "source_claim",
        text: span.text,
        normalized_key: normalizeSemanticKey(span.text),
        epistemic_status: "source_explicit",
        interpretation_status: "not_interpreted",
        evidence_anchor_ids: [span.anchor_id],
        spans: [clone(span)],
        mentioned_entity_ids: mentionedEntities.map((item) => item.id),
        mentioned_concept_ids: mentionedConcepts.map((item) => item.id),
        source: "literal_source_sentence"
      };
    });
  }

  function relationEvidenceSpans(claim, target) {
    const claimSpan = Array.isArray(claim?.spans) ? claim.spans[0] : null;
    if (!claimSpan) return [];
    const targetMentions = (Array.isArray(target?.mentions) ? target.mentions : []).filter((mention) => (
      mention.start_offset >= claimSpan.start_offset && mention.end_offset <= claimSpan.end_offset
    ));
    return [clone(claimSpan)].concat(targetMentions.map(clone));
  }

  function buildStructuralRelations(document) {
    const doc = document && typeof document === "object" ? document : {};
    const entityById = new Map((Array.isArray(doc.entities) ? doc.entities : []).map((item) => [item.id, item]));
    const conceptById = new Map((Array.isArray(doc.concepts) ? doc.concepts : []).map((item) => [item.id, item]));
    const pending = [];

    (Array.isArray(doc.claims) ? doc.claims : []).forEach((claim) => {
      (Array.isArray(claim.mentioned_entity_ids) ? claim.mentioned_entity_ids : []).forEach((entityId) => {
        const target = entityById.get(entityId);
        if (!target) return;
        pending.push({
          type: "claim_mentions_entity",
          from_id: claim.id,
          to_id: entityId,
          epistemic_status: "source_structural",
          evidence_anchor_ids: Array.from(new Set(claim.evidence_anchor_ids.concat(target.evidence_anchor_ids || []))),
          evidence_spans: relationEvidenceSpans(claim, target),
          source: "co_occurrence_within_source_claim"
        });
      });
      (Array.isArray(claim.mentioned_concept_ids) ? claim.mentioned_concept_ids : []).forEach((conceptId) => {
        const target = conceptById.get(conceptId);
        if (!target) return;
        pending.push({
          type: "claim_mentions_concept",
          from_id: claim.id,
          to_id: conceptId,
          epistemic_status: "source_structural",
          evidence_anchor_ids: Array.from(new Set(claim.evidence_anchor_ids.concat(target.evidence_anchor_ids || []))),
          evidence_spans: relationEvidenceSpans(claim, target),
          source: "co_occurrence_within_source_claim"
        });
      });
    });

    return pending.map((relation, index) => Object.assign({
      id: `rel_${doc.source_text_hash.slice(0, 12)}_${String(index + 1).padStart(3, "0")}`
    }, relation));
  }

  function applyClaimsRelations(document, sourceText) {
    const doc = clone(document);
    doc.claims = buildSourceClaims(doc, sourceText);
    doc.relations = buildStructuralRelations(doc);
    doc.quality = Object.assign({}, doc.quality, {
      status: "shadow_claims_relations_ready",
      claim_count: doc.claims.length,
      relation_count: doc.relations.length,
      semantic_quality_gate: buildSemanticQualityGate({
        claim_count: doc.claims.length,
        relation_count: doc.relations.length,
        entity_count: Array.isArray(doc.entities) ? doc.entities.length : 0,
        concept_count: Array.isArray(doc.concepts) ? doc.concepts.length : 0
      })
    });
    return doc;
  }

  async function buildEnrichedShadowSemanticDocument(input = {}, options = {}) {
    const sourceText = String(input.source_text ?? input.text ?? "");
    const base = buildShadowSemanticDocument(input, options);
    let matches = Array.isArray(options.subjectMatches) ? options.subjectMatches : null;
    let subjectEngineStatus = matches ? "provided_matches" : "unavailable";

    if (matches === null) {
      const subjectEngine = options.subjectEngine || null;
      if (subjectEngine && typeof subjectEngine.matchText === "function") {
        try {
          const result = await subjectEngine.matchText(sourceText, {
            source: "semantic_document_shadow",
            maxResults: 6
          });
          matches = Array.isArray(result) ? result : [];
          subjectEngineStatus = matches.length ? "matched" : "no_matches";
        } catch (error) {
          matches = [];
          subjectEngineStatus = "failed";
          if (options.logSubjectEngineFailure !== false) {
            console.warn("AHASemanticDocument: Subject Engine enrichment failed", error);
          }
        }
      } else {
        matches = [];
      }
    }

    const withEntitiesConcepts = applyEntitiesConcepts(base, sourceText, matches, {
      subject_engine_status: subjectEngineStatus
    });
    return applyClaimsRelations(withEntitiesConcepts, sourceText);
  }

  function containsForbiddenResponseKeys(value) {
    const forbidden = new Set([
      "assistantreply", "assistant_reply", "chatresponse", "chat_response",
      "airesponse", "ai_response", "modelresponse", "model_response"
    ]);
    const visit = (item) => {
      if (!item || typeof item !== "object") return false;
      for (const [key, nested] of Object.entries(item)) {
        if (forbidden.has(String(key || "").toLowerCase())) return true;
        if (visit(nested)) return true;
      }
      return false;
    };
    return visit(value);
  }

  function validateExactSourceSpan(span, label, source, anchorIds, errors) {
    if (!span || typeof span !== "object") {
      errors.push(`invalid_${label}`);
      return false;
    }
    if (!anchorIds.has(span.anchor_id)) errors.push(`unknown_${label}_anchor`);
    if (!Number.isInteger(span.start_offset) || !Number.isInteger(span.end_offset) || span.end_offset <= span.start_offset) {
      errors.push(`invalid_${label}_offsets`);
      return false;
    }
    if (source != null) {
      if (span.start_offset < 0 || span.end_offset > source.length) {
        errors.push(`${label}_out_of_bounds`);
      } else if (source.slice(span.start_offset, span.end_offset) !== span.text) {
        errors.push(`${label}_not_exact_source_slice`);
      }
    }
    return true;
  }

  function validateGroundedSemanticItem(item, kind, index, source, anchorIds, errors) {
    if (!item || typeof item !== "object") {
      errors.push(`invalid_${kind}:${index}`);
      return;
    }
    if (!String(item.id || "").trim()) errors.push(`missing_${kind}_id:${index}`);
    if (!String(item.label || "").trim()) errors.push(`missing_${kind}_label:${index}`);
    if (!String(item.normalized_key || "").trim()) errors.push(`missing_${kind}_key:${index}`);
    const evidenceIds = Array.isArray(item.evidence_anchor_ids) ? item.evidence_anchor_ids : [];
    if (!evidenceIds.length) errors.push(`missing_${kind}_evidence:${index}`);
    evidenceIds.forEach((anchorId) => {
      if (!anchorIds.has(anchorId)) errors.push(`unknown_${kind}_anchor:${index}`);
    });
    const mentions = Array.isArray(item.mentions) ? item.mentions : [];
    if (!mentions.length) errors.push(`missing_${kind}_mentions:${index}`);
    mentions.forEach((mention, mentionIndex) => {
      validateExactSourceSpan(mention, `${kind}_mention:${index}:${mentionIndex}`, source, anchorIds, errors);
    });
    if (kind === "concept" && !Array.isArray(item.canonical_matches)) {
      errors.push(`missing_concept_canonical_matches:${index}`);
    }
  }

  function validateClaim(claim, index, source, anchorIds, entityIds, conceptIds, errors) {
    if (!claim || typeof claim !== "object") {
      errors.push(`invalid_claim:${index}`);
      return;
    }
    if (!String(claim.id || "").trim()) errors.push(`missing_claim_id:${index}`);
    if (claim.kind !== "source_claim") errors.push(`invalid_claim_kind:${index}`);
    if (claim.epistemic_status !== "source_explicit") errors.push(`invalid_claim_epistemic_status:${index}`);
    if (claim.interpretation_status !== "not_interpreted") errors.push(`invalid_claim_interpretation_status:${index}`);
    if (claim.source !== "literal_source_sentence") errors.push(`invalid_claim_source:${index}`);
    const evidenceIds = Array.isArray(claim.evidence_anchor_ids) ? claim.evidence_anchor_ids : [];
    if (!evidenceIds.length) errors.push(`missing_claim_evidence:${index}`);
    evidenceIds.forEach((anchorId) => {
      if (!anchorIds.has(anchorId)) errors.push(`unknown_claim_anchor:${index}`);
    });
    const spans = Array.isArray(claim.spans) ? claim.spans : [];
    if (spans.length !== 1) errors.push(`invalid_claim_span_count:${index}`);
    spans.forEach((span, spanIndex) => {
      validateExactSourceSpan(span, `claim_span:${index}:${spanIndex}`, source, anchorIds, errors);
      if (spanIndex === 0 && String(claim.text || "") !== String(span?.text || "")) {
        errors.push(`claim_text_not_span:${index}`);
      }
    });
    (Array.isArray(claim.mentioned_entity_ids) ? claim.mentioned_entity_ids : []).forEach((id) => {
      if (!entityIds.has(id)) errors.push(`unknown_claim_entity:${index}`);
    });
    (Array.isArray(claim.mentioned_concept_ids) ? claim.mentioned_concept_ids : []).forEach((id) => {
      if (!conceptIds.has(id)) errors.push(`unknown_claim_concept:${index}`);
    });
  }

  function sameSpan(left, right) {
    return Boolean(left && right)
      && left.anchor_id === right.anchor_id
      && left.start_offset === right.start_offset
      && left.end_offset === right.end_offset
      && left.text === right.text;
  }

  function validateRelation(relation, index, source, anchorIds, claimById, entityById, conceptById, errors) {
    if (!relation || typeof relation !== "object") {
      errors.push(`invalid_relation:${index}`);
      return;
    }
    if (!String(relation.id || "").trim()) errors.push(`missing_relation_id:${index}`);
    if (!ALLOWED_STRUCTURAL_RELATION_TYPES.has(relation.type)) errors.push(`invalid_relation_type:${index}`);
    if (relation.epistemic_status !== "source_structural") errors.push(`invalid_relation_epistemic_status:${index}`);
    if (relation.source !== "co_occurrence_within_source_claim") errors.push(`invalid_relation_source:${index}`);
    const claim = claimById.get(relation.from_id);
    if (!claim) errors.push(`unknown_relation_claim:${index}`);
    const target = relation.type === "claim_mentions_entity"
      ? entityById.get(relation.to_id)
      : relation.type === "claim_mentions_concept"
        ? conceptById.get(relation.to_id)
        : null;
    if (!target) errors.push(`unknown_relation_target:${index}`);

    const evidenceIds = Array.isArray(relation.evidence_anchor_ids) ? relation.evidence_anchor_ids : [];
    if (!evidenceIds.length) errors.push(`missing_relation_evidence:${index}`);
    evidenceIds.forEach((anchorId) => {
      if (!anchorIds.has(anchorId)) errors.push(`unknown_relation_anchor:${index}`);
    });
    const spans = Array.isArray(relation.evidence_spans) ? relation.evidence_spans : [];
    if (spans.length < 2) errors.push(`insufficient_relation_evidence_spans:${index}`);
    spans.forEach((span, spanIndex) => {
      validateExactSourceSpan(span, `relation_span:${index}:${spanIndex}`, source, anchorIds, errors);
    });
    if (claim && Array.isArray(claim.spans) && claim.spans[0] && !spans.some((span) => sameSpan(span, claim.spans[0]))) {
      errors.push(`relation_missing_claim_span:${index}`);
    }
    if (claim && target) {
      const claimSpan = claim.spans?.[0];
      const targetMentions = (Array.isArray(target.mentions) ? target.mentions : []).filter((mention) => (
        claimSpan && mention.start_offset >= claimSpan.start_offset && mention.end_offset <= claimSpan.end_offset
      ));
      if (!targetMentions.length) errors.push(`relation_target_not_in_claim:${index}`);
      if (targetMentions.length && !targetMentions.some((mention) => spans.some((span) => sameSpan(span, mention)))) {
        errors.push(`relation_missing_target_span:${index}`);
      }
    }
  }

  function validateSemanticDocument(document, sourceText) {
    const errors = [];
    const doc = document && typeof document === "object" && !Array.isArray(document) ? document : null;
    if (!doc) return { ok: false, errors: ["document_not_object"] };
    if (doc.schema !== SEMANTIC_DOCUMENT_SCHEMA) errors.push("invalid_schema");
    if (doc.version !== SEMANTIC_DOCUMENT_VERSION) errors.push("invalid_version");
    if (doc.mode !== SEMANTIC_DOCUMENT_MODE) errors.push("invalid_mode");
    if (doc.status !== SEMANTIC_DOCUMENT_STATUS) errors.push("invalid_status");
    if (!/^[a-f0-9]{64}$/u.test(String(doc.source_text_hash || ""))) errors.push("invalid_source_text_hash");
    if (doc.source_text_hash_algorithm !== "sha256") errors.push("invalid_hash_algorithm");
    if (!doc.source_event_id && !doc.source_text_hash) errors.push("missing_source_identity");

    const semanticArrays = ["evidence_anchors", "entities", "concepts", "claims", "relations", "tensions", "candidate_insights"];
    semanticArrays.forEach((key) => {
      if (!Array.isArray(doc[key])) errors.push(`missing_array:${key}`);
    });
    ["tensions", "candidate_insights"].forEach((key) => {
      if (Array.isArray(doc[key]) && doc[key].length) errors.push(`shadow_semantic_array_not_empty:${key}`);
    });

    const anchors = Array.isArray(doc.evidence_anchors) ? doc.evidence_anchors : [];
    const anchorIds = new Set();
    let previousEnd = -1;
    const source = sourceText == null ? null : String(sourceText);
    anchors.forEach((anchor, index) => {
      if (!anchor || typeof anchor !== "object") {
        errors.push(`invalid_anchor:${index}`);
        return;
      }
      const id = String(anchor.id || "");
      if (!id || anchorIds.has(id)) errors.push(`invalid_anchor_id:${index}`);
      anchorIds.add(id);
      if (!Number.isInteger(anchor.start_offset) || !Number.isInteger(anchor.end_offset)) {
        errors.push(`invalid_anchor_offsets:${index}`);
        return;
      }
      if (anchor.start_offset < 0 || anchor.end_offset <= anchor.start_offset) errors.push(`invalid_anchor_range:${index}`);
      if (anchor.start_offset < previousEnd) errors.push(`overlapping_anchor:${index}`);
      previousEnd = anchor.end_offset;
      if (source != null) {
        if (anchor.end_offset > source.length) errors.push(`anchor_out_of_bounds:${index}`);
        else if (source.slice(anchor.start_offset, anchor.end_offset) !== anchor.text) errors.push(`anchor_not_exact_source_slice:${index}`);
      }
    });

    const itemIds = new Set();
    const entities = Array.isArray(doc.entities) ? doc.entities : [];
    const concepts = Array.isArray(doc.concepts) ? doc.concepts : [];
    const claims = Array.isArray(doc.claims) ? doc.claims : [];
    const relations = Array.isArray(doc.relations) ? doc.relations : [];
    const entityIds = new Set();
    const conceptIds = new Set();
    const claimIds = new Set();

    entities.forEach((entity, index) => {
      validateGroundedSemanticItem(entity, "entity", index, source, anchorIds, errors);
      const id = String(entity?.id || "");
      if (id && itemIds.has(id)) errors.push(`duplicate_semantic_item_id:${id}`);
      if (id) { itemIds.add(id); entityIds.add(id); }
    });
    concepts.forEach((concept, index) => {
      validateGroundedSemanticItem(concept, "concept", index, source, anchorIds, errors);
      const id = String(concept?.id || "");
      if (id && itemIds.has(id)) errors.push(`duplicate_semantic_item_id:${id}`);
      if (id) { itemIds.add(id); conceptIds.add(id); }
      if (!Array.isArray(concept?.canonical_matches) || concept.canonical_matches.length === 0) {
        errors.push(`concept_without_reference_support:${index}`);
      }
    });
    claims.forEach((claim, index) => {
      validateClaim(claim, index, source, anchorIds, entityIds, conceptIds, errors);
      const id = String(claim?.id || "");
      if (id && itemIds.has(id)) errors.push(`duplicate_semantic_item_id:${id}`);
      if (id) { itemIds.add(id); claimIds.add(id); }
    });

    const claimById = new Map(claims.map((claim) => [claim.id, claim]));
    const entityById = new Map(entities.map((entity) => [entity.id, entity]));
    const conceptById = new Map(concepts.map((concept) => [concept.id, concept]));
    relations.forEach((relation, index) => {
      validateRelation(relation, index, source, anchorIds, claimById, entityById, conceptById, errors);
      const id = String(relation?.id || "");
      if (id && itemIds.has(id)) errors.push(`duplicate_semantic_item_id:${id}`);
      if (id) itemIds.add(id);
    });

    const gate = doc.quality?.semantic_quality_gate;
    if (!gate || typeof gate !== "object") errors.push("missing_semantic_quality_gate");
    else {
      if (gate.stage !== "claims_relations_shadow") errors.push("invalid_semantic_quality_gate_stage");
      if (gate.source_grounded !== true) errors.push("semantic_quality_gate_not_source_grounded");
      if (gate.structural_relations_only !== true) errors.push("semantic_quality_gate_relations_not_structural_only");
      if (gate.synthesis_allowed !== false) errors.push("semantic_quality_gate_must_block_synthesis");
      if (Number(gate.interpretation_count || 0) !== 0) errors.push("semantic_quality_gate_interpretation_not_zero");
      if (Number(gate.unresolved_inference_count || 0) !== 0) errors.push("semantic_quality_gate_inference_not_zero");
    }

    if (containsForbiddenResponseKeys(doc)) errors.push("forbidden_chat_response_dependency");
    if (doc.provenance?.canonical_write !== false) errors.push("shadow_canonical_write_must_be_false");
    if (doc.provenance?.persistent_write !== false) errors.push("shadow_persistent_write_must_be_false");

    return { ok: errors.length === 0, errors };
  }

  function dispatchShadowSummary(document) {
    if (typeof global.dispatchEvent !== "function" || typeof global.CustomEvent !== "function") return;
    try {
      global.dispatchEvent(new global.CustomEvent("aha:semantic-document-shadow", {
        detail: {
          schema: document.schema,
          version: document.version,
          status: document.status,
          source_event_id: document.source_event_id,
          source_text_hash: document.source_text_hash,
          evidence_anchor_count: document.evidence_anchors.length,
          entity_count: document.entities.length,
          concept_count: document.concepts.length,
          claim_count: document.claims.length,
          relation_count: document.relations.length,
          synthesis_allowed: document.quality?.semantic_quality_gate?.synthesis_allowed === true
        }
      }));
    } catch {}
  }

  function recordShadowSemanticDocument(document) {
    const validation = validateSemanticDocument(document);
    if (!validation.ok) {
      const error = new Error(`semantic_document_invalid:${validation.errors.join(",")}`);
      error.validation = validation;
      throw error;
    }
    lastShadowSemanticDocument = clone(document);
    dispatchShadowSummary(lastShadowSemanticDocument);
    return clone(lastShadowSemanticDocument);
  }

  function getLastShadowSemanticDocument() {
    return clone(lastShadowSemanticDocument);
  }

  function clearLastShadowSemanticDocument() {
    lastShadowSemanticDocument = null;
  }

  const semanticDocumentApi = Object.freeze({
    SCHEMA: SEMANTIC_DOCUMENT_SCHEMA,
    VERSION: SEMANTIC_DOCUMENT_VERSION,
    sha256Hex,
    normalizeSemanticKey,
    buildEvidenceAnchors,
    buildShadowSemanticDocument,
    findLiteralMentions,
    applyEntitiesConcepts,
    sentenceSpansForAnchor,
    buildSourceClaims,
    buildStructuralRelations,
    applyClaimsRelations,
    buildEnrichedShadowSemanticDocument,
    validateSemanticDocument,
    recordShadowSemanticDocument,
    getLastShadowSemanticDocument,
    clearLastShadowSemanticDocument
  });
  global.AHASemanticDocument = semanticDocumentApi;
  global.AHAModuleApi?.register?.("semanticDocument", semanticDocumentApi, {
    version: 1,
    legacyGlobal: "AHASemanticDocument",
    exports: Object.keys(semanticDocumentApi)
  });

  function create(deps = {}) {
    const {
      subjectId,
      getInsightsApi,
      getIngestApi,
      getSourcesApi,
      getThemeId,
      getFieldId,
      buildSemanticInsightCandidates,
      generateAIInsightCandidates,
      buildAIState,
      isMemoryUseEnabled = () => true,
      loadChamber,
      saveChamber,
      candidateCacheStorage = global.sessionStorage || null,
      getSemanticDocumentApi = () => (
        global.AHAModuleApi?.resolve?.("semanticDocument", "AHASemanticDocument", { version: 1 })
        || global.AHASemanticDocument
        || null
      ),
      getSubjectEngineApi = () => (
        global.AHAModuleApi?.resolve?.("subjectEngine", "AHASubjectEngine", { version: 1 })
        || global.AHASubjectEngine
        || null
      ),
      now = () => new Date().toISOString()
    } = deps;
    let semanticShadowSequence = 0;
    const analysisCandidateRequests = new Map();

    function readSessionCandidates(requestKey) {
      try {
        const parsed = JSON.parse(candidateCacheStorage?.getItem?.(`${ANALYSIS_CANDIDATE_CACHE_PREFIX}${requestKey}`) || "null");
        if (parsed?.schema !== ANALYSIS_CANDIDATE_CACHE_SCHEMA || parsed?.request_key !== requestKey || !Array.isArray(parsed?.candidates)) return null;
        return clone(parsed.candidates);
      } catch {
        return null;
      }
    }

    function writeSessionCandidates(requestKey, candidates) {
      try {
        if (!candidateCacheStorage?.setItem) return;
        const rawIndex = JSON.parse(candidateCacheStorage.getItem?.(ANALYSIS_CANDIDATE_CACHE_INDEX_KEY) || "[]");
        const index = (Array.isArray(rawIndex) ? rawIndex : []).filter((key) => typeof key === "string" && key !== requestKey);
        index.push(requestKey);
        while (index.length > ANALYSIS_CANDIDATE_CACHE_LIMIT) {
          candidateCacheStorage.removeItem?.(`${ANALYSIS_CANDIDATE_CACHE_PREFIX}${index.shift()}`);
        }
        candidateCacheStorage.setItem(`${ANALYSIS_CANDIDATE_CACHE_PREFIX}${requestKey}`, JSON.stringify({
          schema: ANALYSIS_CANDIDATE_CACHE_SCHEMA,
          request_key: requestKey,
          candidates: clone(candidates)
        }));
        candidateCacheStorage.setItem(ANALYSIS_CANDIDATE_CACHE_INDEX_KEY, JSON.stringify(index));
      } catch {}
    }

    function buildChatPayload(text, themeId, fieldId) {
      return {
        source_type: "chat",
        source_app: "aha_chat",
        content_type: "text",
        title: "AHA Chat-melding",
        text,
        user_created: true,
        imported: false,
        created_at: now(),
        subject_id: subjectId,
        theme_id: themeId,
        field_id: fieldId,
        meta: { theme_id: themeId, field_id: fieldId }
      };
    }

    async function recordSemanticDocumentShadow(payload, ingestResult) {
      const sequence = ++semanticShadowSequence;
      const api = typeof getSemanticDocumentApi === "function" ? getSemanticDocumentApi() : null;
      if (!api?.buildShadowSemanticDocument || !api?.recordShadowSemanticDocument) return null;
      try {
        const sourceEvent = ingestResult?.sourceEvent || null;
        const semanticInput = {
          source_event_id: sourceEvent?.id || null,
          source_text: payload.text,
          source_type: sourceEvent?.source_type || payload.source_type,
          language: payload.meta?.language || "no",
          generated_at: payload.created_at
        };
        const subjectEngine = typeof getSubjectEngineApi === "function" ? getSubjectEngineApi() : null;
        const document = typeof api.buildEnrichedShadowSemanticDocument === "function"
          ? await api.buildEnrichedShadowSemanticDocument(semanticInput, { subjectEngine })
          : api.buildShadowSemanticDocument(semanticInput);

        if (sequence !== semanticShadowSequence) return null;

        const validation = api.validateSemanticDocument?.(document, payload.text);
        if (validation && validation.ok === false) {
          console.warn("AHAChatIngestRuntime: SemanticDocument shadow validation failed", validation.errors);
          return null;
        }
        return api.recordShadowSemanticDocument(document);
      } catch (error) {
        // V2 er fortsatt shadow-only. En feil i den nye representasjonen skal
        // ikke stoppe dagens canonical ingest. Når laget blir authoritative må
        // denne grensen endres til fail-closed før canonical Insight-write.
        console.warn("AHAChatIngestRuntime: SemanticDocument shadow failed", error);
        return null;
      }
    }

    function ingestThroughLegacyFallback(engine, payload, chunks) {
      let chamber = loadChamber();
      chunks.forEach((chunk) => {
        const candidateText = typeof chunk === "string"
          ? chunk
          : String(chunk?.text || chunk?.summary || chunk?.title || "").trim();
        if (!candidateText) return;
        const signal = engine.createSignalFromMessage(
          candidateText,
          subjectId,
          payload.theme_id,
          { field_id: payload.field_id }
        );
        chamber = engine.addSignalToChamber(chamber, signal);
      });
      saveChamber(chamber);

      const sourceEvent = getSourcesApi()?.addSourceEvent?.({
        source_type: payload.source_type,
        source_app: payload.source_app,
        content_type: payload.content_type,
        title: payload.title,
        text: payload.text,
        user_created: payload.user_created,
        imported: payload.imported,
        created_at: payload.created_at,
        meta: payload.meta
      }) || null;
      void recordSemanticDocumentShadow(payload, { sourceEvent });
    }

    function ingestUserMessageWithCandidates(messageText, candidates) {
      const text = String(messageText || "").trim();
      const engine = getInsightsApi();
      if (!text || !engine) return 0;

      const themeId = getThemeId();
      const fieldId = getFieldId();
      const localCandidates = buildSemanticInsightCandidates(text, { minInsights: 1, maxInsights: 5 });
      const chunks = Array.isArray(candidates) && candidates.length ? candidates : localCandidates;
      const payload = buildChatPayload(text, themeId, fieldId);
      const ingest = getIngestApi();

      if (ingest && typeof ingest.ingest === "function") {
        if (typeof ingest.ingestWithCandidates === "function") {
          const ingestResult = ingest.ingestWithCandidates(payload, chunks);
          void recordSemanticDocumentShadow(payload, ingestResult);
        } else {
          chunks.forEach((chunk) => ingest.ingest(Object.assign({}, payload, { text: chunk })));
        }
        return chunks.length;
      }

      ingestThroughLegacyFallback(engine, payload, chunks);
      return chunks.length;
    }

    function handleUserMessage(messageText) {
      return ingestUserMessageWithCandidates(messageText);
    }

    async function generateAnalysisInsightCandidates(messageText) {
      const text = String(messageText || "").trim();
      if (!text) return [];
      const themeId = getThemeId();
      const fieldId = getFieldId();
      const inputContext = {
        subject_id: subjectId,
        theme_id: themeId,
        field_id: fieldId,
        ai_state: buildAIState({ includeMemory: isMemoryUseEnabled() })
      };
      const requestKey = sha256Hex(JSON.stringify({ text, inputContext }));
      let request = analysisCandidateRequests.get(requestKey);
      if (!request) {
        const persisted = readSessionCandidates(requestKey);
        if (analysisCandidateRequests.size >= ANALYSIS_CANDIDATE_CACHE_LIMIT) {
          analysisCandidateRequests.delete(analysisCandidateRequests.keys().next().value);
        }
        request = persisted
          ? Promise.resolve(persisted)
          : Promise.resolve()
            .then(() => generateAIInsightCandidates(text, inputContext))
            .then((candidates) => Array.isArray(candidates) ? clone(candidates) : [])
            .then((candidates) => {
              writeSessionCandidates(requestKey, candidates);
              return candidates;
            });
        analysisCandidateRequests.set(requestKey, request);
      }
      try {
        return clone(await request);
      } catch (error) {
        if (analysisCandidateRequests.get(requestKey) === request) analysisCandidateRequests.delete(requestKey);
        throw error;
      }
    }

    async function handleUserMessageInsightCandidatesInBackground(messageText) {
      const text = String(messageText || "").trim();
      if (!text || !getInsightsApi()) return 0;
      const aiCandidates = await generateAnalysisInsightCandidates(text);
      if (!aiCandidates.length) return 0;
      return ingestUserMessageWithCandidates(text, aiCandidates);
    }

    return Object.freeze({
      buildChatPayload,
      recordSemanticDocumentShadow,
      ingestUserMessageWithCandidates,
      handleUserMessage,
      generateAnalysisInsightCandidates,
      handleUserMessageInsightCandidatesInBackground
    });
  }

  const publicApi = Object.freeze({ create });
  global.AHAChatIngestRuntime = publicApi;
  global.AHAModuleApi?.register?.("chat.ingestRuntime", publicApi, {
    version: 1,
    legacyGlobal: "AHAChatIngestRuntime",
    exports: Object.keys(publicApi)
  });
})(typeof window !== "undefined" ? window : globalThis);
