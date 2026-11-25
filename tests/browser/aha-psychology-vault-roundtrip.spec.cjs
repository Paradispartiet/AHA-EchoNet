// Synthetic-only browser verification of the opt-in AHA Psychology vault.
// Real Supabase JWT/RLS is tested separately in hosted staging.
// Never points this test at the production Supabase project.
const { test, expect } = require("@playwright/test");
const { webcrypto } = require("node:crypto");
const fs = require("node:fs");
const nodePath = require("node:path");

const ACCOUNT_A = "a1111111-1111-4111-8111-111111111111";
const ACCOUNT_B = "b2222222-2222-4222-8222-222222222222";
const FORMAT = "history-go-psychology-encrypted-backup-v1";
const PASSWORD = "synthetic browser test password only";
const SECRET_SENTINEL = "SYNTHETIC BIRD ON A PINE BRANCH";

async function makeHistoryGoCompatibleBackup() {
  // Same WebCrypto protocol as History-Go: PBKDF2-SHA256 310000/AES-GCM,
  // random salt and nonce, FORMAT as authenticated additional data.
  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const content = {
    format: "history-go-psychology-content-v1",
    workbench: [
      { id: "synthetic-1", situation: SECRET_SENTINEL,
        thoughts: "Never transmit this text to AHA", feelings: "rolig",
        follow_ups: [{ id: "follow-1", tried: "synthetic only", outcome: "test" }] }
    ],
    inner_map: { version: 4, selected_ids: ["synthetic-1"],
      links: [], layout: {}, groups: [], assignments: {} }
  };
  const material = await webcrypto.subtle.importKey(
    "raw", new TextEncoder().encode(PASSWORD), { name: "PBKDF2" },
    false, ["deriveKey"]
  );
  const key = await webcrypto.subtle.deriveKey({
    name: "PBKDF2", hash: "SHA-256", salt, iterations: 310000
  }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const encrypted = await webcrypto.subtle.encrypt({
    name: "AES-GCM", iv, additionalData: new TextEncoder().encode(FORMAT)
  }, key, new TextEncoder().encode(JSON.stringify(content)));
  const text = JSON.stringify({
    format: FORMAT, version: 1, kdf: "PBKDF2-SHA256",
    iterations: 310000, cipher: "AES-256-GCM",
    salt: Buffer.from(salt).toString("base64"),
    iv: Buffer.from(iv).toString("base64"),
    data: Buffer.from(encrypted).toString("base64")
  });
  return { text, content };
}

async function decryptSyntheticBackup(fileText) {
  const envelope = JSON.parse(fileText);
  const salt = Buffer.from(envelope.salt, "base64");
  const iv = Buffer.from(envelope.iv, "base64");
  const material = await webcrypto.subtle.importKey(
    "raw", new TextEncoder().encode(PASSWORD), { name: "PBKDF2" },
    false, ["deriveKey"]
  );
  const key = await webcrypto.subtle.deriveKey({
    name: "PBKDF2", hash: "SHA-256", salt, iterations: 310000
  }, material, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const plaintext = await webcrypto.subtle.decrypt({
    name: "AES-GCM", iv, additionalData: new TextEncoder().encode(FORMAT)
  }, key, Buffer.from(envelope.data, "base64"));
  return JSON.parse(new TextDecoder().decode(plaintext));
}

async function replaceRemoteSdkWithFake(page, enabled) {
  // Intercept the remote SDK and the feature flag. No real account or API
  // is used even when the test explicitly enables the staging UI.
  await page.route("https://cdn.jsdelivr.net/**", route => route.fulfill({
    status: 200, contentType: "text/javascript", body: ""
  }));
  if (enabled) {
    await page.route("**/js/ahaPsychologyVaultConfig.js", route => route.fulfill({
      status: 200, contentType: "text/javascript",
      body: "window.AHA_PSYCHOLOGY_ACCOUNT_VAULT_ENABLED = true;"
    }));
  }
  await page.addInitScript(({ accountA }) => {
    window.__vaultSyntheticAccount = accountA;
    window.__vaultSyntheticRows = new Map();
    window.__vaultAuthListeners = [];
    window.__vaultSwitchAccount = id => {
      window.__vaultSyntheticAccount = id;
      for (const callback of window.__vaultAuthListeners) {
        callback(id ? "SIGNED_IN" : "SIGNED_OUT", id ? { user: { id } } : null);
      }
    };
    window.__vaultSyntheticRequests = [];
    window.supabase = {
      createClient() {
        return {
          auth: {
            onAuthStateChange(callback) {
              window.__vaultAuthListeners.push(callback);
              return { data: { subscription: { unsubscribe() {} } } };
            },
            async getSession() {
              window.__vaultSyntheticRequests.push("auth.getSession");
              return {
                data: { session: { user: { id: window.__vaultSyntheticAccount } } },
                error: null
              };
            }
          },
          from(table) {
            if (table !== "aha_psychology_encrypted_backups") {
              throw Error("unexpected table: " + table);
            }
            window.__vaultSyntheticRequests.push("table:" + table);
            return {
              select(columns) {
                return {
                  eq(field, userId) {
                    if (field !== "user_id") throw Error("wrong filter");
                    return {
                      async maybeSingle() {
                        const row = window.__vaultSyntheticRows.get(userId);
                        if (userId !== window.__vaultSyntheticAccount) {
                          return { data: null, error: null };
                        }
                        if (!row) return { data: null, error: null };
                        const data = { created_at: row.created_at };
                        if (columns.includes("encrypted_file")) {
                          data.encrypted_file = row.encrypted_file;
                        }
                        return { data, error: null };
                      }
                    };
                  }
                };
              },
              async insert(row) {
                window.__vaultSyntheticRequests.push("insert");
                if (row.user_id !== window.__vaultSyntheticAccount) {
                  return { error: { code: "42501" } };
                }
                if (window.__vaultSyntheticRows.has(row.user_id)) {
                  return { error: { code: "23505" } };
                }
                window.__vaultSyntheticRows.set(row.user_id, {
                  encrypted_file: row.encrypted_file,
                  created_at: "2026-11-21T12:00:00Z"
                });
                return { error: null };
              },
              delete() {
                return {
                  eq(field, userId) {
                    return {
                      async select(columns) {
                        window.__vaultSyntheticRequests.push("delete");
                        if (field !== "user_id" || columns !== "user_id" ||
                            userId !== window.__vaultSyntheticAccount) {
                          return { data: null, error: { code: "42501" } };
                        }
                        if (window.__vaultSyntheticDeleteNoop) return { data: [], error: null };
                        const removed = window.__vaultSyntheticRows.delete(userId);
                        return { data: removed ? [{ user_id: userId }] : [], error: null };
                      }
                    };
                  }
                };
              }
            };
          }
        };
      }
    };
    // Capture the actual Blob passed to the download link, rather than
    // fetching a blob: URL (not reliable in every iPad/WebKit engine).
    const original = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => {
      window.__vaultLastDownloadedBlob = blob;
      return original(blob);
    };
  }, { accountA: ACCOUNT_A });
}

test("encrypted vault is OFF by default and performs no account access", async ({ page }) => {
  const callsToSupabase = [];
  page.on("request", request => {
    if (request.url().includes(".supabase.co")) callsToSupabase.push(request.url());
  });
  await replaceRemoteSdkWithFake(page, false);
  await page.goto("/psykologi-vault.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#aha-psych-vault-panel")).toBeHidden();
  await expect(page.locator("#aha-psych-vault-status")).toContainText("ikke aktivert");
  expect(await page.evaluate(() => window.__vaultSyntheticRequests)).toEqual([]);
  expect(callsToSupabase).toEqual([]);

  // The entry must not be visible with the default (disabled) flag.
  // A general flex rule used to defeat the HTML hidden attribute here.
  await page.goto("/psykologi.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#aha-psych-vault-entry")).toBeHidden();
  await expect(page.locator("#aha-psych-vault-pilot-entry")).toBeHidden();
  expect(callsToSupabase).toEqual([]);
});

test("shared GitHub Pages origin rejects account access even with vault flag enabled", async ({ page }) => {
  const sharedOrigin = "https://paradispartiet.github.io/AHA-EchoNet/";
  const sourceRoot = nodePath.resolve(__dirname, "../..");
  // Serve the precise current repository files at the GitHub Pages origin:
  // all HTTP requests are intercepted and no live GitHub Pages is contacted.
  await page.route(sharedOrigin + "**", async route => {
    const relative = new URL(route.request().url()).pathname.slice("/AHA-EchoNet/".length);
    if (!relative || relative.includes("..")) {
      return route.fulfill({ status: 404, body: "" });
    }
    let body;
    try { body = fs.readFileSync(nodePath.join(sourceRoot, relative)); }
    catch { return route.fulfill({ status: 404, body: "" }); }
    const contentType = relative.endsWith(".html") ? "text/html; charset=utf-8" :
      relative.endsWith(".js") ? "text/javascript; charset=utf-8" :
      relative.endsWith(".css") ? "text/css; charset=utf-8" :
      "application/octet-stream";
    return route.fulfill({ status: 200, body, contentType });
  });
  await replaceRemoteSdkWithFake(page, true);
  const realBackendRequests = [];
  page.on("request", request => {
    if (request.url().includes(".supabase.co")) realBackendRequests.push(request.url());
  });
  await page.goto(sharedOrigin + "psykologi-vault.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#aha-psych-vault-panel")).toBeHidden();
  await expect(page.locator("#aha-psych-vault-shared-origin")).toBeVisible();
  await expect(page.locator("#aha-psych-vault-status")).toContainText("sperret");
  await expect(page.locator("#aha-psych-vault-shared-origin a")).toHaveAttribute(
    "href", "https://paradispartiet.github.io/History-Go/?room=psychology"
  );
  const result = await page.evaluate(async () => {
    try { await window.AHAPsychologyEncryptedVault.status(); return "unexpected_access"; }
    catch (e) { return e.code; }
  });
  expect(result).toBe("not_activated");
  expect(await page.evaluate(() => window.__vaultSyntheticRequests)).toEqual([]);
  expect(realBackendRequests).toEqual([]);

  // The entry page must not advertise an account vault that this shared
  // GitHub Pages origin is forbidden to operate.
  await page.goto(sharedOrigin + "psykologi.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#aha-psych-vault-entry")).toBeHidden();
  await expect(page.locator("#aha-psych-vault-pilot-entry")).toBeHidden();
  expect(realBackendRequests).toEqual([]);
});

test("manual upload, account isolation, download, decrypt and delete in Chromium/iPad", async ({ page }) => {
  const callsToSupabase = [];
  page.on("request", request => {
    if (request.url().includes(".supabase.co")) callsToSupabase.push(request.url());
  });
  const backup = await makeHistoryGoCompatibleBackup();
  expect(backup.text).not.toContain(SECRET_SENTINEL);
  expect(backup.text).not.toContain(PASSWORD);

  // Exercise the real origin gate on the exact approved HTTPS origin,
  // serving only checkout files. Never contact the deployed Vercel site.
  const approvedOrigin = "https://aha-echo-net.vercel.app/";
  const sourceRoot = nodePath.resolve(__dirname, "../..");
  await page.route(approvedOrigin + "**", async route => {
    const relative = decodeURIComponent(new URL(route.request().url()).pathname).slice(1);
    const resolved = nodePath.resolve(sourceRoot, relative);
    if (!relative || !resolved.startsWith(sourceRoot + nodePath.sep)) {
      return route.fulfill({ status: 404, body: "" });
    }
    let body;
    try { body = fs.readFileSync(resolved); }
    catch { return route.fulfill({ status: 404, body: "" }); }
    const contentType = relative.endsWith(".html") ? "text/html; charset=utf-8" :
      relative.endsWith(".js") ? "text/javascript; charset=utf-8" :
      relative.endsWith(".css") ? "text/css; charset=utf-8" :
      "application/octet-stream";
    return route.fulfill({ status: 200, body, contentType });
  });
  await page.route("https://*.supabase.co/**", route => route.abort());
  await page.goto(approvedOrigin + "psykologi.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#aha-psych-vault-entry")).toBeHidden();
  await expect(page.locator("#aha-psych-vault-pilot-entry")).toBeVisible();
  await expect(page.locator("#aha-psych-vault-pilot-entry a")).toHaveAttribute("href", "psykologi-vault.html");
  await expect(page.locator("#aha-psych-vault-pilot-entry")).toContainText("syntetiske testfiler");
  await replaceRemoteSdkWithFake(page, true);
  await page.goto(approvedOrigin + "psykologi-vault.html", { waitUntil: "domcontentloaded" });
  expect(await page.evaluate(() => location.origin)).toBe(approvedOrigin.slice(0, -1));
  await expect(page.locator("#aha-psych-vault-panel")).toBeVisible();
  expect(await page.evaluate(() => window.__vaultSyntheticRequests)).toEqual([]);
  expect(await page.evaluate(() => window.__vaultSyntheticRows.size)).toBe(0);

  const overview = page.locator("#aha-psych-vault-overview");
  await expect(overview).toContainText("Ikke sjekket");
  await expect(page.locator("#aha-psych-vault-upload")).toBeHidden();
  await page.locator("#aha-psych-vault-check").click();
  await expect(page.locator("#aha-psych-vault-upload")).toBeVisible();
  await expect(overview).toContainText("Ingen kontokopi synlig");

  // Reproduce the physical iPad consent-label regression: shared input
  // styling must not consume the entire width of the label.
  const originalViewport = page.viewportSize();
  for (const width of [390, 768, 1024]) {
    await page.setViewportSize({ width, height: 1024 });
    const geometry = await page.locator("#aha-psych-vault-upload label").evaluate(label => {
      const check = label.querySelector('input[type="checkbox"]').getBoundingClientRect();
      const span = label.querySelector("span").getBoundingClientRect();
      const box = label.getBoundingClientRect();
      return { checkWidth: check.width, checkHeight: check.height,
        textWidth: span.width, labelWidth: box.width, textLeft: span.left, checkRight: check.right };
    });
    expect(geometry.checkWidth).toBe(24);
    expect(geometry.checkHeight).toBe(24);
    expect(geometry.textWidth).toBeGreaterThan(geometry.labelWidth - 50);
    expect(geometry.textWidth).toBeGreaterThan(180);
    expect(geometry.textLeft).toBeGreaterThan(geometry.checkRight);
    await page.locator("#aha-psych-vault-upload label span").click();
    await expect(page.locator('#aha-psych-vault-upload input[type="checkbox"]')).toBeChecked();
    await page.locator("#aha-psych-vault-upload label span").click();
    await expect(page.locator('#aha-psych-vault-upload input[type="checkbox"]')).not.toBeChecked();
  }
  if (originalViewport) await page.setViewportSize(originalViewport);

  const input = page.locator('#aha-psych-vault-upload input[type="file"]');
  await input.setInputFiles({
    name: "psykologirommet-syntetisk-kryptert.json",
    mimeType: "application/json",
    buffer: Buffer.from(backup.text)
  });
  await page.locator('#aha-psych-vault-upload input[type="checkbox"]').check();
  await page.locator('#aha-psych-vault-upload button[type="submit"]').click();
  await expect(page.locator("#aha-psych-vault-status")).toContainText(
    "krypterte filen er lagret"
  );
  const stored = await page.evaluate(() => {
    const values = Array.from(window.__vaultSyntheticRows.values());
    return { count: values.length, envelope: values[0]?.encrypted_file };
  });
  expect(stored.count).toBe(1);
  expect(stored.envelope).toBe(backup.text);
  expect(stored.envelope).not.toContain(SECRET_SENTINEL);
  expect(stored.envelope).not.toContain(PASSWORD);

  await expect(overview).toContainText("byte");
  await page.locator("#aha-psych-vault-check").click();
  await expect(overview).toContainText("UTC");
  await expect(overview).toContainText("Filstørrelse: ikke hentet");

  // One slot per account: refuse a duplicate rather than overwriting.
  await input.setInputFiles({
    name: "duplicate.json", mimeType: "application/json",
    buffer: Buffer.from(backup.text)
  });
  await page.locator('#aha-psych-vault-upload input[type="checkbox"]').check();
  await page.locator('#aha-psych-vault-upload button[type="submit"]').click();
  await expect(page.locator("#aha-psych-vault-status")).toContainText("allerede");
  expect(await page.evaluate(() => window.__vaultSyntheticRows.size)).toBe(1);

  // A generated link and selected file must disappear on an auth event.
  await page.locator("#aha-psych-vault-download-button").click();
  await expect(page.locator("#aha-psych-vault-download a")).toBeVisible();
  await input.setInputFiles({
    name: "pending.json", mimeType: "application/json", buffer: Buffer.from(backup.text)
  });
  await page.locator('#aha-psych-vault-upload input[type="checkbox"]').check();
  await page.evaluate(id => window.__vaultSwitchAccount(id), ACCOUNT_B);
  await expect(page.locator("#aha-psych-vault-download a")).toHaveCount(0);
  await expect(input).toHaveValue("");
  await expect(page.locator('#aha-psych-vault-upload input[type="checkbox"]')).not.toBeChecked();
  await expect(page.locator("#aha-psych-vault-status")).toContainText("Kontoen er endret");
  await expect(overview).toContainText("Ikke sjekket");

  // A second session cannot view or retrieve the first session's copy.
  await page.locator("#aha-psych-vault-check").click();
  await expect(page.locator("#aha-psych-vault-status")).toContainText("Ingen kryptert fil");
  await page.locator("#aha-psych-vault-download-button").click();
  await expect(page.locator("#aha-psych-vault-status")).toContainText("ingen kryptert");
  expect(await page.locator("#aha-psych-vault-download a").count()).toBe(0);

  await page.evaluate(id => window.__vaultSwitchAccount(id), ACCOUNT_A);
  await page.locator("#aha-psych-vault-download-button").click();
  await expect(page.locator("#aha-psych-vault-download a")).toBeVisible();
  const downloaded = await page.evaluate(async () => {
    return await window.__vaultLastDownloadedBlob.text();
  });
  expect(downloaded).toBe(backup.text);
  await expect(overview).toContainText("UTC");
  await expect(overview).toContainText("byte");
  expect(await decryptSyntheticBackup(downloaded)).toEqual(backup.content);

  // Wrong password and tampering must still be detected by AES-GCM, not AHA.
  const altered = JSON.parse(downloaded);
  altered.data = "AAAA" + altered.data.slice(4);
  await expect(decryptSyntheticBackup(JSON.stringify(altered))).rejects.toThrow();

  // A successful HTTP response with zero affected rows is not a receipt.
  await page.evaluate(() => { window.__vaultSyntheticDeleteNoop = true; });
  page.once("dialog", dialog => dialog.accept());
  await page.locator("#aha-psych-vault-delete").click();
  await expect(page.locator("#aha-psych-vault-status")).toContainText("Slettingen kunne ikke bekreftes");
  await expect(overview).toContainText("Ikke sjekket");
  expect(await page.evaluate(() => window.__vaultSyntheticRows.size)).toBe(1);
  await page.evaluate(() => { window.__vaultSyntheticDeleteNoop = false; });
  page.once("dialog", dialog => dialog.accept());
  await page.locator("#aha-psych-vault-delete").click();
  await expect(page.locator("#aha-psych-vault-status")).toContainText(
    "kontokopien er slettet og fraværet kontrollert"
  );
  expect(await page.evaluate(() => window.__vaultSyntheticRows.size)).toBe(0);
  await expect(overview).toContainText("Ingen kontokopi synlig");
  page.once("dialog", dialog => dialog.accept());
  await page.locator("#aha-psych-vault-delete").click();
  await expect(page.locator("#aha-psych-vault-status")).toContainText("Ingen sletting ble bekreftet");
  expect(await page.locator("#aha-psych-vault-download a").count()).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem("hg_psychology_workbench_v1"))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("aha_insight_chamber_v1"))).toBeNull();
  expect(callsToSupabase).toEqual([]);
});
