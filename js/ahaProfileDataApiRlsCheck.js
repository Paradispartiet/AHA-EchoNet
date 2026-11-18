// Explicit read-only Data API RLS probe for the signed-in AHA account.
// Uses HEAD/count, never fetches row content, logs identities, writes or syncs.
(function (global) {
  "use strict";
  const EXPECTED_URL = "https://wshmybqyksrwkawqleiz.supabase.co";
  const TABLES = Object.freeze([
    ["aha_profiles", "id"],
    ["aha_source_events", "profile_id"],
    ["aha_imports", "profile_id"],
    ["aha_insight_embeddings", "profile_id"],
    ["aha_feed_posts", "profile_id"],
    ["aha_insta_posts", "profile_id"]
  ]);

  async function countRows(client, table, field, operator, userId) {
    let query = client.from(table).select("id", { count: "exact", head: true });
    if (operator === "eq") query = query.eq(field, userId);
    else if (operator === "isnull") query = query.is(field, null);
    else query = query.neq(field, userId);
    const result = await query;
    if (result?.error || !Number.isSafeInteger(result?.count) || result.count < 0) {
      return { ok: false };
    }
    return { ok: true, count: result.count };
  }

  async function check() {
    const db = global.AHADb;
    if (!db || db.getConfig?.().url !== EXPECTED_URL) {
      return { ok: false, status: "wrong_project" };
    }
    const client = db.getClient?.();
    if (!client || typeof client.auth?.getUser !== "function") {
      return { ok: false, status: "unavailable" };
    }
    let userId = null;
    try {
      const auth = await client.auth.getUser();
      if (auth?.error) return { ok: false, status: "auth_error" };
      userId = auth?.data?.user?.id || null;
      if (!userId) return { ok: false, status: "signed_out" };

      // Positive control: the authenticated identity must see its own profile.
      const own = await countRows(client, "aha_profiles", "id", "eq", userId);
      if (!own.ok) return { ok: false, status: "read_error" };
      if (own.count !== 1) return { ok: false, status: "profile_missing" };

      // Negative controls: ask for COUNT ONLY of rows *not* belonging to this
      // session, across six owner-scoped tables. No row data or IDs returned.
      for (const [table, ownerField] of TABLES) {
        const result = await countRows(client, table, ownerField, "neq", userId);
        if (!result.ok) return { ok: false, status: "read_error" };
        if (result.count !== 0) return { ok: false, status: "possible_exposure" };
        // On nullable profile_id columns, an unowned row is also unsafe if
        // exposed. SQL <> does not match NULL, so probe it separately.
        if (ownerField === "profile_id") {
          const unowned = await countRows(client, table, ownerField, "isnull", userId);
          if (!unowned.ok) return { ok: false, status: "read_error" };
          if (unowned.count !== 0) return { ok: false, status: "possible_exposure" };
        }
      }
      // No proof of two-user isolation: this checks one real session only.
      return { ok: true, status: "no_foreign_rows", checked_tables: TABLES.length };
    } catch {
      return { ok: false, status: "read_error" };
    } finally {
      userId = null;
    }
  }

  const messages = Object.freeze({
    wrong_project: "Kontrollen stoppet: appen peker ikke til riktig AHA-database.",
    unavailable: "Supabase er ikke tilgjengelig. Ingen data er endret.",
    auth_error: "Supabase kunne ikke verifisere innloggingen. Prøv igjen.",
    signed_out: "Logg inn på AHA før du kontrollerer datatilgang.",
    profile_missing: "Innloggingen virker, men egen AHA-profilrad er ikke synlig. Kontrollen er ikke godkjent.",
    read_error: "Databasens lesekontroll feilet. Ikke aktiver synkronisering.",
    possible_exposure: "ADVARSEL: Kontroll fant rader utenfor denne profilen. Ikke aktiver synkronisering; undersøk RLS.",
    no_foreign_rows: "Ingen fremmede rader synlige i 6 tabeller gjennom denne innloggingen. Dette er ikke en full tobrukertest eller backupkontroll."
  });

  function init() {
    const button = global.document?.getElementById("aha-check-data-api-rls");
    const output = global.document?.getElementById("aha-data-api-rls-result");
    if (!button || !output) return;
    button.addEventListener("click", async () => {
      if (button.disabled) return;
      button.disabled = true;
      output.textContent = "Kontrollerer bare tilgangsregler (ingen innhold leses) …";
      output.dataset.status = "checking";
      try {
        const result = await check();
        output.textContent = messages[result.status] || "Ukjent kontrollresultat. Ingen data er endret.";
        output.dataset.status = result.status || "unknown";
      } catch {
        output.textContent = messages.read_error;
        output.dataset.status = "read_error";
      } finally {
        button.disabled = false;
      }
    });
  }

  global.AHAProfileDataApiRlsCheck = { check, init };
  if (global.document?.readyState === "loading") {
    global.document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
