const { test, expect } = require("@playwright/test");

test("Tankekart traverses stored List/Path connections without generating AI content", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("aha_insight_chamber_v1", JSON.stringify({ insights: [{
      id: "insight-for-map", title: "Godkjent kildeinnsikt"
    }] }));
    localStorage.setItem("aha_lists_v1", JSON.stringify([{
      id: "mindmap-list",
      title: "Samling for videre læring",
      type: "favorites",
      items: [{
        id: "item-1", title: "Godkjent kildeinnsikt", source: "aha_insights",
        type: "insight", refId: "insight-for-map"
      }]
    }]));
    localStorage.setItem("aha_paths_v1", JSON.stringify([{
      id: "mindmap-path",
      title: "Læringssti fra samling",
      type: "learning",
      steps: [{ id: "step-1", title: "Samling for videre læring",
        source: "aha_lists", type: "list", refId: "mindmap-list" }]
    }]));
  });

  await page.goto("/mindmap.html");
  const details = page.locator("#mindmap-details");
  const list = page.locator('[data-mindmap-node="list::aha_lists::mindmap-list"]');
  await expect(list).toBeVisible();
  await list.click();
  await expect(details).toContainText("Samling for videre læring");
  await expect(details).toContainText("Følg koblingene (2)");
  await expect(details.getByRole("button", { name: "Vis Godkjent kildeinnsikt som hovedidé" })).toBeVisible();
  const toPath = details.getByRole("button", { name: "Vis Læringssti fra samling som hovedidé" });
  await expect(toPath).toBeVisible();

  // Related nodes are navigable even if search/filter currently hides them.
  await page.locator("#mindmap-search").fill("intet treff");
  await expect(toPath).toBeVisible();
  await toPath.click();
  await expect(page.locator("#mindmap-search")).toHaveValue("");
  await expect(details).toContainText("Læringssti fra samling");
  await expect(page.locator('.mindmap-node.is-selected')).toHaveAttribute("data-mindmap-node",
    "path::aha_paths::mindmap-path");

  await details.getByRole("link", { name: "Åpne i Stier" }).click();
  await expect(page).toHaveURL(/paths\.html#path-mindmap-path$/);
  await expect(page.locator("#path-preview-title")).toHaveText("Læringssti fra samling");

  await page.goto("/mindmap.html");
  await page.locator('[data-mindmap-node="list::aha_lists::mindmap-list"]').click();
  await details.getByRole("link", { name: "Åpne i Lister" }).click();
  await expect(page).toHaveURL(/lists\.html#list-mindmap-list$/);
  await expect(page.locator("#list-preview-title")).toHaveText("Samling for videre læring");

  const saved = await page.evaluate(() => ({
    lists: JSON.parse(localStorage.getItem("aha_lists_v1") || "[]"),
    paths: JSON.parse(localStorage.getItem("aha_paths_v1") || "[]")
  }));
  expect(saved.lists[0].items).toHaveLength(1);
  expect(saved.paths[0].steps).toHaveLength(1);
});
