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

    return {
      subject_id: subjectId,
      topics: topicProfiles,
      global: globalProfile,
      semiotic: semioticProfile,
      academic: academicProfile,
      patterns,
      insights: enrichedInsights,
      concepts: conceptIndex
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
    buildSemioticProfile
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = MetaInsightsEngine;
  } else {
    global.MetaInsightsEngine = MetaInsightsEngine;
  }
})(this);
