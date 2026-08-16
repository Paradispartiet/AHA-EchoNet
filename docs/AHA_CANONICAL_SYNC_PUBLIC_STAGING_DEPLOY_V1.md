# AHA Canonical Sync Public Staging Deploy v1

Status: **deploykontrakt klar; offentlig staging-origin er ikke aktivert ennå; ingen production activation**.

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

## Isolert Render Blueprint

Denne porten legger **ikke** den nye tjenesten inn i repoets aktive `render.yaml`.

Den reviewbare definisjonen ligger i:

```text
deploy/render/canonical-api-staging.yaml
```

Det er med vilje en separat Blueprint-path. En merge kan derfor ikke opprette, endre eller redeploye eksisterende Render-tjenester alene. Operatøren må eksplisitt opprette en ny Blueprint og peke på akkurat denne filen.

Tjenesten heter:

```text
aha-canonical-api-staging
```

og er låst til:

- `rootDir: backend/api`;
- Node 22;
- `NODE_ENV=production`;
- `AHA_DATABASE_ENABLED=true`;
- `AHA_DATABASE_SSL_MODE=verify-full`;
- `AHA_CANONICAL_SYNC_ENABLED=true`;
- `AHA_LOCAL_IMPORT_ENABLED=false`;
- CORS kun fra `https://paradispartiet.github.io`;
- health på `/v1/health`;
- `autoDeploy: false`.

Render brukes her kun som en avgrenset offentlig **staging-origin** fordi repoet allerede har en Render-driftsoverflate. Dette endrer ikke den aksepterte langsiktige driftsbeslutningen i **ADR-006**: Azure Container Apps er fortsatt første Azure-mål før AKS. Denne browserporten aktiverer ikke Azure, og den gjør heller ikke Render til ny produksjonsarkitektur.

## Browser-auth er det eksisterende AHA Auth-prosjektet

Den ordinære AHA-frontenden bruker Supabase-prosjektet:

```text
wshmybqyksrwkawqleiz
```

Den offentlige staging-API-en skal derfor validere de samme browser-tokenene med:

```text
issuer   = https://wshmybqyksrwkawqleiz.supabase.co/auth/v1
audience = authenticated
jwks     = https://wshmybqyksrwkawqleiz.supabase.co/auth/v1/.well-known/jwks.json
provider = supabase
```

Ingen service-role key eller Supabase database-admin credential skal inn i den offentlige API-tjenesten.

Før browsertesten må vi i tillegg bevise at dette Auth-prosjektet faktisk eksponerer en asymmetrisk signing key i JWKS. Hvis prosjektet fortsatt bruker legacy HS256, skal porten stoppe; vi skal ikke kopiere den symmetriske JWT-hemmeligheten inn i NestJS for å få testen grønn.

## Database-target forblir AHA Staging

Canonical database er fortsatt den isolerte AHA Staging-instansen:

```text
sstuzwppsheivczyqrim
```

Den offentlige API-en får **aldri** admin-DSN-en. Den skal bruke en egen persistent login-role, separat fra både `postgres`, Supabase-infrastrukturroller og de ephemeral `aha_sync_e2e_*`-rollene som brukes av Actions-rehearsalen.

Persistent runtime-role skal minst være:

```text
LOGIN
NOSUPERUSER
NOBYPASSRLS
NOCREATEDB
NOCREATEROLE
NOINHERIT
```

og ha:

- null medlemskap i privilegerte roller;
- null ownership av canonical tabeller;
- null direkte `INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER` på `aha.*`;
- `USAGE` på schema `aha`;
- `EXECUTE` kun på de top-level sync-funksjonene som browser-sync faktisk trenger;
- ingen direkte `EXECUTE` på interne sync-helpers.

Persistent rolle opprettes **ikke** av denne repo-PR-en. Det er bevisst: vi skal ikke generere et databasepassord før vi har et faktisk hemmelighetslager i deployment-overflaten som kan motta det uten å skrive credentialen i repo, Actions-logg eller chat.

## TLS uten runner-lokal fil

GitHub Actions-rehearsalen materialiserte Supabase-CA-en til en midlertidig fil for `psql` og `NODE_EXTRA_CA_CERTS`. En langlivet plattformtjeneste bør ikke være avhengig av en GitHub-runner-fil.

NestJS databasekonfigurasjon støtter derfor nå en eksplisitt PEM via:

```text
AHA_DATABASE_SSL_CA_CERT
```

`PgConnectionProvider` sender denne som `ca` til `pg` samtidig som `rejectUnauthorized=true` beholdes under `verify-full`. Custom CA kan ikke kombineres med den svakere `require`-modusen.

Blueprinten har to hemmelige runtime-verdier som må fylles ut i deploymentplattformen:

```text
AHA_DATABASE_URL
AHA_DATABASE_SSL_CA_CERT
```

CA-en er offentlig trust material, men holdes utenfor blueprinten slik at sertifikatrotasjon ikke krever hardkodet PEM i repoet. Database-DSN-en er en ekte credential og skal alltid behandles som secret.

## Hva denne PR-en bevisst ikke gjør

Den:

- oppretter ingen Render-tjeneste;
- oppretter ingen persistent database-login;
- aktiverer ikke canonical sync på Home;
- kobler ikke sync til login;
- starter ingen background sync;
- lager ikke eller vekker gammel `sync.html` / Sync Hub;
- endrer ikke production-database;
- flytter ikke produksjonsdata til staging;
- setter ikke `AHA_STAGING_ADMIN_DATABASE_URL` i en offentlig tjeneste;
- aktiverer ikke group/EchoNet/public sharing;
- gjør ingen automatisk konfliktmerge.

## Aktiveringsrekkefølge

Porten skal tas i denne rekkefølgen:

1. merge deploykontrakten etter grønn CI;
2. verifiser at det eksisterende AHA Auth-prosjektet har usable JWKS for browser-sessionen;
3. opprett en dedikert persistent AHA Staging runtime-role og kjør least-privilege-preflight;
4. opprett den isolerte staging-tjenesten fra `deploy/render/canonical-api-staging.yaml`;
5. legg bare runtime-DSN og `AHA_DATABASE_SSL_CA_CERT` i deployment secret store;
6. deploy manuelt og verifiser `/v1/health` over HTTPS;
7. bind en eksplisitt staging-fixtureprofil/workspace til den autentiserte browser-identiteten, uten å importere data;
8. åpne `canonical-sync-staging.html?ahaCanonicalStaging=1`;
9. kjør én eksplisitt browser-sync og verifiser outbox, bootstrap, pull, konflikt og tombstone fra browseren;
10. kontroller stagingdatabase og logger for null credential-/payload-lekkasje og null uventede roller/grants.

Først etter punkt 10 er browserporten grønn.

## Hva grønn browserport betyr

En grønn port betyr at den faktiske brukerflaten kan flytte canonical private data gjennom den samme kontrakten som Run #8 beviste, med ekte browser-auth og en langlivet minst-privilegert staging-identitet. Den betyr fortsatt **ingen production activation**.
