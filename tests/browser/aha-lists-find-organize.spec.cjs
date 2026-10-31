const { test, expect } = require("@playwright/test");

test("Concept lists and collections can be discovered offline without changing saved data", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("aha_concept_lists_v1", JSON.stringify([
      { id: "c-1", title: "Økologi", terms: [{ term: "Biomangfold" }, { term: "Natur" }], updatedAt: "2026-01-01" },
      { id: "c-2", title: "Demokrati", terms: [{ term: "Valg" }], updatedAt: "2026-02-01" }
    ]));
    localStorage.setItem("aha_lists_v1", JSON.stringify([
      { id: "a", title: "Zebra samling", type: "favorites", description: "Viktig lesestoff", updatedAt: "2026-01-01", items: [] },
      { id: "b", title: "Alfa samling", type: "todo", updatedAt: "2026-02-01", items: [] }
    ]));
  });
  await page.goto("/lists.html");
  const before = await page.evaluate(() => ({
    concepts: localStorage.getItem("aha_concept_lists_v1"),
    lists: localStorage.getItem("aha_lists_v1")
  }));

  await page.locator("#concept-lists-search").fill("Biomangfold");
  await expect(page.locator("[data-concept-list-card]")).toHaveCount(1);
  await expect(page.locator("[data-concept-list-card]")).toContainText("Økologi");
  await expect(page.locator("#concept-lists-visible-count")).toHaveText("Viser 1 av 2 begrepslister");

  await page.locator("#concept-lists-search").fill("");
  await page.locator("#concept-lists-sort").selectOption("terms");
  await expect(page.locator("[data-concept-list-card]").first()).toContainText("Økologi");

  await page.locator("#lists-search").fill("lesestoff");
  await expect(page.locator("[data-list-card]")).toHaveCount(1);
  await expect(page.locator("[data-list-card]")).toContainText("Zebra samling");
  await page.locator("#lists-search").fill("");
  await page.locator("#lists-type-filter").selectOption("todo");
  await expect(page.locator("[data-list-card]")).toHaveCount(1);
  await expect(page.locator("[data-list-card]")).toContainText("Alfa samling");
  await page.locator("#lists-type-filter").selectOption("all");
  await page.locator("#lists-sort").selectOption("title");
  await expect(page.locator("[data-list-card]").first()).toContainText("Alfa samling");

  expect(await page.evaluate(() => ({
    concepts: localStorage.getItem("aha_concept_lists_v1"),
    lists: localStorage.getItem("aha_lists_v1")
  }))).toEqual(before);
});

test("Explicit copy and move preserve the underlying sources and block duplicates", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("aha_notes_v1", JSON.stringify([
      { id: "note-1", title: "Viktig kilde" }, { id: "note-2", title: "Oppfølgingskilde" }
    ]));
    localStorage.setItem("aha_lists_v1", JSON.stringify([
      { id: "from", title: "Kilder", type: "favorites", updatedAt: "2026-01-01", items: [
        { id: "item-1", title: "Viktig kilde", type: "note", source: "aha_notes", refId: "note-1", membership_reason: "Bevar konteksten" },
        { id: "item-2", title: "Oppfølgingskilde", type: "note", source: "aha_notes", refId: "note-2" }
      ] },
      { id: "to", title: "Arbeidsliste", type: "todo", updatedAt: "2026-02-01", items: [] }
    ]));
  });
  await page.goto("/lists.html");
  const before = await page.evaluate(() => localStorage.getItem("aha_lists_v1"));
  await page.locator('[data-list-select-preview="from"]').click();
  const first = page.locator(".aha-list-item-row").filter({ hasText: "Viktig kilde" });
  await first.locator("[data-list-item-action='copy']").click();
  await expect(first.locator("[data-list-item-status]")).toContainText("Velg en annen samling");
  expect(await page.evaluate(() => localStorage.getItem("aha_lists_v1"))).toBe(before);

  await first.locator("[data-list-move-target]").selectOption("to");
  await first.locator("[data-list-item-action='copy']").click();
  await expect(page.locator("[data-list-relocation-notice]")).toContainText("Kopiert til Arbeidsliste");
  let data = await page.evaluate(() => JSON.parse(localStorage.getItem("aha_lists_v1")));
  expect(data.find((x) => x.id === "from").items).toHaveLength(2);
  expect(data.find((x) => x.id === "to").items).toHaveLength(1);
  expect(data.find((x) => x.id === "to").items[0].membership_reason).toBe("Bevar konteksten");

  const second = page.locator(".aha-list-item-row").filter({ hasText: "Oppfølgingskilde" });
  await second.locator("[data-list-move-target]").selectOption("to");
  await second.locator("[data-list-item-action='move']").click();
  await expect(page.locator("[data-list-relocation-notice]")).toContainText("Flyttet til Arbeidsliste");
  data = await page.evaluate(() => JSON.parse(localStorage.getItem("aha_lists_v1")));
  expect(data.find((x) => x.id === "from").items.map((x) => x.refId)).toEqual(["note-1"]);
  expect(data.find((x) => x.id === "to").items.map((x) => x.refId)).toEqual(["note-1", "note-2"]);
  expect(await page.evaluate(() => localStorage.getItem("aha_notes_v1"))).toContain("note-2");
  expect(await page.evaluate(() => localStorage.getItem("aha_insight_chamber_v1"))).toBeNull();
});
