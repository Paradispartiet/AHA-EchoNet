const { test, expect } = require("@playwright/test");

// Real browser interactions, but no account or network dependency.
// Semantic knowledge still stays local until users explicitly approve it.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("aha_notes_v1", JSON.stringify([
      { id: "note-fixture-a", title: "Første kilde", text: "En verifiserbar observasjon" }
    ]));
  });
});

test("Concept lists support editorial corrections and meaningful relations", async ({ page }) => {
  await page.goto("/lists.html");
  await page.locator("#concept-list-title").fill("Demokrati");
  await page.locator("#concept-list-initial-terms").fill("demokrati, valg");
  await page.locator("#concept-list-create-form button[type='submit']").click();
  await expect(page.locator("#concept-lists-count")).toHaveText("1");
  await expect(page.locator("#concept-terms-count")).toHaveText("2");

  const relationForm = page.locator("[data-concept-relation-form]");
  await relationForm.locator('[name="from"]').selectOption("demokrati");
  await relationForm.locator('[name="to"]').selectOption("valg");
  await relationForm.locator('[name="type"]').selectOption("supports");
  await relationForm.locator('[name="explanation"]').fill("Frie valg støtter folkestyret.");
  await relationForm.locator('button[type="submit"]').click();
  await expect(page.locator(".aha-concept-relations")).toContainText("støtter");

  const editor = page.locator("[data-concept-term-edit]").first();
  await editor.locator('[name="term"]').fill("folkestyre");
  await editor.locator('[name="definition"]').fill("Politisk makt forankret i folket.");
  await editor.locator('button[type="submit"]').click();
  await expect(page.locator(".aha-concept-terms")).toContainText("folkestyre");
  await expect(page.locator(".aha-concept-terms")).toContainText("Politisk makt forankret i folket.");
  await expect(page.locator(".aha-concept-relations")).toContainText("folkestyre");
  await expect(page.locator(".aha-concept-relations")).toContainText("Frie valg støtter folkestyret.");

  await page.reload();
  await expect(page.locator(".aha-concept-relations")).toContainText("folkestyre");
  await expect(page.locator(".aha-concept-terms")).toContainText("Politisk makt forankret i folket.");
  await page.locator("[data-org-concept-to-path]").click();
  await expect(page.locator(".aha-org-flow-status")).toContainText("Kunnskapsstien er opprettet");
  await page.locator(".aha-org-flow-status a[href='paths.html']").click();
  await expect(page.locator("#paths-count")).toHaveText("1");
  await page.locator("[data-path-select-preview]").first().click();
  await expect(page.locator(".aha-path-step-row")).toContainText("Demokrati");
});

test("Path completion follows actual saved steps and can be undone", async ({ page }) => {
  await page.goto("/paths.html");
  await page.locator("#path-title").fill("Kildekritisk forståelse");
  await page.locator("#path-create-form button[type='submit']").click();
  await expect(page.locator("#paths-count")).toHaveText("1");
  await page.locator("[data-path-select-preview]").first().click();
  const select = page.locator("[data-path-select]");
  await expect(select.locator("option")).toHaveCount(2);
  await select.selectOption({ index: 1 });
  await page.locator("[data-step-add]").click();
  await expect(page.locator(".aha-path-step-row")).toHaveCount(1);
  await expect(page.locator(".aha-path-progress")).toContainText("0 av 1 steg fullført");

  await page.locator("[data-step-complete]").click();
  await expect(page.locator(".aha-path-progress")).toContainText("1 av 1 steg fullført");
  await expect(page.locator("[data-step-complete]")).toContainText("Angre fullføring");

  await page.reload();
  await page.locator("[data-path-select-preview]").first().click();
  await expect(page.locator(".aha-path-progress")).toContainText("1 av 1 steg fullført");
  await page.locator("[data-step-complete]").click();
  await expect(page.locator(".aha-path-progress")).toContainText("0 av 1 steg fullført");
});
