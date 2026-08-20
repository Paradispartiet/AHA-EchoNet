# AHA Semantic Model Shadow Bridge V1

## Status

Phase 2C kobler den validerte servermodellen til browserens eksisterende `SemanticDocumentV1` uten å gjøre modellresultatet canonical.

```text
module: js/ahaSemanticModelShadowBridge.js
runtime module: AHASemanticModelShadowBridge
AHAModuleApi: semanticModelShadowBridge@1
mode: shadow
production default: disabled
persistent write: disabled
canonical Insight write: disabled
Meta write: disabled
visible output change: disabled
synthesis allowed: false
```

---

## 1. Hvorfor en separat bridge

Den deterministiske `SemanticDocumentV1`-runtimeen er nå et stabilt source/evidence-grunnlag. Den skal ikke overskrives av modelloutput.

Derfor er Phase 2C todelt:

```text
SourceEvent
→ deterministic SemanticDocument shadow

samme SourceEvent
→ semantic-document endpoint
→ validated model analysis
→ separate model-assisted shadow
```

Dette gjør det mulig å sammenligne deterministisk og modellassistert analyse før AHA gir modellen rett til å opprette canonical Insights.

---

## 2. Opt-in, ikke automatisk produksjonskostnad

Bridge-scriptet lastes i `chat.html`, men endpoint-kallet er deaktivert som standard.

Det kan aktiveres eksplisitt med:

```text
?ahaSemanticModelShadow=1
```

eller runtime-flagget:

```js
window.AHA_SEMANTIC_MODEL_SHADOW = true
```

Uten flagg:

```text
semantic model fetch count = 0
```

Dette hindrer at AHA automatisk dobler modellanalysen/kostnaden for alle brukere før shadow-kvaliteten er evaluert.

---

## 3. Trigger

`AHASemanticDocument` sender allerede metadata-eventet:

```text
aha:semantic-document-shadow
```

Bridge-en lytter på dette eventet.

Eventet inneholder ikke rå source. Bridge-en bruker `source_event_id` til å finne den eksakte `SourceEvent` gjennom `AHASources.loadSourceEvents()`.

---

## 4. Source identity må stemme

Før et nettverkskall tillates krever bridge-en:

1. event `source_event_id` matcher siste deterministiske SemanticDocument
2. event `source_text_hash` matcher siste deterministiske SemanticDocument
3. SourceEvent finnes
4. SourceEvent har tekst
5. `AHASemanticDocument.sha256Hex(sourceEvent.text)` matcher SemanticDocument-hashen

Ved mismatch:

```text
endpoint call = 0
model shadow = null
```

Dermed kan et gammelt event eller feil SourceEvent ikke analyseres som om det tilhørte nåværende dokument.

---

## 5. Gjenbruk av eksisterende agent-URL

Bridge-en lager ikke en ny API-konfigurasjon.

Den bruker den eksisterende URL-seamen fra:

```text
AHAChatInsightPipeline.create({}).buildAhaAgentUrl(...)
```

og kaller:

```text
semantic-document
```

som blir samme AHA-agentbase som dagens `/insight-candidates` bruker.

---

## 6. Request

Bridge-en sender bare source-direct materiale:

```json
{
  "text": "exact SourceEvent text",
  "format": "aha_semantic_model_output_v1",
  "context": {
    "source_event_id": "...",
    "source_type": "...",
    "language": "..."
  }
}
```

Den sender ikke:

- `assistant_reply`
- `chat_response`
- `ai_state`
- brukerrettet AHA-svar
- Meta-profil
- candidate Insights

---

## 7. Endpoint-envelope må fortsatt være sikker

Selv om serveren allerede validerer modellen, godtar browser-bridge-en bare envelope med:

```text
ok = true
schema = aha_semantic_model_contract_v1
analysis.schema = aha_semantic_model_output_v1
source_text_returned = false
canonical_write = false
persistent_write = false
meta_write = false
synthesis_allowed = false
```

Et envelope som åpner én av write-/synthesis-portene blir avvist og lagres ikke.

---

## 8. Browser-side evidence mapping

Serverens exact-source evidence-validering gjentas i browseren som offset-mapping.

For hver:

- Entity `source_surface`
- Concept `source_surface`
- evidence quote
- source-claim text

finnes eksakte spans i SourceEvent-teksten.

Shape:

```text
{
  anchor_id
  start_offset
  end_offset
  text
}
```

Hard invariant:

```text
sourceText.slice(start_offset, end_offset) === span.text
```

Et quote/surface som ikke kan bindes til ett deterministisk evidence anchor gjør hele model-shadow-byggingen ugyldig.

---

## 9. Model shadow er separat

Bridge-en lagrer bare siste resultat i runtime-minne:

```text
aha_semantic_model_shadow_v1
```

Shape på høyt nivå:

```text
{
  source_event_id
  source_text_hash
  deterministic_document_id
  model
  response_id
  entities[]
  concepts[]
  propositions[]
  relations[]
  unresolved_inferences[]
  comparison
  policy
}
```

Full source text lagres ikke i model shadow. Bare korte source-bundne spans/evidence beholdes.

Deterministisk SemanticDocument overskrives ikke.

---

## 10. Comparison metrics

Phase 2C materialiserer første faktiske sammenligning mellom de to analysene:

```text
deterministic.entity_count
deterministic.concept_count
deterministic.claim_count
deterministic.relation_count

model.entity_count
model.concept_count
model.proposition_count
model.relation_count
model.unresolved_inference_count

entity_overlap_count
concept_overlap_count
source_claim_overlap_count
interpretation_count
inference_count
semantic_relation_count
unresolved_inference_count
```

Dette er observasjonsdata, ikke en kvalitetsscore ennå.

---

## 11. Race safety

To raske source events kan fullføre modellkallene i motsatt rekkefølge.

Bridge-en bruker derfor en monoton request-sekvens:

```text
source B starter etter source A
source B fullfører først
source A fullfører senere
→ A forkastes som stale
→ B forblir siste model shadow
```

---

## 12. Metadata-event

Etter gyldig model shadow sendes:

```text
aha:semantic-model-shadow
```

Eventet inneholder bare:

- schema/version
- source event-id/hash
- modellnavn
- counts
- comparison metrics
- `synthesis_allowed: false`

Det inneholder ikke full source eller full `analysis`-payload.

---

## 13. Safety policy

Model shadow holder eksplisitt:

```text
canonical_write = false
persistent_write = false
meta_write = false
visible_output_changed = false
synthesis_allowed = false
source_text_stored = false
```

Bridge-en skriver ikke til:

- localStorage
- Supabase
- canonical sync
- Insight Chamber
- Meta memory
- synlig AHA-analyseflate

---

## 14. Testkontrakt

`tests/aha-semantic-model-shadow-bridge-v1.test.cjs` beviser blant annet:

- disabled bridge gjør null fetch
- source hash mismatch stopper før fetch
- request bruker source-direct safe context
- endpoint-policy må være write/synthesis-disabled
- every mapped span er exact source slice
- unsafe envelope blir ikke lagret
- evidence som ikke kan mappes i browser feiler lukket
- deterministic/model overlap metrics beregnes
- runtime-resultat returneres som defensive kopier
- metadata-eventet inneholder ikke full source/analysis
- eldre async completion kan ikke overskrive nyere source event

---

## 15. Neste etappe

Neste fase er **Semantic Evaluation + Synthesized Insight Quality Gate**.

Først skal model shadow evalueres på:

- source/evidence coverage
- entity/concept precision
- claim fidelity
- interpretation/inference separation
- relation precision
- deterministic ↔ model overlap/divergence

Deretter kan en egen quality gate avgjøre om enkelte modellproposisjoner i det hele tatt kvalifiserer som synthesized Insight candidates.

Før denne gaten er grønn forblir:

```text
synthesis_allowed = false
canonical Insight write = false
Meta write = false
```
