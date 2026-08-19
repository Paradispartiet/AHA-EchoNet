# AHA Azure Production Platform v1

Status: **deployet i Azure North Europe; production-readiness er gjennomført; en separat, eksplisitt én-profil canonical pilot er aktiv. Automatisk/login-triggered/background sync er fortsatt AV.**

Den operative sannhetskilden for den aktive piloten er:

```text
docs/AHA_CANONICAL_PRODUCTION_PILOT_STATUS.md
ops/evidence/canonical-sync-production-pilot-proof-v1.json
```

Denne filen beskriver selve Azure-plattformen, dens fail-closed deploy-default og de operative portene. Historiske formuleringer om «ikke deployet» eller «activation kommer senere» er ikke lenger gjeldende.

## Faktisk production-topologi

IaC under `infra/azure/production/` bygger den dedikerte AHA-produksjonsplattformen:

- egen production resource group;
- Azure Container Apps Environment;
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

Produksjonen er faktisk deployet i **North Europe**. Den opprinnelige IaC-defaulten var `westeurope`, men subscriptionen kunne ikke opprette de nødvendige ressursene der, så den beskyttede production-locationen ble satt til `northeurope` før første vellykkede deploy.

Dette følger ADR-006: Container Apps før AKS og dedikert production PostgreSQL. Render er staging-only og kan ikke brukes som production-database eller production-runtime.

## Fail-closed deploy-default og aktiv pilot er to forskjellige tilstander

Normal production platform-deploy er fortsatt fail-closed og skal starte med:

```text
AHA_DATABASE_ENABLED=true
AHA_DATABASE_SSL_MODE=verify-full
AHA_RUNTIME_ACTIVATED=false
AHA_CANONICAL_SYNC_ENABLED=false
AHA_LOCAL_IMPORT_ENABLED=false
```

Det er med vilje **deploy-defaulten**, ikke en beskrivelse av dagens separat aktiverte pilot.

Etter grønn migration/restore/observability/rollout-gate ble én-profil-piloten aktivert gjennom den separate workflowen:

```text
.github/workflows/aha-canonical-sync-production-pilot-activation.yml
```

Den committed pilot-revisjonen kjører med:

```text
AHA_RUNTIME_ACTIVATED=true
AHA_CANONICAL_SYNC_ENABLED=true
AHA_LOCAL_IMPORT_ENABLED=false
```

Sync er server-side begrenset til én protected pilotprofil. Den er fortsatt ikke automatisk: browseren må initiere hver sync eksplisitt.

## Credential- og rollegrenser

Production har tre separate credential-grenser:

1. **Migration/admin** — admin-DSN finnes bare i operations Key Vault og brukes av migration/operations-identiteten.
2. **Readiness** — før pilotaktivering kunne API-et koble seg til med `aha_canonical_production_readiness`, uten canonical lese-/skriveprivilegier.
3. **Sync runtime** — `aha_canonical_production_runtime` ble opprettet `NOLOGIN` og uten direkte table writes. Under den committed én-profil-piloten er rollen åpnet med en rotert runtime-credential, men beholder fail-closed rolleformen og bare den eksakte canonical sync-funksjonsflaten.

API-runtimeidentiteten har ikke tilgang til operations-vaulten med admin-DSN.

Ved emergency cutoff kuttes runtime-login og aktive sessions database-first før API-sync slås av.

## Verifisert migreringsport

`AHA Azure production migration rehearsal` har kjørt hele det timestamp-sorterte migration-settet mot PostgreSQL 16 med Azure-lignende ikke-superuser admin-grense.

Porten dokumenterer blant annet:

- migration count og schema receipts;
- readiness/runtime role shape;
- nøyaktig runtime-funksjonsflate;
- null direkte runtime table writes;
- idempotent production-role setup.

Den faktiske Azure-plattformdeploymenten bruker et eget Container Apps Job inne i production-VNet-et. Jobben bruker `verify-full`, pinned CA og migrationsettet fra samme immutable Git-SHA som API-imaget.

## Backup og faktisk PITR restore

`AHA Azure production backup restore rehearsal` er gjennomført grønt med en ekte point-in-time restore til en separat privat PostgreSQL-server.

Rehearsalen:

1. finner nøyaktig production PostgreSQL-server;
2. utfører PITR til separat server;
3. beholder private subnet/private DNS;
4. oppretter kortlivet verification-credential i operations Key Vault;
5. kjører samme DB-verifikasjonsimage i `verify_restore`;
6. tvinger `default_transaction_read_only=on`;
7. verifiserer schema, roller, funksjonsflate og database-state;
8. skriver maskinlesbart evidence;
9. rydder verification-job, temp-secret og restore-server.

Production-kildedatabasen muteres ikke av restore-verifikasjonen.

## Observability readiness

`AHA Azure production observability readiness` er gjennomført grønt.

Porten krever relevante Container Apps- og PostgreSQL-metrics, genererer ufarlige health-kall og verifiserer at `AhaSafeAudit` faktisk kan hentes fra Log Analytics uten credential-formede verdier.

Det gir production-belegg for blant annet:

- request-rate og latency;
- HTTP-feil;
- database connections/availability/query load;
- auth- og permission-rejections;
- sync-resultater og conflicts;
- immutable deployment revision.

Rå samtaletekst, bearer-header, database-URL eller secrets er ikke tillatt i standardtelemetrien.

## Production rollout gate

Den manuelle read-only gaten ligger i:

```text
.github/workflows/aha-canonical-sync-production-rollout-gate.yml
```

Den er gjennomført grønt og er delt i to sikkerhetsdomener:

### Remote/API readiness

Kjører fra:

```text
aha-canonical-production-readiness
```

Den verifiserer rollout-kontrakt, evidence-pekerne og live API-health. Readiness-runneren får ikke production admin-DSN eller database-CA.

### Privat database-readiness

Kjører fra:

```text
aha-canonical-production-infra
```

Den bruker GitHub OIDC og et kortlivet Container Apps verification-job **inne i production-VNet-et**. Admin-DSN og CA leses bare via operations Key Vault-referanser. Offentlig GitHub-runner kobler aldri direkte til private PostgreSQL.

Gaten aktiverer ikke pilot i seg selv. Aktiv pilot krever den separate same-SHA activation-workflowen.

## Én-profil activation

Workflow:

```text
.github/workflows/aha-canonical-sync-production-pilot-activation.yml
```

Eksakt manuell bekreftelse:

```text
RUN_AHA_CANONICAL_PRODUCTION_PILOT_ACTIVATION
```

Activation krever en grønn rollout-gate på **samme Git-SHA**. Den:

1. verifiserer at production fortsatt er sync-disabled før start;
2. bygger immutable API- og DB-control-images;
3. bootstrapper nøyaktig én canonical profil og én privat personal workspace inne i production-VNet;
4. roterer runtime-credential;
5. åpner bare least-privilege runtime-rollen;
6. aktiverer server-side pilot-allowlist;
7. deployer API med runtime/sync aktiv bare for piloten;
8. krever live health før `COMMITTED_ONE_PROFILE`.

Denne kjeden er gjennomført og dokumentert i `AHA_CANONICAL_PRODUCTION_PILOT_STATUS.md`.

## Browser/Home sync

Den første production roundtripen og en identisk idempotens-kjøring er gjennomført med null konflikter.

Normal pilotbruk finnes nå på AHA Home som en **manuell** `Synkroniser AHA`-handling. Den krever eksplisitt brukerhandling og samtykke for hver kjøring. Canonical controller/dependencies lazy-loades først etter bekreftelsen.

Følgende forblir av:

```text
automatic sync
login-triggered sync
auth-ready-triggered sync
background sync
automatic retry
local import
multi-profile expansion
```

Den separate `canonical-sync-production-pilot.html` beholdes som kontrollert operator-/diagnostikkflate, ikke som normal hovedflyt.

## Rollback og emergency cutoff

To forskjellige rollback-grenser finnes:

### Aktiv pilot: database-first cutoff

Workflow:

```text
.github/workflows/aha-canonical-sync-production-pilot-rollback.yml
```

Eksakt token:

```text
RUN_AHA_CANONICAL_PRODUCTION_PILOT_ROLLBACK
```

Den:

1. setter runtime tilbake til `NOLOGIN` og kutter nye innlogginger;
2. terminerer aktive runtime-sesjoner gjennom den testede PostgreSQL-16-grensen;
3. gjenoppretter readiness-DSN;
4. setter runtime/sync av i API-et;
5. krever safe sync-disabled health;
6. beholder pilotdata — ingen destruktiv down-migration.

### Sync-disabled API rollback

Når canonical sync igjen er av kan `AHA Azure production API rollback` redeploye en eksakt immutable API-revisjon og reassert `AHA_CANONICAL_SYNC_ENABLED=false` og `AHA_LOCAL_IMPORT_ENABLED=false`.

Schema rollback er fortsatt **forward-fix eller verified restore**.

## GitHub Environments

### Infrastructure

```text
aha-canonical-production-infra
```

Her ligger Azure OIDC-/production-infrastrukturverdier og beskyttede production-secrets. Azure-login bruker OIDC, ikke client secret.

### Readiness

```text
aha-canonical-production-readiness
```

Her ligger ikke admin-DSN/CA. Miljøet inneholder bare protected readiness-kontraktverdier som API-origin, pilot-identifikator, rollback revision og evidence-pekere. Privat DB-verifikasjon går via `aha-canonical-production-infra` og operations Key Vault.

## Produksjonsrekkefølgen — gjennomført for første pilot

```text
PR/CI: Bicep + Docker + contract
        ↓
migration rehearsal                      ✓
        ↓
Azure production platform deploy         ✓
        ↓
real backup/PITR restore rehearsal       ✓
        ↓
observability readiness                  ✓
        ↓
production rollout gate                  ✓
        ↓
same-SHA one-profile pilot activation    ✓
        ↓
manual browser roundtrip                 ✓
        ↓
idempotent repeat                        ✓
        ↓
manual Home sync integration             ✓
```

## Neste sikkerhetsgrense

En grønn én-profil-pilot er **ikke** automatisk godkjenning for flere profiler eller bakgrunnssync.

Før pilotutvidelse må en separat reviewet leveranse definere og teste blant annet:

- allowlist/invitasjonsmodell;
- cross-profile/tenant-isolasjon;
- per-profile observability uten identitetslekkasje;
- per-profile cutoff/rollback;
- eksplisitt utvidelses-gate og evidence.

Background/login-triggered sync er en enda senere separat beslutning.
