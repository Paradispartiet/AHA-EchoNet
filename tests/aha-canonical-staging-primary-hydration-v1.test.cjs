const assert = require("node:assert/strict");
const fs = require("node:fs");

const HYDRATOR = "js/ahaCanonicalStagingSourceHydrator.js";
const LOCAL_IMPORT = "js/ahaLocalAccountImport.js";

for (const file of [HYDRATOR, LOCAL_IMPORT]) assert.equal(fs.existsSync(file), true, `${file} mangler`);

const source = fs.readFileSync(HYDRATOR, "utf8");
assert.match(source, /aha_source_events/);
assert.match(source, /profile_id/);
assert.match(source, /aha_notes/);
assert.match(source, /aha_gallery/);
assert.match(source, /writesPrimaryDatabase:\s*false/);
assert.match(source, /executesOnLoad:\s*false/);
assert.doesNotMatch(source, /onAuthStateChange|SIGNED_IN|TOKEN_REFRESHED/);
assert.doesNotMatch(source, /\bsetInterval\s*\(|\bsetTimeout\s*\(/);
assert.doesNotMatch(source, /\.insert\s*\(|\.upsert\s*\(|\.update\s*\(|\.delete\s*\(/);

const hydrator = require(`../${HYDRATOR}`);
const localImport = require(`../${LOCAL_IMPORT}`);

function makeStorage(entries = {}) {
  const values = new Map(Object.entries(entries).map(([key, value]) => [key, String(value)]));
  return {
    getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
    dump(key) { return values.has(String(key)) ? values.get(String(key)) : null; }
  };
}

function makeClient(rows, calls) {
  return {
    from(table) {
      calls.push(["from", table]);
      const query = {
        select(columns) { calls.push(["select", columns]); return query; },
        eq(column, value) { calls.push(["eq", column, value]); return query; },
        order(column, options) { calls.push(["order", column, options]); return query; },
        async range(from, to) {
          calls.push(["range", from, to]);
          return { data: rows.slice(from, to + 1), error: null };
        }
      };
      return query;
    }
  };
}

async function run() {
  const status = hydrator.getStatus();
  assert.equal(status.sourceTable, "aha_source_events");
  assert.equal(status.primaryReadOnly, true);
  assert.equal(status.writesPrimaryDatabase, false);
  assert.equal(status.executesOnLoad, false);
  assert.equal(status.loginTriggersHydration, false);
  assert.equal(status.authReadyTriggersHydration, false);

  const storage = makeStorage({
    aha_chat_sessions_v1: JSON.stringify([{ id: "conversation-local", title: "Local conversation", messages: [] }]),
    aha_source_events_v1: JSON.stringify([
      { id: "shared-event", source_type: "chat", source_app: "aha_chat", content_type: "text", text: "LOCAL_WINS", created_at: "2026-08-17T07:00:00.000Z" },
      { id: "local-only", source_type: "chat", source_app: "aha_chat", content_type: "text", text: "LOCAL_ONLY", created_at: "2026-08-17T07:01:00.000Z" }
    ]),
    aha_insight_chamber_v1: JSON.stringify({ insights: [] }),
    aha_concept_lists_v1: JSON.stringify([]),
    aha_paths_v1: JSON.stringify([]),
    aha_articles_v1: JSON.stringify([]),
    aha_notes_v1: JSON.stringify([{ id: "PRIVATE_NOTE_MUST_NOT_ENTER_CANONICAL_SNAPSHOT" }])
  });
  const originalLocalSources = storage.dump("aha_source_events_v1");

  const primaryRows = [
    { id: "shared-event", source_type: "chat", source_app: "aha_chat", content_type: "text", text: "REMOTE_MUST_LOSE", created_at: "2026-08-16T10:00:00.000Z", tags: [], meta: {} },
    { id: "remote-chat", source_type: "chat", source_app: "aha_chat", content_type: "text", text: "REMOTE_CHAT", created_at: "2026-08-16T10:01:00.000Z", tags: [], meta: {} },
    { id: "remote-agent", source_type: "aha_agent", source_app: "aha_chat", content_type: "text", text: "REMOTE_AGENT", created_at: "2026-08-16T10:02:00.000Z", tags: [], meta: {} },
    { id: "remote-note", source_type: "note", source_app: "aha_notes", content_type: "text", text: "REMOTE_NOTE_MUST_BE_EXCLUDED", created_at: "2026-08-16T10:03:00.000Z" },
    { id: "remote-gallery", source_type: "gallery", source_app: "aha_gallery", content_type: "image", text: "REMOTE_GALLERY_MUST_BE_EXCLUDED", created_at: "2026-08-16T10:04:00.000Z" }
  ];
  const calls = [];
  const hydrated = await hydrator.hydrateStorage({
    client: makeClient(primaryRows, calls),
    session: { access_token: "TEST_TOKEN", user: { id: "user-123" } },
    storage,
    localImport,
    pageSize: 2
  });

  assert.deepEqual(hydrated.stats, {
    fetched: 5,
    included: 3,
    excluded: 2,
    localSourceEvents: 2,
    mergedSourceEvents: 4
  });
  assert.ok(calls.some((call) => call[0] === "from" && call[1] === "aha_source_events"));
  assert.ok(calls.some((call) => call[0] === "eq" && call[1] === "profile_id" && call[2] === "user-123"));
  assert.deepEqual(calls.filter((call) => call[0] === "range").map((call) => call.slice(1)), [[0, 1], [2, 3], [4, 5]]);

  const sourceEvents = JSON.parse(hydrated.storage.getItem("aha_source_events_v1"));
  assert.deepEqual(sourceEvents.map((item) => item.id).sort(), ["local-only", "remote-agent", "remote-chat", "shared-event"]);
  assert.equal(sourceEvents.find((item) => item.id === "shared-event").text, "LOCAL_WINS", "local canonical event must win by id");
  assert.equal(sourceEvents.some((item) => item.id === "remote-note"), false);
  assert.equal(sourceEvents.some((item) => item.id === "remote-gallery"), false);
  assert.equal(JSON.stringify(sourceEvents).includes("PRIVATE_NOTE_MUST_NOT_ENTER_CANONICAL_SNAPSHOT"), false);
  assert.equal(JSON.parse(hydrated.storage.getItem("aha_chat_sessions_v1"))[0].id, "conversation-local");

  // Supported canonical keys are virtual for the staging run, so staging server
  // apply cannot contaminate the real primary browser store.
  hydrated.storage.setItem("aha_source_events_v1", JSON.stringify([{ id: "server-applied-in-staging" }]));
  assert.equal(JSON.parse(hydrated.storage.getItem("aha_source_events_v1"))[0].id, "server-applied-in-staging");
  assert.equal(storage.dump("aha_source_events_v1"), originalLocalSources);

  // Non-canonical runner state keeps existing storage semantics.
  hydrated.storage.setItem("aha_canonical_sync_device_id_v1", "device-test");
  assert.equal(storage.dump("aha_canonical_sync_device_id_v1"), "device-test");

  await assert.rejects(() => hydrator.hydrateStorage({
    client: makeClient([], []),
    session: { access_token: "TEST_TOKEN", user: {} },
    storage,
    localImport
  }), /authenticated AHA user id is required/);

  console.log("aha-canonical-staging-primary-hydration-v1.test.cjs passed");
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
