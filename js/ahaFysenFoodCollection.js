// ahaFysenFoodCollection.js
// Pure validator/prompt builder for the explicit Fysen "Min mat" handoff.
(function (global) {
  "use strict";

  const VERSION = "fysen_food_collection_v1";
  const MAX_ITEMS = 50;

  function text(value, max) {
    const result = String(value ?? "").trim();
    return max ? result.slice(0, max) : result;
  }
  function iso(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error("Ugyldig tidspunkt i Fysen-samlingen.");
    return date.toISOString();
  }
  function uuid(value) {
    const result = text(value, 80);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) {
      throw new Error("Ugyldig objekt-ID i Fysen-samlingen.");
    }
    return result;
  }
  function normalizeItem(value) {
    const item = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const dishName = text(item.dishName, 300);
    const restaurantName = text(item.restaurantName, 200);
    const restaurantSlug = text(item.restaurantSlug, 160);
    const city = text(item.city, 120);
    const currency = text(item.currency || "NOK", 3).toUpperCase();
    const priceMinor = item.priceMinor === null || item.priceMinor === undefined ? null : Number(item.priceMinor);
    if (!dishName || !restaurantName || !restaurantSlug || !city) throw new Error("Fysen-samlingen mangler påkrevde matfelt.");
    if (currency.length !== 3) throw new Error("Ugyldig valuta i Fysen-samlingen.");
    if (priceMinor !== null && (!Number.isSafeInteger(priceMinor) || priceMinor < 0)) throw new Error("Ugyldig pris i Fysen-samlingen.");
    return Object.freeze({
      savedItemId: uuid(item.savedItemId),
      menuItemId: uuid(item.menuItemId),
      dishName,
      restaurantName,
      restaurantSlug,
      city,
      priceMinor,
      currency,
      savedAt: iso(item.savedAt)
    });
  }
  function normalize(payload) {
    const source = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
    if (source.version !== VERSION || source.source !== "fysen" || source.purpose !== "user_requested_analysis") {
      throw new Error("Ugyldig Fysen-samlingskontrakt.");
    }
    const privacy = source.privacy && typeof source.privacy === "object" && !Array.isArray(source.privacy) ? source.privacy : {};
    if (privacy.scope !== "private_user" || privacy.includesSearchHistory !== false || privacy.publicSharing !== false || privacy.modelTrainingAllowed !== false) {
      throw new Error("Fysen-samlingen bryter AHA-personverngrensen.");
    }
    if (!Array.isArray(source.items) || source.items.length > MAX_ITEMS) throw new Error("Fysen-samlingen er for stor eller ugyldig.");
    return Object.freeze({
      version: VERSION,
      source: "fysen",
      purpose: "user_requested_analysis",
      generatedAt: iso(source.generatedAt),
      privacy: Object.freeze({
        scope: "private_user",
        includesSearchHistory: false,
        publicSharing: false,
        modelTrainingAllowed: false
      }),
      items: Object.freeze(source.items.map(normalizeItem))
    });
  }
  function price(item) {
    if (item.priceMinor === null) return "pris ikke registrert";
    return `${new Intl.NumberFormat("nb-NO", { style: "currency", currency: item.currency, maximumFractionDigits: 2 }).format(item.priceMinor / 100)}`;
  }
  function buildPrompt(payload) {
    const collection = normalize(payload);
    const lines = collection.items.map((item, index) => `${index + 1}. ${item.dishName} — ${item.restaurantName}, ${item.city} (${price(item)})`);
    return [
      "Jeg vil utforske min eksplisitt lagrede «Min mat»-samling fra Fysen.",
      "",
      "Samlingen inneholder bare retter jeg selv har valgt å lagre. Den inneholder ikke Fysen-søkehistorikk. Ikke anta preferanser eller vaner som ikke støttes av listen.",
      "",
      ...(lines.length ? lines : ["Samlingen er foreløpig tom."]),
      "",
      "Hjelp meg å se nyttige mønstre og mulige matspor å utforske videre. Skill tydelig mellom det listen faktisk viser og forsiktige hypoteser."
    ].join("\n");
  }

  const api = Object.freeze({ VERSION, MAX_ITEMS, normalize, buildPrompt });
  global.AHAFysenFoodCollection = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
