# Supabase / PostgreSQL for AHA-EchoNet

Repoet inneholder nå to tydelig adskilte databaselag:

1. dagens valgfrie Supabase-MVP i `public.aha_*`
2. det nye canonical schema-grunnlaget i `aha.*`

Ingen av de nye canonical migrasjonene er koblet til browserruntime, kontoimport eller sync ennå.

## Dagens aktive, valgfrie MVP-lag

For eksisterende Supabase-funksjoner brukes fortsatt:

```text
supabase/schema.sql
supabase/policies.sql
supabase/chamber.sql
supabase/embeddings.sql
```

`supabase/schema.sql` oppretter blant annet:

- `aha_profiles`
- `aha_source_events`
- `aha_notes`
- `aha_gallery_items`
- `aha_feed_posts`
- `aha_insta_posts`
- `aha_imports`

For semantisk søk:

- `supabase/embeddings.sql` oppretter `aha_insight_embeddings`, pgvector og RPC-en `aha_match_insights`.

For dagens valgfrie chamber-sync:

- `supabase/chamber.sql` oppretter `aha_insight_chambers`, én JSONB-rad per profil.

### Installere dagens MVP-schema

1. Åpne Supabase-prosjektet.
2. Kjør `supabase/schema.sql`.
3. Kjør `supabase/policies.sql`.
4. Kjør valgfritt `supabase/embeddings.sql`.
5. Kjør valgfritt `supabase/chamber.sql`.

Dagens enkle policygrunnlag er:

```text
Supabase auth user id = aha_profiles.id
Alle AHA-rader må ha profile_id = auth.uid()
```

Frontend kan bruke dette laget bare når Supabase er konfigurert, brukeren er innlogget og den enkelte modulen har eksplisitt database-sync aktivert. LocalStorage fortsetter ellers å fungere.

## Canonical PostgreSQL Schema v1

Den planlagte flerbruker- og synkmodellen ligger som seks additive migrasjoner:

```text
supabase/migrations/20260814215000_aha_identity_workspaces_v1.sql
supabase/migrations/20260814215100_aha_conversations_sources_v1.sql
supabase/migrations/20260814215200_aha_analysis_insights_v1.sql
supabase/migrations/20260814215300_aha_artifacts_v1.sql
supabase/migrations/20260814215400_aha_governance_v1.sql
supabase/migrations/20260814215500_aha_schema_guards_v1.sql
```

De oppretter et separat schema:

```text
aha.*
```

Canonical v1 normaliserer:

- identitet, enheter, arbeidsrom, medlemskap og roller
- samtaler, deltakere, meldinger, source events og vedlegg
- analysekjøringer, påstander og kildebelegg
- innsikter, versjoner, relasjoner, feedback og minnelivssyklus
- begrepslister, stier, artikler og publisering
- samtykke, deling, import, sync cursors, audit, outbox og AI-jobber

Migrasjonene:

- endrer ikke `public.aha_*` eller `public.music_*`
- aktiverer ingen frontend eller sync
- oppretter ingen brukerpolicyer eller frontendgrants
- aktiverer RLS fail-closed på domenetabellene
- registrerer `runtime_activated: false` i schema-kvitteringen

Les først:

- `supabase/migrations/README.md`
- `docs/AHA_CANONICAL_POSTGRESQL_SCHEMA_V1.md`
- `docs/AHA_LOCAL_TO_CANONICAL_MAPPING_V1.md`
- `docs/adr/README.md`

Canonical migrasjoner skal foreløpig bare kjøres i en kontrollert utviklings- eller stagingdatabase. Neste leveranse er tenancy-, RLS- og samtykkekontrakten. Browserruntime skal ikke kobles til `aha.*` før denne og de øvrige aktiveringsportene er grønne.

## Frontend-konfig for dagens MVP

Frontend leser:

```js
window.AHA_SUPABASE_URL
window.AHA_SUPABASE_PUBLISHABLE_KEY
```

For lokal test kan `ahaConfig.example.js` kopieres til `ahaConfig.local.js`. `ahaConfig.local.js` skal ikke committes.

## Hemmeligheter

Ikke legg databasepassord, service-role keys, API-nøkler eller andre serverhemmeligheter i frontend eller repoet. Canonical backend skal senere bruke server-side identitet, least privilege og et eksplisitt secrets-lager.
