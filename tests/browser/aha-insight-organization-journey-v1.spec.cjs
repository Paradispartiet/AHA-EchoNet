const { test, expect } = require("@playwright/test");

test("Search opens the exact insight, saves a collection and creates a real knowledge path", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("aha_insight_chamber_v1", JSON.stringify({
      insights: [
        { id: "other", title: "Andre temaer", summary: "Dette er en annen innsikt om et annet tema.", created_at: "2026-10-24T19:00:00Z" },
        { id: "ins-journey", title: "Bibliotek for nærmiljøet", summary: "Biblioteket kan bli et viktig felles møtested, men effekten må undersøkes.", created_at: "2026-10-24T17:00:00Z",
          uncertainty: "hypothesis", claim_kind: "hypothesis", next_test: "Undersøk besøkstall og bruk." }
      ]
    }));
    localStorage.setItem("aha_source_events_v1", "[]");
  });
  await page.goto("/search.html");
  await page.locator("#search-query").fill("Bibliotek for nærmiljøet");
  const result = page.locator(".aha-search-card").filter({ hasText: "Bibliotek for nærmiljøet" });
  await expect(result).toHaveCount(1);
  await expect(result.getByRole("link", { name: "Åpne modul" })).toHaveAttribute("href", "insights.html#insight-ins-journey");
  await result.getByRole("link", { name: "Åpne modul" }).click();
  await expect(page).toHaveURL(/insights\.html#insight-ins-journey$/);
  const insight = page.locator("#insight-ins-journey");
  await expect(insight).toBeVisible();
  await expect(insight.getByRole("heading", { name: "Bibliotek for nærmiljøet" })).toBeVisible();

  await insight.locator("[data-insight-new-list]").click();
  const created = insight.locator("[data-insight-new-list-status]");
  await expect(created).toContainText("Ny samling lagret");
  await created.getByRole("link", { name: "Åpne samlingen" }).click();
  await expect(page).toHaveURL(/lists\.html#list-/);
  await expect(page.locator("#list-preview-title")).toContainText("Bibliotek for nærmiljøet");
  await expect(page.locator(".aha-list-item-row")).toHaveCount(1);
  await expect(page.locator(".aha-list-item-row").getByRole("link", { name: "Åpne kilden" })).toHaveAttribute("href", "insights.html#insight-ins-journey");

  await page.locator("[data-org-list-to-path]").click();
  const flowStatus = page.locator(".aha-org-flow-actions").filter({ has: page.locator("[data-org-list-to-path]") }).locator(".aha-org-flow-status");
  await expect(flowStatus).toContainText("Sti med 2 steg opprettet");
  await flowStatus.getByRole("link", { name: "Åpne stien" }).click();
  await expect(page).toHaveURL(/paths\.html#path-/);
  await expect(page.locator(".aha-path-step-row")).toHaveCount(2);
  const sourceStep = page.locator(".aha-path-step-row").filter({ hasText: "Bibliotek for nærmiljøet" }).last();
  await expect(sourceStep.getByRole("link", { name: "Åpne grunnlaget" })).toHaveAttribute("href", "insights.html#insight-ins-journey");

  await sourceStep.getByRole("button", { name: "Marker som fullført" }).click();
  await expect(page.locator(".aha-path-step-row.is-done")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".aha-path-step-row")).toHaveCount(2);
  await expect(page.locator(".aha-path-step-row.is-done")).toHaveCount(1);
  await page.locator(".aha-path-step-row").last().getByRole("link", { name: "Åpne grunnlaget" }).click();
  await expect(page.locator("#insight-ins-journey")).toBeVisible();
});

test("A saved collection exposes all six members, not just the first five", async ({ page }) => {
  await page.addInitScript(() => {
    const notes = Array.from({ length: 6 }, (_, i) => ({ id: "note-" + i, title: "Notat " + i }));
    const collection = {
      id: "complete-collection", title: "Alle seks notater", type: "favorites",
      createdAt: "2026-10-24T12:00:00Z", updatedAt: "2026-10-24T12:00:00Z",
      items: notes.map(note => ({ id: "item-" + note.id, title: note.title, type: "note", source: "aha_notes", refId: note.id }))
    };
    localStorage.setItem("aha_notes_v1", JSON.stringify(notes));
    localStorage.setItem("aha_lists_v1", JSON.stringify([collection]));
  });
  await page.goto("/lists.html#list-complete-collection");
  await expect(page.locator("#list-preview-title")).toHaveText("Alle seks notater");
  await expect(page.locator(".aha-list-item-row")).toHaveCount(6);
  await expect(page.locator(".aha-list-item-row").last()).toContainText("Notat 5");
  await expect(page.locator(".aha-list-item-row").last().getByRole("button", { name: /Remove/ })).toBeVisible();
});
