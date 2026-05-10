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

ahaChamberSync.js
= toveis sync av insight-kammer mellom localStorage og Supabase

supabase/schema.sql
= tabeller

supabase/policies.sql
= RLS policies

supabase/chamber.sql
= aha_insight_chambers + RLS for chamber-sync

supabase/embeddings.sql
= aha_insight_embeddings + pgvector for semantisk søk

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
aha_insight_embeddings (semantic search, valgfri)
aha_insight_chambers (chamber-sync, valgfri)
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

## Chamber-sync

`aha_insight_chambers` lagrer hele insight-kammeret per profile som JSONB.
`ahaChamberSync.js` håndterer toveis sync:

```text
- Lokale skriv via saveChamberToStorage / saveChamberFallback setter
  chamber._local_updated_at og dispatcher aha:chamber-saved.
- ahaChamberSync lytter og pusher til Supabase via AHARepository.saveChamber
  med 1.5 s debounce.
- På aha:auth-ready trekker ahaChamberSync remote chamber via
  AHARepository.loadChamber og sammenligner:
    - remote tomt        → push local
    - local tomt         → ta remote (writeLocal + aha:chamber-replaced)
    - begge har innhold  → last write wins via _local_updated_at vs
                           updated_at
```

Hvis Supabase / auth / repository ikke er tilgjengelig, oppfører
modulen seg som no-op. localStorage er alltid sann kilde lokalt.

## Ikke gjort ennå

```text
- filopplasting
- Supabase Storage
- bilde-/videoanalyse
- sanntids/live sync (real-time channels)
- multi-device konfliktoppløsning utover last-write-wins
```
