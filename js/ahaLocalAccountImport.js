// AHA Local Account Import v1
// Builds an account-import preview and canonical plan entirely on-device.
// This module never performs network I/O. Raw local-only/deferred data is never
// included in the confirmation descriptor or commit payload.
(function (global) {
  "use strict";

  const VERSION = "aha_local_account_import_v1";
  const PLAN_VERSION = "aha_local_import_plan_v1";
  const SOURCE_KIND = "aha_local_backup";
  const SOURCE_VERSION = "v1";

  const SUPPORTED_KEYS = Object.freeze([
    "aha_chat_sessions_v1",
    "aha_source_events_v1",
    "aha_insight_chamber_v1",
    "aha_concept_lists_v1",
    "aha_paths_v1",
    "aha_articles_v1"
  ]);

  const EXCLUDED_KEYS = Object.freeze([
    "aha_lists_v1",
    "aha_notes_v1",
    "aha_gallery_v1",
    "aha_feed_posts_v1",
    "aha_insta_posts_v1",
    "aha_insta_stories_v1",
    "aha_insta_profile_v1",
    "aha_insta_likes_v1",
    "aha_insta_comments_v1",
    "aha_insta_follows_v1",
    "aha_groups_v1",
    "aha_music_library_v1",
    "aha_music_history_go_bridge_v1",
    "aha_music_historygo_bridge_v1",
    "aha_music_export_audit_v1",
    "aha_training_corpus_v1",
    "aha_training_examples_v1",
    "aha_personal_ai_control_status_v1",
    "aha_personal_retrieval_index_v1",
    "aha_personal_semantic_index_v1",
    "aha_personal_ai_loop_audit_v1",
    "aha_personal_answer_evaluations_v1",
    "aha_data_intake_queue_v1",
    "aha_knowledge_curation_v1",
    "aha_knowledge_map_v1",
    "aha_knowledge_workbench_status_v1",
    "aha_knowledge_graph_intelligence_v1"
  ]);

  function text(value) { return String(value ?? "").trim(); }
  function arr(value) { return Array.isArray(value) ? value : []; }
  function obj(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
  function numberOrNull(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
  function iso(value) {
    const raw = text(value);
    if (!raw) return null;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  function safeParse(raw, fallback) {
    if (raw == null || raw === "") return fallback;
    try { const parsed = JSON.parse(raw); return parsed == null ? fallback : parsed; }
    catch { return fallback; }
  }
  function cleanArray(value) { return arr(value).filter((item) => item !== null && item !== undefined); }
  function uniqueText(value) {
    const seen = new Set();
    return cleanArray(value).map((item) => text(item?.name ?? item?.label ?? item)).filter(Boolean).filter((item) => {
      const key = item.toLocaleLowerCase("nb-NO");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  function safeMeta(value, omitted = []) {
    const source = obj(value);
    const deny = new Set(omitted);
    return Object.fromEntries(Object.entries(source).filter(([key]) => !deny.has(key)));
  }

  function stableValue(value) {
    if (Array.isArray(value)) return value.map(stableValue);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
    }
    return value;
  }
  function stableStringify(value) { return JSON.stringify(stableValue(value)); }
  async function sha256(value, cryptoImpl = global.crypto) {
    if (!cryptoImpl?.subtle?.digest) throw new Error("Web Crypto SHA-256 is required for account import preview");
    const bytes = new TextEncoder().encode(typeof value === "string" ? value : stableStringify(value));
    const digest = await cryptoImpl.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function snapshotFromStorage(storage = global.localStorage) {
    if (!storage) throw new Error("localStorage is unavailable");
    const snapshot = {};
    for (const key of SUPPORTED_KEYS) {
      const raw = storage.getItem(key);
      if (key === "aha_insight_chamber_v1") snapshot[key] = safeParse(raw, { insights: [] });
      else snapshot[key] = safeParse(raw, []);
    }
    return snapshot;
  }

  function snapshotFromBackup(backup) {
    const source = obj(backup);
    const snapshot = {};
    for (const key of SUPPORTED_KEYS) {
      const value = source[key];
      if (key === "aha_insight_chamber_v1") snapshot[key] = obj(value);
      else snapshot[key] = arr(value);
    }
    return snapshot;
  }

  function excludedPresenceFromStorage(storage = global.localStorage) {
    if (!storage) return [];
    return EXCLUDED_KEYS.filter((key) => {
      try { return storage.getItem(key) !== null; } catch { return false; }
    });
  }

  function excludedPresenceFromBackup(backup) {
    const source = obj(backup);
    return EXCLUDED_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(source, key));
  }

  function mapChatSessions(value) {
    const conversations = [];
    const messages = [];
    for (const session of arr(value)) {
      const source = obj(session);
      const id = text(source.id);
      if (!id) continue;
      conversations.push({
        id,
        title: text(source.title) || "AHA Chat session",
        conversationType: "personal_ai",
        sourceApp: text(source.source) || "aha_chat",
        metadata: safeMeta(source.meta),
        createdAt: iso(source.createdAt || source.created_at),
        updatedAt: iso(source.updatedAt || source.updated_at),
        deletedAt: iso(source.deletedAt || source.deleted_at)
      });
      for (const message of arr(source.messages)) {
        const row = obj(message);
        const messageId = text(row.id);
        const content = text(row.text || row.message || row.content);
        if (!messageId || !content) continue;
        const role = ["user", "assistant", "system", "tool"].includes(text(row.role)) ? text(row.role) : "user";
        messages.push({
          id: messageId,
          conversationId: id,
          role,
          content,
          sourceApp: text(row.source) || "aha_chat",
          intent: text(row.intent) || null,
          project: text(row.project) || null,
          tags: uniqueText(row.tags),
          concepts: uniqueText(row.concepts),
          metadata: safeMeta(row.meta),
          createdAt: iso(row.createdAt || row.created_at),
          updatedAt: iso(row.updatedAt || row.updated_at),
          deletedAt: iso(row.deletedAt || row.deleted_at)
        });
      }
    }
    return { conversations, messages };
  }

  function mapSourceEvents(value) {
    return arr(value).map((item) => {
      const row = obj(item);
      const id = text(row.id);
      if (!id) return null;
      return {
        id,
        conversationId: text(row.conversation_id || row.conversationId) || null,
        messageId: text(row.message_id || row.messageId) || null,
        sourceType: text(row.source_type || row.sourceType) || "unknown",
        sourceApp: text(row.source_app || row.sourceApp) || "aha",
        contentType: text(row.content_type || row.contentType) || "text",
        title: text(row.title) || null,
        sourceText: text(row.text || row.source_text || row.sourceText),
        userCreated: row.user_created === true || row.userCreated === true,
        imported: row.imported === true,
        occurredAt: iso(row.created_at || row.createdAt || row.occurred_at || row.occurredAt),
        tags: uniqueText(row.tags),
        provenance: obj(row.provenance),
        metadata: obj(row.meta || row.metadata),
        deletedAt: iso(row.deleted_at || row.deletedAt)
      };
    }).filter(Boolean);
  }

  function readInsightText(row) { return text(row.text || row.content || row.claim || row.summary); }
  function mapInsights(chamber) {
    return arr(obj(chamber).insights).map((item) => {
      const row = obj(item);
      const id = text(row.id);
      if (!id) return null;
      const title = text(row.title || row.heading || row.label) || "AHA-innsikt";
      const summary = text(row.summary) || readInsightText(row).slice(0, 500);
      const insightText = readInsightText(row) || summary || title;
      return {
        id,
        sourceEventId: text(row.source_event_id || row.sourceEventId || row.source_id || row.sourceId || row.event_id || row.eventId) || null,
        subjectId: text(row.subject_id || row.subjectId || row.subject) || null,
        themeId: text(row.theme_id || row.themeId || row.theme || row.topic || row.emne || row.category) || null,
        functionalType: text(row.functional_type || row.functionalType) || null,
        status: ["active", "superseded", "contested", "stale", "irrelevant", "archived", "deleted"].includes(text(row.status)) ? text(row.status) : "active",
        sharingScope: "private",
        title,
        summary,
        insightText,
        concepts: uniqueText([...(arr(row.concepts)), ...(arr(row.terms)), ...(arr(row.keywords))]),
        confidence: numberOrNull(row.confidence ?? row.score),
        provenance: obj(row.provenance),
        metadata: {
          ...obj(row.meta),
          importedFromLocalChamber: true,
          thinkers: arr(row.thinkers),
          theories: arr(row.theories),
          traditions: arr(row.traditions),
          theoretical_links: arr(row.theoretical_links),
          emne_suggestions: arr(row.emne_suggestions),
          merge_suggestions: arr(row.merge_suggestions)
        },
        createdAt: iso(row.created_at || row.createdAt || row.first_seen || row.firstSeen),
        updatedAt: iso(row.updated_at || row.updatedAt || row.last_updated || row.lastUpdated),
        deletedAt: iso(row.deleted_at || row.deletedAt)
      };
    }).filter(Boolean);
  }

  function mapConceptLists(value) {
    const conceptLists = [];
    const conceptListItems = [];
    for (const item of arr(value)) {
      const row = obj(item);
      const id = text(row.id);
      if (!id) continue;
      conceptLists.push({
        id,
        title: text(row.title) || "Begrepsliste",
        listType: text(row.type || row.listType) || "concepts",
        description: text(row.description),
        source: text(row.source) || "aha_concept_lists",
        sharingScope: "private",
        tags: uniqueText(row.tags),
        metadata: obj(row.meta),
        createdAt: iso(row.createdAt || row.created_at),
        updatedAt: iso(row.updatedAt || row.updated_at),
        deletedAt: iso(row.deletedAt || row.deleted_at)
      });
      const terms = arr(row.terms);
      terms.forEach((termValue, index) => {
        const term = typeof termValue === "string" ? { term: termValue } : obj(termValue);
        const termText = text(term.term || term.title || term.name);
        if (!termText) return;
        conceptListItems.push({
          id: text(term.id) || `${id}:term:${index + 1}`,
          listId: id,
          title: termText,
          itemType: "concept",
          source: "aha_concept_lists",
          refId: text(term.refId || term.ref_id) || null,
          position: index,
          addedAt: iso(term.addedAt || term.added_at || row.createdAt || row.created_at),
          metadata: {
            ...obj(term.meta),
            definition: text(term.definition) || null,
            relation: text(term.relation) || null
          },
          deletedAt: iso(term.deletedAt || term.deleted_at)
        });
      });
    }
    return { conceptLists, conceptListItems };
  }

  function mapPaths(value) {
    const knowledgePaths = [];
    const knowledgePathSteps = [];
    for (const item of arr(value)) {
      const row = obj(item);
      const id = text(row.id);
      if (!id) continue;
      knowledgePaths.push({
        id,
        title: text(row.title) || "Kunnskapssti",
        pathType: text(row.type || row.pathType) || "learning",
        description: text(row.description),
        goal: text(row.goal) || null,
        learningOutcome: text(row.learningOutcome || row.learning_outcome) || null,
        source: text(row.source) || "aha_paths",
        sharingScope: "private",
        tags: uniqueText(row.tags),
        metadata: { ...obj(row.meta), mode: text(row.mode) || null, category: text(row.category) || null },
        createdAt: iso(row.createdAt || row.created_at),
        updatedAt: iso(row.updatedAt || row.updated_at),
        deletedAt: iso(row.deletedAt || row.deleted_at)
      });
      arr(row.steps).forEach((stepValue, index) => {
        const step = obj(stepValue);
        const title = text(step.title);
        if (!title) return;
        knowledgePathSteps.push({
          id: text(step.id) || `${id}:step:${index + 1}`,
          pathId: id,
          title,
          stepType: text(step.type || step.stepType) || "item",
          source: text(step.source) || "aha_paths",
          refId: text(step.refId || step.ref_id) || null,
          position: Number.isInteger(Number(step.order)) ? Number(step.order) : index,
          status: ["planned", "active", "done", "skipped"].includes(text(step.status)) ? text(step.status) : "planned",
          narrative: text(step.narrative) || null,
          learningOutcome: text(step.learningOutcome || step.learning_outcome) || null,
          completionCriterion: text(step.completionCriterion || step.completion_criterion) || null,
          addedAt: iso(step.addedAt || step.added_at || row.createdAt || row.created_at),
          metadata: obj(step.meta),
          deletedAt: iso(step.deletedAt || step.deleted_at)
        });
      });
    }
    return { knowledgePaths, knowledgePathSteps };
  }

  function mapArticles(value) {
    const articles = [];
    const articleReferences = [];
    for (const item of arr(value)) {
      const row = obj(item);
      const id = text(row.id);
      if (!id) continue;
      articles.push({
        id,
        title: text(row.title) || "AHAavisa-utkast",
        section: text(row.section) || "aha",
        status: ["draft", "review", "ready", "published_local"].includes(text(row.status)) ? text(row.status) : "draft",
        publicationScope: ["personal", "group", "public_candidate"].includes(text(row.publicationLayer || row.publication_layer)) ? text(row.publicationLayer || row.publication_layer) : "personal",
        summary: text(row.summary),
        body: text(row.body),
        source: text(row.source) || "aha_avisa",
        tags: uniqueText(row.tags),
        metadata: obj(row.meta),
        createdAt: iso(row.createdAt || row.created_at),
        updatedAt: iso(row.updatedAt || row.updated_at),
        deletedAt: iso(row.deletedAt || row.deleted_at)
      });
      arr(row.references).forEach((refValue, index) => {
        const ref = obj(refValue);
        const title = text(ref.title);
        if (!title) return;
        articleReferences.push({
          id: text(ref.id) || `${id}:ref:${index + 1}`,
          articleId: id,
          title,
          referenceType: text(ref.type || ref.referenceType) || "reference",
          source: text(ref.source) || "aha_avisa",
          refId: text(ref.refId || ref.ref_id) || null,
          position: index,
          addedAt: iso(ref.addedAt || ref.added_at || row.createdAt || row.created_at),
          metadata: obj(ref.meta),
          deletedAt: iso(ref.deletedAt || ref.deleted_at)
        });
      });
    }
    return { articles, articleReferences };
  }

  function buildPlan(snapshot) {
    const source = obj(snapshot);
    const chat = mapChatSessions(source.aha_chat_sessions_v1);
    const concept = mapConceptLists(source.aha_concept_lists_v1);
    const paths = mapPaths(source.aha_paths_v1);
    const articles = mapArticles(source.aha_articles_v1);
    return {
      version: PLAN_VERSION,
      sourceKind: SOURCE_KIND,
      sourceVersion: SOURCE_VERSION,
      conversations: chat.conversations,
      messages: chat.messages,
      sourceEvents: mapSourceEvents(source.aha_source_events_v1),
      insights: mapInsights(source.aha_insight_chamber_v1),
      conceptLists: concept.conceptLists,
      conceptListItems: concept.conceptListItems,
      knowledgePaths: paths.knowledgePaths,
      knowledgePathSteps: paths.knowledgePathSteps,
      articles: articles.articles,
      articleReferences: articles.articleReferences
    };
  }

  function countsForPlan(plan) {
    const source = obj(plan);
    const keys = ["conversations", "messages", "sourceEvents", "insights", "conceptLists", "conceptListItems", "knowledgePaths", "knowledgePathSteps", "articles", "articleReferences"];
    const counts = Object.fromEntries(keys.map((key) => [key, arr(source[key]).length]));
    counts.total = keys.reduce((sum, key) => sum + counts[key], 0);
    return counts;
  }

  async function buildPreviewFromSnapshot(snapshot, options = {}) {
    const normalizedSnapshot = snapshotFromBackup(snapshot);
    const plan = buildPlan(normalizedSnapshot);
    const payloadHash = await sha256(normalizedSnapshot, options.crypto || global.crypto);
    const planHash = await sha256(plan, options.crypto || global.crypto);
    const counts = countsForPlan(plan);
    const excludedKeysPresent = arr(options.excludedKeysPresent).filter((key) => EXCLUDED_KEYS.includes(key));
    return Object.freeze({
      version: VERSION,
      sourceKind: SOURCE_KIND,
      sourceVersion: SOURCE_VERSION,
      payloadHash,
      planHash,
      counts: Object.freeze({ ...counts }),
      excludedKeysPresent: Object.freeze([...excludedKeysPresent]),
      excludedDataUploaded: false,
      requiresExplicitConfirmation: true,
      plan
    });
  }

  async function buildPreviewFromStorage(options = {}) {
    const storage = options.storage || global.localStorage;
    return buildPreviewFromSnapshot(snapshotFromStorage(storage), {
      ...options,
      excludedKeysPresent: excludedPresenceFromStorage(storage)
    });
  }

  async function buildPreviewFromBackup(backup, options = {}) {
    return buildPreviewFromSnapshot(snapshotFromBackup(backup), {
      ...options,
      excludedKeysPresent: excludedPresenceFromBackup(backup)
    });
  }

  function confirmationDescriptor(preview) {
    const source = obj(preview);
    if (source.version !== VERSION || !text(source.payloadHash) || !text(source.planHash)) throw new Error("Invalid local import preview");
    return {
      sourceKind: SOURCE_KIND,
      sourceVersion: SOURCE_VERSION,
      payloadHash: source.payloadHash,
      planHash: source.planHash,
      counts: { ...obj(source.counts) }
    };
  }

  function buildCommitPayload(preview, confirmationToken, idempotencyKey) {
    const source = obj(preview);
    const token = text(confirmationToken);
    const idem = text(idempotencyKey);
    if (!token) throw new Error("confirmationToken is required");
    if (idem.length < 8) throw new Error("idempotencyKey must contain at least 8 characters");
    return {
      sourceKind: SOURCE_KIND,
      sourceVersion: SOURCE_VERSION,
      payloadHash: text(source.payloadHash),
      planHash: text(source.planHash),
      idempotencyKey: idem,
      confirmationToken: token,
      plan: source.plan
    };
  }

  global.AHALocalAccountImport = Object.freeze({
    VERSION,
    PLAN_VERSION,
    SOURCE_KIND,
    SOURCE_VERSION,
    SUPPORTED_KEYS,
    EXCLUDED_KEYS,
    stableStringify,
    sha256,
    snapshotFromStorage,
    snapshotFromBackup,
    buildPlan,
    countsForPlan,
    buildPreviewFromStorage,
    buildPreviewFromBackup,
    confirmationDescriptor,
    buildCommitPayload
  });
})(typeof window !== "undefined" ? window : globalThis);
