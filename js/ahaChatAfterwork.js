// ahaChatAfterwork.js
// Lokal lagring, visning og gjenbruk av AHA-etterarbeid.

(function (global) {
  "use strict";

  function create(deps = {}) {
    const {
      storageKey,
      sourceHash,
      escHtml,
      normalizeDisplayText,
      filterConceptLabels,
      canonicalizeDisplayConcept,
      renderAuxPanel,
      renderPanel,
      setStatusNote
    } = deps;

    function loadAfterworkEntries() {
      try {
        const raw = global.localStorage.getItem(storageKey);
        const parsed = raw ? JSON.parse(raw) : [];
        const list = Array.isArray(parsed) ? parsed : [];
        return list.map((item) => {
          const safe = item && typeof item === "object" ? item : {};
          const sourceText = String(safe.sourceText || "");
          const learningPath = Array.isArray(safe.learningPath) ? safe.learningPath : (Array.isArray(safe.learningPaths) ? safe.learningPaths : []);
          const sourceTextHash = String(safe.sourceTextHash || sourceHash(sourceText));
          return {
            ...safe,
            sourceText,
            sourceTextHash,
            sourceTextPreview: String(safe.sourceTextPreview || sourceText.replace(/\s+/g, " ").slice(0, 180)),
            learningPath,
            createdAt: safe.createdAt || new Date().toISOString()
          };
        });
      } catch {
        return [];
      }
    }

    function saveAfterworkEntries(entries) {
      global.localStorage.setItem(storageKey, JSON.stringify(Array.isArray(entries) ? entries : []));
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
      const rawConcepts = Array.isArray(safeEntry.concepts) && safeEntry.concepts.length
        ? safeEntry.concepts
        : (Array.isArray(safeEntry.keywords) ? safeEntry.keywords : []);
      const conceptPool = filterConceptLabels(rawConcepts.map(canonicalizeDisplayConcept)).slice(0, 3);
      const conceptLine = conceptPool.length
        ? conceptPool.map((item) => `<span class="insight-chip">${escHtml(item)}</span>`).join("")
        : '<span class="insight-chip">Ingen begreper</span>';
      const insightsCount = Array.isArray(safeEntry.insights) ? safeEntry.insights.length : 0;
      const pathCount = Array.isArray(safeEntry.learningPath) ? safeEntry.learningPath.length : 0;
      const daySummarySection = safeEntry.daySummary
        ? `<section class="saved-afterwork-section"><h4>Dagsoppsummering</h4><p>${escHtml(normalizeDisplayText(safeEntry.daySummary))}</p></section>`
        : "";

      return `<article class="saved-afterwork-card" data-afterwork-id="${id}">
        <div class="saved-afterwork-meta"><strong>${escHtml(createdAt)}</strong><span>${escHtml(textType)}</span></div>
        <p class="saved-afterwork-preview">${escHtml(normalizeDisplayText(preview))}</p>
        <div class="saved-afterwork-concepts">${conceptLine}</div>
        <p class="saved-afterwork-meta">Innsikter: ${escHtml(String(insightsCount))} · Læringssti-steg: ${escHtml(String(pathCount))}</p>
        ${renderAfterworkSubjectLinks(safeEntry.subjectLinks)}
        <div class="saved-afterwork-actions"><button type="button" data-action="open-afterwork" data-afterwork-id="${id}">Åpne</button><button type="button" data-action="build-from-afterwork" data-afterwork-id="${id}">Bygg videre</button><button type="button" data-action="link-afterwork-historygo" data-afterwork-id="${id}">Koble til History Go</button><button type="button" data-action="export-afterwork-json" data-afterwork-id="${id}">Eksport JSON</button><button type="button" data-action="delete-afterwork" data-afterwork-id="${id}">Slett</button></div>
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
        const html = '<div class="saved-afterwork-panel"><p>Ingen lagrede etterarbeid ennå. Kjør en analyse/sendt melding, og trykk «Lagre etterarbeid» nederst i AHA etterarbeid-panelet.</p></div>';
        renderAuxPanel("afterwork-panel", html);
        renderPanel(html);
        return;
      }
      const html = `<div class="saved-afterwork-panel"><div class="saved-afterwork-list">${entries.map(renderAfterworkEntry).join("")}</div></div>`;
      renderAuxPanel("afterwork-panel", html);
      renderPanel(html);
    }

    function buildAfterworkPrompt(entry) {
      const safeEntry = entry && typeof entry === "object" ? entry : {};
      const lines = ["Bygg videre på dette AHA-etterarbeidet."];
      const sourceTextPreview = String(safeEntry.sourceTextPreview || "").trim();
      if (sourceTextPreview) lines.push("", "Kilde:", sourceTextPreview);
      const reflection = String(safeEntry.reflection || "").trim();
      if (reflection) lines.push("", "Refleksjon:", reflection);

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
      if (concepts.length) lines.push("", "Begreper:", concepts.join(", "));
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
      const messageInput = global.document.getElementById("msg");
      if (!messageInput) return;
      messageInput.value = buildAfterworkPrompt(entry);
      messageInput.focus();
      messageInput.dispatchEvent(new global.Event("input", { bubbles: true }));
      setStatusNote("Etterarbeid lagt inn i skrivefeltet.");
    }

    function deleteAfterworkEntry(entryId) {
      const id = String(entryId || "").trim();
      if (!id) return;
      const entries = loadAfterworkEntries();
      saveAfterworkEntries(entries.filter((entry) => String(entry?.id || "") !== id));
      showSavedAfterwork();
      setStatusNote("Etterarbeid slettet.");
    }

    return {
      loadAfterworkEntries,
      saveAfterworkEntries,
      formatAfterworkDate,
      renderAfterworkEntry,
      showSavedAfterwork,
      buildAfterworkPrompt,
      buildFromAfterworkEntry,
      deleteAfterworkEntry
    };
  }

  function createAutoOutputAdapter(deps = {}) {
    const required = [
      "sourceHash", "shortHash", "resolveConceptTerm", "cleanTextForConceptExtraction",
      "extractAcademicPhraseConcepts", "normalizeAcademicAfterworkPayload", "detectTextType",
      "normalizeSubjectLinks", "takeKeywords", "extractAcademicTheoryLinks", "mergeTheoryLinks",
      "normalizeSimpleStringList", "getActiveAnalysisRun", "loadAfterworkEntries",
      "saveAfterworkEntries", "loadAutoOutputs"
    ];
    required.forEach((name) => {
      if (typeof deps[name] !== "function") throw new Error(`AHAChatAfterworkAutoAdapter mangler avhengighet: ${name}`);
    });

    function normalizeAfterworkConcept(term) {
      return deps.resolveConceptTerm(term).toLowerCase().replace(/[“”"'`´]/g, "").replace(/\s+/g, " ").trim();
    }

    function isGoodAfterworkConcept(term, options) {
      const normalized = normalizeAfterworkConcept(term);
      if (!normalized || normalized.length < 3) return false;
      const hasMultiWords = normalized.includes(" ");
      const source = String(options?.source || "generic");
      const blocked = new Set([
        "annonsørinnhold","annonse","logo","illustrasjon","les også","kjolevalg","kjole","kjoler","bryllupsgjesten","terrasse","plank","garanti","årets","populære","sikre","nydelige",
        "markussen","norge","omstilles","fortsetter","bygge","naturens","retning","retninger","bekostning","dette","tekst","sier","skal","gjøre","være","blir","kommer","spør","svarer"
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
      const cleanedSource = deps.cleanTextForConceptExtraction(sourceText || "").toLowerCase();
      const phraseConcepts = deps.extractAcademicPhraseConcepts(sourceText || "");

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
      const basePayload = payload && typeof payload === "object" ? payload : {};
      const normalizedPayload = deps.normalizeAcademicAfterworkPayload(basePayload, source, basePayload.textType || deps.detectTextType(source));
      const sourceTextHash = deps.sourceHash(source);
      const safeSortItems = Array.isArray(normalizedPayload.sortItems) ? normalizedPayload.sortItems : [];
      const safeThoughts = normalizedPayload.thoughts && typeof normalizedPayload.thoughts === "object" ? normalizedPayload.thoughts : {};
      const safeList = Array.isArray(normalizedPayload.list) ? normalizedPayload.list : [];
      const safeInsights = Array.isArray(normalizedPayload.insightCards) ? normalizedPayload.insightCards : [];
      const safePath = Array.isArray(normalizedPayload.path) ? normalizedPayload.path : [];
      const safeSubjectMatches = Array.isArray(options?.subjectMatches) ? options.subjectMatches : (Array.isArray(normalizedPayload.subjectMatches) ? normalizedPayload.subjectMatches : []);
      const subjectLinks = deps.normalizeSubjectLinks(safeSubjectMatches);
      const analysisSource = deps.cleanTextForConceptExtraction(source);
      const keywords = deps.takeKeywords(analysisSource, 8);
      const concepts = deriveConceptsFromAfterwork(normalizedPayload, keywords, subjectLinks, source);
      const extractedTheoryLinks = deps.extractAcademicTheoryLinks(source);
      const theoryLinks = deps.mergeTheoryLinks(normalizedPayload?.theoryLinks || normalizedPayload?.theoretical_links, extractedTheoryLinks, 5);
      const thinkers = deps.normalizeSimpleStringList((normalizedPayload?.thinkers || []).concat(theoryLinks.map((item) => item.thinker).filter(Boolean)), 8);
      const theories = deps.normalizeSimpleStringList((normalizedPayload?.theories || []).concat(theoryLinks.map((item) => item.theory).filter(Boolean)), 8);
      const structuralLabels = safeSortItems.map((item) => String(item?.label || "").trim()).filter(Boolean).slice(0, 12);
      const activeRun = deps.getActiveAnalysisRun();
      return {
        id: `afterwork_${Date.now()}_${deps.shortHash(`${sourceTextHash}|${JSON.stringify(normalizedPayload)}`)}`,
        analysisId: options?.analysisId || activeRun?.analysisId || "",
        analysisRunId: options?.analysisRunId || options?.runId || activeRun?.analysisRunId || activeRun?.runId || "",
        runId: options?.runId || options?.analysisRunId || activeRun?.runId || activeRun?.analysisRunId || "",
        conversationId: options?.conversationId || options?.sessionId || activeRun?.conversationId || activeRun?.sessionId || deps.defaultConversationId,
        turnId: options?.turnId || activeRun?.turnId || "",
        sourceId: options?.sourceId || activeRun?.sourceId || (sourceTextHash ? `source_${sourceTextHash}` : ""),
        sourceKind: options?.sourceKind || activeRun?.sourceKind || "chat",
        topicLabel: options?.topicLabel || activeRun?.topicLabel || deps.takeKeywords(source, 4).join(" · "),
        sessionId: options?.sessionId || options?.conversationId || activeRun?.sessionId || activeRun?.conversationId || deps.defaultConversationId,
        type: "aha_afterwork",
        source: "chat",
        textType: normalizedPayload.textType || deps.detectTextType(source),
        createdAt: new Date().toISOString(),
        sourceText,
        sourceTextHash,
        sourceHash: sourceTextHash,
        sourceFingerprint: sourceTextHash,
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
      const entries = deps.loadAfterworkEntries();
      const payloadSignature = deps.shortHash(JSON.stringify({
        reflection: entry.reflection,
        sortItems: entry.sortItems,
        daySummary: entry.daySummary,
        thoughtSorting: entry.thoughtSorting,
        list: entry.list,
        insights: entry.insights,
        learningPath: entry.learningPath
      }));
      const exists = entries.some((item) => {
        const existingSignature = deps.shortHash(JSON.stringify({
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
      deps.saveAfterworkEntries(entries);
      return { saved: true, reason: "saved", entry };
    }

    function ensureAfterworkForLatestAnalysis(sourceText, options = {}) {
      const source = String(sourceText || "").trim();
      if (!source) return { saved: false, reason: "missing_source_text", entry: null };
      const auto = deps.loadAutoOutputs();
      const payload = auto?.payload && typeof auto.payload === "object" ? auto.payload : null;
      if (!payload) return { saved: false, reason: "missing_payload", entry: null };
      const autoSourceHash = String(auto?.sourceTextHash || deps.sourceHash(auto?.sourceText || source));
      const currentHash = deps.sourceHash(source);
      if (!autoSourceHash || autoSourceHash !== currentHash) return { saved: false, reason: "hash_mismatch", entry: null };
      const activeRun = deps.getActiveAnalysisRun();
      const expectedRunId = String(options?.analysisRunId || options?.runId || activeRun?.analysisRunId || activeRun?.runId || "");
      const gotRunId = String(auto?.analysisRunId || auto?.runId || payload?.analysisRunId || payload?.runId || "");
      if (expectedRunId && gotRunId && expectedRunId !== gotRunId) {
        global.console.warn(`Skipped stale AHA analysis payload: expected ${expectedRunId}, got ${gotRunId}.`);
        return { saved: false, reason: "run_mismatch", entry: null };
      }
      const result = saveAutoOutputAsAfterwork(payload, source, options);
      if (result.reason === "duplicate") {
        const entries = deps.loadAfterworkEntries();
        const match = entries.find((entry) => String(entry?.sourceTextHash || "") === currentHash);
        if (match) {
          match.lastReferencedAt = new Date().toISOString();
          deps.saveAfterworkEntries(entries);
        }
      }
      return result;
    }

    return {
      normalizeAfterworkConcept,
      isGoodAfterworkConcept,
      deriveConceptsFromAfterwork,
      makeAfterworkObject,
      saveAutoOutputAsAfterwork,
      ensureAfterworkForLatestAnalysis
    };
  }

  const publicApi = Object.freeze({ create, createAutoOutputAdapter });
  global.AHAChatAfterwork = publicApi;
  global.AHAModuleApi?.register?.("chat.afterwork", publicApi, { version: 1, legacyGlobal: "AHAChatAfterwork", exports: ["create", "createAutoOutputAdapter"] });
})(typeof window !== "undefined" ? window : globalThis);
