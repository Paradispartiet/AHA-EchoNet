# AHA–History Go Fagverk Release Sync

## Formål

History Go er produsent og sannhetskilde for Fagverk. AHA-EchoNet er en versjonert forbruker.

Synkroniseringen skal oppdage alle registrerte Fagverk-endringer, vise hva som faktisk er endret og bygge review-kandidater uten å aktivere uferdig innhold i innsiktsmotoren.

## Produsentrelease v2 i History Go

History Go publiserer:

```text
data/fagverk/fagverk_release.json
```

Release v2 bygges samlet fra:

```text
data/fagverk/subject_inventory.json
data/fag/fag_manifest.json
data/fagverk/fagverk_registry.json
alle manifestregistrerte fagfiler
alle registryregistrerte kapittel-, modul-, brief-, claims- og kildefiler
```

Releasen dekker hele den registrerte arkitekturen:

```text
17 hovedfag
1 eksplisitt spesialisering: teknologi under vitenskap
18 observerbare fagpakker totalt
```

For hver fagpakke registreres blant annet:

- om pakken er hovedfag eller spesialisering
- overordnet fag for spesialiseringer
- schemafamilie og adapterfamilie
- obligatoriske og valgfrie manifestfelt
- pakkestatus
- kapittelstatus
- alle deklarerte fagfiler med fil- og innholdsdigest
- kapittel-, modul-, brief- og claims-antall der kapittelverk finnes
- struktur-, pakke-, kapittel- og samlet innholdsdigest
- manglende obligatoriske filer
- eksplisitte valgfrie hull

Strukturen er inventory-, manifest- og registry-drevet. Det finnes ingen permanent forutsetning om et bestemt antall fag, kapitler eller moduler.

En endring i en kanonisk fagfil, schemafamilie, manifestkobling, kapittelrekkefølge, ID, modul, brief, claims eller kildefil gir ny relevant digest.

### Obligatoriske og valgfrie hull

Manglende obligatoriske manifestfelt, pakkefiler eller kapittelfiler stopper releasen.

Manglende valgfrie filer stopper ikke releasen, men publiseres som:

```text
package_status: complete_with_optional_gaps
missing_optional_files: [...]
```

Dermed blir redaksjonell gjeld synlig uten å fremstille et komplett kjernefag som ødelagt.

## Oppdagelse i AHA

AHA-workflowen:

```text
.github/workflows/aha-history-go-fagverk-release-sync.yml
```

kjøres på fire måter:

1. `repository_dispatch` fra History Go etter merge når `AHA_ECHONET_DISPATCH_TOKEN` er konfigurert
2. automatisk polling én gang i timen
3. manuell `workflow_dispatch`
4. automatisk etter endringer i selve AHA-synkinfrastrukturen på `main`

Polling er bindende fallback. Synkroniseringen avhenger derfor ikke av at cross-repo-tokenet finnes.

## To kandidattyper

AHA tvinger ikke alle fag inn i samme materialiseringsmodell.

### Kapittelkandidat

For fag som har:

```text
chapter_status: materialized
```

bygges et deterministisk kapittelkorpus med:

- registrydekning
- kapittel- og modulparity
- termkollisjoner
- kildeproveniens
- separat candidate-audit

### Fagpakkekandidat

For fag som har:

```text
chapter_status: not_materialized
```

bygges et pakkeinventar, ikke oppdiktede kapitler. Kandidaten inneholder:

- schemafamilie
- pakke- og strukturstatus
- alle deklarerte fagfiler
- obligatorisk/valgfri klassifisering
- filvise digester
- pakke-, struktur- og samlet digest
- eksplisitte valgfrie hull
- egen package candidate-audit

Et fag kan dermed observeres og vurderes før det eventuelt får et eget kapittelverk.

## Automatisk review-PR

Når History Go har en annen release-digest enn siste observerte release, oppretter eller oppdaterer AHA branchen:

```text
automation/history-go-fagverk-release
```

og en pull request mot `main`.

PR-en inneholder:

```text
data/integrations/history-go-fagverk-release.observed.json
data/integrations/review/history-go-fagverk-release-update.v1.json
data/integrations/candidates/history-go-fagverk-<fag>.candidate.v1.json
data/integrations/candidates/history-go-fagverk-<fag>.candidate-audit.v1.json
```

Filnavnet `release-update.v1.json` beholdes av kompatibilitetshensyn, mens dokumentets schema er versjonert uavhengig og er v2 etter migreringen.

Rapporten viser per fag:

- lagt til, fjernet, endret eller uendret
- fagtype, overordnet fag og schemafamilie
- pakkestatus og kapittelstatus
- pakkefil-, kapittel-, modul- og referansedelta
- valgfrie hull
- hvilke digester som er endret
- hvilken forbrukerhandling AHA krever

Nye og endrede fag får riktig kandidatvariant. Fjernede fag får gamle kandidatfiler fjernet.

## Fire separate livssyklustilstander

### 1. Observert upstream-release

```text
data/integrations/history-go-fagverk-release.observed.json
```

Betyr at AHA har sett og verifisert en eksakt History Go-release.

Det betyr ikke at kandidater er godkjent eller aktive.

### 2. Importerte review-kandidater

```text
data/integrations/candidates/
```

Betyr at AHA har materialisert etterprøvbare kapittel- eller pakkekandidater fra den observerte releasen.

Kandidatene er ikke runtime-inndata.

### 3. Godkjent release eller korpus

```text
data/integrations/history-go-fagverk-release.approved.json
```

Betyr at innholdet har passert fagspesifikke policy-, korreksjons- og evalueringsporter.

Godkjenning alene aktiverer ikke innholdet.

### 4. Runtime-aktiv peker

```text
data/integrations/history-go-fagverk-release.runtime-active.json
```

Beskriver hvilken godkjent kilde og hvilket korpus runtime faktisk er bundet til.

Pekeren kan bare endres i en separat, eksplisitt aktiverings-PR.

Ved innføringen er bare det eksisterende trekapitlers seed-korpuset godkjent og runtime-aktivt:

- Natur: `okosystem_mangfold_habitat`
- Politikk: `forvaltning`
- Historie: `1814_statsdannelse`

Hele History Go-releasen er verken godkjent eller aktiv.

## Permanent validering

Workflowen:

```text
.github/workflows/aha-history-go-fagverk-release-validate.yml
```

kjører med read-only repository permissions og:

1. leser eksakt History Go-commit fra observed-filen
2. sjekker ut denne committen
3. regenererer og verifiserer produsentreleasen
4. sammenligner release-, inventory-, manifest- og fagdigester
5. regenererer alle observerte kandidater med riktig kandidatbygger
6. krever byte-for-byte parity
7. kontrollerer komplett kandidatinventar
8. kontrollerer at observed, candidate, approved og runtime-active forblir separate
9. kontrollerer at runtime ikke leser observed-, review- eller candidate-filene

Valideringen støtter både den eksisterende v1-tilstanden og v2 etter at den automatiske migrerings-PR-en er opprettet. Dette gjør selve overgangen etterprøvbar.

## Politikk

Når Politikk endres, er kandidatcorpus alene ikke nok.

Ny Politikk-release krever også:

- ny termkollisjonsrapport
- ny term-policy
- ny fagmatrise
- nytt fixture- og artikkelkorreksjonssett
- separat aktiveringsaudit

Den automatiske synken markerer denne handlingen som:

```text
rebuild_chapter_corpus_term_policy_and_correction_gates
```

## Runtime-aktivering

Ingen automatisk synk-PR kan aktivere Fagverk i Python-motoren.

Aktivering krever en separat pull request som både:

1. oppdaterer approved-kontrakten etter beståtte fagporter
2. oppdaterer runtime-active-pekeren til nøyaktig den godkjente kilden og korpuset

Følgende grenser er bindende:

```text
observed release != imported candidates
imported candidates != approved release
approved release != runtime-active release
successful sync != successful faglig evaluering
successful faglig evaluering != runtime activation
```
