import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../dist/app.module.js";
import { ApiException } from "../dist/api/api-exception.js";
import { AUTH_TOKEN_VERIFIER } from "../dist/auth/auth.types.js";
import { APP_CONFIG } from "../dist/config/app-config.js";
import { configureApplication } from "../dist/bootstrap.js";
import { SocialRepository } from "../dist/social/social.module.js";
import { SocialModerationRepository } from "../dist/social/social-moderation.module.js";
import { SocialMediaRepository } from "../dist/social/social-media.module.js";

const TEST_POST_A = "11111111-1111-4111-8111-111111111111";
const TEST_POST_B = "22222222-2222-4222-8222-222222222222";
const ISSUER = "https://issuer.example";

const auth = {
  async verify(token) {
    if (!["alice", "bob", "moderator"].includes(token)) throw new Error("invalid signature");
    return { subject: token, provider: "test-provider", issuer: ISSUER, audience: ["aha-api"] };
  }
};

const config = Object.freeze({
  environment: "test",
  port: 3100,
  serviceName: "aha-nest-api",
  serviceVersion: "social-http-test",
  allowedOrigins: Object.freeze(["https://staging.example"]),
  auditHashSalt: "test-audit-salt-with-32-characters-and-more",
  auth: { issuer: ISSUER, audience: "aha-api", jwksUrl: ISSUER + "/jwks", provider: "test-provider" },
  runtimeActivated: false,
  databaseConnected: false,
  existingExpressRuntimePrimary: true
});

class MemoryModeratorRepository {
  constructor(posts, reports) {
    this.posts = posts;
    this.reports = reports;
    this.actions = [];
  }

  async queue(principal, limit) {
    if (principal.subject !== "moderator") throw new ApiException(403, "FORBIDDEN", "Moderator required");
    return this.reports.filter(r => {
      const post = this.posts.get(r.postId);
      return post && !post.deleted && !post.hidden && !r.decided;
    }).slice(0, limit).map(r => ({
      postId: r.postId, text: this.posts.get(r.postId).text, reportCount: 1, reasons: [r.reason]
    }));
  }

  async decide(principal, postId, action, note) {
    if (principal.subject !== "moderator") throw new ApiException(403, "FORBIDDEN", "Moderator required");
    const post = this.posts.get(postId);
    const reported = this.reports.filter(r => r.postId === postId && !r.decided);
    if (!post || post.deleted || post.hidden || !reported.length) throw new ApiException(409, "CONFLICT", "No open case");
    if (action === "hide") post.hidden = true;
    reported.forEach(r => { r.decided = action; });
    this.actions.push({ postId, action, note });
    return { postId, status: action === "hide" ? "hidden" : "published", auditId: "audit-" + this.actions.length };
  }
}

class MemoryMediaRepository {
  rows = new Map();
  constructor(posts) { this.posts = posts; }

  async upload(principal, mime, bytes, requestKey) {
    const old = [...this.rows.values()].find(row => row.owner === principal.subject && row.key === requestKey);
    if (old) {
      if (old.mime !== mime || !old.bytes.equals(bytes)) throw new ApiException(409, "CONFLICT", "Media changed");
      return { mediaId: old.id, mediaUrl: old.path, idempotentReplay: true };
    }
    const id = this.rows.size === 0 ? "33333333-3333-4333-8333-333333333333" : "77777777-7777-4777-8777-777777777777";
    const path = "/v1/social/media/" + id;
    this.rows.set(id, { id, path, owner: principal.subject, mime, bytes, key: requestKey });
    return { mediaId: id, mediaUrl: path, idempotentReplay: false };
  }

  async removePending(principal, id) {
    const item = this.rows.get(id);
    if (!item || item.owner !== principal.subject) {
      throw new ApiException(404, "NOT_FOUND", "Pending media not found");
    }
    const attached = [...this.posts.values()].some(post => post.mediaUrl === item.path);
    if (attached) throw new ApiException(404, "NOT_FOUND", "Media is already attached");
    this.rows.delete(id);
    return { mediaId: id, deleted: true };
  }

  async read(principal, id) {
    const item = this.rows.get(id);
    if (!item) throw new ApiException(404, "NOT_FOUND", "Media not found");
    const published = [...this.posts.values()].some(post =>
      post.mediaUrl === item.path && !post.deleted && !post.hidden
    );
    if (!published && item.owner !== principal.subject) {
      throw new ApiException(404, "NOT_FOUND", "Media not available");
    }
    return { contentType: item.mime, bytes: item.bytes };
  }
}

function tinyPng() {
  const bytes = Buffer.alloc(108);
  Buffer.from("89504e470d0a1a0a","hex").copy(bytes);
  bytes.write("IHDR",12,"ascii");
  bytes.writeUInt32BE(8,16);
  bytes.writeUInt32BE(8,20);
  return bytes;
}

class MemorySocialRepository {
  posts = new Map();
  likes = new Set();
  comments = [];
  reports = [];

  async read(principal, action, params) {
    if (action === "posts") {
      const [kind, limit] = params;
      return [...this.posts.values()].filter(p => p.kind === kind && !p.deleted && !p.hidden).slice(0, limit).map(p => ({
        id: p.id,
        kind: p.kind,
        text: p.text,
        mediaUrl: p.mediaUrl,
        authorName: p.owner,
        ownPost: p.owner === principal.subject,
        likeCount: [...this.likes].filter(x => x.endsWith(":" + p.id)).length,
        commentCount: this.comments.filter(c => c.postId === p.id).length,
        likedByMe: this.likes.has(principal.subject + ":" + p.id)
      }));
    }
    if (action === "comments") {
      return this.comments.filter(c => c.postId === params[0]).map(c => ({
        id: c.id, text: c.text, authorName: c.owner, ownComment: c.owner === principal.subject
      }));
    }
    throw new Error("Unexpected read");
  }

  async write(principal, action, params) {
    const owner = principal.subject;
    if (action === "publish") {
      const [kind, text, mediaUrl, key] = params;
      const existing = [...this.posts.values()].find(p => p.owner === owner && p.key === key);
      if (existing) return { id: existing.id, status: "published", idempotentReplay: true };
      const id = this.posts.size ? TEST_POST_B : TEST_POST_A;
      this.posts.set(id, { id, owner, kind, text, mediaUrl, key, deleted: false });
      return { id, status: "published", idempotentReplay: false };
    }
    const post = this.posts.get(params[0]);
    if (!post || post.deleted) throw new ApiException(404, "NOT_FOUND", "Post not available");
    if (action === "remove") {
      if (post.owner !== owner) throw new ApiException(403, "FORBIDDEN", "Cannot delete another account's post");
      post.deleted = true;
      return { deleted: true };
    }
    if (action === "like") {
      const key = owner + ":" + post.id;
      if (params[1]) this.likes.add(key);
      else this.likes.delete(key);
      return { liked: Boolean(params[1]) };
    }
    if (action === "comment") {
      const id = "comment-" + (this.comments.length + 1);
      this.comments.push({ id, owner, postId: post.id, text: params[1] });
      return { id, created: true };
    }
    if (action === "report") {
      this.reports.push({ owner, postId: post.id, reason: params[1] });
      return { reported: true };
    }
    throw new Error("Unexpected action");
  }
}

const prevEnv = { node: process.env.NODE_ENV, gate: process.env.AHA_SOCIAL_STAGING_ENABLED, media: process.env.AHA_SOCIAL_MEDIA_ORIGINS };
let app;
const memory = new MemorySocialRepository();
const moderatorMemory = new MemoryModeratorRepository(memory.posts, memory.reports);
const mediaMemory = new MemoryMediaRepository(memory.posts);

before(async () => {
  process.env.NODE_ENV = "test";
  process.env.AHA_SOCIAL_STAGING_ENABLED = "true";
  process.env.AHA_SOCIAL_MEDIA_ORIGINS = "https://images.example";
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(APP_CONFIG).useValue(config)
    .overrideProvider(AUTH_TOKEN_VERIFIER).useValue(auth)
    .overrideProvider(SocialRepository).useValue(memory)
    .overrideProvider(SocialModerationRepository).useValue(moderatorMemory)
    .overrideProvider(SocialMediaRepository).useValue(mediaMemory)
    .compile();
  app = module.createNestApplication();
  configureApplication(app, config);
  await app.init();
});

after(async () => {
  if (app) await app.close();
  for (const [key, old] of [
    ["NODE_ENV", prevEnv.node],
    ["AHA_SOCIAL_STAGING_ENABLED", prevEnv.gate],
    ["AHA_SOCIAL_MEDIA_ORIGINS", prevEnv.media]
  ]) {
    if (old === undefined) delete process.env[key];
    else process.env[key] = old;
  }
});

test("social HTTP is authenticated and rejects implicit publication", async () => {
  await request(app.getHttpServer()).get("/v1/social/posts?kind=feed").expect(401);
  await request(app.getHttpServer()).get("/v1/social/posts?kind=feed").set("Authorization", "Bearer fake").expect(401);
  await request(app.getHttpServer()).get("/v1/social/posts?kind=invalid").set("Authorization", "Bearer alice").expect(400);
  await request(app.getHttpServer()).get("/v1/social/posts?kind=feed&limit=41").set("Authorization", "Bearer alice").expect(400);
  await request(app.getHttpServer()).post("/v1/social/posts").set("Authorization", "Bearer alice")
    .send({kind:"feed",text:"Privat utkast",requestKey:"test-draft-key-1"}).expect(400);
  assert.equal(memory.posts.size, 0);
});

test("Alice publishes and Bob reads, likes, comments and reports but cannot remove Alice's post", async () => {
  const published = await request(app.getHttpServer()).post("/v1/social/posts").set("Authorization", "Bearer alice")
    .send({ kind:"feed", text:"Hei fra Alice",requestKey:"test-alice-feed-1", publish:true }).expect(201);
  assert.equal(published.body.data.id, TEST_POST_A);

  const fromBob = await request(app.getHttpServer()).get("/v1/social/posts?kind=feed")
    .set("Authorization", "Bearer bob").expect(200);
  assert.equal(fromBob.body.data.length,1);
  assert.equal(fromBob.body.data[0].ownPost,false);
  await request(app.getHttpServer()).delete("/v1/social/posts/"+TEST_POST_A)
    .set("Authorization","Bearer bob").expect(403);

  await request(app.getHttpServer()).post("/v1/social/posts/"+TEST_POST_A+"/like")
    .set("Authorization", "Bearer bob").send({liked:true}).expect(201);
  await request(app.getHttpServer()).post("/v1/social/posts/"+TEST_POST_A+"/comments")
    .set("Authorization", "Bearer bob").send({text:"Hei tilbake"}).expect(201);
  await request(app.getHttpServer()).post("/v1/social/posts/"+TEST_POST_A+"/reports")
    .set("Authorization", "Bearer bob").send({reason:"privacy"}).expect(201);
  const afterActivity = await request(app.getHttpServer()).get("/v1/social/posts?kind=feed")
    .set("Authorization", "Bearer alice").expect(200);
  assert.equal(afterActivity.body.data[0].likeCount,1);
  assert.equal(afterActivity.body.data[0].commentCount,1);
  assert.equal(afterActivity.body.data[0].ownPost,true);
  assert.equal(memory.reports.length,1);
});

test("Insta requires approved media host; Bob publishes and Alice sees it", async () => {
  await request(app.getHttpServer()).post("/v1/social/posts").set("Authorization", "Bearer bob")
    .send({kind:"insta",text:"Bilde",requestKey:"test-bob-insta-1",publish:true}).expect(400);
  await request(app.getHttpServer()).post("/v1/social/posts").set("Authorization", "Bearer bob")
    .send({kind:"insta",text:"Bilde",mediaUrl:"https://wrong.example/photo.webp",requestKey:"test-bob-insta-1",publish:true}).expect(400);
  const published = await request(app.getHttpServer()).post("/v1/social/posts").set("Authorization", "Bearer bob")
    .send({kind:"insta",text:"Bilde",mediaUrl:"https://images.example/photo.webp",requestKey:"test-bob-insta-1",publish:true}).expect(201);
  assert.equal(published.body.data.id,TEST_POST_B);
  const fromAlice = await request(app.getHttpServer()).get("/v1/social/posts?kind=insta")
    .set("Authorization", "Bearer alice").expect(200);
  assert.equal(fromAlice.body.data[0].mediaUrl,"https://images.example/photo.webp");
  assert.equal(fromAlice.body.data[0].ownPost,false);

  await request(app.getHttpServer()).delete("/v1/social/posts/"+TEST_POST_A)
    .set("Authorization","Bearer alice").expect(200);
  const nowFeed = await request(app.getHttpServer()).get("/v1/social/posts?kind=feed")
    .set("Authorization","Bearer bob").expect(200);
  assert.equal(nowFeed.body.data.length,0);
});



test("binary staging upload stays private until an explicit Insta post references it", async () => {
  const raw = tinyPng();
  await request(app.getHttpServer()).post("/v1/social/media")
    .set("Content-Type","image/png").set("Idempotency-Key","binary-upload-001")
    .send(raw).expect(401);
  const uploaded = await request(app.getHttpServer()).post("/v1/social/media")
    .set("Authorization","Bearer bob")
    .set("Content-Type","image/png").set("Idempotency-Key","binary-upload-001")
    .send(raw).expect(201);
  const mediaId = uploaded.body.data.mediaId;
  assert.equal(mediaId,"33333333-3333-4333-8333-333333333333");
  assert.equal(uploaded.body.data.mediaUrl,"/v1/social/media/" + mediaId);
  assert.equal(mediaMemory.rows.get(mediaId).bytes.length,raw.length);

  await request(app.getHttpServer()).get("/v1/social/media/" + mediaId)
    .set("Authorization","Bearer alice").expect(404);
  await request(app.getHttpServer()).get("/v1/social/media/" + mediaId)
    .set("Authorization","Bearer bob").expect(200).expect("Cache-Control","private, no-store")
    .expect("X-Content-Type-Options","nosniff")
    .expect(({ body }) => assert.equal(body.length,108));

  await request(app.getHttpServer()).post("/v1/social/media")
    .set("Authorization","Bearer bob")
    .set("Content-Type","image/png").set("Idempotency-Key","binary-upload-002")
    .send(Buffer.alloc(600000)).expect(413);

  // Use the actual POST endpoint with the upload's internal media URL.
  // The PostgreSQL integration rehearsal independently proves that the
  // profile must own the attachment when the post is committed.
  const published = await request(app.getHttpServer()).post("/v1/social/posts")
    .set("Authorization", "Bearer bob")
    .send({
      kind: "insta", text: "Uploaded from iPad",
      mediaUrl: uploaded.body.data.mediaUrl,
      requestKey: "test-bob-uploaded-insta-1", publish: true
    }).expect(201);
  assert.equal(published.body.data.id, TEST_POST_B);

  const fromAlice = await request(app.getHttpServer()).get("/v1/social/posts?kind=insta")
    .set("Authorization", "Bearer alice").expect(200);
  assert.equal(fromAlice.body.data[0].mediaUrl, uploaded.body.data.mediaUrl);
  assert.equal(fromAlice.body.data[0].ownPost, false);
  // An attached media object must not be individually deleted, even by
  // its author. Remove the post first via the separate post lifecycle.
  await request(app.getHttpServer()).delete("/v1/social/media/" + mediaId)
    .set("Authorization", "Bearer bob").expect(404);
  await request(app.getHttpServer()).get("/v1/social/media/" + mediaId)
    .set("Authorization", "Bearer alice").expect(200);
});


test("unpublished media can be discarded only by its owner", async () => {
  const uploaded = await request(app.getHttpServer()).post("/v1/social/media")
    .set("Authorization", "Bearer alice")
    .set("Content-Type", "image/png")
    .set("Idempotency-Key", "owner-cancel-image-1")
    .send(tinyPng()).expect(201);
  const id = uploaded.body.data.mediaId;
  assert.equal(id, "77777777-7777-4777-8777-777777777777");
  await request(app.getHttpServer()).delete("/v1/social/media/" + id)
    .set("Authorization", "Bearer bob").expect(404);
  await request(app.getHttpServer()).get("/v1/social/media/" + id)
    .set("Authorization", "Bearer alice").expect(200);
  await request(app.getHttpServer()).delete("/v1/social/media/" + id)
    .set("Authorization", "Bearer alice").expect(200)
    .expect(({ body }) => assert.equal(body.data.deleted, true));
  await request(app.getHttpServer()).get("/v1/social/media/" + id)
    .set("Authorization", "Bearer alice").expect(404);
});

test("moderation HTTP rejects normal users and hides reported content after audited decision", async () => {
  const instaId = TEST_POST_B;
  await request(app.getHttpServer()).post("/v1/social/posts/" + instaId + "/reports")
    .set("Authorization", "Bearer alice").send({ reason: "spam" }).expect(201);

  await request(app.getHttpServer()).get("/v1/social/moderation/reports")
    .set("Authorization", "Bearer alice").expect(403);
  await request(app.getHttpServer()).post("/v1/social/moderation/posts/" + instaId + "/decision")
    .set("Authorization", "Bearer alice")
    .send({ action: "hide", note: "Unauthorized operator" }).expect(403);

  const queue = await request(app.getHttpServer()).get("/v1/social/moderation/reports?limit=10")
    .set("Authorization", "Bearer moderator").expect(200);
  assert.equal(queue.body.data.length, 1);
  assert.equal(queue.body.data[0].postId, instaId);

  await request(app.getHttpServer()).post("/v1/social/moderation/posts/" + instaId + "/decision")
    .set("Authorization", "Bearer moderator")
    .send({ action: "hide", note: "  Documented policy breach  " }).expect(201)
    .expect(({ body }) => {
      assert.equal(body.data.status, "hidden");
      assert.ok(body.data.auditId);
    });

  const after = await request(app.getHttpServer()).get("/v1/social/posts?kind=insta")
    .set("Authorization", "Bearer bob").expect(200);
  assert.equal(after.body.data.length, 0);
  assert.deepEqual(moderatorMemory.actions.map(a => a.note), ["Documented policy breach"]);
});
