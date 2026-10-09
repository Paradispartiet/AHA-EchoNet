// AHA Privacy Personal AI Memory bridge.
// Extends the existing Privacy export/restore user flow without creating a parallel memory store.
(function (global) {
  "use strict";

  const MEMORY_KEY = "aha_meta_insights_memory_v1";
  const DERIVED_CACHE_KEYS = ["aha_personal_retrieval_index_v1", "aha_personal_semantic_index_v1"];
  let lastPreviewFingerprint = "";

  function asObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function isPlainObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
  function safeParse(raw, fallback = null) {
    if (raw === null || raw === undefined || raw === "") return fallback;
    if (typeof raw !== "string") return raw;
    try { return JSON.parse(raw); } catch { return fallback; }
  }
  function fingerprint(source) {
    const value = typeof source === "string" ? source : JSON.stringify(source);
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `${value.length}:${(hash >>> 0).toString(16)}`;
  }
  function sourceObject(source) {
    if (typeof source === "string") {
      const parsed = JSON.parse(source);
      if (!isPlainObject(parsed)) throw new Error("Backupen må være et JSON-objekt.");
      return parsed;
    }
    if (!isPlainObject(source)) throw new Error("Backupen må være et JSON-objekt.");
    return source;
  }
  function extractMemoryCandidate(source) {
    const root = sourceObject(source);
    const backup = asObject(root.backup);
    const containers = [
      root.data,
      root.localStorage,
      root.storage,
      backup.data,
      backup.localStorage,
      backup.storage,
      root
    ];
    for (const container of containers) {
      if (isPlainObject(container) && Object.prototype.hasOwnProperty.call(container, MEMORY_KEY)) {
        return { found: true, value: container[MEMORY_KEY] };
      }
    }
    return { found: false, value: null };
  }
  function validateMemory(value) {
    if (!isPlainObject(value)) return { ok: false, error: "invalid_type" };
    if (value.feedback !== undefined && !Array.isArray(value.feedback)) return { ok: false, error: "invalid_feedback" };
    if (value.selfModel !== undefined && !isPlainObject(value.selfModel)) return { ok: false, error: "invalid_self_model" };
    if (value.version !== undefined && typeof value.version !== "string") return { ok: false, error: "invalid_version" };
    if (value.updatedAt !== undefined && typeof value.updatedAt !== "string") return { ok: false, error: "invalid_updated_at" };
    return { ok: true };
  }
  function sanitizeNested(value, depth = 0) {
    if (depth > 20) throw new Error("Backupen inneholder for dypt nestede data.");
    if (Array.isArray(value)) return value.map((entry) => sanitizeNested(entry, depth + 1));
    if (!isPlainObject(value)) return value;
    const out = {};
    Object.entries(value).forEach(([key, child]) => {
      if (global.AHAPrivacyRestore?.isSecretKey?.(key)) return;
      if (isPlainObject(child) && child.blocked === true && child.redacted === true) return;
      out[key] = sanitizeNested(child, depth + 1);
    });
    return out;
  }
  function memoryReport() {
    const raw = global.localStorage?.getItem(MEMORY_KEY);
    const parsed = safeParse(raw, null);
    const feedback = Array.isArray(parsed?.feedback) ? parsed.feedback : [];
    return {
      key: MEMORY_KEY,
      label: "AHA Meta Insights Memory / selvmodell-feedback",
      exists: raw !== null,
      bytes: raw ? raw.length : 0,
      itemCount: feedback.length,
      kind: "object",
      isHistoryGo: false,
      isAHA: true,
      canClear: false,
      activeCount: raw !== null ? 1 : 0,
      deletedCount: 0,
      archivedCount: 0,
      importedCount: 0,
      localOnlyCount: raw !== null ? 1 : 0,
      externalPublishedCount: 0,
      echonetSharedCount: 0,
      syncEnabledCount: 0,
      candidateOnlyCount: 0,
      curationOnlyCount: 0,
      derivedGraphCount: 0,
      fineTuningEnabledCount: 0,
      autoTrainingEnabledCount: 0,
      modelTrainingEnabledCount: 0,
      remoteUploadEnabledCount: 0,
      hasPreviewData: false,
      hasImportData: false,
      local_only: true,
      has_tombstones: false,
      has_deleted: false,
      has_archived: false,
      containsSecret: false
    };
  }
  const EXPORT_CATEGORIES = Object.freeze(["chat", "notes", "media", "collections", "music", "knowledge", "memory", "profile"]);

  function exportCategoryForKey(key) {
    if (key === MEMORY_KEY) return "memory";
    if (key === "aha_chat_sessions_v1") return "chat";
    if (/^aha_(?:notes|articles)_/.test(key)) return "notes";
    if (/^aha_(?:insta_|gallery_|feed_)/.test(key)) return "media";
    if (/^aha_(?:lists_|concept_lists_|paths_|groups_)/.test(key)) return "collections";
    if (/^aha_music_/.test(key)) return "music";
    if (/^aha_(?:profile_|privacy_settings)/.test(key)) return "profile";
    return "knowledge";
  }

  function selectedCategories(options) {
    const requested = Array.isArray(options?.categories) ? options.categories : EXPORT_CATEGORIES;
    return new Set(requested.filter((category) => EXPORT_CATEGORIES.includes(category)));
  }

  function buildExportPayload(options = {}) {
    const privacy = global.AHAPrivacy;
    if (!privacy?.collectStorageReport || !privacy?.sanitizeForExport) throw new Error("AHA Privacy er ikke tilgjengelig.");
    const categories = selectedCategories(options);
    const report = privacy.collectStorageReport();
    const data = {};
    report.filter((item) => item.isAHA && !item.blocked && item.kind !== "blocked_secret" && categories.has(exportCategoryForKey(item.key))).forEach((item) => {
      const raw = global.localStorage?.getItem(item.key);
      data[item.key] = privacy.sanitizeForExport(safeParse(raw, raw));
    });
    if (categories.has("memory")) {
      const memoryRaw = global.localStorage?.getItem(MEMORY_KEY);
      data[MEMORY_KEY] = privacy.sanitizeForExport(safeParse(memoryRaw, memoryRaw));
    }
    const blockedSecrets = report.filter((item) => item.blocked || item.kind === "blocked_secret").map((item) => ({
      key: item.key,
      blocked: true,
      redacted: true,
      preview: "[redacted secret]"
    }));
    return {
      meta: {
        exportedAt: new Date().toISOString(),
        app: "AHA",
        version: 1,
        local_only: true,
        sessionStorage_note: "sessionStorage token/PKCE payloads are not included in this export."
      },
      blockedSecrets,
      data,
      privacyReport: report.filter((item) => categories.has(exportCategoryForKey(item.key))).concat(categories.has("memory") ? [memoryReport()] : [])
    };
  }
  function downloadExport(options = {}) {
    const payload = buildExportPayload(options);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = global.URL.createObjectURL(blob);
    const anchor = global.document.createElement("a");
    anchor.href = url;
    anchor.download = `aha-export-${new Date().toISOString().slice(0, 10)}.json`;
    global.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    global.URL.revokeObjectURL(url);
    return payload;
  }
  function removeBaseUnknown(summary) {
    const skipped = { ...asObject(summary.skipped) };
    skipped.unknown = Math.max(0, Number(skipped.unknown || 0) - 1);
    return {
      ...summary,
      skipped,
      skippedEntries: Array.isArray(summary.skippedEntries)
        ? summary.skippedEntries.filter((entry) => entry?.key !== MEMORY_KEY)
        : []
    };
  }
  function previewRestore(source) {
    const base = global.AHAPrivacyRestore;
    if (!base?.previewRestore) throw new Error("AHA restore er ikke tilgjengelig.");
    const baseSummary = base.previewRestore(source);
    const candidate = extractMemoryCandidate(source);
    let summary = {
      ...baseSummary,
      restorableKeys: Array.isArray(baseSummary.restorableKeys) ? [...baseSummary.restorableKeys] : [],
      skipped: { ...asObject(baseSummary.skipped) },
      skippedEntries: Array.isArray(baseSummary.skippedEntries) ? baseSummary.skippedEntries.map((entry) => ({ ...entry })) : [],
      personalAiMemory: false
    };
    if (candidate.found) {
      summary = removeBaseUnknown(summary);
      const validation = validateMemory(candidate.value);
      if (validation.ok) {
        summary.personalAiMemory = true;
        summary.restorableCount = Number(summary.restorableCount || 0) + 1;
        if (!summary.restorableKeys.includes(MEMORY_KEY)) summary.restorableKeys.push(MEMORY_KEY);
      } else {
        summary.skipped.invalid = Number(summary.skipped.invalid || 0) + 1;
        summary.skippedEntries.push({ key: MEMORY_KEY, reason: "invalid" });
      }
    }
    lastPreviewFingerprint = fingerprint(source);
    return summary;
  }
  function invalidateDerivedCaches() {
    let removed = 0;
    DERIVED_CACHE_KEYS.forEach((key) => {
      try {
        if (global.localStorage?.getItem(key) !== null) removed += 1;
        global.localStorage?.removeItem(key);
      } catch {}
    });
    return removed;
  }
  function applyRestore(source) {
    if (!lastPreviewFingerprint || fingerprint(source) !== lastPreviewFingerprint) {
      throw new Error("Vis forhåndsvisning av denne backupen før gjenoppretting.");
    }
    const candidate = extractMemoryCandidate(source);
    let cleanMemory = null;
    if (candidate.found) {
      const validation = validateMemory(candidate.value);
      if (validation.ok) cleanMemory = sanitizeNested(candidate.value);
    }
    const previousMemory = global.localStorage?.getItem(MEMORY_KEY) ?? null;
    let memoryWritten = false;
    try {
      if (cleanMemory) {
        let nextMemory = cleanMemory;
        if (previousMemory !== null) {
          const existing = safeParse(previousMemory, null);
          nextMemory = validateMemory(existing).ok
            ? global.AHAPrivacyRestore.mergeAdditive(existing, cleanMemory)
            : null;
        }
        if (nextMemory) {
          const serialized = JSON.stringify(nextMemory);
          if (serialized !== previousMemory) {
            global.localStorage?.setItem(MEMORY_KEY, serialized);
            memoryWritten = true;
          }
        }
      }
      let baseResult = global.AHAPrivacyRestore.applyRestore(source);
      if (candidate.found) baseResult = removeBaseUnknown(baseResult);
      const invalidatedDerivedCaches = memoryWritten ? invalidateDerivedCaches() : 0;
      lastPreviewFingerprint = "";
      return {
        ...baseResult,
        restorableCount: Number(baseResult.restorableCount || 0) + (memoryWritten ? 1 : 0),
        appliedCount: Number(baseResult.appliedCount || 0) + (memoryWritten ? 1 : 0),
        restorableKeys: [...(Array.isArray(baseResult.restorableKeys) ? baseResult.restorableKeys : []), ...(memoryWritten ? [MEMORY_KEY] : [])],
        personalAiMemory: memoryWritten,
        invalidatedDerivedCaches
      };
    } catch (error) {
      if (memoryWritten) {
        try {
          if (previousMemory === null) global.localStorage?.removeItem(MEMORY_KEY);
          else global.localStorage?.setItem(MEMORY_KEY, previousMemory);
        } catch {}
      }
      lastPreviewFingerprint = "";
      throw error;
    }
  }
  function renderMemoryPrivacyCard() {
    const list = global.document?.getElementById("privacy-storage-report");
    if (!list) return;
    list.querySelector?.("[data-personal-ai-memory-privacy]")?.remove?.();
    const report = memoryReport();
    const article = global.document.createElement("article");
    article.className = "privacy-storage-card";
    article.setAttribute("data-personal-ai-memory-privacy", "1");
    article.innerHTML = `<div><h3>${report.label}</h3><p class="privacy-key">${MEMORY_KEY}</p><div class="privacy-storage-meta"><span class="privacy-pill ${report.exists ? "is-on" : "is-off"}">${report.exists ? "Finnes" : "Finnes ikke"}</span><span class="privacy-pill">AHA</span><span class="privacy-pill">object</span></div><p class="privacy-small">Feedback: ${report.itemCount} · Bytes: ${report.bytes} · Local-only</p><p class="privacy-small">Dette er canonical feedback til «Dette vet AHA om deg». Backup/restore bevarer denne tilstanden; avledede retrieval-indekser bygges på nytt etter restore.</p></div><div class="privacy-clear-row"><span class="privacy-small">Styr innholdet fra Personal AI-siden.</span></div>`;
    list.appendChild(article);
  }
  function renderRestorePreview(summary) {
    const target = global.document?.getElementById("privacy-restore-preview-result");
    if (!target) return;
    const skipped = asObject(summary.skipped);
    target.textContent = [
      `Kan gjenopprettes: ${summary.restorableCount || 0}`,
      `Personal AI-minne: ${summary.personalAiMemory ? "ja" : "nei"}`,
      `History Go hoppet over: ${skipped.historyGo || 0}`,
      `Hemmeligheter hoppet over: ${skipped.secrets || 0}`,
      `Ukjente nøkler hoppet over: ${skipped.unknown || 0}`,
      `Ugyldige verdier hoppet over: ${skipped.invalid || 0}`,
      `Tillatte nøkler: ${(summary.restorableKeys || []).join(", ") || "ingen"}`
    ].join("\n");
  }
  function setMessage(value) {
    const target = global.document?.getElementById("privacy-action-message");
    if (target) target.textContent = value;
  }
  function bindUi() {
    const exportButton = global.document?.getElementById("privacy-export-complete");
    const fileInput = global.document?.getElementById("privacy-restore-file");
    const previewButton = global.document?.getElementById("privacy-restore-preview-complete");
    const applyButton = global.document?.getElementById("privacy-restore-apply-complete");
    const confirmInput = global.document?.getElementById("privacy-restore-confirmation");
    let backupText = "";
    let previewReady = false;
    const refreshConfirmation = () => {
      if (applyButton) applyButton.disabled = !previewReady || confirmInput?.value !== "GJENOPPRETT";
    };
    confirmInput?.addEventListener("input", refreshConfirmation);

    exportButton?.addEventListener("click", () => {
      try {
        const choices = Array.from(global.document?.querySelectorAll?.('input[name="privacy-export-category"]') || []);
        const categories = choices.filter((item) => item.checked).map((item) => item.value);
        if (choices.length && !categories.length) throw new Error("Velg minst én datakategori før eksport.");
        downloadExport(choices.length ? { categories } : {});
        setMessage("De valgte AHA-kategoriene er eksportert lokalt. Tokens og andre hemmeligheter er fortsatt blokkert.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Eksporten mislyktes.");
      }
    });

    if (fileInput && previewButton && applyButton) {
      applyButton.disabled = true;
      fileInput.addEventListener("change", () => {
        backupText = "";
        lastPreviewFingerprint = "";
        previewReady = false;
        if (confirmInput) confirmInput.value = "";
        refreshConfirmation();
        const target = global.document?.getElementById("privacy-restore-preview-result");
        if (target) target.textContent = "";
      });
      previewButton.addEventListener("click", async () => {
        const file = fileInput.files?.[0];
        if (!file) return setMessage("Velg en backupfil først.");
        try {
          if (file.size > Number(global.AHAPrivacyRestore?.MAX_BACKUP_BYTES || 5_000_000)) throw new Error("Backupfilen er større enn 5 MB.");
          backupText = await file.text();
          const summary = previewRestore(backupText);
          renderRestorePreview(summary);
          previewReady = Number(summary.restorableCount || 0) > 0;
          if (confirmInput) confirmInput.value = "";
          refreshConfirmation();
          setMessage("Forhåndsvisningen er klar. Skriv GJENOPPRETT for å bekrefte. Ingen data er skrevet ennå.");
        } catch (error) {
          backupText = "";
          lastPreviewFingerprint = "";
          previewReady = false;
          refreshConfirmation();
          setMessage(error instanceof Error ? error.message : "Kunne ikke lese backupen.");
        }
      });
      applyButton.addEventListener("click", () => {
        if (!previewReady || confirmInput?.value !== "GJENOPPRETT") {
          setMessage("Skriv GJENOPPRETT etter forhåndsvisningen.");
          return;
        }
        try {
          const result = applyRestore(backupText);
          renderRestorePreview(result);
          setMessage(`Oppdatert ${result.appliedCount || 0} AHA-nøkler, uendret ${result.unchangedCount || 0}. Eksisterende data ble beholdt; History Go og hemmeligheter ble ikke skrevet.`);
          renderMemoryPrivacyCard();
          global.AHAPrivacy?.refresh?.();
          setTimeout(renderMemoryPrivacyCard, 0);
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Gjenopprettingen mislyktes.");
        } finally {
          previewReady = false;
          if (confirmInput) confirmInput.value = "";
          refreshConfirmation();
        }
      });
    }

    global.document?.getElementById("privacy-refresh")?.addEventListener("click", () => setTimeout(renderMemoryPrivacyCard, 0));
    setTimeout(renderMemoryPrivacyCard, 0);
  }

  const api = {
    MEMORY_KEY,
    DERIVED_CACHE_KEYS: [...DERIVED_CACHE_KEYS],
    EXPORT_CATEGORIES,
    exportCategoryForKey,
    buildExportPayload,
    extractMemoryCandidate,
    validateMemory,
    previewRestore,
    applyRestore,
    invalidateDerivedCaches,
    memoryReport,
    bindUi
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.AHAPrivacyPersonalAiMemory = api;

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", bindUi);
    else bindUi();
  }
})(typeof window !== "undefined" ? window : globalThis);
