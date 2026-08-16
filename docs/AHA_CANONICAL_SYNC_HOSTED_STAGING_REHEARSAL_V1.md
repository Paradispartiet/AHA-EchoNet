# AHA Canonical Sync Hosted Staging Rehearsal v1

Status: **manuell staging-only HTTP → NestJS → hosted PostgreSQL rehearsal; ingen production activation**.

Denne porten kommer etter `AHA_CANONICAL_SYNC_STAGING_ACTIVATION_V1`. Browserflaten og manual runneren er allerede implementert. Her beviser vi neste ledd: den faktiske NestJS sync-grensen mot den isolerte **AHA Staging**-databasen, med signaturverifisert JWT, RLS og en run-scoped minst privilegert runtime-role.

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

## Bare ett eksisterende database-secret + ett CA trust anchor

Rehearsalen trenger fortsatt bare **ett eksisterende database-secret** som faktisk er en credential:

```text
AHA_STAGING_ADMIN_DATABASE_URL
```

I tillegg trenger workflowen Supabases offentlige Server root certificate som trust anchor:

```text
AHA_STAGING_DATABASE_CA_CERT
```

CA-sertifikatet hentes manuelt fra **AHA Staging → Database Settings → SSL Configuration** og legges i GitHub Environment. Det er ikke et passord, men legges i samme beskyttede miljø slik at workflowen ikke er avhengig av et eksternt nedlastingsendepunkt eller en system-CA som ikke stoler på Supabases database-CA.

`scripts/aha-postgresql-materialize-ca.sh` skriver sertifikatet til en runner-lokal fil, validerer det som X.509 og eksporterer:

```text
AHA_POSTGRES_SSL_ROOT_CERT=<runner-lokal cert-fil>
NODE_EXTRA_CA_CERTS=<samme cert-fil>
```

Dermed bruker både libpq/`psql` og Node/NestJS den samme eksplisitte trust anchoret, mens `verify-full` beholdes.

Den lagrede `AHA_STAGING_RUNTIME_DATABASE_URL` brukes ikke av canonical sync-rehearsalen. Dette er bevisst: direkte inspeksjon av AHA Staging viste at det ikke finnes noen persistent LOGIN-role som tilfredsstiller den herdede AHA-definisjonen for canonical runtime, og Supabases innebygde infrastrukturroller skal ikke lånes som NestJS-runtime.

I stedet oppretter hver workflow-run en egen rolle:

```text
aha_sync_e2e_<github_run_id>_<run_attempt>
```

Rollen får et tilfeldig 64-heks-tegns passord, og runtime-DSN-en bygges fra den allerede validerte admin-targeten. Direkte Supabase-tilkobling bruker rollen som databasebruker; Supavisor/pooler bruker `<rolle>.<project-ref>`.

Det genererte passordet og runtime-DSN-en maskeres umiddelbart og legges bare i runnerens `GITHUB_ENV`. De lagres ikke som GitHub secrets, artifacts eller repo-data.

## Ephemeral runtime-role

Lifecycle-script:

```text
scripts/aha-canonical-sync-hosted-staging-runtime-role.sh
```

Rollen opprettes eksplisitt som:

```text
LOGIN
NOSUPERUSER
NOBYPASSRLS
NOCREATEDB
NOCREATEROLE
NOINHERIT
CONNECTION LIMIT 4
```

Den får ingen role memberships. Etter opprettelse må scriptet bevise:

- korrekt intrinsic privilege-shape;
- null medlemskap i andre `SUPERUSER`/`BYPASSRLS`-roller;
- null direkte canonical table-write-grants;
- `USAGE` på `aha`-schema;
- `EXECUTE` på den allerede etablerte top-level `aha.commit_local_import_v1(...)`-kommandoen;
- ingen direkte `EXECUTE` på intern `aha.record_local_import_item_v1(...)`.

Alle lifecycle-kall mot admin-databasen bruker `PGSSLMODE=verify-full` og den materialiserte Supabase-CA-en. Dette gjør at den eksisterende read-only hosted PostgreSQL-preflighten kan kjøres mot akkurat den nyopprettede rollen før sync-grants gis.

Ved `always()`-cleanup skjer denne rekkefølgen:

```text
stopp NestJS/JWKS
→ terminate eventuelle connections for run-rollen
→ verifiser fortsatt minst-privilegert rolleform
→ verifiser null privilegerte role memberships
→ verifiser at rollen ikke eier databaseobjekter
→ REVOKE nøyaktig de fire tillatte function-grantene
→ REVOKE USAGE ON SCHEMA aha
→ DROP ROLE aha_sync_e2e_...
```

**`DROP OWNED` brukes med vilje ikke.** Cleanup skal ikke skjule privilege- eller ownership-drift ved å slette ukjente avhengigheter. Hvis noen har gitt run-rollen en ny ukjent rettighet eller latt den eie et objekt, skal eksplisitt `DROP ROLE` feile og gjøre avviket synlig i rehearsalen.

Cleanup sjekker nå også om run-role metadata faktisk finnes før den krever databaseforbindelse. En feil før rolleopprettelse gir derfor en ren no-op cleanup i stedet for en sekundær feil. Hvis rollen finnes, forblir cleanup fail-closed og nekter å droppe en rolle utenfor det beskyttede `aha_sync_e2e_<digits>_<digits>`-navnerommet, en rolle med endret privilegieform eller en rolle som har fått medlemskap i en privilegert rolle.

Dermed trenger rehearsalen ikke en langlivet databasecredential. En senere offentlig staging-API må fortsatt få sin egen persistent, dedikert AHA runtime-identitet; Actions-fixturen er ikke den produksjonsmodellen.

## Ephemeral auth-fixture

Auth-fixturen er også selvforsynt og ephemeral:

```text
scripts/aha-canonical-sync-hosted-staging-auth-fixture.cjs
```

På hver workflow-run:

1. genereres et nytt 2048-bit RSA-nøkkelpar;
2. public key eksponeres som JWKS kun på `127.0.0.1:3210`;
3. en RS256-JWT signeres med unik `kid`;
4. tokenet får fast, dedikert fixture-`sub`, korrekt lokal issuer/audience og 15 minutters levetid;
5. token/JWKS-path legges i runnerens `GITHUB_ENV`, ikke i repo eller workflow-logg;
6. private key beholdes bare i minnet til generatorprosessen.

NestJS verifiserer fortsatt kryptografisk signatur, `kid`, issuer og audience gjennom ordinær JOSE/JWKS-kjede.

## Pinned database target og TLS

Admin-DSN-en må identifisere den repo-pinnede Supabase staging-refen:

```text
sstuzwppsheivczyqrim
```

Den genererte runtime-DSN-en arver samme database/host/query-parametere og endrer bare credentials til den nye AHA-runner-rollen.

Etter rolleopprettelsen kjøres den eksisterende read-only hosted preflighten igjen. Den beviser TLS fra **client-siden** med `verify-full`, eksplisitt Supabase Server root certificate og hostname-verifikasjon. Dette er viktig når Session pooler brukes, fordi `pg_stat_ssl` på PostgreSQL-siden beskriver pooler→Postgres-hoppet og ikke nødvendigvis GitHub-runner→pooler-hoppet.

Project-ref, separate admin/runtime-roller, `NOSUPERUSER`, `NOBYPASSRLS`, `NOCREATEDB`, `NOCREATEROLE`, `NOINHERIT`, null privilegerte role memberships, null table ownership og null direkte canonical write-grants må alle være grønne.

## Sync-grants

Først etter grønn read-only preflight gir `aha-canonical-sync-hosted-staging-prepare.sh` run-rollen `EXECUTE` på tre top-level-funksjoner:

```text
aha.bootstrap_sync_snapshot_v1(text,text,bigint,integer)
aha.pull_sync_changes_v1(text,bigint,integer)
aha.push_sync_change_v1(text,text,text,text,text,text,bigint,text,jsonb)
```

Prepareringen bruker også `verify-full` med samme Supabase-CA. Ingen canonical tabell-write-grants gis. Følgende interne helpers testes eksplisitt som direkte utilgjengelige:

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
AHA_DATABASE_URL=<ephemeral staging runtime DSN>
NODE_EXTRA_CA_CERTS=<materialisert Supabase Server root certificate>
AHA_ALLOWED_ORIGINS=http://127.0.0.1:4173
AHA_AUTH_ISSUER=http://127.0.0.1:3210
AHA_AUTH_JWKS_URL=http://127.0.0.1:3210/.well-known/jwks.json
```

`NODE_ENV=development` brukes kun fordi auth-fixturens JWKS-server er localhost HTTP. Databaseforbindelsen er fortsatt eksplisitt `verify-full`, og Node-prosessen får Supabase-CA-en før den startes. `CanonicalDatabaseService` krever i tillegg at runtime-rollen ikke selv har eller gjennom medlemskap kan nå `SUPERUSER`/`BYPASSRLS`, tvinger `row_security=on` og avviser table-owner-path.

Audit-saltet i denne isolerte rehearsalen er en tydelig testkonstant, ikke en production-secret.

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

Selve `aha_sync_e2e_...`-runtime-rollen slettes alltid etter kjøringen når cleanup-kontrakten er intakt. Hvis cleanup finner privilege/ownership-drift, skal den feile synlig i stedet for å fjerne beviset med en bred oppryddingskommando.

## Logging og hemmeligheter

Workflow/scripts har disse sperrene:

- ingen `set -x`;
- ingen `env`/`printenv`;
- admin-DSN er GitHub secret;
- Supabase-CA er trust anchor og materialiseres bare til runnerens temp-område;
- generert password og runtime-DSN maskeres før senere steg;
- ingen echo/printf av bearer-token;
- ephemeral JWT skrives bare til `GITHUB_ENV`;
- success-logg viser ikke role name, databasebruker, auth subject eller credentials;
- API-loggtail på feil redigerer DSN- og Bearer-lignende tekst.

## Hva en grønn run beviser

```text
ephemeral signed JWT
→ NestJS JOSE / JWKS / issuer / audience verification
→ hostname- og CA-verifisert TLS til Supabase
→ hardened CanonicalDatabaseService
→ ephemeral dedicated least-privilege PostgreSQL LOGIN role
→ top-level canonical sync functions
→ RLS-bound personal workspace
→ sync journal + idempotency + conflicts + tombstone
→ NestJS HTTP response
→ eksplisitt, fail-closed runtime-role cleanup
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

Etter grønn hosted HTTP-rehearsal er neste tekniske port liten: deploy samme NestJS-build til en isolert autentisert staging-origin med en egen persistent, dedikert AHA runtime-role og kjør den allerede implementerte `canonical-sync-staging.html`-flaten i en ekte browser. Først da er browser → NestJS → PostgreSQL → browser matrisen komplett.
