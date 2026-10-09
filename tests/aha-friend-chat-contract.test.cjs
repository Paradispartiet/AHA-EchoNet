const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const source = fs.readFileSync("js/ahaFriendChat.js", "utf8");
const page = fs.readFileSync("friend-chat.html", "utf8");
const aiPage = fs.readFileSync("chat.html", "utf8");
const schema = fs.readFileSync("supabase/friend-chat.sql", "utf8");

const w = { document: { readyState: "loading", addEventListener() {} } };
w.window = w;
vm.runInNewContext(source, w, { filename: "js/ahaFriendChat.js" });

assert.ok(w.AHAFriendChat);
assert.equal(w.AHAFriendChat.normalizeHandle(" @Alice_123 "), "alice_123");
assert.equal(w.AHAFriendChat.normalizeHandle("hi"), "");
assert.equal(w.AHAFriendChat.normalizeHandle("some-email@example.org"), "");
assert.equal(w.AHAFriendChat.normalizeHandle("__abc__"), "__abc__");
assert.equal(w.AHAFriendChat.normalizeHandle("a".repeat(25)), "");
assert.equal(w.AHAFriendChat.cleanMessage(" Hi \n "), "Hi");
assert.equal(w.AHAFriendChat.cleanMessage("   "), "");
assert.equal(w.AHAFriendChat.cleanMessage("a".repeat(2001)), "");
assert.equal(w.AHAFriendChat.shortId("1234567890"), "12345678");

assert.match(page, /Snakk med en venn/);
assert.match(page, /href="chat.html"/);
assert.match(fs.readFileSync("js/ahaGlobalNav.js", "utf8"), /label: "Venner", href: "friend-chat.html"/);
assert.match(aiPage, /js\/ahaGlobalNav\.js/);
assert.match(page, /id="friend-auth-form"/);
assert.match(page, /id="friend-invite-form"/);
assert.match(page, /id="friend-message-form"/);
assert.match(page, /id="friend-messages"/);
assert.match(page, /js\/ahaConfig\.js/);
assert.match(page, /js\/ahaDb\.js/);
assert.match(page, /js\/ahaAuth\.js/);
assert.match(page, /js\/ahaFriendChat\.js/);

assert.match(source, /\.from\("aha_friend_handles"\)/);
assert.match(source, /\.from\("aha_friend_requests"\)/);
assert.match(source, /\.from\("aha_friend_messages"\)/);
assert.match(source, /\.from\("aha_friend_blocks"\)/);
assert.match(source, /id="friend-block"/);
assert.match(source, /id="friend-block-list"/);
assert.match(source, /status: nextStatus/);
assert.match(source, /request_id: chosen\.id, sender_id: user\.id, body/);
assert.match(source, /createTextNode|\.textContent = String\(text\)/);
assert.doesNotMatch(source, /innerHTML|AHAIngest|metaInsights|insightsChamber|AHAChatAgentRuntime/);
assert.doesNotMatch(page, /js\/ahaChat\.js|js\/ahaIngest\.js|js\/insightsChamber\.js/);

for (const table of ["aha_friend_handles", "aha_friend_requests", "aha_friend_messages"]) {
  assert.match(schema, new RegExp("alter table public\\." + table + " enable row level security"));
  assert.match(schema, new RegExp("revoke all on public\\." + table));
}
assert.match(schema, /create unique index if not exists aha_friend_requests_pair_unique/);
assert.match(schema, /least\(requester_id, recipient_id\)/);
assert.match(schema, /greatest\(requester_id, recipient_id\)/);
assert.match(schema, /for insert to authenticated\s+with check \(\s*requester_id = \(select auth\.uid\(\)\)/);
assert.match(schema, /for update to authenticated\s+using \(recipient_id = \(select auth\.uid\(\)\) and status = 'pending'\)/);
assert.match(schema, /grant update\(status\) on public\.aha_friend_requests to authenticated/);
assert.match(schema, /grant insert\(request_id, sender_id, body\) on public\.aha_friend_messages to authenticated/);
assert.match(schema, /for insert to authenticated with check \(\s*sender_id = \(select auth\.uid\(\)\)/);
assert.match(schema, /f\.status = 'accepted'/);
assert.match(schema, /aha_friend_private\.pair_blocked/);
assert.match(schema, /aha_friend_private\.limit_daily_invites/);
assert.match(schema, /invite_count < 12/);
assert.match(schema, /create policy aha_friend_blocks_insert_own/);
assert.match(schema, /and not aha_friend_private\.pair_blocked/);
assert.match(schema, /and exists \(select 1 from public\.aha_friend_handles h where h\.profile_id = recipient_id\)/);
assert.match(schema, /f\.requester_id = \(select auth\.uid\(\)\) or f\.recipient_id = \(select auth\.uid\(\)\)/);
assert.match(schema, /on delete cascade/);
assert.doesNotMatch(schema, /service_role|grant .* to anon|using \(true\).*aha_friend_messages/i);
console.log("aha-friend-chat-contract passed");
