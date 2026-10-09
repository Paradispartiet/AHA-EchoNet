const { test, expect } = require("@playwright/test");

const SURFACES = [
  {
    name: "Notes", path: "/notes.html", mount: "#notes-list", api: "AHANotes",
    target: "#note-text", title: "Begynn med en tanke",
    record: { id: "test_note", title: "Prøvenotat", text: "Et lokalt notat" },
    filled: "Prøvenotat"
  },
  {
    name: "Feed", path: "/feed.html", mount: "#feed-list", api: "AHAFeed",
    target: "#feed-text", title: "Ingen oppdateringer ennå",
    record: { id: "test_post", text: "En lokal prøvepost" },
    filled: "En lokal prøvepost"
  },
  {
    name: "Galleri", path: "/gallery.html", mount: "#gallery-list", api: "AHAGallery",
    target: "#gallery-title", title: "Samle det du vil huske",
    record: { id: "test_gallery", title: "Prøveminne", src: "", description: "Et visuelt minne" },
    filled: "Prøveminne"
  }
];

for (const surface of SURFACES) {
  test(`${surface.name} shows a useful first-run action and returns to filled content`, async ({ page }) => {
    await page.goto(surface.path, { waitUntil: "domcontentloaded" });
    const mount = page.locator(surface.mount);
    const empty = mount.locator('[data-empty-state="no_data"]');
    await expect(empty).toBeVisible();
    await expect(empty.getByRole("heading", { name: surface.title })).toBeVisible();
    await expect(empty.getByRole("link")).toHaveAttribute("href", surface.target);
    await expect(page.locator(surface.target)).toHaveCount(1);

    await page.evaluate(({ api, record }) => window[api].render([record]), surface);
    await expect(mount).toContainText(surface.filled);
    await expect(empty).toHaveCount(0);

    await page.evaluate(({ api }) => window[api].render([]), surface);
    await expect(empty).toBeVisible();

    const overflow = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.width + 2);
  });
}
