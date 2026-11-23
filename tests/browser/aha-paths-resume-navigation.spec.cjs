const { test, expect } = require("@playwright/test");

// Offline end-to-end coverage: resume and navigation must never create AI content
// or write path progress unless the user explicitly changes step status.
test("Paths resume opens the saved active step and keeps navigation read-only", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("aha_paths_v1", JSON.stringify([{
      id: "path-resume",
      title: "Kontrollerbar læringssti",
      type: "learning",
      mode: "learning",
      steps: [
        { id: "done/1", title: "Fullført kilde", order: 0, status: "done", source: "aha_notes", refId: "n1" },
        { id: "active/2", title: "Aktiv kilde", order: 1, status: "active", source: "aha_notes", refId: "n2" },
        { id: "planned/3", title: "Neste kilde", order: 2, status: "planned", source: "aha_notes", refId: "n3" },
        { id: "skipped/4", title: "Hoppet over kilde", order: 3, status: "skipped", source: "aha_notes", refId: "n4" }
      ]
    }]));
  });
  await page.goto("/paths.html");

  await expect(page.locator(".aha-path-card-progress")).toContainText("1 av 4 steg fullført");
  await expect(page.locator(".aha-path-card-progress")).toContainText("1 hoppet over");
  const stored = await page.evaluate(() => localStorage.getItem("aha_paths_v1"));

  await page.locator('[data-path-resume="path-resume"]').click();
  await expect(page.locator("#path-preview-title")).toHaveText("Kontrollerbar læringssti");
  await expect(page.locator('[id="path-step-active%2F2"]')).toBeFocused();
  await expect(page.locator(".aha-path-progress")).toHaveCount(1);
  await expect(page.locator(".aha-path-step-jump-nav")).toContainText("Hopp til steg");

  await page.locator('.aha-path-step-jump-nav [data-path-step-jump="planned/3"]').click();
  await expect(page.locator('[id="path-step-planned%2F3"]')).toBeFocused();

  await page.locator('[id="path-step-planned%2F3"] [data-path-step-jump="active/2"]').click();
  await expect(page.locator('[id="path-step-active%2F2"]')).toBeFocused();
  expect(await page.evaluate(() => localStorage.getItem("aha_paths_v1"))).toBe(stored);

  await page.locator('[data-step-complete="path-resume::planned/3"]').click();
  await expect(page.locator(".aha-path-progress")).toContainText("2 av 4 steg fullført");
  await expect(page.locator(".aha-path-card-progress")).toContainText("2 av 4 steg fullført");
});
