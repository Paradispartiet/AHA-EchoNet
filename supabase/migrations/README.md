# AHA ordered PostgreSQL migrations

Denne katalogen inneholder de ordnede, additive migrasjonene for det nye canonical `aha`-schemaet.

## Viktig status

Migrasjonene er foreløpig **schema-, policy- og testgrunnlag**. De aktiverer ikke frontend, kontoimport, sync, EchoNet, Hasura, NestJS, LangGraph, Milvus eller Azure. De endrer heller ikke eksisterende `public.aha_*`- eller `public.music_*`-tabeller.

## Rekkefølge

Kjør migrasjonene sortert etter filnavn:

1. identity/workspaces
2. conversations/sources
3. analysis/insights
4. artifacts
5. governance
6. indexes/revision triggers/fail-closed RLS/schema receipt
7. tenancy/read policies/exact consent enforcement

Hver fil er en separat transaksjon. Kjør hele settet i en ren utviklings- eller stagingdatabase før andre miljøer vurderes.

## Sikkerhetsgrense

- `aha`-schemaet er revoked fra `public`.
- RLS er aktivert fail-closed på domenetabellene.
- Schema v1 oppretter ingen policyer eller grants.
- Tenancy/RLS/consent v1 oppretter 36 `FOR SELECT`-policyer, men ingen direkte write-policyer.
- Tenancy/RLS/consent v1 oppretter heller ingen table grants eller function grants.
- Policy helper-funksjonenes standard-`EXECUTE` er trukket tilbake fra `PUBLIC`.
- Audit, idempotency og outbox har ingen direkte SELECT-policy.
- Account import, workspace sharing og offentlig publisering har eksakte consent scopes og database-triggerkontroll.
- `local_only` er en import-/sync-avvisningsstatus og lagres ikke som en vanlig canonical cloudrad.

Policyene er derfor fremdeles inaktive for klientroller. En senere NestJS-leveranse må etablere en dedikert non-owner/no-`BYPASSRLS` runtime-rolle og gi bare de minste nødvendige rettighetene.

Les:

```text
docs/AHA_CANONICAL_POSTGRESQL_SCHEMA_V1.md
docs/AHA_LOCAL_TO_CANONICAL_MAPPING_V1.md
docs/AHA_TENANCY_RLS_CONSENT_V1.md
docs/AHA_TENANCY_RLS_CONSENT_MATRIX_V1.json
```

## Legacy

Dagens Supabase MVP-filer gjelder fortsatt for aktiv runtime:

```text
supabase/schema.sql
supabase/policies.sql
supabase/chamber.sql
supabase/embeddings.sql
```

Ikke koble browserruntime til `aha.*` før policyene er kjørt i staging, JWT-konteksten og cross-tenant-matrisen er testet, og den eksplisitte aktiveringsporten er oppfylt.
