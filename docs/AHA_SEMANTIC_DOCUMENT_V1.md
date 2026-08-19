# AHA SemanticDocument V1

## Status

`SemanticDocumentV1` er nå påbegynt i runtime som **shadow-only evidence core**.

Implementasjonen eksponeres som den egne modulkontrakten:

```text
AHASemanticDocument
AHAModuleApi: semanticDocument@1
```

I første implementeringsetappe er modulen fysisk samlokalisert med `js/ahaChatIngestRuntime.js`. Dette er bevisst: vi unngår en ny produksjonskritisk script-/load-order-endring før kontrakten er bevist. Den kan senere flyttes til egen fil uten å endre det offentlige modulgrensesnittet.

Denne fasen endrer **ikke** synlige innsikter, Meta-profil, lister, stier eller tankekart.

---

## 1. Rolle i canonical flyt

Målarkitekturen er fortsatt:

```text
SourceEvent
→ SemanticDocument
→ semantic quality gate
→ Insight candidate(s)
→ insightsChamber
→ Meta / produkter
```

Men PR1 kjører parallelt med dagens flyt:

```text
SourceEvent
├─→ dagens canonical candidate/Insight-flow
└─→ SemanticDocumentV1 shadow evidence-only
```

Shadow-dokumentet er observasjon og validering av den nye representasjonen. Det er ikke canonical sannhet ennå.

---

## 2. Nåværende kontrakt

Første runtime-shape er:

```text
SemanticDocumentV1 {
  id
  schema = "aha_semantic_document_v1"
  version = 1
  mode = "shadow"
  status = "evidence_only"

  source_event_id?
  source_text_hash
  source_text_hash_algorithm = "sha256"
  source_type
  language

  analyzer_origin = "deterministic_shadow"
  analyzer_version

  evidence_anchors[]

  entities = []
  concepts = []
  claims = []
  relations = []
  tensions = []
  candidate_insights = []

  quality
  provenance
}
```

De semantiske arrayene er med i kontrakten nå, men skal være tomme i PR1. Dermed kan senere PR-er fylle dem uten å introdusere en ny top-level representasjon.

---

## 3. Source hash

`source_text_hash` er ekte SHA-256 over nøyaktig source text i UTF-8.

Hashen brukes i denne fasen til:

- stabil dokumentidentitet
- stabile evidence-anchor-ID-er
- regresjonstesting
- senere replay/migrering

Den brukes **ikke** i PR1 til automatisk merge eller canonical deduplisering.

---

## 4. Evidence anchors

PR1 segmenterer kilden deterministisk på avsnittsgrenser.

Hvert anchor har:

```text
id
index
start_offset
end_offset
text
```

Hard invariant:

```text
source_text.slice(start_offset, end_offset) === anchor.text
```

Dermed er evidence et faktisk utsnitt av kilden og ikke en rekonstruksjon eller en språkmodellformulering.

Anchor-ID-en avledes fra source hash + stabil indeks. Samme tekst gir derfor samme anchor-ID-er.

Blankt separator-whitespace trenger ikke være del av et anchor. `source_coverage_non_whitespace` måler derfor dekningsgraden for kildebærende tegn.

---

## 5. Shadow safety

PR1 har følgende eksplisitte grenser:

```text
canonical_write = false
persistent_write = false
visible_output_changed = false
```

`recordShadowSemanticDocument(...)` holder bare siste validerte shadow-dokument i runtime-minne.

Det skrives ikke til:

- localStorage
- Supabase
- canonical sync
- Insight Chamber
- Meta memory

Det sendes et valgfritt `aha:semantic-document-shadow`-event med bare sikker metadata:

- schema/version/status
- source event-id
- source hash
- antall evidence anchors

Rå source text sendes ikke i eventet.

---

## 6. Ingen chat-response-avhengighet

Validatoren avviser feltnavn som indikerer at SemanticDocument forsøker å gjøre brukerens AI-svar til analysekilde, blant annet:

```text
assistantReply
assistant_reply
chat_response
ai_response
model_response
```

Det normative skillet er fortsatt:

```text
kildetekst → semantic analysis
```

ikke:

```text
kildetekst → brukerrettet AI-svar → canonical semantic truth
```

---

## 7. Runtime-wiring

På normal AHA Chat-flyt skjer shadow-materialiseringen etter at canonical `AHAIngest.ingestWithCandidates(...)` har opprettet SourceEvent.

Det betyr at shadow-dokumentet kan få den faktiske `source_event_id` som provenance.

På legacy fallback bygges det også maksimalt ett shadow-dokument per source event.

PR1 har en midlertidig sikkerhetsregel:

> Feil i SemanticDocument shadow må ikke stoppe dagens canonical ingest.

Dette er riktig kun mens laget er shadow-only. Før SemanticDocument blir authoritative input til nye canonical insights skal grensen endres til **fail closed**: ugyldig semantisk analyse skal da ikke få produsere synthesized canonical insights.

---

## 8. Hva PR1 beviser

Tester skal bevise:

1. SHA-256 er deterministisk og korrekt også for norsk/unicode tekst.
2. Evidence anchors er eksakte source slices.
3. Anchor-offsets er ordnet og ikke-overlappende.
4. Anchor-ID-er er stabile og unike.
5. Samme kilde og metadata gir samme dokumentstruktur.
6. Semantic arrays er tomme i evidence-only shadow.
7. Shadow-eventet eksponerer ikke rå source text.
8. Recorder returnerer defensive kopier.
9. Ett source event lager ett shadow-dokument, ikke ett dokument per Insight candidate.
10. Shadow-feil stopper ikke dagens canonical flow i PR1.

---

## 9. Neste implementeringsetappe

Neste PR skal bygge **Entities + Concepts V1** på dette dokumentet.

Riktig rekkefølge er:

```text
Evidence anchors
→ entities
→ meaningful concept phrases
→ Subject Engine / Fagverk canonicalization
→ concept quality gate
```

Det skal ikke innføres synthesized insights før claims/relations og den semantiske quality gate er på plass.
