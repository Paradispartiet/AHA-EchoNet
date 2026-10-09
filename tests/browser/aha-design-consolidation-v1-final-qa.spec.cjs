const { test, expect } = require("@playwright/test");

const SURFACES = [
  { name: "Home", path: "/index.html", shell: "main.aha-dashboard" },
  { name: "Chat", path: "/chat.html", shell: ".app-shell" },
  { name: "Mitt AHA", path: "/profile.html", shell: "main.aha-dashboard" },
  { name: "Notes", path: "/notes.html", shell: "main.aha-dashboard" },
  { name: "Feed", path: "/feed.html", shell: "main.aha-dashboard" },
  { name: "Gallery", path: "/gallery.html", shell: "main.aha-dashboard" },
  { name: "AHA Insta", path: "/insta.html", shell: "main.aha-dashboard" },
  { name: "AHA Music", path: "/music.html", shell: "main.aha-dashboard" },
  { name: "Search / Bibliotek", path: "/search.html", shell: "main.aha-dashboard" },
  { name: "Begrepslister", path: "/lists.html", shell: "main.aha-dashboard" },
  { name: "Kunnskapsstier", path: "/paths.html", shell: "main.aha-dashboard" },
  { name: "Tankekart", path: "/mindmap.html", shell: "main.aha-dashboard" },
  { name: "Personal AI", path: "/personal-ai.html", shell: "main.aha-dashboard" },
  { name: "Knowledge Workbench", path: "/knowledge-workbench.html", shell: "main.aha-dashboard" },
  { name: "History Go bridge", path: "/historygo.html", shell: "main.aha-dashboard" }
];

for (const surface of SURFACES) {
  test(`${surface.name} uses its canonical shell without horizontal overflow`, async ({ page }) => {
    await page.goto(surface.path, { waitUntil: "domcontentloaded" });

    const viewport = page.viewportSize();
    expect(viewport, "browser project should provide a viewport").not.toBeNull();

    const result = await page.evaluate((shellSelector) => {
      const shell = document.querySelector(shellSelector);
      const viewportMeta = document.querySelector('meta[name="viewport"]');
      const globalNav = document.getElementById("aha-global-nav");
      if (!shell) return { hasShell: false };

      const rect = shell.getBoundingClientRect();
      const root = document.documentElement;
      const body = document.body;

      return {
        hasShell: true,
        hasViewportMeta: Boolean(viewportMeta),
        hasGlobalNav: Boolean(globalNav),
        rootClientWidth: root.clientWidth,
        rootScrollWidth: root.scrollWidth,
        bodyScrollWidth: body.scrollWidth,
        shellLeft: rect.left,
        shellRight: rect.right,
        shellWidth: rect.width
      };
    }, surface.shell);

    expect(result.hasShell, `${surface.name} should render ${surface.shell}`).toBe(true);
    expect(result.hasViewportMeta, `${surface.name} should declare a mobile viewport`).toBe(true);
    expect(result.hasGlobalNav, `${surface.name} should render shared global navigation`).toBe(true);

    const tolerance = 2;
    expect(
      result.rootScrollWidth,
      `${surface.name} should not overflow the document horizontally`
    ).toBeLessThanOrEqual(result.rootClientWidth + tolerance);

    expect(
      result.bodyScrollWidth,
      `${surface.name} body should not create horizontal overflow`
    ).toBeLessThanOrEqual(result.rootClientWidth + tolerance);

    expect(result.shellLeft, `${surface.name} shell should stay inside the left viewport edge`).toBeGreaterThanOrEqual(-tolerance);
    expect(result.shellRight, `${surface.name} shell should stay inside the right viewport edge`).toBeLessThanOrEqual(viewport.width + tolerance);
    expect(result.shellWidth, `${surface.name} shell should have visible width`).toBeGreaterThan(0);
  });
}
