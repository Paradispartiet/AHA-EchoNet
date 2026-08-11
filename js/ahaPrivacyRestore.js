// ahaPrivacyRestore.js
// Safe local restore extension for AHAPrivacy. Preview is read-only; apply restores only allowlisted durable AHA data.

(function (global) {
  "use strict";

  const RESTORE_DEFINITIONS = Object.freeze([
    { key: "aha_insight_chamber_v1", label: "AHA innsikter", kind: "object" },
    { key: "aha_source_events_v1", label: "AHA kildehistorikk", kind: "array" },
    { key: "aha_notes_v1", label: "Notater", kind: "array" },
    { key: "aha_gallery_v1", label: "Galleri", kind: "array" },
    { key: "aha_feed_posts_v1", label: "Feed-innhold", kind: "array" },
    { key: "aha_insta_posts_v1", label: "Insta-innlegg", kind: "array" },
    { key: "aha_insta_stories_v1", label: "Insta-stories", kind: "array" },
    { key: "aha_insta_profile_v1", label: "Insta-profil", kind: "object" },
    { key: "aha_insta_likes_v1", label: "Insta-likes", kind: "array" },
    { key: "aha_insta_comments_v1", label: "Insta-kommentarer", kind: "array" },
    { key: "aha_insta_follows_v1", label: "Insta-følgerelasjoner", kind: "array" },
    { key: "aha_lists_v1", label: "Lister", kind: "array" },
    { key: "aha_paths_v1", label: "Stier", kind: "array" },
    { key: "aha_articles_v1", label: "AHAavisa-artikler", kind: "array" },
    { key: "aha_groups_v1", label: "Grupper og sirkler", kind: "array" },
    { key: "aha_music_library_v1", label: "Music metadata-bibliotek", kind: "object" },
    { key: "aha_knowledge_curation_v1", label: "Kunnskapskuratering", kind: "array" },
    { key: "aha_profile_name", label: "Profilnavn", kind: "string" },
    { key: "aha_profile_id", label: "Lokal profil-ID", kind: "string" }
  ]);

  const RESTORE_BY_KEY = new Map(RESTORE_DEFINITIONS.map((entry) => [entry.key, entry]));
  const SECRET_FIELD_PATTERNS = Object.freeze([
    /token/i,
    /refresh/i,
    /access/i,
    /secret/i,
    /pkce/i,
    /oauth/i,
    /api[_-]?key/i,
    /authorization/i
  ]);
  const CONTROL_FIELDS = new Set([
    "backend_enabled",
    "sync_enabled",
    "echonet_enabled",
    "echonet_shared",
    "external_sharing_enabled",
    "published_external",
    "model_training_enabled",
    "fine_tuning_enabled",
    "historygo_writeback_enabled",
    "history_go_writeback_enabled",
    "remote_upload_enabled",
    "auto_training_enabled",
    "collective_learning_enabled",
    "public_publishing_enabled",
    "social_sharing_enabled",
    "release_status"
  ]);

  function isPlainObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
  }

  function isBlockedRestoreField(key) {
    const normalized = String(key || "").trim().toLowerCase();
    if (CONTROL_FIELDS.has(normalized)) return true;
    return SECRET_FIELD_PATTERNS.some((pattern) => pattern.test(normalized));
  }

  function isRedactedMarker(value) {
    return isPlainObject(value) && value.blocked === true && value.redacted === true;
  }

  function sanitizeRestoreValue(value, stats) {
    if (Array.isArray(value)) {
      const next = [];
      value.forEach((item) => {
        if (isRedactedMarker(item)) {
          stats.strippedFields += 1;
          return;
        }
        next.push(sanitizeRestoreValue(item, stats));
      });
      return next;
    }
    if (!isPlainObject(value)) return value;

    const next = {};
    Object.entries(value).forEach(([key, entry]) => {
      if (isBlockedRestoreField(key) || isRedactedMarker(entry)) {
        stats.strippedFields += 1;
        return;
      }
      next[key] = sanitizeRestoreValue(entry, stats);
    });
    return next;
  }

  function valueMatchesKind(value, kind) {
    if (kind === "array") return Array.isArray(value);
    if (kind === "object") return isPlainObject(value);
    if (kind === "string") return typeof value === "string";
    return false;
  }

  function parseRestorePayload(input) {
    let payload = input;
    if (typeof input === "string") {
      try {
        payload = JSON.parse(input);
      } catch {
        return { ok: false, reason: "invalid_json" };
      }
    }
    if (!isPlainObject(payload)) return { ok: false, reason: "invalid_payload" };
    if (!isPlainObject(payload.meta) || payload.meta.app !== "AHA" || Number(payload.meta.version) !== 1) {
      return { ok: false, reason: "unsupported_backup" };
    }
    if (!isPlainObject(payload.data)) return { ok: false, reason: "missing_data" };
    return { ok: true, payload };
  }

  function buildRestorePlan(input) {
    const parsed = parseRestorePayload(input);
    if (!parsed.ok) {
      return {
        ok: false,
        reason: parsed.reason,
        accepted: [],
        skipped: [],
        strippedFields: 0,
        writes: []
      };
    }

    const accepted = [];
    const skipped = [];
    const writes = [];
    let strippedFields = 0;

    Object.entries(parsed.payload.data).forEach(([key, rawValue]) => {
      const def = RESTORE_BY_KEY.get(key);
      if (!def) {
        skipped.push({ key, reason: "not_allowlisted" });
        return;
      }
      if (rawValue === null || rawValue === undefined) {
        skipped.push({ key, reason: "not_present" });
        return;
      }
      if (!valueMatchesKind(rawValue, def.kind)) {
        skipped.push({ key, label: def.label, reason: "wrong_type" });
        return;
      }

      const stats = { strippedFields: 0 };
      const value = sanitizeRestoreValue(rawValue, stats);
      strippedFields += stats.strippedFields;
      if (!valueMatchesKind(value, def.kind)) {
        skipped.push({ key, label: def.label, reason: "unsafe_value" });
        return;
      }

      accepted.push({
        key,
        label: def.label,
        kind: def.kind,
        itemCount: Array.isArray(value) ? value.length : 1,
        strippedFields: stats.strippedFields
      });
      writes.push({ key, kind: def.kind, value });
    });

    return {
      ok: true,
      version: 1,
      exportedAt: parsed.payload.meta.exportedAt || "",
      accepted,
      skipped,
      strippedFields,
      writes
    };
  }

  function previewRestore(input) {
    const plan = buildRestorePlan(input);
    return {
      ok: plan.ok,
      reason: plan.reason || "",
      version: plan.version || null,
      exportedAt: plan.exportedAt || "",
      accepted: plan.accepted,
      skipped: plan.skipped,
      acceptedCount: plan.accepted.length,
      skippedCount: plan.skipped.length,
      strippedFields: plan.strippedFields,
      local_only: true,
      preview_only: true,
      deletes_existing_data: false,
      restores_privacy_settings: false,
      restores_history_go: false,
      restores_tokens_or_sessions: false,
      enables_backend_or_sync: false,
      enables_echonet_or_sharing: false
    };
  }

  function serializeRestoreValue(write) {
    return write.kind === "string" ? write.value : JSON.stringify(write.value);
  }

  function applyRestore(input, confirmation) {
    if (confirmation !== "GJENOPPRETT") {
      return { ok: false, reason: "missing_confirmation", restoredKeys: [] };
    }

    const plan = buildRestorePlan(input);
    if (!plan.ok) return { ok: false, reason: plan.reason, restoredKeys: [] };
    if (!plan.writes.length) return { ok: false, reason: "nothing_to_restore", restoredKeys: [] };

    const storage = global.localStorage;
    if (!storage || typeof storage.setItem !== "function") {
      return { ok: false, reason: "storage_unavailable", restoredKeys: [] };
    }

    const prepared = plan.writes.map((write) => ({
      ...write,
      serialized: serializeRestoreValue(write),
      previous: storage.getItem(write.key)
    }));
    const written = [];

    try {
      prepared.forEach((write) => {
        storage.setItem(write.key, write.serialized);
        written.push(write);
      });
    } catch (error) {
      written.reverse().forEach((write) => {
        try {
          if (write.previous === null) storage.removeItem(write.key);
          else storage.setItem(write.key, write.previous);
        } catch {
          // Best-effort rollback. Never touch keys outside the restore plan.
        }
      });
      return {
        ok: false,
        reason: "write_failed",
        restoredKeys: [],
        error: String(error && error.message ? error.message : error)
      };
    }

    return {
      ok: true,
      restoredKeys: prepared.map((write) => write.key),
      restoredCount: prepared.length,
      skippedCount: plan.skipped.length,
      strippedFields: plan.strippedFields,
      local_only: true,
      deletedExistingData: false
    };
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  let pendingRestorePayload = null;
  let pendingRestorePreview = null;

  function setActionMessage(message) {
    const target = global.document?.getElementById?.("privacy-action-message");
    if (target) target.textContent = message;
  }

  function renderRestorePreview(preview) {
    const target = global.document?.getElementById?.("privacy-restore-preview-result");
    if (!target) return;
    if (!preview || !preview.ok) {
      target.innerHTML = `<p class="privacy-small">Sikkerhetskopien kunne ikke leses (${escapeHtml(preview?.reason || "ukjent feil")}). Ingen data er skrevet.</p>`;
      return;
    }

    const acceptedLabels = preview.accepted.map((item) => `<li>${escapeHtml(item.label)}</li>`).join("");
    target.innerHTML = `
      <div class="privacy-explain-card">
        <h3>Klar til gjenoppretting</h3>
        <p>${escapeHtml(String(preview.acceptedCount))} datalagre kan gjenopprettes. ${escapeHtml(String(preview.skippedCount))} hoppes over.</p>
        ${preview.strippedFields ? `<p>${escapeHtml(String(preview.strippedFields))} hemmelige eller aktiverende kontrollfelt fjernes før skriving.</p>` : ""}
        ${acceptedLabels ? `<ul>${acceptedLabels}</ul>` : "<p>Ingen godkjente data finnes i denne sikkerhetskopien.</p>"}
        <p class="privacy-small">Forhåndsvisningen skriver ingenting. Eksisterende data som ikke finnes i sikkerhetskopien blir ikke slettet.</p>
      </div>
    `;
  }

  function updateApplyButton() {
    const confirmInput = global.document?.getElementById?.("privacy-restore-confirm");
    const applyButton = global.document?.getElementById?.("privacy-restore-apply");
    if (!applyButton) return;
    applyButton.disabled = !(pendingRestorePreview?.ok && pendingRestorePreview.acceptedCount > 0 && confirmInput?.value === "GJENOPPRETT");
  }

  async function previewSelectedFile() {
    const input = global.document?.getElementById?.("privacy-restore-file");
    const file = input?.files?.[0];
    if (!file || typeof file.text !== "function") {
      setActionMessage("Velg en AHA JSON-sikkerhetskopi først.");
      return;
    }

    try {
      const text = await file.text();
      pendingRestorePayload = text;
      pendingRestorePreview = previewRestore(text);
      renderRestorePreview(pendingRestorePreview);
      updateApplyButton();
      setActionMessage(pendingRestorePreview.ok
        ? "Sikkerhetskopien er forhåndsvist. Ingen data er skrevet ennå."
        : "Sikkerhetskopien kunne ikke godkjennes. Ingen data er skrevet.");
    } catch {
      pendingRestorePayload = null;
      pendingRestorePreview = null;
      renderRestorePreview({ ok: false, reason: "file_read_failed" });
      updateApplyButton();
      setActionMessage("Sikkerhetskopien kunne ikke leses. Ingen data er skrevet.");
    }
  }

  function applySelectedRestore() {
    const confirmInput = global.document?.getElementById?.("privacy-restore-confirm");
    const confirmation = confirmInput?.value || "";
    const result = applyRestore(pendingRestorePayload, confirmation);
    if (!result.ok) {
      setActionMessage(result.reason === "missing_confirmation"
        ? "Skriv GJENOPPRETT før gjenoppretting."
        : "Gjenoppretting ble ikke utført.");
      return;
    }

    setActionMessage(`${result.restoredCount} lokale AHA-datalagre ble gjenopprettet. Ingen andre data ble slettet.`);
    if (global.AHAPrivacy && typeof global.AHAPrivacy.refresh === "function") global.AHAPrivacy.refresh();
  }

  function bindRestoreUi() {
    if (!global.document?.getElementById?.("privacy-restore-file")) return;
    global.document.getElementById("privacy-restore-preview")?.addEventListener?.("click", previewSelectedFile);
    global.document.getElementById("privacy-restore-confirm")?.addEventListener?.("input", updateApplyButton);
    global.document.getElementById("privacy-restore-apply")?.addEventListener?.("click", applySelectedRestore);
    updateApplyButton();
  }

  global.AHAPrivacy = Object.assign(global.AHAPrivacy || {}, {
    previewRestore,
    applyRestore,
    getRestorePolicy() {
      return {
        allowlistedKeys: RESTORE_DEFINITIONS.map((entry) => entry.key),
        local_only: true,
        requires_preview: true,
        requires_confirmation: "GJENOPPRETT",
        restores_privacy_settings: false,
        restores_history_go: false,
        restores_tokens_or_sessions: false,
        restores_release_or_control_state: false,
        enables_backend_or_sync: false,
        enables_echonet_or_sharing: false
      };
    }
  });

  if (global.document?.readyState === "loading") {
    global.document.addEventListener?.("DOMContentLoaded", bindRestoreUi);
  } else {
    bindRestoreUi();
  }
})(window);
