// Privat, eksplisitt forbindelse fra History GO Psykologirommet til Mitt AHA.
// Ingen lesing av History GO sine private lagringsnøkler eller automatisk AHAIngest.
(function (global) {
  "use strict";

  const KEY = "aha_psychology_private_reflections_v1";
  const CHAMBER_KEY = "aha_insight_chamber_v1";
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
      );
    } catch {
      return [];
    }
  }

  function save(entries) {
    try {
      if (entries.length > MAX_ITEMS) return false;
      global.localStorage.setItem(KEY, JSON.stringify(entries));
      return true;
    } catch {
      return false;
    }
  }

  function createId() {
    return global.crypto?.randomUUID?.() ||
      "aha_psych_" + Date.now() + "_" + Math.random().toString(36).slice(2);
  }

  // Manuell opt-in. Den vanlige innsiktsstrømmen er IKKE samme private arkiv.
  function readChamber() {
    const raw = global.localStorage.getItem(CHAMBER_KEY);
    if (!raw) return { insights: [] };
    const chamber = JSON.parse(raw);
    if (!chamber || typeof chamber !== "object" || Array.isArray(chamber) ||
        !Array.isArray(chamber.insights)) {
      throw new Error("invalid_insight_chamber");
    }
    return chamber;
  }

  function promotedFromEntry(insights, entry) {
    return insights.find((item) =>
      item?.source_app === "aha_psychology_room" &&
      item?.meta?.manual_promotion === true &&
      item?.meta?.psychology_reflection_id === entry.id) || null;
  }

  function readPromoted(entry) {
    try { return promotedFromEntry(readChamber().insights, entry); }
    catch { return null; }
  }

  function promoteToInsights(entry) {
    const current = readSaved().find((item) => item.id === entry.id && item.text === entry.text);
    if (!current) return { ok: false, message: "Refleksjonen finnes ikke lenger i det private arkivet." };
    if (!global.confirm(
      "Kopiere akkurat denne teksten til AHAs ordinære Innsikter? " +
      "Da kan andre AHA-funksjoner, inkludert analyser, lese den. " +
      "Det private originalnotatet forblir separat. Ikke fortsett med sensitiv tekst du vil holde bare i Psykologirommet."
    )) return { ok: false, cancelled: true };
    try {
      const chamber = readChamber();
      const existing = promotedFromEntry(chamber.insights, current);
      if (existing) return { ok: true, id: existing.id, reused: true };
      const now = new Date().toISOString();
      const insight = {
        id: "aha_psych_insight_" + createId(),
        title: current.text.replace(/\s+/g, " ").slice(0, 100),
        summary: current.text,
        created_at: now,
        updated_at: now,
        source_app: "aha_psychology_room",
        source_type: "user_selected_reflection",
        claim_kind: "personal_reflection",
        status: "draft",
        uncertainty: "Brukerens egen refleksjon; ikke verifisert, analysert eller en faglig vurdering.",
        local_only: true,
        published_external: false,
        echonet_shared: false,
        sync_enabled: false,
        meta: {
          manual_promotion: true,
          psychology_reflection_id: current.id,
          local_only: true,
          published_external: false,
          echonet_shared: false,
          sync_enabled: false
        }
      };
      global.localStorage.setItem(CHAMBER_KEY, JSON.stringify({
        ...chamber,
        insights: [...chamber.insights, insight]
      }));
      return { ok: true, id: insight.id };
    } catch {
      return { ok: false, message: "Kunne ikke lagre i AHAs innsiktsarkiv. Det private notatet er uendret." };
    }
  }

  function removePromoted(entry) {
    if (!global.confirm(
      "Fjerne den kopierte teksten fra AHAs ordinære innsiktsarkiv? " +
      "Det private notatet beholdes, men lenker fra lister og stier kan bli brutt. " +
      "Tidligere analyser eller eventuelle synkroniserte kopier kan ikke trekkes tilbake her."
    )) return { ok: false, cancelled: true };
    try {
      const chamber = readChamber();
      const existing = promotedFromEntry(chamber.insights, entry);
      if (!existing) return { ok: false, message: "Fant ingen tilhørende AHA-innsikt." };
      global.localStorage.setItem(CHAMBER_KEY, JSON.stringify({
        ...chamber,
        insights: chamber.insights.filter((item) => item !== existing)
      }));
      return { ok: true };
    } catch {
      return { ok: false, message: "Kunne ikke fjerne kopien. Det private notatet er uendret." };
    }
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
    // github.io shares browser storage between History GO and other Pages apps.
    // Refuse sensitive private storage on that shared origin.
    if (global.location?.hostname === "paradispartiet.github.io") {
      textarea.disabled = true;
      consent.disabled = true;
      deleteAll.disabled = true;
      const submit = form.querySelector?.('button[type="submit"]');
      if (submit) submit.disabled = true;
      list.textContent = "Dette private arkivet åpnes ikke på GitHub Pages sitt delte domene.";
      const link = document.createElement("a");
      link.href = "https://aha-echonet.vercel.app/psykologi.html";
      link.textContent = "Åpne Psykologirommet på AHAs separate adresse";
      list.append(link);
      status.textContent = "Bruk AHA-adressen for å holde Psykologirommet atskilt fra andre GitHub Pages-apper.";
      return;
    }
    let previewSource = "aha";
    textarea.addEventListener("input", () => { previewSource = "aha"; });

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
        const actions = document.createElement("div");
        actions.className = "aha-psych-actions";
        actions.append(button);
        const promoted = readPromoted(entry);
        if (!promoted) {
          const promote = document.createElement("button");
          promote.type = "button";
          promote.className = "aha-tile-btn aha-tile-btn-secondary";
          promote.textContent = "Bruk som AHA-innsikt";
          promote.addEventListener("click", () => {
            const result = promoteToInsights(entry);
            if (result.ok) {
              render();
              message("Valgt tekst er kopiert til Innsikter. Du kan nå legge den i lister, stier og tankekart.");
            } else if (!result.cancelled) message(result.message);
          });
          actions.append(promote);
        } else {
          const open = document.createElement("a");
          open.href = "insights.html#insight-" + encodeURIComponent(promoted.id);
          open.className = "aha-tile-btn aha-tile-btn-primary";
          open.textContent = "Åpne i Innsikter";
          actions.append(open);
          const retract = document.createElement("button");
          retract.type = "button";
          retract.className = "aha-tile-btn aha-tile-btn-secondary";
          retract.textContent = "Fjern AHA-kopien";
          retract.addEventListener("click", () => {
            const result = removePromoted(entry);
            if (result.ok) {
              render();
              message("Kopien er fjernet fra Innsikter. Det private notatet er beholdt.");
            } else if (!result.cancelled) message(result.message);
          });
          actions.append(retract);
        }
        article.append(date, text, actions);
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
      previewSource = "historygo";
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
      if (entries.length >= MAX_ITEMS) {
        message("Arkivet har 30 refleksjoner. Slett en eldre refleksjon før du lagrer flere.");
        return;
      }
      entries.push({ id: createId(), text, created_at: new Date().toISOString(),
        source_app: previewSource, source_type: "psychology_user_selected_text",
        visibility: "local_private" });
      if (!save(entries)) {
        message("Kunne ikke lagre lokalt. Ingen tekst ble sendt til en server.");
        return;
      }
      textarea.value = "";
      previewSource = "aha";
      consent.checked = false;
      message("Valgt tekst er lagret privat i AHA på denne enheten.");
      render();
    });

    document.getElementById("aha-psych-clear-preview")?.addEventListener("click", () => {
      textarea.value = "";
      previewSource = "aha";
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
