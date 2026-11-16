// Privat, eksplisitt forbindelse fra History GO Psykologirommet til Mitt AHA.
// Ingen lesing av History GO sine private lagringsnøkler eller automatisk AHAIngest.
(function (global) {
  "use strict";

  const KEY = "aha_psychology_private_reflections_v1";
  const INCOMING_TYPE = "historygo.psychology.selection.v1";
  const READY_TYPE = "aha.psychology.ready.v1";
  const TRUSTED_HISTORY_GO_ORIGINS = Object.freeze(["https://paradispartiet.github.io"]);
  const MAX_TEXT = 1500;
  const MAX_ITEMS = 30;

  function validText(value) {
    if (typeof value !== "string") return null;
    const text = value.trim();
    return text.length > 0 && text.length <= MAX_TEXT ? text : null;
  }

  function readSaved() {
    try {
      const entries = JSON.parse(global.localStorage.getItem(KEY) || "[]");
      if (!Array.isArray(entries)) return [];
      return entries.filter((entry) =>
        entry && typeof entry.id === "string" && validText(entry.text)
        && typeof entry.created_at === "string"
      ).slice(-MAX_ITEMS);
    } catch {
      return [];
    }
  }

  function save(entries) {
    try {
      global.localStorage.setItem(KEY, JSON.stringify(entries.slice(-MAX_ITEMS)));
      return true;
    } catch {
      return false;
    }
  }

  function createId() {
    return global.crypto?.randomUUID?.() ||
      "aha_psych_" + Date.now() + "_" + Math.random().toString(36).slice(2);
  }

  function announceReady() {
    if (!global.opener) return;
    for (const origin of TRUSTED_HISTORY_GO_ORIGINS) {
      try { global.opener.postMessage({ type: READY_TYPE }, origin); } catch {}
    }
  }

  function init() {
    const form = document.getElementById("aha-psych-import-form");
    const textarea = document.getElementById("aha-psych-selected-text");
    const consent = document.getElementById("aha-psych-import-consent");
    const status = document.getElementById("aha-psych-import-status");
    const list = document.getElementById("aha-psych-saved-list");
    const deleteAll = document.getElementById("aha-psych-delete-all");
    if (!form || !textarea || !consent || !list || !deleteAll) return;

    function message(value) { status.textContent = value; }

    function render() {
      const entries = readSaved();
      list.replaceChildren();
      if (!entries.length) {
        const empty = document.createElement("p");
        empty.textContent = "Ingen refleksjoner lagret i dette rommet på denne enheten.";
        list.append(empty);
      }
      for (const entry of entries.slice().reverse()) {
        const article = document.createElement("article");
        article.className = "aha-psych-entry";
        const date = document.createElement("small");
        date.textContent = entry.created_at.slice(0, 10);
        const text = document.createElement("p");
        text.textContent = entry.text;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "aha-tile-btn aha-tile-btn-secondary";
        button.textContent = "Slett";
        button.addEventListener("click", () => {
          if (!global.confirm("Slette denne refleksjonen fra Mitt AHA?")) return;
          if (!save(readSaved().filter((item) => item.id !== entry.id))) {
            message("Kunne ikke lagre slettingen i denne nettleseren.");
            return;
          }
          render();
          message("Refleksjonen er slettet fra Mitt AHA.");
        });
        article.append(date, text, button);
        list.append(article);
      }
      deleteAll.disabled = entries.length === 0;
    }

    global.addEventListener("message", (event) => {
      // Mottak krever både riktig vindu og eksakt opphav. Ingenting lagres her.
      if (!global.opener || event.source !== global.opener ||
          !TRUSTED_HISTORY_GO_ORIGINS.includes(event.origin)) return;
      const data = event.data;
      if (!data || data.type !== INCOMING_TYPE ||
          data.schema_version !== "aha_psychology_selection_v1" ||
          data.source_app !== "historygo") return;
      const text = validText(data.text);
      if (!text) {
        message("Overføringen ble avvist: ugyldig eller for lang tekst.");
        return;
      }
      textarea.value = text;
      consent.checked = false;
      message("Valgt tekst er mottatt fra Psykologirommet. Les og bekreft før du lagrer.");
      textarea.focus();
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = validText(textarea.value);
      if (!text) {
        message("Velg en tekst på mellom 1 og 1500 tegn.");
        return;
      }
      if (!consent.checked) {
        message("Bekreft først at du vil lagre denne teksten.");
        return;
      }
      const entries = readSaved();
      if (entries.some((entry) => entry.text === text)) {
        message("Den samme teksten finnes allerede i AHA.");
        consent.checked = false;
        return;
      }
      entries.push({ id: createId(), text, created_at: new Date().toISOString(),
        source_app: "historygo", source_type: "psychology_user_selected_text",
        visibility: "local_private" });
      if (!save(entries)) {
        message("Kunne ikke lagre lokalt. Ingen tekst ble sendt til en server.");
        return;
      }
      textarea.value = "";
      consent.checked = false;
      message("Valgt tekst er lagret privat i AHA på denne enheten.");
      render();
    });

    document.getElementById("aha-psych-clear-preview")?.addEventListener("click", () => {
      textarea.value = "";
      consent.checked = false;
      message("Tekstfeltet er tømt.");
    });

    deleteAll.addEventListener("click", () => {
      if (!global.confirm("Slette alle refleksjonene i dette AHA-rommet?")) return;
      if (!save([])) {
        message("Kunne ikke slette lokale refleksjoner.");
        return;
      }
      render();
      message("Alle refleksjoner i dette AHA-rommet er slettet.");
    });

    render();
    announceReady();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})(window);
