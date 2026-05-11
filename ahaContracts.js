// ahaContracts.js
// Fase 2: felles datakontrakt for AHA-modulobjekter.
// Browser-script uten build step / uten ES modules.

(function (global) {
  "use strict";

  function uid(prefix) {
    return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
  }

  function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function normalizeTags(tags) {
    const raw = Array.isArray(tags)
      ? tags
      : (typeof tags === "string" ? tags.split(",") : []);

    const seen = new Set();
    const out = [];

    raw.forEach((tag) => {
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
    const src = safeObject(input);
    const id = String(src.id || src.ref_id || "").trim();

    return {
      id,
      type: String(src.type || "reference").trim() || "reference",
      source: String(src.source || src.source_app || src.source_type || "aha").trim() || "aha",
      title: String(src.title || "").trim()
    };
  }

  function normalizeLinkedItems(items) {
    if (!Array.isArray(items)) return [];

    return items
      .map((item) => createLinkedItem(item))
      .filter((item) => item.id || item.title);
  }

  function createBaseItem(input) {
    const src = safeObject(input);
    const now = new Date().toISOString();

    return {
      id: String(src.id || uid("aha")).trim(),
      title: String(src.title || "").trim(),
      type: String(src.type || "item").trim() || "item",
      source: String(src.source || src.source_app || src.source_type || "aha").trim() || "aha",
      createdAt: src.createdAt || src.created_at || now,
      updatedAt: src.updatedAt || src.updated_at || src.createdAt || src.created_at || now,
      tags: normalizeTags(src.tags),
      linkedItems: normalizeLinkedItems(src.linkedItems || src.linked_items),
      meta: safeObject(src.meta)
    };
  }

  function normalizeBaseItem(input, defaults) {
    const src = safeObject(input);
    const defs = safeObject(defaults);
    const now = new Date().toISOString();

    const merged = {
      id: src.id || defs.id || uid("aha"),
      title: src.title || defs.title || "",
      type: src.type || defs.type || "item",
      source: src.source || defs.source || src.source_app || src.source_type || defs.source_app || defs.source_type || "aha",
      createdAt: src.createdAt || src.created_at || defs.createdAt || defs.created_at || now,
      updatedAt: src.updatedAt || src.updated_at || defs.updatedAt || defs.updated_at || src.createdAt || src.created_at || defs.createdAt || defs.created_at || now,
      tags: src.tags !== undefined ? src.tags : defs.tags,
      linkedItems: src.linkedItems !== undefined ? src.linkedItems : (src.linked_items !== undefined ? src.linked_items : (defs.linkedItems !== undefined ? defs.linkedItems : defs.linked_items)),
      meta: src.meta !== undefined ? src.meta : defs.meta
    };

    return createBaseItem(merged);
  }

  function isValidBaseItem(item) {
    if (!item || typeof item !== "object") return false;
    if (!String(item.id || "").trim()) return false;
    if (!String(item.type || "").trim()) return false;
    if (!String(item.source || "").trim()) return false;
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
