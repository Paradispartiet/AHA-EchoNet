// server.js
// AHA-EchoNet AI-agent backend.
// Tjenestens eneste oppgave i denne første runden er å eksponere et
// embedding-endepunkt som klienten kan kalle i stedet for å snakke
// direkte mot Voyage. Det holder API-nøkkelen ute av nettleseren og
// gjør det enkelt å bytte leverandør senere uten å oppdatere klienten.

import express from "express";
import cors from "cors";
import OpenAI from "openai";

const PORT = Number(process.env.PORT || 3030);
const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const VOYAGE_MODEL = process.env.VOYAGE_MODEL || "voyage-multilingual-2";
const VOYAGE_URL = process.env.VOYAGE_URL || "https://api.voyageai.com/v1/embeddings";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ||
  "https://paradispartiet.github.io,http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173"
).split(",").map((s) => s.trim()).filter(Boolean);

if (!VOYAGE_API_KEY) {
  console.warn("[aha-agent] VOYAGE_API_KEY er ikke satt – /embed vil feile.");
}
if (!OPENAI_API_KEY) {
  console.warn("[aha-agent] OPENAI_API_KEY er ikke satt – /chat vil feile.");
}

const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

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
    has_openai_key: Boolean(OPENAI_API_KEY),
    openai_model: OPENAI_MODEL,
    has_voyage_key: Boolean(VOYAGE_API_KEY),
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

app.post("/api/aha-agent/chat", async (req, res) => {
  try {
    if (!OPENAI_API_KEY || !openai) {
      return res.status(503).json({ ok: false, error: "missing_openai_api_key" });
    }

    const body = req.body || {};
    const message = body.message;
    const aiState = body.ai_state && typeof body.ai_state === "object" ? body.ai_state : {};
    const similarInsights = Array.isArray(body.similar_insights) ? body.similar_insights : [];
    const profile = body.profile && typeof body.profile === "object" ? body.profile : {};

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ ok: false, error: "invalid_message" });
    }
    if (body.ai_state != null && (typeof body.ai_state !== "object" || Array.isArray(body.ai_state))) {
      return res.status(400).json({ ok: false, error: "invalid_ai_state" });
    }

    const systemInstruction = "Du er AHA-agenten. Du er ikke en generell chatbot. Du svarer ut fra AHA-state: innsikter, begreper, metaprofil, dimensjoner, narrativ, lignende innsikter og brukerens egne data. Du skal hjelpe brukeren å forstå hva materialet deres viser. Svar kort, presist og strukturerende.\n\nSvar alltid med disse fire delene:\n1. Kort svar\n2. Hva AHA ser\n3. Begreper / mønstre\n4. Neste beste spørsmål eller læringssteg";

    const userPayload = JSON.stringify({
      message: message.trim(),
      ai_state: aiState,
      similar_insights: similarInsights,
      profile
    });

    let reply = "";
    let model = OPENAI_MODEL;
    let responseId = null;

    if (openai.responses && typeof openai.responses.create === "function") {
      const response = await openai.responses.create({
        model: OPENAI_MODEL,
        input: [
          { role: "system", content: systemInstruction },
          { role: "user", content: userPayload }
        ]
      });
      reply = response.output_text || "";
      model = response.model || OPENAI_MODEL;
      responseId = response.id || null;
    } else {
      const completion = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: userPayload }
        ]
      });
      reply = completion.choices?.[0]?.message?.content || "";
      model = completion.model || OPENAI_MODEL;
      responseId = completion.id || null;
    }

    res.json({
      ok: true,
      reply,
      model,
      response_id: responseId
    });
  } catch (err) {
    console.error("[aha-agent] chat crashed", err);
    res.status(500).json({
      ok: false,
      error: "openai_error",
      message: err?.message || "Unknown OpenAI error",
      status: err?.status || err?.code || null,
      type: err?.type || null
    });
  }
});

app.use((_req, res) => res.status(404).json({ ok: false, error: "not_found" }));

app.listen(PORT, () => {
  console.log(`[aha-agent] listening on :${PORT} (model ${VOYAGE_MODEL})`);
});
