const { test, expect } = require("@playwright/test");

// This is an offline browser contract test. Requests to the social staging API
// are intercepted in the browser. No user credentials, hosted DB, or cloud
// storage is used.
test("AHA Insta keeps image private until consent and shows published media to another account", async ({ page }) => {
  const apiOrigin = "https://social-staging.invalid";
  const mediaId = "33333333-3333-4333-8333-333333333333";
  const mediaPath = "/v1/social/media/" + mediaId;
  const posts = [];
  const calls = { uploads: 0, publishes: 0 };
  let originalPng;
  let generatedPng;

  await page.addInitScript(({ origin }) => {
    window.AHA_SOCIAL_STAGING_ENABLED = true;
    window.AHA_SOCIAL_API_ORIGIN = origin;
    window.__AHA_SOCIAL_BROWSER_ACCOUNT = "account-a";
  }, { origin: apiOrigin });

  // The real app's authentication is deliberately replaced ONLY in this
  // test. All social UI code stays real and still requests a bearer token.
  await page.route("**/js/ahaAuth.js", route => route.fulfill({
    status: 200,
    contentType: "application/javascript",
    body: "window.AHAAuth = {isReady:()=>true,getSession:async()=>({access_token:window.__AHA_SOCIAL_BROWSER_ACCOUNT}),getUser:async()=>({id:window.__AHA_SOCIAL_BROWSER_ACCOUNT}),getProfileId:async()=>window.__AHA_SOCIAL_BROWSER_ACCOUNT,ensureProfile:async()=>({ok:false}),bindAuthPanel:()=>{},renderAuthStatus:async()=>{},signOut:async()=>({ok:true})};"
  }));
  await page.route("https://cdn.jsdelivr.net/**", route => route.fulfill({
    status: 200, contentType: "application/javascript", body: ""
  }));

  await page.route(apiOrigin + "/**", async route => {
    const req = route.request();
    const target = new URL(req.url());
    const headers = {
      "access-control-allow-origin": "http://127.0.0.1:4177",
      "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
      "access-control-allow-headers": "authorization,content-type,idempotency-key,cache-control,pragma",
      "cache-control": "no-store"
    };
    const json = (data, status = 200) => route.fulfill({
      status, headers, contentType: "application/json", body: JSON.stringify({ data })
    });
    if (req.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers });
      return;
    }
    const user = req.headers().authorization?.replace(/^Bearer /, "") || "";
    if (!["account-a", "account-b"].includes(user)) {
      await route.fulfill({ status: 401, headers });
      return;
    }
    if (target.pathname === "/v1/social/posts" && req.method() === "GET") {
      await json(posts.map(p => ({
        ...p, ownPost: p.author === user, authorName: "Prøvekonto A",
        likedByMe: false, likeCount: 0, commentCount: 0
      })));
      return;
    }
    if (target.pathname === "/v1/social/media" && req.method() === "POST") {
      calls.uploads++;
      expect(req.headers()["idempotency-key"]).toBeTruthy();
      expect(["image/png", "image/webp"]).toContain(req.headers()["content-type"]);
      // Playwright's WebKit routing layer sometimes exposes Blob uploads
      // without postDataBuffer(), even though the request is a POST with the
      // correct content type and explicit idempotency key. Chromium must
      // still expose real bytes; the NestJS HTTP regression separately
      // verifies uploaded body bytes and server-side validation.
      const payload = req.postDataBuffer();
      if (payload === null) {
        expect(test.info().project.name).toBe("ipad-webkit");
        expect(generatedPng?.length).toBeGreaterThan(99);
        originalPng = generatedPng; // response fixture only, not a body assertion
      } else {
        expect(payload.length).toBeGreaterThan(99);
        expect(payload.length).toBeLessThanOrEqual(524288);
        originalPng = payload;
      }
      await json({ mediaId, mediaUrl: mediaPath, idempotentReplay: false }, 201);
      return;
    }
    if (target.pathname === "/v1/social/posts" && req.method() === "POST") {
      calls.publishes++;
      const input = req.postDataJSON();
      expect(input.publish).toBe(true);
      expect(input.kind).toBe("insta");
      expect(input.mediaUrl).toBe(mediaPath);
      expect(calls.uploads).toBe(1);
      const post = {
        id: "22222222-2222-4222-8222-222222222222",
        author: user, kind: input.kind, text: input.text,
        mediaUrl: mediaPath, createdAt: "2026-11-12T08:00:00.000Z"
      };
      posts.push(post);
      await json({ id: post.id, status: "published", idempotentReplay: false }, 201);
      return;
    }
    if (target.pathname === mediaPath && req.method() === "GET") {
      if (!posts.length && user !== "account-a") {
        await route.fulfill({ status: 404, headers });
        return;
      }
      if (!originalPng) {
        await route.fulfill({ status: 404, headers });
        return;
      }
      await route.fulfill({
        status: 200, headers, contentType: "image/png", body: originalPng
      });
      return;
    }
    await route.fulfill({ status: 404, headers });
  });

  await page.goto("/insta.html", { waitUntil: "domcontentloaded" });
  const social = page.locator("#aha-social-mount .aha-social-panel");
  await expect(social.getByRole("heading", { name: "Delte bilder og videoer" })).toBeVisible();
  const preview = social.getByAltText("Lokal forhåndsvisning av bildet");
  await expect(preview).toBeHidden();

  // Generate a genuine PNG inside the browser to avoid checked-in image
  // fixtures and to exercise actual HTML file-picker/Canvas behavior on iPad.
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 140;
    canvas.height = 96;
    const ctx = canvas.getContext("2d");
    for (let x = 0; x < canvas.width; x += 5) {
      ctx.fillStyle = x % 10 ? "#2851a2" : "#e4a222";
      ctx.fillRect(x, 0, 5, canvas.height);
    }
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    return Array.from(new Uint8Array(await blob.arrayBuffer()));
  });
  expect(bytes.length).toBeGreaterThan(100);
  generatedPng = Buffer.from(bytes);
  await social.locator('input[type="file"]').setInputFiles({
    name: "photo.png", mimeType: "image/png", buffer: Buffer.from(bytes)
  });
  await expect(preview).toBeVisible();
  expect(calls.uploads).toBe(0);
  expect(calls.publishes).toBe(0);
  await social.getByRole("button", { name: "Fjern valgt bilde" }).click();
  await expect(preview).toBeHidden();
  expect(calls.uploads).toBe(0);
  await social.locator('input[type="file"]').setInputFiles({
    name: "photo.png", mimeType: "image/png", buffer: Buffer.from(bytes)
  });
  await expect(preview).toBeVisible();
  await social.locator("textarea").first().fill("Mitt første delte bilde");
  await social.getByRole("checkbox").check();
  expect(calls.uploads).toBe(0);

  await social.getByRole("button", { name: "Publiser i AHA Insta" }).click();
  await expect(social.locator(".aha-social-status")).toContainText("publisert i testfeeden");
  expect(calls.uploads).toBe(1);
  expect(calls.publishes).toBe(1);
  await expect(social.locator(".aha-social-post")).toContainText("Mitt første delte bilde");
  await expect(social.locator(".aha-social-post img")).toHaveAttribute("src", /^blob:/);

  // Second signed-in test account sees the same published item.
  await page.evaluate(() => { window.__AHA_SOCIAL_BROWSER_ACCOUNT = "account-b"; });
  await social.getByRole("button", { name: "Oppdater delte innlegg" }).click();
  await expect(social.locator(".aha-social-post")).toContainText("Mitt første delte bilde");
  // Report is deliberately under the small contextual menu; the visitor
  // must never receive an owner-only delete or place editing command.
  await expect(social.getByRole("button", { name: "Rapporter" })).toHaveCount(0);
  await expect(social.getByRole("button", { name: "Slett" })).toHaveCount(0);
  await social.locator(".aha-social-post .aha-social-more summary").click();
  await expect(social.getByRole("button", { name: "Rapporter" })).toBeVisible();
  await expect(social.getByRole("button", { name: "Slett" })).toHaveCount(0);
  await expect(social.getByRole("button", { name: "Rediger stedstag" })).toHaveCount(0);
  await expect(social.locator(".aha-social-post img")).toHaveAttribute("src", /^blob:/);

  expect(posts).toHaveLength(1);
  expect(posts[0].author).toBe("account-a");
});

test("Feed and Insta default to private UI without staging configuration", async ({ page }) => {
  for (const file of ["feed.html", "insta.html"]) {
    await page.goto("/" + file, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#aha-social-mount")).toBeEmpty();
    await expect(page.locator(".aha-personal-trust")).toContainText("Ikke publisert eksternt");
  }
});
