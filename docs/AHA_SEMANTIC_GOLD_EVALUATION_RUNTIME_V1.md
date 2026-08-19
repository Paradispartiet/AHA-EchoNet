# AHA Semantic Gold Evaluation + Runtime V1

## Status

Phase 3B etablerer to separate lag:

```text
AHASemanticGoldEvaluator
→ offline QA mot håndmerkede fixtures

AHASemanticEvaluationRuntime
→ memory-only runtime mellom model shadow og Phase 3A quality gate
```

Ingen av lagene har produksjonsmyndighet til å skrive Insights eller Meta.

---

## 1. Gold-sett

Håndmerkede fixtures ligger i:

```text
tests/fixtures/aha-semantic-evaluation-gold-v1.json
```

Gold-skjema:

```text
aha_semantic_gold_fixture_v1
```

Fixture-settet inneholder både en perfekt og en bevisst imperfekt modellrespons slik at regresjonen beviser at målene faktisk skiller true positives, false positives og false negatives.

Gold-labels dekker:

- entities + entity type + aliases
- concepts + aliases
- exact source claims
- typed relations + epistemic status
- hånddefinerte interpretation-kriterier med required/forbidden terms og evidence quotes

---

## 2. Precision / recall / F1

`AHASemanticGoldEvaluator` rapporterer separat for:

```text
entities
concepts
source_claims
relations
interpretations
```

Per dimensjon:

```text
true_positive
predicted
expected
false_positive
false_negative
precision
recall
f1
```

I tillegg rapporteres `macro_f1` over dimensjoner som har definert F1.

Dette er **gold-metrikk**, og skal holdes atskilt fra deterministic↔model `agreement_rate` i Phase 3A.

---

## 3. Interpretation-matching

Interpretation er ikke exact-source tekst og kan derfor ikke scores med samme kontrakt som source claims.

Gold-fixturen beskriver i stedet:

```text
required_terms[]
forbidden_terms[]
evidence_quotes[]
```

En modellinterpretation teller som match bare når:

1. alle required terms finnes i interpretation-teksten
2. ingen forbidden terms finnes
3. alle håndmerkede evidence quotes finnes i modellens evidence-binding

Denne deterministiske gold-regelen er kun QA-regresjon; den er ikke en generell semantisk dommer for produksjon.

---

## 4. Gold har ikke write-authority

Alle gold-evalueringer returnerer:

```text
production_gate_authority = false
```

Høye precision/recall-tall i et lite fixture-sett er ikke i seg selv nok til å åpne canonical synthesis.

Fixture-settet må senere utvides til flere teksttyper og vanskelige negative cases før terskler kan låses.

---

## 5. Evaluation Runtime

`js/ahaSemanticEvaluationRuntime.js` er en memory-only runtime-kontrakt.

Den er laget for å lytte til:

```text
aha:semantic-model-shadow
```

og deretter hente:

- original SourceEvent
- siste deterministic SemanticDocument shadow
- siste model-assisted shadow
- Phase 3A `AHASemanticInsightQualityGate`

Før evaluering kontrolleres:

```text
source_event_id equality
source_text_hash equality
sha256(SourceEvent.text) equality
```

Mismatch stopper før evaluator-kall.

---

## 6. Runtime-output

Runtime holder bare siste evaluering i minnet og kan sende metadata-eventet:

```text
aha:semantic-evaluation-shadow
```

Eventet inneholder:

- schema/version
- source event-id/hash
- valid-status
- metrics
- gate metadata

Det inneholder ikke:

- full source text
- proposition text
- evidence quotes
- full model shadow

---

## 7. Invalid evaluering er observerbar, ikke autoritativ

Hvis Phase 3A-evaluatoren returnerer `valid:false`, kan runtime fortsatt holde og sende den sikre evalueringsmetadataen slik at QA kan se hva som feilet.

Men portene forblir:

```text
synthesis_allowed = false
canonical_write = false
meta_write = false
persistent_write = false
```

---

## 8. Denne PR-en kobler ikke scriptet inn i chat.html

Phase 3B implementerer og tester runtime-kontrakten, men gjør **ingen load-order/endring i `chat.html`** i samme PR.

Dette er bevisst:

- unngår å blande kontrakt og produksjonswiring
- unngår å overskrive parallelt UI-arbeid
- lar full repo-CI bevise evaluator/runtime først

En etterfølgende minimal wiring-PR skal kun laste:

```text
ahaSemanticInsightQualityGate.js
ahaSemanticEvaluationRuntime.js
```

etter model-shadow bridge og før brukerens chat-runtime begynner å produsere events.

---

## 9. Neste etappe

Etter grønn Phase 3B:

```text
Phase 3C — Minimal evaluation runtime wiring
```

Deretter utvides gold-settet med flere representative teksttyper før noen autoritativ synthesis-terskel vurderes.
