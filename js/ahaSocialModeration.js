// Standalone AHA moderation queue. Only explicit staging; no local AHA data.
(function (global) {
  "use strict";
  const VERSION = "aha_social_moderation_staging_v1";

  function apiOrigin() {
    try {
      const url = new URL(String(global.AHA_SOCIAL_API_ORIGIN || ""));
      return url.protocol === "https:" && url.pathname === "/" &&
        !url.search && !url.hash && !url.username && !url.password ? url.origin : "";
    } catch { return ""; }
  }

  function isEnabled() {
    return global.AHA_SOCIAL_STAGING_ENABLED === true && Boolean(apiOrigin());
  }

  function add(parent, name, value, className) {
    const element = global.document.createElement(name);
    if (value != null) element.textContent = String(value);
    if (className) element.className = className;
    if (parent) parent.appendChild(element);
    return element;
  }

  function empty(parent) {
    while (parent.firstChild) parent.removeChild(parent.firstChild);
  }

  async function api(path, method = "GET", data = null) {
    const session = await global.AHAAuth?.getSession?.();
    if (!session?.access_token) throw new Error("Logg inn i AHA for å moderere.");
    const headers = { Authorization: "Bearer " + session.access_token };
    if (data !== null) headers["Content-Type"] = "application/json";
    const result = await global.fetch(apiOrigin() + path, {
      method, headers, credentials: "omit", cache: "no-store",
      body: data === null ? undefined : JSON.stringify(data)
    });
    if (result.status === 403) throw new Error("Denne kontoen har ikke moderatorrettigheter.");
    if (result.status === 503) throw new Error("Den sosiale stagingtjenesten er avslått.");
    let body;
    try { body = await result.json(); } catch { body = null; }
    if (!result.ok || !body || !Object.prototype.hasOwnProperty.call(body, "data")) {
      throw new Error("Kunne ikke fullføre forespørselen.");
    }
    return body.data;
  }

  async function init() {
    if (!global.document) return false;
    const status = global.document.getElementById("aha-moderation-status");
    const list = global.document.getElementById("aha-moderation-list");
    const refresh = global.document.getElementById("aha-moderation-refresh");
    if (!status || !list || !refresh) return false;

    if (!isEnabled()) {
      status.textContent = "Modereringskøen er ikke aktiv i denne versjonen av AHA.";
      refresh.disabled = true;
      return false;
    }

    function show(text) { status.textContent = text; }

    async function load() {
      refresh.disabled = true;
      show("Henter rapporter …");
      try {
        const items = await api("/v1/social/moderation/reports?limit=40");
        empty(list);
        if (!Array.isArray(items)) throw new Error("Ukjent rapportformat.");
        if (!items.length) add(list, "p", "Ingen åpne rapporter.");
        for (const item of items) {
          if (!item.postId || !["feed", "insta"].includes(item.kind)) continue;
          const card = add(list, "article", null, "module-card aha-social-post");
          add(card, "strong", "Rapportert " + (item.kind === "feed" ? "Feed-innlegg" : "Insta-innlegg"));
          add(card, "p", item.text || "");
          add(card, "p", String(item.reportCount || 0) + " rapporter · " +
            (Array.isArray(item.reasons) ? item.reasons.join(", ") : ""), "module-meta");
          if (typeof item.mediaUrl === "string") {
            try {
              const uri = new URL(item.mediaUrl);
              if (uri.protocol === "https:" && !uri.username && !uri.password) {
                const image = add(card, "img", null, "aha-social-media");
                image.src = uri.href;
                image.alt = "Rapportert medieinnhold";
                image.loading = "lazy";
                image.referrerPolicy = "no-referrer";
              }
            } catch {}
          }
          const label = add(card, "label", "Begrunnelse (lagres i revisjonssporet)");
          const reason = add(label, "textarea");
          reason.minLength = 5;
          reason.maxLength = 500;
          reason.required = true;
          reason.placeholder = "Beskriv hva du har kontrollert og hvorfor du velger denne beslutningen.";
          const actions = add(card, "div", null, "aha-social-actions");
          const hide = add(actions, "button", "Skjul innlegget");
          const dismiss = add(actions, "button", "Avvis rapporten");
          hide.type = "button";
          dismiss.type = "button";
          async function decide(action) {
            const note = reason.value.trim();
            if (note.length < 5 || note.length > 500) {
              show("Skriv en begrunnelse på minst 5 tegn.");
              reason.focus();
              return;
            }
            if (action === "hide" && !global.confirm("Skjule innlegget fra andre brukere?")) return;
            hide.disabled = true;
            dismiss.disabled = true;
            try {
              await api("/v1/social/moderation/posts/" + encodeURIComponent(item.postId) + "/decision",
                "POST", { action, note });
              show(action === "hide" ? "Innlegget er skjult og handlingen loggført." : "Rapporten er avvist og beslutningen loggført.");
              await load();
            } catch (error) {
              show(error.message || "Modereringshandlingen feilet.");
              hide.disabled = false;
              dismiss.disabled = false;
            }
          }
          hide.addEventListener("click", () => { void decide("hide"); });
          dismiss.addEventListener("click", () => { void decide("dismiss"); });
        }
        show(items.length + " åpne rapporterte innlegg.");
      } catch (error) {
        empty(list);
        show(error.message || "Kunne ikke hente rapporter.");
      } finally { refresh.disabled = false; }
    }
    refresh.addEventListener("click", () => { void load(); });
    await load();
    return true;
  }

  global.AHASocialModeration = Object.freeze({ VERSION, isEnabled, init });
  if (global.document) {
    if (global.document.readyState === "loading") {
      global.document.addEventListener("DOMContentLoaded", () => { void init(); }, { once: true });
    } else { void init(); }
  }
})(typeof window !== "undefined" ? window : globalThis);
