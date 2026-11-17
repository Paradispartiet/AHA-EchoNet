const { test, expect } = require("@playwright/test");

// Production smoke uses only fabricated, non-personal text and isolated browser
// profiles. No signed-in account, backend writes, model requests or analytics.
// Use the Vercel project-name candidate while checking the public aliases.
const AHA = "https://aha-echo-net.vercel.app";
const GH = "https://paradispartiet.github.io";
const PRIVATE_KEY = "aha_psychology_private_reflections_v1";
const CHAMBER_KEY = "aha_insight_chamber_v1";
const SYNTHETIC = "Testrefleksjon om en blå papirdrage. Dette er ikke en personlig opplysning.";

test.beforeEach(async ({ context }) => {
  // All state stays in the throwaway browser profile. Abort every write request.
  await context.route("**/*", route => {
    const method = route.request().method();
    if (method !== "GET" && method !== "HEAD") return route.abort("blockedbyclient");
    return route.continue();
  });
});

test("actual AHA Vercel: consent -> local archive -> opted-in insight -> map, list and path", async ({ page }) => {
  const response = await page.goto(AHA + "/psykologi.html", { waitUntil: "domcontentloaded" });
  expect(response?.status(), "Public AHA psychology page must load").toBe(200);
  await expect(page.getByRole("heading", { name: "Psykologirommet" })).toBeVisible();
  await expect(page.locator("#aha-psych-selected-text")).toBeEnabled();
  await expect(page.locator("#aha-psych-import-consent")).not.toBeChecked();
  expect(await page.evaluate(k => localStorage.getItem(k), PRIVATE_KEY)).toBeNull();
  expect(await page.evaluate(k => localStorage.getItem(k), CHAMBER_KEY)).toBeNull();

  await page.locator("#aha-psych-selected-text").fill(SYNTHETIC);
  await page.locator("#aha-psych-import-consent").check();
  await page.getByRole("button", { name: "Lagre privat i AHA" }).click();
  await expect(page.locator(".aha-psych-entry")).toHaveCount(1);
  expect(await page.evaluate(k => JSON.parse(localStorage.getItem(k) || "[]").length, PRIVATE_KEY)).toBe(1);
  expect(await page.evaluate(k => localStorage.getItem(k), CHAMBER_KEY)).toBeNull();

  page.once("dialog", d => d.dismiss());
  await page.getByRole("button", { name: "Bruk som AHA-innsikt" }).click();
  expect(await page.evaluate(k => localStorage.getItem(k), CHAMBER_KEY)).toBeNull();

  page.once("dialog", d => d.accept());
  await page.getByRole("button", { name: "Bruk som AHA-innsikt" }).click();
  await expect(page.getByRole("link", { name: "Åpne i Innsikter" })).toBeVisible();
  const promoted = await page.evaluate(k =>
    JSON.parse(localStorage.getItem(k) || "{}").insights?.[0], CHAMBER_KEY);
  expect(promoted?.summary).toBe(SYNTHETIC);
  expect(promoted?.status).toBe("draft");
  expect(promoted?.claim_kind).toBe("personal_reflection");
  expect(promoted?.echonet_shared).toBe(false);

  await page.getByRole("link", { name: "Åpne i Innsikter" }).click();
  await expect(page.locator("#insight-" + promoted.id)).toBeVisible();

  await page.goto(AHA + "/mindmap.html", { waitUntil: "domcontentloaded" });
  await expect.poll(() => page.evaluate(id =>
    Boolean(window.AHAMindmap?.collectGraphData?.().nodes?.some(node =>
      node.source === "aha_insights" && node.refId === id)), promoted.id)).toBe(true);

  await page.goto(AHA + "/lists.html", { waitUntil: "domcontentloaded" });
  const collection = await page.evaluate(id => {
    const list = window.AHALists?.createList?.({ title: "Syntetisk testliste" });
    if (!list) return null;
    const result = window.AHALists.addItemToList(list.id, { source: "aha_insights", refId: id });
    return { id: list.id, added: result?.ok };
  }, promoted.id);
  expect(collection?.added).toBe(true);

  await page.goto(AHA + "/paths.html", { waitUntil: "domcontentloaded" });
  const route = await page.evaluate(id => {
    const path = window.AHAPaths?.createPath?.({ title: "Syntetisk teststi", type: "learning" });
    if (!path) return null;
    const result = window.AHAPaths.addStepToPath(path.id, { source: "aha_insights", refId: id });
    const stored = window.AHAPaths.loadPaths().find(item => item.id === path.id);
    return { id: path.id, added: result?.ok, steps: stored?.steps?.length,
      localOnly: stored?.local_only, shared: stored?.echonet_shared };
  }, promoted.id);
  expect(route?.added).toBe(true);
  expect(route?.steps).toBe(1);
  expect(route?.localOnly).toBe(true);
  expect(route?.shared).toBe(false);
  expect(await page.evaluate(k => JSON.parse(localStorage.getItem(k) || "[]").length, PRIVATE_KEY)).toBe(1);
});

test("actual GitHub Pages refuses to store a private psychology archive on the shared origin", async ({ page }) => {
  const response = await page.goto(GH + "/AHA-EchoNet/psykologi.html", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page.locator("#aha-psych-selected-text")).toBeDisabled();
  await expect(page.getByRole("link", { name: "Åpne Psykologirommet på AHAs separate adresse" }))
    .toHaveAttribute("href", AHA + "/psykologi.html");
  expect(await page.evaluate(k => localStorage.getItem(k), PRIVATE_KEY)).toBeNull();
});

test("actual Vercel popup accepts one selected text from trusted History-Go origin", async ({ context, page }) => {
  const senderUrl = GH + "/History-Go/test-psychology-local-only-opener.html";
  const html = `<!doctype html><html lang="no"><meta charset="utf-8">
    <title>Syntetisk testavsender</title><button id="send">Send</button><script>
    let recipient = null;
    window.addEventListener("message", event => {
      if (!recipient || event.source !== recipient || event.origin !== "${AHA}"
        || event.data?.type !== "aha.psychology.ready.v1") return;
      recipient.postMessage({
        type: "historygo.psychology.selection.v1",
        schema_version: "aha_psychology_selection_v1",
        source_app: "historygo",
        text: ${JSON.stringify(SYNTHETIC)}
      }, "${AHA}");
    });
    document.getElementById("send").addEventListener("click", () => {
      recipient = window.open("${AHA}/psykologi.html", "_blank");
    });
    <\/script></html>`;
  await context.route(senderUrl, route => route.fulfill({
    status: 200, contentType: "text/html; charset=utf-8", body: html
  }));
  await page.goto(senderUrl);
  const pop = context.waitForEvent("page");
  await page.locator("#send").click();
  const target = await pop;
  await target.waitForLoadState("domcontentloaded");
  await expect(target.locator("#aha-psych-selected-text")).toHaveValue(SYNTHETIC);
  await expect(target.locator("#aha-psych-import-consent")).not.toBeChecked();
  expect(await target.evaluate(k => localStorage.getItem(k), PRIVATE_KEY)).toBeNull();
});
