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

- Azure Container Apps er produksjonsmålet i tråd med ADR-006; Render er fortsatt staging-only.
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
- selve pilotaktiveringen må ligge i en separat workflow som ikke finnes i denne leveransen.

## Manuell read-only gate

Workflowen er:

```text
.github/workflows/aha-canonical-sync-production-rollout-gate.yml
```

Den har kun `workflow_dispatch`, bare `contents: read`, kjører fra GitHub Environment:

```text
aha-canonical-production-readiness
```

og krever eksakt:

```text
RUN_AHA_CANONICAL_PRODUCTION_ROLLOUT_GATE
```

Workflowen kan **ikke** aktivere canonical sync, deploye en produksjonstjeneste, endre database-rollen eller skrive schema/data. Den gjør bare readiness-verifisering.

## Beskyttede readiness-verdier

Før den manuelle porten kan bli grønn må environmentet ha:

```text
AHA_PRODUCTION_API_ORIGIN
AHA_PRODUCTION_ADMIN_DATABASE_URL
AHA_PRODUCTION_DATABASE_CA_CERT
AHA_PRODUCTION_PILOT_PROFILE_ID
AHA_PRODUCTION_ROLLBACK_REVISION
AHA_PRODUCTION_MIGRATION_REHEARSAL_EVIDENCE
AHA_PRODUCTION_BACKUP_RESTORE_EVIDENCE
AHA_PRODUCTION_OBSERVABILITY_EVIDENCE
AHA_PRODUCTION_SYNC_RUNTIME_STATE
```

`AHA_PRODUCTION_PILOT_PROFILE_ID`, admin-DSN og CA skal behandles som beskyttede environment secrets. Øvrige ikke-hemmelige readiness-pekere kan være environment variables.

`AHA_PRODUCTION_SYNC_RUNTIME_STATE` må være nøyaktig:

```text
disabled
```

Gate-verifiseringen nekter altså å godkjenne en produksjon der sync allerede er aktivert.

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
- ikke rapporterer aktivert canonical runtime.

Dette gjør at API og database kan stå ferdigkoblet og observerbart mens selve sync-porten fortsatt er av.

## Database-readiness er read-only

`scripts/aha-canonical-sync-production-db-readiness.sh` bruker admin-DSN kun til read-only verifikasjon med:

```text
PGSSLMODE=verify-full
default_transaction_read_only=on
```

Scriptet:

- avviser eksplisitt project refs for AHA Staging og den gamle primære AHA Supabase-instansen;
- avviser DSN-parametere som kan overstyre pinned TLS;
- validerer X.509 CA;
- krever `aha` schema og de canonical tabellene sync trenger;
- krever `aha_canonical_production_runtime` som `NOLOGIN`, `NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEDB`, `NOCREATEROLE`, `NOINHERIT`;
- krever null privilegerte memberships, null direkte table-write grants og null eide objekter;
- krever `USAGE` på `aha`;
- krever effektiv `EXECUTE` på nøyaktig:
  - `bootstrap_sync_snapshot_v1`
  - `pull_sync_changes_v1`
  - `push_sync_change_v1`
- gjør til slutt bare en read-only telling av sync state.

Ingen `INSERT`, `UPDATE`, `DELETE`, `ALTER ROLE`, deploy eller credential-rotasjon finnes i denne porten.

## Migrering og rollback

Rollout-porten regner ikke «schema finnes» som tilstrekkelig produksjonsberedskap. Før grønn remote readiness må environmentet peke på verifiserbart bevis for:

- migration rehearsal mot isolert mål;
- backup tatt før production migration;
- faktisk restore-test;
- tidligere API-revisjon som kan redeployes;
- observability-verifisering.

Rollback-kontrakten er:

1. stopp/cutoff av canonical runtime-credential;
2. terminering av aktive runtime-databasesesjoner;
3. rollback av API til eksplisitt pinnet tidligere revision;
4. schema håndteres med forward-fix eller verifisert restore, ikke automatisk destruktiv down-migration.

## Første brukeraktivering

Når rollout-gaten en dag er grønn, er neste leveranse en **separat** pilot activation workflow. Den skal minst:

- kreve et nytt eksakt aktiveringstoken;
- konsumere beviset fra en grønn rollout-gate;
- aktivere bare én beskyttet pilotprofil;
- holde automatic/login/background sync av;
- bruke minst privilegert runtime-role, aldri admin-DSN;
- ha fail-closed database-first rollback;
- verifisere health, audit, sync-resultater og konflikter etter aktivering;
- ikke utvide allowlisten automatisk.

Denne activation workflowen opprettes ikke før production readiness faktisk er grønn.

## Hva som fortsatt blokkerer production

ADR-006 er fortsatt `Accepted` og `Implementert: Nei`. Derfor er production rollout med vilje blokkert til det finnes en dedikert production-plattform med minst:

- reviewbar Azure/IaC-konfigurasjon;
- separat production PostgreSQL;
- Key Vault / beskyttede secrets;
- produksjons-NestJS-origin;
- observability;
- backup + faktisk restore-test;
- migration rehearsal;
- NOLOGIN production runtime-role med eksakt funksjonsflate;
- eksplisitt pilotprofil.

Staging eller den gamle primære AHA-databasen skal ikke brukes som snarvei for å gjøre porten grønn.
