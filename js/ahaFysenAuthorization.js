// ahaFysenAuthorization.js
// Explicit AHA -> Fysen delegated login surface. Loading this file never issues an authorization.
(function (global) {
  "use strict";

  const VERSION = "aha_fysen_authorization_v1";
  const AHA_API_ORIGIN = "https://aha-canonical-api-production.redground-9c6e20c2.northeurope.azurecontainerapps.io";
  const CLIENT_ID = "fysen";

  function text(value) { return String(value ?? "").trim(); }
  function params(location = global.location) { return new URLSearchParams(String(location?.search || "")); }
  function requestFromLocation(location = global.location) {
    const query = params(location);
    const request = {
      clientId: text(query.get("client_id")),
      redirectUri: text(query.get("redirect_uri")),
      codeChallenge: text(query.get("code_challenge")),
      state: text(query.get("state"))
    };
    if (request.clientId !== CLIENT_ID) throw new Error("Ugyldig Fysen-klient.");
    if (!request.redirectUri || request.redirectUri.length > 500) throw new Error("Mangler gyldig Fysen-returadresse.");
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(request.codeChallenge)) throw new Error("Mangler gyldig PKCE-kode.");
    if (!request.state || request.state.length > 512) throw new Error("Mangler gyldig state.");
    return Object.freeze(request);
  }

  async function session(options = {}) {
    const auth = options.auth || global.AHAAuth;
    if (!auth?.getSession) throw new Error("AHA-innlogging er ikke tilgjengelig.");
    return auth.getSession();
  }

  async function issue(request, options = {}) {
    const current = await session(options);
    const token = text(current?.access_token);
    if (!token) throw new Error("Logg inn i AHA før du kobler til Fysen.");
    const fetchImpl = options.fetch || global.fetch;
    if (typeof fetchImpl !== "function") throw new Error("Nettverk er ikke tilgjengelig.");
    const response = await fetchImpl(`${AHA_API_ORIGIN}/v1/integrations/fysen/authorization`, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        clientId: CLIENT_ID,
        redirectUri: request.redirectUri,
        codeChallenge: request.codeChallenge
      }),
      cache: "no-store"
    });
    let body = null;
    try { body = await response.json(); } catch {}
    const code = text(body?.data?.authorizationCode);
    if (!response.ok || !code) {
      throw new Error(text(body?.error?.message) || "AHA kunne ikke opprette Fysen-autorisasjonen.");
    }
    return body.data;
  }

  function returnToFysen(request, authorization, location = global.location) {
    const target = new URL(request.redirectUri);
    target.searchParams.set("code", authorization.authorizationCode);
    target.searchParams.set("state", request.state);
    location.assign(target.toString());
  }

  async function initialize(options = {}) {
    const document = options.document || global.document;
    if (!document?.getElementById) return;
    const status = document.getElementById("aha-fysen-status");
    const authorizeButton = document.getElementById("aha-fysen-authorize");
    const loginForm = document.getElementById("aha-fysen-login-form");
    const email = document.getElementById("aha-fysen-email");
    let request;
    try {
      request = requestFromLocation(options.location || global.location);
    } catch (error) {
      if (status) status.textContent = error.message || "Ugyldig Fysen-forespørsel.";
      if (authorizeButton) authorizeButton.disabled = true;
      return;
    }

    const current = await session(options).catch(() => null);
    const signedIn = Boolean(text(current?.access_token));
    if (status) status.textContent = signedIn
      ? "Du er logget inn i AHA. Fysen får bare en pseudonym AHA-identitet og de to avgrensede scopene under."
      : "Logg inn i AHA for å fortsette. Ingen Fysen-autorisasjon opprettes ved sidelasting.";
    if (authorizeButton) authorizeButton.hidden = !signedIn;
    if (loginForm) loginForm.hidden = signedIn;

    loginForm?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const value = text(email?.value);
      if (!value) return;
      const auth = options.auth || global.AHAAuth;
      try {
        await auth.signInWithEmail(value);
        if (status) status.textContent = "Sjekk e-posten din og åpne AHA-lenken. Du returneres hit etter innlogging.";
      } catch (error) {
        if (status) status.textContent = error.message || "Kunne ikke starte AHA-innlogging.";
      }
    });

    authorizeButton?.addEventListener("click", async () => {
      authorizeButton.disabled = true;
      if (status) status.textContent = "Oppretter en kortlivet Fysen-autorisasjon …";
      try {
        const authorization = await issue(request, options);
        returnToFysen(request, authorization, options.location || global.location);
      } catch (error) {
        authorizeButton.disabled = false;
        if (status) status.textContent = error.message || "Kunne ikke koble AHA til Fysen.";
      }
    });
  }

  const api = Object.freeze({ VERSION, AHA_API_ORIGIN, CLIENT_ID, requestFromLocation, issue, returnToFysen, initialize });
  global.AHAFysenAuthorization = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (global.document?.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", () => initialize(), { once: true });
  } else {
    initialize();
  }
})(typeof window !== "undefined" ? window : globalThis);
