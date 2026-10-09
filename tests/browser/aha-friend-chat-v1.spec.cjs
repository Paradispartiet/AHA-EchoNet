const { test, expect } = require("@playwright/test");

test("AHA friend chat: authenticated user selects friend and sends without AI", async ({ page }) => {
  const me = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
  const peer = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
  const request = {
    id: "cccccccc-cccc-4ccc-cccc-cccccccccccc",
    requester_id: me, recipient_id: peer, status: "accepted",
    created_at: "2026-10-09T11:00:00Z"
  };

  await page.route(/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js/, (route) =>
    route.fulfill({ status: 200, contentType: "text/javascript", body: "" })
  );
  await page.route(/\/js\/ahaConfig\.js$/, (route) =>
    route.fulfill({ status: 200, contentType: "text/javascript", body: "" })
  );
  await page.route(/\/js\/ahaDb\.js$/, (route) => {
    const script = [
      "window.__messages = [];",
      "window.__me = " + JSON.stringify(me) + ";",
      "window.__peer = " + JSON.stringify(peer) + ";",
      "window.__request = " + JSON.stringify(request) + ";",
      "window.AHADb = {getClient: () => ({",
      " from: (table) => {",
      "  const q = {",
      "   select() {return q}, eq() {return q}, or() {return q}, order() {return q},",
      "   limit() {",
      "    if (table === 'aha_friend_requests') return Promise.resolve({data:[window.__request],error:null});",
      "    if (table === 'aha_friend_messages') return Promise.resolve({data:window.__messages.slice(),error:null});",
      "    return Promise.resolve({data:[],error:null});",
      "   },",
      "   in() {return Promise.resolve({data:[{profile_id:window.__peer,handle:'venn_bob'}],error:null})},",
      "   maybeSingle() {return Promise.resolve({data:{handle:'venn_alice'},error:null})},",
      "   insert(row) {",
      "    if (table === 'aha_friend_messages') window.__messages.push({",
      "     id: 'm' + window.__messages.length, sender_id:row.sender_id, body:row.body, created_at:new Date().toISOString()",
      "    });",
      "    return Promise.resolve({data:row,error:null});",
      "   }",
      "  }; return q;",
      " },",
      " channel() {return {on() {return this}, subscribe() {return this}}},",
      " removeChannel() {},",
      " auth: {onAuthStateChange() {}}",
      "})};"
    ].join("\n");
    return route.fulfill({ status: 200, contentType: "text/javascript", body: script });
  });
  await page.route(/\/js\/ahaAuth\.js$/, (route) => {
    const body = "window.AHAAuth = {getUser: async () => ({id: " + JSON.stringify(me)
      + "}), ensureProfile: async () => ({ok:true}), signInWithEmail: async () => ({ok:true})};";
    return route.fulfill({ status: 200, contentType: "text/javascript", body });
  });

  await page.goto("/friend-chat.html");
  await expect(page.getByRole("heading", { name: "Snakk med en venn" })).toBeVisible();
  await expect(page.locator("#friend-auth-panel")).toBeHidden();
  await expect(page.locator("#friend-handle")).toHaveValue("venn_alice");
  await expect(page.locator("#friend-list")).toContainText("venn_bob");
  await expect(page.locator("#friend-message")).toBeDisabled();
  await page.locator("#friend-list button").click();
  await expect(page.locator("#friend-thread-title")).toHaveText("@venn_bob");
  await page.locator("#friend-message").fill("Hei Bob! Dette er privat.");
  await page.locator("#friend-send").click();
  await expect(page.locator("#friend-status")).toHaveText("Melding sendt.");
  await expect(page.locator("#friend-messages")).toContainText("Hei Bob! Dette er privat.");
  await expect.poll(() => page.evaluate(() => window.__messages.length)).toBe(1);
  await expect(page.locator(".friend-bubble.is-mine")).toHaveCount(1);
  await expect(page.locator("script[src='js/ahaChat.js']")).toHaveCount(0);
});