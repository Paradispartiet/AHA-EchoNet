const { test, expect } = require("@playwright/test");

async function stroke(page) {
  await page.locator("#kv2-canvas").evaluate((canvas) => {
    const box = canvas.getBoundingClientRect();
    const fire = (type) => canvas.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 61, pointerType: "pen",
      button: 0, buttons: type === "pointerup" ? 0 : 1, pressure: .5,
      clientX: box.left + box.width * .5, clientY: box.top + box.height * .5
    }));
    fire("pointerdown");
    fire("pointerup");
  });
}
async function pixel(page) {
  return page.locator("#kv2-canvas").evaluate((node) =>
    Array.from(node.getContext("2d").getImageData(600, 400, 1, 1).data));
}

test.describe("Kunstrommet V2 – isolated, local layer editor", () => {
  test("photo import, three editable layers, local save and reload", async ({ page }) => {
    await page.goto("/kunstrommet-v2.html", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#kv2-layer-count")).toContainText("1 av 8 lag");
    await page.locator("#kv2-title").fill("Personlig collage");
    await page.locator("#kv2-note").fill("Dette bildet forblir lokalt.");

    const pngUrl = await page.evaluate(() => {
      const source = document.createElement("canvas");
      source.width = 2; source.height = 2;
      const ctx = source.getContext("2d");
      ctx.fillStyle = "#ab342c"; ctx.fillRect(0, 0, 2, 2);
      return source.toDataURL("image/png");
    });
    await page.locator("#kv2-photo").setInputFiles({
      name: "foto.png", mimeType: "image/png",
      buffer: Buffer.from(pngUrl.split(",")[1], "base64")
    });
    await expect(page.locator("#kv2-layer-count")).toContainText("2 av 8 lag");
    await page.locator("#kv2-add-layer").click();
    await expect(page.locator("#kv2-layer-count")).toContainText("3 av 8 lag");
    await page.locator("#kv2-color").evaluate((input) => {
      input.value = "#1b58a6"; input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await stroke(page);
    await expect(page.locator("#kv2-status")).toHaveText("Ulagrede endringer");

    await page.locator("#kv2-save").click();
    await expect(page.locator("#kv2-status")).toHaveText("Lagret på denne enheten");
    const saved = await page.evaluate(() => new Promise((resolve, reject) => {
      const request = indexedDB.open("aha_kunstrommet_v2", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const getAll = request.result.transaction("projects", "readonly")
          .objectStore("projects").getAll();
        getAll.onsuccess = () => resolve(getAll.result);
        getAll.onerror = () => reject(getAll.error);
      };
    }));
    expect(saved).toHaveLength(1);
    expect(saved[0].layers).toHaveLength(3);
    expect(saved[0].layers[1].kind).toBe("image");
    expect(saved[0].layers.every((layer) => layer.bitmap.startsWith("data:image/png;base64,"))).toBe(true);
    expect(saved[0].local_only).toBe(true);
    expect(saved[0].shared).toBe(false);
    expect(saved[0].analyzed_image).toBe(false);
    expect(saved[0].note).toBe("Dette bildet forblir lokalt.");

    const download = page.waitForEvent("download");
    await page.locator("#kv2-json").click();
    const exported = await download;
    expect(exported.suggestedFilename()).toMatch(/personlig-collage\.kunstrommet\.json$/);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator(".kv2-project")).toHaveCount(1);
    await page.locator(".kv2-project button").click();
    await expect(page.locator("#kv2-layer-count")).toContainText("3 av 8 lag");
    await expect(page.locator("#kv2-title")).toHaveValue("Personlig collage");
    await expect(page.locator("#kv2-note")).toHaveValue("Dette bildet forblir lokalt.");
  });

  test("transparent eraser affects only active layer; undo restores pixels", async ({ page }) => {
    await page.goto("/kunstrommet-v2.html", { waitUntil: "domcontentloaded" });
    await page.locator("#kv2-size").evaluate((input) => {
      input.value = "40"; input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.locator("#kv2-color").evaluate((input) => {
      input.value = "#1b58a6"; input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await stroke(page);
    let p = await pixel(page);
    expect(p[2]).toBeGreaterThan(p[0]);
    await page.locator("#kv2-add-layer").click();
    await page.locator("#kv2-color").evaluate((input) => {
      input.value = "#dc3127"; input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await stroke(page);
    p = await pixel(page);
    expect(p[0]).toBeGreaterThan(p[2]);
    await page.locator("#kv2-eraser").click();
    await stroke(page);
    p = await pixel(page);
    expect(p[2]).toBeGreaterThan(p[0]);
    await page.locator("#kv2-undo").click();
    await expect.poll(async () => (await pixel(page))[0]).toBe(220);
    await page.locator("#kv2-redo").click();
    await expect.poll(async () => (await pixel(page))[2]).toBe(166);
  });

  test("manual V1 project JSON import never touches V1 database", async ({ page }) => {
    await page.goto("/kunstrommet-v2.html", { waitUntil: "domcontentloaded" });
    await page.locator("#kv2-import").setInputFiles({
      name: "v1.json", mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({
        format: "aha-kunstrommet-v1", title: "Eldre skisse", note: "V1 original",
        strokes: [{ color: "#1266a5", size: 18, points: [{ x: 500, y: 400 }, { x: 600, y: 400 }] }]
      }))
    });
    await expect(page.locator("#kv2-title")).toHaveValue("Eldre skisse");
    await expect(page.locator("#kv2-layer-count")).toContainText("1 av 8 lag");
    await expect(page.locator("#kv2-status")).toContainText("Importert");
    await page.locator("#kv2-save").click();
    await expect(page.locator("#kv2-status")).toHaveText("Lagret på denne enheten");
    const databaseNames = await page.evaluate(async () =>
      typeof indexedDB.databases === "function" ? (await indexedDB.databases()).map((db) => db.name) : []);
    if (databaseNames.length) {
      expect(databaseNames).toContain("aha_kunstrommet_v2");
      expect(databaseNames).not.toContain("aha_kunstrommet_v1");
    }
  });
});
