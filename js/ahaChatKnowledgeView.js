// ahaChatKnowledgeView.js
// Kunnskapskart, chamber-status og Meta-profil for AHA Chat.

(function (global) {
  "use strict";

  function create(deps = {}) {
    const {
      subjectId: SUBJECT_ID,
      loadChamberFromStorage,
      loadAutoOutputs,
      loadAfterworkEntries,
      getThemeId,
      out,
      currentInsights,
      filterConceptLabels,
      canonicalizeDisplayConcept,
      normalizeConceptKey,
      getCanonicalConceptLabel,
      getCanonicalConceptKey,
      isBlockedStandaloneConcept,
      escHtml,
      extractAcademicPhraseConcepts,
      extractAcademicTheoryLinks,
      prioritizeVisibleConceptEdges,
      isGenericDisplayConcept,
      normalizeAfterworkConcept,
      applyPhraseConceptDisplayPreference,
      detectPublicAdministrationReformSignal,
      readLatestAcademicContext,
      detectAutoAnalysisDomain,
      renderAuxPanel,
      renderPanel
    } = deps;

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

    const visibleConcepts = filterConceptLabels([...concepts].map(canonicalizeDisplayConcept));
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

    const weakVariants = new Set();
    if (nodeStrength.has("ressursknapphet") || nodeStrength.has("knapphetsskolen")) weakVariants.add("knapphet");
    if (nodeStrength.has("politisk økologi")) weakVariants.add("økologi");

    const topConcepts = Array.from(nodeStrength.entries())
      .filter(([concept]) => !weakVariants.has(concept))
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

    const displayedPairs = new Set();
    const rows = networkEdges
      .map((edge) => {
        const from = normalizeConceptKey(edge.from);
        const to = normalizeConceptKey(edge.to);
        if (!from || !to || from === to) return "";
        if (weakVariants.has(from) || weakVariants.has(to)) return "";
        const pairKey = [from, to].sort((a, b) => a.localeCompare(b)).join("::");
        if (displayedPairs.has(pairKey)) return "";
        displayedPairs.add(pairKey);
        return `<li class="concept-network-item"><span class="concept-node-badge">${escHtml(displayConceptLabel(from))}</span><span class="concept-link-line">↔</span><span class="concept-node-badge">${escHtml(displayConceptLabel(to))}</span></li>`;
      })
      .filter(Boolean)
      .slice(0, 8)
      .join("");

    if (!rows) {
      return "<p class='knowledge-sub'>For få koblinger til å bygge nettverk ennå.</p>";
    }

    return `<div class="concept-network" aria-label="Begrepsnettverk">
      <ul class="concept-network-list">${rows}</ul>
    </div>`;
  }



  function displayConceptLabel(value) {
    return getCanonicalConceptLabel(value);
  }

  function buildCanonicalConceptPair(source, target) {
    const sourceLabel = getCanonicalConceptLabel(source);
    const targetLabel = getCanonicalConceptLabel(target);
    const sourceKey = getCanonicalConceptKey(sourceLabel);
    const targetKey = getCanonicalConceptKey(targetLabel);
    if (!sourceKey || !targetKey) return null;
    if (sourceKey === targetKey) return null;
    if (isNearPhraseOverlap(sourceKey, targetKey)) return null;
    if (isGenericDisplayConcept(sourceLabel) || isGenericDisplayConcept(targetLabel)) return null;
    if (isBlockedStandaloneConcept(sourceLabel) || isBlockedStandaloneConcept(targetLabel)) return null;
    return { sourceLabel, targetLabel, sourceKey, targetKey };
  }

  function isNearPhraseOverlap(sourceKey, targetKey) {
    const a = normalizeAfterworkConcept(sourceKey);
    const b = normalizeAfterworkConcept(targetKey);
    if (!a || !b || a === b) return false;
    const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
    if (!longer.includes(shorter)) return false;
    const shorterTokens = shorter.split(" ").filter(Boolean);
    const longerTokens = longer.split(" ").filter(Boolean);
    if (!shorterTokens.length || longerTokens.length <= shorterTokens.length) return false;
    const shorterSet = new Set(shorterTokens);
    const overlapCount = longerTokens.filter((token) => shorterSet.has(token)).length;
    return overlapCount >= shorterTokens.length;
  }

  function filterGenericConceptItems(items, keyGetter) {
    return applyPhraseConceptDisplayPreference((Array.isArray(items) ? items : []).filter((item) => {
      const label = getCanonicalConceptLabel(keyGetter(item));
      return label && !isGenericDisplayConcept(label) && !isBlockedStandaloneConcept(label);
    }), keyGetter);
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

  function canonicalizeConceptPairTitle(value) {
    const raw = String(value || "");
    const parts = raw.split(/\s*(?:↔|<->|—|-|vs\.?)\s*/i).map((part) => getCanonicalConceptLabel(part)).filter(Boolean);
    if (parts.length >= 2) return `${parts[0]} ↔ ${parts[1]}`;
    return getCanonicalConceptLabel(raw) || raw;
  }
  function derivePublicAdministrationTensions(context) {
    const sourceText = String(context?.text || "");
    const signal = detectPublicAdministrationReformSignal(sourceText);
    if (!signal.strong) return [];
    const txt = sourceText.toLowerCase();
    const has = (arr) => arr.some((term) => txt.includes(term));
    const out = [];
    const add = (title, strength) => out.push({ title, strength });
    if (has(["omstillingskostnader", "omstillingsprosess"]) && has(["strukturelle utfordringer", "grunnleggende strukturelle"])) add("omstillingskostnad ↔ strukturell utfordring", 2.1);
    if (has(["statlig styring", "statlige mål"]) && has(["kommune", "kommunale mål", "partnerskap"])) add("statlig styring ↔ kommunalt partnerskap", 2.0);
    if (has(["standardisering", "byråkrati", "statlig styring"]) && has(["lokal organisering", "lokalkontor", "individuell oppfølging"])) add("standardisering ↔ lokal tilpasning", 1.9);
    if (has(["organisasjonsreform"]) && has(["innholdsreform"])) add("organisasjonsreform ↔ innholdsreform", 2.2);
    if (has(["flere i arbeid", "måloppnåelse"]) && has(["negative effekter", "mindre sannsynlighet for arbeid", "ugunstig retning"])) add("mål om flere i arbeid ↔ negative reformeffekter", 1.8);
    if (has(["statlig styring", "direktorat", "reformdesign"]) && has(["lokal organisering", "nav-kontor", "iverksetting"])) add("sentralt reformdesign ↔ lokal implementering", 1.8);
    if (has(["arbeidsrettet oppfølging", "oppfølgingsarbeid"]) && has(["ytelsessaksbehandling", "arbeidsavklaringspenger", "inntektssikring"])) add("arbeidsrettet oppfølging ↔ ytelsessaksbehandling", 2.0);
    return out.slice(0, 5);
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
    const topEdges = (() => {
      const deduped = new Map();
      prioritizeVisibleConceptEdges(edgePool, theoryLinks, conceptEdgeContext).forEach((edge) => {
        const pair = buildCanonicalConceptPair(edge?.from, edge?.to);
        if (!pair) return;
        const pairKey = [pair.sourceKey, pair.targetKey].sort((a, b) => a.localeCompare(b)).join("::");
        const prev = deduped.get(pairKey);
        const weight = Number(edge?.weight || 0);
        if (!prev || weight > Number(prev?.weight || 0)) deduped.set(pairKey, { ...edge, from: pair.sourceLabel, to: pair.targetLabel, weight });
      });
      return Array.from(deduped.values())
        .sort((a, b) => Number(b?.weight || 0) - Number(a?.weight || 0))
        .slice(0, 3);
    })();

    const visibleThemes14d = aggregateVisibleConceptCounts(recurringThemes?.["14d"]?.top_concepts || [], "key", "count");
    const visibleThemes30d = aggregateVisibleConceptCounts(recurringThemes?.["30d"]?.top_concepts || [], "key", "count");
    const themes14d = filterGenericConceptItems(visibleThemes14d, (item) => item?.key).slice(0, 3);
    const themes30d = filterGenericConceptItems(visibleThemes30d, (item) => item?.key).slice(0, 3);
    const latestAcademicContext = readLatestAcademicContext();
    const activePayload = latestAcademicContext?.payload && typeof latestAcademicContext.payload === "object"
      ? latestAcademicContext.payload
      : {};
    const activeCanonical = activePayload?.canonicalAnalysis && typeof activePayload.canonicalAnalysis === "object"
      ? activePayload.canonicalAnalysis
      : {};
    const activeAhaSer = activePayload?.ahaSer && typeof activePayload.ahaSer === "object"
      ? activePayload.ahaSer
      : {};
    const activeTheme = String(activeCanonical.theme || activeAhaSer.tema || "").trim();
    const activeTension = String(activeCanonical.mainTension || activeAhaSer.hovedspenning || "").trim();
    const activeInsight = String(activeCanonical.keyInsight || activeAhaSer.viktigsteInnsikt || "").trim();
    const activeFields = (Array.isArray(activeCanonical.fieldConnections)
      ? activeCanonical.fieldConnections
      : Array.isArray(activeAhaSer.fagkoblinger) ? activeAhaSer.fagkoblinger : [])
      .map((item) => String(item || "").trim()).filter(Boolean).slice(0, 4);
    const activeNextStep = String(activeAhaSer.nesteSteg || (Array.isArray(activeCanonical.suggestedActions) ? activeCanonical.suggestedActions[0] : "") || "").trim();
    const latestContextSource = String(latestAcademicContext?.sourceText || "").toLowerCase();
    const institutionalMediaSource = isInstitutionalMediaHistorySource(latestContextSource, latestAcademicContext?.payload || {});
    const theoryAllowedForInstitutionalMedia = !institutionalMediaSource || sourceMentionsTheoryForInstitutionalHistory(latestContextSource);
    const visibleTheoryLinks = theoryAllowedForInstitutionalMedia ? theoryLinks : [];
    const topTheoryPeople = theoryAllowedForInstitutionalMedia
      ? aggregateVisibleConceptCounts(collectTheoryPeople(safeChamber, recurringThemes?.["30d"]?.top_theories, 8), "key", "count").slice(0, 4)
      : [];
    const profileTensions = profile?.tensions || {};
    const sourceHasGreenTransition = /(fossil|fornybar|omstilling|grønn|gronn|klima|bærekraft|baerekraft)/i.test(latestContextSource);
    const sourceHasCenterPeriphery = /(sentralmakt|lokalsamfunn|kommune|distrikt|sentrum|periferi)/i.test(latestContextSource);
    const shouldSuppressTransitionPairs = latestContextSource && !sourceHasGreenTransition;
    const shouldSuppressCenterPeripheryPairs = latestContextSource && !sourceHasCenterPeriphery;
    const isSuppressedHistoricalPair = (sourceLabel, targetLabel) => {
      const pairText = `${sourceLabel} ${targetLabel}`.toLowerCase();
      if (shouldSuppressTransitionPairs && /(fossil|fornybar|omstilling|grønn|gronn)/i.test(pairText)) return true;
      if (shouldSuppressCenterPeripheryPairs && /(sentralmakt|lokalsamfunn)/i.test(pairText)) return true;
      return false;
    };
    const conceptPairTensions = (profileTensions.concept_pair_tensions || [])
      .slice()
      .sort((a, b) => (Number(b?.strength) || 0) - (Number(a?.strength) || 0))
      .slice(0, 5)
      .map((item) => {
        const pair = buildCanonicalConceptPair(item?.source, item?.target);
        if (!pair) return null;
        if (isSuppressedHistoricalPair(pair.sourceLabel, pair.targetLabel)) return null;
        return { title: `${pair.sourceLabel} ↔ ${pair.targetLabel}`, strength: item?.strength || 0 };
      })
      .filter(Boolean);
    const paradoxTensions = (profileTensions.paradox_pairs || [])
      .slice(0, 5)
      .map((item) => ({
        title: (item?.shared_concepts || []).slice(0, 2).join(" ↔ ") || "Paradoks",
        strength: (item?.shared_concepts || []).length || 0
      }));
    const conceptScoreTensions = (profileTensions.concept_tensions || [])
      .filter((item) => tensionOverlapsFocus(item, focusConcepts))
      .slice(0, 5)
      .map((item) => ({ title: canonicalizeConceptPairTitle(item?.key || "Ukjent"), strength: item?.combined || 0 }));
    const fallbackTensions = tensions
      .filter((item) => tensionOverlapsFocus(item, focusConcepts))
      .slice(0, 5)
      .map((item) => ({ ...item, title: canonicalizeConceptPairTitle(item?.title || item?.key || "") }));
    const visibleTensions = conceptPairTensions.length
      ? conceptPairTensions
      : paradoxTensions.length
        ? paradoxTensions
        : conceptScoreTensions.length
          ? conceptScoreTensions
          : fallbackTensions;
    const derivedPublicAdminTensions = derivePublicAdministrationTensions(conceptEdgeContext);
    const mergedTensions = [...derivedPublicAdminTensions, ...visibleTensions]
      .map((item) => ({ ...item, title: canonicalizeConceptPairTitle(item?.title || item?.key || "") }))
      .filter((item) => !(institutionalMediaSource && shouldSuppressInstitutionalPair(item?.title || "", latestContextSource)))
      .filter((item, index, arr) => arr.findIndex((other) => String(other?.title || "").toLowerCase() === String(item?.title || "").toLowerCase()) === index)
      .slice(0, 5);

    const totalInsights = Array.isArray(safeChamber?.insights) ? safeChamber.insights.length : 0;
    const lowData = totalInsights > 0 && totalInsights < 12;
    const lowDataBanner = lowData ? `<p class="knowledge-sub"><strong>Tidlig mønsterindikasjon</strong><br>Datagrunnlag: lite (${totalInsights} innsikter)<br>Sikkerhet: lav/middels</p>` : "";
    const edgeWarning = lowData && topEdges.length ? `<p class="knowledge-sub">Sterk kobling, men lite datagrunnlag. Forekomst: ${totalInsights} tekster/innsikter. Sikkerhet: lav/middels.</p>` : "";
    return `<section class="knowledge-map-block">
      <h3>Kunnskapskart for hele chamberet</h3>
      ${activeTheme || activeInsight ? `<article class="knowledge-card knowledge-card-active">
        <h4>Aktiv tekst · dette ser AHA nå</h4>
        ${activeTheme ? `<p class="knowledge-sub"><strong>Tema:</strong> ${escHtml(activeTheme)}</p>` : ""}
        ${activeTension ? `<p class="knowledge-sub"><strong>Spenning:</strong> ${escHtml(activeTension)}</p>` : ""}
        ${activeInsight ? `<p class="knowledge-sub"><strong>Innsikt:</strong> ${escHtml(activeInsight)}</p>` : ""}
        ${activeFields.length ? `<p class="knowledge-sub"><strong>Koblinger:</strong> ${activeFields.map(escHtml).join(" ↔ ")}</p>` : ""}
        ${activeNextStep ? `<p class="knowledge-sub"><strong>Neste steg:</strong> ${escHtml(activeNextStep)}</p>` : ""}
        <div class="aha-analysis-artifact-actions" aria-label="Bruk den aktive analysen">
          <button type="button" data-analysis-artifact="mindmap">Lagre som tankekart</button>
          <button type="button" data-analysis-artifact="path">Lagre som sti</button>
          <a href="mindmap.html">Åpne tankekart</a>
          <a href="paths.html">Åpne stier</a>
        </div>
        <div class="aha-analysis-quality-actions" aria-label="Vurder den aktive analysen">
          <span>Var dette treffende?</span>
          <button type="button" data-analysis-quality="useful">Nyttig</button>
          <button type="button" data-analysis-quality="too_generic">For generelt</button>
          <button type="button" data-analysis-quality="misinterpreted">Feil tolket</button>
          <button type="button" data-analysis-quality="missing_evidence">Mangler belegg</button>
        </div>
        <p class="aha-analysis-artifact-status" data-analysis-artifact-status aria-live="polite"></p>
      </article>` : ""}
      <p class="knowledge-sub"><strong>Historiske chamber-mønstre</strong> (holdes adskilt fra aktiv tekst).</p>
      ${lowDataBanner}
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
          ${edgeWarning}
          <h5 class="knowledge-mini-title">Begrepsnettverk</h5>
          ${renderConceptNetwork(conceptGraph, theoryLinks, conceptEdgeContext)}
        </article>
        <article class="knowledge-card">
          <h4>Teorikoblinger</h4>
          ${visibleTheoryLinks.length ? `<ul>${visibleTheoryLinks.map((link) => `<li><strong>${escHtml(link.name)}</strong> · ${escHtml(link.score.toFixed(2))}${link.relation ? ` · ${escHtml(link.relation)}` : ""}</li>`).join("")}</ul>` : "<p class='knowledge-sub'>Ingen teoretiske koblinger å score ennå.</p>"}
        </article>
        <article class="knowledge-card">
          <h4>Spenninger</h4>
          ${mergedTensions.length ? `<ul>${mergedTensions.map((item) => `<li><strong>${escHtml(String(item?.title || "Ukjent"))}</strong> · styrke ${escHtml(String(item?.strength || 0))}</li>`).join("")}</ul>` : "<p class='knowledge-sub'>Ingen spenninger koblet til de nyeste temaene ennå.</p>"}
        </article>
      </div>
    </section>`;
  }

  function chamberHasKnowledgeMapData(chamber) {
    return Boolean(chamber && Array.isArray(chamber.insights) && chamber.insights.length);
  }

  function activeAnalysisHasKnowledgeMapData() {
    try {
      const context = readLatestAcademicContext();
      const payload = context?.payload && typeof context.payload === "object" ? context.payload : {};
      return Boolean(payload?.canonicalAnalysis?.theme || payload?.canonicalAnalysis?.keyInsight || payload?.ahaSer?.tema || payload?.ahaSer?.viktigsteInnsikt);
    } catch {
      return false;
    }
  }

  function aggregateVisibleConceptCounts(items, keyField = "key", countField = "count") {
    const totals = new Map();
    (Array.isArray(items) ? items : []).forEach((item) => {
      const raw = String(item?.[keyField] || "").trim();
      if (!raw) return;
      const label = getCanonicalConceptLabel(raw);
      const key = getCanonicalConceptKey(label);
      if (!label || !key || isGenericDisplayConcept(label) || isBlockedStandaloneConcept(label)) return;
      const prev = totals.get(key) || { ...item, [keyField]: label, [countField]: 0 };
      prev[countField] += Number(item?.[countField] || 0);
      totals.set(key, prev);
    });
    return Array.from(totals.values()).sort((a, b) => Number(b?.[countField] || 0) - Number(a?.[countField] || 0));
  }

  function isInstitutionalMediaHistorySource(text, payload = null) {
    const sourceText = String(text || "");
    const inferredPayload = payload && typeof payload === "object" ? payload : (readLatestAcademicContext()?.payload || {});
    return detectAutoAnalysisDomain(sourceText, inferredPayload) === "institutional_media_history";
  }

  function sourceMentionsTheoryForInstitutionalHistory(sourceText) {
    const txt = String(sourceText || "");
    return /\bsennett\b|offentlighetsteori|public sphere/i.test(txt);
  }

  function shouldSuppressInstitutionalPair(title, sourceText) {
    const normalizedTitle = normalizeConceptKey(String(title || ""));
    const src = String(sourceText || "").toLowerCase();
    const genericPairs = [
      ["politikk", "vitenskap"],
      ["policy", "momentum"],
      ["policy-momentum", "forskningsgrunnlag"],
      ["fossil økonomi", "fornybar økonomi"],
      ["sentralmakt", "lokalsamfunn"],
      ["frihet", "kontroll"],
      ["trygghet", "risiko"],
      ["fellesskap", "eierskap"]
    ];
    return genericPairs.some(([left, right]) => {
      if (!(normalizedTitle.includes(normalizeConceptKey(left)) && normalizedTitle.includes(normalizeConceptKey(right)))) return false;
      return !(src.includes(left) && src.includes(right));
    });
  }

  function collectInstitutionalTextNearTensions(latestAcademicContext) {
    const payload = latestAcademicContext?.payload && typeof latestAcademicContext.payload === "object"
      ? latestAcademicContext.payload
      : {};
    const ahaSer = payload?.ahaSer && typeof payload.ahaSer === "object" ? payload.ahaSer : {};
    const sortItems = Array.isArray(payload?.sortItems) ? payload.sortItems : [];
    const sourceText = String(latestAcademicContext?.sourceText || "").toLowerCase();
    const matchesSource = (title) => {
      const pair = String(title || "").split(/↔|<->|—| vs\.? /i).map((part) => part.trim()).filter(Boolean);
      if (pair.length < 2) return false;
      return sourceText.includes(pair[0].toLowerCase()) && sourceText.includes(pair[1].toLowerCase());
    };
    const items = [];
    const hovedspenning = String(ahaSer?.hovedspenning || "").trim().replace(/[.。]\s*$/, "");
    if (hovedspenning) items.push(hovedspenning);
    const konfliktlinjerRaw = String(
      sortItems.find((item) => normalizeConceptKey(item?.label || "").includes("konfliktlinjer"))?.text || ""
    ).trim();
    if (konfliktlinjerRaw) {
      konfliktlinjerRaw.split(/[;\n]+/).map((part) => part.trim()).filter(Boolean).forEach((part) => items.push(part.replace(/[.。]\s*$/, "")));
    }
    return items
      .map((item) => canonicalizeConceptPairTitle(item))
      .filter((item) => item.includes("↔"))
      .filter((item) => !shouldSuppressInstitutionalPair(item, sourceText) || matchesSource(item))
      .filter((item, idx, arr) => arr.findIndex((other) => other.toLowerCase() === item.toLowerCase()) === idx);
  }

  function renderMetaProfile(profile, chamber) {
    if (!profile || typeof profile !== "object") return "";

    const recent = profile.temporal?.recent_focus || {};
    const tensions = profile.tensions || {};
    const recs = profile.recommendations || {};
    const totalInsights = Array.isArray(profile.insights) ? profile.insights.length : 0;
    const window = recent.window_days ? ` (siste ${recent.window_days} dager)` : "";

    const recentConcepts = filterGenericConceptItems(aggregateVisibleConceptCounts(recent.concepts || [], "key", "count"), (item) => item?.key).slice(0, 6).map((c) =>
      `${escHtml(displayConceptLabel(c.key))} <span class="meta-count">×${c.count}</span>`
    );
    const emerging = filterGenericConceptItems(aggregateVisibleConceptCounts(recent.emerging || [], "key", "count"), (item) => item?.key).slice(0, 5).map((c) =>
      `${escHtml(displayConceptLabel(c.key))} <span class="meta-count">×${c.count}</span>`
    );
    const fading = filterGenericConceptItems(aggregateVisibleConceptCounts(recent.fading || [], "key", "prev_count"), (item) => item?.key).slice(0, 5).map((c) =>
      `${escHtml(displayConceptLabel(c.key))} <span class="meta-count">tidligere ×${c.prev_count}</span>`
    );
    const latestAcademicContext = readLatestAcademicContext();
    const latestContextSource = String(latestAcademicContext?.sourceText || "").toLowerCase();
    const institutionalMediaSource = isInstitutionalMediaHistorySource(latestContextSource, latestAcademicContext?.payload || {});
    const sourceHasGreenTransition = /(fossil|fornybar|omstilling|grønn|gronn|klima|bærekraft|baerekraft)/i.test(latestContextSource);
    const sourceHasCenterPeriphery = /(sentralmakt|lokalsamfunn|kommune|distrikt|sentrum|periferi)/i.test(latestContextSource);
    const shouldSuppressTransitionPairs = latestContextSource && !sourceHasGreenTransition;
    const shouldSuppressCenterPeripheryPairs = latestContextSource && !sourceHasCenterPeriphery;
    const isSuppressedHistoricalPair = (sourceLabel, targetLabel) => {
      const pairText = `${sourceLabel} ${targetLabel}`.toLowerCase();
      if (shouldSuppressTransitionPairs && /(fossil|fornybar|omstilling|grønn|gronn)/i.test(pairText)) return true;
      if (shouldSuppressCenterPeripheryPairs && /(sentralmakt|lokalsamfunn)/i.test(pairText)) return true;
      return false;
    };

    const conceptPairTensions = (() => {
      const deduped = new Map();
      (tensions.concept_pair_tensions || []).forEach((t) => {
        const pair = buildCanonicalConceptPair(t?.source, t?.target);
        if (!pair) return;
        const pairKey = [pair.sourceKey, pair.targetKey].sort((a, b) => a.localeCompare(b)).join("::");
        const strength = Number(t?.strength || 0);
        const prev = deduped.get(pairKey);
        if (!prev || strength > Number(prev?.strength || 0)) deduped.set(pairKey, { pair, strength });
      });
      return Array.from(deduped.values())
        .sort((a, b) => Number(b.strength) - Number(a.strength))
        .slice(0, 5)
        .filter(({ pair }) => !isSuppressedHistoricalPair(pair.sourceLabel, pair.targetLabel))
        .filter(({ pair }) => !(institutionalMediaSource && shouldSuppressInstitutionalPair(`${pair.sourceLabel} ↔ ${pair.targetLabel}`, latestContextSource)))
        .map(({ pair, strength }) => `${escHtml(pair.sourceLabel)} ↔ ${escHtml(pair.targetLabel)} <span class="meta-count">styrke ${escHtml(String(strength))}</span>`);
    })();
    const conceptTensions = (tensions.concept_tensions || []).slice(0, 5).map((t) => {
      const key = displayConceptLabel(t?.key || "");
      if (!key || isGenericDisplayConcept(key)) return "";
      return `${escHtml(key)} <span class="meta-count">spenning ${Number(t.combined).toFixed(2)}</span>`;
    }).filter(Boolean);
    const paradoxes = (tensions.paradox_pairs || []).slice(0, 5).map((p) => {
      const shared = (p.shared_concepts || []).slice(0, 3).map(escHtml).join(", ");
      const themeText = p.theme_id ? ` i <em>${escHtml(p.theme_id)}</em>` : "";
      return `${shared || "(begreper)"}${themeText}`;
    });
    const unstick = (recs.unstick_prompts || [])
      .filter((u) => !/\b(th_default|default|unknown|null|undefined)\b/i.test(String(u?.concept || u?.prompt || "")))
      .slice(0, 4).map((u) => escHtml(u.prompt || ""));
    const resurface = (recs.resurface_insights || []).slice(0, 4).map((r) =>
      `${escHtml((r.summary || "").slice(0, 160))} <span class="meta-count">${escHtml((r.shared_concepts || []).map((concept) => displayConceptLabel(concept)).join(", "))}</span>`
    );
    const bridging = (() => {
      const deduped = new Map();
      (recs.bridging_pairs || []).forEach((b) => {
        const pair = buildCanonicalConceptPair(b?.source, b?.target);
        if (!pair) return;
        const pairKey = [pair.sourceKey, pair.targetKey].sort((a, b) => a.localeCompare(b)).join("::");
        const npmi = Number(b?.npmi || 0);
        const prev = deduped.get(pairKey);
        if (!prev || npmi > Number(prev?.npmi || 0)) deduped.set(pairKey, { pair, npmi });
      });
      return Array.from(deduped.values())
        .sort((a, b) => b.npmi - a.npmi)
        .slice(0, 4)
        .map(({ pair, npmi }) => `${escHtml(pair.sourceLabel)} ↔ ${escHtml(pair.targetLabel)} <span class="meta-count">npmi ${npmi.toFixed(2)}</span>`);
    })();
    const topKnownConcepts = new Set((recent.concepts || []).map((c) => getCanonicalConceptKey(c?.key)).filter(Boolean));
    const underexplored = filterGenericConceptItems(aggregateVisibleConceptCounts(recs.underexplored_concepts || [], "key", "count"), (item) => item?.key)
      .map((u) => ({ ...u, key: getCanonicalConceptLabel(u?.key) }))
      .filter((u) => !topKnownConcepts.has(getCanonicalConceptKey(u?.key)))
      .slice(0, 5).map((u) =>
      `${escHtml(displayConceptLabel(u.key))} <span class="meta-count">×${u.count} · ${escHtml(u.reason || "")}</span>`
    );
    const knowledgeMapTensions = (() => {
      const kmTensions = global.InsightsEngine?.detectTensions ? (global.InsightsEngine.detectTensions(chamber) || []) : [];
      return (kmTensions || []).map((item) => {
        const title = String(item?.title || item?.key || "");
        const parts = title.split(/↔|<->|—| vs\.? /i).map((part) => part.trim()).filter(Boolean);
        if (parts.length < 2) return null;
        const pair = buildCanonicalConceptPair(parts[0], parts[1]);
        if (!pair) return null;
        return `${escHtml(pair.sourceLabel)} ↔ ${escHtml(pair.targetLabel)} <span class="meta-count">styrke ${escHtml(String(item?.strength || item?.combined || 0))}</span>`;
      }).filter(Boolean);
    })();
    const derivedPublicAdminTensions = derivePublicAdministrationTensions(buildConceptEdgeContext(chamber || {}, buildDedupedTheoryLinks(chamber || {}, 5)))
      .map((item) => {
        const parts = String(item?.title || "").split(/↔|<->|—| vs\.? /i).map((part) => part.trim()).filter(Boolean);
        if (parts.length < 2) return null;
        const pair = buildCanonicalConceptPair(parts[0], parts[1]);
        if (!pair) return null;
        return `${escHtml(pair.sourceLabel)} ↔ ${escHtml(pair.targetLabel)} <span class="meta-count">styrke ${escHtml(String(item?.strength || 0))}</span>`;
      })
      .filter(Boolean);
    const institutionalTextNearTensions = institutionalMediaSource ? collectInstitutionalTextNearTensions(latestAcademicContext) : [];
    const tensionSectionItems = institutionalMediaSource
      ? (institutionalTextNearTensions.length
        ? institutionalTextNearTensions.slice(0, 3).map((title) => escHtml(title))
        : ["Ingen spenninger koblet til de nyeste temaene ennå."])
      : conceptPairTensions.length
      ? conceptPairTensions.slice(0, 3)
      : (derivedPublicAdminTensions.length
        ? derivedPublicAdminTensions.slice(0, 3)
        : (knowledgeMapTensions.length
          ? knowledgeMapTensions.slice(0, 3)
          : (conceptTensions.length ? conceptTensions.slice(0, 3) : ["Ingen tydelig todelt spenning ennå."])));

    const sections = [
      renderMetaSection(`Det du tenker mest på${window}`, recentConcepts),
      renderMetaSection("Nye temaer som dukker opp", emerging),
      renderMetaSection("Tankegods som har stilnet", fading),
      renderMetaSection("Spenninger jeg ser", tensionSectionItems),
      renderMetaSection("Paradokser i materialet", paradoxes),
      renderMetaSection("Spørsmål som kan løsne fastlåsthet", unstick),
      renderMetaSection("Refleksjoner verdt å hente frem", resurface),
      renderMetaSection("Koblinger verdt å tenke videre på", bridging),
      renderMetaSection("Nye begreper som trenger flere koblinger", underexplored)
    ].filter(Boolean).join("");

    const knowledgeMap = renderKnowledgeMapSection(chamber, profile);

    const lowData = totalInsights > 0 && totalInsights < 12;
    const lowDataBanner = lowData
      ? `<p class="meta-sub"><strong>Tidlig mønsterindikasjon</strong><br>Datagrunnlag: lite (${totalInsights} innsikter)<br>Sikkerhet: lav/middels</p>`
      : "";

    if (!sections) {
      return `<div class="meta-profile">
        <h3>Hva AHA ser i hele materialet ditt</h3>
        ${lowDataBanner}
        <p class="meta-empty">AHA har ennå ikke nok å gå på. Skriv mer i chat eller importer fra History Go.</p>
        ${knowledgeMap}
      </div>`;
    }

    return `<div class="meta-profile">
      <h3>Hva AHA ser i hele materialet ditt</h3>
      ${lowDataBanner}
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
    const html = renderMetaProfile(profile, chamber);
    renderAuxPanel("meta-profile-panel", html);
    renderPanel(html);
    out("");
  }

  function showKnowledgeMap() {
    const chamber = loadChamberFromStorage();
    const hasData = chamberHasKnowledgeMapData(chamber) || activeAnalysisHasKnowledgeMapData();
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


    return Object.freeze({
      normalizeConceptKey,
      getCanonicalConceptLabel,
      isBlockedStandaloneConcept,
      showStatus,
      showConcepts,
      renderKnowledgeMapSection,
      renderMetaProfile,
      showMeta,
      showKnowledgeMap
    });
  }

  const publicApi = Object.freeze({ create });
  global.AHAChatKnowledgeView = publicApi;
  global.AHAModuleApi?.register?.("chat.knowledgeView", publicApi, { version: 1, legacyGlobal: "AHAChatKnowledgeView", exports: ["create"] });
})(typeof window !== "undefined" ? window : globalThis);
