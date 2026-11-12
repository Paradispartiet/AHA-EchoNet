const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.resolve(__dirname, "../js/ahaSocialMedia.js"), "utf8");

function loadWindow(overrides = {}) {
  const activity = { urls: [], revoked: [], uploads: [] };
  const url = {
    createObjectURL(file) {
      const key = "blob:aha-staging-" + (activity.urls.length + 1);
      activity.urls.push({ key, file });
      return key;
    },
    revokeObjectURL(key) { activity.revoked.push(key); }
  };
  const win = {
    URL: url,
    document: null,
    fetch: () => { throw new Error("network-not-permitted"); },
    ...overrides
  };
  vm.runInNewContext(source, { window: win, console, URL, Promise, Buffer });
  return { api: win.AHASocialMedia, win, activity };
}

test("choosing a picture shows a local-only preview and releases blob URL", () => {
  let networkCalls = 0;
  const { api, activity } = loadWindow({ fetch: () => { networkCalls++; } });
  const file = { type: "image/jpeg", size: 5000 };
  assert.equal(api.canChoose(file), true);
  assert.equal(api.canChoose({ type: "video/mp4", size: 5000 }), false);
  assert.equal(api.canChoose({ type: "image/heic", size: 28 * 1024 * 1024 }), false);

  const preview = {
    src: "",
    hidden: true,
    removeAttribute(name) { if (name === "src") this.src = ""; }
  };
  const release = api.localPreview(file, preview);
  assert.equal(preview.hidden, false);
  assert.match(preview.src, /^blob:aha-staging-/);
  assert.equal(networkCalls, 0);
  release();
  assert.equal(preview.hidden, true);
  assert.equal(activity.revoked.length, 1);
});

test("canvas converts camera file to a resized, non-original WebP before any network upload", async () => {
  let uploads = 0;
  let drawn = false;
  const win = {
    document: {
      createElement(kind) {
        assert.equal(kind, "canvas");
        return {
          width: 0, height: 0,
          getContext() {
            return { drawImage(_image, _x, _y, width, height) {
              drawn = true;
              assert.equal(width, 1280);
              assert.equal(height, 960);
            } };
          },
          toBlob(callback, type) { callback(new Blob([Buffer.alloc(2048)], { type })); }
        };
      }
    },
    Image: class {
      naturalWidth = 4000;
      naturalHeight = 3000;
      set src(_value) { Promise.resolve().then(() => this.onload()); }
    },
    fetch: () => { uploads++; }
  };
  const { api, activity } = loadWindow(win);
  const original = { type: "image/jpeg", size: 9 * 1024 * 1024 };
  const prepared = await api.prepareImage(original);
  assert.equal(prepared.type, "image/webp");
  assert.equal(prepared.size, 2048);
  assert.equal(drawn, true);
  assert.equal(uploads, 0);
  assert.equal(activity.revoked.length, 1);
});

test("upload transmits only the converted image under authenticated, explicit action", async () => {
  const blob = new Blob([Buffer.alloc(2048)], { type: "image/webp" });
  const calls = [];
  const { api } = loadWindow({
    AHAAuth: { async getSession() { return { access_token: "verified-jwt" }; } },
    async fetch(url, opts) {
      calls.push({ url, opts });
      return {
        ok: true,
        async json() { return { data: { mediaUrl: "/v1/social/media/11111111-1111-4111-8111-111111111111" } }; }
      };
    }
  });
  await assert.rejects(api.upload(blob, "bad", "https://staging.example"), /nøkkel/);
  assert.equal(calls.length, 0);
  const path = await api.upload(blob, "stable-upload-key-1", "https://staging.example");
  assert.equal(path, "/v1/social/media/11111111-1111-4111-8111-111111111111");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://staging.example/v1/social/media");
  assert.equal(calls[0].opts.method, "POST");
  assert.equal(calls[0].opts.headers.Authorization, "Bearer verified-jwt");
  assert.equal(calls[0].opts.headers["Content-Type"], "image/webp");
  assert.equal(calls[0].opts.headers["Idempotency-Key"], "stable-upload-key-1");
  assert.equal(calls[0].opts.body, blob);
  assert.equal(calls[0].opts.credentials, "omit");
});

test("published media is fetched with bearer auth and rendered through a temporary blob URL", async () => {
  let receivedHeader;
  const { api, activity } = loadWindow({
    AHAAuth: { async getSession() { return { access_token: "jwt-b" }; } },
    async fetch(url, opts) {
      assert.equal(url, "https://staging.example/v1/social/media/11111111-1111-4111-8111-111111111111");
      receivedHeader = opts.headers.Authorization;
      return {
        ok: true,
        headers: { get(name) { return name === "content-type" ? "image/webp" : null; } },
        async blob() { return new Blob([Buffer.alloc(150)], { type: "image/webp" }); }
      };
    }
  });
  const preview = { src: "", hidden: true, removeAttribute(name) { if(name==="src")this.src=""; } };
  const release = await api.renderProtected("/v1/social/media/11111111-1111-4111-8111-111111111111",preview,"https://staging.example");
  assert.equal(receivedHeader,"Bearer jwt-b");
  assert.match(preview.src,/^blob:aha-staging-/);
  release();
  assert.equal(activity.revoked.length,1);
});


test("discarding uploaded-but-unpublished media requires bearer auth and exact private path", async () => {
  const calls = [];
  const { api } = loadWindow({
    AHAAuth: { async getSession() { return { access_token: "verified-jwt" }; } },
    async fetch(url, opts) {
      calls.push({ url, opts });
      return { ok: true, async json() { return { data: { deleted: true } }; } };
    }
  });
  await assert.rejects(api.deletePending("https://evil.example/m", "https://staging.example"), /Ugyldig/);
  await assert.rejects(api.deletePending("/v1/social/media/not-a-uuid", "https://staging.example"), /Ugyldig/);
  assert.equal(calls.length, 0);
  const id = "/v1/social/media/33333333-3333-4333-8333-333333333333";
  assert.equal(await api.deletePending(id, "https://staging.example"), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://staging.example" + id);
  assert.equal(calls[0].opts.method, "DELETE");
  assert.equal(calls[0].opts.headers.Authorization, "Bearer verified-jwt");
  assert.equal(calls[0].opts.credentials, "omit");
});
