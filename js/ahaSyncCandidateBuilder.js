// ahaSyncCandidateBuilder.js
// Read-only bygger for midlertidige AHA sync-kandidater fra lokale source events.

(function (global) {
  "use strict";

  const FALLBACK_PREVIEW_LABEL = "Lokal source event";
  const MAX_LABEL_LENGTH = 80;

  function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function getChannels() {
    return Array.isArray(global.AHA_SYNC_CHANNELS) ? global.AHA_SYNC_CHANNELS : [];
  }

  function getChannel(channelId) {
    const id = String(channelId || "").trim();
    return getChannels().find((channel) => String(channel?.id || "").trim() === id) || null;
  }

  function createPreviewLabel(sourceEvent) {
    const src = safeObject(sourceEvent);
    const title = String(src.title || "").replace(/\s+/g, " ").trim();
    if (!title) return FALLBACK_PREVIEW_LABEL;
    return title.length > MAX_LABEL_LENGTH ? `${title.slice(0, MAX_LABEL_LENGTH - 1)}…` : title;
  }

  function getReasonForChannel(route, channelId, index) {
    const reasons = Array.isArray(route?.reasons) ? route.reasons : [];
    return String(reasons[index] || `Matchet ${channelId} via read-only channel router.`).trim();
  }

  function buildCandidateForEvent(sourceEvent) {
    const router = global.AHASyncChannelRouter;
    if (typeof router?.routeSourceEvent !== "function") return [];

    const src = safeObject(sourceEvent);
    const route = router.routeSourceEvent(src);
    const matchedChannels = Array.isArray(route?.matchedChannels) ? route.matchedChannels : [];
    const sourceId = src.id || null;
    const previewLabel = createPreviewLabel(src);

    return matchedChannels.map((channelId, index) => {
      const id = String(channelId || "").trim();
      const channel = getChannel(id);
      return {
        id: `candidate:${sourceId || "local-source-event"}:${id}`,
        sourceId,
        channelId: id,
        channelName: String(channel?.name || id),
        reason: getReasonForChannel(route, id, index),
        previewLabel,
        confidence: "candidate",
        requiresUserConfirmation: true,
        visibility: "local_only",
        createdFrom: "read_only_route_candidate"
      };
    }).filter((candidate) => candidate.channelId);
  }

  function buildCandidates(sourceEvents) {
    const events = Array.isArray(sourceEvents) ? sourceEvents : [];
    return events.flatMap((event) => buildCandidateForEvent(event));
  }

  function summarizeCandidates(candidates) {
    const safeCandidates = Array.isArray(candidates) ? candidates : [];
    const byChannel = {};
    let requiresConfirmation = 0;
    let localOnly = 0;

    safeCandidates.forEach((candidate) => {
      const id = String(candidate?.channelId || "").trim();
      if (id) byChannel[id] = (byChannel[id] || 0) + 1;
      if (candidate?.requiresUserConfirmation === true) requiresConfirmation += 1;
      if (candidate?.visibility === "local_only") localOnly += 1;
    });

    return {
      total: safeCandidates.length,
      byChannel,
      requiresConfirmation,
      localOnly
    };
  }

  global.AHASyncCandidateBuilder = {
    buildCandidates,
    buildCandidateForEvent,
    summarizeCandidates
  };
}(window));
