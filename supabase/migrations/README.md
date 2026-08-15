# AHA ordered PostgreSQL migrations

Denne katalogen inneholder de ordnede, additive migrasjonene for det nye canonical `aha`-schemaet.

## Viktig status

Migrasjonene er fortsatt **ikke produksjonsaktivert**, men de har nå en automatisk ren PostgreSQL 16-integrasjonsport. Porten installerer hele canonical migrasjonssettet fra null og kjører local-account-importen med en separat non-owner/no-`BYPASSRLS` runtime-rolle.

Dette aktiverer ikke frontend, automatisk kontoimport, sync, EchoNet, Hasura, LangGraph, Milvus eller Azure. Det endrer heller ikke eksisterende `public.aha_*`- eller `public.music_*`-tabeller.

## Rekkefølge

Kjør alle timestampede `.sql`-filer sortert etter filnavn. Dagens canonical rekkefølge er:

1. identity/workspaces
2. conversations/sources
3. analysis/insights
4. artifacts
5. governance
6. indexes/revision triggers/fail-closed RLS/schema receipt
7. tenancy/read policies/exact consent enforcement
8. privacy-first local account import
9. locked-search-path SHA-256 guard

Hver fil er en separat transaksjon.

## Automatisk PostgreSQL 16-rehearsal

Workflow:

```text
.github/workflows/aha-postgresql-staging-rehearsal.yml
```

Den kjører mot en tom ephemeral `postgres:16`-database og beviser blant annet:

- full installasjon av migrasjonssettet fra null;
- separat runtime-rolle med `NOSUPERUSER`, `NOBYPASSRLS` og `NOINHERIT`;
- ingen direkte canonical INSERT/UPDATE/DELETE-rettigheter;
- eksplisitt `EXECUTE` på local-import-kommandoen, men ikke intern import-helper;
- RLS-isolasjon mellom to test-tenants;
- idempotent import-retry;
- atomisk rollback ved cross-workspace ID-kollisjon;
- exact account-import consent og per-object receipts.

Detaljer:

```text
docs/AHA_POSTGRESQL_STAGING_REHEARSAL_V1.md
```

Dette er en CI-integrasjonsport, ikke en erstatning for hosted Supabase/PostgreSQL staging med reell TLS-, rolle- og poolkonfigurasjon.

## Sikkerhetsgrense

- `aha`-schemaet er revoked fra `public`.
- RLS er aktivert fail-closed på domenetabellene.
- Tenancy/RLS/consent v1 oppretter 36 `FOR SELECT`-policyer, men ingen direkte write-policyer.
- Policy helper-funksjonenes standard-`EXECUTE` er trukket tilbake fra `PUBLIC`.
- Audit, idempotency og outbox har ingen direkte SELECT-policy.
- Account import, workspace sharing og offentlig publisering har eksakte consent scopes og database-triggerkontroll.
- `local_only` er en import-/sync-avvisningsstatus og lagres ikke som en vanlig canonical cloudrad.
- Local-import-kommandoen er `SECURITY DEFINER`, har låst `search_path` og er revoked fra `PUBLIC`.

En hosted runtime-rolle skal være dedikert, non-owner og uten `BYPASSRLS`, og bare få de minimale SELECT-/helper-rettighetene og eksplisitte command-`EXECUTE` som den konkrete NestJS-grensen trenger.

Les:

```text
docs/AHA_CANONICAL_POSTGRESQL_SCHEMA_V1.md
docs/AHA_LOCAL_TO_CANONICAL_MAPPING_V1.md
docs/AHA_TENANCY_RLS_CONSENT_V1.md
docs/AHA_TENANCY_RLS_CONSENT_MATRIX_V1.json
docs/AHA_LOCAL_IMPORT_POSTGRESQL_V1.md
docs/AHA_POSTGRESQL_STAGING_REHEARSAL_V1.md
```

## Legacy

Dagens Supabase MVP-filer gjelder fortsatt for aktiv runtime:

```text
supabase/schema.sql
supabase/policies.sql
supabase/chamber.sql
supabase/embeddings.sql
```

Ikke koble browserruntime til `aha.*` før hosted staging, ekte runtime-role/grants, import-rehearsal, eksport/restore og den eksplisitte aktiveringsporten er oppfylt.
