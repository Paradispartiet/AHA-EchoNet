// ahaFysenHandoff.js
// One-time Fysen capability receiver. It never sends anything to the AHA agent automatically.
(function (global) {
  "use strict";

  const VERSION = "aha_fysen_handoff_v1";
  const HANDOFF_ENDPOINT = "https://fysen.vercel.app/api/aha/handoff";
  const PENDING_PROMPT_KEY = "aha_pending_chat_prompt_v1";

  function text(value) { return String(value ?? "").trim(); }
  function handoffToken(location = global.location) {
    const hash = text(location?.hash).replace(/^#/, "");
    const token = text(new URLSearchParams(hash).get("handoff"));
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(token)) throw new Error("Mangler gyldig Fysen-handoff.");
    return token;
  }
  function scrubFragment(history = global.history, location = global.location) {
    if (!history?.replaceState || !location) return;
    history.replaceState(null, "", `${location.pathname || "fysen.html"}${location.search || ""}`);
  }
  async function redeem(token, options = {}) {
    const fetchImpl = options.fetch || global.fetch;
    if (typeof fetchImpl !== "function") throw new Error("Nettverk er ikke tilgjengelig.");
    const response = await fetchImpl(HANDOFF_ENDPOINT, {
      method: "POST",
      headers: { accept: "application/json", authorization: `Handoff ${token}` },
      cache: "no-store"
    });
    let body = null;
    try { body = await response.json(); } catch {}
    if (!response.ok || !body?.data) throw new Error(text(body?.error?.message) || "Fysen-handoff kunne ikke åpnes eller er allerede brukt.");
    const contract = options.contract || global.AHAFysenFoodCollection;
    if (!contract?.normalize) throw new Error("Fysen-samlingskontrakten er ikke tilgjengelig.");
    return contract.normalize(body.data);
  }
  function renderPreview(collection, document = global.document) {
    const list = document?.getElementById?.("aha-fysen-handoff-items");
    const count = document?.getElementById?.("aha-fysen-handoff-count");
    if (count) count.textContent = `${collection.items.length} lagrede ${collection.items.length === 1 ? "rett" : "retter"}`;
    if (!list) return;
    list.innerHTML = "";
    for (const item of collection.items) {
      const li = document.createElement("li");
      li.textContent = `${item.dishName} — ${item.restaurantName}, ${item.city}`;
      list.appendChild(li);
    }
  }
  function continueToChat(collection, options = {}) {
    const contract = options.contract || global.AHAFysenFoodCollection;
    const storage = options.storage || global.localStorage;
    if (!contract?.buildPrompt || !storage?.setItem) throw new Error("AHA-chatten kan ikke klargjøres.");
    storage.setItem(PENDING_PROMPT_KEY, JSON.stringify({
      type: "fysen_food_collection_prompt",
      source: "fysen",
      createdAt: new Date().toISOString(),
      prompt: contract.buildPrompt(collection)
    }));
    (options.location || global.location).assign("chat.html");
  }
  async function initialize(options = {}) {
    const document = options.document || global.document;
    if (!document?.getElementById) return;
    const status = document.getElementById("aha-fysen-handoff-status");
    const button = document.getElementById("aha-fysen-handoff-continue");
    let collection = null;
    try {
      const token = handoffToken(options.location || global.location);
      scrubFragment(options.history || global.history, options.location || global.location);
      collection = await redeem(token, options);
      renderPreview(collection, document);
      if (status) status.textContent = "Handoff åpnet. Kontroller listen før du velger å fortsette til AHA-chatten.";
      if (button) button.disabled = false;
    } catch (error) {
      if (status) status.textContent = error.message || "Kunne ikke åpne Fysen-samlingen.";
      if (button) button.disabled = true;
    }
    button?.addEventListener("click", () => {
      if (!collection) return;
      continueToChat(collection, options);
    });
  }

  const api = Object.freeze({ VERSION, HANDOFF_ENDPOINT, PENDING_PROMPT_KEY, handoffToken, scrubFragment, redeem, renderPreview, continueToChat, initialize });
  global.AHAFysenHandoff = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (global.document?.readyState === "loading") global.document.addEventListener("DOMContentLoaded", () => initialize(), { once: true });
  else initialize();
})(typeof window !== "undefined" ? window : globalThis);
