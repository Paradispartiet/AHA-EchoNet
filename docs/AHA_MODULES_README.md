# AHA-EchoNet – Modul-README

Dette dokumentet låser modulplanen for AHA-EchoNet og brukes som arbeids-README for ferdigstilling av alle modulene.

## Grunnprinsipp

```text
AHA = brukerens personlige innsiktsmotor
History Go = det brukeren samler
EchoNet = den kollektive overbygningen
AHA-EchoNet = den personlige AHA-flaten som kan kobles til EchoNet
```

AHA skal ikke være en underdel av History Go. History Go kan sende materiale til AHA, men AHA skal kunne fungere selvstendig med brukerens egne samtaler, notater, bilder, poster, minner og innsikter.

Fast regel:

```text
Motoren finnes.
Ikke lag ny motor.
Gi motoren riktige innganger.
```

Alle nye moduler skal sende kildemateriale inn via eksisterende source/ingest-flyt:

```text
source event
→ AHASources
→ AHAIngest
→ InsightsEngine.createSignalFromMessage(...)
→ InsightsEngine.addSignalToChamber(...)
→ aha_insight_chamber_v1
→ MetaInsightsEngine
```

## Moduloversikt

### 1. AHA Home / Dashboard

Ansvar:
- personlig startside
- innlogget status
- profilkort
- modulnavigasjon
- lokale og databasebaserte nøkkeltall
- History Go-importstatus
- siste aktivitet

Eksisterende filer:
- `index.html`
- `ahaDashboard.js`
- `aha-dashboard.css`

Status:
- finnes
- viser modulkort
- viser profil/innlogging
- viser counts for source events, notes, gallery, feed, insta og imports
- har History Go-importknapper

Mangler før ferdig:
- mer presis profilside
- tydeligere siste innsikter
- egen modul for samlet AHA-score / progresjon
- bedre visning av History Go-progresjon, ikke bare importstatus

### 2. AHA Chat

Ansvar:
- personlig samtale med AHA
- sende brukermeldinger inn i AHAIngest
- vise innsikter fra samtalen
- bokmerker/høyre rail
- eksport til innsikt, liste, sti og AHAavisa senere

Eksisterende filer:
- `chat.html`
- `ahaChat.js`
- `aha-chat.css`

Status:
- finnes
- er skilt ut fra dashboard
- laster eksisterende motor
- har feltvalg, quick actions, chatlogg, composer og insight rail
- har importknapp for History Go

Mangler før ferdig:
- tydelig bokmerke-kolonne
- “lag liste”, “lag sti”, “send til AHAavisa” som faktiske handlinger
- bedre visning av hvilke innsikter som ble skapt fra hvilken melding
- samtaletråder / thread history
- full kobling til backend for chat-historikk

### 3. Innsiktsmotor

Ansvar:
- innsiktskort
- begreper
- source events
- meta-mønstre
- begrepstetthet
- semantisk resonans
- merge suggestions
- embedding-kobling

Eksisterende filer:
- `insightsChamber.js`
- `metaInsightsEngine.js`
- `ahaSources.js`
- `ahaIngest.js`
- `ahaEmbeddings.js`

Status:
- canonical motor finnes
- AHAIngest finnes som felles bro
- AHASources finnes som rå kildelogg
- AHAIngest hopper over emnematching for History Go-importert materiale
- embedding-berikelse finnes som fire-and-forget dersom konfigurert

Mangler før ferdig:
- visning av source → insight-sporbarhet
- visning av merge suggestions
- manuell godkjenning/avvisning av emneforslag
- begrepstetthet og resonans som synlige metrikker
- samlet innsiktsarkiv med filtrering


Fase 3 (første leveranse):
- `insights.html` er nå første faktiske innsiktsarkiv.
- `ahaInsights.js` leser eksisterende `aha_insight_chamber_v1` og `aha_source_events_v1`.
- Modulen gjør ikke ny analyse/motorarbeid, men visualiserer eksisterende innsikter og metafelter.
- Neste steg senere: handlinger som “send til liste”, “send til sti”, “send til AHAavisa”.
- `lists.html` er nå første koblingsmodul etter innsikter.
- `ahaLists.js` samler referanser til `insights` / `notes` / `feed` / `gallery` / `insta`.
- Lister kopierer ikke hele objekter, men lagrer referanser med `source`, `type`, `refId`.
- Innsikter kan nå sendes direkte til Lister fra innsiktskort i `insights.html`.
- Lister lagrer fortsatt bare referanser til innsikter via `source`, `type`, `refId`.
- Dette fullfører første reelle arbeidsflyt: `Chat → Innsikt → Liste`.
- `paths.html` er nå første stier-modul.
- `ahaPaths.js` bygger lærings-/prosess-stier av referanser til `insights` / `lists` / `notes`.
- Stier kopierer ikke hele objekter, men lagrer `source`, `type`, `refId`.
- Dette utvider flyten til `Chat → Innsikt → Liste → Sti`.
- `avisa.html` er nå første AHAavisa-modul.
- `ahaAvisa.js` lager lokale artikkelutkast.
- Artikler kan bygges av referanser til `insights` / `lists` / `paths` / `notes`.
- AHAavisa kopierer ikke hele objekter, men lagrer `source`, `type`, `refId`.
- Dette utvider flyten til `Chat → Innsikt → Liste → Sti → Artikkelutkast`.
- `search.html` er nå første samlede AHA-bibliotek.
- `ahaSearch.js` indekserer lokale objekter fra insights/source events/notes/gallery/feed/insta/lists/paths/articles.
- Søket er read-only og skriver ikke tilbake til andre moduler.
- Semantisk søk og embeddings kommer senere.
- `mindmap.html` er nå første graph/tankekart-modul.
- `ahaMindmap.js` visualiserer koblinger mellom source events, insights, lists, paths, articles og øvrige AHA-objekter.
- Første versjon er read-only og DOM-basert.
- Semantisk graph/embeddings/avansert visualisering kommer senere.
- AHA Home / Profil samler nå status fra aktive moduler i en felles personlig flate.
- `ahaProfile.js` leser lokale AHA- og History Go-nøkler read-only.
- Modulen viser nøkkeltall, siste aktivitet, History Go-status og personvernstatus.
- Modulen lager ikke ny motor og skriver ikke til andre modulers storage.
- `historygo.html` er nå AHA sin History Go-status/importmodul.
- Modulen viser `aha_import_payload_v1`, History Go localStorage-status og importerte AHA source events.
- Import skjer bare manuelt via knappetrykk.
- Modulen bygger ikke History Go inn i AHA og lager ikke ny motor.
- `groups.html` er nå første lokale Grupper/Sirkler-modul.
- `ahaGroups.js` lager lokale grupperom med medlemmer og referanser.
- Grupper lagrer bare referanser til AHA-objekter (`source`, `type`, `refId`).
- Ekte deling/backend/invitasjoner kommer senere.
- Modulen respekterer personvernstatus ved å vise sosial deling av/på.
- Fase 4B: Innsikter, lister, stier og AHAavisa-utkast kan nå legges direkte i lokale grupper som referanser.
- Grupper lagrer fortsatt bare `source`, `type`, `refId`, `title`.
- Ingen ekte deling/backend er bygget.
- Fase 4C: Grupper er nå koblet inn i AHA Home/Profile, Søk/Bibliotek, Tankekart og Personvern/Kontroll.
- `aha_groups_v1` inngår nå i systemstatus, søk, graph og eksport/sletting.
- Graph viser gruppe → referanse-koblinger via `group_references`.
- Fase 4D: Grupper har nå lokale arbeidsrom/detaljvisning i `groups.html`.
- Arbeidsrommet resolver referanser read-only fra AHA-kilder (insights/lister/stier/artikler/notater/feed).
- Grupper lagrer fortsatt bare referanser, ikke kopier av objekter.
- Gruppeaktivitet beregnes fra eksisterende metadata (`createdAt`, `updatedAt`, `addedAt`), ikke ny event-logg.
- Fase 4E: Gruppe-arbeidsrom kan nå opprette lokale AHAavisa-utkast.
- Utkastet lagrer bare referanser, ikke kopier av gruppeobjekter.
- Dette er lokal draft-generering, ikke publisering.
- Fase 4F: Gruppe-arbeidsrom har nå lokal rapport/oppsummering.
- Rapporten teller referanser, resolved/missing, artikkelutkast og publiseringsmodenhet.
- Rapporten er read-only og bruker ikke AI/API ennå.
- Fase 5A: AHAavisa har nå lokal statusflyt med `draft` / `review` / `ready` / `published_local`.
- Lokal publisering sender ikke data ut, og er kun lokal markering i nettleseren.
- Artikler kan grupperes og filtreres etter section i AHAavisa.
- Gruppeutkast vises med badge og lenke tilbake til gruppe.

### 4. Lister

Ansvar:
- favoritter
- gjøremål
- begrepslister
- prosesslister
- kvalitetslister
- AI-genererte lister
- delte lister senere

Status:
- ikke ferdig som egen modul
- ideen finnes i arkitekturen, men ikke som egen side/dataflyt

Mangler før ferdig:
- `lists.html`
- `ahaLists.js`
- `aha-lists.css`
- localStorage-key `aha_lists_v1`
- listeobjekt med `id`, `title`, `type`, `items`, `source_event_ids`, `insight_ids`, `created_at`, `updated_at`
- handling fra chat/insight: “legg til i liste”

### 5. Stier

Ansvar:
- kronologisk læringsreise
- tematisk utvikling over tid
- samtale → innsikt → handling
- History Go-progresjon som læringsløp
- publiserbare stier senere

Status:
- ikke ferdig som egen modul

Mangler før ferdig:
- `paths.html`
- `ahaPaths.js`
- `aha-paths.css`
- localStorage-key `aha_paths_v1`
- stiobjekt med `steps`, `source_event_ids`, `insight_ids`, `historygo_refs`
- visning som tidslinje
- knapp fra chat/insight: “lag sti”

### 6. Tankekart / Graph

Ansvar:
- visuelle noder
- koblinger mellom samtaler, innsikter, begreper, steder, personer og objekter
- vise hvordan en innsikt oppstod
- koble AHA-data og History Go-import

Status:
- ikke ferdig som egen modul

Mangler før ferdig:
- `mindmap.html` eller `graph.html`
- `ahaGraph.js`
- `aha-graph.css`
- node/edge-modell
- enkel førstevisning uten tung grafmotor
- senere: force graph / canvas / SVG

### 7. History Go-modul

Ansvar:
- åpne History Go
- importere `aha_import_payload_v1`
- vise importstatus
- vise samlet History Go-progresjon i AHA
- la AHA tolke History Go-materiale uten å blande motorene

Eksisterende filer:
- `ahaHistoryGoImport.js`
- History Go-panel i `index.html`

Status:
- importadapter finnes
- leser `aha_import_payload_v1`
- importerer `nextup_learning_signal`, `hg_learning_log_v1`, `hg_insights_events_v1`, `knowledge_universe`, `notes`, `dialogs`
- sender materialet via AHAIngest
- lagrer import i database hvis AHARepository er tilgjengelig

Mangler før ferdig:
- egen `historygo.html` i AHA med oversikt
- bedre visning av hva som ble importert
- deduplisering av importerte signaler
- Groundhopper-statistikk fra History Go
- badges/personer/steder som metadata-visning

### 8. AHA Gallery

Ansvar:
- brukerens personlige galleri
- bilder, videoer, minner, AI-bilder, visuelle uttrykk
- sende beskrivelser/captions inn i AHAIngest

Eksisterende filer:
- `gallery.html`
- `ahaGallery.js`
- `aha-gallery.css`

Status:
- finnes
- bruker localStorage-key `aha_gallery_v1`
- kan legge til bilde/video via URL/path
- lagrer til Supabase via AHARepository hvis mulig
- sender tekstlig materiale inn via AHAIngest

Mangler før ferdig:
- ekte filopplasting / storage
- bedre minnefelt
- kobling til History Go-bilder
- kobling til AHA Insta
- visning som personlig galleri, ikke bare liste

### 9. AHA Notes

Ansvar:
- egne notater og tekster
- skriveflate
- sende notater til AHAIngest
- senere koble notater til innsikter, lister og stier

Eksisterende filer:
- `notes.html`
- `ahaNotes.js`
- `aha-notes.css`

Status:
- finnes
- bruker localStorage-key `aha_notes_v1`
- lagrer tittel og tekst
- syncer til Supabase via AHARepository hvis mulig
- sender notat inn via AHAIngest

Mangler før ferdig:
- redigering/sletting
- tags i UI
- kobling til innsikter
- “send til liste/sti/artikkel”
- bedre skriveopplevelse

### 10. AHA Insta

Ansvar:
- bilde-/videostrøm
- caption-basert refleksjon
- mer visuell sosial/personlig publisering enn Gallery

Eksisterende filer:
- `insta.html`
- `ahaInsta.js`
- `aha-feed.css`

Status:
- finnes
- bruker localStorage-key `aha_insta_posts_v1`
- kan legge til tittel, media-path og caption
- lagrer til Supabase via AHARepository hvis mulig
- sender caption/tekst inn via AHAIngest

Mangler før ferdig:
- egen `aha-insta.css`
- ordentlig bildegrid/feed-design
- kobling til Gallery
- reaksjoner/kommentarer senere
- ekte media-upload

### 11. AHA Feed / Twitter

Ansvar:
- korte tekstposter
- tråder senere
- delte innsikter
- sosial refleksjonsfeed

Eksisterende filer:
- `feed.html`
- `ahaFeed.js`
- `aha-feed.css`

Status:
- finnes
- bruker localStorage-key `aha_feed_posts_v1`
- lagrer korte poster
- syncer til Supabase via AHARepository hvis mulig
- sender poster inn via AHAIngest

Mangler før ferdig:
- tråder
- repost/sitat
- kobling til innsiktskort
- visning av “post fra innsikt”
- senere sosial deling

### 12. AHA Meet

Ansvar:
- kunnskapsbasert matching
- personer med lignende temaer/interesser
- møter, grupper, relasjoner

Status:
- ikke ferdig som modul

Mangler før ferdig:
- `meet.html`
- `ahaMeet.js`
- `aha-meet.css`
- lokal førsteversjon med interesser og forslag
- senere matching basert på innsikter/resonans

### 13. AHA Music

Ansvar:
- spillelister
- stemning
- musikknotater
- minner og kulturelle koblinger

Status:
- ikke ferdig som modul

Mangler før ferdig:
- `music.html`
- `ahaMusic.js`
- `aha-music.css`
- localStorage-key `aha_music_v1`
- enkel lagring av låt/spilleliste/notat
- ingest av tekstlig refleksjon rundt musikk

### 14. AHAavisa

Ansvar:
- gjøre innsikter til artikler
- artikler, utkast, seksjoner, magasiner
- publiseringspipeline
- bruke innsiktsmetning/begrepstetthet som kriterier

Status:
- ikke ferdig som modul i repoet
- konseptet er definert i arkitekturen

Mangler før ferdig:
- `avisa.html`
- `ahaAvisa.js`
- `aha-avisa.css`
- localStorage-key `aha_articles_v1`
- artikkelutkast fra insight/liste/sti
- status: `draft`, `ready`, `published`
- seksjoner: nyheter, politikk, studier, kultur, sport, debatt osv.

### 15. Grupper / Sirkler

Ansvar:
- delte rom
- delt chat
- delt innsiktsbibliotek
- medlemmer/roller
- felles lister/stier
- senere EchoNet-kollektiv hukommelse

Status:
- ikke ferdig i frontend
- ikke ferdig i Supabase-schema

Mangler før ferdig:
- `groups.html`
- `ahaGroups.js`
- `aha-groups.css`
- tabeller for grupper, medlemskap, delte source events og delte innsikter
- først lokal prototype, senere database/RLS

### 16. Søk / Bibliotek

Ansvar:
- samlet søk på tvers av AHA
- samtaler, source events, innsikter, notes, gallery, feed, insta, History Go-import
- senere semantisk søk via embeddings

Status:
- ikke ferdig som egen UI-modul
- embeddings-lag finnes delvis

Mangler før ferdig:
- `search.html`
- `ahaSearch.js`
- `aha-search.css`
- enkel lokal tekstsøk først
- senere semantisk søk via `AHAEmbeddings.findSimilarToText(...)`

### 17. Personvern / Kontroll

Ansvar:
- hva lagres
- hva deles
- eksport
- slett
- samtykke
- private/offentlige data
- History Go-importkontroll

Status:
- delvis teknisk grunnlag finnes gjennom Auth, localStorage, Supabase og importmerking
- ikke ferdig som brukerflate

Mangler før ferdig:
- `privacy.html`
- `ahaPrivacy.js`
- `aha-privacy.css`
- eksport av alle `aha_*` keys
- slettemuligheter per modul
- samtykkepanel
- tydelig dataoversikt

## Eksisterende grunnmur i repoet

Finnes nå:

```text
index.html                 # Dashboard
chat.html                  # Chat
notes.html                 # Notes
gallery.html               # Gallery
feed.html                  # Feed / Twitter
insta.html                 # Insta

insightsChamber.js         # canonical innsiktsmotor
metaInsightsEngine.js      # metamotor
ahaSources.js              # source-event logg
ahaIngest.js               # felles ingest-bro
ahaHistoryGoImport.js      # History Go-importadapter
ahaDashboard.js            # dashboardlogikk
ahaNotes.js                # notes-modul
ahaGallery.js              # galleri-modul
ahaFeed.js                 # feed-modul
ahaInsta.js                # insta-modul
ahaRepository.js           # Supabase persistence-fallback
ahaAuth.js                 # Supabase Auth
supabase/schema.sql        # første databaseschema
```

## Nåværende ferdighetsgrad

```text
Kjerne/motor:           65–75 %
Dashboard:              55–65 %
Chat:                   45–55 %
Notes:                  40–50 %
Gallery:                35–45 %
Feed/Twitter:           35–45 %
Insta:                  35–45 %
History Go-import:      50–60 %
Lister:                 0–10 %
Stier:                  0–10 %
Tankekart/Graph:        0–10 %
AHA Meet:               0–5 %
AHA Music:              0–5 %
AHAavisa:               0–10 %
Grupper/Sirkler:        0–10 %
Søk/Bibliotek:          10–20 %
Personvern/Kontroll:    10–20 %
```

## Riktig ferdigstillingsrekkefølge

### Fase 1 – Stabiliser eksisterende moduler

Mål:
- sikre at Dashboard, Chat, Notes, Gallery, Feed, Insta og History Go-import fungerer uten feil
- ingen nye store funksjoner før grunnflyten er stabil

Oppgaver:
1. Kjør `node --check` på alle JS-filer.
2. Test at hver modul lagrer i localStorage.
3. Test at hver modul sender source event til `aha_source_events_v1`.
4. Test at hver modul skaper insight i `aha_insight_chamber_v1`.
5. Test at Supabase fallback ikke stopper lokal bruk.
6. Test at History Go-import ikke bruker ahaEmneMatcher.
7. Legg til slett/rediger i Notes, Feed, Gallery og Insta.

### Fase 2 – Bygg manglende strukturmoduler

Bygg i denne rekkefølgen:
1. Innsiktsarkiv / `insights.html`
2. Lister / `lists.html`
3. Stier / `paths.html`
4. Søk / `search.html`
5. Privacy / `privacy.html`

Dette gir AHA reell arbeidsverdi før vi bygger sosiale/kollektive lag.

### Fase 3 – Bygg visuell forståelse

Bygg:
1. Tankekart / Graph
2. source → insight-sporbarhet
3. begrepskart
4. merge-suggestions UI
5. emneforslag med godkjenn/avvis

### Fase 4 – Bygg publisering

Bygg:
1. AHAavisa som draft-modul
2. artikkelutkast fra innsikt/liste/sti
3. seksjoner
4. publiseringsstatus
5. eksport til HTML/Markdown

### Fase 5 – Bygg sosiale moduler

Bygg:
1. AHA Meet
2. Grupper/Sirkler
3. delte innsikter
4. felles lister/stier
5. senere EchoNet-kollektiv hukommelse

### Fase 6 – Bygg kulturmoduler

Bygg:
1. AHA Music
2. bedre Gallery/Insta-kobling
3. EchoCanon senere

## Neste konkrete utviklingsprompt

```text
Du jobber i repoet `Paradispartiet/AHA-EchoNet`.

Oppgave:
Ferdigstill stabiliseringsfase 1 for eksisterende AHA-moduler.

Les først faktisk:
- README.md
- docs/AHA_ARCHITECTURE.md
- docs/AHA_MODULES_README.md
- index.html
- chat.html
- notes.html
- gallery.html
- feed.html
- insta.html
- ahaDashboard.js
- ahaChat.js
- ahaSources.js
- ahaIngest.js
- ahaHistoryGoImport.js
- ahaNotes.js
- ahaGallery.js
- ahaFeed.js
- ahaInsta.js
- ahaRepository.js
- supabase/schema.sql

Kjør deretter `node --check` på alle JS-filene over.

Mål:
1. Ikke lag ny motor.
2. Ikke endre History-Go-repoet.
3. Ikke bygg backend på nytt.
4. Stabiliser eksisterende moduler.
5. Sørg for at alle eksisterende moduler bruker samme source/ingest-kontrakt.
6. Legg til rediger/slett der det mangler i Notes, Gallery, Feed og Insta.
7. Legg til enkel visning av source-event-id / insight-kobling der det er naturlig.
8. Ikke gjør stor visuell redesign.
9. Ikke legg inn midlertidige hacks.

Akseptansekriterier:
- Notes kan opprette, redigere og slette notat.
- Gallery kan opprette og slette galleriobjekt.
- Feed kan opprette og slette post.
- Insta kan opprette og slette post.
- Alle nye/endrede elementer lagres i riktig localStorage-key.
- Nye elementer sendes via AHAIngest.
- Sletting sletter ikke historiske source events automatisk, men kan markere originalelementet som slettet i modulens egen storage.
- Dashboard counts oppdateres etter endringer.
- `node --check` passerer for alle endrede JS-filer.
```

## Modulregistry (fase 1 grunnmur)

AHA Home bruker nå en felles modulregistry i `ahaModules.js`.

- Registryen definerer alle hovedmoduler med `id`, `title`, `type`, `status`, `href`, `description` og `phase`.
- `ahaDashboard.js` renderer modul-kortene fra registryen i stedet for hardkodede kort i `index.html`.
- Moduler som ikke er dype ennå har egne placeholder-sider slik at inngangen er synlig fra dag 1.

Fase 1-moduler som nå finnes i Home:

1. profile
2. chat
3. insights
4. lists
5. paths
6. mindmap
7. historygo
8. gallery
9. notes
10. insta
11. feed
12. meet
13. music
14. avisa
15. groups
16. search
17. privacy

## Canonical modulregistry: `ahaModules.js`

`ahaModules.js` er canonical kilde for hvilke moduler som finnes i AHA Home.
Alle moduler skal defineres her med `id`, `title`, `type`, `status`, `href`, `description`, `phase`.

### Moduler, type og status

1. `profile` — type: `personal`, status: `shell`
2. `chat` — type: `core`, status: `active`
3. `insights` — type: `knowledge`, status: `shell`
4. `lists` — type: `knowledge`, status: `shell`
5. `paths` — type: `knowledge`, status: `shell`
6. `mindmap` — type: `knowledge`, status: `shell`
7. `historygo` — type: `historygo`, status: `active`
8. `gallery` — type: `personal`, status: `active`
9. `notes` — type: `personal`, status: `active`
10. `insta` — type: `personal`, status: `active`
11. `feed` — type: `social`, status: `active`
12. `meet` — type: `social`, status: `shell`
13. `music` — type: `personal`, status: `shell`
14. `avisa` — type: `publishing`, status: `shell`
15. `groups` — type: `social`, status: `shell`
16. `search` — type: `system`, status: `shell`
17. `privacy` — type: `system`, status: `shell`

## Byggerekkefølge

1. Modulskall
2. Datakontrakt
3. AHA Chat + Innsikter
4. History Go-kobling
5. Graph / Tankekart
6. Grupper / EchoNet

## Fase 2 – Felles AHA-datakontrakt

`ahaContracts.js` er et felles kontraktlag for modulobjekter i AHA.
Eksisterende moduler beholder sine modulspesifikke felter, men kan i tillegg lagre et felles `base`-objekt som koblingslag.
Dette gjør at senere moduler som søk, lister, stier, mindmap og AHAavisa kan koble data på tvers uten ny motor.

Felles basekontrakt:

```js
{
  id,
  title,
  type,
  source,
  createdAt,
  updatedAt,
  tags,
  linkedItems,
  meta
}
```

Linked item-kontrakt:

```js
{
  id,
  type,
  source,
  title
}
```

Regel:
"Modulspesifikke data skal beholdes, men alle moduler skal etter hvert ha et felles base-lag slik at AHA kan koble, søke, listeføre og visualisere objekter på tvers."

## Regel for leveranse

"Alle moduler skal finnes synlig fra start, men bare kjernefunksjonene bygges dypt først."
