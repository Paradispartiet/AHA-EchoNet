# AHA Database

AHA-EchoNet har nå et valgfritt Supabase/Postgres-lag.

Database-laget er et tillegg til localStorage-MVP-en:

```text
localStorage fungerer alltid
Supabase brukes hvis konfigurert
appen skal ikke krasje hvis Supabase mangler
```

## Filer

```text
ahaDb.js
= bootstrap for Supabase-klient

ahaRepository.js
= felles repository-lag for database-save

supabase/schema.sql
= tabeller

supabase/README.md
= hvordan schema kjøres

ahaConfig.js
= tom runtime-konfig / placeholder

ahaConfig.example.js
= eksempel for lokal konfig
```

## Runtime-konfig

Frontend leser disse globale verdiene:

```js
window.AHA_SUPABASE_URL
window.AHA_SUPABASE_PUBLISHABLE_KEY
```

Hvis disse mangler, returnerer `AHADb.isConfigured()` false og appen bruker localStorage videre.

## Tabeller

```text
aha_profiles
aha_source_events
aha_notes
aha_gallery_items
aha_feed_posts
aha_insta_posts
aha_imports
```

## Modulflyt

```text
Notes/Galleri/Feed/Insta/History Go-import
→ localStorage-save
→ AHARepository forsøker Supabase-save
→ AHAIngest sender tekstlig materiale til eksisterende AHA-motor
```

## Ikke gjort ennå

```text
- auth
- bruker/profilkobling
- database-read tilbake til UI
- filopplasting
- Supabase Storage
- bilde-/videoanalyse
- live sync mellom enheter
```
