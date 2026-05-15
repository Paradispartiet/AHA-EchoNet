// metaInsightsEngine.js
// ─────────────────────────────────────────────
// AHA Meta InsightsEngine – leser data fra InsightsEngine
// og bygger et meta-bilde av brukeren (på tvers av temaer)
// ─────────────────────────────────────────────

(function (global) {
  "use strict";

  const IE =
    global.InsightsEngine ||
    (typeof require === "function" ? require("./insightsChamber.js") : null);

  if (!IE) {
    console.warn(
      "MetaInsightsEngine: Fant ikke InsightsEngine. Pass på at insightsChamber.js lastes før metaInsightsEngine.js."
    );
  }

  function listThemesForSubject(chamber, subjectId) {
    const themes = new Set();
    const insights = IE?.getActiveInsights ? IE.getActiveInsights(chamber) : (chamber?.insights || []);

    for (const ins of insights) {
      if (ins.subject_id === subjectId && ins.theme_id) {
        themes.add(ins.theme_id);
      }
    }

    return Array.from(themes);
  }

  function computeInsightLifecycle(insight, now = new Date()) {
    const first = new Date(insight.first_seen || insight.created_at || now);
    const last = new Date(insight.last_updated || insight.first_seen || insight.created_at || now);

    const ageDays = (now - first) / (1000 * 60 * 60 * 24);
    const recentDays = (now - last) / (1000 * 60 * 60 * 24);
    const evidence = insight.strength?.evidence_count || 0;

    let status = "ny";
    if (evidence >= 2 && ageDays > 1) status = "voksende";
    if (evidence >= 4 && ageDays > 7) status = "moden";
    if (status === "moden" && recentDays > 14) status = "integrasjon";
    return status;
  }

  function enrichInsightsWithLifecycle(chamber, subjectId) {
    const insights = IE?.getActiveInsights ? IE.getActiveInsights(chamber) : (chamber?.insights || []);
    const now = new Date();

    return insights
      .filter((ins) => ins.subject_id === subjectId)
      .map((ins) => ({ ...ins, lifecycle: computeInsightLifecycle(ins, now) }));
  }

  function computeGlobalSemanticProfile(topicProfiles) {
    if (!topicProfiles.length) {
      return {
        avg_saturation: 0,
        modality: { krav: 0, mulighet: 0, hindring: 0, nøytral: 0 },
        valence: { negativ: 0, positiv: 0, blandet: 0, nøytral: 0 },
        phases: { utforskning: 0, mønster: 0, press: 0, fastlåst: 0, integrasjon: 0 },
        pressure_index: 0,
        negativity_index: 0,
        stuck_topics: 0,
        integration_topics: 0
      };
    }

    let sumSaturation = 0;
    const modalityCounts = { krav: 0, mulighet: 0, hindring: 0, nøytral: 0 };
    const valenceCounts = { negativ: 0, positiv: 0, blandet: 0, nøytral: 0 };
    const phaseCounts = { utforskning: 0, mønster: 0, press: 0, fastlåst: 0, integrasjon: 0 };

    for (const t of topicProfiles) {
      const stats = t.stats || {};
      const semCounts = t.semCounts || {};
      sumSaturation += stats.insight_saturation || 0;

      for (const key in semCounts.modality || {}) {
        modalityCounts[key] = (modalityCounts[key] || 0) + semCounts.modality[key];
      }
      for (const key in semCounts.valence || {}) {
        valenceCounts[key] = (valenceCounts[key] || 0) + semCounts.valence[key];
      }

      const phase = stats.user_phase || "utforskning";
      if (phaseCounts[phase] !== undefined) phaseCounts[phase] += 1;
    }

    const avgSaturation = sumSaturation / topicProfiles.length;
    const pressureIndex =
      (modalityCounts.krav + modalityCounts.hindring) /
      Math.max(1, modalityCounts.mulighet + modalityCounts.nøytral);
    const negativityIndex =
      valenceCounts.negativ /
      Math.max(1, valenceCounts.positiv + valenceCounts.blandet + valenceCounts.nøytral);

    return {
      avg_saturation: avgSaturation,
      modality: modalityCounts,
      valence: valenceCounts,
      phases: phaseCounts,
      pressure_index: pressureIndex,
      negativity_index: negativityIndex,
      stuck_topics: phaseCounts.fastlåst || 0,
      integration_topics: phaseCounts.integrasjon || 0
    };
  }

  function detectCrossTopicPatterns(topicProfiles, globalProfile) {
    const patterns = [];

    if ((globalProfile.pressure_index || 0) > 1.2) {
      const pressThemes = topicProfiles
        .filter((t) => t.stats?.user_phase === "press" || t.stats?.user_phase === "fastlåst")
        .map((t) => t.theme_id);
      if (pressThemes.length >= 2) {
        patterns.push({
          id: "cross_pressure",
          type: "global_pattern",
          description: "Sterkt press-/må-/burde-/hindringsmønster i flere tema.",
          themes: pressThemes
        });
      }
    }

    if ((globalProfile.pressure_index || 0) < 0.8 && (globalProfile.negativity_index || 0) < 0.7) {
      const exploratoryThemes = topicProfiles
        .filter((t) => t.stats?.user_phase === "utforskning" || t.stats?.user_phase === "integrasjon")
        .map((t) => t.theme_id);
      if (exploratoryThemes.length >= 2) {
        patterns.push({
          id: "cross_exploration",
          type: "global_pattern",
          description: "Utforskende/åpent mønster på tvers av flere tema.",
          themes: exploratoryThemes
        });
      }
    }

    const stuckClusters = topicProfiles
      .filter((t) => t.stats?.user_phase === "fastlåst")
      .map((t) => t.theme_id);

    if (stuckClusters.length >= 2) {
      patterns.push({
        id: "stuck_cluster",
        type: "cluster",
        description: "Flere tema er i fastlåst fase samtidig.",
        themes: stuckClusters
      });
    }

    return patterns;
  }

  function buildConceptIndex(enrichedInsights) {
    const index = new Map();

    (enrichedInsights || []).forEach((ins) => {
      const themeId = ins.theme_id || "ukjent";
      (ins.concepts || []).forEach((c) => {
        if (!c) return;
        const key = String(c.key || c.label || c).trim();
        if (!key) return;

        let entry = index.get(key);
        if (!entry) {
          entry = { key, total_count: 0, themes: new Set(), examples: [] };
          index.set(key, entry);
        }

        entry.total_count += c.count || 1;
        entry.themes.add(themeId);
        if (Array.isArray(c.examples)) {
          c.examples.forEach((ex) => {
            if (ex && entry.examples.length < 5 && !entry.examples.includes(ex)) {
              entry.examples.push(ex);
            }
          });
        }
      });
    });

    return Array.from(index.values())
      .map((entry) => ({
        key: entry.key,
        total_count: entry.total_count,
        theme_count: entry.themes.size,
        themes: Array.from(entry.themes),
        examples: entry.examples
      }))
      .sort((a, b) => b.total_count - a.total_count);
  }

  function posFilterConcepts(conceptIndex) {
    const commonStop = ["og", "eller", "men", "for", "til", "fra", "som", "på", "i", "av", "at", "en", "et", "den", "det", "de"];
    const nominalSuffixes = ["het", "else", "skap", "sjon", "asjon", "ering", "ologi", "logi", "dom", "ning", "isme", "itet"];

    return (conceptIndex || [])
      .filter((c) => {
        const key = String(c?.key || "").trim().toLowerCase();
        if (key.length <= 3) return false;
        const parts = key.split(/\s+/).filter(Boolean);
        if (parts.length > 1 && parts.length <= 6) return true;
        if (nominalSuffixes.some((suffix) => key.endsWith(suffix))) return true;
        return parts.length === 1 && key.length >= 4 && !commonStop.includes(key);
      })
      .sort((a, b) => (b.total_count || b.count || 0) - (a.total_count || a.count || 0));
  }

  function extractMultiwordConcepts(conceptIndex, options = {}) {
    const minWords = options.minWords || 2;
    const maxWords = options.maxWords || 4;
    const badStarters = ["og", "eller", "men", "for", "som", "at"];

    return (conceptIndex || []).filter((c) => {
      const raw = String(c?.key || "").trim();
      if (!raw) return false;
      const parts = raw.split(/\s+/).filter(Boolean);
      if (parts.length < minWords || parts.length > maxWords) return false;
      return !badStarters.includes(parts[0].toLowerCase());
    });
  }

  function buildConceptIndexForTheme(chamber, subjectId, themeId) {
    const enriched = enrichInsightsWithLifecycle(chamber, subjectId);
    const allConcepts = buildConceptIndex(enriched);
    return allConcepts.filter((c) => Array.isArray(c.themes) && c.themes.includes(themeId));
  }

  // Hardkodet fallback. Den lastes inn ved oppstart og blir overskrevet
  // av theoryClustersLoader så snart theoryClusters.json er hentet.
  // Holder den minimal (kun de fem kjerneklyngene) for å unngå at vi
  // har data både her og i JSON-filen som driver fra hverandre.
  let _theoryClusters = [
    {
      id: "marx",
      label: "Marx / kritisk politisk økonomi",
      family: "kritisk",
      disciplines: ["sosiologi", "historie"],
      weight: 1.2,
      keywords: ["klasse", "kapitalisme", "utbytting", "ideologi"]
    },
    {
      id: "weber",
      label: "Weber / handling og rasjonalisering",
      family: "fortolkende",
      disciplines: ["sosiologi"],
      weight: 1.0,
      keywords: ["rasjonalisering", "byråkrati", "legitimitet", "makt"]
    },
    {
      id: "durkheim",
      label: "Durkheim / sosial integrasjon",
      family: "strukturfunksjonell",
      disciplines: ["sosiologi"],
      weight: 1.0,
      keywords: ["solidaritet", "anomi", "kollektiv bevissthet"]
    },
    {
      id: "foucault",
      label: "Foucault / makt, diskurs, styringsregimer",
      family: "poststrukturalistisk",
      disciplines: ["sosiologi", "filosofi", "historie"],
      weight: 1.3,
      keywords: ["diskurs", "makt", "normalisering", "disiplinering"]
    },
    {
      id: "bourdieu",
      label: "Bourdieu / felt, habitus, kapital",
      family: "praksisteori",
      disciplines: ["sosiologi"],
      weight: 1.3,
      keywords: ["felt", "habitus", "symbolsk vold", "kapital", "doxa"]
    }
  ];

  function setTheoryClusters(clusters) {
    if (!Array.isArray(clusters) || !clusters.length) return false;
    _theoryClusters = clusters;
    return true;
  }

  function getTheoryClusters() {
    return _theoryClusters.slice();
  }

  // Fuzzy match mellom et søkeord (fra teori-JSON) og et konsept-key
  // (fra brukerens insights). Treffer både eksakt, substring i begge
  // retninger, og en delt prefix på ≥ 5 tegn (slik at "kapitalisme"
  // også fanges av søkeordet "kapital", og omvendt). Returnerer en
  // objekt med hint om hvordan match-en skjedde, slik at vi kan
  // forklare scoringen.
  function fuzzyKeywordMatch(keyword, concept) {
    if (!keyword || !concept) return null;
    const kw = String(keyword).toLowerCase().trim();
    const co = String(concept).toLowerCase().trim();
    if (!kw || !co) return null;

    if (kw === co) return { type: "exact", strength: 1.0 };
    if (co.includes(kw) && kw.length >= 4) return { type: "concept_contains_keyword", strength: 0.9 };
    if (kw.includes(co) && co.length >= 5) return { type: "keyword_contains_concept", strength: 0.85 };

    // Fellesprefix-match. Kun aktuelt for enkeltord.
    if (kw.indexOf(" ") === -1 && co.indexOf(" ") === -1) {
      const minLen = 5;
      let i = 0;
      while (i < kw.length && i < co.length && kw[i] === co[i]) i++;
      if (i >= minLen) {
        const ratio = i / Math.max(kw.length, co.length);
        if (ratio >= 0.6) return { type: "shared_prefix", strength: round3(0.5 + 0.4 * ratio) };
      }
    }
    return null;
  }

  function buildAcademicProfileFromConcepts(conceptIndex) {
    const clusterDefs = _theoryClusters || [];
    const clusters = clusterDefs.map((cluster) => ({
      id: cluster.id,
      label: cluster.label,
      family: cluster.family || null,
      disciplines: cluster.disciplines || [],
      thinkers: cluster.thinkers || [],
      score: 0,
      hits: []
    }));

    let totalConcepts = 0;

    (conceptIndex || []).forEach((c) => {
      const key = String(c.key || "").toLowerCase();
      const freq = c.total_count || c.count || 1;
      if (!key) return;
      totalConcepts += freq;

      clusterDefs.forEach((cluster, idx) => {
        let bestMatch = null;
        for (const kw of cluster.keywords || []) {
          const m = fuzzyKeywordMatch(kw, key);
          if (m && (!bestMatch || m.strength > bestMatch.strength)) {
            bestMatch = { keyword: kw, ...m };
            if (bestMatch.strength >= 1) break;
          }
        }
        if (!bestMatch) return;
        clusters[idx].score += freq * (cluster.weight || 1) * bestMatch.strength;
        const existing = clusters[idx].hits.find((h) => h.concept === key);
        if (existing) {
          existing.weight += freq * bestMatch.strength;
        } else if (clusters[idx].hits.length < 12) {
          clusters[idx].hits.push({
            concept: key,
            keyword: bestMatch.keyword,
            match_type: bestMatch.type,
            weight: round3(freq * bestMatch.strength)
          });
        }
      });
    });

    clusters.forEach((c) => {
      c.score = round3(c.score);
      c.hits.sort((a, b) => b.weight - a.weight);
    });

    const maxScore = clusters.reduce((max, cluster) => Math.max(max, cluster.score), 0);
    const normalizedClusters = clusters
      .map((cluster) => ({ ...cluster, relative: maxScore > 0 ? round3(cluster.score / maxScore) : 0 }))
      .sort((a, b) => b.score - a.score);

    const disciplineMap = {};
    normalizedClusters.forEach((cluster) => {
      (cluster.disciplines || []).forEach((discipline) => {
        disciplineMap[discipline] = (disciplineMap[discipline] || 0) + cluster.score;
      });
    });

    const disciplineList = Object.keys(disciplineMap).map((id) => ({ id, score: round3(disciplineMap[id]) }));
    const maxDisc = disciplineList.reduce((max, discipline) => Math.max(max, discipline.score), 0);
    const disciplines = disciplineList
      .map((discipline) => ({ ...discipline, relative: maxDisc > 0 ? round3(discipline.score / maxDisc) : 0 }))
      .sort((a, b) => b.score - a.score);

    return { total_concepts: totalConcepts, clusters: normalizedClusters, disciplines };
  }

  function buildAcademicProfile(enrichedInsights) {
    return buildAcademicProfileFromConcepts(buildConceptIndex(enrichedInsights || []));
  }

  function buildSemioticProfile(enrichedInsights) {
    const summary = {
      total_insights: 0,
      body_count: 0,
      space_count: 0,
      tech_count: 0,
      heart_markers: 0,
      star_markers: 0,
      arrow_markers: 0,
      exclamation_markers: 0,
      emoji_count: 0
    };

    for (const ins of enrichedInsights || []) {
      if (!ins?.semiotic) continue;
      summary.total_insights += 1;
      const { domains = {}, markers = {}, emojis = [] } = ins.semiotic;
      if (domains.body) summary.body_count += 1;
      if (domains.space) summary.space_count += 1;
      if (domains.tech) summary.tech_count += 1;
      if (markers.heart) summary.heart_markers += 1;
      if (markers.stars) summary.star_markers += 1;
      if (markers.arrow) summary.arrow_markers += 1;
      if (markers.exclamation) summary.exclamation_markers += 1;
      summary.emoji_count += (emojis || []).length;
    }

    const total = summary.total_insights || 1;
    summary.body_ratio = summary.body_count / total;
    summary.space_ratio = summary.space_count / total;
    summary.tech_ratio = summary.tech_count / total;
    summary.emoji_per_insight = summary.emoji_count / total;
    return summary;
  }

  function round3(n) {
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 1000) / 1000;
  }

  function isoDay(value) {
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return null;
    return dt.toISOString().slice(0, 10);
  }

  function uniqueConceptKeys(concepts) {
    const set = new Set();
    (concepts || []).forEach((c) => {
      const key = String(c?.key || c?.label || "").trim().toLowerCase();
      if (key.length > 2) set.add(key);
    });
    return Array.from(set).sort();
  }

  // ── Korpus-bevisst lemmatisering ───────────────────────
  // Norsk har bøyning som gjør at "klasse" og "klassen" eller
  // "diskurs" og "diskursen" blir to forskjellige konsepter i
  // ekstraktoren. Vi kollapser dem ved å se etter en kortere variant
  // som faktisk forekommer i korpuset – det er tryggere enn blind
  // stemming, fordi vi bare slår sammen ord brukeren faktisk har sagt.
  function tryLemma(key, frequency, _depth) {
    if (!key || key.length < 5) return key;
    const depth = _depth || 0;
    if (depth > 4) return key;

    // Trinn 1: utvetydige suffikser kan vi alltid kollapse, og deretter
    // forsøke neste runde rekursivt – "klassens" → "klasse" → "klasse".
    if (key.length >= 7 && key.endsWith("ets")) return tryLemma(key.slice(0, -1), frequency, depth + 1);
    if (key.length >= 6 && key.endsWith("ens")) return tryLemma(key.slice(0, -2), frequency, depth + 1);
    if (key.length >= 6 && key.endsWith("ene")) return tryLemma(key.slice(0, -2), frequency, depth + 1);
    if (key.length >= 6 && key.endsWith("ane")) return tryLemma(key.slice(0, -2), frequency, depth + 1);

    // Trinn 2: tvetydige suffikser. Lag kandidater og velg den som
    // faktisk finnes i korpuset; prioritér høyere frekvens, deretter
    // lengre (= mer spesifikk) lemma. "klasse" vinner over "klass".
    const candidates = [];
    if (key.length >= 6 && key.endsWith("et")) candidates.push(key.slice(0, -2));
    if (key.length >= 6 && key.endsWith("en")) {
      candidates.push(key.slice(0, -1)); // drop "n"
      candidates.push(key.slice(0, -2)); // drop "en"
    }
    if (key.length >= 7 && key.endsWith("er")) {
      candidates.push(key.slice(0, -1)); // drop "r" (jenter → jente)
      candidates.push(key.slice(0, -2)); // drop "er" (muligheter → mulighet)
    }
    if (key.length >= 6 && key.endsWith("a")) candidates.push(key.slice(0, -1));

    const baseFreq = frequency.get(key) || 0;
    const evaluated = candidates
      .filter((c) => c.length >= 4)
      .map((c) => ({ c, f: frequency.get(c) || 0 }))
      .filter((e) => e.f >= 1)
      .sort((a, b) => (b.f - a.f) || (b.c.length - a.c.length));

    if (evaluated.length && evaluated[0].f >= baseFreq) {
      return evaluated[0].c;
    }
    return key;
  }

  function buildLemmaMap(insights) {
    const frequency = new Map();
    (insights || []).forEach((ins) => {
      (ins?.concepts || []).forEach((c) => {
        const k = String(c?.key || c?.label || "").toLowerCase();
        if (!k) return;
        frequency.set(k, (frequency.get(k) || 0) + (c.count || 1));
      });
    });

    const lemmaMap = new Map();
    frequency.forEach((_count, key) => {
      lemmaMap.set(key, tryLemma(key, frequency));
    });
    return lemmaMap;
  }

  function canonicalizeConcepts(insights) {
    if (!Array.isArray(insights) || !insights.length) return insights || [];
    const lemmaMap = buildLemmaMap(insights);

    return insights.map((ins) => {
      if (!ins?.concepts?.length) return ins;
      const merged = new Map();
      ins.concepts.forEach((c) => {
        const original = String(c?.key || c?.label || "").toLowerCase();
        if (!original) return;
        const lemma = lemmaMap.get(original) || original;
        let entry = merged.get(lemma);
        if (!entry) {
          entry = { key: lemma, count: 0, examples: [] };
          merged.set(lemma, entry);
        }
        entry.count += c.count || 1;
        (c.examples || []).forEach((ex) => {
          if (ex && entry.examples.length < 5 && !entry.examples.includes(ex)) {
            entry.examples.push(ex);
          }
        });
      });
      return { ...ins, concepts: Array.from(merged.values()).sort((a, b) => b.count - a.count) };
    });
  }

  // ── Frase-indeks (bigrammer/trigrammer + PMI) ──────────
  // Trekker ut sammensatte uttrykk fra insight.summary. PMI rangerer
  // hvor "kollokativt" et uttrykk er — "kollektiv bevissthet" stiger,
  // "og deretter" faller.
  const PHRASE_STOPWORDS = new Set([
    "og", "i", "på", "som", "for", "med", "til", "av", "fra", "om", "så",
    "men", "da", "når", "hvor", "hvordan",
    "det", "dette", "den", "de", "en", "et",
    "jeg", "du", "vi", "dere", "han", "hun", "oss", "meg", "deg", "seg",
    "er", "var", "ble", "bli", "blir", "har", "hadde", "har",
    "kan", "kunne", "ville", "skal", "skulle", "må", "måtte",
    "ikke", "bare", "alt", "selv", "opp", "ned", "mellom",
    "hvis", "også", "også", "kanskje", "litt", "veldig", "mer", "mest",
    "noen", "noe", "alle", "ingen", "samme", "annen", "andre"
  ]);

  function tokenizeSummary(text) {
    return String(text || "")
      .toLowerCase()
      .split(/[^a-z0-9æøå]+/)
      .filter((t) => t && t.length >= 3 && !PHRASE_STOPWORDS.has(t));
  }

  function buildPhraseIndex(insights, options) {
    const opts = options || {};
    const minN = opts.minN || 2;
    const maxN = opts.maxN || 3;
    const minCount = opts.minCount || 2;
    const minPmi = opts.minPmi || 1.0;
    const maxPhrases = opts.maxPhrases || 60;

    const wordCount = new Map();
    const phraseCount = new Map();
    const phraseExamples = new Map();
    const phraseThemes = new Map();
    let totalWindows = 0;

    (insights || []).forEach((ins) => {
      const tokens = tokenizeSummary(ins?.summary || ins?.title || "");
      if (!tokens.length) return;
      const themeId = ins.theme_id || "ukjent";
      tokens.forEach((t) => wordCount.set(t, (wordCount.get(t) || 0) + 1));
      totalWindows += tokens.length;

      for (let n = minN; n <= maxN; n++) {
        for (let i = 0; i + n <= tokens.length; i++) {
          const slice = tokens.slice(i, i + n);
          // Hopp over fraser som starter eller slutter med rene kvantorer
          // for å unngå "veldig stor" / "mer komplisert"-støy.
          const phrase = slice.join(" ");
          phraseCount.set(phrase, (phraseCount.get(phrase) || 0) + 1);
          if (!phraseThemes.has(phrase)) phraseThemes.set(phrase, new Set());
          phraseThemes.get(phrase).add(themeId);
          if (!phraseExamples.has(phrase)) phraseExamples.set(phrase, []);
          const exList = phraseExamples.get(phrase);
          if (exList.length < 3 && !exList.includes(ins.id)) exList.push(ins.id);
        }
      }
    });

    if (totalWindows === 0) return [];

    const phrases = [];
    phraseCount.forEach((count, phrase) => {
      if (count < minCount) return;
      const words = phrase.split(" ");
      if (words.some((w) => PHRASE_STOPWORDS.has(w))) return;

      // PMI = log2(P(phrase) / Π P(word_i))
      const pPhrase = count / totalWindows;
      let logProduct = 0;
      let valid = true;
      for (const w of words) {
        const c = wordCount.get(w) || 0;
        if (!c) { valid = false; break; }
        logProduct += Math.log2(c / totalWindows);
      }
      if (!valid) return;
      const pmi = Math.log2(pPhrase) - logProduct;
      if (pmi < minPmi) return;

      phrases.push({
        phrase,
        count,
        pmi: round3(pmi),
        themes: Array.from(phraseThemes.get(phrase) || []),
        examples: phraseExamples.get(phrase) || []
      });
    });

    return phrases
      .sort((a, b) => (b.pmi - a.pmi) || (b.count - a.count))
      .slice(0, maxPhrases);
  }

  // ── Konsept-graf (co-occurrence + PMI) ─────────────────
  // Bygger et nettverk der to konsepter får en kant hvis de opptrer i
  // samme insight. Vekten er antall fellesinsikter; PMI/NPMI rangerer
  // hvor "spesifikk" assosiasjonen er (filtrerer bort generiske ord).
  function buildConceptCoOccurrenceGraph(enrichedInsights, options) {
    const opts = options || {};
    const minPairCount = opts.minPairCount || 2;
    const maxEdges = opts.maxEdges || 200;
    const maxNodes = opts.maxNodes || 120;

    const conceptCount = new Map();
    const conceptThemes = new Map();
    const pairCount = new Map();
    const pairThemes = new Map();

    let totalInsights = 0;

    for (const ins of enrichedInsights || []) {
      const keys = uniqueConceptKeys(ins?.concepts);
      if (!keys.length) continue;
      totalInsights += 1;
      const themeId = ins.theme_id || "ukjent";

      keys.forEach((k) => {
        conceptCount.set(k, (conceptCount.get(k) || 0) + 1);
        if (!conceptThemes.has(k)) conceptThemes.set(k, new Set());
        conceptThemes.get(k).add(themeId);
      });

      for (let i = 0; i < keys.length; i++) {
        for (let j = i + 1; j < keys.length; j++) {
          const pk = keys[i] + "||" + keys[j];
          pairCount.set(pk, (pairCount.get(pk) || 0) + 1);
          if (!pairThemes.has(pk)) pairThemes.set(pk, new Set());
          pairThemes.get(pk).add(themeId);
        }
      }
    }

    if (totalInsights === 0) {
      return { nodes: [], edges: [], total_insights: 0, total_concepts: 0, total_pairs: 0 };
    }

    const N = totalInsights;
    const edges = [];
    pairCount.forEach((count, key) => {
      if (count < minPairCount) return;
      const [a, b] = key.split("||");
      const ca = conceptCount.get(a) || 1;
      const cb = conceptCount.get(b) || 1;
      const pAB = count / N;
      const pmi = Math.log2((count * N) / (ca * cb));
      const npmi = pAB > 0 ? pmi / Math.max(1e-9, -Math.log2(pAB)) : 0;
      edges.push({
        source: a,
        target: b,
        count,
        pmi: round3(pmi),
        npmi: round3(npmi),
        themes: Array.from(pairThemes.get(key) || [])
      });
    });

    edges.sort((x, y) => (y.npmi - x.npmi) || (y.count - x.count));
    const limitedEdges = edges.slice(0, maxEdges);

    const nodeKeys = new Set();
    limitedEdges.forEach((e) => {
      nodeKeys.add(e.source);
      nodeKeys.add(e.target);
    });
    Array.from(conceptCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, maxNodes)
      .forEach(([k]) => nodeKeys.add(k));

    const nodes = Array.from(nodeKeys)
      .map((key) => ({
        key,
        count: conceptCount.get(key) || 0,
        theme_count: (conceptThemes.get(key) || new Set()).size,
        themes: Array.from(conceptThemes.get(key) || [])
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, maxNodes);

    const keptKeys = new Set(nodes.map((n) => n.key));
    const filteredEdges = limitedEdges.filter(
      (e) => keptKeys.has(e.source) && keptKeys.has(e.target)
    );

    // Naboliste – nyttig for "hvilke konsepter henger sammen med X?".
    const neighbors = {};
    filteredEdges.forEach((e) => {
      if (!neighbors[e.source]) neighbors[e.source] = [];
      if (!neighbors[e.target]) neighbors[e.target] = [];
      neighbors[e.source].push({ key: e.target, count: e.count, npmi: e.npmi });
      neighbors[e.target].push({ key: e.source, count: e.count, npmi: e.npmi });
    });
    Object.keys(neighbors).forEach((k) => {
      neighbors[k].sort((a, b) => (b.npmi - a.npmi) || (b.count - a.count));
    });

    return {
      nodes,
      edges: filteredEdges,
      neighbors,
      total_insights: totalInsights,
      total_concepts: conceptCount.size,
      total_pairs: pairCount.size
    };
  }

  // ── Tidslinje + sekvensmønstre ─────────────────────────
  // Bruker first_seen / last_updated på insights som proxy for når
  // konsepter dukket opp i en brukers tenkning. Detekterer rekkefølge
  // (A før B med X dagers etterslep), aktivitet per dag, og skifte i
  // fokus mellom forrige og nåværende vindu.
  function buildTemporalProfile(enrichedInsights, options) {
    const opts = options || {};
    const insights = (enrichedInsights || []).filter((ins) => ins && ins.first_seen);
    if (!insights.length) {
      return {
        first_seen: null,
        last_seen: null,
        span_days: 0,
        daily_activity: [],
        concept_emergence: [],
        theme_emergence: [],
        emergence_pairs: [],
        recent_focus: { window_days: opts.recentDays || 14, insights: 0, concepts: [], themes: [] },
        velocity: { recent_count: 0, previous_count: 0, delta: 0, trend: "stabil" }
      };
    }

    const now = opts.now ? new Date(opts.now) : new Date();
    const recentDays = opts.recentDays || 14;
    const dayMs = 86400000;

    const dayBuckets = new Map();
    const conceptFirst = new Map();
    const conceptLast = new Map();
    const conceptCount = new Map();
    const conceptThemes = new Map();
    const themeFirst = new Map();
    const themeLast = new Map();
    const themeCount = new Map();

    let firstOverall = null;
    let lastOverall = null;

    for (const ins of insights) {
      const first = new Date(ins.first_seen);
      const last = new Date(ins.last_updated || ins.first_seen);
      if (!firstOverall || first < firstOverall) firstOverall = first;
      if (!lastOverall || last > lastOverall) lastOverall = last;

      const dayKey = isoDay(first);
      if (dayKey) {
        const bucket = dayBuckets.get(dayKey) || { day: dayKey, insights: 0, themes: new Set() };
        bucket.insights += 1;
        if (ins.theme_id) bucket.themes.add(ins.theme_id);
        dayBuckets.set(dayKey, bucket);
      }

      const themeId = ins.theme_id || "ukjent";
      if (!themeFirst.has(themeId) || first < themeFirst.get(themeId)) themeFirst.set(themeId, first);
      if (!themeLast.has(themeId) || last > themeLast.get(themeId)) themeLast.set(themeId, last);
      themeCount.set(themeId, (themeCount.get(themeId) || 0) + 1);

      (ins.concepts || []).forEach((c) => {
        const key = String(c?.key || c?.label || "").trim().toLowerCase();
        if (!key) return;
        if (!conceptFirst.has(key) || first < conceptFirst.get(key)) conceptFirst.set(key, first);
        if (!conceptLast.has(key) || last > conceptLast.get(key)) conceptLast.set(key, last);
        conceptCount.set(key, (conceptCount.get(key) || 0) + (c.count || 1));
        if (!conceptThemes.has(key)) conceptThemes.set(key, new Set());
        conceptThemes.get(key).add(themeId);
      });
    }

    const spanDays = round3((lastOverall - firstOverall) / dayMs);

    const daily_activity = Array.from(dayBuckets.values())
      .map((b) => ({ day: b.day, insights: b.insights, themes: Array.from(b.themes) }))
      .sort((a, b) => (a.day < b.day ? -1 : 1));

    const concept_emergence = Array.from(conceptFirst.entries())
      .map(([key, first]) => {
        const last = conceptLast.get(key) || first;
        return {
          key,
          first_seen: first.toISOString(),
          last_seen: last.toISOString(),
          span_days: round3((last - first) / dayMs),
          count: conceptCount.get(key) || 0,
          themes: Array.from(conceptThemes.get(key) || [])
        };
      })
      .sort((a, b) => (a.first_seen < b.first_seen ? -1 : 1));

    const theme_emergence = Array.from(themeFirst.entries())
      .map(([id, first]) => {
        const last = themeLast.get(id) || first;
        return {
          theme_id: id,
          first_seen: first.toISOString(),
          last_seen: last.toISOString(),
          span_days: round3((last - first) / dayMs),
          insights: themeCount.get(id) || 0
        };
      })
      .sort((a, b) => (a.first_seen < b.first_seen ? -1 : 1));

    // Sekvenspar: blant topp-N konsepter, hvilke dukker opp før hvilke
    // og med hvor mange dagers etterslep? Dette er en grov proxy for
    // "tenkningen min beveget seg fra X til Y".
    const topN = opts.topConcepts || 12;
    const maxLag = opts.maxLagDays || 60;
    const top = concept_emergence
      .filter((c) => c.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, topN);

    const emergence_pairs = [];
    for (let i = 0; i < top.length; i++) {
      for (let j = 0; j < top.length; j++) {
        if (i === j) continue;
        const a = top[i];
        const b = top[j];
        const lagDays = (new Date(b.first_seen) - new Date(a.first_seen)) / dayMs;
        if (lagDays > 0 && lagDays <= maxLag) {
          emergence_pairs.push({
            before: a.key,
            after: b.key,
            lag_days: round3(lagDays),
            count_before: a.count,
            count_after: b.count
          });
        }
      }
    }
    emergence_pairs.sort((x, y) => x.lag_days - y.lag_days);

    const recentCutoff = new Date(now.getTime() - recentDays * dayMs);
    const previousCutoff = new Date(now.getTime() - 2 * recentDays * dayMs);

    const recentInsights = [];
    const previousInsights = [];
    const recentConceptCount = new Map();
    const previousConceptCount = new Map();
    const recentThemeCount = new Map();

    for (const ins of insights) {
      const t = new Date(ins.last_updated || ins.first_seen);
      const inRecent = t >= recentCutoff;
      const inPrevious = !inRecent && t >= previousCutoff;
      if (!inRecent && !inPrevious) continue;
      const target = inRecent ? recentInsights : previousInsights;
      target.push(ins);

      if (inRecent) {
        const themeId = ins.theme_id || "ukjent";
        recentThemeCount.set(themeId, (recentThemeCount.get(themeId) || 0) + 1);
      }

      const bucket = inRecent ? recentConceptCount : previousConceptCount;
      (ins.concepts || []).forEach((c) => {
        const key = String(c?.key || c?.label || "").trim().toLowerCase();
        if (!key) return;
        bucket.set(key, (bucket.get(key) || 0) + (c.count || 1));
      });
    }

    const recent_focus = {
      window_days: recentDays,
      insights: recentInsights.length,
      concepts: Array.from(recentConceptCount.entries())
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 20),
      themes: Array.from(recentThemeCount.entries())
        .map(([theme_id, count]) => ({ theme_id, count }))
        .sort((a, b) => b.count - a.count),
      // Konsepter som har dukket opp mye i siste vindu, men ikke i forrige.
      emerging: Array.from(recentConceptCount.entries())
        .filter(([k, c]) => c >= 2 && (previousConceptCount.get(k) || 0) === 0)
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      // Konsepter som har avtatt sterkt mellom vinduene.
      fading: Array.from(previousConceptCount.entries())
        .filter(([k, c]) => c >= 2 && (recentConceptCount.get(k) || 0) === 0)
        .map(([key, count]) => ({ key, prev_count: count }))
        .sort((a, b) => b.prev_count - a.prev_count)
        .slice(0, 10)
    };

    const velocity = {
      recent_count: recentInsights.length,
      previous_count: previousInsights.length,
      delta: recentInsights.length - previousInsights.length,
      trend:
        recentInsights.length > previousInsights.length
          ? "økende"
          : recentInsights.length < previousInsights.length
            ? "avtakende"
            : "stabil"
    };

    return {
      first_seen: firstOverall ? firstOverall.toISOString() : null,
      last_seen: lastOverall ? lastOverall.toISOString() : null,
      span_days: spanDays,
      daily_activity,
      concept_emergence,
      theme_emergence,
      emergence_pairs: emergence_pairs.slice(0, 30),
      recent_focus,
      velocity
    };
  }

  // ── Spennings-/motsigelsesdetektor ─────────────────────
  // Ser etter tilfeller der samme konsept / tema bærer motstridende
  // valens eller modalitet på tvers av insights — det vi normalt
  // ville oppfattet som ambivalens, paradoks eller bevegelse.
  function buildTensionProfile(enrichedInsights, options) {
    const opts = options || {};
    const minInsightCount = opts.minInsightCount || 2;
    const insights = (enrichedInsights || []).filter((ins) => ins && ins.semantic);

    function emptyValenceDist() {
      return { positiv: 0, negativ: 0, blandet: 0, nøytral: 0 };
    }
    function emptyModalityDist() {
      return { krav: 0, mulighet: 0, hindring: 0, nøytral: 0 };
    }

    // Per konsept
    const perConcept = new Map();
    for (const ins of insights) {
      const valence = ins.semantic.valence || "nøytral";
      const modality = ins.semantic.modality || "nøytral";
      const themeId = ins.theme_id || "ukjent";
      const time = new Date(ins.first_seen || ins.last_updated || 0).getTime() || 0;

      uniqueConceptKeys(ins.concepts).forEach((key) => {
        let entry = perConcept.get(key);
        if (!entry) {
          entry = {
            key,
            insight_count: 0,
            themes: new Set(),
            valence: emptyValenceDist(),
            modality: emptyModalityDist(),
            samples: []
          };
          perConcept.set(key, entry);
        }
        entry.insight_count += 1;
        entry.themes.add(themeId);
        entry.valence[valence] = (entry.valence[valence] || 0) + 1;
        entry.modality[modality] = (entry.modality[modality] || 0) + 1;
        entry.samples.push({
          insight_id: ins.id,
          theme_id: themeId,
          valence,
          modality,
          time,
          summary: (ins.summary || ins.title || "").slice(0, 200)
        });
      });
    }

    function valenceTension(dist) {
      const pos = dist.positiv || 0;
      const neg = dist.negativ || 0;
      const total = pos + neg;
      if (total < 2) return 0;
      const p = pos / total;
      const balance = 1 - Math.abs(p - 0.5) * 2; // 1 hvis 50/50, 0 hvis 100/0
      const coverage = Math.min(total / 6, 1);
      return round3(balance * coverage);
    }

    function modalityConflict(dist) {
      const krav = dist.krav || 0;
      const hindring = dist.hindring || 0;
      const mulighet = dist.mulighet || 0;
      const negSide = krav + hindring;
      const posSide = mulighet;
      const total = negSide + posSide;
      if (total < 2) return 0;
      const p = negSide / total;
      const balance = 1 - Math.abs(p - 0.5) * 2;
      const coverage = Math.min(total / 6, 1);
      return round3(balance * coverage);
    }

    const concept_tensions = Array.from(perConcept.values())
      .filter((entry) => entry.insight_count >= minInsightCount)
      .map((entry) => {
        const tension_score = valenceTension(entry.valence);
        const conflict_score = modalityConflict(entry.modality);
        return {
          key: entry.key,
          insight_count: entry.insight_count,
          theme_count: entry.themes.size,
          themes: Array.from(entry.themes),
          valence: entry.valence,
          modality: entry.modality,
          tension_score,
          conflict_score,
          combined: round3((tension_score + conflict_score) / 2),
          samples: entry.samples
        };
      })
      .filter((entry) => entry.tension_score > 0 || entry.conflict_score > 0)
      .sort((a, b) => b.combined - a.combined);

    // Per tema – fordeling, dominerende polaritet, og sekvens-flips
    const perTheme = new Map();
    for (const ins of insights) {
      const themeId = ins.theme_id || "ukjent";
      let t = perTheme.get(themeId);
      if (!t) {
        t = {
          theme_id: themeId,
          insight_count: 0,
          valence: emptyValenceDist(),
          modality: emptyModalityDist(),
          ordered: []
        };
        perTheme.set(themeId, t);
      }
      t.insight_count += 1;
      t.valence[ins.semantic.valence || "nøytral"] += 1;
      t.modality[ins.semantic.modality || "nøytral"] += 1;
      t.ordered.push({
        time: new Date(ins.first_seen || 0).getTime() || 0,
        valence: ins.semantic.valence || "nøytral"
      });
    }

    const theme_tensions = Array.from(perTheme.values()).map((t) => {
      const seq = t.ordered.sort((a, b) => a.time - b.time).map((x) => x.valence);
      let flips = 0;
      let lastPolar = null;
      for (const v of seq) {
        if (v === "positiv" || v === "negativ") {
          if (lastPolar && lastPolar !== v) flips += 1;
          lastPolar = v;
        }
      }
      const total = t.insight_count || 1;
      const dominant =
        t.valence.positiv > t.valence.negativ ? "positiv"
          : t.valence.negativ > t.valence.positiv ? "negativ"
            : "balansert";
      return {
        theme_id: t.theme_id,
        insight_count: t.insight_count,
        valence: t.valence,
        modality: t.modality,
        dominant_polarity: dominant,
        valence_flip_count: flips,
        valence_flip_ratio: round3(flips / Math.max(1, total - 1)),
        tension_score: valenceTension(t.valence),
        conflict_score: modalityConflict(t.modality)
      };
    }).sort((a, b) => b.tension_score - a.tension_score);

    // Cross-theme: konsepter som har motsatt polaritet i ulike tema
    const cross_theme = [];
    for (const entry of perConcept.values()) {
      if (entry.themes.size < 2) continue;
      const byTheme = new Map();
      for (const s of entry.samples) {
        let bt = byTheme.get(s.theme_id);
        if (!bt) {
          bt = { theme_id: s.theme_id, valence: emptyValenceDist(), modality: emptyModalityDist(), count: 0 };
          byTheme.set(s.theme_id, bt);
        }
        bt.count += 1;
        bt.valence[s.valence] = (bt.valence[s.valence] || 0) + 1;
        bt.modality[s.modality] = (bt.modality[s.modality] || 0) + 1;
      }
      const themesList = Array.from(byTheme.values());
      const hasPos = themesList.some((t) => (t.valence.positiv || 0) > (t.valence.negativ || 0));
      const hasNeg = themesList.some((t) => (t.valence.negativ || 0) > (t.valence.positiv || 0));
      if (hasPos && hasNeg) {
        cross_theme.push({
          key: entry.key,
          themes: themesList.map((t) => ({
            theme_id: t.theme_id,
            count: t.count,
            valence: t.valence,
            dominant:
              t.valence.positiv > t.valence.negativ ? "positiv"
                : t.valence.negativ > t.valence.positiv ? "negativ"
                  : "balansert"
          }))
        });
      }
    }
    cross_theme.sort((a, b) => b.themes.reduce((s, t) => s + t.count, 0) - a.themes.reduce((s, t) => s + t.count, 0));

    // Paradoks-par: to insights i samme tema med felles konsept og motsatt valens
    const paradox_pairs = [];
    const seenPairs = new Set();
    const themeIndex = new Map();
    for (const ins of insights) {
      const themeId = ins.theme_id || "ukjent";
      if (!themeIndex.has(themeId)) themeIndex.set(themeId, []);
      themeIndex.get(themeId).push(ins);
    }
    themeIndex.forEach((list) => {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i];
          const b = list[j];
          const va = a.semantic?.valence;
          const vb = b.semantic?.valence;
          if (!((va === "positiv" && vb === "negativ") || (va === "negativ" && vb === "positiv"))) continue;
          const ka = new Set(uniqueConceptKeys(a.concepts));
          const shared = uniqueConceptKeys(b.concepts).filter((k) => ka.has(k));
          if (!shared.length) continue;
          const pairKey = [a.id, b.id].sort().join("||");
          if (seenPairs.has(pairKey)) continue;
          seenPairs.add(pairKey);
          paradox_pairs.push({
            theme_id: a.theme_id || "ukjent",
            shared_concepts: shared,
            insight_a: { id: a.id, valence: va, summary: (a.summary || a.title || "").slice(0, 200), first_seen: a.first_seen || null },
            insight_b: { id: b.id, valence: vb, summary: (b.summary || b.title || "").slice(0, 200), first_seen: b.first_seen || null },
            type: "valence_flip"
          });
        }
      }
    });
    paradox_pairs.sort((x, y) => y.shared_concepts.length - x.shared_concepts.length);

    return {
      total_insights: insights.length,
      concept_tensions: concept_tensions.slice(0, opts.maxConcepts || 30),
      theme_tensions,
      cross_theme: cross_theme.slice(0, opts.maxCrossTheme || 20),
      paradox_pairs: paradox_pairs.slice(0, opts.maxParadoxes || 20)
    };
  }

  // ── Anbefalingslag ──────────────────────────────────────
  // Tar et ferdig meta-bilde og foreslår hvor brukeren bør se neste
  // gang: tema som så vidt er berørt, gamle innsikter som er relevante
  // igjen, konsepter som ligger isolert og venter på å kobles, par som
  // har sterk assosiasjon men få belegg, refleksjons-prompts for tema
  // som er fastlåst eller spennings-fylt, og emner som så vidt er
  // streifet av matcheren.
  function buildRecommendations(profile, options) {
    const opts = options || {};
    const empty = {
      next_topics: [],
      resurface_insights: [],
      underexplored_concepts: [],
      bridging_pairs: [],
      unstick_prompts: [],
      emne_suggestions: []
    };
    if (!profile) return empty;

    const insights = profile.insights || [];
    const cooc = profile.cooccurrence || { nodes: [], edges: [], neighbors: {} };
    const temporal = profile.temporal || { recent_focus: { concepts: [], themes: [], emerging: [] } };
    const tensions = profile.tensions || { concept_tensions: [], theme_tensions: [], paradox_pairs: [] };
    const topics = profile.topics || [];

    const recentConceptKeys = new Set(
      (temporal.recent_focus?.concepts || []).slice(0, 10).map((c) => c.key)
    );

    // ── next_topics ─────
    const themeCounts = new Map();
    const themeShared = new Map();
    insights.forEach((ins) => {
      const id = ins.theme_id || "ukjent";
      themeCounts.set(id, (themeCounts.get(id) || 0) + 1);
      if (!themeShared.has(id)) themeShared.set(id, 0);
      uniqueConceptKeys(ins.concepts).forEach((k) => {
        if (recentConceptKeys.has(k)) themeShared.set(id, themeShared.get(id) + 1);
      });
    });

    const next_topics = Array.from(themeCounts.entries())
      .map(([theme_id, count]) => {
        const shared = themeShared.get(theme_id) || 0;
        const score = round3(shared / Math.max(1, Math.sqrt(count)));
        return {
          theme_id,
          insight_count: count,
          shared_concepts_with_recent: shared,
          score
        };
      })
      .filter((t) => t.shared_concepts_with_recent >= 1 && t.insight_count <= (opts.maxThemeCount || 3))
      .sort((a, b) => b.score - a.score)
      .slice(0, opts.maxNextTopics || 5)
      .map((t) => ({
        ...t,
        reason: "Tema med koblinger til det du tenker mye på akkurat nå, men få insights."
      }));

    // ── resurface_insights ─────
    const now = opts.now ? new Date(opts.now) : new Date();
    const dayMs = 86400000;
    const oldThresholdDays = opts.oldThresholdDays || 21;
    const resurface_insights = insights
      .map((ins) => {
        const lastTime = new Date(ins.last_updated || ins.first_seen || 0).getTime();
        if (!lastTime) return null;
        const ageDays = (now.getTime() - lastTime) / dayMs;
        if (ageDays < oldThresholdDays) return null;
        const overlap = uniqueConceptKeys(ins.concepts).filter((k) => recentConceptKeys.has(k));
        if (!overlap.length) return null;
        return {
          insight_id: ins.id,
          theme_id: ins.theme_id || "ukjent",
          summary: (ins.summary || ins.title || "").slice(0, 200),
          shared_concepts: overlap,
          last_updated: ins.last_updated || ins.first_seen,
          age_days: round3(ageDays),
          reason: "Eldre refleksjon som deler konsepter med det du jobber med nå."
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.shared_concepts.length - a.shared_concepts.length || b.age_days - a.age_days)
      .slice(0, opts.maxResurface || 6);

    // ── underexplored_concepts ─────
    const underexplored_concepts = (cooc.nodes || [])
      .filter((n) => n.count >= 2 && n.theme_count <= 1)
      .map((n) => {
        const neighbors = (cooc.neighbors && cooc.neighbors[n.key]) || [];
        return {
          key: n.key,
          count: n.count,
          theme_count: n.theme_count,
          themes: n.themes,
          neighbor_count: neighbors.length,
          top_neighbors: neighbors.slice(0, 3),
          reason:
            neighbors.length === 0
              ? "Begrepet er nytt i materialet og trenger flere tekster før AHA kan koble det sikkert."
              : "Konseptet er smalt forankret — bare ett tema bærer det."
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, opts.maxUnderexplored || 6);

    // ── bridging_pairs ─────
    const bridging_pairs = (cooc.edges || [])
      .filter((e) => e.npmi >= (opts.bridgeMinNpmi || 0.7) && e.count <= (opts.bridgeMaxCount || 3))
      .slice(0, opts.maxBridging || 6)
      .map((e) => ({
        source: e.source,
        target: e.target,
        count: e.count,
        npmi: e.npmi,
        themes: e.themes,
        reason: "Sterk assosiasjon, men foreløpig sjelden — verdt å tenke videre på."
      }));

    // ── unstick_prompts ─────
    const phaseByTheme = {};
    topics.forEach((t) => {
      phaseByTheme[t.theme_id] = t.stats?.user_phase || "utforskning";
    });
    const themeTensionByTheme = new Map();
    (tensions.theme_tensions || []).forEach((t) => themeTensionByTheme.set(t.theme_id, t));

    const unstick_prompts = [];
    const seenThemes = new Set();
    topics.forEach((t) => {
      const themeId = t.theme_id;
      if (seenThemes.has(themeId)) return;
      const phase = phaseByTheme[themeId];
      const tt = themeTensionByTheme.get(themeId);
      const isStuck = phase === "fastlåst" || phase === "press";
      const isTense = tt && (tt.tension_score >= 0.4 || tt.valence_flip_count >= 2);
      if (!isStuck && !isTense) return;
      seenThemes.add(themeId);

      const conceptForTheme = (tensions.concept_tensions || []).find((c) =>
        (c.themes || []).includes(themeId)
      );
      const paradoxForTheme = (tensions.paradox_pairs || []).find((p) => p.theme_id === themeId);

      if (conceptForTheme) {
        unstick_prompts.push({
          theme_id: themeId,
          prompt: `Du har lest "${conceptForTheme.key}" i "${themeId}" både positivt og negativt. Hva endret seg mellom de to lesningene?`,
          basis: { type: "concept_tension", concept: conceptForTheme.key, phase }
        });
      } else if (paradoxForTheme) {
        unstick_prompts.push({
          theme_id: themeId,
          prompt: `To av refleksjonene dine om "${themeId}" peker i motsatt retning rundt "${paradoxForTheme.shared_concepts[0]}". Hvilken av dem stemmer best i dag?`,
          basis: { type: "paradox", concepts: paradoxForTheme.shared_concepts, phase }
        });
      } else if (isStuck) {
        unstick_prompts.push({
          theme_id: themeId,
          prompt: `"${themeId}" virker fastlåst nå. Hvilket konsept ville du flyttet vekk fra først hvis du fikk velge?`,
          basis: { type: "phase_only", phase }
        });
      }
    });

    // ── emne_suggestions ─────
    // Leser fra ins.emne_suggestions (nytt provisorisk forslag-felt skrevet
    // av ahaEmneMatcher via AHAIngest). Fallback til ins.emne_matches for
    // bakoverkompatibilitet med kammere som ble fylt før suggestion-felt
    // ble innført.
    const emneByKey = new Map();
    insights.forEach((ins) => {
      const list = Array.isArray(ins.emne_suggestions) && ins.emne_suggestions.length
        ? ins.emne_suggestions
        : Array.isArray(ins.emne_matches) ? ins.emne_matches : [];
      list.forEach((m) => {
        const id = m && m.emne_id;
        if (!id) return;
        let entry = emneByKey.get(id);
        if (!entry) {
          entry = {
            emne_id: id,
            title: m.title || m.label || null,
            short_label: m.short_label || m.label || null,
            subject_id: m.subject_id || null,
            area_label: m.area_label || null,
            count: 0
          };
          emneByKey.set(id, entry);
        }
        entry.count += 1;
      });
    });
    const emne_suggestions = Array.from(emneByKey.values())
      .filter((e) => e.count >= 1 && e.count <= (opts.emneMaxCount || 2))
      .sort((a, b) => b.count - a.count)
      .slice(0, opts.maxEmne || 6)
      .map((e) => ({
        ...e,
        reason: "Tema som teksten din berører, men foreløpig bare i forbifarten."
      }));

    return {
      next_topics,
      resurface_insights,
      underexplored_concepts,
      bridging_pairs,
      unstick_prompts,
      emne_suggestions
    };
  }

  function buildUserMetaProfile(chamber, subjectId) {
    if (!IE) return null;

    const themes = listThemesForSubject(chamber, subjectId);
    const topicProfiles = themes.map((themeId) => {
      const stats = IE.computeTopicStats(chamber, subjectId, themeId);
      const insights = IE.getInsightsForTopic(chamber, subjectId, themeId);
      const semCounts = IE.computeSemanticCounts(insights);
      return { theme_id: themeId, stats, semCounts };
    });

    const globalProfile = computeGlobalSemanticProfile(topicProfiles);
    const patterns = detectCrossTopicPatterns(topicProfiles, globalProfile);
    const rawEnriched = enrichInsightsWithLifecycle(chamber, subjectId);
    // Lemmatiser konseptnøkler korpus-bevisst før resten av analysene.
    // Slik regner vi "klassen" og "klasse" som samme begrep i graf,
    // tidslinje og spennings-laget.
    const enrichedInsights = canonicalizeConcepts(rawEnriched);
    const conceptIndex = buildConceptIndex(enrichedInsights);
    const semioticProfile = buildSemioticProfile(enrichedInsights);
    const academicProfile = buildAcademicProfile(enrichedInsights);
    const cooccurrence = buildConceptCoOccurrenceGraph(enrichedInsights);
    const temporal = buildTemporalProfile(enrichedInsights);
    const tensions = buildTensionProfile(enrichedInsights);
    const phrases = buildPhraseIndex(enrichedInsights);

    const partial = {
      subject_id: subjectId,
      topics: topicProfiles,
      global: globalProfile,
      semiotic: semioticProfile,
      academic: academicProfile,
      patterns,
      insights: enrichedInsights,
      concepts: conceptIndex,
      phrases,
      cooccurrence,
      temporal,
      tensions
    };
    return { ...partial, recommendations: buildRecommendations(partial) };
  }

  const MetaInsightsEngine = {
    buildUserMetaProfile,
    computeGlobalSemanticProfile,
    detectCrossTopicPatterns,
    enrichInsightsWithLifecycle,
    computeInsightLifecycle,
    buildConceptIndex,
    buildConceptIndexForTheme,
    posFilterConcepts,
    extractMultiwordConcepts,
    buildAcademicProfile,
    buildAcademicProfileFromConcepts,
    buildSemioticProfile,
    buildConceptCoOccurrenceGraph,
    buildTemporalProfile,
    buildTensionProfile,
    buildRecommendations,
    canonicalizeConcepts,
    buildPhraseIndex,
    setTheoryClusters,
    getTheoryClusters,
    fuzzyKeywordMatch
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = MetaInsightsEngine;
  } else {
    global.MetaInsightsEngine = MetaInsightsEngine;
  }
})(this);
