// Kunstrommet: one editor, one entry point. Read-only V1 sketches and optional Aha bridges.
(function (global) {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const editor = global.AHAKunstrommetV2;
  if (!editor || !$("kv2-canvas")) return;

  function linkStatus(message) {
    const node = $("kv2-link-state");
    if (node) node.textContent = message;
  }
  function ideaStatus(message) {
    const node = $("kv2-aha-state");
    if (node) node.textContent = message;
  }
  function owner() {
    try { return String(global.localStorage.getItem("aha_profile_id") || "local").slice(0, 120); }
    catch (_) { return "local"; }
  }
  function uiButton(label, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", handler);
    return button;
  }

  async function legacyRecords() {
    if (!global.indexedDB) return [];
    // Do not create an empty V1 store on browsers that support listing databases.
    if (typeof global.indexedDB.databases === "function") {
      const names = await global.indexedDB.databases();
      if (!names.some((record) => record.name === "aha_kunstrommet_v1")) return [];
    }
    return new Promise((resolve) => {
      const request = global.indexedDB.open("aha_kunstrommet_v1", 1);
      request.onupgradeneeded = () => {
        // An older browser might have no V1 data. Never create or migrate records.
      };
      request.onerror = () => resolve([]);
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("projects")) {
          db.close();
          resolve([]);
          return;
        }
        const read = db.transaction("projects", "readonly").objectStore("projects").getAll();
        read.onsuccess = () => {
          const items = Array.isArray(read.result) ? read.result : [];
          db.close();
          resolve(items.filter((item) => item?.owner === owner() &&
            typeof item.id === "string" && Array.isArray(item.strokes))
            .slice(0, 500));
        };
        read.onerror = () => { db.close(); resolve([]); };
      };
    });
  }

  async function renderLegacy() {
    const mount = $("kv2-legacy-projects");
    if (!mount) return;
    mount.replaceChildren();
    let items = [];
    try { items = await legacyRecords(); }
    catch (_) { mount.textContent = "Kunne ikke lese tidligere skisser."; return; }
    if (!items.length) {
      mount.textContent = "Ingen eldre skisser på denne enheten.";
      return;
    }
    const info = document.createElement("p");
    info.className = "kv2-tip";
    info.textContent = items.length + " eldre skisser funnet. Originalene beholdes.";
    mount.appendChild(info);
    items.sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))
      .forEach((item) => {
        const row = document.createElement("div");
        row.className = "kv2-project";
        const name = document.createElement("span");
        name.textContent = String(item.title || "Uten tittel").slice(0, 120);
        const open = uiButton("Åpne som kopi", async () => {
          try {
            const opened = await editor.openLegacyCopy(item);
            if (opened) {
              $("kv2-status").textContent = "Eldre skisse åpnet som ny kopi – lagre når du er klar";
              $("kv2-canvas").scrollIntoView({ block: "center", behavior: "smooth" });
            }
          } catch (error) { $("kv2-status").textContent = "Kunne ikke åpne skissen: " + error.message; }
        });
        row.append(name, open);
        mount.appendChild(row);
      });
  }

  function renderGalleryInspiration() {
    const mount = $("kv2-gallery-inspiration");
    if (!mount) return;
    mount.replaceChildren();
    let items = [];
    try {
      items = (global.AHAGallery?.load?.() || [])
        .filter((item) => item && !item.deleted_at && !item.deletedAt && item.archived !== true)
        .slice(0, 8);
    } catch (_) {}
    if (!items.length) {
      mount.textContent = "Galleriet har ingen tilgjengelige referanser ennå.";
      return;
    }
    items.forEach((item) => {
      const row = document.createElement("div");
      row.className = "kv2-inspiration";
      const heading = document.createElement("strong");
      heading.textContent = String(item.title || "Uten tittel").slice(0, 120);
      const desc = document.createElement("p");
      desc.className = "kv2-tip";
      desc.textContent = String(item.description || "").slice(0, 240);
      const use = uiButton("Bruk teksten som inspirasjon", () => {
        const title = String(item.title || "Uten tittel").trim().slice(0, 120);
        const description = String(item.description || "").trim().slice(0, 500);
        const addition = ["Inspirasjon fra Aha Galleri: " + title, description].filter(Boolean).join("\n");
        const note = $("kv2-note");
        const updated = [note.value.trim(), addition].filter(Boolean).join("\n\n");
        if (updated.length > 4000) {
          $("kv2-status").textContent = "Notatet er for langt til å legge til inspirasjonen.";
          return;
        }
        note.value = updated;
        note.dispatchEvent(new Event("input", { bubbles: true }));
        note.focus();
      });
      row.appendChild(heading);
      if (desc.textContent) row.appendChild(desc);
      row.appendChild(use);
      mount.appendChild(row);
    });
  }

  function collectionOptions() {
    const select = $("kv2-collection-select");
    if (!select) return;
    const previous = select.value;
    select.replaceChildren();
    const defaultItem = document.createElement("option");
    defaultItem.value = "";
    defaultItem.textContent = "Velg samling";
    select.appendChild(defaultItem);
    try {
      const all = global.AHALists?.loadLists?.() || [];
      all.filter((item) => !item.deletedAt && !item.deleted_at && item.archived !== true)
        .forEach((item) => {
          const option = document.createElement("option");
          option.value = item.id;
          option.textContent = item.title || "Uten tittel";
          select.appendChild(option);
        });
      if (all.some((item) => item.id === previous && !item.deletedAt && !item.deleted_at)) select.value = previous;
    } catch (error) { linkStatus("Samlingene kunne ikke leses: " + error.message); }
  }

  async function linkArtwork() {
    const active = editor.summary();
    if (!active) return;
    if (active.dirty) { linkStatus("Lagre kunstverket før du knytter det til en samling."); return; }
    if (global.AHA_CONFIG?.lists?.enableDatabaseSync === true) {
      linkStatus("Kobling er blokkert fordi synkronisering av samlinger er aktiv."); return;
    }
    const listId = $("kv2-collection-select").value;
    if (!listId) { linkStatus("Velg en samling først."); return; }
    const refs = global.AHAKunstrommetReferences;
    const lists = global.AHALists;
    if (!refs || !lists?.addItemToList) {
      linkStatus("Lokale Aha-samlinger er utilgjengelige."); return;
    }
    try {
      const saved = (await editor.savedProjects()).find((item) =>
        item.id === active.id && item.owner === owner());
      if (!saved) { linkStatus("Prosjektet må være lagret lokalt."); return; }
      const existed = refs.load().some((ref) => ref.id === saved.id);
      refs.upsert(saved);
      let result;
      try {
        result = lists.addItemToList(listId, {
          title: saved.title || "Uten tittel",
          source: "aha_kunstrommet", type: "artwork", refId: saved.id,
          meta: { local_only: true, referenced_artwork: true }
        });
      } catch (error) {
        if (!existed) refs.remove(saved.id);
        throw error;
      }
      if (!result?.ok && result?.reason !== "duplicate") {
        if (!existed) refs.remove(saved.id);
        linkStatus("Koblingen ble ikke opprettet: " + (result?.detail || result?.reason || "ukjent feil"));
        return;
      }
      linkStatus(result?.reason === "duplicate" ? "Kunstverket er allerede i samlingen."
        : "Kunstverket er nå knyttet til samlingen og kan finnes i tankekartet.");
    } catch (error) { linkStatus("Kobling mislyktes: " + error.message); }
  }

  function unlinkArtwork() {
    const active = editor.summary();
    if (!active || !global.confirm("Fjerne kunstverket fra alle dine lokale samlinger? Selve verket beholdes.")) return;
    if (global.AHA_CONFIG?.lists?.enableDatabaseSync === true) {
      linkStatus("Koblingene kan ikke endres når databasesynkronisering er aktiv."); return;
    }
    const refs = global.AHAKunstrommetReferences;
    if (!refs?.unlinkArtwork || !refs?.remove) { linkStatus("Referansearkivet er utilgjengelig."); return; }
    try {
      const count = refs.unlinkArtwork(active.id);
      refs.remove(active.id);
      linkStatus("Fjernet " + count + " lokale koblinger. Kunstverket beholdes.");
    } catch (error) { linkStatus("Kunne ikke fjerne koblinger: " + error.message); }
  }

  async function sendTextToAha() {
    const current = editor.summary();
    if (!current || (!current.title && !current.note)) {
      ideaStatus("Skriv en tittel eller et notat først."); return;
    }
    const ingest = global.AHAModuleApi?.resolve?.("ingest", "AHAIngest", { version: 1 }) || global.AHAIngest;
    if (!ingest?.ingest) { ideaStatus("Ahas innsiktsmotor er ikke tilgjengelig."); return; }
    try {
      ideaStatus("Sender bare tittel og notat til Aha …");
      const result = await ingest.ingest({
        id: "src_kunstrommet_" + current.id,
        source_app: "aha", source_type: "aha_kunstrommet_idea", content_type: "creative_note",
        user_created: true, imported: false, local_only: true,
        title: current.title || "Kunstrommet",
        text: [current.title, current.note].filter(Boolean).join("\n"),
        created_at: current.created_at,
        meta: { kunstrommet_project_id: current.id, local_only: true,
          image_sent: false, explicit_user_action: true }
      });
      if (!result?.ok) throw new Error("Aha bekreftet ikke importen.");
      ideaStatus("Tittel og notat er sendt til Aha. Ingen bildepiksler er sendt.");
    } catch (error) { ideaStatus("Kunne ikke sende teksten: " + error.message); }
  }

  async function openArtLink() {
    const hash = global.location?.hash || "";
    if (!hash.startsWith("#art-")) return;
    let id;
    try { id = decodeURIComponent(hash.slice(5)); }
    catch (_) { linkStatus("Ugyldig lenke til kunstverk."); return; }
    if (!id || id.length > 128) { linkStatus("Ugyldig lenke til kunstverk."); return; }
    try {
      if (await editor.openSaved(id)) return;
      const original = (await legacyRecords()).find((item) => item.id === id);
      if (original) {
        const opened = await editor.openLegacyCopy(original);
        if (opened) linkStatus("Eldre kunstverk åpnet som redigerbar kopi. Originalen beholdes.");
      } else {
        linkStatus("Kunstverket er ikke lagret på denne enheten eller denne lokale profilen.");
      }
    } catch (error) { linkStatus("Kunne ikke åpne kunstverket: " + error.message); }
  }

  $("kv2-collection-select")?.addEventListener("focus", collectionOptions);
  $("kv2-link-collection")?.addEventListener("click", linkArtwork);
  $("kv2-unlink-aha")?.addEventListener("click", unlinkArtwork);
  $("kv2-send-aha")?.addEventListener("click", sendTextToAha);
  collectionOptions();
  renderGalleryInspiration();
  renderLegacy();
  openArtLink();
})(window);
