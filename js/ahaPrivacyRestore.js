// ahaPrivacyRestore.js
// Safe, additive restore for AHA privacy exports. History Go data, secrets and unknown keys are never restored.

(function (global) {
  "use strict";

  const MAX_BACKUP_BYTES = 20_000_000;
  const SETTINGS_KEY = "aha_privacy_settings_v1";
  const SAFE_PAYMENT_STATE_KEYS = new Set(["ahaPaymentReady", "ahaVerifiedPayment"]);

  const ALLOWLIST = Object.freeze({
    "aha_insight_chamber_v1": "object",
    "aha_source_events_v1": "array",
    "aha_chat_sessions_v1": "array",
    "aha_notes_v1": "array",
    "aha_gallery_v1": "array",
    "aha_feed_posts_v1": "array",
    "aha_insta_posts_v1": "array",
    "aha_insta_stories_v1": "array",
    "aha_insta_import_sessions_v1": "array",
    "aha_insta_import_preview_v1": "array",
    "aha_insta_profile_v1": "object",
    "aha_insta_likes_v1": "array",
    "aha_insta_comments_v1": "array",
    "aha_insta_follows_v1": "array",
    "aha_lists_v1": "array",
    "aha_concept_lists_v1": "array",
    "aha_paths_v1": "array",
    "aha_articles_v1": "array",
    "aha_groups_v1": "array",
    "aha_music_library_v1": "object",
    "aha_music_history_go_bridge_v1": "object",
    "aha_music_historygo_bridge_v1": "object",
    "aha_music_export_audit_v1": "array",
    "aha_data_intake_queue_v1": "array",
    "aha_source_connectors_last_scan_v1": "object",
    "aha_knowledge_curation_v1": "array",
    "aha_knowledge_map_v1": "object",
    "aha_knowledge_workbench_status_v1": "object",
    "aha_knowledge_graph_intelligence_v1": "object",
    "aha_training_corpus_v1": "array",
    "aha_training_examples_v1": "array",
    "aha_personal_ai_control_status_v1": "object",
    "aha_personal_retrieval_index_v1": "object",
    "aha_personal_semantic_index_v1": "object",
    "aha_personal_ai_loop_audit_v1": "object",
    "aha_personal_answer_evaluations_v1": "array",
    [SETTINGS_KEY]: "privacy_settings",
    "aha_profile_name": "string",
    "aha_profile_id": "string",
    "aha_pending_chat_prompt_v1": "object",

    // Older AHA exports that are still safe to restore locally.
    "ahaProfile": "object",
    "ahaProfiles": "json",
    "ahaUserProfile": "object",
    "ahaMediaPrefs": "object",
    "ahaPaymentReady": "boolean",
    "ahaVerifiedPayment": "boolean",
    "aha_age_confirmed": "boolean",
    "aha_caregiver_mode": "boolean",
    "aha_accessibility_prefs": "object",
    "aha_contrast_mode": "string",
    "aha_reduced_motion": "boolean",
    "aha_identity_v3": "object",
    "aha_psycheck_settings_v2": "object",
    "aha_psycheck_settings_v3": "object"
  });

  const HISTORY_GO_EXACT_KEYS = new Set([
    "aha_import_payload_v1",
    "hg_unlocks_v1",
    "visited_places",
    "people_collected",
    "historygo_progress",
    "aha_history_go_recognizer_v1",
    "aha_history_go_recognizer_v2",
    "aha_history_go_patterns_v1",
    "aha_history_go_faces_v1",
    "aha_history_go_face_model_v1",
    "aha_history_go_landmarks_v1",
    "aha_history_go_profile_v1",
    "aha_history_go_local_signatures_v1"
  ]);

  const SECRET_KEY_PATTERNS = [
    /(?:^|[_-])(?:access|refresh)[_-]?token(?:$|[_-])/i,
    /token/i,
    /secret/i,
    /api[_-]?key/i,
    /password/i,
    /credential/i,
    /authorization/i,
    /oauth/i,
    /pkce/i,
    /recovery/i,
    /private[_-]?key/i,
    /session[_-]?key/i,
    /payment/i
  ];

  let lastPreviewFingerprint = "";

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function isHistoryGoKey(key) {
    const text = String(key || "");
    return HISTORY_GO_EXACT_KEYS.has(text)
      || /^hg_/i.test(text)
      || /history[_-]?go/i.test(text)
      || /^historygo/i.test(text);
  }

  function isSecretKey(key) {
    const text = String(key || "");
    if (SAFE_PAYMENT_STATE_KEYS.has(text)) return false;
    return SECRET_KEY_PATTERNS.some((pattern) => pattern.test(text));
  }

  function allowedKind(key) {
    if (Object.prototype.hasOwnProperty.call(ALLOWLIST, key)) return ALLOWLIST[key];
    if (/^aha_psy_[A-Za-z0-9_.-]+\.db$/.test(key)) return "json";
    return null;
  }

  function isValidKind(value, kind) {
    if (kind === "array") return Array.isArray(value);
    if (kind === "object" || kind === "privacy_settings") return isPlainObject(value);
    if (kind === "string") return typeof value === "string";
    if (kind === "boolean") return typeof value === "boolean";
    if (kind === "json") return value !== undefined && typeof value !== "function";
    return false;
  }

  const UNSAFE_OBJECT_KEYS = new Set(["__proto__", "constructor", "prototype"]);

  function sanitizeNested(value, stats, depth = 0) {
    if (depth > 20) throw new Error("Backupen inneholder for dypt nestede data.");
    if (Array.isArray(value)) return value.map((item) => sanitizeNested(item, stats, depth + 1));
    if (!isPlainObject(value)) return value;

    const out = {};
    Object.entries(value).forEach(([key, child]) => {
      if (isSecretKey(key) || UNSAFE_OBJECT_KEYS.has(key)) {
        stats.secretFields += 1;
        return;
      }
      if (isPlainObject(child) && child.blocked === true && child.redacted === true) {
        stats.redactedFields += 1;
        return;
      }
      out[key] = sanitizeNested(child, stats, depth + 1);
    });
    return out;
  }

  function normalizePrivacySettings(value, stats) {
    if (!isPlainObject(value)) return null;
    const clean = sanitizeNested(value, stats);
    const out = {};
    const boolKeys = [
      "localOnly",
      "allowCollectiveLearning",
      "allowPublicPublishing",
      "allowSocialSharing",
      "allowHistoryGoImport",
      "allowAnalytics"
    ];
    boolKeys.forEach((key) => {
      if (typeof clean[key] === "boolean") out[key] = clean[key];
    });
    if (typeof clean.updatedAt === "string") out.updatedAt = clean.updatedAt;
    if (typeof clean.updated_at === "string" && !out.updatedAt) out.updatedAt = clean.updated_at;
    if (isPlainObject(clean.meta)) out.meta = clean.meta;
    out.id = "aha_privacy_settings";
    return out;
  }

  function sourceToObject(source) {
    if (typeof source === "string") {
      if (new Blob([source]).size > MAX_BACKUP_BYTES) throw new Error("Backupfilen er større enn 20 MB.");
      let parsed;
      try {
        parsed = JSON.parse(source);
      } catch {
        throw new Error("Backupfilen inneholder ugyldig JSON.");
      }
      if (!isPlainObject(parsed)) throw new Error("Backupen må være et JSON-objekt.");
      return parsed;
    }
    if (!isPlainObject(source)) throw new Error("Backupen må være et JSON-objekt.");
    const serialized = JSON.stringify(source);
    if (new Blob([serialized]).size > MAX_BACKUP_BYTES) throw new Error("Backupfilen er større enn 20 MB.");
    return source;
  }

  function fingerprintSource(source) {
    const text = typeof source === "string" ? source : JSON.stringify(source);
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `${text.length}:${(hash >>> 0).toString(16)}`;
  }

  function makeSkipCounters() {
    return { historyGo: 0, secrets: 0, unknown: 0, invalid: 0, redacted: 0 };
  }

  function addContainerCandidates(container, label, candidates, skip) {
    if (!isPlainObject(container)) {
      if (container !== undefined && container !== null) skip.invalid += 1;
      return;
    }
    Object.entries(container).forEach(([key, value]) => {
      if (!candidates.has(key)) candidates.set(key, { key, value, source: label });
    });
  }

  function extractCandidates(root, skip) {
    const candidates = new Map();

    addContainerCandidates(root.data, "data", candidates, skip);
    addContainerCandidates(root.localStorage, "localStorage", candidates, skip);
    addContainerCandidates(root.storage, "storage", candidates, skip);
    if (isPlainObject(root.backup)) {
      addContainerCandidates(root.backup.data, "backup.data", candidates, skip);
      addContainerCandidates(root.backup.localStorage, "backup.localStorage", candidates, skip);
      addContainerCandidates(root.backup.storage, "backup.storage", candidates, skip);
    }

    // Legacy structured exports.
    if (isPlainObject(root.settings) && !candidates.has(SETTINGS_KEY)) {
      candidates.set(SETTINGS_KEY, { key: SETTINGS_KEY, value: root.settings, source: "settings" });
    }
    if (isPlainObject(root.profile)) addContainerCandidates(root.profile, "profile", candidates, skip);
    if (isPlainObject(root.identity)) {
      const identityKeys = Object.keys(root.identity);
      const containsStorageKey = identityKeys.some((key) => allowedKind(key));
      if (containsStorageKey) addContainerCandidates(root.identity, "identity", candidates, skip);
      else if (!candidates.has("aha_identity_v3")) {
        candidates.set("aha_identity_v3", { key: "aha_identity_v3", value: root.identity, source: "identity" });
      }
    }
    if (root.history !== undefined) skip.historyGo += 1;

    const metadataKeys = new Set([
      "meta", "version", "exportedAt", "exported_at", "blockedSecrets", "privacyReport",
      "data", "localStorage", "storage", "backup", "settings", "profile", "identity", "history"
    ]);

    Object.entries(root).forEach(([key, value]) => {
      if (metadataKeys.has(key) || candidates.has(key)) return;
      if (allowedKind(key) || isHistoryGoKey(key) || isSecretKey(key) || /^aha_/i.test(key) || /^hg_/i.test(key)) {
        candidates.set(key, { key, value, source: "root" });
      }
    });

    return candidates;
  }

  function classifyCandidate(candidate, skip, skippedEntries) {
    const { key, value, source } = candidate;
    if (isHistoryGoKey(key)) {
      skip.historyGo += 1;
      skippedEntries.push({ key, reason: "history_go", source });
      return null;
    }
    if (isSecretKey(key)) {
      skip.secrets += 1;
      skippedEntries.push({ key, reason: "secret", source });
      return null;
    }

    const kind = allowedKind(key);
    if (!kind) {
      skip.unknown += 1;
      skippedEntries.push({ key, reason: "unknown", source });
      return null;
    }
    if (!isValidKind(value, kind)) {
      skip.invalid += 1;
      skippedEntries.push({ key, reason: "invalid_type", source });
      return null;
    }

    const stats = { secretFields: 0, redactedFields: 0 };
    const clean = kind === "privacy_settings"
      ? normalizePrivacySettings(value, stats)
      : sanitizeNested(value, stats);

    if (kind === "privacy_settings" && !clean) {
      skip.invalid += 1;
      skippedEntries.push({ key, reason: "invalid_type", source });
      return null;
    }

    skip.secrets += stats.secretFields;
    skip.redacted += stats.redactedFields;
    return { key, kind, value: clean, source, secretFieldsSkipped: stats.secretFields, redactedFieldsSkipped: stats.redactedFields };
  }

  function buildRestorePlan(source) {
    const root = sourceToObject(source);
    const skip = makeSkipCounters();
    const candidates = extractCandidates(root, skip);
    const entries = [];
    const skippedEntries = [];

    candidates.forEach((candidate) => {
      const classified = classifyCandidate(candidate, skip, skippedEntries);
      if (classified) entries.push(classified);
    });

    entries.sort((a, b) => a.key.localeCompare(b.key));
    skippedEntries.sort((a, b) => a.key.localeCompare(b.key));

    return {
      restorableCount: entries.length,
      entries,
      skipped: skip,
      skippedEntries
    };
  }

  function publicSummary(plan) {
    return {
      restorableCount: plan.restorableCount,
      restorableKeys: plan.entries.map((entry) => entry.key),
      skipped: { ...plan.skipped },
      skippedEntries: plan.skippedEntries.map((entry) => ({ ...entry }))
    };
  }

  // Never replace existing local records. Merge objects recursively and append only
  // new array records; matching IDs retain local values but gain missing nested data.
  function recordIdentity(value) {
    if (isPlainObject(value) && (typeof value.id === "string" || typeof value.id === "number")) {
      return "id:" + String(value.id);
    }
    return "value:" + JSON.stringify(value);
  }

  function mergeAdditive(existing, incoming, depth = 0) {
    if (depth > 20) throw new Error("Dataene er for dypt nestet til å flettes trygt.");
    if (Array.isArray(existing) && Array.isArray(incoming)) {
      const merged = existing.slice();
      const positions = new Map(merged.map((item, index) => [recordIdentity(item), index]));
      incoming.forEach((item) => {
        const identity = recordIdentity(item);
        if (!positions.has(identity)) {
          positions.set(identity, merged.length);
          merged.push(item);
        } else {
          const index = positions.get(identity);
          merged[index] = mergeAdditive(merged[index], item, depth + 1);
        }
      });
      return merged;
    }
    if (isPlainObject(existing) && isPlainObject(incoming)) {
      const merged = { ...existing };
      Object.entries(incoming).forEach(([key, value]) => {
        if (isSecretKey(key) || UNSAFE_OBJECT_KEYS.has(key)) return;
        if (!Object.prototype.hasOwnProperty.call(merged, key)) merged[key] = value;
        else merged[key] = mergeAdditive(merged[key], value, depth + 1);
      });
      return merged;
    }
    return existing === undefined ? incoming : existing;
  }

  function valueForStorage(entry) {
    const previous = global.localStorage.getItem(entry.key);
    if (previous !== null) {
      if (entry.kind === "array" || entry.kind === "object" || entry.kind === "privacy_settings") {
        let existing = null;
        try { existing = JSON.parse(previous); } catch { /* keep local data unchanged */ }
        if (isValidKind(existing, entry.kind)) return JSON.stringify(mergeAdditive(existing, entry.value));
        // An unreadable or wrongly typed store cannot be merged. A validated
        // backup may repair it; valid existing records are never overwritten.
        return JSON.stringify(entry.value);
      }
      // Existing scalar profile fields and preferences take priority.
      return previous;
    }
    return entry.kind === "string" ? entry.value : JSON.stringify(entry.value);
  }

  function previewRestore(source) {
    const plan = buildRestorePlan(source);
    lastPreviewFingerprint = fingerprintSource(source);
    return publicSummary(plan);
  }

  function applyRestore(source) {
    const fingerprint = fingerprintSource(source);
    if (!lastPreviewFingerprint || lastPreviewFingerprint !== fingerprint) {
      throw new Error("Vis forhåndsvisning av denne backupen før gjenoppretting.");
    }

    // Re-parse and re-validate immediately before mutation; never trust the preview plan.
    const plan = buildRestorePlan(source);
    const rollback = [];
    let appliedCount = 0;
    let unchangedCount = 0;
    try {
      plan.entries.forEach((entry) => {
        const previous = global.localStorage.getItem(entry.key);
        const next = valueForStorage(entry);
        if (previous === next) {
          unchangedCount += 1;
          return;
        }
        rollback.push({ key: entry.key, previous });
        global.localStorage.setItem(entry.key, next);
        appliedCount += 1;
      });
    } catch (error) {
      for (let i = rollback.length - 1; i >= 0; i -= 1) {
        const item = rollback[i];
        try {
          if (item.previous === null) global.localStorage.removeItem(item.key);
          else global.localStorage.setItem(item.key, item.previous);
        } catch { /* best-effort rollback */ }
      }
      throw error;
    } finally {
      lastPreviewFingerprint = "";
    }

    if (global.AHAPrivacy && typeof global.AHAPrivacy.refresh === "function") global.AHAPrivacy.refresh();
    return { ...publicSummary(plan), appliedCount, unchangedCount };
  }

  function renderPreview(summary) {
    const target = global.document?.getElementById("privacy-restore-preview-result");
    if (!target) return;
    const skipped = summary.skipped;
    target.textContent = [
      `Kan gjenopprettes: ${summary.restorableCount}`,
      "Eksisterende AHA-data beholdes. Nye poster og manglende felt legges til.",
      `History Go hoppet over: ${skipped.historyGo}`,
      `Hemmeligheter hoppet over: ${skipped.secrets}`,
      `Ukjente nøkler hoppet over: ${skipped.unknown}`,
      `Ugyldige verdier hoppet over: ${skipped.invalid}`,
      `Redigerte felt hoppet over: ${skipped.redacted}`,
      summary.restorableKeys.length ? `Tillatte nøkler: ${summary.restorableKeys.join(", ")}` : "Ingen tillatte nøkler funnet."
    ].join("\n");
  }

  function setMessage(text) {
    const message = global.document?.getElementById("privacy-action-message");
    if (message) message.textContent = text;
  }

  function bindRestoreUi() {
    const fileInput = global.document?.getElementById("privacy-restore-file");
    const previewButton = global.document?.getElementById("privacy-restore-preview");
    const applyButton = global.document?.getElementById("privacy-restore-apply");
    if (!fileInput || !previewButton || !applyButton) return;

    let backupText = "";
    applyButton.disabled = true;

    fileInput.addEventListener("change", () => {
      backupText = "";
      lastPreviewFingerprint = "";
      applyButton.disabled = true;
      const target = global.document?.getElementById("privacy-restore-preview-result");
      if (target) target.textContent = "";
    });

    previewButton.addEventListener("click", async () => {
      const file = fileInput.files?.[0];
      if (!file) {
        setMessage("Velg en AHA-backup først.");
        return;
      }
      if (file.size > MAX_BACKUP_BYTES) {
        setMessage("Backupfilen er større enn 20 MB.");
        applyButton.disabled = true;
        return;
      }
      try {
        backupText = await file.text();
        const summary = previewRestore(backupText);
        renderPreview(summary);
        applyButton.disabled = summary.restorableCount === 0;
        setMessage("Forhåndsvisningen er klar. Ingen data er endret ennå.");
      } catch (error) {
        backupText = "";
        lastPreviewFingerprint = "";
        applyButton.disabled = true;
        setMessage(error instanceof Error ? error.message : "Kunne ikke lese backupen.");
      }
    });

    applyButton.addEventListener("click", () => {
      try {
        const result = applyRestore(backupText);
        renderPreview(result);
        applyButton.disabled = true;
        setMessage(`${result.appliedCount} tillatte AHA-nøkler ble gjenopprettet. History Go, hemmeligheter og ukjente nøkler ble ikke skrevet.`);
      } catch (error) {
        applyButton.disabled = true;
        setMessage(error instanceof Error ? error.message : "Gjenopprettingen mislyktes.");
      }
    });
  }

  const api = {
    MAX_BACKUP_BYTES,
    buildRestorePlan,
    previewRestore,
    applyRestore,
    isHistoryGoKey,
    isSecretKey,
    allowedKind,
    mergeAdditive
  };

  global.AHAPrivacyRestore = api;
  global.AHAPrivacy = global.AHAPrivacy || {};
  global.AHAPrivacy.previewRestore = previewRestore;
  global.AHAPrivacy.applyRestore = applyRestore;

  if (global.document) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", bindRestoreUi);
    else bindRestoreUi();
  }
})(window);
