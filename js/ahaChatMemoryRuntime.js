// ahaChatMemoryRuntime.js
// Relevansvurdering, retrieval, transparensdata og helsestatus for AHA-minne.
// DOM-rendering og chat-orkestrering forblir i ahaChat.js.

(function (global) {
  "use strict";

  function create(dependencies = {}) {
    const loadChamberFromStorage = dependencies.loadChamber;
    const loadAfterworkEntries = dependencies.loadAfterworkEntries;
    const loadAhaMemoryControls = dependencies.loadControls;
    const normalizeAhaMemoryControls = dependencies.normalizeControls;
    const loadAhaMemoryExclusions = dependencies.loadExclusions;
    const isAhaMemoryInsightExcluded = dependencies.isExcluded;
    const getAhaMemoryInsightKey = dependencies.getInsightKey;

    function normalizeAhaMemoryText(text) {
      return String(text || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/æ/g, "ae")
        .replace(/ø/g, "o")
        .replace(/å/g, "a")
        .replace(/[^a-z0-9\s?]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function isAhaMemoryQuestion(text) {
      const normalized = normalizeAhaMemoryText(text);
      if (!normalized) return false;
      return [
        /\blaerer\s+du\s+av\s+(det\s+)?(jeg|eg|vi)\s+skriver\b/,
        /\blaerer\s+aha\s+av\s+(det\s+)?(jeg|eg|vi)\s+skriver\b/,
        /\bhusker\s+du\s+(dette|det|tidligere|forrige|innsikt|innsikter)\b/,
        /\blagrer\s+du\s+(samtalen|chatten|dette|det)\b/,
        /\bbruker\s+aha\s+innsiktene\s+mine\b/,
        /\bhar\s+du\s+(et\s+)?minne\b/,
        /\bhva\s+laerer\s+innsiktsmotoren\b/,
        /\bblir\s+dette\s+lagret\b/,
        /\ber\s+dette\s+lagret\b/,
        /\bdo\s+you\s+learn\s+from\s+(this|what\s+i\s+write)\b/,
        /\bdo\s+you\s+remember\s+(this|that|previous|earlier)\b/,
        /\bis\s+this\s+stored\b/,
        /\bdo\s+you\s+store\s+(this|the\s+conversation|my\s+chat)\b/,
        /\bdo\s+you\s+have\s+(a\s+)?memory\b/
      ].some((pattern) => pattern.test(normalized));
    }


    const AHA_MEMORY_EXPLICIT_PATTERNS = [
      /\bsom\s+vi\s+snakket\s+om\b/i,
      /\bfortsett\b/i,
      /\bbygg\s+videre\b/i,
      /\bhusker\s+du\b/i,
      /\btidligere\b/i,
      /\bforrige\b/i,
      /\bhva\s+var\s+planen\b/i,
      /\bhvor\s+er\s+vi\b/i,
      /\bneste\s+steg\b/i,
      /\bbruk\s+innsiktene\b/i,
      /\bbruk\s+minnet\b/i,
      /\bcontinue\b/i,
      /\bremember\s+(this|that|what)\b/i
    ];
    const AHA_MEMORY_CONTINUITY_PATTERNS = [
      /\bhva\s+gjør\s+vi\s+nå\b/i,
      /\bhva\s+gjor\s+vi\s+na\b/i,
      /\bhva\s+mangler\b/i,
      /\bhvor\s+langt\s+er\s+vi\s+kommet\b/i,
      /\bneste\s+naturlige\s+steg\b/i,
      /\bplanlegg\s+videre\b/i,
      /\bhva\s+nå\b/i,
      /\bhva\s+na\b/i
    ];
    const AHA_MEMORY_KNOWN_PROJECTS = [
      "AHA", "EchoNet", "History Go", "Civication", "Paradisavisa", "Paradispartiet",
      "Teorien om lyset", "Dagen", "AHA Chat", "innsiktsmotor"
    ];
    const AHA_MEMORY_GENERIC_TERMS = new Set([
      "aha", "dagen", "læring", "laering", "tekst", "idé", "ide", "system", "ting", "noe", "dette", "den", "det", "jeg", "du", "vi", "oss", "min", "din", "vår", "var", "skal", "kan", "med", "for", "til", "som", "hva", "hvor", "når", "nar", "gjør", "gjor", "videre", "neste"
    ]);
    const AHA_MEMORY_MIN_LOCAL_SCORE = 4;
    const AHA_MEMORY_SEMANTIC_THRESHOLD = 0.62;
    const AHA_MEMORY_SEMANTIC_EXPLICIT_THRESHOLD = 0.56;

    function getAhaMemoryTokens(text) {
      return normalizeAhaMemoryText(text)
        .split(/\s+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3 && !AHA_MEMORY_GENERIC_TERMS.has(token));
    }

    function hasAhaMemoryPattern(text, patterns) {
      const normalized = normalizeAhaMemoryText(text);
      return patterns.some((pattern) => pattern.test(normalized));
    }

    function findKnownAhaProjects(text) {
      const normalized = normalizeAhaMemoryText(text);
      return AHA_MEMORY_KNOWN_PROJECTS.filter((project) => {
        const projectText = normalizeAhaMemoryText(project);
        if (!projectText) return false;
        if (projectText === "aha") return /(^|\s)aha\b/.test(normalized);
        if (projectText === "dagen") {
          return /\b(prosjektet|teksten|boken|boka|romanen|arbeidet)\s+dagen\b/.test(normalized)
            || /\bdagen\s+(prosjektet|prosjekt|teksten|boken|boka|romanen|arbeidet)\b/.test(normalized);
        }
        return normalized.includes(projectText);
      });
    }

    function isAhaMemoryStatusUsable(options) {
      const status = options?.memoryStatus;
      if (!status) return true;
      if (status.ok === false && status.local?.state === "unavailable") return false;
      return status.local?.state !== "unavailable" || status.embedding?.status === "configured";
    }

    function collectInsightMemoryText(insight) {
      const parts = [];
      ["title", "summary", "text", "functional_type"].forEach((key) => {
        if (insight?.[key]) parts.push(String(insight[key]));
      });
      ["concepts", "emner", "patterns", "claims", "tags"].forEach((key) => {
        const value = insight?.[key];
        if (Array.isArray(value)) parts.push(value.map((item) => typeof item === "string" ? item : JSON.stringify(item || {})).join(" "));
        else if (value && typeof value === "object") parts.push(JSON.stringify(value));
        else if (value) parts.push(String(value));
      });
      return parts.join(" ");
    }

    function memoryConceptLabel(item) {
      if (item == null) return "";
      if (typeof item === "string" || typeof item === "number") return String(item).trim();
      if (typeof item === "object") {
        const value = item.label || item.key || item.term || item.name || item.title;
        if (value == null) return "";
        return String(value).trim();
      }
      return String(item).trim();
    }

    function isSensitiveAhaMemoryInsight(insight) {
      const privacy = String(insight?.privacy || insight?.visibility || insight?.sensitivity || "").toLowerCase();
      return Boolean(insight?.private || insight?.sensitive || privacy === "private" || privacy === "sensitive");
    }

    function compactAhaMemoryInsight(insight, matchMeta) {
      const concepts = Array.isArray(insight?.concepts) ? insight.concepts : Array.isArray(insight?.emner) ? insight.emner : [];
      return {
        id: insight?.id || null,
        title: String(insight?.title || "Innsikt").slice(0, 120),
        summary: String(insight?.summary || insight?.text || "").replace(/\s+/g, " ").trim().slice(0, 320),
        concepts: concepts.map(memoryConceptLabel).filter(Boolean).slice(0, 8),
        score: matchMeta?.score || 0,
        source: matchMeta?.source || "local"
      };
    }

    function findRelevantLocalMemory(userText, chamber, options) {
      const explicit = Boolean(options?.explicitReference);
      const continuity = Boolean(options?.continuity);
      const projectMatches = options?.projectMatches || findKnownAhaProjects(userText);
      const tokens = getAhaMemoryTokens(userText);
      const projectTokens = projectMatches.flatMap((project) => getAhaMemoryTokens(project));
      const searchTokens = [...new Set([...tokens, ...projectTokens])].filter((token) => !AHA_MEMORY_GENERIC_TERMS.has(token));
      if (!searchTokens.length && !projectMatches.length && !explicit && !continuity) return [];

      let active = [];
      try {
        active = typeof global.InsightsEngine?.getActiveInsights === "function"
          ? global.InsightsEngine.getActiveInsights(chamber)
          : (Array.isArray(chamber?.insights) ? chamber.insights.filter((ins) => !ins?.archived && !ins?.deleted && !ins?.rejected && !ins?.merged_into) : []);
      } catch (err) {
        console.warn("AHA Memory Gate: lokal innsiktshenting feilet", err);
        return [];
      }

      const safeActive = active.filter((insight) => insight && !isSensitiveAhaMemoryInsight(insight) && !isAhaMemoryInsightExcluded(insight));
      const scoredMatches = safeActive
        .map((insight) => {
          const haystack = normalizeAhaMemoryText(collectInsightMemoryText(insight));
          const title = normalizeAhaMemoryText(insight.title || "");
          const summary = normalizeAhaMemoryText(insight.summary || "");
          const conceptText = normalizeAhaMemoryText([...(insight.concepts || []), ...(insight.emner || [])].map(memoryConceptLabel).filter(Boolean).join(" "));
          let score = 0;
          const reasons = [];

          projectMatches.forEach((project) => {
            const p = normalizeAhaMemoryText(project);
            if (p && haystack.includes(p)) {
              score += 5;
              reasons.push(`prosjekt:${project}`);
            }
          });

          searchTokens.forEach((token) => {
            if (!token || AHA_MEMORY_GENERIC_TERMS.has(token)) return;
            if (conceptText.includes(token)) { score += 3; reasons.push(`begrep:${token}`); }
            else if (title.includes(token)) { score += 2.5; reasons.push(`tittel:${token}`); }
            else if (summary.includes(token)) { score += 1.5; reasons.push(`sammendrag:${token}`); }
            else if (haystack.includes(token)) { score += 1; reasons.push(`felt:${token}`); }
          });

          if ((explicit || continuity) && score > 0) score += 1;
          if (!projectMatches.length && score < AHA_MEMORY_MIN_LOCAL_SCORE) score -= 1;

          return { insight, score, reasons: [...new Set(reasons)].slice(0, 8), source: "local" };
        })
        .filter((match) => match.score >= AHA_MEMORY_MIN_LOCAL_SCORE)
        .sort((a, b) => b.score - a.score);

      if (!scoredMatches.length && (explicit || continuity) && safeActive.length) {
        return safeActive
          .slice(-3)
          .reverse()
          .map((insight, index) => ({
            insight,
            score: AHA_MEMORY_MIN_LOCAL_SCORE + (3 - index) * 0.25,
            reasons: [explicit ? "eksplisitt-kontinuitet" : "kontinuitet"],
            source: "local"
          }));
      }

      return scoredMatches.slice(0, options?.limit || 5);
    }

    function getSemanticSimilarity(match) {
      const raw = match?.similarity ?? match?.score ?? match?.distance_score ?? match?.metadata?.similarity;
      const num = Number(raw);
      return Number.isFinite(num) ? num : 0;
    }

    function normalizeSemanticMemoryMatch(match) {
      const insight = match?.insight || match?.metadata?.insight || match;
      return {
        id: insight?.id || match?.id || null,
        title: String(insight?.title || match?.title || "Semantisk treff").slice(0, 120),
        summary: String(insight?.summary || insight?.text || match?.summary || "").replace(/\s+/g, " ").trim().slice(0, 320),
        concepts: (Array.isArray(insight?.concepts) ? insight.concepts : Array.isArray(match?.concepts) ? match.concepts : []).map(memoryConceptLabel).filter(Boolean).slice(0, 8),
        similarity: getSemanticSimilarity(match),
        source: "semantic"
      };
    }

    async function findRelevantSemanticMemory(userText, options) {
      if (!global.AHAEmbeddings || typeof global.AHAEmbeddings.findSimilarToText !== "function" || typeof global.AHAEmbeddings.health !== "function") return [];
      const explicit = Boolean(options?.explicitReference || options?.continuity);
      const threshold = explicit ? AHA_MEMORY_SEMANTIC_EXPLICIT_THRESHOLD : AHA_MEMORY_SEMANTIC_THRESHOLD;
      try {
        const health = options?.embeddingHealth || await getAhaEmbeddingHealthWithTimeout(1600);
        const status = String(health?.status || health?.reason || "");
        if (status !== "configured" && health?.ok !== true) return [];
        const simRes = await global.AHAEmbeddings.findSimilarToText(userText, {
          limit: 5,
          chamber: options?.chamber || loadChamberFromStorage()
        });
        const matches = Array.isArray(simRes?.matches) ? simRes.matches : [];
        const queryTokens = new Set(getAhaMemoryTokens(userText));
        return matches
          .map(normalizeSemanticMemoryMatch)
          .filter((match) => {
            if (isAhaMemoryInsightExcluded(match)) return false;
            if (match.similarity < threshold) return false;
            const matchTokens = getAhaMemoryTokens(`${match.title} ${match.summary} ${(match.concepts || []).join(" ")}`);
            const overlap = matchTokens.some((token) => queryTokens.has(token));
            return explicit || overlap || findKnownAhaProjects(`${match.title} ${match.summary}`).length > 0;
          })
          .slice(0, 5);
      } catch (err) {
        console.warn("AHA Memory Gate: semantisk søk feilet", err);
        return [];
      }
    }

    async function shouldUseAhaMemory(userText, options = {}) {
      const text = String(userText || "").trim();
      const off = (reason) => ({ useMemory: false, reason, confidence: 0, mode: "off" });
      if (!text) return off("Tom melding.");
      if (!isAhaMemoryStatusUsable(options)) return off("Minnestatus er utilgjengelig.");

      const explicitReference = hasAhaMemoryPattern(text, AHA_MEMORY_EXPLICIT_PATTERNS);
      const continuity = hasAhaMemoryPattern(text, AHA_MEMORY_CONTINUITY_PATTERNS);
      const projectMatches = findKnownAhaProjects(text);
      const tokens = getAhaMemoryTokens(text);
      const shortStandalone = tokens.length <= 3 && /^(hva|what)\s+(betyr|er|means|is)\b/i.test(normalizeAhaMemoryText(text)) && !explicitReference && !continuity && !projectMatches.length;
      if (shortStandalone) return off("Kort, selvstendig kunnskapsspørsmål uten prosjektkobling.");

      let chamber = options.chamber;
      try { if (!chamber) chamber = loadChamberFromStorage(); } catch { chamber = null; }
      const localMatches = findRelevantLocalMemory(text, chamber, { explicitReference, continuity, projectMatches, limit: 5 });
      const semanticMatches = options.skipSemantic ? [] : await findRelevantSemanticMemory(text, { explicitReference, continuity, chamber, embeddingHealth: options.embeddingHealth });

      if (explicitReference) return { useMemory: true, reason: "Eksplisitt referanse til tidligere arbeid.", confidence: 0.9, mode: "explicit_reference" };
      if (continuity) return { useMemory: true, reason: "Meldingen ber om kontinuitet eller neste steg.", confidence: 0.82, mode: "continuity" };
      if (projectMatches.length) return { useMemory: true, reason: `Kjent AHA-prosjekt/arbeidsområde: ${projectMatches.slice(0, 2).join(", ")}.`, confidence: 0.78, mode: "known_project" };
      if (semanticMatches.length) return { useMemory: true, reason: "Semantisk søk fant sterke relevante minnetreff.", confidence: Math.min(0.86, 0.58 + semanticMatches[0].similarity / 3), mode: "semantic_match" };
      if (localMatches.length) return { useMemory: true, reason: "Lokale innsikter matcher tydelig på prosjekt, tema eller begreper.", confidence: Math.min(0.82, 0.52 + localMatches[0].score / 20), mode: "semantic_match" };
      return off("Ingen tydelige, relevante minnetreff.");
    }
    function formatAhaMemoryContextForAgent(memoryContext) {
      if (!memoryContext?.used) return "";
      const insights = (memoryContext.selectedInsights || []).slice(0, 5);
      if (!insights.length) return "";
      return insights.map((insight, index) => {
        const concepts = (insight.concepts || []).slice(0, 6).join(", ");
        const conceptText = concepts ? ` Begreper: ${concepts}.` : "";
        return `${index + 1}. ${insight.title}: ${insight.summary}${conceptText}`.trim();
      }).join("\n");
    }

    async function buildAhaMemoryContext(userText, options = {}) {
      const empty = (gate) => ({
        used: false,
        reason: gate?.reason || "Minne ikke relevant.",
        confidence: gate?.confidence || 0,
        mode: gate?.mode || "off",
        localMatches: [],
        semanticMatches: [],
        selectedInsights: [],
        summaryForAgent: ""
      });

      let chamber = options.chamber;
      try { if (!chamber) chamber = loadChamberFromStorage(); } catch { chamber = null; }
      const explicitReference = hasAhaMemoryPattern(userText, AHA_MEMORY_EXPLICIT_PATTERNS);
      const continuity = hasAhaMemoryPattern(userText, AHA_MEMORY_CONTINUITY_PATTERNS);
      const projectMatches = findKnownAhaProjects(userText);
      const localMatches = findRelevantLocalMemory(userText, chamber, { explicitReference, continuity, projectMatches, limit: 5 });
      const semanticMatches = await findRelevantSemanticMemory(userText, { explicitReference, continuity, chamber, embeddingHealth: options.embeddingHealth });
      const baseGate = await shouldUseAhaMemory(userText, Object.assign({}, options, { chamber, skipSemantic: true }));
      const gate = (!baseGate.useMemory && semanticMatches.length)
        ? { useMemory: true, reason: "Semantisk søk fant sterke relevante minnetreff.", confidence: Math.min(0.86, 0.58 + semanticMatches[0].similarity / 3), mode: "semantic_match" }
        : baseGate;

      const hasAnyMatches = localMatches.length || semanticMatches.length;
      if (!gate.useMemory) return empty(gate);
      if (!hasAnyMatches && gate.mode !== "explicit_reference" && gate.mode !== "continuity" && gate.mode !== "known_project") return empty(gate);

      const selected = [];
      const seen = new Set();
      localMatches.forEach((match) => {
        const compact = compactAhaMemoryInsight(match.insight, match);
        const key = getAhaMemoryInsightKey(compact) || `${compact.title}|${compact.summary}`;
        if (!isAhaMemoryInsightExcluded(compact) && !seen.has(key)) { seen.add(key); selected.push(compact); }
      });
      semanticMatches.forEach((match) => {
        const key = getAhaMemoryInsightKey(match) || `${match.title}|${match.summary}`;
        if (!isAhaMemoryInsightExcluded(match) && !seen.has(key)) { seen.add(key); selected.push(match); }
      });

      const memoryContext = {
        used: gate.useMemory && selected.length > 0,
        reason: gate.reason,
        confidence: gate.confidence,
        mode: gate.mode,
        localMatches: localMatches.map((match) => ({ id: match.insight?.id || null, title: match.insight?.title || "Innsikt", score: match.score, reasons: match.reasons })),
        semanticMatches,
        selectedInsights: selected.slice(0, 5),
        summaryForAgent: ""
      };
      memoryContext.summaryForAgent = formatAhaMemoryContextForAgent(memoryContext);
      memoryContext.used = Boolean(memoryContext.summaryForAgent);
      if (!memoryContext.used) return empty(gate);
      return memoryContext;
    }


    function isAhaMemoryDebugEnabled() {
      try {
        return global.localStorage?.getItem("aha_memory_debug") === "true";
      } catch {
        return false;
      }
    }

    function normalizeAhaMemoryTransparencyInsight(insight) {
      if (!insight || typeof insight !== "object") return null;
      const concepts = (Array.isArray(insight.concepts) ? insight.concepts : [])
        .map(memoryConceptLabel)
        .filter(Boolean)
        .slice(0, 8);
      const confidenceNumber = (value) => {
        const num = Number(value);
        return Number.isFinite(num) ? Math.round(num * 100) / 100 : null;
      };
      return {
        id: insight.id || null,
        title: String(insight.title || "Innsikt").replace(/\s+/g, " ").trim().slice(0, 120) || "Innsikt",
        summary: String(insight.summary || insight.text || "").replace(/\s+/g, " ").trim().slice(0, 260),
        concepts,
        source: insight.source || null,
        score: confidenceNumber(insight.score),
        similarity: confidenceNumber(insight.similarity),
        excluded: isAhaMemoryInsightExcluded(insight)
      };
    }

    function buildAhaMemoryTransparency(memoryContext) {
      const used = Boolean(memoryContext?.used);
      const debug = isAhaMemoryDebugEnabled();
      const confidence = used ? Math.round(Number(memoryContext?.confidence || 0) * 100) / 100 : 0;
      const selectedInsights = used
        ? (Array.isArray(memoryContext?.selectedInsights) ? memoryContext.selectedInsights : [])
          .map(normalizeAhaMemoryTransparencyInsight)
          .filter(Boolean)
          .slice(0, 5)
        : [];
      const visible = used || debug;
      return {
        visible,
        used,
        label: used ? "Brukte relevant AHA-minne" : "Minne ikke brukt",
        reason: String(memoryContext?.reason || (used ? "Relevant minne ble valgt av Memory Relevance Gate." : "Memory Relevance Gate slo av minne.")).trim(),
        mode: used ? String(memoryContext?.mode || "unknown") : "off",
        confidence: Number.isFinite(confidence) ? confidence : 0,
        selectedInsights
      };
    }

    function formatAhaMemoryTransparencyDetails(memoryContext) {
      const transparency = memoryContext?.visible !== undefined ? memoryContext : buildAhaMemoryTransparency(memoryContext);
      if (!transparency.visible) return "";
      const lines = [];
      if (!transparency.used) lines.push("Minne ikke brukt");
      lines.push(`Grunn: ${transparency.reason || "Ukjent"}`);
      lines.push(`Modus: ${transparency.mode || "off"}`);
      lines.push(`Sikkerhet: ${Number(transparency.confidence || 0).toFixed(2)}`);
      if (transparency.used && transparency.selectedInsights.length) {
        lines.push("Innsikter brukt:");
        transparency.selectedInsights.forEach((insight, index) => {
          lines.push(`${index + 1}. ${insight.title}`);
          if (insight.summary) lines.push(`   ${insight.summary}`);
          if (insight.concepts?.length) lines.push(`   Begreper: ${insight.concepts.join(", ")}`);
        });
      }
      return lines.join("\n");
    }

    function countAhaActiveInsights(chamber) {
      try {
        if (typeof global.InsightsEngine?.getActiveInsights === "function") {
          return global.InsightsEngine.getActiveInsights(chamber).length;
        }
        return Array.isArray(chamber?.insights) ? chamber.insights.filter((ins) => !ins?.archived && !ins?.deleted && !ins?.merged_into).length : 0;
      } catch {
        return Array.isArray(chamber?.insights) ? chamber.insights.length : 0;
      }
    }

    function formatAhaMemoryTimestamp(value) {
      if (!value) return "ikke funnet";
      const stamp = new Date(value);
      if (Number.isNaN(stamp.getTime())) return String(value);
      return stamp.toLocaleString("no-NO");
    }

    function describeAhaEmbeddingStatus(status) {
      const code = String(status?.status || status?.reason || "unknown");
      const labels = {
        configured: "aktivt",
        not_configured: "ikke konfigurert",
        not_signed_in: "ikke innlogget",
        storage_unavailable: "storage mangler",
        missing_provider_key: "provider-nøkkel mangler",
        backend_unreachable: "backend utilgjengelig",
        unknown: "ukjent"
      };
      return labels[code] || code.replace(/_/g, " ");
    }

    function explainAhaEmbeddingStatus(status) {
      const code = String(status?.status || status?.reason || "unknown");
      if (code === "configured") return "Semantisk/skybasert minne er aktivt: backend, innlogging, storage og embeddings ser ut til å være klare.";
      if (code === "not_signed_in") return "Semantisk minne er ikke aktivt nå fordi du ikke ser ut til å være innlogget.";
      if (code === "not_configured") return "Semantisk minne er ikke konfigurert for denne installasjonen.";
      if (code === "storage_unavailable") return "Semantisk minne mangler tilgjengelig storage/databasekobling.";
      if (code === "missing_provider_key") return "Semantisk minne mangler provider-nøkkel for embedding-backend.";
      if (code === "backend_unreachable") return "Semantisk minne kan ikke bekreftes fordi backend ikke nås akkurat nå.";
      return "Semantisk minne kunne ikke bekreftes akkurat nå.";
    }

    async function getAhaEmbeddingHealthWithTimeout(timeoutMs = 2200) {
      if (!global.AHAEmbeddings || typeof global.AHAEmbeddings.health !== "function") {
        return { ok: false, status: "not_configured", reason: "not_configured" };
      }
      let timeoutId = null;
      try {
        const timeout = new Promise((resolve) => {
          timeoutId = setTimeout(() => resolve({ ok: false, status: "backend_unreachable", reason: "backend_unreachable", timedOut: true }), timeoutMs);
        });
        return await Promise.race([global.AHAEmbeddings.health(), timeout]);
      } catch (err) {
        console.warn("AHA minnestatus: embedding health feilet", err);
        return { ok: false, status: "backend_unreachable", reason: "backend_unreachable", error: String(err?.message || err) };
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    }

    async function buildAhaMemoryStatus() {
      const status = {
        ok: true,
        local: { state: "unavailable", activeInsights: 0, lastLocalSave: null },
        afterwork: { available: false, count: null },
        embedding: { status: "not_configured", reason: "not_configured" },
        controls: loadAhaMemoryControls(),
        exclusions: loadAhaMemoryExclusions()
      };

      try {
        const chamber = loadChamberFromStorage();
        const activeInsights = countAhaActiveInsights(chamber);
        status.local = {
          state: activeInsights > 0 ? "active" : "empty",
          activeInsights,
          lastLocalSave: chamber?._local_updated_at || null
        };
      } catch (err) {
        status.ok = false;
        status.local = { state: "unavailable", activeInsights: 0, lastLocalSave: null, error: String(err?.message || err) };
      }

      try {
        if (typeof loadAfterworkEntries === "function") {
          status.afterwork = { available: true, count: loadAfterworkEntries().length };
        }
      } catch (err) {
        status.afterwork = { available: false, count: null, error: String(err?.message || err) };
      }

      status.embedding = await getAhaEmbeddingHealthWithTimeout();
      return status;
    }

    function buildAhaLearningContractReply(status) {
      if (!status || typeof status !== "object") return "Minnestatus kunne ikke leses akkurat nå.";
      const local = status.local || {};
      const afterwork = status.afterwork || {};
      const localLine = local.state === "active"
        ? `Lokalt innsiktskammer er aktivt med ${local.activeInsights || 0} aktiv${local.activeInsights === 1 ? "" : "e"} innsikt${local.activeInsights === 1 ? "" : "er"}.`
        : local.state === "empty"
          ? "Lokalt innsiktskammer finnes, men er tomt akkurat nå."
          : "Lokalt innsiktskammer er utilgjengelig akkurat nå.";
      const afterworkLine = afterwork.available ? `Lagrede etterarbeid: ${afterwork.count || 0}.` : "Lagrede etterarbeid kunne ikke telles her.";
      const embeddingLine = explainAhaEmbeddingStatus(status.embedding);
      const controls = normalizeAhaMemoryControls(status.controls || loadAhaMemoryControls());
      const savingLine = controls.saveNewInsights ? "Lagring av nye innsikter er aktiv." : "Lagring av nye innsikter er slått av.";
      const memoryUseLine = controls.useExistingMemory ? "AHA kan bruke relevant tidligere minne i svar." : "Bruk av tidligere minne i svar er slått av.";

      return [
        "Kort sagt: Ja, AHA lærer operasjonelt når lagring er aktiv – ikke ved at jeg nødvendigvis trener selve grunnmodellen direkte på teksten din, men ved å gjøre samtaler om til source events, signaler, innsikter, begreper, etterarbeid, stier og semantiske koblinger.",
        `${savingLine} ${memoryUseLine}`,
        `${localLine} ${afterworkLine}`,
        embeddingLine,
        "AHA skal holde rå samtaler, private innsikter, delte innsikter og anonymisert kollektiv læring adskilt. Derfor sier jeg ikke at jeg «ikke lagrer personlig informasjon over tid» når innsiktskammeret eller aktiv storage faktisk lagrer innsiktene dine."
      ].join("\n\n");
    }

    return Object.freeze({
      normalizeAhaMemoryText,
      memoryConceptLabel,
      isAhaMemoryQuestion,
      findRelevantLocalMemory,
      shouldUseAhaMemory,
      formatAhaMemoryContextForAgent,
      buildAhaMemoryContext,
      isAhaMemoryDebugEnabled,
      buildAhaMemoryTransparency,
      formatAhaMemoryTransparencyDetails,
      formatAhaMemoryTimestamp,
      describeAhaEmbeddingStatus,
      explainAhaEmbeddingStatus,
      getAhaEmbeddingHealthWithTimeout,
      buildAhaMemoryStatus,
      buildAhaLearningContractReply
    });
  }

  global.AHAChatMemoryRuntime = Object.freeze({ create });
})(window);
