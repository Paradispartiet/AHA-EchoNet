// Private-first picture selection for the explicit AHA Insta staging feed.
// Nothing is uploaded during file selection or preview. No local AHA data read.
(function (global) {
  "use strict";
  const MAX_BYTES = 524288;
  const MAX_DIM = 1280;
  const ACCEPT = /^image\//i;
  const VIDEO_MIMES = new Set(["video/mp4","video/webm","video/quicktime"]);
  const DEMO_MAX_VIDEO_BYTES = 8*1024*1024;
  const DEMO_ORIGIN = "https://aha-social-offline-demo.invalid";
  const URL_PATTERN = /^\/v1\/social\/media\/[0-9a-f-]{36}$/;

  function canChoose(file) {
    return Boolean(file && ACCEPT.test(String(file.type || "")) && file.size <= 25 * 1024 * 1024);
  }

  function isReelVideo(file) {
    return Boolean(file && VIDEO_MIMES.has(String(file.type || "").toLowerCase()));
  }
  function canPreviewReelVideo(file) {
    return isReelVideo(file) && file.size>=100 && file.size<=DEMO_MAX_VIDEO_BYTES;
  }
  function localVideoPreview(file, video) {
    if (!canPreviewReelVideo(file)) throw new Error("Velg MP4, MOV eller WebM på maks 8 MB.");
    const url=global.URL.createObjectURL(file);
    video.src=url;
    video.hidden=false;
    video.controls=true;
    video.playsInline=true;
    video.preload="metadata";
    return () => {
      if (video.src===url) {
        video.pause?.();
        video.removeAttribute("src");
        video.hidden=true;
        video.load?.();
      }
      global.URL.revokeObjectURL(url);
    };
  }

  function localPreview(file, image) {
    if (!canChoose(file)) throw new Error("Velg et bilde under 25 MB.");
    const local = global.URL.createObjectURL(file);
    image.src = local;
    image.hidden = false;
    // The returned callback revokes the browser-only preview; no network I/O.
    return () => {
      if (image.src === local) { image.removeAttribute("src"); image.hidden = true; }
      global.URL.revokeObjectURL(local);
    };
  }

  async function prepareImage(file) {
    if (!canChoose(file)) throw new Error("Velg et bilde under 25 MB.");
    if (!global.document || !global.Image || !global.URL?.createObjectURL) {
      throw new Error("Denne nettleseren kan ikke forberede bildeopplasting.");
    }
    const local = global.URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const frame = new global.Image();
        frame.onload = () => resolve(frame);
        frame.onerror = () => reject(new Error("Kunne ikke åpne bildet."));
        frame.src = local;
      });
      let scale = Math.min(1, MAX_DIM / Math.max(image.naturalWidth, image.naturalHeight));
      const options = [
        ["image/webp", .82, 1], ["image/webp", .65, 1],
        ["image/webp", .55, .75], ["image/webp", .50, .6],
        ["image/png", 1, .45]
      ];
      for (const [mime, quality, factor] of options) {
        const canvas = global.document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale * factor));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale * factor));
        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx) throw new Error("Nettleseren støtter ikke bildebehandling.");
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
        if (blob && ["image/webp", "image/png"].includes(blob.type) && blob.size >= 100 && blob.size <= MAX_BYTES) {
          return blob;
        }
      }
      throw new Error("Bildet er for stort. Velg et enklere bilde.");
    } finally {
      global.URL.revokeObjectURL(local);
    }
  }

  function checkedOrigin(raw) {
    // The caller must not decide where an AHA access token is sent. Match the
    // separately configured staging endpoint before even requesting a token.
    // This also rejects URL usernames, paths, protocol downgrade and redirects
    // to an alternate host. Media requests always use credentials: "omit".
    if (global.AHA_SOCIAL_STAGING_ENABLED !== true) {
      throw new Error("Bilde-API er ikke aktivert i staging.");
    }
    try {
      const configured = new URL(String(global.AHA_SOCIAL_API_ORIGIN || ""));
      const requested = new URL(String(raw || ""));
      const valid = (url) => url.protocol === "https:" && url.pathname === "/" &&
        !url.search && !url.hash && !url.username && !url.password;
      if (!valid(configured) || !valid(requested) ||
          String(raw) !== requested.origin || requested.origin !== configured.origin) {
        throw new Error("invalid_origin");
      }
      return requested.origin;
    } catch {
      throw new Error("Ugyldig eller ikke-godkjent HTTPS-adresse for AHA staging.");
    }
  }

  async function authHeaders() {
    const session = await global.AHAAuth?.getSession?.();
    if (!session?.access_token) throw new Error("Logg inn i AHA for å publisere bilder.");
    return { Authorization: "Bearer " + session.access_token };
  }

  async function upload(blob, key, origin) {
    if (!blob || blob.size > MAX_BYTES || !["image/webp", "image/png"].includes(blob.type)) {
      throw new Error("Bildet må være en liten PNG- eller WebP-fil.");
    }
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(String(key || ""))) throw new Error("Ugyldig opplastingsnøkkel.");
    const endpoint = checkedOrigin(origin);
    const headers = await authHeaders();
    headers["Content-Type"] = blob.type;
    headers["Idempotency-Key"] = key;
    const response = await global.fetch(endpoint + "/v1/social/media", {
      method: "POST", headers, body: blob, cache: "no-store", credentials: "omit"
    });
    if (!response.ok) {
      if (response.status === 503) throw new Error("Bildeopplasting er ikke aktivert i staging.");
      if (response.status === 413) throw new Error("Bildet er større enn det testmiljøet støtter.");
      if (response.status === 507) throw new Error("Testmiljøets bildelagring er full. Fjern upubliserte bilder eller kontakt testansvarlig.");
      throw new Error("Kunne ikke laste opp bildet. Prøv igjen.");
    }
    const data = (await response.json())?.data;
    if (!data || !URL_PATTERN.test(String(data.mediaUrl || ""))) {
      throw new Error("Ugyldig svar fra AHA bildelagring.");
    }
    return data.mediaUrl;
  }

  async function uploadDemoVideo(blob,key,origin) {
    // Never send video to hosted staging or production image endpoints.
    if (global.__AHA_OFFLINE_DEMO__!==true || checkedOrigin(origin)!==DEMO_ORIGIN)
      throw new Error("Videoopplasting finnes bare i den lokale demoen.");
    if (!canPreviewReelVideo(blob) || !/^[A-Za-z0-9_-]{8,100}$/.test(String(key||"")))
      throw new Error("Ugyldig lokal Reel-video eller nøkkel.");
    const headers=await authHeaders();
    headers["Content-Type"]=blob.type;
    headers["Idempotency-Key"]=key;
    const response=await global.fetch(DEMO_ORIGIN+"/v1/social/media",{
      method:"POST",headers,body:blob,cache:"no-store",credentials:"omit"
    });
    if (!response.ok) throw new Error("Lokal Reel-video kunne ikke legges inn.");
    const data=(await response.json())?.data;
    if (!data || !URL_PATTERN.test(String(data.mediaUrl||""))) throw new Error("Ugyldig lokalt Reel-svar.");
    return data.mediaUrl;
  }

  async function deletePending(path, origin) {
    if (!URL_PATTERN.test(String(path || ""))) {
      throw new Error("Ugyldig bildeadresse for sletting.");
    }
    const endpoint = checkedOrigin(origin);
    const headers = await authHeaders();
    const response = await global.fetch(endpoint + path, {
      method: "DELETE", headers, cache: "no-store", credentials: "omit"
    });
    if (!response.ok) {
      throw new Error("Kunne ikke fjerne det upubliserte bildet.");
    }
    const body = await response.json().catch(() => null);
    if (body?.data?.deleted !== true) {
      throw new Error("Slettingen ble ikke bekreftet.");
    }
    return true;
  }

  async function renderProtected(path, target, origin) {
    if (!URL_PATTERN.test(String(path || ""))) throw new Error("Ugyldig intern bildeadresse.");
    const endpoint = checkedOrigin(origin);
    const headers = await authHeaders();
    const response = await global.fetch(endpoint + path, {
      method: "GET", headers, cache: "no-store", credentials: "omit"
    });
    if (!response.ok) throw new Error("Bildet er ikke tilgjengelig.");
    const type = response.headers?.get?.("content-type")?.split(";")[0]?.trim() || "";
    const demoVideo=global.__AHA_OFFLINE_DEMO__===true && endpoint===DEMO_ORIGIN &&
      VIDEO_MIMES.has(type) && target.tagName?.toLowerCase()==="video";
    if (!demoVideo && !["image/webp","image/png"].includes(type))
      throw new Error("Ukjent eller ikke-godkjent medieformat.");
    const blob=await response.blob();
    if (demoVideo ? blob.size<100 || blob.size>DEMO_MAX_VIDEO_BYTES : !blob.size || blob.size>MAX_BYTES)
      throw new Error("Ugyldig mediestørrelse.");
    const url = global.URL.createObjectURL(blob);
    target.src = url;
    target.hidden = false;
    return () => {
      if (target.src === url) { target.removeAttribute("src"); target.hidden = true; }
      global.URL.revokeObjectURL(url);
    };
  }

  global.AHASocialMedia = Object.freeze({
    canChoose, localPreview, isReelVideo, canPreviewReelVideo, localVideoPreview,
    prepareImage, upload, uploadDemoVideo, deletePending, renderProtected, isPrivateMediaUrl: (url) => URL_PATTERN.test(String(url || ""))
  });
})(typeof window !== "undefined" ? window : globalThis);
