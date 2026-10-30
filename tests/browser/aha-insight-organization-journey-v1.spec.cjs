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
  const result = page.locator("#search-results .aha-search-card").filter({ has: page.locator("a[href='insights.html#insight-ins-journey']") });
  await expect(page.locator("#search-library-recent").locator("xpath=..")).toBeHidden();
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


test("A deep-linked collection and knowledge path can be closed without reopening", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("aha_lists_v1", JSON.stringify([{
      id: "linked-collection", title: "Direkte samling", type: "favorites",
      createdAt: "2026-10-24T12:00:00Z", items: []
    }]));
    localStorage.setItem("aha_paths_v1", JSON.stringify([{
      id: "linked-path", title: "Direkte kunnskapssti", type: "learning",
      createdAt: "2026-10-24T12:00:00Z", steps: []
    }]));
  });

  await page.goto("/lists.html#list-linked-collection");
  await expect(page.locator("#list-preview-title")).toHaveText("Direkte samling");
  await page.locator("[data-list-preview-close]").click();
  await expect(page.locator("#list-preview-title")).toHaveCount(0);
  await expect(page).not.toHaveURL(/#list-linked-collection$/);

  await page.goto("/paths.html#path-linked-path");
  await expect(page.locator("#path-preview-title")).toHaveText("Direkte kunnskapssti");
  await page.locator("[data-path-preview-close]").click();
  await expect(page.locator("#path-preview-title")).toHaveCount(0);
  await expect(page).not.toHaveURL(/#path-linked-path$/);
});


test("A saved AI-projection list becomes a real editable Path with source-bound steps", async ({ page }) => {
  await page.addInitScript(() => {
    const identity = {
      projection_id: "projection_browser", projection_artifact_id: "list_browser",
      analysis_id: "analysis_browser", analysis_run_id: "run_browser",
      source_id: "source_browser", source_sha256: "c".repeat(64)
    };
    const members = ["approved_one", "approved_two"];
    const items = members.map((id, index) => ({
      id: "item_" + id,
      title: "Godkjent AI-innsikt " + (index + 1),
      type: "insight", source: "aha_projection_v2", refId: id,
      membership_reason: "Kildebundet medlemskap for denne innsikten, med kontrollert relevans.",
      meta: {
        ...identity, inline: true, immutable: true,
        snapshot: { id, title: "Godkjent AI-innsikt " + (index + 1), type: "insight", source: "aha_semantic_v2" }
      }
    }));
    localStorage.setItem("aha_lists_v1", JSON.stringify([{
      id: "list_projection_browser", title: "Godkjente innsikter",
      source: "aha_lists", status: "materialized_v2", local_only: true,
      meta: { ...identity, createdBy: "aha_projection_materializer_v2", member_ref_ids: members },
      items
    }]));
  });
  await page.goto("/lists.html#list-list_projection_browser");
  await expect(page.locator("#list-preview-title")).toHaveText("Godkjente innsikter");
  await expect(page.locator(".aha-list-item-row")).toHaveCount(2);
  await expect(page.locator(".aha-list-item-row").first()).toContainText("kildebundet snapshot");
  await expect(page.locator(".aha-list-item-row").getByRole("link", { name: "Åpne kilden" })).toHaveCount(0);
  await page.locator("[data-org-list-to-path='list_projection_browser']").click();
  const status = page.locator(".aha-org-flow-actions").filter({
    has: page.locator("[data-org-list-to-path='list_projection_browser']")
  }).locator(".aha-org-flow-status");
  await expect(status).toContainText("Sti med 3 steg opprettet");
  await status.getByRole("link", { name: "Åpne stien" }).click();
  await expect(page.locator(".aha-path-step-row")).toHaveCount(3);
  await expect(page.locator(".aha-path-step-row").nth(1)).toContainText("Godkjent AI-innsikt 1");
  await expect(page.locator(".aha-path-step-row").nth(2)).toContainText("Godkjent AI-innsikt 2");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("aha_paths_v1") || "[]"));
  expect(saved).toHaveLength(1);
  const steps = saved[0].steps;
  expect(steps).toHaveLength(3);
  expect(steps.slice(1).map((step) => step.source)).toEqual(["aha_projection_v2", "aha_projection_v2"]);
  for (const step of steps.slice(1)) {
    expect(step.meta.source_sha256).toBe("c".repeat(64));
    expect(step.meta.snapshot.id).toBe(step.refId);
    expect(step.meta.snapshot.source).toBe("aha_semantic_v2");
  }
  await page.locator(".aha-path-step-row").nth(1).getByRole("button", { name: "Marker som fullført" }).click();
  await page.reload();
  await expect(page.locator(".aha-path-step-row")).toHaveCount(3);
  await expect(page.locator(".aha-path-step-row.is-done")).toHaveCount(1);
});
