// ahaChat.js
// Ren kobling mellom AHA Chat UI og eksisterende InsightsEngine.

(function (global) {
  "use strict";

  const SUBJECT_ID = "sub_laring";
  const STORAGE_KEY = "aha_insight_chamber_v1";
  const HIGHLIGHTS_STORAGE_KEY = "aha_chat_highlights_v1";
  const CHAT_THREAD_ID = "default_thread";

  const AUTO_OUTPUT_STORAGE_KEY = "aha_chat_auto_outputs_v1";
  const AFTERWORK_STORAGE_KEY = "aha_afterwork_v1";
  const PENDING_CHAT_PROMPT_KEY = "aha_pending_chat_prompt_v1";

  const AHA_INSIGHT_CONTRACT = Object.freeze({
    FUNCTIONAL_TYPES: new Set([
      "observation", "question", "task", "problem", "solution",
      "decision", "definition", "contradiction", "learning_point", "pattern", "memory", "principle"
    ])
  });
  const WEAK_CONCEPT_WORDS = new Set(["illustrasjon","logo","annonsørinnhold","annonsorinnhold","annonse","sponset","les","også","ogsa","les også","les ogsa","årets","arets","populære","populaere","kjole","kjoler","bryllupsgjesten","sesongens","favoritter","finnes","egen","form","lærer","mennesker","blir","ikke","bare","over","ligger","lavt","noen","helt","ennå","norske","norsk","moderne","viktig","viktigste","store","små","nye","gamle","tydelig","særlig","mildt","sagt","refleksjon","innsikt","samtale","analyse","nødvendighet","nodvendighet"]);
  const GENERIC_DISPLAY_CONCEPTS = new Set(["kunnskap","forståelse","budskap","bekreftelse","sier","viser","dette","grunnlag","tillegg","verden","noen","videre","eksempel"]);
  const ACADEMIC_PHRASE_CONCEPTS = [
    "politisk økologi","empirisk forskning","internasjonal forskning","dominerende narrativ","politisk narrativ","knapphetsskolen","miljøsikkerhet","environmental security","scarcity school","statens politikk","marginalisering av pastoralister","marginalisering","pastoralister","politisk-historisk forklaring","politisk og historisk","klimadrevet konflikt","klimaendringer og konflikter","malthusiansk forklaring","ressursknapphet","miljødegradering","miljøforringelse","nedbørsdata","klimadata","casestudier fra Mali","Sahel","Mali","Sahel-greening","ørkenspredning","tørke","global klimaendring","lokale forhold","forskningsgrunnlag","policy-momentum"
  ];
  
  const ACADEMIC_THEORY_RULES = [
    {
      key: "thomas_homer_dixon",
      triggers: [/\bthomas\s+homer-?dixon\b/i, /\bhomer-?dixon\b/i],
      link: {
        thinker: "Thomas Homer-Dixon",
        theory: "Knapphetsskolen / miljøsikkerhet",
        connection: "Brukes i teksten som representant for teorien om ressursknapphet, miljødegradering og konflikt.",
        score: 0.75
      }
    },
    {
      key: "knapphetsskolen",
      triggers: [/\bknapphetsskolen\b/i, /\bscarcity\s+school\b/i, /\bressursknapphet\b/i, /\bmalthusiansk\b/i],
      link: {
        thinker: "Knapphetsskolen",
        theory: "Ressursknapphet og konflikt",
        connection: "Teksten diskuterer knapphetsskolens forklaring om at ressursknapphet kan føre til voldelig konflikt.",
        score: 0.70
      }
    },
    {
      key: "miljosikkerhet",
      triggers: [/\bmiljøsikkerhet\b/i, /\benvironmental\s+security\b/i, /\bthe\s+environmental\s+security\s+school\b/i],
      link: {
        thinker: "Miljøsikkerhet",
        theory: "Miljøsikkerhet",
        connection: "Teksten behandler miljøsikkerhet som en teori om koblingen mellom miljødegradering, ressursknapphet og konflikt.",
        score: 0.70
      }
    },
    {
      key: "politisk_okologi",
      triggers: [/\bpolitisk\s+økologi\b/i, /\bpolitical\s+ecology\b/i, /\bmaktperspektiv\b/i, /\bmakt-?\s*og\s*produksjonsforhold\b/i, /\bmaktforhold\b/i, /\bproduksjonsforhold\b/i],
      link: {
        thinker: "Politisk økologi",
        theory: "Politisk økologi",
        connection: "Teksten bruker politisk økologi som kritikk av enkle knapphetsforklaringer og vektlegger makt, kontekst og produksjonsforhold.",
        score: 0.82
      }
    },
    {
      key: "peluso_watts",
      triggers: [/\bpeluso\b/i, /\bwatts\b/i, /\bpeluso\s*&\s*watts\b/i],
      link: {
        thinker: "Peluso & Watts",
        theory: "Politisk økologi / makt og vold",
        connection: "Kobles til kritikken av enkel årsakskjede fra ressursknapphet til vold.",
        score: 0.76
      }
    },
    {
      key: "ester_boserup",
      triggers: [/\bester\s+boserup\b/i, /\bboserup\b/i, /\bbærekraftig\s+intensivering\b/i],
      link: {
        thinker: "Ester Boserup",
        theory: "Boserupsk intensivering",
        connection: "Teksten viser til Boserups teori om at befolkningsvekst kan bidra til intensivering og forbedret ressursgrunnlag.",
        score: 0.72
      }
    },
    {
      key: "edward_said",
      triggers: [/\bedward\s+said\b/i, /\bsaid\b/i, /\borientalisme?n?\b/i],
      link: {
        thinker: "Edward Said",
        theory: "Orientalisme",
        connection: "Teksten bruker orientalisme som kritikk av vestlige forestillinger om fattige land og afrikanske småbønder/husdyrgjetere.",
        score: 0.75
      }
    },
    {
      key: "prio_gleditsch",
      triggers: [/\bgleditsch\b/i, /\bprio\b/i, /\bfredsforskningsinstituttet\b/i, /\bnordås\s*&\s*gleditsch\b/i, /\bbinningsbø\b/i, /\bde\s+soysa\b/i, /\btheisen\b/i, /\braleigh\s*&\s*urdal\b/i],
      link: {
        thinker: "PRIO / Gleditsch",
        theory: "Kvantitativ kritikk av klima-konflikt-koblingen",
        connection: "Teksten viser til kvantitative studier som kritiserer den påståtte sammenhengen mellom klimaendringer, ressursknapphet og voldelige konflikter.",
        score: 0.70
      }
    },
    {
      key: "robert_kaplan",
      triggers: [/\brobert\s+kaplan\b/i, /\bkaplan\b/i],
      link: {
        thinker: "Robert Kaplan",
        theory: "Populærmalthusiansk konfliktfortelling",
        connection: "Teksten bruker Kaplan som eksempel på en innflytelsesrik journalistisk formidling av knapphet, overbefolkning og miljøkrise som konfliktforklaring.",
        score: 0.62
      }
    },
    {
      key: "bachler_swiss_peace",
      triggers: [/\bbächler\b/i, /\bbachler\b/i, /\bswiss\s+peace\b/i, /\bbächler\s*&\s*spillmann\b/i],
      link: {
        thinker: "Bächler / Swiss Peace",
        theory: "Miljødegradering som konfliktforklaring",
        connection: "Teksten viser til Bächler og Swiss Peace som eksempler på forskning som kobler afrikanske tørrlandsområder, miljødegradering og vold.",
        score: 0.62
      }
    },
    {
      key: "barnett_salehyan",
      triggers: [/\bbarnett\b/i, /\bsalehyan\b/i],
      link: {
        thinker: "Barnett / Salehyan",
        theory: "Kritikk av klima-konflikt-koblingen",
        connection: "Teksten viser til forskning som kritiserer ideen om at klimaendringer direkte fører til voldelige konflikter.",
        score: 0.60
      }
    }
  ];

  const INSIGHT_NOISE_PATTERN = /\b(les også|les ogsa|annonsørinnhold|annonsorinnhold|logo|illustrasjon|annonse|sponset|kjolefavoritter|bryllupsgjesten)\b/ig;
  const LEADING_PUNCTUATION_PATTERN = /^[\s"'“”«».,:;|\-–—]+/;
  const LES_OGSA_TEASER_PATTERN = /(«|»|"|')?\s*les\s+også\s*:?\s*[^.!?\n]*(?:[.!?]|$)/ig;
  const TEASER_TITLE_PATTERN = /^(når\s+vekst\s+blir\s+en\s+trussel)\b/i;
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

  function stripTrailingPunctuation(text) {
    return String(text || "")
      .trim()
      .replace(/[.!?;,:\s…]+$/u, "")
      .trim();
  }

  function lowerFirst(text) {
    const value = String(text || "").trim();
    if (!value) return "";
    return value.charAt(0).toLowerCase() + value.slice(1);
  }

  function sentence(text) {
    const cleaned = stripTrailingPunctuation(text);
    if (!cleaned) return "";
    return `${cleaned}.`;
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
    const phraseConcepts = extractAcademicPhraseConcepts(text);
    const phraseKeys = new Set(phraseConcepts.map((item) => normalizeAfterworkConcept(item)));
    const prioritized = [...phraseConcepts];
    out.forEach((label) => {
      const key = normalizeAfterworkConcept(label);
      if (!phraseKeys.has(key)) prioritized.push(label);
    });
    return prioritized;
  }

  function isGenericDisplayConcept(value) {
    return GENERIC_DISPLAY_CONCEPTS.has(normalizeAfterworkConcept(value));
  }

  function extractAcademicPhraseConcepts(text) {
    const source = String(text || "");
    if (!source.trim()) return [];
    const out = [];
    const seen = new Set();
    ACADEMIC_PHRASE_CONCEPTS.forEach((phrase) => {
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
      const re = new RegExp(`(^|[^\\p{L}\\p{N}])(${escaped})(?=$|[^\\p{L}\\p{N}])`, "iu");
      if (!re.test(source)) return;
      const key = normalizeAfterworkConcept(phrase);
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(phrase);
    });
    return out.slice(0, 12);
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


  function extractAcademicTheoryLinks(text) {
    const source = String(text || "");
    if (!source.trim()) return [];
    const out = [];
    ACADEMIC_THEORY_RULES.forEach((rule) => {
      if (rule?.key === "peluso_watts") return;
      if (!Array.isArray(rule?.triggers) || !rule.triggers.some((re) => re.test(source))) return;
      out.push({
        thinker: rule.link.thinker,
        theory: rule.link.theory,
        score: Number(rule.link.score || 0),
        connection: rule.link.connection
      });
    });
    const paragraphs = source.split(/\n{2,}|\r\n{2,}/).map((part) => part.trim()).filter(Boolean);
    const hasPelusoAndWattsInParagraph = paragraphs.some((part) => /\bpeluso\b/i.test(part) && /\bwatts\b/i.test(part));
    const sentences = source.split(/(?<=[.!?])\s+/).map((part) => part.trim()).filter(Boolean);
    const hasPelusoAndWattsInSentence = sentences.some((part) => /\bpeluso\b/i.test(part) && /\bwatts\b/i.test(part));
    const pelusoMatches = Array.from(source.matchAll(/\bpeluso\b/gi));
    const wattsMatches = Array.from(source.matchAll(/\bwatts\b/gi));
    const hasPelusoWattsNearby = pelusoMatches.some((pelusoMatch) => wattsMatches.some((wattsMatch) => Math.abs((pelusoMatch.index || 0) - (wattsMatch.index || 0)) <= 300));
    if (hasPelusoAndWattsInParagraph || hasPelusoAndWattsInSentence || hasPelusoWattsNearby) {
      out.push({
        thinker: "Peluso & Watts",
        theory: "Politisk økologi / makt og vold",
        score: 0.76,
        connection: "Kobles til kritikken av enkel årsakskjede fra ressursknapphet via økonomisk nedgang og migrasjon til vold."
      });
    }
    return out;
  }

  function mergeTheoryLinks(existingLinks, extractedLinks, maxItems) {
    const bestByKey = new Map();
    const add = (item) => {
      if (!item || typeof item !== "object") return;
      const thinker = String(item.thinker || item.name || "").trim();
      const theory = String(item.theory || "").trim();
      const connection = String(item.connection || item.relation || "").trim();
      const score = Number(item.score || item.relevance_score || 0);
      if (!thinker && !theory) return;
      const key = `${thinker.toLowerCase()}|${theory.toLowerCase()}`;
      const prev = bestByKey.get(key);
      if (!prev || score > prev.score) bestByKey.set(key, { thinker, theory, connection, score });
    };
    (Array.isArray(existingLinks) ? existingLinks : []).forEach(add);
    (Array.isArray(extractedLinks) ? extractedLinks : []).forEach(add);
    return Array.from(bestByKey.values())
      .sort((a, b) => (b.score - a.score) || a.thinker.localeCompare(b.thinker))
      .slice(0, Math.max(1, Number(maxItems || 5)));
  }

  function collectTheoryNodeLabels(chamber) {
    const labels = new Map();
    const add = (value) => {
      const label = String(value || "").trim();
      if (!label) return;
      const key = label.toLowerCase();
      if (!labels.has(key)) labels.set(key, label);
    };
    (Array.isArray(chamber?.insights) ? chamber.insights : []).forEach((insight) => {
      (Array.isArray(insight?.thinkers) ? insight.thinkers : []).forEach(add);
      (Array.isArray(insight?.theories) ? insight.theories : []).forEach(add);
      (Array.isArray(insight?.theoretical_links) ? insight.theoretical_links : []).forEach((link) => {
        add(link?.thinker);
        add(link?.theory);
        add(link?.name);
      });
      (Array.isArray(insight?.theoryLinks) ? insight.theoryLinks : []).forEach((link) => {
        add(link?.thinker);
        add(link?.theory);
        add(link?.name);
      });
      const insightText = [insight?.title, insight?.summary, insight?.text, insight?.source_text].filter(Boolean).join(" ");
      extractAcademicTheoryLinks(insightText).forEach((link) => {
        add(link?.thinker);
        add(link?.theory);
      });
    });
    return Array.from(labels.values());
  }

  function buildConceptEdgeContext(chamber, theoryLinks) {
    const safeChamber = chamber && typeof chamber === "object" ? chamber : {};
    const insights = Array.isArray(safeChamber?.insights) ? safeChamber.insights : [];
    const autoOutputs = Array.isArray(safeChamber?.auto_outputs) ? safeChamber.auto_outputs : [];
    const textParts = [];
    const concepts = [];
    const keywords = [];
    const phraseConcepts = [];
    const subjectLinks = [];
    const addText = (value) => {
      const text = String(value || "").trim();
      if (text) textParts.push(text);
    };
    insights.forEach((insight) => {
      addText(insight?.title);
      addText(insight?.summary);
      addText(insight?.text);
      addText(insight?.source_text);
      (Array.isArray(insight?.concepts) ? insight.concepts : []).forEach((item) => concepts.push(item));
      (Array.isArray(insight?.keywords) ? insight.keywords : []).forEach((item) => keywords.push(item));
      (Array.isArray(insight?.phraseConcepts) ? insight.phraseConcepts : []).forEach((item) => phraseConcepts.push(item));
      (Array.isArray(insight?.subjectLinks) ? insight.subjectLinks : []).forEach((item) => subjectLinks.push(item));
    });
    autoOutputs.forEach((entry) => addText(entry?.content || entry?.text || entry?.summary));
    const activeSource = resolveActiveAnalysisContext();
    addText(activeSource?.sourceText);
    (Array.isArray(activeSource?.concepts) ? activeSource.concepts : []).forEach((item) => concepts.push(item));
    (Array.isArray(activeSource?.keywords) ? activeSource.keywords : []).forEach((item) => keywords.push(item));
    (Array.isArray(activeSource?.phraseConcepts) ? activeSource.phraseConcepts : []).forEach((item) => phraseConcepts.push(item));
    (Array.isArray(activeSource?.subjectLinks) ? activeSource.subjectLinks : []).forEach((item) => subjectLinks.push(item));
    return { text: textParts.join("\n"), concepts, keywords, phraseConcepts, subjectLinks, theoryLinks };
  }

  function resolveActiveAnalysisContext() {
    const context = { sourceText: "", concepts: [], keywords: [], phraseConcepts: [], subjectLinks: [] };
    const addUnique = (target, items) => {
      (Array.isArray(items) ? items : []).forEach((item) => {
        const value = typeof item === "string" ? item : (item?.label || item?.name || item?.title || item?.key || item?.term || item?.value || item);
        if (value == null) return;
        if (target.some((existing) => JSON.stringify(existing) === JSON.stringify(item))) return;
        target.push(item);
      });
    };
    const usePayload = (payload) => {
      if (!payload || typeof payload !== "object") return;
      addUnique(context.concepts, payload?.concepts);
      addUnique(context.keywords, payload?.keywords);
      addUnique(context.phraseConcepts, payload?.phraseConcepts);
      addUnique(context.subjectLinks, payload?.subjectLinks || payload?.subject_matches || payload?.subjectMatches);
    };

    try {
      const cache = loadAutoOutputs();
      if (cache && typeof cache === "object") {
        const activeText = String(cache?.sourceText || cache?.payload?.sourceText || "").trim();
        if (activeText) context.sourceText = activeText;
        usePayload(cache?.payload);
      }
    } catch (err) {
      console.warn("Kunne ikke lese aktiv auto-output fra cache", err);
    }

    try {
      const host = typeof document !== "undefined" ? document.getElementById("aha-auto-output") : null;
      const domText = String(host?.dataset?.sourceText || "").trim();
      if (domText) context.sourceText = domText;
    } catch (err) {
      console.warn("Kunne ikke lese aktiv auto-output fra DOM", err);
    }

    try {
      if (!context.sourceText) {
        const entries = loadAfterworkEntries();
        const latest = Array.isArray(entries) ? entries[entries.length - 1] : null;
        const previewText = String(latest?.sourceTextPreview || "").trim();
        if (previewText) context.sourceText = previewText;
        usePayload(latest);
      }
    } catch (err) {
      console.warn("Kunne ikke lese afterwork fallback", err);
    }

    if (!Array.isArray(context.phraseConcepts) || !context.phraseConcepts.length) {
      context.phraseConcepts = extractAcademicPhraseConcepts(context.sourceText || "");
    }
    return context;
  }

  function prioritizeVisibleConceptEdges(edges, theoryLinks, context) {
    const list = (Array.isArray(edges) ? edges : []).map((edge) => ({ ...edge }));
    const ctx = context && typeof context === "object" ? context : {};
    const sourceText = String(ctx?.text || "");
    const normalizedText = normalizeConceptKey(sourceText);
    const theoryTokens = new Set((Array.isArray(theoryLinks) ? theoryLinks : []).flatMap((link) => [link?.name, link?.relation, link?.thinker, link?.theory]).map((v) => normalizeConceptKey(v)).filter(Boolean));
    const edgePhrasePairs = [
      { from: "ressursknapphet", to: "knapphetsskolen", left: ["ressursknapphet"], right: ["knapphetsskolen", "scarcity school"] },
      { from: "politisk økologi", to: "ressursknapphet", left: ["politisk økologi", "political ecology"], right: ["ressursknapphet"] },
      { from: "politisk økologi", to: "makt- og produksjonsforhold", left: ["politisk økologi", "political ecology"], right: ["makt- og produksjonsforhold", "maktforhold", "produksjonsforhold", "maktperspektiv"] },
      { from: "dominerende narrativ", to: "empirisk forskning", left: ["dominerende narrativ", "narrativ"], right: ["empirisk forskning", "empiri", "klimadata", "nedbørsdata"] },
      { from: "klimaforklaring", to: "politisk-historisk forklaring", left: ["klimaendringer", "klimaforklaring", "klimadrevet"], right: ["politisk og historisk", "politisk-historisk", "statens politikk", "marginalisering"] },
      { from: "marginalisering", to: "pastoralister", left: ["marginalisering"], right: ["pastoralister"] },
      { from: "marginalisering av pastoralister", to: "statens politikk", left: ["marginalisering av pastoralister", "marginalisering"], right: ["statens politikk"], requires: ["pastoralister"] },
      { from: "miljøsikkerhet", to: "politisk økologi", left: ["miljøsikkerhet", "environmental security"], right: ["politisk økologi", "political ecology"] },
      { from: "malthusiansk forklaring", to: "empirisk casestudie", left: ["malthusiansk", "knapphetsskolen", "ressursknapphet"], right: ["casestudier", "mali", "empirisk forskning"] }
    ];
    const conceptPool = new Set();
    const addConcept = (value) => {
      if (value == null) return;
      const term = typeof value === "string" ? value : (value?.label || value?.name || value?.title || value?.key || value?.term || value?.value || "");
      const normalized = normalizeConceptKey(term);
      if (normalized) conceptPool.add(normalized);
    };
    list.forEach((edge) => {
      conceptPool.add(normalizeConceptKey(edge?.from));
      conceptPool.add(normalizeConceptKey(edge?.to));
    });
    theoryTokens.forEach((token) => conceptPool.add(token));
    (Array.isArray(ctx?.concepts) ? ctx.concepts : []).forEach(addConcept);
    (Array.isArray(ctx?.keywords) ? ctx.keywords : []).forEach(addConcept);
    (Array.isArray(ctx?.phraseConcepts) ? ctx.phraseConcepts : []).forEach(addConcept);
    (Array.isArray(ctx?.subjectLinks) ? ctx.subjectLinks : []).forEach(addConcept);
    (Array.isArray(theoryLinks) ? theoryLinks : []).forEach((link) => {
      addConcept(link?.name); addConcept(link?.relation); addConcept(link?.thinker); addConcept(link?.theory);
      extractAcademicPhraseConcepts(link?.connection || "").forEach((phrase) => conceptPool.add(normalizeConceptKey(phrase)));
    });
    extractAcademicPhraseConcepts(sourceText).forEach((phrase) => conceptPool.add(normalizeConceptKey(phrase)));
    const derivedEdges = [];
    const hasAny = (variants) => variants.some((variant) => conceptPool.has(normalizeConceptKey(variant)) || normalizedText.includes(normalizeConceptKey(variant)));
    edgePhrasePairs.forEach((rule) => {
      if (!hasAny(rule.left) || !hasAny(rule.right)) return;
      if (Array.isArray(rule.requires) && !hasAny(rule.requires)) return;
      const from = rule.from;
      const to = rule.to;
      const key = [from, to].sort((a, b) => a.localeCompare(b)).join("::");
      const exists = list.some((edge) => [normalizeConceptKey(edge?.from), normalizeConceptKey(edge?.to)].sort((a, b) => a.localeCompare(b)).join("::") === key);
      if (!exists) derivedEdges.push({ from, to, weight: 1.25, type: "co_occurs", derived_visible: true });
    });
    derivedEdges.slice(0, 5).forEach((edge) => list.push(edge));

    const conceptKeys = new Set(list.flatMap((edge) => [normalizeConceptKey(edge?.from), normalizeConceptKey(edge?.to)]));
    const weakSingles = new Set();
    if (conceptKeys.has("politisk økologi")) weakSingles.add("økologi");
    if (conceptKeys.has("ressursknapphet") || conceptKeys.has("knapphetsskolen")) weakSingles.add("knapphet");
    if (conceptKeys.has("politisk-historisk forklaring") || conceptKeys.has("politisk og historisk")) { weakSingles.add("politisk"); weakSingles.add("historisk"); }
    if (conceptKeys.has("malthusiansk forklaring")) weakSingles.add("malthusiansk");
    if (conceptKeys.has("marginalisering av pastoralister")) {
      weakSingles.add("marginalisering");
      weakSingles.add("pastoralister");
    }
    return list
      .map((edge) => {
        const from = normalizeConceptKey(edge?.from);
        const to = normalizeConceptKey(edge?.to);
        const fromWords = from.split(/\s+/).length;
        const toWords = to.split(/\s+/).length;
        const phraseBoost = (fromWords > 1 ? 0.2 : 0) + (toWords > 1 ? 0.2 : 0) + (edge?.derived_visible ? 0.35 : 0);
        const weakPenalty = (weakSingles.has(from) || weakSingles.has(to)) ? 0.35 : 0;
        return { ...edge, _displayScore: Number(edge?.weight || 0) + phraseBoost - weakPenalty };
      })
      .sort((a, b) => (b._displayScore - a._displayScore) || ((b?.weight || 0) - (a?.weight || 0)));
  }

  function applyPhraseConceptDisplayPreference(items, keyGetter) {
    const list = Array.isArray(items) ? items.slice() : [];
    const keys = new Set(list.map((item) => normalizeAfterworkConcept(keyGetter(item))));
    const shouldHide = new Set();
    if (keys.has("politisk økologi")) shouldHide.add("økologi");
    if (keys.has("ressursknapphet") || keys.has("knapphetsskolen")) shouldHide.add("knapphet");
    if (keys.has("politisk-historisk forklaring") || keys.has("politisk og historisk")) {
      shouldHide.add("politisk");
      shouldHide.add("historisk");
    }
    if (keys.has("malthusiansk forklaring")) shouldHide.add("malthusiansk");
    return list.filter((item) => !shouldHide.has(normalizeAfterworkConcept(keyGetter(item))));
  }

  function filterConceptLabels(concepts) {
    const seen = new Set();
    return (Array.isArray(concepts) ? concepts : [])
      .map((c) => typeof c === "string" ? c : (c?.label || c?.key || c?.term || ""))
      .map((c) => String(c || "").trim())
      .filter((c) => c && !WEAK_CONCEPT_WORDS.has(c.toLowerCase()))
      .filter((c) => !isGenericDisplayConcept(c))
      .filter((c, _, arr) => {
        const keys = new Set(arr.map((term) => normalizeAfterworkConcept(term)));
        const normalized = normalizeAfterworkConcept(c);
        if (keys.has("politisk økologi") && normalized === "økologi") return false;
        if ((keys.has("ressursknapphet") || keys.has("knapphetsskolen")) && normalized === "knapphet") return false;
        if ((keys.has("politisk-historisk forklaring") || keys.has("politisk og historisk")) && (normalized === "politisk" || normalized === "historisk")) return false;
        if (keys.has("malthusiansk forklaring") && normalized === "malthusiansk") return false;
        return true;
      })
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

  function normalizeDisplayText(value) {
    return String(value || "")
      .replace(/underviser(\s+)viktigheten/gi, (_match, gap) => `understreker${gap}viktigheten`);
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
    const cleanTitleRaw = sanitizeInsightText(ins.candidate_title || ins.title || "Innsikt");
    const cleanSummaryRaw = sanitizeInsightText(ins.candidate_summary || ins.summary || "");
    if (isFragmentaryInsightCard(ins, cleanTitleRaw, cleanSummaryRaw) || shouldHideInsightCard(cleanTitleRaw, cleanSummaryRaw)) return "";
    const title = escHtml(normalizeDisplayText(cleanTitleRaw || "Innsikt"));
    const summary = escHtml(normalizeDisplayText(cleanSummaryRaw || ""));

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


  function endsMidWord(text) {
    const raw = String(text || "").trim().toLowerCase();
    if (!raw) return false;
    return /(erfari|ressursknapphe|miljødegrader|politisk økolo|marginali|forklari)$/.test(raw);
  }

  function normalizedInsightComparableText(text) {
    return String(text || "").toLowerCase().replace(/[….,;:!?]/g, " ").replace(/\s+/g, " ").trim();
  }

  function isFragmentaryInsightCard(ins, titleValue, summaryValue) {
    const title = String(titleValue || ins?.candidate_title || ins?.title || "").trim();
    const summary = String(summaryValue || ins?.candidate_summary || ins?.summary || "").trim();
    const protectedTitles = new Set(["hovedinnsikt", "hovedargument", "motargument/kritikk", "spenning i teksten"]);
    if (protectedTitles.has(normalizeConceptKey(title))) return false;
    if (!title && !summary) return true;
    const tNorm = normalizedInsightComparableText(title);
    const sNorm = normalizedInsightComparableText(summary);
    const overlap = tNorm && sNorm && (tNorm === sNorm || tNorm.includes(sNorm) || sNorm.includes(tNorm));
    const fragmentSignals = /(erfari|marginali|forklari|ressursknapphe|miljødegrader|politisk økolo)$/i;
    const weakTitle = title.split(/\s+/).length <= 3 && !/[.!?…:]/.test(title);
    const repeatedEllipsis = /…/.test(summary) && overlap;
    const missingClaim = !/[.!?…]/.test(summary) && summary.split(/\s+/).length < 8;
    const titleHasTruncatedSignal = title.split(/\s+/).length > 3 && endsMidWord(title);
    return titleHasTruncatedSignal || endsMidWord(summary) || fragmentSignals.test(title) || fragmentSignals.test(summary) || (overlap && weakTitle) || repeatedEllipsis || (weakTitle && missingClaim);
  }

  function hasAcademicSignals(payload, sourceText) {
    const sortItems = Array.isArray(payload?.sortItems) ? payload.sortItems : [];
    const labels = sortItems.map((item) => normalizeConceptKey(item?.label || ""));
    const reflection = normalizeConceptKey(payload?.reflection || "");
    const signalText = `${String(sourceText || "")} ${String(payload?.reflection || "")} ${sortItems.map((item) => `${item?.label || ""} ${item?.text || ""}`).join(" ")}`.toLowerCase();
    const hasSortLabelSignal = labels.some((label) => ["hovedargument", "motargument", "spenning i teksten", "teorikoblinger"].some((needle) => label.includes(needle)));
    const hasTopicSignal = /(sahel|mali|ressursknapphet|politisk økologi|knapphetsskolen)/i.test(signalText) || /(sahel|mali|ressursknapphet|politisk økologi|knapphetsskolen)/i.test(reflection);
    return hasSortLabelSignal || hasTopicSignal;
  }

  function readLatestAcademicContext() {
    const empty = { textType: "", sourceText: "", phraseConcepts: [], payload: null };
    try {
      const cache = loadAutoOutputs();
      const payload = cache?.payload && typeof cache.payload === "object" ? cache.payload : null;
      const sourceText = String(cache?.sourceText || payload?.sourceText || "").trim();
      const payloadTextType = String(payload?.textType || "").trim();
      const detectedTextType = sourceText ? detectTextType(sourceText) : "";
      const inferredAcademic = payloadTextType === "academic_article" || detectedTextType === "academic_article" || hasAcademicSignals(payload, sourceText);
      if (sourceText && inferredAcademic) {
        return { textType: "academic_article", sourceText, phraseConcepts: extractAcademicPhraseConcepts(sourceText).slice(0, 8), payload };
      }
    } catch (err) {
      console.warn("Kunne ikke lese auto-output for akademisk kontekst", err);
    }

    try {
      const latestAcademic = loadAfterworkEntries()
        .slice()
        .reverse()
        .find((entry) => String(entry?.textType || "").trim() === "academic_article");
      const sourceText = String(latestAcademic?.sourceText || latestAcademic?.sourceTextPreview || "").trim();
      if (sourceText) {
        return { textType: "academic_article", sourceText, phraseConcepts: extractAcademicPhraseConcepts(sourceText).slice(0, 8), payload: null };
      }
    } catch (err) {
      console.warn("Kunne ikke lese lagret etterarbeid for akademisk kontekst", err);
    }
    return empty;
  }

  function buildAcademicSyntheticInsightCards() {
    const context = readLatestAcademicContext();
    const text = String(context?.sourceText || "").trim();
    const payload = context?.payload && typeof context.payload === "object" ? context.payload : null;
    const payloadSortItems = Array.isArray(payload?.sortItems) ? payload.sortItems : [];
    const payloadInsightCards = Array.isArray(payload?.insightCards) ? payload.insightCards : [];
    const payloadReflection = String(payload?.reflection || "").trim();
    const sourceSortItems = payloadSortItems.length ? payloadSortItems : [];

    let fallbackSynthesis = null;
    if (!sourceSortItems.length && !payloadReflection && !payloadInsightCards.length && text) {
      try {
        fallbackSynthesis = buildAutoOutputs(text, "");
      } catch (err) {
        console.warn("Kunne ikke bygge syntetiske akademiske innsikter", err);
      }
    }

    const sortItems = sourceSortItems.length ? sourceSortItems : (Array.isArray(fallbackSynthesis?.sortItems) ? fallbackSynthesis.sortItems : []);
    const normalizedCards = payloadInsightCards
      .map((card) => ({ ...card, title: String(card?.title || card?.candidate_title || "").trim(), summary: String(card?.summary || card?.candidate_summary || card?.text || "").trim() }))
      .filter((card) => card.title && card.summary && !isFragmentaryInsightCard(card));
    const byTitle = (needle) => normalizedCards.find((card) => normalizeConceptKey(card.title).includes(needle));
    const pickSort = (matcher) => {
      const hit = sortItems.find((item) => matcher(normalizeConceptKey(item?.label || "")));
      return String(hit?.text || "").trim();
    };
    const pick = (kind, fallback) => {
      const fromCards = byTitle(kind);
      if (fromCards?.summary) return fromCards.summary;
      if (kind === "hovedinnsikt") return pickSort((label) => label.includes("kort hovedinnsikt")) || payloadReflection || fallbackSynthesis?.reflection || fallback;
      if (kind === "hovedargument") return pickSort((label) => label.includes("hovedargument")) || fallback;
      if (kind === "motargument") return pickSort((label) => label.includes("motargument")) || fallback;
      if (kind === "spenning") return pickSort((label) => label.includes("spenning")) || fallback;
      return fallback;
    };

    return [
      { title: "Hovedinnsikt", summary: pick("hovedinnsikt", "Teksten argumenterer for en sammensatt forklaring av konflikt."), concepts: context.phraseConcepts || [], candidate_type: "synthetic" },
      { title: "Hovedargument", summary: pick("hovedargument", "Konfliktutvikling forklares best gjennom politikk, historie og maktforhold."), concepts: context.phraseConcepts || [], candidate_type: "synthetic" },
      { title: "Motargument/kritikk", summary: pick("motargument", "Lineære knapphetsforklaringer kritiseres for svak empirisk forklaringskraft."), concepts: context.phraseConcepts || [], candidate_type: "synthetic" },
      { title: "Spenning i teksten", summary: pick("spenning", "Spenningen står mellom miljø-knapphetsforklaring og politisk-økologisk analyse."), concepts: context.phraseConcepts || [], candidate_type: "synthetic" }
    ].filter((card) => String(card?.summary || "").trim()).filter((card) => !isFragmentaryInsightCard(card));
  }

  function getDisplayInsights() {
    try {
      const insights = currentInsights();
      const filtered = insights.filter((ins) => !isFragmentaryInsightCard(ins));
      const context = readLatestAcademicContext();
      if (context?.textType !== "academic_article") return filtered;
      const strong = filtered.filter((ins) => /hoved|argument|kritikk|spenning|teori|synt/i.test(`${ins?.title || ""} ${ins?.summary || ""}`));
      if (strong.length >= 2) return strong.slice(0, 4);
      if (!filtered.length || hasAcademicSignals(context?.payload, context?.sourceText)) {
        const synthetic = buildAcademicSyntheticInsightCards();
        if (synthetic.length) return synthetic;
      }
      return filtered;
    } catch (err) {
      console.warn("Kunne ikke bygge innsiktsvisning", err);
      try {
        return currentInsights().filter((ins) => !isFragmentaryInsightCard(ins));
      } catch (nestedErr) {
        console.warn("Kunne ikke bygge fallback for innsikter", nestedErr);
        return [];
      }
    }
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
    if (action === "delete-afterwork") {
      return {
        action,
        afterworkId: button.getAttribute("data-afterwork-id") || ""
      };
    }
    if (action === "build-from-afterwork") {
      return {
        action,
        afterworkId: button.getAttribute("data-afterwork-id") || ""
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
      } else if (resolved.action === "delete-afterwork") {
        deleteAfterworkEntry(resolved.afterworkId);
        ok = true;
      } else if (resolved.action === "build-from-afterwork") {
        buildFromAfterworkEntry(resolved.afterworkId);
        ok = true;
      }
      if (ok && resolved.action !== "delete-afterwork" && resolved.action !== "build-from-afterwork") showInsights();
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
    const insights = getDisplayInsights();
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

    const visibleConcepts = [...concepts].filter(Boolean).filter((label) => !isGenericDisplayConcept(label));
    out(JSON.stringify({
      concepts: visibleConcepts,
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
    const normalizeTheoryKey = (value) => String(value || "").toLowerCase().trim().replace(/\s+/g, " ");
    const addTheoryLink = (raw) => {
      if (!raw || typeof raw !== "object") return;
      const thinker = String(raw?.thinker || "").trim();
      const theory = String(raw?.theory || "").trim();
      const name = String(raw?.name || thinker || theory || "Ukjent").trim();
      const relation = String(raw?.relation || raw?.connection || "").trim();
      if (!name || !relation) return;
      const score = Number(raw?.relevance_score ?? raw?.score ?? 0);
      if (!Number.isFinite(score)) return;
      const key = `${normalizeTheoryKey(name)}::${normalizeTheoryKey(relation)}`;
      const current = bestByKey.get(key);
      if (!current || score > current.score) {
        bestByKey.set(key, {
          name,
          relation: relation.length > 160 ? `${relation.slice(0, 157)}…` : relation,
          score
        });
      }
    };
    (Array.isArray(safeChamber?.insights) ? safeChamber.insights : []).forEach((insight) => {
      if (!global.InsightsEngine?.scoreTheoryRelevance) return;
      const scored = global.InsightsEngine.scoreTheoryRelevance(insight, safeChamber) || [];
      scored.forEach(addTheoryLink);
    });
    const chamberText = (Array.isArray(safeChamber?.insights) ? safeChamber.insights : [])
      .map((insight) => [insight?.title, insight?.summary, insight?.text, insight?.source_text].filter(Boolean).join(" "))
      .join("\n");
    const activeContext = resolveActiveAnalysisContext();
    const activeSourceText = String(activeContext?.sourceText || "").trim();
    const activeContextText = [
      activeSourceText,
      ...extractAcademicPhraseConcepts(activeSourceText),
      ...(Array.isArray(activeContext?.subjectLinks) ? activeContext.subjectLinks.map((item) => item?.title || item?.name || item?.label || item?.key || "") : []),
      ...(Array.isArray(activeContext?.keywords) ? activeContext.keywords.map((item) => item?.label || item?.name || item?.key || item || "") : [])
    ].filter(Boolean).join("\n");
    [chamberText, activeSourceText, activeContextText].forEach((sourceText) => {
      extractAcademicTheoryLinks(sourceText).forEach(addTheoryLink);
    });
    return Array.from(bestByKey.values())
      .sort((a, b) => (b.score - a.score) || a.name.localeCompare(b.name))
      .slice(0, Math.max(1, Number(maxItems || 5)));
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
      const insightText = [insight?.title, insight?.summary, insight?.text, insight?.source_text].filter(Boolean).join(" ");
      (Array.isArray(insight?.thinkers) ? insight.thinkers : []).forEach(add);
      (Array.isArray(insight?.theories) ? insight.theories : []).forEach(add);
      (Array.isArray(insight?.theoretical_links) ? insight.theoretical_links : []).forEach((link) => {
        add(link?.name);
        add(link?.theory);
      });
      extractAcademicTheoryLinks(insightText).forEach((link) => {
        add(link?.thinker);
        add(link?.theory);
      });
    });

    return Array.from(counts.values())
      .filter((item) => item.key)
      .sort((a, b) => (b.count - a.count) || a.key.localeCompare(b.key))
      .slice(0, Math.max(1, Number(maxItems || 4)));
  }

  function renderConceptNetwork(graphData, theoryLinks, context) {
    const graph = graphData && typeof graphData === "object" ? graphData : {};
    const strongestPairs = Array.isArray(graph?.strongest_pairs) ? graph.strongest_pairs : [];
    const strongestEdges = strongestPairs.map((pair) => ({
      from: String(pair?.from || pair?.a || "").trim(),
      to: String(pair?.to || pair?.b || "").trim(),
      weight: Number(pair?.weight || pair?.score || pair?.count || 0),
      type: "co_occurs"
    }));
    const coOccursEdges = (Array.isArray(graph?.edges) ? graph.edges : [])
      .filter((edge) => edge?.type === "co_occurs" && edge?.from && edge?.to)
      .map((edge) => ({ from: String(edge.from).trim(), to: String(edge.to).trim(), weight: Number(edge.weight || 0), type: "co_occurs" }));
    const mergedByKey = new Map();
    [...strongestEdges, ...coOccursEdges].forEach((edge) => {
      if (!edge.from || !edge.to || edge.from === edge.to) return;
      const pairKey = [edge.from, edge.to].sort((a, b) => a.localeCompare(b)).join("::");
      const prev = mergedByKey.get(pairKey);
      if (!prev || edge.weight > prev.weight) mergedByKey.set(pairKey, edge);
    });

    const sortedConnections = prioritizeVisibleConceptEdges(Array.from(mergedByKey.values()), theoryLinks, context)
      .filter((edge) => !isGenericDisplayConcept(edge.from) && !isGenericDisplayConcept(edge.to))
      .slice(0, 8);

    if (sortedConnections.length < 2) {
      return "<p class='knowledge-sub'>For få koblinger til å bygge nettverk ennå.</p>";
    }

    const nodeStrength = new Map();
    sortedConnections.forEach((edge) => {
      const baseWeight = Math.max(1, Number(edge.weight || 0));
      const from = normalizeConceptKey(edge.from);
      const to = normalizeConceptKey(edge.to);
      nodeStrength.set(from, (nodeStrength.get(from) || 0) + baseWeight);
      nodeStrength.set(to, (nodeStrength.get(to) || 0) + baseWeight);
    });

    const topConcepts = Array.from(nodeStrength.entries())
      .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
      .map(([concept]) => concept)
      .filter((concept, idx, arr) => concept && arr.indexOf(concept) === idx)
      .slice(0, 5);

    if (topConcepts.length < 2) {
      return "<p class='knowledge-sub'>For få koblinger til å bygge nettverk ennå.</p>";
    }

    const topSet = new Set(topConcepts);
    const networkEdges = sortedConnections.filter((edge) => topSet.has(normalizeConceptKey(edge.from)) && topSet.has(normalizeConceptKey(edge.to)));
    if (!networkEdges.length) {
      return "<p class='knowledge-sub'>For få koblinger til å bygge nettverk ennå.</p>";
    }

    const adjacency = new Map();
    networkEdges.forEach((edge) => {
      const from = normalizeConceptKey(edge.from);
      const to = normalizeConceptKey(edge.to);
      if (!adjacency.has(from)) adjacency.set(from, []);
      if (!adjacency.has(to)) adjacency.set(to, []);
      adjacency.get(from).push({ target: to, weight: edge.weight });
      adjacency.get(to).push({ target: from, weight: edge.weight });
    });

    const shouldHideWeakVariant = (concept, links) => {
      const normalized = normalizeConceptKey(concept);
      if (normalized === "knapphet" && topSet.has("ressursknapphet")) return true;
      if (normalized === "knapphet" && topSet.has("knapphetsskolen")) return true;
      if (normalized === "økologi" && topSet.has("politisk økologi")) return true;
      return !links.length && ((normalized === "knapphet" && (topSet.has("ressursknapphet") || topSet.has("knapphetsskolen"))) || (normalized === "økologi" && topSet.has("politisk økologi")));
    };

    const rows = topConcepts.map((concept) => {
      const dedupedLinks = Array.from(new Map((adjacency.get(concept) || []).map((entry) => [normalizeConceptKey(entry.target), entry])).values());
      const links = dedupedLinks
        .sort((a, b) => (b.weight - a.weight) || a.target.localeCompare(b.target))
        .slice(0, 3);
      if (shouldHideWeakVariant(concept, links)) return "";
      const children = links.length
        ? `<ul class="concept-network-links">${links.map((entry) => `<li><span class="concept-link-line"></span><span class="concept-node-badge">${escHtml(displayConceptLabel(entry.target))}</span></li>`).join("")}</ul>`
        : `<p class="knowledge-sub concept-network-empty">Ingen sterke koblinger registrert for dette begrepet ennå.</p>`;
      return `<li class="concept-network-item"><span class="concept-node-badge">${escHtml(displayConceptLabel(concept))}</span>${children}</li>`;
    }).filter(Boolean).join("");

    return `<div class="concept-network" aria-label="Begrepsnettverk">
      <ul class="concept-network-list">${rows}</ul>
    </div>`;
  }



  function displayConceptLabel(value) {
    return String(value || "").replace(/_/g, " ").trim();
  }

  function normalizeConceptKey(value) {
    return String(value || "").trim().toLowerCase();
  }

  function filterGenericConceptItems(items, keyGetter) {
    return applyPhraseConceptDisplayPreference((Array.isArray(items) ? items : []).filter((item) => !isGenericDisplayConcept(keyGetter(item))), keyGetter);
  }

  function buildCurrentFocusConceptSet(recurringThemes, conceptGraph, profile) {
    const fromRecent = (profile?.temporal?.recent_focus?.concepts || [])
      .slice(0, 12)
      .map((item) => normalizeConceptKey(item?.key));
    const from14d = (recurringThemes?.["14d"]?.top_concepts || [])
      .slice(0, 12)
      .map((item) => normalizeConceptKey(item?.key));
    const fromGraph = Object.values(conceptGraph?.nodes || {})
      .filter((node) => node?.type === "concept")
      .sort((a, b) => Number(b?.count || 0) - Number(a?.count || 0))
      .slice(0, 15)
      .map((node) => normalizeConceptKey(node?.key || node?.id || node?.label));

    return new Set([...fromRecent, ...from14d, ...fromGraph].filter(Boolean));
  }

  function tensionOverlapsFocus(item, focusSet) {
    if (!item || !(focusSet instanceof Set) || !focusSet.size) return false;
    const raw = String(item?.title || item?.key || "").toLowerCase();
    const pair = raw
      .split(/↔|<->|↔|—|-|vs\.?/i)
      .map((part) => normalizeConceptKey(part))
      .filter(Boolean);
    if (!pair.length) return false;
    return pair.some((concept) => focusSet.has(concept));
  }

  function renderKnowledgeMapSection(chamber, profile) {
    const safeChamber = chamber && typeof chamber === "object" ? chamber : {};
    const recurringThemes = global.InsightsEngine?.getRecurringThemes
      ? global.InsightsEngine.getRecurringThemes(safeChamber, { windows: [14, 30] })
      : {};
    const conceptGraph = global.InsightsEngine?.buildConceptGraph
      ? global.InsightsEngine.buildConceptGraph(safeChamber)
      : { nodes: {}, edges: [] };

    const theoryLinks = buildDedupedTheoryLinks(safeChamber, 5);
    const conceptEdgeContext = buildConceptEdgeContext(safeChamber, theoryLinks);

    const tensions = global.InsightsEngine?.detectTensions
      ? (global.InsightsEngine.detectTensions(safeChamber) || [])
      : [];

    const graphNodes = Object.values(conceptGraph?.nodes || {});
    const visibleGraphNodes = graphNodes.filter((node) => {
      if (node?.type !== "concept") return true;
      return !isGenericDisplayConcept(node?.key || node?.id || node?.label);
    });
    const conceptNodeCount = visibleGraphNodes.filter((node) => node?.type === "concept").length;
    const graphTheoryNodes = graphNodes.filter((node) => node?.type === "theory" || node?.type === "thinker").length;
    const extractedTheoryNodes = collectTheoryNodeLabels(safeChamber).length;
    const theoryNodeCount = Math.max(graphTheoryNodes, extractedTheoryNodes);
    const focusConcepts = buildCurrentFocusConceptSet(recurringThemes, conceptGraph, profile);
    const prioritizedEdges = (conceptGraph?.edges || [])
      .filter((edge) => edge?.type === "co_occurs")
      .filter((edge) => !isGenericDisplayConcept(edge?.from) && !isGenericDisplayConcept(edge?.to))
      .filter((edge) => {
        const from = normalizeConceptKey(edge?.from);
        const to = normalizeConceptKey(edge?.to);
        return focusConcepts.has(from) || focusConcepts.has(to);
      });
    const edgePool = prioritizedEdges.length
      ? prioritizedEdges
      : (conceptGraph?.edges || [])
        .filter((edge) => edge?.type === "co_occurs")
        .filter((edge) => !isGenericDisplayConcept(edge?.from) && !isGenericDisplayConcept(edge?.to));
    const topEdges = prioritizeVisibleConceptEdges(edgePool, theoryLinks, conceptEdgeContext)
      .slice(0, 3);

    const themes14d = filterGenericConceptItems(recurringThemes?.["14d"]?.top_concepts || [], (item) => item?.key).slice(0, 3);
    const themes30d = filterGenericConceptItems(recurringThemes?.["30d"]?.top_concepts || [], (item) => item?.key).slice(0, 3);
    const topTheoryPeople = collectTheoryPeople(safeChamber, recurringThemes?.["30d"]?.top_theories, 4);
    const profileTensions = profile?.tensions || {};
    const conceptPairTensions = (profileTensions.concept_pair_tensions || [])
      .slice()
      .sort((a, b) => (Number(b?.strength) || 0) - (Number(a?.strength) || 0))
      .slice(0, 5)
      .map((item) => ({
        title: `${item?.source || "Ukjent"} ↔ ${item?.target || "Ukjent"}`,
        strength: item?.strength || 0
      }));
    const paradoxTensions = (profileTensions.paradox_pairs || [])
      .slice(0, 5)
      .map((item) => ({
        title: (item?.shared_concepts || []).slice(0, 2).join(" ↔ ") || "Paradoks",
        strength: (item?.shared_concepts || []).length || 0
      }));
    const conceptScoreTensions = (profileTensions.concept_tensions || [])
      .filter((item) => tensionOverlapsFocus(item, focusConcepts))
      .slice(0, 5)
      .map((item) => ({ title: item?.key || "Ukjent", strength: item?.combined || 0 }));
    const fallbackTensions = tensions
      .filter((item) => tensionOverlapsFocus(item, focusConcepts))
      .slice(0, 5);
    const visibleTensions = conceptPairTensions.length
      ? conceptPairTensions
      : paradoxTensions.length
        ? paradoxTensions
        : conceptScoreTensions.length
          ? conceptScoreTensions
          : fallbackTensions;

    return `<section class="knowledge-map-block">
      <h3>Kunnskapskart for hele chamberet</h3>
      <div class="knowledge-map-grid">
        <article class="knowledge-card">
          <h4>Tilbakevendende tema</h4>
          <p class="knowledge-sub">14d: ${themes14d.length ? themes14d.map((item) => `${escHtml(displayConceptLabel(item.key))} (${item.count})`).join(", ") : "Ingen tydelige begreper ennå."}</p>
          <p class="knowledge-sub">30d: ${themes30d.length ? themes30d.map((item) => `${escHtml(displayConceptLabel(item.key))} (${item.count})`).join(", ") : "Mangler data for siste 30 dager."}</p>
          <p class="knowledge-sub">Teori/tenkere: ${topTheoryPeople.length ? topTheoryPeople.map((item) => `${escHtml(displayConceptLabel(item.key))} (${item.count})`).join(", ") : "Ingen teorikoblinger funnet ennå."}</p>
        </article>
        <article class="knowledge-card">
          <h4>Begrepsgraf</h4>
          <p class="knowledge-sub">Begrepsnoder: <strong>${conceptNodeCount}</strong></p>
          <p class="knowledge-sub">Teori-/tenkernoder: <strong>${theoryNodeCount}</strong></p>
          <p class="knowledge-sub">Sterkeste co-occurs: ${topEdges.length ? topEdges.map((edge) => `${escHtml(displayConceptLabel(edge.from))} ↔ ${escHtml(displayConceptLabel(edge.to))} (${edge.weight})`).join(", ") : "Ingen samforekomst-koblinger ennå."}</p>
          <h5 class="knowledge-mini-title">Begrepsnettverk</h5>
          ${renderConceptNetwork(conceptGraph, theoryLinks, conceptEdgeContext)}
        </article>
        <article class="knowledge-card">
          <h4>Teorikoblinger</h4>
          ${theoryLinks.length ? `<ul>${theoryLinks.map((link) => `<li><strong>${escHtml(link.name)}</strong> · ${escHtml(link.score.toFixed(2))}${link.relation ? ` · ${escHtml(link.relation)}` : ""}</li>`).join("")}</ul>` : "<p class='knowledge-sub'>Ingen teoretiske koblinger å score ennå.</p>"}
        </article>
        <article class="knowledge-card">
          <h4>Spenninger</h4>
          ${visibleTensions.length ? `<ul>${visibleTensions.map((item) => `<li><strong>${escHtml(String(item?.title || "Ukjent"))}</strong> · styrke ${escHtml(String(item?.strength || 0))}</li>`).join("")}</ul>` : "<p class='knowledge-sub'>Ingen spenninger koblet til de nyeste temaene ennå.</p>"}
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

    const recentConcepts = filterGenericConceptItems(recent.concepts || [], (item) => item?.key).slice(0, 6).map((c) =>
      `${escHtml(displayConceptLabel(c.key))} <span class="meta-count">×${c.count}</span>`
    );
    const emerging = filterGenericConceptItems(recent.emerging || [], (item) => item?.key).slice(0, 5).map((c) =>
      `${escHtml(displayConceptLabel(c.key))} <span class="meta-count">×${c.count}</span>`
    );
    const fading = filterGenericConceptItems(recent.fading || [], (item) => item?.key).slice(0, 5).map((c) =>
      `${escHtml(displayConceptLabel(c.key))} <span class="meta-count">tidligere ×${c.prev_count}</span>`
    );
    const conceptPairTensions = (tensions.concept_pair_tensions || [])
      .filter((t) => !isGenericDisplayConcept(t?.source) && !isGenericDisplayConcept(t?.target))
      .slice(0, 5).map((t) => (
      `${escHtml(displayConceptLabel(t?.source))} ↔ ${escHtml(displayConceptLabel(t?.target))} <span class="meta-count">styrke ${escHtml(String(t?.strength || 0))}</span>`
    ));
    const conceptTensions = (tensions.concept_tensions || []).slice(0, 5).map((t) => {
      const key = String(t?.key || "");
      const hasPair = /↔|<->|vs\.?|\s-\s|—/.test(key);
      return hasPair
        ? `${escHtml(key)} <span class="meta-count">spenning ${Number(t.combined).toFixed(2)}</span>`
        : "Ingen tydelig todelt spenning ennå.";
    });
    const paradoxes = (tensions.paradox_pairs || []).slice(0, 5).map((p) => {
      const shared = (p.shared_concepts || []).slice(0, 3).map(escHtml).join(", ");
      const themeText = p.theme_id ? ` i <em>${escHtml(p.theme_id)}</em>` : "";
      return `${shared || "(begreper)"}${themeText}`;
    });
    const unstick = (recs.unstick_prompts || []).slice(0, 4).map((u) =>
      escHtml(u.prompt || "")
    );
    const resurface = (recs.resurface_insights || []).slice(0, 4).map((r) =>
      `${escHtml((r.summary || "").slice(0, 160))} <span class="meta-count">${escHtml((r.shared_concepts || []).map((concept) => displayConceptLabel(concept)).join(", "))}</span>`
    );
    const bridging = (recs.bridging_pairs || [])
      .filter((b) => !isGenericDisplayConcept(b?.source) && !isGenericDisplayConcept(b?.target))
      .slice(0, 4).map((b) => {
      const source = normalizeConceptKey(b?.source) === "knapphet" && (recentConcepts.join(" ").toLowerCase().includes("ressursknapphet") || recentConcepts.join(" ").toLowerCase().includes("knapphetsskolen")) ? "ressursknapphet" : b?.source;
      const pair = `${escHtml(displayConceptLabel(source))} ↔ ${escHtml(displayConceptLabel(b.target))}`;
      return `${pair} <span class="meta-count">npmi ${Number(b.npmi).toFixed(2)}</span>`;
    });
    const underexplored = filterGenericConceptItems(recs.underexplored_concepts || [], (item) => item?.key).slice(0, 5).map((u) =>
      `${escHtml(displayConceptLabel(u.key))} <span class="meta-count">×${u.count} · ${escHtml(u.reason || "")}</span>`
    );

    const sections = [
      renderMetaSection(`Det du tenker mest på${window}`, recentConcepts),
      renderMetaSection("Nye temaer som dukker opp", emerging),
      renderMetaSection("Tankegods som har stilnet", fading),
      renderMetaSection("Spenninger jeg ser", conceptPairTensions.length ? conceptPairTensions : (paradoxes.length ? paradoxes : conceptTensions)),
      renderMetaSection("Paradokser i materialet", paradoxes),
      renderMetaSection("Spørsmål som kan løsne fastlåsthet", unstick),
      renderMetaSection("Refleksjoner verdt å hente frem", resurface),
      renderMetaSection("Koblinger verdt å tenke videre på", bridging),
      renderMetaSection("Nye begreper som trenger flere koblinger", underexplored)
    ].filter(Boolean).join("");

    const knowledgeMap = renderKnowledgeMapSection(chamber, profile);

    if (!sections) {
      return `<div class="meta-profile">
        <h3>Hva AHA ser i hele materialet ditt</h3>
        <p class="meta-empty">AHA har ennå ikke nok å gå på. Skriv mer i chat eller importer fra History Go.</p>
        ${knowledgeMap}
      </div>`;
    }

    return `<div class="meta-profile">
      <h3>Hva AHA ser i hele materialet ditt</h3>
      <p class="meta-meta">${totalInsights} innsikter analysert på tvers av hele chamberet.</p>
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
          <h3>Kunnskapskart for hele chamberet</h3>
          <p class="meta-empty">AHA har ikke nok innsikter til å bygge kunnskapskart ennå.</p>
        </section>`;
    renderPanel(`<div class="insight-panel">${content}</div>`);
    out("");
  }

  function reset() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(HIGHLIGHTS_STORAGE_KEY);
    localStorage.removeItem(AUTO_OUTPUT_STORAGE_KEY);
    localStorage.removeItem(AFTERWORK_STORAGE_KEY);
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

  function isBoilerplateLine(trimmed) {
    const text = String(trimmed || "").trim();
    if (!text) return true;
    const lowered = text.toLowerCase();
    if (/^les\s+også\s*:/i.test(text)) return true;
    if (/^illustrasjon\s*:/i.test(text)) return true;
    if (/^(annonsørinnhold|annonsorinnhold|logo|sponset|annonse)$/i.test(text)) return true;
    if (text.length <= 48 && /(annonsørinnhold|annonsorinnhold|logo|sponset|annonse|kjøp nå|kjop na)/i.test(lowered)) return true;
    return false;
  }

  function stripInlineBoilerplate(text) {
    let value = String(text || "");
    value = value.replace(/\b(annonsørinnhold|annonsorinnhold|sponset)\b/ig, " ");
    value = value.replace(/\blogo\b/ig, " ");
    value = value.replace(/illustrasjon\s*:[^.!?\n]{0,120}/ig, " ");
    value = value.replace(/\s{2,}/g, " ").trim();
    return value;
  }


  function fixSplitNorwegianWords(text) {
    let value = String(text || "");
    const fixes = [
      [/\bkonfl\s+ikt(\w*)\b/gi, "konflikt$1"],
      [/\bprofi\s+leres\b/gi, "profileres"],
      [/\bmilj\s+ødegradering\b/gi, "miljødegradering"],
      [/\bressurs\s+knapphet\b/gi, "ressursknapphet"],
      [/\bkonfl\s+iktnivå\b/gi, "konfliktnivå"]
    ];
    fixes.forEach(([re, repl]) => {
      value = value.replace(re, repl);
    });
    return value;
  }

  function dedupeSentenceLikeContent(text) {
    const parts = String(text || "")
      .split(/(?<=[.!?])\s+|\n+/)
      .map((part) => part.trim())
      .filter(Boolean);
    const out = [];
    const seen = new Set();
    parts.forEach((part) => {
      const key = part.toLowerCase().replace(/\s+/g, " ").replace(/["'“”«»]/g, "").trim();
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(part);
    });
    return out.join("\n");
  }

  function cleanArticleText(raw) {
    if (global.AHAAnalysisText?.cleanTextForAnalysis) {
      const precleaned = global.AHAAnalysisText.cleanTextForAnalysis(raw);
      const deduped = dedupeSentenceLikeContent(precleaned);
      return fixSplitNorwegianWords(deduped);
    }
    const lines = String(raw || "").split(/\r?\n/);
    const cleaned = [];
    const seen = new Set();
    lines.forEach((line) => {
      const trimmed = String(line || "").trim();
      if (!trimmed) return;
      if (isBoilerplateLine(trimmed)) return;
      const stripped = stripInlineBoilerplate(trimmed);
      if (!stripped || isBoilerplateLine(stripped)) return;
      const compact = stripped.toLowerCase().replace(/\s+/g, " ");
      if (seen.has(compact)) return;
      seen.add(compact);
      cleaned.push(stripped);
    });
    const merged = dedupeSentenceLikeContent(cleaned.join("\n"));
    return fixSplitNorwegianWords(merged);
  }

  function sanitizeInsightText(text) {
    let value = cleanArticleText(text);
    value = String(value || "").replace(LES_OGSA_TEASER_PATTERN, " ");
    value = value.replace(INSIGHT_NOISE_PATTERN, " ");
    value = value.replace(/\s+/g, " ").trim();
    value = value.replace(LEADING_PUNCTUATION_PATTERN, "").trim();
    if (TEASER_TITLE_PATTERN.test(value)) {
      const nextSentence = value.search(/[.!?]\s+[A-ZÆØÅ]/);
      value = nextSentence >= 0 ? value.slice(nextSentence + 1) : "";
      value = value.replace(LEADING_PUNCTUATION_PATTERN, "").trim();
    }
    if (!value || /^[\s"'“”«».,:;|\-–—]+$/.test(value)) return "";
    return value;
  }

  function shouldHideInsightCard(title, summary) {
    const combined = `${String(title || "")} ${String(summary || "")}`.trim();
    if (!combined) return true;
    const normalized = sanitizeInsightText(combined);
    if (!normalized) return true;
    const tokens = normalized.toLowerCase().split(/\s+/).filter(Boolean);
    if (!tokens.length) return true;
    const weakCount = tokens.filter((token) => WEAK_CONCEPT_WORDS.has(token)).length;
    return weakCount >= Math.max(3, Math.ceil(tokens.length * 0.75));
  }

  function toSentences(text) {
    return String(text || "").split(/(?<=[.!?])\s+|\n+/).map((part) => part.trim()).filter(Boolean);
  }

  function collectOpinionArticleEvidence(raw, sentences) {
    const text = cleanArticleText(raw);
    const lowered = String(text || "").toLowerCase();
    const normalize = (v) => ` ${String(v || "").toLowerCase()} `;
    const normalizedText = ` ${lowered} `;
    const hasAny = (signals) => signals.some((signal) => normalizedText.includes(normalize(signal)));
    const findLine = (signals) => (sentences || []).find((line) => {
      const normalized = normalize(line);
      return signals.some((signal) => normalized.includes(normalize(signal)));
    }) || "";
    const signals = {
      government: ["regjering", "storting", "statsråd", "statsrad", "departement", "kommisjon", "omstillingskommisjon", "kommune", "lokalsamfunn", "sentralmakt"],
      party: ["mdg", "arbeiderpartiet", "høyre", "hoyre", "sv", "venstre", "sp", "frp", "rødt", "rodt"],
      policyProposal: ["plan", "mandat", "kommisjon", "omstilling", "arealnøytralitet", "arealnoytralitet", "sirkulærøkonomi", "sirkulaerokonomi", "grønn vekst", "gronn vekst", "grønne jobber", "gronne jobber", "naturens premisser"],
      climateTransition: ["omstilling", "grønn omstilling", "gronn omstilling", "bærekraft", "baerekraft", "bærekraftig samfunn", "grønt skifte", "fremtidsrettet", "naturens tålegrenser", "naturens talegrenser"],
      oilFossil: ["olje", "oljeavhengig", "fossilt", "fossil", "oljesokkelen", "oljeindustri", "forurense", "utslippsregnskap"],
      natureProtection: ["natur", "naturhensyn", "villrein", "villaks", "urørt natur", "urort natur", "arealnøytralitet", "arealnoytralitet", "nedbygging", "bygge ned", "naturens premisser"],
      indigenousRights: ["samiske rettigheter", "samisk kultur", "samer", "urfolk"],
      energyPolicy: ["fornybar", "solceller", "vindkraft", "kraft", "elektrifisere", "fastlandsindustrien"],
      circularEconomy: ["sirkulærøkonomi", "sirkulaerokonomi", "gjenbruk", "reparasjon", "arbeidsplasser", "verdiskaping"],
      localCommunities: ["lokalsamfunn", "kommuneøkonomi", "folk i nord", "nord", "finmarking", "oslo", "sentralmakt"],
      economicConsequence: ["økonomi", "okonomi", "arbeidsplasser", "verdiskaping", "kostnad", "kostnader", "konsekvens"],
      politicalCritique: ["kritikk", "undergraver", "svekker", "feiler", "ikke godt nok", "dobbelt signal", "naiv", "uansvarlig"],
      rhetoricalQuestions: ["hva er det egentlig", "hva skal vi bli", "hvorfor", "?"],
      articleBoilerplate: ["les også", "annonsørinnhold", "illustrasjon", "logo"]
    };
    const actorDefs = ["MDG","Arbeiderpartiet","Høyre","SV","Venstre","Sp","Frp","Rødt","regjeringen","Støre-regjeringen","omstillingskommisjonen","John Arne Markussen","kulturministeren","Finansdepartementet","stortinget","statsråd","kommisjon","kommune","lokalsamfunn"];
    const actors = actorDefs.filter((name) => normalizedText.includes(normalize(name)));
    const evidence = {
      hasGovernment: hasAny(signals.government),
      hasPoliticalActor: hasAny(signals.government) || actors.length > 0,
      hasParty: hasAny(signals.party),
      hasPolicyProposal: hasAny(signals.policyProposal),
      hasClimateTransition: hasAny(signals.climateTransition),
      hasOilFossil: hasAny(signals.oilFossil),
      hasNatureProtection: hasAny(signals.natureProtection),
      hasIndigenousRights: hasAny(signals.indigenousRights),
      hasEnergyPolicy: hasAny(signals.energyPolicy),
      hasCircularEconomy: hasAny(signals.circularEconomy),
      hasLocalCommunities: hasAny(signals.localCommunities),
      hasEconomicConsequence: hasAny(signals.economicConsequence),
      hasPoliticalCritique: hasAny(signals.politicalCritique),
      hasRhetoricalQuestions: hasAny(signals.rhetoricalQuestions),
      hasArticleBoilerplate: hasAny(signals.articleBoilerplate),
      actors,
      matchedThemes: [],
      textSnippets: {
        claim: findLine([].concat(signals.policyProposal, signals.climateTransition, signals.oilFossil)) || (sentences[0] || ""),
        conflict: findLine(signals.politicalCritique),
        nature: findLine(signals.natureProtection),
        energy: findLine(signals.energyPolicy),
        local: findLine(signals.localCommunities)
      }
    };
    const themes = [];
    if (evidence.hasClimateTransition) themes.push("klima-omstilling");
    if (evidence.hasOilFossil) themes.push("olje-fossil");
    if (evidence.hasNatureProtection) themes.push("natur-areal");
    if (evidence.hasIndigenousRights) themes.push("samiske-rettigheter");
    if (evidence.hasEnergyPolicy) themes.push("energi-industri");
    if (evidence.hasCircularEconomy) themes.push("sirkulaerokonomi");
    if (evidence.hasLocalCommunities) themes.push("lokalsamfunn-makt");
    evidence.matchedThemes = themes;
    return evidence;
  }

  function detectTextType(raw) {
    const text = cleanArticleText(raw).toLowerCase();
    if (!text) return "general";

    const opinionEvidence = collectOpinionArticleEvidence(text, toSentences(text));
    let opinionScore = 0;
    if (opinionEvidence.hasPoliticalActor) opinionScore += 2;
    if (opinionEvidence.hasParty) opinionScore += 1;
    if (opinionEvidence.hasPolicyProposal) opinionScore += 1;
    if (opinionEvidence.hasClimateTransition) opinionScore += 2;
    if (opinionEvidence.hasOilFossil) opinionScore += 2;
    if (opinionEvidence.hasNatureProtection) opinionScore += 2;
    if (opinionEvidence.hasIndigenousRights) opinionScore += 1;
    if (opinionEvidence.hasEnergyPolicy) opinionScore += 1;
    if (opinionEvidence.hasCircularEconomy) opinionScore += 1;
    if (opinionEvidence.hasLocalCommunities) opinionScore += 1;
    if (opinionEvidence.hasPoliticalCritique) opinionScore += 1;
    if (opinionEvidence.hasRhetoricalQuestions) opinionScore += 1;

    const daySignals = /(i dag|idag|dagen min|jeg våknet|jeg hentet|jeg leverte|på jobb|etterpå|i kveld|i morges|vi dro|jeg gjorde|formiddag|ettermiddag)/i;
    const literaryDiarySignals = /(jeg trodde|jeg burde|jeg er lei|jeg skjønner|jeg tenkte|her om dagen|i forrigårs|fortsatt|neste uke|ringe|savn|sinne|kjærlighet|skyld|skam|fremmedhet|forfatter|poetisk|skrive|tekst|leve vilt|reise|nomad|kurbad|hageanlegg|leilighet|telefon|park|møte)/i;
    const literaryFragmentSignals = /(scene|stemning|rytme|lys|mørke|rommet|gaten|kropp|språk|vind|lukt|hud|sans)/i;
    const theoryStrongSignals = /(teori|modell|bevissthet|hypotese|begrep|premiss|epistem)/i;
    const theoryWeakSignals = /(kunnskap|system|metode)/i;
    const sentenceCount = toSentences(text).length;
    const pronounCount = (text.match(/\bjeg\b/g) || []).length;
    const hasDiaryShape = pronounCount >= 2 && sentenceCount >= 3;
    if (pronounCount >= 3 && literaryDiarySignals.test(text) && sentenceCount >= 4) return "literary_diary";

    const academicSignals = {
      theorists: /(homer-?dixon|peluso|watts|boserup|kaplan|gleditsch|salehyan|barnett|said)/i.test(text),
      years: /\b(19|20)\d{2}\b/.test(text),
      coreTerms: /(ressursknapphet|politisk økologi|miljødegradering|knapphetsskolen|sahel|mali|miljøsikkerhet|environmental security)/i.test(text),
      citations: /["“”«»].{8,140}["“”«»]|\bifølge\b|\bviser til\b/i.test(text),
      modelDebate: /(på den ene siden|på den andre siden|kritiserer|forklaringsmodell|alternativ forklaring|drøfter|innvending)/i.test(text)
    };
    const academicScore = Object.values(academicSignals).reduce((sum, hit) => sum + (hit ? 1 : 0), 0);
    if (academicScore >= 3 && (academicSignals.coreTerms || academicSignals.theorists)) return "academic_article";

    const hasStrongOpinion = opinionScore >= 5 || ((opinionEvidence.hasPoliticalActor || opinionEvidence.hasParty) && (opinionEvidence.hasClimateTransition || opinionEvidence.hasOilFossil || opinionEvidence.hasNatureProtection));
    if (hasStrongOpinion) return "opinion_article";

    const strongProjectSignals = /(repo|repository|kode|koding|prompt|merge|pull request|\bpr\b|branch|commit|backend|frontend|\bui\b|\bux\b|\bapi\b|database|javascript|css|html|supabase|vercel|github|fil\b)/i;
    if (strongProjectSignals.test(text)) return "project_note";

    if (theoryStrongSignals.test(text)) return "theory_idea";
    if (theoryWeakSignals.test(text) && !hasDiaryShape && !literaryDiarySignals.test(text)) return "theory_idea";
    if (daySignals.test(text)) return "day_log";
    if (literaryFragmentSignals.test(text) && sentenceCount >= 2) return "literary_fragment";
    if (pronounCount >= 4 && sentenceCount >= 5 && literaryDiarySignals.test(text)) return "literary_diary";
    return "general";
  }

  function buildLiteraryDiarySortItems(raw, sentences) {
    const text = String(raw || "");
    const normalizedText = ` ${text.toLowerCase()} `;
    const categoryDefs = [
      {
        label: "Åpningsscene / sted",
        signals: ["kurbad", "hageanlegg", "park", "leilighet", "sted", "badet", "middelhavet", "utkikkspunkt", "parker"],
        summary: "Stedsscener forankrer teksten i konkrete omgivelser."
      },
      {
        label: "Relasjonen til S",
        signals: [" s ", " henne", " ring", "ringer", "telefon", "slutt å ring", "tilbake", "såret", "sint", "kjærlighet", "prinsesse"],
        summary: "Relasjonen til S er et tydelig spor i dagbokbevegelsen."
      },
      {
        label: "Sosial uro og selvbilde",
        signals: ["fjern", "snakke med noen", "selvhevdende", "dårlig samvittighet", "ikke jeg heller", "burde", "skam", "skyld", "uro"],
        summary: "Sosial uro og selvvurdering preger fortellerstemmen."
      },
      {
        label: "Møter med fremmede",
        signals: ["kongo", "mann", "fyr", "longboard", "sykepleier", "vingård", "kompisen", "venn", "hule", "knivdrap"],
        summary: "Møter med fremmede utvider tekstens sosiale rom."
      },
      {
        label: "Reise, nomadisme og forfatterliv",
        signals: ["england", "fotballkamper", "reise", "biarriz", "campe", "middelhavet", "nomader", "forfatter", "poetisk", "leve vilt"],
        summary: "Reise, nomadisme eller skrivende selvbilde er til stede i teksten."
      },
      {
        label: "Rus og drift",
        signals: ["røyka", "weed", "feber", "trøkk", "vilt"],
        summary: "Rus eller intensitet markerer et eget driftsspor."
      },
      {
        label: "Skyld, skam og selvforsvar",
        signals: ["dårlig samvittighet", "skyld", "skam", "såret", "sint", "dårlig behandlet", "behandlet henne", "ingen rett"],
        summary: "Skyld, skam eller selvforsvar skaper tydelig indre friksjon."
      }
    ];

    const normalize = (v) => ` ${String(v || "").toLowerCase()} `;
    const matchesForCategory = (def) => {
      const found = (sentences || []).find((line) => {
        const normalized = normalize(line);
        return def.signals.some((signal) => normalized.includes(normalize(signal)));
      });
      return found ? short(found) : "";
    };

    const sortItems = categoryDefs
      .map((def) => {
        const hit = matchesForCategory(def);
        if (!hit) return null;
        if (def.label === "Relasjonen til S") {
          const hasConflict = ["slutt å ring", "såret", "sint", "dårlig behandlet", "ingen rett"].some((s) => normalizedText.includes(normalize(s)));
          if (hasConflict) return { label: def.label, text: "Relasjonen til S kombinerer kontaktbehov med tydelig konflikt." };
          return { label: def.label, text: "Relasjonen til S er et tydelig relasjonelt spor." };
        }
        return { label: def.label, text: def.summary };
      })
      .filter(Boolean)
      .slice(0, 5);

    if (sortItems.length) return sortItems;
    return [
      { label: "Scener og observasjoner", text: "Teksten bygger mening gjennom konkrete scener og observerende blikk." },
      { label: "Relasjonelt spor", text: "Relasjoner og kontaktforsøk driver den indre bevegelsen fremover." },
      { label: "Indre uro", text: "Understrømmen er uro, selvforklaring og søken etter frihet." }
    ];
  }

  function collectLiteraryDiaryEvidence(raw, sentences) {
    const text = String(raw || "");
    const normalizedText = ` ${text.toLowerCase()} `;
    const normalize = (v) => ` ${String(v || "").toLowerCase()} `;
    const hasAny = (signals) => signals.some((signal) => normalizedText.includes(normalize(signal)));
    const matchLine = (signals) => (sentences || []).find((line) => {
      const norm = normalize(line);
      return signals.some((signal) => norm.includes(normalize(signal)));
    }) || "";

    const evidence = {
      hasPlaceScene: hasAny(["kurbad", "hageanlegg", "park", "leilighet", "badet", "middelhavet", "utkikkspunkt", "sted", "by"]),
      hasSRelation: hasAny([" s ", " henne", "tilbake", "såret", "sint", "prinsesse", "kjærlighet", "slutt å ring"]),
      hasPhone: hasAny(["ring", "ringer", "telefon", "svarte", "hørte", "slutt å ring"]),
      hasStrangers: hasAny(["kongo", "mann", "fyr", "longboard", "sykepleier", "vingård", "kompisen", "venn", "hule", "knivdrap"]),
      hasTravel: hasAny(["england", "biarriz", "campe", "middelhavet", "reise", "fotballkamper"]),
      hasNomadism: hasAny(["nomade", "nomader", "nomadisme"]),
      hasWriterLife: hasAny(["forfatter", "poetisk", "skrive", "tekst", "leve vilt"]),
      hasShameGuilt: hasAny(["skyld", "skam", "dårlig samvittighet", "såret", "sint", "dårlig behandlet", "ingen rett"]),
      hasSocialUnease: hasAny(["fjern", "snakke med noen", "selvhevdende", "ikke jeg heller", "fremmedhet", "uro"]),
      hasSubstanceOrIntensity: hasAny(["røyka", "weed", "feber", "trøkk", "vilt"]),
      hasInnerMonologue: hasAny(["jeg trodde", "jeg burde", "jeg er lei", "jeg skjønner", "jeg tenkte", "jeg burde tenkt"]),
      matchedThemes: []
    };

    const themes = [];
    if (evidence.hasPlaceScene) themes.push("sted");
    if (evidence.hasSRelation) themes.push("relasjon");
    if (evidence.hasPhone) themes.push("telefonkontakt");
    if (evidence.hasStrangers) themes.push("møter");
    if (evidence.hasTravel) themes.push("reise");
    if (evidence.hasNomadism) themes.push("nomadisme");
    if (evidence.hasWriterLife) themes.push("forfatterliv");
    if (evidence.hasShameGuilt) themes.push("skyld/skam");
    if (evidence.hasSocialUnease) themes.push("sosial uro");
    if (evidence.hasSubstanceOrIntensity) themes.push("intensitet");
    if (evidence.hasInnerMonologue) themes.push("indre monolog");
    evidence.matchedThemes = themes;
    evidence.textSnippets = {
      place: matchLine(["kurbad", "hageanlegg", "park", "leilighet", "badet", "middelhavet", "utkikkspunkt", "sted", "by"]),
      relation: matchLine([" s ", " henne", "tilbake", "såret", "sint", "prinsesse", "kjærlighet", "slutt å ring"]),
      phone: matchLine(["ring", "ringer", "telefon", "svarte", "hørte", "slutt å ring"])
    };
    return evidence;
  }

  function takeKeywords(text, maxItems) {
    const tokens = String(text || "").toLowerCase().match(/[a-zæøå0-9]{2,}/g) || [];
    const stop = new Set(["litt","henne","han","hun","hadde","har","var","være","vært","blir","ble","blitt","dette","denne","disse","fordi","kanskje","hvorfor","etter","veldig","ikke","bare","også","med","som","skal","mellom","uten","noen","noe","alle","der","her","nå","fortsatt","først","tredje","runden","gammel","gamle","unge","godt","dårlig","helt","ennå","eller","men","jeg","meg","min","mine","du","deg","din","de","dem","den","det","en","ei","et","på","i","av","til","fra","og","å","norske","norsk","moderne","viktig","viktigste","store","små","nye","gamle","tydelig","særlig","mildt","sagt"]);
    const weakVerbs = new Set(["gjorde","gjør","gjort","tenkte","tenker","synes","sier","sa","våknet","hentet","leverte","dro","kom","går","gikk"]);
    const whitelist = new Set(["kurbad","hageanlegg","dame","telefon","kongo","relasjon","kjærlighet","skyld","skam","fremmedhet","ensomhet","uro","observasjon","nomade","nomadisme","begjær","forfatter","forfatterliv","reise","frihet","kontroll","rus","kropp","språk","møte","minner","konflikt","lengsel","by","park","sted","leilighet","samtale","vennskap","risiko","momsfritak","mediepolitikk","redaktørstyrte","medier","ytringsfrihet","medieøkonomi","journalistikk","regjering","kulturminister","finansdepartementet","annonseinntekter","plattformer","offentlighet","handlingsrom","schibsted","medietilsynet"]);
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

  function sourceHash(text) {
    const normalized = String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
    return normalized ? shortHash(normalized) : "";
  }

  function loadAutoOutputs() {
    try {
      const raw = localStorage.getItem(AUTO_OUTPUT_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      // Bakoverkompatibilitet: gammel cache var ren payload.
      if (parsed.payload && typeof parsed.payload === "object") return parsed;
      return { payload: parsed };
    } catch { return null; }
  }

  function loadAfterworkEntries() {
    try {
      const raw = localStorage.getItem(AFTERWORK_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveAfterworkEntries(entries) {
    localStorage.setItem(AFTERWORK_STORAGE_KEY, JSON.stringify(Array.isArray(entries) ? entries : []));
  }



  function formatAfterworkDate(createdAt) {
    const stamp = new Date(createdAt);
    if (!createdAt || Number.isNaN(stamp.getTime())) return "Ukjent tidspunkt";
    return stamp.toLocaleString("no-NO");
  }

  function renderAfterworkArray(title, items) {
    const list = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!list.length) return "";
    const rendered = list.map((item) => `<li>${escHtml(normalizeDisplayText(item))}</li>`).join("");
    return `<section class="saved-afterwork-section"><h4>${escHtml(title)}</h4><ul>${rendered}</ul></section>`;
  }

  function renderAfterworkSortItems(sortItems) {
    const list = Array.isArray(sortItems) ? sortItems : [];
    if (!list.length) return "";
    const rendered = list.map((item) => `<li><strong>${escHtml(normalizeDisplayText(item?.label || "Punkt"))}:</strong> ${escHtml(normalizeDisplayText(item?.text || ""))}</li>`).join("");
    return `<section class="saved-afterwork-section"><h4>Sortering</h4><ul>${rendered}</ul></section>`;
  }


  function renderAfterworkThoughtSorting(thoughtSorting) {
    if (typeof thoughtSorting === "string") {
      const text = thoughtSorting.trim();
      if (!text) return "";
      return `<section class="saved-afterwork-section"><h4>Tankesortering</h4><p>${escHtml(normalizeDisplayText(text))}</p></section>`;
    }

    if (!thoughtSorting || typeof thoughtSorting !== "object") return "";

    const getFirstText = (keys) => {
      for (let i = 0; i < keys.length; i += 1) {
        const value = thoughtSorting[keys[i]];
        if (value == null) continue;
        const text = String(value).trim();
        if (text) return text;
      }
      return "";
    };

    const mainTrack = getFirstText(["hovedspor", "mainTrack"]);
    const looseThoughts = getFirstText(["lose_tanker", "løse_tanker", "looseThoughts", "loseTanker", "loseTankerText"]);
    const nextStep = getFirstText(["neste_steg", "nesteSteg", "nextStep"]);

    const lines = [];
    if (mainTrack) lines.push(`<p><strong>Hovedspor:</strong> ${escHtml(normalizeDisplayText(mainTrack))}</p>`);
    if (looseThoughts) lines.push(`<p><strong>Løse tanker:</strong> ${escHtml(normalizeDisplayText(looseThoughts))}</p>`);
    if (nextStep) lines.push(`<p><strong>Neste steg:</strong> ${escHtml(normalizeDisplayText(nextStep))}</p>`);

    if (!lines.length) return "";
    return `<section class="saved-afterwork-section"><h4>Tankesortering</h4>${lines.join("")}</section>`;
  }

  function renderAfterworkSubjectLinks(subjectLinks) {
    const list = Array.isArray(subjectLinks) ? subjectLinks.filter(Boolean) : [];
    if (!list.length) return "";
    const rendered = list.map((link) => {
      const title = String(link?.title || link?.subject_id || "Fagkobling");
      const subject = link?.subject_id ? ` <small>(${escHtml(link.subject_id)})</small>` : "";
      return `<li>${escHtml(normalizeDisplayText(title))}${subject}</li>`;
    }).join("");
    return `<section class="saved-afterwork-section saved-afterwork-subjects"><h4>Fagkoblinger</h4><ul>${rendered}</ul></section>`;
  }

  function renderAfterworkEntry(entry) {
    const safeEntry = entry && typeof entry === "object" ? entry : {};
    const id = escHtml(safeEntry.id || "");
    const createdAt = formatAfterworkDate(safeEntry.createdAt);
    const textType = String(safeEntry.textType || "ukjent");
    const preview = String(safeEntry.sourceTextPreview || "Ingen kildepreview lagret.");
    const conceptPool = filterConceptLabels(Array.isArray(safeEntry.concepts) && safeEntry.concepts.length ? safeEntry.concepts : (Array.isArray(safeEntry.keywords) ? safeEntry.keywords : [])).slice(0, 3);
    const conceptLine = conceptPool.length ? conceptPool.map((item) => `<span class="insight-chip">${escHtml(item)}</span>`).join("") : '<span class="insight-chip">Ingen begreper</span>';
    const insightsCount = Array.isArray(safeEntry.insights) ? safeEntry.insights.length : 0;
    const pathCount = Array.isArray(safeEntry.learningPath) ? safeEntry.learningPath.length : 0;
    const daySummarySection = safeEntry.daySummary ? `<section class="saved-afterwork-section"><h4>Dagsoppsummering</h4><p>${escHtml(normalizeDisplayText(safeEntry.daySummary))}</p></section>` : "";

    return `<article class="saved-afterwork-card" data-afterwork-id="${id}">
      <div class="saved-afterwork-meta"><strong>${escHtml(createdAt)}</strong><span>${escHtml(textType)}</span></div>
      <p class="saved-afterwork-preview">${escHtml(normalizeDisplayText(preview))}</p>
      <div class="saved-afterwork-concepts">${conceptLine}</div>
      <p class="saved-afterwork-meta">Innsikter: ${escHtml(String(insightsCount))} · Læringssti-steg: ${escHtml(String(pathCount))}</p>
      ${renderAfterworkSubjectLinks(safeEntry.subjectLinks)}
      <div class="saved-afterwork-actions"><button type="button" data-action="build-from-afterwork" data-afterwork-id="${id}">Bygg videre</button><button type="button" data-action="delete-afterwork" data-afterwork-id="${id}">Slett</button></div>
      <details>
        <summary>Vis detaljer</summary>
        <section class="saved-afterwork-section"><h4>Refleksjon</h4><p>${escHtml(normalizeDisplayText(safeEntry.reflection || ""))}</p></section>
        ${renderAfterworkSortItems(safeEntry.sortItems)}
        ${daySummarySection}
        ${renderAfterworkThoughtSorting(safeEntry.thoughtSorting)}
        ${renderAfterworkArray("Liste", safeEntry.list)}
        ${renderAfterworkArray("Innsikt", safeEntry.insights)}
        ${renderAfterworkArray("Læringssti", safeEntry.learningPath)}
        ${renderAfterworkSubjectLinks(safeEntry.subjectLinks)}
        <section class="saved-afterwork-section"><h4>Kildepreview</h4><p>${escHtml(normalizeDisplayText(preview))}</p></section>
      </details>
    </article>`;
  }

  function showSavedAfterwork() {
    const entries = loadAfterworkEntries().slice().sort((a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime());
    if (!entries.length) {
      renderPanel('<div class="saved-afterwork-panel"><p>Ingen lagrede etterarbeid ennå. Kjør en analyse/sendt melding, og trykk «Lagre etterarbeid» nederst i AHA etterarbeid-panelet.</p></div>');
      return;
    }
    renderPanel(`<div class="saved-afterwork-panel"><div class="saved-afterwork-list">${entries.map(renderAfterworkEntry).join("")}</div></div>`);
  }

  function buildAfterworkPrompt(entry) {
    const safeEntry = entry && typeof entry === "object" ? entry : {};
    const lines = ["Bygg videre på dette AHA-etterarbeidet."];

    const sourceTextPreview = String(safeEntry.sourceTextPreview || "").trim();
    if (sourceTextPreview) {
      lines.push("", "Kilde:", sourceTextPreview);
    }

    const reflection = String(safeEntry.reflection || "").trim();
    if (reflection) {
      lines.push("", "Refleksjon:", reflection);
    }

    const insights = (Array.isArray(safeEntry.insights) ? safeEntry.insights : []).map((item) => String(item || "").trim()).filter(Boolean).slice(0, 4);
    if (insights.length) {
      lines.push("", "Hovedinnsikter:");
      insights.forEach((item) => lines.push(`- ${item}`));
    }

    const learningPath = (Array.isArray(safeEntry.learningPath) ? safeEntry.learningPath : []).map((item) => String(item || "").trim()).filter(Boolean).slice(0, 5);
    if (learningPath.length) {
      lines.push("", "Læringssti:");
      learningPath.forEach((item) => lines.push(`- ${item}`));
    }

    const subjectLinks = (Array.isArray(safeEntry.subjectLinks) ? safeEntry.subjectLinks : [])
      .map((item) => String(item?.title || item?.subject_label || item?.subject_id || "").trim())
      .filter(Boolean)
      .slice(0, 6);
    if (subjectLinks.length) {
      lines.push("", "Fagkoblinger:");
      subjectLinks.forEach((item) => lines.push(`- ${item}`));
    }

    const concepts = (Array.isArray(safeEntry.concepts) ? safeEntry.concepts : [])
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .slice(0, 6);
    if (concepts.length) {
      lines.push("", "Begreper:", concepts.join(", "));
    }

    lines.push("", "Lag et konkret neste steg basert på dette.");
    return lines.join("\n").trim();
  }

  function buildFromAfterworkEntry(entryId) {
    const id = String(entryId || "").trim();
    if (!id) {
      setStatusNote("Fant ikke lagret etterarbeid.");
      return;
    }
    const entry = loadAfterworkEntries().find((item) => String(item?.id || "") === id);
    if (!entry) {
      setStatusNote("Fant ikke lagret etterarbeid.");
      return;
    }

    const msg = document.getElementById("msg");
    if (!msg) return;

    msg.value = buildAfterworkPrompt(entry);
    msg.focus();
    msg.dispatchEvent(new Event("input", { bubbles: true }));
    setStatusNote("Etterarbeid lagt inn i skrivefeltet.");
  }

  function deleteAfterworkEntry(entryId) {
    const id = String(entryId || "").trim();
    if (!id) return;
    const entries = loadAfterworkEntries();
    const next = entries.filter((entry) => String(entry?.id || "") !== id);
    saveAfterworkEntries(next);
    showSavedAfterwork();
    setStatusNote("Etterarbeid slettet.");
  }
  function normalizeSubjectLinks(subjectMatches) {
    const seen = new Set();
    const list = Array.isArray(subjectMatches) ? subjectMatches : [];
    return list.map((match) => {
      const normalized = {};
      if (match && typeof match === "object") {
        if (match.id != null) normalized.id = match.id;
        if (match.title != null) normalized.title = String(match.title);
        else if (match.subject_label != null) normalized.title = String(match.subject_label);
        if (match.subject_id != null) normalized.subject_id = match.subject_id;
        else if (match.emne_id != null) normalized.subject_id = match.emne_id;
        if (match.score != null && Number.isFinite(Number(match.score))) normalized.score = Number(match.score);
        if (Array.isArray(match.matched_terms)) normalized.matched_terms = match.matched_terms.map((term) => String(term));
      }
      return normalized;
    }).filter((item) => {
      const key = `${String(item.subject_id || "")}|${String(item.title || "").toLowerCase()}`;
      if (!key || key === "|") return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 12);
  }
  function enrichSubjectMatchesForClimateConflict(text, subjectMatches) {
    const normalizedText = cleanArticleText(text || "").toLowerCase();
    const list = Array.isArray(subjectMatches) ? subjectMatches.slice() : [];
    const seen = new Set(list.map((item) => `${String(item?.subject_id || "")}|${String(item?.title || "").toLowerCase()}`));
    const hasAny = (terms) => (terms || []).some((term) => normalizedText.includes(String(term || "").toLowerCase()));
    const addLink = (title, terms) => {
      const key = `|${String(title || "").toLowerCase()}`;
      if (!title || seen.has(key)) return;
      seen.add(key);
      list.push({ title, subject_label: title, type: "derived", score: 1.6, matched_terms: terms.filter(Boolean) });
    };

    const hasSahelMali = hasAny(["sahel", "mali"]);
    const hasClimate = hasAny(["klimaendringer", "global klimaendring", "menneskeskapte klimaendringer", "klimadrevet"]);
    const hasConflict = hasAny(["konflikt", "konflikter", "klimakrig", "ressurskonflikt"]);
    const hasStrongContext = hasAny(["ressursknapphet","politisk økologi","knapphetsskolen","pastoralister","marginalisering","klimadata","nedbørsdata","empirisk forskning","narrativ"]);
    const strongClimateConflictSignal = hasSahelMali && hasClimate && hasConflict && hasStrongContext;
    if (hasSahelMali && hasClimate && hasConflict) {
      addLink("Klima og konflikt", ["Sahel", "Mali", "klimaendringer", "konflikt"]);
      addLink("Sahel og Mali", ["Sahel", "Mali"]);
      addLink("Afrikastudier", ["Sahel", "Mali"]);
      addLink("Utviklingsstudier", ["konflikt", "marginalisering"]);
    }

    if (hasAny(["politisk økologi", "political ecology", "knapphetsskolen", "environmental security", "miljøsikkerhet"])) {
      addLink("Politisk økologi", ["politisk økologi", "knapphetsskolen"]);
      addLink("Miljøsikkerhet", ["miljøsikkerhet", "environmental security"]);
      addLink("Ressurskonflikter", ["ressursknapphet", "konflikt"]);
    }
    if (hasAny(["forskning", "empiri", "empirisk forskning", "narrativ", "politikk", "klimadata", "nedbørsdata"])) {
      addLink("Vitenskap og politikk", ["forskning", "empiri", "politikk"]);
      addLink("Narrativer i internasjonal politikk", ["narrativ", "internasjonal politikk"]);
    }
    if (hasAny(["pastoralister", "marginalisering", "statens politikk", "ekskludering"])) {
      addLink("Stat, marginalisering og pastoralister", ["pastoralister", "marginalisering", "statens politikk"]);
    }

    if (strongClimateConflictSignal) {
      const preferred = new Set(["Klima og konflikt","Sahel og Mali","Afrikastudier","Utviklingsstudier","Politisk økologi","Miljøsikkerhet","Ressurskonflikter","Vitenskap og politikk","Narrativer i internasjonal politikk","Stat, marginalisering og pastoralister"]);
      const weakForContext = new Set(["lek, læring og kreativitet", "energi og industri"]);
      const filtered = list.filter((item) => {
        const title = String(item?.title || item?.subject_label || "").trim();
        const lowerTitle = title.toLowerCase();
        if (!weakForContext.has(lowerTitle)) return true;
        return preferred.has(title) || Number(item?.score || 0) >= 1.15;
      });
      filtered.sort((a, b) => {
        const aTitle = String(a?.title || a?.subject_label || "").trim();
        const bTitle = String(b?.title || b?.subject_label || "").trim();
        const aPreferred = preferred.has(aTitle) ? 1 : 0;
        const bPreferred = preferred.has(bTitle) ? 1 : 0;
        if (aPreferred !== bPreferred) return bPreferred - aPreferred;
        const aDerived = String(a?.type || "").toLowerCase() === "derived" ? 1 : 0;
        const bDerived = String(b?.type || "").toLowerCase() === "derived" ? 1 : 0;
        if (aDerived !== bDerived) return bDerived - aDerived;
        return Number(b?.score || 0) - Number(a?.score || 0);
      });
      return filtered.slice(0, 12);
    }
    return list.slice(0, 12);
  }

  function normalizeAfterworkConcept(term) {
    return String(term || "").toLowerCase().replace(/[“”"'`´]/g, "").replace(/\s+/g, " ").trim();
  }

  function isGoodAfterworkConcept(term, options) {
    const normalized = normalizeAfterworkConcept(term);
    if (!normalized || normalized.length < 3) return false;
    const hasMultiWords = normalized.includes(" ");
    const source = String(options?.source || "generic");
    const blocked = new Set([
      "annonsørinnhold","annonse","logo","illustrasjon","les også","kjolevalg","kjole","kjoler","bryllupsgjesten","terrasse","plank","garanti","årets","populære","sikre","nydelige",
      "markussen","norge","omstilles","fortsetter","bygge","naturens","retning","bekostning","dette","tekst","sier","skal","gjøre","være","blir","kommer","spør","svarer"
    ]);
    if (blocked.has(normalized)) return false;
    const genericWords = new Set(["med","som","for","mot","inn","ut","opp","ned","der","her","alle","flere","kan","vil","må","når","hvor","hvorfor","hva"]);
    if (!hasMultiWords && genericWords.has(normalized)) return false;
    const weakSingleWords = new Set(["politikk","samfunn","klima","debatt","endring"]);
    if (!hasMultiWords && source !== "matched_terms" && weakSingleWords.has(normalized)) return false;
    if (!hasMultiWords && /^(\p{Lu}[\p{L}-]+)$/u.test(String(term || ""))) return false;
    return true;
  }

  function deriveConceptsFromAfterwork(payload, fallbackKeywords, subjectLinks, sourceText) {
    const concepts = [];
    const seen = new Set();
    const safePayloadKeywords = Array.isArray(payload?.keywords) ? payload.keywords : [];
    const safeFallbackKeywords = Array.isArray(fallbackKeywords) ? fallbackKeywords : [];
    const safeSubjectLinks = Array.isArray(subjectLinks) ? subjectLinks : [];
    const cleanedSource = cleanArticleText(sourceText || "").toLowerCase();
    const phraseConcepts = extractAcademicPhraseConcepts(sourceText || "");

    function addConcept(term, source) {
      const normalized = normalizeAfterworkConcept(term);
      if (!isGoodAfterworkConcept(normalized, { source })) return;
      if (seen.has(normalized)) return;
      seen.add(normalized);
      concepts.push(normalized);
    }

    phraseConcepts.forEach((phrase) => addConcept(phrase, "phrase_concept"));
    safeSubjectLinks.forEach((link) => {
      (Array.isArray(link?.matched_terms) ? link.matched_terms : []).forEach((term) => addConcept(term, "matched_terms"));
    });

    safePayloadKeywords.forEach((word) => addConcept(word, "payload_keywords"));
    safeFallbackKeywords.forEach((word) => addConcept(word, "fallback_keywords"));

    const textType = String(payload?.textType || "").trim().toLowerCase();
    const hasClimateTransition = safeSubjectLinks.some((link) => {
      const id = String(link?.id || "").toLowerCase();
      const subjectId = String(link?.subject_id || "").toLowerCase();
      const title = String(link?.title || "").toLowerCase();
      return id.includes("climate_transition") || subjectId.includes("climate_transition") || title.includes("klima") || title.includes("omstilling");
    }) || /klima|omstilling|olje|fornybar|bærekraft/.test(cleanedSource);

    if (textType === "opinion_article" && hasClimateTransition) {
      const domainConcepts = [
        "omstilling","oljeavhengighet","bærekraft","naturhensyn","arealnøytralitet","fornybar energi","lokalsamfunn","sirkulærøkonomi","samiske rettigheter","naturens tålegrenser","grønn verdiskaping","grønne jobber"
      ];
      domainConcepts.forEach((concept) => {
        const normalized = normalizeAfterworkConcept(concept);
        const foundInMatchedTerms = safeSubjectLinks.some((link) => (Array.isArray(link?.matched_terms) ? link.matched_terms : []).some((term) => normalizeAfterworkConcept(term) === normalized));
        if (foundInMatchedTerms || cleanedSource.includes(normalized)) addConcept(concept, "domain_fallback");
      });
    }

    if (textType) addConcept(textType, "text_type");
    return concepts.slice(0, 16);
  }

  function makeAfterworkObject(payload, sourceText, options) {
    const source = String(sourceText || "").trim();
    const normalizedPayload = payload && typeof payload === "object" ? payload : {};
    const sourceTextHash = sourceHash(source);
    const safeSortItems = Array.isArray(normalizedPayload.sortItems) ? normalizedPayload.sortItems : [];
    const safeThoughts = normalizedPayload.thoughts && typeof normalizedPayload.thoughts === "object" ? normalizedPayload.thoughts : {};
    const safeList = Array.isArray(normalizedPayload.list) ? normalizedPayload.list : [];
    const safeInsights = Array.isArray(normalizedPayload.insightCards) ? normalizedPayload.insightCards : [];
    const safePath = Array.isArray(normalizedPayload.path) ? normalizedPayload.path : [];
    const safeSubjectMatches = Array.isArray(options?.subjectMatches) ? options.subjectMatches : (Array.isArray(normalizedPayload.subjectMatches) ? normalizedPayload.subjectMatches : []);
    const subjectLinks = normalizeSubjectLinks(safeSubjectMatches);
    const analysisSource = cleanArticleText(source);
    const keywords = takeKeywords(analysisSource, 8);
    const concepts = deriveConceptsFromAfterwork(normalizedPayload, keywords, subjectLinks, source);
    const extractedTheoryLinks = extractAcademicTheoryLinks(source);
    const theoryLinks = mergeTheoryLinks(normalizedPayload?.theoryLinks || normalizedPayload?.theoretical_links, extractedTheoryLinks, 5);
    const thinkers = normalizeSimpleStringList((normalizedPayload?.thinkers || []).concat(theoryLinks.map((item) => item.thinker).filter(Boolean)), 8);
    const theories = normalizeSimpleStringList((normalizedPayload?.theories || []).concat(theoryLinks.map((item) => item.theory).filter(Boolean)), 8);
    const structuralLabels = safeSortItems
      .map((item) => String(item?.label || "").trim())
      .filter(Boolean)
      .slice(0, 12);
    return {
      id: `afterwork_${Date.now()}_${shortHash(`${sourceTextHash}|${JSON.stringify(normalizedPayload)}`)}`,
      type: "aha_afterwork",
      source: "chat",
      textType: normalizedPayload.textType || detectTextType(source),
      createdAt: new Date().toISOString(),
      sourceTextHash,
      sourceTextPreview: source.replace(/\s+/g, " ").slice(0, 180),
      reflection: String(normalizedPayload.reflection || ""),
      sortItems: safeSortItems,
      daySummary: String(normalizedPayload.day || ""),
      thoughtSorting: {
        hovedspor: String(safeThoughts.hovedspor || ""),
        lose_tanker: String(safeThoughts.lose_tanker || ""),
        neste_steg: String(safeThoughts.neste_steg || "")
      },
      list: safeList,
      insights: safeInsights,
      learningPath: safePath,
      subjectLinks,
      keywords,
      concepts,
      structuralLabels,
      theoryLinks,
      thinkers,
      theories
    };
  }

  function saveAutoOutputAsAfterwork(payload, sourceText, options) {
    const source = String(sourceText || "").trim();
    if (!source) return { saved: false, reason: "missing_source_text", entry: null };
    const entry = makeAfterworkObject(payload, source, options);
    const entries = loadAfterworkEntries();
    const payloadSignature = shortHash(JSON.stringify({
      reflection: entry.reflection,
      sortItems: entry.sortItems,
      daySummary: entry.daySummary,
      thoughtSorting: entry.thoughtSorting,
      list: entry.list,
      insights: entry.insights,
      learningPath: entry.learningPath
    }));
    const exists = entries.some((item) => {
      const existingSignature = shortHash(JSON.stringify({
        reflection: item?.reflection || "",
        sortItems: Array.isArray(item?.sortItems) ? item.sortItems : [],
        daySummary: item?.daySummary || "",
        thoughtSorting: item?.thoughtSorting || {},
        list: Array.isArray(item?.list) ? item.list : [],
        insights: Array.isArray(item?.insights) ? item.insights : [],
        learningPath: Array.isArray(item?.learningPath) ? item.learningPath : []
      }));
      return String(item?.sourceTextHash || "") === entry.sourceTextHash && existingSignature === payloadSignature;
    });
    if (exists) return { saved: false, reason: "duplicate", entry: null };
    entries.push(entry);
    saveAfterworkEntries(entries);
    return { saved: true, reason: "saved", entry };
  }

  function buildAutoOutputs(userText, ahaReply) {
    const raw = String(userText || "").trim();
    const reply = String(ahaReply || "").trim();
    const textType = detectTextType(raw);
    const analysisText = cleanArticleText(raw);
    const sentences = toSentences(analysisText);
    const keywords = takeKeywords(analysisText, 5);
    const baseList = sentences.slice(0,6).map((item) => item.replace(/^[-•]\s*/, ""));
    let reflection = "Jeg ser et tydelig tema. Del gjerne litt mer for skarpere sortering.";
    let sortItems = (keywords.length ? keywords : ["retning","utfordring","handling"]).slice(0, 4).map((key, idx) => ({ label: key.charAt(0).toUpperCase() + key.slice(1), text: sentences[idx] || `Dette peker på et tema rundt ${key}.` }));
    let day = "Ikke nok dagsmateriale ennå.";
    let thoughts = { hovedspor: sentences[0] || "Trenger mer tekst for å finne hovedspor.", lose_tanker: sentences.slice(1,3).join(" ") || "Noen løse tanker vil dukke opp når du skriver mer.", neste_steg: "Velg ett tydelig spor og skriv én presis setning videre." };
    let list = baseList;
    let path = ["Forstå hva teksten egentlig handler om.", "Sorter materialet i 2–3 tydelige spor.", "Velg ett neste grep og skriv videre."];

    if (textType === "literary_diary") {
      const evidence = collectLiteraryDiaryEvidence(raw, sentences);
      const reflectionParts = ["Dette er en dagboktekst der fortelleren beveger seg mellom observasjon og selvforklaring."];
      if (evidence.hasPlaceScene) reflectionParts.push("Stedsscener gir teksten forankring.");
      if (evidence.hasSRelation) reflectionParts.push("Relasjonen til S samler lengsel og selvforsvar.");
      if (evidence.hasStrangers) reflectionParts.push("Møter med fremmede utvider teksten sosialt.");
      if (evidence.hasTravel && evidence.hasNomadism) reflectionParts.push("Reise- og nomademotivet åpner mot frihet og drift.");
      else if (evidence.hasTravel) reflectionParts.push("Reisemotivet åpner mot frihet og drift.");
      else if (evidence.hasNomadism) reflectionParts.push("Nomademotivet åpner mot frihet og drift.");
      if (evidence.hasWriterLife) reflectionParts.push("Forfatterlivet ligger som et selvbilde og en mulig retning.");
      if (evidence.hasShameGuilt) reflectionParts.push("Skyld og skam skaper indre friksjon.");
      if (evidence.matchedThemes.length <= 2) reflectionParts.push("Teksten bør analyseres som dagbokprosa, men trenger tydeligere motivspor for skarpere etterarbeid.");
      reflection = reflectionParts.join(" ");
      sortItems = buildLiteraryDiarySortItems(raw, sentences);
      const dayBits = [];
      if (evidence.hasPlaceScene) dayBits.push("sted");
      if (evidence.hasSRelation) dayBits.push("relasjon");
      if (evidence.hasPhone) dayBits.push("telefonkontakt");
      if (evidence.hasStrangers) dayBits.push("møtepunkt");
      if (evidence.hasTravel || evidence.hasNomadism) dayBits.push("drift mot frihet");
      if (evidence.hasShameGuilt || evidence.hasSocialUnease) dayBits.push("indre uro");
      day = dayBits.length ? `Dagbokfragmentet beveger seg gjennom ${dayBits.slice(0, 4).join(", ")}.` : "Dagbokfragmentet samler observasjoner og indre vurderinger i en assosiativ bevegelse.";

      let hovedspor = "Fortelleren forsøker å forstå seg selv gjennom dagbokformens bevegelser.";
      if (evidence.hasPlaceScene && evidence.hasInnerMonologue) hovedspor = "Fortelleren bruker ytre observasjoner til å nærme seg egen uro.";
      else if (evidence.hasSRelation) hovedspor = "Relasjonen til S fungerer som tekstens emosjonelle anker.";
      else if (evidence.hasTravel || evidence.hasNomadism || evidence.hasWriterLife) hovedspor = "Teksten søker mot frihet, bevegelse og et skrivende selvbilde.";
      const loose = [];
      if (evidence.hasPhone) loose.push("telefonkontakt");
      if (evidence.hasStrangers) loose.push("møter med fremmede");
      if (evidence.hasShameGuilt) loose.push("skyld/skam");
      if (evidence.hasSocialUnease) loose.push("sosial uro");
      if (evidence.hasWriterLife) loose.push("forfatterspor");
      const loseTanker = loose.length ? `Løse spor i teksten: ${loose.slice(0, 4).join(", ")}.` : "Løse spor finnes, men motivene er foreløpig svakt markert.";
      let nesteSteg = "Velg ett motiv og la de andre scenene speile det.";
      if (evidence.hasSRelation) nesteSteg = "Velg om relasjonen skal være tekstens hovedakse eller bare ett spor.";
      else if (evidence.hasTravel || evidence.hasNomadism) nesteSteg = "Velg om reisemotivet skal bære slutten.";
      else if (evidence.hasPlaceScene) nesteSteg = "Stram stedsscenene slik at de peker mot samme indre bevegelse.";
      thoughts = { hovedspor, lose_tanker: loseTanker, neste_steg: nesteSteg };

      const evidenceList = [];
      if (evidence.hasPlaceScene) evidenceList.push("Stedsscener åpner dagbokbevegelsen.");
      if (evidence.hasSRelation) evidenceList.push("Relasjonen til S skaper emosjonelt anker.");
      if (evidence.hasPhone) evidenceList.push("Telefonkontakt gir konflikt og nærhet på avstand.");
      if (evidence.hasStrangers) evidenceList.push("Møter med fremmede bryter teksten opp.");
      if (evidence.hasTravel) evidenceList.push("Reiseplaner åpner mot frihet og forflytning.");
      if (evidence.hasWriterLife) evidenceList.push("Forfatterliv brukes som selvbilde.");
      if (evidence.hasShameGuilt) evidenceList.push("Skyld/skam gir indre friksjon.");
      if (evidence.hasSocialUnease) evidenceList.push("Sosial uro preger fortellerens selvbilde.");
      if (evidenceList.length < 3) {
        evidenceList.push("Jeg-fortelleren samler observasjoner og vurderinger.");
        evidenceList.push("Teksten beveger seg assosiativt mer enn lineært.");
      }
      list = evidenceList.slice(0, 6);

      const motive = evidence.hasSRelation ? "relasjon" : evidence.hasTravel ? "reise" : evidence.hasPlaceScene ? "stedsscener" : evidence.hasInnerMonologue ? "indre monolog" : "observasjon";
      const structure = evidence.hasPlaceScene ? "sted" : evidence.hasSRelation ? "relasjon" : evidence.hasStrangers ? "møte" : evidence.hasInnerMonologue ? "indre monolog" : "vandring";
      const tighten = evidence.hasSRelation
        ? "Avklar om relasjonen skal være hovedakse eller sidebevegelse."
        : evidence.hasPlaceScene
          ? "La stedsscenene peke tydeligere mot samme indre uro."
          : evidence.hasTravel
            ? "La reisen fungere som avslutning eller kontrapunkt."
            : "Kutt forklaringer som gjentar samme selvforsvar.";
      path = [
        `Finn bærende motiv: ${motive}.`,
        `Velg struktur: ${structure}.`,
        `Stram teksten: ${tighten}`
      ];
    } else if (textType === "day_log") {
      reflection = `Dette leses som en dagslogg med fokus på ${keywords[0] || "hendelser"}, og et tydelig behov for å se mønster i dagen.`;
      day = `Kort dagsoppsummering: ${sentences.slice(0,2).join(" ") || "Flere hendelser gjennom dagen."} Viktigst nå: ${keywords[0] || "ett tydelig neste punkt"}.`;
      path = ["Oppsummer hendelsene kort.", "Finn ett mønster eller én følelse som gikk igjen.", "Velg én ting du tar med videre i morgen."];
    } else if (textType === "literary_fragment") {
      reflection = "Teksten drives av scene, motiv, sansning og rytme mer enn av dagboklogg. Konflikten ligger i spenningen mellom stemning og bevegelse.";
      day = "Ikke dagbokmateriale – ingen dagsoppsummering laget.";
    } else if (textType === "opinion_article") {
      const evidence = collectOpinionArticleEvidence(raw, sentences);
      const quality = buildOpinionArticleQualityAnalysis(raw, evidence, sentences);
      reflection = [
        sentence(`Teksten forsøker å ${lowerFirst(quality.textIntent)}`),
        sentence(`Den sentrale bevegelsen går fra ${lowerFirst(quality.centralMovement)}`),
        sentence(`Den retoriske styrken ligger i ${lowerFirst(quality.rhetoricalPower)}`),
        sentence(`Det som bør skjerpes, er ${lowerFirst(quality.weaknessPhrase)}`)
      ].filter(Boolean).join(" ");
      sortItems = [
        { label: "Hovedpåstand", text: quality.thesis },
        { label: "Motpart / konflikt", text: quality.conflict },
        { label: "Tekstens vendepunkt", text: quality.argumentLine },
        { label: "Belegg", text: quality.strengths[1] || quality.strengths[0] || "Teksten har flere belegg, men de bør prioriteres tydeligere." },
        { label: "Retorisk grep", text: quality.strengths[2] || "Teksten løfter konflikten med tydelige kontraster mellom dagens kurs og alternativ retning." },
        { label: "Politisk løsning", text: quality.policySolution || "Teksten antyder en løsning, men den bør formuleres tydeligere." },
        { label: "Svak overgang", text: quality.missingLinks[0] || "Overgangen mellom konflikt og tiltak må bli tydeligere for leseren." },
        { label: "Mulig sluttpoeng", text: quality.sharperEnding }
      ];
      day = "Ikke dagbokmateriale – ingen dagsoppsummering laget.";
      thoughts = {
        hovedspor: quality.thesis,
        lose_tanker: quality.weaknesses.slice(0, 3).join(" "),
        neste_steg: quality.editorialNextStep
      };
      list = [
        `Gjør hovedpåstanden kortere og tidligere: ${quality.thesis}`,
        `Spiss konfliktlinjen: ${quality.conflict}`,
        `Flytt vendepunktet frem: ${quality.suggestedStructure[1] || "fra kritikk til plan tidligere i teksten"}`,
        `Definer nøkkelbegrepene tydeligere: ${(quality.keyConcepts || []).slice(0, 3).join(", ")}.`,
        `Konkretiser belegg: ${quality.strengths[1] || "legg inn ett eksempel eller tall der argumentet nå er mest prinsipielt."}`,
        `Skjerp avslutningen: ${quality.sharperEnding}`
      ].slice(0, 6);
      path = quality.suggestedStructure.slice(0, 5);
    } else if (textType === "academic_article") {
      const theoryLinks = extractAcademicTheoryLinks(analysisText).slice(0, 5);
      const phraseConcepts = extractAcademicPhraseConcepts(analysisText).slice(0, 8);
      const hasSahelMali = /sahel|mali/i.test(analysisText);
      reflection = hasSahelMali
        ? "Teksten kritiserer en enkel knapphetsforklaring på konflikt i Sahel og viser at politiske, historiske og maktmessige forhold forklarer mer av konfliktbildet i Mali."
        : "Teksten drøfter konkurrerende forklaringsmodeller og argumenterer for en mer sammensatt, kontekstuell forståelse.";
      const hovedargument = "Hovedargumentet er at klima/miljø kan være bakgrunnsfaktorer, men at konfliktutvikling primært formes av politikk, historie, maktforhold og marginalisering.";
      const motargument = "Motargumentet er at knapphetsskolen overvurderer lineære årsakskjeder fra ressursknapphet til vold, og undervurderer institusjoner og aktørmakt.";
      const teoriKort = theoryLinks.length
        ? theoryLinks.map((item) => `${item.thinker}: ${item.theory}`).join("; ")
        : "Teksten setter miljøsikkerhet og politisk økologi opp mot hverandre.";
      const begreperKort = phraseConcepts.length ? phraseConcepts.join(", ") : "ressursknapphet, politisk økologi, miljødegradering";
      const sitatSetninger = sentences.filter((line) => /["“”«»]|\bifølge\b|\bhevder\b|\bviser til\b/i.test(line)).slice(0, 3);
      const pastander = sitatSetninger.length
        ? sitatSetninger.map((line) => `Påstand i teksten: ${short(line)}`)
        : ["Påstand i teksten: Konflikter i Sahel kan ikke forklares tilfredsstillende med klima alene."];
      sortItems = [
        { label: "Kort hovedinnsikt", text: reflection },
        { label: "Hovedargument", text: hovedargument },
        { label: "Motargument / kritikk", text: motargument },
        { label: "Teorikoblinger", text: teoriKort },
        { label: "Begreper", text: begreperKort },
        { label: "Påstander", text: pastander.join(" ") },
        { label: "Spenning i teksten", text: "Spenningen står mellom en lineær miljø-knapphetsforklaring og en politisk-økologisk forklaring som vektlegger makt og historisk kontekst." },
        { label: "Mulig videre analyse", text: "Undersøk hvordan lokale maktforhold, statlig politikk og sikkerhetsdynamikk samspiller med klima- og ressursstress i konkrete caser." }
      ];
      day = "Ikke dagbokmateriale – ingen dagsoppsummering laget.";
      thoughts = {
        hovedspor: hovedargument,
        lose_tanker: "Behold sitater som dokumentasjon, men løft syntesen i egne formuleringer.",
        neste_steg: "Velg én konfliktcase og test forklaringskraften i hver modell mot samme empiriske materiale."
      };
      list = [
        "Skille tydelig mellom empiri, teori og normativ vurdering.",
        "Vis hvilke antakelser som ligger i knapphetsskolen versus politisk økologi.",
        "Bruk sitater som belegg, ikke som ferdig innsikt.",
        "Knytt teori direkte til caser fra Sahel/Mali.",
        "Avslutt med hva analysen endrer i forståelsen av konfliktårsaker."
      ];
      path = [
        "Kartlegg hovedpåstand og motpåstand.",
        "Sorter belegg etter forklaringsmodell.",
        "Test modellene mot samme case.",
        "Vurder forklaringskraft og blinde soner.",
        "Formuler en syntetiserende konklusjon."
      ];
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
      const evidence = collectLiteraryDiaryEvidence(raw, sentences);
      if (evidence.hasPlaceScene && evidence.hasInnerMonologue) localInsights.push("Ytre steder brukes til å speile fortellerens indre bevegelse.");
      if (evidence.hasSRelation) localInsights.push("Relasjonen fungerer som et emosjonelt anker i dagbokbevegelsen.");
      if (evidence.hasStrangers) localInsights.push("Møter med fremmede gjør teksten sosialt urolig og uforutsigbar.");
      if (evidence.hasTravel && evidence.hasNomadism) localInsights.push("Reise og nomadisme brukes som bilder på frihet og ny identitet.");
      else if (evidence.hasTravel) localInsights.push("Reisemotivet brukes som bilde på frihet og ny retning.");
      else if (evidence.hasNomadism) localInsights.push("Nomadisme brukes som bilde på frihet og identitet i bevegelse.");
      if (evidence.hasWriterLife) localInsights.push("Forfatterlivet blir en måte å gi uro form og retning.");
      if (evidence.hasShameGuilt) localInsights.push("Skyld, skam og selvforsvar skaper tekstens indre friksjon.");
      if (!localInsights.length) localInsights.push("Dagbokformen bærer en assosiativ bevegelse som kan strammes med tydeligere motivspor.");
    } else if (textType === "opinion_article") {
      const evidence = collectOpinionArticleEvidence(raw, sentences);
      const quality = buildOpinionArticleQualityAnalysis(raw, evidence, sentences);
      localInsights.push(`Argumentets kjerne: ${quality.thesis}`);
      localInsights.push(`Retorisk styrke: ${quality.strengths[0] || "Teksten binder flere politiske felt inn i én omstillingsfortelling."}`);
      localInsights.push(`Svakhet/manglende bro: ${quality.missingLinks[0] || quality.weaknesses[0] || "Broen mellom kritikk og konkret gjennomføring er for svak."}`);
      localInsights.push(`Utviklingsmulighet: ${quality.editorialNextStep} ${quality.sharperEnding}`);
    } else if (textType === "academic_article") {
      const hovedargument = (sortItems.find((item) => String(item?.label || "").toLowerCase() === "hovedargument") || {}).text
        || "Klima og miljø er relevante bakgrunnsfaktorer, men konflikt forklares primært gjennom politiske, historiske og maktmessige forhold.";
      const motargument = (sortItems.find((item) => String(item?.label || "").toLowerCase().includes("motargument")) || {}).text
        || "Knapphetsskolens lineære årsakskjeder kritiseres for å underkommunisere institusjoner og aktørmakt.";
      localInsights.push(`Hovedinnsikt: ${reflection}`);
      localInsights.push(`Hovedargument: ${hovedargument}`);
      localInsights.push(`Motargument/kritikk: ${motargument}`);
      localInsights.push("Spenningen i teksten ligger mellom knapphetsskolen og politisk økologi.");
    } else {
      localInsights.push(`Mønster: ${keywords[0] || "temaet"} går igjen og bærer teksten.`);
      localInsights.push(reply ? `AHA-responsen peker videre på: ${toSentences(reply)[0] || reply}` : "Videre innsikt kan styrkes med mer konkret tekst.");
    }
    const overlap = currentInsights()
      .map((ins) => String(ins.summary || ins.title || ""))
      .filter((text) => keywords.some((k) => text.toLowerCase().includes(k)))
      .slice(-2);
    const maxInsightCards = textType === "opinion_article" || textType === "academic_article" ? 4 : 3;
    const insightCards = [...localInsights, ...overlap].slice(0, maxInsightCards);

    return { textType, reflection, sortItems, day, thoughts, list: list.slice(0, 6), insightCards, path: path.slice(0, 5) };
  }

  function detectOpinionDomain(evidence) {
    if (evidence?.hasClimateTransition && evidence?.hasOilFossil) return "climate_transition";
    if (evidence?.hasMediaPolicy || evidence?.hasVatOrTax || evidence?.hasPressFreedom) return "media_policy";
    if (evidence?.hasPoliticalCritique || evidence?.hasSocialDemocracy || evidence?.hasPowerDistribution) return "general_political";
    return "general_argument";
  }

  function buildOpinionArticleQualityAnalysis(raw, evidence, sentences) {
    const s = Array.isArray(sentences) ? sentences : [];
    const first = s[0] || "Teksten argumenterer for en tydelig politisk kursendring.";
    const domain = detectOpinionDomain(evidence);
    let textIntent = "klargjøre en politisk hovedpåstand og overbevise leseren om en tydeligere kurs.";
    let centralMovement = "kritikk av dagens linje til en mer forpliktende løsning.";
    let rhetoricalPower = "kontrasten mellom status quo og et mulig alternativ.";
    let thesis = first;
    let conflict = "Teksten setter dagens politiske kurs opp mot behovet for en mer forpliktende retning.";
    let argumentLine = "Argumentasjonen går fra problemforståelse til forslag om løsning.";
    let strengths = ["Teksten tydeliggjør en konfliktlinje som gir retning for argumentet.", "Flere partier peker mot en konkret samfunnskonsekvens.", "Kontraster brukes for å løfte hva som står på spill."];
    let weaknesses = ["Overgangen mellom kritikk og konkret gjennomføring blir tidvis for brå.", "Noen belegg er prinsipielle uten nok konkretisering.", "Avslutningen kan tydeligere samle hva leseren skal sitte igjen med."];
    let missingLinks = ["Leseren trenger en tydeligere bro mellom problembeskrivelse og prioriterte tiltak.", "Det bør synliggjøres hvem som faktisk får ansvar og effekt av tiltakene."];
    let sharperEnding = "Avslutt med én tydelig konsekvens: hva samfunnet taper hvis kursen ikke endres.";
    let keyConcepts = ["hovedpåstand", "konflikt", "belegg", "konsekvens"];
    let policySolution = "Teksten antyder en løsning, men den bør formuleres tydeligere.";
    let weaknessPhrase = "overgangen mellom problemforståelse og løsning";

    if (domain === "climate_transition") {
      textIntent = "svare på hva Norge skal omstilles fra og til";
      centralMovement = "kritikk av oljeavhengighet til forslag om fornybar energi, lokal verdiskaping og sirkulærøkonomi";
      rhetoricalPower = "at omstilling løftes fra teknologispråk til samfunnsspråk: natur, arbeid og beslutningsmakt";
      thesis = "Norge må omstilles fra fossil oljeavhengighet til et bærekraftig samfunn innenfor naturens tålegrenser.";
      conflict = "Teksten retter seg mot en politikk som lover grønn retning, men fortsatt binder ressurser til fossil logikk.";
      argumentLine = "Argumentasjonen går fra kritikk av dagens modell til en plan for energiomstilling, lokal makt og naturhensyn.";
      strengths = [
        "Teksten samler klima, natur, energi og maktspørsmål i én sammenhengende argumentasjon.",
        evidence.hasCircularEconomy ? "Sirkulærøkonomi kobles til arbeid og lokal verdiskaping på en konkret måte." : "Konflikten blir tydelig når teksten viser hvilke ressurser som bindes i dagens kurs.",
        "Kontrastene mellom dagens kurs og alternativ retning gir teksten retorisk driv."
      ];
      weaknesses = [
        "Overgangen mellom kritikk og konkret plan kan strammes slik at argumentrekken blir tydeligere.",
        evidence.hasIndigenousRights ? "Samiske rettigheter bør få en mer eksplisitt funksjon i hovedargumentet." : "Noen prinsipielle partier trenger et tydeligere eksempel.",
        "Avslutningen kan tydeliggjøre hva som faktisk står på spill ved å utsette omstillingen."
      ];
      missingLinks = [
        "Det trengs en klarere bro mellom kritikk av oljeavhengighet og hvilke grep som flytter investeringer og prioriteringer.",
        "Begrepet «omstilling» bør avgrenses: hva fases ned, hva bygges opp, og hvem får beslutningsmakt."
      ];
      sharperEnding = "Avslutt med hva Norge risikerer å tape økonomisk, økologisk og sosialt dersom omstillingen utsettes.";
      keyConcepts = ["omstilling", "oljeavhengighet", "naturhensyn", "lokal verdiskaping"];
      policySolution = "Teksten peker på en overgang fra fossil kapitalbinding til fornybar energi, lokal verdiskaping og sirkulærøkonomi.";
      weaknessPhrase = "overgangen mellom kritikk og konkret plan";
      if (evidence.hasCircularEconomy) keyConcepts.push("sirkulærøkonomi");
      if (evidence.hasIndigenousRights) keyConcepts.push("samiske rettigheter");
    } else if (domain === "media_policy") {
      textIntent = "vurdere hvordan mediepolitikk og avgiftsregler påvirker ytringsrom, journalistikk og redaktørstyrte medier.";
      centralMovement = "kritikk av dagens økonomiske rammer til forslag om mer treffsikre mediepolitiske virkemidler.";
      rhetoricalPower = "koblingen mellom demokratiske hensyn og konkrete økonomiske rammevilkår for redaktørstyrte medier.";
      thesis = evidence.hasVatOrTax ? "Moms- og avgiftsregler for medier må utformes slik at de styrker redaktørstyrt journalistikk og reelt ytringsrom." : first;
      conflict = "Teksten peker på spenningen mellom markedslogikk og behovet for mediepolitikk som sikrer redaksjonell bærekraft.";
      argumentLine = "Argumentasjonen går fra problemene i dagens ordninger til forslag som gir bedre økonomisk handlingsrom for journalistikk.";
      strengths = ["Teksten kobler ytringsfrihet til konkrete økonomiske virkemidler.", "Konflikten mellom kortsiktig lønnsomhet og langsiktig offentlighet blir tydelig.", "Resonnementet binder sammen politikk, økonomi og redaksjonelt ansvar."];
      weaknesses = ["Noen påstander trenger tydeligere dokumentasjon eller eksempel.", "Skillet mellom kritikk av ordningen og foreslått modell kan markeres skarpere.", "Avslutningen kan tydeligere formulere demokratisk konsekvens."];
      missingLinks = ["Det bør vises tydeligere hvordan foreslåtte virkemidler faktisk påvirker redaksjonell kapasitet.", "Argumentet trenger en klar prioritering mellom ulike mediepolitiske tiltak."];
      sharperEnding = "Avslutt med hva offentligheten mister når økonomiske rammer svekker redaktørstyrt journalistikk.";
      keyConcepts = ["mediepolitikk", "ytringsfrihet", "moms", "redaktørstyrte medier"];
      policySolution = "Teksten peker mot mediepolitiske rammer som styrker redaktørstyrt journalistikk og økonomisk handlingsrom.";
      weaknessPhrase = "broen mellom prinsipiell mediekritikk og konkret virkemiddel";
    } else if (domain === "general_political") {
      textIntent = "tolke en politisk konflikt og argumentere for en alternativ prioritering.";
      centralMovement = "diagnose av dagens politiske kurs til et mer forpliktende forslag om retning.";
      rhetoricalPower = "at teksten tydeliggjør hvem som vinner og taper på dagens prioriteringer.";
      keyConcepts = ["politisk konflikt", "prioritering", "belegg", "konsekvens"];
      policySolution = "Teksten peker mot en tydeligere politisk prioritering enn dagens kurs.";
      weaknessPhrase = "overgangen mellom problemforståelse og løsning";
    }
    const suggestedStructure = [
      "Spiss hovedpåstanden til én setning tidlig i teksten.",
      "Flytt den konkrete planen tidligere: hva vi går fra, hva vi går til, og hvem som får makt i overgangen.",
      "Bygg hvert hovedledd med ett konkret belegg (eksempel, tall eller konsekvens).",
      "Marker tydelig vendepunktet fra kritikk til løsning.",
      "Avslutt med en tydelig samfunnskonsekvens dersom kursen videreføres."
    ];
    const editorialNextStepByDomain = {
      climate_transition: "Stram overgangen mellom kritikk og konkret plan ved å vise hvilke grep som flytter investeringer, kraft og kompetanse.",
      media_policy: "Vis tydeligere hvordan foreslåtte virkemidler påvirker redaksjonell kapasitet og økonomisk handlingsrom.",
      general_political: "Bygg en klarere bro fra kritikk til forslag, med ett konkret belegg."
    };
    const editorialNextStep = editorialNextStepByDomain[domain] || (weaknesses[0] || "Stram overgangen mellom kritikk og konkret plan.");
    return { domain, textIntent, centralMovement, rhetoricalPower, thesis, conflict, argumentLine, strengths, weaknesses, weaknessPhrase, missingLinks, suggestedStructure, editorialNextStep, sharperEnding, keyConcepts, policySolution };
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
      </section>
      <div class="auto-output-actions">
        <button id="btn-save-afterwork" type="button">Lagre etterarbeid</button><p class="auto-output-save-status" id="auto-output-save-status"></p>
      </div>`;

    const saveButton = host.querySelector("#btn-save-afterwork");
    if (saveButton) {
      const sourceText = String(host.dataset.sourceText || "").trim();
      const statusEl = host.querySelector("#auto-output-save-status");
      if (!sourceText) {
        saveButton.disabled = true;
        if (statusEl) statusEl.textContent = "Kildetekst mangler. Analyser teksten på nytt for å kunne lagre etterarbeid.";
      }
      saveButton.addEventListener("click", () => {
        const result = saveAutoOutputAsAfterwork(payload, host.dataset.sourceText || "", {
          subjectMatches: payload?.subjectMatches
        });
        if (result.reason === "missing_source_text") {
          setStatusNote("Kan ikke lagre: kildetekst mangler. Send teksten på nytt.");
          if (statusEl) statusEl.textContent = "Kildetekst mangler. Analyser teksten på nytt.";
          return;
        }
        if (result.saved) {
          saveButton.textContent = "Lagret";
          saveButton.disabled = true;
        }
        if (statusEl) statusEl.textContent = result.saved ? "Etterarbeid lagret." : "Dette etterarbeidet er allerede lagret.";
        setStatusNote(result.saved ? "Etterarbeid lagret" : "Dette etterarbeidet er allerede lagret");
      });
    }
  }

  function renderAutoOutputs(userText, ahaReply, options = {}) {
    const payload = buildAutoOutputs(userText, ahaReply);
    payload.subjectMatches = Array.isArray(options.subjectMatches) ? options.subjectMatches : [];
    const sourceText = String(userText || "");
    localStorage.setItem(AUTO_OUTPUT_STORAGE_KEY, JSON.stringify({
      payload,
      sourceText,
      sourceTextHash: sourceHash(sourceText),
      sourceTextPreview: sourceText.replace(/\s+/g, " ").slice(0, 180),
      createdAt: new Date().toISOString()
    }));
    const host = document.getElementById("aha-auto-output");
    if (host) host.dataset.sourceText = sourceText;
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
    const payload = cache?.payload && typeof cache.payload === "object" ? cache.payload : cache;
    const sourceText = String(cache?.sourceText || "");
    const host = document.getElementById("aha-auto-output");
    if (host) host.dataset.sourceText = sourceText;
    renderAutoOutputPayload(payload);
  }

  function consumePendingChatPrompt() {
    const raw = localStorage.getItem(PENDING_CHAT_PROMPT_KEY);
    if (!raw) return;
    let payload = null;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    const prompt = String(payload?.prompt || "").trim();
    if (!prompt) return;
    const msg = document.getElementById("msg");
    if (!msg) return;
    if (String(msg.value || "").trim()) return;
    msg.value = prompt;
    msg.dispatchEvent(new Event("input", { bubbles: true }));
    msg.focus();
    localStorage.removeItem(PENDING_CHAT_PROMPT_KEY);
    setStatusNote("Klar til å bygge videre fra AHA Home.");
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
          const analysisText = cleanArticleText(text);
          const rawSubjectMatches = global.AHASubjectEngine?.matchText
            ? await global.AHASubjectEngine.matchText(analysisText, { source: "chat", textType: detectTextType(text) })
            : [];
          const subjectMatches = enrichSubjectMatchesForClimateConflict(analysisText, rawSubjectMatches);
          appendChat("aha", reply, { categoryChips: suggestCategoryChips(), subjectMatches });
          try { renderAutoOutputs(text, reply, { subjectMatches }); } catch (autoErr) { console.warn("Auto-output feilet", autoErr); }
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
          try { renderAutoOutputs(text, "", { subjectMatches: [] }); } catch (autoErr) { console.warn("Auto-output feilet", autoErr); }
        }
      });
    }

    document.getElementById("btn-insights")?.addEventListener("click", showInsights);
    document.getElementById("btn-status")?.addEventListener("click", showStatus);
    document.getElementById("btn-concepts")?.addEventListener("click", showConcepts);
    document.getElementById("btn-meta")?.addEventListener("click", showMeta);
    document.getElementById("btn-knowledge-map")?.addEventListener("click", showKnowledgeMap);
    document.getElementById("btn-saved-afterwork")?.addEventListener("click", showSavedAfterwork);
    document.getElementById("btn-export")?.addEventListener("click", () => {
      out(JSON.stringify({
        chamber: loadChamberFromStorage(),
        aha_afterwork_v1: loadAfterworkEntries()
      }, null, 2));
    });
    document.getElementById("btn-reset")?.addEventListener("click", reset);
    bindActionChips();

    bindPanelActionHandler();
    restoreAutoOutputFromStorage();
    consumePendingChatPrompt();

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
    const filteredLabels = filterConceptLabels(labels);
    return [...new Set(filteredLabels)].slice(0, 8);
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
