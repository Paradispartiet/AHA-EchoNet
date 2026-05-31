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
  console.warn("[aha-agent] OPENAI_API_KEY er ikke satt – /chat og /insight-candidates vil feile.");
}

const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;


const INSIGHT_FUNCTIONAL_TYPES = new Set([
  "principle",
  "observation",
  "pattern",
  "question",
  "problem",
  "solution",
  "learning_point",
  "definition",
  "contradiction",
  "memory",
  "task",
  "decision"
]);

function parseCandidatePayload(raw, depth = 0) {
  if (depth > 3 || raw == null) return [];
  if (Array.isArray(raw)) return raw;

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      return parseCandidatePayload(JSON.parse(trimmed), depth + 1);
    } catch {
      return [];
    }
  }

  if (typeof raw !== "object") return [];
  if (Array.isArray(raw.candidates)) return raw.candidates;
  if (typeof raw.output_text === "string") return parseCandidatePayload(raw.output_text, depth + 1);
  return [];
}

function safeParseJsonCandidatePayload(raw) {
  return parseCandidatePayload(raw);
}

function sanitizeInsightCandidate(candidate, fallbackText) {
  if (!candidate || typeof candidate !== "object") return null;
  const normalizedText = typeof candidate.text === "string" ? candidate.text : "";
  const normalizedSummary = typeof candidate.summary === "string" ? candidate.summary : "";
  const rawText = String(normalizedText || normalizedSummary || fallbackText || "").replace(/\s+/g, " ").trim();
  if (!rawText) return null;

  const rawSummary = String(normalizedSummary || rawText).replace(/\s+/g, " ").trim();
  const titleSource = rawSummary || rawText;
  const derivedTitle = String(titleSource.split(/[.!?…]/)[0] || "").replace(/\s+/g, " ").trim();
  const rawTitle = String(candidate.title || derivedTitle).replace(/\s+/g, " ").trim();
  if (!rawTitle || !rawSummary) return null;

  const functionalType = INSIGHT_FUNCTIONAL_TYPES.has(candidate.functional_type)
    ? candidate.functional_type
    : "observation";

  const concepts = (Array.isArray(candidate.concepts) ? candidate.concepts : [])
    .map((item) => String(item || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 8);
  const thinkers = (Array.isArray(candidate.thinkers) ? candidate.thinkers : [])
    .map((item) => String(item || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 5);
  const theories = (Array.isArray(candidate.theories) ? candidate.theories : [])
    .map((item) => String(item || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 5);
  const traditions = (Array.isArray(candidate.traditions) ? candidate.traditions : [])
    .map((item) => String(item || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 5);
  const theoretical_links = (Array.isArray(candidate.theoretical_links) ? candidate.theoretical_links : [])
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const name = String(item.name || "").replace(/\s+/g, " ").trim();
      const relation = String(item.relation || "").replace(/\s+/g, " ").trim();
      if (!name || !relation) return null;
      return { name: name.slice(0, 120), relation: relation.slice(0, 240) };
    })
    .filter(Boolean)
    .slice(0, 5);

  return {
    title: rawTitle.slice(0, 140),
    summary: rawSummary.slice(0, 320),
    text: rawText.slice(0, 1200),
    functional_type: functionalType,
    concepts,
    thinkers,
    theories,
    traditions,
    theoretical_links,
    candidate_type: "ai"
  };
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

    const systemInstruction = [
      "Du er AHA Chat, samtalelaget i AHA.",
      "Svar med ett samlet hovedsvar i naturlig språk.",
      "Bruk AHA-state, innsikter, begreper, metaprofil, dimensjoner, narrativ, lignende innsikter og brukerens egne data som kontekst.",
      "Ikke vis hele innsiktsmotoren som hovedsvar.",
      "Ikke svar automatisk med faste seksjoner som ‘Kort svar’, ‘Hva AHA ser’, ‘Begreper / mønstre’ og ‘Neste beste spørsmål’.",
      "Ikke vis JSON.",
      "Ikke presenter stier, lister, begreper, kart eller eksport med mindre brukeren eksplisitt ber om det.",
      "Velg passende svarlengde: kort når brukeren ber om kort svar, oppsummering, ja/nei, ‘hva nå?’, ‘er dette riktig?’ eller lignende; normalt for vanlige spørsmål og forklaringer; grundig når brukeren ber om plan, vurdering, arkitektur, analyse, ‘forklar grundig’, eller når spørsmålet er komplekst.",
      "Du kan avslutte med ett praktisk neste steg når det er relevant.",
      "Svar på norsk dersom brukeren skriver norsk."
    ].join("\n");

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


app.post("/api/aha-agent/insight-candidates", async (req, res) => {
  try {
    if (!OPENAI_API_KEY || !openai) {
      return res.status(503).json({ ok: false, error: "missing_openai_api_key" });
    }

    const body = req.body || {};
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const context = body.context;

    if (!text) return res.status(400).json({ ok: false, error: "invalid_text" });
    if (text.length > 8000) return res.status(400).json({ ok: false, error: "text_too_long", limit: 8000 });
    if (context != null && (typeof context !== "object" || Array.isArray(context))) {
      return res.status(400).json({ ok: false, error: "invalid_context" });
    }

    const systemInstruction = "Du lager insight candidates for AHA. Returner KUN gyldig JSON, uten markdown eller forklarende tekst utenfor JSON. Returner et objekt med feltet candidates (array). Lag 2–5 candidates for mellomlange eller lange tekster, og 1–3 for korte tekster. Ikke bruk generiske titler som «Observasjon», «Innsikt» eller «Analyse» når teksten har tydelig tema. Hver candidate skal ha presis norsk title og summary (1–2 setninger) som tilfører semantisk verdi, ikke rå avskrift av tekststarten. Concepts skal være korte, konkrete og meningsfulle begreper. functional_type må være en av: principle, observation, pattern, question, problem, solution, learning_point, definition, contradiction, memory, task, decision. Hvis teksten handler om lek, byrom, offentlighet, fellesskap, hverdagsliv eller læring, skal minst én relevant candidate få teorikobling når det faglig passer. Vurder særlig Johan Huizinga, D.W. Winnicott, Jane Jacobs, Henri Lefebvre og Richard Sennett. Bruk teorikoblinger bare når de faktisk passer teksten. theoretical_links skal være objekter med feltene name og relation, der relation forklarer hvorfor koblingen passer.";
    const userPayload = JSON.stringify({
      text,
      context: context || {},
      format: body.format || "insight_candidates_v1"
    });

    let model = OPENAI_MODEL;
    let responseId = null;
    let parsedPayload = null;
    let rawOutputPreview = "";

    if (openai.responses && typeof openai.responses.create === "function") {
      const response = await openai.responses.create({
        model: OPENAI_MODEL,
        input: [
          { role: "system", content: systemInstruction },
          { role: "user", content: userPayload }
        ]
      });
      model = response.model || OPENAI_MODEL;
      responseId = response.id || null;
      rawOutputPreview = String(response.output_text || "").slice(0, 400);
      parsedPayload = response.output_text || "";
    } else {
      const completion = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: userPayload }
        ]
      });
      model = completion.model || OPENAI_MODEL;
      responseId = completion.id || null;
      const rawContent = completion.choices?.[0]?.message?.content || "{}";
      try {
        parsedPayload = JSON.parse(rawContent);
      } catch {
        parsedPayload = null;
      }
    }

    const rawCandidates = safeParseJsonCandidatePayload(parsedPayload);
    const candidates = rawCandidates
      .map((item) => sanitizeInsightCandidate(item, text))
      .filter(Boolean)
      .slice(0, 5);
    const responseBody = {
      ok: true,
      candidates,
      model,
      response_id: responseId
    };

    if (process.env.NODE_ENV !== "production") {
      responseBody.debug = {
        raw_output_preview: rawOutputPreview,
        raw_candidate_count: rawCandidates.length,
        sanitized_candidate_count: candidates.length
      };
    }

    return res.json(responseBody);
  } catch (err) {
    console.error("[aha-agent] insight-candidates crashed", err);
    return res.status(500).json({
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
