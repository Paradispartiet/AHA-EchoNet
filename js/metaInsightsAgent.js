// metaInsightsAgent.js
// ─────────────────────────────────────────────
// AHA Meta Insights Agent – AI-agenten for selvforståelse.
// Bindeleddet mellom den algoritmiske meta-profilen (MetaInsightsEngine),
// AI-prompten i AHA Chat, strukturert AI-respons, brukerfeedback og
// meta-minnet (AHAMetaInsightsMemory).
//
// Dataflyt: brukerdata → innsikter → algoritmisk meta-profil →
// MetaInsightsAgent → hypoteser → brukerbekreftelse → meta-minne →
// bedre fremtidig innsikt.
// ─────────────────────────────────────────────

(function (global) {
  "use strict";

  const AGENT_ID = "aha_meta_insights_ai";
  const AGENT_VERSION = "v1";
  const SESSION_TYPE = "meta_insights_ai_session";
  const SESSION_SOURCE = "meta_insights_agent";
  const PENDING_CHAT_PROMPT_KEY = "aha_pending_chat_prompt_v1";
  const FEEDBACK_OPTIONS = ["stemmer", "delvis", "feil", "viktig", "utdatert"];

  function asArray(value) { return Array.isArray(value) ? value : []; }
  function asObject(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function asText(value) { return String(value ?? "").trim(); }

  function makeId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function nowIso(options) {
    const now = options && options.now ? new Date(options.now) : new Date();
    return now.toISOString();
  }

  // Kompakt kopi av meta_insight-laget – nok til at AI-agenten kan
  // resonnere, uten å sende hele den rå profilen.
  function buildProfileSnapshot(profile) {
    const meta = asObject(profile.meta_insight);
    return {
      meta_insight: {
        generated_at: asText(meta.generated_at),
        summary: asText(meta.summary),
        readiness: asObject(meta.readiness)
      },
      dominant_themes: asArray(meta.dominant_themes).slice(0, 5),
      dominant_concepts: asArray(meta.dominant_concepts).slice(0, 8),
      learning_mode: asText(meta.learning_mode),
      recurring_patterns: asArray(meta.recurring_patterns).slice(0, 5),
      tension_summary: meta.tension_summary || null,
      project_signals: asArray(meta.project_signals).slice(0, 4),
      next_actions: asArray(meta.next_actions).slice(0, 5)
    };
  }

  function countRecommendations(profile) {
    const rec = asObject(profile.recommendations);
    return (
      asArray(rec.next_topics).length +
      asArray(rec.resurface_insights).length +
      asArray(rec.underexplored_concepts).length +
      asArray(rec.bridging_pairs).length +
      asArray(rec.unstick_prompts).length +
      asArray(rec.emne_suggestions).length
    );
  }

  function buildAlgorithmicSummary(profile) {
    const meta = asObject(profile.meta_insight);
    const readiness = asObject(meta.readiness);
    const temporal = asObject(profile.temporal);
    return {
      readiness: { level: asText(readiness.level) || "ukjent", score: Number(readiness.score) || 0 },
      summary: asText(meta.summary),
      learning_mode: asText(meta.learning_mode),
      strongest_concepts: asArray(meta.dominant_concepts).slice(0, 3).map((c) => asText(c?.key)).filter(Boolean),
      strongest_themes: asArray(meta.dominant_themes).slice(0, 3).map((t) => asText(t?.theme_id)).filter(Boolean),
      strongest_tension: asObject(meta.tension_summary).strongest || null,
      temporal_velocity: asObject(temporal.velocity),
      recommendation_count: countRecommendations(profile)
    };
  }

  // Forklarbart datagrunnlag: hva agentens hypoteser faktisk hviler på.
  function buildEvidencePack(profile) {
    const meta = asObject(profile.meta_insight);
    const temporal = asObject(profile.temporal);
    const recentFocus = asObject(temporal.recent_focus);
    const cooccurrence = asObject(profile.cooccurrence);
    const strongestEvidence = asArray(profile.insights)
      .map((insight) => ({
        id: asText(insight?.id),
        title: asText(insight?.title || insight?.summary).slice(0, 120),
        theme_id: asText(insight?.theme_id),
        evidence_count: Number(insight?.strength?.evidence_count) || 0
      }))
      .filter((item) => item.id || item.title)
      .sort((a, b) => b.evidence_count - a.evidence_count)
      .slice(0, 3);
    return {
      insight_count: asArray(profile.insights).length,
      topic_count: asArray(profile.topics).length,
      concept_count: asArray(profile.concepts).length,
      phrase_count: asArray(profile.phrases).length,
      cooccurrence_node_count: asArray(cooccurrence.nodes).length,
      cooccurrence_edge_count: asArray(cooccurrence.edges).length,
      tension_count: Number(asObject(meta.tension_summary).count) || 0,
      temporal_span_days: Number(temporal.span_days) || 0,
      recent_focus: {
        window_days: Number(recentFocus.window_days) || 0,
        insights: Number(recentFocus.insights) || 0,
        concepts: asArray(recentFocus.concepts).slice(0, 5).map((c) => asText(c?.key)).filter(Boolean)
      },
      emerging_concepts: asArray(recentFocus.emerging).slice(0, 5).map((c) => asText(c?.key)).filter(Boolean),
      strongest_evidence_items: strongestEvidence
    };
  }

  function emptyMemoryPack() {
    return {
      confirmed_claims: [],
      partial_claims: [],
      rejected_claims: [],
      important_claims: [],
      outdated_claims: [],
      active_self_model: null
    };
  }

  function buildMemoryPackSafe() {
    const memoryApi = global.AHAMetaInsightsMemory;
    if (memoryApi && typeof memoryApi.buildMemoryPack === "function") {
      try { return memoryApi.buildMemoryPack(); } catch {}
    }
    return emptyMemoryPack();
  }

  // Treningsgrunnlaget for AHA Personal Model. Bygges bare når både
  // AHATrainingCorpus og AHATrainingExamples finnes – slik at agenten kan
  // se om brukeren samler corpus og treningseksempler.
  function buildPersonalModelReadinessPackSafe() {
    const readinessApi = global.AHAPersonalModelReadiness;
    if (!readinessApi || typeof readinessApi.buildReadinessReport !== "function") return null;
    if (typeof readinessApi.buildCompactPack !== "function") return null;
    try {
      const report = readinessApi.buildReadinessReport();
      return readinessApi.buildCompactPack(report);
    } catch {
      return null;
    }
  }

  function buildChatPersonalContextPackSafe() {
    const api = global.AHAChatPersonalContext;
    if (!api || typeof api.getPersonalContextStatus !== "function") return null;
    try {
      const status = api.getPersonalContextStatus();
      return {
        available: Boolean(status?.available),
        approvedCorpus: Number(status?.approvedCorpus) || 0,
        approvedExamples: Number(status?.approvedExamples) || 0,
        confirmedClaims: Number(status?.confirmedClaims) || 0,
        readinessLevel: asText(status?.readinessLevel) || "ukjent",
        readinessScore: Number(status?.readinessScore) || 0,
        hasStyleProfile: Boolean(status?.hasStyleProfile),
        hasProjectContext: Boolean(status?.hasProjectContext)
      };
    } catch {
      return null;
    }
  }

  function buildTrainingPackSafe() {
    const corpusApi = global.AHATrainingCorpus;
    const examplesApi = global.AHATrainingExamples;
    if (!corpusApi || typeof corpusApi.collectCorpusStats !== "function") return null;
    if (!examplesApi || typeof examplesApi.collectExampleStats !== "function") return null;
    try {
      const corpusStats = asObject(corpusApi.collectCorpusStats());
      const exampleStats = asObject(examplesApi.collectExampleStats());
      return {
        corpusTotal: Number(corpusStats.total) || 0,
        approvedCorpus: Number(corpusStats.approved) || 0,
        approvedExamples: Number(exampleStats.approved) || 0,
        fineTuningAllowed: Number(corpusStats.fineTuningAllowed) || 0,
        styleAllowed: Number(corpusStats.styleAllowed) || 0,
        trainingExamplesAllowed: Number(corpusStats.trainingExamplesAllowed) || 0
      };
    } catch {
      return null;
    }
  }

  function buildSemanticRetrievalPackSafe() {
    const api = global.AHASemanticRetrieval;
    if (!api || typeof api.getSemanticStatus !== "function") return null;
    try {
      const status = api.getSemanticStatus();
      let hybridReady = false;
      if (typeof api.hybridSearch === "function") {
        const sample = api.hybridSearch("AHA personlig innsikt", { limit: 1, minScore: 0 });
        hybridReady = Boolean(sample?.results?.length);
      }
      return {
        available: Boolean(status?.available), indexedItems: Number(status?.indexedItems) || 0,
        vectorModel: asText(status?.vectorModel), corpusItems: Number(status?.corpusItems) || 0,
        examples: Number(status?.examples) || 0, memoryClaims: Number(status?.memoryClaims) || 0,
        hybridReady
      };
    } catch { return null; }
  }

  function buildPersonalRetrievalPackSafe() {
    const api = global.AHAPersonalRetrieval;
    if (!api || typeof api.getRetrievalStatus !== "function") return null;
    try {
      const status = api.getRetrievalStatus();
      return {
        available: Boolean(status?.available),
        indexedItems: Number(status?.indexedItems) || 0,
        corpusItems: Number(status?.corpusItems) || 0,
        examples: Number(status?.examples) || 0,
        memoryClaims: Number(status?.memoryClaims) || 0,
        lastBuiltAt: asText(status?.lastBuiltAt)
      };
    } catch { return null; }
  }

  const PERSONAL_AI_LOOP_META_INSIGHTS_LABELS = {
    ready: "Ready",
    attention_needed: "Attention needed",
    blocked: "Blocked",
    unknown: "Unknown"
  };

  function compactPersonalAiLoopRecommendationText(value, fallback = "") {
    return asText(value || fallback)
      .replace(/[\r\n]+/g, " ")
      .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
      .replace(/\b(?:sk|ghp|github_pat|pat|api[_-]?key|token|secret)[_:= -]*[A-Za-z0-9._-]{6,}\b/gi, "[redacted-credential]")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
  }

  function compactPersonalAiLoopRecommendationList(value) {
    return asArray(value)
      .map((item) => compactPersonalAiLoopRecommendationText(typeof item === "string" ? item : item?.title || item?.message || item?.label))
      .filter(Boolean)
      .slice(0, 3);
  }

  function failClosedPersonalAiLoopMetaInsightsRecommendationSummary(message) {
    return {
      state: "unknown",
      label: PERSONAL_AI_LOOP_META_INSIGHTS_LABELS.unknown,
      message: compactPersonalAiLoopRecommendationText(message, "Cached recommendation summary is missing or invalid."),
      severityCounts: { blocker: 0, warning: 0 },
      blockerCount: 0,
      warningCount: 0,
      topBlockers: [],
      topWarnings: [],
      operatorNextStep: "Manual audit/review required in Training Dashboard.",
      chatReadinessState: "unknown",
      source: "cached_audit_summary",
      compactOnly: true,
      redacted: true,
      requiresManualReview: true
    };
  }

  function buildPersonalAiLoopMetaInsightsRecommendationSummary(cachedSummaryOrAuditResult) {
    if (!cachedSummaryOrAuditResult || typeof cachedSummaryOrAuditResult !== "object" || Array.isArray(cachedSummaryOrAuditResult)) {
      return failClosedPersonalAiLoopMetaInsightsRecommendationSummary("Cached recommendation summary is missing or invalid.");
    }

    const compact = cachedSummaryOrAuditResult.compactOperatorRecommendationSummary
      || cachedSummaryOrAuditResult.operatorRecommendationSummary
      || (global.AHAPersonalAiLoopAudit?.["buildCompact" + "OperatorRecommendationSummary"]
        ? global.AHAPersonalAiLoopAudit["buildCompact" + "OperatorRecommendationSummary"](cachedSummaryOrAuditResult)
        : null);
    const compactAvailable = Boolean(compact && typeof compact === "object" && compact.compactOnly === true && compact.redacted === true);
    if (!compactAvailable) {
      return failClosedPersonalAiLoopMetaInsightsRecommendationSummary("Cached compact recommendation summary is missing or invalid.");
    }

    const counts = asObject(compact.countsBySeverity);
    const blockerCount = Math.max(0, Number(counts.blocker || cachedSummaryOrAuditResult.blockerCount || 0) || 0);
    const warningCount = Math.max(0, Number(counts.warning || cachedSummaryOrAuditResult.warningCount || 0) || 0);
    const sharedTopTitles = compactPersonalAiLoopRecommendationList(compact.topBlockerWarningTitles);
    const topBlockers = compactPersonalAiLoopRecommendationList(cachedSummaryOrAuditResult.topBlockers || compact.topBlockers)
      .concat(sharedTopTitles.slice(0, blockerCount ? 3 : 0))
      .slice(0, 3);
    const topWarnings = compactPersonalAiLoopRecommendationList(cachedSummaryOrAuditResult.topWarnings || compact.topWarnings)
      .concat(sharedTopTitles.slice(blockerCount ? 0 : 0, warningCount ? 3 : 0))
      .slice(0, 3);
    const auditStatus = asText(cachedSummaryOrAuditResult.status || compact.status);
    const chatReadinessState = asText(cachedSummaryOrAuditResult.chatReadinessState || cachedSummaryOrAuditResult.chatReadiness?.state)
      || (blockerCount > 0 ? "blocked" : warningCount > 0 ? "partially_ready" : "ready");

    let state = "unknown";
    if (blockerCount > 0) state = "blocked";
    else if (warningCount > 0) state = "attention_needed";
    else if (["ready", "working", "strong"].includes(auditStatus) || cachedSummaryOrAuditResult.ready === true) state = "ready";
    else state = "unknown";

    const message = state === "ready"
      ? "Personal AI Loop recommendation summary is ready for Meta Insights."
      : state === "attention_needed"
        ? "Personal AI Loop recommendation summary has warnings for manual review."
        : state === "blocked"
          ? "Personal AI Loop recommendation summary has blockers for manual review."
          : "Personal AI Loop recommendation summary cannot be confirmed from cache.";

    return {
      state,
      label: PERSONAL_AI_LOOP_META_INSIGHTS_LABELS[state] || PERSONAL_AI_LOOP_META_INSIGHTS_LABELS.unknown,
      message,
      severityCounts: { blocker: blockerCount, warning: warningCount },
      blockerCount,
      warningCount,
      topBlockers: blockerCount ? (topBlockers.length ? topBlockers : ["Review blockers manually"]) : [],
      topWarnings: warningCount ? (topWarnings.length ? topWarnings : ["Review warnings manually"]) : [],
      operatorNextStep: compactPersonalAiLoopRecommendationText(compact.operatorNextStep || cachedSummaryOrAuditResult.operatorNextStep, "Manual audit/review required in Training Dashboard."),
      chatReadinessState: compactPersonalAiLoopRecommendationText(chatReadinessState, "unknown"),
      source: "cached_audit_summary",
      compactOnly: true,
      redacted: true,
      requiresManualReview: state !== "ready"
    };
  }

  function buildPersonalAiLoopPackSafe() {
    const api = global.AHAPersonalAiLoopAudit;
    if (!api) return null;
    try {
      const audit = api.loadLastAudit?.();
      if (!audit) return null;
      const approved = asObject(audit.checks?.approvedMaterial);
      const compactOperatorSummary = typeof api.buildCompactOperatorRecommendationSummary === "function"
        ? api.buildCompactOperatorRecommendationSummary(audit)
        : audit.compactOperatorRecommendationSummary;
      const recommendationSummary = buildPersonalAiLoopMetaInsightsRecommendationSummary({
        ...asObject(audit),
        compactOperatorRecommendationSummary: compactOperatorSummary
      });
      return {
        status: asText(audit.status) || "empty",
        score: Number(audit.score) || 0,
        approvedCorpus: Number(approved.approvedCorpus) || 0,
        approvedExamples: Number(approved.approvedExamples) || 0,
        indexedItems: Number(audit.retrieval?.indexedItems) || 0,
        retrievalAvailable: Boolean(audit.retrieval?.available),
        recommendations: recommendationSummary
      };
    } catch { return null; }
  }

  function buildReasoningFrame() {
    return {
      language: "nb-NO",
      principles: [
        "Bruk den algoritmiske meta-profilen som grunnlag for all resonnering.",
        "Skill tydelig mellom observerte data, tolkning og spørsmål.",
        "Formuler hypoteser som brukeren kan bekrefte eller korrigere.",
        "Gi korte forklaringer (basis) for hvert claim.",
        "Bruk forsiktig norsk språk.",
        "Prioriter presisjon fremfor store påstander.",
        "Still spørsmål som gjør selvmodellen bedre."
      ]
    };
  }

  // 1. Agentkontekst: alt agenten trenger for å resonnere over profilen.
  function buildAgentContext(profile, options = {}) {
    const safe = asObject(profile);
    const context = {
      id: asText(options.id) || makeId("meta_ai_ctx"),
      createdAt: nowIso(options),
      agent: AGENT_ID,
      version: AGENT_VERSION,
      profileSnapshot: buildProfileSnapshot(safe),
      algorithmicSummary: buildAlgorithmicSummary(safe),
      evidencePack: buildEvidencePack(safe),
      memoryPack: options.memoryPack && typeof options.memoryPack === "object" ? options.memoryPack : buildMemoryPackSafe(),
      reasoningFrame: buildReasoningFrame()
    };
    const trainingPack = options.trainingPack && typeof options.trainingPack === "object"
      ? options.trainingPack
      : buildTrainingPackSafe();
    if (trainingPack) context.trainingPack = trainingPack;
    const personalModelReadinessPack = options.personalModelReadinessPack && typeof options.personalModelReadinessPack === "object"
      ? options.personalModelReadinessPack
      : buildPersonalModelReadinessPackSafe();
    if (personalModelReadinessPack) context.personalModelReadinessPack = personalModelReadinessPack;
    const chatPersonalContextPack = options.chatPersonalContextPack && typeof options.chatPersonalContextPack === "object"
      ? options.chatPersonalContextPack
      : buildChatPersonalContextPackSafe();
    if (chatPersonalContextPack) context.chatPersonalContextPack = chatPersonalContextPack;
    const personalRetrievalPack = options.personalRetrievalPack && typeof options.personalRetrievalPack === "object"
      ? options.personalRetrievalPack
      : buildPersonalRetrievalPackSafe();
    if (personalRetrievalPack) context.personalRetrievalPack = personalRetrievalPack;
    const semanticRetrievalPack = options.semanticRetrievalPack && typeof options.semanticRetrievalPack === "object"
      ? options.semanticRetrievalPack
      : buildSemanticRetrievalPackSafe();
    if (semanticRetrievalPack) context.semanticRetrievalPack = semanticRetrievalPack;
    const personalAiLoopPack = options.personalAiLoopPack && typeof options.personalAiLoopPack === "object"
      ? options.personalAiLoopPack
      : buildPersonalAiLoopPackSafe();
    if (personalAiLoopPack) context.personalAiLoopPack = personalAiLoopPack;
    return context;
  }

  function formatList(items, fallback) {
    const list = asArray(items).map((item) => asText(item)).filter(Boolean);
    return list.length ? list.join(", ") : fallback;
  }

  function formatClaimLines(claims, prefix) {
    return asArray(claims).map((claim) => `${prefix} ${asText(claim)}`);
  }

  // 2. Norsk AI-prompt som gjør Meta Insights til en aktiv AI-agent.
  function buildAgentPrompt(agentContext) {
    const ctx = asObject(agentContext);
    const summary = asObject(ctx.algorithmicSummary);
    const readiness = asObject(summary.readiness);
    const evidence = asObject(ctx.evidencePack);
    const memory = asObject(ctx.memoryPack);
    const frame = asObject(ctx.reasoningFrame);
    const tension = asObject(summary.strongest_tension);
    const velocity = asObject(summary.temporal_velocity);

    const lines = [];
    lines.push("AHA Meta Insights AI — selvforståelsesagent");
    lines.push("");

    lines.push("1. Rolle");
    lines.push("Du er AHA Meta Insights AI. Du skal forstå brukerens materiale på metanivå. Du skal danne forsiktige hypoteser om mønstre, læring, prosjekter og spenninger.");
    asArray(frame.principles).forEach((principle) => lines.push(`- ${principle}`));
    lines.push("");

    lines.push("2. Algoritmisk grunnlag");
    if (summary.summary) lines.push(`Algoritmisk oppsummering: ${summary.summary}`);
    lines.push(`Beredskap: ${asText(readiness.level) || "ukjent"} (${Number(readiness.score) || 0}/100).`);
    lines.push(`Læringsmodus: ${asText(summary.learning_mode) || "ukjent"}.`);
    lines.push(`Sterkeste begreper: ${formatList(summary.strongest_concepts, "ingen ennå")}.`);
    lines.push(`Sterkeste temaer: ${formatList(summary.strongest_themes, "ingen ennå")}.`);
    if (tension.source) {
      lines.push(`Sterkeste spenning: ${asText(tension.source)}${tension.target ? " ↔ " + asText(tension.target) : ""}.`);
    }
    if (velocity.trend) lines.push(`Aktivitetstrend: ${asText(velocity.trend)}.`);
    lines.push(`Datagrunnlag: ${Number(evidence.insight_count) || 0} innsikter, ${Number(evidence.topic_count) || 0} temaer, ${Number(evidence.concept_count) || 0} begreper, ${Number(evidence.tension_count) || 0} spenninger, ${Number(evidence.temporal_span_days) || 0} dager tidsspenn.`);
    const emerging = formatList(evidence.emerging_concepts, "");
    if (emerging) lines.push(`Nye begreper i det siste: ${emerging}.`);
    lines.push("");

    lines.push("3. Bekreftet meta-minne");
    const memoryLines = [
      ...formatClaimLines(memory.confirmed_claims, "Bekreftet:"),
      ...formatClaimLines(memory.partial_claims, "Delvis bekreftet:"),
      ...formatClaimLines(memory.important_claims, "Viktig for brukeren:"),
      ...formatClaimLines(memory.rejected_claims, "Avvist (ikke gjenta som hypotese):"),
      ...formatClaimLines(memory.outdated_claims, "Utdatert (lav vekt):")
    ];
    if (memoryLines.length) {
      memoryLines.forEach((line) => lines.push(`- ${line}`));
    } else {
      lines.push("Ingen bekreftet selvinnsikt ennå. Dette er en tidlig sesjon – vær ekstra forsiktig.");
    }
    lines.push("");

    lines.push("4. Oppgave");
    lines.push("- Vurder hva materialet samlet peker mot.");
    lines.push("- Lag 3–5 meta-hypoteser (claims) om mønstre, læring, prosjekter eller spenninger.");
    lines.push("- Angi datagrunnlag (basis) for hver hypotese.");
    lines.push("- Angi confidence mellom 0 og 1 for hver hypotese.");
    lines.push("- Angi hva brukeren bør bekrefte.");
    lines.push("- Still 3 korte spørsmål som gjør selvmodellen mer presis.");
    lines.push("- Foreslå ett konkret neste steg (suggested_next_step).");
    lines.push("- Foreslå hva som kan lagres i meta-minnet (memory_update_suggestion).");
    lines.push("");

    lines.push("5. Svarformat");
    lines.push("Svar som ett JSON-kompatibelt objekt, uten tekst utenfor objektet:");
    lines.push(JSON.stringify({
      agent: AGENT_ID,
      interpretation: "…",
      claims: [
        {
          id: "claim_1",
          text: "…",
          basis: ["…"],
          confidence: 0.0,
          status: "hypothesis",
          feedback_options: [...FEEDBACK_OPTIONS]
        }
      ],
      questions: ["…", "…", "…"],
      suggested_next_step: "…",
      memory_update_suggestion: {
        confirmed_if_user_agrees: ["…"],
        watch_next: ["…"]
      }
    }, null, 2));

    return lines.join("\n");
  }

  // 3. Hel agent-sesjon: kontekst + prompt, klar for AHA Chat.
  function createAgentSession(profile, options = {}) {
    const agentContext = buildAgentContext(profile, options);
    return {
      id: makeId("meta_ai_session"),
      type: SESSION_TYPE,
      source: SESSION_SOURCE,
      createdAt: agentContext.createdAt,
      status: "pending",
      agentContext,
      prompt: buildAgentPrompt(agentContext)
    };
  }

  // 4. Lagrer sesjonen som pending chat-payload, samme nøkkel som
  // AHA Home → AHA Chat-flyten ellers bruker.
  function savePendingAgentSession(profile, options = {}) {
    const session = createAgentSession(profile, options);
    const payload = {
      type: SESSION_TYPE,
      source: SESSION_SOURCE,
      createdAt: session.createdAt,
      sessionId: session.id,
      prompt: session.prompt,
      agentContext: session.agentContext
    };
    try {
      global.localStorage?.setItem(PENDING_CHAT_PROMPT_KEY, JSON.stringify(payload));
    } catch {
      return { ok: false, session };
    }
    return { ok: true, session };
  }

  function extractJsonCandidates(text) {
    const candidates = [text];
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced && fenced[1]) candidates.push(fenced[1].trim());
    const first = text.indexOf("{");
    const last = text.lastIndexOf("}");
    if (first !== -1 && last > first) candidates.push(text.slice(first, last + 1));
    return candidates;
  }

  function normalizeClaim(claim, index) {
    const safe = asObject(claim);
    const confidence = Number(safe.confidence);
    return {
      id: asText(safe.id) || `claim_${index + 1}`,
      text: asText(safe.text),
      basis: asArray(safe.basis).map((item) => asText(item)).filter(Boolean),
      confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0,
      status: asText(safe.status) || "hypothesis",
      feedback_options: asArray(safe.feedback_options).map((item) => asText(item)).filter(Boolean).length
        ? asArray(safe.feedback_options).map((item) => asText(item)).filter(Boolean)
        : [...FEEDBACK_OPTIONS]
    };
  }

  // 5. Parser AI-svar. Strukturert JSON gir claims; fritekst håndteres
  // rolig med ok: false og tom claims-liste.
  function parseAgentResponse(rawText) {
    const text = asText(rawText);
    let parsed = null;
    for (const candidate of extractJsonCandidates(text)) {
      if (!asText(candidate).startsWith("{")) continue;
      try {
        const attempt = JSON.parse(candidate);
        if (attempt && typeof attempt === "object" && !Array.isArray(attempt)) { parsed = attempt; break; }
      } catch {}
    }
    if (!parsed) {
      return { ok: false, response: null, claims: [], questions: [], suggested_next_step: "", rawText: text };
    }
    return {
      ok: true,
      response: parsed,
      claims: asArray(parsed.claims).map(normalizeClaim).filter((claim) => claim.text),
      questions: asArray(parsed.questions).map((q) => asText(q)).filter(Boolean),
      suggested_next_step: asText(parsed.suggested_next_step),
      rawText: text
    };
  }

  const AHAMetaInsightsAgent = {
    AGENT_ID,
    AGENT_VERSION,
    SESSION_TYPE,
    SESSION_SOURCE,
    PENDING_CHAT_PROMPT_KEY,
    FEEDBACK_OPTIONS: [...FEEDBACK_OPTIONS],
    buildPersonalAiLoopMetaInsightsRecommendationSummary,
    buildAgentContext,
    buildAgentPrompt,
    createAgentSession,
    savePendingAgentSession,
    parseAgentResponse
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = AHAMetaInsightsAgent;
  }
  if (global) {
    global.AHAMetaInsightsAgent = AHAMetaInsightsAgent;
  }
})(typeof window !== "undefined" ? window : this);
