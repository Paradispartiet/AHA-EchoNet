const { test, expect } = require("@playwright/test");

test("local examples install and remove only their own Feed/Gallery records", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/examples.html", { waitUntil: "domcontentloaded" });

  await expect(page.locator("#aha-examples-main")).toBeVisible();
  await expect(page.locator("#aha-global-nav .aha-global-nav")).toBeVisible();
  await expect(page.locator("#aha-examples-status")).toContainText("ikke installert");
  await expect(page.locator(".aha-examples-preview-list article")).toHaveCount(4);

  await page.locator("#aha-examples-install").click();
  await expect(page.locator("#aha-examples-status")).toContainText("installert lokalt");

  let state = await page.evaluate(() => ({
    feed: JSON.parse(localStorage.getItem("aha_feed_posts_v1") || "[]"),
    gallery: JSON.parse(localStorage.getItem("aha_gallery_v1") || "[]")
  }));
  expect(state.feed).toHaveLength(2);
  expect(state.gallery).toHaveLength(2);
  expect(state.feed.every((item) => item.meta?.example_seed_id === "aha_local_examples_v1")).toBe(true);
  expect(state.gallery.every((item) => item.meta?.example_seed_id === "aha_local_examples_v1")).toBe(true);

  await page.locator("#aha-examples-install").click();
  state = await page.evaluate(() => ({
    feed: JSON.parse(localStorage.getItem("aha_feed_posts_v1") || "[]"),
    gallery: JSON.parse(localStorage.getItem("aha_gallery_v1") || "[]")
  }));
  expect(state.feed).toHaveLength(2);
  expect(state.gallery).toHaveLength(2);

  await page.evaluate(() => {
    const feed = JSON.parse(localStorage.getItem("aha_feed_posts_v1") || "[]");
    feed.push({
      id: "browser_user_feed_keep",
      text: "Behold meg",
      local_only: true,
      meta: { local_only: true }
    });
    localStorage.setItem("aha_feed_posts_v1", JSON.stringify(feed));
  });

  await page.locator("#aha-examples-remove").click();
  await expect(page.locator("#aha-examples-status")).toContainText("ikke installert");

  state = await page.evaluate(() => ({
    feed: JSON.parse(localStorage.getItem("aha_feed_posts_v1") || "[]"),
    gallery: JSON.parse(localStorage.getItem("aha_gallery_v1") || "[]"),
    notes: localStorage.getItem("aha_notes_v1")
  }));
  expect(state.feed).toHaveLength(1);
  expect(state.feed[0].id).toBe("browser_user_feed_keep");
  expect(state.gallery).toHaveLength(0);
  expect(state.notes).toBeNull();

  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 2);
});
