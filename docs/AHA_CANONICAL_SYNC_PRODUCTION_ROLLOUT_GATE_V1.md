# AHA Canonical Sync Production Rollout Gate v1

Status: **rollout-port og one-profile activation-workflow er implementert; production activation er fortsatt AV som default**.

Den verifiserte browserkjeden er først bevist i isolert staging:

```text
AHA browser-session
→ primær AHA source-event hydration (read-only)
→ canonical filter/adapter
→ offentlig NestJS staging API
→ AHA Staging PostgreSQL
→ bootstrap/pull tilbake til browser
```

Den verifiserte browserkjøringen flyttet 85 canonical-eligible `source_event`-objekter, ekskluderte 2 lokale/deferred kilder, fikk 0 konflikter og ga 85 serverendringer. En identisk andre kjøring ga 0 nye endringer og serveren sto fortsatt på 85 `sync_changes`. Maskinlesbart bevis ligger i `ops/evidence/canonical-sync-browser-staging-proof-v1.json`.

Ingen merge eller grønn rollout-gate aktiverer production automatisk. Produksjonspiloten krever en separat manuell workflow og et eget eksakt aktiveringstoken.

## Én canonical rollout-policy

Den maskinlesbare policyen ligger i:

```text
ops/canonical-sync-production-rollout-v1.json
```

Den låser følgende:

- Azure Container Apps er produksjonsmålet; Render er staging-only.
- production bruker dedikert privat PostgreSQL og kan ikke peke på AHA Staging eller den gamle primære AHA Supabase-databasen.
- TLS er `verify-full`.
- runtime-rollen heter `aha_canonical_production_runtime` og starter `NOLOGIN`.
- admin-credential er aldri tillatt i API-runtime.
- canonical-typene er nøyaktig de ti etablerte typene.
- automatisk sync, login-trigger, auth-ready-trigger og background sync er av også i første pilot.
- gammel Sync Hub aktiveres ikke automatisk.
- første pilot er én eksplisitt allowlistet profil; ingen automatisk utvidelse, gruppe- eller offentlig deling.
- pilotprofilen håndheves server-side på verifisert JWT-subject, ikke bare i klienten.
- production-pilotens browserflate er separat fra staging og kan bare kjøres eksplisitt; workspace utledes fra innlogget subject og kan ikke skrives inn av brukeren.
- destructive migrations eller destruktiv pilot-rollback er ikke tillatt.
- backup, PITR restore-test, migration rehearsal, observability og rollout-gate er obligatorisk.
- direkte databaseforbindelse fra offentlig GitHub-runner til privat production PostgreSQL er forbudt.
- aktivering og rollback er database-first.

## Manuell read-only rollout-gate

Workflow:

```text
.github/workflows/aha-canonical-sync-production-rollout-gate.yml
```

Eksakt token:

```text
RUN_AHA_CANONICAL_PRODUCTION_ROLLOUT_GATE
```

Gaten er delt i to sikkerhetsdomener.

### Remote/API readiness

Første jobb kjører fra:

```text
aha-canonical-production-readiness
```

med bare `contents: read`. Den verifiserer rollout-kontrakt, staging-bevis og live `/v1/health`. Den får ikke production admin-DSN eller database-CA.

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

`AHA_PRODUCTION_PILOT_PROFILE_ID` er en beskyttet environment secret. `AHA_PRODUCTION_SYNC_RUNTIME_STATE` må være `disabled` mens gaten kjøres.

### Private database readiness

Andre jobb kjører etter grønn remote readiness fra:

```text
aha-canonical-production-infra
```

Den bruker GitHub OIDC mot Azure og verifiserer databasen inne i production-VNet-et.

Jobben:

1. re-leser live Container App og krever `AHA_CANONICAL_SYNC_ENABLED=false`;
2. finner den eksakte immutable production-revisjonen;
3. krever matching `aha-canonical-db-init:<revision>` i production ACR;
4. finner operations Key Vault og migration-identiteten;
5. deployer et kortlivet Container Apps Job i production Container Apps Environment;
6. bruker `db-init-job.bicep` med `mode=verify_restore`;
7. leser admin-DSN og CA bare via operations Key Vault-referanser;
8. kjører `verify-full` + `default_transaction_read_only=on`;
9. verifiserer canonical schema, migration receipts, fail-closed roller, eksakt runtime-funksjonsflate og null direkte runtime table writes;
10. sletter det kortlivede verification-jobbet med `if: always()`.

Gaten aktiverer ikke API, runtime-role eller sync.

## API-readiness

`scripts/aha-canonical-sync-production-rollout-gate.cjs readiness` krever at production API:

- bruker HTTPS og separat backend-origin;
- ikke er Render;
- svarer `/v1/health` med `status=ok` og `service=aha-nest-api`;
- har auth konfigurert;
- har database konfigurert og tilkoblet;
- ser canonical schema;
- rapporterer `safeRuntimeRole=true`;
- rapporterer `runtimeActivated=false`;
- rapporterer `canonicalSync.enabled=false`.

## One-profile pilot activation

Workflow:

```text
.github/workflows/aha-canonical-sync-production-pilot-activation.yml
```

Eksakt token:

```text
RUN_AHA_CANONICAL_PRODUCTION_PILOT_ACTIVATION
```

Workflowen kan bare kjøres fra `main` og `aha-canonical-production-infra`. Den krever i tillegg en **grønn production rollout-gate på nøyaktig samme Git-SHA**. En eldre grønn gate er ikke nok.

Den beskyttede piloten kommer fra:

```text
AHA_PRODUCTION_PILOT_PROFILE_ID
```

som environment secret. Profil-ID-en hardkodes ikke i repo eller image.

Aktiveringsrekkefølgen er fail-closed:

1. bekreft eksakt token, én UUID-pilot og samme-SHA rollout-bevis;
2. re-les live production og krev at sync/runtime fortsatt er av;
3. bygg immutable API- og database-control-images på eksakt activation-SHA;
4. roter et nytt runtime-passord og stage det kortlivet i operations Key Vault;
5. lagre den beskyttede pilot-ID-en i Key Vault, ikke plaintext i Container Apps-jobben;
6. kjør `db-init` med `mode=activate_pilot` inne i production-VNet;
7. opprett/idempotent verifiser nøyaktig én canonical profil med `auth_provider=supabase` og `auth_subject=<pilot-id>`;
8. opprett/idempotent verifiser nøyaktig én privat personlig workspace avledet fra pilotprofilen;
9. åpne `aha_canonical_production_runtime` med LOGIN og rotert credential, men behold `NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEDB`, `NOCREATEROLE`, `NOINHERIT`, null direkte table writes og eksakt tre sync-rutiner;
10. bytt runtime Key Vault fra readiness-DSN til runtime-DSN;
11. deploy API med `AHA_RUNTIME_ACTIVATED=true`, `AHA_CANONICAL_SYNC_ENABLED=true`, protected pilot secret og `AHA_LOCAL_IMPORT_ENABLED=false`;
12. krev live health med riktig Git-SHA, connected safe runtime role, `runtimeActivated=true` og `canonicalSync.enabled=true` før aktiveringen markeres committed.

API-et håndhever pilotgrensen server-side i `CanonicalSyncService`: alle andre verifiserte JWT-subjects får `403 CANONICAL_SYNC_PILOT_FORBIDDEN`. Klient-side skjuling er derfor ikke sikkerhetsgrensen.

Første pilot aktiverer **ikke** automatisk, login-triggered eller background sync. Sync må fortsatt initieres eksplisitt av brukeren/operatøren gjennom den manuelle canonical sync-kjeden.

### Eksplisitt browserkjøring etter committed aktivering

Den separate operatorflaten ligger på:

```text
canonical-sync-production-pilot.html
```

Den er ikke lenket inn som normal brukerflyt og har `noindex,nofollow`. For å åpne kontrollen må siden besøkes med:

```text
?ahaCanonicalProductionPilot=1
```

Selve kjøringen krever i tillegg eksakt frase:

```text
RUN_AHA_CANONICAL_PRODUCTION_PILOT_SYNC
```

og eksplisitt samtykke i skjemaet.

Browserbroen `js/ahaCanonicalSyncProductionPilotBridge.js` er bevisst forskjellig fra staging-broen:

1. den utfører ingen auth-lesing, storage-write eller nettverkskall ved page load;
2. production API-origin skrives eksplisitt inn for hver kontrollert kjøring og må være HTTPS/separat fra static AHA-origin;
3. først etter submit leses den eksisterende AHA/Supabase-sessionen;
4. personal workspace-ID kan ikke oppgis manuelt, men utledes deterministisk som `personal-<authenticated subject>`;
5. den beskyttede pilot-ID-en finnes fortsatt bare server-side/Key Vault og eksponeres ikke i browserkonfigurasjon;
6. `AHACanonicalManualSyncRunner` kalles med `explicitUserAction=true` og den aktuelle access tokenen;
7. i motsetning til staging brukes det ekte lokale canonical-lageret, slik at bootstrap/pull faktisk kan anvendes på pilotens lokale AHA-state;
8. staging source hydrator brukes ikke i production-piloten; ingen skjult lesing fra legacy/primær Supabase-kildetabell legges til;
9. resultatflaten viser bare tellinger og konflikttyper — aldri JWT-subject, workspace-ID, access token, rå payload eller `serverState`;
10. serverens `CANONICAL_SYNC_PILOT_FORBIDDEN`-kontroll er fortsatt autoritativ dersom en annen innlogget profil forsøker å bruke flaten.

Denne browserflaten aktiverer heller ikke sync i infrastrukturen. Hvis activation-workflowen ikke allerede har committed production-piloten, vil API/DB-grensen fortsatt avvise eller være utilgjengelig.

### Ufullstendig aktivering rulles tilbake database-first

Hvis et steg etter at DB-jobben er opprettet feiler, workflowen:

1. setter runtime-rollen tilbake til `NOLOGIN`, nuller credential og terminerer aktive runtime-sesjoner;
2. gjenoppretter readiness-DSN i runtime Key Vault;
3. setter API tilbake til `AHA_RUNTIME_ACTIVATED=false`, `AHA_CANONICAL_SYNC_ENABLED=false`, `AHA_LOCAL_IMPORT_ENABLED=false`;
4. fjerner pilot-env fra API-revisjonen;
5. krever sync-disabled safe health;
6. sletter kortlivet control-job og runtime-passord-secret.

Pilotprofil/workspace slettes ikke automatisk. Schema/data håndteres med forward-fix eller verifisert restore, ikke destruktiv rollback.

## Emergency pilot cutoff etter en committed aktivering

Workflow:

```text
.github/workflows/aha-canonical-sync-production-pilot-rollback.yml
```

Eksakt token:

```text
RUN_AHA_CANONICAL_PRODUCTION_PILOT_ROLLBACK
```

Denne er også database-first:

1. bruker det immutable `aha-canonical-db-init:<live revision>`-imaget;
2. kjører `deactivate_pilot` inne i production-VNet;
3. committer først runtime-role `NOLOGIN`, nuller credential og blokkerer dermed nye sessions før videre cleanup;
4. PostgreSQL 16 gir en ikke-superuser med `CREATEROLE` en automatisk creator-membership på roller den oppretter: `ADMIN TRUE`, `INHERIT FALSE`, `SET FALSE`. Denne baseline-raden kan ikke fjernes av creator-rollen selv;
5. cutoffen bruker creatorens `ADMIN OPTION` til en midlertidig `SET TRUE`-grant, gjør `SET ROLE aha_canonical_production_runtime` bare mens aktive runtime-backends termineres, deretter `RESET ROLE` og `REVOKE` av den midlertidige granten;
6. etter cutoff må membership-formen være nøyaktig tilbake til baseline — ingen ekstra `SET TRUE`- eller `INHERIT TRUE`-grant får bli stående;
7. rekonstruerer readiness-DSN fra operations Key Vault og gjenoppretter den i runtime Key Vault;
8. slår av runtime/sync i Container App uten å endre det immutable API-imaget;
9. krever safe sync-disabled health;
10. beholder pilotdata urørt.

PostgreSQL-16 CI tester cutoffen med en faktisk runtime-sesjon under samme `NOSUPERUSER + CREATEROLE`-privilegiumform som production-adminen. Porten krever etter cutoff `NOLOGIN`, null aktive runtime-sesjoner, creator-membership tilbake til eksakt `ADMIN TRUE / INHERIT FALSE / SET FALSE`, fortsatt eksakt tre sync-rutiner og null direkte canonical table writes.

Når sync igjen er av kan den separate immutable API rollback-workflowen brukes dersom selve API-imaget også må rulles tilbake til en tidligere Git-SHA.

## Produksjonsrekkefølge

```text
migration rehearsal
→ Azure production platform deploy (sync=false)
→ ekte backup/PITR restore rehearsal
→ observability readiness
→ production rollout gate:
   remote/API readiness
   → privat VNet database readiness
→ separat same-SHA one-profile pilot activation
→ eksplisitt manuell pilot-sync fra production-pilotflaten
```

Staging eller den gamle primære AHA-databasen skal aldri brukes som snarvei for production-data eller production-schema.
