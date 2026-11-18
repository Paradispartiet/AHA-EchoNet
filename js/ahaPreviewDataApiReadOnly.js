// Cloudflare static PREVIEW-ONLY Supabase Data API write lockdown.
// This module is appended to a COPIED ahaDb.js by build-cloudflare-preview.mjs.
// Original GitHub Pages ahaDb.js is intentionally unchanged.
// AHA_CLOUDFLARE_PREVIEW_DATA_API_READ_ONLY
(function (global) {
  "use strict";

  const bridge = global.AHADb;
  if (!bridge || typeof bridge.getClient !== "function") {
    throw new Error("AHA preview Data API protection could not attach.");
  }

  const originalGetClient = bridge.getClient.bind(bridge);
  const writeVerbs = new Set(["insert", "upsert", "update", "delete"]);
  const refused = Object.freeze({
    code: "AHA_PREVIEW_READ_ONLY",
    message: "Cloudflare-preview: lagring til Supabase er sperret inntil sikkerhetskontrollen er godkjent."
  });
  let previousOriginal = null;
  let previousSafe = null;

  // Postgrest write builders can be chained (.select().single()) or awaited.
  // Return a nonthrowing Postgrest-shaped result with no network request.
  function denyQuery() {
    const response = { data: null, error: refused, count: null, status: 403, statusText: "Preview read-only" };
    const query = {};
    for (const name of [
      "select", "single", "maybeSingle", "eq", "neq", "in", "order",
      "limit", "range", "match", "filter", "throwOnError", "abortSignal"
    ]) query[name] = () => query;
    query.then = (success, failure) => Promise.resolve(response).then(success, failure);
    query.catch = (handler) => Promise.resolve(response).catch(handler);
    query.finally = (handler) => Promise.resolve(response).finally(handler);
    return query;
  }

  function safeQuery(query) {
    if (!query || (typeof query !== "object" && typeof query !== "function")) return query;
    return new Proxy(query, {
      get(target, name) {
        if (writeVerbs.has(name)) return () => denyQuery();
        const value = Reflect.get(target, name, target);
        if (typeof value !== "function") return value;
        return (...args) => {
          const next = value.apply(target, args);
          // Postgrest query builders are chainable. Continue protecting
          // mutation methods even after .select(), .eq(), or .order().
          return next && typeof next === "object" && (
            typeof next.then === "function" ||
            typeof next.eq === "function" ||
            typeof next.select === "function"
          ) ? safeQuery(next) : next;
        };
      },
      set() {
        // Exposed PostgREST builder fields such as .method/.body must not be
        // overwritten to turn an approved GET into a write.
        return false;
      }
    });
  }

  // A PostgREST client can also be reached by supabase.schema(...) or the
  // public supabase.rest property. Protect those routes just like .from().
  function safeRest(rest) {
    if (!rest || (typeof rest !== "object" && typeof rest !== "function")) return null;
    return new Proxy(rest, {
      get(target, name) {
        if (name === "from") return (table) => safeQuery(target.from(table));
        if (name === "rpc") return () => denyQuery();
        if (name === "schema") return (schemaName) => safeRest(target.schema(schemaName));
        const value = Reflect.get(target, name, target);
        if (typeof value === "function") return value.bind(target);
        return value;
      },
      set() {
        // Never allow preview code to replace the guarded methods/properties.
        return false;
      }
    });
  }

  function safeClient(client) {
    return new Proxy(client, {
      get(target, name) {
        if (name === "from") return (table) => safeQuery(target.from(table));
        // RPC functions may mutate database state: deny all until reviewed.
        if (name === "rpc") return () => denyQuery();
        if (name === "schema") return (schemaName) => safeRest(target.schema(schemaName));
        if (name === "rest") return safeRest(target.rest);
        const value = Reflect.get(target, name, target);
        if (typeof value === "function") return value.bind(target);
        return value;
      },
      set() {
        return false;
      }
    });
  }

  bridge.getClient = function () {
    const client = originalGetClient();
    if (!client) return null;
    if (client !== previousOriginal) {
      previousOriginal = client;
      previousSafe = safeClient(client);
    }
    return previousSafe;
  };

  global.AHAPreviewDataApiReadOnly = Object.freeze({ enabled: true });
})(window);
