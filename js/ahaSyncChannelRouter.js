// ahaSyncChannelRouter.js
// Read-only kandidatrouter fra AHA source events / samtaletekst til AHA_SYNC_CHANNELS.

(function (global) {
  "use strict";

  const CHAT_MARKERS = ["chat", "conversation", "samtale", "dialog", "message", "melding", "prompt", "reply", "response", "reflection", "refleksjon"];
  const QUESTION_STARTERS = ["hva", "hvorfor", "hvordan", "hvem", "når", "nar", "kan", "skal", "bør", "bor"];
  const CONCEPT_META_KEYS = ["concept", "concepts", "candidate_concepts", "begrep", "begreper", "emne", "emner", "topic", "topics", "subject", "subjects", "theme", "themes", "related_emner", "core_concepts"];
  const CONCEPT_TEXT_MARKERS = ["begrep", "concept", "konsept", "emne", "tema"];
  const PERSPECTIVE_MARKERS = ["jeg mener", "fra mitt perspektiv", "på den ene siden", "pa den ene siden", "på den andre siden", "pa den andre siden", "tolkning"];
  const TENSION_MARKERS = ["uenig", "men", "konflikt", "spenning", "motsetning", "problemet er"];
  const LINK_FIELDS = ["related", "references", "parent_id", "thread_id", "conversation_id"];

  function getChannels() {
    return Array.isArray(global.AHA_SYNC_CHANNELS) ? global.AHA_SYNC_CHANNELS : [];
  }

  function normalizeText(value) {
    return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
  }

  function hasChannel(id) {
    return getChannels().some((channel) => channel && channel.id === id);
  }

  function addRoute(state, id, reason) {
    if (!hasChannel(id) || state.seen[id]) return;
    state.seen[id] = true;
    state.matchedChannels.push(id);
    state.reasons.push(reason);
  }

  function safeObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function safeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function hasAnyMarker(text, markers) {
    return markers.some((marker) => text.includes(marker));
  }

  function startsWithQuestionWord(text) {
    return QUESTION_STARTERS.some((starter) => text === starter || text.startsWith(`${starter} `));
  }

  function hasConceptMeta(meta) {
    return CONCEPT_META_KEYS.some((key) => {
      const value = meta[key];
      if (Array.isArray(value)) return value.length > 0;
      if (value && typeof value === "object") return Object.keys(value).length > 0;
      return String(value || "").trim().length > 0;
    });
  }

  function routeSourceEvent(sourceEvent) {
    const src = safeObject(sourceEvent);
    const meta = safeObject(src.meta);
    const text = normalizeText([src.title, src.text, src.summary, src.content, src.body].filter(Boolean).join(" "));
    const sourceType = normalizeText(src.source_type);
    const contentType = normalizeText(src.content_type);
    const tags = safeArray(src.tags).map(normalizeText).filter(Boolean);
    const state = { seen: {}, matchedChannels: [], reasons: [] };

    if (hasAnyMarker(`${sourceType} ${contentType} ${text}`, CHAT_MARKERS)) {
      addRoute(state, "conversation-insights", "Kilden ser ut som samtale/chat eller refleksjonsinput.");
    }

    if (text.includes("?") || startsWithQuestionWord(text)) {
      addRoute(state, "open-questions", "Teksten inneholder et spørsmål eller starter med et spørreord.");
    }

    if (hasConceptMeta(meta) || tags.length > 0 || hasAnyMarker(text, CONCEPT_TEXT_MARKERS)) {
      addRoute(state, "concept-links", "Kilden har tags, begreper, konsepter eller emner som kan kobles.");
    }

    if (hasAnyMarker(text, PERSPECTIVE_MARKERS)) {
      addRoute(state, "perspectives", "Teksten inneholder perspektiv- eller tolkningsmarkører.");
    }

    if (hasAnyMarker(text, TENSION_MARKERS)) {
      addRoute(state, "tensions", "Teksten inneholder uenighet, spenning eller motsetning.");
    }

    if (LINK_FIELDS.some((field) => Boolean(src[field]))) {
      addRoute(state, "conversation-links", "Kilden har relasjon, referanse, tråd eller samtale-id.");
    }

    return {
      sourceId: src.id || src.source_id || null,
      matchedChannels: state.matchedChannels,
      reasons: state.reasons
    };
  }

  function routeText(text, meta) {
    return routeSourceEvent({
      id: null,
      source_type: "text",
      content_type: "text",
      text: String(text || ""),
      meta: safeObject(meta)
    });
  }

  function summarizeRoutes(sourceEvents) {
    const events = Array.isArray(sourceEvents) ? sourceEvents : [];
    const byChannel = {};
    getChannels().forEach((channel) => {
      if (channel && channel.id) byChannel[channel.id] = 0;
    });
    let unrouted = 0;

    events.forEach((event) => {
      const route = routeSourceEvent(event);
      if (!route.matchedChannels.length) {
        unrouted += 1;
        return;
      }
      route.matchedChannels.forEach((id) => {
        byChannel[id] = (byChannel[id] || 0) + 1;
      });
    });

    return { total: events.length, byChannel, unrouted };
  }

  global.AHASyncChannelRouter = {
    getChannels,
    routeSourceEvent,
    routeText,
    summarizeRoutes
  };
}(window));
