// AHA Local Demo Seed V1
// Synthetic local-only example data. This file performs no writes by itself.
(function (global) {
  "use strict";

  const seedId = "aha_local_demo_seed_v1";
  const createdAt = "2026-10-09T10:30:00.000Z";

  const mark = (item) => ({
    ...item,
    demo_seed_id: seedId,
    meta: {
      ...(item.meta && typeof item.meta === "object" ? item.meta : {}),
      demo_seed_id: seedId,
      local_only: true,
      synthetic_example: true
    }
  });

  const pack = {
    seed_id: seedId,
    version: 1,
    local_only: true,
    synthetic_example: true,
    created_at: createdAt,
    stores: [
      {
        key: "aha_notes_v1",
        kind: "array",
        items: [
          mark({
            id: "demo_seed_note_byrom",
            title: "Byrom, institusjoner og offentlighet",
            text: "Eksempelnotat: Et byrom formes både av fysisk utforming, institusjoner og måten mennesker bruker stedet på. Det er nyttig å skille mellom hvem som planlegger rommet, hvem som regulerer det, og hvordan offentligheten faktisk oppstår i bruk.",
            tags: ["demo", "byrom", "institusjoner", "offentlighet"],
            created_at: createdAt,
            updated_at: createdAt
          })
        ]
      },
      {
        key: "aha_chat_sessions_v1",
        kind: "array",
        items: [
          mark({
            id: "demo_seed_chat_session",
            type: "aha_chat_session",
            title: "Hvordan institusjoner former byrom",
            createdAt,
            updatedAt: createdAt,
            source: "aha_chat",
            messages: [
              mark({
                id: "demo_seed_chat_user",
                type: "chat_message",
                role: "user",
                text: "Hvordan kan jeg forstå forholdet mellom institusjoner, byrom og offentlighet?",
                createdAt,
                sessionId: "demo_seed_chat_session",
                source: "aha_chat",
                concepts: ["institusjoner", "byrom", "offentlighet"]
              }),
              mark({
                id: "demo_seed_chat_assistant",
                type: "chat_message",
                role: "assistant",
                text: "En nyttig start er å se byrommet som et møte mellom regler, fysisk utforming og faktisk bruk. Institusjoner setter rammer, mens offentligheten blir synlig i hvordan mennesker tar rommet i bruk.",
                createdAt: "2026-10-09T10:30:01.000Z",
                sessionId: "demo_seed_chat_session",
                source: "aha_chat",
                concepts: ["institusjoner", "byrom", "offentlighet"]
              })
            ]
          })
        ]
      },
      {
        key: "aha_source_events_v1",
        kind: "array",
        items: [
          mark({
            id: "demo_seed_source_note_byrom",
            source_type: "note",
            source_app: "aha_notes",
            content_type: "text",
            title: "Byrom, institusjoner og offentlighet",
            text: "Syntetisk eksempelmateriale om hvordan institusjoner og fysisk utforming påvirker offentlig bruk av byrom.",
            user_created: false,
            imported: false,
            created_at: createdAt
          })
        ]
      },
      {
        key: "aha_insight_chamber_v1",
        kind: "object_array",
        field: "insights",
        items: [
          mark({
            id: "demo_seed_insight_byrom",
            subject_id: "demo_seed_subject_byrom",
            theme_id: "byrom",
            title: "Institusjoner setter rammer for offentligheten",
            summary: "Eksempelinnsikt: Byrommets offentlighet kan analyseres som et samspill mellom institusjonelle regler, fysisk utforming og faktisk bruk.",
            theme: "Byrom og institusjoner",
            concepts: ["byrom", "institusjoner", "offentlighet"],
            source_event_ids: ["demo_seed_source_note_byrom"],
            status: "suggested",
            first_seen: createdAt,
            last_updated: createdAt,
            local_only: true
          })
        ]
      },
      {
        key: "aha_training_corpus_v1",
        kind: "array",
        items: [
          mark({
            id: "demo_seed_corpus_byrom",
            type: "training_corpus_item",
            sourceType: "manual_text",
            sourceId: "demo_seed_note_byrom",
            title: "Godkjent demo-grunnlag: byrom",
            text: "Byrom formes av fysiske strukturer, institusjonelle rammer og faktisk bruk. En analyse bør skille mellom planlegging, regulering og offentlig praksis.",
            status: "approved",
            language: "no",
            project: "AHA demo",
            concepts: ["byrom", "institusjoner", "offentlighet"],
            createdAt,
            updatedAt: createdAt,
            consent: {
              useForMemory: false,
              useForTrainingExamples: true,
              useForFineTuning: false,
              useForStyle: false,
              useForKnowledge: true
            }
          })
        ]
      },
      {
        key: "aha_training_examples_v1",
        kind: "array",
        items: [
          mark({
            id: "demo_seed_example_byrom",
            type: "training_example",
            corpusItemId: "demo_seed_corpus_byrom",
            taskType: "concept_explanation",
            input: "Hva betyr det at institusjoner former et byrom?",
            output: "Det betyr at regler, eierskap, planlegging og organisering påvirker hva som kan skje i rommet, samtidig som den faktiske bruken kan utfordre eller endre disse rammene.",
            status: "approved",
            language: "no",
            createdAt,
            updatedAt: createdAt,
            meta: {
              project: "AHA demo",
              concepts: ["byrom", "institusjoner"]
            }
          })
        ]
      },
      {
        key: "aha_personal_answer_evaluations_v1",
        kind: "array",
        items: [
          mark({
            id: "demo_seed_answer_evaluation",
            query: "Hvordan henger institusjoner og byrom sammen?",
            summary: "Demo-evaluering: svaret brukte lokalt godkjent eksempelmateriale og holdt skillet mellom institusjonelle rammer og faktisk bruk.",
            score: 88,
            createdAt,
            updatedAt: createdAt
          })
        ]
      }
    ],
    optional_scalars: [
      {
        key: "aha_chat_current_session_v1",
        value: "demo_seed_chat_session",
        set_only_if_empty: true
      }
    ]
  };

  global.AHA_LOCAL_DEMO_SEED_V1 = Object.freeze(pack);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = global.AHA_LOCAL_DEMO_SEED_V1;
  }
})(typeof window !== "undefined" ? window : globalThis);
