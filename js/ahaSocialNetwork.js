// Optional, explicitly configured staging UI for AHA Feed and AHA Insta.
// Private local posts remain in their original modules, never auto-shared.
(function (global) {
  "use strict";
  const VERSION = "aha_social_staging_v1";
  const ALLOWED_KINDS = new Set(["feed", "insta"]);
  let active = false;

  function origin() {
    try {
      const url = new URL(String(global.AHA_SOCIAL_API_ORIGIN || ""));
      if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash || url.username || url.password) return "";
      return url.origin;
    } catch { return ""; }
  }

  function isEnabled() {
    // No default production activation. The separate NestJS gate also denies production.
    return global.AHA_SOCIAL_STAGING_ENABLED === true && Boolean(origin());
  }

  function add(tag, parent, text, className) {
    const element = global.document.createElement(tag);
    if (text !== undefined && text !== null) element.textContent = String(text);
    if (className) element.className = className;
    if (parent) parent.appendChild(element);
    return element;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function isoDate(raw) {
    const date = new Date(String(raw || ""));
    return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("no-NO");
  }

  function getKind(mount) {
    const kind = mount?.dataset?.socialKind;
    return ALLOWED_KINDS.has(kind) ? kind : null;
  }

  async function call(path, method = "GET", payload = null) {
    const session = await global.AHAAuth?.getSession?.();
    if (!session?.access_token) throw new Error("Logg inn i AHA for å se og publisere innlegg.");
    const headers = { Authorization: "Bearer " + session.access_token };
    if (payload !== null) headers["Content-Type"] = "application/json";
    const response = await global.fetch(origin() + path, {
      method, headers, body: payload !== null ? JSON.stringify(payload) : undefined,
      cache: "no-store", credentials: "omit"
    });
    let body;
    try { body = await response.json(); } catch { body = null; }
    if (!response.ok || !body || !("data" in body)) {
      if (response.status === 503) throw new Error("AHA sin sosiale testtjeneste er ikke aktivert.");
      if (response.status === 401) throw new Error("Du må logge inn på nytt.");
      throw new Error("Kunne ikke gjennomføre handlingen. Prøv igjen.");
    }
    return body.data;
  }

  function createKey() {
    if (global.crypto?.randomUUID) return "aha-" + global.crypto.randomUUID();
    return "aha-" + Date.now() + "-" + Math.random().toString(36).slice(2, 16);
  }

  async function init() {
    if (active || !isEnabled() || !global.document) return false;
    const mount = global.document.getElementById("aha-social-mount");
    const kind = getKind(mount);
    if (!mount || !kind) return false;
    active = true;
    const panel = add("section", mount, null, "aha-panel aha-social-panel");
    add("p", panel, "AHA-NETTVERK · TESTMILJØ", "eyebrow");
    add("h2", panel, kind === "feed" ? "Delte oppdateringer" : "Delte bilder og videoer");
    add("p", panel, "Dette er atskilt fra dine private, lokale poster. Ingenting deles uten at du velger «Publiser» og bekrefter det.", "aha-social-intro");

    const form = add("form", panel, null, "module-form aha-social-compose");
    const captionLabel = add("label", form, kind === "feed" ? "Tekst" : "Bildetekst");
    const message = add("textarea", captionLabel);
    message.required = true;
    message.maxLength = 2000;
    message.placeholder = kind === "feed" ? "Skriv en offentlig oppdatering…" : "Skriv en bildetekst…";
    let media = null;
    if (kind === "insta") {
      const mediaLabel = add("label", form, "Offentlig medieadresse (godkjent HTTPS-vert)");
      media = add("input", mediaLabel);
      media.type = "url";
      media.required = true;
      media.placeholder = "https://…";
    }
    const consentLabel = add("label", form, null, "aha-social-consent");
    const consent = add("input", consentLabel);
    consent.type = "checkbox";
    consent.required = true;
    add("span", consentLabel, "Jeg vil publisere dette innlegget slik at andre innloggede AHA-brukere kan se det.");
    const submit = add("button", form, kind === "feed" ? "Publiser i AHA Feed" : "Publiser i AHA Insta");
    submit.type = "submit";

    const status = add("p", panel, "", "module-meta aha-social-status");
    status.setAttribute("role", "status");
    const refresh = add("button", panel, "Oppdater delte innlegg", "aha-social-refresh");
    refresh.type = "button";
    const list = add("div", panel, null, "module-list aha-social-list");
    let pendingKey = null;
    let pendingSignature = null;

    function showStatus(text) { status.textContent = text; }

    async function mutate(path, method, payload, success) {
      try {
        await call(path, method, payload);
        showStatus(success || "Oppdatert.");
        await load();
        return true;
      } catch (error) {
        showStatus(error.message || "Handlingen feilet.");
        return false;
      }
    }

    function renderComment(section, item) {
      const row = add("div", section, null, "aha-social-comment");
      add("strong", row, item.authorName || "AHA-bruker");
      add("span", row, " " + (item.text || ""));
    }

    async function showComments(section, postId) {
      clear(section);
      try {
        const comments = await call("/v1/social/posts/" + encodeURIComponent(postId) + "/comments");
        for (const comment of Array.isArray(comments) ? comments : []) renderComment(section, comment);
        if (!comments.length) add("p", section, "Ingen kommentarer ennå.");
        const commentForm = add("form", section, null, "aha-social-comment-form");
        const field = add("input", commentForm);
        field.type = "text"; field.placeholder = "Skriv en kommentar"; field.maxLength = 500; field.required = true;
        const send = add("button", commentForm, "Kommenter"); send.type = "submit";
        commentForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          if (!field.value.trim()) return;
          if (await mutate("/v1/social/posts/" + encodeURIComponent(postId) + "/comments", "POST", { text: field.value.trim() }, "Kommentar publisert.")) {
            await showComments(section, postId);
          }
        });
      } catch (error) { add("p", section, error.message || "Kunne ikke vise kommentarer."); }
    }

    function renderPost(post) {
      const card = add("article", list, null, "module-card aha-social-post");
      const head = add("div", card, null, "aha-social-post-head");
      add("strong", head, post.authorName || "AHA-bruker");
      add("span", head, isoDate(post.createdAt), "module-meta");
      add("p", card, post.text || "");
      if (kind === "insta" && typeof post.mediaUrl === "string") {
        let mediaUrl;
        try {
          const parsed = new URL(post.mediaUrl);
          if (parsed.protocol === "https:" && !parsed.username && !parsed.password) mediaUrl = parsed.href;
        } catch {}
        if (mediaUrl) {
          const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(mediaUrl);
          const visual = add(isVideo ? "video" : "img", card, null, "aha-social-media");
          visual.src = mediaUrl;
          visual.referrerPolicy = "no-referrer";
          if (isVideo) { visual.controls = true; visual.preload = "none"; }
          else { visual.loading = "lazy"; visual.alt = post.text || "Innleggsbilde"; }
        }
      }
      const actions = add("div", card, null, "aha-social-actions");
      const like = add("button", actions, (post.likedByMe ? "♥ Likt" : "♡ Lik") + " (" + Number(post.likeCount || 0) + ")");
      like.type = "button";
      like.addEventListener("click", () => mutate("/v1/social/posts/" + encodeURIComponent(post.id) + "/like", "POST", { liked: !post.likedByMe }, "Likerklikk oppdatert."));
      const comment = add("button", actions, "Kommentarer (" + Number(post.commentCount || 0) + ")");
      comment.type = "button";
      const commentSection = add("div", card, null, "aha-social-comments");
      comment.addEventListener("click", () => showComments(commentSection, post.id));
      if (post.ownPost) {
        const remove = add("button", actions, "Slett");
        remove.type = "button";
        remove.addEventListener("click", () => {
          if (global.confirm("Slette dette publiserte innlegget?")) mutate("/v1/social/posts/" + encodeURIComponent(post.id), "DELETE", null, "Innlegget er slettet.");
        });
      } else {
        const report = add("button", actions, "Rapporter");
        report.type = "button";
        report.addEventListener("click", () => {
          const reason = global.prompt("Årsak: spam, abuse, privacy eller other", "spam");
          if (["spam", "abuse", "privacy", "other"].includes(reason)) {
            mutate("/v1/social/posts/" + encodeURIComponent(post.id) + "/reports", "POST", { reason }, "Rapport mottatt.");
          }
        });
      }
    }

    async function load() {
      showStatus("Henter delte innlegg…");
      try {
        const posts = await call("/v1/social/posts?kind=" + encodeURIComponent(kind) + "&limit=30");
        clear(list);
        const rows = Array.isArray(posts) ? posts : [];
        if (!rows.length) add("p", list, "Ingen publiserte innlegg ennå.");
        for (const post of rows) renderPost(post);
        showStatus("Viser " + rows.length + " delte innlegg.");
      } catch (error) {
        clear(list);
        showStatus(error.message || "Kunne ikke hente feeden.");
      }
    }

    refresh.addEventListener("click", () => load());
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!consent.checked || !message.value.trim() || (media && !media.value.trim())) {
        showStatus("Fyll ut innlegget og godkjenn offentlig publisering.");
        return;
      }
      const payload = { kind, text: message.value.trim(), publish: true };
      if (media) payload.mediaUrl = media.value.trim();
      const signature = JSON.stringify(payload);
      if (signature !== pendingSignature) { pendingKey = createKey(); pendingSignature = signature; }
      payload.requestKey = pendingKey;
      submit.disabled = true;
      try {
        await call("/v1/social/posts", "POST", payload);
        message.value = "";
        if (media) media.value = "";
        consent.checked = false;
        pendingKey = null;
        pendingSignature = null;
        await load();
        showStatus("Innlegget er publisert i testfeeden.");
      } catch (error) {
        showStatus(error.message || "Publiseringen feilet.");
      } finally { submit.disabled = false; }
    });
    await load();
    return true;
  }

  const api = Object.freeze({ VERSION, isEnabled, init });
  global.AHASocialNetwork = api;
  if (global.document && isEnabled()) {
    if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", () => { void init(); }, { once: true });
    else void init();
  }
})(typeof window !== "undefined" ? window : globalThis);
