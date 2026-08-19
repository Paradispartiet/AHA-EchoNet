# AHA Insight Engine Implementation Status — 2026-08-19

## Status

Dette dokumentet følger implementeringen av `AHA_INSIGHT_ENGINE_REBUILD_PLAN_V2.md`.

Nåværende byggepunkt:

```text
Phase 1A — SemanticDocument evidence/provenance     implemented + merged
Phase 1B — Entities + Concepts V1                  implemented + merged
Phase 1C — Claims + Relations V1                   implemented in shadow
Next — dedicated semantic model contract           pending
Canonical Insight behavior                         unchanged
Visible product behavior                           unchanged
Persistent SemanticDocument storage                disabled
Meta semantic quality                              provisional
```

Se `AHA_SEMANTIC_DOCUMENT_V1.md` for den normative runtime-kontrakten.

---

## 1. Autoritativ server-seam

Root `server.js` inneholder allerede:

```text
POST /api/aha-agent/insight-candidates
```

Endepunktet bruker OpenAI når `OPENAI_API_KEY` finnes, analyserer source-direct materiale og returnerer strukturert `insight_candidates_v1` separat fra det brukerrettede `/chat`-svaret.

Korrekt status er:

```text
source-direct structured AI analysis seam: exists
full SemanticDocument model contract: not authoritative yet
```

Neste serverarbeid skal bygge videre i samme AHA-agent-backend, ikke lage en parallell AI-backend.

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

Phase 1C åpner nå:

```text
claims[]
relations[]
```

men bare som source-grounded struktur.

### Claims

Første Claim-kontrakt er:

```text
kind = source_claim
epistemic_status = source_explicit
interpretation_status = not_interpreted
source = literal_source_sentence
```

Claim text er et eksakt source span. Spørsmål og korte fragmenter blir ikke Claims.

Phase 1C gjør ingen parafrase og ingen modellfortolkning.

### Relations

Tillatte typer er foreløpig bare:

```text
claim_mentions_entity
claim_mentions_concept
```

Relasjonen krever at target mention faktisk ligger innenfor source Claim-spennet.

Phase 1C tillater ikke:

```text
causes
supports
contradicts
explains
implies
influences
```

Co-occurrence skal ikke feilpresenteres som kausalitet, støtte eller motsetning.

---

## 5. Epistemisk policy

Arkitekturen skiller nå eksplisitt mellom:

```text
source claim
interpretation
unresolved inference
```

Phase 1C genererer bare første kategori.

Quality gate krever derfor:

```text
interpretation_count = 0
unresolved_inference_count = 0
```

Dette skillet skal bevares når den dedikerte semantiske modellen senere får lov til å foreslå fortolkninger og inferenser.

---

## 6. Semantic quality gate

`quality.semantic_quality_gate` inneholder nå eksplisitt:

```text
stage = claims_relations_shadow
source_grounded = true
structural_relations_only = true
synthesis_allowed = false
```

Selv et fullt gyldig Phase 1C-dokument får altså ikke produsere nye canonical Insights.

Blocking reasons:

```text
dedicated_semantic_model_not_authoritative
synthesized_insight_quality_gate_not_implemented
```

Dette er den sentrale sikkerhetsporten mellom semantisk analyse og produktpåstanden «Insight».

---

## 7. Validatoren

Phase 1C-validatoren beviser nå blant annet:

- SHA-256/source-anchor-integritet
- exact-source Entity/Concept mentions
- canonical support på Concepts
- exact-source Claim spans
- Claim epistemic/source-status
- gyldige Claim→Entity/Concept-ID-er
- strukturell relation allowlist
- Claim og target finnes
- Relation evidence inneholder Claim-spenn + target mention i samme Claim
- ingen syntese
- ingen interpretations/inferences
- ingen chat-response dependency
- ingen persistent/canonical write

`tensions` og `candidate_insights` er fortsatt hardt tomme.

---

## 8. Runtime- og failure-policy

Subject Engine enrichment kan være asynkron, men dagens `handleUserMessage(...)`-kontrakt er fortsatt synkron.

Shadow-sekvensen hindrer eldre async-completions i å overskrive en nyere melding.

Mens laget er shadow-only:

```text
Subject Engine failure
→ dagens canonical chat ingest fortsetter
→ source entities og source claims kan fortsatt materialiseres
→ unsupported concepts opprettes ikke
→ ingen synthesized Insight skrives
```

Før V2 blir authoritative skal semantic failure bli fail-closed for nye synthesized Insight-writes.

---

## 9. Meta-status

Meta er fortsatt:

```text
runtime: operational
semantic quality: provisional
```

Meta skal ikke konsumere SemanticDocument-shadow som canonical profilgrunnlag ennå. Selv om source claims/relations nå finnes, mangler en authoritative semantic model contract og synthesized Insight quality gate.

---

## 10. Neste konkrete byggejobb

Neste etappe er:

```text
Dedicated Semantic Model Contract V1
```

Den skal bruke den eksisterende AHA-agent-backenden og levere strukturert modelloutput som kan valideres inn i samme SemanticDocument-kontrakt.

Den skal støtte rikere:

- entities/concepts
- propositions
- typed semantic relations
- interpretations
- unresolved inferences
- uncertainty/confidence
- evidence bindings

Men modelloutput får ikke omgå Phase 1A–1C-invariantene. Etter denne serverkontrakten kommer en egen **Synthesized Insight Quality Gate** før V2 kan skrive nye canonical Insights.
