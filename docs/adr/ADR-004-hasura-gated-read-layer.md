# ADR-004: Hasura er et betinget lese- og subscriptionslag

- Status: **Accepted**
- Dato: 14. august 2026
- Implementert: Nei
- Omfang: Backend Foundation v1

## Kontekst

EchoNet har mange relasjonelle dataformer: brukere, arbeidsrom, samtaler, meldinger, innsikter, relasjoner, stier, grupper og revisjoner. Hasura kan gi raske GraphQL-spørringer og subscriptions over PostgreSQL, men prosjektet har allerede Supabase-API-er, et repository-lag og en planlagt NestJS-backend.

Å aktivere Hasura uten en klar grense kan gi:

- parallelle offentlige API-er
- dupliserte permission-regler
- direkte databasewrites som omgår samtykke og audit
- uklar eierskap mellom Hasura, Supabase og NestJS

## Beslutning

Hasura skal bare innføres gjennom en isolert **proof-of-value-port**.

Tillatt ansvar:

- relasjonelle read models
- GraphQL-lesespørringer
- subscriptions for allerede autoriserte data
- interne og administrative oversikter
- eventuelle Actions som videresender sensitive handlinger til NestJS

Ikke tillatt ansvar:

- canonical forretningslogikk
- direkte sensitive mutasjoner fra browser
- samtykke- eller delingsbeslutninger
- gruppemedlemskap og rolleendringer
- publiseringsbeslutninger
- AI-jobbautorisasjon
- alternativ skrivesti rundt NestJS

## Første avgrensede read models

Proof of value kan omfatte:

```text
myConversations
myInsights
myPaths
myGroups
groupInsights
insightEvidence
insightRevisionHistory
```

Disse skal bygges på tenant-isolerte views eller tydelig autoriserte tabeller. Rå private kilder skal ikke eksponeres gjennom brede generiske queries.

## Autorisasjon

- PostgreSQL/RLS og Hasura-permissions skal ikke vedlikeholdes som to uavhengige sannheter.
- En versjonert permission-matrise skal beskrive rolle × handling × objekttype × scope.
- Hasura-metadata og migrations skal ligge i Git.
- JWT-claims skal være minimale og validerte.
- Ukjent rolle, manglende tenant eller manglende scope skal feile lukket.
- Service role/admin secrets skal aldri være tilgjengelig i frontend.
- Tenantisolasjon skal testes mot faktiske GraphQL-spørringer og subscriptions.

## Offentlig API-regel

Frontend skal ikke samtidig ha frie, parallelle skriveveier gjennom:

- Supabase generated API
- Hasura mutations
- NestJS REST/GraphQL

Sensitive writes går gjennom NestJS. Direkte database-API-er skal stenges, begrenses til read-only eller brukes bare internt der kontrakten tillater det.

## Proof-of-value-kriterier

Hasura beholdes bare dersom prøven dokumenterer minst én klar gevinst:

- vesentlig enklere eller raskere relasjonelle lesespørringer
- stabil sanntidsoppdatering for grupper
- mindre frontenddataorkestrering uten svekket sikkerhet
- målbar utviklingsgevinst sammenlignet med NestJS GraphQL eller Supabase GraphQL

Samtidig skal prøven bevise:

- null cross-tenant-lekkasje
- null alternativ sensitiv skrivesti
- deterministiske permissions
- versjonerte metadata
- rollback til alternativ read API

## Event Triggers og Actions

Event Triggers kan senere publisere avgrensede databasehendelser til en varig kø, men skal:

- bruke stabile event-ID-er
- være idempotente
- ikke sende rå private payloads unødvendig
- ha retry- og dead-letter-strategi
- ikke brukes som skjult erstatning for domenekommandoer

Hasura Actions kan eksponere NestJS-kommandoer, men NestJS beholder validering, autorisasjon, samtykke og audit.

## Konsekvenser

### Positive

- Hasura kan gi verdi der relasjonelle queries og subscriptions faktisk er sterke
- produktet låses ikke til Hasura før nytten er bevist
- sensitive kommandoer forblir samlet i NestJS
- permission-duplisering blir en eksplisitt port

### Kostnader og risiko

- ekstra driftskomponent og metadata
- behov for koordinering mellom schema, RLS og Hasura
- fare for at raske GraphQL-mutasjoner frister til å omgå domenelaget
- flere feilkilder ved subscriptions og tokenclaims

## Aktiveringsport

Beslutningen kan markeres `Implemented` først når:

- en avgrenset read-model-prøve finnes i staging
- permission-matrisen er versjonert og testet
- cross-tenant-spørringer og subscriptions avvises
- frontend har ingen parallel sensitiv skrivesti
- metadata/migrations kan bygges fra ren checkout
- målte gevinster og driftskostnader er dokumentert
- rollback til NestJS/Supabase read API er prøvd

Hvis verdibeviset ikke er tilstrekkelig, skal Hasura ikke aktiveres. Produktet fortsetter med NestJS GraphQL/REST eller et avgrenset Supabase-leselag.

## Forkastede alternativer

### Hasura som full applikasjonsbackend

Forkastet fordi EchoNet krever eksplisitte domenehandlinger, samtykke, audit og jobborkestrering som ikke bør reduseres til direkte tabellmutasjoner.

### Hasura fordi det sto i den opprinnelige søknaden

Forkastet som beslutningsgrunnlag alene. Teknologien må dokumentere verdi mot dagens faktiske arkitektur.
