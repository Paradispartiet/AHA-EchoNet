# AHA Backend Foundation Roadmap v1

Status: **kanonisk mål- og migreringsplan — ikke aktiv runtime**

Denne planen beskriver hvordan AHA-EchoNet skal gå fra dagens testede, lokale AHA-kjerne til en reell flerbrukerplattform med kontoer, synkronisering, grupper, kollektiv hukommelse og kontrollerte AI-jobber.

Dokumentet aktiverer ingen backend, synk, EchoNet-deling, modelltrening, ekstern publisering eller History Go-tilbakeskriving. Dagens local-first-grenser gjelder til hver fase nedenfor har egen kontrakt, tester, migreringsport og eksplisitt aktivering.

## 1. Strategisk grunnlag

Planen bygger videre på to tidligere prosjektpremisser:

- Forretningsmodellen beskrev en trinnvis reise fra Supabase til Hasura/PostgreSQL og senere Azure.
- Prosjektbeskrivelsen beskrev Hasura, PostgreSQL, NestJS, LangChain, Milvus og Azure som målarkitektur for flerbrukerdata, semantisk hukommelse, forskning og skalering.

Dagens faktiske produkt har imidlertid utviklet seg til en sterk **local-first ready baseline**. Migreringen skal derfor ikke erstatte AHA i én operasjon. Den skal bevare den eksisterende analyse-, kilde-, minne-, History Go- og kvalitetskontrakten og flytte ansvar trinnvis bak versjonerte grenser.

Hovedregelen er:

```text
Behold fungerende AHA.
Flytt én datagrense om gangen.
Mål før vi skalerer.
Aktiver aldri deling eller synk uten eksplisitt brukerhandling.
```

## 2. Dagens faktiske utgangspunkt

Før migreringen er status:

- AHA fungerer som en lokal personlig kunnskapsplattform.
- `localStorage` er fortsatt primær lagring for de fleste moduler.
- Supabase/PostgreSQL-schema, RLS-policyer, repository-kode, chamber-sync og pgvector-oppsett finnes, men er valgfrie.
- Node/Express-backend håndterer utvalgte agent-, embedding- og lenkeanalyseoppgaver.
- FastAPI AHA Engine finnes som et testet skjelett og stagingalternativ, men JavaScript-flyten er fortsatt standard.
- Frontend driftes via GitHub Pages og backend/staging via Render.
- Sync Hub er planlagt/no-op; EchoNet-nettverket er ikke aktivert.
- Hasura, NestJS, LangChain/LangGraph, Milvus og Azure er ikke produksjonsimplementert.

Dette utgangspunktet er ikke en feil som skal slettes. Det er migreringsgrunnlaget.

## 3. Målarkitektur

```text
AHA web/PWA
│
├── IndexedDB
│   ├── offline cache
│   ├── local-only objects
│   ├── sync outbox
│   ├── sync cursor
│   └── tombstones
│
├── NestJS API — modulær monolitt
│   ├── authentication and tenancy
│   ├── commands and validation
│   ├── consent and sharing
│   ├── groups and memberships
│   ├── publication
│   ├── idempotency
│   ├── audit
│   └── job orchestration
│
├── Hasura GraphQL — bare etter egen port
│   ├── read models
│   ├── relational queries
│   └── subscriptions
│
├── PostgreSQL — canonical system of record
│   ├── identity and workspaces
│   ├── conversations and sources
│   ├── analyses and evidence
│   ├── insights and revisions
│   ├── artifacts
│   ├── consent and sharing
│   ├── audit and idempotency
│   ├── outbox events
│   └── pgvector
│
├── durable job queue
│   ├── analysis jobs
│   ├── embedding jobs
│   ├── sync jobs
│   └── publication jobs
│
├── LangGraph/LangChain worker
│   ├── source and consent validation
│   ├── retrieval
│   ├── canonical analysis
│   ├── quality revision
│   ├── approval pauses
│   └── resumable checkpoints
│
├── FastAPI AHA Engine
│   ├── canonical analysis components
│   ├── subject classification
│   ├── research metrics
│   └── Python-based evaluation
│
└── vector-store boundary
    ├── pgvector first
    └── Milvus only after measured need
```

På Azure skal første driftsmål være:

- Azure Container Apps for NestJS, Hasura, AI-worker og FastAPI
- Azure Database for PostgreSQL Flexible Server
- Azure Service Bus eller tilsvarende varig kø
- Azure Blob Storage for vedlegg og eksportfiler
- Azure Key Vault for hemmeligheter
- Azure Monitor og Application Insights for tracing og drift

AKS skal ikke være første steg. Kubernetes vurderes bare dersom dokumentert skala eller selvhostet Milvus faktisk krever det.

## 4. Eierskap per teknologi

### PostgreSQL

PostgreSQL blir autoritativ datakilde for alt som tilhører en synkronisert konto eller et arbeidsrom:

- profiler og enheter
- samtaler og meldinger
- source events
- analyser, påstander og belegg
- innsikter, versjoner, rettelser og relasjoner
- begrepslister, stier og artikler
- grupper, medlemskap og roller
- samtykke, deling og publisering
- audit, idempotency og outbox events

Objekter som brukeren uttrykkelig holder `local_only`, skal fortsatt kunne eksistere bare på enheten.

### NestJS

NestJS skal være hovedbackend og eie alle sensitive kommandoer:

- oppretting og endring av canonical objekter
- schema- og DTO-validering
- tilgang, roller og tenancy
- samtykke og tilbaketrekking
- deling og publisering
- idempotency keys
- optimistic concurrency
- audit events
- jobbstart og jobblivssyklus

NestJS bygges først som en **modulær monolitt**, ikke som microservices.

### Hasura

Hasura skal bare beholdes dersom en begrenset proof of concept viser klar verdi for:

- relasjonelle lesespørringer
- subscriptions
- gruppe- og administrasjonsoversikter
- read models

Hasura skal ikke eie forretningslogikk, samtykkeregler eller sensitive mutasjoner. Slike handlinger går gjennom NestJS.

Hasura-permissions og PostgreSQL RLS skal ikke utvikles som to uavhengige sannheter. Tilgangsreglene må komme fra én versjonert permission-matrise og ha regresjonstester. Frontend skal ikke kunne omgå NestJS gjennom parallelle offentlige database-API-er.

### LangChain/LangGraph

LangGraph/LangChain brukes bare til gjenopptakbare AI-arbeidsflyter:

```text
source accepted
→ consent verified
→ active run resolved
→ domain classified
→ active memory retrieved
→ irrelevant memory rejected
→ canonical analysis generated
→ quality evaluated
→ maximum one controlled revision
→ optional human approval
→ result persisted
→ approved material embedded
→ optional sharing candidate prepared
```

AI-orkestreringen skal ikke eie brukerrettigheter, gruppemedlemskap, canonical datamodell eller samtykke. Dette forblir i NestJS/PostgreSQL.

### pgvector og Milvus

Pgvector brukes i første nettverksversjon fordi repoet allerede har schema og søkekontrakt for dette.

All semantisk lagring skal ligge bak et adapter:

```ts
interface VectorStore {
  upsert(record: VectorRecord): Promise<void>;
  remove(id: string): Promise<void>;
  search(query: VectorQuery): Promise<VectorMatch[]>;
  health(): Promise<VectorStoreHealth>;
}
```

Første implementasjon er `PgVectorStore`. `MilvusVectorStore` bygges bare dersom målinger viser at pgvector ikke dekker behovet.

Milvus-porten kan åpnes ved dokumentert behov for ett eller flere av følgende:

- utilstrekkelig p95-latency
- utilstrekkelig recall
- indeksvedlikehold som påvirker canonical database
- vesentlig større gruppe- eller globalt korpus
- behov for tidsfrosne eller isolerte forskningssamlinger
- hybrid søk som ikke kan løses tilfredsstillende i PostgreSQL

PostgreSQL forblir system of record selv om Milvus tas i bruk. Milvus er en avledet søkeindeks.

### Azure

Azure er driftsplattformen, ikke domene- eller produktarkitekturen. Flytting til Azure skjer først etter at schema, synk, samtykke, backup/restore og idempotente AI-jobber er bevist.

## 5. Arkitekturbeslutninger som må låses først

Før runtime-migrering skal følgende ADR-er opprettes og godkjennes:

| ADR | Beslutning |
|---|---|
| ADR-001 | PostgreSQL er system of record for synkroniserte konto- og arbeidsromdata, med tydelig tenantmodell. |
| ADR-002 | Local-first beholdes som offline-cache, outbox og eksplisitt local-only-modus; det skal ikke være en ukontrollert parallell sannhet. |
| ADR-003 | NestJS eier auth-bro, kommandoer, forretningsregler, samtykke, deling, audit og jobbstart. |
| ADR-004 | Hasura kan bare eie read models og subscriptions etter en isolert verdibevis-port. |
| ADR-005 | Pgvector brukes først; Milvus ligger bak adapter og krever målt aktiveringsbehov. |
| ADR-006 | Azure Container Apps brukes før AKS; Azure-aktivering skjer først etter grønn stagingport. |

ADR-ene skal også fastslå hvilke data som kan være:

- bare lokale
- private og synkroniserte
- delte i ett arbeidsrom
- publiserte
- anonymiserte forskningskandidater
- aldri opplastbare uten nytt eksplisitt samtykke

## 6. Canonical PostgreSQL-domener

### Identity og arbeidsrom

```text
profiles
devices
workspaces
workspace_memberships
roles
invitations
```

### Samtaler og kilder

```text
conversations
conversation_participants
messages
source_events
source_attachments
```

### Analyse og innsikt

```text
analysis_runs
analysis_claims
analysis_evidence
insights
insight_versions
insight_relations
insight_feedback
memory_revisions
```

### AHA-artefakter

```text
concept_lists
concept_list_items
knowledge_paths
knowledge_path_steps
articles
article_versions
publications
```

Tankekart skal primært være avledede read models fra innsikter, relasjoner, lister og stier, ikke en parallell canonical sannhet.

### Styring og drift

```text
consent_receipts
sharing_grants
data_exports
deletion_requests
audit_events
idempotency_keys
outbox_events
ai_jobs
```

Alle synkroniserbare objekter skal ha relevante felt for:

- `owner_id` eller `workspace_id`
- `created_at` og `updated_at`
- `deleted_at`
- `revision`
- provenance og source identity
- `local_only`
- `sharing_scope`

## 7. Migreringsfaser

### Fase A — arkitektur og kontrakter

Lever:

- ADR-001 til ADR-006
- system-of-record-matrise
- tenancy- og permission-matrise
- data classification og samtykkeklasser
- eksplisitt liste over beholdte local-only-grenser

Port:

- ingen domeneverdi har to autoritative eiere
- ingen teknologi introduseres uten definert ansvar og rollback

### Fase B — canonical PostgreSQL schema v1

Lever:

- normalisert schema
- migrasjoner
- RLS/permission-testgrunnlag
- mapping fra alle nåværende localStorage-objekter
- import/export parity-fixtures

Port:

- lokal eksport → databaseimport → databaseeksport gir samme objekter, tellinger og identiteter
- delbare objekter har provenance
- sletting kan representeres som tombstone
- eier, medlem, redaktør og uvedkommende har automatiske tilgangstester

### Fase C — NestJS Backend Foundation

Foreslått modulstruktur:

```text
apps/api/src/
  auth/
  profiles/
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

Første API-kontrakter:

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
GET    /v1/audit
DELETE /v1/user-data
```

Hver mutasjon skal støtte JWT, validering, request-id, idempotency-key, concurrency-kontroll, audit og strukturert feilrespons.

Dagens Express-endepunkter flyttes ett for ett bak NestJS-adaptere. FastAPI beholdes som intern analysetjeneste.

### Fase D — local-first synk

`localStorage` erstattes gradvis av IndexedDB for synkroniserbare data:

```text
IndexedDB
├── object cache
├── outbox
├── sync cursor
├── pending tombstones
└── device metadata
```

Brukeren skal ha to tydelige moduser:

#### Lokal-only

- ingen automatisk opplasting
- ingen konto nødvendig
- lokal eksport/backup
- eksplisitte innstillinger for eventuelle AI-kall

#### Konto og synk

- eksplisitt førstegangsimport
- valgfri datasynk
- flere enheter
- eget samtykke for deling utover brukerens private arbeidsrom

Synkprotokollen skal bruke device cursor, idempotency keys, revisjonsnummer, tombstones og objektspesifikke konfliktregler.

Konfliktregler:

- meldinger og audit er append-only
- redigerbare objekter bruker optimistic concurrency
- rettelser lager ny versjon
- slettinger er tombstones til alle enheter har observert dem
- delingsrettigheter kan aldri automatisk overstyre local-only eller privat status

Port:

1. Førstegangsimport gir null datatap.
2. Samme import to ganger gir null duplikater.
3. To enheter får samme godkjente datasett.
4. Offline-endringer sendes nøyaktig én gang.
5. Sletting når alle enheter.
6. Local-only-data lastes aldri opp.
7. Tilbaketrukket samtykke stanser videre deling.

### Fase E — Hasura proof of value

Hasura kobles bare til begrensede read models:

```text
myConversations
myInsights
myPaths
myGroups
groupInsights
insightEvidence
insightRevisionHistory
```

Sensitive handlinger forblir NestJS-kommandoer, eventuelt eksponert som Hasura Actions.

Permanent Hasura-aktivering krever:

- komplett permission-matrise
- stabil subscriptions-test
- Git-versjonerte metadata og migrasjoner
- ingen alternativ offentlig skrivevei
- regresjonstest som beviser tenantisolasjon
- dokumentert feil- og rollbackløp

Dersom porten ikke gir klar gevinst, fortsetter plattformen med NestJS GraphQL/REST eller eksisterende PostgreSQL-API uten Hasura.

### Fase F — AI-jobber og LangGraph

Hver AI-kjøring lagres som en versjonert jobb med minst:

```text
id
user_id
workspace_id
source_event_id
source_hash
consent_scope
workflow_version
prompt_version
model_provider
model_name
status
retries
checkpoint
result_hash
created_at
completed_at
```

Port:

- dobbeltstart gir ikke doble innsikter
- krasjet jobb kan fortsette fra checkpoint
- tilbakekalt samtykke stopper jobben
- gammel analysis run kan ikke skrive til ny kjøring
- prompt-, modell- og workflow-versjon er sporbar
- alle synlige påstander beholder kildeproveniens

### Fase G — vektorsøk

Først:

- `PgVectorStore`
- måling av p50/p95, recall, filterpresisjon, indeksstørrelse, feilrate og kryssdomene-lekkasje

Ved åpnet Milvus-port:

1. implementer `MilvusVectorStore`
2. backfill eksisterende vektorer
3. dual-write nye vektorer
4. shadow-read og sammenlign resultater
5. flytt lesing gradvis
6. behold rollback til pgvector
7. avslutt dual-write først etter full verifikasjon

### Fase H — ekte grupper og EchoNet-delingsflyt

Riktig dataflyt:

```text
personal insight
→ explicit share action
→ exact share preview
→ selected workspace and role
→ versioned group reference/copy
→ preserved provenance
→ optional later publication candidate
→ separate consent for any wider scope
```

En personlig innsikt skal aldri automatisk bli gruppe- eller global innsikt. Rå samtaler skal ikke flyttes til kollektivt lager som standard.

Port:

- ingen skjult deling
- gruppeadministrator ser ikke private data
- deling kan trekkes tilbake
- kollektivt materiale har bidrags- og kildehistorikk
- anonymisering er vurdert mot reidentifisering
- moderering, klage og sletting er definert

### Fase I — Azure staging og produksjon

Infrastructure as Code organiseres minst slik:

```text
infra/
  modules/
    postgres/
    container-apps/
    service-bus/
    storage/
    key-vault/
    monitoring/
    networking/
  environments/
    staging/
    production/
```

Før produksjon skal følgende være bevist:

- automatisk backup og faktisk restore-test
- database migration rehearsal
- nøkkelrotasjon
- secret scanning
- rate limiting
- sårbarhetsskanning av images
- hendelseshåndtering
- dataeksport og sletting
- DPIA for gruppe- og forskningsdata
- EU/EØS-datalokasjon og nødvendige databehandleravtaler

## 8. PR-rekkefølge

Hver PR skal være avgrenset, testbar og kunne rulles tilbake.

| PR | Leveranse |
|---:|---|
| 1 | Backend Architecture ADRs |
| 2 | Canonical PostgreSQL Schema v1 |
| 3 | Tenancy-, RLS- og samtykkekontrakt |
| 4 | NestJS foundation med auth-bro, health, validation og audit |
| 5 | Repository adapter og stabile API-kontrakter |
| 6 | Lokal import til PostgreSQL |
| 7 | IndexedDB outbox og bidireksjonal sync |
| 8 | Analysis jobs og LangGraph worker |
| 9 | PgVectorStore og semantisk retrieval |
| 10 | Workspaces, memberships og group sharing |
| 11 | Hasura read/subscription proof of value |
| 12 | Azure staging gjennom Infrastructure as Code |
| 13 | Milvus shadow adapter dersom porten åpnes |
| 14 | Produksjons-, sikkerhets- og personvernport |

Én PR skal ikke samtidig migrere database, bytte auth, aktivere synk, aktivere Hasura, bytte AI-motor og flytte hosting.

## 9. Ikke gjør dette

- Ikke omskriv frontend samtidig med backendmigreringen.
- Ikke gjør Hasura til eier av forretningslogikken.
- Ikke eksponer både Supabase API og Hasura som parallelle offentlige skrive-API-er.
- Ikke flytt til Azure før synk og datamodell er stabile.
- Ikke gjør Milvus til system of record.
- Ikke innfør microservices før den modulære monolitten er bevist.
- Ikke aktiver global deling automatisk.
- Ikke gjør cloud-lagring obligatorisk for local-only-brukeren.
- Ikke send rå samtaler til modelltrening.
- Ikke la LangChain eie rettigheter eller samtykke.
- Ikke fjern JavaScript-fallback før ny motor har dokumentert paritet og rollback.

## 10. Definisjon av Backend Foundation v1

Backend Foundation v1 er ferdig når en bruker kan:

1. opprette konto
2. importere eksisterende lokal AHA uten datatap
3. fortsette å bruke AHA offline
4. åpne samme private AHA på en annen enhet
5. få identiske samtaler, innsikter, stier og rettelser
6. se hva som er lokalt, privat synkronisert og delt
7. dele én valgt innsikt med én valgt gruppe
8. trekke delingen tilbake
9. se provenance og audit
10. eksportere og slette egne data
11. kjøre en AI-analyse som tåler restart
12. bruke semantisk søk uten kryssbruker- eller kryssfaglig lekkasje

Før dette er oppfylt, skal prosjektet ikke prioritere betalingssystem, global matching, offentlige profiler, innsiktsmarkedsplass eller automatisk kollektiv publisering.

## 11. Dokumenthierarki

Når dokumenter ser ut til å være i konflikt, gjelder denne rekkefølgen:

1. Runtime-kode og grønne kontraktstester beskriver hva som faktisk kjører.
2. Release readiness og maturity-dokumentene beskriver dagens aktiverte produktgrense.
3. Dette dokumentet beskriver målarkitektur og migreringsrekkefølge.
4. ADR-er beskriver bindende beslutninger for hver implementeringsfase.
5. Eldre søknads- og forretningsdokumenter beskriver visjon og tidligere plan, men aktiverer ikke teknologi alene.

## 12. Første implementeringsleveranse

Neste runtime-arbeid etter denne dokumentasjonsleveransen er:

```text
PR 1 — Backend Architecture ADRs
→ PR 2 — Canonical PostgreSQL Schema v1
```

Ingen backend-aktivering skal skje før disse er merget og de eksisterende local-first-, analyse-, minne-, personvern- og History Go-portene fortsatt er grønne.
