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
    const insights = chamber?.insights || [];

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
    const insights = chamber?.insights || [];
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

  const THEORY_CLUSTERS = [
    {
      id: "marx",
      label: "Marx / kritisk politisk økonomi",
      family: "kritisk",
      disciplines: ["sosiologi", "historie"],
      weight: 1.2,
      keywords: ["klasse", "kapitalisme", "utbytting", "produksjonsmidler", "ideologi", "historisk materialisme"]
    },
    {
      id: "weber",
      label: "Weber / handling og rasjonalisering",
      family: "fortolkende",
      disciplines: ["sosiologi"],
      weight: 1.0,
      keywords: ["rasjonalisering", "byråkrati", "myndighet", "legitimitet", "makt", "idealtyper"]
    },
    {
      id: "durkheim",
      label: "Durkheim / sosial integrasjon",
      family: "strukturfunksjonell",
      disciplines: ["sosiologi"],
      weight: 1.0,
      keywords: ["solidaritet", "anomi", "kollektiv bevissthet", "sosiale fakta"]
    },
    {
      id: "foucault",
      label: "Foucault / makt, diskurs, styringsregimer",
      family: "poststrukturalistisk",
      disciplines: ["sosiologi", "filosofi", "historie"],
      weight: 1.3,
      keywords: ["diskurs", "makt", "kunnskapsregime", "governmentality", "normalisering", "subjektivering", "disiplinering"]
    },
    {
      id: "bourdieu",
      label: "Bourdieu / felt, habitus, kapital",
      family: "praksisteori",
      disciplines: ["sosiologi"],
      weight: 1.3,
      keywords: ["felt", "habitus", "symbolsk orden", "symbolsk vold", "kapital", "kulturell kapital", "sosial kapital", "doxa"]
    }
  ];

  function buildAcademicProfileFromConcepts(conceptIndex) {
    const clusters = THEORY_CLUSTERS.map((cluster) => ({
      id: cluster.id,
      label: cluster.label,
      family: cluster.family || null,
      disciplines: cluster.disciplines || [],
      score: 0,
      hits: []
    }));

    let totalConcepts = 0;

    (conceptIndex || []).forEach((c) => {
      const key = String(c.key || "").toLowerCase();
      const freq = c.total_count || c.count || 1;
      if (!key) return;
      totalConcepts += freq;

      THEORY_CLUSTERS.forEach((cluster, idx) => {
        const hit = cluster.keywords.some((kw) => key.includes(kw));
        if (!hit) return;
        clusters[idx].score += freq * (cluster.weight || 1);
        if (clusters[idx].hits.length < 10 && !clusters[idx].hits.includes(key)) {
          clusters[idx].hits.push(key);
        }
      });
    });

    const maxScore = clusters.reduce((max, cluster) => Math.max(max, cluster.score), 0);
    const normalizedClusters = clusters
      .map((cluster) => ({ ...cluster, relative: maxScore > 0 ? cluster.score / maxScore : 0 }))
      .sort((a, b) => b.score - a.score);

    const disciplineMap = {};
    normalizedClusters.forEach((cluster) => {
      (cluster.disciplines || []).forEach((discipline) => {
        disciplineMap[discipline] = (disciplineMap[discipline] || 0) + cluster.score;
      });
    });

    const disciplineList = Object.keys(disciplineMap).map((id) => ({ id, score: disciplineMap[id] }));
    const maxDisc = disciplineList.reduce((max, discipline) => Math.max(max, discipline.score), 0);
    const disciplines = disciplineList
      .map((discipline) => ({ ...discipline, relative: maxDisc > 0 ? discipline.score / maxDisc : 0 }))
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
    const enrichedInsights = enrichInsightsWithLifecycle(chamber, subjectId);
    const conceptIndex = buildConceptIndex(enrichedInsights);
    const semioticProfile = buildSemioticProfile(enrichedInsights);
    const academicProfile = buildAcademicProfile(enrichedInsights);
    const cooccurrence = buildConceptCoOccurrenceGraph(enrichedInsights);
    const temporal = buildTemporalProfile(enrichedInsights);

    return {
      subject_id: subjectId,
      topics: topicProfiles,
      global: globalProfile,
      semiotic: semioticProfile,
      academic: academicProfile,
      patterns,
      insights: enrichedInsights,
      concepts: conceptIndex,
      cooccurrence,
      temporal
    };
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
    buildTemporalProfile
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = MetaInsightsEngine;
  } else {
    global.MetaInsightsEngine = MetaInsightsEngine;
  }
})(this);
