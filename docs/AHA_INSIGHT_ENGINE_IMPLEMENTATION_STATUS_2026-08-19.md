# AHA Insight Engine Implementation Status — 2026-08-19

## Status

Dette dokumentet er den løpende implementeringsstatusen for `AHA_INSIGHT_ENGINE_REBUILD_PLAN_V2.md`.

Per denne etappen er ombyggingen **påbegynt i kode**. Første mål er ikke å forbedre synlige Insight-kort direkte, men å etablere en korrekt semantisk mellomrepresentasjon som senere lag kan stole på.

```text
Phase 1A: SemanticDocumentV1 + evidence anchors
status: implemented in shadow mode
canonical insight behavior: unchanged
visible product behavior: unchanged
```

Se `AHA_SEMANTIC_DOCUMENT_V1.md` for runtime-kontrakten.

---

## 1. Korrigering av tidligere kodeaudit

`AHA_INSIGHT_ENGINE_CODE_AUDIT_2026-08-19.md` og første versjon av rebuild-planen var for forsiktige om én server-seam.

Autoritativ kodegjennomgang av root `server.js` viser at dette endepunktet **finnes i repoet**:

```text
POST /api/aha-agent/insight-candidates
```

Endepunktet:

- krever `OPENAI_API_KEY`
- bruker OpenAI-klienten
- mottar source-direct analysemateriale
- returnerer strukturert `insight_candidates_v1`
- er separat fra det brukerrettede `/chat`-svaret

Dermed er korrekt status:

```text
source-direct structured AI analysis seam: exists
full SemanticDocument server contract: not implemented yet
```

Denne statusen **erstatter** påstanden i den tidligere auditen om at autoritativ serverimplementasjon av `insight-candidates` ikke var funnet.

Vi skal derfor ikke bygge en parallell AI-backend uten grunn. V2 skal enten:

1. utvide dette eksisterende endepunktet til rikere struktur, eller
2. bygge et versjonert `/semantic-document`-endepunkt i samme canonical agent-backend dersom kontraktsgrensen blir renere.

Valget tas når Entities/Concepts/Claims/Relations-kontrakten er klar nok til server-implementasjon.

---

## 2. Faktisk PR1-implementasjon

`js/ahaChatIngestRuntime.js` eksponerer nå to separate modulgrenser:

```text
AHAChatIngestRuntime
AHASemanticDocument
```

`AHASemanticDocument` registreres også som:

```text
semanticDocument@1
```

Første versjon implementerer:

- SHA-256 source fingerprint
- deterministiske evidence anchors
- eksakte source offsets
- source-event provenance
- versjonert SemanticDocument-shape
- validation
- in-memory shadow recorder
- safe metadata-event
- ingen persistent/canonical write

Den eksisterende chat-ingest-flowen materialiserer ett shadow-dokument etter at `AHAIngest.ingestWithCandidates(...)` har opprettet SourceEvent.

---

## 3. Hvorfor vi ikke endrer synlige insights i første PR

Dagens feil skyldes blant annet at råtekst kan bli Insight summary og at weak concepts/claims kan komme inn tidlig.

Det ville likevel vært risikabelt å erstatte kandidatgenereringen før vi har en stabil source/evidence-kontrakt.

Derfor er migreringen bevisst:

```text
PR1 evidence/provenance
→ PR2 entities/concepts
→ PR3 claims/relations
→ PR4 dedicated semantic model contract
→ PR5 synthesized insight quality gate
→ PR6 equivalence vs resonance
→ PR7 metric V2
→ PR8 product materialization
→ PR9 legacy migration/reclassification
```

Dette lar dagens fungerende produksjonsflyt fortsette mens V2 bygges ved siden av og evalueres.

---

## 4. Midlertidig shadow-policy

Mens `SemanticDocumentV1.mode === "shadow"` gjelder:

- SemanticDocument får ikke skrive canonical Insight.
- SemanticDocument får ikke skrive Meta-profil.
- SemanticDocument får ikke endre brukerens synlige output.
- SemanticDocument lagres ikke persistent.
- Shadow-feil får ikke stoppe dagens canonical ingest.

Før V2 blir authoritative endres siste punkt:

```text
semantic analysis invalid/unavailable
→ source/evidence may remain
→ synthesized canonical Insight must fail closed
```

Dette er nødvendig for å unngå at fallback-setningsgruppering igjen blir presentert som forståelse.

---

## 5. Teststatus som kreves for PR1

PR1 skal ikke regnes som ferdig før repo-portene og nye deterministic tester beviser:

- riktig SHA-256
- eksakte evidence slices
- stabile offsets/IDs
- ingen response-avhengighet
- tomme semantic arrays i evidence-only stage
- ingen canonical/persistent write
- ett shadow-dokument per source event
- uendret canonical ingest-resultat
- shadow failure isolation

---

## 6. Meta-status er uendret

Meta er fortsatt:

```text
runtime: operational
semantic quality: provisional
```

PR1 forbedrer provenance-grunnlaget, men gir ennå ikke Meta rikere concepts, propositions eller typed relations.

Meta skal derfor **ikke** markeres semantic-ready etter denne etappen.

---

## 7. Neste konkrete byggejobb

Når PR1 er grønn og merget, er neste jobb:

```text
SemanticDocument Entities + Concepts V1
```

Den skal:

- skille entities fra concepts
- hente meningsbærende flerordsbegreper
- bruke source anchors som evidence
- canonicalisere via Subject Engine/Fagverk og eksisterende concept-policy
- la `raw_terms` forbli raw terms
- fortsatt ikke opprette nye synthesized canonical insights før claims/relations-porten finnes
