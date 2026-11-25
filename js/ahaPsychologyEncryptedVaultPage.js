// Manual account vault page. No automatic upload, download or account-sync
// when the page loads. All display text is assigned via textContent.
(function (global) {
  "use strict";

  const id = name => global.document.getElementById(name);
  const vault = global.AHAPsychologyEncryptedVault;
  const MAX_BYTES = vault?.maxFileBytes || 12582912;
  let busy = false;
  let generation = 0;
  let activeUserId = null;
  let downloadUrl = null;
  const history = [];
  const comparisonIdle = "Ingen sammenligning utført.";

  function compareStatus(message = comparisonIdle) {
    const output = id("aha-psych-vault-compare-result");
    if (output) output.textContent = message;
  }

  function renderHistory() {
    const list = id("aha-psych-vault-history-list");
    if (!list) return;
    list.replaceChildren();
    for (const entry of history) {
      const item = global.document.createElement("li");
      item.textContent = entry.time + " UTC – " + entry.label;
      list.appendChild(item);
    }
    const empty = id("aha-psych-vault-history-empty");
    if (empty) empty.hidden = history.length > 0;
  }

  function record(label) {
    history.unshift({ time: new Date().toISOString().slice(11, 19), label });
    history.length = Math.min(history.length, 20);
    renderHistory();
  }

  const messages = {
    not_activated: "Kontohvelvet er ikke aktivert. Bruk kryptert filbackup i Psykologirommet.",
    pilot_required: "Opplasting krever godkjent pilotkonto og oppdatert innlogging. Eksisterende egne kopier kan fortsatt hentes og slettes.",
    not_configured: "AHA-innloggingen er ikke tilgjengelig på denne siden.",
    account_changed: "Kontoen er endret. Sjekk kontokopien på nytt.",
    login_required: "Logg inn på AHA først, og åpne deretter denne siden på nytt.",
    invalid_file: "Filen har ikke formatet fra Psykologirommets krypterte sikkerhetskopi.",
    quota_or_uploads_closed: "Filen kan ikke lagres nå. Den kan være større enn kontogrensen, lagringsbudsjettet kan være fullt, eller nye opplastinger kan være stengt. Behold den lokale krypterte filen. Ingen ny kontokopi er lagret.",
    already_exists: "Det ligger allerede en kryptert fil på kontoen. Last den ned før du eventuelt sletter den.",
    no_backup: "Det finnes ingen kryptert sikkerhetskopi på kontoen.",
    confirmation_required: "Bekreft sletting før du fortsetter.",
    deletion_unconfirmed: "Slettingen kunne ikke bekreftes. Sjekk kontokopien på nytt. Lokale notater og filer er ikke berørt.",
    vault_unavailable: "Kontohvelvet er ikke tilgjengelig. Ingen opplasting er bekreftet."
  };

  function messageFor(error) {
    return messages[error?.code] || "Handlingen mislyktes. Ingen vellykket overføring er bekreftet.";
  }

  function status(message) {
    const output = id("aha-psych-vault-status");
    if (output) output.textContent = message;
  }

  function overview(data) {
    const output = id("aha-psych-vault-overview");
    if (!output) return;
    if (!data) {
      output.textContent = "Ikke sjekket i denne økten.";
      return;
    }
    if (!data.exists) {
      output.textContent = "Ingen kontokopi synlig ved siste kontroll.";
      return;
    }
    const date = typeof data.createdAt === "string" ? new Date(data.createdAt) : null;
    const time = date && Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat("nb-NO", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(date) + " UTC"
      : "ikke bekreftet";
    const size = Number.isSafeInteger(data.bytes) && data.bytes > 0 && data.bytes <= MAX_BYTES
      ? new Intl.NumberFormat("nb-NO").format(data.bytes) + " byte"
      : "ikke hentet";
    output.textContent = "Kryptert kontokopi registrert. Opplastingstid: " + time +
      ". Filstørrelse: " + size + ".";
  }

  function setBusy(value) {
    busy = value;
    global.document.querySelectorAll("#aha-psych-vault-panel button").forEach(button => {
      button.disabled = value;
    });
  }

  function restoreStatus(ready) {
    const output = id("aha-psych-vault-restore-status");
    if (output) output.textContent = ready
      ? "Nedlastingslenken er klargjort. Last ned filen selv og følg stegene. AHA kan ikke bekrefte at filen er lagret."
      : "Ingen nedlastingslenke klargjort i denne økten. Har du allerede en egen kryptert fil, kan du bruke den i History Go.";
  }

  function clearDownload() {
    if (downloadUrl) global.URL.revokeObjectURL(downloadUrl);
    downloadUrl = null;
    id("aha-psych-vault-download")?.replaceChildren();
    restoreStatus(false);
  }

  function resetAccount() {
    generation++;
    activeUserId = null;
    overview(null);
    history.length = 0;
    renderHistory();
    compareStatus();
    id("aha-psych-vault-compare-form")?.reset();
    clearDownload();
    const form = id("aha-psych-vault-upload");
    form?.reset();
    if (form) form.hidden = true;
    status(messages.account_changed);
  }

  async function run(operation, checkOnly = false) {
    if (busy) return;
    overview(null);
    compareStatus();
    setBusy(true);
    const initialGeneration = generation;
    try {
      const userId = await vault.accountId();
      if (initialGeneration !== generation) return;
      if (activeUserId && activeUserId !== userId) {
        resetAccount();
        if (!checkOnly) return;
      }
      activeUserId = userId;
      const expectedGeneration = generation;
      const options = { expectedUserId: userId };
      const current = async () => {
        if (expectedGeneration !== generation) return false;
        const id = await vault.accountId(options);
        return id === userId && expectedGeneration === generation;
      };
      await operation(options, current);
    }
    catch (error) {
      if (initialGeneration === generation) {
        if (error?.code === "account_changed" || error?.code === "login_required") resetAccount();
        status(messageFor(error));
      }
    }
    finally { setBusy(false); }
  }

  function saveFile(text) {
    clearDownload();
    const blob = new global.Blob([text], { type: "application/json" });
    const url = global.URL.createObjectURL(blob);
    downloadUrl = url;
    const link = global.document.createElement("a");
    link.href = url;
    link.download = "psykologirommet-kryptert-fra-aha.json";
    link.textContent = "Last ned kryptert fil";
    const area = id("aha-psych-vault-download");
    area.replaceChildren(link);
    restoreStatus(true);
    // Link remains user-initiated and usable on iPad (no forced navigation).
    link.addEventListener("click", () => global.setTimeout(() => {
      if (downloadUrl === url) clearDownload();
      else global.URL.revokeObjectURL(url);
    }, 60000), { once: true });
  }

  function start() {
    // The GitHub Pages hostname is shared with History-Go. Refuse account
    // operations there and point the user to AHA's separate origin instead.
    if (global.location?.hostname === "paradispartiet.github.io") {
      const notice = id("aha-psych-vault-shared-origin");
      if (notice) notice.hidden = false;
      status("Kontohvelvet er sperret på GitHub Pages sitt delte domene.");
      return;
    }
    if (!vault || (!vault.enabled() && !vault.pilotEnabled())) {
      status(messages.not_activated);
      return;
    }
    const panel = id("aha-psych-vault-panel");
    if (!panel) return;
    panel.hidden = false;
    const pilot = vault.pilotEnabled();
    const uploadForm = id("aha-psych-vault-upload");
    if (uploadForm) uploadForm.hidden = true;
    if (pilot) id("aha-psych-vault-pilot-notice").hidden = false;
    // Supabase auth callbacks must stay synchronous. Ignore token refreshes
    // for the same identity; invalidate pending results on sign-out/switch.
    const auth = global.AHADb?.getClient?.()?.auth;
    auth?.onAuthStateChange?.((event, session) => {
      if (event === "SIGNED_OUT" || (activeUserId && session?.user?.id !== activeUserId)) {
        resetAccount();
      }
    });
    global.addEventListener("pagehide", resetAccount);
    status(pilot ? "Begrenset pilot. Trykk Sjekk kontokopien for å kontrollere tilgang." :
      "Trykk Sjekk kontokopien før opplasting. Ingen fil blir lastet opp automatisk.");

    id("aha-psych-vault-check")?.addEventListener("click", () => run(async (options, current) => {
      clearDownload();
      if (uploadForm) uploadForm.hidden = true;
      const data = await vault.status(options);
      const canUpload = !pilot || await vault.pilotAccess(options);
      if (!await current()) return;
      if (uploadForm) uploadForm.hidden = !canUpload;
      overview(data);
      record(data.exists ? "Kontokopi funnet" : "Ingen kontokopi synlig");
      status((data.exists ?
        "En kryptert fil ligger på kontoen. Du kan laste den ned eller slette den." :
        "Ingen kryptert fil er lagret på kontoen.") +
        (pilot ? (canUpload ? " Pilottilgang bekreftet. Bruk bare en syntetisk testfil." :
          " Opplasting krever en godkjent pilotkonto.") : ""));
    }, true));

    id("aha-psych-vault-upload")?.addEventListener("submit", event => {
      event.preventDefault();
      const form = event.currentTarget;
      if (form.hidden || !activeUserId) {
        status(messages.account_changed);
        return;
      }
      const file = form.querySelector('input[type="file"]')?.files?.[0];
      const consented = form.querySelector('input[name="consent"]')?.checked === true;
      run(async (options, current) => {
        if (!file || !consented) {
          status("Velg fil og bekreft at den bare inneholder krypterte data.");
          return;
        }
        if (file.size > MAX_BYTES) {
          status("Filen er for stor (maks 12 MiB).");
          return;
        }
        const text = await file.text();
        vault.validateEncryptedFile(text);
        if (!await current()) return;
        const result = await vault.upload(text, options);
        if (!await current()) return;
        overview({ exists: true, bytes: result.bytes });
        record("Opplasting bekreftet");
        form.reset();
        status("Den krypterte filen er lagret på AHA-kontoen. Ingen notattekst ble dekryptert.");
      });
    });

    id("aha-psych-vault-download-button")?.addEventListener("click", () => run(async (options, current) => {
      clearDownload();
      const result = await vault.download(options);
      if (!await current()) return;
      saveFile(result.text);
      record("Nedlastingslenke klargjort");
      overview({ exists: true, createdAt: result.createdAt, bytes: result.bytes });
      status("Den krypterte filen er klar. Trykk på lenken for å laste den ned.");
    }));

    const compareForm = id("aha-psych-vault-compare-form");
    const compareInput = compareForm?.querySelector('input[type="file"]');
    compareInput?.addEventListener("change", () => compareStatus());
    compareForm?.addEventListener("submit", event => {
      event.preventDefault();
      const file = compareInput?.files?.[0];
      if (!file || busy) return;
      run(async (options, current) => {
        if (file.size > MAX_BYTES) {
          compareStatus("Filen er for stor (maks 12 MiB).");
          return;
        }
        let local;
        try {
          const text = await file.text();
          // The validated envelope is ASCII. Reject BOM/encoding differences
          // rather than reporting byte equality after text normalization.
          if (file.size !== text.length) throw Error("encoding");
          local = vault.validateEncryptedFile(text);
        } catch {
          if (await current() && compareInput.files?.[0] === file) {
            compareStatus("Den lokale filen har ikke forventet kryptert format.");
          }
          return;
        }
        if (!await current() || compareInput.files?.[0] !== file) return;
        let remote;
        try { remote = await vault.download(options); }
        catch (error) {
          if (await current() && compareInput.files?.[0] === file) {
            compareStatus(error?.code === "no_backup" ?
              "Ingen kontokopi synlig. Sammenligning er ikke mulig." :
              "Kontokopien kunne ikke hentes. Sammenligning er ikke bekreftet.");
          }
          return;
        }
        if (!await current() || compareInput.files?.[0] !== file) return;
        compareStatus(local.text === remote.text ?
          "Filene er byte-for-byte identiske ved denne kontrollen." :
          "Filene er forskjellige. Dette sier ikke om notatene er forskjellige eller nyere.");
        overview({ exists: true, createdAt: remote.createdAt, bytes: remote.bytes });
        record("Filsammenligning gjennomført");
      });
    });

    id("aha-psych-vault-delete")?.addEventListener("click", () => run(async (options, current) => {
      if (!global.confirm("Slette den krypterte kopien fra AHA-kontoen? Last den ned først om du vil beholde den.")) return;
      if (!await current()) return;
      clearDownload();
      const result = await vault.remove({ ...options, confirmed: true });
      if (!await current()) return;
      overview({ exists: false });
      record(result.removed ? "Sletting bekreftet" : "Ingen kontokopi synlig; ingen sletting bekreftet");
      status(result.removed
        ? "Den krypterte kontokopien er slettet og fraværet kontrollert i databasen. Lokale notater er ikke berørt."
        : "Ingen kontokopi er synlig på kontoen. Ingen sletting ble bekreftet. Lokale notater er ikke berørt.");
    }));
  }

  if (global.document.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})(window);
