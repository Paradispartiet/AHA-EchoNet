# AHA Database

AHA-EchoNet har et valgfritt Supabase/Postgres-lag.

Database-laget er et tillegg til localStorage-MVP-en:

```text
localStorage fungerer alltid
Supabase brukes hvis konfigurert og bruker er innlogget
appen skal ikke krasje hvis Supabase mangler
```

## Filer

```text
ahaDb.js
= bootstrap for Supabase-klient

ahaAuth.js
= Supabase Auth-bro og auth-ready event

ahaRepository.js
= felles repository-lag for database-save og database-read

supabase/schema.sql
= tabeller

supabase/policies.sql
= RLS policies

supabase/README.md
= hvordan schema og policies kjøres

ahaConfig.js
= runtime-konfig

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

## Modulflyt ved lagring

```text
Notes/Galleri/Feed/Insta/History Go-import
→ localStorage-save
→ AHARepository forsøker Supabase-save
→ AHAIngest sender tekstlig materiale til eksisterende AHA-motor
```

## Modulflyt ved innlogging / sync

```text
AHAAuth sender aha:auth-ready
→ modulen pusher lokale elementer til Supabase med upsert
→ modulen leser samme tabell tilbake fra Supabase
→ localStorage oppdateres som cache
→ UI rendres fra oppdatert datasett
```

Denne regelen hindrer at lokale data forsvinner ved innlogging, samtidig som Supabase blir sann kilde når bruker er innlogget.

## Repository-read

`ahaRepository.js` har read-funksjoner for:

```text
loadSourceEvents()
loadNotes()
loadGalleryItems()
loadFeedPosts()
loadInstaPosts()
loadImports()
loadDashboardCounts()
```

## Ikke gjort ennå

```text
- database-read for selve innsiktskammeret
- filopplasting
- Supabase Storage
- bilde-/videoanalyse
- sanntids/live sync
```
