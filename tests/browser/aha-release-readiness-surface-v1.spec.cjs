const { test, expect } = require("@playwright/test");

test("System Status renders local-only release readiness on desktop and iPad", async ({ page }) => {
  await page.goto("/status.html", { waitUntil: "domcontentloaded" });

  const panel = page.locator("#aha-release-readiness");
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Lokal-only baseline" })).toBeVisible();
  await expect(panel.getByText("Klar lokalt", { exact: true })).toBeVisible();

  const nonReady = panel.locator(".aha-release-module-row");
  await expect(nonReady).toHaveCount(2);
  await expect(panel.getByText("Meet", { exact: true })).toBeVisible();
  await expect(panel.getByText("Sync Hub", { exact: true })).toBeVisible();
  await expect(panel.getByText("Shell", { exact: true })).toBeVisible();
  await expect(panel.getByText("Planned", { exact: true })).toBeVisible();

  const boundaryList = panel.locator(".aha-release-boundary-list");
  for (const label of ["Backend", "Sync", "EchoNet", "Ekstern deling", "Modelltrening", "History Go write-back"]) {
    const row = boundaryList.locator("li").filter({ hasText: label });
    await expect(row).toHaveCount(1);
    await expect(row.getByText("Av", { exact: true })).toBeVisible();
  }

  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 2);
});
