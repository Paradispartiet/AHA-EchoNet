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

Det håndmerkede live-corpuset består av seks produksjonscases. V1-baseline for interpretation var:

```text
precision 0.166667
recall    0.166667
F1        0.166667
```

Source claims hadde samtidig F1 `1.0`. Målet med V2 er derfor ikke bedre ekstraksjon, men reell semantisk syntese.

## 2. Første V2-runde før kausal kalibrering

Første produksjonsrunde etter at Synthesis V2 ble bygget ga:

```text
valid production outputs: 6 / 6
candidates:                6
gate eligible:             0 / 6
quality scores:            ca. 0.57–0.74
```

Candidate-tekstene viste et klart abstraksjonsløft. Modellen fant blant annet:

- begrensninger som flytter kreativitet mot form/teknikk
- opplevd læringsvanskelighet i spenning med senere hukommelse
- delegasjon som flytter koordinasjonsproblemer mot ansvarsgrenser
- modularitet som flytter kompleksitet mot grensesnitt
- delvis standardisering som balanserer sammenlignbarhet og fleksibilitet

Flaskehalsen var epistemisk merking. Modellen brukte for ofte `source_explicit/high` eller `interpretive/high` på sammensatte mekanismer.

## 3. Kalibrering #1 — PR #822

Første kalibrering innførte blant annet:

```text
interpretive causal synthesis
→ confidence medium/low
→ uncertainty required

source_explicit
→ må være støttet av kandidatens egne evidence quotes

source avviser enkel årsak
→ causal mechanism skal blokkeres
```

Den norske anti-causal-regelen ble også gjort Unicode-sikker; JavaScript ASCII-`\b` kunne ellers overse ord som `årsak`.

## 4. Post-deploy-bevis for kalibrering #1

Etter merge av #822 ble produksjonsendepunktet kjørt på nytt mot de samme seks casene.

Deployen ble direkte bevist av retrieval-caset. Første modellforsøk ble avvist server-side med de nye feilkodene:

```text
candidate:0:interpretive_causality_confidence_must_not_be_high
candidate:0:interpretive_causality_uncertainty_required
```

Et senere forsøk ga gyldig output. Dermed var målingen faktisk mot den kalibrerte serverkontrakten, ikke gammel deploy.

Resultatet i den første post-deploy-runden var:

```text
valid production outputs: 6 / 6
candidates:                6
gate eligible:             3 / 6
strict historical gold F1: 0.000000
evidence-granularity proxy F1: 0.222222
```

Det historiske gold-tallet ble bevisst ikke omskrevet. Dagens V1-evaluator krever at candidate-evidence er nøyaktig samme quote-string som håndmerket gold. V2 bruker ofte en hel source-setning som inneholder det kortere gold-utdraget. Derfor registreres evidence-granularity-proxyen separat og er ikke en erstatning for baseline.

## 5. To falske positive i Quality Gate V2

Av de tre gate-godkjente kandidatene var constraints/creativity epistemisk konsistent. To andre viste språk/metadata-mismatch:

### Retrieval

Kandidaten var merket:

```text
causal_status = not_causal
```

men skrev i selve insight at aktiv gjenhenting **«førte det ... til»** en bestemt effekt.

### Mixed-use street

Kandidaten var merket `not_causal`, men brukte formuleringen **«skapes et bredere tidsmønster»**, samtidig som source uttrykkelig sier at materialet ikke peker ut ett enkelt tiltak som årsak.

Dette viste at metadatafelt alene ikke er nok. Quality Gate må kontrollere faktisk grammatisk kausalitet i insight-teksten.

## 6. Kalibrering #2

Andre kalibreringsrunde utvider derfor kausalitetskontrollen i både browser-gate og serverkontrakt.

`not_causal` avvises dersom insight bruker kausale konstruksjoner som blant annet:

```text
fører ... til
skaper / skapes
gir
øker
reduserer
muliggjør
gjør at
bidrar til
```

Serveren validerer nå også:

```text
not_causal + causal wording
→ fail closed

source_explicit uten eksplisitt kausalitet i candidate evidence
→ fail closed

source uttrykkelig avviser årsak + causal candidate wording/status
→ fail closed
```

Prompten instruerer samtidig modellen til å bruke ikke-kausale formuleringer som `samtidig som`, `opptrer sammen med` og `er forbundet med` når evidensen bare viser mønster eller samvariasjon.

## 7. Gate-verifikasjon før server-kalibrering #2 er deployet

Før merge av kalibrering #2 ble den nye lokale gaten kjørt mot dagens deployede #822-server.

Resultat:

```text
valid production outputs: 6 / 6
gate eligible:             2 / 6
strict historical gold F1: 0.000000
evidence-granularity proxy F1: 0.250000
```

De to tidligere falske positive oppførte seg nå korrekt:

- retrieval med `førte ... til` ble avvist
- mixed-use passerte bare i et nytt modellforsøk der insight faktisk var ikke-kausal: bruksformer **korresponderte** med tidsmønsteret, og kandidaten gjorde årsaksbegrensningen eksplisitt

Constraints/creativity var den andre gate-godkjente kandidaten og hadde eksplisitt source-belegg for at begrensninger `kan flytte` kreativitet mot form/teknikk.

Delegation, modularity og standardization ble fortsatt avvist fordi produksjonsmodellen merket sammensatte sammenhenger `source_explicit` uten at kandidatens evidence uttrykte hele den kausale relasjonen eksplisitt.

Dette er forventet før serverprompten fra kalibrering #2 er deployet.

## 8. Hva tallene betyr — og ikke betyr

`2 / 6` er **ikke** den nye autoritative V2-kvaliteten. Den runden brukte ny lokal gate, men fortsatt serverprompten fra #822.

Den neste relevante målingen må skje etter at kalibrering #2 er merget og deployet. Da skal modellen selv tvinges til enten:

- korrekt `pattern` / `tension` + `not_causal`
- korrekt `interpretive` + medium/low + uncertainty
- eller fail-closed output som må regenereres

før Quality Gate vurderer kandidaten.

## 9. Neste autoritative måling

Etter deploy av kalibrering #2 kjøres de samme seks casene igjen. Rapporten skal minst inneholde:

```text
valid output rate
validation-retry rate
candidate count
gate eligibility
causal rejection reasons
strict historical interpretation P/R/F1
evidence-granularity proxy P/R/F1
human review of semantic equivalence
```

Det historiske evaluator-resultatet beholdes uendret for sammenlignbarhet. Hvis human review viser systematiske false negatives på grunn av synonymi/evidence-granularitet, skal en separat V2-gold-evaluator spesifiseres og baseline beregnes på nytt med samme evaluator for både V1 og V2 — ikke ved å endre gammel score i etterkant.

## 10. Write-policy

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
