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
    await page.locator(".kv2-project button").click();
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
