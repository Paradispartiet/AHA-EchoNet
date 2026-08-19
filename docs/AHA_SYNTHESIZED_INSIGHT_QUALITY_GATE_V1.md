# AHA Synthesized Insight Quality Gate V1

## Status

Denne fasen innfører en **ren, shadow-only semantisk evaluator** mellom model-assisted SemanticDocument og en framtidig synthesized Insight-pipeline.

```text
module: js/ahaSemanticInsightQualityGate.js
runtime API: AHASemanticInsightQualityGate
AHAModuleApi: semanticInsightQualityGate@1

evaluation schema: aha_semantic_evaluation_v1
gate schema: aha_synthesized_insight_quality_gate_v1

authoritative: false
gold evaluation required: true
synthesis allowed: false
canonical write: false
Meta write: false
persistent write: false
```

V1 åpner **ikke** synthesized Insight-produksjon. Den kan bare si at enkelte modellproposisjoner er gode nok til å gå videre til **synthesis review**.

---

## 1. Plass i V2-flyten

```text
SourceEvent
→ deterministic SemanticDocument shadow
→ Semantic Model endpoint
→ model-assisted shadow
→ Semantic Evaluation V1
→ Synthesized Insight Quality Gate V1
→ synthesis review only
```

Neste autoritative steg finnes ikke ennå:

```text
synthesis review
-X→ canonical Insight
```

Det krysset skal ikke fjernes før gold-evaluering og en senere autoritativ port er bevist.

---

## 2. Agreement er ikke precision

Phase 2C materialiserer overlap mellom deterministisk og modellassistert analyse:

- entity overlap
- concept overlap
- source-claim overlap

V1 rapporterer dette som **agreement rate**.

Det skal ikke omtales som:

- precision
- recall
- correctness
- accuracy

uten et håndmerket gold-sett.

To analyser kan være enige og begge ta feil. Et høyt overlap-tall er derfor observasjon om konsistens, ikke bevis på semantisk kvalitet.

---

## 3. Evidence fidelity

Evaluatoren revaliderer alle model-shadow source-bindings mot den originale source-teksten og deterministic evidence anchors.

Dette omfatter:

- Entity source-surface spans
- Entity evidence quote spans
- Concept source-surface spans
- Concept evidence quote spans
- source-claim spans
- proposition evidence
- relation evidence
- unresolved-inference evidence

Hard invariant:

```text
source_text.slice(start_offset, end_offset) === span.text
```

Og der bindingen representerer en bestemt source-surface/quote/claim:

```text
span.text === expected binding text
```

Span må også ligge innenfor det oppgitte deterministic evidence anchor.

Metrics:

```text
evidence_binding_total
evidence_binding_exact
evidence_binding_invalid
evidence_fidelity_rate
evidence_anchor_coverage_rate
```

Hvis én binding er ugyldig:

```text
evaluation.valid = false
synthesis_review_available = false
synthesis_allowed = false
```

---

## 4. Proposition policy V1

Modellkontrakten skiller allerede mellom:

```text
source_claim
interpretation
inference
```

Quality Gate V1 behandler dem forskjellig.

### source_claim

```text
source_claim = evidence, not synthesis
```

En source claim kan aldri være synthesis-review-kandidat i V1.

Blocking reason:

```text
source_claim_is_evidence_not_synthesis
```

### interpretation

En interpretation kan bare bli **eligible for synthesis review** hvis alle disse er sanne:

```text
kind = interpretation
confidence = high
evidence = exact source-bound evidence
text is non-empty
text is not itself a literal source substring
```

Dette er en nødvendig, men ikke tilstrekkelig port for framtidig Insight-syntese.

### inference

Inference er blokkert i V1, uansett confidence:

```text
inference_not_allowed_v1
```

Inference kan brukes i videre analyse, spørsmål eller testing, men ikke som synthesized Insight candidate gjennom denne porten.

---

## 5. Review eligibility er ikke synthesis permission

Evaluatoren kan produsere:

```text
eligible_for_synthesis_review = true
```

men global gate forblir:

```text
synthesis_allowed = false
```

Dette skillet er normativt.

`review eligibility` betyr bare:

> Denne interpretationen har nok source-binding og epistemisk disiplin til å bli vurdert i neste fase.

Det betyr ikke:

> Skriv dette som en AHA Insight.

---

## 6. Gate er uttrykkelig ikke autoritativ

Alle V1-resultater inneholder:

```text
authoritative = false
gold_evaluation_required = true
```

Globale blocking reasons inneholder alltid:

```text
shadow_gate_not_authoritative
gold_evaluation_required
```

Dermed kan ingen senere kode feilaktig tolke en grønn shadow-evaluering som tillatelse til canonical write uten samtidig å bryte gate-kontrakten.

---

## 7. Metrics

`aha_semantic_evaluation_v1` rapporterer:

```text
evidence_binding_total
evidence_binding_exact
evidence_binding_invalid
evidence_fidelity_rate
evidence_anchor_coverage_rate

entity_agreement_rate
concept_agreement_rate
source_claim_agreement_rate

interpretation_count
inference_count
unresolved_inference_count
relation_epistemic_counts

synthesis_review_eligible_count
synthesis_review_blocked_count
```

Agreement-denominator lik 0 gir `null`, ikke et oppdiktet 0- eller 1-tall.

---

## 8. Relation metrics

V1 scorer ikke relasjonspresisjon uten gold labels.

Den teller bare epistemisk status:

```text
source_explicit
interpretation
inference
unknown
```

Dette gir et evalueringsgrunnlag for senere håndmerking uten å late som modellen er korrekt fordi den produserer mange eller få relasjoner.

---

## 9. Privacy og output-minimering

Evalueringen returnerer ikke:

- full source text
- proposition text
- evidence quotes
- Entity/Concept labels
- full model shadow

Per-proposition output inneholder bare:

```text
proposition_index
kind
confidence
evidence_exact
eligible_for_synthesis_review
blocking_reasons
```

Dermed kan evalueringsstatus senere materialiseres eller logges uten å duplisere source-innholdet.

---

## 10. Failure policy

Evaluatoren feiler lukket ved blant annet:

- manglende source
- manglende deterministic document
- manglende model shadow
- feil model-shadow schema
- source-event mismatch
- source-hash mismatch mellom deterministic/model shadow
- unsafe model-shadow policy
- ugyldige deterministic anchors
- ugyldige evidence bindings

Ved invalid evaluation:

```text
synthesis_review_available = false
synthesis_allowed = false
canonical_write = false
Meta write = false
persistent write = false
```

---

## 11. Hva V1 bevisst ikke gjør

Denne fasen:

- kaller ikke modellen
- endrer ikke Semantic Model endpoint
- endrer ikke Chat-output
- endrer ikke eksisterende Insight Chamber
- skriver ikke Meta
- skriver ikke persistent data
- lager ikke synthesized Insight text
- scorer ikke semantic precision uten gold labels
- åpner ikke canonical write

---

## 12. Neste fase

Neste nødvendige etappe er:

```text
Gold Fixtures + Semantic Evaluation Runtime
```

Den skal:

1. etablere håndmerkede fixtures for entities, concepts, claims/propositions og relations
2. skille precision/recall fra ren agreement
3. koble `aha:semantic-model-shadow` til den rene evaluator-modulen
4. holde siste evaluation i runtime-minne
5. sende metadata-only `aha:semantic-evaluation-shadow`
6. bevise evalueringsresultater på representative teksttyper

Før gold-portene er definert og bestått forblir:

```text
authoritative = false
synthesis_allowed = false
canonical Insight write = false
Meta write = false
```
