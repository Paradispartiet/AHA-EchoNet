# AHA ordered PostgreSQL migrations

Denne katalogen inneholder de ordnede, additive migrasjonene for det nye canonical `aha`-schemaet.

## Viktig status

Migrasjonene er foreløpig **schema- og testgrunnlag**. De aktiverer ikke frontend, sync, EchoNet, Hasura, NestJS, LangGraph, Milvus eller Azure. De endrer heller ikke eksisterende `public.aha_*`- eller `public.music_*`-tabeller.

## Rekkefølge

Kjør migrasjonene sortert etter filnavn:

1. identity/workspaces
2. conversations/sources
3. analysis/insights
4. artifacts
5. governance
6. indexes/triggers/RLS/schema receipt

Hver fil er en separat transaksjon. Kjør hele settet i en ren utviklings- eller stagingdatabase før andre miljøer vurderes.

## Sikkerhetsgrense

- `aha`-schemaet er revoked fra `public`.
- RLS aktiveres fail-closed på domenetabellene.
- Det opprettes ingen brukerpolicyer eller frontendgrants i schema v1.
- PR 3 skal levere og teste tenancy-, RLS- og samtykkematrisen.
- `local_only` er en import-/sync-avvisningsstatus og lagres ikke som en vanlig canonical cloudrad.

## Legacy

Dagens Supabase MVP-filer gjelder fortsatt for aktiv runtime:

```text
supabase/schema.sql
supabase/policies.sql
supabase/chamber.sql
supabase/embeddings.sql
```

Ikke koble browserruntime til de nye migrasjonene før aktiveringsporten i `docs/AHA_CANONICAL_POSTGRESQL_SCHEMA_V1.md` er oppfylt.
