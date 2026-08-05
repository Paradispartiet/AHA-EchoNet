# AHA Politics Fagverk runtime activation V1

## Status

Politikk er aktivert som det første fullstendige, fagvis godkjente Fagverk-laget i AHA-runtime.

Aktiveringen gjelder History Go-kilden `c16a187453d16a40f9cab4ca694c32e96014f31b` og omfatter:

- 13 Politikk-kapitler
- 39 registrerte modulfiler
- deterministisk korpus-SHA `981ab3ad25f972bd13c70a0247f26b8796e43b8cd3cde7282b7d073bfcc79dec`
- 143 klassifiserte kollisjonstermer
- 34 av 34 beståtte policy-evalueringscaser
- 16 av 16 beståtte fixture-korreksjoner

## Lagdeling

Aktiveringen endrer ikke det gamle seedkorpuset. Runtime komponeres i stedet av to lag:

1. legacy-seedlaget, der aktive fag fjernes før bruk
2. fagvise runtimepakker registrert i `history-go-fagverk-release.runtime-active.json`

Politikk overstyrer derfor den gamle enkeltoppføringen `forvaltning`. Den forekommer ikke dobbelt i den effektive runtimekorpusen.

Effektiv runtime etter aktiveringen:

- 13 Politikk-kapitler
- 1 Natur-seedkapittel
- 1 Historie-seedkapittel
- totalt 15 kapitler

## Runtimeartefakter

Politikk leses bare fra materialiserte runtimeartefakter:

- `data/integrations/runtime/history-go-fagverk-politikk.corpus.v1.json`
- `data/integrations/runtime/history-go-fagverk-politikk.policy.v1.json`

Motoren leser ikke kandidat-, review- eller approvalfiler ved kjøring. Disse brukes bare av den deterministiske aktiveringsbyggeren og CI.

## Scoring

Politikk bruker `subject_policy_v1`, ikke den generelle seedscoreren. Policyen håndhever:

- ikke-scorende generiske og høyrisiko termer
- nedvekting av tverrkapitteltermer
- kapittelspesifikke ankerkrav
- supplerende, kapittelavgrenset evidens
- minimumsscore 6
- minst to scorende termer
- tvetydighetsmargin 3

Dermed aktiveres ikke de 13 kapitlene med svakere regler enn dem som ble godkjent i reviewsporet.

## Sikkerhetsgrenser

Runtimeaktiveringen:

- gjør ingen nettverkskall
- skriver ikke tilbake til History Go
- trener eller finjusterer ingen modell
- aktiverer ingen andre Fagverk-fag
- bruker ikke observerte kandidater uten fagvis godkjenning
- beholder `full_release_active: false`

## Regresjonsporter

En aktiveringsendring kan bare merges når:

- runtimebyggeren reproducerer alle fire aktiveringsartefakter byte-for-byte
- Python-runtime består alle 34 Politikk-caser
- Python-runtime består alle 16 fixture-korreksjoner
- eksisterende Natur-, Historie-, unsupported- og ambiguity-tester består
- Node-, syntaks- og AHA Engine-testene er grønne
- legacy-seedkorpuset er uendret
