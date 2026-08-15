// ahaCanonicalSyncApiClient.js
// Explicit authenticated HTTP client for canonical sync. Loading this file performs no I/O.
(function (global) {
  "use strict";

  const VERSION = "aha_canonical_sync_api_client_v1";

  function text(value) { return String(value ?? "").trim(); }
  function obj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function requiredText(value, field) {
    const result = text(value);
    if (!result) throw new Error(`${field} is required`);
    return result;
  }
  function nonNegativeInteger(value, field) {
    const number = Number(value ?? 0);
    if (!Number.isInteger(number) || number < 0) throw new Error(`${field} must be a non-negative integer`);
    return number;
  }
  function positiveInteger(value, field) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1) throw new Error(`${field} must be a positive integer`);
    return number;
  }
  function baseUrl(options = {}) {
    const raw = text(options.apiBaseUrl || global.AHA_CANONICAL_SYNC_API_BASE_URL);
    if (!raw) throw new Error("canonical sync apiBaseUrl is not configured");
    return raw.replace(/\/+$/, "");
  }
  async function accessToken(options = {}) {
    const explicit = text(options.accessToken);
    if (explicit) return explicit;
    const auth = options.auth || global.AHAAuth;
    if (!auth || typeof auth.getSession !== "function") throw new Error("AHAAuth.getSession unavailable");
    const session = await auth.getSession();
    const token = text(session?.access_token);
    if (!token) throw new Error("canonical sync requires an authenticated session");
    return token;
  }
  function fetchClient(options = {}) {
    const client = options.fetch || global.fetch;
    if (typeof client !== "function") throw new Error("fetch unavailable");
    return client;
  }
  function queryString(parameters = {}) {
    const pairs = [];
    for (const [key, value] of Object.entries(parameters)) {
      if (value === undefined || value === null || value === "") continue;
      pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    }
    return pairs.length ? `?${pairs.join("&")}` : "";
  }
  function apiError(status, body) {
    const source = obj(body);
    const remote = obj(source.error);
    const error = new Error(text(remote.message) || `Canonical sync API request failed with HTTP ${status}`);
    error.name = "AHACanonicalSyncApiError";
    error.status = Number(status || 0);
    error.code = text(remote.code) || "CANONICAL_SYNC_HTTP_ERROR";
    error.requestId = text(remote.requestId) || null;
    error.retryable = error.status === 0 || error.status === 408 || error.status === 425 || error.status === 429 || error.status >= 500;
    return error;
  }
  async function request(path, init = {}, options = {}) {
    const token = await accessToken(options);
    const fetchImpl = fetchClient(options);
    let response;
    try {
      response = await fetchImpl(`${baseUrl(options)}${path}`, {
        method: init.method || "GET",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${token}`,
          ...(init.body === undefined ? {} : { "content-type": "application/json" }),
          ...obj(init.headers)
        },
        cache: "no-store",
        body: init.body === undefined ? undefined : JSON.stringify(init.body)
      });
    } catch (cause) {
      const error = apiError(0, { error: { code: "CANONICAL_SYNC_NETWORK_ERROR", message: cause?.message || "Network request failed" } });
      error.cause = cause;
      throw error;
    }

    let body = null;
    try { body = await response.json(); }
    catch {
      if (!response.ok) throw apiError(response.status, null);
      throw apiError(response.status, { error: { code: "CANONICAL_SYNC_INVALID_RESPONSE", message: "Canonical sync API returned invalid JSON" } });
    }
    if (!response.ok) throw apiError(response.status, body);
    if (!body || typeof body !== "object" || Array.isArray(body) || !body.data || typeof body.data !== "object" || Array.isArray(body.data)) {
      throw apiError(response.status, { error: { code: "CANONICAL_SYNC_INVALID_RESPONSE", message: "Canonical sync API response envelope is invalid" } });
    }
    return body.data;
  }

  async function profile(options = {}) {
    return request("/v1/profile", {}, options);
  }

  async function push(event, options = {}) {
    const row = obj(event);
    return request("/v1/sync/push", {
      method: "POST",
      body: {
        workspaceId: requiredText(row.workspaceId, "workspaceId"),
        deviceId: requiredText(row.deviceId, "deviceId"),
        idempotencyKey: requiredText(row.idempotencyKey || row.id, "idempotencyKey"),
        objectType: requiredText(row.objectType, "objectType"),
        objectId: requiredText(row.objectId, "objectId"),
        operation: requiredText(row.operation, "operation"),
        baseRevision: nonNegativeInteger(row.baseRevision, "baseRevision"),
        payloadHash: requiredText(row.payloadHash, "payloadHash"),
        payload: row.operation === "delete" ? null : row.payload
      }
    }, options);
  }

  async function bootstrap(input, options = {}) {
    const row = obj(input);
    const limit = row.limit === undefined ? undefined : positiveInteger(row.limit, "limit");
    return request(`/v1/sync/bootstrap${queryString({
      workspaceId: requiredText(row.workspaceId, "workspaceId"),
      afterKey: text(row.afterKey),
      highWatermark: row.highWatermark === undefined || row.highWatermark === null ? undefined : nonNegativeInteger(row.highWatermark, "highWatermark"),
      limit
    })}`, {}, options);
  }

  async function pull(input, options = {}) {
    const row = obj(input);
    const limit = row.limit === undefined ? undefined : positiveInteger(row.limit, "limit");
    return request(`/v1/sync/pull${queryString({
      workspaceId: requiredText(row.workspaceId, "workspaceId"),
      afterCursor: nonNegativeInteger(row.afterCursor, "afterCursor"),
      limit
    })}`, {}, options);
  }

  function getStatus() {
    return {
      version: VERSION,
      autoSync: false,
      loginTriggersSync: false,
      executesOnLoad: false,
      requiresExplicitCall: true,
      apiBaseUrlConfigured: Boolean(text(global.AHA_CANONICAL_SYNC_API_BASE_URL))
    };
  }

  const api = Object.freeze({ VERSION, request, profile, push, bootstrap, pull, getStatus });
  global.AHACanonicalSyncApiClient = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
