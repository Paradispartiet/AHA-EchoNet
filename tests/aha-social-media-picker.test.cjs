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
    AHA_SOCIAL_STAGING_ENABLED: true,
    AHA_SOCIAL_API_ORIGIN: "https://staging.example",
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


test("private media helper refuses unconfigured or mismatched origins before reading AHA token", async () => {
  const path = "/v1/social/media/33333333-3333-4333-8333-333333333333";
  const blob = new Blob([Buffer.alloc(200)], { type: "image/png" });
  const invalid = [
    "", "http://staging.example", "https://staging.example.evil.example",
    "https://other.example", "https://alice@staging.example",
    "https://staging.example/path", "https://staging.example?x=1",
    "https://staging.example#fragment", "https://staging.example/"
  ];
  let accessTokenReads = 0, networkCalls = 0;
  const { api, win } = loadWindow({
    AHAAuth: { async getSession() {
      accessTokenReads++;
      return { access_token: "private-token" };
    } },
    fetch() { networkCalls++; throw new Error("unexpected-network"); }
  });
  const image = { src: "", hidden: true };
  for (const origin of invalid) {
    await assert.rejects(api.upload(blob, "staging-upload-key-1", origin), /HTTPS-adresse/);
    await assert.rejects(api.renderProtected(path, image, origin), /HTTPS-adresse/);
    await assert.rejects(api.deletePending(path, origin), /HTTPS-adresse/);
  }
  assert.equal(accessTokenReads, 0);
  assert.equal(networkCalls, 0);

  win.AHA_SOCIAL_STAGING_ENABLED = false;
  await assert.rejects(api.upload(blob, "staging-upload-key-1", "https://staging.example"), /ikke aktivert/);
  assert.equal(accessTokenReads, 0);

  win.AHA_SOCIAL_STAGING_ENABLED = true;
  win.AHA_SOCIAL_API_ORIGIN = "http://staging.example";
  await assert.rejects(api.deletePending(path, "https://staging.example"), /HTTPS-adresse/);
  assert.equal(accessTokenReads, 0);
  assert.equal(networkCalls, 0);
});


test("Reel video local preview is limited, never uploads and releases its blob URL",()=>{
 let requests=0;
 const {api,activity}=loadWindow({fetch(){requests++;}});
 const file={type:"video/mp4",size:2048};
 assert.equal(api.isReelVideo(file),true);
 assert.equal(api.canPreviewReelVideo(file),true);
 assert.equal(api.canPreviewReelVideo({type:"video/mp4",size:8*1024*1024+1}),false);
 assert.equal(api.isReelVideo({type:"image/png",size:2048}),false);
 const video={tagName:"VIDEO",src:"",hidden:true,controls:false,paused:false,
   pause(){this.paused=true;},load(){},removeAttribute(name){if(name==="src")this.src="";}};
 const release=api.localVideoPreview(file,video);
 assert.match(video.src,/^blob:aha-staging-/);
 assert.equal(video.hidden,false);
 assert.equal(video.controls,true);
 assert.equal(requests,0);
 release();
 assert.equal(video.hidden,true);
 assert.equal(video.paused,true);
 assert.equal(activity.revoked.length,1);
 assert.equal(requests,0);
 assert.throws(()=>api.localVideoPreview({type:"video/avi",size:1000},video),/MP4/);
});

test("Reel video cannot be sent to real staging even when demo marker is spoofed",async()=>{
 let tokenReads=0,network=0;
 const {api}=loadWindow({
  __AHA_OFFLINE_DEMO__:true,
  AHAAuth:{async getSession(){tokenReads++;return {access_token:"token"};}},
  fetch(){network++;throw Error("leak");}
 });
 const clip=new Blob([Buffer.alloc(256)],{type:"video/mp4"});
 await assert.rejects(api.uploadDemoVideo(clip,"test-reel-video-001","https://staging.example"),/demoen/);
 assert.equal(tokenReads,0);
 assert.equal(network,0);
 await assert.rejects(api.upload(clip,"test-reel-video-001","https://staging.example"),/PNG|WebP/);
 assert.equal(tokenReads,0);
 assert.equal(network,0);
});

test("offline Reel video mock sends a private Blob only to the exact fictional origin",async()=>{
 const clip=new Blob([Buffer.alloc(256)],{type:"video/webm"});
 const calls=[];
 const origin="https://aha-social-offline-demo.invalid";
 const {api}=loadWindow({
  AHA_SOCIAL_API_ORIGIN:origin,
  __AHA_OFFLINE_DEMO__:true,
  AHAAuth:{async getSession(){return {access_token:"fictional-a"};}},
  async fetch(url,opts){calls.push({url,opts});return {
    ok:true,async json(){return {data:{mediaUrl:"/v1/social/media/33333333-3333-4333-8333-333333333333"}};}
  }; }
 });
 const path=await api.uploadDemoVideo(clip,"test-reel-video-001",origin);
 assert.equal(path,"/v1/social/media/33333333-3333-4333-8333-333333333333");
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,origin+"/v1/social/media");
 assert.equal(calls[0].opts.headers.Authorization,"Bearer fictional-a");
 assert.equal(calls[0].opts.body,clip);
 assert.equal(calls[0].opts.credentials,"omit");
});
