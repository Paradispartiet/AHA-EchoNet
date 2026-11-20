// Guard the versioned AHA embedding SQL source against search_path regressions.
// A code contract only: it never applies SQL to the hosted Supabase database.
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");

const source = fs.readFileSync("supabase/embeddings.sql", "utf8");
const marker = "create or replace function public.aha_match_insights(";
assert.equal(source.split(marker).length - 1, 1, "Keep exactly one RPC declaration");
const rpc = source.slice(source.indexOf(marker));

assert.match(rpc, /query_embedding public\.vector\(1024\)/i, "Use explicit pgvector type schema");
assert.match(rpc, /language sql\s+stable\s+security invoker[\s\S]*?set search_path = ''\s+as \$\$/i,
  "Preserve RLS invoker mode and pin an empty runtime search path");
assert.match(rpc, /from public\.aha_insight_embeddings e/i);
assert.match(rpc, /where e\.profile_id = auth\.uid\(\)/i);
assert.equal((rpc.match(/OPERATOR\(public\.<=>\)/g) || []).length, 3,
  "Cosine projection, threshold and sorting must all use the qualified vector operator");
assert.doesNotMatch(rpc, /security definer/i, "Never bypass owner RLS");
assert.match(rpc, /limit greatest\(match_count, 1\)/i);
assert.match(rpc, /\$\$;/, "Do not break the SQL function body");
console.log("AHA embedding RPC fixed search-path source contract: PASS");
