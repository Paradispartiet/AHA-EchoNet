const { test, expect } = require("@playwright/test");
const fs = require("node:fs");

function drawStroke(page) {
  return page.locator("#kunstrommet-canvas").evaluate((canvas) => {
    const rect = canvas.getBoundingClientRect();
    const point = (type, x, y) => canvas.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 7, pointerType: "pen",
      clientX: rect.left + x * rect.width, clientY: rect.top + y * rect.height,
      buttons: type === "pointerup" ? 0 : 1, pressure: type === "pointerup" ? 0 : .6
    }));
    point("pointerdown", .2, .2);
    point("pointermove", .5, .5);
    point("pointerup", .5, .5);
  });
}
function sample(page) {
  return page.locator("#kunstrommet-canvas").evaluate((canvas) =>
    Array.from(canvas.getContext("2d").getImageData(600, 400, 1, 1).data).slice(0, 3));
}

test.describe("Kunstrommet V2 – real layer editing", () => {
  test("paint in separate layers, toggle, reorder, lock, persist and restore", async ({ page }) => {
    await page.goto("/kunstrommet.html", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".kunstrommet-layer")).toHaveCount(1);
    await page.locator("#kunstrommet-title").fill("To lag");
    await page.locator("#kunstrommet-size").evaluate((input) => {
      input.value = "24";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await page.locator("#kunstrommet-color").evaluate((input) => {
      input.value = "#ff0000";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await drawStroke(page);
    expect(await sample(page)).toEqual([255, 0, 0]);

    await page.locator("#kunstrommet-layer-add").click();
    await expect(page.locator(".kunstrommet-layer")).toHaveCount(2);
    await page.locator("#kunstrommet-color").evaluate((input) => {
      input.value = "#0000ff";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await drawStroke(page);
    expect(await sample(page)).toEqual([0, 0, 255]);

    const top = page.locator(".kunstrommet-layer").first();
    await top.getByRole("button", { name: "Skjul Lag 2" }).click();
    expect(await sample(page)).toEqual([255, 0, 0]);
    await top.getByRole("button", { name: "Vis Lag 2" }).click();

    await top.getByRole("button", { name: "Flytt Lag 2 ned" }).click();
    expect(await sample(page)).toEqual([255, 0, 0]);
    // Selected Lag 2 moved below the red base layer. Restore it on top.
    await page.getByRole("button", { name: "Flytt Lag 2 opp" }).click();
    expect(await sample(page)).toEqual([0, 0, 255]);

    const opacity = page.getByRole("slider", { name: "Gjennomsiktighet for Lag 2" });
    await opacity.evaluate((input) => {
      input.value = "50";
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const mixed = await sample(page);
    expect(mixed[0]).toBeGreaterThan(90);
    expect(mixed[0]).toBeLessThan(175);
    expect(mixed[2]).toBeGreaterThan(90);
    expect(mixed[2]).toBeLessThan(175);

    await page.getByRole("button", { name: "Lås Lag 2", exact: true }).click();
    await drawStroke(page);
    await expect(page.locator("#kunstrommet-save-state")).toContainText("Velg et synlig, ulåst lag");
    await page.locator("#kunstrommet-save").click();
    await expect(page.locator("#kunstrommet-save-state")).toHaveText("Lagret på denne enheten");

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator(".kunstrommet-project button").filter({ hasText: "Åpne" }).click();
    await expect(page.locator(".kunstrommet-layer")).toHaveCount(2);
    expect(await sample(page)).toEqual(mixed);
    const saved = await page.evaluate(() => new Promise((resolve, reject) => {
      const open = indexedDB.open("aha_kunstrommet_v1", 1);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const q = open.result.transaction("projects", "readonly").objectStore("projects").getAll();
        q.onsuccess = () => resolve(q.result[0]);
        q.onerror = () => reject(q.error);
      };
    }));
    expect(saved.layers).toHaveLength(2);
    expect(saved.layers[1].locked).toBe(true);
    expect(saved.layers[1].opacity).toBe(.5);
    expect(saved.strokes).toHaveLength(2);
    expect(new Set(saved.strokes.map((stroke) => stroke.layerId)).size).toBe(2);

    const dl = page.waitForEvent("download");
    await page.locator("#kunstrommet-json").click();
    const exported = await dl;
    const project = JSON.parse(fs.readFileSync(await exported.path(), "utf8"));
    expect(project.format).toBe("aha-kunstrommet-v2");
    expect(project.layers).toHaveLength(2);

    await page.locator("#kunstrommet-new").click();
    await page.locator("#kunstrommet-import").setInputFiles({
      name: "atelier-v2.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(project))
    });
    await expect(page.locator(".kunstrommet-layer")).toHaveCount(2);
    expect(await sample(page)).toEqual(mixed);
    await expect(page.locator(".kunstrommet-project")).toHaveCount(2);
  });

  test("V1 JSON drawing imports into the first editable layer without losing strokes", async ({ page }) => {
    await page.goto("/kunstrommet.html", { waitUntil: "domcontentloaded" });
    await page.locator("#kunstrommet-import").setInputFiles({
      name: "legacy.json", mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({
        format: "aha-kunstrommet-v1", title: "Eldre skisse", note: "Trygg import",
        strokes: [{ color: "#112233", size: 12, points: [{ x: 1, y: 1 }, { x: 600, y: 400 }] }]
      }))
    });
    await expect(page.locator("#kunstrommet-title")).toHaveValue("Eldre skisse");
    await expect(page.locator(".kunstrommet-layer")).toHaveCount(1);
    const record = await page.evaluate(() => new Promise((resolve, reject) => {
      const open = indexedDB.open("aha_kunstrommet_v1", 1);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const q = open.result.transaction("projects", "readonly").objectStore("projects").getAll();
        q.onsuccess = () => resolve(q.result[0]);
        q.onerror = () => reject(q.error);
      };
    }));
    expect(record.strokes).toHaveLength(1);
    expect(record.layers).toHaveLength(1);
    expect(record.strokes[0].layerId).toBe(record.layers[0].id);
  });
});
