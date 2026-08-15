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

## Kontroller

Preflighten krever:

1. begge DSN-er er konfigurert;
2. eksakt manuell confirmation;
3. repoet har en gyldig, eksplisitt pinnet Supabase staging project-ref;
4. både admin- og runtime-DSN identifiserer akkurat denne project-refen;
5. begge tilkoblinger bruker TLS;
6. admin og runtime peker på samme database;
7. admin- og runtime-role er forskjellige;
8. PostgreSQL er minst versjon 15;
9. runtime-role er ikke superuser;
10. runtime-role har ikke `BYPASSRLS`;
11. runtime-role har ikke `CREATEDB` eller `CREATEROLE`;
12. runtime-role har `NOINHERIT`;
13. runtime-role eier ingen canonical `aha`-tabeller;
14. runtime-role har ingen direkte `INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER` på `aha.*`;
15. hvis canonical schema finnes, må runtime-role kunne kjøre den eksplisitte local-import-kommandoen og ikke den interne receipt-helperen.

## Hosted rehearsal-status

Den isolerte `AHA Staging`-databasen er allerede brukt til en direkte hosted rehearsal via Supabase-administrasjonskoblingen:

- 39/39 canonical tabeller med RLS;
- 36 read-policyer;
- ingen `PUBLIC EXECUTE` på canonical SECURITY DEFINER-funksjoner;
- to isolerte tenants;
- første import + idempotent retry;
- cross-tenant ID-kollisjon med full rollback;
- testfixtures og rehearsal-role ryddet bort etter verifikasjon;
- Supabase Security Advisor uten canonical WARN etter search-path-hardening;
- Supabase Performance Advisor uten `unindexed_foreign_keys` etter FK-index-hardening.

Dette er stagingbevis, ikke produksjonsaktivering.

## Hva en grønn preflight betyr

En grønn kjøring betyr at de lagrede GitHub-staging-DSN-ene treffer riktig Supabase-prosjekt over TLS og at runtime-rollen har forventet minst privilegium. Den betyr ikke at frontendimport, automatisk sync, EchoNet eller produksjonsbackend er aktivert.

## Neste port

Etter hosted database-rehearsal går backend-roadmapen videre til **IndexedDB outbox + eksplisitt bidirectional sync**, fortsatt bak fail-closed runtime-flagg. Hosted preflight skal forbli en separat manuell sikkerhetsport.
