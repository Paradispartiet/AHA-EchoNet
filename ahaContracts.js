// ahaContracts.js
// Fase 2: felles datakontrakt for AHA-modulobjekter.
// Browser-script uten build step / uten ES modules.

(function (global) {
  "use strict";

  function uid(prefix) {
    return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  }

  function normalizeTags(tags) {
    if (!Array.isArray(tags)) return [];
    const seen = new Set();
    const out = [];

    tags.forEach((tag) => {
      const value = String(tag || "").trim();
      if (!value) return;
      const key = value.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(value);
    });

    return out;
  }

  function createLinkedItem(input) {
    const src = input && typeof input === "object" ? input : {};

    return {
      id: String(src.id || uid("lnk")).trim(),
      type: String(src.type || "reference").trim() || "reference",
      ref_id: String(src.ref_id || src.id || "").trim(),
      title: String(src.title || "").trim(),
      source_type: String(src.source_type || "").trim(),
      source_app: String(src.source_app || "").trim(),
      meta: src.meta && typeof src.meta === "object" && !Array.isArray(src.meta) ? src.meta : {}
    };
  }

  function normalizeLinkedItems(items) {
    if (!Array.isArray(items)) return [];

    return items
      .map((item) => createLinkedItem(item))
      .filter((item) => item.ref_id);
  }

  function createBaseItem(input) {
    const src = input && typeof input === "object" ? input : {};
    const now = new Date().toISOString();

    return {
      id: String(src.id || uid("aha")).trim(),
      module: String(src.module || "unknown").trim() || "unknown",
      type: String(src.type || "item").trim() || "item",
      title: String(src.title || "").trim(),
      text: String(src.text || "").trim(),
      tags: normalizeTags(src.tags),
      linked_items: normalizeLinkedItems(src.linked_items),
      source_type: String(src.source_type || "").trim(),
      source_app: String(src.source_app || "aha").trim() || "aha",
      user_created: src.user_created !== false,
      imported: src.imported === true,
      created_at: src.created_at || now,
      updated_at: src.updated_at || src.created_at || now,
      meta: src.meta && typeof src.meta === "object" && !Array.isArray(src.meta) ? src.meta : {}
    };
  }

  function normalizeBaseItem(input, defaults) {
    const base = createBaseItem(input);
    const defs = defaults && typeof defaults === "object" ? defaults : {};

    if (!base.module && defs.module) base.module = String(defs.module).trim() || "unknown";
    if (!base.type && defs.type) base.type = String(defs.type).trim() || "item";
    if (!base.source_type && defs.source_type) base.source_type = String(defs.source_type).trim();
    if (!base.source_app && defs.source_app) base.source_app = String(defs.source_app).trim() || "aha";

    if (!base.title && defs.title) base.title = String(defs.title).trim();
    if (!base.text && defs.text) base.text = String(defs.text).trim();

    return base;
  }

  function isValidBaseItem(item) {
    if (!item || typeof item !== "object") return false;
    if (!String(item.id || "").trim()) return false;
    if (!String(item.module || "").trim()) return false;
    if (!String(item.type || "").trim()) return false;
    if (!String(item.created_at || "").trim()) return false;
    if (!Array.isArray(item.tags)) return false;
    if (!Array.isArray(item.linked_items)) return false;

    return true;
  }

  global.AHAContracts = {
    createBaseItem,
    normalizeBaseItem,
    createLinkedItem,
    normalizeTags,
    normalizeLinkedItems,
    isValidBaseItem
  };
})(window);
