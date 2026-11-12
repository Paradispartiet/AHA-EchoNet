import assert from "node:assert/strict";
import test from "node:test";
import { validateSync } from "class-validator";
import { ApiException } from "../dist/api/api-exception.js";
import { CanonicalDatabaseError } from "../dist/database/database.errors.js";
import { SocialGate, SocialPostInput, SocialListQuery, SocialService, mapSocialDatabaseError } from "../dist/social/social.module.js";

const principal = Object.freeze({ subject: "verified-subject", provider: "supabase", issuer: "https://issuer.example", audience: ["aha-api"] });

class FakeRepo {
  calls = [];
  async read(p, action, values) { this.calls.push({ p, action, values }); return []; }
  async write(p, action, values) { this.calls.push({ p, action, values }); return { ok: true }; }
}

test("social API refuses default-disabled and production runtimes", () => {
  const old = { node: process.env.NODE_ENV, stage: process.env.AHA_SOCIAL_STAGING_ENABLED };
  try {
    process.env.NODE_ENV = "test";
    delete process.env.AHA_SOCIAL_STAGING_ENABLED;
    const gate = new SocialGate();
    assert.throws(() => gate.assertEnabled(), e => e instanceof ApiException && e.code === "SOCIAL_DISABLED");
    process.env.AHA_SOCIAL_STAGING_ENABLED = "true";
    gate.assertEnabled();
    process.env.NODE_ENV = "production";
    assert.throws(() => gate.assertEnabled(), e => e.code === "SOCIAL_DISABLED");
    delete process.env.NODE_ENV;
    assert.throws(() => gate.assertEnabled(), e => e.code === "SOCIAL_DISABLED");
    process.env.NODE_ENV = "other";
    assert.throws(() => gate.assertEnabled(), e => e.code === "SOCIAL_DISABLED");
  } finally {
    if (old.node === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = old.node;
    if (old.stage === undefined) delete process.env.AHA_SOCIAL_STAGING_ENABLED; else process.env.AHA_SOCIAL_STAGING_ENABLED = old.stage;
  }
});

test("social DTO rejects accidental public publication and unbounded queries", () => {
  const good = Object.assign(new SocialPostInput(), { kind: "feed", text: "En tanke", requestKey: "key-12345678", publish: true });
  assert.equal(validateSync(good).length, 0);
  const denied = Object.assign(new SocialPostInput(), { kind: "feed", text: "En tanke", requestKey: "key-12345678", publish: false });
  assert.ok(validateSync(denied).length > 0);
  const invalid = Object.assign(new SocialPostInput(), { kind: "wrong", text: "En tanke", requestKey: "key-12345678", publish: true });
  assert.ok(validateSync(invalid).length > 0);
  assert.ok(validateSync(Object.assign(new SocialListQuery(), { kind: "feed", limit: 41 })).length > 0);
});

test("publishing is explicit and media host is allowlisted before any database write", async () => {
  const repo = new FakeRepo();
  const gate = { assertEnabled() {}, assertMedia: SocialGate.prototype.assertMedia };
  const service = new SocialService(gate, repo);
  await service.publish(principal, { kind: "feed", text: "  Test ", requestKey: "key-12345678", publish: true });
  assert.deepEqual(repo.calls[0].values, ["feed", "Test", null, "key-12345678"]);
  await assert.rejects(service.publish(principal, { kind: "feed", text: "   ", requestKey: "key-12345678", publish: true }));
  await assert.rejects(service.publish(principal, { kind: "feed", text: "Test", requestKey: "key-12345678", publish: false }));
  await assert.rejects(service.publish(principal, { kind: "insta", text: "Foto", requestKey: "key-12345678", publish: true }));
  await assert.rejects(service.publish(principal, { kind: "insta", text: "Foto", mediaUrl: "https://not-approved.example/a.webp", requestKey: "key-12345678", publish: true }));
  assert.equal(repo.calls.length, 1);
});

test("Insta accepts only exact internal staging media references, never untrusted paths", async () => {
  const ref = "/v1/social/media/33333333-3333-4333-8333-333333333333";
  const repo = new FakeRepo();
  const service = new SocialService(new SocialGate(), repo);
  const oldEnv = { stage: process.env.AHA_SOCIAL_STAGING_ENABLED, node: process.env.NODE_ENV };
  try {
    process.env.NODE_ENV = "test";
    process.env.AHA_SOCIAL_STAGING_ENABLED = "true";
    const dto = Object.assign(new SocialPostInput(), {
      kind: "insta", text: "Bilde fra iPad", mediaUrl: ref,
      requestKey: "media-publish-001", publish: true
    });
    assert.equal(validateSync(dto).length, 0);
    await service.publish(principal, dto);
    assert.deepEqual(repo.calls[0].values, ["insta", "Bilde fra iPad", ref, "media-publish-001"]);

    for (const invalid of [
      "/v1/social/media/not-a-uuid",
      "/v1/social/media/" + "33333333-3333-4333-8333-333333333333" + "?secret=1",
      "/v1/social/media/33333333-3333-4333-8333-333333333333/extra",
      "//evil.example/media/33333333-3333-4333-8333-333333333333",
      "javascript:alert(1)", "http://insecure.example/photo.png"
    ]) {
      const badDto = Object.assign(new SocialPostInput(), { ...dto, mediaUrl: invalid });
      assert.ok(validateSync(badDto).length > 0, "Expected DTO rejection: " + invalid);
      await assert.rejects(service.publish(principal, badDto), e => e instanceof ApiException && e.code === "VALIDATION_FAILED");
    }
    assert.equal(repo.calls.length, 1);
  } finally {
    if (oldEnv.stage === undefined) delete process.env.AHA_SOCIAL_STAGING_ENABLED;
    else process.env.AHA_SOCIAL_STAGING_ENABLED = oldEnv.stage;
    if (oldEnv.node === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldEnv.node;
  }
});

test("interactions use fixed repository actions and verified principal", async () => {
  const repo = new FakeRepo();
  const service = new SocialService({ assertEnabled() {} }, repo);
  const id = "11111111-1111-4111-8111-111111111111";
  await service.list(principal, { kind: "feed", limit: 20 });
  await service.comments(principal, id);
  await service.like(principal, id, true);
  await service.comment(principal, id, "Svar");
  await service.report(principal, id, "spam");
  await service.remove(principal, id);
  assert.deepEqual(repo.calls.map(v => v.action), ["posts", "comments", "like", "comment", "report", "remove"]);
  assert.ok(repo.calls.every(v => v.p === principal));
});


test("social DB errors yield precise, sanitized HTTP status and unfamiliar errors remain fail-closed", () => {
  const make = (code, message) => {
    const cause = Object.assign(new Error(message), { code });
    return new CanonicalDatabaseError("DATABASE_UNAVAILABLE", cause);
  };
  for (const [pgCode, message, expectedHttp, expectedCode] of [
    ["42501", "post unavailable", 404, "NOT_FOUND"],
    ["23505", "idempotency conflict", 409, "CONFLICT"],
    ["22023", "publication rate limit", 429, "SOCIAL_RATE_LIMITED"],
    ["22023", "comment rate limit", 429, "SOCIAL_RATE_LIMITED"],
    ["22023", "invalid social publication", 400, "VALIDATION_FAILED"]
  ]) {
    assert.throws(() => mapSocialDatabaseError(make(pgCode, message)),
      e => e instanceof ApiException && e.getStatus() === expectedHttp && e.code === expectedCode);
  }
  const unknown = make("42501", "other confidential database detail");
  assert.throws(() => mapSocialDatabaseError(unknown), e => e === unknown);
});
