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

  const ENDPOINT = (global.AHA_AGENT_API || "/api/aha-agent").replace(/\/$/, "");
  const DEFAULT_MODEL = "voyage-multilingual-2";
  const TABLE = "aha_insight_embeddings";

  function db() {
    return global.AHADb?.getClient?.() || null;
  }

  async function profileId() {
    if (!global.AHAAuth?.getProfileId) return null;
    return await global.AHAAuth.getProfileId();
  }

  async function callEmbed(texts, inputType) {
    const res = await fetch(`${ENDPOINT}/embed`, {
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

  global.AHAEmbeddings = {
    embedAndStore,
    embedAllPending,
    findSimilarToText,
    findSimilarToInsight,
    DEFAULT_MODEL
  };
})(window);
