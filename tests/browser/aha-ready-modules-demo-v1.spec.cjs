const { test, expect } = require("@playwright/test");

test("ready-modules demo renders the five-step local product path", async ({ page }) => {
  await page.goto("/demo.html", { waitUntil: "domcontentloaded" });

  await expect(page.locator("#aha-demo-main")).toBeVisible();
  await expect(page.locator("#aha-global-nav")).toBeVisible();
  await expect(page.locator("#aha-demo-status")).toContainText("Alle fem steg er tilgjengelige");

  const steps = page.locator(".aha-demo-step");
  await expect(steps).toHaveCount(5);

  const expected = [
    ["Start", "index.html"],
    ["Chat", "chat.html"],
    ["Bibliotek", "search.html"],
    ["Personal AI", "personal-ai.html"],
    ["Mitt AHA", "profile.html"]
  ];

  for (let index = 0; index < expected.length; index += 1) {
    const [label, href] = expected[index];
    const step = steps.nth(index);
    await expect(step.getByText(label, { exact: true })).toBeVisible();
    await expect(step.locator("a.aha-tile-btn")).toHaveAttribute("href", href);
  }

  await expect(page.getByText("Meet er fortsatt shell", { exact: false })).toBeVisible();
  await expect(page.getByText("Sync Hub er fortsatt planned/no-op", { exact: false })).toBeVisible();

  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 2);
});
