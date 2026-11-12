// Private-first picture selection for the explicit AHA Insta staging feed.
// Nothing is uploaded during file selection or preview. No local AHA data read.
(function (global) {
  "use strict";
  const MAX_BYTES = 524288;
  const MAX_DIM = 1280;
  const ACCEPT = /^image\//i;
  const URL_PATTERN = /^\/v1\/social\/media\/[0-9a-f-]{36}$/;

  function canChoose(file) {
    return Boolean(file && ACCEPT.test(String(file.type || "")) && file.size <= 25 * 1024 * 1024);
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
    const headers = await authHeaders();
    headers["Content-Type"] = blob.type;
    headers["Idempotency-Key"] = key;
    const response = await global.fetch(origin + "/v1/social/media", {
      method: "POST", headers, body: blob, cache: "no-store", credentials: "omit"
    });
    if (!response.ok) {
      if (response.status === 503) throw new Error("Bildeopplasting er ikke aktivert i staging.");
      if (response.status === 413) throw new Error("Bildet er større enn det testmiljøet støtter.");
      throw new Error("Kunne ikke laste opp bildet. Prøv igjen.");
    }
    const data = (await response.json())?.data;
    if (!data || !URL_PATTERN.test(String(data.mediaUrl || ""))) {
      throw new Error("Ugyldig svar fra AHA bildelagring.");
    }
    return data.mediaUrl;
  }

  async function deletePending(path, origin) {
    if (!URL_PATTERN.test(String(path || ""))) {
      throw new Error("Ugyldig bildeadresse for sletting.");
    }
    const headers = await authHeaders();
    const response = await global.fetch(origin + path, {
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
    const headers = await authHeaders();
    const response = await global.fetch(origin + path, {
      method: "GET", headers, cache: "no-store", credentials: "omit"
    });
    if (!response.ok) throw new Error("Bildet er ikke tilgjengelig.");
    const type = response.headers?.get?.("content-type")?.split(";")[0]?.trim() || "";
    if (!["image/webp", "image/png"].includes(type)) throw new Error("Ukjent bildeformat.");
    const blob = await response.blob();
    if (blob.size > MAX_BYTES || !blob.size) throw new Error("Ugyldig bildestørrelse.");
    const url = global.URL.createObjectURL(blob);
    target.src = url;
    target.hidden = false;
    return () => {
      if (target.src === url) { target.removeAttribute("src"); target.hidden = true; }
      global.URL.revokeObjectURL(url);
    };
  }

  global.AHASocialMedia = Object.freeze({
    canChoose, localPreview, prepareImage, upload, deletePending, renderProtected, isPrivateMediaUrl: (url) => URL_PATTERN.test(String(url || ""))
  });
})(typeof window !== "undefined" ? window : globalThis);
