const assert = require("node:assert/strict");
const fs = require("node:fs");
const migration = fs.readFileSync("supabase/social-meet-direct-chat.sql","utf8");
const runtime = fs.readFileSync("js/ahaFriendChat.js","utf8");
const page = fs.readFileSync("friend-chat.html","utf8");
const css = fs.readFileSync("css/aha-friend-chat.css","utf8");
const checks = [
  [/add column if not exists source text not null default 'friend'/, "existing friends unchanged"],
  [/source in \('friend','social_meet'\)/, "distinct relationship types"],
  [/drop index if exists public.aha_friend_requests_pair_unique/, "migrate pair index"],
  [/aha_friend_requests_pair_source_unique/, "a pending friendship remains pending even after meeting"],
  [/create table if not exists aha_friend_private.meet_links/, "private verified invite link"],
  [/on delete cascade/, "no orphaned message access"],
  [/auth\.uid\(\) in \(first_user, second_user\)/, "auth-owned pair"],
  [/auth\.uid\(\) in \(r\.requester_id,r\.recipient_id\)/, "participant-bound checks"],
  [/hg\.status = 'accepted' and hg\.expires_at > now\(\)/, "unexpired accept"],
  [/hg\.status = 'completed'/, "completed relationship continuity"],
  [/hg_social_meet_blocks/, "cross-app block suppression"],
  [/hg_social_meet_profile_restrictions/, "cross-app moderation suppression"],
  [/aha_friend_private\.pair_blocked/, "AHA block suppression"],
  [/meet_thread_allowed\(id\)/, "contact read authorization"],
  [/meet_thread_allowed\(f\.id\)/, "message authorization"],
  [/source = 'friend' and recipient_id/, "only friend invite can be accepted as friendship"],
  [/source = 'friend'/, "clients cannot self-create meet contact"],
  [/auth\.uid\(\)/, "canonical verified auth identity"],
  [/create or replace function public\.aha_open_social_meet_chat\(meet_invite_id uuid\)/, "trusted RPC"],
  [/revoke all on function public\.aha_open_social_meet_chat\(uuid\) from public, anon/, "no anonymous RPC"],
  [/grant execute on function public\.aha_open_social_meet_chat\(uuid\) to authenticated/, "authenticated RPC"],
  [/set search_path = pg_catalog, public, aha_friend_private/, "fixed trusted search path"]
];
for(const [pattern,why] of checks) assert.match(migration,pattern,why);
assert.match(runtime,/\.rpc\("aha_open_social_meet_chat"/);
assert.match(runtime,/\.select\("id,requester_id,recipient_id,status,source,created_at"\)/);
assert.match(runtime,/Kontakter fra Social Meet|friend-meet-list/);
assert.match(runtime,/Bli venner/);
assert.match(runtime,/Venneforespørsel sendt\. Vennskap opprettes først etter aksept/);
assert.match(page,/id="friend-meet-list"/);
assert.match(css,/aha-friend-chat-embedded/);
assert.doesNotMatch(page,/js\/ahaChat\.js|js\/ahaIngest\.js/);
console.log("AHA Social Meet direct chat contract OK");