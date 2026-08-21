// ahaChatAnalysisRunContract.js
// Versjonert, DOM-fri view-model for én kildebundet AHA-analyse.

(function (global) {
  "use strict";

  const CONTRACT_VERSION = "aha_analysis_run_v1";
  const SOURCE_LOCKED_FIELDS = Object.freeze([
    "canonicalAnalysis", "afterwork", "ahaSer", "concepts", "subjectMatches",
    "rawAutoPayload", "answerEvaluation"
  ]);

  function object(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function array(value) {
    return Array.isArray(value) ? value.slice() : [];
  }

  function text(value) {
    return String(value == null ? "" : value).trim();
  }

  function uniqueText(values) {
    const seen = new Set();
    return array(values).map(text).filter((value) => {
      if (!value || seen.has(value)) return false;
      seen.add(value);
      return true;
    });
  }

  function readSourceHash(value) {
    const src = object(value);
    return text(
      src.source_sha256 || src.sourceSha256 || src.sourceTextHash || src.sourceHash || src.normalizedSourceHash ||
      src.sourceFingerprint || src.source_binding?.currentSourceTextHash
    );
  }

  function isSha256(value) {
    return /^[a-f0-9]{64}$/.test(text(value).toLowerCase());
  }

  function runIdentity(value) {
    const src = object(value);
    if (!Object.keys(src).length) return {};
    return {
      contractVersion: CONTRACT_VERSION,
      analysisId: text(src.analysisId),
      analysisRunId: text(src.analysisRunId || src.runId),
      runId: text(src.runId || src.analysisRunId),
      conversationId: text(src.conversationId || src.sessionId),
      sessionId: text(src.sessionId || src.conversationId),
      turnId: text(src.turnId),
      sourceId: text(src.sourceId),
      sourceKind: text(src.sourceKind || src.sourceType || "chat"),
      sourceType: text(src.sourceType || src.sourceKind || "chat"),
      sourceTextHash: readSourceHash(src),
      sourceHash: readSourceHash(src),
      sourceSha256: readSourceHash(src),
      source_sha256: readSourceHash(src),
      sourceHashAlgorithm: "sha256",
      createdAt: text(src.createdAt),
      memoryAllowed: src.memoryAllowed === true,
      memoryMode: text(src.memoryMode) || (src.memoryAllowed === true ? "allowed" : "off")
    };
  }

  function collectInvalidFields(input) {
    const src = object(input);
    const fromQuality = src.quality?.sourceBinding?.invalidFields || src.quality?.invalidFields;
    return array(src.invalidFields?.length ? src.invalidFields : fromQuality)
      .map((item) => item && typeof item === "object" ? { ...item } : { field: text(item) })
      .filter((item) => text(item.field));
  }

  function validateSourceLockedFields(input, currentHash, currentRunId) {
    const src = object(input);
    const invalid = [];
    SOURCE_LOCKED_FIELDS.forEach((field) => {
      const value = src[field];
      const hasValue = Array.isArray(value) ? value.length > 0 : Boolean(value && typeof value === "object" && Object.keys(value).length);
      if (!hasValue) return;
      // Array projections are validated through their producer-owned field
      // reports. The run contract only accepts/rejects object artifacts here.
      if (Array.isArray(value)) return;
      const fieldHash = readSourceHash(value);
      const fieldRunId = text(value?.analysisRunId || value?.runId);
      const binding = object(value?.source_binding || value?.sourceBinding);
      const dataKeys = Object.keys(value).filter((key) => key !== "source_binding" && key !== "sourceBinding");
      if (text(binding.status) === "no_data" && dataKeys.length === 0) return;
      if (binding.valid === false) {
        invalid.push({ field, status: text(binding.status) || "invalid_source_binding", reason: text(binding.reason) || "binding_rejected" });
        return;
      }
      if (!isSha256(fieldHash) || !fieldRunId) {
        invalid.push({ field, status: "invalid_unbound_artifact", reason: "explicit_sha256_and_run_id_required" });
        return;
      }
      if (fieldHash && currentHash && fieldHash !== currentHash) {
        invalid.push({ field, status: "invalid_hash_mismatch", reason: "hash_mismatch", currentSourceTextHash: currentHash, fieldSourceTextHash: fieldHash });
        return;
      }
      if (currentRunId && fieldRunId !== currentRunId) {
        invalid.push({ field, status: "invalid_run_mismatch", reason: "run_mismatch", currentAnalysisRunId: currentRunId, fieldAnalysisRunId: fieldRunId });
      }
    });
    return invalid;
  }

  function create(input = {}) {
    const src = object(input);
    const active = object(src.activeRun);
    const sourceText = String(src.sourceText ?? active.sourceText ?? "");
    const sourceTextHash = text(readSourceHash(src) || readSourceHash(active));
    const runId = text(src.analysisRunId || src.runId || active.analysisRunId || active.runId);
    const invalidFields = collectInvalidFields(src);
    validateSourceLockedFields(src, sourceTextHash, runId).forEach((item) => {
      if (!invalidFields.some((existing) => existing.field === item.field && existing.status === item.status)) invalidFields.push(item);
    });
    const invalidationReasons = uniqueText([
      ...array(src.invalidationReasons),
      ...invalidFields.map((item) => `${item.field}:${item.status || item.reason || "invalid"}`),
      ...(!sourceTextHash ? ["missing_source_text_hash"] : []),
      ...(!runId ? ["missing_run_id"] : [])
    ]);
    const quality = { ...object(src.quality) };
    const failClosed = quality.failClosed === true || invalidFields.length > 0;
    const memoryAllowed = src.memoryAllowed === true || active.memoryAllowed === true;

    return Object.assign({}, src, {
      contractVersion: CONTRACT_VERSION,
      activeRun: runIdentity(active),
      analysisId: text(src.analysisId || active.analysisId),
      analysisRunId: runId,
      runId,
      conversationId: text(src.conversationId || src.sessionId || active.conversationId || active.sessionId),
      sessionId: text(src.sessionId || src.conversationId || active.sessionId || active.conversationId),
      turnId: text(src.turnId || active.turnId),
      sourceId: text(src.sourceId || active.sourceId),
      sourceKind: text(src.sourceKind || src.sourceType || active.sourceKind || active.sourceType || "chat"),
      sourceType: text(src.sourceType || src.sourceKind || active.sourceType || active.sourceKind || "chat"),
      sourceText,
      sourceTextHash,
      sourceHash: sourceTextHash,
      sourceSha256: sourceTextHash,
      source_sha256: sourceTextHash,
      sourceHashAlgorithm: "sha256",
      normalizedSourceHash: sourceTextHash,
      sourceFingerprint: sourceTextHash,
      sourcePreview: text(src.sourcePreview || src.sourceTextPreview || active.sourcePreview || sourceText.replace(/\s+/g, " ").slice(0, 180)),
      sourceTextPreview: text(src.sourceTextPreview || src.sourcePreview || active.sourceTextPreview || sourceText.replace(/\s+/g, " ").slice(0, 180)),
      createdAt: text(src.createdAt || active.createdAt) || new Date().toISOString(),
      memoryAllowed,
      memoryMode: text(src.memoryMode || active.memoryMode) || (memoryAllowed ? "allowed" : "off"),
      canonicalAnalysis: { ...object(src.canonicalAnalysis) },
      afterwork: { ...object(src.afterwork) },
      ahaSer: { ...object(src.ahaSer) },
      concepts: array(src.concepts),
      subjectMatches: array(src.subjectMatches),
      rawAutoPayload: { ...object(src.rawAutoPayload) },
      ahaReply: String(src.ahaReply ?? active.ahaReply ?? ""),
      answerEvaluation: { ...object(src.answerEvaluation) },
      quality,
      invalidFields,
      invalidationReasons,
      analysisBinding: {
        status: failClosed ? "invalid" : (text(quality.status) || (sourceTextHash && runId ? "bound" : "incomplete")),
        valid: !failClosed && Boolean(isSha256(sourceTextHash) && runId),
        runId: runId || null,
        sourceTextHash: sourceTextHash || null,
        sourceSha256: sourceTextHash || null,
        sourceHashAlgorithm: "sha256"
      }
    });
  }

  function update(run, patch = {}) {
    if (!run || typeof run !== "object") return create(patch);
    const next = create(Object.assign({}, run, object(patch), { activeRun: run }));
    Object.keys(run).forEach((key) => { if (!(key in next)) delete run[key]; });
    Object.assign(run, next);
    return run;
  }

  function bindArtifact(artifact, run, field = "", options = {}) {
    if (!artifact || typeof artifact !== "object" || !run) return artifact;
    const runId = text(run.analysisRunId || run.runId);
    const sourceTextHash = readSourceHash(run);
    const producerBound = options.producer === "current_analysis_run";
    if (producerBound) {
      if (!runId || !isSha256(sourceTextHash)) throw new Error("Cannot produce a source-bound artifact without run id and SemanticDocument SHA-256.");
      Object.assign(artifact, {
        analysisId: text(run.analysisId),
        analysisRunId: runId,
        runId,
        conversationId: text(run.conversationId || run.sessionId),
        sessionId: text(run.sessionId || run.conversationId),
        turnId: text(run.turnId),
        sourceId: text(run.sourceId),
        sourceKind: text(run.sourceKind || run.sourceType || artifact.sourceKind || "chat"),
        createdAt: artifact.createdAt || run.createdAt,
        sourceHash: sourceTextHash,
        normalizedSourceHash: sourceTextHash,
        sourceTextHash,
        sourceSha256: sourceTextHash,
        source_sha256: sourceTextHash,
        sourceFingerprint: sourceTextHash,
        sourceHashAlgorithm: "sha256",
        sourcePreview: text(run.sourcePreview || artifact.sourcePreview || artifact.sourceTextPreview)
      });
    }
    const artifactRunId = text(artifact.analysisRunId || artifact.runId);
    const artifactHash = readSourceHash(artifact);
    const valid = Boolean(
      isSha256(sourceTextHash) &&
      isSha256(artifactHash) &&
      artifactHash === sourceTextHash &&
      artifactRunId && artifactRunId === runId
    );
    artifact.source_binding = Object.assign({}, object(artifact.source_binding), {
      field: field || text(artifact.source_binding?.field) || "artifact",
      status: valid ? (producerBound ? "producer_bound" : "verified") : (!artifactHash || !artifactRunId ? "invalid_unbound_artifact" : "invalid_source_or_run_mismatch"),
      valid,
      inferred: false,
      currentSourceTextHash: sourceTextHash || null,
      fieldSourceTextHash: artifactHash || null,
      currentAnalysisRunId: runId || null,
      fieldAnalysisRunId: artifactRunId || null,
      reason: valid ? (producerBound ? "created_by_current_analysis_run" : "explicit_identity_match") : "explicit_identity_required"
    });
    if (SOURCE_LOCKED_FIELDS.includes(field)) update(run, { [field]: artifact });
    return artifact;
  }

  function finalizeExport(bundle = {}) {
    const src = object(bundle);
    return create(Object.assign({}, src, {
      version: src.version || "aha_analysis_export_v1",
      activeRun: object(src.activeRun),
      memoryAllowed: src.memoryAllowed === true || src.activeRun?.memoryAllowed === true,
      memoryMode: src.memoryMode || src.activeRun?.memoryMode,
      invalidFields: collectInvalidFields(src)
    }));
  }

  function validate(run) {
    const value = create(run);
    const errors = [];
    if (!value.runId) errors.push("missing_run_id");
    if (!value.sourceTextHash) errors.push("missing_source_text_hash");
    else if (!isSha256(value.sourceTextHash)) errors.push("invalid_source_sha256");
    value.invalidFields.forEach((item) => errors.push(`${item.field}:${item.status || item.reason || "invalid"}`));
    return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors), value });
  }

  const api = Object.freeze({
    CONTRACT_VERSION,
    SOURCE_LOCKED_FIELDS,
    create,
    update,
    bindArtifact,
    isSha256,
    finalizeExport,
    validate
  });
  global.AHAChatAnalysisRunContract = api;
  global.AHAModuleApi?.register?.("chat.analysisRunContract", api, {
    version: 1,
    legacyGlobal: "AHAChatAnalysisRunContract",
    exports: Object.keys(api)
  });
})(typeof window !== "undefined" ? window : globalThis);
