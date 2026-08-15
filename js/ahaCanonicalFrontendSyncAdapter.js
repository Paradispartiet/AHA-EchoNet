// ahaCanonicalFrontendSyncAdapter.js
// Explicit bridge from current local AHA canonical-neutral models to the
// canonical sync outbox contract. No network, no login hook, no automatic sync.
(function (global) {
  "use strict";

  const VERSION = "aha_canonical_frontend_sync_adapter_v1";
  const PLAN_COLLECTIONS = Object.freeze([
    ["conversation", "conversations"],
    ["message", "messages"],
    ["source_event", "sourceEvents"],
    ["insight", "insights"],
    ["concept_list", "conceptLists"],
    ["concept_list_item", "conceptListItems"],
    ["knowledge_path", "knowledgePaths"],
    ["knowledge_path_step", "knowledgePathSteps"],
    ["article", "articles"],
    ["article_reference", "articleReferences"]
  ]);
  const CANONICAL_OBJECT_TYPES = Object.freeze(PLAN_COLLECTIONS.map(([objectType]) => objectType));

  function text(value) { return String(value ?? "").trim(); }
  function arr(value) { return Array.isArray(value) ? value : []; }
  function obj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function requiredText(value, field) {
    const result = text(value);
    if (!result) throw new Error(`${field} is required`);
    return result;
  }
  function optionalText(value) {
    const result = text(value);
    return result || null;
  }
  function cleanObject(value) {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
  }
  function metadata(value) { return clone(obj(value)); }
  function stringArray(value) { return arr(value).map((item) => text(item)).filter(Boolean); }
  function optionalIso(value) {
    const raw = text(value);
    if (!raw) return undefined;
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) throw new Error("canonical sync timestamp must be valid ISO date input");
    return date.toISOString();
  }
  function nonNegativeInteger(value, field) {
    const number = Number(value ?? 0);
    if (!Number.isInteger(number) || number < 0) throw new Error(`${field} must be a non-negative integer`);
    return number;
  }
  function numberOrNull(value, field) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`${field} must be finite`);
    return number;
  }
  function assertChoice(value, allowed, field, fallback) {
    const result = text(value) || fallback;
    if (!allowed.includes(result)) throw new Error(`invalid ${field}: ${result}`);
    return result;
  }
  function assertPrivate(value, field, fallback = "private") {
    const scope = text(value) || fallback;
    if (scope !== fallback) throw new Error(`canonical sync v1 only accepts ${fallback} ${field}`);
    return scope;
  }

  function resolveHash(options = {}) {
    const hash = options.hash || global.AHACanonicalSyncHash;
    if (!hash || typeof hash.canonicalSyncPayloadHash !== "function") throw new Error("AHACanonicalSyncHash unavailable");
    return hash;
  }

  function resolveStore(options = {}, requireEnqueue = false) {
    const store = options.store || global.AHACanonicalSyncStore;
    if (!store || typeof store.assertSyncableObjectType !== "function") throw new Error("AHACanonicalSyncStore unavailable");
    if (requireEnqueue && typeof store.enqueue !== "function") throw new Error("AHACanonicalSyncStore.enqueue unavailable");
    return store;
  }

  function resolveDependencies(options = {}, requireEnqueue = false) {
    return { hash: resolveHash(options), store: resolveStore(options, requireEnqueue) };
  }

  function canonicalConversation(row) {
    const conversationType = assertChoice(row.conversationType ?? row.conversation_type, ["personal_ai", "reflection", "imported"], "conversation_type", "personal_ai");
    return cleanObject({
      id: requiredText(row.id, "conversation.id"),
      conversation_type: conversationType,
      title: requiredText(row.title, "conversation.title"),
      status: assertChoice(row.status, ["active", "archived"], "conversation.status", "active"),
      source_app: requiredText(row.sourceApp ?? row.source_app ?? "aha_chat", "conversation.source_app"),
      metadata: metadata(row.metadata ?? row.meta),
      created_at: optionalIso(row.createdAt ?? row.created_at)
    });
  }

  function canonicalMessage(row) {
    return cleanObject({
      id: requiredText(row.id, "message.id"),
      conversation_id: requiredText(row.conversationId ?? row.conversation_id, "message.conversation_id"),
      role: assertChoice(row.role, ["user", "assistant", "system", "tool"], "message.role"),
      content: requiredText(row.content ?? row.text ?? row.message, "message.content"),
      source_app: requiredText(row.sourceApp ?? row.source_app ?? "aha_chat", "message.source_app"),
      intent: optionalText(row.intent),
      project: optionalText(row.project),
      tags: stringArray(row.tags),
      concepts: stringArray(row.concepts),
      metadata: metadata(row.metadata ?? row.meta),
      created_at: optionalIso(row.createdAt ?? row.created_at)
    });
  }

  function canonicalSourceEvent(row) {
    const title = text(row.title);
    const sourceText = text(row.sourceText ?? row.source_text ?? row.text);
    if (!title && !sourceText) throw new Error("source_event title or source_text is required");
    return cleanObject({
      id: requiredText(row.id, "source_event.id"),
      conversation_id: optionalText(row.conversationId ?? row.conversation_id),
      message_id: optionalText(row.messageId ?? row.message_id),
      source_type: requiredText(row.sourceType ?? row.source_type, "source_event.source_type"),
      source_app: requiredText(row.sourceApp ?? row.source_app, "source_event.source_app"),
      content_type: requiredText(row.contentType ?? row.content_type, "source_event.content_type"),
      title,
      source_text: sourceText,
      user_created: row.userCreated === undefined && row.user_created === undefined ? true : Boolean(row.userCreated ?? row.user_created),
      imported: Boolean(row.imported),
      occurred_at: optionalIso(row.occurredAt ?? row.occurred_at ?? row.createdAt ?? row.created_at),
      tags: stringArray(row.tags),
      provenance: metadata(row.provenance),
      metadata: metadata(row.metadata ?? row.meta)
    });
  }

  function canonicalInsight(row) {
    const sharingScope = assertPrivate(row.sharingScope ?? row.sharing_scope, "insight sharing_scope");
    const confidence = numberOrNull(row.confidence, "insight.confidence");
    if (confidence !== null && (confidence < 0 || confidence > 1)) throw new Error("insight.confidence must be between 0 and 1");
    const title = requiredText(row.title ?? row.heading ?? row.label ?? "AHA-innsikt", "insight.version.title");
    const summary = text(row.summary);
    const insightText = text(row.insightText ?? row.insight_text ?? row.text ?? row.content ?? row.claim) || summary || title;
    return cleanObject({
      id: requiredText(row.id, "insight.id"),
      source_event_id: optionalText(row.sourceEventId ?? row.source_event_id),
      analysis_run_id: optionalText(row.analysisRunId ?? row.analysis_run_id),
      subject_id: optionalText(row.subjectId ?? row.subject_id),
      theme_id: optionalText(row.themeId ?? row.theme_id),
      functional_type: requiredText(row.functionalType ?? row.functional_type ?? "observation", "insight.functional_type"),
      status: assertChoice(row.status, ["active", "superseded", "contested", "stale", "irrelevant", "archived"], "insight.status", "active"),
      sharing_scope: sharingScope,
      metadata: metadata(row.metadata ?? row.meta),
      created_at: optionalIso(row.createdAt ?? row.created_at),
      version: cleanObject({
        title,
        summary,
        insight_text: insightText,
        concepts: stringArray(row.concepts),
        confidence,
        provenance: metadata(row.provenance),
        created_at: optionalIso(row.createdAt ?? row.created_at)
      })
    });
  }

  function canonicalConceptList(row) {
    return cleanObject({
      id: requiredText(row.id, "concept_list.id"),
      title: requiredText(row.title, "concept_list.title"),
      list_type: requiredText(row.listType ?? row.list_type ?? row.type, "concept_list.list_type"),
      description: text(row.description),
      source: requiredText(row.source || "aha_lists", "concept_list.source"),
      sharing_scope: assertPrivate(row.sharingScope ?? row.sharing_scope, "concept_list sharing_scope"),
      tags: stringArray(row.tags),
      metadata: metadata(row.metadata ?? row.meta),
      created_at: optionalIso(row.createdAt ?? row.created_at)
    });
  }

  function canonicalConceptListItem(row) {
    return cleanObject({
      id: requiredText(row.id, "concept_list_item.id"),
      list_id: requiredText(row.listId ?? row.list_id, "concept_list_item.list_id"),
      title: requiredText(row.title, "concept_list_item.title"),
      item_type: requiredText(row.itemType ?? row.item_type ?? row.type, "concept_list_item.item_type"),
      source: requiredText(row.source, "concept_list_item.source"),
      ref_id: optionalText(row.refId ?? row.ref_id),
      position: nonNegativeInteger(row.position, "concept_list_item.position"),
      added_at: optionalIso(row.addedAt ?? row.added_at),
      metadata: metadata(row.metadata ?? row.meta)
    });
  }

  function canonicalKnowledgePath(row) {
    return cleanObject({
      id: requiredText(row.id, "knowledge_path.id"),
      title: requiredText(row.title, "knowledge_path.title"),
      path_type: requiredText(row.pathType ?? row.path_type ?? row.type, "knowledge_path.path_type"),
      description: text(row.description),
      goal: text(row.goal),
      learning_outcome: text(row.learningOutcome ?? row.learning_outcome),
      source: requiredText(row.source || "aha_paths", "knowledge_path.source"),
      sharing_scope: assertPrivate(row.sharingScope ?? row.sharing_scope, "knowledge_path sharing_scope"),
      tags: stringArray(row.tags),
      metadata: metadata(row.metadata ?? row.meta),
      created_at: optionalIso(row.createdAt ?? row.created_at)
    });
  }

  function canonicalKnowledgePathStep(row) {
    return cleanObject({
      id: requiredText(row.id, "knowledge_path_step.id"),
      path_id: requiredText(row.pathId ?? row.path_id, "knowledge_path_step.path_id"),
      title: requiredText(row.title, "knowledge_path_step.title"),
      step_type: requiredText(row.stepType ?? row.step_type ?? row.type, "knowledge_path_step.step_type"),
      source: requiredText(row.source, "knowledge_path_step.source"),
      ref_id: optionalText(row.refId ?? row.ref_id),
      position: nonNegativeInteger(row.position, "knowledge_path_step.position"),
      status: assertChoice(row.status, ["planned", "active", "done", "skipped"], "knowledge_path_step.status", "planned"),
      narrative: text(row.narrative),
      learning_outcome: text(row.learningOutcome ?? row.learning_outcome),
      completion_criterion: text(row.completionCriterion ?? row.completion_criterion),
      added_at: optionalIso(row.addedAt ?? row.added_at),
      metadata: metadata(row.metadata ?? row.meta)
    });
  }

  function canonicalArticle(row) {
    const publicationScope = text(row.publicationScope ?? row.publication_scope ?? row.publicationLayer ?? row.publication_layer) || "personal";
    if (publicationScope !== "personal") throw new Error("canonical sync v1 only accepts personal article publication_scope");
    const title = requiredText(row.title ?? row.version?.title, "article.version.title");
    const summary = text(row.summary ?? row.version?.summary);
    const body = text(row.body ?? row.version?.body);
    if (!summary && !body) throw new Error("article summary or body is required");
    return cleanObject({
      id: requiredText(row.id, "article.id"),
      section: requiredText(row.section, "article.section"),
      status: assertChoice(row.status, ["draft", "review", "ready", "published_local"], "article.status", "draft"),
      publication_scope: "personal",
      source: requiredText(row.source || "aha_avisa", "article.source"),
      tags: stringArray(row.tags),
      metadata: metadata(row.metadata ?? row.meta),
      created_at: optionalIso(row.createdAt ?? row.created_at),
      version: cleanObject({
        title,
        summary,
        body,
        provenance: metadata(row.provenance ?? row.version?.provenance),
        created_at: optionalIso(row.createdAt ?? row.created_at ?? row.version?.created_at)
      })
    });
  }

  function canonicalArticleReference(row) {
    return cleanObject({
      id: requiredText(row.id, "article_reference.id"),
      article_id: requiredText(row.articleId ?? row.article_id, "article_reference.article_id"),
      title: requiredText(row.title, "article_reference.title"),
      reference_type: requiredText(row.referenceType ?? row.reference_type ?? row.type, "article_reference.reference_type"),
      source: requiredText(row.source, "article_reference.source"),
      ref_id: requiredText(row.refId ?? row.ref_id, "article_reference.ref_id"),
      position: nonNegativeInteger(row.position, "article_reference.position"),
      added_at: optionalIso(row.addedAt ?? row.added_at),
      metadata: metadata(row.metadata ?? row.meta)
    });
  }

  const PROJECTORS = Object.freeze({
    conversation: canonicalConversation,
    message: canonicalMessage,
    source_event: canonicalSourceEvent,
    insight: canonicalInsight,
    concept_list: canonicalConceptList,
    concept_list_item: canonicalConceptListItem,
    knowledge_path: canonicalKnowledgePath,
    knowledge_path_step: canonicalKnowledgePathStep,
    article: canonicalArticle,
    article_reference: canonicalArticleReference
  });

  function toCanonicalPayload(objectType, localRecord, options = {}) {
    const store = resolveStore(options);
    const type = store.assertSyncableObjectType(objectType);
    const row = obj(localRecord);
    const projector = PROJECTORS[type];
    if (!projector) throw new Error(`unsupported canonical sync object type: ${type}`);
    return projector(row);
  }

  function isDeleted(localRecord) {
    const row = obj(localRecord);
    return Boolean(text(row.deletedAt ?? row.deleted_at)) || text(row.status) === "deleted";
  }

  function baseRevisionKey(objectType, objectId) { return `${objectType}:${objectId}`; }
  function resolveBaseRevision(objectType, objectId, localRecord, options = {}) {
    if (options.baseRevision !== undefined) return nonNegativeInteger(options.baseRevision, "baseRevision");
    const row = obj(localRecord);
    for (const candidate of [row.canonicalRevision, row.canonical_revision, row.baseRevision, row.base_revision, row.revision]) {
      if (candidate !== undefined && candidate !== null && candidate !== "") return nonNegativeInteger(candidate, "baseRevision");
    }
    const revisions = options.baseRevisions;
    if (typeof revisions === "function") return nonNegativeInteger(revisions(objectType, objectId, clone(row)) ?? 0, "baseRevision");
    if (revisions instanceof Map) return nonNegativeInteger(revisions.get(baseRevisionKey(objectType, objectId)) ?? revisions.get(objectId) ?? 0, "baseRevision");
    if (revisions && typeof revisions === "object") {
      const direct = revisions[baseRevisionKey(objectType, objectId)];
      const nested = revisions[objectType] && revisions[objectType][objectId];
      return nonNegativeInteger(direct ?? nested ?? revisions[objectId] ?? 0, "baseRevision");
    }
    return 0;
  }

  async function prepareRecord(objectType, localRecord, options = {}) {
    const { hash, store } = resolveDependencies(options);
    const type = store.assertSyncableObjectType(objectType);
    const row = obj(localRecord);
    const objectId = requiredText(row.id, `${type}.id`);
    const operation = isDeleted(row) ? "delete" : "upsert";
    const payload = operation === "delete" ? null : PROJECTORS[type](row);
    const payloadHash = await hash.canonicalSyncPayloadHash(payload, options.hashOptions || {});
    const event = {
      workspaceId: requiredText(options.workspaceId, "workspaceId"),
      deviceId: requiredText(options.deviceId, "deviceId"),
      objectType: type,
      objectId,
      operation,
      baseRevision: resolveBaseRevision(type, objectId, row, options),
      payloadHash,
      payload,
      createdAt: options.createdAt || undefined
    };
    return store.normalizeOutboxEvent ? store.normalizeOutboxEvent(event) : event;
  }

  function recordsFromPlan(plan) {
    const source = obj(plan);
    const records = [];
    for (const [objectType, collectionName] of PLAN_COLLECTIONS) {
      for (const localRecord of arr(source[collectionName])) records.push({ objectType, localRecord });
    }
    return records;
  }

  async function preparePlan(plan, options = {}) {
    const records = recordsFromPlan(plan);
    const nowValue = options.now instanceof Date ? options.now.getTime() : Number(options.now ?? Date.now());
    if (!Number.isFinite(nowValue)) throw new Error("now must resolve to a finite timestamp");
    const firstCreatedAt = nowValue - Math.max(0, records.length - 1);
    const events = [];
    for (let index = 0; index < records.length; index += 1) {
      const { objectType, localRecord } = records[index];
      events.push(await prepareRecord(objectType, localRecord, {
        ...options,
        createdAt: new Date(firstCreatedAt + index).toISOString(),
        baseRevision: undefined
      }));
    }
    return events;
  }

  function buildLocalPlan(snapshot, options = {}) {
    const localModels = options.localModels || global.AHALocalAccountImport;
    if (!localModels || typeof localModels.buildPlan !== "function") throw new Error("AHALocalAccountImport.buildPlan unavailable");
    return localModels.buildPlan(snapshot);
  }

  async function prepareSnapshot(snapshot, options = {}) {
    return preparePlan(buildLocalPlan(snapshot, options), options);
  }

  async function enqueuePrepared(events, options = {}) {
    const store = resolveStore(options, true);
    const normalized = arr(events).map((event) => store.normalizeOutboxEvent ? store.normalizeOutboxEvent(event) : clone(event));
    const results = [];
    for (const event of normalized) results.push(await store.enqueue(event, options.storeOptions || {}));
    return results;
  }

  async function enqueueRecord(objectType, localRecord, options = {}) {
    const prepared = await prepareRecord(objectType, localRecord, options);
    const results = await enqueuePrepared([prepared], options);
    return results[0];
  }

  async function enqueuePlan(plan, options = {}) {
    const prepared = await preparePlan(plan, options);
    await enqueuePrepared(prepared, options);
    return prepared;
  }

  async function enqueueSnapshot(snapshot, options = {}) {
    const prepared = await prepareSnapshot(snapshot, options);
    await enqueuePrepared(prepared, options);
    return prepared;
  }

  function getStatus() {
    return {
      version: VERSION,
      canonicalObjectTypes: CANONICAL_OBJECT_TYPES.slice(),
      localPlanCollections: PLAN_COLLECTIONS.map(([, collectionName]) => collectionName),
      networkEnabled: false,
      autoSync: false,
      loginTriggersSync: false,
      requiresExplicitUserAction: true,
      legacySyncRoutesUsed: false,
      localMapper: "AHALocalAccountImport.buildPlan"
    };
  }

  const api = Object.freeze({
    VERSION,
    CANONICAL_OBJECT_TYPES,
    PLAN_COLLECTIONS,
    toCanonicalPayload,
    isDeleted,
    baseRevisionKey,
    resolveBaseRevision,
    recordsFromPlan,
    buildLocalPlan,
    prepareRecord,
    preparePlan,
    prepareSnapshot,
    enqueuePrepared,
    enqueueRecord,
    enqueuePlan,
    enqueueSnapshot,
    getStatus
  });

  global.AHACanonicalFrontendSyncAdapter = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
