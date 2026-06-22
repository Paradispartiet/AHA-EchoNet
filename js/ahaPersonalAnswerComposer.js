// AHA Personal Answer Composer V1 – samler personlig kontekst, retrieval og kilder til svargrunnlag.
(function (global) {
  "use strict";

  const VERSION = "v1";
  const DEFAULT_QUERY = "Hva vet AHA om mine viktigste prosjekter og begreper?";
  const INTENTS = ["question","project_status","planning","reflection","writing_help","technical_help","training_model","meta_insight","unknown"];

  function asArray(value) { return Array.isArray(value) ? value : []; }
  function asObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function asText(value) { return String(value ?? "").trim(); }
  function oneLine(value) { return asText(value).replace(/\s+/g, " "); }
  function truncate(value, max = 220) { const text = oneLine(value); return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1)).trim()}…`; }
  function safeCall(fn, fallback) { try { return typeof fn === "function" ? fn() : fallback; } catch { return fallback; } }
  function unique(values) { return [...new Set(asArray(values).map(oneLine).filter(Boolean))]; }
  function nowIso(options = {}) { return new Date(options.now || Date.now()).toISOString(); }
  function normalizedQuery(value) { return oneLine(value).toLowerCase(); }

  function detectAnswerIntent(userMessage, context = {}) {
    const text = normalizedQuery(userMessage);
    if (!text) return "unknown";
    const rules = [
      ["project_status", /\b(hvor er vi|status|hva nå|ståa|fremdrift|framdrift)\b/i],
      ["planning", /\b(lag prompt|planlegg|neste|plan|veikart|roadmap|prioriter)\b/i],
      ["reflection", /\b(hva betyr|er dette smart|hva tror du|reflekter|vurder)\b/i],
      ["writing_help", /\b(skriv|formuler|tekst|utkast|omskriv|tone)\b/i],
      ["technical_help", /\b(feil|bug|kode|repo|pr|pull request|test|implementer)\b/i],
      ["training_model", /\b(modell|trening|fine-tuning|finjustering|rag|retrieval|embedding)\b/i],
      ["meta_insight", /\b(meta insight|selvinnsikt|aha ser|selvmodell|mønster)\b/i]
    ];
    const match = rules.find(([, pattern]) => pattern.test(text));
    if (match) return match[0];
    return /\?$|\b(hva|hvordan|hvorfor|hvem|når|kan du)\b/i.test(text) ? "question" : "unknown";
  }

  function normalizeSource(item, index = 0) {
    const src = asObject(item);
    const score = Number(src.hybridScore ?? src.score ?? src.semanticScore ?? src.lexicalScore) || 0;
    return {
      id: asText(src.id) || `answer-source-${index + 1}`,
      source: asText(src.source),
      sourceId: asText(src.sourceId),
      sourceType: asText(src.sourceType),
      title: truncate(src.title || src.excerpt || src.sourceType || "Personlig kilde", 120),
      excerpt: truncate(src.excerpt || src.text || src.title, 260),
      score,
      lexicalScore: Number(src.lexicalScore ?? src.score) || 0,
      semanticScore: Number(src.semanticScore) || 0,
      hybridScore: Number(src.hybridScore ?? score) || 0,
      reasons: unique(src.reasons).slice(0, 8),
      project: oneLine(src.project),
      concepts: unique(src.concepts).slice(0, 8),
      taskType: asText(src.taskType)
    };
  }

  function sourceBonus(source, intent) {
    let bonus = 0;
    const type = source.sourceType;
    if (type === "confirmed_claim") bonus += 0.35;
    if (type === "important_claim") bonus += 0.28;
    if (source.source === "training_corpus" || type === "corpus_item") bonus += 0.18;
    if (source.source === "training_examples" || type === "training_example") bonus += 0.16;
    if (source.project) bonus += 0.08;
    if (source.concepts.length) bonus += 0.06;
    if (intent === "writing_help" && /style|project|example/.test(`${source.taskType} ${type}`)) bonus += 0.25;
    if (["project_status", "planning"].includes(intent) && /memory_fact|project_explanation|confirmed_claim|important_claim/.test(`${source.taskType} ${type}`)) bonus += 0.25;
    return bonus;
  }

  function selectSourcesForAnswer(results, options = {}) {
    const intent = asText(options.intent) || "unknown";
    const max = Math.min(6, Math.max(3, Number(options.limit) || 6));
    const seen = new Set();
    return asArray(results)
      .map(normalizeSource)
      .filter((source) => source.source || source.title || source.excerpt)
      .filter((source) => { const key = source.id || `${source.source}:${source.sourceId}:${source.title}`; if (seen.has(key)) return false; seen.add(key); return true; })
      .map((source) => ({ ...source, _rank: (Number(source.hybridScore) || Number(source.score) || 0) + sourceBonus(source, intent) }))
      .sort((a, b) => b._rank - a._rank || a.title.localeCompare(b.title))
      .slice(0, max)
      .map(({ _rank, ...source }) => source);
  }

  function buildAnswerPlan(userMessage, answerContext = {}) {
    const intent = asText(answerContext.answerIntent) || detectAnswerIntent(userMessage, answerContext);
    const modes = { project_status: "grounded_status", planning: "step_plan", reflection: "reflective_answer", writing_help: "technical_prompt", technical_help: "technical_prompt", training_model: "source_based_answer", meta_insight: "source_based_answer", question: "direct_answer", unknown: "direct_answer" };
    const sectionsByIntent = {
      project_status: ["kort svar", "relevant personlig grunnlag", "vurdering", "neste steg", "kilder brukt"],
      planning: ["kort svar", "svarplan", "neste steg", "kontrollpunkter", "kilder brukt"],
      reflection: ["kort svar", "relevant personlig grunnlag", "vurdering", "neste steg"],
      writing_help: ["kort svar", "prompt", "kontrollpunkter", "kilder brukt"],
      technical_help: ["kort svar", "vurdering", "neste steg", "kontrollpunkter"],
      training_model: ["kort svar", "relevant personlig grunnlag", "vurdering", "neste steg", "kilder brukt"],
      meta_insight: ["kort svar", "relevant personlig grunnlag", "vurdering", "neste steg", "kilder brukt"]
    };
    return {
      intent,
      responseMode: modes[intent] || "direct_answer",
      sections: sectionsByIntent[intent] || ["kort svar", "vurdering", "neste steg"],
      sourceUse: "Bruk valgte kilder som grunnlag når de faktisk støtter svaret; nevn usikkerhet ved svake treff.",
      cautions: ["Ikke overdriv personlig grunnlag.", "Skill godkjent materiale fra egen vurdering."],
      suggestedFollowup: intent === "planning" ? "Velg ett konkret neste steg og gjør det målbart." : "Gi ett presist neste steg."
    };
  }

  function summarizePersonal(personalContext, memorySummary, readiness) {
    const ctx = asObject(personalContext?.context || personalContext);
    const active = asObject(ctx.activeSelfModel);
    const claims = unique(active.confirmedClaims || asArray(memorySummary?.confirmedClaims).map((c) => c?.claimText || c?.text || c)).slice(0, 3);
    const projects = unique(asArray(ctx.projects).map((p) => p?.label || p)).slice(0, 3);
    const level = asText(ctx.readiness?.level || readiness?.level);
    return [claims.length ? `Selvinnsikt: ${claims.join("; ")}.` : "Selvinnsikt: ingen sterke relevante claims funnet.", projects.length ? `Prosjekter: ${projects.join("; ")}.` : "Prosjekter: ingen tydelige prosjekter funnet.", level ? `Readiness: ${level}.` : ""].filter(Boolean).join("\n");
  }

  function buildComposerPrompt(answerContext, options = {}) {
    const ctx = asObject(answerContext);
    const maxLength = Math.min(2500, Math.max(1800, Number(options.maxLength) || 2200));
    const sources = asArray(ctx.selectedSources).slice(0, 6);
    const plan = asObject(ctx.answerPlan);
    const sourceLines = sources.length ? sources.map((s, i) => `${i + 1}. ${s.title} (${s.sourceType || s.source}) — ${truncate(s.excerpt, 150)} Reasons: ${unique(s.reasons).slice(0, 3).join("; ") || "relevant treff"}.`).join("\n") : "Ingen sterke godkjente retrieval-kilder funnet.";
    return truncate([
      "AHA Personal Answer Composer:",
      "Brukerens melding:", truncate(ctx.userMessage, 260), "",
      "Intensjon:", ctx.answerIntent || "unknown", "",
      "Relevant personlig grunnlag:", truncate(summarizePersonal(ctx.personalContext, ctx.evidence?.memorySummary, ctx.evidence?.readinessReport), 420), "",
      "Relevante kilder:", sourceLines, "",
      "Svarplan:", `Modus: ${plan.responseMode || "direct_answer"}. Seksjoner: ${asArray(plan.sections).join(", ")}. ${plan.sourceUse || ""}`, "",
      "Svarinstruks:", "Svar som AHA. Bruk den personlige konteksten når den er relevant. Skill mellom det som er hentet fra godkjent materiale og din egen vurdering. Gi et presist neste steg.", "",
      "Svaroppgave:", "Gi et presist, nyttig og personlig AHA-svar basert på materialet over."
    ].join("\n"), maxLength);
  }

  function composeLocalAnswerPreview(answerContext, options = {}) {
    const ctx = asObject(answerContext); const plan = asObject(ctx.answerPlan); const sources = asArray(ctx.selectedSources).slice(0, 4);
    return { title: `AHA svargrunnlag: ${ctx.answerIntent || "ukjent"}`, summary: sources.length ? `Composer fant ${sources.length} relevante kilder og foreslår ${plan.responseMode || "direct_answer"}.` : `Composer foreslår ${plan.responseMode || "direct_answer"}, men uten sterke kildetreff.`, bullets: asArray(plan.sections).slice(0, 5).map((s) => `Svar med seksjon: ${s}`), sourcesUsed: sources.map((s) => ({ source: s.source, sourceId: s.sourceId, sourceType: s.sourceType, title: s.title, reasons: s.reasons })), nextStep: plan.suggestedFollowup || "Gi ett presist neste steg." };
  }

  function collectResults(retrieval, semanticRetrieval, hybrid) { return asArray(retrieval?.results).concat(asArray(semanticRetrieval?.results), asArray(hybrid?.results)); }

  function buildAnswerContext(userMessage, options = {}) {
    const clean = oneLine(userMessage);
    const personalContext = safeCall(() => global.AHAChatPersonalContext?.buildMessageContext?.(clean, options), null);
    const retrieval = safeCall(() => global.AHAPersonalRetrieval?.buildRagContext?.(clean, { ...options, forceLexical: options.forceLexical === true }), null);
    const semanticRetrieval = safeCall(() => global.AHASemanticRetrieval?.buildSemanticRagContext?.(clean, options), null);
    const hybrid = safeCall(() => global.AHASemanticRetrieval?.hybridSearch?.(clean, { ...options, limit: 8, minScore: 0 }), null);
    const memorySummary = safeCall(() => global.AHAMetaInsightsMemory?.summarizeMemory?.(), {});
    const readinessReport = safeCall(() => global.AHAPersonalModelReadiness?.buildReadinessReport?.(), {});
    const answerIntent = detectAnswerIntent(clean, { personalContext, retrieval, semanticRetrieval });
    const selectedSources = selectSourcesForAnswer(collectResults(retrieval || personalContext?.retrieval, semanticRetrieval, hybrid), { intent: answerIntent, limit: options.limit || 6 });
    const base = { generatedAt: nowIso(options), version: VERSION, userMessage: clean, personalContext, retrieval: retrieval || personalContext?.retrieval || null, semanticRetrieval: semanticRetrieval || hybrid || null, selectedSources, answerIntent, answerPlan: null, promptBlock: "", evidence: { memorySummary, readinessReport, hybridRetrieval: hybrid } };
    base.answerPlan = buildAnswerPlan(clean, base);
    base.promptBlock = buildComposerPrompt(base, options);
    return base;
  }

  function buildAnswerPackage(userMessage, options = {}) {
    const context = buildAnswerContext(userMessage || DEFAULT_QUERY, options);
    const localPreview = composeLocalAnswerPreview(context, options);
    const status = { hasPersonalContext: Boolean(context.personalContext?.prompt || context.personalContext?.context), hasRetrieval: Boolean(asArray(context.retrieval?.results).length), hasSemanticRetrieval: Boolean(asArray(context.semanticRetrieval?.results).length || asArray(context.evidence?.hybridRetrieval?.results).length), selectedSourceCount: asArray(context.selectedSources).length, intent: context.answerIntent, ready: Boolean(context.promptBlock && context.answerPlan) };
    return { generatedAt: context.generatedAt, userMessage: context.userMessage, context, prompt: context.promptBlock, localPreview, status };
  }

  global.AHAPersonalAnswerComposer = { VERSION, DEFAULT_QUERY, INTENTS, buildAnswerContext, detectAnswerIntent, buildAnswerPlan, selectSourcesForAnswer, buildComposerPrompt, composeLocalAnswerPreview, buildAnswerPackage };
})(typeof window !== "undefined" ? window : globalThis);
