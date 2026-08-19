# AHA Insight Engine Implementation Status — 2026-08-19

## Status

Dette dokumentet følger implementeringen av `AHA_INSIGHT_ENGINE_REBUILD_PLAN_V2.md`.

Nåværende byggepunkt:

```text
Phase 1A — SemanticDocument evidence/provenance     implemented + merged
Phase 1B — Entities + Concepts V1                  implemented + merged
Phase 1C — Claims + Relations V1                   implemented + merged
Phase 2A — Dedicated Semantic Model Contract V1    implemented, contract-only
Next — semantic-document HTTP endpoint             pending
Canonical Insight behavior                         unchanged
Visible product behavior                           unchanged
Persistent SemanticDocument storage                disabled
Meta semantic quality                              provisional
```

Se:

- `AHA_SEMANTIC_DOCUMENT_V1.md` for browser/shadow-kontrakten
- `AHA_SEMANTIC_MODEL_CONTRACT_V1.md` for server/model-kontrakten

---

## 1. Autoritativ server-seam

Root `server.js` inneholder allerede:

```text
POST /api/aha-agent/insight-candidates
```

Endepunktet bruker OpenAI når `OPENAI_API_KEY` finnes, analyserer source-direct materiale og returnerer strukturert analyse separat fra det brukerrettede `/chat`-svaret.

V2 bygger videre i samme AHA-agent-backend. Det opprettes ikke en parallell AI-tjeneste.

---

## 2. Phase 1A — evidence/provenance

Phase 1A etablerte:

- `AHASemanticDocument` / `semanticDocument@1`
- SHA-256 source identity
- deterministiske evidence anchors
- eksakte source offsets
- source-event provenance
- validator
- in-memory shadow recorder
- safe metadata-event
- eksplisitt forbud mot chat-response som analysekilde
- ingen persistent/canonical write

---

## 3. Phase 1B — Entities + Concepts V1

Phase 1B åpnet:

```text
entities[]
concepts[]
```

Entities og Concepts må være source-grounded med eksakte mentions. Concepts må i tillegg ha canonical Subject Engine/Fagverk reference support.

Normativt skille:

```text
Source offsets  → hva source faktisk inneholder
Fagverk         → canonical/reference support, ikke source evidence
```

Phase 1B er bevisst konservativ og foretrekker for få concepts fremfor term-suppe.

---

## 4. Phase 1C — Claims + Relations V1

Phase 1C åpnet source-grounded:

```text
claims[]
relations[]
```

Første Claim-kontrakt:

```text
kind = source_claim
epistemic_status = source_explicit
interpretation_status = not_interpreted
source = literal_source_sentence
```

Claim text er et eksakt source span. Spørsmål og korte fragmenter blir ikke Claims.

Tillatte deterministiske relation types er foreløpig bare:

```text
claim_mentions_entity
claim_mentions_concept
```

Co-occurrence skal ikke feilpresenteres som kausalitet, støtte eller motsetning.

---

## 5. Epistemisk policy

Arkitekturen skiller eksplisitt mellom:

```text
source claim
interpretation
unresolved inference
```

Den deterministiske Phase 1C-runtime genererer bare første kategori.

Dette skillet må bevares når språkmodellen får foreslå rikere semantikk.

---

## 6. Phase 2A — Dedicated Semantic Model Contract V1

Ny pure ESM-modul:

```text
server/ahaSemanticModelContract.js
```

Kontrakten innfører:

```text
aha_semantic_model_output_v1
```

med:

- entities
- concepts
- propositions
- typed relations
- unresolved inferences
- confidence
- evidence quotes
- eksplisitt epistemisk status

Modellrequesten bygges som strict JSON Schema Structured Output.

Denne etappen kobler **ikke** modellen til et nytt HTTP-endepunkt ennå. Formålet er å bevise schema og fail-closed source/evidence-validering først.

---

## 7. Server-side source/evidence gate

Semantic Model Contract krever blant annet:

- Entity `source_surface` finnes ordrett i source
- Concept `source_surface` finnes ordrett i source
- alle evidence quotes finnes ordrett i source
- `source_claim.text` finnes ordrett i source
- interpretation/inference er eksplisitt merket
- obligatorisk evidence kan ikke mangle
- ukjente enum-verdier avvises
- ukjente felter avvises
- assistant/chat response-data avvises rekursivt
- `candidate_insights` og `meta_profile` er forbudt modelloutput

Valideringen er fail-closed: en payload med hallusinert evidence blir ikke delvis godkjent ved å droppe det dårlige feltet.

---

## 8. Semantic quality gate er fortsatt lukket

Browser/shadow-kontrakten beholder:

```text
synthesis_allowed = false
```

Servermodellens safe response envelope beholder også:

```text
source_text_returned = false
canonical_write = false
persistent_write = false
meta_write = false
synthesis_allowed = false
```

At modellen nå kan foreslå `interpretation`, `inference` og rikere relation types betyr derfor ikke at de blir canonical Insights.

---

## 9. Runtime- og failure-policy

Dagens AHA Chat/Insight-flow er fortsatt autoritativ og uendret mens V2 er shadow-only.

Ved semantic model failure i kommende endpoint skal regelen være:

```text
invalid model output
→ semantic model response fails closed
→ ingen synthesized Insight
→ ingen Meta-write
→ ingen persistent SemanticDocument-write
```

Dagens eksisterende chat-flyt skal ikke bruke en svak JSON-fallback som erstatning for en ugyldig Semantic Model response.

---

## 10. Meta-status

Meta er fortsatt:

```text
runtime: operational
semantic quality: provisional
```

Meta skal ikke konsumere SemanticDocument-shadow eller Semantic Model output som canonical profilgrunnlag ennå.

---

## 11. Neste konkrete byggejobb

Neste etappe er:

```text
POST /api/aha-agent/semantic-document
```

Den skal:

1. validere request source/context
2. bruke `buildSemanticModelResponsesRequest(...)`
3. kreve Responses/Structured Output-seamen
4. parse model output
5. kjøre `requireValidSemanticModelPayload(...)`
6. returnere safe response envelope
7. returnere fail-closed feil uten rå modellpayload/source ved valideringsfeil
8. gjøre null canonical/persistent/Meta writes

Etter endpoint + shadow-klientintegrasjon kommer en egen **Synthesized Insight Quality Gate** før V2 kan materialisere nye canonical Insights.
