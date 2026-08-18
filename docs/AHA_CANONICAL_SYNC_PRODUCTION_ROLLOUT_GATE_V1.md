# AHA Canonical Sync Production Rollout Gate v1

Status: **rollout-port implementert; production activation er fortsatt AV**.

Denne porten kommer etter at den ekte browserkjeden er bevist i isolert staging:

```text
AHA browser-session
→ primær AHA source-event hydration (read-only)
→ canonical filter/adapter
→ offentlig NestJS staging API
→ AHA Staging PostgreSQL
→ bootstrap/pull tilbake til browser
```

Den verifiserte browserkjøringen flyttet 85 canonical-eligible `source_event`-objekter, ekskluderte 2 lokale/deferred kilder, fikk 0 konflikter og ga 85 serverendringer. En identisk andre kjøring ga 0 nye endringer og serveren sto fortsatt på 85 `sync_changes`. Maskinlesbart bevis ligger i `ops/evidence/canonical-sync-browser-staging-proof-v1.json`.

Dette er **ikke** en produksjonsaktivering. Målet med v1 er å gjøre det umulig å hoppe direkte fra grønn staging til ukontrollert produksjon.

## Én canonical rollout-policy

Den maskinlesbare policyen ligger i:

```text
ops/canonical-sync-production-rollout-v1.json
```

Den låser følgende før en første pilot kan vurderes:

- Azure Container Apps er produksjonsmålet i tråd med ADR-006; Render er staging-only.
- production bruker dedikert PostgreSQL og kan ikke peke på AHA Staging eller den gamle primære AHA Supabase-databasen.
- TLS er `verify-full`.
- runtime-rollen heter `aha_canonical_production_runtime` og skal stå `NOLOGIN` før aktivering.
- admin-credential er aldri tillatt i runtime.
- canonical-typene er nøyaktig de ti etablerte typene.
- automatisk sync, login-trigger, auth-ready-trigger og background sync er fortsatt av.
- gammel Sync Hub aktiveres ikke.
- første pilot er én eksplisitt allowlistet profil; ingen automatisk utvidelse, gruppe- eller offentlig deling.
- destructive migrations er ikke tillatt i piloten.
- backup, restore-test, migration rehearsal og rollbackbevis er obligatorisk.
- observability er obligatorisk, men rå samtaletekst, tokens og secrets skal ikke være standardtelemetri.
- direkte databaseforbindelse fra en offentlig GitHub-runner til private production PostgreSQL er forbudt.
- selve pilotaktiveringen må ligge i en separat workflow.

## Manuell read-only gate med to sikkerhetsdomener

Workflowen er:

```text
.github/workflows/aha-canonical-sync-production-rollout-gate.yml
```

Den har kun `workflow_dispatch` og krever eksakt:

```text
RUN_AHA_CANONICAL_PRODUCTION_ROLLOUT_GATE
```

Gaten er delt i to sikkerhetsdomener.

### 1. Remote/API readiness

Første jobb kjører fra:

```text
aha-canonical-production-readiness
```

med bare `contents: read`. Den verifiserer rollout-kontrakt, staging-bevis og live `/v1/health`. Den får **ikke** production admin-DSN eller database-CA.

Environmentet trenger:

```text
AHA_PRODUCTION_API_ORIGIN
AHA_PRODUCTION_PILOT_PROFILE_ID
AHA_PRODUCTION_ROLLBACK_REVISION
AHA_PRODUCTION_MIGRATION_REHEARSAL_EVIDENCE
AHA_PRODUCTION_BACKUP_RESTORE_EVIDENCE
AHA_PRODUCTION_OBSERVABILITY_EVIDENCE
AHA_PRODUCTION_SYNC_RUNTIME_STATE
```

`AHA_PRODUCTION_PILOT_PROFILE_ID` er en beskyttet environment secret. Øvrige ikke-hemmelige readiness-pekere kan være environment variables.

`AHA_PRODUCTION_SYNC_RUNTIME_STATE` må være nøyaktig:

```text
disabled
```

### 2. Private database readiness

Andre jobb kjører først etter grønn remote readiness, fra:

```text
aha-canonical-production-infra
```

Den bruker GitHub OIDC mot Azure og verifiserer databasen **inne i production-VNet-et**, ikke fra GitHub-runnerens offentlige nettverk.

Jobben:

1. re-leser live Container App og nekter å fortsette dersom `AHA_CANONICAL_SYNC_ENABLED` ikke er `false`;
2. finner den eksakte immutable production-revisjonen;
3. krever matching `aha-canonical-db-init:<revision>` i production ACR;
4. finner operations Key Vault og migration-identiteten;
5. deployer et kortlivet Container Apps Job i production Container Apps Environment;
6. bruker `db-init-job.bicep` med `mode=verify_restore`;
7. leser admin-DSN, CA og readiness-credential bare via operations Key Vault-referanser;
8. kjører med `verify-full` og `default_transaction_read_only=on`;
9. verifiserer canonical schema, migration receipts, fail-closed readiness/runtime-roller, eksakt runtime-funksjonsflate og null direkte runtime table writes;
10. sletter det kortlivede verification-jobbet med `if: always()`.

Operations Key Vault er dermed credential-grensen. Admin-DSN og CA trenger ikke ligge i `aha-canonical-production-readiness` og eksponeres ikke som environment-verdier til den offentlige readiness-runneren.

Gaten kan opprette og slette **kun den kortlivede read-only verification-jobben**. Den endrer ikke production API, canonical schema/data, runtime-rollen eller sync-tilstanden.

## API-readiness

`scripts/aha-canonical-sync-production-rollout-gate.cjs readiness` krever at production API-origin:

- bruker HTTPS;
- er en separat backend-origin;
- ikke er en `onrender.com`-origin;
- svarer `/v1/health` med `status=ok` og `service=aha-nest-api`;
- har auth konfigurert;
- har database konfigurert og tilkoblet;
- ser canonical schema;
- rapporterer `safeRuntimeRole=true`;
- ikke rapporterer aktivert canonical runtime;
- eksplisitt rapporterer `canonicalSync.enabled=false`.

Dette gjør at API og database kan stå ferdigkoblet og observerbart mens selve sync-porten fortsatt er av.

## Database-readiness er read-only og privat

Den private verifikasjonen gjenbruker det samme immutable `postgres:16-alpine`-baserte database-init-imaget som production-deployen. `verify_restore`-modusen setter:

```text
PGSSLMODE=verify-full
default_transaction_read_only=on
```

og kjører canonical state-verifikasjon uten migrations eller rolleendringer. Den kan derfor lese nødvendig schema-/rollemetadata, men kan ikke mutere production-databasen.

Det eldre `scripts/aha-canonical-sync-production-db-readiness.sh` kan fortsatt brukes som lokal/privat diagnostikk når nettverksgrensen tillater det, men rollout-workflowen kjører det **ikke** fra en GitHub-hosted runner. Private DNS og `publicNetworkAccess=Disabled` beholdes uendret.

## Migrering og rollback

Rollout-porten regner ikke «schema finnes» som tilstrekkelig produksjonsberedskap. Før grønn readiness må environmentet peke på verifiserbart bevis for:

- migration rehearsal mot isolert mål;
- backup før production migration;
- faktisk PITR restore-test;
- API-revisjon som kan redeployes;
- observability-verifisering.

Rollback-kontrakten er:

1. stopp/cutoff av canonical runtime-credential;
2. terminering av aktive runtime-databasesesjoner;
3. rollback av API til eksplisitt pinnet revision;
4. schema håndteres med forward-fix eller verifisert restore, ikke automatisk destruktiv down-migration.

## Første brukeraktivering

Når rollout-gaten er grønn, er neste leveranse en **separat** pilot activation workflow. Den skal minst:

- kreve et nytt eksakt aktiveringstoken;
- konsumere beviset fra en grønn rollout-gate;
- aktivere bare én beskyttet pilotprofil;
- holde automatic/login/background sync av;
- bruke minst privilegert runtime-role, aldri admin-DSN;
- ha fail-closed database-first rollback;
- verifisere health, audit, sync-resultater og konflikter etter aktivering;
- ikke utvide allowlisten automatisk.

Denne activation workflowen opprettes ikke av rollout-gaten og production sync forblir AV etter en grønn gate.

## Produksjonsrekkefølge

```text
migration rehearsal
→ Azure production platform deploy (sync=false)
→ ekte backup/PITR restore rehearsal
→ observability readiness
→ production rollout gate:
   remote/API readiness
   → privat VNet database readiness
→ FØRST DA: separat one-profile pilot activation
```

Staging eller den gamle primære AHA-databasen skal aldri brukes som snarvei for å gjøre porten grønn.
