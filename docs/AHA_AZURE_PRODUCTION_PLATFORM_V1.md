# AHA Azure Production Platform v1

Status: **deployet i Azure North Europe; production-readiness er gjennomført; canonical sync kjører som en bounded manual production-pilot med nøyaktig 2 verifiserte profiler. Automatisk/login-triggered/auth-ready/background sync er fortsatt AV.**

Den operative sannhetskilden for den aktive piloten er:

```text
docs/AHA_CANONICAL_PRODUCTION_PILOT_STATUS.md
ops/canonical-sync-production-rollout-v1.json
```

`ops/evidence/canonical-sync-production-pilot-proof-v1.json` beholdes som historisk bevis for den første pilotprofilens production roundtrip. Denne filen beskriver selve Azure-plattformen, dens fail-closed deploy-default og de operative portene. Historiske formuleringer om «ikke deployet», «activation kommer senere» eller at dagens pilot bare består av én profil er ikke lenger gjeldende.

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

Etter grønn migration/restore/observability/rollout-gate ble den første profilen aktivert gjennom:

```text
.github/workflows/aha-canonical-sync-production-pilot-activation.yml
```

Deretter ble profil #2 lagt til gjennom den separate bounded expansion-kjeden:

```text
.github/workflows/aha-canonical-sync-production-pilot-expansion-gate.yml
→ .github/workflows/aha-canonical-sync-production-pilot-expansion-activation.yml
→ .github/workflows/aha-canonical-sync-production-pilot-post-activation-verification.yml
```

Den aktive pilot-revisjonen kjører med:

```text
AHA_RUNTIME_ACTIVATED=true
AHA_CANONICAL_SYNC_ENABLED=true
AHA_LOCAL_IMPORT_ENABLED=false
```

Sync er server-side begrenset til en protected allowlist med **nøyaktig 2 verifiserte profiler**. Browseren må fortsatt initiere hver sync eksplisitt.

## Credential- og rollegrenser

Production har tre separate credential-grenser:

1. **Migration/admin** — admin-DSN finnes bare i operations Key Vault og brukes av migration/operations-identiteten.
2. **Readiness** — den read-only rollout-gaten verifiserer production uten å gi offentlig runner direkte tilgang til private PostgreSQL.
3. **Sync runtime** — `aha_canonical_production_runtime` ble opprettet `NOLOGIN` og uten direkte table writes. Under aktiv pilot åpnes rollen med least-privilege runtime-credential og bare den eksakte canonical sync-funksjonsflaten.

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

Den er gjennomført grønt og er delt i to sikkerhetsdomener.

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

Gaten aktiverer ikke pilot i seg selv. Første activation og senere expansion er separate eksplisitte same-SHA operasjoner.

## Første profil: initial activation

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
8. krever live health før det historiske activation-resultatet `COMMITTED_ONE_PROFILE`.

`COMMITTED_ONE_PROFILE` beskriver bare den første activation-workflowens resultat. Det er ikke dagens fleet-status.

## Profil #2: bounded expansion og isolasjon

Profil #2 ble lagt til med én-profil-per-activation-regelen og samme immutable activation-revisjon.

Post-activation-verifikasjonen beviste:

```text
protected allowlist count = 2
candidate own private workspace bootstrap = HTTP 200
candidate → annen pilotprofils private workspace = HTTP 403
per-profile rollback = READY_REMOVE_ONE_PROFILE_NO_MUTATION
canonical data deleted = false
```

Profil-ID-er, private workspace-ID-er og access token inngår ikke i publisert evidence.

Per-profile rollback kan fjerne en utvidet profil fra API-allowlisten uten å slå av de andre pilotprofilene eller slette canonical data.

## Browser/Home sync

Den første production-profilen har allerede et production roundtrip- og idempotensbevis med null konflikter.

Normal pilotbruk finnes på AHA Home som en **manuell** `Synkroniser nå`-handling. Den krever eksplisitt brukerhandling og samtykke for hver kjøring. Canonical controller/dependencies lazy-loades først etter bekreftelsen og bruker det konfigurerte production-endpointet automatisk.

Følgende forblir av:

```text
automatic sync
login-triggered sync
auth-ready-triggered sync
background sync
automatic retry
local import
automatic profile expansion
group/public canonical sharing
```

Den separate `canonical-sync-production-pilot.html` beholdes som kontrollert operator-/diagnostikkflate, ikke som normal hovedflyt.

## To-profil real-data round-trip er neste port

Det som fortsatt mangler er normal, kontrollert round-trip av ekte AHA-data for **begge** nåværende profiler.

Operatorflate:

```text
canonical-sync-production-roundtrip.html?ahaCanonicalProductionRoundTrip=1
```

Dokumentasjon:

```text
docs/AHA_CANONICAL_PRODUCTION_TWO_PROFILE_ROUND_TRIP_V1.md
```

For hver profil skal én liten lokal AHA-endring bevise:

```text
lokal AHA-endring
→ canonical adapter
→ IndexedDB outbox
→ push
→ production journal
→ bootstrap/pull
→ local apply/rebaseline
→ identisk replay
```

Kravene inkluderer faktisk push, serverstate tilbake til lokalt lager, monotone cursors, null hash-mismatch, null uventede konflikter/rejections og replay med `changed=0`, `enqueued=0`, `pushed=0`.

**Profil #3 er pauset** til begge dagens profiler har bestått denne porten.

## Rollback og emergency cutoff

Tre forskjellige rollback-grenser finnes.

### Hele aktive piloten: database-first cutoff

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

### Én utvidet profil: allowlist-first rollback

Workflow:

```text
.github/workflows/aha-canonical-sync-production-pilot-profile-rollback.yml
```

Den fjerner én ikke-anchor profil fra den protected API-allowlisten, beholder shared runtime role og sletter ikke canonical profil, workspace eller data.

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

Den midlertidige `AHA_PRODUCTION_PILOT_EXPANSION_ACCESS_TOKEN` som ble brukt for post-activation-verifikasjonen av profil #2 skal fjernes fra alle environments der den midlertidig ble lagt inn. Tokenet er ikke en runtime-avhengighet.

## Produksjonsrekkefølgen — gjennomført til to verifiserte profiler

```text
PR/CI: Bicep + Docker + contract                 ✓
        ↓
migration rehearsal                              ✓
        ↓
Azure production platform deploy                 ✓
        ↓
real backup/PITR restore rehearsal               ✓
        ↓
observability readiness                          ✓
        ↓
production rollout gate                          ✓
        ↓
same-SHA initial pilot activation                ✓
        ↓
profile #1 browser roundtrip + idempotence       ✓
        ↓
manual Home sync integration                     ✓
        ↓
bounded expansion gate for profile #2            ✓
        ↓
same-SHA expansion activation                    ✓
        ↓
profile #2 post-activation isolation verify      ✓
        ↓
real-data roundtrip for BOTH profiles             MÅ GJØRES
```

## Neste sikkerhetsgrense

En grønn to-profil isolasjonspilot er **ikke** automatisk godkjenning for profil #3, generell production-sync eller bakgrunnssync.

Før neste expansion krever policyen real-data round-trip og idempotent replay for begge eksisterende profiler. Deretter følger stabilitetsobservasjon av auth-avslag, permission-avslag, sync conflicts, push-resultater, latency og databasebelastning.

Først når dette er grønt kan bounded-piloten vurderes utvidet til 3–5 profiler og senere opptil maksgrensen på 10. General production-sync og automatic/background sync er separate senere beslutninger.
