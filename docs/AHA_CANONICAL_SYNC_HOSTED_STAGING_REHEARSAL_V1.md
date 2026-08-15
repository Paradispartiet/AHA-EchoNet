# AHA Canonical Sync Hosted Staging Rehearsal v1

Status: **manuell staging-only HTTP → NestJS → hosted PostgreSQL rehearsal; ingen production activation**.

Denne porten kommer etter `AHA_CANONICAL_SYNC_STAGING_ACTIVATION_V1`. Browserflaten og manual runneren er allerede implementert. Her beviser vi neste ledd: den faktiske NestJS sync-grensen mot den isolerte **AHA Staging**-databasen, med signaturverifisert JWT, RLS og minst privilegert runtime-role.

## Ingen offentlig backenddeploy

Workflowen starter NestJS kun på GitHub Actions-runneren:

```text
http://127.0.0.1:3100
```

Det opprettes ingen offentlig URL, ingen Vercel/Render/Azure-deploy og ingen production runtime. Den hostede delen er PostgreSQL-databasen; API-et er bare localhost mens rehearsalen kjører.

## Manuell port

Workflow:

```text
.github/workflows/aha-canonical-sync-hosted-staging-rehearsal.yml
```

Den har bare `workflow_dispatch`, bruker GitHub Environment:

```text
aha-postgresql-staging
```

og krever eksakt confirmation:

```text
RUN_AHA_CANONICAL_SYNC_HOSTED_STAGING_REHEARSAL
```

Ingen `push`, `pull_request`, `schedule` eller automatisk trigger er tillatt.

## Bare eksisterende staging-hemmeligheter

Rehearsalen trenger nå bare de **to eksisterende database-secrets** som den hostede PostgreSQL-preflighten allerede bruker:

```text
AHA_STAGING_ADMIN_DATABASE_URL
AHA_STAGING_RUNTIME_DATABASE_URL
```

Det kreves ikke lenger lagret bearer-token, auth issuer/audience/JWKS eller eget audit-salt i GitHub Environment.

Auth-fixturen er selvforsynt og ephemeral:

```text
scripts/aha-canonical-sync-hosted-staging-auth-fixture.cjs
```

På hver workflow-run:

1. genereres et nytt 2048-bit RSA-nøkkelpar;
2. public key eksponeres som JWKS kun på `127.0.0.1:3210`;
3. en RS256-JWT signeres med unik `kid`;
4. tokenet får fast, dedikert fixture-`sub`, korrekt lokal issuer/audience og 15 minutters levetid;
5. token/JWKS-path legges i runnerens `GITHUB_ENV`, ikke i repo eller workflow-logg;
6. private key beholdes bare i minnet til generatorprosessen og skrives aldri til repo eller artifact.

NestJS verifiserer fortsatt ekte kryptografisk signatur, `kid`, issuer og audience gjennom sin ordinære JOSE/JWKS-kjede. Forskjellen er bare at auth-provider-fixturen er lokal og kortlivet, slik at database-rehearsalen ikke er avhengig av en lagret brukercredential.

## Pinned database target

Begge DSN-er må identifisere den repo-pinnede Supabase staging-refen:

```text
sstuzwppsheivczyqrim
```

Før noen grant eller fixture-write kjøres, kjøres den eksisterende read-only hosted preflighten igjen. TLS, project-ref, separate admin/runtime-roller, `NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEDB`, `NOCREATEROLE`, `NOINHERIT`, null table ownership og null direkte canonical write-grants må fortsatt være grønne.

## Runtime-grants

Canonical sync-migrasjonene gjør med vilje:

```text
REVOKE ALL ... FROM PUBLIC
```

Rehearsalen gir staging-runtime-rollen bare `EXECUTE` på tre top-level-funksjoner:

```text
aha.bootstrap_sync_snapshot_v1(text,text,bigint,integer)
aha.pull_sync_changes_v1(text,bigint,integer)
aha.push_sync_change_v1(text,text,text,text,text,text,bigint,text,jsonb)
```

Ingen canonical tabell-write-grants gis. Følgende interne helpers testes eksplisitt som direkte utilgjengelige:

```text
aha.sync_object_snapshot_v1(...)
aha.record_sync_conflict_v1(...)
aha.sync_apply_upsert_v1(...)
aha.sync_apply_delete_v1(...)
```

Top-level-funksjonene er `SECURITY DEFINER` og kan bruke helperne internt uten å gjøre helperne til runtime-API.

## Dedikert canonical staging-identitet

JWT-identiteten mappes av canonical RLS gjennom:

```text
request.jwt.claims.sub
→ aha.current_auth_subject()
→ aha.current_auth_provider() = supabase
→ aha.current_profile_id()
```

Auth-fixturen bruker en fast test-subject som aldri er en vanlig bruker. Database-fixturene er:

```text
profile:   aha-staging-sync-e2e-profile-v1
workspace: aha-staging-sync-e2e-workspace-v1
```

Workspace er `personal`, `private` og eies av fixture-profilen. Prepareringen stopper dersom token-subjektet allerede er bundet til en annen canonical profil, fixture-profilen er bundet til et annet subject, eller workspace har feil eier/scope/status.

## NestJS rehearsal-runtime

API-et kjører med:

```text
NODE_ENV=development
AHA_DATABASE_ENABLED=true
AHA_DATABASE_SSL_MODE=verify-full
AHA_CANONICAL_SYNC_ENABLED=true
AHA_LOCAL_IMPORT_ENABLED=false
AHA_DATABASE_URL=<staging runtime DSN>
AHA_ALLOWED_ORIGINS=http://127.0.0.1:4173
AHA_AUTH_ISSUER=http://127.0.0.1:3210
AHA_AUTH_JWKS_URL=http://127.0.0.1:3210/.well-known/jwks.json
```

`NODE_ENV=development` brukes **kun** fordi auth-fixturens JWKS-server er localhost HTTP. Databaseforbindelsen er fortsatt eksplisitt `verify-full`, og alle runtime-role-sikkerhetskontroller i `CanonicalDatabaseService` er uendret: verified claims settes transaksjonslokalt, `row_security=on` tvinges, og superuser/BYPASSRLS/table-owner avvises.

Audit-saltet i denne isolerte rehearsalen er en tydelig testkonstant, ikke en production-secret og ikke en production-konfigurasjon.

## Reell HTTP-matrise

`scripts/aha-canonical-sync-hosted-staging-e2e.cjs` kjører mot localhost-NestJS, som igjen bruker ekte hosted AHA Staging PostgreSQL.

Sekvensen er:

1. vent på `/v1/health`;
2. bootstrap fixture-workspace og lås første `highWatermark`;
3. push en run-scoped `conversation` med `baseRevision=0` og canonical SHA-256;
4. send eksakt samme push/idempotency key igjen og krev `idempotentReplay=true`;
5. pull fra bootstrap-watermark og krev den nye upsert-journalen;
6. send ny payload med stale `baseRevision=0` og krev `stale_base_revision` uten overwrite;
7. send revision-aware `delete` med SHA-256 av canonical `null`;
8. pull fra upsert-cursor og krev tombstone med `payload=null`;
9. bootstrap på nytt og krev at slettet objekt fortsatt representeres som tombstone.

Objekt-ID og idempotency keys inkluderer GitHub run-id/run-attempt, så runs kolliderer ikke med hverandre.

## Hva som står igjen i staging

Testobjektet avsluttes som canonical tombstone. Journal, audit og idempotency-data er stagingbevis og slettes ikke skjult etter en vellykket run. Fixture-profil/workspace gjenbrukes, mens hvert testobjekt er run-scoped.

## Logging og hemmeligheter

Workflow/scripts har disse sperrene:

- ingen `set -x`;
- ingen `env`/`printenv`;
- ingen echo/printf av DSN eller bearer-token;
- ephemeral JWT skrives bare til `GITHUB_ENV`;
- API-feil summeres til HTTP status + error code/message;
- success-logg viser bare run-scoped fixture-ID, cursors, revisions, counts og konflikttype;
- API-loggtail på feil redigerer DSN- og Bearer-lignende tekst.

## Hva en grønn run beviser

```text
ephemeral signed JWT
→ NestJS JOSE / JWKS / issuer / audience verification
→ CanonicalDatabaseService
→ least-privilege PostgreSQL runtime role
→ top-level canonical sync functions
→ RLS-bound personal workspace
→ sync journal + idempotency + conflicts + tombstone
→ NestJS HTTP response
```

Dette er ekte hosted database- og HTTP-bevis, men ikke ennå browser-klikkbeviset fra `canonical-sync-staging.html`, fordi Actions-NestJS bare finnes på runnerens localhost.

## Hva porten ikke aktiverer

- production database/sync flags;
- offentlig NestJS deployment;
- Home eller gammel Sync Hub execution;
- login-trigger eller background sync;
- `sync.html`;
- group/EchoNet/public sharing;
- automatisk konfliktmerge;
- browserwrites direkte til canonical tabeller.

## Neste port

Etter grønn hosted HTTP-rehearsal er neste tekniske port liten: deploy samme NestJS-build til en isolert autentisert staging-origin og kjør den allerede implementerte `canonical-sync-staging.html`-flaten i en ekte browser. Først da er browser → NestJS → PostgreSQL → browser matrisen komplett.
