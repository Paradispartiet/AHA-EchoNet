# AHA Insight Synthesis V2 — Live Calibration — 2026-08-20

## Status

Dette dokumentet registrerer de faktiske produksjonsmålingene som brukes til å kalibrere `Interpretation / Insight Synthesis V2` og `Insight Quality Gate V2`.

```text
mode: production-model shadow evaluation
canonical Insight write: disabled
Chamber write: disabled
Meta write: disabled
persistent semantic write: disabled
production gate authority: disabled
```

Ingen av målingene nedenfor åpner write-porten.

## 1. Sammenligningsgrunnlag

Det håndmerkede live-corpuset består av seks produksjonscases. Historisk V1-baseline for interpretation er fortsatt:

```text
precision 0.166667
recall    0.166667
F1        0.166667
```

Source claims hadde samtidig F1 `1.0`. Målet med V2 er derfor høyereordens semantisk syntese, ikke bedre source-ekstraksjon.

## 2. Første V2-runde

Før kausal kalibrering ga produksjonsmodellen:

```text
valid outputs:  6 / 6
candidates:     6
gate eligible:  0 / 6
quality scores: ca. 0.57–0.74
```

Candidate-tekstene viste allerede et tydelig abstraksjonsløft, men sammensatte mekanismer ble for ofte merket `source_explicit/high` eller `interpretive/high`.

## 3. Kalibrering #1 — PR #822

Første kalibrering innførte blant annet:

```text
interpretive causal synthesis
→ confidence medium/low
→ uncertainty required

source_explicit
→ må være støttet av kandidatens egne evidence quotes

source avviser enkel årsak
→ causal mechanism blokkeres
```

Produksjonsdeployen ble direkte bevist da retrieval først returnerte 502 med de nye valideringskodene for `interpretive + high` og manglende uncertainty før et nytt forsøk passerte.

Første post-deploy-resultat:

```text
valid outputs:                  6 / 6
gate eligible:                  3 / 6
strict historical F1:           0.000000
evidence-granularity proxy F1:  0.222222
```

To av de tre gate-godkjente kandidatene var falske positive i selve språkdisiplinen: retrieval var merket `not_causal` men sa `førte ... til`, og mixed-use var merket `not_causal` men sa `skapes` selv om source eksplisitt avviste enkel årsaksidentifikasjon.

## 4. Kalibrering #2 — PR #823

Kalibrering #2 flyttet grammatisk kausalitetskontroll inn i både browser-gate og serverkontrakt.

`not_causal` avvises ved kausale konstruksjoner som blant annet:

```text
fører / førte ... til
skaper / skapes
gir
øker
reduserer
muliggjør
gjør at
bidrar til
```

Serveren validerer også fail-closed:

```text
not_causal + causal wording
source_explicit uten eksplisitt kausalitet i candidate evidence
causal wording/status som strider mot eksplisitt source-begrensning
```

Prompten ber ikke-kausale kandidater bruke formuleringer som `samtidig som`, `opptrer sammen med` og `er forbundet med` og beholde kildebegrensningen synlig.

En pre-merge local-gate-runde mot #822-serveren ga 2/6 eligible og bekreftet at de to tidligere falske positive ikke lenger slapp gjennom.

## 5. Autoritativ post-#823 produksjonsrunde

Etter merge av #823 ble de samme seks casene kjørt mot produksjonsendepunktet på nytt.

Provenance er lagret permanent i:

```text
tests/fixtures/semantic-live-reviewed-v2/post-causal-language-v1.json
```

Produksjonsbevis:

```text
workflow run: 32341795351
artifact id:  9396621144
artifact sha: sha256:774dde8dabd0f847d19bf4953b0ac66e263f5335841f5aa407f860d6d97c23e4
model:        gpt-4.1-mini-2025-04-14
```

Målingen ga:

```text
valid outputs:                  6 / 6
total model attempts:           11
candidates:                     6
gate eligible:                  6 / 6
strict historical P/R/F1:      0.166667 / 0.166667 / 0.166667
evidence-granularity proxy F1:  0.333333
```

Serveren avviste seks `source_explicit_causality_not_in_evidence`-forekomster før regenerering. Det beviser at #823-kontrakten var deployet og aktiv, og at ugyldig kausal merking ble stoppet før browser-gaten.

## 6. Hvorfor historisk F1 ikke lenger beskriver synthesis-kvaliteten godt

Den historiske V1-evaluatoren beholdes uendret. Den krever blant annet eksakt håndmerket termbruk og eksakte evidence-quote-strenger. V2 returnerer ofte semantisk ekvivalente formuleringer og lengre ordrette source-sitater.

Eksempler fra post-#823-runden:

- retrieval uttrykker `vanskeligere` + bedre langtidslagring/hukommelse uten å bruke nøyaktig samme termstreng som gammel gold
- mixed-use uttrykker den kausale begrensningen korrekt uten nødvendigvis å bruke ordet `årsak` i insight-feltet
- constraints bruker hele source-setningen som evidence mens gammel gold bruker et kortere delutdrag

Derfor blir den historiske scoren stående som kompatibilitetsmåling, men brukes ikke alene til å avgjøre om V2 faktisk har syntetisert riktig forståelse.

## 7. Semantic Insight Review Evaluator V2

En separat evaluator er nå spesifisert i:

```text
js/ahaSemanticInsightReviewEvaluatorV2.js
tests/fixtures/semantic-insight-review-gold-v2.json
tests/aha-semantic-insight-review-evaluator-v2.test.cjs
```

Reglene er symmetriske for V1 og V2:

- samme seks gold-cases vurderes
- semantiske meningsgrupper må finnes i kandidatens `insight`, `abstraction` eller `uncertainty`
- `why_it_matters` kan ikke levere manglende kjernebetydning
- source evidence kan ikke levere manglende kjernebetydning
- evidence brukes til grounding og cross-claim-krav
- kontrollerte aliaser/synonymer er tillatt der review-gold eksplisitt definerer dem
- en forventet insight kan matches høyst én gang

Det gamle V1-tallet omskrives ikke. Review-evaluatoren beregner i stedet en ny, lik måling på begge output-sett.

Resultat låst i CI:

```text
V1 semantic-review:
TP 1 / predicted 6 / expected 6
precision 0.166667
recall    0.166667
F1        0.166667

V2 semantic-review:
TP 5 / predicted 6 / expected 6
precision 0.833333
recall    0.833333
F1        0.833333
```

Node-suiten låser eksplisitt:

```text
aha-semantic-insight-review-evaluator-v2 passed: V1 F1 0.166667 -> V2 F1 0.833333
```

## 8. Stabilitetssekvens etter PR #824

PR #824 gjorde Semantic Insight Review Evaluator V2 permanent og låste like-for-like-målingen `V1 F1 0.166667 → V2 F1 0.833333`. Gold og evaluator ble deretter holdt uendret gjennom hele stabilitetsarbeidet.

```text
#825  bevarte delegation → eksplisitte ansvarsgrenser
#826  to-runders probe: delegation 2/2, men bredere stokastisk ustabilitet; lukket uten merge
#827  temperatur 0.2, source/canonical-bevaring, causal-limit-bevaring og fire fail-closed forsøk
#829  brøt causal retry-lock og fjernet ikke-evidensielle relation-hints på retry
#830  låste not_causal-retry til nøytral relasjonsordlyd
#831  krevde tre modularity-evidence-sider, inkludert forsinket koordinering
#832  krevde retrieval-metoden og det samlede vanskelighet/hukommelse-utfallet i evidence
```

To diagnostiske #828-runder ble korrekt avvist før sluttmålingen:

- run `32363802802`, artifact `9404596154`: 6/6 gyldige i begge runder, men modularity manglet koordinering-premisset i runde 1
- run `32364904124`, artifact `9404954145`, digest `sha256:0ed9ad0ccb05c9afed37aec3f27e4f10b17b710ff3d2a8aeb89df35d89755a50`: modularity var stabil, men retrieval manglet metode-evidence i runde 1

Begge beholdt `stable_all_six_match=false`; ingen av dem ble brukt som akseptbevis.

## 9. Autoritativ to-runders sluttmåling

Etter produksjonsdeploy av #832 ble samme seks-case review-gold kjørt uendret to ganger.

Permanent provenance og de eksakte artifact-filene ligger i:

```text
tests/fixtures/semantic-live-reviewed-v2/post-stability-two-round-v1/
```

Produksjonsbevis:

```text
workflow run:    32366046900
artifact id:     9405381366
artifact digest: sha256:0284594f709bf224076f2a93e9d7cdb9c200d91c8bbc8aec92f7fc040337dbac
source head:     e59fc69b45e64f602f8cd57dc86bea1d76e7178e
production main: 02521a405c46294f40e7a9361564cde120e656a0
model:           gpt-4.1-mini-2025-04-14
```

Resultat:

```text
runde 1: 6/6 gyldige, 7 modellforsøk, V1 F1 0.166667, V2 F1 1.000000
runde 2: 6/6 gyldige, 6 modellforsøk, V1 F1 0.166667, V2 F1 1.000000
all_rounds_six_valid = true
stable_all_six_match = true
```

Det ekstra forsøket i runde 1 var en forventet intern, fail-closed regenerering etter `source_limitation_wording_not_preserved:peker_ikke_ut`. Ugyldig output ble ikke returnert til klienten.

## 10. Beslutning

Den strenge seks-case review-målingen er nå stabil over to uavhengige produksjonsrunder. Dette fullfører kvalitets- og stabilitetsbeviset for shadow-laget; det åpner ikke automatisk noen produksjonsautoritet.

CI låser nå både det permanente historiske løftet og sluttmålingen:

```text
historisk like-for-like: V1 F1 0.166667 → V2 F1 0.833333
sluttmåling runde 1:     V2 F1 1.000000
sluttmåling runde 2:     V2 F1 1.000000
```

## 11. Write-policy

Fortsatt uendret:

```text
production_gate_authority = false
synthesis_allowed = false
canonical_write = false
chamber_write = false
persistent_write = false
meta_write = false
```

Meta kommer først etter at et stabilt, gold-målt canonical Insight-lag finnes.
