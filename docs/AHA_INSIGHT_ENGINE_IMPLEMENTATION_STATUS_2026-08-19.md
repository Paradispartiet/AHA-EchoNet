# AHA Insight Engine Implementation Status — 2026-08-19

## Status

Dette dokumentet følger implementeringen av `AHA_INSIGHT_ENGINE_REBUILD_PLAN_V2.md`.

Nåværende byggepunkt:

```text
Phase 1A — SemanticDocument evidence/provenance     implemented + merged
Phase 1B — Entities + Concepts V1                  implemented + merged
Phase 1C — Claims + Relations V1                   implemented + merged
Phase 2A — Dedicated Semantic Model Contract V1    implemented + merged
Phase 2B — Semantic Model Endpoint V1              implemented
Next — shadow client integration                   pending
Canonical Insight behavior                         unchanged
Visible product behavior                           unchanged
Persistent SemanticDocument storage                disabled
Meta semantic quality                              provisional
```

Se:

- `AHA_SEMANTIC_DOCUMENT_V1.md` for browser/shadow-kontrakten
- `AHA_SEMANTIC_MODEL_CONTRACT_V1.md` for server/model-kontrakten
- `AHA_SEMANTIC_MODEL_ENDPOINT_V1.md` for HTTP-seamen

---

## 1. Phase 1A–1C — source-grounded SemanticDocument

De tre første fasene har etablert:

- SHA-256 source identity og evidence anchors
- exact-source Entity/Concept mentions
- Subject Engine/Fagverk som reference support, ikke source evidence
- exact-source Claims
- bare strukturelle Claim→Entity/Concept-relasjoner
- eksplisitt skille mellom source claim, interpretation og unresolved inference
- `synthesis_allowed = false`
- ingen persistent/canonical/Meta-write

Browser-runtime kjører fortsatt dette i shadow mode.

---

## 2. Phase 2A — Dedicated Semantic Model Contract V1

`server/ahaSemanticModelContract.js` innfører:

```text
aha_semantic_model_output_v1
```

med strict JSON Schema Structured Output for:

- entities
- concepts
- propositions
- typed semantic relations
- unresolved inferences
- confidence
- evidence quotes
- epistemisk status

Server-side validering er fail-closed:

- Entity/Concept source surface må finnes ordrett i source
- evidence quotes må finnes ordrett i source
- `source_claim.text` må finnes ordrett i source
- ukjente felt/enums avvises
- assistant/chat-response-data avvises
- `candidate_insights` og `meta_profile` er forbudt output

---

## 3. Phase 2B — Semantic Model Endpoint V1

Ny route i eksisterende AHA-agent-backend:

```text
POST /api/aha-agent/semantic-document
```

Root `server.js` registrerer en testbar handler fra:

```text
server/ahaSemanticModelEndpoint.js
```

Endpointet bruker samme `OPENAI_MODEL` og OpenAI-klient som backend allerede har, men har strengere failure-policy enn eldre analyse-endepunkter.

---

## 4. Responses-only policy

Semantic Model Endpoint krever:

```text
openai.responses.create
```

Hvis Responses-seamen ikke finnes:

```text
503 semantic_model_responses_unavailable
```

Det finnes ingen chat-completions-fallback for denne ruten.

Dette er bevisst: SemanticDocument skal ikke degraderes til fri JSON-output dersom strict Structured Output-seamen mangler.

---

## 5. Request gate

Endpointet avviser før modellkall:

- manglende OpenAI key
- tom/ugyldig text
- text over 8000 tegn
- ugyldig context
- feil format-versjon
- assistant/chat-response-data i context

Gyldig request bygges kun gjennom:

```text
buildSemanticModelResponsesRequest(...)
```

---

## 6. Post-model fail-closed gate

Etter modellkallet kjøres:

```text
requireValidSemanticModelPayload(payload, sourceText)
```

Hallusinert evidence eller annen kontraktsfeil gir:

```text
502 semantic_model_validation_failed
```

Failure response returnerer korte feilkoder, men ikke:

- raw model output
- source text
- hallusinerte strings fra model payload

Upstream-feil returnerer heller ikke provider error message/body.

---

## 7. Safe success/failure policy

Både success- og failure-grensen holder følgende invariant:

```text
source_text_returned = false
canonical_write = false
persistent_write = false
meta_write = false
synthesis_allowed = false
```

Failure-grensen har i tillegg:

```text
raw_model_output_returned = false
```

Endpointets `analysis` er derfor validert semantisk modelloutput, ikke en canonical Insight.

---

## 8. Eksisterende produktflyt er uendret

Phase 2B endrer ikke:

- `/api/aha-agent/chat`
- `/api/aha-agent/insight-candidates`
- dagens browser candidate/Insight-flow
- canonical sync
- Meta
- persistent SemanticDocument storage

Server-diffen for root `server.js` er begrenset til import + registrering av den nye route-handleren.

---

## 9. Meta-status

Meta er fortsatt:

```text
runtime: operational
semantic quality: provisional
```

Meta skal ikke konsumere Semantic Model output som canonical profilgrunnlag ennå.

---

## 10. Neste konkrete byggejobb

Neste etappe er:

```text
Semantic Model → SemanticDocument shadow integration
```

Mål:

1. browser-source event bygger dagens deterministiske SemanticDocument shadow
2. samme source sendes source-direct til `/api/aha-agent/semantic-document`
3. validert modelloutput konverteres/merges inn i en separat model-assisted shadow-representasjon
4. deterministic vs model-assisted output sammenlignes
5. semantic quality/evaluation metrics materialiseres
6. null canonical/Meta/persistent writes beholdes

Etter denne shadow-integrasjonen kommer en egen **Synthesized Insight Quality Gate** før V2 kan materialisere nye canonical Insights.
