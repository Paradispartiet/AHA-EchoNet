const { test, expect } = require("@playwright/test");

// Offline integration fixture: all three product improvements are present together.
// This branch is never intended to be merged as a fourth feature PR.
test("Tankekart → Stier → Lister respects real references and writes only on explicit copy", async ({ page }) => {
  const aiCalls = [];
  page.on("request", (request) => {
    if (/\/(?:api\/aha-agent\/(?:chat|analy|synth)|v1\/chat\/completions)/i.test(request.url())) {
      aiCalls.push(request.url());
    }
  });
  await page.addInitScript(() => {
    if (localStorage.getItem("aha_integration_fixture_ready") === "1") return;
    localStorage.setItem("aha_integration_fixture_ready", "1");
    localStorage.setItem("aha_insight_chamber_v1", JSON.stringify({
      insights: [{ id: "ins-verified", title: "Beslutning fra kilde" }]
    }));
    localStorage.setItem("aha_notes_v1", JSON.stringify([{ id: "note-1", title: "Kildedokument" }]));
    localStorage.setItem("aha_concept_lists_v1", JSON.stringify([{
      id: "terms", title: "Samlede begreper",
      terms: [{ id: "term-a", term: "Kildebelegg" }]
    }]));
    localStorage.setItem("aha_lists_v1", JSON.stringify([
      { id: "study-list", title: "Læringssamling", type: "favorites", items: [
        { id: "member-ins", title: "Beslutning fra kilde", type: "insight",
          source: "aha_insights", refId: "ins-verified", membership_reason: "Lagret og godkjent" },
        { id: "member-note", title: "Kildedokument", type: "note",
          source: "aha_notes", refId: "note-1" }
      ] },
      { id: "study-dest", title: "Neste samling", type: "todo", items: [] }
    ]));
    localStorage.setItem("aha_paths_v1", JSON.stringify([{
      id: "study-path", title: "Kontrollert kunnskapssti", mode: "learning",
      steps: [
        { id: "done-1", title: "Les kilden", order: 0, status: "done",
          source: "aha_notes", refId: "note-1", type: "note" },
        { id: "active/2", title: "Gå gjennom samlingen", order: 1, status: "active",
          source: "aha_lists", refId: "study-list", type: "list" },
        { id: "planned/3", title: "Bruk begreper", order: 2, status: "planned",
          source: "aha_concept_lists", refId: "terms", type: "concept_list" }
      ]
    }]));
  });
  const snapshot = () => page.evaluate(() => ({
    lists: localStorage.getItem("aha_lists_v1"),
    paths: localStorage.getItem("aha_paths_v1"),
    concepts: localStorage.getItem("aha_concept_lists_v1"),
    notes: localStorage.getItem("aha_notes_v1"),
    insights: localStorage.getItem("aha_insight_chamber_v1")
  }));

  await page.goto("/mindmap.html");
  const initial = await snapshot();
  const details = page.locator("#mindmap-details");
  const listNode = page.locator('[data-mindmap-node="list::aha_lists::study-list"]');
  await expect(listNode).toBeVisible();
  await listNode.click();
  await expect(details.getByRole("button", { name: "Vis Kontrollert kunnskapssti som hovedidé" })).toBeVisible();
  await details.getByRole("button", { name: "Vis Kontrollert kunnskapssti som hovedidé" }).click();
  await expect(page.locator(".mindmap-node.is-selected")).toHaveAttribute(
    "data-mindmap-node", "path::aha_paths::study-path"
  );
  await details.getByRole("link", { name: "Åpne i Stier" }).click();
  await expect(page).toHaveURL(/paths\.html#path-study-path$/);
  await expect(page.locator("#path-preview-title")).toHaveText("Kontrollert kunnskapssti");

  await page.locator('[data-path-resume="study-path"]').click();
  await expect(page.locator('[id="path-step-active%2F2"]')).toBeFocused();
  await expect(page.locator(".aha-path-card-progress")).toContainText("1 av 3 steg fullført");
  await page.locator('[id="path-step-active%2F2"] a').filter({ hasText: "Åpne grunnlaget" }).click();
  await expect(page).toHaveURL(/lists\.html#list-study-list$/);
  await expect(page.locator("#list-preview-title")).toHaveText("Læringssamling");

  await page.locator("#lists-search").fill("Ingen samlinger matcher");
  await expect(page.locator(".aha-list-selection-note")).toBeVisible();
  await expect(page.locator("#list-preview-title")).toHaveText("Læringssamling");
  await page.locator("#lists-search").fill("");
  const search = page.locator("#list-member-search");
  await search.fill("Beslutning");
  await expect(search).toBeFocused();
  await expect(page.locator(".aha-list-item-row")).toHaveCount(2);
  await expect(page.locator(".aha-list-item-row:visible")).toHaveCount(1);
  await expect(page.locator("[data-list-member-count]")).toHaveText("Viser 1 av 2 objekter");
  expect(await snapshot()).toEqual(initial);
  expect(aiCalls).toEqual([]);

  const row = page.locator(".aha-list-item-row:visible");
  await row.locator("[data-list-move-target]").selectOption("study-dest");
  await row.locator('[data-list-item-action="copy"]').click();
  await expect(page.locator("[data-list-relocation-notice]")).toContainText("Kopiert til Neste samling");

  const after = await snapshot();
  expect(after.paths).toBe(initial.paths);
  expect(after.concepts).toBe(initial.concepts);
  expect(after.notes).toBe(initial.notes);
  expect(after.insights).toBe(initial.insights);
  const saved = JSON.parse(after.lists);
  expect(saved.find((list) => list.id === "study-list").items).toHaveLength(2);
  expect(saved.find((list) => list.id === "study-dest").items).toHaveLength(1);
  expect(saved.find((list) => list.id === "study-dest").items[0].refId).toBe("ins-verified");
  expect(saved.find((list) => list.id === "study-dest").items[0].membership_reason)
    .toBe("Lagret og godkjent");

  await page.goto("/mindmap.html");
  await page.locator('[data-mindmap-node="list::aha_lists::study-dest"]').click();
  await expect(details.getByRole("button", { name: "Vis Beslutning fra kilde som hovedidé" })).toBeVisible();
  expect(aiCalls).toEqual([]);
});
