const { test, expect } = require("@playwright/test");

// Offline product smoke: tests the real static UI without requiring a live
// Supabase account, external CDN, History Go or an AI API response.
test.beforeEach(async ({ page }) => {
  await page.route("https://cdn.jsdelivr.net/**", (route) => route.fulfill({
    status: 200, contentType: "application/javascript", body: ""
  }));
});

test("AHA journey keeps one correct primary destination on each ready screen", async ({ page }) => {
  const journey = [
    ["index.html", "home", "#aha-home-main"],
    ["chat.html", "chat", "#msg"],
    ["friend-chat.html", "friends", ".friend-chat-modes"],
    ["search.html", "library", "#search-query"],
    ["personal-ai.html", "personal-ai", "#personal-ai-experience"],
    ["profile.html", "profile", "main"]
  ];

  for (const [file, active, content] of journey) {
    await page.goto("/" + file, { waitUntil: "domcontentloaded" });
    await expect(page.locator(".aha-global-nav-primary")).toBeVisible();
    await expect(page.locator(".aha-global-nav-primary [aria-current='page']")).toHaveCount(1);
    await expect(page.locator(".aha-global-nav-primary [data-primary='" + active + "']")).toHaveAttribute("aria-current", "page");
    await expect(page.locator(content)).toBeVisible();
  }

  await page.goto("/chat.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator("script[src='js/ahaChat.js']")).toHaveCount(1);
  await expect(page.locator("script[src='js/ahaFriendChat.js']")).toHaveCount(0);

  await page.goto("/friend-chat.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator("script[src='js/ahaChat.js']")).toHaveCount(0);
  await expect(page.locator("script[src='js/ahaFriendChat.js']")).toHaveCount(1);
  await expect(page.locator("nav.aha-mobile-nav")).toHaveCount(0);
  await expect(page.locator(".friend-chat-notice")).toContainText("Meldingene sendes ikke til AHA-AI");

  await page.goto("/insights.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#insights-search")).toBeVisible();
  await page.locator("#aha-global-nav-toggle").click();
  await expect(page.locator('#aha-global-nav-overlay a[data-module="insights"]')).toBeVisible();
});

test("AHA narrow-phone More menu reaches Personal AI and Library without clipped navigation", async ({ page }) => {
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 750 });
    await page.goto("/friend-chat.html", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".aha-global-nav-primary [data-primary='friends']")).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".aha-global-nav-primary [data-primary='personal-ai']")).toBeHidden();
    await expect(page.locator(".aha-global-nav-primary [data-primary='library']")).toBeVisible();
    await expect(page.locator(".aha-global-nav-primary [data-primary='profile']")).toBeVisible();

    const fits = await page.locator(".aha-global-nav-bar").evaluate((el) =>
      el.scrollWidth <= el.clientWidth + 1
    );
    expect(fits, "The canonical top bar must fit on a " + width + "px phone").toBe(true);

    await page.locator("#aha-global-nav-toggle").click();
    await expect(page.locator('#aha-global-nav-overlay a[data-module="personal-ai"]')).toBeVisible();
    await expect(page.locator('#aha-global-nav-overlay a[data-module="search"]')).toBeVisible();
    await expect(page.locator('#aha-global-nav-overlay a[data-module="profile"]')).toBeVisible();
    await page.locator('#aha-global-nav-overlay [data-aha-global-nav-close]').last().click();
    await expect(page.locator("#aha-global-nav-overlay")).toBeHidden();
  }

  await page.locator("#aha-global-nav-toggle").click();
  await page.locator('#aha-global-nav-overlay a[data-module="personal-ai"]').click();
  await expect(page).toHaveURL(/\/personal-ai\.html$/);
  await expect(page.getByRole("heading", { name: "Hva AHA kan bruke når den svarer deg" })).toBeVisible();
});
