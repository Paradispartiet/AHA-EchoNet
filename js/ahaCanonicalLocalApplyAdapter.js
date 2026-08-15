// ahaCanonicalLocalApplyAdapter.js
// Strict server -> existing local AHA storage adapter for the ten canonical sync types.
// No network, auth hooks, timers or automatic execution.
(function (global) {
  "use strict";

  const VERSION = "aha_canonical_local_apply_adapter_v1";
  const STORAGE_KEYS = Object.freeze({
    conversations: "aha_chat_sessions_v1",
    sourceEvents: "aha_source_events_v1",
    insights: "aha_insight_chamber_v1",
    conceptLists: "aha_concept_lists_v1",
    knowledgePaths: "aha_paths_v1",
    articles: "aha_articles_v1"
  });
  const OBJECT_TYPES = Object.freeze([
    "conversation", "message", "source_event", "insight", "concept_list",
    "concept_list_item", "knowledge_path", "knowledge_path_step", "article", "article_reference"
  ]);

  function text(value) { return String(value ?? "").trim(); }
  function arr(value) { return Array.isArray(value) ? value : []; }
  function obj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function requiredText(value, field) {
    const result = text(value);
    if (!result) throw new Error(`${field} is required`);
    return result;
  }
  function optionalText(value) { const result = text(value); return result || null; }
  function optionalIso(value) {
    const raw = text(value);
    if (!raw) return null;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) throw new Error("canonical local apply timestamp must be valid");
    return date.toISOString();
  }
  function safeParse(raw, fallback) {
    if (raw === null || raw === undefined || raw === "") return clone(fallback);
    try {
      const parsed = JSON.parse(raw);
      return parsed == null ? clone(fallback) : parsed;
    } catch {
      throw new Error("canonical local apply refused invalid existing JSON");
    }
  }
  function assertObjectType(value) {
    const type = requiredText(value, "objectType");
    if (!OBJECT_TYPES.includes(type)) throw new Error(`unsupported canonical sync object type: ${type}`);
    return type;
  }
  function normalizeEntry(input) {
    const row = obj(input);
    const objectType = assertObjectType(row.objectType);
    const objectId = requiredText(row.objectId, "objectId");
    const operation = requiredText(row.operation, "operation");
    if (!['upsert', 'delete'].includes(operation)) throw new Error(`unsupported canonical sync operation: ${operation}`);
    if (operation === 'upsert' && (!row.payload || typeof row.payload !== 'object' || Array.isArray(row.payload))) {
      throw new Error("canonical local apply upsert requires object payload");
    }
    if (operation === 'delete' && row.payload != null) throw new Error("canonical local apply delete requires null payload");
    if (operation === 'upsert' && requiredText(row.payload.id, `${objectType}.payload.id`) !== objectId) {
      throw new Error("canonical local apply objectId must match payload id");
    }
    return {
      objectType,
      objectId,
      operation,
      payload: operation === 'upsert' ? clone(row.payload) : null,
      revision: Number.isInteger(Number(row.revision)) && Number(row.revision) >= 0 ? Number(row.revision) : 0,
      payloadHash: optionalText(row.payloadHash),
      deletedAt: optionalIso(row.deletedAt)
    };
  }

  function readState(storage) {
    return {
      conversations: arr(safeParse(storage.getItem(STORAGE_KEYS.conversations), [])),
      sourceEvents: arr(safeParse(storage.getItem(STORAGE_KEYS.sourceEvents), [])),
      insights: obj(safeParse(storage.getItem(STORAGE_KEYS.insights), { insights: [] })),
      conceptLists: arr(safeParse(storage.getItem(STORAGE_KEYS.conceptLists), [])),
      knowledgePaths: arr(safeParse(storage.getItem(STORAGE_KEYS.knowledgePaths), [])),
      articles: arr(safeParse(storage.getItem(STORAGE_KEYS.articles), []))
    };
  }

  function findIndexById(items, id) { return items.findIndex((item) => text(item?.id) === id); }
  function upsertById(items, value) {
    const next = arr(items).map(clone);
    const id = requiredText(value?.id, "local record id");
    const index = findIndexById(next, id);
    if (index === -1) next.push(clone(value));
    else next[index] = { ...next[index], ...clone(value) };
    return next;
  }
  function removeById(items, id) { return arr(items).filter((item) => text(item?.id) !== id).map(clone); }

  function mapConversation(payload, previous) {
    return {
      ...obj(previous),
      id: requiredText(payload.id, "conversation.id"),
      title: requiredText(payload.title, "conversation.title"),
      status: text(payload.status) || "active",
      source: text(payload.source_app) || "aha_chat",
      meta: clone(obj(payload.metadata)),
      createdAt: optionalIso(payload.created_at) || previous?.createdAt || null,
      updatedAt: optionalIso(payload.updated_at) || previous?.updatedAt || null,
      messages: arr(previous?.messages).map(clone)
    };
  }

  function mapMessage(payload) {
    return {
      id: requiredText(payload.id, "message.id"),
      role: requiredText(payload.role, "message.role"),
      text: requiredText(payload.content, "message.content"),
      source: text(payload.source_app) || "aha_chat",
      intent: optionalText(payload.intent),
      project: optionalText(payload.project),
      tags: arr(payload.tags).map((item) => text(item)).filter(Boolean),
      concepts: arr(payload.concepts).map((item) => text(item)).filter(Boolean),
      meta: clone(obj(payload.metadata)),
      createdAt: optionalIso(payload.created_at),
      updatedAt: optionalIso(payload.updated_at)
    };
  }

  function mapSourceEvent(payload) {
    return {
      id: requiredText(payload.id, "source_event.id"),
      conversation_id: optionalText(payload.conversation_id),
      message_id: optionalText(payload.message_id),
      source_type: requiredText(payload.source_type, "source_event.source_type"),
      source_app: requiredText(payload.source_app, "source_event.source_app"),
      content_type: requiredText(payload.content_type, "source_event.content_type"),
      title: optionalText(payload.title),
      text: text(payload.source_text),
      user_created: payload.user_created === true,
      imported: payload.imported === true,
      created_at: optionalIso(payload.occurred_at || payload.created_at),
      tags: arr(payload.tags).map((item) => text(item)).filter(Boolean),
      provenance: clone(obj(payload.provenance)),
      meta: clone(obj(payload.metadata))
    };
  }

  function mapInsight(payload) {
    const version = obj(payload.version);
    const title = requiredText(version.title || payload.title || "AHA-innsikt", "insight.version.title");
    return {
      id: requiredText(payload.id, "insight.id"),
      source_event_id: optionalText(payload.source_event_id),
      analysis_run_id: optionalText(payload.analysis_run_id),
      subject_id: optionalText(payload.subject_id),
      theme_id: optionalText(payload.theme_id),
      functional_type: text(payload.functional_type) || "observation",
      status: text(payload.status) || "active",
      title,
      summary: text(version.summary),
      text: text(version.insight_text) || text(version.summary) || title,
      concepts: arr(version.concepts).map((item) => text(item)).filter(Boolean),
      confidence: version.confidence == null ? null : Number(version.confidence),
      provenance: clone(obj(version.provenance)),
      meta: clone(obj(payload.metadata)),
      created_at: optionalIso(payload.created_at || version.created_at),
      updated_at: optionalIso(payload.updated_at)
    };
  }

  function mapConceptList(payload, previous) {
    return {
      ...obj(previous),
      id: requiredText(payload.id, "concept_list.id"),
      title: requiredText(payload.title, "concept_list.title"),
      type: requiredText(payload.list_type, "concept_list.list_type"),
      description: text(payload.description),
      source: text(payload.source) || "aha_concept_lists",
      sharingScope: "private",
      tags: arr(payload.tags).map((item) => text(item)).filter(Boolean),
      meta: clone(obj(payload.metadata)),
      createdAt: optionalIso(payload.created_at) || previous?.createdAt || null,
      updatedAt: optionalIso(payload.updated_at) || previous?.updatedAt || null,
      terms: arr(previous?.terms).map(clone)
    };
  }

  function mapConceptListItem(payload) {
    const metadata = obj(payload.metadata);
    return {
      id: requiredText(payload.id, "concept_list_item.id"),
      term: requiredText(payload.title, "concept_list_item.title"),
      refId: optionalText(payload.ref_id),
      position: Number.isInteger(Number(payload.position)) ? Number(payload.position) : 0,
      definition: optionalText(metadata.definition),
      relation: optionalText(metadata.relation),
      meta: clone(metadata),
      addedAt: optionalIso(payload.added_at)
    };
  }

  function mapKnowledgePath(payload, previous) {
    return {
      ...obj(previous),
      id: requiredText(payload.id, "knowledge_path.id"),
      title: requiredText(payload.title, "knowledge_path.title"),
      type: requiredText(payload.path_type, "knowledge_path.path_type"),
      description: text(payload.description),
      goal: optionalText(payload.goal),
      learningOutcome: optionalText(payload.learning_outcome),
      source: text(payload.source) || "aha_paths",
      sharingScope: "private",
      tags: arr(payload.tags).map((item) => text(item)).filter(Boolean),
      meta: clone(obj(payload.metadata)),
      createdAt: optionalIso(payload.created_at) || previous?.createdAt || null,
      updatedAt: optionalIso(payload.updated_at) || previous?.updatedAt || null,
      steps: arr(previous?.steps).map(clone)
    };
  }

  function mapKnowledgePathStep(payload) {
    return {
      id: requiredText(payload.id, "knowledge_path_step.id"),
      title: requiredText(payload.title, "knowledge_path_step.title"),
      type: requiredText(payload.step_type, "knowledge_path_step.step_type"),
      source: requiredText(payload.source, "knowledge_path_step.source"),
      refId: optionalText(payload.ref_id),
      order: Number.isInteger(Number(payload.position)) ? Number(payload.position) : 0,
      status: text(payload.status) || "planned",
      narrative: optionalText(payload.narrative),
      learningOutcome: optionalText(payload.learning_outcome),
      completionCriterion: optionalText(payload.completion_criterion),
      meta: clone(obj(payload.metadata)),
      addedAt: optionalIso(payload.added_at)
    };
  }

  function mapArticle(payload, previous) {
    const version = obj(payload.version);
    return {
      ...obj(previous),
      id: requiredText(payload.id, "article.id"),
      title: requiredText(version.title || payload.title, "article.version.title"),
      section: requiredText(payload.section, "article.section"),
      status: text(payload.status) || "draft",
      publicationLayer: "personal",
      summary: text(version.summary),
      body: text(version.body),
      source: text(payload.source) || "aha_avisa",
      tags: arr(payload.tags).map((item) => text(item)).filter(Boolean),
      meta: clone(obj(payload.metadata)),
      provenance: clone(obj(version.provenance)),
      createdAt: optionalIso(payload.created_at || version.created_at) || previous?.createdAt || null,
      updatedAt: optionalIso(payload.updated_at) || previous?.updatedAt || null,
      references: arr(previous?.references).map(clone)
    };
  }

  function mapArticleReference(payload) {
    return {
      id: requiredText(payload.id, "article_reference.id"),
      title: requiredText(payload.title, "article_reference.title"),
      type: requiredText(payload.reference_type, "article_reference.reference_type"),
      source: requiredText(payload.source, "article_reference.source"),
      refId: requiredText(payload.ref_id, "article_reference.ref_id"),
      position: Number.isInteger(Number(payload.position)) ? Number(payload.position) : 0,
      meta: clone(obj(payload.metadata)),
      addedAt: optionalIso(payload.added_at)
    };
  }

  function applyEntryToState(state, entry) {
    const { objectType, objectId, operation, payload } = entry;

    if (objectType === "conversation") {
      if (operation === "delete") state.conversations = removeById(state.conversations, objectId);
      else {
        const index = findIndexById(state.conversations, objectId);
        state.conversations = upsertById(state.conversations, mapConversation(payload, index === -1 ? null : state.conversations[index]));
      }
      return;
    }

    if (objectType === "message") {
      const conversationId = operation === "upsert" ? requiredText(payload.conversation_id, "message.conversation_id") : null;
      let found = false;
      state.conversations = state.conversations.map((session) => {
        const messages = arr(session.messages);
        const hasMessage = findIndexById(messages, objectId) !== -1;
        const isTarget = operation === "upsert" ? text(session.id) === conversationId : hasMessage;
        if (!isTarget) return clone(session);
        found = true;
        return {
          ...clone(session),
          messages: operation === "delete" ? removeById(messages, objectId) : upsertById(messages, mapMessage(payload))
        };
      });
      if (operation === "upsert" && !found) throw new Error(`message parent conversation missing: ${conversationId}`);
      return;
    }

    if (objectType === "source_event") {
      state.sourceEvents = operation === "delete" ? removeById(state.sourceEvents, objectId) : upsertById(state.sourceEvents, mapSourceEvent(payload));
      return;
    }

    if (objectType === "insight") {
      const chamber = obj(state.insights);
      const rows = arr(chamber.insights);
      state.insights = { ...clone(chamber), insights: operation === "delete" ? removeById(rows, objectId) : upsertById(rows, mapInsight(payload)) };
      return;
    }

    if (objectType === "concept_list") {
      if (operation === "delete") state.conceptLists = removeById(state.conceptLists, objectId);
      else {
        const index = findIndexById(state.conceptLists, objectId);
        state.conceptLists = upsertById(state.conceptLists, mapConceptList(payload, index === -1 ? null : state.conceptLists[index]));
      }
      return;
    }

    if (objectType === "concept_list_item") {
      const listId = operation === "upsert" ? requiredText(payload.list_id, "concept_list_item.list_id") : null;
      let found = false;
      state.conceptLists = state.conceptLists.map((list) => {
        const terms = arr(list.terms);
        const hasItem = findIndexById(terms, objectId) !== -1;
        const isTarget = operation === "upsert" ? text(list.id) === listId : hasItem;
        if (!isTarget) return clone(list);
        found = true;
        const nextTerms = operation === "delete" ? removeById(terms, objectId) : upsertById(terms, mapConceptListItem(payload));
        nextTerms.sort((a, b) => Number(a.position || 0) - Number(b.position || 0));
        return { ...clone(list), terms: nextTerms };
      });
      if (operation === "upsert" && !found) throw new Error(`concept list parent missing: ${listId}`);
      return;
    }

    if (objectType === "knowledge_path") {
      if (operation === "delete") state.knowledgePaths = removeById(state.knowledgePaths, objectId);
      else {
        const index = findIndexById(state.knowledgePaths, objectId);
        state.knowledgePaths = upsertById(state.knowledgePaths, mapKnowledgePath(payload, index === -1 ? null : state.knowledgePaths[index]));
      }
      return;
    }

    if (objectType === "knowledge_path_step") {
      const pathId = operation === "upsert" ? requiredText(payload.path_id, "knowledge_path_step.path_id") : null;
      let found = false;
      state.knowledgePaths = state.knowledgePaths.map((path) => {
        const steps = arr(path.steps);
        const hasStep = findIndexById(steps, objectId) !== -1;
        const isTarget = operation === "upsert" ? text(path.id) === pathId : hasStep;
        if (!isTarget) return clone(path);
        found = true;
        const nextSteps = operation === "delete" ? removeById(steps, objectId) : upsertById(steps, mapKnowledgePathStep(payload));
        nextSteps.sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
        return { ...clone(path), steps: nextSteps };
      });
      if (operation === "upsert" && !found) throw new Error(`knowledge path parent missing: ${pathId}`);
      return;
    }

    if (objectType === "article") {
      if (operation === "delete") state.articles = removeById(state.articles, objectId);
      else {
        const index = findIndexById(state.articles, objectId);
        state.articles = upsertById(state.articles, mapArticle(payload, index === -1 ? null : state.articles[index]));
      }
      return;
    }

    if (objectType === "article_reference") {
      const articleId = operation === "upsert" ? requiredText(payload.article_id, "article_reference.article_id") : null;
      let found = false;
      state.articles = state.articles.map((article) => {
        const references = arr(article.references);
        const hasReference = findIndexById(references, objectId) !== -1;
        const isTarget = operation === "upsert" ? text(article.id) === articleId : hasReference;
        if (!isTarget) return clone(article);
        found = true;
        const nextReferences = operation === "delete" ? removeById(references, objectId) : upsertById(references, mapArticleReference(payload));
        nextReferences.sort((a, b) => Number(a.position || 0) - Number(b.position || 0));
        return { ...clone(article), references: nextReferences };
      });
      if (operation === "upsert" && !found) throw new Error(`article parent missing: ${articleId}`);
      return;
    }
  }

  function stateWrites(state) {
    return new Map([
      [STORAGE_KEYS.conversations, JSON.stringify(arr(state.conversations))],
      [STORAGE_KEYS.sourceEvents, JSON.stringify(arr(state.sourceEvents))],
      [STORAGE_KEYS.insights, JSON.stringify({ ...obj(state.insights), insights: arr(obj(state.insights).insights) })],
      [STORAGE_KEYS.conceptLists, JSON.stringify(arr(state.conceptLists))],
      [STORAGE_KEYS.knowledgePaths, JSON.stringify(arr(state.knowledgePaths))],
      [STORAGE_KEYS.articles, JSON.stringify(arr(state.articles))]
    ]);
  }

  function prepareEntries(entries, options = {}) {
    const storage = options.storage || global.localStorage;
    if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") throw new Error("localStorage unavailable");
    const normalized = arr(entries).map(normalizeEntry);
    const state = readState(storage);
    for (const entry of normalized) applyEntryToState(state, entry);
    return { normalized, state, writes: stateWrites(state) };
  }

  function writePrepared(prepared, options = {}) {
    const storage = options.storage || global.localStorage;
    if (!storage || typeof storage.getItem !== "function" || typeof storage.setItem !== "function") throw new Error("localStorage unavailable");
    const writes = prepared?.writes instanceof Map ? prepared.writes : new Map();
    const originals = new Map();
    for (const key of writes.keys()) originals.set(key, storage.getItem(key));
    const written = [];
    try {
      for (const [key, value] of writes) {
        storage.setItem(key, value);
        written.push(key);
      }
    } catch (error) {
      for (const key of written.reverse()) {
        try {
          const previous = originals.get(key);
          if (previous === null || previous === undefined) storage.removeItem(key);
          else storage.setItem(key, previous);
        } catch {}
      }
      throw error;
    }
    return prepared.normalized.map(({ objectType, objectId, operation, revision, payloadHash, deletedAt }) => ({ objectType, objectId, operation, revision, payloadHash, deletedAt }));
  }

  function applyEntries(entries, options = {}) {
    const prepared = prepareEntries(entries, options);
    return writePrepared(prepared, options);
  }

  function getStatus() {
    return {
      version: VERSION,
      networkEnabled: false,
      autoSync: false,
      loginTriggersSync: false,
      supportedStorageKeys: Object.values(STORAGE_KEYS),
      supportedObjectTypes: OBJECT_TYPES.slice(),
      localOnlyStorageTouched: false,
      rollbackOnWriteFailure: true
    };
  }

  const api = Object.freeze({
    VERSION,
    STORAGE_KEYS,
    OBJECT_TYPES,
    normalizeEntry,
    prepareEntries,
    writePrepared,
    applyEntries,
    getStatus
  });

  global.AHACanonicalLocalApplyAdapter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
