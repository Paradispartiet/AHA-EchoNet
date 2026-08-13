// ahaHistoryGoImportContract.js
// Runtime guard for the canonical History Go -> AHA payload contract.

(function (global) {
  "use strict";

  const CONTRACT_ID = "aha_import_payload_v1";
  const CONTRACT_VERSION = 1;
  const LEGACY_VERSION = "aha_import_payload_legacy_v0";

  const REQUIRED_ARRAYS = [
    "hg_knowledge_entries_v2",
    "hg_learning_log_v1",
    "hg_insights_events_v1",
    "notes",
    "dialogs"
  ];

  const OBJECT_FIELDS = [
    "hg_knowledge_memory_v1",
    "knowledge_universe",
    "merits_by_category",
    "visited_places",
    "quiz_progress",
    "historygo_progress",
    "trivia_universe",
    "hg_groundhopper_stats_v1",
    "hg_pc_wallet_v1",
    "local_profile",
    "aha_profile_cache",
    "nextup",
    "nextup_learning_signal",
    "hg_nextup_tri",
    "hg_nextup_mode_v1",
    "hg_active_path_v1",
    "nextup_profile"
  ];

  const ALLOWED_KEYS = new Set([
    "schema_version",
    "contract_version",
    "user_id",
    "profile_id",
    "source",
    "auth_source",
    "exported_at",
    "synced_from_historygo_at",
    "aha_display_name",
    ...REQUIRED_ARRAYS,
    ...OBJECT_FIELDS,
    "people_collected",
    "hg_unlocks_v1",
    "hg_nextup_history_v1",
    "hg_nextup_because",
    "privacy"
  ]);

  const LEGACY_SIGNAL_KEYS = [
    "hg_knowledge_entries_v2",
    "knowledge_universe",
    "hg_learning_log_v1",
    "hg_insights_events_v1",
    "nextup_learning_signal",
    "notes",
    "dialogs"
  ];

  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function issue(code, path, message) {
    return { code, path, message };
  }

  function isDateTime(value) {
    return typeof value === "string"
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
      && !Number.isNaN(Date.parse(value));
  }

  function parsePayload(input) {
    if (typeof input !== "string") return { ok: true, value: input };
    try {
      return { ok: true, value: JSON.parse(input) };
    } catch {
      return {
        ok: false,
        errors: [issue("invalid_json", "$", "Payloaden er ikke gyldig JSON.")]
      };
    }
  }

  function isRecognizedLegacyPayload(payload) {
    if (!isObject(payload)) return false;
    if (payload.source && payload.source !== "historygo") return false;
    return LEGACY_SIGNAL_KEYS.some((key) => Object.prototype.hasOwnProperty.call(payload, key));
  }

  function migrateLegacyPayload(payload) {
    const migrated = {
      ...payload,
      schema_version: CONTRACT_ID,
      contract_version: CONTRACT_VERSION,
      source: "historygo",
      exported_at: String(payload.exported_at || payload.exportedAt || payload.updated_at || payload.updatedAt || new Date().toISOString()),
      hg_knowledge_entries_v2: Array.isArray(payload.hg_knowledge_entries_v2) ? payload.hg_knowledge_entries_v2 : [],
      hg_learning_log_v1: Array.isArray(payload.hg_learning_log_v1) ? payload.hg_learning_log_v1 : [],
      hg_insights_events_v1: Array.isArray(payload.hg_insights_events_v1) ? payload.hg_insights_events_v1 : [],
      notes: Array.isArray(payload.notes) ? payload.notes : [],
      dialogs: Array.isArray(payload.dialogs) ? payload.dialogs : [],
      privacy: {
        scope: "private_user",
        public_sharing: false,
        model_training_allowed: false
      }
    };
    delete migrated.exportedAt;
    delete migrated.updated_at;
    delete migrated.updatedAt;
    return migrated;
  }

  function validatePayload(payload) {
    const errors = [];
    if (!isObject(payload)) {
      return {
        ok: false,
        errors: [issue("invalid_payload_type", "$", "Payloaden må være et JSON-objekt.")]
      };
    }

    for (const key of Object.keys(payload)) {
      if (!ALLOWED_KEYS.has(key)) {
        errors.push(issue("unknown_property", `$.${key}`, `Ukjent toppnivåfelt: ${key}.`));
      }
    }

    if (payload.schema_version !== CONTRACT_ID) {
      errors.push(issue("invalid_schema_version", "$.schema_version", `schema_version må være ${CONTRACT_ID}.`));
    }
    if (payload.contract_version !== CONTRACT_VERSION) {
      errors.push(issue("invalid_contract_version", "$.contract_version", "contract_version må være 1."));
    }
    if (payload.source !== "historygo") {
      errors.push(issue("invalid_source", "$.source", "source må være historygo."));
    }
    if (!isDateTime(payload.exported_at)) {
      errors.push(issue("invalid_exported_at", "$.exported_at", "exported_at må være et gyldig ISO-tidspunkt."));
    }

    if (payload.synced_from_historygo_at !== undefined && !isDateTime(payload.synced_from_historygo_at)) {
      errors.push(issue("invalid_synced_at", "$.synced_from_historygo_at", "synced_from_historygo_at må være et gyldig ISO-tidspunkt."));
    }
    for (const key of ["user_id", "profile_id"]) {
      if (payload[key] !== undefined && payload[key] !== null && typeof payload[key] !== "string") {
        errors.push(issue("invalid_field_type", `$.${key}`, `${key} må være tekst eller null.`));
      }
    }
    for (const key of ["auth_source", "aha_display_name", "hg_nextup_because"]) {
      if (payload[key] !== undefined && typeof payload[key] !== "string") {
        errors.push(issue("invalid_field_type", `$.${key}`, `${key} må være tekst.`));
      }
    }

    for (const key of REQUIRED_ARRAYS) {
      if (!Array.isArray(payload[key])) {
        errors.push(issue("invalid_field_type", `$.${key}`, `${key} må være en liste.`));
      } else {
        payload[key].forEach((item, index) => {
          if (!isObject(item)) {
            errors.push(issue("invalid_item_type", `$.${key}[${index}]`, `${key} kan bare inneholde objekter.`));
          }
        });
      }
    }
    if (payload.hg_nextup_history_v1 !== undefined && !Array.isArray(payload.hg_nextup_history_v1)) {
      errors.push(issue("invalid_field_type", "$.hg_nextup_history_v1", "hg_nextup_history_v1 må være en liste."));
    } else if (Array.isArray(payload.hg_nextup_history_v1)) {
      payload.hg_nextup_history_v1.forEach((item, index) => {
        if (!isObject(item)) {
          errors.push(issue("invalid_item_type", `$.hg_nextup_history_v1[${index}]`, "hg_nextup_history_v1 kan bare inneholde objekter."));
        }
      });
    }
    for (const key of OBJECT_FIELDS) {
      if (payload[key] !== undefined && !isObject(payload[key])) {
        errors.push(issue("invalid_field_type", `$.${key}`, `${key} må være et objekt.`));
      }
    }
    for (const key of ["people_collected", "hg_unlocks_v1"]) {
      if (payload[key] !== undefined && !isObject(payload[key]) && !Array.isArray(payload[key])) {
        errors.push(issue("invalid_field_type", `$.${key}`, `${key} må være et objekt eller en liste.`));
      }
    }

    const privacy = payload.privacy;
    if (!isObject(privacy)) {
      errors.push(issue("missing_privacy_policy", "$.privacy", "privacy må være eksplisitt satt."));
    } else {
      const privacyKeys = Object.keys(privacy);
      for (const key of privacyKeys) {
        if (!["scope", "public_sharing", "model_training_allowed"].includes(key)) {
          errors.push(issue("unknown_property", `$.privacy.${key}`, `Ukjent privacy-felt: ${key}.`));
        }
      }
      if (privacy.scope !== "private_user") {
        errors.push(issue("invalid_privacy_scope", "$.privacy.scope", "Importkontrakten tillater bare private_user."));
      }
      if (privacy.public_sharing !== false) {
        errors.push(issue("public_sharing_forbidden", "$.privacy.public_sharing", "History Go-import kan ikke aktivere offentlig deling."));
      }
      if (privacy.model_training_allowed !== false) {
        errors.push(issue("model_training_forbidden", "$.privacy.model_training_allowed", "History Go-import kan ikke gi samtykke til modelltrening."));
      }
    }

    return { ok: errors.length === 0, errors };
  }

  function preparePayload(input) {
    const parsed = parsePayload(input);
    if (!parsed.ok) return parsed;
    if (!isObject(parsed.value)) {
      return {
        ok: false,
        errors: [issue("invalid_payload_type", "$", "Payloaden må være et JSON-objekt.")]
      };
    }

    let payload = parsed.value;
    let migratedFrom = null;
    const declaredVersion = payload.schema_version;
    if (declaredVersion === undefined || declaredVersion === null || declaredVersion === "") {
      if (!isRecognizedLegacyPayload(payload)) {
        return {
          ok: false,
          errors: [issue("missing_schema_version", "$.schema_version", "Payloaden mangler schema_version og gjenkjennes ikke som eldre History Go-format.")]
        };
      }
      payload = migrateLegacyPayload(payload);
      migratedFrom = LEGACY_VERSION;
    } else if (declaredVersion !== CONTRACT_ID) {
      return {
        ok: false,
        errors: [issue("unsupported_contract_version", "$.schema_version", `Kontraktversjonen ${String(declaredVersion)} støttes ikke.`)]
      };
    }

    const validation = validatePayload(payload);
    if (!validation.ok) return validation;
    return {
      ok: true,
      payload,
      contract_id: CONTRACT_ID,
      contract_version: CONTRACT_VERSION,
      migrated_from: migratedFrom
    };
  }

  global.AHAHistoryGoImportContract = {
    CONTRACT_ID,
    CONTRACT_VERSION,
    LEGACY_VERSION,
    TOP_LEVEL_KEYS: Object.freeze(Array.from(ALLOWED_KEYS).sort()),
    REQUIRED_ARRAYS: Object.freeze(REQUIRED_ARRAYS.slice()),
    preparePayload,
    validatePayload,
    migrateLegacyPayload,
    isRecognizedLegacyPayload
  };
})(window);
