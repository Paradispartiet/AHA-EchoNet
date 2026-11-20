const { test, expect } = require("@playwright/test");
const fs = require("node:fs/promises");

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
    await page.goto("/kunstrommet.html", { waitUntil: "domcontentloaded" });
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
    expect(saved[0].preview).toMatch(/^data:image\/png;base64,/);
    await expect(page.locator("#kv2-projects .kv2-project-preview")).toHaveCount(1);
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
    await page.locator(".kv2-project").getByRole("button", { name: "Åpne", exact: true }).click();
    await expect(page.locator("#kv2-layer-count")).toContainText("3 av 8 lag");
    await expect(page.locator("#kv2-title")).toHaveValue("Personlig collage");
    await expect(page.locator("#kv2-note")).toHaveValue("Dette bildet forblir lokalt.");
  });

  test("transparent eraser affects only active layer; undo restores pixels", async ({ page }) => {
    await page.goto("/kunstrommet.html", { waitUntil: "domcontentloaded" });
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

  test("storage quota failure offers backup and retry without losing editable work", async ({ page }) => {
    await page.goto("/kunstrommet.html", { waitUntil: "domcontentloaded" });
    await page.locator("#kv2-title").fill("Kvotetest");
    await page.locator("#kv2-note").fill("Dette må kunne reddes uten lagring.");

    // Simulate the browser refusing an IndexedDB write with a quota error.
    await page.evaluate(() => {
      const originalPut = IDBObjectStore.prototype.put;
      Object.defineProperty(IDBObjectStore.prototype, "put", {
        configurable: true,
        writable: true,
        value() { throw new DOMException("Kvoten er brukt opp (test)", "QuotaExceededError"); }
      });
      window.restoreKunstrommetPut = () => {
        Object.defineProperty(IDBObjectStore.prototype, "put", {
          configurable: true, writable: true, value: originalPut
        });
      };
    });

    await page.locator("#kv2-save").click();
    await expect(page.locator("#kv2-status")).toContainText("Lagringsplassen er full");
    await expect(page.locator("#kv2-status")).toContainText("Eksporter redigerbart prosjekt");
    await expect(page.locator("#kv2-projects .kv2-project--saved")).toHaveCount(0);
    await expect(page.locator("#kv2-note")).toHaveValue("Dette må kunne reddes uten lagring.");

    const downloadPromise = page.waitForEvent("download");
    await page.locator("#kv2-json").click();
    expect((await downloadPromise).suggestedFilename()).toMatch(/kvotetest\.kunstrommet\.json$/);

    await page.evaluate(() => window.restoreKunstrommetPut());
    await page.locator("#kv2-save").click();
    await expect(page.locator("#kv2-status")).toHaveText("Lagret på denne enheten");
    await expect(page.locator("#kv2-projects .kv2-project--saved")).toHaveCount(1);
  });

  test("Pencil pressure changes brush width without changing mouse or eraser behavior", async ({ page }) => {
    await page.goto("/kunstrommet.html", { waitUntil: "domcontentloaded" });
    await page.locator("#kv2-size").evaluate((input) => {
      input.value = "30";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.locator("#kv2-color").evaluate((input) => {
      input.value = "#000000";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const heights = await page.locator("#kv2-canvas").evaluate((canvas) => {
      const rect = canvas.getBoundingClientRect();
      function dot(x, pressure, pointerType, pointerId) {
        const event = {
          bubbles: true, cancelable: true, pointerId, pointerType,
          button: 0, buttons: 1, pressure, isPrimary: true,
          clientX: rect.left + rect.width * x / 1200,
          clientY: rect.top + rect.height * 400 / 800
        };
        canvas.dispatchEvent(new PointerEvent("pointerdown", event));
        canvas.dispatchEvent(new PointerEvent("pointerup", { ...event, buttons: 0, pressure: 0 }));
      }
      dot(200, 0.2, "pen", 201);
      dot(500, 0.9, "pen", 202);
      dot(800, 0.9, "mouse", 203);
      const ctx = canvas.getContext("2d");
      const countInk = (x) => {
        const data = ctx.getImageData(x, 365, 1, 70).data;
        let count = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i] < 100 && data[i + 1] < 100 && data[i + 2] < 100) count++;
        }
        return count;
      };
      return { light: countInk(200), firm: countInk(500), mouse: countInk(800) };
    });
    expect(heights.firm).toBeGreaterThan(heights.light + 10);
    expect(heights.mouse).toBeGreaterThan(heights.light);
    expect(heights.mouse).toBeLessThan(heights.firm);
    await expect(page.locator("#kv2-status")).toHaveText("Ulagrede endringer");
  });

  test("zoom and hand-pan change only the view, never the art or edit history", async ({ page }) => {
    await page.goto("/kunstrommet.html", { waitUntil: "domcontentloaded" });
    const original = await page.locator("#kv2-canvas").evaluate((canvas) => canvas.toDataURL("image/png"));
    await expect(page.locator("#kv2-zoom-value")).toHaveText("100%");
    await page.locator("#kv2-zoom-in").click();
    await page.locator("#kv2-zoom-in").click();
    await page.locator("#kv2-zoom-in").click();
    await expect(page.locator("#kv2-zoom-value")).toHaveText("200%");
    await expect(page.locator("#kv2-canvas")).toHaveCSS("width", /[1-9]/);
    await page.locator("#kv2-hand").click();
    await expect(page.locator("#kv2-hand")).toHaveAttribute("aria-pressed", "true");
    const scroll = await page.locator("#kv2-canvas").evaluate((canvas) => {
      const paper = document.getElementById("kv2-paper");
      // Force a bounded viewport so both scroll axes are testable at all CI sizes.
      // A normal tall desktop viewport may have no vertical overflow at 200%.
      paper.style.height = "240px";
      paper.style.maxHeight = "240px";
      paper.scrollLeft = 40;
      paper.scrollTop = 40;
      const start = { left: paper.scrollLeft, top: paper.scrollTop };
      const overflow = {
        horizontal: paper.scrollWidth - paper.clientWidth,
        vertical: paper.scrollHeight - paper.clientHeight
      };
      const event = {
        bubbles: true, cancelable: true, pointerId: 73, pointerType: "touch",
        button: 0, buttons: 1, clientX: 410, clientY: 310
      };
      canvas.dispatchEvent(new PointerEvent("pointerdown", event));
      canvas.dispatchEvent(new PointerEvent("pointermove", {
        ...event, clientX: 350, clientY: 260
      }));
      canvas.dispatchEvent(new PointerEvent("pointerup", {
        ...event, buttons: 0, clientX: 350, clientY: 260
      }));
      return { start, overflow, end: { left: paper.scrollLeft, top: paper.scrollTop } };
    });
    expect(scroll.overflow.horizontal).toBeGreaterThan(120);
    expect(scroll.overflow.vertical).toBeGreaterThan(120);
    expect(scroll.end.left).toBeGreaterThan(scroll.start.left);
    expect(scroll.end.top).toBeGreaterThan(scroll.start.top);
    await expect(page.locator("#kv2-status")).toHaveText("Nytt prosjekt");
    expect(await page.locator("#kv2-canvas").evaluate((c) => c.toDataURL("image/png"))).toBe(original);
    await page.locator("#kv2-zoom-reset").click();
    await expect(page.locator("#kv2-zoom-value")).toHaveText("100%");
    await expect(page.locator("#kv2-status")).toHaveText("Nytt prosjekt");
  });

  test("brush lands at the correct bitmap coordinate after hand-pan and zoom", async ({ page }) => {
    await page.goto("/kunstrommet.html", { waitUntil: "domcontentloaded" });
    for (let i = 0; i < 3; i++) await page.locator("#kv2-zoom-in").click();
    await expect(page.locator("#kv2-zoom-value")).toHaveText("200%");
    await page.locator("#kv2-hand").click();

    const pan = await page.locator("#kv2-canvas").evaluate((canvas) => {
      const paper = document.getElementById("kv2-paper");
      paper.style.height = "240px";
      paper.style.maxHeight = "240px";
      paper.scrollLeft = 100;
      paper.scrollTop = 70;
      const start = { x: paper.scrollLeft, y: paper.scrollTop };
      const bounds = paper.getBoundingClientRect();
      const event = {
        bubbles: true, cancelable: true, pointerId: 107, pointerType: "touch",
        button: 0, buttons: 1,
        clientX: bounds.left + paper.clientWidth / 2,
        clientY: bounds.top + paper.clientHeight / 2
      };
      canvas.dispatchEvent(new PointerEvent("pointerdown", event));
      canvas.dispatchEvent(new PointerEvent("pointermove", {
        ...event, clientX: event.clientX - 45, clientY: event.clientY - 35
      }));
      canvas.dispatchEvent(new PointerEvent("pointerup", {
        ...event, buttons: 0, clientX: event.clientX - 45, clientY: event.clientY - 35
      }));
      return { start, end: { x: paper.scrollLeft, y: paper.scrollTop } };
    });
    expect(pan.end.x).toBeGreaterThan(pan.start.x);
    expect(pan.end.y).toBeGreaterThan(pan.start.y);
    await expect(page.locator("#kv2-status")).toHaveText("Nytt prosjekt");

    await page.locator("#kv2-brush").click();
    const target = await page.locator("#kv2-canvas").evaluate((canvas) => {
      const paper = document.getElementById("kv2-paper");
      const visible = paper.getBoundingClientRect();
      const bounds = canvas.getBoundingClientRect();
      // Use the visible center, which remains inside the canvas after scrolling.
      const clientX = visible.left + paper.clientWidth / 2;
      const clientY = visible.top + paper.clientHeight / 2;
      const x = Math.round((clientX - bounds.left) * canvas.width / bounds.width);
      const y = Math.round((clientY - bounds.top) * canvas.height / bounds.height);
      const event = {
        bubbles: true, cancelable: true, pointerId: 108, pointerType: "pen",
        button: 0, buttons: 1, pressure: 0.6, clientX, clientY
      };
      canvas.dispatchEvent(new PointerEvent("pointerdown", event));
      canvas.dispatchEvent(new PointerEvent("pointerup", {
        ...event, buttons: 0, pressure: 0
      }));
      return { x, y };
    });
    expect(target.x).toBeGreaterThan(0);
    expect(target.x).toBeLessThan(1200);
    expect(target.y).toBeGreaterThan(0);
    expect(target.y).toBeLessThan(800);
    const redAtTarget = () => page.locator("#kv2-canvas").evaluate(
      (canvas, pos) => canvas.getContext("2d").getImageData(pos.x, pos.y, 1, 1).data[0],
      target
    );
    await expect.poll(redAtTarget).toBeLessThan(100);
    await expect(page.locator("#kv2-status")).toHaveText("Ulagrede endringer");
    await page.locator("#kv2-undo").click();
    await expect.poll(redAtTarget).toBeGreaterThan(220);
    await expect(page.locator("#kv2-zoom-value")).toHaveText("200%");
  });

  test("editable JSON backup restores all layer bitmaps after zoom", async ({ page }) => {
    await page.goto("/kunstrommet.html", { waitUntil: "domcontentloaded" });
    await page.locator("#kv2-title").fill("Sikkerhetskopi av atelier");
    await page.locator("#kv2-note").fill("To tegnebaserte lag skal beholdes.");
    await page.locator("#kv2-color").evaluate((input) => {
      input.value = "#0b468e";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await stroke(page);
    await page.locator("#kv2-add-layer").click();
    await page.locator("#kv2-color").evaluate((input) => {
      input.value = "#e44329";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await stroke(page);
    await expect(page.locator("#kv2-layer-count")).toContainText("2 av 8 lag");
    // Observe each source layer at the exact PNG serialization boundary.
    // Diagnostic only: do not change the saved format or weaken pixel assertions.
    await page.evaluate(() => {
      const original = HTMLCanvasElement.prototype.toDataURL;
      window.__kunstBackupLayerPixels = [];
      HTMLCanvasElement.prototype.toDataURL = function (...args) {
        if (this.width === 1200 && this.height === 800 &&
            this.id !== "kv2-canvas" && args[0] === "image/png") {
          const pixels = this.getContext("2d").getImageData(0, 0, this.width, this.height).data;
          window.__kunstBackupLayerPixels.push(new Uint8ClampedArray(pixels));
        }
        return original.apply(this, args);
      };
    });
    // Compare actual canvas pixels after import. WebKit can encode identical
    // pixels into a different PNG/Base64 stream after a decode/re-encode.
    await page.locator("#kv2-canvas").evaluate((canvas) => {
      window.__kunstBeforeBackup = new Uint8ClampedArray(
        canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data
      );
    });
    await page.locator("#kv2-zoom-in").click();
    await page.locator("#kv2-zoom-in").click();
    await page.locator("#kv2-zoom-in").click();
    await expect(page.locator("#kv2-zoom-value")).toHaveText("200%");

    const exportPromise = page.waitForEvent("download");
    await page.locator("#kv2-json").click();
    const exported = await exportPromise;
    const json = await fs.readFile(await exported.path(), "utf8");
    const backup = JSON.parse(json);
    expect(backup.format).toBe("aha-kunstrommet-v2");
    expect(backup.layers).toHaveLength(2);
    expect(backup.note).toBe("To tegnebaserte lag skal beholdes.");
    expect(backup.layers.every((layer) => layer.bitmap.startsWith("data:image/png;base64,"))).toBe(true);

    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#kv2-new").click();
    await page.locator("#kv2-import").setInputFiles({
      name: "backup.kunstrommet.json",
      mimeType: "application/json",
      buffer: Buffer.from(json, "utf8")
    });
    await expect(page.locator("#kv2-title")).toHaveValue("Sikkerhetskopi av atelier");
    await expect(page.locator("#kv2-note")).toHaveValue("To tegnebaserte lag skal beholdes.");
    await expect(page.locator("#kv2-layer-count")).toContainText("2 av 8 lag");
    await expect(page.locator("#kv2-status")).toContainText("Importert");
    // Trigger the same layer snapshot a second time, then compare raw pixels.
    // Capturing the layers reveals whether the mismatch precedes compositing.
    const diagnosticDownload = page.waitForEvent("download");
    await page.locator("#kv2-json").click();
    await diagnosticDownload;
    const layerDiagnostics = await page.evaluate(() => {
      const all = window.__kunstBackupLayerPixels;
      const count = all.length / 2;
      return Array.from({ length: count }, (_, layerIndex) => {
        const before = all[layerIndex];
        const after = all[layerIndex + count];
        let differentChannels = 0;
        let maxChannelDifference = 0;
        const examples = [];
        for (let i = 0; i < before.length; i++) {
          const delta = Math.abs(before[i] - after[i]);
          if (!delta) continue;
          differentChannels++;
          maxChannelDifference = Math.max(maxChannelDifference, delta);
          if (examples.length < 8) examples.push({
            x: Math.floor(i / 4) % 1200, y: Math.floor(i / 4 / 1200),
            channel: i % 4, before: before[i], after: after[i]
          });
        }
        return { layerIndex, differentChannels, maxChannelDifference, examples };
      });
    });
    console.log("Kunstrommet backup layer pixel diagnostics: " + JSON.stringify(layerDiagnostics));
    const pixelDifference = await page.locator("#kv2-canvas").evaluate((canvas) => {
      const previous = window.__kunstBeforeBackup;
      const current = canvas.getContext("2d").getImageData(
        0, 0, canvas.width, canvas.height
      ).data;
      let differentChannels = 0;
      let maxChannelDifference = 0;
      for (let i = 0; i < current.length; i++) {
        const difference = Math.abs(current[i] - previous[i]);
        if (difference) differentChannels++;
        maxChannelDifference = Math.max(maxChannelDifference, difference);
      }
      return { differentChannels, maxChannelDifference, totalChannels: current.length };
    });
    expect(pixelDifference.totalChannels).toBe(1200 * 800 * 4);
    expect(pixelDifference).toMatchObject({
      differentChannels: 0, maxChannelDifference: 0
    });

    await page.locator("#kv2-save").click();
    await expect(page.locator("#kv2-status")).toHaveText("Lagret på denne enheten");
    const rows = await page.evaluate(() => new Promise((resolve, reject) => {
      const request = indexedDB.open("aha_kunstrommet_v2", 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const query = request.result.transaction("projects", "readonly")
          .objectStore("projects").getAll();
        query.onsuccess = () => resolve(query.result);
        query.onerror = () => reject(query.error);
      };
    }));
    expect(rows).toHaveLength(1);
    expect(rows[0].layers).toHaveLength(2);
    expect(rows[0].layers.every((layer) => layer.bitmap.startsWith("data:image/png;base64,"))).toBe(true);
  });

  test("invalid exact-pixel metadata rejects import without replacing open artwork", async ({ page }) => {
    await page.goto("/kunstrommet.html", { waitUntil: "domcontentloaded" });
    await page.locator("#kv2-title").fill("Original som ikke skal erstattes");
    await stroke(page);
    const originalPixel = await pixel(page);
    const exportPromise = page.waitForEvent("download");
    await page.locator("#kv2-json").click();
    const exported = JSON.parse(await fs.readFile(await (await exportPromise).path(), "utf8"));

    const invalidCorrections = [
      Buffer.from([1, 2, 3]).toString("base64"), // truncated RGBA record
      Buffer.from([
        0, 0, 0, 0, 1, 2, 3, 128,
        0, 0, 0, 0, 1, 2, 3, 128
      ]).toString("base64") // repeated pixel index
    ];
    for (const [i, invalid] of invalidCorrections.entries()) {
      const corrupted = structuredClone(exported);
      corrupted.layers[0].pixelFixups = invalid;
      page.once("dialog", (dialog) => dialog.accept());
      await page.locator("#kv2-import").setInputFiles({
        name: "corrupt-" + i + ".kunstrommet.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(corrupted), "utf8")
      });
      await expect(page.locator("#kv2-status")).toContainText("Import feilet");
      await expect(page.locator("#kv2-title")).toHaveValue("Original som ikke skal erstattes");
      await expect(page.locator("#kv2-layer-count")).toContainText("1 av 8 lag");
      expect(await pixel(page)).toEqual(originalPixel);
    }
  });

  test("marquee keeps document clean, clips drawing and exports exact cropped PNG", async ({ page }) => {
    await page.goto("/kunstrommet.html", { waitUntil: "domcontentloaded" });
    const canvas = page.locator("#kv2-canvas");
    await page.locator("#kv2-select").click();
    await canvas.evaluate((node) => {
      const b = node.getBoundingClientRect();
      const send = (type, x, y, buttons) => node.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerType: "mouse", pointerId: 101,
        button: 0, buttons, clientX: b.left + x * b.width,
        clientY: b.top + y * b.height
      }));
      send("pointerdown", .4, .4, 1);
      send("pointermove", .6, .6, 1);
      send("pointerup", .6, .6, 0);
    });
    await expect(page.locator("#kv2-selection-overlay")).toBeVisible();
    await expect(page.locator("#kv2-status")).toContainText("Område markert");
    expect(await page.evaluate(() => document.querySelector("#kv2-title").value)).toBe("");
    const dl = page.waitForEvent("download");
    await page.locator("#kv2-export-selection").click();
    const file = await dl;
    const png = await fs.readFile(await file.path());
    expect(png.toString("ascii", 1, 4)).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(240);
    expect(png.readUInt32BE(20)).toBe(160);

    await page.locator("#kv2-color").evaluate((el) => {
      el.value = "#000000"; el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.locator("#kv2-size").evaluate((el) => {
      el.value = "50"; el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await canvas.evaluate((node) => {
      const b = node.getBoundingClientRect();
      const clickAt = (x, y, id) => ["pointerdown", "pointerup"].forEach((type) => {
        node.dispatchEvent(new PointerEvent(type, {
          bubbles: true, cancelable: true, pointerType: "mouse", pointerId: id,
          button: 0, buttons: type === "pointerup" ? 0 : 1,
          clientX: b.left + x * b.width, clientY: b.top + y * b.height
        }));
      });
      clickAt(.5, .5, 103);
      clickAt(.75, .75, 104);
    });
    const colors = await canvas.evaluate((node) => {
      const ctx = node.getContext("2d");
      return {
        inside: Array.from(ctx.getImageData(600, 400, 1, 1).data),
        outside: Array.from(ctx.getImageData(900, 600, 1, 1).data)
      };
    });
    expect(colors.inside[0]).toBeLessThan(100);
    expect(colors.outside.slice(0, 3)).toEqual([255, 255, 255]);
    await page.locator("#kv2-clear-selection").click();
    await expect(page.locator("#kv2-selection-overlay")).toBeHidden();
  });

  test("crop only the selected layer, undo, duplicate and transform", async ({ page }) => {
    await page.goto("/kunstrommet.html", { waitUntil: "domcontentloaded" });
    const canvas = page.locator("#kv2-canvas");
    await page.locator("#kv2-size").evaluate((el) => {
      el.value = "60"; el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const dot = async (x, y, id) => canvas.evaluate((node, args) => {
      const b = node.getBoundingClientRect();
      for (const type of ["pointerdown", "pointerup"]) {
        node.dispatchEvent(new PointerEvent(type, {
          bubbles: true, cancelable: true, pointerType: "mouse", pointerId: args.id,
          button: 0, buttons: type === "pointerup" ? 0 : 1,
          clientX: b.left + args.x * b.width, clientY: b.top + args.y * b.height
        }));
      }
    }, { x, y, id });
    const readPixel = async (x, y) => canvas.evaluate((node, pos) =>
      Array.from(node.getContext("2d").getImageData(pos.x, pos.y, 1, 1).data),
    { x, y });

    await page.locator("#kv2-color").evaluate((el) => {
      el.value = "#123abc"; el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await dot(.75, .75, 201); // blue underlying layer
    await page.locator("#kv2-add-layer").click();
    await page.locator("#kv2-color").evaluate((el) => {
      el.value = "#df3125"; el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await dot(.75, .75, 202);
    await dot(.5, .5, 203);
    const before = await readPixel(900, 600);
    expect(before[0]).toBeGreaterThan(before[2]);

    await page.locator("#kv2-select").click();
    await canvas.evaluate((node) => {
      const b = node.getBoundingClientRect();
      for (const [type, x, y, buttons] of [
        ["pointerdown", .4, .4, 1], ["pointermove", .6, .6, 1], ["pointerup", .6, .6, 0]
      ]) node.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerType: "mouse", pointerId: 204, button: 0,
        buttons, clientX: b.left + x * b.width, clientY: b.top + y * b.height
      }));
    });
    await page.locator("#kv2-crop-layer").click();
    const cropped = await readPixel(900, 600);
    expect(cropped[2]).toBeGreaterThan(cropped[0]); // blue layer remains
    await page.locator("#kv2-undo").click();
    await expect.poll(async () => (await readPixel(900, 600))[0]).toBe(before[0]);

    await page.locator("#kv2-duplicate-layer").click();
    await expect(page.locator("#kv2-layer-count")).toContainText("3 av 8 lag");
    await page.locator("#kv2-clear-selection").click();
    for (const id of ["kv2-transform-flip", "kv2-transform-rotate",
      "kv2-transform-smaller", "kv2-transform-larger"]) {
      await page.locator("#" + id).click();
      await expect(page.locator("#kv2-status")).toHaveText("Ulagrede endringer");
    }
    await page.locator("#kv2-undo").click();
    await expect(page.locator("#kv2-layer-count")).toContainText("3 av 8 lag");
  });

  test("copy selection creates an independent layer, leaves the original and supports undo", async ({ page }) => {
    await page.goto("/kunstrommet.html", { waitUntil: "domcontentloaded" });
    const canvas = page.locator("#kv2-canvas");
    const pointer = (a) => canvas.evaluate((node, v) => {
      const b = node.getBoundingClientRect();
      const fire = (type, x, y, buttons) => node.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerType: "mouse", pointerId: v.id,
        button: 0, buttons, clientX: b.left + x * b.width,
        clientY: b.top + y * b.height
      }));
      fire("pointerdown", v.x0, v.y0, 1);
      fire("pointermove", v.x1, v.y1, 1);
      fire("pointerup", v.x1, v.y1, 0);
    }, a);
    const read = (x, y) => canvas.evaluate((node, at) =>
      Array.from(node.getContext("2d").getImageData(at.x, at.y, 1, 1).data), { x, y });
    const color = async (value) => page.locator("#kv2-color").evaluate((el, value) => {
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
    const record = async () => {
      const waiting = page.waitForEvent("download");
      await page.locator("#kv2-json").click();
      return JSON.parse(await fs.readFile(await (await waiting).path(), "utf8"));
    };

    await color("#a12b3c");
    await pointer({ x0: .5, y0: .5, x1: .5, y1: .5, id: 701 });
    await color("#2d8aeb");
    await pointer({ x0: .75, y0: .75, x1: .75, y1: .75, id: 702 });
    const original = await record();
    await expect(page.locator("#kv2-copy-selection")).toBeDisabled();

    await page.locator("#kv2-select").click();
    await pointer({ x0: .4, y0: .4, x1: .6, y1: .6, id: 703 });
    await expect(page.locator("#kv2-copy-selection")).toBeEnabled();
    await page.locator("#kv2-copy-selection").click();
    await expect(page.locator("#kv2-layer-count")).toContainText("2 av 8 lag");
    await expect(page.locator("#kv2-active-layer")).toContainText("utsnitt");
    const copied = await record();
    expect(copied.layers[0].bitmap).toBe(original.layers[0].bitmap);
    expect(copied.layers[1].x).toBe(0);
    expect(copied.layers[1].y).toBe(0);

    await page.locator("#kv2-undo").click();
    await expect(page.locator("#kv2-layer-count")).toContainText("1 av 8 lag");
    expect((await read(600, 400)).slice(0, 3)).toEqual([161, 43, 60]);
    expect((await read(900, 600)).slice(0, 3)).toEqual([45, 138, 235]);
    await page.locator("#kv2-redo").click();
    await expect(page.locator("#kv2-layer-count")).toContainText("2 av 8 lag");

    // Hide the untouched source layer; only pixels inside the selection remain.
    await page.locator("#kv2-layers .kv2-layer").last().locator("button").first().click();
    expect((await read(600, 400)).slice(0, 3)).toEqual([161, 43, 60]);
    expect((await read(900, 600)).slice(0, 3)).toEqual([255, 255, 255]);

    // The limit applies to copies as well as to manually added layers.
    for (let i = 0; i < 6; i++) await page.locator("#kv2-add-layer").click();
    await expect(page.locator("#kv2-layer-count")).toContainText("8 av 8 lag");
    await expect(page.locator("#kv2-copy-selection")).toBeDisabled();
  });

  test("copy selection from a moved layer preserves its document position", async ({ page }) => {
    await page.goto("/kunstrommet.html", { waitUntil: "domcontentloaded" });
    const canvas = page.locator("#kv2-canvas");
    const drag = (v) => canvas.evaluate((node, v) => {
      const b = node.getBoundingClientRect();
      const send = (type, x, y, buttons) => node.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerType: "mouse", pointerId: v.id,
        button: 0, buttons, clientX: b.left + x * b.width,
        clientY: b.top + y * b.height
      }));
      send("pointerdown", v.x0, v.y0, 1);
      send("pointermove", v.x1, v.y1, 1);
      send("pointerup", v.x1, v.y1, 0);
    }, v);
    const pixelRed = (x, y) => canvas.evaluate((node, at) =>
      node.getContext("2d").getImageData(at.x, at.y, 1, 1).data[0], { x, y });
    await drag({ x0: .5, y0: .5, x1: .5, y1: .5, id: 711 });
    await page.locator("#kv2-move").click();
    await drag({ x0: .5, y0: .5, x1: .5 + 100 / 1200, y1: .5, id: 712 });
    expect(await pixelRed(700, 400)).toBeLessThan(100);
    await page.locator("#kv2-select").click();
    await drag({ x0: 650 / 1200, y0: .45, x1: 750 / 1200, y1: .55, id: 713 });
    await page.locator("#kv2-copy-selection").click();
    await expect(page.locator("#kv2-layer-count")).toContainText("2 av 8 lag");
    await page.locator("#kv2-layers .kv2-layer").last().locator("button").first().click();
    expect(await pixelRed(700, 400)).toBeLessThan(100);
    expect(await pixelRed(600, 400)).toBe(255);
    const waiting = page.waitForEvent("download");
    await page.locator("#kv2-json").click();
    const saved = JSON.parse(await fs.readFile(await (await waiting).path(), "utf8"));
    expect(saved.layers.map((layer) => layer.x)).toEqual([100, 100]);
    expect(saved.layers).toHaveLength(2);
  });

  test("cut selection extracts pixels without touching other areas; undo and redo restore layers", async ({ page }) => {
    await page.goto("/kunstrommet.html", { waitUntil: "domcontentloaded" });
    const canvas = page.locator("#kv2-canvas");
    const pointer = (v) => canvas.evaluate((node, v) => {
      const b = node.getBoundingClientRect();
      const send = (type, x, y, buttons) => node.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerType: "mouse", pointerId: v.id,
        button: 0, buttons, clientX: b.left + x * b.width, clientY: b.top + y * b.height
      }));
      send("pointerdown", v.x0, v.y0, 1);
      send("pointermove", v.x1, v.y1, 1);
      send("pointerup", v.x1, v.y1, 0);
    }, v);
    const color = (value) => page.locator("#kv2-color").evaluate((node, value) => {
      node.value = value;
      node.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
    const pixelAt = (x, y) => canvas.evaluate((node, at) =>
      Array.from(node.getContext("2d").getImageData(at.x, at.y, 1, 1).data), { x, y });
    const projectJson = async () => {
      const pending = page.waitForEvent("download");
      await page.locator("#kv2-json").click();
      return JSON.parse(await fs.readFile(await (await pending).path(), "utf8"));
    };

    await color("#b52b43");
    await pointer({ x0: .5, y0: .5, x1: .5, y1: .5, id: 801 });
    await color("#3679dd");
    await pointer({ x0: .75, y0: .75, x1: .75, y1: .75, id: 802 });
    const original = await projectJson();
    await page.locator("#kv2-select").click();
    await pointer({ x0: .4, y0: .4, x1: .6, y1: .6, id: 803 });
    await expect(page.locator("#kv2-cut-selection")).toBeEnabled();
    await page.locator("#kv2-cut-selection").click();
    await expect(page.locator("#kv2-layer-count")).toContainText("2 av 8 lag");
    await expect(page.locator("#kv2-active-layer")).toContainText("klippet");

    const cut = await projectJson();
    expect(cut.layers).toHaveLength(2);
    expect(cut.layers[0].bitmap).not.toBe(original.layers[0].bitmap);
    expect(cut.layers[0].x).toBe(0);
    expect(cut.layers[1].x).toBe(0);
    // The complete composition still looks identical after moving the pixels.
    expect((await pixelAt(600, 400)).slice(0, 3)).toEqual([181, 43, 67]);
    expect((await pixelAt(900, 600)).slice(0, 3)).toEqual([54, 121, 221]);

    await page.locator("#kv2-undo").click();
    await expect(page.locator("#kv2-layer-count")).toContainText("1 av 8 lag");
    expect((await projectJson()).layers[0].bitmap).toBe(original.layers[0].bitmap);
    await page.locator("#kv2-redo").click();
    await expect(page.locator("#kv2-layer-count")).toContainText("2 av 8 lag");
    // Hide the extracted layer: the original now has a transparent hole,
    // but the unaffected dot outside the marquee remains.
    await page.locator("#kv2-layers .kv2-layer").first().locator("button").first().click();
    expect((await pixelAt(600, 400)).slice(0, 3)).toEqual([255, 255, 255]);
    expect((await pixelAt(900, 600)).slice(0, 3)).toEqual([54, 121, 221]);
    await page.locator("#kv2-layers .kv2-layer").first().locator("button").first().click();
    expect((await pixelAt(600, 400)).slice(0, 3)).toEqual([181, 43, 67]);
  });

  test("cut handles moved layers, empty selections, locking, and the eight-layer limit", async ({ page }) => {
    await page.goto("/kunstrommet.html", { waitUntil: "domcontentloaded" });
    const canvas = page.locator("#kv2-canvas");
    const drag = (v) => canvas.evaluate((node, v) => {
      const b = node.getBoundingClientRect();
      const send = (type, x, y, buttons) => node.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerType: "mouse", pointerId: v.id,
        button: 0, buttons, clientX: b.left + x * b.width, clientY: b.top + y * b.height
      }));
      send("pointerdown", v.x0, v.y0, 1);
      send("pointermove", v.x1, v.y1, 1);
      send("pointerup", v.x1, v.y1, 0);
    }, v);
    const red = (x, y) => canvas.evaluate((node, at) =>
      node.getContext("2d").getImageData(at.x, at.y, 1, 1).data[0], { x, y });

    await drag({ x0: .5, y0: .5, x1: .5, y1: .5, id: 811 });
    await page.locator("#kv2-move").click();
    await drag({ x0: .5, y0: .5, x1: .5 + 100 / 1200, y1: .5, id: 812 });
    expect(await red(700, 400)).toBeLessThan(100);
    await page.locator("#kv2-select").click();
    await drag({ x0: 650 / 1200, y0: .45, x1: 750 / 1200, y1: .55, id: 813 });
    await page.locator("#kv2-cut-selection").click();
    await expect(page.locator("#kv2-layer-count")).toContainText("2 av 8 lag");
    const waiting = page.waitForEvent("download");
    await page.locator("#kv2-json").click();
    const saved = JSON.parse(await fs.readFile(await (await waiting).path(), "utf8"));
    expect(saved.layers.map((item) => item.x)).toEqual([100, 100]);
    await page.locator("#kv2-layers .kv2-layer").first().locator("button").first().click();
    expect(await red(700, 400)).toBe(255); // source pixel was cleared
    await page.locator("#kv2-layers .kv2-layer").first().locator("button").first().click();
    expect(await red(700, 400)).toBeLessThan(100);

    const source = page.locator("#kv2-layers .kv2-layer").last();
    await source.locator(".kv2-layer-name").click();
    await source.getByRole("button", { name: /^Lås / }).click();
    await expect(page.locator("#kv2-cut-selection")).toBeDisabled();
    await expect(page.locator("#kv2-copy-selection")).toBeDisabled();
    await page.locator("#kv2-layers .kv2-layer").last().getByRole("button", { name: /^Lås opp / }).click();

    // No remaining source pixels in the marked area, so no empty layer.
    await page.locator("#kv2-cut-selection").click();
    await expect(page.locator("#kv2-status")).toContainText("Ingen piksler");
    await expect(page.locator("#kv2-layer-count")).toContainText("2 av 8 lag");
    for (let i = 0; i < 6; i++) await page.locator("#kv2-add-layer").click();
    await expect(page.locator("#kv2-layer-count")).toContainText("8 av 8 lag");
    await expect(page.locator("#kv2-cut-selection")).toBeDisabled();
    await expect(page.locator("#kv2-copy-selection")).toBeDisabled();
  });

  test("moved layer transforms around the document center and undo preserves its position", async ({ page }) => {
    await page.goto("/kunstrommet.html", { waitUntil: "domcontentloaded" });
    const canvas = page.locator("#kv2-canvas");
    await page.locator("#kv2-size").evaluate((el) => {
      el.value = "24";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const drag = async (x0, y0, x1, y1, id) => canvas.evaluate((node, args) => {
      const b = node.getBoundingClientRect();
      const send = (type, x, y, buttons) => node.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerType: "mouse", pointerId: args.id,
        button: 0, buttons,
        clientX: b.left + x * b.width, clientY: b.top + y * b.height
      }));
      send("pointerdown", args.x0, args.y0, 1);
      send("pointermove", args.x1, args.y1, 1);
      send("pointerup", args.x1, args.y1, 0);
    }, { x0, y0, x1, y1, id });
    const red = (x, y) => canvas.evaluate((node, pos) =>
      node.getContext("2d").getImageData(pos.x, pos.y, 1, 1).data[0], { x, y });

    // A centered dot moved 100 document pixels to the right.
    await drag(.5, .5, .5, .5, 301);
    await page.locator("#kv2-move").click();
    await drag(.5, .5, .5 + 100 / 1200, .5, 302);
    expect(await red(700, 400)).toBeLessThan(100);
    expect(await red(500, 400)).toBe(255);

    // Horizontal flip about document x=600 must move it to x=500.
    await page.locator("#kv2-transform-flip").click();
    expect(await red(500, 400)).toBeLessThan(100);
    expect(await red(700, 400)).toBe(255);
    await page.locator("#kv2-undo").click();
    await expect.poll(() => red(700, 400)).toBeLessThan(100);

    // A 90-degree clockwise rotation maps (700,400) to (600,500).
    await page.locator("#kv2-transform-rotate").click();
    expect(await red(600, 500)).toBeLessThan(100);
    expect(await red(700, 400)).toBe(255);
  });

  test("fill selection uses brush color on active layer and one undo step", async ({ page }) => {
    await page.goto("/kunstrommet.html", { waitUntil: "domcontentloaded" });
    const canvas = page.locator("#kv2-canvas");
    const drag = (v) => canvas.evaluate((node, v) => {
      const b = node.getBoundingClientRect();
      const send = (type, x, y, buttons) => node.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerType: "mouse", pointerId: v.id, button: 0,
        buttons, clientX: b.left + x * b.width, clientY: b.top + y * b.height
      }));
      send("pointerdown", v.x0, v.y0, 1);
      send("pointermove", v.x1, v.y1, 1);
      send("pointerup", v.x1, v.y1, 0);
    }, v);
    const setColor = (value) => page.locator("#kv2-color").evaluate((el, value) => {
      el.value = value; el.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
    const px = (x, y) => canvas.evaluate((node, pos) =>
      Array.from(node.getContext("2d").getImageData(pos.x, pos.y, 1, 1).data), { x, y });

    await expect(page.locator("#kv2-fill-selection")).toBeDisabled();
    await setColor("#b21e32");
    await drag({x0: .5, y0: .5, x1: .5, y1: .5, id: 801});
    expect(await px(600, 400)).toEqual([178, 30, 50, 255]);
    await page.locator("#kv2-add-layer").click();
    await page.locator("#kv2-select").click();
    await drag({x0: .4, y0: .4, x1: .6, y1: .6, id: 802});
    await expect(page.locator("#kv2-fill-selection")).toBeEnabled();
    await setColor("#237ab4");
    await page.locator("#kv2-fill-selection").click();
    expect(await px(600, 400)).toEqual([35, 122, 180, 255]);
    expect(await px(900, 600)).toEqual([255, 255, 255, 255]);
    await expect(page.locator("#kv2-status")).toHaveText("Ulagrede endringer");

    await page.locator("#kv2-undo").click();
    await expect.poll(() => px(600, 400)).toEqual([178, 30, 50, 255]);
    await page.locator("#kv2-redo").click();
    await expect.poll(() => px(600, 400)).toEqual([35, 122, 180, 255]);
    // Hiding the filled layer reveals the untouched original underneath.
    await page.locator("#kv2-layers .kv2-layer").first().locator("button").first().click();
    expect(await px(600, 400)).toEqual([178, 30, 50, 255]);
  });

  test("fill selection uses moved layer coordinates and respects locking", async ({ page }) => {
    await page.goto("/kunstrommet.html", { waitUntil: "domcontentloaded" });
    const canvas = page.locator("#kv2-canvas");
    const drag = (v) => canvas.evaluate((node, v) => {
      const b = node.getBoundingClientRect();
      const send = (type, x, y, buttons) => node.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerType: "mouse", pointerId: v.id, button: 0,
        buttons, clientX: b.left + x * b.width, clientY: b.top + y * b.height
      }));
      send("pointerdown", v.x0, v.y0, 1);
      send("pointermove", v.x1, v.y1, 1);
      send("pointerup", v.x1, v.y1, 0);
    }, v);
    const px = (x, y) => canvas.evaluate((node, pos) =>
      Array.from(node.getContext("2d").getImageData(pos.x, pos.y, 1, 1).data), { x, y });
    await drag({x0: .5, y0: .5, x1: .5, y1: .5, id: 811});
    await page.locator("#kv2-move").click();
    await drag({x0: .5, y0: .5, x1: .5 + 100 / 1200, y1: .5, id: 812});
    expect((await px(700, 400))[0]).toBeLessThan(100);
    expect(await px(600, 400)).toEqual([255, 255, 255, 255]);
    await page.locator("#kv2-select").click();
    await drag({x0: 650 / 1200, y0: .45, x1: 750 / 1200, y1: .55, id: 813});
    await page.locator("#kv2-layers .kv2-layer").first().locator("button").nth(2).click();
    await expect(page.locator("#kv2-fill-selection")).toBeDisabled();
    await page.locator("#kv2-layers .kv2-layer").first().locator("button").nth(2).click();
    await expect(page.locator("#kv2-fill-selection")).toBeEnabled();
    await page.locator("#kv2-color").evaluate((el) => {
      el.value = "#318f51"; el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.locator("#kv2-fill-selection").click();
    expect(await px(700, 400)).toEqual([49, 143, 81, 255]);
    expect(await px(600, 400)).toEqual([255, 255, 255, 255]);
    await page.locator("#kv2-undo").click();
    await expect.poll(async () => (await px(700, 400))[0]).toBeLessThan(100);
  });

  test("eyedropper samples visible color without pixels, undo history or dirty edits", async ({ page }) => {
    await page.goto("/kunstrommet.html", { waitUntil: "domcontentloaded" });
    await page.locator("#kv2-color").evaluate((node) => {
      node.value = "#e7493b";
      node.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await stroke(page);
    const artworkBefore = await pixel(page);
    expect(artworkBefore).toEqual([231, 73, 59, 255]);
    await page.locator("#kv2-color").evaluate((node) => {
      node.value = "#123456";
      node.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.locator("#kv2-eyedropper").click();
    await expect(page.locator("#kv2-eyedropper")).toHaveAttribute("aria-pressed", "true");
    await page.locator("#kv2-canvas").evaluate((node) => {
      const bounds = node.getBoundingClientRect();
      node.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true, cancelable: true, pointerId: 405, pointerType: "pen",
        button: 0, buttons: 1,
        clientX: bounds.left + bounds.width / 2,
        clientY: bounds.top + bounds.height / 2
      }));
    });
    await expect(page.locator("#kv2-color")).toHaveValue("#e7493b");
    await expect(page.locator("#kv2-brush")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#kv2-status")).toHaveText("Farge hentet fra lerretet");
    expect(await pixel(page)).toEqual(artworkBefore);

    // One undo must remove the painted dot. The pipette adds no history entry.
    await page.locator("#kv2-undo").click();
    await expect.poll(() => pixel(page)).toEqual([255, 255, 255, 255]);
    await page.locator("#kv2-eyedropper").click();
    await page.locator("#kv2-canvas").evaluate((node) => {
      const bounds = node.getBoundingClientRect();
      node.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true, cancelable: true, pointerId: 406, pointerType: "touch",
        button: 0, buttons: 1,
        clientX: bounds.left + bounds.width / 2,
        clientY: bounds.top + bounds.height / 2
      }));
    });
    await expect(page.locator("#kv2-color")).toHaveValue("#ffffff");
    expect(await pixel(page)).toEqual([255, 255, 255, 255]);
  });

  test("manual V1 project JSON import never touches V1 database", async ({ page }) => {
    await page.goto("/kunstrommet.html", { waitUntil: "domcontentloaded" });
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


test("unified Kunstrommet reuses Gallery metadata and opens legacy sketches as copies", async ({ page }) => {
  await page.goto("/kunstrommet.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(async () => {
    localStorage.setItem("aha_gallery_v1", JSON.stringify([{
      id: "source-1", title: "Et lysende atelier", description: "Varme farger og lange skygger",
      src: "https://example.invalid/never-fetch.jpg", type: "image", local_only: true
    }]));
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open("aha_kunstrommet_v1", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("projects", { keyPath: "id" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction("projects", "readwrite");
      tx.objectStore("projects").put({
        id: "old-sketch-1", owner: "local", title: "Min gamle tegning",
        note: "Skal ikke slettes", strokes: [{
          color: "#325588", size: 8, points: [{ x: 300, y: 200 }, { x: 450, y: 300 }]
        }], local_only: true, shared: false
      });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator("#kv2-legacy-projects .kv2-project")).toHaveCount(1);
  await expect(page.locator("#kv2-gallery-inspiration .kv2-inspiration")).toHaveCount(1);
  await expect(page.locator("#kv2-note")).toHaveValue("");
  await page.locator("#kv2-gallery-inspiration button").click();
  await expect(page.locator("#kv2-note")).toHaveValue(/Et lysende atelier/);
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#kv2-legacy-projects button").click();
  await expect(page.locator("#kv2-title")).toHaveValue("Min gamle tegning");
  await expect(page.locator("#kv2-note")).toHaveValue("Skal ikke slettes");
  await expect(page.locator("#kv2-status")).toContainText("kopi");
  const original = await page.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open("aha_kunstrommet_v1", 1);
    req.onsuccess = () => {
      const item = req.result.transaction("projects", "readonly").objectStore("projects").get("old-sketch-1");
      item.onsuccess = () => resolve(item.result);
      item.onerror = () => reject(item.error);
    };
    req.onerror = () => reject(req.error);
  }));
  expect(original.note).toBe("Skal ikke slettes");
  expect(original.strokes).toHaveLength(1);
  const gallery = await page.evaluate(() => JSON.parse(localStorage.getItem("aha_gallery_v1")));
  expect(gallery).toHaveLength(1);
  expect(gallery[0].src).toContain("never-fetch");
});

test("one atelier, explicit Aha collection link stores metadata only", async ({ page }) => {
  await page.goto("/kunstrommet.html", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.setItem("aha_lists_v1", JSON.stringify([{
    id: "v2-art-ideas", title: "Kunstideer", type: "favorites",
    local_only: true, sync_enabled: false, published_external: false,
    echonet_shared: false, items: []
  }])));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#kv2-title").fill("Lys i fjellet");
  await page.locator("#kv2-note").fill("Et personlig notat som ikke skal inn i samlingsindeksen.");
  await page.locator("#kv2-save").click();
  await expect(page.locator("#kv2-status")).toHaveText("Lagret på denne enheten");
  await expect(page.locator("#kv2-collection-select")).toContainText("Kunstideer");
  await page.locator("#kv2-collection-select").selectOption("v2-art-ideas");
  await page.locator("#kv2-link-collection").click();
  await expect(page.locator("#kv2-link-state")).toContainText("knyttet til samlingen");

  const state = await page.evaluate(() => ({
    refs: JSON.parse(localStorage.getItem(window.AHAKunstrommetReferences.profileKey()) || "[]"),
    rawLists: JSON.parse(localStorage.getItem("aha_lists_v1") || "[]"),
    overlay: window.AHALists.loadLists()
  }));
  expect(state.refs).toHaveLength(1);
  expect(JSON.stringify(state.refs)).not.toContain("personlig notat");
  expect(JSON.stringify(state.refs)).not.toContain("data:image");
  expect(state.rawLists[0].items).toHaveLength(0);
  expect(state.overlay[0].items).toHaveLength(1);
  expect(state.overlay[0].items[0].source).toBe("aha_kunstrommet");

  // Removing the artwork must also revoke its local Aha pointer, without altering shared lists.
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#kv2-projects .kv2-project--saved").getByRole("button", { name: "Slett" }).click();
  await expect(page.locator("#kv2-project-count")).toContainText("Ingen lagrede verk");
  const cleaned = await page.evaluate(() => ({
    refs: window.AHAKunstrommetReferences.load(),
    memberships: window.AHAKunstrommetReferences.memberships(),
    raw: JSON.parse(localStorage.getItem("aha_lists_v1") || "[]"),
    visible: window.AHALists.loadLists()
  }));
  expect(cleaned.refs).toHaveLength(0);
  expect(cleaned.memberships).toHaveLength(0);
  expect(cleaned.raw[0].items).toHaveLength(0);
  expect(cleaned.visible[0].items).toHaveLength(0);
});


test("one sketchbook restores search, thumbnail, copy and safe local deletion", async ({ page }) => {
  await page.goto("/kunstrommet.html", { waitUntil: "domcontentloaded" });
  await page.locator("#kv2-title").fill("Kveldsmaleri");
  await page.locator("#kv2-note").fill("Farger fra parken");
  await page.locator("#kv2-save").click();
  await expect(page.locator("#kv2-status")).toHaveText("Lagret på denne enheten");
  await expect(page.locator("#kv2-projects .kv2-project--saved")).toHaveCount(1);
  await expect(page.locator("#kv2-projects .kv2-project-preview")).toHaveCount(1);

  await page.locator("#kv2-projects .kv2-project--saved").getByRole("button", { name: "Lag kopi" }).click();
  await expect(page.locator("#kv2-projects .kv2-project--saved")).toHaveCount(2);
  await expect(page.locator("#kv2-project-count")).toContainText("2 lagrede verk");
  await page.locator("#kv2-project-search").fill("kopi");
  await expect(page.locator("#kv2-projects .kv2-project--saved")).toHaveCount(1);
  await expect(page.locator("#kv2-projects")).toContainText("Kveldsmaleri – kopi");

  const stored = await page.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open("aha_kunstrommet_v2", 1);
    req.onsuccess = () => {
      const all = req.result.transaction("projects", "readonly").objectStore("projects").getAll();
      all.onsuccess = () => resolve(all.result);
      all.onerror = () => reject(all.error);
    };
    req.onerror = () => reject(req.error);
  }));
  expect(stored).toHaveLength(2);
  expect(stored[0].id).not.toEqual(stored[1].id);
  expect(stored.every((item) => item.owner === "local" && item.shared === false)).toBe(true);
  expect(stored.every((item) => item.last_source_event_id === undefined)).toBe(true);

  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#kv2-projects .kv2-project--saved").getByRole("button", { name: "Slett" }).click();
  await expect(page.locator("#kv2-project-count")).toContainText("Ingen treff");
  await page.locator("#kv2-project-search").fill("");
  await expect(page.locator("#kv2-projects .kv2-project--saved")).toHaveCount(1);
  await expect(page.locator("#kv2-projects")).toContainText("Kveldsmaleri");
});
