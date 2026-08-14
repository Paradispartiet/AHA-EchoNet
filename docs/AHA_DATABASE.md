# AHA Database

AHA-EchoNet har et valgfritt Supabase/Postgres-lag.

## Dokumentgrense

Denne filen beskriver databasekoden som **faktisk finnes nå**. Den planlagte overgangen til autoritativ PostgreSQL, IndexedDB/outbox, NestJS, eventuell Hasura, pgvector/Milvus-adapter og Azure er dokumentert i:

```text
docs/AHA_BACKEND_FOUNDATION_ROADMAP_V1.md
```

Roadmapen er målarkitektur og migreringsrekkefølge. Den endrer ikke dagens runtime alene. Før en migreringsfase er testet og eksplisitt aktivert, gjelder fortsatt den valgfrie Supabase-kontrakten nedenfor.

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
aha_insta_profiles (Insta-profil, valgfri)
aha_insta_likes (Insta-likes, valgfri)
aha_insta_comments (Insta-kommentarer, valgfri)
aha_insta_follows (Insta-følginger, valgfri)
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

Denne regelen hindrer at lokale data forsvinner ved innlogging, samtidig som Supabase blir sann kilde for de nåværende databaseaktiverte modulene når bruker er innlogget.

Dette er ikke den endelige fler-enhetskontrakten. Dagens implementasjon har ikke en generell outbox, device cursor, objektvise revisjoner eller full konfliktløsing. Backend Foundation v1 skal erstatte denne begrensningen trinnvis, ikke ved å slå på skjult sync.

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
- Lokale Chat-skriv via `chat.chamberStore` og øvrige skriv via
  `saveChamberFallback` setter `chamber._local_updated_at` og dispatcher
  `aha:chamber-saved`.
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

## Planlagt system-of-record-overgang

Backend Foundation v1 skal gjøre PostgreSQL autoritativt bare for data som brukeren har valgt å knytte til en synkronisert konto eller et arbeidsrom.

Målgrensen er:

```text
local-only object
→ blir på enheten

private synced object
→ IndexedDB cache/outbox
→ NestJS command boundary
→ PostgreSQL system of record

shared workspace object
→ explicit share preview and consent
→ NestJS authorization
→ PostgreSQL workspace scope
```

Overgangen krever før aktivering:

- canonical schema og migrasjoner
- mapping av alle eksisterende localStorage-objekter
- idempotent førstegangsimport
- revisionsnummer og optimistic concurrency
- tombstones
- device cursor og outbox
- eier-/medlem-/redaktør-/uvedkommende-tester
- eksport-, sletting-, rollback- og restore-test

Eksisterende Supabase-schema og pgvector-filer skal brukes som migreringsgrunnlag der de passer, men de er ikke alene bevis på at Backend Foundation v1 er ferdig.

## Semantisk lagring

Dagens `supabase/embeddings.sql` er første `pgvector`-implementasjon. Roadmapen låser følgende rekkefølge:

```text
PgVectorStore først
→ mål latency, recall, filterpresisjon og lekkasje
→ Milvus-adapter bare ved dokumentert behov
```

PostgreSQL forblir system of record selv dersom en senere Milvus-indeks aktiveres.

## Ikke gjort ennå

```text
- filopplasting
- Supabase Storage
- bilde-/videoanalyse
- generell sanntids/live sync
- robust multi-device konfliktoppløsning
- IndexedDB outbox og device cursors
- canonical normalisert PostgreSQL-modell for alle AHA-objekter
- NestJS command/API boundary
- Hasura proof of value
- LangGraph job orchestration
- Milvus adapter
- Azure staging/production
```
