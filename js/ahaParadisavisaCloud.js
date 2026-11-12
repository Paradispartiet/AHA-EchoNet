/* AHA / Paradisavisa: manual, opt-in, account-owned cloud backup.
   No requests, account adoption or history upload run at page load.
   Local library remains the source of truth until the user acts. */
(function (global) {
  "use strict";

  const TABLE = "aha_paradisavisa_reading_library";
  const OWNER = "aha_paradisavisa_cloud_owner_v1";
  const ORIGIN = "https://paradispartiet.github.io";
  const MAX_ARTICLES = 5000;
  const BATCH_SIZE = 100;
  let busy = false;

  const $ = (id) => document.getElementById(id);
  function feedback(message) {
    const target = $("aha-avisa-cloud-feedback");
    if (target) target.textContent = message;
  }
  function getLocalOwner() {
    try { return localStorage.getItem(OWNER) || ""; }
    catch { return ""; }
  }
  function setLocalOwner(uid) {
    try { localStorage.setItem(OWNER, uid); return true; }
    catch { return false; }
  }
  function validId(id) {
    return /^\/Paradisavisa\/(?:artikler|posts)\/[^/?#]+\.html$/i.test(String(id || ""));
  }
  function validUrl(row) {
    if (!validId(row?.id)) return false;
    try {
      const parsed = new URL(row.url);
      return parsed.origin === ORIGIN && parsed.pathname === row.id
        && !parsed.username && !parsed.password && !parsed.search && !parsed.hash;
    } catch { return false; }
  }
  function safeDate(value) {
    const raw = String(value || "").trim();
    return raw && Number.isFinite(Date.parse(raw)) ? new Date(raw).toISOString() : null;
  }
  function stamp(value) { return String(value || "").trim().slice(0, 35) || null; }
  function words(value, size) { return String(value || "").trim().slice(0, size); }
  function rowForAccount(article, userId) {
    if (!validUrl(article)) return null;
    const saved = safeDate(article.savedAt), read = safeDate(article.readAt), opened = safeDate(article.openedAt);
    if (!(saved || read || opened)) return null;
    const tags = [...new Set((Array.isArray(article.tags) ? article.tags : [])
      .filter((value) => typeof value === "string").map((value) => value.trim().slice(0, 50)).filter(Boolean))].slice(0, 12);
    return {
      profile_id: userId, article_id: article.id,
      title: words(article.title, 250), summary: words(article.summary, 700),
      excerpt: words(article.excerpt, 1100), category: words(article.category, 80),
      published_at: stamp(article.publishedAt),
      saved_at: saved, read_at: read, opened_at: opened,
      open_count: Math.max(0, Math.min(100000, Math.floor(Number(article.openCount) || 0))),
      tags,
      updated_at: new Date().toISOString()
    };
  }
  function articleFromRow(row) {
    const id = String(row.article_id || "");
    if (!validId(id)) return null;
    return {
      id, url: ORIGIN + id, title: words(row.title, 250),
      summary: words(row.summary, 700), excerpt: words(row.excerpt, 1100),
      category: words(row.category, 80), publishedAt: stamp(row.published_at),
      savedAt: safeDate(row.saved_at), readAt: safeDate(row.read_at),
      openedAt: safeDate(row.opened_at), openCount: Number(row.open_count) || 0,
      tags: Array.isArray(row.tags) ? row.tags.slice(0, 12) : [],
      source: "paradisavisa", local_only: true
    };
  }
  async function verifiedAccount() {
    const client = global.AHADb?.getClient?.();
    if (!client) return { ok: false, reason: "Aha-innloggingen er ikke tilgjengelig." };
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user?.id || data.user.is_anonymous) {
      return { ok: false, reason: "Du må være logget inn med Aha for å bruke kontolagring." };
    }
    return { ok: true, client, userId: data.user.id };
  }

  let ownerCheckVersion = 0;
  async function checkLocalOwner() {
    const seq = ++ownerCheckVersion;
    const previousOwner = getLocalOwner();
    if (!previousOwner) {
      global.AHAParadisavisa?.setOwnerAccess?.(true);
      return { ok: true, unbound: true };
    }
    try {
      const auth = await verifiedAccount();
      if (seq !== ownerCheckVersion) return { ok: false, reason: "superseded" };
      const allowed = auth.ok && auth.userId === previousOwner;
      global.AHAParadisavisa?.setOwnerAccess?.(allowed);
      if (!allowed) feedback("Det lokale biblioteket er låst til en annen Aha-konto. Logg inn med riktig konto for å se innholdet. Skydata er ikke overført.");
      else feedback("Aha-kontoen er bekreftet. Det lokale biblioteket er tilgjengelig; ingen automatisk opplasting.");
      return { ok: allowed };
    } catch {
      if (seq === ownerCheckVersion) global.AHAParadisavisa?.setOwnerAccess?.(false);
      return { ok: false, reason: "auth_failed" };
    }
  }
  function ownershipAllowed(userId) {
    const currentOwner = getLocalOwner();
    return !currentOwner || currentOwner === userId;
  }
  function labelServerError(error) {
    const code = String(error?.code || "");
    // Never show raw SQL/service diagnostics or expose sensitive query details.
    if (code === "42P01" || code === "PGRST205" || code === "PGRST116") {
      return "Kontolagringen er ikke klargjort i Aha-databasen. Det lokale biblioteket er uendret.";
    }
    if (code === "42501" || code === "PGRST301") {
      return "Aha-kontoen har ikke tilgang til skybiblioteket. Ingen lokale data ble endret.";
    }
    return "Kontolagringen kunne ikke fullføres. Prøv igjen senere. Det lokale biblioteket er beholdt.";
  }
  async function readRemote(client, uid) {
    const result = [];
    for (let offset = 0; offset < MAX_ARTICLES; offset += BATCH_SIZE) {
      const { data, error } = await client.from(TABLE)
        .select("article_id,title,summary,excerpt,category,published_at,saved_at,read_at,opened_at,open_count,tags")
        .eq("profile_id", uid)
        .order("article_id", { ascending: true })
        .range(offset, offset + BATCH_SIZE - 1);
      if (error) throw error;
      const batch = Array.isArray(data) ? data : [];
      result.push(...batch);
      if (batch.length < BATCH_SIZE) break;
    }
    return result;
  }
  function withBusy(button, task) {
    if (busy) return Promise.resolve({ ok: false, reason: "busy" });
    busy = true;
    if (button) button.disabled = true;
    return Promise.resolve().then(task).finally(() => {
      busy = false;
      if (button) button.disabled = false;
    });
  }
  async function upload() {
    const auth = await verifiedAccount();
    if (!auth.ok) return { ok: false, reason: auth.reason };
    if (!ownershipAllowed(auth.userId)) {
      return { ok: false, reason: "Biblioteket på denne enheten er knyttet til en annen Aha-konto. Eksporter en sikkerhetskopi og bytt til riktig konto før synkronisering." };
    }
    global.AHAParadisavisa?.setOwnerAccess?.(true);
    const library = global.AHAParadisavisa?.load?.();
    const articles = Array.isArray(library?.articles) ? library.articles : [];
    const rows = articles.map((a) => rowForAccount(a, auth.userId)).filter((a) => a && a.title);
    if (!rows.length) return { ok: false, reason: "Ingen lagrede eller leste artikler å overføre." };
    if (rows.length > MAX_ARTICLES) return { ok: false, reason: "Biblioteket er for stort til én sikkerhetskopi." };
    if (!global.confirm("Lagre " + rows.length + " artikkelregistreringer på din private Aha-konto? Dette kan omfatte lesehistorikk, titler, emneord og korte utdrag. Automatisk sporing blir ikke slått på.")) {
      return { ok: false, reason: "Avbrutt. Ingen data ble sendt." };
    }
    // Do not perform remote reads, writes or session changes before explicit consent.
    let updated = 0;
    try {
      // Merge existing cloud marks before writing. A stale second device must
      // never silently clear a save, reading timestamp, or topic tag.
      // Deliberate cloud deletion has its own separate, confirmed action.
      const current = await readRemote(auth.client, auth.userId);
      const byId = new Map(current.map((row) => [row.article_id, row]));
      const merged = rows.map((row) => {
        const older = byId.get(row.article_id);
        if (!older) return row;
        return {
          ...row,
          saved_at: row.saved_at || older.saved_at || null,
          read_at: row.read_at || older.read_at || null,
          opened_at: row.opened_at || older.opened_at || null,
          open_count: Math.max(Number(row.open_count) || 0, Number(older.open_count) || 0),
          tags: [...new Set([...(Array.isArray(older.tags) ? older.tags : []), ...row.tags])].slice(0, 12)
        };
      });
      for (let i = 0; i < merged.length; i += BATCH_SIZE) {
        const { error } = await auth.client.from(TABLE)
          .upsert(merged.slice(i, i + BATCH_SIZE), { onConflict: "profile_id,article_id" });
        if (error) throw error;
        updated += Math.min(BATCH_SIZE, merged.length - i);
        // Mark ownership immediately after the first committed batch, even if
        // a later batch fails; otherwise another account could leak the remainder.
        if (!setLocalOwner(auth.userId)) {
          return { ok: false, reason: "Noen artikler er overført, men nettleseren kunne ikke huske kontoeieren. Ikke bytt konto på denne enheten." };
        }
      }
      return { ok: true, reason: updated + " artikkelregistreringer er lagret på Aha-kontoen. Eldre kontomarkeringer beholdes. Ingenting synkroniseres automatisk." };
    } catch (error) {
      return { ok: false, reason: labelServerError(error) + (updated ? " Enkelte artikler kan allerede være overført." : "") };
    }
  }
  async function download() {
    const auth = await verifiedAccount();
    if (!auth.ok) return { ok: false, reason: auth.reason };
    if (!ownershipAllowed(auth.userId)) {
      return { ok: false, reason: "Denne nettleseren har et bibliotek knyttet til en annen Aha-konto. Skydata ble ikke blandet inn." };
    }
    global.AHAParadisavisa?.setOwnerAccess?.(true);
    const local = global.AHAParadisavisa?.load?.();
    if (Array.isArray(local?.articles) && local.articles.length &&
      !global.confirm("Hente kontobiblioteket og slå det sammen med " + local.articles.length + " lokale registreringer? Eksisterende markeringer og lesehistorikk-samtykke beholdes.")) {
      return { ok: false, reason: "Avbrutt. Ingen data ble importert." };
    }
    try {
      const rows = await readRemote(auth.client, auth.userId);
      if (!rows.length) return { ok: false, reason: "Det finnes ingen artikkelregistreringer på denne Aha-kontoen." };
      const articles = rows.map(articleFromRow).filter(Boolean);
      if (!articles.length) return { ok: false, reason: "Skybiblioteket inneholder ingen gyldige artikkelreferanser." };
      const result = global.AHAParadisavisa?.importData?.({ version: 1, articles, trackingEnabled: false });
      if (!result?.ok) return { ok: false, reason: "Importen feilet. Lokale data ble ikke slettet." };
      if (!setLocalOwner(auth.userId)) {
        return { ok: false, reason: "Artiklene ble importert, men nettleseren kunne ikke lagre konto-eierskapet." };
      }
      return { ok: true, reason: "Hentet " + articles.length + " artikler fra Aha-kontoen. Lokal sporing er uendret." };
    } catch (error) {
      return { ok: false, reason: labelServerError(error) };
    }
  }
  async function eraseCloud() {
    const auth = await verifiedAccount();
    if (!auth.ok) return { ok: false, reason: auth.reason };
    if (!global.confirm("Slette ALLE artikkelregistreringer fra Aha-kontoen? Dette sletter skyhistorikken, men ikke den lokale kopien. Handlingen kan ikke angres.")) {
      return { ok: false, reason: "Skyhistorikken ble ikke slettet." };
    }
    try {
      const { error } = await auth.client.from(TABLE).delete().eq("profile_id", auth.userId);
      if (error) throw error;
      return { ok: true, reason: "Skybiblioteket er slettet. Den lokale kopien er beholdt." };
    } catch (error) {
      return { ok: false, reason: labelServerError(error) };
    }
  }
  async function handleClick(button, action) {
    const result = await withBusy(button, action);
    feedback(result.reason || "");
  }
  function init() {
    if (!$("aha-avisa-cloud-feedback")) return;
    const uploadButton = $("aha-avisa-cloud-upload");
    const downloadButton = $("aha-avisa-cloud-download");
    const eraseButton = $("aha-avisa-cloud-erase");
    uploadButton?.addEventListener("click", () => handleClick(uploadButton, upload));
    downloadButton?.addEventListener("click", () => handleClick(downloadButton, download));
    eraseButton?.addEventListener("click", () => handleClick(eraseButton, eraseCloud));
    // Account verification only for a library previously bound to an owner.
    // This never reads or writes any article rows in Supabase.
    if (getLocalOwner()) checkLocalOwner();
    else feedback("Kontolagring er valgfritt. Ingenting lastes opp eller hentes automatisk.");
  }
  global.AHAParadisavisaCloud = Object.freeze({
    upload, download, eraseCloud, rowForAccount, articleFromRow, ownershipAllowed, checkLocalOwner
  });
  global.addEventListener?.("pageshow", () => { if (getLocalOwner()) checkLocalOwner(); });
  global.addEventListener?.("storage", (event) => {
    if (event?.key === OWNER || (event?.key && /-auth-token$/.test(event.key))) checkLocalOwner();
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(window);
