// metaInsightsEngine.js
// ─────────────────────────────────────────────
// AHA Meta InsightsEngine – leser data fra InsightsEngine
// og bygger et meta-bilde av brukeren (på tvers av temaer)
// ─────────────────────────────────────────────

(function (global) {
  "use strict";

  // Forvent at insightsChamber.js er lastet før denne
  const IE =
    global.InsightsEngine ||
    (typeof require === "function"
      ? require("./insightsChamber.js")
      : null);

  if (!IE) {
    console.warn(
      "MetaInsightsEngine: Fant ikke InsightsEngine. " +
        "Pass på at insightsChamber.js lastes før metaInsightsEngine.js."
    );
  }

  // ── Hjelpere ────────────────────────────────────────────

  // Finn alle temaer for en gitt bruker (subjectId)
  function listThemesForSubject(chamber, subjectId) {
    const themes = new Set();
    const insights = chamber.insights || [];

    for (const ins of insights) {
      if (ins.subject_id === subjectId && ins.theme_id) {
        themes.add(ins.theme_id);
      }
    }

    return Array.from(themes);
  }

  // Livssyklus for én innsikt (ny → voksende → moden → integrasjon)
  function computeInsightLifecycle(insight, now = new Date()) {
    const first = new Date(insight.first_seen);
    const last = new Date(insight.last_updated || insight.first_seen);

    const ageDays = (now - first) / (1000 * 60 * 60 * 24);
    const recentDays = (now - last) / (1000 * 60 * 60 * 24);

    const evidence = insight.strength?.evidence_count || 0;

    let status = "ny";

    if (evidence >= 2 && ageDays > 1) status = "voksende";
    if (evidence >= 4 && ageDays > 7) status = "moden";
    if (status === "moden" && recentDays > 14) status = "integrasjon";

    // Senere kan du legge til "forkastet" hvis nye signaler motsier den
    return status;
  }

  // Berik alle innsikter for en bruker med lifecycle-status
  function enrichInsightsWithLifecycle(chamber, subjectId) {
    const insights = chamber.insights || [];
    const now = new Date();

    return insights
      .filter((ins) => ins.subject_id === subjectId)
      .map((ins) => {
        const lifecycle = computeInsightLifecycle(ins, now);
        return { ...ins, lifecycle };
      });
  }

  // Global semantisk profil basert på tema-profiler
  function computeGlobalSemanticProfile(topicProfiles) {
    if (!topicProfiles.length) {
      return {
        avg_saturation: 0,
        modality: { krav: 0, mulighet: 0, hindring: 0, nøytral: 0 },
        valence: { negativ: 0, positiv: 0, blandet: 0, nøytral: 0 },
        phases: {
          utforskning: 0,
          mønster: 0,
          press: 0,
          fastlåst: 0,
          integrasjon: 0,
        },
        pressure_index: 0,
        negativity_index: 0,
        stuck_topics: 0,
        integration_topics: 0,
      };
    }

    let sumSaturation = 0;

    const modalityCounts = {
      krav: 0,
      mulighet: 0,
      hindring: 0,
      nøytral: 0,
    };

    const valenceCounts = {
      negativ: 0,
      positiv: 0,
      blandet: 0,
      nøytral: 0,
    };

    const phaseCounts = {
      utforskning: 0,
      mønster: 0,
      press: 0,
      fastlåst: 0,
      integrasjon: 0,
    };

    for (const t of topicProfiles) {
      const stats = t.stats;
      const semCounts = t.semCounts;

      sumSaturation += stats.insight_saturation || 0;

      // modality / valence fra computeSemanticCounts
      if (semCounts && semCounts.modality) {
        for (const key in semCounts.modality) {
          modalityCounts[key] =
            (modalityCounts[key] || 0) + semCounts.modality[key];
        }
      }

      if (semCounts && semCounts.valence) {
        for (const key in semCounts.valence) {
          valenceCounts[key] =
            (valenceCounts[key] || 0) + semCounts.valence[key];
        }
      }

      const phase = stats.user_phase || "utforskning";
      if (phaseCounts[phase] !== undefined) {
        phaseCounts[phase]++;
      }
    }

    const avgSaturation = sumSaturation / topicProfiles.length;

    const pressureIndex =
      (modalityCounts.krav + modalityCounts.hindring) /
      Math.max(1, modalityCounts.mulighet + modalityCounts.nøytral);

    const negativityIndex =
      valenceCounts.negativ /
      Math.max(
        1,
        valenceCounts.positiv +
          valenceCounts.blandet +
          valenceCounts.nøytral
      );

    const stuckTopics = phaseCounts.fastlåst || 0;
    const integrationTopics = phaseCounts.integrasjon || 0;

    return {
      avg_saturation: avgSaturation,
      modality: modalityCounts,
      valence: valenceCounts,
      phases: phaseCounts,
      pressure_index: pressureIndex,
      negativity_index: negativityIndex,
      stuck_topics: stuckTopics,
      integration_topics: integrationTopics,
    };
  }

  // Finn kryss-tema-mønstre (press, utforskning, fastlåst cluster)
  function detectCrossTopicPatterns(topicProfiles, globalProfile) {
    const patterns = [];

    // 1) Press-mønster på tvers av tema
    const highPressure = globalProfile.pressure_index > 1.2;
    if (highPressure) {
      const pressThemes = topicProfiles
        .filter(
          (t) =>
            t.stats.user_phase === "press" ||
            t.stats.user_phase === "fastlåst"
        )
        .map((t) => t.theme_id);

      if (pressThemes.length >= 2) {
        patterns.push({
          id: "cross_pressure",
          type: "global_pattern",
          description:
            "Sterkt press-/må-/burde-/hindringsmønster i flere tema.",
          themes: pressThemes,
        });
      }
    }

    // 2) Utforskende mønster (lavt press + mer positiv/balansert valens)
    const lowPressure = globalProfile.pressure_index < 0.8;
    const morePositive = globalProfile.negativity_index < 0.7;

    if (lowPressure && morePositive) {
      const exploratoryThemes = topicProfiles
        .filter(
          (t) =>
            t.stats.user_phase === "utforskning" ||
            t.stats.user_phase === "integrasjon"
        )
        .map((t) => t.theme_id);

      if (exploratoryThemes.length >= 2) {
        patterns.push({
          id: "cross_exploration",
          type: "global_pattern",
          description:
            "Utforskende/åpent mønster på tvers av flere tema.",
          themes: exploratoryThemes,
        });
      }
    }

    // 3) Cluster av fastlåste tema samtidig
    const stuckClusters = topicProfiles
      .filter((t) => t.stats.user_phase === "fastlåst")
      .map((t) => t.theme_id);

    if (stuckClusters.length >= 2) {
      patterns.push({
        id: "stuck_cluster",
        type: "cluster",
        description: "Flere tema er i fastlåst fase samtidig.",
        themes: stuckClusters,
      });
    }

    return patterns;
  }

  
  // ── Begrepskart på tvers av tema ────────────────────────

  function buildConceptIndex(enrichedInsights) {
    const index = new Map();

    (enrichedInsights || []).forEach((ins) => {
      const themeId = ins.theme_id || "ukjent";

      (ins.concepts || []).forEach((c) => {
        if (!c || !c.key) return;

        let entry = index.get(c.key);
        if (!entry) {
          entry = {
            key: c.key,
            total_count: 0,
            themes: new Set(),
            examples: [],
          };
          index.set(c.key, entry);
        }

        entry.total_count += c.count || 1;
        entry.themes.add(themeId);

        if (Array.isArray(c.examples)) {
          c.examples.forEach((ex) => {
            if (
              ex &&
              entry.examples.length < 5 &&
              !entry.examples.includes(ex)
            ) {
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
        examples: entry.examples,
      }))
      .sort((a, b) => b.total_count - a.total_count);
  }

  // ── Semiotisk profil på tvers av innsikter ──────────────

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
      emoji_count: 0,
    };

    for (const ins of enrichedInsights || []) {
      if (!ins || !ins.semiotic) continue;
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

    if (summary.total_insights > 0) {
      summary.body_ratio =
        summary.body_count / summary.total_insights;
      summary.space_ratio =
        summary.space_count / summary.total_insights;
      summary.tech_ratio =
        summary.tech_count / summary.total_insights;
      summary.emoji_per_insight =
        summary.emoji_count / summary.total_insights;
    } else {
      summary.body_ratio = 0;
      summary.space_ratio = 0;
      summary.tech_ratio = 0;
      summary.emoji_per_insight = 0;
    }

    return summary;
  }

  
  // ── Hovedfunksjon: bygg meta-profil for en bruker ───────

    function buildUserMetaProfile(chamber, subjectId) {
    if (!IE) {
      return null;
    }

    const themes = listThemesForSubject(chamber, subjectId);
    const topicProfiles = [];

    for (const themeId of themes) {
      const stats = IE.computeTopicStats(chamber, subjectId, themeId);
      const insights = IE.getInsightsForTopic(
        chamber,
        subjectId,
        themeId
      );
      const semCounts = IE.computeSemanticCounts(insights);

      topicProfiles.push({
        theme_id: themeId,
        stats,
        semCounts,
      });
    }

    const globalProfile = computeGlobalSemanticProfile(topicProfiles);
    const patterns = detectCrossTopicPatterns(
      topicProfiles,
      globalProfile
    );

    // Berik innsikter med lifecycle-status
    const enrichedInsights = enrichInsightsWithLifecycle(
      chamber,
      subjectId
    );

    // Globalt begrepskart og semiotisk profil
    const conceptIndex = buildConceptIndex(enrichedInsights);
    const semioticProfile = buildSemioticProfile(enrichedInsights);

    return {
      subject_id: subjectId,
      topics: topicProfiles,
      global: globalProfile,
      semiotic: semioticProfile,
      patterns,
      insights: enrichedInsights, // innsikter med lifecycle-status
      concepts: conceptIndex,     // global begrepsindeks
    };
  }

  // ── Public API for meta-motoren ─────────────────────────

  const MetaInsightsEngine = {
    buildUserMetaProfile,
    computeGlobalSemanticProfile,
    detectCrossTopicPatterns,
    enrichInsightsWithLifecycle,
    computeInsightLifecycle,
    buildConceptIndex,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = MetaInsightsEngine;
  } else {
    global.MetaInsightsEngine = MetaInsightsEngine;
  }
})(this);
