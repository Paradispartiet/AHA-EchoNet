# AHA Azure Production Platform v1

Status: **produksjonsplattform definert i kode; ikke deployet; canonical production sync er AV**.

Denne leveransen implementerer infrastrukturen som produksjonsporten i `AHA_CANONICAL_SYNC_PRODUCTION_ROLLOUT_GATE_V1.md` krevde. Den gjør ikke staging-resultatet til produksjon automatisk. Alle Azure-operasjoner er eksplisitte, manuelle `workflow_dispatch`-porter bak beskyttede GitHub Environments.

## Hva som nå er bygget

### Dedikert Azure-produksjon

IaC under `infra/azure/production/` oppretter:

- egen production resource group;
- Azure Container Apps Environment i EU/EØS-region (`westeurope` som standard);
- eget VNet med separat Container Apps-subnett og PostgreSQL-subnett;
- Azure Database for PostgreSQL Flexible Server 16 med privat nettverk og privat DNS;
- canonical database `aha`;
- 35 dagers backup-retensjon;
- separat runtime Managed Identity;
- separat migration/operations Managed Identity;
- separat runtime Key Vault;
- separat operations-only Key Vault;
- Azure Container Registry uten admin-bruker;
- Log Analytics;
- workspace-basert Application Insights.

Dette følger ADR-006: Container Apps før AKS og dedikert production PostgreSQL. Render er fortsatt kun taktisk staging.

### Produksjons-API uten aktiv sync

`backend/api/Dockerfile` bygger et non-root NestJS-image. `app.bicep` deployer det med:

```text
AHA_DATABASE_ENABLED=true
AHA_DATABASE_SSL_MODE=verify-full
AHA_CANONICAL_SYNC_ENABLED=false
AHA_LOCAL_IMPORT_ENABLED=false
```

Produksjons-API-et kan dermed bevise ekte database-, auth- og schema-readiness før noen canonical sync-rute får lov til å behandle en production-pilot.

`/v1/health` er samtidig strammet slik at den gjør en live, read-only databaseprobe ved health-kallet. Production rollout gate kan derfor ikke bli grønn på grunnlag av en gammel prosesslokal status.

### Tre separate credential-grenser

1. **Migration/admin** — admin-DSN finnes bare i operations Key Vault og kan leses av migration-identiteten.
2. **Readiness** — produksjons-API-et kobler seg til databasen med `aha_canonical_production_readiness`, som kan logge inn men ikke lese/skrive canonical tabeller eller kjøre canonical funksjoner.
3. **Sync runtime** — `aha_canonical_production_runtime` står `NOLOGIN`, `PASSWORD NULL`, har ingen direkte table writes og bare de tre canonical sync-funksjonene.

API-runtimeidentiteten har ikke tilgang til operations-vaulten med admin-DSN.

## Migreringsport

`AHA Azure production migration rehearsal` kjører hele timestamp-sorterte migration-settet mot ren PostgreSQL 16 og legger på den eksakte production-role-grensen. Artifactet dokumenterer blant annet:

- migration count;
- schema receipts;
- readiness-role shape;
- runtime `NOLOGIN` shape;
- nøyaktig tre effektive runtime-funksjoner;
- null direkte runtime table writes;
- at ingen production-database ble berørt.

Den faktiske Azure-plattformdeploymenten bruker et eget `aha-canonical-db-init-production` Container Apps Job inne i production-VNet-et. Jobben bruker `verify-full`, pinned CA og migrationsettet fra samme immutable Git-SHA som API-imaget.

## Backup og faktisk restore

`AHA Azure production backup restore rehearsal` er en egen manuell port. Den:

1. finner nøyaktig den dedikerte production PostgreSQL-serveren;
2. utfører en ekte point-in-time restore til en separat server;
3. beholder privat subnett/private DNS-grensen;
4. oppretter en kortlivet verification-credential i operations Key Vault;
5. kjører samme DB-verifikasjonsimage i `verify_restore`;
6. tvinger `default_transaction_read_only=on`;
7. verifiserer schema, roller, funksjonsflate og database-state;
8. laster opp maskinlesbart restore-bevis;
9. deaktiverer temp-secret og sletter restore-server/jobben.

Production-kildedatabasen muteres ikke av verifikasjonen.

## Observability

`AHA Azure production observability readiness` krever at Azure faktisk eksponerer de nødvendige metric-definisjonene før rollout gate kan regnes som oppfylt.

Container Apps-siden krever blant annet:

```text
Requests
ResponseTime
RestartCount
Replicas
UsageNanoCores
WorkingSetBytes
```

PostgreSQL-siden krever blant annet:

```text
active_connections
connections_failed
is_db_alive
sessions_by_state
longest_query_time_sec
blks_read
blks_hit
```

Porten genererer også ufarlige health-kall og krever at `AhaSafeAudit` faktisk er søkbart i Log Analytics. Den nekter observability-bevis dersom audit-resultatet inneholder credential-formede verdier som bearer-header eller PostgreSQL-URL.

Dette gir direkte belegg for request-rate, HTTP-status/feil, latency, database connections, database-availability og query-load. Når en senere pilot aktiveres, ligger request outcome/error code og hashed principal allerede i samme redigerte auditkanal for auth-, permission- og sync-resultater.

## Rollback

`AHA Azure production API rollback` tar en eksakt 40-tegns Git SHA og krever at det tilsvarende immutable ACR-imaget finnes. Den kan kun brukes mens production sync fortsatt er AV. Under rollback reassertes:

```text
AHA_CANONICAL_SYNC_ENABLED=false
AHA_LOCAL_IMPORT_ENABLED=false
```

Health må deretter bevise riktig revision, auth og sikker databaseforbindelse.

Schema rollback er fortsatt **forward-fix eller verified restore**. Det finnes ingen automatisk destruktiv down-migration.

## GitHub Environments

### Infrastructure

Opprett/bruk:

```text
aha-canonical-production-infra
```

Secrets:

```text
AZURE_CLIENT_ID
AZURE_TENANT_ID
AZURE_SUBSCRIPTION_ID
AZURE_DEPLOY_PRINCIPAL_OBJECT_ID
AHA_PRODUCTION_POSTGRES_ADMIN_PASSWORD
AHA_PRODUCTION_DATABASE_CA_CERT
AHA_PRODUCTION_AUDIT_HASH_SALT
```

Ikke-hemmelige vars kan angi location/resource group/prefix/admin-login. Workflowen har ingen Azure client secret; `azure/login` bruker GitHub OIDC.

### Readiness

Etter grønn platform + restore + observability brukes miljøet fra production rollout gate:

```text
aha-canonical-production-readiness
```

Der legges API-origin, production admin DSN/CA for read-only readiness, pilot profile-ID, rollback-revision og de tre evidenspekerne.

## Produksjonsrekkefølge

```text
PR/CI: Bicep + Docker + contract
        ↓
manual migration rehearsal
        ↓
manual Azure production platform deploy (sync=false)
        ↓
manual real backup/PITR restore rehearsal
        ↓
manual observability readiness
        ↓
manual production rollout gate (read-only)
        ↓
FØRST DA: separat one-profile pilot activation
```

Ingen av workflowene i denne leveransen aktiverer pilot eller setter `AHA_CANONICAL_SYNC_ENABLED=true`.

## Hva som fortsatt må gjøres utenfor repoet

Repoet kan definere og verifisere infrastrukturen, men kan ikke opprette en Azure-abonnementstilknytning uten operatørens konto. Før første Azure-kjøring må GitHub OIDC-identiteten og de beskyttede Environment-verdiene opprettes i brukerens Azure/GitHub-konto.

Dette er med vilje den eneste manuelle bootstrap-grensen. Etterpå er selve production-infrastrukturen og de operative portene reviewbare og rekonstruerbare fra Git.

## Activation er fortsatt separat

Denne leveransen oppretter **ikke** `RUN_AHA_CANONICAL_PRODUCTION_PILOT_ACTIVATION`-workflowen. Den kommer først etter at rollout-gaten faktisk har gått grønn mot den dedikerte Azure-produksjonsplattformen.

Første activation skal fortsatt være begrenset til én protected allowlist-profil, uten login-trigger, auth-ready-trigger eller background sync, og med database-first rollback dersom noe feiler.
