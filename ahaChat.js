// ahaChat.js
// Ren kobling mellom AHA Chat UI og eksisterende InsightsEngine.

(function (global) {
  "use strict";

  const SUBJECT_ID = "sub_laring";
  const STORAGE_KEY = "aha_insight_chamber_v1";
  const HIGHLIGHTS_STORAGE_KEY = "aha_chat_highlights_v1";
  const CHAT_THREAD_ID = "default_thread";

  const AUTO_OUTPUT_STORAGE_KEY = "aha_chat_auto_outputs_v1";

  const AHA_INSIGHT_CONTRACT = Object.freeze({
    FUNCTIONAL_TYPES: new Set([
      "observation", "question", "task", "problem", "solution",
      "decision", "definition", "contradiction", "learning_point", "pattern", "memory", "principle"
    ])
  });
  const WEAK_CONCEPT_WORDS = new Set(["finnes","egen","form","lærer","mennesker","blir","ikke","bare","over","ligger","lavt","noen","helt","ennå"]);
  function getThreadId() {
    return CHAT_THREAD_ID;
  }

  function normalizePreview(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
  }

  function shortHash(input) {
    let hash = 5381;
    const value = String(input || "");
    for (let i = 0; i < value.length; i += 1) {
      hash = ((hash << 5) + hash) + value.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(36);
  }

  function makeStableMessageId(role, text, createdAt) {
    const key = `${String(role || "").trim()}|${String(createdAt || "").trim()}|${normalizePreview(text)}`;
    return `msg_${shortHash(key)}`;
  }

  function loadHighlights() {
    try {
      const raw = localStorage.getItem(HIGHLIGHTS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveHighlights(highlights) {
    localStorage.setItem(HIGHLIGHTS_STORAGE_KEY, JSON.stringify(highlights || {}));
  }

  function loadChamberFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return global.InsightsEngine.createEmptyChamber();
      return JSON.parse(raw);
    } catch (e) {
      console.warn("Kunne ikke laste innsiktskammer, lager nytt.", e);
      return global.InsightsEngine.createEmptyChamber();
    }
  }

  function saveChamberToStorage(chamber) {
    try {
      // Stempler hvert lokale skriv med tidspunkt så ahaChamberSync kan
      // sammenligne mot Supabase sin updated_at i pull-fasen.
      if (chamber && typeof chamber === "object") {
        chamber._local_updated_at = new Date().toISOString();
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(chamber));
      try {
        global.dispatchEvent(new CustomEvent("aha:chamber-saved", {
          detail: { source: "ahaChat", insight_count: (chamber?.insights || []).length }
        }));
      } catch {}
    } catch (e) {
      console.warn("Kunne ikke lagre innsiktskammer.", e);
    }
  }

  function getThemeId() {
    const input = document.getElementById("theme-id");
    const value = input && String(input.value || "").trim();
    return value || "th_default";
  }

  function getFieldId() { return null; }

  function out(message) {
    const el = document.getElementById("out");
    if (!el) return;
    el.textContent = String(message || "");
  }
  function setStatusNote(message) {
    const el = document.getElementById("chat-status-note");
    if (!el) return;
    el.textContent = String(message || "");
  }


  function dedupeSubjectMatches(matches) {
    const list = Array.isArray(matches) ? matches : [];
    const seenLabels = new Set();
    const seenIds = new Set();
    return list.filter((item) => {
      const label = String(item?.title || item?.subject_label || "").trim().toLowerCase();
      const id = String(item?.subject_id || item?.emne_id || "").trim().toLowerCase();
      if (label) {
        if (seenLabels.has(label)) return false;
        seenLabels.add(label);
        return true;
      }
      if (!id || seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    });
  }

  function renderSubjectChips(row, matches) {
    const links = dedupeSubjectMatches(matches);
    if (!row || !links.length) return;
    const wrap = document.createElement("section");
    wrap.className = "subject-links";
    wrap.innerHTML = '<span class="subject-links-label">Fagkoblinger</span>';
    const chips = document.createElement("div");
    chips.className = "subject-link-chips";
    links.forEach((item) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "subject-link-chip";
      chip.textContent = String(item?.title || item?.subject_label || "Fagkobling");
      chip.addEventListener("click", () => {
        setComposerText(`Bygg videre på dette med utgangspunkt i [${chip.textContent}].`);
        setStatusNote(`La inn fagkobling: ${chip.textContent}`);
      });
      chips.appendChild(chip);
    });
    wrap.appendChild(chips);
    row.appendChild(wrap);
  }

  function appendChat(role, text, options) {
    const log = document.getElementById("chat-log");
    if (!log) return;
    const createdAt = String(options?.createdAt || new Date().toISOString());
    const messageId = String(options?.messageId || makeStableMessageId(role, text, createdAt));
    const row = document.createElement("article");
    row.className = `chat-line-row chat-line-row-${role}`;
    row.dataset.messageId = messageId;
    row.dataset.createdAt = createdAt;

    const div = document.createElement("div");
    div.className = `chat-line chat-line-${role}`;
    div.id = `chat-message-${messageId}`;
    div.textContent = text;

    const highlightBtn = document.createElement("button");
    highlightBtn.type = "button";
    highlightBtn.className = "highlight-toggle-btn";
    highlightBtn.setAttribute("aria-label", "Marker melding som highlight");
    highlightBtn.setAttribute("title", "Highlight");
    highlightBtn.textContent = "✦";
    highlightBtn.addEventListener("click", () => toggleHighlight(row, text));

    row.appendChild(div);
    const categories = Array.isArray(options?.categoryChips) ? options.categoryChips.filter(Boolean).slice(0, 8) : [];
    const subjectMatches = Array.isArray(options?.subjectMatches) ? options.subjectMatches.slice(0, 8) : [];
    if (categories.length) {
      const chips = document.createElement("div");
      chips.className = "message-category-chips";
      chips.setAttribute("aria-label", "Bygg-videre-kategorier");
      categories.forEach((label) => {
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "message-category-chip";
        chip.textContent = String(label);
        chip.addEventListener("click", () => {
          setComposerText(`Bygg videre på svaret med fokus på "${label}".`);
          setStatusNote(`La inn forslag for videre arbeid: ${label}`);
        });
        chips.appendChild(chip);
      });
      row.appendChild(chips);
    }
    if (subjectMatches.length) renderSubjectChips(row, subjectMatches);
    row.appendChild(highlightBtn);
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
    syncMessageHighlightState(row);
    renderHighlightsRail();
    updateEmptyState();
  }

  function previewText(text) {
    return String(text || "").trim().replace(/\s+/g, " ").slice(0, 96);
  }

  function toggleHighlight(row, text) {
    const messageId = row?.dataset?.messageId;
    if (!messageId) return;
    const threadId = getThreadId();
    const all = loadHighlights();
    const thread = all[threadId] || {};
    if (thread[messageId]) {
      delete thread[messageId];
    } else {
      thread[messageId] = { messageId, createdAt: row.dataset.createdAt || new Date().toISOString(), preview: previewText(text) };
    }
    all[threadId] = thread;
    saveHighlights(all);
    syncMessageHighlightState(row);
    renderHighlightsRail();
    setStatusNote(thread[messageId] ? "Highlight lagret." : "Highlight fjernet.");
  }

  function isHighlighted(messageId) {
    const thread = loadHighlights()[getThreadId()] || {};
    return Boolean(thread[messageId]);
  }

  function syncMessageHighlightState(row) {
    const messageId = row?.dataset?.messageId;
    if (!messageId) return;
    row.classList.toggle("is-highlighted", isHighlighted(messageId));
  }

  function renderHighlightsRail() {
    const rail = document.getElementById("chat-highlights-rail");
    const log = document.getElementById("chat-log");
    if (!rail || !log) return;
    rail.innerHTML = "";
    const thread = loadHighlights()[getThreadId()] || {};
    const rows = Array.from(log.querySelectorAll(".chat-line-row"));
    const max = Math.max(1, log.scrollHeight - log.clientHeight);
    let markerCount = 0;
    rows.forEach((row) => {
      const messageId = row.dataset.messageId;
      if (!thread[messageId]) return;
      markerCount += 1;
      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = "highlight-rail-marker";
      const offset = Math.max(0, row.offsetTop - 8);
      const ratio = Math.min(1, Math.max(0, offset / max));
      marker.style.top = `${ratio * 100}%`;
      marker.title = thread[messageId].preview || "Highlight";
      marker.setAttribute("aria-label", `Gå til highlight: ${thread[messageId].preview || "melding"}`);
      marker.addEventListener("click", () => {
        row.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      rail.appendChild(marker);
    });
    rail.classList.toggle("is-empty", markerCount === 0);
  }

  function updateEmptyState() {
    const empty = document.getElementById("empty-state");
    const log = document.getElementById("chat-log");
    if (!empty || !log) return;
    empty.style.display = log.children.length ? "none" : "block";
    renderHighlightsRail();
  }

  function setComposerText(value) {
    const textarea = document.getElementById("msg");
    if (!textarea) return;
    textarea.value = value;
    textarea.focus();
  }

  function currentInsights() {
    const chamber = loadChamberFromStorage();
    const active = typeof global.InsightsEngine.getActiveInsights === "function"
      ? global.InsightsEngine.getActiveInsights(chamber)
      : (chamber?.insights || []);
    return active.filter(
      (ins) => ins.subject_id === SUBJECT_ID && ins.theme_id === getThemeId()
    );
  }

  function renderPanel(html) {
    const panel = document.getElementById("panel");
    if (panel) panel.innerHTML = html;
  }


  function buildAhaAgentUrl(path) {
    const rawBase = String(global.AHA_AGENT_API || "").trim();
    if (!rawBase) return "";

    const base = rawBase.replace(/\/+$/, "");
    const normalizedPath = `/${String(path || "").trim().replace(/^\/+/, "")}`;
    const hasApiBase = /\/api\/aha-agent$/i.test(base);
    const rootBase = hasApiBase ? base : `${base}/api/aha-agent`;
    return `${rootBase}${normalizedPath}`;
  }

  async function generateAIInsightCandidates(text, context) {
    const raw = String(text || "").trim();
    if (!raw) return [];
    const insightCandidatesUrl = buildAhaAgentUrl("insight-candidates");
    if (!insightCandidatesUrl) return [];

    const body = {
      text: raw,
      context: context || {},
      format: "insight_candidates_v1"
    };

    try {
      const res = await fetch(insightCandidatesUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) return [];
      const data = await res.json();
      const candidates = Array.isArray(data?.candidates) ? data.candidates : (Array.isArray(data) ? data : []);
      return candidates
        .map((candidate) => normalizeInsightCandidate(candidate))
        .filter(Boolean)
        .filter((candidate) => !isWeakInsightCandidate(candidate, raw))
        .slice(0, 5);
    } catch (err) {
      console.warn("AI insight-candidates utilgjengelig", err);
      return [];
    }
  }

  function normalizeInsightCandidate(candidate) {
    if (!candidate || typeof candidate !== "object") return null;
    const text = String(candidate.text || candidate.summary || "").replace(/\s+/g, " ").trim();
    if (!text) return null;
    const summary = String(candidate.summary || text).replace(/\s+/g, " ").trim();
    const title = String(candidate.title || summary.split(/[.!?…]/)[0] || "Innsikt").trim().slice(0, 120);
    if (!title || !summary) return null;

    const concepts = filterConceptLabels(normalizeCandidateConcepts(candidate.concepts || [], text)).slice(0, 8);
    const thinkers = normalizeSimpleStringList(candidate.thinkers, 5);
    const theories = normalizeSimpleStringList(candidate.theories, 5);
    const traditions = normalizeSimpleStringList(candidate.traditions, 5);
    const theoreticalLinks = normalizeTheoreticalLinks(candidate.theoretical_links, 5);

    return {
      title,
      summary: summary.length > 320 ? `${summary.slice(0, 317)}…` : summary,
      text,
      functional_type: normalizeFunctionalType(candidate.functional_type),
      concepts,
      thinkers,
      theories,
      traditions,
      theoretical_links: theoreticalLinks,
      candidate_type: "ai"
    };
  }

  function isWeakInsightCandidate(candidate, sourceText) {
    if (!candidate || typeof candidate !== "object") return true;

    const title = String(candidate.title || "").replace(/\s+/g, " ").trim();
    const titleLower = title.toLowerCase();
    const genericTitles = new Set(["observasjon", "innsikt", "analyse"]);

    const summary = String(candidate.summary || candidate.text || "").replace(/\s+/g, " ").trim();
    const summaryLower = summary.toLowerCase();
    const source = String(sourceText || "").replace(/\s+/g, " ").trim();
    const sourceLower = source.toLowerCase();
    const sourceStart = sourceLower.slice(0, 220);

    const concepts = Array.isArray(candidate.concepts) ? candidate.concepts : [];
    const conceptWords = concepts
      .map((item) => String(item || "").trim().toLowerCase())
      .filter(Boolean);
    const nonWeakConcepts = conceptWords.filter((word) => !WEAK_CONCEPT_WORDS.has(word));
    const hasTheory = Boolean(
      (Array.isArray(candidate.thinkers) && candidate.thinkers.length) ||
      (Array.isArray(candidate.theories) && candidate.theories.length) ||
      (Array.isArray(candidate.traditions) && candidate.traditions.length) ||
      (Array.isArray(candidate.theoretical_links) && candidate.theoretical_links.length)
    );

    if (!title || genericTitles.has(titleLower)) return true;
    if (!summary) return true;
    if (sourceStart && (summaryLower === sourceStart || sourceStart.startsWith(summaryLower) || summaryLower.startsWith(sourceStart))) return true;
    if (sourceStart && summaryLower.slice(0, 140) === sourceStart.slice(0, 140)) return true;
    if (!conceptWords.length && !hasTheory) return true;
    if (conceptWords.length > 0 && nonWeakConcepts.length === 0 && !hasTheory) return true;

    return false;
  }

  function ingestUserMessageWithCandidates(messageText, candidates) {
    const text = String(messageText || "").trim();
    if (!text || !global.InsightsEngine) return 0;

    const themeId = getThemeId();
    const fieldId = getFieldId();
    const localCandidates = buildSemanticInsightCandidates(text, { minInsights: 1, maxInsights: 5 });
    const chunks = Array.isArray(candidates) && candidates.length ? candidates : localCandidates;

    if (global.AHAIngest && typeof global.AHAIngest.ingest === "function") {
      // AHAIngest håndterer både source event-loggen, signal-konstruksjon
      // og innlegging i innsiktskammeret. Dobbeltlagring av source events
      // unngås ved at vi ikke lenger kaller AHASources.addSourceEvent her.
      const payload = {
        source_type: "chat",
        source_app: "aha_chat",
        content_type: "text",
        title: "AHA Chat-melding",
        text,
        user_created: true,
        imported: false,
        created_at: new Date().toISOString(),
        subject_id: SUBJECT_ID,
        theme_id: themeId,
        field_id: fieldId,
        meta: { theme_id: themeId, field_id: fieldId }
      };
      if (typeof global.AHAIngest.ingestWithCandidates === "function") {
        global.AHAIngest.ingestWithCandidates(payload, chunks);
      } else {
        chunks.forEach((chunk) => global.AHAIngest.ingest(Object.assign({}, payload, { text: chunk })));
      }
      return chunks.length;
    }

    // Fallback hvis AHAIngest ikke er lastet: skriv direkte til motoren
    // og logg source event manuelt slik vi alltid har gjort.
    let chamber = loadChamberFromStorage();
    chunks.forEach((chunk) => {
      const text = typeof chunk === "string" ? chunk : String(chunk?.text || chunk?.summary || chunk?.title || "").trim();
      if (!text) return;
      const signal = global.InsightsEngine.createSignalFromMessage(
        text,
        SUBJECT_ID,
        themeId,
        { field_id: fieldId }
      );
      chamber = global.InsightsEngine.addSignalToChamber(chamber, signal);
    });
    saveChamberToStorage(chamber);

    global.AHASources?.addSourceEvent?.({
      source_type: "chat",
      source_app: "aha_chat",
      content_type: "text",
      title: "AHA Chat-melding",
      text,
      user_created: true,
      imported: false,
      created_at: new Date().toISOString(),
      meta: { theme_id: themeId, field_id: fieldId }
    });

    return chunks.length;
  }

  function handleUserMessage(messageText) {
    return ingestUserMessageWithCandidates(messageText);
  }

  async function handleUserMessageInsightCandidatesInBackground(messageText) {
    const text = String(messageText || "").trim();
    if (!text || !global.InsightsEngine) return 0;
    const themeId = getThemeId();
    const fieldId = getFieldId();
    const aiCandidates = await generateAIInsightCandidates(text, {
      subject_id: SUBJECT_ID,
      theme_id: themeId,
      field_id: fieldId,
      ai_state: buildAIState()
    });
    if (!aiCandidates.length) return 0;
    return ingestUserMessageWithCandidates(text, aiCandidates);
  }

  function buildSemanticInsightCandidates(text, options) {
    const raw = String(text || "").trim();
    if (!raw) return [];
    const playCityFallback = buildPlayCityFallbackCandidates(raw);
    if (playCityFallback.length) return playCityFallback;
    const sentences = splitIntoSentences(raw);
    if (sentences.length <= 2 || raw.length < 180) {
      return [toCandidateObject(raw, "observation")];
    }

    const minInsights = Number(options?.minInsights || 1);
    const maxInsights = Math.min(5, Math.max(1, Number(options?.maxInsights || 5)));
    const desired = raw.length < 320 ? 2 : raw.length < 700 ? 3 : 4;
    const target = Math.min(maxInsights, Math.max(minInsights, desired));

    const themeRules = [
      { type: "principle", re: /\b(kunnskap|prinsipp|lærer|læring|forstå|innsikt|erfaring)\b/i },
      { type: "problem", re: /\b(problem|straff|fengsel|vold|kontroll|krise|konflikt|ondt)\b/i },
      { type: "solution", re: /\b(løsning|kan|bør|må|frihet|legalisering|sikkerhet|reform)\b/i },
      { type: "contrast", re: /\b(men|samtidig|likevel|på den ene siden|på den andre siden)\b/i },
      { type: "question", re: /\?|\b(hvorfor|hvordan|hva om)\b/i }
    ];

    const groups = [];
    const used = new Set();
    themeRules.forEach((rule) => {
      const idxs = [];
      sentences.forEach((sentence, idx) => {
        if (!used.has(idx) && rule.re.test(sentence)) idxs.push(idx);
      });
      if (!idxs.length) return;
      idxs.forEach((idx) => used.add(idx));
      groups.push({ type: rule.type, text: idxs.map((idx) => sentences[idx]).join(" ") });
    });
    if (used.size < sentences.length) {
      const rest = sentences.filter((_, idx) => !used.has(idx)).join(" ");
      if (rest) groups.push({ type: "observation", text: rest });
    }

    const deduped = [];
    const seen = new Set();
    groups.forEach((group) => {
      const clean = String(group.text || "").replace(/\s+/g, " ").trim();
      if (!clean || clean.length < 60) return;
      const key = clean.toLowerCase().slice(0, 160);
      if (seen.has(key)) return;
      seen.add(key);
      deduped.push(toCandidateObject(clean, group.type));
    });

    if (!deduped.length) return [toCandidateObject(raw, "observation")];
    if (deduped.length <= target) return deduped;

    return deduped.slice(0, target);
  }

  function normalizeFunctionalType(value) {
    const raw = String(value || "").trim().toLowerCase();
    const mapped = raw === "contrast" ? "contradiction" : raw;
    if (AHA_INSIGHT_CONTRACT.FUNCTIONAL_TYPES.has(mapped)) return mapped;
    return "observation";
  }

  function normalizeCandidateConcepts(concepts, text) {
    const out = [];
    const seen = new Set();
    const add = (value) => {
      const label = String(value || "").trim();
      if (!label) return;
      const key = label.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(label);
    };
    (Array.isArray(concepts) ? concepts : []).forEach((c) => {
      if (typeof c === "string") add(c);
      else if (c && typeof c === "object") add(c.label || c.key || c.term);
    });
    return out;
  }
  function normalizeSimpleStringList(list, max) {
    const out = [];
    const seen = new Set();
    (Array.isArray(list) ? list : []).forEach((item) => {
      const value = String(item || "").trim();
      if (!value) return;
      const key = value.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(value);
    });
    return out.slice(0, Math.max(1, Number(max || 5)));
  }
  function normalizeTheoreticalLinks(list, max) {
    const out = [];
    const seen = new Set();
    (Array.isArray(list) ? list : []).forEach((item) => {
      if (!item || typeof item !== "object") return;
      const name = String(item.name || "").trim();
      const relation = String(item.relation || "").trim();
      if (!name || !relation) return;
      const key = `${name.toLowerCase()}|${relation.toLowerCase()}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ name, relation });
    });
    return out.slice(0, Math.max(1, Number(max || 5)));
  }

  function filterConceptLabels(concepts) {
    const seen = new Set();
    return (Array.isArray(concepts) ? concepts : [])
      .map((c) => typeof c === "string" ? c : (c?.label || c?.key || c?.term || ""))
      .map((c) => String(c || "").trim())
      .filter((c) => c && !WEAK_CONCEPT_WORDS.has(c.toLowerCase()))
      .filter((c) => {
        const key = c.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function buildPlayCityFallbackCandidates(raw) {
    const text = String(raw || "");
    const lower = text.toLowerCase();
    const playHit = /\blek\b|\blæring\b|\btrygghet\b/.test(lower);
    const cityHit = /\bbyrom\b|\bparker\b|\btorg\b|\bbibliotek\b|\bskolegård/.test(lower);
    if (!playHit || !cityHit) return [];
    return [
      { title: "Lek som kunnskapsform", summary: "Lek gir mennesker rom til å prøve, feile og begynne på nytt uten skam, og fungerer som sosial og emosjonell læring.", functional_type: "principle", concepts: ["lek", "kunnskap", "læring", "trygghet"], candidate_type: "semantic" },
      { title: "Byrom som frihetsrom", summary: "Byen blir mer enn infrastruktur når parker, torg, skolegårder og bibliotek åpner for tilstedeværelse, fantasi og kroppslig utfoldelse.", functional_type: "principle", concepts: ["byrom", "frihet", "offentlighet", "fantasi"], candidate_type: "semantic" },
      { title: "Fellesskap gjennom uformelle møteplasser", summary: "Uformelle møteplasser lar språk, kropp og relasjoner vokse uten sterk måling, eierskap eller kontroll.", functional_type: "pattern", concepts: ["fellesskap", "møteplass", "kropp", "relasjoner"], candidate_type: "semantic" }
    ].map((c) => Object.assign({}, c, { text: c.summary }));
  }

  function toCandidateObject(text, functionalType) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    const summary = clean.length > 220 ? `${clean.slice(0, 217)}…` : clean;
    const concepts = normalizeCandidateConcepts([], clean);
    return {
      title: summary.split(/[.!?…]/)[0].slice(0, 80) || "Innsikt",
      summary,
      text: clean,
      functional_type: normalizeFunctionalType(functionalType),
      concepts,
      candidate_type: "semantic"
    };
  }

  function splitIntoSentences(text) {
    const normalized = String(text || "").replace(/\r\n?/g, "\n");
    const paragraphs = normalized.split(/\n+/).map((part) => part.trim()).filter(Boolean);
    const chunks = [];

    paragraphs.forEach((paragraph) => {
      const matches = paragraph.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) || [];
      matches.forEach((match) => {
        const chunk = String(match || "").trim();
        if (chunk) chunks.push(chunk);
      });
    });

    return chunks;
  }

  function buildAIState() {
    const chamber = loadChamberFromStorage();
    const insights = currentInsights();
    const topInsights = insights.slice(0, 8).map((ins) => ({
      id: ins.id,
      title: ins.title || "Innsikt",
      summary: ins.summary || "",
      concepts: ins.concepts || [],
      theme_id: ins.theme_id || null,
      subject_id: ins.subject_id || null
    }));
    const concepts = [];
    topInsights.forEach((ins) => (ins.concepts || []).forEach((c) => concepts.push(c)));
    const metaProfile = global.MetaInsightsEngine?.buildUserMetaProfile?.(chamber, SUBJECT_ID) || {};
    return {
      top_insights: topInsights,
      concepts,
      meta_profile: metaProfile
    };
  }

  async function askAhaAgent(message) {
    const apiBase = String(global.AHA_AGENT_API || "").trim().replace(/\/$/, "");
    if (!apiBase) throw new Error("missing_api_base");

    let similar = [];
    if (global.AHAEmbeddings?.findSimilarToText) {
      try {
        const simRes = await global.AHAEmbeddings.findSimilarToText(message, {
          limit: 5,
          // Filtrer ut insights som er sammenslått inn i andre, slik at
          // merged sources ikke konkurrerer som aktive kandidater.
          chamber: loadChamberFromStorage()
        });
        if (simRes?.ok) similar = simRes.matches || [];
      } catch (err) {
        console.warn("Klarte ikke hente similar insights", err);
      }
    }

    const body = {
      message,
      ai_state: buildAIState(),
      similar_insights: similar,
      profile: {}
    };
    const res = await fetch(`${apiBase}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`chat_http_${res.status}`);
    return res.json();
  }

  function escHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderLayerChips(items, getLabel) {
    const labels = (items || [])
      .map((item) => {
        const label = getLabel(item);
        return label ? escHtml(label) : "";
      })
      .filter(Boolean);
    if (!labels.length) return "";
    return `<div class="insight-layer-chips">${labels
      .map((label) => `<span class="insight-chip">${label}</span>`)
      .join("")}</div>`;
  }

  function renderEmneSuggestions(insight) {
    const list = Array.isArray(insight.emne_suggestions) ? insight.emne_suggestions : [];
    const open = list.filter((s) => s && s.emne_id && (s.status || "suggested") === "suggested");
    if (!open.length) return "";

    const items = open.map((s) => {
      const label = escHtml(s.label || s.short_label || s.title || s.emne_id);
      const subject = s.subject_id ? `<small class="emne-subject">${escHtml(s.subject_id)}</small>` : "";
      const insightId = escHtml(insight.id || "");
      const emneId = escHtml(s.emne_id);
      return `<li class="emne-suggestion">
        <span class="emne-suggestion-label">${label}${subject}</span>
        <span class="emne-suggestion-actions">
          <button type="button" class="emne-confirm-btn" data-action="confirm-emne" data-insight-id="${insightId}" data-emne-id="${emneId}">Legg til</button>
          <button type="button" class="emne-dismiss-btn" data-action="dismiss-emne" data-insight-id="${insightId}" data-emne-id="${emneId}">Ignorer</button>
        </span>
      </li>`;
    }).join("");

    return `<div class="insight-section">
      <span class="insight-section-label">Foreslåtte emner</span>
      <ul class="emne-suggestion-list">${items}</ul>
    </div>`;
  }

  function dedupeTheoryLabels(labels, excludedLower) {
    const seen = new Set();
    const excluded = excludedLower || new Set();
    return (Array.isArray(labels) ? labels : [])
      .map((label) => String(label || "").trim())
      .filter((label) => {
        if (!label) return false;
        const key = label.toLowerCase();
        if (excluded.has(key) || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function buildTheorySection(ins) {
    const links = (Array.isArray(ins.theoretical_links) ? ins.theoretical_links : [])
      .map((item) => ({
        thinker: String(item?.name || "").trim(),
        theory: String(item?.theory || "").trim(),
        relation: String(item?.relation || "").trim()
      }))
      .filter((item) => item.thinker && item.relation)
      .slice(0, 3);

    const linkedThinkers = new Set(links.map((item) => item.thinker.toLowerCase()));
    const fallbackTheoryChips = dedupeTheoryLabels(
      []
        .concat(Array.isArray(ins.thinkers) ? ins.thinkers : [])
        .concat(Array.isArray(ins.theories) ? ins.theories : [])
        .concat(Array.isArray(ins.traditions) ? ins.traditions : []),
      linkedThinkers
    );

    if (!links.length && !fallbackTheoryChips.length) return "";

    const linksHtml = links.length
      ? `<div class="insight-theory-links">${links
        .map((item) => `<article class="insight-theory-link">
            <p><span class="insight-theory-key">Tenker:</span> ${escHtml(item.thinker)}</p>
            ${item.theory ? `<p><span class="insight-theory-key">Teori:</span> ${escHtml(item.theory)}</p>` : ""}
            <p><span class="insight-theory-key">Kobling:</span> ${escHtml(item.relation)}</p>
          </article>`)
        .join("")}</div>`
      : "";

    const fallbackChipsHtml = fallbackTheoryChips.length
      ? renderLayerChips(fallbackTheoryChips.map((label) => ({ label })), (x) => x?.label)
      : "";

    return `<div class="insight-section"><span class="insight-section-label">Teori</span>${linksHtml}${fallbackChipsHtml}</div>`;
  }

  function renderInsightCard(ins) {
    const title = escHtml(ins.candidate_title || ins.title || "Innsikt");
    const summary = escHtml(ins.candidate_summary || ins.summary || "");

    const conceptsHtml = renderLayerChips(filterConceptLabels(ins.concepts).map((label) => ({ label })), (c) => c?.label);
    const patternsHtml = renderLayerChips(ins.patterns, (p) => p?.label || p?.key);
    const markersHtml = renderLayerChips(ins.markers, (m) => m?.value);
    const emnerHtml = renderLayerChips((ins.emner || []).map((e) => ({ key: e })), (e) => e?.key);
    const theorySection = buildTheorySection(ins);
    const suggestionsHtml = renderEmneSuggestions(ins);

    const claims = (ins.claims || [])
      .map((c) => (c && c.text) || "")
      .filter(Boolean);
    const claimsHtml = claims.length
      ? `<ul class="insight-claims">${claims
          .map((q) => `<li>“${escHtml(q)}”</li>`)
          .join("")}</ul>`
      : "";

    const sections = [
      conceptsHtml ? `<div class="insight-section"><span class="insight-section-label">Begreper</span>${conceptsHtml}</div>` : "",
      patternsHtml ? `<div class="insight-section"><span class="insight-section-label">Mønstre</span>${patternsHtml}</div>` : "",
      claimsHtml ? `<div class="insight-section"><span class="insight-section-label">Påstander</span>${claimsHtml}</div>` : "",
      markersHtml ? `<div class="insight-section"><span class="insight-section-label">Markører</span>${markersHtml}</div>` : "",
      emnerHtml ? `<div class="insight-section"><span class="insight-section-label">Bekreftede emner</span>${emnerHtml}</div>` : "",
      theorySection,
      suggestionsHtml
    ].filter(Boolean).join("");

    return `<li class="insight-card" data-insight-id="${escHtml(ins.id || "")}">
      <strong class="insight-card-title">${title}</strong>
      ${summary ? `<p class="insight-card-summary">${summary}</p>` : ""}
      ${sections}
    </li>`;
  }

  function resolvePanelAction(target) {
    if (!target) return null;
    const button = target.closest && target.closest("[data-action]");
    if (!button) return null;
    const action = button.getAttribute("data-action");
    if (action === "confirm-emne" || action === "dismiss-emne") {
      return {
        action,
        insightId: button.getAttribute("data-insight-id") || "",
        emneId: button.getAttribute("data-emne-id") || ""
      };
    }
    if (action === "confirm-merge" || action === "dismiss-merge") {
      return {
        action,
        sourceId: button.getAttribute("data-source-id") || "",
        targetId: button.getAttribute("data-target-id") || ""
      };
    }
    return null;
  }

  function applyEmneSuggestionAction(action, insightId, emneId) {
    if (!insightId || !emneId) return false;
    const chamber = loadChamberFromStorage();
    const insight = (chamber.insights || []).find((ins) => ins.id === insightId);
    if (!insight) return false;

    const engine = global.InsightsEngine || {};
    let changed = false;
    if (action === "confirm-emne" && typeof engine.confirmEmneSuggestion === "function") {
      changed = engine.confirmEmneSuggestion(insight, emneId);
    } else if (action === "dismiss-emne" && typeof engine.dismissEmneSuggestion === "function") {
      changed = engine.dismissEmneSuggestion(insight, emneId);
    }
    if (!changed) return false;

    saveChamberToStorage(chamber);

    try {
      global.dispatchEvent(new CustomEvent("aha:emne-suggestion-resolved", {
        detail: { insight_id: insightId, emne_id: emneId, action }
      }));
    } catch {}

    return true;
  }

  function refreshTargetEmbedding(target) {
    if (!target?.id) return;
    if (!global.AHAEmbeddings || typeof global.AHAEmbeddings.embedAndStore !== "function") return;
    if (typeof global.AHAEmbeddings.isConfigured === "function" && !global.AHAEmbeddings.isConfigured()) return;
    // Fire-and-forget: target-insighten har fått ny mening gjennom
    // merge (concepts, claims, patterns, markers, emner). Vi re-embed-er
    // den så semantisk søk treffer den nye representasjonen, men
    // hovedflyten venter aldri på dette.
    global.AHAEmbeddings.embedAndStore(target).then((result) => {
      if (!result?.ok) return;
      try {
        global.dispatchEvent(new CustomEvent("aha:embedding-refreshed", {
          detail: { insight_id: target.id, reason: "merge_confirmed" }
        }));
      } catch {}
    }).catch((err) => {
      console.warn("AHAChat: re-embed etter merge feilet", err);
    });
  }

  function applyMergeAction(action, sourceId, targetId) {
    if (!sourceId || !targetId) return false;
    const chamber = loadChamberFromStorage();
    const engine = global.InsightsEngine || {};
    let changed = false;
    if (action === "confirm-merge" && typeof engine.confirmMerge === "function") {
      changed = engine.confirmMerge(chamber, sourceId, targetId);
    } else if (action === "dismiss-merge" && typeof engine.dismissMergeSuggestion === "function") {
      changed = engine.dismissMergeSuggestion(chamber, sourceId, targetId);
    }
    if (!changed) return false;

    saveChamberToStorage(chamber);

    if (action === "confirm-merge") {
      const target = (chamber.insights || []).find((ins) => ins.id === targetId);
      if (target) refreshTargetEmbedding(target);
    }

    try {
      global.dispatchEvent(new CustomEvent("aha:merge-resolved", {
        detail: { source_id: sourceId, target_id: targetId, action }
      }));
    } catch {}

    return true;
  }

  function bindPanelActionHandler() {
    const panel = document.getElementById("panel");
    if (!panel || panel.dataset.ahaPanelBound === "true") return;
    panel.dataset.ahaPanelBound = "true";
    panel.addEventListener("click", (event) => {
      const resolved = resolvePanelAction(event.target);
      if (!resolved) return;
      event.preventDefault();
      let ok = false;
      if (resolved.action === "confirm-emne" || resolved.action === "dismiss-emne") {
        ok = applyEmneSuggestionAction(resolved.action, resolved.insightId, resolved.emneId);
      } else if (resolved.action === "confirm-merge" || resolved.action === "dismiss-merge") {
        ok = applyMergeAction(resolved.action, resolved.sourceId, resolved.targetId);
      }
      if (ok) showInsights();
    });
  }

  function renderMergeSuggestionsSection() {
    const chamber = loadChamberFromStorage();
    const suggestions = (Array.isArray(chamber.merge_suggestions) ? chamber.merge_suggestions : [])
      .filter((s) => s && s.status === "pending");
    if (!suggestions.length) return "";

    const items = suggestions.map((s) => {
      const sourceSummary = escHtml((s.source_summary || s.source_id || "").slice(0, 120));
      const targetSummary = escHtml((s.target_summary || s.target_id || "").slice(0, 120));
      const sim = Number.isFinite(s.similarity) ? s.similarity.toFixed(2) : "?";
      const sourceId = escHtml(s.source_id || "");
      const targetId = escHtml(s.target_id || "");
      return `<li class="merge-suggestion">
        <div class="merge-suggestion-text">
          <div class="merge-suggestion-row"><span class="merge-suggestion-label">Ny:</span> ${sourceSummary}</div>
          <div class="merge-suggestion-row"><span class="merge-suggestion-label">Ligner på:</span> ${targetSummary}</div>
          <small class="merge-suggestion-meta">cosine ${sim}</small>
        </div>
        <div class="merge-suggestion-actions">
          <button type="button" class="merge-confirm-btn" data-action="confirm-merge" data-source-id="${sourceId}" data-target-id="${targetId}">Slå sammen</button>
          <button type="button" class="merge-dismiss-btn" data-action="dismiss-merge" data-source-id="${sourceId}" data-target-id="${targetId}">Ignorer</button>
        </div>
      </li>`;
    }).join("");

    return `<section class="merge-suggestion-panel">
      <h3>Foreslåtte sammenslåinger</h3>
      <p class="merge-suggestion-hint">Embedding-laget mener disse innsiktene kan være samme tanke. Ingenting slås sammen før du bekrefter.</p>
      <ul class="merge-suggestion-list">${items}</ul>
    </section>`;
  }

  function showInsights() {
    const insights = currentInsights();
    const mergeSection = renderMergeSuggestionsSection();
    renderPanel(
      `<div class="insight-panel">${mergeSection}<h2>Innsikter</h2>${
        insights.length
          ? `<ul class="insight-list">${insights.map(renderInsightCard).join("")}</ul>`
          : "<p>Ingen innsikter ennå.</p>"
      }</div>`
    );
  }

  function showStatus() {
    const chamber = loadChamberFromStorage();
    const stats = global.InsightsEngine.computeTopicStats(chamber, SUBJECT_ID, getThemeId());
    out(JSON.stringify(stats, null, 2));
  }

  function showConcepts() {
    const insights = currentInsights();
    const concepts = new Set();
    const rawTerms = new Set();
    const claims = new Set();
    const patterns = new Set();
    const markers = new Set();

    insights.forEach((ins) => {
      (ins.concepts || []).forEach((c) => {
        const label = (c && (c.label || c.key)) || c;
        if (label) concepts.add(label);
      });
      (ins.raw_terms || []).forEach((c) => {
        const label = (c && (c.key || c.label)) || c;
        if (label) rawTerms.add(label);
      });
      (ins.claims || []).forEach((c) => {
        const label = c && c.text;
        if (label) claims.add(label);
      });
      (ins.patterns || []).forEach((c) => {
        const label = (c && (c.label || c.key)) || c;
        if (label) patterns.add(label);
      });
      (ins.markers || []).forEach((c) => {
        const label = c && c.value;
        if (label) markers.add(label);
      });
    });

    out(JSON.stringify({
      concepts: [...concepts].filter(Boolean),
      patterns: [...patterns].filter(Boolean),
      claims: [...claims].filter(Boolean),
      markers: [...markers].filter(Boolean),
      raw_terms: [...rawTerms].filter(Boolean)
    }, null, 2));
  }

  function renderMetaSection(label, items) {
    const list = (items || []).filter(Boolean);
    if (!list.length) return "";
    const body = list.map((item) => `<li>${item}</li>`).join("");
    return `<section class="meta-section">
      <h4 class="meta-section-label">${escHtml(label)}</h4>
      <ul class="meta-section-list">${body}</ul>
    </section>`;
  }

  function buildDedupedTheoryLinks(chamber, maxItems) {
    const safeChamber = chamber && typeof chamber === "object" ? chamber : {};
    const bestByKey = new Map();
    (Array.isArray(safeChamber?.insights) ? safeChamber.insights : []).forEach((insight) => {
      if (!global.InsightsEngine?.scoreTheoryRelevance) return;
      const scored = global.InsightsEngine.scoreTheoryRelevance(insight, safeChamber) || [];
      scored.forEach((link) => {
        const name = String(link?.name || link?.theory || "Ukjent").trim();
        const relation = String(link?.relation || "").trim();
        if (!name || !relation) return;
        const score = Number(link?.relevance_score || link?.score || 0);
        if (!Number.isFinite(score)) return;
        const key = `${name.toLowerCase()}|${relation.toLowerCase()}`;
        const current = bestByKey.get(key);
        if (!current || score > current.score) {
          bestByKey.set(key, {
            name,
            relation: relation.length > 160 ? `${relation.slice(0, 157)}…` : relation,
            score
          });
        }
      });
    });
    return Array.from(bestByKey.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, Number(maxItems || 4)));
  }

  function collectTheoryPeople(chamber, recurringTopTheories, maxItems) {
    const counts = new Map();
    const add = (value) => {
      const label = String(value || "").trim();
      if (!label) return;
      const key = label.toLowerCase();
      const prev = counts.get(key);
      if (prev) {
        prev.count += 1;
      } else {
        counts.set(key, { key: label, count: 1 });
      }
    };

    (Array.isArray(recurringTopTheories) ? recurringTopTheories : []).forEach((item) => {
      if (!item || !item.key) return;
      counts.set(String(item.key).trim().toLowerCase(), { key: String(item.key).trim(), count: Number(item.count || 1) });
    });

    (Array.isArray(chamber?.insights) ? chamber.insights : []).forEach((insight) => {
      (Array.isArray(insight?.thinkers) ? insight.thinkers : []).forEach(add);
      (Array.isArray(insight?.theories) ? insight.theories : []).forEach(add);
      (Array.isArray(insight?.theoretical_links) ? insight.theoretical_links : []).forEach((link) => {
        add(link?.name);
        add(link?.theory);
      });
    });

    return Array.from(counts.values())
      .filter((item) => item.key)
      .sort((a, b) => (b.count - a.count) || a.key.localeCompare(b.key))
      .slice(0, Math.max(1, Number(maxItems || 4)));
  }

  function renderConceptNetwork(graphData) {
    const graph = graphData && typeof graphData === "object" ? graphData : {};
    const edges = Array.isArray(graph.edges) ? graph.edges : [];
    const sortedConnections = edges
      .filter((edge) => edge?.type === "co_occurs" && edge?.from && edge?.to)
      .sort((a, b) => (Number(b?.weight || 0) - Number(a?.weight || 0)))
      .slice(0, 8);

    if (!sortedConnections.length) {
      return "<p class='knowledge-sub'>For få koblinger til å bygge nettverk ennå.</p>";
    }

    const nodeCounts = new Map();
    sortedConnections.forEach((edge) => {
      const weight = Number(edge?.weight || 0);
      const from = String(edge.from).trim();
      const to = String(edge.to).trim();
      if (!from || !to) return;
      nodeCounts.set(from, (nodeCounts.get(from) || 0) + Math.max(1, weight));
      nodeCounts.set(to, (nodeCounts.get(to) || 0) + Math.max(1, weight));
    });

    const topConcepts = Array.from(nodeCounts.entries())
      .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
      .slice(0, 5)
      .map(([name]) => name);

    if (topConcepts.length < 2) {
      return "<p class='knowledge-sub'>For få koblinger til å bygge nettverk ennå.</p>";
    }

    const topSet = new Set(topConcepts);
    const filteredEdges = sortedConnections.filter((edge) => topSet.has(edge.from) && topSet.has(edge.to));
    const networkEdges = filteredEdges.length ? filteredEdges : sortedConnections.slice(0, Math.min(3, sortedConnections.length));

    const adjacency = new Map();
    networkEdges.forEach((edge) => {
      const from = String(edge.from).trim();
      const to = String(edge.to).trim();
      if (!from || !to) return;
      if (!adjacency.has(from)) adjacency.set(from, []);
      if (!adjacency.has(to)) adjacency.set(to, []);
      adjacency.get(from).push({ target: to, weight: Number(edge.weight || 0) });
      adjacency.get(to).push({ target: from, weight: Number(edge.weight || 0) });
    });

    const orderedRoots = topConcepts.filter((name) => adjacency.has(name));
    if (!orderedRoots.length) {
      return "<p class='knowledge-sub'>For få koblinger til å bygge nettverk ennå.</p>";
    }

    const rows = orderedRoots.map((name) => {
      const links = (adjacency.get(name) || [])
        .sort((a, b) => (b.weight - a.weight) || a.target.localeCompare(b.target))
        .slice(0, 3);
      const children = links.length
        ? `<ul class="concept-network-links">${links.map((entry) => `<li><span class="concept-node-badge">${escHtml(entry.target)}</span></li>`).join("")}</ul>`
        : `<p class="knowledge-sub concept-network-empty">Ingen sterke koblinger registrert for dette begrepet ennå.</p>`;
      return `<li class="concept-network-item"><span class="concept-node-badge">${escHtml(name)}</span>${children}</li>`;
    }).join("");

    return `<div class="concept-network" aria-label="Begrepsnettverk">
      <ul class="concept-network-list">${rows}</ul>
    </div>`;
  }



  function renderKnowledgeMapSection(chamber, profile) {
    const safeChamber = chamber && typeof chamber === "object" ? chamber : {};
    const recurringThemes = global.InsightsEngine?.getRecurringThemes
      ? global.InsightsEngine.getRecurringThemes(safeChamber, { windows: [14, 30] })
      : {};
    const conceptGraph = global.InsightsEngine?.buildConceptGraph
      ? global.InsightsEngine.buildConceptGraph(safeChamber)
      : { nodes: {}, edges: [] };

    const theoryLinks = buildDedupedTheoryLinks(safeChamber, 4);

    const tensions = global.InsightsEngine?.detectTensions
      ? (global.InsightsEngine.detectTensions(safeChamber) || [])
      : [];

    const graphNodes = Object.values(conceptGraph?.nodes || {});
    const conceptNodeCount = graphNodes.filter((node) => node?.type === "concept").length;
    const theoryNodeCount = graphNodes.filter((node) => node?.type === "theory" || node?.type === "thinker").length;
    const topEdges = (conceptGraph?.edges || [])
      .filter((edge) => edge?.type === "co_occurs")
      .sort((a, b) => (b?.weight || 0) - (a?.weight || 0))
      .slice(0, 3);

    const themes14d = (recurringThemes?.["14d"]?.top_concepts || []).slice(0, 3);
    const themes30d = (recurringThemes?.["30d"]?.top_concepts || []).slice(0, 3);
    const topTheoryPeople = collectTheoryPeople(safeChamber, recurringThemes?.["30d"]?.top_theories, 4);
    const visibleTensions = tensions.slice(0, 4);

    return `<section class="knowledge-map-block">
      <h3>Kunnskapskart</h3>
      <div class="knowledge-map-grid">
        <article class="knowledge-card">
          <h4>Tilbakevendende tema</h4>
          <p class="knowledge-sub">14d: ${themes14d.length ? themes14d.map((item) => `${escHtml(item.key)} (${item.count})`).join(", ") : "Ingen tydelige begreper ennå."}</p>
          <p class="knowledge-sub">30d: ${themes30d.length ? themes30d.map((item) => `${escHtml(item.key)} (${item.count})`).join(", ") : "Mangler data for siste 30 dager."}</p>
          <p class="knowledge-sub">Teori/tenkere: ${topTheoryPeople.length ? topTheoryPeople.map((item) => `${escHtml(item.key)} (${item.count})`).join(", ") : "Ingen teorikoblinger funnet ennå."}</p>
        </article>
        <article class="knowledge-card">
          <h4>Begrepsgraf</h4>
          <p class="knowledge-sub">Begrepsnoder: <strong>${conceptNodeCount}</strong></p>
          <p class="knowledge-sub">Teori-/tenkernoder: <strong>${theoryNodeCount}</strong></p>
          <p class="knowledge-sub">Sterkeste co-occurs: ${topEdges.length ? topEdges.map((edge) => `${escHtml(edge.from)} ↔ ${escHtml(edge.to)} (${edge.weight})`).join(", ") : "Ingen samforekomst-koblinger ennå."}</p>
          <h5 class="knowledge-mini-title">Begrepsnettverk</h5>
          ${renderConceptNetwork(conceptGraph)}
        </article>
        <article class="knowledge-card">
          <h4>Teorikoblinger</h4>
          ${theoryLinks.length ? `<ul>${theoryLinks.map((link) => `<li><strong>${escHtml(link.name)}</strong> · ${escHtml(link.score.toFixed(2))}${link.relation ? ` · ${escHtml(link.relation)}` : ""}</li>`).join("")}</ul>` : "<p class='knowledge-sub'>Ingen teoretiske koblinger å score ennå.</p>"}
        </article>
        <article class="knowledge-card">
          <h4>Spenninger</h4>
          ${visibleTensions.length ? `<ul>${visibleTensions.map((item) => `<li><strong>${escHtml(String(item?.title || "Ukjent"))}</strong> · styrke ${escHtml(String(item?.strength || 0))}</li>`).join("")}</ul>` : "<p class='knowledge-sub'>Ingen spenningspar oppdaget ennå.</p>"}
        </article>
      </div>
    </section>`;
  }

  function chamberHasKnowledgeMapData(chamber) {
    return Boolean(chamber && Array.isArray(chamber.insights) && chamber.insights.length);
  }

  function renderMetaProfile(profile, chamber) {
    if (!profile || typeof profile !== "object") return "";

    const recent = profile.temporal?.recent_focus || {};
    const tensions = profile.tensions || {};
    const recs = profile.recommendations || {};
    const totalInsights = Array.isArray(profile.insights) ? profile.insights.length : 0;
    const window = recent.window_days ? ` (siste ${recent.window_days} dager)` : "";

    const recentConcepts = (recent.concepts || []).slice(0, 6).map((c) =>
      `${escHtml(c.key)} <span class="meta-count">×${c.count}</span>`
    );
    const emerging = (recent.emerging || []).slice(0, 5).map((c) =>
      `${escHtml(c.key)} <span class="meta-count">×${c.count}</span>`
    );
    const fading = (recent.fading || []).slice(0, 5).map((c) =>
      `${escHtml(c.key)} <span class="meta-count">tidligere ×${c.prev_count}</span>`
    );
    const conceptTensions = (tensions.concept_tensions || []).slice(0, 5).map((t) =>
      `${escHtml(t.key)} <span class="meta-count">spenning ${Number(t.combined).toFixed(2)}</span>`
    );
    const paradoxes = (tensions.paradox_pairs || []).slice(0, 5).map((p) => {
      const shared = (p.shared_concepts || []).slice(0, 3).map(escHtml).join(", ");
      const themeText = p.theme_id ? ` i <em>${escHtml(p.theme_id)}</em>` : "";
      return `${shared || "(begreper)"}${themeText}`;
    });
    const unstick = (recs.unstick_prompts || []).slice(0, 4).map((u) =>
      escHtml(u.prompt || "")
    );
    const resurface = (recs.resurface_insights || []).slice(0, 4).map((r) =>
      `${escHtml((r.summary || "").slice(0, 160))} <span class="meta-count">${escHtml((r.shared_concepts || []).join(", "))}</span>`
    );
    const bridging = (recs.bridging_pairs || []).slice(0, 4).map((b) =>
      `${escHtml(b.source)} ↔ ${escHtml(b.target)} <span class="meta-count">npmi ${Number(b.npmi).toFixed(2)}</span>`
    );
    const underexplored = (recs.underexplored_concepts || []).slice(0, 5).map((u) =>
      `${escHtml(u.key)} <span class="meta-count">×${u.count} · ${escHtml(u.reason || "")}</span>`
    );

    const sections = [
      renderMetaSection(`Det du tenker mest på${window}`, recentConcepts),
      renderMetaSection("Nye temaer som dukker opp", emerging),
      renderMetaSection("Tankegods som har stilnet", fading),
      renderMetaSection("Spenninger jeg ser", conceptTensions),
      renderMetaSection("Paradokser i materialet", paradoxes),
      renderMetaSection("Spørsmål som kan løsne fastlåsthet", unstick),
      renderMetaSection("Refleksjoner verdt å hente frem", resurface),
      renderMetaSection("Koblinger verdt å tenke videre på", bridging),
      renderMetaSection("Tanker som ikke kobler seg ennå", underexplored)
    ].filter(Boolean).join("");

    const knowledgeMap = renderKnowledgeMapSection(chamber, profile);

    if (!sections) {
      return `<div class="meta-profile">
        <h3>Hva AHA ser i materialet ditt</h3>
        <p class="meta-empty">AHA har ennå ikke nok å gå på. Skriv mer i chat eller importer fra History Go.</p>
        ${knowledgeMap}
      </div>`;
    }

    return `<div class="meta-profile">
      <h3>Hva AHA ser i materialet ditt</h3>
      <p class="meta-meta">${totalInsights} innsikter analysert.</p>
      ${sections}
      ${knowledgeMap}
    </div>`;
  }

  function showMeta() {
    const chamber = loadChamberFromStorage();
    if (!global.MetaInsightsEngine?.buildUserMetaProfile) {
      out("MetaInsightsEngine mangler buildUserMetaProfile.");
      return;
    }
    const profile = global.MetaInsightsEngine.buildUserMetaProfile(chamber, SUBJECT_ID);
    renderPanel(renderMetaProfile(profile, chamber));
    out("");
  }

  function showKnowledgeMap() {
    const chamber = loadChamberFromStorage();
    const hasData = chamberHasKnowledgeMapData(chamber);
    if (!global.MetaInsightsEngine?.buildUserMetaProfile) {
      out("MetaInsightsEngine mangler buildUserMetaProfile.");
      return;
    }
    const profile = global.MetaInsightsEngine.buildUserMetaProfile(chamber, SUBJECT_ID);
    const content = hasData
      ? renderKnowledgeMapSection(chamber, profile)
      : `<section class="knowledge-map-block">
          <h3>Kunnskapskart</h3>
          <p class="meta-empty">AHA har ikke nok innsikter til å bygge kunnskapskart ennå.</p>
        </section>`;
    renderPanel(`<div class="insight-panel">${content}</div>`);
    out("");
  }

  function reset() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(HIGHLIGHTS_STORAGE_KEY);
    localStorage.removeItem(AUTO_OUTPUT_STORAGE_KEY);
    out("AHA-kammer nullstilt.");
    setStatusNote("Nullstilt lokalt kammer og highlights.");
    renderPanel("");
    const log = document.getElementById("chat-log");
    if (log) log.innerHTML = "";
    const autoOutput = document.getElementById("aha-auto-output");
    if (autoOutput) autoOutput.innerHTML = "";
    renderHighlightsRail();
    updateEmptyState();
  }

  function toSentences(text) {
    return String(text || "").split(/(?<=[.!?])\s+|\n+/).map((part) => part.trim()).filter(Boolean);
  }

  function detectTextType(raw) {
    const text = String(raw || "").toLowerCase();
    if (!text) return "general";

    const projectSignals = /(prosjekt|app|funksjon|repo|prompt|merge|backend|frontend|modul|data|layout|kode|deploy|bug|commit|pull request|pr\b)/i;
    if (projectSignals.test(text)) return "project_note";

    const theorySignals = /(teori|modell|bevissthet|kunnskap|hypotese|begrep|premiss|epistem|system|metode)/i;
    if (theorySignals.test(text)) return "theory_idea";

    const daySignals = /(i dag|idag|dagen min|jeg våknet|jeg hentet|jeg leverte|på jobb|etterpå|i kveld|i morges|vi dro|jeg gjorde|formiddag|ettermiddag)/i;
    const literaryDiarySignals = /(jeg trodde|jeg burde|jeg er lei|jeg skjønner|jeg tenkte|her om dagen|i forrigårs|fortsatt|neste uke|ringe|savn|sinne|kjærlighet|skyld|skam|fremmedhet|forfatter|poetisk|skrive|tekst|leve vilt|reise|nomad|kurbad|hageanlegg|leilighet|telefon|park|møte)/i;
    const literaryFragmentSignals = /(scene|stemning|rytme|lys|mørke|rommet|gaten|kropp|språk|vind|lukt|hud|sans)/i;

    const sentenceCount = toSentences(text).length;
    const pronounCount = (text.match(/\bjeg\b/g) || []).length;

    if (pronounCount >= 3 && literaryDiarySignals.test(text) && sentenceCount >= 4) return "literary_diary";
    if (daySignals.test(text)) return "day_log";
    if (literaryFragmentSignals.test(text) && sentenceCount >= 2) return "literary_fragment";
    if (pronounCount >= 4 && sentenceCount >= 5 && literaryDiarySignals.test(text)) return "literary_diary";
    return "general";
  }

  function takeKeywords(text, maxItems) {
    const tokens = String(text || "").toLowerCase().match(/[a-zæøå0-9]{2,}/g) || [];
    const stop = new Set(["litt","henne","han","hun","hadde","har","var","være","vært","blir","ble","blitt","dette","denne","disse","fordi","kanskje","hvorfor","etter","veldig","ikke","bare","også","med","som","skal","mellom","uten","noen","noe","alle","der","her","nå","fortsatt","først","tredje","runden","gammel","gamle","unge","godt","dårlig","helt","ennå","eller","men","jeg","meg","min","mine","du","deg","din","de","dem","den","det","en","ei","et","på","i","av","til","fra","og","å"]);
    const weakVerbs = new Set(["gjorde","gjør","gjort","tenkte","tenker","synes","sier","sa","våknet","hentet","leverte","dro","kom","går","gikk"]);
    const whitelist = new Set(["kurbad","hageanlegg","dame","telefon","kongo","relasjon","kjærlighet","skyld","skam","fremmedhet","ensomhet","uro","observasjon","nomade","nomadisme","begjær","forfatter","forfatterliv","reise","frihet","kontroll","rus","kropp","språk","møte","minner","konflikt","lengsel","by","park","sted","leilighet","samtale","vennskap","risiko"]);
    const counts = new Map();
    const scores = new Map();
    tokens.forEach((token) => {
      if (token.length < 4) return;
      if (stop.has(token)) return;
      if (weakVerbs.has(token)) return;
      const freq = (counts.get(token) || 0) + 1;
      counts.set(token, freq);
      let score = freq;
      if (whitelist.has(token)) score += 3;
      if (token.length >= 8) score += 1;
      scores.set(token, score);
    });
    return Array.from(scores.entries()).sort((a,b)=>b[1]-a[1]).slice(0, maxItems).map(([word]) => word);
  }

  function loadAutoOutputs() {
    try {
      const raw = localStorage.getItem(AUTO_OUTPUT_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function buildAutoOutputs(userText, ahaReply) {
    const raw = String(userText || "").trim();
    const reply = String(ahaReply || "").trim();
    const textType = detectTextType(raw);
    const sentences = toSentences(raw);
    const keywords = takeKeywords(raw, 5);
    const baseList = sentences.slice(0,6).map((item) => item.replace(/^[-•]\s*/, ""));
    let reflection = "Jeg ser et tydelig tema. Del gjerne litt mer for skarpere sortering.";
    let sortItems = (keywords.length ? keywords : ["retning","utfordring","handling"]).slice(0, 4).map((key, idx) => ({ label: key.charAt(0).toUpperCase() + key.slice(1), text: sentences[idx] || `Dette peker på et tema rundt ${key}.` }));
    let day = "Ikke nok dagsmateriale ennå.";
    let thoughts = { hovedspor: sentences[0] || "Trenger mer tekst for å finne hovedspor.", lose_tanker: sentences.slice(1,3).join(" ") || "Noen løse tanker vil dukke opp når du skriver mer.", neste_steg: "Velg ett tydelig spor og skriv én presis setning videre." };
    let list = baseList;
    let path = ["Forstå hva teksten egentlig handler om.", "Sorter materialet i 2–3 tydelige spor.", "Velg ett neste grep og skriv videre."];

    if (textType === "literary_diary") {
      reflection = "Dette er en dagboktekst der fortelleren beveger seg mellom observasjon og selvforklaring. Ytre scener brukes til å vise indre uro, lengsel og drift mot frihet.";
      sortItems = ["Åpningsscene / sted","Relasjonen til S","Møter med fremmede","Reise, nomadisme og forfatterliv","Skyld, skam og selvforsvar"].slice(0,4).map((label, idx) => ({ label, text: sentences[idx] || "Dette sporet er til stede i teksten." }));
      day = "Dagbokfragmentet går fra observerende scener til relasjonell uro, videre gjennom møter og samtaler, før det åpner mot reise, frihet og forfatterliv.";
      thoughts = { hovedspor: "Fortelleren prøver å forstå seg selv gjennom observasjoner av andre og en urolig relasjon.", lose_tanker: "Sted, telefoner, fremmede møter og vandring peker mot sosial fremmedhet og frihetslengsel.", neste_steg: "Velg om teksten skal strammes rundt relasjonen, vandringen eller ideen om et nomadisk forfatterliv." };
      list = ["Åpningsscene ved sted/hageanlegg","Observasjon av mennesker i bevegelse","Uro og kontaktbehov hos fortelleren","Telefon og relasjonell spenning","Møter med fremmede","Reise/frihet/forfatterliv som motiv"].slice(0,6);
      path = ["Finn bærende motiv: relasjon, fremmedhet, nomadisme, skyld eller observasjon.", "Velg struktur: kronologisk dagbok, assosiativ vandring eller scene-kapittel.", "Stram teksten: behold konkrete scener og kutt forklaringer som gjentar selvforsvar."];
    } else if (textType === "day_log") {
      reflection = `Dette leses som en dagslogg med fokus på ${keywords[0] || "hendelser"}, og et tydelig behov for å se mønster i dagen.`;
      day = `Kort dagsoppsummering: ${sentences.slice(0,2).join(" ") || "Flere hendelser gjennom dagen."} Viktigst nå: ${keywords[0] || "ett tydelig neste punkt"}.`;
      path = ["Oppsummer hendelsene kort.", "Finn ett mønster eller én følelse som gikk igjen.", "Velg én ting du tar med videre i morgen."];
    } else if (textType === "literary_fragment") {
      reflection = "Teksten drives av scene, motiv, sansning og rytme mer enn av dagboklogg. Konflikten ligger i spenningen mellom stemning og bevegelse.";
      day = "Ikke dagbokmateriale – ingen dagsoppsummering laget.";
    } else if (textType === "project_note") {
      reflection = "Dette er et prosjektnotat med tydelig problem og mål. Neste gevinst ligger i å koble løsning til konkrete filer/funksjoner.";
      sortItems = ["Problem","Løsning","Filer/funksjoner","Neste steg"].map((label, idx) => ({ label, text: sentences[idx] || "Trenger kort presisering i teksten." }));
      path = ["Definer målet i én setning.", "Sorter oppgaver etter problem/løsning/filer.", "Velg neste konkrete handling."];
    } else if (textType === "theory_idea") {
      reflection = "Dette er en idé-/teoritekst der begreper og premisser bygges opp stegvis.";
      sortItems = ["Hovedpåstand","Begreper","Premisser","Mulige innvendinger","Videre utvikling"].slice(0,4).map((label, idx) => ({ label, text: sentences[idx] || "Presiser dette punktet videre." }));
    }

    if (!list.length) list.push("Legg inn litt mer kontekst, så lager jeg en skarp liste.");
    const localInsights = [];
    if (textType === "literary_diary") {
      localInsights.push("Dagbokformen lar møter og observasjoner speile fortellerens indre uro.");
      localInsights.push("Relasjonen fungerer som anker for lengsel, skyld og selvforsvar.");
      localInsights.push("Teksten drives mer av assosiativ bevegelse enn lineær handling.");
    } else {
      localInsights.push(`Mønster: ${keywords[0] || "temaet"} går igjen og bærer teksten.`);
      localInsights.push(reply ? `AHA-responsen peker videre på: ${toSentences(reply)[0] || reply}` : "Videre innsikt kan styrkes med mer konkret tekst.");
    }
    const overlap = currentInsights()
      .map((ins) => String(ins.summary || ins.title || ""))
      .filter((text) => keywords.some((k) => text.toLowerCase().includes(k)))
      .slice(-2);
    const insightCards = [...localInsights, ...overlap].slice(0, 3);

    return { textType, reflection, sortItems, day, thoughts, list: list.slice(0, 6), insightCards, path: path.slice(0, 3) };
  }

  function renderAutoOutputPayload(payload) {
    const host = document.getElementById("aha-auto-output");
    if (!host || !payload) return;
    const safeSortItems = Array.isArray(payload.sortItems) ? payload.sortItems : [];
    const safeList = Array.isArray(payload.list) ? payload.list : [];
    const safeInsightCards = Array.isArray(payload.insightCards) ? payload.insightCards : [];
    const safePath = Array.isArray(payload.path) ? payload.path : [];
    host.innerHTML = `
      <div class="auto-output-head">
        <h2>AHA etterarbeid</h2>
        <p>Automatisk analyse av siste melding og svar.</p>
      </div>
      <section class="auto-output-group" data-group="samtale">
        <h3>Samtale</h3>
        <div class="auto-output-grid">
          <article class="auto-card" data-auto-card="reflekter"><h4>Refleksjon</h4><p>${escHtml(payload.reflection)}</p></article>
          <article class="auto-card" data-auto-card="sorter"><h4>Sortering</h4><ul>${safeSortItems.map((item)=>`<li><strong>${escHtml(item?.label)}:</strong> ${escHtml(item?.text)}</li>`).join("")}</ul></article>
          <article class="auto-card" data-auto-card="oppsummer"><h4>Dagsoppsummering</h4><p>${escHtml(payload.day)}</p></article>
          <article class="auto-card" data-auto-card="sorter_tanker"><h4>Tankesortering</h4><p><strong>Hovedspor:</strong> ${escHtml(payload?.thoughts?.hovedspor)}</p><p><strong>Løse tanker:</strong> ${escHtml(payload?.thoughts?.lose_tanker)}</p><p><strong>Mulig neste steg:</strong> ${escHtml(payload?.thoughts?.neste_steg)}</p></article>
        </div>
      </section>
      <section class="auto-output-group" data-group="struktur">
        <h3>Struktur</h3>
        <div class="auto-output-grid">
          <article class="auto-card" data-auto-card="lag_liste"><h4>Liste</h4><ul>${safeList.map((point)=>`<li>${escHtml(point)}</li>`).join("")}</ul></article>
          <article class="auto-card" data-auto-card="lag_innsikt"><h4>Innsikt</h4><ul>${safeInsightCards.map((point)=>`<li>${escHtml(point)}</li>`).join("")}</ul></article>
          <article class="auto-card" data-auto-card="lag_laringssti"><h4>Læringssti</h4><ol>${safePath.map((step)=>`<li>${escHtml(step)}</li>`).join("")}</ol></article>
        </div>
      </section>`;
  }

  function renderAutoOutputs(userText, ahaReply) {
    const payload = buildAutoOutputs(userText, ahaReply);
    localStorage.setItem(AUTO_OUTPUT_STORAGE_KEY, JSON.stringify(payload));
    renderAutoOutputPayload(payload);
  }

  function focusAutoCard(action) {
    const host = document.getElementById("aha-auto-output");
    if (!host) return;
    host.querySelectorAll(".auto-card").forEach((card) => card.classList.remove("is-focused"));
    const target = host.querySelector(`[data-auto-card="${action}"]`);
    if (!target) return;
    target.classList.add("is-focused");
    target.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function restoreAutoOutputFromStorage() {
    const cache = loadAutoOutputs();
    if (!cache) return;
    renderAutoOutputPayload(cache);
  }

  function bind() {
    const button = document.getElementById("btn-send");
    const textarea = document.getElementById("msg");
    if (button && textarea) {
      button.addEventListener("click", async () => {
        const text = textarea.value.trim();
        if (!text) return;
        appendChat("user", text);
        const count = handleUserMessage(text);
        void handleUserMessageInsightCandidatesInBackground(text)
          .then((aiCount) => {
            if (aiCount > 0) setStatusNote(`Beriket med ${aiCount} AI-signal${aiCount === 1 ? "" : "er"} i bakgrunnen.`);
          })
          .catch((err) => {
            console.warn("AI insight-candidates bakgrunnsjobb feilet", err);
          });
        textarea.value = "";
        if (count > 0) setStatusNote(`Lagret ${count} signal${count === 1 ? "" : "er"} i bakgrunnen.`);
        try {
          const agent = await askAhaAgent(text);
          const reply = String(agent?.reply || "").trim() || "AHA-agenten returnerte tomt svar.";
          const subjectMatches = global.AHASubjectEngine?.matchText
            ? await global.AHASubjectEngine.matchText(`${text} ${reply}`, { source: "chat" })
            : [];
          appendChat("aha", reply, { categoryChips: suggestCategoryChips(), subjectMatches });
          try { renderAutoOutputs(text, reply); } catch (autoErr) { console.warn("Auto-output feilet", autoErr); }
          // AHA-agentens egne svar skal vises i chatten og logges som
          // source event, men IKKE bli en ordinær brukerinnsikt. AI-
          // oppsummeringer hører ikke hjemme i innsiktskammeret. skip_insight
          // får AHAIngest til å stoppe etter source-event-loggen.
          global.AHAIngest?.ingest?.({
            source_type: "aha_agent",
            source_app: "aha_chat",
            content_type: "text",
            title: "AHA-agent svar",
            text: reply,
            user_created: false,
            imported: false,
            skip_insight: true,
            created_at: new Date().toISOString(),
            meta: { response_id: agent?.response_id || null, model: agent?.model || null }
          });
        } catch (err) {
          console.warn("AHA-agent utilgjengelig", err);
          appendChat("aha", "AHA-agenten er ikke tilgjengelig akkurat nå.");
          try { renderAutoOutputs(text, ""); } catch (autoErr) { console.warn("Auto-output feilet", autoErr); }
        }
      });
    }

    document.getElementById("btn-insights")?.addEventListener("click", showInsights);
    document.getElementById("btn-status")?.addEventListener("click", showStatus);
    document.getElementById("btn-concepts")?.addEventListener("click", showConcepts);
    document.getElementById("btn-meta")?.addEventListener("click", showMeta);
    document.getElementById("btn-knowledge-map")?.addEventListener("click", showKnowledgeMap);
    document.getElementById("btn-export")?.addEventListener("click", () => out(JSON.stringify(loadChamberFromStorage(), null, 2)));
    document.getElementById("btn-reset")?.addEventListener("click", reset);
    bindActionChips();

    bindPanelActionHandler();
    restoreAutoOutputFromStorage();

    // Når et nytt merge-forslag persisteres på chamberet, re-rendr
    // panelet hvis det vises. UI-en henter forslagene rett fra
    // localStorage, så den trenger bare et signal om å oppdatere seg.
    global.addEventListener("aha:merge-suggested", () => {
      const panel = document.getElementById("panel");
      if (panel && panel.querySelector(".insight-panel")) showInsights();
    });

    updateEmptyState();
    renderHighlightsRail();
    const log = document.getElementById("chat-log");
    if (log) {
      log.addEventListener("scroll", renderHighlightsRail);
      window.addEventListener("resize", renderHighlightsRail);
    }
  }

  function suggestCategoryChips() {
    const insights = currentInsights().slice(0, 6);
    const labels = [];
    insights.forEach((ins) => {
      (ins.emner || []).forEach((emne) => labels.push(emne));
      (ins.concepts || []).forEach((concept) => labels.push(concept?.label || concept?.key));
      (ins.patterns || []).forEach((pattern) => labels.push(pattern?.label || pattern?.key));
    });
    return [...new Set(labels.filter(Boolean))].slice(0, 8);
  }

  function bindActionChips() {
    document.querySelectorAll("[data-chat-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.getAttribute("data-chat-action");
        if (action === "import_hg") {
          document.getElementById("btn-import-hg")?.click();
          return;
        }
        if (action === "koble_hg") {
          setStatusNote("Koblinger vises gjennom innsikter og fagkoblinger i chatten.");
          return;
        }
        if (action === "lag_innsikt") showInsights();
        focusAutoCard(action);
        setStatusNote("Viser valgt analysekort.");
      });
    });
  }

  global.loadChamberFromStorage = global.loadChamberFromStorage || loadChamberFromStorage;
  global.saveChamberToStorage = global.saveChamberToStorage || saveChamberToStorage;
  global.AHAChat = {
    loadChamberFromStorage,
    saveChamberToStorage,
    handleUserMessage,
    askAhaAgent,
    buildAIState
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})(window);
