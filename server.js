// server.js
// AHA-EchoNet AI-agent backend.
// Tjenestens eneste oppgave i denne første runden er å eksponere et
// embedding-endepunkt som klienten kan kalle i stedet for å snakke
// direkte mot Voyage. Det holder API-nøkkelen ute av nettleseren og
// gjør det enkelt å bytte leverandør senere uten å oppdatere klienten.

import express from "express";
import cors from "cors";

const PORT = Number(process.env.PORT || 3030);
const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
const VOYAGE_MODEL = process.env.VOYAGE_MODEL || "voyage-multilingual-2";
const VOYAGE_URL = process.env.VOYAGE_URL || "https://api.voyageai.com/v1/embeddings";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ||
  "https://paradispartiet.github.io,http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173"
).split(",").map((s) => s.trim()).filter(Boolean);

if (!VOYAGE_API_KEY) {
  console.warn("[aha-agent] VOYAGE_API_KEY er ikke satt – /embed vil feile.");
}

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes("*")) return cb(null, true);
      cb(new Error("Origin ikke tillatt: " + origin));
    },
    credentials: false,
    methods: ["GET", "POST", "OPTIONS"]
  })
);

app.get("/api/aha-agent/health", (_req, res) => {
  res.json({
    ok: true,
    service: "aha-agent",
    embed_model: VOYAGE_MODEL,
    has_key: Boolean(VOYAGE_API_KEY),
    time: new Date().toISOString()
  });
});

app.post("/api/aha-agent/embed", async (req, res) => {
  try {
    if (!VOYAGE_API_KEY) {
      return res.status(503).json({ ok: false, error: "missing_api_key" });
    }

    const body = req.body || {};
    const texts = Array.isArray(body.texts)
      ? body.texts
      : typeof body.text === "string"
        ? [body.text]
        : null;

    if (!texts || !texts.length) {
      return res.status(400).json({ ok: false, error: "missing_texts" });
    }
    if (texts.length > 64) {
      return res.status(400).json({ ok: false, error: "too_many_texts", limit: 64 });
    }
    if (texts.some((t) => typeof t !== "string" || !t.trim())) {
      return res.status(400).json({ ok: false, error: "invalid_text_in_batch" });
    }

    const inputType = body.input_type === "query" ? "query" : "document";

    const upstream = await fetch(VOYAGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${VOYAGE_API_KEY}`
      },
      body: JSON.stringify({
        input: texts.map((t) => t.slice(0, 8000)),
        model: VOYAGE_MODEL,
        input_type: inputType
      })
    });

    if (!upstream.ok) {
      const errBody = await upstream.text();
      console.warn("[aha-agent] Voyage error", upstream.status, errBody.slice(0, 500));
      return res.status(502).json({ ok: false, error: "upstream_error", status: upstream.status });
    }

    const json = await upstream.json();
    const embeddings = (json.data || [])
      .sort((a, b) => (a.index || 0) - (b.index || 0))
      .map((d) => d.embedding);

    res.json({
      ok: true,
      model: json.model || VOYAGE_MODEL,
      dim: embeddings[0]?.length || 0,
      embeddings,
      usage: json.usage || null
    });
  } catch (err) {
    console.error("[aha-agent] embed crashed", err);
    res.status(500).json({ ok: false, error: "internal_error" });
  }
});

app.use((_req, res) => res.status(404).json({ ok: false, error: "not_found" }));

app.listen(PORT, () => {
  console.log(`[aha-agent] listening on :${PORT} (model ${VOYAGE_MODEL})`);
});
