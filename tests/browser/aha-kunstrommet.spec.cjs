const { test, expect } = require("@playwright/test");

test.describe("Kunstrommet – personal, local-only atelier", () => {
  test("pointer drawing, manual save, reload and local export/import", async ({ page }) => {
    await page.goto("/kunstrommet.html", { waitUntil: "domcontentloaded" });
    const canvas = page.locator("#kunstrommet-canvas");
    await expect(canvas).toBeVisible();
    await expect(page.locator("#kunstrommet-save-state")).toContainText("Ny skisse");

    await page.locator("#kunstrommet-title").fill("Mitt første verk");
    await page.locator("#kunstrommet-note").fill("En idé som bare er min");
    await page.locator('#kunstrommet-palette [data-kunstrommet-color="#4b81ab"]').click();
    await expect(page.locator("#kunstrommet-color")).toHaveValue("#4b81ab");

    // Synthetic PointerEvent works on both Chromium and iPad WebKit.
    // Physical touch/Apple Pencil verification is still a separate release gate.
    await canvas.evaluate((node) => {
      const rect = node.getBoundingClientRect();
      const send = (type, x, y) => node.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 17,
        pointerType: "pen",
        clientX: rect.left + rect.width * x,
        clientY: rect.top + rect.height * y,
        buttons: type === "pointerup" ? 0 : 1,
        pressure: type === "pointerup" ? 0 : 0.5
      }));
      send("pointerdown", .2, .3);
      send("pointermove", .3, .4);
      send("pointermove", .4, .5);
      send("pointerup", .4, .5);
    });

    await expect(page.locator("#kunstrommet-save-state")).toHaveText("Ikke lagret");
    await page.locator("#kunstrommet-save").click();
    await expect(page.locator("#kunstrommet-save-state")).toHaveText("Lagret på denne enheten");
    await expect(page.locator(".kunstrommet-project")).toHaveCount(1);

    const saved = await page.evaluate(() => new Promise((resolve, reject) => {
      const request = indexedDB.open("aha_kunstrommet_v1", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const transaction = request.result.transaction("projects", "readonly");
        const all = transaction.objectStore("projects").getAll();
        all.onsuccess = () => resolve(all.result);
        all.onerror = () => reject(all.error);
      };
    }));
    expect(saved).toHaveLength(1);
    expect(saved[0].title).toBe("Mitt første verk");
    expect(saved[0].strokes).toHaveLength(1);
    expect(saved[0].strokes[0].points.length).toBeGreaterThan(1);
    expect(saved[0].local_only).toBe(true);
    expect(saved[0].shared).toBe(false);
    expect(saved[0].analyzed_image).toBe(false);
    expect(saved[0].last_ingested_at).toBeUndefined();

    const downloadPromise = page.waitForEvent("download");
    await page.locator("#kunstrommet-json").click();
    const exported = await downloadPromise;
    expect(exported.suggestedFilename()).toMatch(/mitt-første-verk\.json$/);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator(".kunstrommet-project")).toHaveCount(1);
    await page.locator(".kunstrommet-project button").filter({ hasText: "Åpne" }).click();
    await expect(page.locator("#kunstrommet-title")).toHaveValue("Mitt første verk");

    await page.locator("#kunstrommet-new").click();
    await page.locator("#kunstrommet-import").setInputFiles({
      name: "importert-prosjekt.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({
        format: "aha-kunstrommet-v1",
        title: "Importert arbeid",
        note: "Min andre skisse",
        strokes: [{ color: "#112233", size: 6, points: [{ x: 11, y: 11 }, { x: 99, y: 99 }] }]
      }))
    });
    await expect(page.locator(".kunstrommet-project")).toHaveCount(2);
    await expect(page.locator("#kunstrommet-title")).toHaveValue("Importert arbeid");
  });

  test("Aha text import is opt-in and drawing never triggers it", async ({ page }) => {
    await page.goto("/kunstrommet.html", { waitUntil: "domcontentloaded" });
    await page.locator("#kunstrommet-title").fill("Personlig idé");
    await page.locator("#kunstrommet-save").click();
    await expect(page.locator("#kunstrommet-save-state")).toHaveText("Lagret på denne enheten");

    const stored = await page.evaluate(() => new Promise((resolve, reject) => {
      const req = indexedDB.open("aha_kunstrommet_v1", 1);
      req.onsuccess = () => {
        const all = req.result.transaction("projects", "readonly").objectStore("projects").getAll();
        all.onsuccess = () => resolve(all.result);
        all.onerror = () => reject(all.error);
      };
      req.onerror = () => reject(req.error);
    }));
    expect(stored).toHaveLength(1);
    expect(stored[0].last_ingested_at).toBeUndefined();
    await expect(page.locator("#kunstrommet-aha-state"))
      .toContainText("Ingenting sendes uten");
  });
});
