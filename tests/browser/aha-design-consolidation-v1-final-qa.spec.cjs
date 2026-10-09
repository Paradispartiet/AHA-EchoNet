const { test, expect } = require("@playwright/test");

const SURFACES = [
  ["Home", "/index.html"],
  ["Chat", "/chat.html"],
  ["Mitt AHA", "/profile.html"],
  ["Notes", "/notes.html"],
  ["Feed", "/feed.html"],
  ["Gallery", "/gallery.html"],
  ["AHA Insta", "/insta.html"],
  ["AHA Music", "/music.html"],
  ["Search / Bibliotek", "/search.html"],
  ["Begrepslister", "/lists.html"],
  ["Kunnskapsstier", "/paths.html"],
  ["Tankekart", "/mindmap.html"],
  ["Personal AI", "/personal-ai.html"],
  ["Knowledge Workbench", "/knowledge-workbench.html"],
  ["History Go bridge", "/historygo.html"]
];

for (const [name, path] of SURFACES) {
  test(`${name} uses the canonical shell without horizontal overflow`, async ({ page }) => {
    await page.goto(path, { waitUntil: "domcontentloaded" });

    const viewport = page.viewportSize();
    expect(viewport, "browser project should provide a viewport").not.toBeNull();

    const result = await page.evaluate(() => {
      const main = document.querySelector("main.aha-dashboard");
      const viewportMeta = document.querySelector('meta[name="viewport"]');
      if (!main) return { hasMain: false };

      const rect = main.getBoundingClientRect();
      const root = document.documentElement;
      const body = document.body;

      return {
        hasMain: true,
        hasViewportMeta: Boolean(viewportMeta),
        rootClientWidth: root.clientWidth,
        rootScrollWidth: root.scrollWidth,
        bodyScrollWidth: body.scrollWidth,
        mainLeft: rect.left,
        mainRight: rect.right,
        mainWidth: rect.width
      };
    });

    expect(result.hasMain, `${name} should render main.aha-dashboard`).toBe(true);
    expect(result.hasViewportMeta, `${name} should declare a mobile viewport`).toBe(true);

    const tolerance = 2;
    expect(
      result.rootScrollWidth,
      `${name} should not overflow the document horizontally`
    ).toBeLessThanOrEqual(result.rootClientWidth + tolerance);

    expect(
      result.bodyScrollWidth,
      `${name} body should not create horizontal overflow`
    ).toBeLessThanOrEqual(result.rootClientWidth + tolerance);

    expect(result.mainLeft, `${name} main should stay inside the left viewport edge`).toBeGreaterThanOrEqual(-tolerance);
    expect(result.mainRight, `${name} main should stay inside the right viewport edge`).toBeLessThanOrEqual(viewport.width + tolerance);
    expect(result.mainWidth, `${name} main should have visible width`).toBeGreaterThan(0);
  });
}
