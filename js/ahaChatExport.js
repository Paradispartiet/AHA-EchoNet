(function (global) {
  "use strict";

  function safeSerializeForExport(value) {
    const seen = new WeakSet();

    function walk(input) {
      if (input === null) return null;
      const t = typeof input;
      if (t === "string" || t === "number" || t === "boolean") return input;
      if (t === "bigint") return `${input.toString()}n`;
      if (t === "undefined") return "[Undefined]";
      if (t === "function") return `[Function ${input.name || "anonymous"}]`;
      if (t === "symbol") return `[Symbol ${String(input.description || "")}]`;
      if (input instanceof Date) return isNaN(input.getTime()) ? "[Invalid Date]" : input.toISOString();
      if (typeof Node !== "undefined" && input instanceof Node) {
        const name = input.nodeName || "NODE";
        const id = input.id ? `#${input.id}` : "";
        return `[DOMNode ${name}${id}]`;
      }
      if (Array.isArray(input)) {
        if (seen.has(input)) return "[Circular]";
        seen.add(input);
        return input.map((item) => walk(item));
      }
      if (t === "object") {
        if (seen.has(input)) return "[Circular]";
        seen.add(input);
        const out = {};
        Object.keys(input).forEach((key) => {
          out[key] = walk(input[key]);
        });
        return out;
      }
      return String(input);
    }

    try {
      return walk(value);
    } catch (err) {
      return { error: String(err?.message || err || "serialize_failed") };
    }
  }

  function formatJsonForMarkdown(value, fallback) {
    const seed = value == null ? fallback : value;
    const safeSeed = typeof fallback === "undefined" ? {} : fallback;
    try {
      return JSON.stringify(safeSerializeForExport(seed), null, 2);
    } catch (err) {
      try {
        const hardFallback = Array.isArray(safeSeed) ? [] : {};
        return JSON.stringify(hardFallback, null, 2);
      } catch (_innerErr) {
        return Array.isArray(safeSeed) ? "[]" : "{}";
      }
    }
  }

  function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function normalizeSourceHash(value) {
    return String(value || "").trim();
  }

  function typedText(value) {
    if (value == null) return "";
    if (["string", "number", "boolean"].includes(typeof value)) return String(value).trim();
    if (typeof value === "object") {
      return typedText(value.text || value.summary || value.title || value.label || value.claim || "");
    }
    return "";
  }

  function readSourceTextHash(value) {
    const obj = safeObject(value);
    return normalizeSourceHash(
      obj.source_sha256
      || obj.sourceSha256
      || obj.sourceTextHash
      || obj.source_text_hash
      || obj.sourceHash
      || obj.source_hash
      || obj.meta?.sourceTextHash
      || obj.meta?.source_text_hash
      || obj.sourceBinding?.sourceTextHash
      || obj.source_binding?.sourceTextHash
    );
  }

  function objectHasMeaningfulKeys(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length);
  }

  function makeSourceBinding(field, value, currentSourceTextHash) {
    const currentHash = normalizeSourceHash(currentSourceTextHash);
    const explicitHash = readSourceTextHash(value);
    const hasValue = objectHasMeaningfulKeys(value);

    if (!hasValue) {
      return {
        field,
        status: "no_data",
        valid: true,
        currentSourceTextHash: currentHash || null,
        fieldSourceTextHash: null,
        inferred: false,
        reason: "no_data"
      };
    }

    if (!currentHash) {
      return {
        field,
        status: "invalid_missing_current_source_hash",
        valid: false,
        currentSourceTextHash: null,
        fieldSourceTextHash: explicitHash || null,
        inferred: false,
        reason: "missing_current_source_hash"
      };
    }

    if (!/^[a-f0-9]{64}$/.test(currentHash.toLowerCase())) {
      return {
        field,
        status: "invalid_current_source_sha256",
        valid: false,
        currentSourceTextHash: currentHash,
        fieldSourceTextHash: explicitHash || null,
        inferred: false,
        reason: "authoritative_sha256_required"
      };
    }

    if (explicitHash) {
      const valid = /^[a-f0-9]{64}$/.test(explicitHash.toLowerCase()) && explicitHash === currentHash;
      return {
        field,
        status: valid ? "verified" : (/^[a-f0-9]{64}$/.test(explicitHash.toLowerCase()) ? "invalid_hash_mismatch" : "invalid_field_source_sha256"),
        valid,
        currentSourceTextHash: currentHash,
        fieldSourceTextHash: explicitHash,
        inferred: false,
        reason: valid ? "hash_match" : "hash_mismatch"
      };
    }

    return {
      field,
      status: "invalid_unbound_artifact",
      valid: false,
      currentSourceTextHash: currentHash,
      fieldSourceTextHash: null,
      inferred: false,
      reason: "missing_field_source_hash"
    };
  }

  function annotateSourceBoundObject(value, binding, currentSourceTextHash) {
    const base = safeObject(value);
    const explicitHash = readSourceTextHash(base);
    return Object.assign({}, base, {
      source_binding: {
        field: binding?.field || "unknown",
        status: binding?.status || "unknown",
        valid: binding?.valid === true,
        currentSourceTextHash: normalizeSourceHash(currentSourceTextHash) || null,
        fieldSourceTextHash: binding?.fieldSourceTextHash || explicitHash || null,
        inferred: false,
        reason: binding?.reason || "unknown"
      }
    });
  }

  function collectInvalidBindings(bindings) {
    return (Array.isArray(bindings) ? bindings : [])
      .filter((binding) => binding && binding.valid === false)
      .map((binding) => ({
        field: binding.field,
        status: binding.status,
        reason: binding.reason,
        currentSourceTextHash: binding.currentSourceTextHash || null,
        fieldSourceTextHash: binding.fieldSourceTextHash || null
      }));
  }


  const TOPIC_STOPWORDS = new Set([
    "dette", "denne", "disse", "den", "de", "en", "et", "og", "av", "på", "i", "å", "om", "vi", "jeg", "man", "er", "var", "ble", "blir", "vil", "også", "så", "mot", "ved", "under", "over", "etter", "før", "eller", "ikke", "som", "med", "for", "til", "fra", "har", "kan", "skal", "det", "der", "seg", "sin", "sitt", "sine", "mens", "viser", "fortsatt", "mye", "eget", "tema", "teksten", "handler", "analyse", "kilde", "output"
  ]);

  function normalizeTopicText(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/æ/g, "ae")
      .replace(/ø/g, "o")
      .replace(/å/g, "a")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\b(usa|kina)s\b/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeTopicTerm(term) {
    return normalizeTopicText(term);
  }

  function topicTextIncludes(text, term) {
    const normalizedText = ` ${normalizeTopicText(text)} `;
    const normalizedTerm = normalizeTopicTerm(term);
    if (!normalizedTerm) return false;
    return normalizedText.includes(` ${normalizedTerm} `);
  }

  function extractTopicTerms(text, maxTerms = 16) {
    const normalized = normalizeTopicText(text);
    if (!normalized) return [];
    const counts = new Map();
    normalized.split(" ").forEach((token) => {
      if (token.length < 3 || TOPIC_STOPWORDS.has(token)) return;
      counts.set(token, (counts.get(token) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
      .slice(0, maxTerms)
      .map(([term]) => term);
  }

  function flattenTopicValue(value, depth = 0) {
    if (value == null || depth > 5) return "";
    if (["string", "number", "boolean"].includes(typeof value)) return String(value);
    if (Array.isArray(value)) return value.map((item) => flattenTopicValue(item, depth + 1)).filter(Boolean).join(" ");
    if (typeof value === "object") {
      return Object.keys(value)
        .filter((key) => !["sourceText", "sourceTextPreview", "sourceTextHash", "source_binding", "sourceBinding", "quality"].includes(key))
        .map((key) => flattenTopicValue(value[key], depth + 1))
        .filter(Boolean)
        .join(" ");
    }
    return "";
  }

  function inferTopicConsistencyContract(sourceText, explicit = {}) {
    const sourceTerms = extractTopicTerms(sourceText);
    const requiredTerms = Array.isArray(explicit.requiredTerms) ? explicit.requiredTerms.slice() : [];
    const forbiddenTerms = Array.isArray(explicit.forbiddenTerms) ? explicit.forbiddenTerms.slice() : [];
    const src = ` ${normalizeTopicText(sourceText)} `;

    if (!requiredTerms.length && normalizeTopicText(sourceText).split(" ").length >= 80) {
      sourceTerms.slice(0, 2).forEach((term) => {
        if (!requiredTerms.some((value) => normalizeTopicTerm(value) === term)) requiredTerms.push(term);
      });
    }

    if (src.includes(" usa ") && src.includes(" kina ")) {
      ["usa", "kina"].forEach((term) => { if (!requiredTerms.some((v) => normalizeTopicTerm(v) === term)) requiredTerms.push(term); });
      ["eierskap", "profil", "offentlighet", "offentligheten", "institusjonell kontinuitet", "institusjonell omforming", "mandat"].forEach((term) => {
        if (!topicTextIncludes(sourceText, term) && !forbiddenTerms.some((v) => normalizeTopicTerm(v) === normalizeTopicTerm(term))) forbiddenTerms.push(term);
      });
    }

    return { sourceTerms, requiredTerms, forbiddenTerms };
  }

  function buildTopicConsistencyReport({ sourceText, outputText, requiredTerms, forbiddenTerms, semanticCheckEnabled = true, minimumOutputTerms = 2 }) {
    const normalizedRequired = (Array.isArray(requiredTerms) ? requiredTerms : []).map(normalizeTopicTerm).filter(Boolean);
    const normalizedForbidden = (Array.isArray(forbiddenTerms) ? forbiddenTerms : []).map(normalizeTopicTerm).filter(Boolean);
    const sourceTerms = extractTopicTerms(sourceText, 128);
    const outputTerms = extractTopicTerms(outputText, 64);
    const outputTermSet = new Set(outputTerms);
    const overlappingTerms = sourceTerms.filter((term) => outputTermSet.has(term));
    const meaningfulOverlap = overlappingTerms.filter((term) => term.length >= 4);
    const missingRequiredTerms = normalizedRequired.filter((term) => !topicTextIncludes(outputText, term));
    const matchedForbiddenTerms = normalizedForbidden.filter((term) => topicTextIncludes(outputText, term));
    const semanticCheckEligible = semanticCheckEnabled && sourceTerms.length >= 6 && outputTerms.length >= minimumOutputTerms;
    const semanticTopicMismatch = semanticCheckEligible && meaningfulOverlap.length < 1;
    const valid = missingRequiredTerms.length === 0 && matchedForbiddenTerms.length === 0 && !semanticTopicMismatch;
    return {
      status: valid ? "valid" : (semanticTopicMismatch ? "invalid_semantic_topic_mismatch" : "invalid_topic_mismatch"),
      valid,
      checkedAt: "export_build",
      sourceTerms,
      outputTerms,
      overlappingTerms,
      meaningfulOverlap,
      semanticCheckEligible,
      semanticTopicMismatch,
      requiredTerms: normalizedRequired,
      missingRequiredTerms,
      forbiddenTerms: normalizedForbidden,
      matchedForbiddenTerms
    };
  }

  function buildQualityReport({ sourceText, sourceTextHash, bindings, rejectedRawAutoPayload, rejectedSelectedAfterwork, topicConsistency }) {
    const invalidSourceFields = collectInvalidBindings(bindings);
    const topicInvalidFields = [];
    if (topicConsistency && topicConsistency.valid === false) {
      const failedFields = Array.isArray(topicConsistency.invalidFields) && topicConsistency.invalidFields.length
        ? topicConsistency.invalidFields
        : [{ field: "topicConsistency", report: topicConsistency }];
      failedFields.forEach(({ field, report }) => topicInvalidFields.push({
        field,
        status: report?.status || topicConsistency.status || "invalid_topic_mismatch",
        reason: report?.semanticTopicMismatch ? "semantic_topic_divergence" : (report?.matchedForbiddenTerms?.length ? "forbidden_terms_present" : "required_terms_missing"),
        missingRequiredTerms: report?.missingRequiredTerms || [],
        matchedForbiddenTerms: report?.matchedForbiddenTerms || []
      }));
    }
    const warnings = [];
    if (!String(sourceText || "").trim()) warnings.push("missing_source_text");
    if (!normalizeSourceHash(sourceTextHash)) warnings.push("missing_source_text_hash");

    const inferredFields = [];

    let status = "valid";
    if (invalidSourceFields.length) status = "invalid_source_mismatch";
    else if (topicInvalidFields.length) status = "valid_with_rejected_topic_fields";
    else if (warnings.length) status = "warning_unverified_binding";

    return {
      status,
      sourceBinding: {
        currentSourceTextHash: normalizeSourceHash(sourceTextHash) || null,
        bindings,
        invalidFields: invalidSourceFields,
        inferredFields,
        rejectedRawAutoPayload: Boolean(rejectedRawAutoPayload),
        rejectedSelectedAfterwork: Boolean(rejectedSelectedAfterwork)
      },
      topicConsistency: topicConsistency || null,
      rejectedTopicFields: topicInvalidFields,
      analysisIsolation: {
        status: invalidSourceFields.length ? "failed" : "verified",
        isolated: invalidSourceFields.length === 0,
        reason: invalidSourceFields.length ? "field_source_mismatch" : "all_current_fields_explicitly_bound"
      },
      warnings,
      failClosed: invalidSourceFields.length > 0
    };
  }

  function buildAhaAnalysisExportBundle(deps) {
    const nowIso = new Date().toISOString();
    const auto = deps.loadAutoOutputs() || {};
    const liveRun = safeObject(typeof deps.getActiveAnalysisRun === "function" ? deps.getActiveAnalysisRun() : null);
    const autoSourceText = String(liveRun?.sourceText || auto?.sourceText || "");
    const sourceText = autoSourceText;
    const activeRun = Object.keys(liveRun).length ? liveRun : safeObject(auto?.activeRun);
    const analysisRunId = String(activeRun.analysisRunId || activeRun.runId || auto?.analysisRunId || auto?.runId || auto?.payload?.analysisRunId || auto?.payload?.runId || "");
    const sourceTextHash = normalizeSourceHash(activeRun.sourceTextHash || activeRun.sourceHash || auto?.sourceTextHash || deps.sourceHash(sourceText));
    const autoBinding = makeSourceBinding("auto", auto, sourceTextHash);

    const rawPayloadCandidate = auto?.payload && typeof auto.payload === "object" ? auto.payload : {};
    const rawPayloadBinding = makeSourceBinding("rawAutoPayload", rawPayloadCandidate, sourceTextHash);
    const payload = rawPayloadBinding.valid ? rawPayloadCandidate : {};
    const rejectedRawAutoPayload = rawPayloadBinding.valid ? null : rawPayloadCandidate;

    const explicitAhaSer = payload?.ahaSer && typeof payload.ahaSer === "object" ? payload.ahaSer : {};
    const chamber = deps.loadChamberFromStorage() || {};
    const afterworks = deps.loadAfterworkEntries();
    const relevantAfterworks = afterworks.filter((entry) => String(entry?.sourceTextHash || "") === sourceTextHash);
    // Stored afterwork is historical state. PR 1 deliberately keeps it out of
    // the active analysis; PR 2 may expose it later as an explicit relation.
    const selectedAfterworkBinding = {
      field: "selectedAfterwork",
      status: "historical_afterwork_excluded",
      valid: true,
      currentSourceTextHash: sourceTextHash || null,
      fieldSourceTextHash: null,
      inferred: false,
      reason: "stored_afterwork_not_selected_or_merged"
    };
    const selectedAfterwork = {};
    const rejectedSelectedAfterwork = null;

    const chatLog = Array.isArray(chamber?.chatLog) ? chamber.chatLog : [];
    const currentRunReply = String(activeRun?.ahaReply || "").trim();
    const latestAhaReplyText = currentRunReply || deps.getLatestAhaReplyFromDom();
    const subjectMatches = deps.normalizeSubjectLinks(payload?.subjectMatches || payload?.subjectLinks || []);
    const insights = Array.isArray(payload?.insights) ? payload.insights : (Array.isArray(payload?.insightCards) ? payload.insightCards : []);
    const concepts = Array.isArray(payload?.concepts) ? payload.concepts : (Array.isArray(payload?.keywords) ? payload.keywords : []);
    const canonical = deps.buildCanonicalAnalysis(payload, sourceText);
    const canonicalAnalysis = normalizeAhaAnalysis(canonical);
    canonicalAnalysis.analysisRunId = analysisRunId;
    canonicalAnalysis.runId = analysisRunId;
    canonicalAnalysis.sourceHash = sourceTextHash;
    canonicalAnalysis.normalizedSourceHash = sourceTextHash;
    canonicalAnalysis.sourceTextHash = sourceTextHash;
    canonicalAnalysis.sourceSha256 = sourceTextHash;
    canonicalAnalysis.source_sha256 = sourceTextHash;
    canonicalAnalysis.sourceHashAlgorithm = "sha256";
    canonicalAnalysis.source_binding = {
      field: "canonicalAnalysis",
      status: rawPayloadBinding.valid ? "producer_bound" : "rebuilt_from_source_after_payload_rejection",
      valid: Boolean(sourceTextHash),
      currentSourceTextHash: sourceTextHash || null,
      dependsOnPayload: rawPayloadBinding.valid === true,
      payloadBindingStatus: rawPayloadBinding.status
    };

    const calibrationStatus = deps.getCalibrationStatus();
    const metaProfile = deps.buildMetaProfile(chamber);
    const knowledgeMap = chamber?.knowledgeMap || chamber?.map || {};
    const mergedAfterwork = deps.ensureAcademicAfterworkShape({
      summary: typedText(payload?.summary || canonical?.summary || payload?.day),
      insight: typedText(payload?.insight || insights[0]),
      reflection: typedText(canonical?.reflection || payload?.reflection),
      sortItems: canonical?.sortItems?.length ? canonical.sortItems : (Array.isArray(payload?.sortItems) ? payload.sortItems : []),
      list: canonical?.list?.length ? canonical.list : (Array.isArray(payload?.list) ? payload.list : []),
      path: canonical?.path?.length ? canonical.path : (Array.isArray(payload?.path) ? payload.path : []),
      thoughts: payload?.thoughts && typeof payload.thoughts === "object" ? payload.thoughts : {}
    }, canonical);
    const afterworkBinding = {
      field: "afterwork",
      status: "producer_bound_current_analysis_only",
      valid: Boolean(sourceTextHash && analysisRunId),
      currentSourceTextHash: sourceTextHash || null,
      fieldSourceTextHash: sourceTextHash || null,
      inferred: false,
      reason: "stored_afterwork_not_merged"
    };
    const sourceBoundAfterwork = Object.assign(annotateSourceBoundObject(mergedAfterwork, afterworkBinding, sourceTextHash), {
      analysisRunId,
      runId: analysisRunId,
      sourceHash: sourceTextHash,
      sourceTextHash,
      sourceSha256: sourceTextHash,
      source_sha256: sourceTextHash,
      sourceHashAlgorithm: "sha256",
      normalizedSourceHash: sourceTextHash
    });

    const ahaSer = {
      innholdstype: typedText(canonical?.contentType || payload?.innholdstype || payload?.textType),
      tema: typedText(canonical?.ahaSer?.tema || explicitAhaSer?.tema || payload?.tema),
      hovedspenning: typedText(canonical?.ahaSer?.hovedspenning || explicitAhaSer?.hovedspenning || payload?.hovedspenning),
      viktigsteInnsikt: typedText(canonical?.ahaSer?.viktigsteInnsikt || explicitAhaSer?.viktigsteInnsikt || payload?.viktigsteInnsikt),
      fagkoblinger: deps.normalizeFagkoblinger(canonical?.ahaSer?.fagkoblinger || explicitAhaSer?.fagkoblinger || payload?.fagkoblinger),
      nesteSteg: typedText(canonical?.ahaSer?.nesteSteg || explicitAhaSer?.nesteSteg || payload?.nesteSteg),
      kortSvar: typedText(canonical?.ahaSer?.kortSvar || explicitAhaSer?.kortSvar || payload?.kortSvar),
      analysisRunId,
      runId: analysisRunId,
      sourceHash: sourceTextHash,
      normalizedSourceHash: sourceTextHash,
      sourceSha256: sourceTextHash,
      source_sha256: sourceTextHash,
      sourceHashAlgorithm: "sha256",
      sourceTextHash,
      source_binding: {
        field: "ahaSer",
        status: "source_bound_from_canonical",
        valid: true,
        currentSourceTextHash: sourceTextHash || null
      }
    };

    const bindings = [autoBinding, rawPayloadBinding, selectedAfterworkBinding, afterworkBinding, canonicalAnalysis.source_binding, ahaSer.source_binding];
    const explicitTopicContract = typeof deps.getTopicConsistencyContract === "function" ? deps.getTopicConsistencyContract(sourceText, payload) : {};
    const topicContract = inferTopicConsistencyContract(sourceText, explicitTopicContract);
    const topicOutputText = flattenTopicValue({ ahaSer, canonicalAnalysis, afterwork: sourceBoundAfterwork, rawAutoPayload: payload });
    const aggregateTopicConsistency = buildTopicConsistencyReport({
      sourceText,
      outputText: topicOutputText,
      requiredTerms: topicContract.requiredTerms,
      forbiddenTerms: topicContract.forbiddenTerms
    });
    const fieldTargets = {
      "canonicalAnalysis.theme": canonicalAnalysis.theme,
      "canonicalAnalysis.mainTension": canonicalAnalysis.mainTension,
      "canonicalAnalysis.keyInsight": canonicalAnalysis.keyInsight,
      "canonicalAnalysis.summary": canonicalAnalysis.summary,
      "canonicalAnalysis.reflection": canonicalAnalysis.reflection,
      "canonicalAnalysis.fieldConnections": canonicalAnalysis.fieldConnections,
      "canonicalAnalysis.suggestedActions": canonicalAnalysis.suggestedActions,
      "ahaSer.tema": ahaSer.tema,
      "ahaSer.hovedspenning": ahaSer.hovedspenning,
      "ahaSer.viktigsteInnsikt": ahaSer.viktigsteInnsikt,
      "ahaSer.fagkoblinger": ahaSer.fagkoblinger,
      "ahaSer.nesteSteg": ahaSer.nesteSteg,
      "afterwork.summary": sourceBoundAfterwork.summary,
      "afterwork.insight": sourceBoundAfterwork.insight,
      "afterwork.reflection": sourceBoundAfterwork.reflection,
      "afterwork.sortItems": sourceBoundAfterwork.sortItems,
      "afterwork.list": sourceBoundAfterwork.list,
      "afterwork.path": sourceBoundAfterwork.path,
      subjectMatches
    };
    const fieldReports = {};
    Object.keys(fieldTargets).forEach((field) => bindings.push({
      field,
      status: sourceTextHash && analysisRunId ? "producer_bound_current_analysis_field" : "invalid_unbound_artifact",
      valid: Boolean(sourceTextHash && analysisRunId),
      currentSourceTextHash: sourceTextHash || null,
      fieldSourceTextHash: sourceTextHash || null,
      currentAnalysisRunId: analysisRunId || null,
      fieldAnalysisRunId: analysisRunId || null,
      inferred: false,
      reason: "field_created_from_current_bound_analysis"
    }));
    Object.entries(fieldTargets).forEach(([field, value]) => {
      const outputText = flattenTopicValue(value);
      if (!outputText.trim()) return;
      const groundingField = /(?:theme|mainTension|keyInsight|summary|reflection|fieldConnections|fagkoblinger|subjectMatches)$/u.test(field);
      const labelField = /(?:fieldConnections|fagkoblinger|subjectMatches)$/u.test(field);
      fieldReports[field] = buildTopicConsistencyReport({
        sourceText,
        outputText,
        requiredTerms: [],
        forbiddenTerms: topicContract.forbiddenTerms,
        semanticCheckEnabled: groundingField,
        minimumOutputTerms: labelField ? 1 : 2
      });
    });
    const invalidFieldReports = Object.entries(fieldReports)
      .filter(([, report]) => report.valid === false)
      .map(([field, report]) => ({ field, report }));
    invalidFieldReports.forEach(({ field }) => {
      if (field.startsWith("canonicalAnalysis.")) canonicalAnalysis[field.split(".")[1]] = Array.isArray(canonicalAnalysis[field.split(".")[1]]) ? [] : "";
      else if (field.startsWith("ahaSer.")) ahaSer[field.split(".")[1]] = Array.isArray(ahaSer[field.split(".")[1]]) ? [] : "";
      else if (field.startsWith("afterwork.")) sourceBoundAfterwork[field.split(".")[1]] = Array.isArray(sourceBoundAfterwork[field.split(".")[1]]) ? [] : "";
      else if (field === "subjectMatches") subjectMatches.splice(0, subjectMatches.length);
    });
    const topicConsistency = Object.assign({}, aggregateTopicConsistency, {
      status: aggregateTopicConsistency.valid && !invalidFieldReports.length ? "valid" : "invalid_semantic_topic_mismatch",
      valid: aggregateTopicConsistency.valid && !invalidFieldReports.length,
      fields: fieldReports,
      invalidFields: invalidFieldReports
    });
    const quality = buildQualityReport({
      sourceText,
      sourceTextHash,
      bindings,
      rejectedRawAutoPayload,
      rejectedSelectedAfterwork,
      topicConsistency
    });

    const bundle = {
      version: "aha_analysis_export_v1",
      exportedAt: nowIso,
      analysisRunId,
      runId: analysisRunId,
      activeRun,
      sourceHash: sourceTextHash,
      normalizedSourceHash: sourceTextHash,
      createdAt: String(activeRun?.createdAt || auto?.createdAt || selectedAfterwork?.createdAt || nowIso),
      sourceTextHash,
      sourceText,
      sourceTextPreview: String(activeRun?.sourceTextPreview || activeRun?.sourcePreview || auto?.sourceTextPreview || selectedAfterwork?.sourceTextPreview || sourceText.replace(/\s+/g, " ").slice(0, 180)),
      ahaReply: latestAhaReplyText || String(explicitAhaSer?.kortSvar || payload?.kortSvar || ""),
      ahaReplySourceBinding: {
        field: "ahaReply",
        status: currentRunReply ? "current_run" : (latestAhaReplyText ? "dom_fallback_unverified" : "payload_or_empty"),
        valid: Boolean(currentRunReply) || !latestAhaReplyText,
        currentSourceTextHash: sourceTextHash || null,
        reason: currentRunReply ? "reply_bound_to_current_run" : (latestAhaReplyText ? "latest_reply_read_from_dom_not_run_object" : "no_dom_reply_used")
      },
      ahaSer,
      canonicalAnalysis,
      afterwork: sourceBoundAfterwork,
      insights,
      concepts: concepts.length ? concepts : (canonical?.concepts || []),
      subjectMatches,
      metaProfile,
      knowledgeMap,
      rawAutoPayload: annotateSourceBoundObject(payload, rawPayloadBinding, sourceTextHash),
      rejectedRawAutoPayload: rejectedRawAutoPayload ? safeSerializeForExport(rejectedRawAutoPayload) : null,
      selectedAfterwork: annotateSourceBoundObject(selectedAfterwork, selectedAfterworkBinding, sourceTextHash),
      rejectedSelectedAfterwork: rejectedSelectedAfterwork ? safeSerializeForExport(rejectedSelectedAfterwork) : null,
      relevantAfterworks: relevantAfterworks.map((entry) => annotateSourceBoundObject(entry, makeSourceBinding("relevantAfterwork", entry, sourceTextHash), sourceTextHash)),
      allAfterworkCount: afterworks.length,
      chamberInsights: Array.isArray(chamber?.insights) ? chamber.insights : [],
      chamberChatLog: chatLog,
      chamberMeta: chamber?.meta || {},
      fullChamberSnapshot: chamber,
      chamberSummary: {
        insightCount: Array.isArray(chamber?.insights) ? chamber.insights.length : 0,
        recentAfterworkCount: relevantAfterworks.length,
        chatTurns: chatLog.length
      },
      calibrationStatus,
      quality,
      sourceBinding: quality.sourceBinding
    };
    const contract = deps?.analysisRunContract || global.AHAChatAnalysisRunContract;
    if (!contract?.finalizeExport) throw new Error("AHAChatExport krever AHAAnalysisRun-kontrakten.");
    return contract.finalizeExport(bundle);
  }

  function normalizeAhaAnalysis(rawAnalysis) {
    const src = rawAnalysis && typeof rawAnalysis === "object" ? rawAnalysis : {};
    const confidence = src?.confidence && typeof src.confidence === "object" ? src.confidence : {};
    const asList = (value) => Array.isArray(value) ? value : [];
    const clamp01 = (value) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return 0;
      return Math.max(0, Math.min(1, n));
    };
    const historyGoLinks = asList(src.historyGoLinks).map((item) => {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        return {
          type: String(item.type || item.kind || "topic").trim() || "topic",
          id: String(item.id || item.slug || item.key || item.title || "").trim(),
          title: String(item.title || item.label || item.name || item.id || "").trim(),
          reason: String(item.reason || item.why || "").trim()
        };
      }
      const text = String(item || "").trim();
      return text ? { type: "topic", id: text.toLowerCase().replace(/\s+/g, "_"), title: text, reason: "" } : null;
    }).filter(Boolean);
    return {
      contentType: typedText(src.contentType).trim(),
      domain: typedText(src.domain).trim(),
      theme: typedText(src.theme).trim(),
      mainTension: typedText(src.mainTension).trim(),
      keyInsight: typedText(src.keyInsight).trim(),
      fieldConnections: asList(src.fieldConnections).map((v) => typedText(v).trim()).filter(Boolean),
      historyGoLinks,
      suggestedActions: asList(src.suggestedActions).map((v) => typedText(v).trim()).filter(Boolean),
      confidence: {
        contentType: clamp01(confidence.contentType),
        domain: clamp01(confidence.domain),
        theme: clamp01(confidence.theme),
        mainTension: clamp01(confidence.mainTension),
        historyGoLinks: clamp01(confidence.historyGoLinks)
      },
      warnings: asList(src.warnings).map((v) => typedText(v).trim()).filter(Boolean)
    };
  }

  function formatAhaAnalysisExportMarkdown(bundle) {
    const b = bundle && typeof bundle === "object" ? bundle : {};
    const ser = b.ahaSer || {};
    const afterwork = b.afterwork || {};
    const sortItems = Array.isArray(afterwork.sortItems) ? afterwork.sortItems : [];
    const asBullet = (items) => (Array.isArray(items) && items.length ? items.map((item) => `- ${typeof item === "string" ? item : (item?.label ? `${item.label}: ${item.text || ""}` : JSON.stringify(item))}`).join("\n") : "- (ingen)");
    const quality = b.quality || {};
    return `# AHA analyse

## Kildetekst
${b.sourceText || "(mangler)"}

## Kort svar
${ser.kortSvar || b.ahaReply || "(mangler)"}

## AHA SER
- Innholdstype: ${ser.innholdstype || ""}
- Tema: ${ser.tema || ""}
- Hovedspenning: ${ser.hovedspenning || ""}
- Viktigste innsikt: ${ser.viktigsteInnsikt || ""}
- Fagkoblinger: ${(Array.isArray(ser.fagkoblinger) ? ser.fagkoblinger.join(", ") : "")}
- Neste steg: ${ser.nesteSteg || ""}

## Oppsummer
${afterwork.summary || ""}

## Reflekter
${afterwork.reflection || ""}

## Sortert struktur
${sortItems.length ? sortItems.map((item) => `- ${item?.label || "Punkt"}: ${item?.text || ""}`).join("\n") : "- (ingen)"}

## Liste
${asBullet(afterwork.list)}

## Læringssti
${asBullet(afterwork.path)}

## Innsikter
${asBullet(b.insights)}

## Begreper
${asBullet(b.concepts)}

## Meta / Kunnskapskart
- Fagkoblinger/subjectMatches: ${(Array.isArray(b.subjectMatches) ? b.subjectMatches.map((m) => m?.title || m?.subject_id).filter(Boolean).join(", ") : "")}
- Meta-profil: ${JSON.stringify(safeSerializeForExport(b.metaProfile || {}))}
- Kunnskapskart/chamber-status: ${JSON.stringify(safeSerializeForExport(b.chamberSummary || {}))}

## Kildebinding / kvalitet
- quality.status: ${quality.status || "unknown"}
- failClosed: ${quality.failClosed === true ? "true" : "false"}
- warnings: ${Array.isArray(quality.warnings) && quality.warnings.length ? quality.warnings.join(", ") : "(ingen)"}
- invalidFields: ${Array.isArray(quality.sourceBinding?.invalidFields) && quality.sourceBinding.invalidFields.length ? quality.sourceBinding.invalidFields.map((item) => item.field).join(", ") : "(ingen)"}
- topicConsistency.status: ${quality.topicConsistency?.status || "unknown"}
- topicConsistency.missingRequiredTerms: ${Array.isArray(quality.topicConsistency?.missingRequiredTerms) && quality.topicConsistency.missingRequiredTerms.length ? quality.topicConsistency.missingRequiredTerms.join(", ") : "(ingen)"}
- topicConsistency.matchedForbiddenTerms: ${Array.isArray(quality.topicConsistency?.matchedForbiddenTerms) && quality.topicConsistency.matchedForbiddenTerms.length ? quality.topicConsistency.matchedForbiddenTerms.join(", ") : "(ingen)"}
- inferredFields: ${Array.isArray(quality.sourceBinding?.inferredFields) && quality.sourceBinding.inferredFields.length ? quality.sourceBinding.inferredFields.join(", ") : "(ingen)"}
- ahaReplyBinding: ${b.ahaReplySourceBinding?.status || "unknown"}

## Teknisk
- sourceTextHash: ${b.sourceTextHash || ""}
- createdAt: ${b.createdAt || ""}
- exportedAt: ${b.exportedAt || ""}
- calibrationStatus: ${JSON.stringify(safeSerializeForExport(b.calibrationStatus || {}))}

## Full eksportdata

### Full bundle
${"```"}json
${formatJsonForMarkdown(b, {})}
${"```"}

### Rå auto-output payload
${"```"}json
${formatJsonForMarkdown(b.rawAutoPayload, {})}
${"```"}

### Rejected raw auto-output payload
${"```"}json
${formatJsonForMarkdown(b.rejectedRawAutoPayload, null)}
${"```"}

### Valgt afterwork
${"```"}json
${formatJsonForMarkdown(b.selectedAfterwork, {})}
${"```"}

### Rejected selected afterwork
${"```"}json
${formatJsonForMarkdown(b.rejectedSelectedAfterwork, null)}
${"```"}

### Relevante afterworks
${"```"}json
${formatJsonForMarkdown(b.relevantAfterworks, [])}
${"```"}

### Chamber insights
${"```"}json
${formatJsonForMarkdown(b.chamberInsights, [])}
${"```"}

### Chamber chatLog
${"```"}json
${formatJsonForMarkdown(b.chamberChatLog, [])}
${"```"}

### Meta-profil
${"```"}json
${formatJsonForMarkdown(b.metaProfile, {})}
${"```"}

### Chamber meta
${"```"}json
${formatJsonForMarkdown(b.chamberMeta, {})}
${"```"}

### KnowledgeMap / kunnskapstre
${"```"}json
${formatJsonForMarkdown(b.knowledgeMap, {})}
${"```"}

### Calibration status
${"```"}json
${formatJsonForMarkdown(b.calibrationStatus, {})}
${"```"}

### Source binding
${"```"}json
${formatJsonForMarkdown(b.sourceBinding, {})}
${"```"}

### Full chamber snapshot
${"```"}json
${formatJsonForMarkdown(b.fullChamberSnapshot, {})}
${"```"}
`;
  }

  function resolveCurrentExportBuilder() {
    const current = global.AHAChatExport?.buildAhaAnalysisExportBundle;
    return typeof current === "function" ? current : buildAhaAnalysisExportBundle;
  }

  function buildCurrentExportBundle(deps) {
    return resolveCurrentExportBuilder()(deps);
  }

  async function copyAhaAnalysisExportMarkdown(deps, bundleBuilder) {
    const bundle = typeof bundleBuilder === "function" ? bundleBuilder() : buildCurrentExportBundle(deps);
    const markdown = formatAhaAnalysisExportMarkdown(bundle);
    try {
      await navigator.clipboard.writeText(markdown);
      deps.setStatusNote("AHA-analyse kopiert.");
    } catch (err) {
      deps.out(markdown);
      deps.setStatusNote("Kunne ikke kopiere automatisk. Viste analysen i Full analyse-panelet.");
    }
  }

  function exportAhaAnalysisJson(deps, bundleBuilder) {
    const bundle = typeof bundleBuilder === "function" ? bundleBuilder() : buildCurrentExportBundle(deps);
    const json = JSON.stringify(safeSerializeForExport(bundle), null, 2);
    const now = new Date();
    const filename = `aha-analysis-${now.getUTCFullYear()}-${String(now.getUTCMonth()+1).padStart(2,"0")}-${String(now.getUTCDate()).padStart(2,"0")}-${String(now.getUTCHours()).padStart(2,"0")}${String(now.getUTCMinutes()).padStart(2,"0")}.json`;
    try {
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      deps.setStatusNote("AHA-analyse eksportert som JSON.");
    } catch (err) {
      deps.out(json);
      deps.setStatusNote("Kunne ikke laste ned JSON. Viste data i Full analyse-panelet.");
    }
  }

  function createRuntime(deps = {}) {
    const required = [
      "loadAutoOutputs", "getActiveAnalysisRun", "loadAfterworkEntries", "sourceHash",
      "buildCanonicalAnalysis", "normalizeSubjectLinks", "normalizeFagkoblinger",
      "isAcademicLikeType", "loadChamberFromStorage", "buildMetaProfile",
      "setStatusNote", "out"
    ];
    required.forEach((name) => {
      if (typeof deps[name] !== "function") throw new Error(`AHAChatExportRuntime mangler avhengighet: ${name}`);
    });
    if (!deps.analysisRunContract?.finalizeExport) {
      throw new Error("AHAChatExportRuntime krever AHAAnalysisRun-kontrakten.");
    }

    const documentRef = deps.document || global.document;

    function getLatestAhaReplyFromDom() {
      const rows = Array.from(documentRef?.querySelectorAll?.(".chat-line-aha") || []);
      return String(rows[rows.length - 1]?.textContent || "").trim();
    }

    function ensureAcademicAfterworkShape(afterwork = {}, canonical = {}) {
      if (!deps.isAcademicLikeType(canonical?.contentType)) return afterwork;
      const out = Object.assign({}, afterwork);
      const summary = String(out.summary || "").trim();
      if (!summary || /kort dagsoppsummering/i.test(summary) || /ikke dagbokmateriale/i.test(summary)) {
        const groundedSummary = String(canonical?.keyInsight || canonical?.reflection || canonical?.theme || "").trim();
        out.summary = groundedSummary ? `Kort fagoppsummering: ${groundedSummary}` : "Kort fagoppsummering: Kilden analyseres ut fra sitt eget faglige innhold.";
      }
      const reflection = String(out.reflection || "").trim();
      if (!reflection || /dagslogg/i.test(reflection)) out.reflection = String(canonical?.reflection || "");
      const path = Array.isArray(out.path) ? out.path : [];
      const dayLogPathSignals = /(oppsummer hendelsene kort|finn ett mønster eller én følelse|velg én ting du tar med videre i morgen)/i;
      if (!path.length || path.some((step) => dayLogPathSignals.test(String(step || "")))) {
        out.path = Array.isArray(canonical?.path) ? canonical.path : [];
      }
      return out;
    }

    const runtimeDeps = Object.freeze({
      ...deps,
      getLatestAhaReplyFromDom,
      ensureAcademicAfterworkShape,
      getCalibrationStatus: typeof deps.getCalibrationStatus === "function"
        ? deps.getCalibrationStatus
        : () => (typeof global.AHACalibration?.getStatus === "function" ? global.AHACalibration.getStatus() : {})
    });
    // The semantic integrity guard is installed after Chat composition in the
    // production page. Resolve the public builder at call time so an early-bound
    // runtime can never bypass a later fail-closed wrapper.
    const buildBoundBundle = () => buildCurrentExportBundle(runtimeDeps);

    return Object.freeze({
      buildAhaAnalysisExportBundle: buildBoundBundle,
      formatAhaAnalysisExportMarkdown,
      copyAhaAnalysisExportMarkdown: () => copyAhaAnalysisExportMarkdown(runtimeDeps, buildBoundBundle),
      exportAhaAnalysisJson: () => exportAhaAnalysisJson(runtimeDeps, buildBoundBundle)
    });
  }

  global.AHAChatExportTestHooks = { extractTopicTerms, inferTopicConsistencyContract, buildTopicConsistencyReport };

  const publicApi = {
    safeSerializeForExport,
    buildAhaAnalysisExportBundle,
    formatAhaAnalysisExportMarkdown,
    copyAhaAnalysisExportMarkdown,
    exportAhaAnalysisJson,
    createRuntime
  };
  global.AHAChatExport = publicApi;
  global.AHAModuleApi?.register?.("chat.export", publicApi, { version: 1, legacyGlobal: "AHAChatExport", exports: Object.keys(publicApi) });
}(window));
