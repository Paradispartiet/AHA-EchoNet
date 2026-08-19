# AHA SemanticDocument V1

## Status

`SemanticDocumentV1` bygges fortsatt i **shadow mode**, men kontrakten er nå kommet til Phase 1B:

```text
Phase 1A: evidence anchors                 implemented
Phase 1B: entities + concepts              implemented in shadow
Phase 1C: claims + relations               not implemented
Synthesized canonical insights             blocked
Persistent SemanticDocument write          disabled
Visible product behavior                    unchanged
```

Modulgrensen er:

```text
AHASemanticDocument
AHAModuleApi: semanticDocument@1
```

Modulen er fortsatt fysisk samlokalisert med `js/ahaChatIngestRuntime.js`. Det offentlige modulgrensesnittet er separat, slik at koden senere kan flyttes til egen fil uten kontraktsbrudd.

---

## 1. Rolle i canonical flyt

Målarkitekturen er:

```text
SourceEvent
→ SemanticDocument
→ semantic quality gate
→ Insight candidate(s)
→ insightsChamber
→ Meta / produkter
```

Under shadow-migreringen kjører dagens produksjonsflyt parallelt:

```text
SourceEvent
├─→ dagens canonical candidate/Insight-flow
└─→ SemanticDocumentV1 shadow
    ├─ evidence anchors
    ├─ entities
    └─ concepts
```

`SemanticDocumentV1` er derfor ennå ikke canonical sannhet for Insights eller Meta.

---

## 2. Nåværende kontrakt

```text
SemanticDocumentV1 {
  id
  schema = "aha_semantic_document_v1"
  version = 1
  mode = "shadow"
  status = "entities_concepts_shadow"

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

  claims = []
  relations = []
  tensions = []
  candidate_insights = []

  quality
  provenance
}
```

Phase 1B åpner bare `entities` og `concepts`. De semantiske lagene som kan uttrykke påstander eller syntese er fortsatt hardt lukket av validatoren.

---

## 3. Source identity og evidence anchors

`source_text_hash` er SHA-256 over nøyaktig source text i UTF-8.

Evidence anchors segmenterer source deterministisk på avsnittsgrenser:

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

Anchor-ID-er avledes fra source hash + stabil indeks. Dermed kan entities, concepts og senere claims peke til stabilt kildebelegg i stedet for rekonstruert tekst.

---

## 4. Entities V1

Entity-shapen er:

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

En mention er alltid source-grounded:

```text
MentionV1 {
  anchor_id
  start_offset
  end_offset
  text
}
```

Hard invariant:

```text
source_text.slice(start_offset, end_offset) === mention.text
```

### Entity-kilder i Phase 1B

Runtime kan materialisere:

- flerordsnavn som faktisk står i source
- tydelige akronymer som faktisk står i source
- Subject Engine `thinker`-matches som faktisk står i source

Subject Engine kan oppgradere en kildeentity til f.eks. `type: "person"`, men får ikke opprette en entity som source ikke inneholder.

`canonical_matches` er **reference support**, ikke source evidence.

---

## 5. Concepts V1

Concept-shapen er:

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

Phase 1B er bevisst canonical-first og konservativ:

1. `AHASubjectEngine.matchText(source_text)` finner relevante canonical fag-/emnematcher.
2. Bare `matched_terms` som også finnes bokstavelig i source kan materialiseres som Concept.
3. Generiske/noise-termer filtreres.
4. Flerordsbegreper foretrekkes fremfor svak single-token-redundans i samme match.
5. En term som allerede er Entity blir ikke samtidig materialisert som Concept.
6. Et Concept må ha både source mention og canonical reference support.

Dette betyr at Phase 1B heller returnerer **for få** concepts enn å gjette seg til term-suppe.

Ugoverned concept discovery skal ikke improviseres med en ny parallell heuristikk. Rikere concept extraction kommer når den dedikerte semantiske modellkontrakten bygges.

---

## 6. Subject Engine og Fagverk-provenance

`AHASubjectEngine` er runtime-seamen for canonical støtte i denne fasen.

Subject Engine-provenance kan blant annet være:

```text
kind = "canonical_fagverk"
evidence_role = "reference_support_not_source_evidence"
```

Dette skillet er normativt:

```text
Source offsets
= bevis for at termen faktisk finnes i kilden

Subject Engine / Fagverk
= støtte for hva termen kan canonicaliseres/kobles til
```

Fagverk skal aldri brukes til å late som om noe sto i brukerens source når det ikke gjorde det.

---

## 7. Asynkron enrichment og race-safety

Subject Engine kan måtte laste fagdata før `matchText(...)` fullfører. Semantic enrichment kjøres derfor asynkront etter at dagens canonical ingest har opprettet SourceEvent.

Den eksisterende `handleUserMessage(...)`-returkontrakten forblir synkron og uendret.

Runtime bruker en monoton shadow-sekvens slik at:

```text
melding B fullfører enrichment før melding A
→ melding A får ikke overskrive shadow-statusen for melding B
```

Shadow-laget representerer dermed siste source event, ikke siste asynkrone completion.

---

## 8. Subject Engine-feil

Mens laget er shadow-only gjelder:

```text
Subject Engine unavailable/failed
→ source-grounded entity extraction kan fortsatt kjøre
→ concepts uten canonical support opprettes ikke
→ dagens canonical ingest fortsetter
```

Dette er en midlertidig shadow-policy. Før SemanticDocument får skrive synthesized canonical Insights skal semantic failure-porten bli **fail closed**.

---

## 9. Validatorens Phase 1B-invarianter

Validatoren krever nå blant annet:

- gyldig schema/version/mode/status
- gyldig SHA-256 source hash
- eksakte evidence-anchor slices
- ordnede, ikke-overlappende anchors
- Entity/Concept-ID
- `normalized_key`
- minst én evidence anchor per Entity/Concept
- minst én exact-source mention per Entity/Concept
- gyldige mention offsets
- Concept må ha canonical reference support
- `claims`, `relations`, `tensions`, `candidate_insights` skal fortsatt være tomme
- `canonical_write === false`
- `persistent_write === false`
- ingen chat-response-/assistant-response-avhengighet

---

## 10. Shadow safety

Phase 1B endrer fortsatt ikke brukersynlig eller persistent produktdata:

```text
canonical_write = false
persistent_write = false
visible_output_changed = false
```

Det skrives ikke SemanticDocument til:

- localStorage
- Supabase
- canonical sync
- Insight Chamber
- Meta memory

`aha:semantic-document-shadow`-eventet inneholder bare sikker metadata:

- schema/version/status
- source event-id
- source hash
- anchor count
- entity count
- concept count

Rå source text, entities og concepts sendes ikke i eventet.

---

## 11. Ingen chat-response-avhengighet

Validatoren avviser felter som:

```text
assistantReply
assistant_reply
chat_response
ai_response
model_response
```

Normativ analyseflyt:

```text
kildetekst
→ SemanticDocument
→ senere semantic synthesis
```

Ikke:

```text
kildetekst
→ brukerrettet AI-svar
→ canonical semantic truth
```

---

## 12. Neste implementeringsetappe

Neste fase er:

```text
Phase 1C: Claims + Relations V1
```

Den skal minst innføre:

- source-grounded propositions/claims
- typed relations mellom entities/concepts/claims
- evidence-binding per claim/relation
- eksplisitt skille mellom source claim, modellfortolkning og uavklart inference
- semantic quality gate før noe kan bli synthesized Insight

Før denne porten finnes skal `candidate_insights` forbli tomt og SemanticDocument skal ikke skrive nye canonical Insights.
