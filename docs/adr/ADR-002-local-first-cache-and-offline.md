# ADR-002: Local-first beholdes som local-only-modus, offline-cache og outbox

- Status: **Accepted**
- Dato: 14. august 2026
- Implementert: Nei
- Omfang: Backend Foundation v1

## Kontekst

AHA har en fungerende local-first-kjerne som kan brukes uten konto og uten aktiv backend. Dette gir personvern, robusthet og rask utvikling. Samtidig kan dagens modulvise `localStorage`-lagring ikke fungere som en ukontrollert parallell sannhet når samme bruker får flere enheter, revisjoner og delte arbeidsrom.

Målet er derfor ikke å avskaffe local-first, men å definere nøyaktig hva lokal lagring betyr etter backendmigreringen.

## Beslutning

AHA skal støtte to tydelige driftsmoduser:

### 1. Lokal-only

- konto er ikke nødvendig
- data forblir på enheten
- data legges ikke i sync-outbox
- ingen skjult discovery eller bakgrunnsopplasting
- brukeren kan eksportere, importere og slette lokalt
- eventuelle eksterne AI-kall følger egne eksplisitte innstillinger og samtykker

### 2. Konto og privat synk

- brukeren velger eksplisitt hvilke lokale data som importeres
- PostgreSQL er system of record etter vellykket import
- IndexedDB holder lokal cache, pending writes, cursors og tombstones
- appen kan fungere offline og synkronisere senere
- deling utover brukerens private arbeidsrom krever en separat handling og et eget delingsgrunnlag

Local-first skal dermed være:

```text
local-only data
+ offline cache
+ sync outbox
+ device state
+ rollback-friendly migration
```

Det skal ikke være:

```text
en andre ukontrollert canonical database
+ skjult cloud mirror
+ generell last-write-wins
+ automatisk deling
```

## Lokal lagring

Synkroniserbare data skal gradvis flyttes fra modulvise `localStorage`-objekter til IndexedDB med minst disse logiske områdene:

- `objects`
- `outbox`
- `sync_cursors`
- `pending_tombstones`
- `device_state`
- `import_receipts`

Eksisterende `localStorage`-nøkler beholdes bak migreringsadaptere til hver objekttype har en testet overgang. Ingen massekonvertering skal gjennomføres uten fixturer og rollback.

## Sync-outbox

En outbox-post skal minst ha:

- stabil event-ID
- device-ID
- objekt-ID og objekttype
- forventet serverrevision
- operasjonstype
- canonical payload eller patch
- idempotency key
- opprettelsestid
- antall forsøk
- siste feil
- samtykke- og delingsscope

Local-only-objekter skal avvises før outbox-opprettelse.

## Konfliktregler

- Meldinger, audit events og source events er i utgangspunktet append-only.
- Redigerbare objekter bruker optimistic concurrency og forventet revision.
- En rettelse skaper ny versjon eller eksplisitt revisjonsrelasjon; den overskriver ikke historikken stille.
- Sletting representeres som tombstone til alle relevante enheter har observert den.
- Delingsrettigheter kan aldri vinne automatisk over `local_only` eller privat status.
- Klokkeforskjell mellom enheter skal ikke alene avgjøre konflikt.
- Konflikter som ikke kan løses deterministisk skal vises som brukerreview, ikke skjules.

## Førstegangsimport

Innlogging skal ikke automatisk laste opp eksisterende data. Brukeren skal få:

1. oversikt over lokale datatyper og antall
2. markering av hva som ikke kan eller ikke bør synkroniseres
3. valg mellom fortsatt local-only og kontoimport
4. importpreview
5. resultatkvittering
6. mulighet til å beholde lokal backup

## Offline-regel

Offline-bruk skal kunne:

- lese siste synkroniserte private data
- opprette lokale endringer
- markere dem tydelig som ventende
- fortsette analyse der den lokale kontrakten tillater det
- avstå fra handlinger som krever serverautorisasjon, for eksempel ny gruppedeling

Appen skal ikke late som en serveravhengig handling er fullført når den bare ligger i outbox.

## Konsekvenser

### Positive

- AHA beholder privat lokal bruk uten konto
- fler-enhetssynk kan innføres uten å gjøre appen nettavhengig
- opplasting blir eksplisitt og etterprøvbar
- konflikter og slettinger kan håndteres deterministisk

### Kostnader og risiko

- IndexedDB- og migreringslag må bygges
- hver objekttype trenger sync-policy
- UI må skille lokal, ventende, synkronisert og delt status
- cacheinvalidering og konfliktvisning blir nye produktansvar

## Aktiveringsport

Beslutningen kan markeres `Implemented` først når tester beviser:

1. lokal-only fungerer uten konto og nett
2. local-only-data aldri går til outbox eller nettverk
3. samme import to ganger gir null duplikater
4. offline-endringer sendes nøyaktig én gang
5. to enheter konvergerer på samme canonical tilstand
6. tombstones når alle enheter
7. konflikt ikke løses gjennom blind last-write-wins
8. tilbaketrukket deling stanser videre tilgang
9. gammel localStorage kan migreres og rulles tilbake uten datatap

## Forkastede alternativer

### Tvungen cloud-konto

Forkastet fordi AHA skal kunne brukes privat og lokalt uten konto.

### LocalStorage som permanent synkmotor

Forkastet fordi det mangler transaksjoner, indekser, robuste outbox-mønstre og skalerbar objekthåndtering.

### Automatisk upload ved innlogging

Forkastet fordi innlogging ikke er samtykke til å laste opp historiske samtaler eller innsikter.
