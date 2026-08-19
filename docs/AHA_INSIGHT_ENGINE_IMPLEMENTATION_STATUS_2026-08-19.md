# AHA Insight Engine Implementation Status — 2026-08-19

## Status

Dette dokumentet følger implementeringen av `AHA_INSIGHT_ENGINE_REBUILD_PLAN_V2.md`.

Nåværende byggepunkt:

```text
Phase 1A — SemanticDocument evidence/provenance     implemented + merged
Phase 1B — Entities + Concepts V1                  implemented + merged
Phase 1C — Claims + Relations V1                   implemented + merged
Phase 2A — Dedicated Semantic Model Contract V1    implemented + merged
Phase 2B — Semantic Model Endpoint V1              implemented + merged
Phase 2C — Semantic Model Shadow Bridge V1         implemented, opt-in shadow
Next — semantic evaluation + synthesis quality gate
Canonical Insight behavior                         unchanged
Visible product behavior                           unchanged
Persistent SemanticDocument storage                disabled
Meta semantic quality                              provisional
```

Se:

- `AHA_SEMANTIC_DOCUMENT_V1.md` — deterministisk browser/shadow-kontrakt
- `AHA_SEMANTIC_MODEL_CONTRACT_V1.md` — server/model-kontrakt
- `AHA_SEMANTIC_MODEL_ENDPOINT_V1.md` — HTTP-seam
- `AHA_SEMANTIC_MODEL_SHADOW_BRIDGE_V1.md` — browser-integrasjon og sammenligning

---

## 1. Phase 1A–1C — source-grounded SemanticDocument

De tre første fasene etablerte:

- SHA-256 source identity og evidence anchors
- exact-source Entity/Concept mentions
- Subject Engine/Fagverk som reference support, ikke source evidence
- exact-source Claims
- bare strukturelle Claim→Entity/Concept-relasjoner
- eksplisitt skille mellom source claim, interpretation og unresolved inference
- `synthesis_allowed = false`
- ingen persistent/canonical/Meta-write

Den deterministiske runtimeen er fortsatt baseline for shadow-evalueringen.

---

## 2. Phase 2A — Dedicated Semantic Model Contract V1

`server/ahaSemanticModelContract.js` innfører strict Structured Output-kontrakten:

```text
aha_semantic_model_output_v1
```

for:

- entities
- concepts
- propositions
- typed semantic relations
- unresolved inferences
- confidence
- exact-source evidence quotes
- epistemisk status

Post-model-valideringen er fail-closed. Entity/Concept source surface, evidence quotes og `source_claim.text` må kunne verifiseres mot source. Assistant/chat-response-data, ukjente felt og produktoutput som `candidate_insights`/`meta_profile` avvises.

---

## 3. Phase 2B — Semantic Model Endpoint V1

Eksisterende AHA-agent-backend eksponerer:

```text
POST /api/aha-agent/semantic-document
```

Ruten:

- krever `openai.responses.create`
- har ingen chat-completions-fallback
- bygger bare request gjennom Semantic Model Contract
- validerer modelloutput på nytt mot source
- returnerer ingen rå model/source/provider-feil ved failure
- har null canonical/persistent/Meta writes
- beholder `synthesis_allowed = false`

---

## 4. Phase 2C — Semantic Model Shadow Bridge V1

Ny browsermodul:

```text
js/ahaSemanticModelShadowBridge.js
AHASemanticModelShadowBridge
semanticModelShadowBridge@1
```

Bridge-en lytter til:

```text
aha:semantic-document-shadow
```

og kobler samme SourceEvent til semantic endpointet.

Den deterministiske SemanticDocument-representasjonen overskrives ikke. Modellresultatet ligger separat som:

```text
aha_semantic_model_shadow_v1
```

kun i runtime-minne.

---

## 5. Opt-in policy

Bridge-scriptet lastes i AHA Chat, men nettverkskallet er **deaktivert som standard**.

Aktivering krever:

```text
?ahaSemanticModelShadow=1
```

eller:

```js
window.AHA_SEMANTIC_MODEL_SHADOW = true
```

Dermed påvirker Phase 2C ikke normal produksjonskostnad eller normal brukerflyt før shadow-evalueringen er gjennomført.

---

## 6. Source identity gate

Før endpoint-kall må følgende være samme kilde:

```text
event.source_event_id
= deterministic SemanticDocument.source_event_id
= SourceEvent.id

event.source_text_hash
= deterministic SemanticDocument.source_text_hash
= sha256(SourceEvent.text)
```

Mismatch stopper før fetch.

---

## 7. Browser-side fail-closed evidence mapping

Servervalidering er ikke siste port.

Browser-bridge-en mapper også modellens:

- Entity/Concept source surfaces
- evidence quotes
- source-claim text

mot eksakte source offsets og eksisterende deterministic evidence anchors.

Hvis et felt ikke kan mappes:

```text
model shadow = rejected
canonical/Meta/persistent writes = 0
```

---

## 8. Deterministic ↔ model comparison

Phase 2C materialiserer observasjonsmetrics for:

```text
entity overlap
concept overlap
source-claim overlap
interpretation count
inference count
semantic relation count
unresolved inference count
```

samt separate deterministic/model item-counts.

Dette er ennå ikke en autoritativ kvalitetsscore. Det er rå evalueringsgrunnlag for neste fase.

---

## 9. Race safety

Model-fetchen er asynkron. En monoton request-sekvens sikrer:

```text
nyere source event vinner
eldre sen completion forkastes
```

Dermed kan en treg modellrespons ikke erstatte shadow-statusen for en nyere melding.

---

## 10. Safety policy er fortsatt lukket

Model shadow holder:

```text
canonical_write = false
persistent_write = false
meta_write = false
visible_output_changed = false
synthesis_allowed = false
source_text_stored = false
```

Deterministisk SemanticDocument og model-assisted shadow er begge observasjon/evaluering, ikke nye canonical Insights.

---

## 11. Meta-status

Meta er fortsatt:

```text
runtime: operational
semantic quality: provisional
```

Meta skal ikke konsumere model shadow som canonical profilgrunnlag ennå.

---

## 12. Neste konkrete byggejobb

Neste fase er:

```text
Semantic Evaluation + Synthesized Insight Quality Gate
```

Den skal måle minst:

- source/evidence fidelity
- entity/concept precision
- proposition fidelity
- interpretation/inference separation
- relation precision
- deterministic ↔ model overlap/divergence

Deretter kan en egen quality gate avgjøre om et modellforslag kvalifiserer som synthesized Insight candidate.

Før denne gaten er bevist forblir:

```text
synthesis_allowed = false
canonical Insight write = false
Meta write = false
```
