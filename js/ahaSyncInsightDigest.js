// ahaSyncInsightDigest.js
// Read-only compact digest for lokale AHA Sync Hub innsiktssignaler.

(function (global) {
  "use strict";

  const APPROVAL_BOUNDARY = "personal_ai_loop_source_approval";
  const INSIGHT_CHANNEL_FLAGS = {
    "open-questions": "hasOpenQuestions",
    "concept-links": "hasConceptLinks",
    perspectives: "hasPerspectives",
    tensions: "hasTensions",
    "conversation-links": "hasConversationLinks"
  };

  function safeEvents(sourceEvents) {
    return Array.isArray(sourceEvents) ? sourceEvents : [];
  }

  function safeChannels() {
    return Array.isArray(global.AHA_SYNC_CHANNELS) ? global.AHA_SYNC_CHANNELS : [];
  }

  function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function getChannelId(value) {
    return String(value || "").trim();
  }

  function createEmptyChannelCounts() {
    const counts = {};
    safeChannels().forEach((channel) => {
      const id = getChannelId(channel && channel.id);
      if (id) counts[id] = 0;
    });
    return counts;
  }

  function summarizeChannels(routes, candidates) {
    const safeRoutes = Array.isArray(routes) ? routes : [];
    const safeCandidates = Array.isArray(candidates) ? candidates : [];
    const byChannel = createEmptyChannelCounts();
    const candidateByChannel = createEmptyChannelCounts();
    let routedEvents = 0;

    safeRoutes.forEach((route) => {
      const matchedChannels = Array.isArray(route && route.matchedChannels) ? route.matchedChannels : [];
      const uniqueMatches = [];
      matchedChannels.forEach((channelId) => {
        const id = getChannelId(channelId);
        if (id && !uniqueMatches.includes(id)) uniqueMatches.push(id);
      });
      if (uniqueMatches.length) routedEvents += 1;
      uniqueMatches.forEach((id) => {
        byChannel[id] = (byChannel[id] || 0) + 1;
      });
    });

    safeCandidates.forEach((candidate) => {
      const id = getChannelId(candidate && candidate.channelId);
      if (id) candidateByChannel[id] = (candidateByChannel[id] || 0) + 1;
    });

    const channelIds = Array.from(new Set(Object.keys(byChannel).concat(Object.keys(candidateByChannel))));
    const activeChannelIds = channelIds.filter((id) => Number(byChannel[id] || 0) > 0 || Number(candidateByChannel[id] || 0) > 0);
    const topChannelId = activeChannelIds.reduce((topId, id) => {
      const currentScore = Number(byChannel[id] || 0) + Number(candidateByChannel[id] || 0);
      const topScore = Number(byChannel[topId] || 0) + Number(candidateByChannel[topId] || 0);
      return currentScore > topScore ? id : topId;
    }, activeChannelIds[0] || null);

    return {
      byChannel,
      candidateByChannel,
      routedEvents,
      activeChannelIds,
      topChannelId
    };
  }

  function buildDigestLines(summary) {
    const data = safeObject(summary);
    const lines = [];
    const activeChannels = Number(data.activeChannels || 0);
    const candidateCount = Number(data.totalCandidates || 0);

    lines.push(activeChannels > 0
      ? `${activeChannels} innsiktskanal${activeChannels === 1 ? "" : "er"} har lokale signaler.`
      : "Ingen aktive innsiktskanaler funnet i lokale signaler ennå.");

    lines.push(candidateCount > 0
      ? `${candidateCount} local-only sync-kandidat${candidateCount === 1 ? "" : "er"} er foreslått for vurdering.`
      : "Ingen local-only sync-kandidater foreslått ennå.");

    if (data.hasOpenQuestions) lines.push("Åpne spørsmål finnes som lokale tellere.");
    if (data.hasConceptLinks) lines.push("Begreper kobler lokale samtalesignaler.");
    if (data.hasPerspectives || data.hasTensions) lines.push("Perspektiver eller spenninger finnes som trygge signaler.");
    if (data.hasConversationLinks) lines.push("Samtalekoblinger finnes som lokale signaler.");

    lines.push("Alt er read-only, local-only og krever eksisterende Personal AI Loop source approval før noe kan brukes videre.");
    return lines;
  }

  function buildDigest(sourceEvents) {
    const events = safeEvents(sourceEvents);
    const router = global.AHASyncChannelRouter;
    const builder = global.AHASyncCandidateBuilder;
    const routes = typeof router?.routeSourceEvent === "function"
      ? events.map((event) => router.routeSourceEvent(event))
      : [];
    const candidates = typeof builder?.buildCandidates === "function"
      ? builder.buildCandidates(events)
      : [];
    const safeCandidates = Array.isArray(candidates) ? candidates : [];
    const channelSummary = summarizeChannels(routes, safeCandidates);
    const channelCounts = channelSummary.byChannel || {};
    const candidateCounts = channelSummary.candidateByChannel || {};

    const digest = {
      totalSourceEvents: events.length,
      totalRoutedEvents: channelSummary.routedEvents,
      totalCandidates: safeCandidates.length,
      activeChannels: channelSummary.activeChannelIds.length,
      topChannelId: channelSummary.topChannelId,
      hasOpenQuestions: Number(channelCounts["open-questions"] || candidateCounts["open-questions"] || 0) > 0,
      hasConceptLinks: Number(channelCounts["concept-links"] || candidateCounts["concept-links"] || 0) > 0,
      hasPerspectives: Number(channelCounts.perspectives || candidateCounts.perspectives || 0) > 0,
      hasTensions: Number(channelCounts.tensions || candidateCounts.tensions || 0) > 0,
      hasConversationLinks: Number(channelCounts["conversation-links"] || candidateCounts["conversation-links"] || 0) > 0,
      approvalBoundary: APPROVAL_BOUNDARY,
      localOnly: safeCandidates.every((candidate) => candidate && candidate.visibility === "local_only"),
      requiresUserConfirmation: safeCandidates.every((candidate) => candidate && candidate.requiresUserConfirmation === true),
      lines: []
    };

    Object.keys(INSIGHT_CHANNEL_FLAGS).forEach((channelId) => {
      const flag = INSIGHT_CHANNEL_FLAGS[channelId];
      digest[flag] = Boolean(digest[flag]);
    });
    digest.lines = buildDigestLines(digest);
    return digest;
  }

  global.AHASyncInsightDigest = {
    buildDigest,
    summarizeChannels,
    buildDigestLines
  };
}(window));
