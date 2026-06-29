// server.js
// AHA-EchoNet AI-agent backend.
// Tjenestens eneste oppgave i denne første runden er å eksponere et
// embedding-endepunkt som klienten kan kalle i stedet for å snakke
// direkte mot Voyage. Det holder API-nøkkelen ute av nettleseren og
// gjør det enkelt å bytte leverandør senere uten å oppdatere klienten.

import express from "express";
import cors from "cors";
import OpenAI from "openai";
import dns from "node:dns/promises";
import net from "node:net";

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


const AHA_READER_USER_AGENT = "AHAReader/0.1 user-initiated transient article analysis";
const MAX_REDIRECTS = 4;
const FETCH_TIMEOUT_MS = 12000;

function normalizeWhitespace(value, max = 500) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function isPrivateIp(ip) {
  if (!ip) return true;
  if (ip === "::1" || ip.startsWith("fe80:") || ip.startsWith("fc") || ip.startsWith("fd")) return true;
  if (net.isIP(ip) === 4) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true;
  }
  return false;
}

async function validatePublicArticleUrl(rawUrl) {
  let parsed;
  try { parsed = new URL(String(rawUrl || "").trim()); }
  catch { return { ok: false, error: "invalid_url" }; }
  if (!["http:", "https:"].includes(parsed.protocol)) return { ok: false, error: "blocked_protocol" };
  const host = parsed.hostname.toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return { ok: false, error: "blocked_host" };
  if (net.isIP(host) && isPrivateIp(host)) return { ok: false, error: "blocked_private_ip" };
  try {
    const records = await dns.lookup(host, { all: true, verbatim: true });
    if (!records.length || records.some((record) => isPrivateIp(record.address))) return { ok: false, error: "blocked_private_dns" };
  } catch {
    return { ok: false, error: "dns_lookup_failed" };
  }
  return { ok: true, url: parsed.toString() };
}

async function fetchArticleHtml(url, redirects = 0) {
  const validation = await validatePublicArticleUrl(url);
  if (!validation.ok) return { ok: false, access_status: "blocked", error: validation.error, final_url: url };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(validation.url, {
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "User-Agent": AHA_READER_USER_AGENT,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5"
      }
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (redirects >= MAX_REDIRECTS) return { ok: false, access_status: "blocked", error: "too_many_redirects", final_url: validation.url };
      const location = response.headers.get("location");
      if (!location) return { ok: false, access_status: "blocked", error: "redirect_without_location", final_url: validation.url };
      return fetchArticleHtml(new URL(location, validation.url).toString(), redirects + 1);
    }
    if ([401, 402, 403].includes(response.status)) return { ok: false, access_status: response.status === 403 ? "blocked" : "paywall", error: `http_${response.status}`, final_url: validation.url };
    if (!response.ok) return { ok: false, access_status: "error", error: `http_${response.status}`, final_url: validation.url };
    const type = response.headers.get("content-type") || "";
    if (!/html|xml/i.test(type)) return { ok: false, access_status: "metadata_only", error: "not_html", final_url: validation.url };
    return { ok: true, html: await response.text(), final_url: validation.url };
  } catch (err) {
    return { ok: false, access_status: err?.name === "AbortError" ? "blocked" : "error", error: err?.name || "fetch_failed", final_url: validation.url };
  } finally {
    clearTimeout(timer);
  }
}

function readMeta(html, finalUrl) {
  const get = (re) => normalizeWhitespace((html.match(re) || [])[1] || "", 1000);
  const title = get(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i) || get(/<title[^>]*>([^<]+)/i);
  const description = get(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)/i);
  const canonical = get(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i) || finalUrl;
  const publisher = get(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)/i);
  const author = get(/<meta[^>]+(?:name|property)=["'](?:author|article:author)["'][^>]+content=["']([^"']+)/i);
  const published_at = get(/<meta[^>]+(?:name|property)=["'](?:article:published_time|date|pubdate)["'][^>]+content=["']([^"']+)/i);
  const image = get(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i);
  return { url: finalUrl, canonical_url: canonical, domain: new URL(finalUrl).hostname.replace(/^www\./, ""), publisher, title, description, author, published_at, image };
}

function stripHtmlToText(html) {
  return normalizeWhitespace(html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&"), 50000);
}

async function extractArticleText(html, url) {
  try {
    const [{ JSDOM }, { Readability }] = await Promise.all([import("jsdom"), import("@mozilla/readability")]);
    const dom = new JSDOM(html, { url });
    const article = new Readability(dom.window.document).parse();
    const text = normalizeWhitespace(article?.textContent || "", 50000);
    if (text.length >= 700) return { text, method: "readability" };
  } catch {}
  const fallback = stripHtmlToText(html);
  return { text: fallback.length >= 900 ? fallback : "", method: "html_text_fallback" };
}

function metadataCandidate() {
  return [{ title: "Kilde registrert", summary: "AHA fant metadata for lenken, men kunne ikke lese full artikkeltekst. Brukeren kan lime inn tekst manuelt for full analyse.", text: "Kilde registrert fra metadata. Full artikkeltekst ikke tilgjengelig.", functional_type: "observation", concepts: ["kilde", "metadata", "lenke"], candidate_type: "web_article_metadata" }];
}

function safeArticleAnalysisFallback(source, text) {
  const concepts = [...new Set(String(text || "").toLowerCase().match(/[a-zæøåA-ZÆØÅ][\wæøåÆØÅ-]{4,}/g) || [])].slice(0, 8);
  const summary = source.description || `AHA leste tilgjengelig tekst fra ${source.publisher || source.domain || "kilden"} transient og laget en kort avledet analyse.`;
  return { short_summary: summary, main_points: [summary], actors: [], claims: [], concepts, conflict_lines: [], possible_ahaavisa_angles: [], candidates: [{ title: source.title || "Analyse av webkilde", summary, text: `Avledet analyse av webkilden: ${summary}`, functional_type: "observation", concepts: concepts.slice(0, 5), candidate_type: "web_article_analysis" }] };
}

async function analyzeArticleTextForAha({ source, text }) {
  if (!openai) return safeArticleAnalysisFallback(source, text);
  const systemInstruction = "Du analyserer en artikkel for AHA. Returner KUN gyldig JSON. Ikke gjengi artikkelen. Ikke kopier lange utdrag. Ikke skriv markdown. Skill tydelig mellom hva artikkelen sier, hvilke påstander som fremmes, hvilke aktører som omtales, hvilke begreper som er sentrale, og hvilke mulige AHA-innsikter som kan lagres. Kandidater skal være avledet analyse, ikke rå avskrift.";
  const payload = JSON.stringify({ source, text, expected_json: { short_summary: "...", main_points: [], actors: [], claims: [{ claim: "...", speaker: "...", needs_verification: true }], concepts: [], conflict_lines: [], possible_ahaavisa_angles: [], candidates: [] } });
  try {
    const response = openai.responses && typeof openai.responses.create === "function"
      ? await openai.responses.create({ model: OPENAI_MODEL, input: [{ role: "system", content: systemInstruction }, { role: "user", content: payload }] })
      : null;
    const raw = response?.output_text || "{}";
    const parsed = JSON.parse(raw);
    return Object.assign(safeArticleAnalysisFallback(source, text), parsed, { candidates: safeParseJsonCandidatePayload({ candidates: parsed.candidates }).map((c) => sanitizeInsightCandidate(Object.assign({}, c, { candidate_type: "web_article_analysis" }), parsed.short_summary)).filter(Boolean).slice(0, 5) });
  } catch (err) {
    console.warn("[aha-agent] analyze-url OpenAI analyse feilet", err?.message || err);
    return safeArticleAnalysisFallback(source, text);
  }
}


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
    const memoryContext = body.memory_context && typeof body.memory_context === "object" && !Array.isArray(body.memory_context) ? body.memory_context : null;
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
      "Bruk memory_context og minnebærende deler av AHA-state bare når de finnes og er relevante.",
      "Hvis memory_context er null, svar primært på brukerens nåværende melding.",
      "Ikke nevn minne i svaret med mindre det forklarer hvorfor svaret bygger videre på tidligere arbeid.",
      "Ikke overstyr brukerens nye melding med gamle innsikter; ved konflikt prioriterer du ny melding og kan kort si at tidligere retning ser ut til å være endret.",
      "Ikke bruk minne som fasit; bruk det som diskret kontekst.",
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
      memory_context: memoryContext,
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


app.post("/api/aha-agent/analyze-url", async (req, res) => {
  try {
    const body = req.body || {};
    if (body.mode !== "transient_article_analysis_v1") return res.status(400).json({ ok: false, error: "invalid_mode" });
    if (body.return_raw_text !== false) return res.status(400).json({ ok: false, error: "return_raw_text_must_be_false" });
    const validation = await validatePublicArticleUrl(body.url);
    if (!validation.ok) return res.status(400).json({ ok: false, access_status: "blocked", error: validation.error, policy: { raw_article_stored: false, raw_article_returned: false, transient_fulltext_read: false } });
    const fetched = await fetchArticleHtml(validation.url);
    if (!fetched.ok || !fetched.html) {
      const finalUrl = fetched.final_url || validation.url;
      const source = { url: validation.url, canonical_url: finalUrl, domain: new URL(finalUrl).hostname.replace(/^www\./, ""), publisher: "", title: finalUrl, description: "", author: "", published_at: "", image: "" };
      return res.json({ ok: true, access_status: fetched.access_status || "error", source, analysis: { short_summary: "Full artikkeltekst var ikke tilgjengelig for AHA.", main_points: [], actors: [], claims: [], concepts: ["kilde", "metadata", "lenke"], conflict_lines: [], possible_ahaavisa_angles: [] }, candidates: metadataCandidate(), policy: { raw_article_stored: false, raw_article_returned: false, transient_fulltext_read: false } });
    }
    const source = readMeta(fetched.html, fetched.final_url);
    const extracted = await extractArticleText(fetched.html, fetched.final_url);
    const maxChars = Math.min(Math.max(Number(body.max_analysis_chars) || 12000, 1000), 12000);
    const articleText = String(extracted.text || "").slice(0, maxChars);
    const paywallLikely = /abonnement|logg inn|betalingsmur|subscribe|subscription|sign in/i.test(articleText.slice(0, 2000));
    if (!articleText || paywallLikely) {
      const status = paywallLikely ? "paywall" : "metadata_only";
      return res.json({ ok: true, access_status: status, source: Object.assign(source, { extraction_method: extracted.method }), analysis: { short_summary: status === "paywall" ? "Kilden ser ut til å kreve innlogging eller abonnement." : "Full artikkeltekst var ikke tilgjengelig for AHA.", main_points: [], actors: [], claims: [], concepts: ["kilde", "metadata", "lenke"], conflict_lines: [], possible_ahaavisa_angles: [] }, candidates: metadataCandidate(), policy: { raw_article_stored: false, raw_article_returned: false, transient_fulltext_read: false } });
    }
    const analysisWithCandidates = await analyzeArticleTextForAha({ source, text: articleText });
    const { candidates, ...analysis } = analysisWithCandidates;
    return res.json({ ok: true, access_status: "full", source: Object.assign(source, { extraction_method: extracted.method }), analysis, candidates: Array.isArray(candidates) && candidates.length ? candidates : safeArticleAnalysisFallback(source, articleText).candidates, policy: { raw_article_stored: false, raw_article_returned: false, transient_fulltext_read: true } });
  } catch (err) {
    console.error("[aha-agent] analyze-url crashed", err);
    return res.status(500).json({ ok: false, access_status: "error", error: "internal_error", policy: { raw_article_stored: false, raw_article_returned: false, transient_fulltext_read: false } });
  }
});

app.use((_req, res) => res.status(404).json({ ok: false, error: "not_found" }));

app.listen(PORT, () => {
  console.log(`[aha-agent] listening on :${PORT} (model ${VOYAGE_MODEL})`);
});
