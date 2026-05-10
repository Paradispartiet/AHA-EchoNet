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

  // Bygger semantisk rikere embedding-input enn bare summary. Etter en
  // brukerbekreftet merge endres ikke nødvendigvis summary, men insighten
  // får ny mening gjennom evidence, concepts, claims, patterns, markers
  // og emner. Vi inkluderer derfor alle lag — med summary først så
  // signal er sterkest der — og truncerer til 4000 tegn til slutt.
  function buildEmbeddingText(insight) {
    if (!insight) return "";
    const lines = [];

    const title = String(insight.title || "").trim();
    const summary = String(insight.summary || "").trim();
    if (title) lines.push(title);
    if (summary && summary !== title) lines.push(summary);

    const conceptLabels = (insight.concepts || [])
      .map((c) => (c && (c.label || c.key)) || "")
      .filter(Boolean);
    if (conceptLabels.length) lines.push(`Begreper: ${conceptLabels.join(", ")}`);

    const patternLabels = (insight.patterns || [])
      .map((p) => (p && (p.label || p.key)) || "")
      .filter(Boolean);
    if (patternLabels.length) lines.push(`Mønstre: ${patternLabels.join(", ")}`);

    const claimTexts = (insight.claims || [])
      .map((c) => (c && c.text) || "")
      .filter(Boolean);
    if (claimTexts.length) lines.push(`Påstander: ${claimTexts.join(" · ")}`);

    const markerValues = (insight.markers || [])
      .map((m) => (m && m.value) || "")
      .filter(Boolean);
    if (markerValues.length) lines.push(`Markører: ${markerValues.join(", ")}`);

    const emneIds = Array.isArray(insight.emner) ? insight.emner.filter(Boolean) : [];
    if (emneIds.length) lines.push(`Emner: ${emneIds.join(", ")}`);

    // raw_terms tas med kun som lavprioritert hale, og kuttet til topp 8
    // etter count, slik at hyppige stopword-aktige ord ikke drukner
    // semantikken over.
    const rawTerms = (insight.raw_terms || [])
      .filter((t) => t && t.key)
      .sort((a, b) => (b.count || 0) - (a.count || 0))
      .slice(0, 8)
      .map((t) => t.key);
    if (rawTerms.length) lines.push(`Termer: ${rawTerms.join(", ")}`);

    const text = lines.join("\n").trim();
    if (!text) return summarize(insight);
    return text.slice(0, 4000);
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
    // Embedding-tekst er det rikere semantiske representasjonen,
    // men summary-kolonnen skal forbli human-readable.
    const text = buildEmbeddingText(insight);
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
      (i) => i.id && !have.has(i.id) && !i.merged_into && buildEmbeddingText(i)
    );
    if (!pending.length) return { ok: true, embedded: 0, pending: 0 };

    const batchSize = Math.max(1, Math.min(opts.batchSize || 16, 64));
    let embedded = 0;
    let errors = 0;

    for (let i = 0; i < pending.length; i += batchSize) {
      const batch = pending.slice(i, i + batchSize);
      try {
        const result = await callEmbed(
          batch.map((b) => buildEmbeddingText(b)),
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

  // Bygger et set med id-er for insights som er sammenslått inn i andre.
  // Brukes til klientside-filtrering av semantiske resultater så en
  // merged source ikke konkurrerer med target som aktiv kandidat.
  function mergedIdsFromChamber(chamber) {
    const list = Array.isArray(chamber?.insights) ? chamber.insights : [];
    const ids = new Set();
    list.forEach((ins) => {
      if (ins && ins.id && ins.merged_into) ids.add(ins.id);
    });
    return ids;
  }

  function dropMergedMatches(matches, chamber) {
    if (!Array.isArray(matches) || !matches.length) return matches || [];
    const merged = mergedIdsFromChamber(chamber);
    if (!merged.size) return matches;
    return matches.filter((m) => m && m.id && !merged.has(m.id));
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

      const limit = opts.limit || 10;
      // Hent litt ekstra hvis vi har en chamber å filtrere mot, slik at
      // vi fortsatt har nok kandidater igjen etter at merged sources er
      // luket ut. 2× pluss en konstant er rikelig i praksis.
      const matchCount = opts.chamber ? Math.max(limit * 2, limit + 5) : limit;

      const { data, error } = await client.rpc("aha_match_insights", {
        query_embedding: emb,
        match_count: matchCount,
        similarity_threshold: opts.threshold == null ? 0.5 : opts.threshold,
        filter_subject_id: opts.subject_id || null,
        filter_theme_id: opts.theme_id || null
      });
      if (error) return { ok: false, error };
      const matches = dropMergedMatches(data || [], opts.chamber).slice(0, limit);
      return { ok: true, matches };
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

    const limit = opts.limit || 10;
    const matchCount = opts.chamber ? Math.max(limit * 2, limit + 5) + 1 : limit + 1;

    const { data, error } = await client.rpc("aha_match_insights", {
      query_embedding: row.embedding,
      match_count: matchCount,
      similarity_threshold: opts.threshold == null ? 0.5 : opts.threshold,
      filter_subject_id: opts.subject_id || row.subject_id || null,
      filter_theme_id: opts.theme_id || null
    });
    if (error) return { ok: false, error };

    const matches = dropMergedMatches(
      (data || []).filter((m) => m.id !== insightId),
      opts.chamber
    ).slice(0, limit);
    return { ok: true, matches };
  }

  // Read-only: leter etter den mest like insight i samme subject+theme
  // som har lagret embedding, og returnerer den hvis cosine-likheten
  // er over suggestThreshold. Muterer ingenting. Brukes av ingest-laget
  // til å fyre aha:merge-suggested-event som suggestion-only signal.
  async function findMergeCandidate(insight, chamber, options) {
    const opts = options || {};
    const suggestThreshold = Number.isFinite(opts.suggestThreshold)
      ? Number(opts.suggestThreshold)
      : 0.70;

    if (!insight?.id) {
      return { ok: false, reason: "missing_source", threshold: suggestThreshold };
    }

    const candidates = (chamber?.insights || []).filter(
      (i) =>
        i &&
        i.id &&
        i.id !== insight.id &&
        !i.merged_into &&
        i.subject_id === insight.subject_id &&
        i.theme_id === insight.theme_id
    );
    if (!candidates.length) {
      return { ok: false, reason: "no_candidates", threshold: suggestThreshold };
    }

    const client = db();
    if (!client) {
      return { ok: false, reason: "no_supabase", threshold: suggestThreshold };
    }
    const pid = await profileId();
    if (!pid) {
      return { ok: false, reason: "not_signed_in", threshold: suggestThreshold };
    }

    const { data: srcRow, error: srcErr } = await client
      .from(TABLE)
      .select("embedding")
      .eq("id", insight.id)
      .maybeSingle();
    if (srcErr) return { ok: false, error: srcErr, threshold: suggestThreshold };

    let srcVec = srcRow?.embedding;
    if (typeof srcVec === "string") {
      try { srcVec = JSON.parse(srcVec); } catch { srcVec = null; }
    }
    if (!Array.isArray(srcVec) || !srcVec.length) {
      return {
        ok: false,
        reason: "no_source_embedding",
        threshold: suggestThreshold
      };
    }

    let srcNorm = 0;
    for (let i = 0; i < srcVec.length; i++) srcNorm += srcVec[i] * srcVec[i];
    srcNorm = Math.sqrt(srcNorm);
    if (!Number.isFinite(srcNorm) || srcNorm === 0) {
      return {
        ok: false,
        reason: "no_source_embedding",
        threshold: suggestThreshold
      };
    }
    const srcUnit = new Array(srcVec.length);
    for (let i = 0; i < srcVec.length; i++) srcUnit[i] = srcVec[i] / srcNorm;

    const ids = candidates.map((c) => c.id);
    const rows = [];
    const chunkSize = 500;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const slice = ids.slice(i, i + chunkSize);
      const { data, error } = await client
        .from(TABLE)
        .select("id, embedding")
        .in("id", slice);
      if (error) return { ok: false, error, threshold: suggestThreshold };
      if (data) rows.push(...data);
    }

    let bestId = null;
    let bestSim = -Infinity;
    for (const r of rows) {
      let v = r.embedding;
      if (typeof v === "string") {
        try { v = JSON.parse(v); } catch { v = null; }
      }
      if (!Array.isArray(v) || !v.length) continue;
      let n = 0;
      for (let i = 0; i < v.length; i++) n += v[i] * v[i];
      n = Math.sqrt(n);
      if (!Number.isFinite(n) || n === 0) continue;
      const len = v.length < srcUnit.length ? v.length : srcUnit.length;
      let dot = 0;
      for (let i = 0; i < len; i++) dot += (v[i] / n) * srcUnit[i];
      if (dot > 1) dot = 1;
      else if (dot < -1) dot = -1;
      if (dot > bestSim) {
        bestSim = dot;
        bestId = r.id;
      }
    }

    if (bestId == null || !Number.isFinite(bestSim)) {
      return {
        ok: false,
        reason: "no_candidate_embeddings",
        threshold: suggestThreshold
      };
    }
    if (bestSim < suggestThreshold) {
      return {
        ok: false,
        reason: "below_threshold",
        similarity: bestSim,
        threshold: suggestThreshold
      };
    }
    const candidate = candidates.find((c) => c.id === bestId) || null;
    if (!candidate) {
      return {
        ok: false,
        reason: "candidate_not_in_chamber",
        threshold: suggestThreshold
      };
    }
    return {
      ok: true,
      candidate,
      similarity: bestSim,
      threshold: suggestThreshold
    };
  }

  // Kalibrerer merge-terskler basert på observerte similarity-scores.
  // Dette påvirker ikke eksisterende embedding-flyt; funksjonen er kun
  // et analyseverktøy som kan kalles eksplisitt fra UI/devtools.
  // Lavnivå: tar en tallrekke. Bruk calibrateMergeThresholdsForChamber
  // hvis du vil starte fra et chamber-objekt.
  function calibrateMergeThresholds(scores, options) {
    const raw = Array.isArray(scores) ? scores : [];
    const values = raw
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v))
      .sort((a, b) => a - b);

    if (!values.length) {
      return {
        ok: false,
        reason: "no_scores",
        count: 0,
        thresholds: { strict: 0.92, balanced: 0.85, broad: 0.75 }
      };
    }

    const opts = options || {};
    const q = (p) => {
      const n = values.length;
      if (n === 1) return values[0];
      const idx = Math.max(0, Math.min(n - 1, (n - 1) * p));
      const lo = Math.floor(idx);
      const hi = Math.ceil(idx);
      if (lo === hi) return values[lo];
      const t = idx - lo;
      return values[lo] * (1 - t) + values[hi] * t;
    };

    const floor = Number.isFinite(opts.min) ? Number(opts.min) : 0.5;
    const ceil = Number.isFinite(opts.max) ? Number(opts.max) : 0.99;
    const clamp = (v) => Math.max(floor, Math.min(ceil, Number(v)));

    const strict = clamp(q(0.9));
    const balanced = clamp(q(0.75));
    const broad = clamp(q(0.6));

    return {
      ok: true,
      count: values.length,
      min: values[0],
      max: values[values.length - 1],
      median: q(0.5),
      thresholds: {
        strict: Math.max(strict, balanced, broad),
        balanced: Math.max(Math.min(strict, balanced), broad),
        broad: Math.min(strict, balanced, broad)
      }
    };
  }

  // Henter embeddings fra Supabase for alle insights i chamberet (hopper
  // over de som har merged_into satt), grupperer på subject_id+theme_id,
  // beregner cosine for alle par innen samme gruppe, og returnerer rå
  // scores, histogram, topp-K mest like par, per-gruppe statistikk og
  // terskler. Ren analyse: ingen skriving, ingen merging.
  async function calibrateMergeThresholdsForChamber(chamber, options) {
    const opts = options || {};
    const insights = (chamber?.insights || []).filter(
      (i) => i && i.id && !i.merged_into
    );
    if (insights.length < 2) {
      return {
        ok: false,
        reason: "not_enough_insights",
        insight_count: insights.length
      };
    }

    const client = db();
    if (!client) return { ok: false, reason: "no_supabase" };
    const pid = await profileId();
    if (!pid) return { ok: false, reason: "not_signed_in" };

    const ids = insights.map((i) => i.id);
    const rows = [];
    const chunkSize = 500;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const slice = ids.slice(i, i + chunkSize);
      const { data, error } = await client
        .from(TABLE)
        .select("id, subject_id, theme_id, embedding")
        .in("id", slice);
      if (error) return { ok: false, error };
      if (data) rows.push(...data);
    }

    const byId = new Map();
    insights.forEach((ins) => byId.set(ins.id, ins));

    const items = [];
    for (const r of rows) {
      let vec = r.embedding;
      if (typeof vec === "string") {
        try { vec = JSON.parse(vec); } catch { vec = null; }
      }
      if (!Array.isArray(vec) || !vec.length) continue;
      const ins = byId.get(r.id);
      if (!ins) continue;
      let norm = 0;
      for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
      norm = Math.sqrt(norm);
      if (!Number.isFinite(norm) || norm === 0) continue;
      const unit = new Array(vec.length);
      for (let i = 0; i < vec.length; i++) unit[i] = vec[i] / norm;
      items.push({
        id: r.id,
        subject_id: r.subject_id || ins.subject_id || null,
        theme_id: r.theme_id || ins.theme_id || null,
        title: ins.title || "",
        summary: ins.summary || "",
        unit
      });
    }

    const missingEmbeddings = insights.length - items.length;

    if (items.length < 2) {
      return {
        ok: false,
        reason: "not_enough_embeddings",
        insight_count: insights.length,
        embedded_count: items.length,
        missing_embeddings: missingEmbeddings
      };
    }

    const groupKey = (it) => `${it.subject_id || ""}::${it.theme_id || ""}`;
    const groupMap = new Map();
    for (const it of items) {
      const k = groupKey(it);
      if (!groupMap.has(k)) groupMap.set(k, []);
      groupMap.get(k).push(it);
    }

    const scores = [];
    const allPairs = [];
    const groupStats = [];

    for (const [key, list] of groupMap) {
      if (list.length < 2) {
        groupStats.push({
          key,
          subject_id: list[0]?.subject_id || null,
          theme_id: list[0]?.theme_id || null,
          insight_count: list.length,
          pair_count: 0,
          min: null,
          median: null,
          max: null
        });
        continue;
      }
      const groupScores = [];
      for (let i = 0; i < list.length; i++) {
        const a = list[i].unit;
        for (let j = i + 1; j < list.length; j++) {
          const b = list[j].unit;
          let dot = 0;
          const len = a.length < b.length ? a.length : b.length;
          for (let k = 0; k < len; k++) dot += a[k] * b[k];
          if (dot > 1) dot = 1;
          else if (dot < -1) dot = -1;
          scores.push(dot);
          groupScores.push(dot);
          allPairs.push({
            a: list[i].id,
            b: list[j].id,
            score: dot,
            subject_id: list[i].subject_id || null,
            theme_id: list[i].theme_id || null,
            a_title: list[i].title,
            b_title: list[j].title
          });
        }
      }
      const sorted = groupScores.slice().sort((x, y) => x - y);
      const n = sorted.length;
      const median = n % 2
        ? sorted[(n - 1) / 2]
        : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
      groupStats.push({
        key,
        subject_id: list[0].subject_id || null,
        theme_id: list[0].theme_id || null,
        insight_count: list.length,
        pair_count: n,
        min: sorted[0],
        median,
        max: sorted[n - 1]
      });
    }

    if (!scores.length) {
      return {
        ok: false,
        reason: "no_pairs",
        insight_count: insights.length,
        embedded_count: items.length,
        missing_embeddings: missingEmbeddings,
        groups: groupStats,
        thresholds: { strict: 0.92, balanced: 0.85, broad: 0.75 }
      };
    }

    const binCount = Math.max(5, Math.min(Number(opts.bins) || 20, 100));
    const histLo = -1;
    const histHi = 1;
    const histogram = [];
    for (let i = 0; i < binCount; i++) {
      histogram.push({
        lo: histLo + (i * (histHi - histLo)) / binCount,
        hi: histLo + ((i + 1) * (histHi - histLo)) / binCount,
        count: 0
      });
    }
    for (const s of scores) {
      let idx = Math.floor(((s - histLo) / (histHi - histLo)) * binCount);
      if (idx >= binCount) idx = binCount - 1;
      else if (idx < 0) idx = 0;
      histogram[idx].count += 1;
    }

    const topK = Math.max(1, Math.min(Number(opts.topK) || 20, 200));
    const topPairs = allPairs
      .slice()
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    const calib = calibrateMergeThresholds(scores, opts);

    return {
      ok: true,
      insight_count: insights.length,
      embedded_count: items.length,
      missing_embeddings: missingEmbeddings,
      pair_count: scores.length,
      scores,
      histogram,
      topPairs,
      groups: groupStats,
      thresholds: calib.thresholds,
      stats: {
        min: calib.min,
        max: calib.max,
        median: calib.median
      }
    };
  }

  global.AHAEmbeddings = {
    embedAndStore,
    embedAllPending,
    findSimilarToText,
    findSimilarToInsight,
    health,
    isConfigured,
    calibrateMergeThresholds,
    calibrateMergeThresholdsForChamber,
    findMergeCandidate,
    buildEmbeddingText,
    DEFAULT_MODEL
  };
})(window);
