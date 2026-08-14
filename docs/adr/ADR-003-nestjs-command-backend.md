# ADR-003: NestJS eier kommandoer og forretningsregler

- Status: **Accepted**
- Dato: 14. august 2026
- Implementert: Nei
- Omfang: Backend Foundation v1

## Kontekst

Repoet har i dag en liten Express-backend for agent-, embedding- og lenkeanalyseoppgaver og et FastAPI-skjelett for canonical analyse. Samtidig finnes det browserbaserte repository- og sync-adaptere. Uten en tydelig eier kan auth, samtykke, deling, revisjoner og jobbstart bli duplisert mellom frontend, Express, FastAPI, Hasura og senere AI-workers.

AHA trenger én offentlig applikasjonsbackend med tydelige domenegrenser før kontoer og flerbrukerfunksjoner aktiveres.

## Beslutning

NestJS skal være AHA-EchoNets primære applikasjonsbackend og bygges først som en **modulær monolitt**.

NestJS skal eie:

- auth-bro og verifisering av brukeridentitet
- tenant- og arbeidsromkontekst
- DTO- og schema-validering
- oppretting og endring av canonical objekter
- optimistic concurrency og revisionskontroll
- idempotency keys
- samtykke, tilbaketrekking og dataformål
- gruppemedlemskap, roller og invitasjoner
- deling og publisering
- audit events
- start, stopp og status for bakgrunnsjobber
- rate limiting og misbruksvern på offentlige endepunkter
- koordinering mot intern FastAPI- og AI-worker

Foreslått første modulstruktur:

```text
apps/api/src/
  auth/
  profiles/
  devices/
  workspaces/
  conversations/
  sources/
  analysis/
  insights/
  artifacts/
  sharing/
  publications/
  governance/
  jobs/
  audit/
```

## Offentlige og interne grenser

### Offentlig

Frontend og andre godkjente klienter skal bruke versjonerte NestJS-kontrakter for sensitive handlinger.

Første foreslåtte kommandoer:

```text
POST   /v1/local-imports
POST   /v1/sync/push
GET    /v1/sync/pull
POST   /v1/conversations
POST   /v1/messages
POST   /v1/analysis-runs
POST   /v1/insights
PATCH  /v1/insights/:id
POST   /v1/insights/:id/correct
POST   /v1/insights/:id/share
POST   /v1/sharing-grants/:id/revoke
GET    /v1/audit
DELETE /v1/user-data
```

### Intern

- FastAPI AHA Engine er en intern analysetjeneste, ikke offentlig system of record.
- LangGraph/LangChain-worker utfører gjenopptakbare AI-jobber, men starter dem gjennom autoriserte jobbkommandoer.
- Hasura kan lese avgrensede read models, men sensitive mutasjoner går gjennom NestJS.
- PostgreSQL er canonical datakilde.

## Mutasjonskontrakt

Alle sensitive mutasjoner skal støtte eller eksplisitt avvise:

- verifisert JWT eller tilsvarende identitet
- eksplisitt tenant/workspace
- versjonert request-schema
- request-ID
- idempotency key
- forventet objektrevision
- samtykke- og formålskontroll
- strukturert audit
- maskinlesbar feilrespons
- fail-closed ved ukjent rettighet eller scope

## Strangler-migrering

Dagens Express-server skal ikke erstattes i én operasjon.

Migreringen skjer endepunkt for endepunkt:

1. lås eksisterende request/response-fixtur
2. implementer NestJS-adapter med samme eksterne kontrakt der det er ønskelig
3. kjør shadow- eller sammenligningstest
4. flytt feature flag til NestJS
5. behold rollback
6. fjern Express-ruten først etter dokumentert paritet

FastAPI beholdes for Python-baserte analysekomponenter. Domene- og tilgangslogikk skal ikke dupliseres der.

## Modulære grenser

- En modul kan bare endre andre domener gjennom eksporterte tjenester eller domenekommandoer.
- Direkte databasebruk på tvers av domener skal begrenses og dokumenteres.
- Domenemodeller og databaseentiteter skal ikke blandes ukritisk med API-DTO-er.
- Deling, samtykke og audit er tverrgående sikkerhetsdomener og skal ikke kopieres inn i hver feature-modul.
- Microservices er ikke tillatt som standardløsning i Backend Foundation v1.

## Konsekvenser

### Positive

- én offentlig eier av sensitive handlinger
- tydelig overgang fra dagens Express-backend
- gjenbrukbar validering, auth, audit og idempotens
- enklere testing av tenancy og samtykke
- redusert risiko for at Hasura eller AI-worker blir skjult forretningslogikk

### Kostnader og risiko

- ny TypeScript-backend må etableres og driftes
- eksisterende Express-kode må kartlegges
- teamet må holde modulgrensene strenge
- for mange NestJS-abstraksjoner kan gjøre enkel logikk unødig tung

## Aktiveringsport

Beslutningen kan markeres `Implemented` først når:

- NestJS-prosjektet bygges og testes i CI
- health, auth-bro, validation, request-ID og audit fungerer
- minst én ekte kommando er migrert med kontraktparitet og rollback
- cross-tenant og manglende-samtykke-tester feiler lukket
- idempotent retry ikke lager duplikater
- FastAPI, Hasura og worker ikke kan omgå canonical mutasjonsregler
- Express fortsatt kan fungere som midlertidig fallback til hver migrert rute er godkjent

## Forkastede alternativer

### Fortsette med én voksende Express-fil

Forkastet som langsiktig hovedbackend fordi konto-, tenant-, samtykke- og jobbansvaret krever tydelige modulgrenser.

### FastAPI som eneste applikasjonsbackend

Ikke valgt. FastAPI beholdes for analyse og Python-komponenter, mens hovedproduktets kommando- og domeneorkestrering legges i TypeScript/NestJS.

### Hasura som mutasjonsmotor

Forkastet for sensitive kommandoer. Databasetriggere og GraphQL-mutasjoner skal ikke erstatte eksplisitt domenevalidering, samtykke og audit.
