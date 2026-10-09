const { test, expect } = require("@playwright/test");

test("local demo seed is explicit, idempotent and reversible without deleting user data", async ({ page }) => {
  await page.goto("/demo-seed.html", { waitUntil: "domcontentloaded" });

  await expect(page.getByRole("heading", { name: "Lokale AHA-eksempeldata" })).toBeVisible();
  await expect(page.locator("#aha-demo-seed-status")).toContainText("Ingen AHA-eksempeldata");

  await page.evaluate(() => {
    localStorage.setItem("aha_notes_v1", JSON.stringify([{
      id: "browser_user_note_keep",
      title: "Mitt eksisterende notat",
      text: "Skal bevares"
    }]));
    localStorage.setItem("aha_chat_current_session_v1", "browser_user_session_keep");
  });

  await page.getByRole("button", { name: "Legg inn eksempeldata" }).click();
  await expect(page.locator("#aha-demo-seed-status")).toContainText("Eksempeldata er lagt inn lokalt");

  let state = await page.evaluate(() => ({
    notes: JSON.parse(localStorage.getItem("aha_notes_v1") || "[]"),
    sessions: JSON.parse(localStorage.getItem("aha_chat_sessions_v1") || "[]"),
    currentSession: localStorage.getItem("aha_chat_current_session_v1"),
    inspection: window.AHALocalDemoSeed.inspectSeed()
  }));

  expect(state.notes.some((item) => item.id === "browser_user_note_keep")).toBe(true);
  expect(state.notes.filter((item) => item.id === "demo_seed_note_byrom")).toHaveLength(1);
  expect(state.sessions.filter((item) => item.id === "demo_seed_chat_session")).toHaveLength(1);
  expect(state.currentSession).toBe("browser_user_session_keep");
  expect(state.inspection.count).toBe(9);

  await page.getByRole("button", { name: "Legg inn eksempeldata" }).click();
  state = await page.evaluate(() => ({
    notes: JSON.parse(localStorage.getItem("aha_notes_v1") || "[]"),
    sessions: JSON.parse(localStorage.getItem("aha_chat_sessions_v1") || "[]")
  }));
  expect(state.notes.filter((item) => item.id === "demo_seed_note_byrom")).toHaveLength(1);
  expect(state.sessions.filter((item) => item.id === "demo_seed_chat_session")).toHaveLength(1);

  await page.getByRole("button", { name: "Fjern eksempeldata" }).click();
  await expect(page.locator("#aha-demo-seed-status")).toContainText("Ingen AHA-eksempeldata");

  state = await page.evaluate(() => ({
    notes: JSON.parse(localStorage.getItem("aha_notes_v1") || "[]"),
    sessions: JSON.parse(localStorage.getItem("aha_chat_sessions_v1") || "[]"),
    currentSession: localStorage.getItem("aha_chat_current_session_v1"),
    seedState: localStorage.getItem("aha_local_demo_seed_state_v1")
  }));

  expect(state.notes.map((item) => item.id)).toEqual(["browser_user_note_keep"]);
  expect(state.sessions.some((item) => item.id === "demo_seed_chat_session")).toBe(false);
  expect(state.currentSession).toBe("browser_user_session_keep");
  expect(state.seedState).toBeNull();

  const overflow = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 2);
});
