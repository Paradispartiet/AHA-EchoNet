# AHA Canonical Sync Hosted Staging Rehearsal v1

Status: **manuell staging-only HTTP → NestJS → hosted PostgreSQL rehearsal; ingen production activation**.

Denne porten kommer etter `AHA_CANONICAL_SYNC_STAGING_ACTIVATION_V1`. Browserflaten og manual runneren er allerede implementert. Denne leveransen beviser det neste leddet i kjeden: at den faktiske NestJS sync-grensen kan startes mot den isolerte **AHA Staging**-databasen og utføre canonical bootstrap/push/pull med ekte JWT-verifisering og minst privilegert runtime-role.

## Ingen offentlig backenddeploy

Workflowen starter NestJS kun på GitHub Actions-runneren:

```text
http://127.0.0.1:3100
```

Det opprettes ingen offentlig URL, ingen Vercel/Render/Azure-deploy og ingen production runtime. Dette er derfor en reell hosted-database rehearsal uten at backend må eksponeres på internett.

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

## Staging-konfigurasjon

Eksisterende database-secrets gjenbrukes:

```text
AHA_STAGING_ADMIN_DATABASE_URL
AHA_STAGING_RUNTIME_DATABASE_URL
```

Rehearsalen trenger i tillegg staging-only secrets:

```text
AHA_STAGING_SYNC_BEARER_TOKEN
AHA_STAGING_AUDIT_HASH_SALT
```

`AHA_STAGING_SYNC_BEARER_TOKEN` skal være et gyldig, tidsbegrenset access token for en **dedikert staging testbruker**, ikke en vanlig bruker eller production-operatør.

Auth-kontrakten settes som GitHub Environment variables, ikke hardkodes i repoet:

```text
AHA_STAGING_AUTH_ISSUER
AHA_STAGING_AUTH_AUDIENCE
AHA_STAGING_AUTH_JWKS_URL
```

NestJS verifiserer tokenet med ekte remote JWKS, issuer og audience. Workflowen dekoder bare `sub` lokalt for å binde den dedikerte database-fixturen; tokenet logges eller persisteres aldri.

## Pinned database target

Begge DSN-er må fortsatt identifisere den repo-pinnede Supabase staging-refen:

```text
sstuzwppsheivczyqrim
```

Før noen grant eller fixture-write kjøres, kjører workflowen den eksisterende read-only hosted preflighten igjen. Dermed må TLS, riktig project-ref, separate admin/runtime-roller, `NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEDB`, `NOCREATEROLE`, `NOINHERIT`, null table ownership og null direkte canonical write-grants fortsatt være grønne.

## Runtime-grants

Canonical sync-migrasjonene gjør med vilje:

```text
REVOKE ALL ... FROM PUBLIC
```

og gir ikke runtime-rollen generell tilgang. Rehearsal-prepareringen aktiverer derfor bare disse tre top-level-funksjonene på staging-runtime-rollen:

```text
aha.bootstrap_sync_snapshot_v1(text,text,bigint,integer)
aha.pull_sync_changes_v1(text,bigint,integer)
aha.push_sync_change_v1(text,text,text,text,text,text,bigint,text,jsonb)
```

Ingen tabell-write-grants gis.

Disse interne helperne kontrolleres eksplisitt som utilgjengelige direkte for runtime-rollen:

```text
aha.sync_object_snapshot_v1(...)
aha.record_sync_conflict_v1(...)
aha.sync_apply_upsert_v1(...)
aha.sync_apply_delete_v1(...)
```

Top-level-funksjonene er `SECURITY DEFINER` og kan bruke helperne internt uten at runtime-rollen får en ny offentlig kommandooverflate.

## Dedikert canonical staging-identitet

JWT-identiteten mappes av canonical RLS gjennom:

```text
request.jwt.claims.sub
→ aha.current_auth_subject()
→ aha.current_auth_provider() = supabase
→ aha.current_profile_id()
```

Rehearsalen bruker faste, tydelig merkede fixture-ID-er:

```text
profile:   aha-staging-sync-e2e-profile-v1
workspace: aha-staging-sync-e2e-workspace-v1
```

Workspace er `personal`, `private` og eies av fixture-profilen. Eierforholdet gir edit-rank gjennom den eksisterende workspace-autorisasjonen.

Prepareringen er fail-closed:

- hvis bearer-tokenets `sub` allerede tilhører en annen canonical profil, stoppes kjøringen;
- hvis fixture-profilen allerede er bundet til et annet `sub`, stoppes kjøringen;
- hvis fixture-workspace tilhører en annen profil eller har feil scope/status, stoppes kjøringen.

Dermed kan en feilkopiert token ikke gjøre rehearsalen mot en vanlig brukers personlige workspace.

## NestJS staging runtime

NestJS startes med production-lik sikkerhetskonfigurasjon, men bare i Actions-jobben:

```text
NODE_ENV=production
AHA_DATABASE_ENABLED=true
AHA_DATABASE_SSL_MODE=verify-full
AHA_CANONICAL_SYNC_ENABLED=true
AHA_LOCAL_IMPORT_ENABLED=false
AHA_DATABASE_URL=<staging runtime DSN>
AHA_ALLOWED_ORIGINS=http://127.0.0.1:4173
```

Auth issuer/audience/JWKS og audit salt kommer fra staging Environment. Alle databasekall går gjennom `CanonicalDatabaseService`, som setter verified JWT claims transaksjonslokalt, tvinger `row_security=on` og avviser superuser/BYPASSRLS/table-owner runtime.

## Reell HTTP-matrise

`scripts/aha-canonical-sync-hosted-staging-e2e.cjs` kjører mot den lokale NestJS-prosessen, som igjen bruker ekte hosted staging PostgreSQL.

Sekvensen er:

1. vent på `/v1/health`;
2. bootstrap fixture-workspace og lås første `highWatermark`;
3. push en run-scoped `conversation` med `baseRevision=0` og canonical SHA-256;
4. send eksakt samme push/idempotency key på nytt og krev `idempotentReplay=true`;
5. pull fra bootstrap-watermark og krev den nye upsert-journalen;
6. send en ny payload med stale `baseRevision=0` og krev `stale_base_revision` uten overwrite;
7. send revision-aware `delete` med SHA-256 av canonical `null`;
8. pull fra upsert-cursor og krev tombstone med `payload=null`;
9. bootstrap på nytt og krev at det slettede objektet fortsatt representeres som tombstone.

Objekt-ID og idempotency keys inkluderer GitHub run-id/run-attempt, slik at parallelle eller senere rehearsals ikke kolliderer med tidligere fixture-objekter.

## Hva som kan stå igjen i staging

Selve testobjektet avsluttes som canonical tombstone. Journal, audit og idempotency data er en del av stagingbeviset og skal ikke skjult slettes etter en vellykket kjøring. Den faste fixture-profilen/workspace kan gjenbrukes av senere runs, mens hvert testobjekt er run-scoped.

Dette gjelder kun AHA Staging.

## Logging og hemmeligheter

Script/workflow har disse sperrene:

- ingen `set -x`;
- ingen `env`/`printenv`;
- ingen echo/printf av DSN eller bearer-token;
- API-feil summeres til HTTP status + error code/message;
- success-loggen viser bare run-scoped fixture-ID, cursors, revisions, counts og konflikttype;
- API-loggtail på feil redigerer DSN- og Bearer-lignende tekst.

## Hva denne porten beviser

En grønn run beviser:

```text
signed staging JWT
→ NestJS auth guard / JWKS
→ CanonicalDatabaseService
→ least-privilege PostgreSQL runtime role
→ top-level canonical sync functions
→ RLS-bound personal workspace
→ sync journal + idempotency + conflicts + tombstone
→ NestJS HTTP response
```

Den beviser ikke ennå den siste browser-klikkdelen fra `canonical-sync-staging.html`, fordi Actions-NestJS-prosessen bare er tilgjengelig på runnerens localhost.

## Hva den ikke aktiverer

- production database/sync flags;
- offentlig NestJS deployment;
- Home eller gammel Sync Hub execution;
- login-trigger eller background sync;
- `sync.html`;
- group/EchoNet/public sharing;
- automatisk konfliktmerge;
- browserwrites direkte til canonical tabeller.

## Neste port

Etter grønn hosted HTTP-rehearsal er neste tekniske port liten og tydelig: deploy samme NestJS-build til en **isolert, autentisert staging-origin** og kjør den allerede implementerte `canonical-sync-staging.html`-flaten i en ekte browser mot den. Først da er browser → NestJS → PostgreSQL → browser matrisen komplett.
