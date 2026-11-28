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


async function traceLasso(page, points, id = 970) {
  await page.locator("#kv2-canvas").evaluate((canvas, data) => {
    const rect = canvas.getBoundingClientRect();
    const send = (type, p) => canvas.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerType: "pen", pointerId: data.id,
      button: 0, buttons: type === "pointerup" ? 0 : 1,
      clientX: rect.left + p[0] * rect.width / 1200,
      clientY: rect.top + p[1] * rect.height / 800
    }));
    send("pointerdown", data.points[0]);
    for (const p of data.points.slice(1)) send("pointermove", p);
    send("pointerup", data.points[data.points.length - 1]);
  }, { points, id });
}
async function pxAt(page, x, y) {
  return page.locator("#kv2-canvas").evaluate((canvas, pos) =>
    Array.from(canvas.getContext("2d").getImageData(pos.x, pos.y, 1, 1).data), { x, y });
}
async function jsonBackup(page) {
  const ready = page.waitForEvent("download");
  await page.locator("#kv2-json").click();
  return JSON.parse(await fs.readFile(await (await ready).path(), "utf8"));
}
async function pngLayersAt(page, layers, x, y) {
  return page.evaluate(async ({ layers, x, y }) => {
    const result = [];
    for (const layer of layers) {
      const image = new Image(); image.src = layer.bitmap; await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 1200; canvas.height = 800;
      const ctx = canvas.getContext("2d"); ctx.drawImage(image, 0, 0);
      result.push(Array.from(ctx.getImageData(x, y, 1, 1).data));
    }
    return result;
  }, { layers, x, y });
}

async function changeAdjustment(page, name, value) {
  await page.locator("#kv2-adjust-" + name).evaluate((control, n) => {
    control.value = String(n);
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function shapePointer(page, type, x, y, id = 881) {
  await page.locator("#kv2-canvas").evaluate((canvas, d) => {
    const r = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new PointerEvent(d.type, {
      bubbles: true, cancelable: true, pointerId: d.id, pointerType: "pen",
      button: 0, buttons: /up|cancel/.test(d.type) ? 0 : 1, pressure: .5,
      clientX: r.left + d.x * r.width / 1200,
      clientY: r.top + d.y * r.height / 800
    }));
  }, { type, x, y, id });
}
async function shapeDrag(page, start, end, id = 881) {
  await shapePointer(page, "pointerdown", start[0], start[1], id);
  await shapePointer(page, "pointermove", end[0], end[1], id);
  await shapePointer(page, "pointerup", end[0], end[1], id);
}

async function textInk(page, x = 100, y = 120, w = 460, h = 140) {
  return page.locator("#kv2-canvas").evaluate((canvas, box) => {
    const rgba = canvas.getContext("2d").getImageData(box.x, box.y, box.w, box.h).data;
    let ink = 0;
    for (let i = 0; i < rgba.length; i += 4) {
      if (rgba[i] < 180 || rgba[i + 1] < 180 || rgba[i + 2] < 180) ink++;
    }
    return ink;
  }, { x, y, w, h });
}
test.describe("Kunstrommet V2 – isolated, local layer editor", () => {
  test("smaller documents gain bounded layer capacity and imported dimensions set their own limit",async({page})=>{
    await page.goto("/kunstrommet.html?studio=overview",{waitUntil:"domcontentloaded"});
    const count=page.locator("#kv2-layer-count");
    await expect(count).toContainText("1 av 8 lag");
    const old=await jsonBackup(page);
    page.on("dialog",d=>d.accept());
    await page.locator(".kv2-size-panel summary").click();
    await page.locator("#kv2-canvas-width").fill("640");
    await page.locator("#kv2-canvas-height").fill("960");
    await page.locator("#kv2-new-sized").click();
    await expect(count).toContainText("1 av 12 lag");
    await stroke(page);
    await page.locator("#kv2-mask-add").click();
    await page.locator("#kv2-mask-edit").click();
    for(let i=1;i<12;i++)await page.locator("#kv2-add-layer").click();
    await expect(count).toContainText("12 av 12 lag");
    await expect(page.locator("#kv2-duplicate-layer")).toBeDisabled();
    await page.locator("#kv2-add-layer").evaluate(b=>b.click());
    await expect(count).toContainText("12 av 12 lag");
    await page.locator("#kv2-undo").click();
    await expect(count).toContainText("11 av 12 lag");
    await page.locator("#kv2-redo").click();
    await expect(count).toContainText("12 av 12 lag");
    const small=await jsonBackup(page);
    expect(small.layers).toHaveLength(12);
    expect(small.layers[0].maskBitmap).toBeTruthy();
    const load=async(data)=>page.locator("#kv2-import").setInputFiles({name:"project.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(data))});
    await load({...small,layers:[...small.layers,small.layers[0]]});
    await expect(page.locator("#kv2-status")).toContainText("Import feilet");
    await expect(count).toContainText("12 av 12 lag");
    await load({...old,layers:Array.from({length:9},()=>old.layers[0])});
    await expect(page.locator("#kv2-status")).toContainText("Import feilet");
    await expect(count).toContainText("12 av 12 lag");
    await load(old);
    await expect(count).toContainText("1 av 8 lag");
    await load(small);
    await expect(count).toContainText("12 av 12 lag");
    await expect.poll(async()=>(await pxAt(page,320,480))[0]).toBeLessThan(80);
    await page.locator("#kv2-title").fill("Tolv lag");
    await page.locator("#kv2-save").click();
    await expect(page.locator("#kv2-status")).toHaveText("Lagret på denne enheten");
    await page.reload();
    await page.locator("#kv2-projects .kv2-project--saved").getByRole("button",{name:"Åpne",exact:true}).click();
    await expect(count).toContainText("12 av 12 lag");
    expect((await jsonBackup(page)).layers[0].maskBitmap).toBeTruthy();
  });

  test("small canvas capacity is capped at sixteen and large presets retain eight",async({page})=>{
    await page.goto("/kunstrommet.html?studio=overview",{waitUntil:"domcontentloaded"});
    await page.locator(".kv2-size-panel summary").click();
    await page.locator("#kv2-canvas-width").fill("320");
    await page.locator("#kv2-canvas-height").fill("320");
    await page.locator("#kv2-new-sized").click();
    await expect(page.locator("#kv2-layer-count")).toContainText("1 av 16 lag");
    await page.locator("#kv2-canvas-preset").selectOption("1600x900");
    await page.locator("#kv2-new-sized").click();
    await expect(page.locator("#kv2-layer-count")).toContainText("1 av 8 lag");
  });

  test("history reuses identical layer and mask rasters but decodes changed content",async({page})=>{
    await page.goto("/kunstrommet.html?studio=overview",{waitUntil:"domcontentloaded"});
    await shapeDrag(page,[300,300],[300,300],1981);
    await page.locator("#kv2-mask-add").click();
    await page.locator("#kv2-mask-edit").click();
    await page.locator("#kv2-add-layer").click();
    await page.locator("#kv2-brush").click();
    const original=await jsonBackup(page);
    await shapeDrag(page,[900,500],[900,500],1982);
    const painted=await jsonBackup(page);
    await page.locator("#kv2-opacity").evaluate(c=>{c.value="50";c.dispatchEvent(new Event("change",{bubbles:true}));});
    const faded=await jsonBackup(page);
    // Count Image constructions only during history. The app's decoder is the
    // only image constructor involved in these local undo/redo operations.
    await page.evaluate(()=>{
      const NativeImage=window.Image;
      window.__kv2HistoryDecodes=0;
      window.Image=class extends NativeImage {
        constructor(...args){super(...args);window.__kv2HistoryDecodes++;}
      };
    });
    const decodes=()=>page.evaluate(()=>window.__kv2HistoryDecodes);
    const undo=page.locator("#kv2-undo"),redo=page.locator("#kv2-redo");
    await undo.click();
    await expect.poll(async()=>(await jsonBackup(page)).layers).toEqual(painted.layers);
    expect(await decodes()).toBe(0);
    await undo.click();
    await expect.poll(async()=>(await jsonBackup(page)).layers).toEqual(original.layers);
    expect(await decodes()).toBe(1);
    await redo.click();
    await expect.poll(async()=>(await jsonBackup(page)).layers).toEqual(painted.layers);
    expect(await decodes()).toBe(2);
    await redo.click();
    await expect.poll(async()=>(await jsonBackup(page)).layers).toEqual(faded.layers);
    expect(await decodes()).toBe(2);
    expect((await jsonBackup(page)).layers[0].maskBitmap).toBeTruthy();
  });

  test("group opacity composites overlapping layers once and survives history and JSON import",async({page})=>{
    await page.goto("/kunstrommet.html?studio=overview",{waitUntil:"domcontentloaded"});
    await shapeDrag(page,[300,300],[300,300],1971);
    await shapeDrag(page,[600,400],[600,400],1972);
    await page.locator("#kv2-add-layer").click();
    await shapeDrag(page,[600,400],[600,400],1973);
    await shapeDrag(page,[900,500],[900,500],1974);
    await page.locator(".kv2-layer").last().locator(".kv2-move-together").check();
    await page.locator("#kv2-group-name").fill("Felles");
    await page.locator("#kv2-group-save").click();
    const before=await jsonBackup(page), slider=page.locator("#kv2-group-opacity");
    await expect(slider).toBeEnabled();
    await slider.evaluate(c=>{c.value="50";c.dispatchEvent(new Event("change",{bubbles:true}));});
    const samples=await Promise.all([[300,300],[600,400],[900,500]].map(([x,y])=>pxAt(page,x,y)));
    expect(samples[0]).toEqual(samples[1]);expect(samples[1]).toEqual(samples[2]);
    expect(samples[0][0]).toBeGreaterThan(120);expect(samples[0][0]).toBeLessThan(170);
    const grouped=await jsonBackup(page);
    expect(grouped.layers.map(l=>l.groupOpacity)).toEqual([.5,.5]);
    expect(grouped.layers.map(({groupOpacity,...layer})=>layer)).toEqual(before.layers);
    await expect(page.locator("#kv2-clip-toggle")).toBeDisabled();
    await expect(page.locator("#kv2-merge-down")).toBeDisabled();
    await page.locator("#kv2-undo").click();
    await expect.poll(async()=>(await pxAt(page,600,400))[0]).toBeLessThan(80);
    await page.locator("#kv2-redo").click();
    await expect.poll(async()=>(await pxAt(page,600,400))[0]).toBe(samples[1][0]);
    page.on("dialog",d=>d.accept());
    await page.locator("#kv2-import").setInputFiles({name:"group-opacity.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(grouped))});
    await expect(page.locator("#kv2-status")).toHaveText("Importert – lagre for å beholde");
    expect(await pxAt(page,600,400)).toEqual(samples[1]);
    await page.locator("#kv2-group-select").selectOption("Felles");
    await expect(slider).toHaveValue("50");
    await slider.evaluate(c=>{c.value="0";c.dispatchEvent(new Event("change",{bubbles:true}));});
    expect(await pxAt(page,600,400)).toEqual([255,255,255,255]);
    await page.locator("#kv2-group-dissolve-action").click();
    expect((await pxAt(page,600,400))[0]).toBeLessThan(80);
    expect((await jsonBackup(page)).layers.every(l=>!l.groupName&&l.groupOpacity===undefined)).toBe(true);
  });

  test("clipping limits the upper raster to the lower alpha without altering source pixels",async({page})=>{
    await page.goto("/kunstrommet.html?studio=overview",{waitUntil:"domcontentloaded"});
    const clip=page.locator("#kv2-clip-toggle");
    await expect(clip).toBeDisabled();
    await shapeDrag(page,[300,300],[300,300],1961);
    await page.locator("#kv2-add-layer").click();
    await page.locator("#kv2-swatch-korall").click();
    await shapeDrag(page,[300,300],[300,300],1962);
    await shapeDrag(page,[900,500],[900,500],1963);
    const original=await jsonBackup(page);
    const red=await pxAt(page,900,500);
    expect(red[0]).toBeGreaterThan(red[1]);
    await clip.click();
    await expect(clip).toHaveAttribute("aria-pressed","true");
    expect(await pxAt(page,900,500)).toEqual([255,255,255,255]);
    expect((await pxAt(page,300,300))[0]).toBeGreaterThan((await pxAt(page,300,300))[1]);
    const clipped=await jsonBackup(page);
    expect(clipped.layers[1].clipToBelow).toBe(true);
    expect(clipped.layers.map(({clipToBelow,...layer})=>layer)).toEqual(original.layers);
    await expect(page.locator("#kv2-merge-down")).toBeDisabled();
    await page.getByRole("button",{name:"Skjul Lag 1 · Tegning",exact:true}).click();
    expect(await pxAt(page,300,300)).toEqual([255,255,255,255]);
    await page.locator("#kv2-undo").click();
    await expect.poll(async()=>(await pxAt(page,300,300))[1]).toBeLessThan(200);
    await page.locator("#kv2-undo").click();
    await expect(clip).toHaveAttribute("aria-pressed","false");
    expect(await pxAt(page,900,500)).toEqual(red);
    await page.locator("#kv2-redo").click();
    await expect(clip).toHaveAttribute("aria-pressed","true");
    page.on("dialog",d=>d.accept());
    await page.locator("#kv2-import").setInputFiles({name:"clip.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(clipped))});
    await expect(page.locator("#kv2-status")).toHaveText("Importert – lagre for å beholde");
    await expect(clip).toHaveAttribute("aria-pressed","true");
    expect(await pxAt(page,900,500)).toEqual([255,255,255,255]);
    await clip.click();
    expect(await pxAt(page,900,500)).toEqual(red);
  });

  test("raster merge down preserves composition and restores original layers on undo",async({page})=>{
    await page.goto("/kunstrommet.html?studio=overview",{waitUntil:"domcontentloaded"});
    const merge=page.locator("#kv2-merge-down"), count=page.locator("#kv2-layer-count");
    await expect(merge).toBeDisabled();
    await shapeDrag(page,[300,300],[300,300],1941);
    await page.locator("#kv2-add-layer").click();
    await page.locator("#kv2-swatch-korall").click();
    await shapeDrag(page,[900,500],[900,500],1942);
    await expect(merge).toBeEnabled();
    const original=await jsonBackup(page);
    const points=[[300,300],[900,500],[600,400]];
    const colors=async()=>Promise.all(points.map(([x,y])=>pxAt(page,x,y)));
    const before=await colors();
    expect(before[0][0]).toBeLessThan(80);
    expect(before[1][0]).toBeGreaterThan(before[1][1]);
    page.once("dialog",d=>d.dismiss());
    await merge.click();
    await expect(count).toContainText("2 av 8 lag");
    expect((await jsonBackup(page)).layers).toEqual(original.layers);
    page.once("dialog",d=>d.accept());
    await merge.click();
    await expect(count).toContainText("1 av 8 lag");
    expect(await colors()).toEqual(before);
    const combined=await jsonBackup(page);
    expect(combined.layers[0].id).toBe(original.layers[0].id);
    await expect(merge).toBeDisabled();
    await page.locator("#kv2-undo").click();
    await expect(count).toContainText("2 av 8 lag");
    expect((await jsonBackup(page)).layers).toEqual(original.layers);
    await page.locator("#kv2-redo").click();
    await expect(count).toContainText("1 av 8 lag");
    expect((await jsonBackup(page)).layers).toEqual(combined.layers);
    expect(await colors()).toEqual(before);
  });

  test("raster merge blocks unsupported opacity, blend and masks",async({page})=>{
    await page.goto("/kunstrommet.html?studio=overview",{waitUntil:"domcontentloaded"});
    await page.locator("#kv2-add-layer").click();
    const merge=page.locator("#kv2-merge-down");
    await expect(merge).toBeEnabled();
    await page.locator("#kv2-opacity").evaluate(c=>{c.value="50";c.dispatchEvent(new Event("change",{bubbles:true}));});
    await expect(merge).toBeDisabled();
    await page.locator("#kv2-opacity").evaluate(c=>{c.value="100";c.dispatchEvent(new Event("change",{bubbles:true}));});
    await expect(merge).toBeEnabled();
    await page.locator("#kv2-blend-mode").selectOption("multiply");
    await expect(merge).toBeDisabled();
    await page.locator("#kv2-blend-mode").selectOption("normal");
    await expect(merge).toBeEnabled();
    await page.locator("#kv2-mask-add").click();
    await page.locator("#kv2-mask-edit").click();
    await expect(merge).toBeDisabled();
    await expect(page.locator("#kv2-layer-count")).toContainText("2 av 8 lag");
  });

  test("new document formats preserve pixels, masks, history and exact export dimensions",async({page})=>{
    await page.goto("/kunstrommet.html?studio=overview",{waitUntil:"domcontentloaded"});
    const old=await jsonBackup(page);
    const dims=()=>page.locator("#kv2-canvas").evaluate(c=>[c.width,c.height]);
    await page.locator(".kv2-size-panel summary").click();
    await page.locator("#kv2-canvas-preset").selectOption("800x1200");
    await page.locator("#kv2-new-sized").click();
    expect(await dims()).toEqual([800,1200]);
    await stroke(page);
    await expect.poll(async()=>(await pxAt(page,400,600))[0]).toBeLessThan(80);
    await page.locator("#kv2-undo").click();
    await expect.poll(async()=>(await pxAt(page,400,600))[0]).toBe(255);
    await page.locator("#kv2-redo").click();
    await expect.poll(async()=>(await pxAt(page,400,600))[0]).toBeLessThan(80);
    await page.locator("#kv2-mask-add").click();
    await stroke(page);
    await expect.poll(async()=>(await pxAt(page,400,600))[0]).toBe(255);
    await page.locator("#kv2-mask-edit").click();
    await page.locator(".kv2-guide-panel summary").click();
    await page.locator("#kv2-guide-mode").selectOption("thirds");
    await expect(page.locator("#kv2-composition-guides")).toHaveAttribute("viewBox","0 0 800 1200");
    const sizes=await page.evaluate(()=>["kv2-canvas","kv2-composition-guides"].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return [r.width,r.height];}));
    expect(Math.abs(sizes[0][1]-sizes[1][1])).toBeLessThan(2);
    const portrait=await jsonBackup(page);
    expect([portrait.width,portrait.height]).toEqual([800,1200]);
    expect(portrait.layers[0].maskBitmap).toBeTruthy();
    const pending=page.waitForEvent("download");await page.locator("#kv2-png").click();
    const png=await fs.readFile(await (await pending).path());
    expect([png.readUInt32BE(16),png.readUInt32BE(20)]).toEqual([800,1200]);
    page.on("dialog",d=>d.accept());
    const load=async(data)=>page.locator("#kv2-import").setInputFiles({name:"project.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(data))});
    await load(old);await expect(page.locator("#kv2-status")).toHaveText("Importert – lagre for å beholde");
    expect(await dims()).toEqual([1200,800]);
    await load(portrait);await expect.poll(dims).toEqual([800,1200]);
    await expect(page.locator("#kv2-status")).toHaveText("Importert – lagre for å beholde");
    const restored=await jsonBackup(page);
    expect(restored.layers.map(({id,...layer})=>layer)).toEqual(portrait.layers.map(({id,...layer})=>layer));
    await load({...portrait,width:1600,height:1600});
    await expect(page.locator("#kv2-status")).toContainText("Import feilet");
    expect(await dims()).toEqual([800,1200]);
    await load({...portrait,width:1200,height:800});
    await expect(page.locator("#kv2-status")).toContainText("Import feilet");
    expect(await dims()).toEqual([800,1200]);
    await page.locator("#kv2-title").fill("Portrettformat");
    await page.locator("#kv2-save").click();
    await expect(page.locator("#kv2-status")).toHaveText("Lagret på denne enheten");
    await page.reload();
    await page.locator("#kv2-projects .kv2-project--saved").getByRole("button",{name:"Åpne",exact:true}).click();
    await expect.poll(dims).toEqual([800,1200]);
    expect((await jsonBackup(page)).layers[0].maskBitmap).toBeTruthy();
  });

  test("invalid new canvas dimensions leave current document intact",async({page})=>{
    await page.goto("/kunstrommet.html?studio=overview",{waitUntil:"domcontentloaded"});
    await stroke(page);
    await page.locator(".kv2-size-panel summary").click();
    await page.locator("#kv2-canvas-width").fill("1600");
    await page.locator("#kv2-canvas-height").fill("1600");
    await page.locator("#kv2-new-sized").click();
    await expect(page.locator("#kv2-status")).toContainText("Ugyldig lerret");
    expect((await pxAt(page,600,400))[0]).toBeLessThan(80);
    page.on("dialog",d=>d.accept());
    await page.locator("#kv2-canvas-width").fill("640");
    await page.locator("#kv2-canvas-height").fill("960");
    await page.locator("#kv2-new-sized").click();
    expect(await page.locator("#kv2-canvas").evaluate(c=>[c.width,c.height])).toEqual([640,960]);
    expect((await pxAt(page,320,480))[0]).toBe(255);
  });

  test("perspective ruler locks the first direction and never exports its guide",async({page})=>{
    await page.goto("/kunstrommet.html?studio=overview",{waitUntil:"domcontentloaded"});
    await page.locator(".kv2-guide-panel summary").click();
    await page.locator("#kv2-guide-mode").selectOption("one");
    await page.locator("#kv2-guide-lock").check();
    await page.locator("#kv2-size").evaluate(c=>{c.value="20";c.dispatchEvent(new Event("input",{bubbles:true}));});
    await shapePointer(page,"pointerdown",300,200,1631);
    await shapePointer(page,"pointermove",450,300,1631);
    await expect(page.locator("#kv2-perspective-lock-overlay")).toBeVisible();
    await shapePointer(page,"pointermove",520,220,1631);
    await shapePointer(page,"pointerup",520,220,1631);
    await expect(page.locator("#kv2-perspective-lock-overlay")).toBeHidden();
    expect((await pxAt(page,450,300))[0]).toBeLessThan(80);
    expect((await pxAt(page,520,220))[0]).toBe(255);
    await page.locator("#kv2-undo").click();
    await expect.poll(async()=>(await pxAt(page,450,300))[0]).toBe(255);
    await page.locator("#kv2-brush-preset").selectOption("advanced");
    for(const name of ["hardness","flow"])await page.locator("#kv2-brush-"+name).evaluate(c=>{c.value="100";c.dispatchEvent(new Event("input",{bubbles:true}));});
    await shapePointer(page,"pointerdown",300,200,1632);
    await shapePointer(page,"pointermove",450,300,1632);
    await shapePointer(page,"pointermove",520,220,1632);
    await shapePointer(page,"pointerup",520,220,1632);
    expect((await pxAt(page,450,300))[0]).toBeLessThan(80);
    expect((await pxAt(page,520,220))[0]).toBe(255);
    const raster=await page.locator("#kv2-canvas").evaluate(c=>c.toDataURL("image/png"));
    const pending=page.waitForEvent("download");await page.locator("#kv2-png").click();
    expect((await fs.readFile(await (await pending).path())).toString("base64")).toBe(raster.split(",")[1]);
    await page.locator(".kv2-symmetry-panel summary").click();
    await page.locator("#kv2-symmetry-mode").selectOption("vertical");
    await expect(page.locator("#kv2-guide-lock-note")).toContainText("deaktivert");
    await shapeDrag(page,[200,600],[310,630],1633);
    expect((await pxAt(page,310,630))[0]).toBeLessThan(80);
    expect((await pxAt(page,890,630))[0]).toBeLessThan(80);
  });

  test("radial symmetry rotates strokes around a movable center and remains a single undo",async({page})=>{
    await page.goto("/kunstrommet.html?studio=overview",{waitUntil:"domcontentloaded"});
    await page.locator(".kv2-symmetry-panel summary").click();
    await page.locator("#kv2-symmetry-mode").selectOption("radial");
    const set=async(id,v)=>page.locator("#kv2-symmetry-"+id).evaluate((c,v)=>{c.value=String(v);c.dispatchEvent(new Event("input",{bubbles:true}));},v);
    await set("count",6);await set("x",40);await set("y",50);
    await expect(page.locator("#kv2-symmetry-count-value")).toHaveText("6");
    await expect(page.locator("#kv2-symmetry-overlay")).toBeVisible();
    await page.locator("#kv2-size").evaluate(c=>{c.value="20";c.dispatchEvent(new Event("input",{bubbles:true}));});
    const positions=Array.from({length:6},(_,i)=>[Math.round(480+180*Math.cos(i*Math.PI/3)),Math.round(400+180*Math.sin(i*Math.PI/3))]);
    await shapeDrag(page,[660,400],[660,400],1611);
    for(const [x,y] of positions)await expect.poll(async()=>(await pxAt(page,x,y))[0]).toBeLessThan(80);
    expect((await pxAt(page,480,400))[0]).toBe(255);
    await page.locator("#kv2-undo").click();
    for(const [x,y] of positions)await expect.poll(async()=>(await pxAt(page,x,y))[0]).toBe(255);
    await set("count",4);
    await page.locator("#kv2-brush-preset").selectOption("advanced");
    await page.locator("#kv2-brush-pressure-width").uncheck();
    await page.locator("#kv2-size").evaluate(c=>{c.value="60";c.dispatchEvent(new Event("input",{bubbles:true}));});
    for(const [name,value] of [["hardness",100],["flow",100],["aspect",20]])await page.locator("#kv2-brush-"+name).evaluate((c,v)=>{c.value=String(v);c.dispatchEvent(new Event("input",{bubbles:true}));},value);
    await shapeDrag(page,[660,400],[660,400],1612);
    expect((await pxAt(page,680,400))[0]).toBeLessThan(80);
    expect((await pxAt(page,660,420))[0]).toBe(255);
    expect((await pxAt(page,480,600))[0]).toBeLessThan(80);
    expect((await pxAt(page,500,580))[0]).toBe(255);
    await page.locator("#kv2-undo").click();
    await expect.poll(async()=>(await pxAt(page,480,600))[0]).toBe(255);
    await page.locator("#kv2-symmetry-reset").click();
    await expect(page.locator("#kv2-symmetry-overlay")).toBeHidden();
  });

  test("four-way symmetry mirrors ordinary and advanced brush strokes with one undo",async({page})=>{
    await page.goto("/kunstrommet.html?studio=overview",{waitUntil:"domcontentloaded"});
    await page.locator(".kv2-symmetry-panel summary").click();
    await page.locator("#kv2-symmetry-mode").selectOption("both");
    await expect(page.locator("#kv2-symmetry-overlay")).toBeVisible();
    const locations=[[300,200],[900,200],[300,600],[900,600]];
    const check=async(dark)=>{for(const [x,y] of locations){
      await expect.poll(async()=>(await pxAt(page,x,y))[0]).toBe(dark?35:255);
    }};
    await shapeDrag(page,[300,200],[300,200],1601);await check(true);
    await page.locator("#kv2-undo").click();await check(false);
    await page.locator("#kv2-redo").click();await check(true);
    await page.locator("#kv2-eraser").click();
    await shapeDrag(page,[300,200],[300,200],1602);await check(false);
    await page.locator("#kv2-brush").click();
    await page.locator("#kv2-brush-preset").selectOption("advanced");
    for(const name of ["hardness","flow"])await page.locator("#kv2-brush-"+name).evaluate(c=>{c.value="100";c.dispatchEvent(new Event("input",{bubbles:true}));});
    await shapeDrag(page,[300,200],[300,200],1603);await check(true);
    await page.locator("#kv2-undo").click();await check(false);
    await shapePointer(page,"pointerdown",300,200,1604);
    await shapePointer(page,"pointercancel",300,200,1604);await check(false);
    await page.locator("#kv2-symmetry-reset").click();
    await expect(page.locator("#kv2-symmetry-overlay")).toBeHidden();
  });

  test("symmetry axis uses document coordinates and selection clips mirrored copies",async({page})=>{
    await page.goto("/kunstrommet.html?studio=overview",{waitUntil:"domcontentloaded"});
    await page.locator(".kv2-symmetry-panel summary").click();
    await page.locator("#kv2-symmetry-mode").selectOption("vertical");
    await page.locator("#kv2-symmetry-x").evaluate(c=>{c.value="40";c.dispatchEvent(new Event("input",{bubbles:true}));});
    await expect(page.locator("#kv2-symmetry-lines")).toHaveAttribute("d","M 480 0 L 480 800");
    await page.locator("#kv2-select").click();
    await shapeDrag(page,[200,100],[400,300],1605);
    await page.locator("#kv2-brush").click();
    await shapeDrag(page,[300,200],[300,200],1606);
    await expect.poll(async()=>(await pxAt(page,300,200))[0]).toBe(35);
    expect((await pxAt(page,660,200))[0]).toBe(255);
    await page.locator("#kv2-clear-selection").click();
    await shapeDrag(page,[300,200],[300,200],1607);
    await expect.poll(async()=>(await pxAt(page,660,200))[0]).toBe(35);
    await page.locator("#kv2-zoom-in").click();
    const sizes=await page.evaluate(()=>["kv2-canvas","kv2-symmetry-overlay"].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return [r.width,r.height];}));
    expect(Math.abs(sizes[0][0]-sizes[1][0])).toBeLessThan(2);
    expect(Math.abs(sizes[0][1]-sizes[1][1])).toBeLessThan(2);
  });

  test("composition guides follow zoom and never modify artwork or export", async ({page})=>{
    await page.goto("/kunstrommet.html?studio=overview",{waitUntil:"domcontentloaded"});
    const layer=page.locator("#kv2-composition-guides");
    const raster=()=>page.locator("#kv2-canvas").evaluate(c=>c.toDataURL("image/png"));
    const original=await raster(),backup=await jsonBackup(page);
    await expect(layer).toHaveAttribute("hidden","");
    await page.locator(".kv2-guide-panel summary").click();
    await page.locator("#kv2-guide-mode").selectOption("thirds");
    await expect(layer).toBeVisible();
    await expect(page.locator("#kv2-guide-lines")).toHaveAttribute("d","M 400 0 L 400 800 M 0 266.6666666666667 L 1200 266.6666666666667 M 800 0 L 800 800 M 0 533.3333333333334 L 1200 533.3333333333334");
    await page.locator("#kv2-guide-mode").selectOption("one");
    const set=async(id,value)=>page.locator("#kv2-guide-"+id).evaluate((c,v)=>{c.value=String(v);c.dispatchEvent(new Event("input",{bubbles:true}));},value);
    await set("point",65);await set("horizon",35);
    await expect(page.locator("#kv2-guide-marks")).toHaveAttribute("d","M 770 280 L 790 280 M 780 270 L 780 290");
    await page.locator("#kv2-guide-mode").selectOption("two");
    await set("left",10);await set("right",90);
    await expect(page.locator("#kv2-guide-marks")).toHaveAttribute("d","M 110 280 L 130 280 M 120 270 L 120 290 M 1070 280 L 1090 280 M 1080 270 L 1080 290");
    await page.locator("#kv2-zoom-in").click();
    const sizes=await page.evaluate(()=>["kv2-canvas","kv2-composition-guides"].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return [r.width,r.height];}));
    expect(Math.abs(sizes[0][0]-sizes[1][0])).toBeLessThan(2);
    expect(Math.abs(sizes[0][1]-sizes[1][1])).toBeLessThan(2);
    expect(await raster()).toBe(original);
    expect((await jsonBackup(page)).layers).toEqual(backup.layers);
    const pending=page.waitForEvent("download");await page.locator("#kv2-png").click();
    const png=await fs.readFile(await (await pending).path());
    expect(png.toString("base64")).toBe(original.split(",")[1]);
    await page.locator("#kv2-zoom-reset").click();
    await stroke(page);
    expect((await pixel(page))[0]).toBeLessThan(100);
    await page.locator("#kv2-guide-reset").click();
    await expect(layer).toBeHidden();
    await page.locator("#kv2-undo").click();
    await expect.poll(()=>pixel(page)).toEqual([255,255,255,255]);
  });

  test("group transform previews two layers around a shared pivot and undoes together", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
    await shapeDrag(page, [400, 400], [400, 400], 1007);
    await page.locator("#kv2-add-layer").click();
    await shapeDrag(page, [800, 400], [800, 400], 1008);
    await page.locator(".kv2-layer").last().locator(".kv2-move-together").check();
    const before = await jsonBackup(page);
    await page.locator("#kv2-transform-group").click();
    await expect(page.locator("#kv2-free-target")).toHaveText("2 lag transformeres samlet.");
    await page.locator("#kv2-free-angle").fill("90");
    const ink = await page.locator("#kv2-free-preview").evaluate(c => {
      const ctx = c.getContext("2d");
      return [ctx.getImageData(600, 200, 1, 1).data[0], ctx.getImageData(600, 600, 1, 1).data[0]];
    });
    expect(ink.every(v => v < 100)).toBe(true);
    expect((await jsonBackup(page)).layers).toEqual(before.layers);
    await page.locator("#kv2-clear-move-group").click();
    await expect(page.locator("#kv2-transform-overlay")).toBeHidden();
    expect((await jsonBackup(page)).layers).toEqual(before.layers);
    await page.locator(".kv2-layer").last().locator(".kv2-move-together").check();
    await page.locator("#kv2-transform-group").click();
    await page.locator("#kv2-free-angle").fill("90");
    await page.locator("#kv2-free-commit").click();
    expect((await pxAt(page, 600, 200))[0]).toBeLessThan(100);
    expect((await pxAt(page, 600, 600))[0]).toBeLessThan(100);
    await page.locator("#kv2-undo").click();
    await expect.poll(async () => (await pxAt(page, 400, 400))[0]).toBeLessThan(100);
    expect((await pxAt(page, 800, 400))[0]).toBeLessThan(100);
  });

  test("named layer groups preserve membership in backup and support undoable group controls", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
    await shapeDrag(page, [300, 200], [300, 200], 1005);
    await page.locator("#kv2-add-layer").click();
    await shapeDrag(page, [700, 400], [700, 400], 1006);
    await page.locator(".kv2-layer").last().locator(".kv2-move-together").check();
    await page.locator("#kv2-group-name").fill("Landskap");
    await page.locator("#kv2-group-save").click();
    const grouped = await jsonBackup(page);
    expect(grouped.layers.map(l => l.groupName)).toEqual(["Landskap", "Landskap"]);
    await page.locator("#kv2-group-lock-action").click();
    expect((await jsonBackup(page)).layers.every(l => l.locked)).toBe(true);
    await page.locator("#kv2-undo").click();
    await expect.poll(async () => (await jsonBackup(page)).layers.every(l => !l.locked)).toBe(true);
    await page.locator("#kv2-group-select").selectOption("Landskap");
    await page.locator("#kv2-group-hide-action").click();
    expect((await jsonBackup(page)).layers.every(l => !l.visible)).toBe(true);
    await page.locator("#kv2-group-show-action").click();
    await page.locator("#kv2-group-select-action").click();
    await expect(page.locator("#kv2-move-count")).toHaveText("2 lag ved Flytt lag");
    page.once("dialog", dialog => dialog.accept());
    await page.locator("#kv2-import").setInputFiles({ name: "group.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(grouped)) });
    await expect(page.locator("#kv2-status")).toHaveText("Importert – lagre for å beholde");
    await expect(page.locator("#kv2-group-select option")).toHaveCount(2);
    expect((await jsonBackup(page)).layers.map(l => l.groupName)).toEqual(["Landskap", "Landskap"]);
    await page.locator("#kv2-group-select").selectOption("Landskap");
    await page.locator("#kv2-group-dissolve-action").click();
    expect((await jsonBackup(page)).layers.every(l => !l.groupName)).toBe(true);
  });

  test("multi-layer move preserves relative positions, locks and one-step undo", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
    await shapeDrag(page, [300, 200], [300, 200], 1001);
    await page.locator("#kv2-add-layer").click();
    await shapeDrag(page, [600, 300], [600, 300], 1002);
    await page.locator("#kv2-add-layer").click();
    await shapeDrag(page, [900, 500], [900, 500], 1003);
    await page.locator(".kv2-layer").last().locator(".kv2-move-together").check();
    await page.locator(".kv2-layer").nth(1).getByRole("button", { name: /^Lås / }).click();
    await expect(page.locator(".kv2-layer").nth(1).locator(".kv2-move-together")).toBeDisabled();
    await expect(page.locator("#kv2-move-count")).toHaveText("2 lag ved Flytt lag");
    await page.locator("#kv2-move").click();
    const before = await jsonBackup(page);
    await shapeDrag(page, [900, 500], [950, 530], 1004);
    const after = await jsonBackup(page);
    expect(after.layers.map(l => [l.x, l.y])).toEqual([[50, 30], [0, 0], [50, 30]]);
    await page.locator("#kv2-undo").click();
    await expect.poll(async () => (await pxAt(page, 900, 500))[0]).toBeLessThan(100);
    expect((await jsonBackup(page)).layers.map(l => [l.x, l.y])).toEqual(before.layers.map(l => [l.x, l.y]));
    await page.locator("#kv2-clear-move-group").click();
    await expect(page.locator("#kv2-move-count")).toHaveText("1 lag ved Flytt lag");
  });

  test("optional magnetic guides snap content to canvas center and undo without guide pixels", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
    await shapeDrag(page, [700, 400], [700, 400], 995);
    const before = await jsonBackup(page);
    await page.locator("#kv2-move").click();
    await expect(page.locator("#kv2-snap-enabled")).not.toBeChecked();
    await page.locator("#kv2-snap-enabled").check();
    await shapePointer(page, "pointerdown", 700, 400, 996);
    await shapePointer(page, "pointermove", 601, 401, 996);
    await expect(page.locator("#kv2-snap-guides")).toBeVisible();
    await expect(page.locator("#kv2-snap-x")).toHaveAttribute("x1", "600");
    await expect(page.locator("#kv2-snap-y")).toHaveAttribute("y1", "400");
    await shapePointer(page, "pointerup", 601, 401, 996);
    await expect(page.locator("#kv2-snap-guides")).toBeHidden();
    expect((await pxAt(page, 600, 400))[0]).toBeLessThan(100);
    expect((await pxAt(page, 700, 400))[0]).toBe(255);
    await page.locator("#kv2-undo").click();
    await expect.poll(async () => (await pxAt(page, 700, 400))[0]).toBeLessThan(100);
    expect((await jsonBackup(page)).layers).toEqual(before.layers);
  });

  test("magnetic guides align visible layers and ignore hidden reference layers", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
    await shapeDrag(page, [350, 260], [350, 260], 997);
    await page.locator("#kv2-add-layer").click();
    await shapeDrag(page, [750, 500], [750, 500], 998);
    const before = await jsonBackup(page);
    await page.locator("#kv2-move").click();
    await page.locator("#kv2-snap-enabled").check();
    await shapePointer(page, "pointerdown", 750, 500, 999);
    await shapePointer(page, "pointermove", 351, 500, 999);
    await expect(page.locator("#kv2-snap-guides")).toBeVisible();
    await expect(page.locator("#kv2-snap-x")).toHaveAttribute("x1", "350");
    await shapePointer(page, "pointerup", 351, 500, 999);
    const after = await jsonBackup(page);
    expect(after.layers[0]).toEqual(before.layers[0]);
    expect(after.layers[1].x).toBe(before.layers[1].x - 400);
    await page.locator("#kv2-undo").click();
    await expect.poll(async () => (await pxAt(page, 750, 500))[0]).toBeLessThan(100);
    await page.locator(".kv2-layer").last().getByRole("button", { name: /^Skjul / }).click();
    await shapePointer(page, "pointerdown", 750, 500, 1000);
    await shapePointer(page, "pointermove", 351, 500, 1000);
    await expect(page.locator("#kv2-snap-guides")).toBeHidden();
    await shapePointer(page, "pointerup", 351, 500, 1000);
    expect((await jsonBackup(page)).layers[1].x).toBe(before.layers[1].x - 399);
  });

  test("direct transform handles update draft, cancel pointer gestures and commit once", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
    await shapeDrag(page, [700, 400], [700, 400], 990);
    const before = await jsonBackup(page);
    await page.locator("#kv2-transform-free").click();
    await expect(page.locator("#kv2-transform-overlay")).toBeVisible();
    const drag = async (key, dx, dy, type = "pointerup") => page.locator("#kv2-transform-overlay").evaluate((svg, d) => {
      const handle = svg.querySelector("#kv2-handle-" + d.key), box = svg.getBoundingClientRect();
      const x = Number(handle.getAttribute("cx")), y = Number(handle.getAttribute("cy"));
      const send = (node, type, a, b) => node.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerType: "pen", pointerId: 991, button: 0,
        buttons: type === "pointerdown" || type === "pointermove" ? 1 : 0,
        clientX: box.left + a * box.width / 1200, clientY: box.top + b * box.height / 800
      }));
      send(handle, "pointerdown", x, y);
      send(svg, "pointermove", x + d.dx, y + d.dy);
      send(svg, d.type, x + d.dx, y + d.dy);
    }, { key, dx, dy, type });
    await drag("se", 85, 35);
    await expect(page.locator("#kv2-free-x")).toHaveValue("150");
    await expect(page.locator("#kv2-free-y")).toHaveValue("150");
    await drag("pivot", 40, 20);
    await expect(page.locator("#kv2-handle-pivot")).toHaveAttribute("cx", "640");
    await drag("rotate", 25, 20, "pointercancel");
    await expect(page.locator("#kv2-free-angle")).toHaveValue("0");
    expect((await jsonBackup(page)).layers).toEqual(before.layers);
    await page.locator("#kv2-free-commit").click();
    await expect(page.locator("#kv2-transform-overlay")).toBeHidden();
    expect((await pxAt(page, 730, 390))[0]).toBeLessThan(100);
    await page.locator("#kv2-undo").click();
    await expect.poll(async () => (await pxAt(page, 700, 400))[0]).toBeLessThan(100);
  });

  test("free transform preview is isolated, supports independent scale and one-step undo", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
    await shapeDrag(page, [700, 400], [700, 400], 987);
    const before = await jsonBackup(page);
    expect((await pxAt(page, 700, 400))[0]).toBeLessThan(100);
    await page.locator("#kv2-transform-free").click();
    await expect(page.locator("#kv2-free-commit")).toBeDisabled();
    await page.locator("#kv2-free-angle").fill("45");
    await page.locator("#kv2-free-x").fill("150");
    await expect(page.locator("#kv2-free-y")).toHaveValue("150");
    await page.locator("#kv2-free-ratio").uncheck();
    await page.locator("#kv2-free-y").fill("100");
    await expect(page.locator("#kv2-free-x")).toHaveValue("150");
    const preview = await page.locator("#kv2-free-preview").evaluate(canvas =>
      canvas.getContext("2d").getImageData(706, 506, 1, 1).data[0]);
    expect(preview).toBeLessThan(100);
    expect((await pxAt(page, 700, 400))[0]).toBeLessThan(100);
    expect((await jsonBackup(page)).layers).toEqual(before.layers);
    await page.locator("#kv2-free-cancel").click();
    await expect(page.locator("#kv2-free-transform-panel")).toBeHidden();
    expect((await jsonBackup(page)).layers).toEqual(before.layers);
    await page.locator("#kv2-transform-free").click();
    await page.locator("#kv2-free-angle").fill("45");
    await page.locator("#kv2-free-x").fill("150");
    await page.locator("#kv2-free-commit").click();
    await expect(page.locator("#kv2-free-transform-panel")).toBeHidden();
    expect((await pxAt(page, 706, 506))[0]).toBeLessThan(100);
    expect((await pxAt(page, 700, 400))[0]).toBe(255);
    await page.locator("#kv2-undo").click();
    await expect.poll(async () => (await pxAt(page, 700, 400))[0]).toBeLessThan(100);
    await page.locator("#kv2-redo").click();
    await expect.poll(async () => (await pxAt(page, 706, 506))[0]).toBeLessThan(100);
  });

  test("free transform keeps masks aligned and abandons drafts on layer change", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
    await shapeDrag(page, [700, 400], [700, 400], 988);
    await page.locator("#kv2-mask-add").click();
    await shapeDrag(page, [700, 400], [700, 400], 989);
    await page.locator("#kv2-mask-edit").click();
    expect((await pxAt(page, 700, 400))[0]).toBe(255);
    await page.locator("#kv2-transform-free").click();
    await page.locator("#kv2-free-angle").fill("45");
    await page.locator("#kv2-free-commit").click();
    expect((await pxAt(page, 671, 471))[0]).toBe(255);
    await page.locator("#kv2-mask-toggle").click();
    expect((await pxAt(page, 671, 471))[0]).toBeLessThan(100);
    await page.locator("#kv2-transform-free").click();
    await page.locator("#kv2-free-angle").fill("30");
    await page.locator("#kv2-add-layer").click();
    await expect(page.locator("#kv2-free-transform-panel")).toBeHidden();
    expect((await jsonBackup(page)).layers).toHaveLength(2);
  });

  test("photo import, three editable layers, local save and reload", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
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
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
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
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
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
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
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
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
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
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
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
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
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
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
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
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
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
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
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
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
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
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
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

  test("non-destructive layer mask hides and restores original pixels, with undo and saved backup", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
    await page.locator("#kv2-color").evaluate((node) => {
      node.value = "#d34539"; node.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await stroke(page);
    const readJson = async () => {
      const pending = page.waitForEvent("download");
      await page.locator("#kv2-json").click();
      return JSON.parse(await fs.readFile(await (await pending).path(), "utf8"));
    };
    const original = await readJson();
    expect((await pixel(page)).slice(0, 3)).toEqual([211, 69, 57]);
    await expect(page.locator("#kv2-mask-edit")).toBeDisabled();
    await page.locator("#kv2-mask-add").click();
    await expect(page.locator("#kv2-mask-edit")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#kv2-mask-status")).toContainText("Du redigerer masken");
    await expect(page.locator("#kv2-eraser")).toHaveAttribute("aria-pressed", "true");

    await stroke(page); // erase the mask's opacity, not the artwork's pixels
    expect((await pixel(page)).slice(0, 3)).toEqual([255, 255, 255]);
    const masked = await readJson();
    expect(masked.layers[0].bitmap).toBe(original.layers[0].bitmap);
    expect(masked.layers[0].maskBitmap).toMatch(/^data:image\/png;base64,/);
    expect(masked.layers[0].maskEnabled).toBe(true);
    await page.locator("#kv2-mask-toggle").click();
    expect((await pixel(page)).slice(0, 3)).toEqual([211, 69, 57]);
    await expect(page.locator("#kv2-mask-status")).toContainText("av");
    await page.locator("#kv2-mask-toggle").click();
    expect((await pixel(page)).slice(0, 3)).toEqual([255, 255, 255]);

    await page.locator("#kv2-mask-edit").click();
    await expect(page.locator("#kv2-mask-edit")).toHaveAttribute("aria-pressed", "true");
    await page.locator("#kv2-brush").click();
    await stroke(page); // white brush reveals content hidden by the mask
    expect((await pixel(page)).slice(0, 3)).toEqual([211, 69, 57]);
    await page.locator("#kv2-undo").click();
    await expect.poll(async () => (await pixel(page))[0]).toBe(255);
    await page.locator("#kv2-redo").click();
    await expect.poll(async () => (await pixel(page))[0]).toBe(211);

    // The mask is independently editable after local save, reload and JSON import.
    await page.locator("#kv2-title").fill("Maske i atelieret");
    await page.locator("#kv2-save").click();
    await expect(page.locator("#kv2-status")).toHaveText("Lagret på denne enheten");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#kv2-projects .kv2-project--saved")
      .getByRole("button", { name: "Åpne", exact: true }).click();
    await expect(page.locator("#kv2-title")).toHaveValue("Maske i atelieret");
    await expect(page.locator("#kv2-mask-status")).toContainText("Lagmaske: på");
    expect((await pixel(page)).slice(0, 3)).toEqual([211, 69, 57]);
    const restored = await readJson();
    expect(restored.layers[0].bitmap).toBe(original.layers[0].bitmap);
    expect(restored.layers[0].maskBitmap).toMatch(/^data:image\/png;base64,/);
  });

  test("layer masks stay attached after move, duplicate and transform, without modifying image bitmap", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
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
    const red = (x, y) => canvas.evaluate((node, pos) =>
      node.getContext("2d").getImageData(pos.x, pos.y, 1, 1).data[0], { x, y });
    const saved = async () => {
      const pending = page.waitForEvent("download");
      await page.locator("#kv2-json").click();
      return JSON.parse(await fs.readFile(await (await pending).path(), "utf8"));
    };
    await drag({ x0: .5, y0: .5, x1: .5, y1: .5, id: 901 });
    const original = await saved();
    await page.locator("#kv2-mask-add").click();
    await drag({ x0: .5, y0: .5, x1: .5, y1: .5, id: 902 });
    expect(await red(600, 400)).toBe(255);
    await page.locator("#kv2-move").click();
    await drag({ x0: .5, y0: .5, x1: .5 + 100 / 1200, y1: .5, id: 903 });
    const moved = await saved();
    expect(moved.layers[0].x).toBe(100);
    expect(moved.layers[0].bitmap).toBe(original.layers[0].bitmap);
    expect(await red(700, 400)).toBe(255);
    await page.locator("#kv2-mask-toggle").click();
    expect(await red(700, 400)).toBeLessThan(100);
    await page.locator("#kv2-mask-toggle").click();
    await page.locator("#kv2-duplicate-layer").click();
    await expect(page.locator("#kv2-layer-count")).toContainText("2 av 8 lag");
    const copied = await saved();
    expect(copied.layers[1].maskBitmap).toMatch(/^data:image\/png;base64,/);
    expect(copied.layers[1].bitmap).toBe(moved.layers[0].bitmap);
    await page.locator("#kv2-layers .kv2-layer").last().locator("button").first().click();
    expect(await red(700, 400)).toBe(255); // duplicate still obeys mask
    await page.locator("#kv2-mask-toggle").click(); // unmask the selected duplicate
    expect(await red(700, 400)).toBeLessThan(100);
    await page.locator("#kv2-mask-toggle").click();

    // Test rotation of bitmap and mask as one linked pair.
    await page.locator("#kv2-transform-rotate").click();
    const rotated = await saved();
    expect(rotated.layers[1].maskBitmap).toMatch(/^data:image\/png;base64,/);
    expect(rotated.layers[0].bitmap).toBe(moved.layers[0].bitmap);
    await page.locator("#kv2-undo").click();
    await expect(page.locator("#kv2-layer-count")).toContainText("2 av 8 lag");
    expect(await red(700, 400)).toBe(255);
  });

  test("invalid imported layer mask never replaces the active artwork; removal reveals originals", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
    await stroke(page);
    await page.locator("#kv2-mask-add").click();
    await stroke(page);
    const colorBefore = await pixel(page);
    expect(colorBefore.slice(0, 3)).toEqual([255, 255, 255]);
    const pending = page.waitForEvent("download");
    await page.locator("#kv2-json").click();
    const exported = JSON.parse(await fs.readFile(await (await pending).path(), "utf8"));
    expect(exported.layers[0].maskBitmap).toMatch(/^data:image\/png;base64,/);
    const corrupted = structuredClone(exported);
    corrupted.layers[0].maskBitmap = "data:image/png;base64,not-really-png";
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#kv2-import").setInputFiles({
      name: "invalid-mask.kunstrommet.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(corrupted), "utf8")
    });
    await expect(page.locator("#kv2-status")).toContainText("Import feilet");
    expect(await pixel(page)).toEqual(colorBefore);
    await expect(page.locator("#kv2-mask-status")).toContainText("Lagmaske: på");
    await page.locator("#kv2-mask-remove").click();
    await expect(page.locator("#kv2-mask-status")).toContainText("Ingen maske");
    expect((await pixel(page)).slice(0, 3)).not.toEqual([255, 255, 255]);
    const backup = page.waitForEvent("download");
    await page.locator("#kv2-json").click();
    const without = JSON.parse(await fs.readFile(await (await backup).path(), "utf8"));
    expect(without.layers[0].maskBitmap).toBeUndefined();
    await page.locator("#kv2-undo").click();
    await expect(page.locator("#kv2-mask-status")).toContainText("Lagmaske: på");
    expect((await pixel(page)).slice(0, 3)).toEqual([255, 255, 255]);
  });

  test("cut selection extracts pixels without touching other areas; undo and redo restore layers", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
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
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
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
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
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
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
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
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
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

  test("fill selection is protected while editing a layer mask", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
    const canvas = page.locator("#kv2-canvas");
    const select = async () => canvas.evaluate((node) => {
      const box = node.getBoundingClientRect();
      const send = (type, x, y, buttons) => node.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerType: "mouse", pointerId: 896, button: 0,
        buttons, clientX: box.left + x * box.width, clientY: box.top + y * box.height
      }));
      send("pointerdown", .3, .3, 1);
      send("pointermove", .7, .7, 1);
      send("pointerup", .7, .7, 0);
    });
    await page.locator("#kv2-select").click();
    await select();
    await expect(page.locator("#kv2-fill-selection")).toBeEnabled();
    await page.locator("#kv2-mask-add").click();
    await expect(page.locator("#kv2-mask-edit")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#kv2-fill-selection")).toBeDisabled();
    await page.locator("#kv2-mask-edit").click();
    await expect(page.locator("#kv2-fill-selection")).toBeEnabled();
    await page.locator("#kv2-fill-selection").click();
    await expect(page.locator("#kv2-status")).toHaveText("Ulagrede endringer");
  });


  test("lasso fill and undo respect the polygon, not its bounding box", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
    await page.locator("#kv2-color").evaluate((el) => {
      el.value = "#3c75ac"; el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.locator("#kv2-lasso").click();
    await traceLasso(page, [[200, 150], [950, 150], [600, 690], [200, 150]]);
    await expect(page.locator("#kv2-lasso-overlay")).toBeVisible();
    await expect(page.locator("#kv2-selection-overlay")).toBeHidden();
    await page.locator("#kv2-fill-selection").click();
    expect(await pxAt(page, 600, 300)).toEqual([60, 117, 172, 255]);
    expect(await pxAt(page, 300, 600)).toEqual([255, 255, 255, 255]);
    await page.locator("#kv2-undo").click();
    await expect.poll(() => pxAt(page, 600, 300)).toEqual([255, 255, 255, 255]);
    await page.locator("#kv2-redo").click();
    await expect.poll(() => pxAt(page, 600, 300)).toEqual([60, 117, 172, 255]);
    await page.locator("#kv2-select").click();
    await page.locator("#kv2-clear-selection").click();
    await expect(page.locator("#kv2-lasso-overlay")).toBeHidden();
    await expect(page.locator("#kv2-fill-selection")).toBeDisabled();
  });

  test("lasso copy and cut preserve outside pixels and undo works", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
    await page.locator("#kv2-color").evaluate((el) => {
      el.value = "#ce5423"; el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.locator("#kv2-select").click();
    await page.locator("#kv2-canvas").evaluate((canvas) => {
      const b = canvas.getBoundingClientRect();
      const event = (type, x, y) => canvas.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerType: "mouse", pointerId: 984, button: 0,
        buttons: type === "pointerup" ? 0 : 1,
        clientX: b.left + x * b.width / 1200, clientY: b.top + y * b.height / 800
      }));
      event("pointerdown", 200, 150); event("pointermove", 950, 690);
      event("pointerup", 950, 690);
    });
    await page.locator("#kv2-fill-selection").click();
    await page.locator("#kv2-lasso").click();
    await traceLasso(page, [[200, 150], [950, 150], [600, 690], [200, 150]], 985);
    await page.locator("#kv2-copy-selection").click();
    await expect(page.locator("#kv2-layer-count")).toContainText("2 av 8 lag");
    let image = await jsonBackup(page);
    expect((await pngLayersAt(page, image.layers, 300, 600))[1][3]).toBe(0);
    expect((await pngLayersAt(page, image.layers, 600, 300))[1]).toEqual([206, 84, 35, 255]);
    await page.locator("#kv2-undo").click();
    await expect(page.locator("#kv2-layer-count")).toContainText("1 av 8 lag");
    await page.locator("#kv2-cut-selection").click();
    await expect(page.locator("#kv2-layer-count")).toContainText("2 av 8 lag");
    image = await jsonBackup(page);
    expect((await pngLayersAt(page, image.layers, 600, 300))[0][3]).toBe(0);
    expect((await pngLayersAt(page, image.layers, 300, 600))[0]).toEqual([206, 84, 35, 255]);
    expect((await pngLayersAt(page, image.layers, 600, 300))[1]).toEqual([206, 84, 35, 255]);
    await page.locator("#kv2-undo").click();
    await expect(page.locator("#kv2-layer-count")).toContainText("1 av 8 lag");
  });

  test("lasso rejects tiny areas, clips brush and mask, and PNG corners are transparent", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
    await page.locator("#kv2-lasso").click();
    await traceLasso(page, [[300, 300], [301, 301], [301, 300]], 986);
    await expect(page.locator("#kv2-fill-selection")).toBeDisabled();
    await expect(page.locator("#kv2-status")).toHaveText("Ingen markering");
    await traceLasso(page, [[200, 150], [950, 150], [600, 690], [200, 150]], 987);
    await page.locator("#kv2-color").evaluate((el) => {
      el.value = "#bd391f"; el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.locator("#kv2-size").evaluate((el) => {
      el.value = "60"; el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const tap = async (x, y, id) => page.locator("#kv2-canvas").evaluate((canvas, pos) => {
      const b = canvas.getBoundingClientRect();
      const send = (type) => canvas.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerType: "pen", pointerId: pos.id,
        button: 0, buttons: type === "pointerup" ? 0 : 1, pressure: .5,
        clientX: b.left + pos.x * b.width / 1200,
        clientY: b.top + pos.y * b.height / 800
      }));
      send("pointerdown"); send("pointerup");
    }, { x, y, id });
    await tap(600, 300, 988);
    await tap(300, 600, 989);
    expect(await pxAt(page, 600, 300)).toEqual([189, 57, 31, 255]);
    expect(await pxAt(page, 300, 600)).toEqual([255, 255, 255, 255]);
    await page.locator("#kv2-mask-add").click();
    await tap(600, 300, 990);
    expect(await pxAt(page, 600, 300)).toEqual([255, 255, 255, 255]);
    await page.locator("#kv2-mask-edit").click();
    const pending = page.waitForEvent("download");
    await page.locator("#kv2-export-selection").click();
    const data = await fs.readFile(await (await pending).path());
    const result = await page.evaluate(async (b64) => {
      const img = new Image(); img.src = "data:image/png;base64," + b64;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.width; canvas.height = img.height;
      const context = canvas.getContext("2d"); context.drawImage(img, 0, 0);
      const alpha = (x, y) => context.getImageData(x, y, 1, 1).data[3];
      return { w: img.width, corner: alpha(5, img.height - 5), inside: alpha(500, 50) };
    }, data.toString("base64"));
    expect(result.w).toBeGreaterThan(700);
    expect(result.corner).toBe(0);
    expect(result.inside).toBe(255);
  });


  test("palette files export only named colors and merge safely",async({page})=>{
    await page.goto("/kunstrommet.html?studio=overview",{waitUntil:"domcontentloaded"});
    await page.locator("#kv2-color").fill("#112233");
    await page.locator("#kv2-color-add").click();
    await page.locator("#kv2-color-palette-name").fill("Original");
    await page.locator("#kv2-color-palette-save").click();
    const pending=page.waitForEvent("download");
    await page.locator("#kv2-color-export").click();
    const file=JSON.parse(await fs.readFile(await (await pending).path(),"utf8"));
    expect(file).toEqual({format:"aha-kunstrommet-palettes",version:1,palettes:[{name:"Original",colors:["#112233"]}]});
    const before=await jsonBackup(page);
    const importFile=data=>page.locator("#kv2-color-import").setInputFiles({name:"paletter.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(data))});
    await importFile({...file,palettes:[{name:"Original",colors:["#ffffff"]},{name:"Hav",colors:["#0077AA","#224466"]}]});
    await expect(page.locator("#kv2-color-library-status")).toContainText("Importerte 1 paletter");
    await page.locator("#kv2-color-library-select").selectOption("Original");
    await expect(page.locator("#kv2-color-saved")).toContainText("#112233");
    await page.locator("#kv2-color-library-select").selectOption("Hav");
    await expect(page.locator("#kv2-color-saved")).toContainText("#0077aa");
    await importFile({...file,palettes:[{name:"Ny",colors:["#abcdef"]},{name:"Ugyldig",colors:["red"]}]});
    await expect(page.locator("#kv2-color-library-status")).toContainText("Import avbrutt");
    await expect(page.locator("#kv2-color-library-select option")).toHaveCount(3);
    await importFile({...file,palettes:Array.from({length:19},(_,i)=>({name:"Palett "+i,colors:["#123456"]}))});
    await expect(page.locator("#kv2-color-library-status")).toContainText("Ikke nok plass");
    await expect(page.locator("#kv2-color-library-select option")).toHaveCount(3);
    expect((await jsonBackup(page)).layers).toEqual(before.layers);
  });

  test("color library remembers chosen colors and named harmonies without changing art",async({page})=>{
    await page.goto("/kunstrommet.html?studio=overview",{waitUntil:"domcontentloaded"});
    await page.evaluate(()=>localStorage.setItem("aha_profile_id","color-library-a"));
    const before=await jsonBackup(page);
    await page.locator("#kv2-color").fill("#ff0000");
    await page.locator("#kv2-color").dispatchEvent("change");
    await expect(page.locator("#kv2-color-harmony button")).toHaveCount(2);
    await expect(page.locator("#kv2-color-harmony")).toContainText("#00ffff");
    await page.locator("#kv2-color-harmony-mode").selectOption("triad");
    await expect(page.locator("#kv2-color-harmony")).toContainText("#00ff00");
    await expect(page.locator("#kv2-color-harmony")).toContainText("#0000ff");
    await page.locator("#kv2-color-add-harmony").click();
    await page.locator("#kv2-color-palette-name").fill("Primær");
    await page.locator("#kv2-color-palette-save").click();
    await expect(page.locator("#kv2-color-library-status")).toContainText("Palett lagret lokalt");
    expect((await jsonBackup(page)).layers).toEqual(before.layers);
    await page.reload({waitUntil:"domcontentloaded"});
    await expect(page.locator("#kv2-color-recent")).toContainText("#ff0000");
    await page.locator("#kv2-color-library-select").selectOption("Primær");
    await page.locator("#kv2-color-saved button").filter({hasText:"#0000ff"}).click();
    await expect(page.locator("#kv2-color")).toHaveValue("#0000ff");
    await page.locator("#kv2-color-palette-load").click();
    await expect(page.locator("#kv2-color-draft button")).toHaveCount(3);
    await page.evaluate(()=>localStorage.setItem("aha_profile_id","color-library-b"));
    await page.reload({waitUntil:"domcontentloaded"});
    await expect(page.locator("#kv2-color-library-select option")).toHaveCount(1);
  });

  test("studio brush samples use the real dab engine without editing art", async ({page}) => {
    await page.goto("/kunstrommet.html?studio=overview",{waitUntil:"domcontentloaded"});
    await page.locator("#kv2-brush-preset").selectOption("advanced");
    const before=await jsonBackup(page);
    const sample=()=>page.locator("#kv2-active-brush-sample").evaluate(c=>c.toDataURL());
    await expect.poll(async()=>page.locator("#kv2-studio-sample-ink").evaluate(c=>{
      const p=c.getContext("2d").getImageData(0,0,c.width,c.height).data;
      return p.some((n,i)=>i%4===3&&n>0);
    })).toBe(true);
    const old=await sample();
    await page.locator("#kv2-color").fill("#aabbcc");
    await page.locator("#kv2-studio-brush-charcoal").click();
    await expect(page.locator("#kv2-brush-texture")).toHaveValue("charcoal");
    await expect(page.locator("#kv2-brush-tilt-enabled")).toBeChecked();
    await expect(page.locator("#kv2-color")).toHaveValue("#aabbcc");
    await expect.poll(sample).not.toBe(old);
    await page.locator("#kv2-brush-library-save").click();
    await expect(page.locator("#kv2-saved-brush-sample")).toBeVisible();
    await page.locator("#kv2-studio-brush-calligraphy").click();
    await expect(page.locator("#kv2-brush-aspect")).toHaveValue("22");
    await expect(page.locator("#kv2-brush-angle")).toHaveValue("40");
    await page.locator("#kv2-brush-library-load").click();
    await expect(page.locator("#kv2-brush-texture")).toHaveValue("charcoal");
    expect((await jsonBackup(page)).layers).toEqual(before.layers);
  });

  test("studio focus and folding settings preserve artwork and make canvas accessible", async ({page}) => {
    await page.setViewportSize({width:1366,height:900});
    await page.goto("/kunstrommet.html?studio=overview",{waitUntil:"domcontentloaded"});
    const before=await jsonBackup(page);
    const width=()=>page.locator("#kv2-canvas").evaluate(c=>c.getBoundingClientRect().width);
    const normal=await width();
    await page.locator("#kv2-focus-mode").click();
    await expect(page.locator("#kv2-focus-mode")).toHaveAttribute("aria-pressed","true");
    await expect(page.locator(".kv2-sidebar")).toBeHidden();
    expect(await width()).toBeGreaterThan(normal+100);
    await expect(page.locator("#kv2-save")).toBeVisible();
    await page.locator("#kv2-focus-mode").click();
    await expect(page.locator(".kv2-sidebar")).toBeVisible();
    expect((await jsonBackup(page)).layers).toEqual(before.layers);
    await page.setViewportSize({width:820,height:1180});
    await page.locator("#kv2-brush-preset").selectOption("advanced");
    const position=await page.evaluate(()=>({
      canvas:document.querySelector("#kv2-canvas").getBoundingClientRect().top,
      settings:document.querySelector("#kv2-brush-advanced").getBoundingClientRect().top
    }));
    expect(position.settings).toBeGreaterThan(position.canvas);
    await page.locator("#kv2-brush-settings-detail summary").click();
    await expect(page.locator("#kv2-brush-hardness")).toBeHidden();
    await page.locator("#kv2-brush-settings-jump").click();
    await expect(page.locator("#kv2-brush-hardness")).toBeVisible();
    await page.locator("#kv2-back-to-canvas").click();
    await expect(page.locator("#kv2-paper")).toBeFocused();
    expect((await jsonBackup(page)).layers).toEqual(before.layers);
  });

  test("pen tilt widens and rotates shading only when enabled", async ({page}) => {
    await page.goto("/kunstrommet.html?studio=overview",{waitUntil:"domcontentloaded"});
    await page.locator("#kv2-brush-preset").selectOption("advanced");
    await page.locator("#kv2-size").evaluate(c=>{c.value="40";c.dispatchEvent(new Event("input",{bubbles:true}));});
    await page.locator("#kv2-brush-pressure-width").uncheck();
    for(const [name,v] of [["hardness",100],["flow",100],["tilt-strength",100]]) {
      await page.locator("#kv2-brush-"+name).evaluate((c,v)=>{c.value=String(v);c.dispatchEvent(new Event("input",{bubbles:true}));},v);
    }
    const tap=(pointerType,tiltX,tiltY)=>page.locator("#kv2-canvas").evaluate((c,p)=>{
      const box=c.getBoundingClientRect();
      for(const type of ["pointerdown","pointerup"]) c.dispatchEvent(new PointerEvent(type,{
        bubbles:true,cancelable:true,pointerId:1491,pointerType:p.pointerType,button:0,
        buttons:type==="pointerdown"?1:0,pressure:type==="pointerdown"?.5:0,
        tiltX:p.tiltX,tiltY:p.tiltY,clientX:box.left+box.width/2,clientY:box.top+box.height/2
      }));
    },{pointerType,tiltX,tiltY});
    await tap("pen",60,0);
    expect((await pxAt(page,632,400))[0]).toBe(255);
    await page.locator("#kv2-undo").click();
    await expect.poll(async()=> (await pixel(page))[0]).toBe(255);
    await page.locator("#kv2-brush-tilt-enabled").check();
    await tap("pen",60,0);
    expect((await pxAt(page,632,400))[0]).toBeLessThan(150);
    expect((await pxAt(page,600,432))[0]).toBe(255);
    await page.locator("#kv2-undo").click();
    await expect.poll(async()=> (await pixel(page))[0]).toBe(255);
    await tap("pen",0,60);
    expect((await pxAt(page,600,432))[0]).toBeLessThan(150);
    expect((await pxAt(page,632,400))[0]).toBe(255);
    await page.locator("#kv2-undo").click();
    await expect.poll(async()=> (await pixel(page))[0]).toBe(255);
    await tap("mouse",60,0);
    expect((await pxAt(page,632,400))[0]).toBe(255);
    await page.locator("#kv2-brush-name").fill("Sideskygge");
    await page.locator("#kv2-brush-library-save").click();
    await page.reload({waitUntil:"domcontentloaded"});
    await page.locator("#kv2-brush-preset").selectOption("advanced");
    await page.locator("#kv2-brush-library").selectOption("Sideskygge");
    await page.locator("#kv2-brush-library-load").click();
    await expect(page.locator("#kv2-brush-tilt-enabled")).toBeChecked();
    await expect(page.locator("#kv2-brush-tilt-strength")).toHaveValue("100");
  });

  test("flat brush rotates, scatters reproducibly and saves dynamics", async ({page}) => {
    await page.goto("/kunstrommet.html?studio=overview",{waitUntil:"domcontentloaded"});
    await page.locator("#kv2-brush-preset").selectOption("advanced");
    const set=async(name,value)=>page.locator("#kv2-brush-"+name).evaluate((c,v)=>{c.value=String(v);c.dispatchEvent(new Event("input",{bubbles:true}));},value);
    await page.locator("#kv2-size").evaluate(c=>{c.value="60";c.dispatchEvent(new Event("input",{bubbles:true}));});
    await page.locator("#kv2-brush-pressure-width").uncheck();
    await set("hardness",100);await set("flow",100);await set("aspect",20);
    await stroke(page);
    expect((await pxAt(page,620,400))[0]).toBeLessThan(60);
    expect((await pxAt(page,600,420))[0]).toBe(255);
    await page.locator("#kv2-undo").click();
    await expect.poll(async()=> (await pixel(page))[0]).toBe(255);
    await set("angle",90);await stroke(page);
    expect((await pxAt(page,620,400))[0]).toBe(255);
    expect((await pxAt(page,600,420))[0]).toBeLessThan(60);
    await page.locator("#kv2-undo").click();
    await expect.poll(async()=> (await pixel(page))[0]).toBe(255);
    await set("scatter",80);await set("rotation-jitter",60);
    await page.locator("#kv2-brush-follow-direction").check();
    await shapeDrag(page,[300,400],[900,400],1401);
    const first=(await jsonBackup(page)).layers[0].bitmap;
    await page.locator("#kv2-undo").click();
    await expect.poll(async()=> (await pixel(page))[0]).toBe(255);
    await shapeDrag(page,[300,400],[900,400],1402);
    expect((await jsonBackup(page)).layers[0].bitmap).toBe(first);
    await page.locator("#kv2-brush-name").fill("Flat penn");
    await page.locator("#kv2-brush-library-save").click();
    await page.reload({waitUntil:"domcontentloaded"});
    await page.locator("#kv2-brush-preset").selectOption("advanced");
    await page.locator("#kv2-brush-library").selectOption("Flat penn");
    await page.locator("#kv2-brush-library-load").click();
    await expect(page.locator("#kv2-brush-angle")).toHaveValue("90");
    await expect(page.locator("#kv2-brush-aspect")).toHaveValue("20");
    await expect(page.locator("#kv2-brush-scatter")).toHaveValue("80");
    await expect(page.locator("#kv2-brush-rotation-jitter")).toHaveValue("60");
    await expect(page.locator("#kv2-brush-follow-direction")).toBeChecked();
  });

  test("procedural texture dabs vary alpha and survive named brush reload", async ({page}) => {
    await page.goto("/kunstrommet.html?studio=overview",{waitUntil:"domcontentloaded"});
    await page.locator("#kv2-brush-preset").selectOption("advanced");
    await page.locator("#kv2-size").evaluate(c=>{c.value="60";c.dispatchEvent(new Event("input",{bubbles:true}));});
    await page.locator("#kv2-brush-pressure-width").uncheck();
    for (const [name,v] of [["hardness",100],["flow",100],["texture-strength",100]]) {
      await page.locator("#kv2-brush-"+name).evaluate((c,v)=>{c.value=String(v);c.dispatchEvent(new Event("input",{bubbles:true}));},v);
    }
    const sample=()=>page.locator("#kv2-canvas").evaluate(c=>{
      const p=c.getContext("2d").getImageData(590,390,20,20).data;
      const shades=[]; for(let i=0;i<p.length;i+=4) shades.push(p[i]);
      return {min:Math.min(...shades),max:Math.max(...shades)};
    });
    await stroke(page);
    const round=await sample();
    expect(round.max-round.min).toBeLessThan(3);
    await page.locator("#kv2-undo").click();
    await expect.poll(async()=> (await pixel(page))[0]).toBe(255);
    for(const mode of ["charcoal","chalk","watercolor","dry"]) {
      await page.locator("#kv2-brush-texture").selectOption(mode);
      await stroke(page);
      const textured=await sample();
      expect(textured.max-textured.min,mode).toBeGreaterThan(35);
      await page.locator("#kv2-undo").click();
      await expect.poll(async()=> (await pixel(page))[0]).toBe(255);
    }
    await page.locator("#kv2-brush-name").fill("Tørrpensel");
    await page.locator("#kv2-brush-library-save").click();
    await page.reload({waitUntil:"domcontentloaded"});
    await page.locator("#kv2-brush-preset").selectOption("advanced");
    await page.locator("#kv2-brush-library").selectOption("Tørrpensel");
    await page.locator("#kv2-brush-library-load").click();
    await expect(page.locator("#kv2-brush-texture")).toHaveValue("dry");
    await expect(page.locator("#kv2-brush-texture-strength")).toHaveValue("100");
  });

  test("brush library exports settings only and merges imports without overwriting", async ({page}) => {
    await page.goto("/kunstrommet.html?studio=overview",{waitUntil:"domcontentloaded"});
    await page.locator("#kv2-brush-preset").selectOption("advanced");
    await page.locator("#kv2-brush-name").fill("Original");
    await page.locator("#kv2-brush-library-save").click();
    const pending=page.waitForEvent("download");
    await page.locator("#kv2-brush-library-export").click();
    const file=JSON.parse(await fs.readFile(await (await pending).path(),"utf8"));
    expect(Object.keys(file).sort()).toEqual(["brushes","format","version"]);
    expect(file.brushes[0].name).toBe("Original");
    const baseline=await jsonBackup(page);
    const importFile=data=>page.locator("#kv2-brush-library-import").setInputFiles({name:"pensler.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(data))});
    await importFile({...file,brushes:[{name:"Original",settings:{...file.brushes[0].settings,flow:.9}},{name:"Akvarell",settings:{...file.brushes[0].settings,flow:.12}}]});
    await expect(page.locator("#kv2-brush-library-status")).toContainText("Importerte 1 pensler");
    await page.locator("#kv2-brush-library").selectOption("Original");
    await page.locator("#kv2-brush-library-load").click();
    await expect(page.locator("#kv2-brush-flow")).toHaveValue("35");
    await page.locator("#kv2-brush-library").selectOption("Akvarell");
    await page.locator("#kv2-brush-library-load").click();
    await expect(page.locator("#kv2-brush-flow")).toHaveValue("12");
    await importFile({...file,brushes:[{name:"Ugyldig",settings:{}}]});
    await expect(page.locator("#kv2-brush-library-status")).toContainText("Import avbrutt");
    await expect(page.locator("#kv2-brush-library option")).toHaveCount(3);
    expect((await jsonBackup(page)).layers).toEqual(baseline.layers);
  });

  test("named brushes persist locally, are profile scoped and do not edit artwork", async ({page}) => {
    await page.goto("/kunstrommet.html?studio=overview",{waitUntil:"domcontentloaded"});
    await page.evaluate(()=>localStorage.setItem("aha_profile_id","brush-test-a"));
    await page.locator("#kv2-brush-preset").selectOption("advanced");
    const before=await jsonBackup(page);
    await page.locator("#kv2-brush-hardness").evaluate(c=>{c.value="20";c.dispatchEvent(new Event("input",{bubbles:true}));});
    await page.locator("#kv2-brush-flow").evaluate(c=>{c.value="17";c.dispatchEvent(new Event("input",{bubbles:true}));});
    await page.locator("#kv2-color").fill("#aabbcc");
    await page.locator("#kv2-brush-pressure-flow").check();
    await page.locator("#kv2-brush-name").fill("Myk skygge");
    await page.locator("#kv2-brush-library-save").click();
    await expect(page.locator("#kv2-brush-library-status")).toContainText("Pensel lagret lokalt");
    expect((await jsonBackup(page)).layers).toEqual(before.layers);
    await page.reload({waitUntil:"domcontentloaded"});
    await page.locator("#kv2-brush-preset").selectOption("advanced");
    await page.locator("#kv2-brush-library").selectOption("Myk skygge");
    await page.locator("#kv2-brush-library-load").click();
    await expect(page.locator("#kv2-brush-hardness")).toHaveValue("20");
    await expect(page.locator("#kv2-brush-flow")).toHaveValue("17");
    await expect(page.locator("#kv2-color")).toHaveValue("#aabbcc");
    await expect(page.locator("#kv2-brush-pressure-flow")).toBeChecked();
    await page.locator("#kv2-brush-library-reset").click();
    await expect(page.locator("#kv2-brush-flow")).toHaveValue("35");
    await expect(page.locator("#kv2-brush-library option")).toHaveCount(2);
    await page.evaluate(()=>localStorage.setItem("aha_profile_id","brush-test-b"));
    await page.reload({waitUntil:"domcontentloaded"});
    await page.locator("#kv2-brush-preset").selectOption("advanced");
    await expect(page.locator("#kv2-brush-library option")).toHaveCount(1);
    await page.evaluate(()=>localStorage.setItem("aha_profile_id","brush-test-a"));
    await page.reload({waitUntil:"domcontentloaded"});
    await page.locator("#kv2-brush-preset").selectOption("advanced");
    await page.locator("#kv2-brush-library").selectOption("Myk skygge");
    page.once("dialog",dialog=>dialog.accept());
    await page.locator("#kv2-brush-library-delete").click();
    await expect(page.locator("#kv2-brush-library option")).toHaveCount(1);
  });

  test("advanced brush caps stroke opacity, respects flow, and cancels without edits", async ({page}) => {
    await page.goto("/kunstrommet.html?studio=overview",{waitUntil:"domcontentloaded"});
    await page.locator("#kv2-brush-preset").selectOption("advanced");
    const set = (name,value) => page.locator("#kv2-brush-"+name).evaluate((c,v)=>{c.value=String(v);c.dispatchEvent(new Event("input",{bubbles:true}));},value);
    await set("hardness",100); await set("opacity",50); await set("flow",100); await set("spacing",5);
    await page.locator("#kv2-size").evaluate(c=>{c.value="40";c.dispatchEvent(new Event("input",{bubbles:true}));});
    await page.locator("#kv2-brush-pressure-width").uncheck();
    const before=await jsonBackup(page);
    await shapePointer(page,"pointerdown",500,400,1301);
    await shapePointer(page,"pointermove",700,400,1301);
    await expect(page.locator("#kv2-brush-live")).toBeVisible();
    expect((await pixel(page))[0]).toBe(255);
    // Preview painting is scheduled by requestAnimationFrame, not by visibility.
    await expect.poll(async()=>{
      const preview=await page.locator("#kv2-brush-live").evaluate(c=>c.getContext("2d").getImageData(600,400,1,1).data[0]);
      return preview>=143 && preview<=146;
    }).toBe(true);
    await shapePointer(page,"pointercancel",700,400,1301);
    await expect(page.locator("#kv2-brush-live")).toBeHidden();
    expect((await jsonBackup(page)).layers).toEqual(before.layers);
    await shapeDrag(page,[500,400],[700,400],1302);
    expect((await pixel(page))[0]).toBeGreaterThanOrEqual(143);
    expect((await pixel(page))[0]).toBeLessThanOrEqual(146);
    await page.locator("#kv2-undo").click();
    await expect.poll(async()=> (await pixel(page))[0]).toBe(255);
    await set("opacity",100); await set("flow",25); await stroke(page);
    expect((await pixel(page))[0]).toBeGreaterThan(195);
    expect((await pixel(page))[0]).toBeLessThan(205);
  });

  test("advanced soft brush has a feathered edge and keeps original mask tools", async ({page}) => {
    await page.goto("/kunstrommet.html?studio=overview",{waitUntil:"domcontentloaded"});
    await page.locator("#kv2-brush-preset").selectOption("advanced");
    await page.locator("#kv2-size").evaluate(c=>{c.value="60";c.dispatchEvent(new Event("input",{bubbles:true}));});
    for (const [name,value] of [["hardness",0],["flow",100]]) {
      await page.locator("#kv2-brush-"+name).evaluate((c,v)=>{c.value=String(v);c.dispatchEvent(new Event("input",{bubbles:true}));},value);
    }
    await stroke(page);
    const center=(await pixel(page))[0], edge=(await pxAt(page,620,400))[0];
    expect(center).toBeLessThan(55); expect(edge).toBeGreaterThan(center+50); expect(edge).toBeLessThan(240);
    await page.locator("#kv2-mask-add").click();
    await expect(page.locator("#kv2-brush-advanced")).toBeHidden();
    await stroke(page);
    expect((await pixel(page))[0]).toBe(255);
    await page.locator("#kv2-brush").click(); await stroke(page);
    expect((await pixel(page))[0]).toBe(center);
  });

  test("brush presets and palette change the active brush without creating an edit", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#kv2-brush-preset")).toHaveValue("normal");
    await expect(page.locator("#kv2-status")).toHaveText("Nytt prosjekt");
    await page.locator("#kv2-brush-preset").selectOption("blyant");
    await page.locator("#kv2-hand").click();
    await page.locator("#kv2-swatch-himmel").click();
    await expect(page.locator("#kv2-color")).toHaveValue("#4a83bf");
    await expect(page.locator("#kv2-brush")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#kv2-swatch-himmel")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#kv2-swatch-blekk")).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("#kv2-status")).toHaveText("Nytt prosjekt");
    await page.locator("#kv2-brush-preset").selectOption("tusj");
    await stroke(page);
    expect(await pixel(page)).toEqual([74, 131, 191, 255]);
    await page.locator("#kv2-undo").click();
    await expect.poll(() => pixel(page)).toEqual([255, 255, 255, 255]);
    await page.locator("#kv2-redo").click();
    await expect.poll(() => pixel(page)).toEqual([74, 131, 191, 255]);
    await page.locator("#kv2-color").evaluate((input) => {
      input.value = "#123abc"; input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await expect(page.locator(".kv2-swatch[aria-pressed='true']")).toHaveCount(0);
  });

  test("pencil, ink and translucent glaze have different size and opacity", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
    await page.locator("#kv2-size").evaluate((input) => {
      input.value = "20"; input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.locator("#kv2-brush-preset").selectOption("blyant");
    await stroke(page);
    const nearby = (x, y) => page.locator("#kv2-canvas").evaluate((canvas, p) =>
      Array.from(canvas.getContext("2d").getImageData(p.x, p.y, 1, 1).data), { x, y });
    expect(await nearby(612, 400)).toEqual([255, 255, 255, 255]);
    await page.locator("#kv2-undo").click();
    await page.locator("#kv2-brush-preset").selectOption("tusj");
    await stroke(page);
    expect(await nearby(612, 400)).toEqual([35, 36, 44, 255]);
    await page.locator("#kv2-undo").click();
    await page.locator("#kv2-brush-preset").selectOption("lasur");
    await stroke(page);
    const glaze = await pixel(page);
    expect(glaze[0]).toBeGreaterThan(100);
    expect(glaze[0]).toBeLessThan(255);
    expect(glaze[3]).toBe(255);
  });

  test("brush preset does not weaken erasing or restoring a non-destructive mask", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
    await page.locator("#kv2-size").evaluate((input) => {
      input.value = "35"; input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.locator("#kv2-brush-preset").selectOption("tusj");
    await stroke(page);
    expect(await pixel(page)).toEqual([35, 36, 44, 255]);
    await page.locator("#kv2-mask-add").click();
    await page.locator("#kv2-brush").click(); // Presets are contextual to the brush.
    await page.locator("#kv2-brush-preset").selectOption("lasur");
    // Changing a preset selects the brush; select mask eraser explicitly.
    await page.locator("#kv2-eraser").click();
    await stroke(page);
    expect(await pixel(page)).toEqual([255, 255, 255, 255]);
    await page.locator("#kv2-brush").click();
    await stroke(page);
    expect(await pixel(page)).toEqual([35, 36, 44, 255]);
  });


  test("gradient supports linear and radial raster fill, selection and cancellation", async ({page}) => {
    await page.goto("/kunstrommet.html?studio=overview",{waitUntil:"domcontentloaded"});
    await page.locator("#kv2-color").evaluate(c=>{c.value="#000000";c.dispatchEvent(new Event("input",{bubbles:true}));});
    await page.locator("#kv2-gradient").click();
    const before=await jsonBackup(page);
    await shapePointer(page,"pointerdown",200,400,1201);
    await shapePointer(page,"pointermove",1000,400,1201);
    await expect(page.locator("#kv2-shape-overlay")).toBeVisible();
    await expect(page.locator("#kv2-gradient-live")).toBeVisible();
    const preview = await page.locator("#kv2-gradient-live").evaluate(c => c.getContext("2d").getImageData(100,400,1,1).data[0]);
    expect(preview).toBe(0);
    expect((await pxAt(page,100,400))[0]).toBe(255);
    expect((await jsonBackup(page)).layers).toEqual(before.layers);
    await shapePointer(page,"pointercancel",1000,400,1201);
    await expect(page.locator("#kv2-gradient-live")).toBeHidden();
    expect((await jsonBackup(page)).layers).toEqual(before.layers);
    await shapeDrag(page,[200,400],[1000,400],1202);
    expect((await pxAt(page,100,400))[0]).toBe(0);
    expect(Math.abs((await pxAt(page,600,400))[0]-128)).toBeLessThanOrEqual(2);
    expect((await pxAt(page,1100,400))[0]).toBe(255);
    await page.locator("#kv2-undo").click();
    await expect.poll(async()=> (await pxAt(page,100,400))[0]).toBe(255);
    await page.locator("#kv2-select").click();
    await shapeDrag(page,[300,200],[900,600],1203);
    await page.locator("#kv2-gradient").click();
    await page.locator("#kv2-gradient-type").selectOption("radial");
    await shapeDrag(page,[600,400],[800,400],1204);
    expect((await pxAt(page,600,400))[0]).toBeLessThan(3);
    expect((await pxAt(page,700,400))[0]).toBeGreaterThan(120);
    expect((await pxAt(page,100,400))[0]).toBe(255);
  });

  test("gradient mask reveals the original gradually without altering its bitmap", async ({page}) => {
    await page.goto("/kunstrommet.html?studio=overview",{waitUntil:"domcontentloaded"});
    await page.locator("#kv2-color").evaluate(c=>{c.value="#000000";c.dispatchEvent(new Event("input",{bubbles:true}));});
    await page.locator("#kv2-gradient").click();
    await page.locator("#kv2-gradient-color").fill("#000000");
    await shapeDrag(page,[200,400],[1000,400],1205);
    const before=await jsonBackup(page);
    await page.locator("#kv2-mask-add").click();
    await page.locator("#kv2-gradient").click();
    await shapePointer(page,"pointerdown",200,400,1206);
    await shapePointer(page,"pointermove",1000,400,1206);
    await expect(page.locator("#kv2-gradient-live")).toBeVisible();
    const preview = await page.locator("#kv2-gradient-live").evaluate(c => c.getContext("2d").getImageData(1100,400,1,1).data[0]);
    expect(preview).toBe(255);
    expect((await pxAt(page,1100,400))[0]).toBe(0);
    await shapePointer(page,"pointerup",1000,400,1206);
    await expect(page.locator("#kv2-gradient-live")).toBeHidden();
    expect((await pxAt(page,100,400))[0]).toBe(0);
    expect(Math.abs((await pxAt(page,600,400))[0]-128)).toBeLessThanOrEqual(3);
    expect((await pxAt(page,1100,400))[0]).toBe(255);
    const after=await jsonBackup(page);
    expect(after.layers[0].bitmap).toBe(before.layers[0].bitmap);
    expect(after.layers[0].maskBitmap).toBeTruthy();
    await page.locator("#kv2-undo").click();
    await expect.poll(async()=> (await pxAt(page,1100,400))[0]).toBe(0);
  });

  test("master and channel curves compose independently and survive backup", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", {waitUntil:"domcontentloaded"});
    await page.locator("#kv2-color").evaluate(c => {c.value="#808080";c.dispatchEvent(new Event("input",{bubbles:true}));});
    await stroke(page);
    const before = await jsonBackup(page);
    await page.locator("#kv2-add-adjustment").click();
    const midpoint = page.locator("#kv2-curve-input-2");
    const set = value => midpoint.evaluate((c,v)=>{c.value=String(v);c.dispatchEvent(new Event("change",{bubbles:true}));},value);
    await set(160);
    expect((await pixel(page)).slice(0,3)).toEqual([160,160,160]);
    await page.locator("#kv2-curve-channel").selectOption("red");
    await set(192);
    expect((await pixel(page)).slice(0,3)).toEqual([192,160,160]);
    const backup = await jsonBackup(page);
    expect(backup.layers[0].bitmap).toBe(before.layers[0].bitmap);
    expect(backup.layers[1].curves.red).toEqual([0,64,192,192,255]);
    await page.locator("#kv2-curve-reset").click();
    expect((await pixel(page)).slice(0,3)).toEqual([160,160,160]);
    await page.locator("#kv2-undo").click();
    await expect.poll(async()=> (await pixel(page)).slice(0,3)).toEqual([192,160,160]);
    await page.reload({waitUntil:"domcontentloaded"});
    await page.locator("#kv2-import").setInputFiles({name:"curves.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(backup))});
    await expect(page.locator("#kv2-curve-controls")).toBeVisible();
    expect((await pixel(page)).slice(0,3)).toEqual([192,160,160]);
  });

  test("levels map black, white and gamma without changing raster originals", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
    await page.locator("#kv2-color").evaluate(c => { c.value = "#808080"; c.dispatchEvent(new Event("input", { bubbles: true })); });
    await stroke(page);
    const original = await jsonBackup(page);
    await page.locator("#kv2-add-adjustment").click();
    const set = (name, value) => page.locator("#kv2-level-" + name).evaluate((c, value) => {
      c.value = String(value); c.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
    await set("black", 64);
    await set("white", 192);
    expect((await pixel(page)).slice(0, 3)).toEqual([128, 128, 128]);
    await set("gamma", 200);
    expect((await pixel(page)).slice(0, 3)).toEqual([180, 180, 180]);
    await expect(page.locator("#kv2-level-black")).toHaveAttribute("max", "191");
    await expect(page.locator("#kv2-level-white")).toHaveAttribute("min", "65");
    await page.locator("#kv2-histogram-refresh").click();
    await expect(page.locator("#kv2-histogram")).toBeVisible();
    await expect(page.locator("#kv2-histogram-status")).toContainText("Synlig bilde:");
    const backup = await jsonBackup(page);
    expect(backup.layers[0].bitmap).toBe(original.layers[0].bitmap);
    expect(backup.layers[1].levels).toEqual({black:64,white:192,gamma:200});
    await page.locator("#kv2-level-reset").click();
    expect((await pixel(page)).slice(0, 3)).toEqual([128, 128, 128]);
    await expect(page.locator("#kv2-histogram")).toBeHidden();
    await page.locator("#kv2-undo").click();
    await expect.poll(async () => (await pixel(page))[0]).toBe(180);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#kv2-import").setInputFiles({name:"levels.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(backup))});
    await expect(page.locator("#kv2-level-gamma")).toHaveValue("200");
    expect((await pixel(page))[0]).toBe(180);
  });

  test("adjustment layer tone controls retain color balance in backup and reset together", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
    await page.locator("#kv2-color").evaluate(c => { c.value = "#808080"; c.dispatchEvent(new Event("input", { bubbles: true })); });
    await stroke(page);
    const original = await jsonBackup(page);
    await expect(page.locator("#kv2-tone-controls")).toBeHidden();
    await page.locator("#kv2-add-adjustment").click();
    const set = (name, value) => page.locator("#kv2-tone-" + name).evaluate((c, value) => {
      c.value = String(value); c.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
    await set("temperature", 50);
    expect((await pixel(page)).slice(0, 3)).toEqual([144, 128, 112]);
    await set("tint", 50);
    const tinted = (await pixel(page)).slice(0, 3);
    expect(tinted).toEqual([152, 112, 120]);
    await set("exposure", -100);
    expect((await pixel(page)).slice(0, 3)).toEqual([76, 56, 60]);
    const backup = await jsonBackup(page);
    expect(backup.layers[0].bitmap).toBe(original.layers[0].bitmap);
    expect(backup.layers[1].toneAdjustments).toEqual({ exposure: -100, temperature: 50, tint: 50 });
    await page.locator("#kv2-adjust-reset").click();
    expect((await pixel(page)).slice(0, 3)).toEqual([128, 128, 128]);
    await page.locator("#kv2-undo").click();
    await expect.poll(async () => (await pixel(page)).slice(0, 3)).toEqual([76, 56, 60]);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#kv2-import").setInputFiles({ name: "tone.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) });
    await expect(page.locator("#kv2-tone-exposure")).toHaveValue("-100");
    expect((await pixel(page)).slice(0, 3)).toEqual([76, 56, 60]);
  });

  test("adjustment layers affect lower layers, support masks and survive editable backup", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
    await page.locator("#kv2-color").evaluate(c => { c.value = "#808080"; c.dispatchEvent(new Event("input", { bubbles: true })); });
    await stroke(page);
    const original = await jsonBackup(page);
    await page.locator("#kv2-add-adjustment").click();
    await expect(page.locator("#kv2-adjust-scope")).toContainText("alle synlige lag under");
    await page.locator("#kv2-adjust-brightness").evaluate(c => { c.value = "50"; c.dispatchEvent(new Event("change", { bubbles: true })); });
    await expect.poll(async () => (await pixel(page))[0]).toBe(64);
    await page.locator("#kv2-opacity").evaluate(c => { c.value = "50"; c.dispatchEvent(new Event("change", { bubbles: true })); });
    expect((await pixel(page))[0]).toBe(96);
    const adjusted = await jsonBackup(page);
    expect(adjusted.layers[0].bitmap).toBe(original.layers[0].bitmap);
    expect(adjusted.layers[1].kind).toBe("adjustment");
    await page.locator("#kv2-mask-add").click();
    await stroke(page);
    expect((await pixel(page))[0]).toBe(128);
    await page.locator("#kv2-undo").click();
    await expect.poll(async () => (await pixel(page))[0]).toBe(96);
    await page.locator("#kv2-add-layer").click();
    await page.locator("#kv2-brush").click();
    await stroke(page);
    expect((await pixel(page))[0]).toBe(128);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#kv2-import").setInputFiles({ name: "adjustment.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(adjusted)) });
    await expect(page.locator("#kv2-adjust-scope")).toContainText("alle synlige lag under");
    expect((await pixel(page))[0]).toBe(96);
  });

  test("advanced blend modes compose expected grayscale colors and retain editable originals", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
    const set = (color) => page.locator("#kv2-color").evaluate((input, value) => {
      input.value = value; input.dispatchEvent(new Event("input", { bubbles: true }));
    }, color);
    await set("#404040"); await stroke(page);
    await page.locator("#kv2-add-layer").click();
    await set("#c0c0c0"); await stroke(page);
    const original = await jsonBackup(page);
    const modes = {
      darken: 64, lighten: 192, overlay: 96, "soft-light": 96, "hard-light": 161,
      "color-dodge": 255, "color-burn": 1, difference: 128, exclusion: 160,
      hue: 64, saturation: 64, color: 64, luminosity: 192
    };
    for (const [mode, expected] of Object.entries(modes)) {
      await page.locator("#kv2-blend-mode").selectOption(mode);
      const rgba = await pixel(page);
      for (const value of rgba.slice(0, 3)) expect(Math.abs(value - expected), mode).toBeLessThanOrEqual(3);
      expect(rgba[3]).toBe(255);
    }
    const exported = await jsonBackup(page);
    expect(exported.layers[1].blendMode).toBe("luminosity");
    for (let i = 0; i < original.layers.length; i++) {
      expect(exported.layers[i].bitmap).toBe(original.layers[i].bitmap);
    }
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#kv2-import").setInputFiles({
      name: "advanced-blend.json", mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(exported))
    });
    await expect(page.locator("#kv2-blend-mode")).toHaveValue("luminosity");
    expect((await pixel(page))[0]).toBeGreaterThan(188);
  });

  test("layer blend modes are non-destructive and undo/redo with expected composite colors", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
    const center = () => pixel(page);
    const set = async (color) => page.locator("#kv2-color").evaluate((input, value) => {
      input.value = value; input.dispatchEvent(new Event("input", { bubbles: true }));
    }, color);
    await set("#808080"); await stroke(page);
    await page.locator("#kv2-add-layer").click();
    await stroke(page);
    expect((await center()).slice(0, 3)).toEqual([128, 128, 128]);
    await page.locator("#kv2-blend-mode").selectOption("multiply");
    await expect(page.locator("#kv2-status")).toHaveText("Ulagrede endringer");
    const dark = await center();
    for (const value of dark.slice(0, 3)) expect(value).toBeGreaterThanOrEqual(63);
    for (const value of dark.slice(0, 3)) expect(value).toBeLessThanOrEqual(65);
    await page.locator("#kv2-blend-mode").selectOption("screen");
    const light = await center();
    for (const value of light.slice(0, 3)) expect(value).toBeGreaterThanOrEqual(190);
    for (const value of light.slice(0, 3)) expect(value).toBeLessThanOrEqual(193);
    await page.locator("#kv2-undo").click();
    await expect.poll(() => page.locator("#kv2-blend-mode").inputValue()).toBe("multiply");
    await expect.poll(async () => (await center())[0]).toBeLessThan(70);
    await page.locator("#kv2-redo").click();
    await expect.poll(() => page.locator("#kv2-blend-mode").inputValue()).toBe("screen");
    await expect.poll(async () => (await center())[0]).toBeGreaterThan(190);
    // The underlying image remains unchanged when we hide the blended layer.
    await page.locator("#kv2-layers .kv2-layer").first().locator("button").first().click();
    expect((await center()).slice(0, 3)).toEqual([128, 128, 128]);
  });

  test("blend modes survive editable export and import; unknown modes fall back to normal", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
    await stroke(page);
    await page.locator("#kv2-add-layer").click();
    await stroke(page);
    await page.locator("#kv2-blend-mode").selectOption("multiply");
    const d = page.waitForEvent("download");
    await page.locator("#kv2-json").click();
    const exported = JSON.parse(await fs.readFile(await (await d).path(), "utf8"));
    expect(exported.layers.map((layer) => layer.blendMode)).toEqual(["normal", "multiply"]);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#kv2-import").setInputFiles({
      name: "two-layers.kunstrommet.json", mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(exported))
    });
    await expect(page.locator("#kv2-blend-mode")).toHaveValue("multiply");
    const backupAgain = page.waitForEvent("download");
    await page.locator("#kv2-json").click();
    const roundTrip = JSON.parse(await fs.readFile(await (await backupAgain).path(), "utf8"));
    expect(roundTrip.layers.map((layer) => layer.blendMode)).toEqual(["normal", "multiply"]);
    // Missing mode (old backups) and unsupported operation both import safely.
    delete exported.layers[0].blendMode;
    exported.layers[1].blendMode = "destination-out";
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#kv2-import").setInputFiles({
      name: "legacy.kunstrommet.json", mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(exported))
    });
    await expect(page.locator("#kv2-blend-mode")).toHaveValue("normal");
    const legacyDownload = page.waitForEvent("download");
    await page.locator("#kv2-json").click();
    const legacy = JSON.parse(await fs.readFile(await (await legacyDownload).path(), "utf8"));
    expect(legacy.layers.every((layer) => layer.blendMode === "normal")).toBe(true);
  });

  test("blended masked layer restores the underlying image; duplication retains mode", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
    const color = (value) => page.locator("#kv2-color").evaluate((input, value) => {
      input.value = value; input.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
    await color("#204080"); await stroke(page);
    await page.locator("#kv2-add-layer").click();
    await color("#c08040"); await stroke(page);
    await page.locator("#kv2-blend-mode").selectOption("multiply");
    const blended = await pixel(page);
    expect(blended[0]).toBeLessThan(40);
    expect(blended[1]).toBeLessThan(50);
    await page.locator("#kv2-mask-add").click();
    await expect(page.locator("#kv2-eraser")).toHaveAttribute("aria-pressed", "true");
    await stroke(page);
    expect(await pixel(page)).toEqual([32, 64, 128, 255]);
    await page.locator("#kv2-brush").click();
    await stroke(page);
    const remasked = await pixel(page);
    expect(remasked.slice(0, 3)).toEqual(blended.slice(0, 3));
    await page.locator("#kv2-mask-edit").click();
    await page.locator("#kv2-duplicate-layer").click();
    await expect(page.locator("#kv2-blend-mode")).toHaveValue("multiply");
    const d = page.waitForEvent("download"); await page.locator("#kv2-json").click();
    const backup = JSON.parse(await fs.readFile(await (await d).path(), "utf8"));
    expect(backup.layers.map((layer) => layer.blendMode)).toEqual(["normal", "multiply", "multiply"]);
    await page.locator("#kv2-undo").click();
    await expect(page.locator("#kv2-layer-count")).toContainText("2 av 8 lag");
    await expect(page.locator("#kv2-blend-mode")).toHaveValue("multiply");
  });


  test("brightness and contrast edit appearance but not source pixels, with distinct undo steps", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
    await page.locator("#kv2-color").evaluate((c) => {
      c.value = "#808080"; c.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await stroke(page);
    const before = await jsonBackup(page);
    expect((await pixel(page))[0]).toBe(128);
    await changeAdjustment(page, "brightness", 140);
    await expect(page.locator("#kv2-adjust-brightness-value")).toHaveText("140%");
    const bright = (await pixel(page))[0];
    expect(bright).toBeGreaterThan(165);
    expect(bright).toBeLessThan(195);
    await changeAdjustment(page, "contrast", 140);
    const contrasted = (await pixel(page))[0];
    expect(contrasted).toBeGreaterThan(bright + 8);
    await page.locator("#kv2-undo").click();
    await expect.poll(() => page.locator("#kv2-adjust-contrast").inputValue()).toBe("100");
    await expect.poll(async () => (await pixel(page))[0]).toBe(bright);
    await page.locator("#kv2-redo").click();
    await expect.poll(() => page.locator("#kv2-adjust-contrast").inputValue()).toBe("140");
    await expect.poll(async () => (await pixel(page))[0]).toBe(contrasted);
    const after = await jsonBackup(page);
    expect(after.layers[0].bitmap).toBe(before.layers[0].bitmap);
    expect(after.layers[0].adjustments).toEqual({ brightness: 140, contrast: 140, saturation: 100 });
    await page.locator("#kv2-adjust-reset").click();
    await expect(page.locator("#kv2-adjust-reset")).toBeDisabled();
    expect((await pixel(page))[0]).toBe(128);
    await page.locator("#kv2-undo").click();
    await expect.poll(() => page.locator("#kv2-adjust-brightness").inputValue()).toBe("140");
    await expect.poll(() => page.locator("#kv2-adjust-contrast").inputValue()).toBe("140");
  });

  test("saturation is per layer, survives local save and editable export, and imports old/malformed settings safely", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
    await page.locator("#kv2-color").evaluate((c) => {
      c.value = "#9c6030"; c.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await stroke(page);
    await changeAdjustment(page, "saturation", 0);
    const gray = await pixel(page);
    expect(Math.max(...gray.slice(0, 3)) - Math.min(...gray.slice(0, 3))).toBeLessThanOrEqual(2);
    await changeAdjustment(page, "saturation", 200);
    const vivid = await pixel(page);
    expect(Math.max(...vivid.slice(0, 3)) - Math.min(...vivid.slice(0, 3))).toBeGreaterThan(70);
    await page.locator("#kv2-save").click();
    await expect(page.locator("#kv2-status")).toHaveText("Lagret på denne enheten");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#kv2-projects .kv2-project--saved").getByRole("button", { name: "Åpne" }).click();
    await expect(page.locator("#kv2-adjust-saturation")).toHaveValue("200");
    const copy = await jsonBackup(page);
    expect(copy.layers[0].adjustments.saturation).toBe(200);
    await page.reload({ waitUntil: "domcontentloaded" });
    const invalid = structuredClone(copy);
    invalid.layers[0].adjustments = { brightness: "150", contrast: Infinity, saturation: 900 };
    await page.locator("#kv2-import").setInputFiles({
      name: "invalid-settings.kunstrommet.json", mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(invalid))
    });
    await expect(page.locator("#kv2-adjust-brightness")).toHaveValue("100");
    await expect(page.locator("#kv2-adjust-contrast")).toHaveValue("100");
    await expect(page.locator("#kv2-adjust-saturation")).toHaveValue("200");
    const old = structuredClone(copy);
    delete old.layers[0].adjustments;
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#kv2-import").setInputFiles({
      name: "old-project.kunstrommet.json", mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(old))
    });
    await expect(page.locator("#kv2-adjust-saturation")).toHaveValue("100");
    expect((await pixel(page)).slice(0, 3)).toEqual([156, 96, 48]);
  });

  test("layer adjustments follow duplicate and selection extraction, while masks stay non-destructive", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
    await page.locator("#kv2-color").evaluate((c) => {
      c.value = "#4080c0"; c.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await stroke(page);
    await changeAdjustment(page, "brightness", 125);
    await changeAdjustment(page, "saturation", 75);
    const adjusted = await pixel(page);
    await page.locator("#kv2-mask-add").click();
    await expect(page.locator("#kv2-eraser")).toHaveAttribute("aria-pressed", "true");
    await stroke(page);
    expect(await pixel(page)).toEqual([255, 255, 255, 255]);
    await page.locator("#kv2-brush").click();
    await stroke(page);
    expect(await pixel(page)).toEqual(adjusted);
    await page.locator("#kv2-mask-edit").click();
    await page.locator("#kv2-duplicate-layer").click();
    await expect(page.locator("#kv2-adjust-brightness")).toHaveValue("125");
    await expect(page.locator("#kv2-adjust-saturation")).toHaveValue("75");
    let backup = await jsonBackup(page);
    expect(backup.layers.map((layer) => layer.adjustments.brightness)).toEqual([125, 125]);
    expect(backup.layers.every((layer) => typeof layer.maskBitmap === "string")).toBe(true);
    await page.locator("#kv2-undo").click();
    await expect(page.locator("#kv2-layer-count")).toContainText("1 av 8 lag");
    await page.locator("#kv2-select").click();
    await page.locator("#kv2-canvas").evaluate((canvas) => {
      const b = canvas.getBoundingClientRect();
      const send = (type, x, y) => canvas.dispatchEvent(new PointerEvent(type, {
        bubbles: true, cancelable: true, pointerId: 784, pointerType: "mouse",
        button: 0, buttons: type === "pointerup" ? 0 : 1,
        clientX: b.left + x * b.width / 1200,
        clientY: b.top + y * b.height / 800
      }));
      send("pointerdown", 560, 360); send("pointermove", 640, 440);
      send("pointerup", 640, 440);
    });
    await page.locator("#kv2-copy-selection").click();
    backup = await jsonBackup(page);
    expect(backup.layers).toHaveLength(2);
    expect(backup.layers.map((layer) => layer.adjustments)).toEqual([
      { brightness: 125, contrast: 100, saturation: 75 },
      { brightness: 125, contrast: 100, saturation: 75 }
    ]);
  });


  test("rectangle preview is invisible in the artwork until pointerup, then a single undo step", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
    await page.locator("#kv2-rectangle").click();
    await expect(page.locator("#kv2-rectangle")).toHaveAttribute("aria-pressed", "true");
    await shapePointer(page, "pointerdown", 400, 300);
    await shapePointer(page, "pointermove", 700, 500);
    await expect(page.locator("#kv2-shape-overlay")).not.toHaveAttribute("hidden");
    expect(await pixel(page)).toEqual([255, 255, 255, 255]);
    await expect(page.locator("#kv2-status")).toHaveText("Nytt prosjekt");
    await shapePointer(page, "pointerup", 700, 500);
    await expect(page.locator("#kv2-shape-overlay")).toHaveAttribute("hidden");
    expect(await pixel(page)).toEqual([35, 36, 44, 255]);
    await page.locator("#kv2-undo").click();
    await expect.poll(() => pixel(page)).toEqual([255, 255, 255, 255]);
    await page.locator("#kv2-redo").click();
    await expect.poll(() => pixel(page)).toEqual([35, 36, 44, 255]);
    const backup = await jsonBackup(page);
    expect(backup.layers).toHaveLength(1);
    expect(backup.layers[0].bitmap).toMatch(/^data:image\/png;base64,/);
  });

  test("ellipse outline is hollow and its thickness follows the size setting", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
    await page.locator("#kv2-ellipse").click();
    await page.locator("#kv2-shape-style").selectOption("outline");
    await page.locator("#kv2-size").evaluate((input) => {
      input.value = "20"; input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await shapeDrag(page, [480, 280], [720, 520], 882);
    expect(await pixel(page)).toEqual([255, 255, 255, 255]);
    expect((await pxAt(page, 480, 400))[0]).toBeLessThan(100);
    expect((await pxAt(page, 600, 280))[0]).toBeLessThan(100);
    expect((await pxAt(page, 500, 300))[0]).toBe(255);
    await page.locator("#kv2-undo").click();
    await expect.poll(async () => (await pxAt(page, 480, 400))[0]).toBe(255);
  });

  test("a selection clips a rectangle after moving the active layer", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
    await page.locator("#kv2-move").click();
    await shapeDrag(page, [600, 400], [620, 410], 883);
    await page.locator("#kv2-select").click();
    await shapeDrag(page, [520, 340], [660, 460], 884);
    await page.locator("#kv2-rectangle").click();
    await shapeDrag(page, [440, 280], [740, 520], 885);
    expect(await pixel(page)).toEqual([35, 36, 44, 255]);
    expect(await pxAt(page, 480, 400)).toEqual([255, 255, 255, 255]);
    expect(await pxAt(page, 700, 400)).toEqual([255, 255, 255, 255]);
    await page.locator("#kv2-undo").click();
    await expect.poll(() => pixel(page)).toEqual([255, 255, 255, 255]);
    await expect(page.locator("#kv2-clear-selection")).toBeEnabled();
  });

  test("Escape, cancelled pointer, locked layers and mask editing protect against accidental shapes", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
    await page.locator("#kv2-rectangle").click();
    await shapePointer(page, "pointerdown", 400, 300, 886);
    await shapePointer(page, "pointermove", 700, 500, 886);
    await page.keyboard.press("Escape");
    await expect(page.locator("#kv2-shape-overlay")).toHaveAttribute("hidden");
    await expect(page.locator("#kv2-status")).toHaveText("Figur avbrutt – ingen endringer");
    await shapePointer(page, "pointerup", 700, 500, 886);
    expect(await pixel(page)).toEqual([255, 255, 255, 255]);
    await shapePointer(page, "pointerdown", 400, 300, 887);
    await shapePointer(page, "pointermove", 700, 500, 887);
    await shapePointer(page, "pointercancel", 700, 500, 887);
    expect(await pixel(page)).toEqual([255, 255, 255, 255]);
    await page.locator("#kv2-layers .kv2-layer").first().locator("button").last().click();
    await shapeDrag(page, [400, 300], [700, 500], 888);
    expect(await pixel(page)).toEqual([255, 255, 255, 255]);
    await page.locator("#kv2-layers .kv2-layer").first().locator("button").last().click();
    await page.locator("#kv2-mask-add").click();
    await page.locator("#kv2-rectangle").click();
    await expect(page.locator("#kv2-eraser")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#kv2-status")).toHaveText("Avslutt maskeredigering før du tegner figurer.");
    await page.locator("#kv2-mask-edit").click();
    await page.locator("#kv2-rectangle").click();
    await shapeDrag(page, [400, 300], [700, 500], 889);
    expect(await pixel(page)).toEqual([35, 36, 44, 255]);
  });


  test("horizontal and diagonal lines use one undo step, with no pixels before pointerup", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
    await page.locator("#kv2-line").click();
    await expect(page.locator("#kv2-line")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#kv2-shape-style")).toBeDisabled();
    await shapePointer(page, "pointerdown", 450, 400, 940);
    await shapePointer(page, "pointermove", 750, 400, 940);
    await expect(page.locator("#kv2-shape-overlay")).not.toHaveAttribute("hidden");
    expect(await pixel(page)).toEqual([255, 255, 255, 255]);
    await shapePointer(page, "pointerup", 750, 400, 940);
    expect(await pixel(page)).toEqual([35, 36, 44, 255]);
    expect(await pxAt(page, 600, 450)).toEqual([255, 255, 255, 255]);
    await page.locator("#kv2-undo").click();
    await expect.poll(() => pixel(page)).toEqual([255, 255, 255, 255]);
    await page.locator("#kv2-redo").click();
    await expect.poll(() => pixel(page)).toEqual([35, 36, 44, 255]);
    await shapeDrag(page, [500, 350], [700, 550], 941);
    expect(await pixel(page)).toEqual([35, 36, 44, 255]);
    const saved = await jsonBackup(page);
    expect(saved.layers).toHaveLength(1);
    expect(saved.layers[0].bitmap).toMatch(/^data:image\/png;base64,/);
  });

  test("reversed arrow points to the drag endpoint and preserves the source layer on undo", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
    await page.locator("#kv2-arrow").click();
    await page.locator("#kv2-size").evaluate((input) => {
      input.value = "12"; input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await shapePointer(page, "pointerdown", 750, 400, 942);
    await shapePointer(page, "pointermove", 450, 400, 942);
    await expect(page.locator("#kv2-shape-path")).toHaveAttribute("d", /M 750 400 L 450 400/);
    await shapePointer(page, "pointerup", 450, 400, 942);
    // Canvas anti-aliasing at the arrow tip may round color by one channel.
    // Assert visible dark paint and opaque composition, not exact RGB rounding.
    const tip = await pxAt(page, 450, 400);
    expect(tip.slice(0, 3).every((channel) => channel < 100)).toBe(true);
    expect(tip[3]).toBe(255);
    // Both samples sit inside the filled, left-pointing arrowhead.
    expect((await pxAt(page, 478, 408))[0]).toBeLessThan(100);
    expect((await pxAt(page, 478, 392))[0]).toBeLessThan(100);
    expect(await pxAt(page, 450, 450)).toEqual([255, 255, 255, 255]);
    await page.locator("#kv2-undo").click();
    await expect.poll(async () => pxAt(page, 600, 400)).toEqual([255, 255, 255, 255]);
    await page.locator("#kv2-redo").click();
    await expect.poll(async () => pxAt(page, 600, 400)).toEqual([35, 36, 44, 255]);
  });

  test("selected region clips arrow head and shaft on a translated layer", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
    await page.locator("#kv2-move").click();
    await shapeDrag(page, [600, 400], [620, 410], 943);
    await page.locator("#kv2-select").click();
    await shapeDrag(page, [540, 365], [660, 435], 944);
    await page.locator("#kv2-arrow").click();
    await shapeDrag(page, [450, 400], [740, 400], 945);
    expect(await pixel(page)).toEqual([35, 36, 44, 255]);
    expect(await pxAt(page, 500, 400)).toEqual([255, 255, 255, 255]);
    expect(await pxAt(page, 700, 400)).toEqual([255, 255, 255, 255]);
    await page.locator("#kv2-undo").click();
    await expect.poll(() => pixel(page)).toEqual([255, 255, 255, 255]);
    await page.locator("#kv2-mask-add").click();
    await page.locator("#kv2-arrow").click();
    await expect(page.locator("#kv2-eraser")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#kv2-status")).toHaveText("Avslutt maskeredigering før du tegner figurer.");
  });


  test("text preview is local-only and one confirmation adds a movable editable text layer in one undo step", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
    await page.locator("#kv2-text").click();
    await expect(page.locator("#kv2-text-panel")).toBeVisible();
    await page.locator("#kv2-text-content").fill("Kunstrommet");
    await shapePointer(page, "pointerdown", 150, 180, 975);
    await expect(page.locator("#kv2-text-overlay")).not.toHaveAttribute("hidden");
    await expect(page.locator("#kv2-text-preview tspan")).toHaveText("Kunstrommet");
    expect(await textInk(page, 100, 120, 500, 130)).toBe(0);
    await expect(page.locator("#kv2-status")).not.toHaveText("Ulagrede endringer");
    await page.locator("#kv2-text-commit").click();
    await expect(page.locator("#kv2-layer-count")).toContainText("2 av 8 lag");
    await expect(page.locator("#kv2-move")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#kv2-text-panel")).toBeHidden();
    expect(await textInk(page, 100, 120, 500, 130)).toBeGreaterThan(100);
    const backup = await jsonBackup(page);
    expect(backup.layers).toHaveLength(2);
    expect(backup.layers[1].name).toContain("Tekst");
    expect(backup.layers[1].kind).toBe("paint");
    expect(backup.layers[1].textData.content).toBe("Kunstrommet");
    await page.locator("#kv2-undo").click();
    await expect.poll(() => page.locator("#kv2-layer-count").textContent()).toContain("1 av 8 lag");
    expect(await textInk(page, 100, 120, 500, 130)).toBe(0);
    await page.locator("#kv2-redo").click();
    await expect.poll(() => textInk(page, 100, 120, 500, 130)).toBeGreaterThan(100);
  });

  test("focused textarea confirmation preserves button identity and commits on first click", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
    await page.locator("#kv2-text").click();
    await page.locator("#kv2-text-content").fill("Første trykk");
    await shapePointer(page, "pointerdown", 150, 180, 981);
    const commit = page.locator("#kv2-text-commit");
    await expect(commit).toBeEnabled();
    const stable = await page.evaluate(() => {
      const button = document.getElementById("kv2-text-commit");
      const node = button.firstChild;
      const input = document.getElementById("kv2-text-content");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return node === button.firstChild;
    });
    expect(stable).toBe(true);
    await commit.click({ timeout: 10000 });
    await expect(page.locator("#kv2-layer-count")).toContainText("2 av 8 lag");
    await expect(page.locator("#kv2-text-edit")).toBeEnabled();
  });

  test("editable text survives backup, cancel, update, undo, duplicate and explicit rasterization", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
    await page.locator("#kv2-text").click();
    await page.locator("#kv2-text-content").fill("Før");
    await shapePointer(page, "pointerdown", 150, 180, 979);
    await page.locator("#kv2-text-commit").click();
    await expect(page.locator("#kv2-text-edit")).toBeEnabled();
    const original = await jsonBackup(page);
    await page.locator("#kv2-text-edit").click();
    await expect(page.locator("#kv2-text-content")).toHaveValue("Før");
    const preview = page.locator("#kv2-text-edit-preview");
    const canvas = page.locator("#kv2-canvas");
    const pixels = (element) => element.evaluate(node => node.toDataURL("image/png"));
    const committedPixels = await pixels(canvas);
    await expect(preview).toBeVisible();
    expect(await pixels(preview)).toBe(committedPixels);
    await page.locator("#kv2-text-content").fill("Avbryt");
    expect(await pixels(preview)).not.toBe(committedPixels);
    expect(await pixels(canvas)).toBe(committedPixels);
    expect((await jsonBackup(page)).layers[1].bitmap).toBe(original.layers[1].bitmap);
    await page.locator("#kv2-text-cancel").click();
    await expect(preview).toBeHidden();
    expect((await jsonBackup(page)).layers[1].textData.content).toBe("Før");
    await page.locator("#kv2-text-edit").click();
    await page.locator("#kv2-text-content").fill("Etter");
    await page.locator("#kv2-text-size").fill("64");
    await page.locator("#kv2-text-commit").click();
    const updated = await jsonBackup(page);
    expect(updated.layers).toHaveLength(2);
    expect(updated.layers[1].textData).toMatchObject({ content: "Etter", size: 64 });
    expect(updated.layers[1].bitmap).not.toBe(original.layers[1].bitmap);
    await page.locator("#kv2-undo").click();
    await expect(page.locator("#kv2-text-edit")).toBeEnabled();
    expect((await jsonBackup(page)).layers[1].textData.content).toBe("Før");
    await page.locator("#kv2-redo").click();
    await expect(page.locator("#kv2-text-edit")).toBeEnabled();
    expect((await jsonBackup(page)).layers[1].textData.content).toBe("Etter");
    await page.locator("#kv2-duplicate-layer").click();
    expect((await jsonBackup(page)).layers[2].textData.content).toBe("Etter");
    await page.locator("#kv2-text-rasterize").click();
    const raster = await jsonBackup(page);
    expect(raster.layers[2].textData).toBeUndefined();
    expect(raster.layers[1].textData.content).toBe("Etter");
    expect(raster.layers[2].bitmap).toBe(raster.layers[1].bitmap);
    await page.locator("#kv2-undo").click();
    await expect(page.locator("#kv2-text-edit")).toBeEnabled();
    expect((await jsonBackup(page)).layers[2].textData.content).toBe("Etter");
  });

  test("text metadata is restored from project files and old raster projects remain compatible", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
    await page.locator("#kv2-text").click();
    await page.locator("#kv2-text-content").fill("Bevar teksten");
    await shapePointer(page, "pointerdown", 150, 180, 980);
    await page.locator("#kv2-text-commit").click();
    await expect(page.locator("#kv2-text-edit")).toBeEnabled();
    const saved = await jsonBackup(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#kv2-import").setInputFiles({
      name: "tekst.kunstrommet.json", mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(saved))
    });
    await expect(page.locator("#kv2-text-edit")).toBeEnabled();
    await page.locator("#kv2-text-edit").click();
    await expect(page.locator("#kv2-text-content")).toHaveValue("Bevar teksten");
    await page.locator("#kv2-text-cancel").click();
    await page.locator("#kv2-brush").click();
    await stroke(page);
    await expect(page.locator("#kv2-status")).toContainText("Gjør tekstlaget om til piksler");
    expect((await jsonBackup(page)).layers[1].textData.content).toBe("Bevar teksten");
    delete saved.layers[1].textData;
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#kv2-import").setInputFiles({
      name: "gammel-tekst.kunstrommet.json", mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(saved))
    });
    await expect(page.locator("#kv2-layer-count")).toContainText("2 av 8 lag");
    await expect(page.locator("#kv2-text-edit")).toBeDisabled();
    expect(await textInk(page, 100, 120, 500, 130)).toBeGreaterThan(100);
  });

  test("multiline typography supports font family, size, bold and palette without leaving text tool", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
    await page.locator("#kv2-text").click();
    await page.locator("#kv2-text-content").fill("AHA\nKunst");
    await page.locator("#kv2-text-font").selectOption("serif");
    await page.locator("#kv2-text-size").fill("64");
    await page.locator("#kv2-text-bold").check();
    await page.locator("#kv2-swatch-korall").click();
    await expect(page.locator("#kv2-text")).toHaveAttribute("aria-pressed", "true");
    await shapePointer(page, "pointerdown", 140, 150, 976);
    await expect(page.locator("#kv2-text-preview tspan")).toHaveCount(2);
    await expect(page.locator("#kv2-text-preview")).toHaveAttribute("font-family", "Georgia, serif");
    await expect(page.locator("#kv2-text-preview")).toHaveAttribute("font-weight", "700");
    await expect(page.locator("#kv2-text-preview")).toHaveAttribute("fill", "#d15c4d");
    expect(await textInk(page, 100, 120, 500, 230)).toBe(0);
    await page.locator("#kv2-text-commit").click();
    expect(await textInk(page, 100, 120, 500, 230)).toBeGreaterThan(150);
    const backup = await jsonBackup(page);
    expect(backup.layers).toHaveLength(2);
    expect(backup.layers[1].name).toContain("AHA Kunst");
  });

  test("empty, too wide and six-line text are rejected; cancel makes no edit", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
    await page.locator("#kv2-text").click();
    await shapePointer(page, "pointerdown", 200, 200, 977);
    await expect(page.locator("#kv2-text-commit")).toBeDisabled();
    await expect(page.locator("#kv2-text-warning")).toContainText("Skriv tekst");
    await page.locator("#kv2-text-content").fill("En\nTo\nTre\nFire\nFem\nSeks");
    await expect(page.locator("#kv2-text-commit")).toBeDisabled();
    await expect(page.locator("#kv2-text-warning")).toContainText("fem");
    await page.locator("#kv2-text-content").fill("W".repeat(190));
    await expect(page.locator("#kv2-text-commit")).toBeDisabled();
    await expect(page.locator("#kv2-text-warning")).toContainText("for bred");
    await page.locator("#kv2-text-content").fill("En kort tittel");
    await expect(page.locator("#kv2-text-commit")).toBeEnabled();
    await page.locator("#kv2-text-cancel").click();
    await expect(page.locator("#kv2-text-overlay")).toHaveAttribute("hidden");
    await expect(page.locator("#kv2-text-commit")).toBeDisabled();
    await expect(page.locator("#kv2-layer-count")).toContainText("1 av 8 lag");
    expect(await textInk(page)).toBe(0);
    await expect(page.locator("#kv2-status")).toHaveText("Tekstplassering avbrutt – ingen endringer.");
  });

  test("text cannot be placed during mask editing and an Escape key cancels only preview", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
    await page.locator("#kv2-mask-add").click();
    await page.locator("#kv2-text").click();
    await expect(page.locator("#kv2-eraser")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#kv2-status")).toHaveText("Avslutt maskeredigering før du tegner figurer.");
    await page.locator("#kv2-mask-edit").click();
    await page.locator("#kv2-text").click();
    await page.locator("#kv2-text-content").fill("Et bilde");
    await shapePointer(page, "pointerdown", 160, 180, 978);
    await expect(page.locator("#kv2-text-overlay")).not.toHaveAttribute("hidden");
    await page.locator("#kv2-paper").focus();
    await page.keyboard.press("Escape");
    await expect(page.locator("#kv2-text-overlay")).toHaveAttribute("hidden");
    await expect(page.locator("#kv2-status")).toHaveText("Tekstplassering avbrutt – ingen endringer.");
    await expect(page.locator("#kv2-layer-count")).toContainText("1 av 8 lag");
    expect(await textInk(page)).toBe(0);
  });

  test("eyedropper samples visible color without pixels, undo history or dirty edits", async ({ page }) => {
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
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
    await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
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
  await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
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
  await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
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
  await page.goto("/kunstrommet.html?studio=overview", { waitUntil: "domcontentloaded" });
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


test("8.2 cloud restore validates before inserting and never replaces the open artwork", async ({page}) => {
  const user="11111111-1111-4111-8111-111111111111";
  await page.addInitScript(id=>localStorage.setItem("aha_profile_id",id),user);
  await page.goto("/kunstrommet.html?studio=overview",{waitUntil:"domcontentloaded"});
  await expect(page.locator("#kv2-cloud-backup")).toBeHidden();
  await page.locator("#kv2-title").fill("Aktivt kunstverk");
  await stroke(page);
  const before=await jsonBackup(page);
  const summary=await page.evaluate(()=>window.AHAKunstrommetV2.summary());
  const copy={...before,title:"Hentet sikkerhetskopi",note:"Bevart notat"};
  const restore=(data,deny=false)=>page.evaluate(async ({data,user,deny})=>{
    try {return {id:await window.AHAKunstrommetV2.saveCloudCopy(data,user,async()=>{if(deny)throw Error("account_changed");})};}
    catch(e){return {error:e.message};}
  },{data,user,deny});
  expect((await restore({...copy,layers:[{...copy.layers[0],bitmap:"data:image/png;base64,AAAA"}]})).error).toBeTruthy();
  expect((await restore(copy,true)).error).toBe("account_changed");
  expect(await page.evaluate(async()=> (await window.AHAKunstrommetV2.savedProjects()).length)).toBe(0);
  const saved=await restore(copy);
  expect(saved.id).toBeTruthy();expect(saved.id).not.toBe(summary.id);
  await expect(page.locator("#kv2-title")).toHaveValue("Aktivt kunstverk");
  expect((await jsonBackup(page)).layers).toEqual(before.layers);
  expect(await page.evaluate(()=>window.AHAKunstrommetV2.summary())).toEqual(summary);
  const records=await page.evaluate(()=>window.AHAKunstrommetV2.savedProjects());
  expect(records).toHaveLength(1);expect(records[0].owner).toBe(user);
  expect(records[0].title).toBe(copy.title);expect(records[0].note).toBe(copy.note);
  expect(records[0].layers[0].bitmap).toBe(copy.layers[0].bitmap);
  page.once("dialog",dialog=>dialog.accept());
  await page.locator("#kv2-projects .kv2-project--saved").getByRole("button",{name:"Åpne",exact:true}).click();
  await expect(page.locator("#kv2-title")).toHaveValue(copy.title);
  expect((await pixel(page))[0]).toBeLessThan(100);
});


test("8.1 workspace gives the canvas priority without losing existing controls", async ({page}) => {
  for (const width of [390, 834, 1180]) {
    await page.setViewportSize({width, height: 900});
    await page.goto("/kunstrommet.html?studio=overview", {waitUntil:"domcontentloaded"});
    const layout = await page.evaluate(() => {
      const main = document.querySelector(".aha-dashboard.kv2");
      const paper = document.querySelector("#kv2-paper");
      const after = selector => !!(paper.compareDocumentPosition(document.querySelector(selector)) & Node.DOCUMENT_POSITION_FOLLOWING);
      return {width:main.getBoundingClientRect().width, overflow:document.documentElement.scrollWidth > innerWidth + 1,
        canvasWidth:paper.clientWidth, after:["#kv2-save","#kv2-title",".kv2-guide-panel",".kv2-symmetry-panel","#kv2-brush-advanced"].every(after)};
    });
    expect(layout.after).toBe(true);
    expect(layout.overflow).toBe(false);
    if (width >= 834) expect(layout.width).toBeGreaterThan(760);
    expect(layout.canvasWidth).toBeGreaterThan(250);
    await expect(page.locator("#kv2-brush")).toBeVisible();
    await expect(page.locator("#kv2-save")).toBeVisible();
    await expect(page.locator("#kv2-add-layer")).toBeVisible();
    await page.locator("#kv2-focus-mode").click();
    await expect(page.locator(".kv2-sidebar")).toBeHidden();
    await expect(page.locator("#kv2-save")).toBeVisible();
    await page.locator("#kv2-focus-mode").click();
    await expect(page.locator("#kv2-add-layer")).toBeVisible();
  }
});


test("8.1 icon tools and collapsible layers preserve the drawing", async ({page}) => {
  await page.setViewportSize({width:834,height:1180});
  await page.goto("/kunstrommet.html?studio=overview",{waitUntil:"domcontentloaded"});
  const brush=page.getByRole("button",{name:"Pensel",exact:true});
  await expect(brush).toHaveAttribute("aria-pressed","true");
  await expect(brush.locator("svg")).toBeVisible();
  const size=await brush.boundingBox();
  expect(size.width).toBeGreaterThanOrEqual(44);
  expect(size.height).toBeGreaterThanOrEqual(44);
  await stroke(page);
  const before=await jsonBackup(page);
  const disclosure=page.locator(".kv2-layer-disclosure");
  await disclosure.locator(":scope > summary").click();
  await expect(page.locator("#kv2-add-layer")).toBeHidden();
  await expect(page.locator("#kv2-layer-count")).toBeVisible();
  await page.getByRole("button",{name:"Viskelær",exact:true}).click();
  await expect(page.locator("#kv2-eraser")).toHaveAttribute("aria-pressed","true");
  await brush.click();
  await disclosure.locator(":scope > summary").click();
  await expect(page.locator("#kv2-add-layer")).toBeVisible();
  expect((await jsonBackup(page)).layers).toEqual(before.layers);
});


test("8.1 contextual tool settings preserve values, artwork and history", async ({page}) => {
  await page.goto("/kunstrommet.html?studio=overview",{waitUntil:"domcontentloaded"});
  const visible = async (ids) => { for (const id of ids) await expect(page.locator("#kv2-"+id)).toBeVisible(); };
  const hidden = async (ids) => { for (const id of ids) await expect(page.locator("#kv2-"+id)).toBeHidden(); };
  await visible(["brush-preset","size","color","undo","redo"]);
  await hidden(["shape-style","snap-enabled","gradient-panel","text-panel"]);
  await page.locator("#kv2-brush-preset").selectOption("blyant");
  await stroke(page);
  const before=await jsonBackup(page);
  await page.locator("#kv2-move").click();
  await visible(["snap-enabled","color"]); await hidden(["brush-preset","size","shape-style"]);
  await page.locator("#kv2-snap-enabled").check();
  await page.locator("#kv2-rectangle").click();
  await visible(["shape-style","size"]); await hidden(["brush-preset","snap-enabled"]);
  await page.locator("#kv2-shape-style").selectOption("outline");
  await page.locator("#kv2-line").click();
  await visible(["size"]); await hidden(["shape-style"]);
  await page.locator("#kv2-gradient").click();
  await visible(["gradient-panel","color"]); await hidden(["size","brush-preset","shape-style"]);
  await page.locator("#kv2-gradient-type").selectOption("radial");
  await page.locator("#kv2-text").click();
  await visible(["text-panel"]); await hidden(["gradient-panel","size"]);
  await page.locator("#kv2-hand").click();
  await hidden(["text-panel","size","brush-preset","snap-enabled"]);
  await page.locator("#kv2-move").click(); await expect(page.locator("#kv2-snap-enabled")).toBeChecked();
  await page.locator("#kv2-rectangle").click(); await expect(page.locator("#kv2-shape-style")).toHaveValue("outline");
  await page.locator("#kv2-gradient").click(); await expect(page.locator("#kv2-gradient-type")).toHaveValue("radial");
  await page.locator("#kv2-brush").click(); await expect(page.locator("#kv2-brush-preset")).toHaveValue("blyant");
  expect((await jsonBackup(page)).layers).toEqual(before.layers);
  await page.locator("#kv2-undo").click();
  await expect.poll(async()=>await pixel(page)).toEqual([255,255,255,255]);
});


test("9.1 color region preview preserves pixels and creates an undoable connected mask",async({page})=>{
 await page.goto("/kunstrommet.html?studio=overview",{waitUntil:"domcontentloaded"});
 await page.locator("#kv2-color").evaluate(el=>{el.value="#b52c35";el.dispatchEvent(new Event("input",{bubbles:true}));});
 await page.locator("#kv2-rectangle").click();
 await shapeDrag(page,[200,200],[400,400],9101);
 await shapeDrag(page,[700,200],[900,400],9102);
 const before=await jsonBackup(page);
 await page.locator("#kv2-color-region").click();
 await shapePointer(page,"pointerdown",300,300,9103);
 await shapePointer(page,"pointerup",300,300,9103);
 await expect(page.locator("#kv2-color-region-overlay")).toBeVisible();
 await expect(page.locator("#kv2-color-region-apply")).toBeEnabled();
 expect((await jsonBackup(page)).layers).toEqual(before.layers);
 await page.locator("#kv2-color-region-apply").click();
 await expect(page.locator("#kv2-color-region-overlay")).toBeHidden();
 const after=await jsonBackup(page);
 expect(after.layers[0].bitmap).toBe(before.layers[0].bitmap);
 expect(after.layers[0].maskBitmap).toBeTruthy();
 expect((await pxAt(page,300,300)).slice(0,3)).toEqual([255,255,255]);
 expect((await pxAt(page,800,300))[1]).toBeLessThan(100);
 await page.locator("#kv2-color-region").click();
 await shapePointer(page,"pointerdown",800,300,9104);
 await expect(page.locator("#kv2-color-region-apply")).toBeDisabled();
 await page.locator("#kv2-undo").click();
 await expect.poll(async()=>(await pxAt(page,300,300))[1]).toBeLessThan(100);
 expect((await jsonBackup(page)).layers).toEqual(before.layers);
});


test("9.2 combines disconnected color regions and subtracts before committing one mask",async({page})=>{
 await page.goto("/kunstrommet.html?studio=overview",{waitUntil:"domcontentloaded"});
 await page.locator("#kv2-color").evaluate(el=>{el.value="#b52c35";el.dispatchEvent(new Event("input",{bubbles:true}));});
 await page.locator("#kv2-rectangle").click();
 await shapeDrag(page,[150,200],[350,400],9201);
 await shapeDrag(page,[500,200],[700,400],9202);
 await shapeDrag(page,[850,200],[1050,400],9203);
 const before=await jsonBackup(page);
 const click=async(x,y,id)=>{await shapePointer(page,"pointerdown",x,y,id);await shapePointer(page,"pointerup",x,y,id);};
 const alpha=async(x,y)=>page.locator("#kv2-color-region-overlay").evaluate((c,p)=>c.getContext("2d").getImageData(p.x,p.y,1,1).data[3],{x,y});
 const op=page.locator("#kv2-color-region-operation");
 await page.locator("#kv2-color-region").click();
 await click(250,300,9204);
 await op.selectOption("add");
 await click(600,300,9205);
 expect(await alpha(250,300)).toBe(110);
 expect(await alpha(600,300)).toBe(110);
 expect(await alpha(950,300)).toBe(0);
 await click(450,500,9206); // transparent click must preserve previous selection
 expect(await alpha(250,300)).toBe(110);
 await op.selectOption("subtract");
 await click(250,300,9207);
 expect(await alpha(250,300)).toBe(0);
 expect(await alpha(600,300)).toBe(110);
 await click(600,300,9208);
 await expect(page.locator("#kv2-color-region-apply")).toBeDisabled();
 await expect(page.locator("#kv2-color-region-overlay")).toBeHidden();
 await op.selectOption("add");
 await click(950,300,9209);
 await click(600,300,9210);
 await page.locator("#kv2-color-region-tolerance").evaluate(el=>{el.value="0";el.dispatchEvent(new Event("change",{bubbles:true}));});
 expect(await alpha(950,300)).toBe(110);
 expect(await alpha(600,300)).toBe(110);
 expect(await alpha(250,300)).toBe(0);
 expect((await jsonBackup(page)).layers).toEqual(before.layers);
 await page.locator("#kv2-color-region-mode").selectOption("keep");
 await page.locator("#kv2-color-region-apply").click();
 expect((await pxAt(page,250,300)).slice(0,3)).toEqual([255,255,255]);
 expect((await pxAt(page,600,300))[1]).toBeLessThan(100);
 expect((await pxAt(page,950,300))[1]).toBeLessThan(100);
 expect((await jsonBackup(page)).layers[0].bitmap).toBe(before.layers[0].bitmap);
 await page.locator("#kv2-undo").click();
 await expect.poll(async()=>(await pxAt(page,250,300))[1]).toBeLessThan(100);
 expect((await jsonBackup(page)).layers).toEqual(before.layers);
});


test("9.3 feather previews fractional coverage and commits matching reversible alpha",async({page})=>{
 await page.goto("/kunstrommet.html?studio=overview",{waitUntil:"domcontentloaded"});
 const color=async(v)=>page.locator("#kv2-color").evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event("input",{bubbles:true}));},v);
 await color("#202020");
 await page.locator("#kv2-rectangle").click();
 await shapeDrag(page,[100,100],[1100,700],9301);
 await color("#b52c35");
 await page.locator("#kv2-rectangle").click();
 await shapeDrag(page,[300,250],[700,550],9302);
 const before=await jsonBackup(page);
 await page.locator("#kv2-color-region").click();
 await shapePointer(page,"pointerdown",500,400,9303);
 await shapePointer(page,"pointerup",500,400,9303);
 const alpha=async(x,y)=>page.locator("#kv2-color-region-overlay").evaluate((c,p)=>c.getContext("2d").getImageData(p.x,p.y,1,1).data[3],{x,y});
 const setRadius=async(n)=>page.locator("#kv2-color-region-feather").evaluate((el,n)=>{el.value=String(n);el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));},n);
 expect(await alpha(299,400)).toBe(0);
 expect(await alpha(300,400)).toBe(110);
 await setRadius(8);
 const outside=await alpha(299,400),inside=await alpha(300,400);
 expect(outside).toBeGreaterThan(0);expect(inside).toBeGreaterThan(outside);expect(inside).toBeLessThan(110);
 expect(await alpha(500,400)).toBe(110);
 expect(await alpha(200,400)).toBe(0);
 await setRadius(0);
 expect(await alpha(299,400)).toBe(0);expect(await alpha(300,400)).toBe(110);
 await setRadius(8);
 expect(await alpha(299,400)).toBe(outside);
 expect((await jsonBackup(page)).layers).toEqual(before.layers);
 await page.locator("#kv2-color-region-mode").selectOption("keep");
 await page.locator("#kv2-color-region-apply").click();
 const after=await jsonBackup(page);
 expect(after.layers[0].bitmap).toBe(before.layers[0].bitmap);
 const coverage=await pngLayersAt(page,[{bitmap:after.layers[0].maskBitmap}],300,400);
 expect(coverage[0][3]).toBeGreaterThan(0);expect(coverage[0][3]).toBeLessThan(255);
 expect(Math.round(coverage[0][3]*110/255)).toBe(inside);
 expect((await pngLayersAt(page,[{bitmap:after.layers[0].maskBitmap}],500,400))[0][3]).toBe(255);
 await page.locator("#kv2-undo").click();
 await expect.poll(async()=>(await pxAt(page,200,400))[0]).toBeLessThan(100);
 expect((await jsonBackup(page)).layers).toEqual(before.layers);
});


test("9.4 edge shift shrinks and expands the raw selection, then feathers the same mask",async({page})=>{
 await page.goto("/kunstrommet.html?studio=overview",{waitUntil:"domcontentloaded"});
 const color=async(v)=>page.locator("#kv2-color").evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event("input",{bubbles:true}));},v);
 await color("#202020");
 await page.locator("#kv2-rectangle").click();
 await shapeDrag(page,[100,100],[1100,700],9401);
 await color("#b52c35");
 await page.locator("#kv2-rectangle").click();
 await shapeDrag(page,[300,250],[700,550],9402);
 await shapeDrag(page,[850,350],[858,358],9403);
 const before=await jsonBackup(page);
 await page.locator("#kv2-color-region").click();
 const click=async(x,y,id)=>{await shapePointer(page,"pointerdown",x,y,id);await shapePointer(page,"pointerup",x,y,id);};
 const alpha=async(x,y)=>page.locator("#kv2-color-region-overlay").evaluate((c,p)=>c.getContext("2d").getImageData(p.x,p.y,1,1).data[3],{x,y});
 const set=async(id,n)=>page.locator("#kv2-color-region-"+id).evaluate((el,n)=>{el.value=String(n);el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));},n);
 await click(854,354,9404);
 await set("shift",-8);
 await expect(page.locator("#kv2-color-region-apply")).toBeDisabled();
 await expect(page.locator("#kv2-color-region-overlay")).toBeHidden();
 await set("shift",0);
 await expect(page.locator("#kv2-color-region-apply")).toBeEnabled();
 await click(500,400,9405);
 expect(await alpha(300,400)).toBe(110);
 expect(await alpha(299,400)).toBe(0);
 await set("shift",-4);
 expect(await alpha(303,400)).toBe(0);
 expect(await alpha(304,400)).toBe(110);
 await set("shift",4);
 expect(await alpha(295,400)).toBe(0);
 expect(await alpha(296,400)).toBe(110);
 await set("shift",0);
 expect(await alpha(299,400)).toBe(0);
 expect(await alpha(300,400)).toBe(110);
 await set("shift",-4);
 await set("feather",3);
 const edge=await alpha(304,400);
 expect(edge).toBeGreaterThan(0);expect(edge).toBeLessThan(110);
 expect((await jsonBackup(page)).layers).toEqual(before.layers);
 await page.locator("#kv2-color-region-mode").selectOption("keep");
 await page.locator("#kv2-color-region-apply").click();
 const after=await jsonBackup(page);
 expect(after.layers[0].bitmap).toBe(before.layers[0].bitmap);
 const mask=[{bitmap:after.layers[0].maskBitmap}];
 expect((await pngLayersAt(page,mask,296,400))[0][3]).toBe(0);
 expect(Math.round((await pngLayersAt(page,mask,304,400))[0][3]*110/255)).toBe(edge);
 expect((await pngLayersAt(page,mask,500,400))[0][3]).toBe(255);
 await page.locator("#kv2-undo").click();
 await expect.poll(async()=>(await pxAt(page,200,400))[0]).toBeLessThan(100);
 expect((await jsonBackup(page)).layers).toEqual(before.layers);
});


test("9.4b corrects partially masked edge colors on a separate undoable copy",async({page})=>{
 await page.goto("/kunstrommet.html?studio=overview",{waitUntil:"domcontentloaded"});
 const color=async(v)=>page.locator("#kv2-color").evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event("input",{bubbles:true}));},v);
 await color("#184ad2");
 await page.locator("#kv2-rectangle").click();
 await shapeDrag(page,[100,100],[1100,700],9491);
 await color("#d82c24");
 await page.locator("#kv2-rectangle").click();
 await shapeDrag(page,[300,250],[700,550],9492);
 await page.locator("#kv2-color-region").click();
 await shapePointer(page,"pointerdown",500,400,9493);
 await shapePointer(page,"pointerup",500,400,9493);
 await page.locator("#kv2-color-region-feather").evaluate(el=>{el.value="4";el.dispatchEvent(new Event("change",{bubbles:true}));});
 await page.locator("#kv2-color-region-mode").selectOption("keep");
 await page.locator("#kv2-color-region-apply").click();
 const before=await jsonBackup(page);
 await page.locator(".kv2-mask-edge-panel summary").click();
 await page.locator("#kv2-mask-edge-strength").evaluate(el=>{el.value="100";el.dispatchEvent(new Event("input",{bubbles:true}));});
 await expect(page.locator("#kv2-mask-edge-copy")).toBeEnabled();
 await page.locator("#kv2-mask-edge-copy").click();
 const after=await jsonBackup(page);
 expect(after.layers).toHaveLength(2);
 expect(after.layers[0]).toEqual({...before.layers[0],visible:false});
 expect(after.layers[1].maskBitmap).toBe(before.layers[0].maskBitmap);
 expect(after.layers[1].maskPixelFixups).toBe(before.layers[0].maskPixelFixups);
 const edge=await pngLayersAt(page,after.layers,299,400);
 expect(edge[1][0]).toBeGreaterThan(edge[0][0]);
 expect(edge[1][2]).toBeLessThan(edge[0][2]);
 expect(edge[1][3]).toBe(edge[0][3]);
 const interior=await pngLayersAt(page,after.layers,500,400);
 expect(interior[1]).toEqual(interior[0]);
 const hidden=await pngLayersAt(page,after.layers,200,400);
 expect(hidden[1]).toEqual(hidden[0]);
 await page.locator("#kv2-undo").click();
 await expect(page.locator("#kv2-layer-count")).toContainText("1 av 8 lag");
 expect((await jsonBackup(page)).layers).toEqual(before.layers);
});


test("9.5a suggests multicolor foreground inside a rectangle without altering the source",async({page})=>{
 await page.goto("/kunstrommet.html?studio=overview",{waitUntil:"domcontentloaded"});
 const color=async(v)=>page.locator("#kv2-color").evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event("input",{bubbles:true}));},v);
 const rect=async(v,a,b,id)=>{await color(v);await page.locator("#kv2-rectangle").click();await shapeDrag(page,a,b,id);};
 await rect("#204070",[100,100],[1100,700],9511);
 await rect("#bd3030",[400,250],[700,550],9512);
 await rect("#42a040",[500,350],[800,450],9513);
 const before=await jsonBackup(page);
 await page.locator("#kv2-color-region").click();
 await expect(page.locator("#kv2-color-region-propose")).toBeDisabled();
 await page.locator("#kv2-select").click();
 await shapeDrag(page,[300,200],[900,600],9514);
 await page.locator("#kv2-color-region").click();
 await page.locator("#kv2-color-region-propose").click();
 await expect(page.locator("#kv2-color-region-apply")).toBeEnabled();
 await expect(page.locator("#kv2-color-region-mode")).toHaveValue("keep");
 const alpha=async(x,y)=>page.locator("#kv2-color-region-overlay").evaluate((c,p)=>c.getContext("2d").getImageData(p.x,p.y,1,1).data[3],{x,y});
 expect(await alpha(450,300)).toBe(110);
 expect(await alpha(750,400)).toBe(110);
 expect(await alpha(350,300)).toBe(0);
 expect(await alpha(200,400)).toBe(0);
 await page.locator("#kv2-color-region-tolerance").evaluate(el=>{el.value="10";el.dispatchEvent(new Event("change",{bubbles:true}));});
 expect(await alpha(750,400)).toBe(110);
 expect((await jsonBackup(page)).layers).toEqual(before.layers);
 await page.locator("#kv2-color-region-apply").click();
 expect((await pxAt(page,350,300)).slice(0,3)).toEqual([255,255,255]);
 expect((await pxAt(page,750,400))[1]).toBeGreaterThan(100);
 expect((await jsonBackup(page)).layers[0].bitmap).toBe(before.layers[0].bitmap);
 await page.locator("#kv2-undo").click();
 await expect.poll(async()=>(await pxAt(page,350,300))[2]).toBeLessThan(200);
 expect((await jsonBackup(page)).layers).toEqual(before.layers);
});


test("9.5b gated local model mask is preview-only, reversible and rejects stale replies",async({page})=>{
 await page.goto("/kunstrommet.html?studio=overview",{waitUntil:"domcontentloaded"});
 await page.locator("#kv2-color").evaluate(el=>{el.value="#b03040";el.dispatchEvent(new Event("input",{bubbles:true}));});
 await page.locator("#kv2-rectangle").click();
 await shapeDrag(page,[100,100],[900,650],9521);
 const before=await jsonBackup(page);
 await page.locator("#kv2-color-region").click();
 expect(await page.evaluate(()=>window.AHAKunstrommetV2.localMaskPilot.begin()===null)).toBe(true);
 await page.evaluate(()=>{window.AHA_KUNSTROMMET_LOCAL_MASK_PILOT=true;});
 const result=await page.evaluate(()=>{
   const api=window.AHAKunstrommetV2.localMaskPilot;
   const a=api.begin();
   if(!a)return {missing:true};
   const bits=new Uint8Array(a.width*a.height);
   for(let y=200;y<400;y++)for(let x=250;x<450;x++)bits[y*a.width+x]=1;
   const bad=api.preview(a.token,new Uint8Array(1));
   const reused=api.preview(a.token,bits);
   const b=api.begin(),c=api.begin();
   const stale=api.preview(b.token,bits);
   const ok=api.preview(c.token,bits);
   bits.fill(0); // accepted mask must own its own copy
   return {bad,reused,stale,ok,rgba:a.rgba.length,expected:a.width*a.height*4};
 });
 expect(result).toEqual({bad:false,reused:false,stale:false,ok:true,rgba:result.expected,expected:result.expected});
 await expect(page.locator("#kv2-color-region-apply")).toBeEnabled();
 await expect(page.locator("#kv2-color-region-mode")).toHaveValue("keep");
 expect((await jsonBackup(page)).layers).toEqual(before.layers);
 await page.locator("#kv2-color-region-tolerance").evaluate(el=>{el.value="20";el.dispatchEvent(new Event("change",{bubbles:true}));});
 await expect(page.locator("#kv2-color-region-apply")).toBeEnabled();
 await page.locator("#kv2-color-region-apply").click();
 expect((await jsonBackup(page)).layers[0].bitmap).toBe(before.layers[0].bitmap);
 expect((await pxAt(page,300,300))[0]).toBeGreaterThan(100);
 expect((await pxAt(page,700,500)).slice(0,3)).toEqual([255,255,255]);
 await page.locator("#kv2-undo").click();
 expect((await jsonBackup(page)).layers).toEqual(before.layers);
 await page.locator("#kv2-color-region").click();
 await page.evaluate(()=>{window.__krPending=window.AHAKunstrommetV2.localMaskPilot.begin();});
 await page.locator("#kv2-rectangle").click();await shapeDrag(page,[50,50],[80,80],9522);
 await page.locator("#kv2-color-region").click();
 expect(await page.evaluate(()=>{const a=window.__krPending;return window.AHAKunstrommetV2.localMaskPilot.preview(a.token,new Uint8Array(a.width*a.height));})).toBe(false);
});

test("9.5c opt-in KI toolbar sends layer-local points and applies only confirmed mask",async({page})=>{
 await page.goto("/kunstrommet.html?studio=overview",{waitUntil:"domcontentloaded"});
 await expect(page.locator("#kv2-ai-region")).toBeHidden();
 await page.addInitScript(()=>{window.AHA_KUNSTROMMET_LOCAL_MASK_PILOT=true;window.AHA_KUNSTROMMET_AI_TOOL_PILOT=true;});
 // Mock the worker transport, not the editor; real WASM inference is tested separately.
 await page.route("**/tools/kunstrommet-sam-pilot/editor-worker.mjs",route=>route.fulfill({contentType:"application/javascript",body:`
  let width,height;
  self.onmessage=({data})=>{
    const reused=data.type==="refine";
    if(!reused){width=data.width;height=data.height;}
    if(!width||!height||data.points.length<2||data.points[0][2]!==1||data.points[1][2]!==0||(!reused&&data.rgba.length!==width*height*4)||(reused&&data.rgba)){self.postMessage({type:"error",id:data.id});return;}
    const bits=new Uint8Array(width*height);
    for(let y=200;y<400;y++)for(let x=250;x<450;x++)bits[y*width+x]=1;
    self.postMessage({type:"mask",id:data.id,bits,reused,encoderRuns:1},[bits.buffer]);
  };
 `}));
 await page.reload({waitUntil:"domcontentloaded"});
 await page.locator("#kv2-color").evaluate(el=>{el.value="#b03040";el.dispatchEvent(new Event("input",{bubbles:true}));});
 await page.locator("#kv2-rectangle").click();
 await shapeDrag(page,[100,100],[900,650],9531);
 const before=await jsonBackup(page);
 await expect(page.locator("#kv2-ai-region")).toBeVisible();
 await page.locator("#kv2-ai-region").click();
 await expect(page.locator("#kv2-ai-analyze")).toBeDisabled();
 await shapeDrag(page,[300,300],[300,300],9532);
 await page.locator("#kv2-ai-point-mode").selectOption("0");
 await shapeDrag(page,[700,500],[700,500],9533);
 await expect(page.locator("#kv2-ai-count")).toHaveText("2 / 12 punkter");
 await expect(page.locator("#kv2-ai-points-overlay .kv2-ai-point")).toHaveCount(2);
 await expect(page.locator('.kv2-ai-point[data-label="1"]')).toHaveText("+");
 await expect(page.locator('.kv2-ai-point[data-label="0"]')).toHaveText("−");
 await page.locator("#kv2-ai-undo-point").click();
 await expect(page.locator("#kv2-ai-points-overlay .kv2-ai-point")).toHaveCount(1);
 await shapeDrag(page,[700,500],[700,500],9534);
 await page.locator("#kv2-zoom-in").click();
 await expect(page.locator("#kv2-ai-points-overlay .kv2-ai-point")).toHaveCount(2);
 await page.locator("#kv2-ai-analyze").click();
 await expect(page.locator("#kv2-color-region-apply")).toBeEnabled();
 expect((await jsonBackup(page)).layers).toEqual(before.layers);
 await expect(page.locator("#kv2-ai-region-controls")).toHaveAttribute("data-cache","cold");
 await page.locator("#kv2-ai-point-mode").selectOption("1");
 await shapeDrag(page,[350,350],[350,350],9535);
 await expect(page.locator("#kv2-color-region-apply")).toBeDisabled();
 await page.locator("#kv2-ai-analyze").click();
 await expect(page.locator("#kv2-color-region-apply")).toBeEnabled();
 await expect(page.locator("#kv2-ai-region-controls")).toHaveAttribute("data-cache","warm");
 await expect(page.locator("#kv2-ai-region-controls")).toHaveAttribute("data-encoder-runs","1");
 expect((await jsonBackup(page)).layers).toEqual(before.layers);
 await page.locator("#kv2-color-region-apply").click();
 await expect(page.locator("#kv2-ai-points-overlay")).toBeHidden();
 expect((await jsonBackup(page)).layers[0].bitmap).toBe(before.layers[0].bitmap);
 expect((await pxAt(page,700,500)).slice(0,3)).toEqual([255,255,255]);
 await page.locator("#kv2-undo").click();
 expect((await jsonBackup(page)).layers).toEqual(before.layers);
});

test("10.0a tool families keep direct access and touch targets on narrow and tablet widths",async({page})=>{
 for(const width of [375,820,1180]){
  await page.setViewportSize({width,height:900});
  await page.goto("/kunstrommet.html?studio=overview",{waitUntil:"domcontentloaded"});
  await expect(page.locator(".kv2-tool-group")).toHaveCount(3);
  await expect(page.getByRole("group",{name:"Tegning",exact:true})).toBeVisible();
  await expect(page.getByRole("group",{name:"Flytt og marker",exact:true})).toBeVisible();
  await expect(page.getByRole("group",{name:"Form og tekst",exact:true})).toBeVisible();
  await expect(page.locator("#kv2-ai-region")).toBeHidden();
  const geometry=await page.locator(".kv2-tool-strip").evaluate(el=>{
   const r=el.getBoundingClientRect();
   const buttons=[...el.querySelectorAll("button:not([hidden])")].map(b=>{const x=b.getBoundingClientRect();return {w:x.width,h:x.height,left:x.left,right:x.right};});
   return {left:r.left,right:r.right,buttons};
  });
  expect(geometry.buttons).toHaveLength(15);
  expect(geometry.buttons.every(b=>b.w>=44&&b.h>=44&&b.left>=geometry.left-1&&b.right<=geometry.right+1)).toBe(true);
  for(const id of ["brush","hand","lasso","rectangle","gradient","text"]){
   await page.locator("#kv2-"+id).click();
   await expect(page.locator("#kv2-"+id)).toHaveAttribute("aria-pressed","true");
  }
 }
});

test("10.0b clone stamp samples the active raw layer, cancels preview, commits and undoes",async({page})=>{
 await page.goto("/kunstrommet.html?studio=overview",{waitUntil:"domcontentloaded"});
 await page.locator("#kv2-color").evaluate(el=>{el.value="#b03040";el.dispatchEvent(new Event("input",{bubbles:true}));});
 await page.locator("#kv2-rectangle").click();await shapeDrag(page,[100,100],[300,300],9601);
 const before=await jsonBackup(page);
 await page.locator("#kv2-clone").click();
 await shapeDrag(page,[200,200],[200,200],9602);
 await expect(page.locator("#kv2-clone-marker")).toBeVisible();
 expect((await jsonBackup(page)).layers).toEqual(before.layers);
 await page.locator("#kv2-clone-size").evaluate(el=>{el.value="100";});
 await shapePointer(page,"pointerdown",600,400,9603);
 await shapePointer(page,"pointermove",650,400,9603);
 await expect(page.locator("#kv2-brush-live")).toBeVisible();
 await shapePointer(page,"pointercancel",650,400,9603);
 expect((await jsonBackup(page)).layers).toEqual(before.layers);
 await shapeDrag(page,[600,400],[650,400],9604);
 expect((await pxAt(page,620,400)).slice(0,3)).toEqual([176,48,64]);
 expect((await pxAt(page,200,200)).slice(0,3)).toEqual([176,48,64]);
 expect((await pxAt(page,800,500)).slice(0,3)).toEqual([255,255,255]);
 await page.locator("#kv2-undo").click();
 await expect.poll(async()=> (await pxAt(page,620,400)).slice(0,3)).toEqual([255,255,255]);
 expect((await jsonBackup(page)).layers).toEqual(before.layers);
 await expect(page.locator("#kv2-clone-marker")).toBeHidden();
});

test("10.0c healing transfers texture with local color correction and preserves transparency",async({page})=>{
 await page.goto("/kunstrommet.html?studio=overview",{waitUntil:"domcontentloaded"});
 const paint=async(color,start,end,id)=>{
  await page.locator("#kv2-color").evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event("input",{bubbles:true}));},color);
  await page.locator("#kv2-rectangle").click();await shapeDrag(page,start,end,id);
 };
 // Source: lighter field with a dark texture stripe. Destination: darker
 // field with a black blemish at the center. Same opaque raster layer.
 await paint("#c8aa8c",[100,100],[400,400],9651);
 await paint("#b4987c",[196,180],[204,220],9652);
 await paint("#8c7054",[500,100],[800,400],9653);
 await paint("#000000",[646,196],[654,204],9654);
 const before=await jsonBackup(page);
 await page.locator("#kv2-clone").click();
 await page.locator("#kv2-clone-mode").selectOption("heal");
 await page.locator("#kv2-clone-size").evaluate(el=>{el.value="100";});
 await shapeDrag(page,[200,200],[200,200],9655);
 await shapeDrag(page,[650,200],[650,200],9656);
 const repaired=(await pxAt(page,650,200)).slice(0,3);
 // Source stripe [180,152,124], local difference [-60,-58,-56].
 expect(repaired.every((v,i)=>Math.abs(v-[120,94,68][i])<=4)).toBe(true);
 expect((await pxAt(page,675,200)).slice(0,3)).toEqual([140,112,84]);
 expect((await pxAt(page,200,200)).slice(0,3)).toEqual([180,152,124]);
 // No opaque destination ring: healing on blank canvas must not paint it.
 const healed=await jsonBackup(page);
 await shapeDrag(page,[950,500],[950,500],9657);
 expect((await jsonBackup(page)).layers).toEqual(healed.layers);
 await page.locator("#kv2-undo").click();
 await expect.poll(async()=> (await pxAt(page,650,200)).slice(0,3)).toEqual([0,0,0]);
 expect((await jsonBackup(page)).layers).toEqual(before.layers);
});

test("10.0d projective rectification previews a convex source crop, rejects crossed corners and undoes",async({page})=>{
 await page.goto("/kunstrommet.html?studio=overview",{waitUntil:"domcontentloaded"});
 await page.locator("#kv2-color").evaluate(el=>{el.value="#b03040";el.dispatchEvent(new Event("input",{bubbles:true}));});
 await page.locator("#kv2-rectangle").click();await shapeDrag(page,[200,100],[1000,700],9701);
 const before=await jsonBackup(page);
 await page.locator("#kv2-photo-perspective").click();
 await expect(page.locator("#kv2-photo-perspective-panel")).toBeVisible();
 const selectCorner=async(i,x,y)=>{
  await page.locator("#kv2-photo-perspective-corner").selectOption(String(i));
  await page.locator("#kv2-photo-perspective-source").evaluate((c,p)=>{const r=c.getBoundingClientRect();c.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,cancelable:true,pointerType:"touch",clientX:r.left+p.x*r.width,clientY:r.top+p.y*r.height}));},{x,y});
 };
 await selectCorner(0,.9,.8);
 await expect(page.locator("#kv2-photo-perspective-apply")).toBeDisabled();
 await selectCorner(0,.25,.25);await selectCorner(1,.75,.2);await selectCorner(2,.65,.75);await selectCorner(3,.3,.8);
 await page.locator("#kv2-photo-perspective-ratio").selectOption("original");
 await expect(page.locator("#kv2-photo-perspective-apply")).toBeEnabled();
 expect((await jsonBackup(page)).layers).toEqual(before.layers);
 await page.locator("#kv2-photo-perspective-apply").click();
 await expect(page.locator("#kv2-photo-perspective-panel")).toBeHidden();
 expect((await pxAt(page,50,50)).slice(0,3)).toEqual([176,48,64]);
 expect((await pxAt(page,1100,750)).slice(0,3)).toEqual([176,48,64]);
 await page.locator("#kv2-undo").click();
 await expect.poll(async()=> (await pxAt(page,50,50)).slice(0,3)).toEqual([255,255,255]);
 expect((await jsonBackup(page)).layers).toEqual(before.layers);
});

test("10.0e local detail preview is reversible, smooths noise and preserves alpha",async({page})=>{
 await page.goto("/kunstrommet.html?studio=overview",{waitUntil:"domcontentloaded"});
 // A synthetic opaque field with a slight center impulse, transparent outside.
 const png=await page.evaluate(()=>{
  const c=document.createElement("canvas");c.width=1200;c.height=800;
  const ctx=c.getContext("2d");ctx.fillStyle="rgb(120,120,120)";ctx.fillRect(100,100,1000,600);
  ctx.fillStyle="rgb(140,140,140)";ctx.fillRect(600,400,1,1);
  return c.toDataURL("image/png").split(",")[1];
 });
 await page.locator("#kv2-photo").setInputFiles({name:"detail.png",mimeType:"image/png",buffer:Buffer.from(png,"base64")});
 await expect.poll(async()=> (await pxAt(page,600,400))[0]).toBe(140);
 await expect(page.locator("#kv2-photo-detail")).toBeEnabled();
 await expect(page.locator("#kv2-photo-perspective")).toBeEnabled();
 await expect(page.locator("#kv2-transform-free")).toBeEnabled();
 const before=await jsonBackup(page);
 await page.locator("#kv2-photo-detail").click();
 await expect(page.locator("#kv2-photo-detail-apply")).toBeDisabled();
 await page.locator("#kv2-photo-detail-noise").evaluate(el=>{el.value="100";el.dispatchEvent(new Event("change",{bubbles:true}));});
 const preview=await page.locator("#kv2-photo-detail-after").evaluate(c=>c.getContext("2d").getImageData(160,160,1,1).data[0]);
 expect(preview).toBeLessThan(140);expect(preview).toBeGreaterThan(120);
 expect((await jsonBackup(page)).layers).toEqual(before.layers);
 await page.locator("#kv2-photo-detail-apply").click();
 expect((await pxAt(page,600,400))[0]).toBe(preview);
 expect((await pxAt(page,30,30)).slice(0,3)).toEqual([255,255,255]);
 expect((await pxAt(page,300,300)).slice(0,3)).toEqual([120,120,120]);
 await page.locator("#kv2-undo").click();
 await expect.poll(async()=> (await pxAt(page,600,400))[0]).toBe(140);
 expect((await jsonBackup(page)).layers).toEqual(before.layers);
 await page.locator("#kv2-photo-detail").click();
 await page.locator("#kv2-photo-detail-sharp").evaluate(el=>{el.value="100";el.dispatchEvent(new Event("change",{bubbles:true}));});
 expect(await page.locator("#kv2-photo-detail-after").evaluate(c=>c.getContext("2d").getImageData(160,160,1,1).data[0])).toBeGreaterThan(140);
 await page.locator("#kv2-photo-detail-cancel").click();
 expect((await jsonBackup(page)).layers).toEqual(before.layers);
});

test("10.0f restoration preview restores faded range, reduces cast and isolated dust without inventing pixels",async({page})=>{
 await page.goto("/kunstrommet.html?studio=overview",{waitUntil:"domcontentloaded"});
 const png=await page.evaluate(()=>{
  const c=document.createElement("canvas");c.width=1200;c.height=800;const ctx=c.getContext("2d");
  ctx.fillStyle="rgb(110,90,70)";ctx.fillRect(100,100,500,600);
  ctx.fillStyle="rgb(190,170,150)";ctx.fillRect(600,100,500,600);
  ctx.fillStyle="rgb(250,250,250)";ctx.fillRect(550,400,1,1);
  return c.toDataURL("image/png").split(",")[1];
 });
 await page.locator("#kv2-photo").setInputFiles({name:"restoration.png",mimeType:"image/png",buffer:Buffer.from(png,"base64")});
 await expect.poll(async()=> (await pxAt(page,550,400))[0]).toBe(250);
 const before=await jsonBackup(page);
 await page.locator("#kv2-photo-restore").click();
 await expect(page.locator("#kv2-photo-restore-adjustments")).toBeVisible();
 await expect(page.locator("#kv2-photo-detail-adjustments")).toBeHidden();
 await expect(page.locator("#kv2-photo-detail-apply")).toBeDisabled();
 const set=async(k,v)=>page.locator("#kv2-photo-detail-"+k).evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event("change",{bubbles:true}));},v);
 const pixel=async(x,y)=>page.locator("#kv2-photo-detail-after").evaluate((c,p)=>Array.from(c.getContext("2d").getImageData(p.x,p.y,1,1).data),{x,y});
 await set("dust",100);
 expect(await pixel(110,160)).toEqual([110,90,70,255]);
 // A true large-area transition must not be treated as a speck.
 expect(await pixel(160,160)).toEqual([190,170,150,255]);
 await set("fade",100);
 const dark=await pixel(60,160),light=await pixel(220,160);
 expect(light[1]-dark[1]).toBeGreaterThan(80);
 await set("fade",0);await set("cast",100);
 const neutral=await pixel(60,160);
 expect(Math.max(...neutral.slice(0,3))-Math.min(...neutral.slice(0,3))).toBeLessThan(3);
 expect((await jsonBackup(page)).layers).toEqual(before.layers);
 await page.locator("#kv2-photo-detail-apply").click();
 expect((await pxAt(page,500,400)).slice(0,3)).toEqual(neutral.slice(0,3));
 expect((await pxAt(page,550,400)).slice(0,3)).toEqual(neutral.slice(0,3));
 expect((await pxAt(page,30,30)).slice(0,3)).toEqual([255,255,255]);
 await page.locator("#kv2-undo").click();
 await expect.poll(async()=> (await pxAt(page,550,400))[0]).toBe(250);
 expect((await jsonBackup(page)).layers).toEqual(before.layers);
 await page.locator("#kv2-photo-restore").click();await set("fade",100);
 await page.locator("#kv2-photo-detail-cancel").click();
 expect((await jsonBackup(page)).layers).toEqual(before.layers);
});

test("10.1a compact workspace keeps canvas, tools and selected inspector on one surface",async({page})=>{
 for(const [width,height] of [[390,844],[834,1180],[1180,820]]){
  await page.setViewportSize({width,height});
  await page.goto("/kunstrommet.html",{waitUntil:"domcontentloaded"});
  await expect(page.locator("#main")).toHaveAttribute("data-studio-layout","compact");
  await expect(page.locator("#kv2-brush")).toBeVisible();
  await expect(page.locator("#kv2-save")).toBeVisible();
  const layout=await page.evaluate(()=>{
   const m=document.querySelector("#main").getBoundingClientRect(),p=document.querySelector("#kv2-paper").getBoundingClientRect(),c=document.querySelector("#kv2-canvas").getBoundingClientRect(),a=document.querySelector(".kv2-actions").getBoundingClientRect();
   return {overflow:document.documentElement.scrollWidth>innerWidth+1,mainHeight:m.height,canvasWidth:c.width,canvasHeight:c.height,paperHeight:p.height,actionsBottom:a.bottom,mainBottom:m.bottom,ids:[...document.querySelectorAll("[id]")].map(n=>n.id)};
  });
  expect(layout.overflow).toBe(false);expect(layout.mainHeight).toBeLessThanOrEqual(height);
  expect(layout.canvasWidth).toBeGreaterThan(180);expect(layout.canvasHeight).toBeGreaterThan(100);
  expect(layout.actionsBottom).toBeLessThanOrEqual(layout.mainBottom+2);expect(new Set(layout.ids).size).toBe(layout.ids.length);
  if(width<760){await expect(page.locator(".kv2-sidebar")).toBeHidden();await page.locator("#kv2-studio-layers").click();}
  await expect(page.locator("#kv2-add-layer")).toBeVisible();
  await page.locator("#kv2-studio-photo").click();
  await expect(page.locator("#kv2-photo-detail")).toBeVisible();await expect(page.locator("#kv2-add-layer")).toBeHidden();
  await page.locator("#kv2-photo-detail").click();await expect(page.locator("#kv2-photo-detail-panel")).toBeVisible();
  await page.locator("#kv2-studio-mask").click();await expect(page.locator("#kv2-photo-detail-panel")).toBeHidden();await expect(page.locator("#kv2-mask-add")).toBeVisible();
  await page.locator("#kv2-studio-project").click();await expect(page.locator("#kv2-title")).toBeVisible();
  if(width<760)await page.locator("#kv2-studio-close").click();
  await stroke(page);const before=await jsonBackup(page);
  await page.locator("#kv2-studio-layout").click();await expect(page.locator("#main")).toHaveAttribute("data-studio-layout","overview");
  await expect(page.locator("#kv2-add-layer")).toBeVisible();expect((await jsonBackup(page)).layers).toEqual(before.layers);
  await page.locator("#kv2-studio-layout").click();await expect(page.locator("#main")).toHaveAttribute("data-studio-layout","compact");
  expect((await jsonBackup(page)).layers).toEqual(before.layers);
 }
});

test("10.1b compact studio keeps history and zoom fixed, palette accessible, and canvas prominent",async({page},testInfo)=>{
 for(const [width,height] of [[390,844],[834,1180],[1180,820]]){
  await page.setViewportSize({width,height});await page.goto("/kunstrommet.html",{waitUntil:"domcontentloaded"});
  await expect(page.locator("#main")).toHaveAttribute("data-studio-layout","compact");
  const info=await page.evaluate(()=>{
   const rect=q=>document.querySelector(q).getBoundingClientRect();
   const a=rect(".kv2-context-bar"),p=rect("#kv2-paper"),f=rect("#kv2-studio-view-actions"),h=rect(".kv2-heading"),n=rect(".kv2-studio-tabs"),m=rect("#main");
   return {contextHeight:a.height,paperHeight:p.height,footerBottom:f.bottom,mainBottom:m.bottom,headTop:h.top,navTop:n.top};
  });
  expect(info.contextHeight).toBeLessThanOrEqual(53);
  expect(info.paperHeight).toBeGreaterThan(200);
  expect(info.footerBottom).toBeLessThanOrEqual(info.mainBottom+2);
  if(width>=760)expect(Math.abs(info.headTop-info.navTop)).toBeLessThan(2);
  for(const id of ["kv2-undo","kv2-redo","kv2-zoom-in","kv2-zoom-out","kv2-zoom-reset"]){
   const button=page.locator("#"+id);await expect(button).toBeVisible();const box=await button.boundingBox();expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);
   expect(await button.evaluate(el=>!!el.closest("#kv2-studio-view-actions"))).toBe(true);
  }
  await expect(page.locator("#kv2-swatch-korall")).toBeHidden();
  await page.locator("#kv2-studio-brush").click();await page.locator("#kv2-swatch-korall").click();await expect(page.locator("#kv2-color")).toHaveValue("#d15c4d");
  if(width<760)await page.locator("#kv2-studio-close").click();else await page.locator("#kv2-studio-layers").click();
  await stroke(page);expect((await pixel(page)).slice(0,3)).toEqual([209,92,77]);
  await page.locator("#kv2-undo").click();await expect.poll(()=>pixel(page)).toEqual([255,255,255,255]);
  await page.locator("#kv2-redo").click();await expect.poll(()=>pixel(page)).toEqual([209,92,77,255]);
  await page.locator("#kv2-zoom-in").click();await page.locator("#kv2-zoom-reset").click();await expect(page.locator("#kv2-zoom-value")).toHaveText("100%");
  await page.screenshot({path:testInfo.outputPath("studio-"+width+"x"+height+".png"),animations:"disabled"});
  await page.locator("#kv2-studio-layout").click();await expect(page.locator("#kv2-swatch-korall")).toBeVisible();await expect(page.locator("#kv2-undo")).toBeVisible();
 }
});
