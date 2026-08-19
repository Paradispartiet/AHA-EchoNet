# AHA SemanticDocument V1

## Status

`SemanticDocumentV1` bygges fortsatt i **shadow mode**. Phase 1C er nå implementert i runtime:

```text
Phase 1A: evidence anchors                 implemented
Phase 1B: entities + concepts              implemented in shadow
Phase 1C: claims + structural relations    implemented in shadow
Dedicated semantic model contract          not authoritative yet
Synthesized canonical insights             blocked
Persistent SemanticDocument write          disabled
Visible product behavior                    unchanged
```

Modulgrensen er fortsatt:

```text
AHASemanticDocument
AHAModuleApi: semanticDocument@1
```

Modulen er fysisk samlokalisert med `js/ahaChatIngestRuntime.js`, men har et separat offentlig API slik at den senere kan flyttes uten kontraktsbrudd.

---

## 1. Rolle i canonical flyt

Målarkitekturen er:

```text
SourceEvent
→ SemanticDocument
→ semantic quality gate
→ synthesized Insight candidate(s)
→ insightsChamber
→ Meta / produkter
```

Shadow-flyten er nå:

```text
SourceEvent
├─→ dagens canonical candidate/Insight-flow
└─→ SemanticDocumentV1 shadow
    ├─ evidence anchors
    ├─ entities
    ├─ concepts
    ├─ source claims
    └─ structural relations
```

`SemanticDocumentV1` skriver fortsatt ikke til canonical Insight eller Meta.

---

## 2. Nåværende kontrakt

```text
SemanticDocumentV1 {
  id
  schema = "aha_semantic_document_v1"
  version = 1
  mode = "shadow"
  status = "claims_relations_shadow"

  source_event_id?
  source_text_hash
  source_text_hash_algorithm = "sha256"
  source_type
  language

  analyzer_origin
  analyzer_version

  evidence_anchors[]
  entities[]
  concepts[]
  claims[]
  relations[]

  tensions = []
  candidate_insights = []

  quality
  provenance
}
```

Phase 1C åpner `claims` og `relations`, men bare for semantikk som er direkte forankret i kilden. `tensions` og `candidate_insights` er fortsatt hardt blokkert.

---

## 3. Source identity og evidence anchors

`source_text_hash` er SHA-256 over nøyaktig source text i UTF-8.

```text
EvidenceAnchor {
  id
  index
  start_offset
  end_offset
  text
}
```

Hard invariant:

```text
source_text.slice(start_offset, end_offset) === anchor.text
```

Samme offset-invariant gjelder Entity/Concept mentions, Claim spans og Relation evidence spans.

---

## 4. Entities V1

```text
EntityV1 {
  id
  label
  normalized_key
  type
  evidence_anchor_ids[]
  mentions[]
  canonical_matches[]
  source
}
```

Entities materialiseres bare når termen faktisk står i source. Subject Engine kan gi canonical klassifisering/støtte, men får ikke skape source evidence.

---

## 5. Concepts V1

```text
ConceptV1 {
  id
  label
  normalized_key
  source_term
  evidence_anchor_ids[]
  mentions[]
  canonical_matches[]
  source
}
```

Concepts er fortsatt canonical-first og konservative:

```text
Subject Engine/Fagverk match
+ literal source mention
+ concept quality gate
= ConceptV1
```

Et Concept uten canonical reference support validerer ikke.

---

## 6. Claims V1

Phase 1C introduserer **source claims**, ikke modellgenererte påstander.

```text
ClaimV1 {
  id
  kind = "source_claim"
  text
  normalized_key
  epistemic_status = "source_explicit"
  interpretation_status = "not_interpreted"
  evidence_anchor_ids[]
  spans[]
  mentioned_entity_ids[]
  mentioned_concept_ids[]
  source = "literal_source_sentence"
}
```

Første extractor er bevisst streng:

- claim er en eksakt setningsslice fra source
- spørsmål blir ikke claims
- korte fragmenter blir ikke claims
- Phase 1C bruker punktum-avsluttede eksplisitte source-setninger
- ingen parafrase
- ingen modellfortolkning
- ingen inference

Hard invariant:

```text
claim.text === claim.spans[0].text
source_text.slice(start_offset, end_offset) === claim.text
```

Dette er ikke den endelige semantiske claim-extractoren. Det er et trygt source-grounded kontraktslag som den dedikerte semantiske modellen senere må forbedre uten å bryte provenance.

---

## 7. Relations V1

Phase 1C tillater bare to strukturelle relasjonstyper:

```text
claim_mentions_entity
claim_mentions_concept
```

Shape:

```text
RelationV1 {
  id
  type
  from_id = claim.id
  to_id = entity.id | concept.id
  epistemic_status = "source_structural"
  evidence_anchor_ids[]
  evidence_spans[]
  source = "co_occurrence_within_source_claim"
}
```

En relasjon opprettes bare når en Entity/Concept mention faktisk ligger innenfor Claim-spennet.

Phase 1C tillater **ikke** semantiske/infererte relasjonstyper som:

```text
causes
supports
contradicts
explains
implies
influences
```

Slike relasjoner krever senere en eksplisitt semantic model/inference-policy med evidence og epistemisk merking. De skal ikke gjette seg frem fra co-occurrence.

---

## 8. Epistemisk skille

Phase 1C låser tre kategorier i arkitekturen:

```text
source claim
interpretation
unresolved inference
```

Men runtime genererer foreløpig bare:

```text
kind = source_claim
epistemic_status = source_explicit
interpretation_status = not_interpreted
```

Quality gate krever derfor:

```text
interpretation_count = 0
unresolved_inference_count = 0
```

Det skal være umulig å få en modellfortolkning inn i source-claim-laget ved å gi den et mer overbevisende språk.

---

## 9. Semantic quality gate

`quality.semantic_quality_gate` er nå eksplisitt:

```text
stage = "claims_relations_shadow"
source_grounded = true
structural_relations_only = true
interpretation_count = 0
unresolved_inference_count = 0
synthesis_allowed = false
```

`synthesis_allowed` skal være `false` selv når hele dokumentet ellers validerer.

Nåværende blocking reasons er:

```text
dedicated_semantic_model_not_authoritative
synthesized_insight_quality_gate_not_implemented
```

Dermed kan Phase 1C bevise source-semantikken uten at resultatet automatisk blir presentert som en ny AHA Insight.

---

## 10. Subject Engine og Fagverk-provenance

Fagverk forblir **reference support**, ikke source evidence.

```text
Source offsets
= hva brukerens/kildens tekst faktisk inneholder

Subject Engine / Fagverk
= støtte for canonicalisering og faglig referanseramme
```

Denne separasjonen gjelder nå også Claim/Relation-laget: relasjoner bygges fra source spans, ikke fra at Fagverket assosierer to ting.

---

## 11. Asynkron enrichment og race-safety

Subject Engine enrichment kan være asynkron. Dagens `handleUserMessage(...)`-returkontrakt forblir synkron.

En monoton shadow-sekvens hindrer eldre, tregere analyser i å overskrive nyere SemanticDocument-status.

Phase 1C kjører etter Entity/Concept enrichment i samme shadow-jobb:

```text
source
→ evidence
→ Subject Engine reference matching
→ entities/concepts
→ source claims
→ structural relations
→ validation
→ in-memory shadow recorder
```

---

## 12. Validatorens Phase 1C-invarianter

Validatoren krever blant annet:

- gyldig schema/version/mode/status
- SHA-256 source identity
- eksakte evidence anchors
- eksakte Entity/Concept mentions
- Concept har canonical reference support
- Claim har `kind: source_claim`
- Claim har `epistemic_status: source_explicit`
- Claim har `interpretation_status: not_interpreted`
- Claim har nøyaktig ett source span i Phase 1C
- Claim text er identisk med source span
- Claim entity/concept-ID-er peker på eksisterende semantic items
- Relation type er i den strukturelle allowlisten
- Relation starter i eksisterende Claim
- Relation target finnes og har riktig type
- Relation evidence inneholder både Claim-spennet og target mention i samme Claim
- semantic quality gate blokkerer synthesis
- `tensions` og `candidate_insights` er tomme
- ingen assistant/chat response dependency
- ingen persistent/canonical write

---

## 13. Shadow safety

Fortsatt:

```text
canonical_write = false
persistent_write = false
visible_output_changed = false
```

SemanticDocument lagres ikke til localStorage, Supabase, canonical sync, Insight Chamber eller Meta.

`aha:semantic-document-shadow` sender bare metadata:

- schema/version/status
- source event-id/hash
- anchor/entity/concept/claim/relation counts
- `synthesis_allowed`

Rå source eller semantisk innhold sendes ikke i eventet.

---

## 14. Neste implementeringsetappe

Neste fase er den **dedikerte semantiske modellkontrakten** i den eksisterende AHA-agent-backenden.

Målet er å gå fra den nå deterministiske, konservative shadow-analysen til strukturert modell-output for:

- richer entities/concepts
- source-grounded propositions
- typed semantic relations
- eksplisitte interpretations/inferences
- confidence/uncertainty
- evidence bindings

Den nye modellen skal ikke få omgå Phase 1A–1C-invariantene. Modelloutput må valideres inn i samme SemanticDocument-kontrakt før synthesized Insight quality gate kan åpnes.
