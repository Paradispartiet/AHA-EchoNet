const { test, expect } = require("@playwright/test");
const fs = require("node:fs");

const AHA_ORIGIN = "https://aha-echo-net.vercel.app";
const HISTORY_GO_ORIGIN = "https://paradispartiet.github.io";
const FAKE_ORIGIN = "https://untrusted.example";
const AHA_FILE = fs.readFileSync("psykologi.html", "utf8");
const AHA_BRIDGE = fs.readFileSync("js/ahaPsychologyRoomBridge.js", "utf8");
const STORAGE_KEY = "aha_psychology_private_reflections_v1";

function senderHtml(text) {
  return `<!doctype html><html lang="no"><meta charset="utf-8">
    <title>Test History GO sender</title>
    <button id="send">Del valgt tekst</button>
    <script>
    const message = ${JSON.stringify(text)};
    let recipient = null;
    window.addEventListener("message", event => {
      if (event.source !== recipient || event.origin !== ${JSON.stringify(AHA_ORIGIN)}
          || event.data?.type !== "aha.psychology.ready.v1") return;
      recipient.postMessage({
        type: "historygo.psychology.selection.v1",
        schema_version: "aha_psychology_selection_v1",
        source_app: "historygo",
        text: message
      }, ${JSON.stringify(AHA_ORIGIN)});
    });
    document.getElementById("send").addEventListener("click", () => {
      recipient = window.open(${JSON.stringify(AHA_ORIGIN + "/psykologi.html")}, "_blank");
    });
    </script></html>`;
}

async function registerOriginStubs(context, { senderOrigin = HISTORY_GO_ORIGIN, text = "En valgt tanke" } = {}) {
  await context.route(AHA_ORIGIN + "/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/psykologi.html") {
      return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: AHA_FILE });
    }
    if (path === "/js/ahaPsychologyRoomBridge.js") {
      return route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body: AHA_BRIDGE });
    }
    if (path.endsWith(".js")) {
      return route.fulfill({ status: 200, contentType: "text/javascript", body: "" });
    }
    if (path.endsWith(".css")) {
      return route.fulfill({ status: 200, contentType: "text/css", body: "" });
    }
    return route.fulfill({ status: 404, body: "" });
  });
  await context.route(senderOrigin + "/**", route => route.fulfill({
    status: 200, contentType: "text/html; charset=utf-8", body: senderHtml(text)
  }));
}

async function openRecipientFromSender(context, sender) {
  const popupPromise = context.waitForEvent("page");
  await sender.locator("#send").click();
  const recipient = await popupPromise;
  await recipient.waitForLoadState("domcontentloaded");
  return recipient;
}

test("cross-origin private preview requires AHA consent and is removable", async ({ context, page }) => {
  const selectedText = "Jeg vil begynne med en liten handling neste gang.";
  await registerOriginStubs(context, { text: selectedText });
  await page.goto(HISTORY_GO_ORIGIN + "/History-Go/psychology-sender-test.html");
  const recipient = await openRecipientFromSender(context, page);
  const selected = recipient.locator("#aha-psych-selected-text");
  await expect(selected).toHaveValue(selectedText);
  await expect(recipient.locator("#aha-psych-import-consent")).not.toBeChecked();
  expect(await recipient.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull();

  // Ingen skjult lagring ved mottak eller forsøk uten AHA-samtykke.
  await recipient.getByRole("button", { name: "Lagre privat i AHA" }).click();
  expect(await recipient.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull();

  await recipient.locator("#aha-psych-import-consent").check();
  await recipient.getByRole("button", { name: "Lagre privat i AHA" }).click();
  await expect(recipient.locator(".aha-psych-entry")).toHaveCount(1);
  await expect(recipient.locator(".aha-psych-entry p")).toHaveText(selectedText);
  const stored = await recipient.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]"), STORAGE_KEY);
  expect(stored).toHaveLength(1);
  expect(stored[0].text).toBe(selectedText);
  expect(stored[0].visibility).toBe("local_private");
  await recipient.reload();
  await expect(recipient.locator(".aha-psych-entry")).toHaveCount(1);
  const chamberKey = "aha_insight_chamber_v1";
  expect(await recipient.evaluate(key => localStorage.getItem(key), chamberKey)).toBeNull();

  recipient.once("dialog", dialog => dialog.dismiss());
  await recipient.getByRole("button", { name: "Bruk som AHA-innsikt" }).click();
  expect(await recipient.evaluate(key => localStorage.getItem(key), chamberKey)).toBeNull();

  recipient.once("dialog", dialog => dialog.accept());
  await recipient.getByRole("button", { name: "Bruk som AHA-innsikt" }).click();
  const chamber = await recipient.evaluate(key => JSON.parse(localStorage.getItem(key) || "{}"), chamberKey);
  expect(chamber.insights).toHaveLength(1);
  expect(chamber.insights[0].summary).toBe(selectedText);
  expect(chamber.insights[0].meta.manual_promotion).toBe(true);
  expect(chamber.insights[0].claim_kind).toBe("personal_reflection");
  await expect(recipient.getByRole("link", { name: "Åpne i Innsikter" })).toHaveAttribute(
    "href", "insights.html#insight-" + encodeURIComponent(chamber.insights[0].id)
  );

  recipient.once("dialog", dialog => dialog.accept());
  await recipient.getByRole("button", { name: "Fjern AHA-kopien" }).click();
  expect(await recipient.evaluate(key => JSON.parse(localStorage.getItem(key) || "{}").insights.length, chamberKey)).toBe(0);
  await expect(recipient.locator(".aha-psych-entry")).toHaveCount(1);

  recipient.once("dialog", dialog => dialog.accept());
  await recipient.getByRole("button", { name: "Slett alle fra AHA" }).click();
  await expect(recipient.locator(".aha-psych-entry")).toHaveCount(0);
  expect(await recipient.evaluate((key) => JSON.parse(localStorage.getItem(key) || "[]"), STORAGE_KEY)).toEqual([]);
});

test("a different opener origin cannot provide a supposedly trusted text", async ({ context, page }) => {
  await registerOriginStubs(context, {
    senderOrigin: FAKE_ORIGIN, text: "En fremmed avsender skal avvises."
  });
  await page.goto(FAKE_ORIGIN + "/malicious-opener.html");
  const recipient = await openRecipientFromSender(context, page);
  await expect(recipient.locator("#aha-psych-selected-text")).toHaveValue("");
  expect(await recipient.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBeNull();
});

test("GitHub Pages shared origin refuses private psychology storage", async ({ context, page }) => {
  await context.route(HISTORY_GO_ORIGIN + "/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/AHA-EchoNet/psykologi.html") {
      return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: AHA_FILE });
    }
    if (path === "/AHA-EchoNet/js/ahaPsychologyRoomBridge.js") {
      return route.fulfill({ status: 200, contentType: "text/javascript; charset=utf-8", body: AHA_BRIDGE });
    }
    if (path.endsWith(".js")) return route.fulfill({ status: 200, contentType: "text/javascript", body: "" });
    if (path.endsWith(".css")) return route.fulfill({ status: 200, contentType: "text/css", body: "" });
    return route.fulfill({ status: 404, body: "" });
  });
  await page.goto(HISTORY_GO_ORIGIN + "/AHA-EchoNet/psykologi.html");
  await expect(page.locator("#aha-psych-selected-text")).toBeDisabled();
  await expect(page.locator("#aha-psych-saved-list")).toContainText("Dette private arkivet åpnes ikke");
  await expect(page.getByRole("link", { name: "Åpne Psykologirommet i History-Go" }))
    .toHaveAttribute("href", HISTORY_GO_ORIGIN + "/History-Go/?room=psychology");
  await expect(page.locator("#aha-psych-import-status")).toContainText("Separat AHA-adresse er ikke bekreftet");
  expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("aha_insight_chamber_v1"))).toBeNull();
});
