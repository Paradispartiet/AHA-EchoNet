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
    global.document.body?.classList?.add("aha-social-enabled");
    const panel = add("section", mount, null, "aha-panel aha-social-panel");
    add("p", panel, "AHA-NETTVERK · TESTMILJØ", "eyebrow");
    add("h2", panel, kind === "feed" ? "Delte oppdateringer" : "Delte bilder og videoer");
    add("p", panel, "Dette er atskilt fra dine private, lokale poster. Ingenting deles uten at du velger «Publiser» og bekrefter det.", "aha-social-intro");

    const form = add("form", panel, null, "module-form aha-social-compose");
    let instaMode = "feed";
    let viewMode = "feed";
    let placeSearch = null;
    let cachedPosts = [];
    let placeField = null;
    let message = null;
    let counter = null;
    let media = null;
    let preview = null;
    let videoPreview = null;
    let releasePreview = null;
    let discard = null;
    let fileVersion = 0;
    if (kind === "insta") {
      const mediaLabel = add("label", form, "Velg bilde fra iPad eller mobil");
      media = add("input", mediaLabel);
      media.type = "file";
      media.accept = "image/*";
      media.required = true;
      preview = add("img", form, null, "aha-social-media");
      preview.hidden = true;
      preview.alt = "Lokal forhåndsvisning av bildet";
      videoPreview=add("video",form,null,"aha-social-media aha-social-reel-preview");
      videoPreview.hidden=true;
      videoPreview.controls=true;
      videoPreview.playsInline=true;
      videoPreview.preload="metadata";
      videoPreview.setAttribute("aria-label","Lokal forhåndsvisning av Reel-video");
      add("p",form,"Velg bilde først. I Reel kan du også forhåndsvise video på iPad. Video kan bare publiseres i denne demoen.","module-meta");
      discard = add("button", form, "Fjern valgt bilde");
      discard.type = "button";
      discard.disabled = true;
      media.addEventListener("change", () => {
        // A failed publication may have left a private staged upload.
        // Discard that previous draft when the user selects a new picture.
        if (pendingMediaPath) {
          const old = pendingMediaPath;
          pendingMediaPath = null;
          void global.AHASocialMedia.deletePending(old, origin()).catch(() => {
            showStatus("Forrige opplastede bilde kunne ikke slettes. Det blir utilgjengelig etter 24 timer.");
          });
        }
        pendingKey = null;
        pendingSignature = null;
        pendingUploadKey = null;
        if (releasePreview) releasePreview();
        releasePreview = null;
        fileVersion++;
        try {
          const file = media.files?.[0];
          if (file && global.AHASocialMedia.isReelVideo(file)) {
            if (instaMode!=="reel") throw new Error("Velg Reel før video.");
            releasePreview=global.AHASocialMedia.localVideoPreview(file,videoPreview);
            showStatus("Videoen er lokal. Publisering fungerer bare i demoen.");
          } else if (file) releasePreview=global.AHASocialMedia.localPreview(file,preview);
          discard.disabled=!file;
        } catch (error) {
          showStatus(error.message || "Kunne ikke forhåndsvise bildet.");
          media.value = "";
          discard.disabled = true;
        }
      });
      const types = add("fieldset", form, null, "aha-social-type-selector");
      const legend = add("legend", types, "Publiser som");
      const bar = add("div", types, null, "aha-social-tabs");
      const modes = ["feed","reel","map"];
      const tabButtons = modes.map((mode) => {
        const button = add("button", bar, mode === "feed" ? "Feed" : mode === "reel" ? "Reel" : "Map");
        button.type = "button";
        button.dataset.mode = mode;
        button.setAttribute("aria-pressed", String(mode === instaMode));
        button.addEventListener("click", () => {
          if (mode!=="reel" && global.AHASocialMedia.isReelVideo(media.files?.[0])) {
            if (releasePreview) releasePreview();
            releasePreview=null;
            media.value="";
            fileVersion++;
            discard.disabled=true;
            consent.checked=false;
          }
          instaMode=mode;
          media.accept=mode==="reel"?"image/*,video/mp4,video/webm,video/quicktime":"image/*";
          for (const tab of tabButtons) tab.setAttribute("aria-pressed",String(tab.dataset.mode===mode));
          pendingSignature=null;
          // Keep the expected quick workflow: after choosing an upload type,
          // preview the matching reading tab, but browsing alone never changes
          // the draft publication type.
          setViewMode(mode);
          if (mode === "reel") showStatus("Reel kan forhåndsvise video. Video kan publiseres bare i demoen.");
          else if (mode === "map") showStatus("Map viser bilder ordnet etter stedstag.");
          else showStatus("Viser bildeinnlegg.");
        });
        return button;
      });
      const tagLabel = add("label", form, "Stedstag · valgfritt for Feed og Reel");
      placeField = add("input", tagLabel);
      placeField.type = "text";
      placeField.maxLength = 120;
      placeField.placeholder = "Legg til et sted, f.eks. Oslo";
      placeField.autocomplete = "off";
    }
    const captionLabel = add("label", form, kind === "feed" ? "Innlegg" : "Bildetekst");
    message = add("textarea", captionLabel);
    message.required = true;
    message.maxLength = kind === "feed" ? 500 : 2000;
    message.placeholder = kind === "feed" ? "Hva vil du dele?" : "Skriv en bildetekst…";
    if (kind === "feed") {
      counter = add("output", form, "0 / 500", "aha-social-counter");
      counter.setAttribute("aria-live", "polite");
      counter.setAttribute("aria-label", "Antall tegn");
      const updateCount = () => {
        counter.textContent = message.value.length + " / 500";
        counter.classList.toggle("near-limit", message.value.length >= 450);
      };
      message.addEventListener("input", updateCount);
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
    let viewButtons = [];
    if (kind === "insta") {
      const browser = add("nav", panel, null, "aha-social-browser");
      browser.setAttribute("aria-label", "Bla i Insta");
      add("p", browser, "Utforsk bilder", "aha-social-browser-title");
      const actions = add("div", browser, null, "aha-social-tabs aha-social-reading-tabs");
      viewButtons = ["feed","reel","map"].map((mode) => {
        const button = add("button", actions, mode === "feed" ? "Vis Feed" : mode === "reel" ? "Vis Reel" : "Vis Map");
        button.type = "button";
        button.dataset.view = mode;
        button.setAttribute("aria-pressed", String(mode === viewMode));
        button.addEventListener("click", () => setViewMode(mode));
        return button;
      });
      const searchLabel = add("label", browser, "Søk etter stedstag");
      searchLabel.className = "aha-social-place-search";
      placeSearch = add("input", searchLabel);
      placeSearch.type = "search";
      placeSearch.placeholder = "Finn bilder fra et sted";
      placeSearch.setAttribute("aria-label", "Søk etter stedstag");
      searchLabel.hidden = true;
      placeSearch.addEventListener("input", () => renderList());
    }
    const list = add("div", panel, null, "module-list aha-social-list");
    let pendingKey = null;
    let pendingSignature = null;
    let pendingUploadKey = null;
    let pendingMediaPath = null;
    if (discard) {
      discard.addEventListener("click", async () => {
        if (submit.disabled) return;
        discard.disabled = true;
        const staged = pendingMediaPath;
        if (staged) {
          try {
            await global.AHASocialMedia.deletePending(staged, origin());
          } catch (error) {
            showStatus(error.message || "Kunne ikke fjerne bildet fra staging.");
            discard.disabled = false;
            return;
          }
        }
        pendingMediaPath = null;
        pendingKey = null;
        pendingSignature = null;
        pendingUploadKey = null;
        media.value = "";
        fileVersion++;
        consent.checked = false;
        if (releasePreview) releasePreview();
        releasePreview = null;
        showStatus("Bildet er fjernet. Ingen innlegg er publisert.");
      });
    }
    const mediaReleases = new Set();
    let renderGeneration = 0;

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

    function renderPost(post, parent = list) {
      const card = add("article", parent, null, "module-card aha-social-post");
      if (kind === "feed") add("p", card, post.text || "", "aha-social-feed-copy");
      if (kind === "insta" && typeof post.mediaUrl === "string") {
        let mediaUrl;
        if (global.AHASocialMedia?.isPrivateMediaUrl?.(post.mediaUrl)) mediaUrl = post.mediaUrl;
        else try {
          const parsed = new URL(post.mediaUrl);
          if (parsed.protocol === "https:" && !parsed.username && !parsed.password) mediaUrl = parsed.href;
        } catch {}
        if (mediaUrl) {
          const isPrivate = global.AHASocialMedia?.isPrivateMediaUrl?.(mediaUrl);
          const isVideo=(isPrivate && global.__AHA_OFFLINE_DEMO__===true && post.mediaType==="video") ||
            (!isPrivate && /\.(mp4|webm|mov)(\?|$)/i.test(mediaUrl));
          const visual = add(isVideo ? "video" : "img", card, null, "aha-social-media");
          visual.referrerPolicy = "no-referrer";
          if (isVideo) { visual.controls=true; visual.playsInline=true; visual.preload="metadata"; }
          else { visual.loading="lazy"; visual.alt=post.text||"Innleggsbilde"; }
          if (isPrivate) {
            const generation=renderGeneration;
            global.AHASocialMedia.renderProtected(mediaUrl,visual,origin()).then(release=>{
              if(generation!==renderGeneration)release();
              else mediaReleases.add(release);
            }).catch(()=>{
              if(isVideo) visual.setAttribute("aria-label","Videoen kunne ikke vises.");
              else visual.alt="Bildet kunne ikke vises.";
            });
          } else visual.src=mediaUrl;
        }
      }
      const head = add("div", card, null, "aha-social-post-head");
      add("strong", head, post.authorName || "AHA-bruker");
      add("span", head, isoDate(post.createdAt), "module-meta");
      if (kind === "insta") {
        if (post.placeTag) {
          const place = add("button", card, "📍 " + post.placeTag, "aha-social-location");
          place.type = "button";
          place.setAttribute("aria-label", "Se bilder fra " + post.placeTag);
          place.addEventListener("click", () => {
            if (!placeSearch) return;
            placeSearch.value = post.placeTag;
            setViewMode("map");
          });
        }
        add("p", card, post.text || "", "aha-social-caption");
        add("span", card, post.instaMode === "reel" ? "Reel" : post.instaMode === "map" ? "Map" : "Feed", "aha-social-kind");
      }
      const actions = add("div", card, null, "aha-social-actions");
      const like = add("button", actions, (post.likedByMe ? "♥ Likt" : "♡ Lik") + " (" + Number(post.likeCount || 0) + ")");
      like.type = "button";
      like.addEventListener("click", () => mutate("/v1/social/posts/" + encodeURIComponent(post.id) + "/like", "POST", { liked: !post.likedByMe }, "Likerklikk oppdatert."));
      if (kind === "insta" && post.ownPost) {
        // Inline editing changes only the optional location label. It does not
        // re-upload the image, re-publish the post, or import private content.
        const editButton = add("button", actions, post.placeTag ? "Rediger stedstag" : "Legg til stedstag");
        editButton.type = "button";
        const editor = add("form", card, null, "aha-social-place-editor");
        editor.hidden = true;
        const placeLabel = add("label", editor, "Stedstag for dette bildet");
        const placeInput = add("input", placeLabel);
        placeInput.type = "text";
        placeInput.maxLength = 120;
        placeInput.value = post.placeTag || "";
        placeInput.placeholder = "Skriv et sted";
        placeInput.autocomplete = "off";
        add("p", editor, "Stedstaggen vises for andre. Bare du kan endre den.", "module-meta");
        const buttons = add("div", editor, null, "aha-social-place-editor-actions");
        const save = add("button", buttons, "Lagre stedstag");
        save.type = "submit";
        const cancel = add("button", buttons, "Avbryt");
        cancel.type = "button";
        editButton.addEventListener("click", () => {
          editor.hidden = !editor.hidden;
          editButton.setAttribute("aria-expanded", String(!editor.hidden));
          if (!editor.hidden) placeInput.focus();
        });
        editButton.setAttribute("aria-expanded", "false");
        cancel.addEventListener("click", () => { editor.hidden = true; editButton.setAttribute("aria-expanded","false"); });
        editor.addEventListener("submit", async (event) => {
          event.preventDefault();
          const tag = placeInput.value.trim();
          if (post.instaMode === "map" && !tag) {
            showStatus("Map-innlegg må ha et stedstag.");
            return;
          }
          if (tag.length > 120) { showStatus("Stedstag kan ikke være over 120 tegn."); return; }
          save.disabled = true;
          const changed = await mutate("/v1/social/posts/" + encodeURIComponent(post.id) + "/place",
            "POST", { placeTag: tag || null }, "Stedstag oppdatert.");
          if (!changed) save.disabled = false;
        });
      }
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

    function setViewMode(mode) {
      if (!["feed","reel","map"].includes(mode) || kind !== "insta") return;
      viewMode = mode;
      for (const button of viewButtons) {
        button.setAttribute("aria-pressed", String(button.dataset.view === mode));
      }
      if (placeSearch) placeSearch.parentElement.hidden = mode !== "map";
      renderList();
    }

    function renderList() {
      renderGeneration++;
      for (const release of mediaReleases) release();
      mediaReleases.clear();
      clear(list);
      const rows = cachedPosts;
      const search = (placeSearch?.value || "").trim().toLocaleLowerCase("nb-NO");
      const displayed = kind !== "insta" || viewMode === "feed" ? rows
        : viewMode === "reel" ? rows.filter(post => post.instaMode === "reel")
        : rows.filter(post => typeof post.placeTag === "string" &&
            post.placeTag.trim() && post.placeTag.toLocaleLowerCase("nb-NO").includes(search));
      if (!displayed.length) {
        add("p", list, viewMode === "map" && search
          ? "Ingen bilder funnet for dette stedet."
          : "Ingen publiserte innlegg ennå.");
      } else if (kind === "insta" && viewMode === "map") {
        // Place names are labels, not fabricated GPS points. Build a browsable
        // map-like place gallery without assuming any coordinates or location.
        const places = new Map();
        for (const post of displayed) {
          const label = post.placeTag.trim();
          const key = label.toLocaleLowerCase("nb-NO");
          if (!places.has(key)) places.set(key,{label,posts:[]});
          places.get(key).posts.push(post);
        }
        for (const group of places.values()) {
          const section = add("section", list, null, "aha-social-place-group");
          add("h3", section, "📍 " + group.label + " · " + group.posts.length + " bilder");
          const gallery = add("div", section, null, "aha-social-place-grid");
          for (const post of group.posts) renderPost(post,gallery);
        }
      } else {
        for (const post of displayed) renderPost(post);
      }
      showStatus("Viser " + displayed.length + " delte innlegg.");
    }

    async function load() {
      showStatus("Henter delte innlegg…");
      try {
        const posts = await call("/v1/social/posts?kind=" + encodeURIComponent(kind) + "&limit=30");
        cachedPosts = Array.isArray(posts) ? posts : [];
        renderList();
      } catch (error) {
        cachedPosts = [];
        renderList();
        showStatus(error.message || "Kunne ikke hente feeden.");
      }
    }

    refresh.addEventListener("click", () => load());
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const selectedFile = media?.files?.[0] || null;
      const placeTag=placeField?.value.trim()||null;
      const selectedVideo=Boolean(global.AHASocialMedia?.isReelVideo?.(selectedFile));
      if (selectedVideo && (instaMode!=="reel" ||
          !global.AHASocialMedia?.canPreviewReelVideo?.(selectedFile))) {
        showStatus("Velg Reel og en video på maks 8 MB.");
        return;
      }
      if (selectedVideo && (global.__AHA_OFFLINE_DEMO__!==true ||
          origin()!=="https://aha-social-offline-demo.invalid")) {
        showStatus("Ekte Reel-publisering er ikke aktivert. Du kan bare forhåndsvise videoen.");
        return;
      }
      if (kind === "feed" && message.value.length > 500) {
        showStatus("Feed har en grense på 500 tegn.");
        return;
      }
      if (kind === "insta" && instaMode === "map" && !placeTag) {
        showStatus("Velg et stedstag for innlegg som skal vises i Map.");
        return;
      }
      if (!consent.checked || !message.value.trim() || (media && !selectedFile)) {
        showStatus("Fyll ut innlegget, velg bilde og godkjenn offentlig publisering.");
        return;
      }
      const payload = { kind, text: message.value.trim(), publish: true };
      if (kind === "insta") {
        payload.instaMode = instaMode;
        if (placeTag) payload.placeTag = placeTag;
      }
      const signature = JSON.stringify({ kind, text: payload.text, fileVersion, instaMode, placeTag });
      if (signature !== pendingSignature) {
        pendingKey = createKey();
        pendingUploadKey = createKey();
        pendingSignature = signature;
      }
      payload.requestKey = pendingKey;
      submit.disabled = true;
      if (media) media.disabled = true;
      if (discard) discard.disabled = true;
      try {
        if (selectedFile) {
          showStatus(selectedVideo?"Legger video i den lokale demoen…":"Forbereder og laster opp bildet…");
          // Retry uses the same media reference; video is demo-only.
          if (!pendingMediaPath) {
            if (selectedVideo)
              pendingMediaPath=await global.AHASocialMedia.uploadDemoVideo(selectedFile,pendingUploadKey,origin());
            else {
              const blob=await global.AHASocialMedia.prepareImage(selectedFile);
              pendingMediaPath=await global.AHASocialMedia.upload(blob,pendingUploadKey,origin());
            }
          }
          payload.mediaUrl=pendingMediaPath;
        }
        await call("/v1/social/posts", "POST", payload);
        pendingMediaPath = null;
        message.value = "";
        if (counter) counter.textContent = "0 / 500";
        if (placeField) placeField.value = "";
        if (media) {
          media.value = "";
          if (releasePreview) releasePreview();
          releasePreview = null;
          fileVersion++;
        }
        consent.checked = false;
        pendingKey = null;
        pendingSignature = null;
        pendingUploadKey = null;
        await load();
        showStatus("Innlegget er publisert i testfeeden.");
      } catch (error) {
        showStatus(error.message || "Publiseringen feilet.");
      } finally {
        submit.disabled = false;
        if (media) media.disabled = false;
        if (discard) discard.disabled = !media?.files?.length;
      }
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
