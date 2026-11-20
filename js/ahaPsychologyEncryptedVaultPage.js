// Manual account vault page. No automatic upload, download or account-sync
// when the page loads. All display text is assigned via textContent.
(function (global) {
  "use strict";

  const id = name => global.document.getElementById(name);
  const vault = global.AHAPsychologyEncryptedVault;
  const MAX_BYTES = vault?.maxFileBytes || 12582912;
  let busy = false;

  const messages = {
    not_activated: "Kontohvelvet er ikke aktivert. Bruk kryptert filbackup i Psykologirommet.",
    not_configured: "AHA-innloggingen er ikke tilgjengelig på denne siden.",
    login_required: "Logg inn på AHA først, og åpne deretter denne siden på nytt.",
    invalid_file: "Filen har ikke formatet fra Psykologirommets krypterte sikkerhetskopi.",
    already_exists: "Det ligger allerede en kryptert fil på kontoen. Last den ned før du eventuelt sletter den.",
    no_backup: "Det finnes ingen kryptert sikkerhetskopi på kontoen.",
    confirmation_required: "Bekreft sletting før du fortsetter.",
    vault_unavailable: "Kontohvelvet er ikke tilgjengelig. Ingen opplasting er bekreftet."
  };

  function messageFor(error) {
    return messages[error?.code] || "Handlingen mislyktes. Ingen vellykket overføring er bekreftet.";
  }

  function status(message) {
    const output = id("aha-psych-vault-status");
    if (output) output.textContent = message;
  }

  function setBusy(value) {
    busy = value;
    global.document.querySelectorAll("#aha-psych-vault-panel button").forEach(button => {
      button.disabled = value;
    });
  }

  async function run(operation) {
    if (busy) return;
    setBusy(true);
    try { await operation(); }
    catch (error) { status(messageFor(error)); }
    finally { setBusy(false); }
  }

  function saveFile(text) {
    const blob = new global.Blob([text], { type: "application/json" });
    const url = global.URL.createObjectURL(blob);
    const link = global.document.createElement("a");
    link.href = url;
    link.download = "psykologirommet-kryptert-fra-aha.json";
    link.textContent = "Last ned kryptert fil";
    const area = id("aha-psych-vault-download");
    area.replaceChildren(link);
    // Link remains user-initiated and usable on iPad (no forced navigation).
    link.addEventListener("click", () => global.setTimeout(() =>
      global.URL.revokeObjectURL(url), 60000), { once: true });
  }

  function start() {
    if (!vault || !vault.enabled()) {
      status(messages.not_activated);
      return;
    }
    const panel = id("aha-psych-vault-panel");
    if (!panel) return;
    panel.hidden = false;
    status("Innlogging kreves. Ingen fil blir lastet opp automatisk.");

    id("aha-psych-vault-check")?.addEventListener("click", () => run(async () => {
      const data = await vault.status();
      status(data.exists ?
        "En kryptert fil ligger på kontoen. Du kan laste den ned eller slette den." :
        "Ingen kryptert fil er lagret på kontoen.");
    }));

    id("aha-psych-vault-upload")?.addEventListener("submit", event => {
      event.preventDefault();
      run(async () => {
        const form = event.currentTarget;
        const file = form.querySelector('input[type="file"]')?.files?.[0];
        const consent = form.querySelector('input[name="consent"]');
        if (!file || consent?.checked !== true) {
          status("Velg fil og bekreft at den bare inneholder krypterte data.");
          return;
        }
        if (file.size > MAX_BYTES) {
          status("Filen er for stor (maks 12 MiB).");
          return;
        }
        const text = await file.text();
        vault.validateEncryptedFile(text);
        await vault.upload(text);
        form.reset();
        status("Den krypterte filen er lagret på AHA-kontoen. Ingen notattekst ble dekryptert.");
      });
    });

    id("aha-psych-vault-download-button")?.addEventListener("click", () => run(async () => {
      const result = await vault.download();
      saveFile(result.text);
      status("Den krypterte filen er klar. Trykk på lenken for å laste den ned.");
    }));

    id("aha-psych-vault-delete")?.addEventListener("click", () => run(async () => {
      if (!global.confirm("Slette den krypterte kopien fra AHA-kontoen? Last den ned først om du vil beholde den.")) return;
      await vault.remove({ confirmed: true });
      id("aha-psych-vault-download")?.replaceChildren();
      status("Den krypterte kontokopien er slettet. Lokale notater er ikke berørt.");
    }));
  }

  if (global.document.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})(window);
