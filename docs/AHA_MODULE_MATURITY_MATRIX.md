# AHA Module Maturity Matrix

Dette dokumentet kartlegger modenheten til AHA-modulene slik de ligger nå.

Det er en dokumentasjonsfil, ikke en runtime-endring. Målet er å skille mellom:

```text
registrert modul
faktisk side
faktisk script
data som lagres
source/ingest-kobling
localStorage
Supabase
kjente hull
neste trygge grep
```

Kartleggingen er basert på `js/ahaModules.js` og faktiske HTML-/JS-filer i repoet.

## 1. Modenhetsnivåer

```text
M0 = bare registrert / planlagt
M1 = side/skall finnes, men ingen reell dataflyt
M2 = lokal MVP finnes, localStorage-first
M3 = lokal MVP + AHA source/ingest-kobling der modulen skaper innsiktsmateriale
M4 = lokal MVP + ingest + Supabase best-effort / sync
M5 = produktmoden, testet, stabil kontrakt, komplett sync og tydelig UX
```

Nåværende system har ingen modul som bør kalles M5 ennå.

## 2. Kort status

```text
Sterkest / mest reell dataflyt:
- AHA Chat
- Notes
- Galleri
- Feed
- AHA Insta
- History Go-import
- Personvern / Kontroll

Fungerende localStorage-first referansemoduler:
- Innsikter
- Lister
- Stier
- Tankekart
- AHAavisa
- Grupper
- Søk

Rene skall:
- Meet
- Music
```

## 3. Modulmatrise

| Modul | Side | Script | Registerstatus | Modenhet | Data | AHASources | AHAIngest | localStorage | Supabase | Kjente hull | Neste trygge grep |
|---|---|---|---:|---:|---|---:|---:|---:|---:|---|---|
| AHA Profil | `profile.html` | `js/ahaProfile.js`, `js/ahaDashboard.js` | active / phase 1 | M2 | Leser profilstatus, modultall, siste aktivitet, History Go-status og personvernstatus | Nei, leser primært | Nei | Ja | Delvis via underliggende auth/repo på andre flater | Mer oversikt enn egen datamodul. Ikke full profilredigering på egen side. | Avklare hva Profil skal eie: bare dashboard, eller faktisk profilinnstillinger. |
| AHA Chat | `chat.html` | `js/ahaChat.js` + chat helpers + `js/ahaIngest.js` | active / phase 1 | M4 | Brukermeldinger, analyse, AI-svar, source events, insights, etterarbeid | Ja | Ja | Ja | Delvis via repository/chamber sync/embeddings når innlogget | Stor og kompleks. Trenger egen kontrakt-matrise for chat → source → insight → agent-svar. | Dokumenter chat-flow separat før funksjonelle endringer. |
| Innsikter | `insights.html` | `js/ahaInsights.js` | active / phase 1 | M2 | Leser `aha_insight_chamber_v1` og `aha_source_events_v1`; kan legge innsikter i lister/grupper | Leser source events | Nei, read-only/organisering | Ja | Nei | Modulen viser og organiserer eksisterende innsikter, men skaper ikke selv nye insights. | Beholde som read-only arkiv; neste: bedre filter/merge/emneforslag-UI. |
| Lister | `lists.html` | `js/ahaLists.js` | active / phase 1 | M2 | `aha_lists_v1`; referanser til innsikter, notes, feed, galleri, insta | Nei | Nei | Ja | Nei | Ingen Supabase-sync. Ingen source event når liste lages. | Avklare om listeopprettelse skal være source event eller bare struktur. |
| Stier | `paths.html` | `js/ahaPaths.js` | active / phase 1 | M2 | `aha_paths_v1`; steg/referanser til innsikter, lister og notater | Nei | Nei | Ja | Nei | Ingen Supabase-sync. Ingen source event. Begrenset til referansestier. | Avklare om stier skal kunne generere innsikt/plan-events senere. |
| Tankekart | `mindmap.html` | `js/ahaMindmap.js` | active / phase 1 | M2 | Read-only graf av source events, insights, lister, stier, artikler, notes, feed, galleri, insta og grupper | Leser source events | Nei | Ja | Nei | Read-only liste/graf, ikke visuell node-canvas. Ingen lagring. | Behold read-only til datakontrakter er stabile. |
| History Go | `historygo.html` | `js/ahaHistoryGoImport.js`, `js/ahaHistoryGoStatus.js` | active / phase 1 | M3 | Leser `aha_import_payload_v1`; importerer History Go-signaler til AHA | Ja | Ja | Ja | Bare hvis repository-lag er lastet annet sted; denne siden er primært lokal | Importen er manuell. History Go skal ikke bli AHA-grunnlag. | Legg inn tydelig import-samtykke/status og eventuelt Supabase-load på siden senere. |
| Galleri | `gallery.html` | `js/ahaGallery.js` | active / phase 1 | M4 | `aha_gallery_v1`; bilde/video URL/path + beskrivelse | Ja | Ja | Ja | Ja, best-effort via `AHARepository.saveGalleryItem/loadGalleryItems` | Første MVP bruker URL/path, ikke ekte filopplasting/storage. | Neste: Storage/backend for filopplasting eller tydelig fortsette URL/path-MVP. |
| Notes | `notes.html` | `js/ahaNotes.js` | active / phase 1 | M4 | `aha_notes_v1`; notater og edits | Ja | Ja | Ja | Ja, best-effort via `AHARepository.saveNote/loadNotes` | Enkel prompt-basert redigering. Ingen rik editor/versjonering. | Første kodekandidat hvis vi vil modne én modul. |
| AHA Insta | `insta.html` | `js/ahaInsta.js` | active / phase 1 | M4 | `aha_insta_posts_v1`, stories, import sessions, preview, profile, likes, comments, follows | Ja for nye poster og valgfri import-ingest | Ja for nye poster og valgfri import-ingest | Ja | Ja, best-effort for posts/profile/likes/comments/follows | Stor modul. ZIP-import mangler. DataURL har størrelsesgrense. Sosial logikk er lokal/simulert. | Ikke utvid før vi har datakontrakt-matrise for Insta. |
| Feed | `feed.html` | `js/ahaFeed.js` | active / phase 1 | M4 | `aha_feed_posts_v1`; korte poster | Ja | Ja | Ja | Ja, best-effort via `AHARepository.saveFeedPost/loadFeedPosts` | Enkel lokal post-feed uten tråder/replies. | Modnes etter Notes, siden mønsteret er enklere. |
| Meet | `meet.html` | ingen egen JS | shell / phase 2 | M1 | Ingen reell dataflyt | Nei | Nei | Nei | Nei | Rent modulskall. | Ikke bygg før grupper/profil/søk er mer modne. |
| Music | `music.html` | ingen egen JS | shell / phase 2 | M1 | Ingen reell dataflyt | Nei | Nei | Nei | Nei | Rent modulskall. | Ikke bygg før core-modulene er stabile. |
| AHAavisa | `avisa.html` | `js/ahaAvisa.js` | active / phase 2 | M2 | `aha_articles_v1`; lokale artikkelutkast, status, seksjoner, publiseringslag og referanser | Nei | Nei | Ja | Nei | Lokal publisering er bare lokal markering. Ingen ekte publisering. Ingen Supabase-sync. | Behold lokal. Neste: dokumenter article contract før endring. |
| Grupper | `groups.html` | `js/ahaGroups.js` | active / phase 2 | M2 | `aha_groups_v1`; lokale grupper, medlemmer, referanser, gruppebibliotek og gruppeutkast | Nei | Nei | Ja | Nei | Ikke ekte deling. Medlemmer er lokale. EchoNet-lag ikke bygget. | Ikke bygg ekte deling før privacy/sync er låst. |
| Søk | `search.html` | `js/ahaSearch.js` | active / phase 2 | M2 | Read-only indeks fra insights, source events, notes, gallery, feed, insta, lists, paths, articles, groups | Leser source events | Nei | Ja | Nei | LocalStorage-only read-only søk. Ingen fulltekstindeks/embedding-søk. | Behold read-only; senere kobles embedding/semantic search når stabilt. |
| Personvern | `privacy.html` | `js/ahaPrivacy.js` | active / phase 1 | M3 | `aha_privacy_settings_v1`; datarapport, eksport, lokal sletting av AHA-nøkler | Nei | Nei | Ja | Nei | Sletter bare lokale AHA-nøkler. History Go-nøkler vises, men slettes ikke her. | Neste: koble bedre til Supabase/account-level data når sync-regler er låst. |

## 4. Modulgrupper etter faktisk rolle

### 4.1 Innsiktsproduserende moduler

Disse sender brukerskapt materiale gjennom AHAIngest:

```text
AHA Chat
Notes
Galleri
Feed
AHA Insta
History Go-import
```

Disse må behandles varsomt fordi de kan påvirke `aha_insight_chamber_v1`.

### 4.2 Organiseringsmoduler

Disse organiserer eller viser eksisterende materiale, men skal ikke automatisk skape nye insights:

```text
Innsikter
Lister
Stier
Tankekart
AHAavisa
Grupper
Søk
Personvern
Profil
```

De er primært referanse-, visnings- og kontrollflater.

### 4.3 Rene skall

```text
Meet
Music
```

Disse skal ikke bygges før core-flater og datakontrakter er mer stabile.

## 5. localStorage-nøkler per modul

```text
AHA Chat
- aha_insight_chamber_v1
- aha_source_events_v1
- aha_afterwork_v1
- aha_pending_chat_prompt_v1

AHA Profil
- aha_insight_chamber_v1
- aha_source_events_v1
- aha_notes_v1
- aha_gallery_v1
- aha_feed_posts_v1
- aha_insta_posts_v1
- aha_lists_v1
- aha_paths_v1
- aha_articles_v1
- aha_groups_v1
- aha_privacy_settings_v1
- aha_import_payload_v1

Innsikter
- aha_insight_chamber_v1
- aha_source_events_v1

Lister
- aha_lists_v1
- aha_insight_chamber_v1
- aha_notes_v1
- aha_feed_posts_v1
- aha_gallery_v1
- aha_insta_posts_v1

Stier
- aha_paths_v1
- aha_insight_chamber_v1
- aha_lists_v1
- aha_notes_v1

Tankekart
- aha_insight_chamber_v1
- aha_source_events_v1
- aha_lists_v1
- aha_paths_v1
- aha_articles_v1
- aha_notes_v1
- aha_feed_posts_v1
- aha_gallery_v1
- aha_insta_posts_v1
- aha_groups_v1

History Go
- aha_import_payload_v1
- hg_unlocks_v1
- visited_places
- people_collected
- historygo_progress
- aha_source_events_v1
- aha_insight_chamber_v1

Galleri
- aha_gallery_v1

Notes
- aha_notes_v1

AHA Insta
- aha_insta_posts_v1
- aha_insta_stories_v1
- aha_insta_import_sessions_v1
- aha_insta_import_preview_v1
- aha_insta_profile_v1
- aha_insta_likes_v1
- aha_insta_comments_v1
- aha_insta_follows_v1

Feed
- aha_feed_posts_v1

AHAavisa
- aha_articles_v1
- aha_insight_chamber_v1
- aha_lists_v1
- aha_paths_v1
- aha_notes_v1

Grupper
- aha_groups_v1
- aha_privacy_settings_v1
- aha_insight_chamber_v1
- aha_lists_v1
- aha_paths_v1
- aha_articles_v1
- aha_notes_v1
- aha_feed_posts_v1

Søk
- aha_insight_chamber_v1
- aha_source_events_v1
- aha_notes_v1
- aha_gallery_v1
- aha_feed_posts_v1
- aha_insta_posts_v1
- aha_lists_v1
- aha_paths_v1
- aha_articles_v1
- aha_groups_v1

Personvern
- aha_privacy_settings_v1
- aha_insight_chamber_v1
- aha_source_events_v1
- aha_notes_v1
- aha_gallery_v1
- aha_feed_posts_v1
- aha_insta_posts_v1
- aha_lists_v1
- aha_paths_v1
- aha_articles_v1
- aha_groups_v1
- aha_import_payload_v1
- hg_unlocks_v1
- visited_places
- people_collected
- historygo_progress
```

## 6. Supabase-status

### Bruker Supabase best-effort i modulscript

```text
Notes
Galleri
Feed
AHA Insta
```

Disse har egne `syncFromDatabase` / `persist...`-mønstre mot `AHARepository`.

### Bruker Supabase via felles auth/repository/chamber/embeddings-lag

```text
AHA Chat
Dashboard / Profil
AHA Sources
AHA Ingest
AHA Chamber Sync
AHA Embeddings
History Go-import når AHARepository faktisk er lastet
```

### Ingen tydelig Supabase-sync i modulscript ennå

```text
Lister
Stier
Tankekart
AHAavisa
Grupper
Søk
Personvern
Meet
Music
```

## 7. Prioritert modningsrekkefølge

### 7.1 Første modul å modne: Notes

Hvorfor:

```text
- enkel dataform
- bruker AHASources
- bruker AHAIngest
- localStorage finnes
- Supabase best-effort finnes
- lav risiko for å ødelegge andre moduler
```

Neste grep:

```text
1. Lås note contract.
2. Rydd edit-flow.
3. Avklar om edit skal lage ny insight eller bare source event.
4. Verifiser localStorage ↔ Supabase sync.
```

### 7.2 Andre modul: Feed

Hvorfor:

```text
- enda enklere enn Notes
- samme mønster: create → ingest → localStorage → repository
```

Neste grep:

```text
1. Lås feed_post contract.
2. Avklar tråder/replies senere, ikke nå.
3. Verifiser sletting og sync.
```

### 7.3 Tredje modul: Galleri

Hvorfor:

```text
- ligner Notes/Feed
- men filopplasting/storage er ikke løst
```

Neste grep:

```text
1. Behold URL/path-MVP eller velg storage-løsning.
2. Ikke bygg ekte opplasting før Supabase/storage-regler er låst.
```

### 7.4 Vent med Insta

AHA Insta er mer moden enn flere andre moduler, men også mer kompleks.

Vent fordi:

```text
- mange localStorage-nøkler
- importflyt
- sosial modell
- profile/likes/comments/follows
- mulig storage-behov
```

Neste grep før kode:

```text
Lag egen AHA_INSTA_CONTRACT.md hvis Insta skal modnes.
```

### 7.5 Vent med ekte Grupper/EchoNet

Grupper er lokal og nyttig, men ikke ekte deling.

Ikke bygg ekte deling før:

```text
- privacy contract er låst
- Supabase sync-regler er låst
- public/private/group publication layer er låst
```

## 8. Ikke-bryt-regler for modulendringer

```text
1. Ikke lag ny AHA-motor i noen modul.
2. Innsiktsproduserende moduler skal bruke AHASources + AHAIngest.
3. Organiseringsmoduler skal ikke skape insights med mindre det er eksplisitt bestemt.
4. AI-agentens egne svar skal ikke bli ordinære insights.
5. History Go-import skal ikke emnematches på nytt.
6. Grupper er lokale til ekte deling er eksplisitt designet.
7. AHAavisa publiserer bare lokalt nå.
8. Meet og Music skal forbli shell til core-kontrakter er stabile.
9. Supabase skal ikke bli eneste sannhet før sync-reglene er låst.
10. localStorage fallback skal beholdes.
```

## 9. Neste dokument etter denne

Neste dokument bør være:

```text
docs/AHA_DATA_CONTRACT_MATRIX.md
```

Det dokumentet skal låse formene for:

```text
source_event
insight
note
gallery_item
feed_post
insta_post
list
path
article
group
privacy_settings
historygo_import_payload
```

Dette bør gjøres før vi endrer kode i noen modul.
