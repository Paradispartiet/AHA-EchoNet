# AHA–History Go Fagverk Release Sync

## Formål

History Go er produsent og sannhetskilde for Fagverk. AHA-EchoNet er en versjonert forbruker.

Synkroniseringen skal oppdage alle registrerte Fagverk-endringer uten å aktivere uferdig innhold i den levende innsiktsmotoren.

## Produsentrelease i History Go

History Go publiserer:

```text
data/fagverk/fagverk_release.json
```

Releasen bygges fra:

```text
data/fagverk/fagverk_registry.json
kapittelfilene som registryet peker på
moduleFiles
briefFile
claimsFile
```

For hvert fag registreres blant annet:

- kapittelantall
- antall modulfiler
- antall refererte kildefiler
- struktur-digest
- innholds-digest
- kapittelvise digester
- manglende filer

Strukturen er registry-drevet. Det finnes ingen forutsetning om tretten kapitler eller tre moduler per kapittel.

En endring i innhold, kapittelrekkefølge, ID, filkobling, modulantall, brief eller claims gir ny digest.

History Go-workflowen regenererer releasen og krever byte-for-byte parity. En Fagverk-PR som ikke har oppdatert releasefil kan derfor ikke passere porten.

## Oppdagelse i AHA

AHA-workflowen:

```text
.github/workflows/aha-history-go-fagverk-release-sync.yml
```

kjøres på tre måter:

1. `repository_dispatch` fra History Go etter merge, når `AHA_ECHONET_DISPATCH_TOKEN` er konfigurert i History Go
2. automatisk polling én gang i timen
3. manuell `workflow_dispatch`

Polling er bindende fallback. Synkroniseringen avhenger derfor ikke av at cross-repo-tokenet finnes.

## Automatisk review-PR

Når History Go har en annen release-digest enn siste observerte release, oppretter eller oppdaterer AHA automatisk branchen:

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

Rapporten viser per fag:

- lagt til, fjernet, endret eller uendret
- kapitteldelta
- moduldelta
- kildefildelta
- om struktur-digest er endret
- om innholds-digest er endret
- hvilken forbrukerhandling AHA krever

Nye og endrede fag får kandidatcorpus. Fjernede fag får gamle kandidatfiler fjernet.

## Observert er ikke godkjent

AHA har to separate tilstander.

### Observert

```text
data/integrations/history-go-fagverk-release.observed.json
```

Betyr at AHA har:

- sett releasen
- verifisert History Go-committen
- bygget kandidatcorpus
- kontrollert registrydekning og modultall

Det betyr ikke runtime-godkjenning.

### Godkjent

```text
data/integrations/history-go-fagverk-release.approved.json
```

Denne filen beskriver hva den aktive motoren faktisk kan bruke.

Ved innføringen er bare det eksisterende trekapitlers seed-korpuset godkjent:

- Natur: `okosystem_mangfold_habitat`
- Politikk: `forvaltning`
- Historie: `1814_statsdannelse`

Hele History Go-releasen er ikke godkjent.

## Permanent validering

Workflowen:

```text
.github/workflows/aha-history-go-fagverk-release-validate.yml
```

kjører med read-only repository permissions og:

1. leser eksakt History Go-commit fra observed-filen
2. sjekker ut denne committen
3. regenererer og verifiserer produsentreleasen
4. sammenligner release- og fagdigester
5. regenererer alle observerte kandidatcorpus
6. krever byte-for-byte parity
7. kontrollerer at runtime fortsatt ikke leser observed-, review- eller candidate-filene

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
rebuild_corpus_term_policy_and_correction_gates
```

## Runtime-aktivering

Ingen automatisk synk-PR kan aktivere Fagverk i Python-motoren.

Aktivering krever en separat, eksplisitt pull request som oppdaterer approved-filen og runtimekoblingen etter at fagets kontrollporter er godkjent.

Følgende grenser er bindende:

```text
observed release != approved release
candidate corpus != runtime corpus
successful sync != successful faglig evaluering
successful faglig evaluering != runtime activation
```
