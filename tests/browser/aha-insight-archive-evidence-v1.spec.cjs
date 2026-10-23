const { test, expect } = require("@playwright/test");

test("AHA insight archive shows evidence honestly and opens the exact local source", async ({ page }) => {
  await page.addInitScript(() => {
    const source = {
      id: "source-archive-1", source_app: "chat", source_type: "user_text",
      text: "I høringsnotatet står det at antall avganger i sentrum skal reduseres.",
      created_at: "2026-10-23T12:00:00Z"
    };
    const insight = {
      id: "insight-archive-1", title: "Endret kollektivtilbud",
      summary: "Færre avganger kan gjøre enkelte reiser vanskeligere.",
      created_at: "2026-10-23T12:01:00Z", source_event_id: source.id,
      uncertainty: "hypothesis", claim_kind: "interpretation",
      evidence_origin: "context_match",
      candidate_quality: { status: "needs_review", evidence_origin: "context_match" },
      evidence: [{ quote: source.text, role: "context", relation: "related_source_context" }],
      why_it_matters: "Reisetiden kan endre seg for folk som reiser kollektivt.",
      next_test: "Sammenlign antall avganger før og etter omleggingen."
    };
    localStorage.setItem("aha_source_events_v1", JSON.stringify([source]));
    localStorage.setItem("aha_insight_chamber_v1", JSON.stringify({ insights: [insight] }));
  });

  await page.goto("/insights.html");
  const card = page.locator(".insight-archive-card").first();
  await expect(card.getByRole("heading", { name: "Endret kollektivtilbud" })).toBeVisible();
  await expect(card.locator(".insight-evidence-review")).toBeVisible();
  await card.locator(".insight-evidence-review summary").click();
  await expect(card.locator(".insight-evidence-content")).toContainText("Hypotese");
  await expect(card.locator(".insight-evidence-content")).toContainText("Beslektet kildeutdrag – ikke bekreftelse");
  await expect(card.locator(".insight-evidence-content")).toContainText("Sammenlign antall avganger");
  await expect(card.locator(".insight-evidence-content")).toContainText("Reisetiden kan endre seg");

  await card.getByRole("link", { name: "Åpne kildesporet" }).click();
  await expect(page).toHaveURL(/\/sources\.html#source-source-archive-1$/);
  const source = page.locator("#source-source-archive-1");
  await expect(source).toBeVisible();
  await expect(source.locator("details").first()).toHaveAttribute("open", "");
});

test("An unlinked insight never claims verified source evidence", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("aha_source_events_v1", "[]");
    localStorage.setItem("aha_insight_chamber_v1", JSON.stringify({
      insights: [{
        id: "unlinked", title: "Mulig forklaring", summary: "Dette er en foreløpig hypotese.",
        uncertainty: "hypothesis", evidence: [{ quote: "Dette er et oppdiktet sitat", role: "supports" }]
      }]
    }));
  });
  await page.goto("/insights.html");
  const card = page.locator(".insight-archive-card").first();
  await card.locator(".insight-evidence-review summary").click();
  await expect(card.locator(".insight-evidence-content")).toContainText("Ingen lokal kilde er koblet");
  await expect(card.locator(".insight-evidence-quotes")).toHaveCount(0);
  await expect(card.getByRole("link", { name: "Åpne kildesporet" })).toHaveCount(0);
});
