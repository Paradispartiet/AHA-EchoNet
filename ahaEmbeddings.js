// ahaEmbeddings.js
// Klient-lag for embeddings. Snakker mot /api/aha-agent/embed for å
// hente vektoren, og lagrer den i Supabase via pgvector. Eksponerer
// AHAEmbeddings med fire kjernehandlinger:
//
//   embedAndStore(insight)     – ett insight → embedding → Supabase
//   embedAllPending(chamber)   – bulk: gjør alt som ennå ikke er embeddet
//   findSimilarToText(text)    – semantisk søk fra fritekst
//   findSimilarToInsight(id)   – "hvilke andre insights ligner på denne?"
//
// Alt er best-effort: hvis brukeren ikke er logget inn eller backend
// ikke svarer, returnerer vi { ok: false, reason } i stedet for å
// kaste videre. Hovedmotoren skal aldri stoppe på dette.

(function (global) {
  "use strict";

  const DEFAULT_MODEL = "voyage-multilingual-2";
  const TABLE = "aha_insight_embeddings";

  function endpoint() {
    const raw = String(global.AHA_AGENT_API || "").trim();
    if (!raw) return null;
    return raw.replace(/\/$/, "");
  }

  function isConfigured() {
    return Boolean(endpoint());
  }

  function db() {
    return global.AHADb?.getClient?.() || null;
  }

  async function profileId() {
    if (!global.AHAAuth?.getProfileId) return null;
    return await global.AHAAuth.getProfileId();
  }

  async function callEmbed(texts, inputType) {
    const ep = endpoint();
    if (!ep) throw new Error("no_backend: AHA_AGENT_API er ikke konfigurert");
    const res = await fetch(`${ep}/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texts, input_type: inputType || "document" })
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`embed_http_${res.status}: ${body.slice(0, 200)}`);
    }
    return res.json();
  }

  // Sjekker at backend faktisk er nådbar og at Voyage-nøkkelen er
  // satt. Brukes av dashboard/UI for å vise om embedding-laget er
  // klar, og av verifiserings-snippet i docs.
  async function health() {
    const ep = endpoint();
    if (!ep) return { ok: false, reason: "no_backend" };
    try {
      const res = await fetch(`${ep}/health`);
      if (!res.ok) return { ok: false, reason: `http_${res.status}` };
      return { ok: true, ...(await res.json()) };
    } catch (err) {
      return { ok: false, reason: "fetch_failed", error: String(err) };
    }
  }

  function summarize(insight) {
    return String(insight?.summary || insight?.title || "").slice(0, 4000).trim();
  }

  async function storeEmbedding(insight, embedding, model) {
    const client = db();
    if (!client) return { ok: false, reason: "no_supabase" };
    const pid = await profileId();
    if (!pid) return { ok: false, reason: "not_signed_in" };

    const now = new Date().toISOString();
    const { data, error } = await client
      .from(TABLE)
      .upsert({
        id: insight.id,
        profile_id: pid,
        subject_id: insight.subject_id || null,
        theme_id: insight.theme_id || null,
        summary: summarize(insight),
        embedding,
        model: model || DEFAULT_MODEL,
        updated_at: now
      }, { onConflict: "id" })
      .select()
      .single();

    if (error) return { ok: false, error };
    return { ok: true, data };
  }

  async function embedAndStore(insight) {
    if (!insight?.id) return { ok: false, reason: "missing_id" };
    const text = summarize(insight);
    if (!text) return { ok: false, reason: "empty_text" };
    try {
      const result = await callEmbed([text], "document");
      const emb = result?.embeddings?.[0];
      if (!Array.isArray(emb)) return { ok: false, reason: "no_embedding" };
      return await storeEmbedding(insight, emb, result.model);
    } catch (err) {
      console.warn("AHAEmbeddings.embedAndStore feilet", err);
      return { ok: false, error: err };
    }
  }

  // Last opp embeddings for alle insights i kammeret som ikke allerede
  // har en. Hopper over insights uten id eller summary, batcher API-
  // kallene i håndterbare grupper, og rapporterer hvor mange som ble
  // embedded vs feilet.
  async function embedAllPending(chamber, options) {
    const opts = options || {};
    const insights = chamber?.insights || [];
    if (!insights.length) return { ok: true, embedded: 0, pending: 0 };

    const client = db();
    if (!client) return { ok: false, reason: "no_supabase" };
    const pid = await profileId();
    if (!pid) return { ok: false, reason: "not_signed_in" };

    const ids = insights.map((i) => i.id).filter(Boolean);
    if (!ids.length) return { ok: true, embedded: 0, pending: 0 };

    const { data: existing, error: selErr } = await client
      .from(TABLE)
      .select("id")
      .in("id", ids);
    if (selErr) return { ok: false, error: selErr };

    const have = new Set((existing || []).map((r) => r.id));
    const pending = insights.filter(
      (i) => i.id && !have.has(i.id) && summarize(i)
    );
    if (!pending.length) return { ok: true, embedded: 0, pending: 0 };

    const batchSize = Math.max(1, Math.min(opts.batchSize || 16, 64));
    let embedded = 0;
    let errors = 0;

    for (let i = 0; i < pending.length; i += batchSize) {
      const batch = pending.slice(i, i + batchSize);
      try {
        const result = await callEmbed(
          batch.map((b) => summarize(b)),
          "document"
        );
        const embs = result?.embeddings || [];
        await Promise.all(
          batch.map(async (ins, idx) => {
            const emb = embs[idx];
            if (!Array.isArray(emb)) {
              errors += 1;
              return;
            }
            const r = await storeEmbedding(ins, emb, result.model);
            if (r.ok) embedded += 1;
            else errors += 1;
          })
        );
      } catch (err) {
        console.warn("AHAEmbeddings: batch feilet", err);
        errors += batch.length;
      }
      if (typeof opts.onProgress === "function") {
        try { opts.onProgress({ embedded, errors, total: pending.length }); } catch {}
      }
    }

    try {
      global.dispatchEvent(
        new CustomEvent("aha:embeddings-bulk-complete", {
          detail: { embedded, errors, pending: pending.length }
        })
      );
    } catch {}

    return { ok: true, embedded, errors, pending: pending.length };
  }

  async function findSimilarToText(text, options) {
    const opts = options || {};
    if (!text || !String(text).trim()) return { ok: false, reason: "empty" };
    const client = db();
    if (!client) return { ok: false, reason: "no_supabase" };

    try {
      const result = await callEmbed([String(text)], "query");
      const emb = result?.embeddings?.[0];
      if (!Array.isArray(emb)) return { ok: false, reason: "no_embedding" };

      const { data, error } = await client.rpc("aha_match_insights", {
        query_embedding: emb,
        match_count: opts.limit || 10,
        similarity_threshold: opts.threshold == null ? 0.5 : opts.threshold,
        filter_subject_id: opts.subject_id || null,
        filter_theme_id: opts.theme_id || null
      });
      if (error) return { ok: false, error };
      return { ok: true, matches: data || [] };
    } catch (err) {
      console.warn("AHAEmbeddings.findSimilarToText feilet", err);
      return { ok: false, error: err };
    }
  }

  async function findSimilarToInsight(insightId, options) {
    const opts = options || {};
    if (!insightId) return { ok: false, reason: "missing_id" };
    const client = db();
    if (!client) return { ok: false, reason: "no_supabase" };

    const { data: row, error: selErr } = await client
      .from(TABLE)
      .select("embedding, subject_id, theme_id")
      .eq("id", insightId)
      .maybeSingle();
    if (selErr) return { ok: false, error: selErr };
    if (!row?.embedding) return { ok: false, reason: "no_embedding_for_insight" };

    const { data, error } = await client.rpc("aha_match_insights", {
      query_embedding: row.embedding,
      match_count: (opts.limit || 10) + 1,
      similarity_threshold: opts.threshold == null ? 0.5 : opts.threshold,
      filter_subject_id: opts.subject_id || row.subject_id || null,
      filter_theme_id: opts.theme_id || null
    });
    if (error) return { ok: false, error };

    const matches = (data || [])
      .filter((m) => m.id !== insightId)
      .slice(0, opts.limit || 10);
    return { ok: true, matches };
  }

  // ── Merge-forslag (suggestion-only, ingen auto-merge) ─────────
  //
  // findMergeCandidate ser om en gitt insight har et nært slektning i
  // samme subject/theme. Den verken merger eller skriver merged_into —
  // den gir bare tilbake en kandidat som caller (ahaIngest) emitter
  // som aha:merge-suggested-event.
  async function findMergeCandidate(insight, chamber, options) {
    const opts = options || {};
    if (!isConfigured()) return { ok: false, reason: "no_backend" };
    if (!insight?.id) return { ok: false, reason: "missing_insight" };

    const text = String(insight.summary || "").trim();
    if (!text) return { ok: false, reason: "empty_summary" };

    const suggestThreshold = opts.suggestThreshold == null ? 0.70 : opts.suggestThreshold;

    const r = await findSimilarToText(text, {
      limit: 10,
      threshold: suggestThreshold,
      subject_id: insight.subject_id || null,
      theme_id: insight.theme_id || null
    });
    if (!r.ok) return r;

    const insightsById = new Map(
      (chamber?.insights || []).map((c) => [c.id, c])
    );

    const matches = (r.matches || [])
      .filter((m) => {
        if (!m.id || m.id === insight.id) return false;
        const c = insightsById.get(m.id);
        if (!c) return false;
        if (c.merged_into) return false;
        return c.subject_id === insight.subject_id &&
               c.theme_id === insight.theme_id;
      });

    return {
      ok: true,
      candidate: matches[0] || null,
      candidates: matches
    };
  }

  // ── Kalibrering ──────────────────────────────────────────────
  //
  // calibrateMergeThresholds laster ALLE embeddings for innlogget
  // bruker, beregner cosine for alle par i samme subject+theme, og
  // returnerer:
  //   - pairs: [{ a_id, b_id, similarity, summary_a, summary_b }, ...]
  //   - histogram: antall par i bins [0.5,0.55), [0.55,0.6) ... [0.95,1.0]
  //   - top: topp-K par sortert på similarity
  // Caller bruker dette til å sette suggestThreshold empirisk i stedet
  // for å gjette.
  function cosineSim(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0;
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    if (!na || !nb) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }

  async function calibrateMergeThresholds(chamber, options) {
    const opts = options || {};
    const minThreshold = opts.minThreshold == null ? 0.5 : opts.minThreshold;
    const topK = opts.topK || 25;

    const client = db();
    if (!client) return { ok: false, reason: "no_supabase" };

    const profileId = await global.AHAAuth?.getProfileId?.();
    if (!profileId) return { ok: false, reason: "not_authenticated" };

    const { data, error } = await client
      .from(TABLE)
      .select("id, subject_id, theme_id, embedding")
      .eq("profile_id", profileId);
    if (error) return { ok: false, error };

    const rows = (data || []).filter((r) => Array.isArray(r.embedding) && r.embedding.length);
    if (rows.length < 2) return { ok: true, pairs: [], histogram: {}, top: [], rows: rows.length };

    const insightsById = new Map(
      (chamber?.insights || []).map((c) => [c.id, c])
    );

    const pairs = [];
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const a = rows[i], b = rows[j];
        if (a.subject_id !== b.subject_id) continue;
        if (a.theme_id !== b.theme_id) continue;
        const sim = cosineSim(a.embedding, b.embedding);
        if (sim < minThreshold) continue;
        pairs.push({
          a_id: a.id,
          b_id: b.id,
          similarity: sim,
          subject_id: a.subject_id,
          theme_id: a.theme_id,
          summary_a: insightsById.get(a.id)?.summary?.slice(0, 120) || "",
          summary_b: insightsById.get(b.id)?.summary?.slice(0, 120) || ""
        });
      }
    }

    pairs.sort((x, y) => y.similarity - x.similarity);

    const bins = ["0.50", "0.55", "0.60", "0.65", "0.70", "0.75", "0.80", "0.85", "0.90", "0.95"];
    const histogram = Object.fromEntries(bins.map((b) => [b, 0]));
    for (const p of pairs) {
      const lo = Math.min(0.95, Math.floor(p.similarity * 20) / 20);
      const key = lo.toFixed(2);
      if (key in histogram) histogram[key] += 1;
    }

    return {
      ok: true,
      rows: rows.length,
      pair_count: pairs.length,
      histogram,
      top: pairs.slice(0, topK),
      pairs
    };
  }

  global.AHAEmbeddings = {
    embedAndStore,
    embedAllPending,
    findSimilarToText,
    findSimilarToInsight,
    findMergeCandidate,
    calibrateMergeThresholds,
    health,
    isConfigured,
    DEFAULT_MODEL
  };
})(window);
