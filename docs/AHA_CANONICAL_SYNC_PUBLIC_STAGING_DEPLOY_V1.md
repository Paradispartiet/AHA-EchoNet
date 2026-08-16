# AHA Canonical Sync Public Staging Deploy v1

Status: **deploy- og aktiveringskontrakt klar; offentlig staging-origin er ikke aktivert ennå; ingen production activation**.

Denne porten kommer direkte etter grønn hosted rehearsal **Run #8**. Den kjøringen beviste den komplette serverkjeden mot ekte AHA Staging PostgreSQL: verifisert TLS, minst privilegert run-role, signert JWT/JWKS, NestJS, bootstrap, upsert, idempotent replay, pull, eksplisitt `stale_base_revision`, delete, tombstone og fail-closed cleanup.

Neste bevis skal være den siste manglende end-to-end-grensen:

```text
canonical-sync-staging.html
→ ekte browser-session
→ separat offentlig HTTPS NestJS staging-origin
→ AHA Staging PostgreSQL
→ browserens lokale canonical apply/outbox
```

Målet er **browser → NestJS → PostgreSQL → browser**. Dette er fortsatt staging-only.

## Hvorfor en separat offentlig origin

`canonical-sync-staging.html` nekter bevisst å bruke samme origin som den statiske AHA-siden. Siden krever dessuten:

- `?ahaCanonicalStaging=1`;
- eksplisitt HTTPS API-origin;
- eksplisitt personal workspace-ID;
- eksplisitt samtykke;
- eksakt `RUN_AHA_CANONICAL_STAGING_SYNC`;
- en eksisterende AHA Supabase-session først når operatøren faktisk trykker Kjør.

Det finnes fortsatt ingen page-load-, login-, auth-ready-, timer- eller storage-trigger for sync.

## Isolert og først helt dormant Render-tjeneste

Den nye tjenesten ligger fortsatt ikke i repoets aktive `render.yaml`. Den reviewbare definisjonen ligger separat i:

```text
deploy/render/canonical-api-staging.yaml
```

En merge kan derfor ikke opprette eller redeploye eksisterende Render-tjenester. Operatøren må eksplisitt opprette en ny Blueprint og peke på denne custom path-en.

Tjenesten heter:

```text
aha-canonical-api-staging
```

og opprettes som en **health-only** staging-origin:

- `rootDir: backend/api`;
- Node 22;
- `NODE_ENV=production`;
- `AHA_DATABASE_ENABLED=false`;
- `AHA_DATABASE_SSL_MODE=verify-full`;
- `AHA_CANONICAL_SYNC_ENABLED=false`;
- `AHA_LOCAL_IMPORT_ENABLED=false`;
- CORS kun fra `https://paradispartiet.github.io`;
- health på `/v1/health`;
- `autoDeployTrigger: off`.

Blueprinten inneholder verken `AHA_DATABASE_URL` eller `AHA_DATABASE_SSL_CA_CERT`. Dermed kan den offentlige origin-en opprettes uten at en langlivet databasecredential først må håndteres manuelt. Database og canonical sync slås bare på av den separate, manuelle aktiveringsporten.

Render brukes her kun som en avgrenset offentlig staging-origin fordi repoet allerede har en Render-driftsoverflate. Dette endrer ikke beslutningen i **ADR-006**: Azure Container Apps er fortsatt første Azure-mål før AKS. Denne browserporten gjør ikke Render til ny produksjonsarkitektur.

## Browser-auth er det eksisterende AHA Auth-prosjektet

Den ordinære AHA-frontenden bruker Supabase-prosjektet:

```text
wshmybqyksrwkawqleiz
```

Den offentlige staging-API-en validerer de samme browser-tokenene med:

```text
issuer   = https://wshmybqyksrwkawqleiz.supabase.co/auth/v1
audience = authenticated
jwks     = https://wshmybqyksrwkawqleiz.supabase.co/auth/v1/.well-known/jwks.json
provider = supabase
```

Ingen service-role key eller Supabase database-admin credential skal inn i den offentlige API-tjenesten.

Aktiveringsworkflowen henter JWKS-endepunktet direkte og krever minst én **asymmetrisk** offentlig signing key (`RSA`, `EC` eller `OKP`) før database-rollen får LOGIN. Hvis Auth-prosjektet fortsatt bare bruker legacy HS256 / tom JWKS, stopper porten før noen runtime-credential opprettes. Den symmetriske JWT-hemmeligheten skal ikke kopieres inn i NestJS.

## Database-target forblir AHA Staging

Canonical database er fortsatt den isolerte AHA Staging-instansen:

```text
sstuzwppsheivczyqrim
```

Den offentlige API-en får aldri admin-DSN-en. Den bruker den dedikerte rollen:

```text
aha_canonical_staging_runtime
```

Baseline-rollen finnes allerede og er bevisst **NOLOGIN**. Den er kontrollert med:

- `NOSUPERUSER`;
- `NOBYPASSRLS`;
- `NOCREATEDB`;
- `NOCREATEROLE`;
- `NOINHERIT`;
- null privilegerte role memberships;
- null direkte canonical table-write-grants;
- null eide databaseobjekter;
- `USAGE` på `aha`;
- `EXECUTE` kun på `bootstrap_sync_snapshot_v1`, `pull_sync_changes_v1` og `push_sync_change_v1`;
- ingen `EXECUTE` på `commit_local_import_v1`;
- ingen direkte `EXECUTE` på de fire interne sync-helperne.

Ingen password ble generert da baseline-rollen ble opprettet.

## Manuell fail-closed aktivering

Workflowen er:

```text
.github/workflows/aha-canonical-sync-public-staging-activation.yml
```

Den har kun `workflow_dispatch`, bruker GitHub Environment `aha-postgresql-staging`, har bare `contents: read`, og krever eksakt:

```text
RUN_AHA_CANONICAL_PUBLIC_STAGING_ACTIVATION
```

Den bruker eksisterende staging-secrets:

```text
AHA_STAGING_ADMIN_DATABASE_URL
AHA_STAGING_DATABASE_CA_CERT
```

og én ny deployment-credential:

```text
RENDER_API_KEY
```

`RENDER_API_KEY` er kun en GitHub secret. Den skal aldri legges i repo, chat eller Render-miljøet til selve AHA-tjenesten.

Aktiveringsrekkefølgen er fail-closed:

1. verifiser eksakt confirmation og secrets;
2. materialiser den pinnede Supabase-CA-en på Actions-runneren;
3. hent AHA Auth JWKS og krev asymmetrisk public key;
4. finn nøyaktig én Render-service `aha-canonical-api-staging`;
5. verifiser repo, `main`, `backend/api`, HTTPS-origin, autodeploy av og alle ikke-hemmelige stagingvariabler;
6. krev at Render fortsatt er health-only (`AHA_DATABASE_ENABLED=false`, `AHA_CANONICAL_SYNC_ENABLED=false`) og at database-DSN/CA ikke allerede ligger der;
7. verifiser NOLOGIN-rollen på nytt mot AHA Staging med eksakt least-privilege-funksjonsflate;
8. generer et nytt tilfeldig runtime-passord i runneren, maskér det og bygg runtime-DSN uten å logge credentialen;
9. aktiver rollen som LOGIN og test den over `verify-full`;
10. skriv runtime-DSN og `AHA_DATABASE_SSL_CA_CERT` direkte til Render API;
11. slå `AHA_DATABASE_ENABLED=true` og `AHA_CANONICAL_SYNC_ENABLED=true` på først etter at begge secrets er lagret;
12. deploy eksakt `main`-commit og vent på `live`;
13. krev HTTP 200 fra offentlig `/v1/health`;
14. marker aktiveringen committed.

Render API-kall bruker kun den spesifikke service-env-var-endepunktet og deploy-endepunktet. Credentialverdier skrives aldri til stdout.

## Automatisk rollback før commit-punktet

Workflowen har en `always()`-cleanup. Hvis et hvilket som helst steg feiler før offentlig health er grønn, kjøres **rollback** i denne rekkefølgen:

```text
AHA_CANONICAL_SYNC_ENABLED=false
→ AHA_DATABASE_ENABLED=false
→ fjern AHA_DATABASE_URL fra Render
→ fjern AHA_DATABASE_SSL_CA_CERT fra Render
→ ALTER ROLE aha_canonical_staging_runtime NOLOGIN PASSWORD NULL
```

Dermed blir en halvferdig aktivering ikke stående med en brukbar database-login eller aktiv sync. Hvis aktiveringen når commit-punktet etter grønn deploy + health, hopper rollbacken over den ferdige runtimeen.

Dette er en én-gangs aktiveringsport, ikke en generell credential-rotator. Hvis Render allerede inneholder databasecredentialen, nekter workflowen å overskrive den.

## TLS uten runner-lokal fil i den langlivede tjenesten

GitHub Actions materialiserer Supabase-CA-en midlertidig for `psql`, men den langlivede NestJS-tjenesten får PEM-en direkte i:

```text
AHA_DATABASE_SSL_CA_CERT
```

`PgConnectionProvider` sender denne som `ca` til `pg` samtidig som `rejectUnauthorized=true` beholdes under `verify-full`. Custom CA kan ikke kombineres med den svakere `require`-modusen.

Når eksplisitt CA brukes, avvises også `sslmode`, `sslcert`, `sslkey` og `sslrootcert` i `AHA_DATABASE_URL`, slik at connection-string-parsing ikke kan erstatte det eksplisitte `pg.ssl`-objektet.

## Hva denne porten fortsatt ikke gjør

Den:

- oppretter ikke Render-tjenesten automatisk;
- aktiverer ikke canonical sync på Home;
- kobler ikke sync til login;
- starter ingen background sync;
- lager ikke eller vekker gammel `sync.html` / Sync Hub;
- endrer ikke production-database;
- flytter ikke produksjonsdata til staging;
- setter ikke `AHA_STAGING_ADMIN_DATABASE_URL` i offentlig runtime;
- aktiverer ikke group/EchoNet/public sharing;
- gjør ingen automatisk konfliktmerge.

## Operativ rekkefølge videre

1. merge deploy- og aktiveringskontrakten etter grønn CI;
2. opprett den isolerte, dormante Render Blueprint-tjenesten fra `deploy/render/canonical-api-staging.yaml`;
3. opprett en Render API key og lagre den kun som GitHub secret `RENDER_API_KEY`;
4. kjør `AHA canonical sync public staging activation` med eksakt `RUN_AHA_CANONICAL_PUBLIC_STAGING_ACTIVATION`;
5. la workflowen selv bevise JWKS, rolle, credential-transfer, deploy og offentlig health;
6. bind en eksplisitt staging-fixtureprofil/workspace til den faktisk autentiserte browser-identiteten, uten å importere data;
7. åpne `canonical-sync-staging.html?ahaCanonicalStaging=1`;
8. kjør én eksplisitt browser-sync og verifiser outbox, bootstrap, pull, konflikt og tombstone fra browseren;
9. kontroller stagingdatabase og logger for null credential-/payload-lekkasje og null uventede roller/grants.

Først etter punkt 9 er browserporten grønn.

## Hva grønn browserport betyr

En grønn port betyr at den faktiske brukerflaten kan flytte canonical private data gjennom den samme kontrakten som Run #8 beviste, med ekte browser-auth og en langlivet minst-privilegert staging-identitet. Den betyr fortsatt **ingen production activation**.
