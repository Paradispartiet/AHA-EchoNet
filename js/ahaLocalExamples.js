// AHA Local Examples V1
// Explicit, reversible local-only example data for safe UI testing.
// This module intentionally does not call AHAIngest, AHARepository or module add APIs.
(function (global) {
  "use strict";

  const VERSION = "aha_local_examples_v1";
  const SEED_ID = "aha_local_examples_v1";
  const STORAGE_KEYS = Object.freeze({
    feed: "aha_feed_posts_v1",
    gallery: "aha_gallery_v1"
  });

  const EXAMPLES = Object.freeze({
    feed: Object.freeze([
      Object.freeze({
        id: "aha_example_feed_city_learning",
        text: "Eksempel: Jeg vil undersøke hvordan byrom, institusjoner og hverdagsliv henger sammen.",
        tags: ["eksempel", "byrom", "læring"],
        created_at: "2026-01-02T10:00:00.000Z",
        updated_at: "2026-01-02T10:00:00.000Z",
        local_only: true,
        external_published: false,
        echonet_shared: false,
        example_seed: true,
        meta: {
          source_app: "aha",
          source_type: "aha_feed_post",
          user_created: false,
          local_only: true,
          external_published: false,
          echonet_shared: false,
          example_seed_id: SEED_ID
        }
      }),
      Object.freeze({
        id: "aha_example_feed_history_question",
        text: "Eksempel: Hvilke historiske spor i Oslo kan kobles til et prosjekt jeg arbeider med?",
        tags: ["eksempel", "historie", "oslo"],
        created_at: "2026-01-02T10:01:00.000Z",
        updated_at: "2026-01-02T10:01:00.000Z",
        local_only: true,
        external_published: false,
        echonet_shared: false,
        example_seed: true,
        meta: {
          source_app: "aha",
          source_type: "aha_feed_post",
          user_created: false,
          local_only: true,
          external_published: false,
          echonet_shared: false,
          example_seed_id: SEED_ID
        }
      })
    ]),
    gallery: Object.freeze([
      Object.freeze({
        id: "aha_example_gallery_bislett",
        type: "image",
        title: "Bislett – eksempelreferanse",
        description: "Eksempel på en lokal visuell referanse uten opplastet bilde. Bruk kortet til å teste Galleri og Bibliotek.",
        caption: "",
        note: "Kun eksempeldata.",
        src: "",
        thumbnail: "",
        source_app: "aha",
        source_type: "aha_gallery_item",
        content_type: "image_reference",
        user_created: false,
        imported: false,
        local_only: true,
        tags: ["eksempel", "oslo", "sted"],
        example_seed: true,
        meta: {
          local_only: true,
          not_published: true,
          echonet_shared: false,
          image_analysis_enabled: false,
          example_seed_id: SEED_ID
        },
        created_at: "2026-01-02T10:02:00.000Z",
        updated_at: "2026-01-02T10:02:00.000Z"
      }),
      Object.freeze({
        id: "aha_example_gallery_source",
        type: "image",
        title: "Kildekort – eksempelreferanse",
        description: "Et tomt mediekort med metadata som kan brukes til å se hvordan lokale referanser opptrer i søk og galleri.",
        caption: "",
        note: "Kun eksempeldata.",
        src: "",
        thumbnail: "",
        source_app: "aha",
        source_type: "aha_gallery_item",
        content_type: "image_reference",
        user_created: false,
        imported: false,
        local_only: true,
        tags: ["eksempel", "kilde", "referanse"],
        example_seed: true,
        meta: {
          local_only: true,
          not_published: true,
          echonet_shared: false,
          image_analysis_enabled: false,
          example_seed_id: SEED_ID
        },
        created_at: "2026-01-02T10:03:00.000Z",
        updated_at: "2026-01-02T10:03:00.000Z"
      })
    ])
  });

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function storageFrom(options = {}) {
    return options.storage || global.localStorage || null;
  }

  function readArray(storage, key) {
    if (!storage?.getItem) return [];
    try {
      const parsed = JSON.parse(storage.getItem(key) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeArray(storage, key, items) {
    if (!storage?.setItem) return false;
    storage.setItem(key, JSON.stringify(Array.isArray(items) ? items : []));
    return true;
  }

  function isOwnExample(item) {
    return Boolean(
      item &&
      item.example_seed === true &&
      item.meta?.example_seed_id === SEED_ID
    );
  }

  function previewExamples() {
    return {
      version: VERSION,
      seed_id: SEED_ID,
      local_only: true,
      explicit_install_required: true,
      reversible: true,
      notes_excluded: true,
      stores: {
        feed: clone(EXAMPLES.feed),
        gallery: clone(EXAMPLES.gallery)
      },
      total: EXAMPLES.feed.length + EXAMPLES.gallery.length
    };
  }

  function collectExampleStatus(options = {}) {
    const storage = storageFrom(options);
    const byStore = {};
    let installed = 0;

    for (const [store, key] of Object.entries(STORAGE_KEYS)) {
      const items = readArray(storage, key);
      const exampleItems = items.filter(isOwnExample);
      byStore[store] = {
        key,
        total_records: items.length,
        example_records: exampleItems.length
      };
      installed += exampleItems.length;
    }

    return {
      version: VERSION,
      seed_id: SEED_ID,
      installed,
      expected: EXAMPLES.feed.length + EXAMPLES.gallery.length,
      fully_installed: installed === EXAMPLES.feed.length + EXAMPLES.gallery.length,
      by_store: byStore
    };
  }

  function installExamples(options = {}) {
    const storage = storageFrom(options);
    if (!storage?.setItem || !storage?.getItem) {
      return { ok: false, error: "local_storage_unavailable", added: 0, skipped: 0 };
    }

    let added = 0;
    let skipped = 0;
    const stores = {};

    for (const [store, key] of Object.entries(STORAGE_KEYS)) {
      const existing = readArray(storage, key);
      const existingIds = new Set(existing.map((item) => String(item?.id || "")).filter(Boolean));
      const additions = [];

      for (const example of EXAMPLES[store]) {
        if (existingIds.has(example.id)) {
          skipped += 1;
          continue;
        }
        additions.push(clone(example));
        added += 1;
      }

      writeArray(storage, key, [...additions, ...existing]);
      stores[store] = { added: additions.length, total_after: additions.length + existing.length };
    }

    return {
      ok: true,
      local_only: true,
      seed_id: SEED_ID,
      added,
      skipped,
      stores,
      status: collectExampleStatus({ storage })
    };
  }

  function removeExamples(options = {}) {
    const storage = storageFrom(options);
    if (!storage?.setItem || !storage?.getItem) {
      return { ok: false, error: "local_storage_unavailable", removed: 0 };
    }

    let removed = 0;
    const stores = {};

    for (const [store, key] of Object.entries(STORAGE_KEYS)) {
      const existing = readArray(storage, key);
      const kept = existing.filter((item) => !isOwnExample(item));
      const removedHere = existing.length - kept.length;
      removed += removedHere;
      writeArray(storage, key, kept);
      stores[store] = { removed: removedHere, total_after: kept.length };
    }

    return {
      ok: true,
      local_only: true,
      seed_id: SEED_ID,
      removed,
      stores,
      status: collectExampleStatus({ storage })
    };
  }

  global.AHALocalExamples = {
    VERSION,
    SEED_ID,
    STORAGE_KEYS,
    EXAMPLES,
    previewExamples,
    collectExampleStatus,
    installExamples,
    removeExamples,
    isOwnExample
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = global.AHALocalExamples;
  }
})(typeof window !== "undefined" ? window : globalThis);
