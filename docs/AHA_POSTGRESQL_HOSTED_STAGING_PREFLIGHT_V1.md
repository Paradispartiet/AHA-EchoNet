# AHA PostgreSQL Hosted Staging Preflight v1

Status: **manuell, read-only og fail-closed — ingen migrasjon eller produksjonsaktivering**

Denne porten kommer etter den automatiske ephemeral PostgreSQL-rehearsalen. Den kontrollerer en faktisk hostet Supabase/PostgreSQL-stagingdatabase uten å skrive data eller kjøre migrasjoner.

## Hosted staging-mål

Den aktive isolerte staginginstansen er Supabase-prosjektet **AHA Staging**. Repoet pinner den ikke-hemmelige Supabase project-refen:

```text
sstuzwppsheivczyqrim
```

Dette er en eksplisitt deploy-target-identitet, ikke en credential. En endring av stagingprosjekt krever derfor en reviewbar repoendring.

## Hvorfor project-ref og ikke custom database-GUC

Den første preflightkontrakten brukte `ALTER DATABASE ... SET "aha.environment"` og en hemmelig fingerprint. Hosted rehearsal på Supabase viste at managed Postgres nekter å sette slike custom databaseparametere.

Preflighten bruker derfor Supabases faktiske tilkoblingsidentitet:

- direkte DSN må peke på `db.<project-ref>.supabase.co`;
- pooler-DSN må peke på en Supabase pooler-host og ha brukernavn bundet til samme project-ref;
- både admin- og runtime-DSN må matche den repo-pinnede staging-refen.

En feilkopiert produksjons-DSN med en annen Supabase project-ref avvises før noen videre databasekontroll.

## GitHub Environment

Workflowen bruker miljøet:

```text
aha-postgresql-staging
```

Miljøet trenger to secrets:

```text
AHA_STAGING_ADMIN_DATABASE_URL
AHA_STAGING_RUNTIME_DATABASE_URL
```

DSN-ene skal bruke forskjellige roller mot samme stagingdatabase:

- admin-DSN: kontrollert schema-/stagingadministrasjon;
- runtime-DSN: minst privilegert NestJS-runtime-role.

Ingen DSN, host eller runtime-brukernavn skal skrives i workflow-logg.

## Workflow

```text
.github/workflows/aha-postgresql-hosted-staging-preflight.yml
```

Den har bare `workflow_dispatch`. Det finnes ingen `push`, `pull_request`, `schedule` eller automatisk aktivering.

Kjøringen krever den eksakte manuelle teksten:

```text
RUN_AHA_HOSTED_STAGING_PREFLIGHT
```

## Read-only teknisk sperre

Alle `psql`-kall kjøres med:

```text
PGOPTIONS='-c default_transaction_read_only=on ...'
```

Preflighten kjører ikke schema- eller datawrites mot hosted database og bruker ikke `psql -f`.

## TLS-verifikasjon mot direct og Supabase pooler

Preflighten måler TLS fra **client-siden**. Det er viktig for Supabase Session pooler: en server-side `pg_stat_ssl`-rad beskriver forbindelsen fra pooleren videre mot Postgres, ikke nødvendigvis TLS-forbindelsen mellom GitHub-runneren og pooler-endepunktet. Den kan derfor rapportere `false` selv når klientforbindelsen faktisk er TLS-beskyttet.

AHA tvinger derfor libpq/`psql` til:

```text
PGSSLMODE=verify-full
PGSSLROOTCERT=/etc/ssl/certs/ca-certificates.crt
```

og bekrefter den etablerte client-TLS-sesjonen med `\conninfo`. Dermed verifiseres både kryptering, sertifikatkjede og hostname uten å logge DSN, host eller brukernavn.

## Runtime-role: NOINHERIT er ikke nok

En login-role kan være `NOINHERIT` og samtidig være medlem av en privilegert rolle som den kan gå inn i med `SET ROLE`. Derfor er det ikke tilstrekkelig å bare kontrollere runtime-rollens egne `rolsuper`/`rolbypassrls`-flagg.

AHA bruker en versjonskompatibel og konservativ regel for PostgreSQL 15+:

```text
runtime-role må ha null medlemskap i andre roller med SUPERUSER eller BYPASSRLS
```

Preflighten bruker `pg_has_role(current_user, privileged_role, 'member')`. På PostgreSQL 15 tilsvarer medlemskap retten til `SET ROLE`. Nyere PostgreSQL har finere `SET`-opsjoner, men AHA beholder den strengere medlemskapsregelen som fail-closed least-privilege-policy. En runtime-identitet som er knyttet til en BYPASSRLS-rolle skal ikke brukes selv om den aktuelle membershipen en dag er konfigurert med svakere arv/SET-semantikk.

Dette er særlig relevant i Supabase: den innebygde `authenticator`-rollen er en PostgREST-infrastrukturrolle som er laget for rollebytte etter JWT. Den er derfor ikke en generell NestJS application runtime-role for AHA.

## Kontroller

Preflighten krever:

1. begge DSN-er er konfigurert;
2. eksakt manuell confirmation;
3. repoet har en gyldig, eksplisitt pinnet Supabase staging project-ref;
4. både admin- og runtime-DSN identifiserer akkurat denne project-refen;
5. begge client-tilkoblinger bruker TLS med `verify-full` sertifikat- og hostname-verifikasjon;
6. admin og runtime peker på samme database;
7. admin- og runtime-role er forskjellige;
8. PostgreSQL er minst versjon 15;
9. runtime-role er ikke superuser;
10. runtime-role har ikke `BYPASSRLS`;
11. runtime-role har ikke `CREATEDB` eller `CREATEROLE`;
12. runtime-role har `NOINHERIT`;
13. runtime-role er ikke medlem av noen annen rolle med `SUPERUSER` eller `BYPASSRLS`;
14. runtime-role eier ingen canonical `aha`-tabeller;
15. runtime-role har ingen direkte `INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER` på `aha.*`;
16. hvis canonical schema finnes, må runtime-role kunne kjøre den eksplisitte local-import-kommandoen og ikke den interne receipt-helperen.

NestJS gjør den samme medlemskapskontrollen inne i `CanonicalDatabaseService` før repository-kode får kjøre. Hosted preflight og runtime-sjekk skal derfor feile på samme privilegieklasse.

## Hosted rehearsal-status

Den isolerte `AHA Staging`-databasen er brukt til direkte canonical hosted rehearsals via Supabase-administrasjonskoblingen:

- canonical schema med RLS;
- tenant-isolasjon;
- import/idempotency/conflict-rehearsal;
- ingen `PUBLIC EXECUTE` på canonical SECURITY DEFINER-funksjoner;
- Supabase Security/Performance Advisor-gjennomganger.

En tidligere rehearsal-role ble ryddet bort etter verifikasjon. Dette historiske stagingbeviset betyr derfor ikke at en egnet persistent NestJS runtime-role finnes i databasen i dag; den må alltid bevises på nytt av denne preflighten.

## Hva en grønn preflight betyr

En grønn kjøring betyr at de lagrede GitHub-staging-DSN-ene treffer riktig Supabase-prosjekt over verifisert client-TLS og at runtime-rollen har forventet minst privilegium, **inkludert null privilegie-eskalering via role membership**. Den betyr ikke at frontendimport, automatisk sync, EchoNet eller produksjonsbackend er aktivert.

Hosted preflighten aktiverer heller ikke browserlagets `IndexedDB outbox`; outbox, cursors og tombstones forblir en separat, eksplisitt frontend-sync-grense.

## Neste port

Hosted preflight forblir en separat manuell sikkerhetsport foran enhver staging-runtime- eller canonical sync-aktivering. En rolle som feiler medlemskapskontrollen skal erstattes av en egen minst-privilegert AHA runtime-identitet; kontrollen skal ikke svekkes for å få staging grønn.
