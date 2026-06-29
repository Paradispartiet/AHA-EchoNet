// ahaSyncReviewQueue.js
// Read-only/local-only summary of AHA sync candidates that need later manual review.

(function (global) {
  "use strict";

  const APPROVAL_BOUNDARY = "personal_ai_loop_source_approval";
  const APPROVAL_STATES = ["suggested", "review_needed", "approved", "rejected", "blocked", "unknown"];

  function safeCandidates(candidates) {
    return Array.isArray(candidates) ? candidates : [];
  }

  function safeChannels() {
    return Array.isArray(global.AHA_SYNC_CHANNELS) ? global.AHA_SYNC_CHANNELS : [];
  }

  function channelId(value) {
    return String(value || "").trim();
  }

  function approvalState(value) {
    const state = String(value || "unknown").trim();
    return APPROVAL_STATES.includes(state) ? state : "unknown";
  }

  function createChannelCounts() {
    const counts = {};
    safeChannels().forEach((channel) => {
      const id = channelId(channel && channel.id);
      if (id) counts[id] = 0;
    });
    return counts;
  }

  function createApprovalStateCounts() {
    return APPROVAL_STATES.reduce((counts, state) => {
      counts[state] = 0;
      return counts;
    }, {});
  }

  function summarizeReviewQueue(candidates) {
    const items = safeCandidates(candidates);
    const byChannel = createChannelCounts();
    const byApprovalState = createApprovalStateCounts();
    let requiresUserConfirmation = 0;
    let localOnly = 0;
    let matchingBoundary = 0;

    items.forEach((candidate) => {
      const id = channelId(candidate && candidate.channelId);
      if (id) byChannel[id] = (byChannel[id] || 0) + 1;

      const state = approvalState(candidate && candidate.approvalState);
      byApprovalState[state] = (byApprovalState[state] || 0) + 1;

      if (candidate && candidate.requiresUserConfirmation === true) requiresUserConfirmation += 1;
      if (candidate && candidate.visibility === "local_only") localOnly += 1;
      if (candidate && candidate.approvalBoundary === APPROVAL_BOUNDARY) matchingBoundary += 1;
    });

    const summary = {
      totalCandidates: items.length,
      totalReviewItems: byApprovalState.suggested + byApprovalState.review_needed + byApprovalState.unknown,
      byChannel,
      byApprovalState,
      requiresUserConfirmation,
      localOnly,
      approvalBoundary: APPROVAL_BOUNDARY,
      approvalBoundaryMatches: matchingBoundary,
      lines: []
    };

    summary.lines = buildReviewQueueLines(summary);
    return summary;
  }

  function buildReviewQueue(sourceEvents) {
    const builder = global.AHASyncCandidateBuilder;
    const events = Array.isArray(sourceEvents) ? sourceEvents : [];
    const candidates = typeof builder?.buildCandidates === "function"
      ? builder.buildCandidates(events)
      : [];
    return summarizeReviewQueue(candidates);
  }

  function buildReviewQueueLines(summary) {
    const data = summary && typeof summary === "object" && !Array.isArray(summary) ? summary : {};
    const totalCandidates = Number(data.totalCandidates || 0);
    const totalReviewItems = Number(data.totalReviewItems || 0);
    const requiresUserConfirmation = Number(data.requiresUserConfirmation || 0);
    const localOnly = Number(data.localOnly || 0);
    const byChannel = data.byChannel && typeof data.byChannel === "object" && !Array.isArray(data.byChannel) ? data.byChannel : {};
    const activeChannels = Object.keys(byChannel).filter((id) => Number(byChannel[id] || 0) > 0).length;

    return [
      totalCandidates > 0
        ? `${totalCandidates} local-only sync-kandidat${totalCandidates === 1 ? "" : "er"} finnes i manuell review-kø.`
        : "Ingen local-only sync-kandidater i manuell review-kø ennå.",
      `${totalReviewItems} kandidat${totalReviewItems === 1 ? "" : "er"} venter på senere manuell vurdering.`,
      `${activeChannels} AHA_SYNC_CHANNELS har trygge kandidattellere.`,
      `${requiresUserConfirmation} kandidat${requiresUserConfirmation === 1 ? "" : "er"} krever eksplisitt brukerbekreftelse senere.`,
      `${localOnly} kandidat${localOnly === 1 ? "" : "er"} er local-only.`,
      "Review queue er read-only og viser bare trygge counts; ingen approval-action, råtekst, deling eller sync kjøres."
    ];
  }

  global.AHASyncReviewQueue = {
    buildReviewQueue,
    summarizeReviewQueue,
    buildReviewQueueLines
  };
}(window));
