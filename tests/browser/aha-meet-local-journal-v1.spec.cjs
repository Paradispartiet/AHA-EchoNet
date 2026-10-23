const { test, expect } = require("@playwright/test");

test("Meet records survive reload, can be edited, found and deleted locally", async ({ page }) => {
  await page.goto("/meet.html");
  await expect(page.getByRole("heading", { name: "Mitt møtearkiv" })).toBeVisible();
  await expect(page.getByText("Ingen møtenotater ennå.")).toBeVisible();
  await page.locator("#meet-title").fill("Samtale om byutvikling");
  await page.locator("#meet-date").fill("2026-10-23");
  await page.locator("#meet-kind").selectOption("meeting");
  await page.locator("#meet-notes").fill("Diskuterte bedre kollektivtilbud.");
  await page.locator("#meet-takeaway").fill("Følg opp med kommunen.");
  await page.locator("#meet-save").click();
  await expect(page.locator(".meet-card")).toHaveCount(1);
  await expect(page.locator(".meet-card")).toContainText("Følg opp med kommunen.");
  await page.reload();
  await expect(page.locator(".meet-card")).toHaveCount(1);
  await page.locator("#meet-search").fill("kollektivtilbud");
  await expect(page.locator(".meet-card")).toHaveCount(1);
  await page.locator("#meet-search").fill("ikke-her");
  await expect(page.locator(".meet-card")).toHaveCount(0);
  await page.locator("#meet-search").fill("");
  await page.getByRole("button", { name: "Rediger", exact: true }).click();
  await expect(page.locator("#meet-form-title")).toHaveText("Rediger møtenotat");
  await page.locator("#meet-title").fill("Oppdatert møte");
  await page.locator("#meet-save").click();
  await expect(page.locator(".meet-card")).toHaveCount(1);
  await expect(page.locator(".meet-card h3")).toHaveText("Oppdatert møte");
  const backup = await page.evaluate(() => JSON.stringify({
    version: 1,
    localOnly: true,
    entries: JSON.parse(localStorage.getItem("aha_meet_journal_v1") || "[]")
  }));
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Slett" }).click();
  await expect(page.locator(".meet-card")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".meet-card")).toHaveCount(0);
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#meet-import-file").setInputFiles({
    name: "aha-meet-notater.json", mimeType: "application/json", buffer: Buffer.from(backup)
  });
  await expect(page.locator(".meet-card")).toHaveCount(1);
  await expect(page.locator(".meet-card h3")).toHaveText("Oppdatert møte");
});

test("Meet works on a 320px screen and treats user text as text", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 780 });
  await page.goto("/meet.html");
  await page.locator("#meet-title").fill("<img src=x onerror=alert(1)>");
  await page.locator("#meet-date").fill("2026-10-23");
  await page.locator("#meet-notes").fill("<script>test</script>");
  await page.locator("#meet-save").click();
  await expect(page.locator(".meet-card h3")).toHaveText("<img src=x onerror=alert(1)>");
  await expect(page.locator(".meet-card script")).toHaveCount(0);
  const width = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth
  }));
  expect(width.scroll).toBeLessThanOrEqual(width.client + 2);
});
