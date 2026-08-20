# AHA Interpretation / Insight Synthesis V2

## Status

Denne fasen bygger selve abstraksjonslaget som live-reviewed gold viste at AHA mangler.

```text
phase: Interpretation / Insight Synthesis V2
mode: explicit QA shadow only
normal chat behavior changed: no
extra model call in normal chat: no
canonical Insight write: disabled
Chamber write: disabled
Meta write: disabled
persistent semantic write: disabled
production gate authority: disabled
```

V2 er ikke en ny database eller en parallell Insight-motor. Den ligger etter eksisterende source-direct `SemanticDocument` / semantic model shadow og før enhver framtidig canonical Insight-write.

## 1. Produktkjeden

```text
Source
→ entities / concepts / source claims / source-explicit relations
→ Interpretation / Insight Synthesis V2
→ Insight Quality Gate V2
→ shadow review
→ [canonical Chamber write fortsatt lukket]
```

Den viktige endringen er at V2 ikke spør «hva står det i teksten?». Den ber eksplisitt om høyereordens forståelse:

- principle
- mechanism
- pattern
- tension
- consequence
- generalization

Source claims forblir evidence. De får ikke automatisk Insight-status.

## 2. Synthesis får ikke de gamle interpretationene som råstoff

Browser-runtime bygger `semantic_context` bare fra:

```text
entities[]
concepts[]
source_claims[]
source-explicit relations[]
```

Følgende sendes ikke videre til V2:

```text
V1 interpretations
V1 inferences
unresolved inferences
assistant reply
chat response
Meta profile
Chamber
memory
```

Dette er bevisst. Live-gold viste at V1-interpretationene ofte er source-nære parafraser. Hvis V2 fikk dem som input, kunne laget bare polere de samme svake formuleringene i stedet for å syntetisere source claims på nytt.

`SOURCE_TEXT` er fortsatt eneste evidensautoritet. `semantic_context` er strukturhjelp, ikke bevis.

## 3. Serverkontrakt

Pure ESM-kontrakt:

```text
server/ahaInsightSynthesisContractV2.js
schema: aha_insight_synthesis_output_v2
contract: aha_insight_synthesis_contract_v2
```

Synthesis bruker samme deployede source-direct HTTP-seam som Semantic Model V1:

```text
POST /api/aha-agent/semantic-document
```

Dispatch skjer eksplisitt gjennom:

```json
{
  "format": "aha_insight_synthesis_output_v2"
}
```

Det opprettes dermed ingen ny backendbase eller parallell API-konfigurasjon.

Responses API + strict JSON Schema er fortsatt obligatorisk. Det finnes ingen svak chat-completions-fallback.

## 4. Candidate-kontrakt

Hver kandidat må ha:

```text
insight
type
abstraction
evidence[]
why_it_matters
confidence
uncertainty
causal_status
```

Tillatte `type`-verdier:

```text
principle
mechanism
pattern
tension
consequence
generalization
```

`abstraction` forklarer hva som faktisk er koblet eller abstrahert utover de enkelte source claims.

`why_it_matters` skal forklare anvendbar verdi. «Dette er viktig» er ikke nok.

## 5. Evidence-kontrakt

Hver kandidat må ha 2–3 distinkte evidence quotes.

Alle quotes må:

1. finnes ordrett i source
2. være forskjellige
3. mappes tilbake til eksisterende deterministic evidence anchors i browseren

Serverkontrakten avviser hallusinert evidence før output når browseren.

Quality Gate V2 er enda strengere: minst to evidence quotes må komme fra **forskjellige source-setninger**. Dette tvinger synthesis til å koble flere observations/claims i stedet for å omskrive én setning.

## 6. Hva som eksplisitt ikke er en synthesized Insight

V2-instruksen og Quality Gate V2 låser:

```text
source excerpt != Insight
literal source sentence != Insight
light paraphrase != Insight
one-sentence summary != Insight
generic statement != Insight
unsupported causal claim != Insight
```

En kandidat kan være grammatisk god og fortsatt bli avvist fordi den ikke tilfører semantisk transformasjon.

## 7. Insight Quality Gate V2

Pure browser gate:

```text
js/ahaInsightQualityGateV2.js
schema: aha_insight_quality_gate_v2
```

Per kandidat måler den blant annet:

- exact evidence
- evidence diversity across source claims
- semantic distance from nearest source sentence
- lexical grounding back to evidence
- abstraction strength
- usefulness / `why_it_matters`
- causal discipline

Hard rejection skjer blant annet ved:

- literal source text
- source-nær parafrase
- bare én evidence-setning
- generisk Insight
- svak/manglende abstraction
- semantisk disconnect fra evidence
- kausalt språk med `causal_status=not_causal`
- `source_explicit` kausalitet uten eksplisitt kausal source
- interpretiv kausalitet uten uncertainty
- interpretiv kausalitet med `confidence=high`

Quality score er sekundær til hard gates. En kandidat kan ikke score seg forbi en evidence- eller kausalitetsfeil.

## 8. Browser-runtime

Runtime:

```text
js/ahaInsightSynthesisRuntimeV2.js
```

Den lytter etter:

```text
aha:semantic-model-shadow
```

og krever at:

- SourceEvent finnes
- deterministic SemanticDocument finnes
- model shadow finnes
- source_event_id matcher i alle lag
- source_text_hash matcher i alle lag
- SHA-256 av faktisk SourceEvent.text matcher

Deretter:

```text
build semantic_context
→ POST semantic-document with V2 format
→ validate safe synthesis envelope
→ map every evidence quote to deterministic source anchors
→ build memory-only aha_insight_synthesis_shadow_v2
→ run AHAInsightQualityGateV2
```

Bare metadata sendes i runtime-events. Full source og full candidate-tekst sendes ikke i eventene.

## 9. Operator-only wiring

V2 lastes foreløpig bare gjennom:

```text
semantic-evaluation-shadow.html
```

Operator-iframe aktiverer eksplisitt:

```text
?ahaSemanticModelShadow=1&ahaInsightSynthesisV2=1
```

Normal `chat.html` laster ikke:

```text
ahaInsightQualityGateV2.js
ahaInsightSynthesisRuntimeV2.js
ahaInsightSynthesisBootstrapV2.js
```

Vanlige brukere får derfor ikke et ekstra synthesis-kall eller nye synlige Insights i denne fasen.

## 10. Live-reviewed gold er neste autoritet

V1-baseline fra seks produksjonscaser er:

```text
entities F1        0.923077
concepts F1        0.774194
source claims F1   1.000000
relations F1       0.523810
interpretations F1 0.166667
```

V2 skal vurderes mot **de samme seks source/gold-casene**.

Målet i neste målerunde er ikke å forbedre source claims — de er allerede perfekte i corpuset. Målet er å vise at V2 produserer flere gold-matchede, generaliserbare interpretations uten å ofre evidence fidelity eller introdusere kausal overreach.

Canonical write vurderes ikke før:

1. V2 er deployet shadow-only
2. alle seks live cases er kjørt gjennom den nye synthesis-ruten
3. output er hånd-/gold-evaluert
4. Quality Gate V2 avviser source-nære og kausalt svake kandidater
5. interpretation-resultatet er klart bedre enn live baseline

## 11. Write-policy

Alle V2-lag holder:

```text
production_gate_authority = false
synthesis_allowed = false
canonical_write = false
chamber_write = false
persistent_write = false
meta_write = false
```

Meta kommer etter canonical Insight-laget, ikke før.
