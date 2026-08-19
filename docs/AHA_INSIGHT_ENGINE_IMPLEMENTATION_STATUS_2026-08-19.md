# AHA Insight Engine Implementation Status — 2026-08-19

## Status

Dette dokumentet følger implementeringen av `AHA_INSIGHT_ENGINE_REBUILD_PLAN_V2.md`.

Nåværende byggepunkt:

```text
Phase 1A — SemanticDocument evidence/provenance     implemented + merged
Phase 1B — Entities + Concepts V1                  implemented in shadow
Phase 1C — Claims + Relations V1                   next
Canonical Insight behavior                         unchanged
Visible product behavior                           unchanged
Persistent SemanticDocument storage                disabled
Meta semantic quality                              provisional
```

Se `AHA_SEMANTIC_DOCUMENT_V1.md` for den normative runtime-kontrakten.

---

## 1. Autoritativ server-seam

Tidligere kodeaudit var for forsiktig på ett punkt. Root `server.js` inneholder allerede:

```text
POST /api/aha-agent/insight-candidates
```

Endepunktet:

- bruker OpenAI når `OPENAI_API_KEY` finnes
- analyserer source-direct materiale
- returnerer strukturert `insight_candidates_v1`
- er separat fra det brukerrettede `/chat`-svaret

Korrekt status er derfor:

```text
source-direct structured AI analysis seam: exists
full SemanticDocument server contract: not implemented yet
```

V2 skal ikke opprette en unødvendig parallell AI-backend. Når Claims/Relations-kontrakten er låst skal den eksisterende agent-backenden enten utvides eller få et versjonert SemanticDocument-endepunkt i samme backend.

---

## 2. Phase 1A — ferdig fundament

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

Dette fundamentet er beholdt uendret i Phase 1B.

---

## 3. Phase 1B — Entities + Concepts V1

Phase 1B fyller nå to tidligere tomme felt:

```text
entities[]
concepts[]
```

Følgende felt er fortsatt hardt stengt:

```text
claims = []
relations = []
tensions = []
candidate_insights = []
```

### Entities

Entities materialiseres bare når det finnes literal source evidence med eksakte offsets.

Første støtte omfatter:

- flerordsnavn i source
- tydelige akronymer i source
- Subject Engine `thinker`-matches som faktisk finnes i source

Subject Engine kan gi canonical støtte/klassifisering, men kan ikke skape source evidence.

### Concepts

Concepts er canonical-first og konservative:

```text
AHASubjectEngine.matchText(source)
→ matched_terms
→ literal source check
→ generic/noise gate
→ entity/concept separation
→ evidence mentions
→ canonical reference support
```

Et Concept må både:

1. finnes i source med eksakte offsets, og
2. ha canonical Subject Engine/Fagverk-støtte.

Phase 1B improviserer derfor ikke en ny fri heuristisk term-extractor. Det er bevisst bedre å få for få concepts enn ny term-suppe.

---

## 4. Fagverk er støtte, ikke kildebelegg

Subject Engine-provenance kan eksplisitt si:

```text
kind = canonical_fagverk
evidence_role = reference_support_not_source_evidence
```

Denne semantikken er nå bevart i `canonical_matches`.

Det normative skillet er:

```text
Source offsets  → hva kilden faktisk sier/nevner
Fagverk         → hvordan en source-grounded term kan forstås/canonicaliseres
```

Dette skillet skal også gjelde Claims/Relations og senere Insight-syntese.

---

## 5. Asynkron shadow-wiring

`AHASubjectEngine.matchText(...)` kan laste fagdata og er asynkron.

Phase 1B lar derfor semantic enrichment kjøre fire-and-forget etter dagens canonical ingest. `handleUserMessage(...)` sin eksisterende synkrone returkontrakt endres ikke.

En monoton shadow-sekvens hindrer at en treg eldre analyse overskriver shadow-dokumentet for en nyere melding.

---

## 6. Midlertidig failure-policy

Mens `mode === "shadow"` gjelder:

```text
Subject Engine failure
→ canonical chat ingest fortsetter
→ source-grounded entities kan fortsatt finnes
→ unsupported concepts opprettes ikke
```

Dette er kun en migreringspolicy. Før SemanticDocument blir autoritativt input til synthesized Insights skal semantic failure være **fail closed** for nye Insight-writes.

---

## 7. Hva Phase 1B-testene skal bevise

Repo-portene og deterministic tester skal bevise minst:

- fortsatt korrekt SHA-256 og evidence anchors
- Entity/Concept mentions er eksakte source slices
- Subject Engine-term uten source mention blir avvist
- generiske terms blir ikke Concepts
- Entity blir ikke samtidig Concept
- rikere phrase concept kan undertrykke svak single-token-redundans i samme canonical match
- gjentatte concept-mentions samles i ett Concept
- Fagverk-provenance beholdes som reference support
- Concept uten canonical support validerer ikke
- Claims/Relations/Tensions/Candidate Insights forblir tomme
- Subject Engine-feil lager ikke oppdiktede concepts
- canonical ingest-resultatet endres ikke av shadow-laget

---

## 8. Meta-status

Meta er fortsatt:

```text
runtime: operational
semantic quality: provisional
```

Entities/Concepts gir et bedre semantisk fundament, men Meta skal ikke konsumere shadow-dokumentet ennå. Det mangler source-grounded propositions, typed relations og Insight quality gate.

---

## 9. Neste konkrete byggejobb

Neste etappe er:

```text
SemanticDocument Claims + Relations V1
```

Den skal etablere:

- eksplisitte source claims/propositions
- typed relations
- evidence-binding på hvert claim/relation
- skille mellom source claim, interpretation og unresolved inference
- streng semantic quality gate

Før denne porten er bevist skal `candidate_insights` forbli tomt og ingen ny V2-syntese skrives til canonical Insight Chamber eller Meta.
