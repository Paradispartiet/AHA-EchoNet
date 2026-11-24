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
    window.__vaultSyntheticRequests = [];
    window.supabase = {
      createClient() {
        return {
          auth: {
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
                  async eq(field, userId) {
                    window.__vaultSyntheticRequests.push("delete");
                    if (field !== "user_id" ||
                        userId !== window.__vaultSyntheticAccount) {
                      return { error: { code: "42501" } };
                    }
                    window.__vaultSyntheticRows.delete(userId);
                    return { error: null };
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

  await replaceRemoteSdkWithFake(page, true);
  await page.goto("/psykologi-vault.html", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#aha-psych-vault-panel")).toBeVisible();
  expect(await page.evaluate(() => window.__vaultSyntheticRequests)).toEqual([]);
  expect(await page.evaluate(() => window.__vaultSyntheticRows.size)).toBe(0);

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

  // One slot per account: refuse a duplicate rather than overwriting.
  await input.setInputFiles({
    name: "duplicate.json", mimeType: "application/json",
    buffer: Buffer.from(backup.text)
  });
  await page.locator('#aha-psych-vault-upload input[type="checkbox"]').check();
  await page.locator('#aha-psych-vault-upload button[type="submit"]').click();
  await expect(page.locator("#aha-psych-vault-status")).toContainText("allerede");
  expect(await page.evaluate(() => window.__vaultSyntheticRows.size)).toBe(1);

  // A second session cannot view or retrieve the first session's copy.
  await page.evaluate(id => { window.__vaultSyntheticAccount = id; }, ACCOUNT_B);
  await page.locator("#aha-psych-vault-check").click();
  await expect(page.locator("#aha-psych-vault-status")).toContainText("Ingen kryptert fil");
  await page.locator("#aha-psych-vault-download-button").click();
  await expect(page.locator("#aha-psych-vault-status")).toContainText("ingen kryptert");
  expect(await page.locator("#aha-psych-vault-download a").count()).toBe(0);

  await page.evaluate(id => { window.__vaultSyntheticAccount = id; }, ACCOUNT_A);
  await page.locator("#aha-psych-vault-download-button").click();
  await expect(page.locator("#aha-psych-vault-download a")).toBeVisible();
  const downloaded = await page.evaluate(async () => {
    return await window.__vaultLastDownloadedBlob.text();
  });
  expect(downloaded).toBe(backup.text);
  expect(await decryptSyntheticBackup(downloaded)).toEqual(backup.content);

  // Wrong password and tampering must still be detected by AES-GCM, not AHA.
  const altered = JSON.parse(downloaded);
  altered.data = "AAAA" + altered.data.slice(4);
  await expect(decryptSyntheticBackup(JSON.stringify(altered))).rejects.toThrow();

  page.once("dialog", dialog => dialog.accept());
  await page.locator("#aha-psych-vault-delete").click();
  await expect(page.locator("#aha-psych-vault-status")).toContainText(
    "kontokopien er slettet"
  );
  expect(await page.evaluate(() => window.__vaultSyntheticRows.size)).toBe(0);
  expect(await page.locator("#aha-psych-vault-download a").count()).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem("hg_psychology_workbench_v1"))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("aha_insight_chamber_v1"))).toBeNull();
  expect(callsToSupabase).toEqual([]);
});
