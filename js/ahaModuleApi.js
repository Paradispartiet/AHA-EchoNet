// ahaModuleApi.js
// Versioned public API registry for browser-loaded AHA modules.

(function (global) {
  "use strict";

  const BOUNDARY_VERSION = "aha_module_api_boundary_v1";
  if (global.AHAModuleApi?.BOUNDARY_VERSION === BOUNDARY_VERSION) {
    if (typeof module !== "undefined" && module.exports) module.exports = global.AHAModuleApi;
    return;
  }
  const records = new Map();
  const root = global.AHA && typeof global.AHA === "object" ? global.AHA : {};

  function normalizeName(value) {
    const name = String(value || "").trim();
    if (!/^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)*$/.test(name)) {
      throw new TypeError(`Ugyldig AHA-modulnavn: ${name || "(tomt)"}.`);
    }
    return name;
  }

  function normalizeVersion(value) {
    const version = Number(value);
    if (!Number.isInteger(version) || version < 1) {
      throw new TypeError("AHA-modulversjon må være et positivt heltall.");
    }
    return version;
  }

  function normalizeExports(source, exportsList) {
    if (!source || (typeof source !== "object" && typeof source !== "function")) {
      throw new TypeError("AHA-modulens API-kilde må være et objekt.");
    }
    const names = Array.isArray(exportsList) && exportsList.length
      ? exportsList
      : Object.keys(source).filter((key) => key && !key.startsWith("__"));
    const unique = Array.from(new Set(names.map((key) => String(key || "").trim()).filter(Boolean)));
    if (!unique.length) throw new TypeError("AHA-modulen må eksponere minst ett navngitt API-felt.");
    unique.forEach((key) => {
      if (!(key in source)) throw new TypeError(`AHA-modulen mangler deklarert eksport: ${key}.`);
    });
    return unique.sort();
  }

  function buildFacade(record) {
    const facade = {};
    record.exports.forEach((key) => {
      const value = record.source[key];
      if (typeof value === "function") {
        Object.defineProperty(facade, key, {
          enumerable: true,
          configurable: false,
          value: function publicAhaModuleMethod(...args) {
            return record.source[key](...args);
          }
        });
        return;
      }
      Object.defineProperty(facade, key, {
        enumerable: true,
        configurable: false,
        get() { return record.source[key]; }
      });
    });
    return Object.freeze(facade);
  }

  function register(nameInput, source, options = {}) {
    const name = normalizeName(nameInput);
    const version = normalizeVersion(options.version || 1);
    const exportsList = normalizeExports(source, options.exports);
    const existing = records.get(name);
    if (existing) {
      if (existing.source === source && existing.version === version) return existing.facade;
      throw new Error(`AHA-modulen ${name} er allerede registrert.`);
    }
    const record = {
      name,
      version,
      legacyGlobal: String(options.legacyGlobal || "").trim() || null,
      description: String(options.description || "").trim(),
      exports: Object.freeze(exportsList),
      source,
      facade: null
    };
    record.facade = buildFacade(record);
    records.set(name, record);
    try {
      global.dispatchEvent?.(new CustomEvent("aha:module-api-registered", {
        detail: { name, version, exports: exportsList.slice() }
      }));
    } catch {}
    return record.facade;
  }

  function get(nameInput, options = {}) {
    const name = normalizeName(nameInput);
    const record = records.get(name);
    if (!record) {
      if (options.required === true) throw new Error(`AHA-modulen ${name} er ikke registrert.`);
      return null;
    }
    if (options.version !== undefined && record.version !== normalizeVersion(options.version)) {
      throw new Error(`AHA-modulen ${name} har versjon ${record.version}, ikke ${options.version}.`);
    }
    return record.facade;
  }

  function resolve(name, legacyGlobal, options = {}) {
    const registered = get(name, { version: options.version });
    if (registered) return registered;
    const legacy = String(legacyGlobal || "").trim();
    return legacy && global[legacy] ? global[legacy] : null;
  }

  function has(name, options = {}) {
    try { return Boolean(get(name, options)); }
    catch { return false; }
  }

  function describe(nameInput) {
    const name = normalizeName(nameInput);
    const record = records.get(name);
    if (!record) return null;
    return Object.freeze({
      name: record.name,
      version: record.version,
      legacyGlobal: record.legacyGlobal,
      description: record.description,
      exports: record.exports.slice()
    });
  }

  function list() {
    return Array.from(records.keys()).sort().map((name) => describe(name));
  }

  const registry = Object.freeze({
    BOUNDARY_VERSION,
    register,
    get,
    resolve,
    has,
    describe,
    list
  });

  Object.defineProperties(root, {
    moduleApiVersion: { enumerable: true, configurable: false, value: BOUNDARY_VERSION },
    registerModule: { enumerable: true, configurable: false, value: register },
    getModule: { enumerable: true, configurable: false, value: get },
    resolveModule: { enumerable: true, configurable: false, value: resolve },
    hasModule: { enumerable: true, configurable: false, value: has },
    describeModule: { enumerable: true, configurable: false, value: describe },
    listModules: { enumerable: true, configurable: false, value: list }
  });

  global.AHA = root;
  global.AHAModuleApi = registry;
  if (typeof module !== "undefined" && module.exports) module.exports = registry;
})(typeof window !== "undefined" ? window : globalThis);
