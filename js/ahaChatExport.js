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

  function readSourceTextHash(value) {
    const obj = safeObject(value);
    return normalizeSourceHash(
      obj.sourceTextHash
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

  function makeSourceBinding(field, value, currentSourceTextHash, options = {}) {
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

    if (explicitHash) {
      const valid = explicitHash === currentHash;
      return {
        field,
        status: valid ? "verified" : "invalid_hash_mismatch",
        valid,
        currentSourceTextHash: currentHash,
        fieldSourceTextHash: explicitHash,
        inferred: false,
        reason: valid ? "hash_match" : "hash_mismatch"
      };
    }

    if (options.allowInferredSameRun === true) {
      return {
        field,
        status: options.inferredStatus || "inferred_same_run",
        valid: true,
        currentSourceTextHash: currentHash,
        fieldSourceTextHash: null,
        inferred: true,
        reason: options.reason || "same_run_wrapper"
      };
    }

    return {
      field,
      status: "warning_unverified_binding",
      valid: false,
      currentSourceTextHash: currentHash,
      fieldSourceTextHash: null,
      inferred: false,
      reason: "missing_field_source_hash"
    };
  }

  function annotateSourceBoundObject(value, binding, currentSourceTextHash) {
    const base = safeObject(value);
    return Object.assign({}, base, {
      sourceTextHash: normalizeSourceHash(readSourceTextHash(base) || currentSourceTextHash),
      source_binding: {
        field: binding?.field || "unknown",
        status: binding?.status || "unknown",
        valid: binding?.valid === true,
        currentSourceTextHash: normalizeSourceHash(currentSourceTextHash) || null,
        fieldSourceTextHash: binding?.fieldSourceTextHash || null,
        inferred: binding?.inferred === true,
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
    "dette", "denne", "disse", "eller", "ikke", "som", "med", "for", "til", "fra", "har", "kan", "skal", "det", "der", "seg", "sin", "sitt", "sine", "mens", "viser", "fortsatt", "mye", "eget", "tema", "teksten", "handler", "analyse", "kilde", "output"
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

    if (src.includes(" usa ") && src.includes(" kina ")) {
      ["usa", "kina"].forEach((term) => { if (!requiredTerms.some((v) => normalizeTopicTerm(v) === term)) requiredTerms.push(term); });
      ["eierskap", "profil", "offentlighet", "offentligheten", "institusjonell kontinuitet", "institusjonell omforming", "mandat"].forEach((term) => {
        if (!topicTextIncludes(sourceText, term) && !forbiddenTerms.some((v) => normalizeTopicTerm(v) === normalizeTopicTerm(term))) forbiddenTerms.push(term);
      });
    }

    return { sourceTerms, requiredTerms, forbiddenTerms };
  }

  function buildTopicConsistencyReport({ sourceText, outputText, requiredTerms, forbiddenTerms }) {
    const normalizedRequired = (Array.isArray(requiredTerms) ? requiredTerms : []).map(normalizeTopicTerm).filter(Boolean);
    const normalizedForbidden = (Array.isArray(forbiddenTerms) ? forbiddenTerms : []).map(normalizeTopicTerm).filter(Boolean);
    const sourceTerms = extractTopicTerms(sourceText);
    const outputTerms = extractTopicTerms(outputText);
    const outputTermSet = new Set(outputTerms);
    const overlappingTerms = sourceTerms.filter((term) => outputTermSet.has(term));
    const missingRequiredTerms = normalizedRequired.filter((term) => !topicTextIncludes(outputText, term));
    const matchedForbiddenTerms = normalizedForbidden.filter((term) => topicTextIncludes(outputText, term));
    const valid = missingRequiredTerms.length === 0 && matchedForbiddenTerms.length === 0;
    return {
      status: valid ? "valid" : "invalid_topic_mismatch",
      valid,
      checkedAt: "export_build",
      sourceTerms,
      outputTerms,
      overlappingTerms,
      requiredTerms: normalizedRequired,
      missingRequiredTerms,
      forbiddenTerms: normalizedForbidden,
      matchedForbiddenTerms
    };
  }

  function buildQualityReport({ sourceText, sourceTextHash, bindings, rejectedRawAutoPayload, rejectedSelectedAfterwork, topicConsistency }) {
    const invalidFields = collectInvalidBindings(bindings);
    if (topicConsistency && topicConsistency.valid === false) {
      invalidFields.push({
        field: "topicConsistency",
        status: topicConsistency.status || "invalid_topic_mismatch",
        reason: topicConsistency.matchedForbiddenTerms?.length ? "forbidden_terms_present" : "required_terms_missing",
        missingRequiredTerms: topicConsistency.missingRequiredTerms || [],
        matchedForbiddenTerms: topicConsistency.matchedForbiddenTerms || []
      });
    }
    const warnings = [];
    if (!String(sourceText || "").trim()) warnings.push("missing_source_text");
    if (!normalizeSourceHash(sourceTextHash)) warnings.push("missing_source_text_hash");

    const inferredFields = (Array.isArray(bindings) ? bindings : [])
      .filter((binding) => binding?.valid === true && binding?.inferred === true)
      .map((binding) => binding.field);
    if (inferredFields.length) warnings.push(`inferred_source_binding:${inferredFields.join(",")}`);

    let status = "valid";
    if (topicConsistency && topicConsistency.valid === false) status = "invalid_topic_mismatch";
    else if (invalidFields.length) status = "invalid_source_mismatch";
    else if (warnings.length) status = "warning_unverified_binding";

    return {
      status,
      sourceBinding: {
        currentSourceTextHash: normalizeSourceHash(sourceTextHash) || null,
        bindings,
        invalidFields,
        inferredFields,
        rejectedRawAutoPayload: Boolean(rejectedRawAutoPayload),
        rejectedSelectedAfterwork: Boolean(rejectedSelectedAfterwork)
      },
      topicConsistency: topicConsistency || null,
      warnings,
      failClosed: invalidFields.length > 0
    };
  }

  function buildAhaAnalysisExportBundle(deps) {
    const nowIso = new Date().toISOString();
    const auto = deps.loadAutoOutputs() || {};
    const autoSourceText = String(auto?.sourceText || "");
    const sourceText = autoSourceText;
    const activeRun = safeObject(auto?.activeRun);
    const analysisRunId = String(auto?.analysisRunId || auto?.runId || activeRun.analysisRunId || activeRun.runId || auto?.payload?.analysisRunId || auto?.payload?.runId || "");
    const sourceTextHash = normalizeSourceHash(auto?.sourceTextHash || deps.sourceHash(sourceText));
    const autoBinding = makeSourceBinding("auto", auto, sourceTextHash, {
      allowInferredSameRun: Boolean(sourceTextHash),
      inferredStatus: "inferred_current_auto_wrapper",
      reason: "auto_wrapper_is_current_export_source"
    });

    const rawPayloadCandidate = auto?.payload && typeof auto.payload === "object" ? auto.payload : {};
    const rawPayloadBinding = makeSourceBinding("rawAutoPayload", rawPayloadCandidate, sourceTextHash, {
      allowInferredSameRun: autoBinding.valid === true,
      inferredStatus: "inferred_from_auto_wrapper",
      reason: "payload_wrapped_by_current_auto_output"
    });
    const payload = rawPayloadBinding.valid ? rawPayloadCandidate : {};
    const rejectedRawAutoPayload = rawPayloadBinding.valid ? null : rawPayloadCandidate;

    const explicitAhaSer = payload?.ahaSer && typeof payload.ahaSer === "object" ? payload.ahaSer : {};
    const chamber = deps.loadChamberFromStorage() || {};
    const afterworks = deps.loadAfterworkEntries();
    const relevantAfterworks = afterworks.filter((entry) => String(entry?.sourceTextHash || "") === sourceTextHash);
    const selectedAfterworkCandidate = relevantAfterworks.length
      ? relevantAfterworks[relevantAfterworks.length - 1]
      : {};
    const selectedAfterworkBinding = makeSourceBinding("selectedAfterwork", selectedAfterworkCandidate, sourceTextHash, {
      allowInferredSameRun: false
    });
    const selectedAfterwork = selectedAfterworkBinding.valid ? selectedAfterworkCandidate : {};
    const rejectedSelectedAfterwork = selectedAfterworkBinding.valid ? null : selectedAfterworkCandidate;

    const chatLog = Array.isArray(chamber?.chatLog) ? chamber.chatLog : [];
    const latestAhaReplyText = deps.getLatestAhaReplyFromDom();
    const subjectMatches = deps.normalizeSubjectLinks(selectedAfterwork?.subjectLinks || payload?.subjectMatches || []);
    const insights = Array.isArray(selectedAfterwork?.insights) ? selectedAfterwork.insights : [];
    const concepts = Array.isArray(selectedAfterwork?.concepts) ? selectedAfterwork.concepts : [];
    const canonical = deps.buildCanonicalAnalysis(payload, sourceText);
    const canonicalAnalysis = normalizeAhaAnalysis(canonical);
    canonicalAnalysis.analysisRunId = analysisRunId;
    canonicalAnalysis.runId = analysisRunId;
    canonicalAnalysis.sourceHash = sourceTextHash;
    canonicalAnalysis.normalizedSourceHash = sourceTextHash;
    canonicalAnalysis.sourceTextHash = sourceTextHash;
    canonicalAnalysis.source_binding = {
      field: "canonicalAnalysis",
      status: rawPayloadBinding.valid ? "source_bound" : "rebuilt_from_source_after_payload_rejection",
      valid: true,
      currentSourceTextHash: sourceTextHash || null,
      dependsOnPayload: rawPayloadBinding.valid === true,
      payloadBindingStatus: rawPayloadBinding.status
    };

    const selectedAfterworkType = String(selectedAfterwork?.textType || selectedAfterwork?.innholdstype || "").trim();
    const canonicalType = String(canonical?.contentType || "").trim();
    const isAcademicType = (type) => {
      const key = String(type || "").trim().toLowerCase();
      return key === "academic_article" || key === "theory_idea";
    };
    const allowAfterwork = selectedAfterworkBinding.valid === true && (!selectedAfterworkType || selectedAfterworkType === canonicalType || (isAcademicType(selectedAfterworkType) && isAcademicType(canonicalType)));
    const forceCanonicalOverDayLog = String(selectedAfterworkType || "").toLowerCase() === "day_log" && isAcademicType(canonicalType);
    const calibrationStatus = deps.getCalibrationStatus();
    const metaProfile = deps.buildMetaProfile(chamber);
    const knowledgeMap = chamber?.knowledgeMap || chamber?.map || {};
    const mergedAfterwork = deps.ensureAcademicAfterworkShape({
      summary: String((allowAfterwork && !forceCanonicalOverDayLog && selectedAfterwork?.summary) || payload?.summary || canonical?.summary || payload?.day || ""),
      insight: String(payload?.insight || (insights[0] || "")),
      reflection: String((allowAfterwork && !forceCanonicalOverDayLog && selectedAfterwork?.reflection) || canonical?.reflection || payload?.reflection || ""),
      sortItems: (allowAfterwork && !forceCanonicalOverDayLog && Array.isArray(selectedAfterwork?.sortItems) && selectedAfterwork.sortItems.length) ? selectedAfterwork.sortItems : (canonical?.sortItems?.length ? canonical.sortItems : (Array.isArray(payload?.sortItems) ? payload.sortItems : [])),
      list: (allowAfterwork && !forceCanonicalOverDayLog && Array.isArray(selectedAfterwork?.list) && selectedAfterwork.list.length) ? selectedAfterwork.list : (canonical?.list?.length ? canonical.list : (Array.isArray(payload?.list) ? payload.list : [])),
      path: (allowAfterwork && !forceCanonicalOverDayLog && Array.isArray(selectedAfterwork?.learningPath) && selectedAfterwork.learningPath.length) ? selectedAfterwork.learningPath : (canonical?.path?.length ? canonical.path : (Array.isArray(payload?.path) ? payload.path : [])),
      thoughts: selectedAfterwork?.thoughtSorting || payload?.thoughts || {}
    }, canonical);
    const afterworkBinding = {
      field: "afterwork",
      status: allowAfterwork ? "verified_or_canonical_merge" : "canonical_or_payload_only",
      valid: true,
      currentSourceTextHash: sourceTextHash || null,
      fieldSourceTextHash: allowAfterwork ? selectedAfterworkBinding.fieldSourceTextHash : null,
      inferred: !allowAfterwork,
      reason: allowAfterwork ? "selected_afterwork_hash_match" : "selected_afterwork_not_used"
    };
    const sourceBoundAfterwork = Object.assign(annotateSourceBoundObject(mergedAfterwork, afterworkBinding, sourceTextHash), { analysisRunId, runId: analysisRunId, sourceHash: sourceTextHash, normalizedSourceHash: sourceTextHash });

    const ahaSer = {
      innholdstype: String(canonical?.contentType || payload?.innholdstype || payload?.textType || ""),
      tema: String(canonical?.ahaSer?.tema || explicitAhaSer?.tema || payload?.tema || ""),
      hovedspenning: String(canonical?.ahaSer?.hovedspenning || explicitAhaSer?.hovedspenning || payload?.hovedspenning || ""),
      viktigsteInnsikt: String(canonical?.ahaSer?.viktigsteInnsikt || explicitAhaSer?.viktigsteInnsikt || payload?.viktigsteInnsikt || ""),
      fagkoblinger: deps.normalizeFagkoblinger(canonical?.ahaSer?.fagkoblinger || explicitAhaSer?.fagkoblinger || payload?.fagkoblinger),
      nesteSteg: String(canonical?.ahaSer?.nesteSteg || explicitAhaSer?.nesteSteg || payload?.nesteSteg || ""),
      kortSvar: String(canonical?.ahaSer?.kortSvar || explicitAhaSer?.kortSvar || payload?.kortSvar || ""),
      analysisRunId,
      runId: analysisRunId,
      sourceHash: sourceTextHash,
      normalizedSourceHash: sourceTextHash,
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
    const topicConsistency = buildTopicConsistencyReport({
      sourceText,
      outputText: topicOutputText,
      requiredTerms: topicContract.requiredTerms,
      forbiddenTerms: topicContract.forbiddenTerms
    });
    const quality = buildQualityReport({
      sourceText,
      sourceTextHash,
      bindings,
      rejectedRawAutoPayload,
      rejectedSelectedAfterwork,
      topicConsistency
    });

    return {
      version: "aha_analysis_export_v1",
      exportedAt: nowIso,
      analysisRunId,
      runId: analysisRunId,
      activeRun,
      sourceHash: sourceTextHash,
      normalizedSourceHash: sourceTextHash,
      createdAt: String(auto?.createdAt || selectedAfterwork?.createdAt || nowIso),
      sourceTextHash,
      sourceText,
      sourceTextPreview: String(auto?.sourceTextPreview || selectedAfterwork?.sourceTextPreview || sourceText.replace(/\s+/g, " ").slice(0, 180)),
      ahaReply: latestAhaReplyText || String(explicitAhaSer?.kortSvar || payload?.kortSvar || ""),
      ahaReplySourceBinding: {
        field: "ahaReply",
        status: latestAhaReplyText ? "dom_fallback_unverified" : "payload_or_empty",
        valid: !latestAhaReplyText,
        currentSourceTextHash: sourceTextHash || null,
        reason: latestAhaReplyText ? "latest_reply_read_from_dom_not_run_object" : "no_dom_reply_used"
      },
      ahaSer,
      canonicalAnalysis,
      afterwork: sourceBoundAfterwork,
      insights,
      concepts: (allowAfterwork && !forceCanonicalOverDayLog && concepts.length) ? concepts : (canonical?.concepts || []),
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
      contentType: String(src.contentType || "").trim(),
      domain: String(src.domain || "").trim(),
      theme: String(src.theme || "").trim(),
      mainTension: String(src.mainTension || "").trim(),
      keyInsight: String(src.keyInsight || "").trim(),
      fieldConnections: asList(src.fieldConnections).map((v) => String(v || "").trim()).filter(Boolean),
      historyGoLinks,
      suggestedActions: asList(src.suggestedActions).map((v) => String(v || "").trim()).filter(Boolean),
      confidence: {
        contentType: clamp01(confidence.contentType),
        domain: clamp01(confidence.domain),
        theme: clamp01(confidence.theme),
        mainTension: clamp01(confidence.mainTension),
        historyGoLinks: clamp01(confidence.historyGoLinks)
      },
      warnings: asList(src.warnings).map((v) => String(v || "").trim()).filter(Boolean)
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

  async function copyAhaAnalysisExportMarkdown(deps) {
    const bundle = buildAhaAnalysisExportBundle(deps);
    const markdown = formatAhaAnalysisExportMarkdown(bundle);
    try {
      await navigator.clipboard.writeText(markdown);
      deps.setStatusNote("AHA-analyse kopiert.");
    } catch (err) {
      deps.out(markdown);
      deps.setStatusNote("Kunne ikke kopiere automatisk. Viste analysen i Full analyse-panelet.");
    }
  }

  function exportAhaAnalysisJson(deps) {
    const bundle = buildAhaAnalysisExportBundle(deps);
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

  global.AHAChatExport = {
    safeSerializeForExport,
    buildAhaAnalysisExportBundle,
    formatAhaAnalysisExportMarkdown,
    copyAhaAnalysisExportMarkdown,
    exportAhaAnalysisJson
  };
}(window));