const { test, expect } = require("@playwright/test");

test("Insta opens the real composer from an empty feed", async ({ page }) => {
  await page.goto("/insta.html", { waitUntil: "domcontentloaded" });
  const empty = page.locator('#insta-list [data-empty-state="no_data"]');
  await expect(empty).toBeVisible();
  await empty.getByRole("button", { name: "Lag første post" }).click();
  await expect(page.locator("#insta-compose-panel")).toHaveAttribute("open", "");
  await expect(page.locator("#insta-src")).toBeFocused();
  const count = await page.evaluate(() => JSON.parse(localStorage.getItem("aha_insta_posts_v1") || "[]").length);
  expect(count).toBe(0);
});

test("Innsikter differentiates an empty archive from an unmatched search", async ({ page }) => {
  await page.goto("/insights.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator('#insights-list [data-empty-state="no_data"]')).toBeVisible();
  await expect(page.locator("#insights-list").getByRole("link", { name: "Åpne Chat" })).toHaveAttribute("href", "chat.html");

  await page.evaluate(() => {
    localStorage.setItem("aha_insight_chamber_v1", JSON.stringify({
      insights: [{ id: "browser_insight", title: "Byrom og fellesskap", summary: "En konkret lokal innsikt", created_at: "2026-10-09T10:00:00Z" }]
    }));
    window.AHAInsights.render();
  });
  const search = page.locator("#insights-search");
  await search.fill("helt-usannsynlig-treff");
  await expect(page.locator('#insights-list [data-empty-state="filtered_empty"]')).toBeVisible();
  await page.locator("#insights-list").getByRole("button", { name: "Nullstill søk og filter" }).click();
  await expect(search).toHaveValue("");
  await expect(page.locator("#insights-filter")).toHaveValue("all");
  await expect(page.locator('#insights-list [data-empty-state="filtered_empty"]')).toHaveCount(0);
  await expect(page.locator("#insights-list")).toContainText("Byrom og fellesskap");
});

test("Music offers the configured connection entry point without importing metadata", async ({ page }) => {
  await page.goto("/music.html", { waitUntil: "domcontentloaded" });
  const empty = page.locator('#music-empty-state [data-empty-state="no_data"]');
  await expect(empty).toBeVisible();
  await expect(empty.getByRole("link", { name: "Se Spotify-tilkobling" })).toHaveAttribute("href", "#spotify-connect-title");
  const count = await page.evaluate(() => JSON.parse(localStorage.getItem("aha_music_library_v1") || "null")?.tracks?.length || 0);
  expect(count).toBe(0);
});
