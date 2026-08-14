# ADR-001: PostgreSQL er system of record for synkroniserte data

- Status: **Accepted**
- Dato: 14. august 2026
- Implementert: Nei
- Omfang: Backend Foundation v1

## Kontekst

Dagens AHA er local-first. De fleste produktmoduler bruker `localStorage`, mens Supabase/PostgreSQL, RLS, chamber-sync og pgvector finnes som valgfrie lag. Dette har vært riktig for prototyping og lokal robusthet, men gir ikke en tilstrekkelig autoritativ modell for flerbrukerdata, flere enheter, grupper, revisjoner, samtykke og kollektiv hukommelse.

En synkronisert plattform kan ikke ha flere uavhengige sannheter for samme objekt. Særlig må samtaler, source events, innsikter, rettelser, grupper, deling og audit kunne identifiseres, versjoneres og gjenopprettes konsistent.

## Beslutning

PostgreSQL skal være **canonical system of record** for alle data som brukeren eksplisitt har valgt å knytte til en konto eller et arbeidsrom.

Dette gjelder blant annet:

- profiler og registrerte enheter
- arbeidsrom, medlemskap og roller
- samtaler, deltakere og meldinger
- source events og vedleggsmetadata
- analysekjøringer, påstander og kildebelegg
- innsikter, innsiktsversjoner, rettelser og relasjoner
- begrepslister, stier, artikler og publiseringsstatus
- samtykke, deling og tilbaketrekking
- audit, idempotency keys og outbox events
- AI-jobber og deres versjonerte resultater

Data som brukeren uttrykkelig beholder som `local_only`, er ikke en del av den synkroniserte canonical databasen og skal ikke lastes opp.

## Tenantmodell

- Private synkroniserte objekter skal ha en eksplisitt `owner_profile_id` og et privat arbeidsrom eller tilsvarende tenantanker.
- Delte objekter skal ha `workspace_id` og autoriseres gjennom aktivt medlemskap og rolle.
- En brukeridentitet alene er ikke tilstrekkelig tilgangsgrunnlag til et delt objekt.
- Alle spørringer og mutasjoner skal være bundet til tenantkontekst.
- Service- eller systemjobber skal bruke eksplisitt jobbidentitet og audit, ikke omgå tenantreglene skjult.

## Minimumsfelt for synkroniserbare objekter

Der domenet tillater det, skal objektene ha:

- stabil `id`
- `owner_profile_id` og/eller `workspace_id`
- `created_at`
- `updated_at`
- `deleted_at` for tombstones
- monoton `revision`
- `source_event_id` eller annen provenance
- `created_by`
- `sharing_scope`
- sikkerhets- og samtykkemetadata der relevant

`local_only` skal normalt ikke lagres som en vanlig opplastet rad. Feltet brukes ved import og sync for å avvise materiale som skal forbli på enheten.

## Autoritativt ansvar

- PostgreSQL eier canonical tilstand og revisjon for synkroniserte data.
- IndexedDB er lokal cache og outbox, jf. ADR-002.
- NestJS eier sensitive kommandoer, jf. ADR-003.
- Hasura kan lese avgrensede read models, jf. ADR-004.
- Pgvector eller Milvus inneholder avledede søkeindekser, jf. ADR-005.
- LangGraph/LangChain og FastAPI kan produsere forslag og analyser, men kan ikke skrive canonical data uten autorisert kommando og audit.

## Migreringsregel

Eksisterende lokale data skal ikke bli canonical bare fordi brukeren logger inn. Førstegangsimport krever:

1. eksplisitt brukerhandling
2. preview av datatyper og antall
3. validering mot versjonert importkontrakt
4. idempotent import
5. provenance for hvert importert objekt
6. rapport om importert, avvist, local-only og duplisert materiale
7. mulig rollback før videre deling

## Konsekvenser

### Positive

- én autoritativ sannhet for synkroniserte data
- bedre fler-enhetsstøtte
- robuste grupper og rettigheter
- revisjons- og slettbar historikk
- mulig backup, restore og audit
- klar grense mellom canonical data og avledede indekser

### Kostnader og risiko

- eksisterende localStorage-former må kartlegges og migreres
- schemaendringer må versjoneres
- RLS, tenancy og samtykke må testes systematisk
- konfliktløsning kan ikke baseres på generell last-write-wins
- drift og databehandleransvar blir større

## Aktiveringsport

Beslutningen kan markeres `Implemented` først når:

- canonical schema og migrasjoner er merget
- alle relevante lokale objekttyper har mapping eller eksplisitt eksklusjon
- import → database → eksport har identitets- og telleparitet
- eier, medlem, redaktør og uvedkommende har automatiske tilgangstester
- tombstones, revisjoner og provenance er testet
- backup og faktisk restore er demonstrert i staging
- local-only-materiale beviselig ikke lastes opp

## Forkastede alternativer

### LocalStorage som varig system of record

Forkastet for synkroniserte flerbrukerdata fordi det ikke gir sentral tenantkontroll, robust revisjon eller fler-enhetskonsistens.

### Vektordatabasen som hovedlager

Forkastet. Vektorlageret er en avledet indeks og kan ikke erstatte relasjonell canonical historikk, samtykke eller audit.

### Hasura som system of record

Forkastet som begrep. Hasura er et API- og metadata-/permission-lag over data; PostgreSQL er datakilden.
