# Supabase for AHA-EchoNet

Dette er første database-lag for AHA-EchoNet.

## Kjør schema

1. Åpne Supabase-prosjektet.
2. Gå til SQL Editor.
3. Lim inn innholdet fra `supabase/schema.sql`.
4. Kjør SQL-en.

Schemaet oppretter tabeller for:

- `aha_profiles`
- `aha_source_events`
- `aha_notes`
- `aha_gallery_items`
- `aha_feed_posts`
- `aha_insta_posts`
- `aha_imports`

## Kjør policies

Etter at tabellene finnes:

1. Åpne SQL Editor.
2. Lim inn innholdet fra `supabase/policies.sql`.
3. Kjør SQL-en.

Policy-modellen i denne første versjonen er enkel:

```text
Supabase auth user id = aha_profiles.id
Alle AHA-rader må ha profile_id = auth.uid()
```

## RLS

Row Level Security er aktivert på alle tabeller.

Frontend kan skrive til Supabase først når bruker er innlogget med Supabase Auth og policyene er kjørt. LocalStorage fortsetter å fungere uansett.

## Frontend-konfig

Frontend leser:

```js
window.AHA_SUPABASE_URL
window.AHA_SUPABASE_PUBLISHABLE_KEY
```

For lokal test kan du kopiere `ahaConfig.example.js` til `ahaConfig.local.js`, men `ahaConfig.local.js` skal ikke committes.

## Viktig

Ikke legg databasepassord, service role keys eller andre serverhemmeligheter i frontend eller i repoet.
