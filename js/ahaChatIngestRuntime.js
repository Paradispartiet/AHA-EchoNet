// ahaChatIngestRuntime.js
// Orkestrerer AHA Chat-kandidater inn i kanonisk AHAIngest med eksplisitt legacy-fallback.
// Filen eier også første shadow-implementasjon av SemanticDocumentV1. Den er en
// separat modulkontrakt (AHASemanticDocument), men samlokalisert her i PR1 for å
// unngå å endre produksjonens script-/load-order før den semantiske kjernen har
// bevist kontrakten sin.

(function (global) {
  "use strict";

  const SEMANTIC_DOCUMENT_SCHEMA = "aha_semantic_document_v1";
  const SEMANTIC_DOCUMENT_VERSION = 1;
  const SEMANTIC_DOCUMENT_MODE = "shadow";
  const SEMANTIC_DOCUMENT_STATUS = "evidence_only";
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
        status: "shadow_evidence_only",
        anchor_count: evidenceAnchors.length,
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
        visible_output_changed: false
      }
    };
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
    ["entities", "concepts", "claims", "relations", "tensions", "candidate_insights"].forEach((key) => {
      if (Array.isArray(doc[key]) && doc[key].length) errors.push(`shadow_semantic_array_not_empty:${key}`);
    });

    const anchors = Array.isArray(doc.evidence_anchors) ? doc.evidence_anchors : [];
    const ids = new Set();
    let previousEnd = -1;
    const source = sourceText == null ? null : String(sourceText);
    anchors.forEach((anchor, index) => {
      if (!anchor || typeof anchor !== "object") {
        errors.push(`invalid_anchor:${index}`);
        return;
      }
      const id = String(anchor.id || "");
      if (!id || ids.has(id)) errors.push(`invalid_anchor_id:${index}`);
      ids.add(id);
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
          evidence_anchor_count: document.evidence_anchors.length
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
    buildEvidenceAnchors,
    buildShadowSemanticDocument,
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
      loadChamber,
      saveChamber,
      getSemanticDocumentApi = () => (
        global.AHAModuleApi?.resolve?.("semanticDocument", "AHASemanticDocument", { version: 1 })
        || global.AHASemanticDocument
        || null
      ),
      now = () => new Date().toISOString()
    } = deps;

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

    function recordSemanticDocumentShadow(payload, ingestResult) {
      const api = typeof getSemanticDocumentApi === "function" ? getSemanticDocumentApi() : null;
      if (!api?.buildShadowSemanticDocument || !api?.recordShadowSemanticDocument) return null;
      try {
        const sourceEvent = ingestResult?.sourceEvent || null;
        const document = api.buildShadowSemanticDocument({
          source_event_id: sourceEvent?.id || null,
          source_text: payload.text,
          source_type: sourceEvent?.source_type || payload.source_type,
          language: payload.meta?.language || "no",
          generated_at: payload.created_at
        });
        const validation = api.validateSemanticDocument?.(document, payload.text);
        if (validation && validation.ok === false) {
          console.warn("AHAChatIngestRuntime: SemanticDocument shadow validation failed", validation.errors);
          return null;
        }
        return api.recordShadowSemanticDocument(document);
      } catch (error) {
        // PR1 er shadow-only. En feil i den nye representasjonen skal derfor
        // aldri stoppe dagens canonical ingest. Når V2 blir authoritative må
        // denne grensen endres til fail-closed før canonical insight-write.
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
      recordSemanticDocumentShadow(payload, { sourceEvent });
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
          recordSemanticDocumentShadow(payload, ingestResult);
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

    async function handleUserMessageInsightCandidatesInBackground(messageText) {
      const text = String(messageText || "").trim();
      if (!text || !getInsightsApi()) return 0;
      const themeId = getThemeId();
      const fieldId = getFieldId();
      const aiCandidates = await generateAIInsightCandidates(text, {
        subject_id: subjectId,
        theme_id: themeId,
        field_id: fieldId,
        ai_state: buildAIState()
      });
      if (!aiCandidates.length) return 0;
      return ingestUserMessageWithCandidates(text, aiCandidates);
    }

    return Object.freeze({
      buildChatPayload,
      recordSemanticDocumentShadow,
      ingestUserMessageWithCandidates,
      handleUserMessage,
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
