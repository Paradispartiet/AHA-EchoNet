# AHA Data Contract Matrix

Dette dokumentet låser første versjon av datakontraktene for AHA.

Dokumentet er en arkitektur-/dokumentasjonslås. Det er ikke en runtime-endring, ikke en ny motor og ikke en beslutning om å endre lagringsstrategi.

Målet er å gjøre det trygt å endre én modul om gangen uten å ødelegge AHA-motoren, localStorage, Supabase sync, History Go-import eller source/ingest-flyten.

## 1. Kildegrunnlag

Denne kontraktmatrisen bygger på faktisk kode i repoet:

```text
js/ahaContracts.js
js/ahaSources.js
js/ahaIngest.js
js/ahaRepository.js
js/ahaNotes.js
js/ahaGallery.js
js/ahaFeed.js
js/ahaInsta.js
js/ahaLists.js
js/ahaPaths.js
js/ahaAvisa.js
js/ahaGroups.js
js/ahaPrivacy.js
js/ahaHistoryGoImport.js
```

Kontraktene under er derfor ikke en ny ønskemodell. De er en ryddet minimumskontrakt basert på hvordan systemet allerede oppfører seg.

## 2. Kontraktnivåer

```text
Base contract
= felles form for AHA-objekter på tvers av moduler.

Source contract
= rå hendelse: hva kom inn, hvorfra, når og med hvilken metadata.

Ingest contract
= hvordan source event blir signal og eventuelt insight.

Module contract
= lokal form for note, gallery item, feed post, insta post, list, path, article, group osv.

Persistence contract
= localStorage-key og eventuell Supabase-tabell/funksjon.
```

## 3. Global base item

Eies av:

```text
js/ahaContracts.js
```

Brukes av flere moduler som `base`-felt eller normaliseringsgrunnlag.

### Shape

```js
{
  id: string,
  title: string,
  type: string,
  source: string,
  createdAt: string,
  updatedAt: string,
  tags: string[],
  linkedItems: LinkedItem[],
  meta: object
}
```

### LinkedItem

```js
{
  id: string,
  type: string,
  source: string,
  title: string
}
```

### Regler

```text
id, type og source må finnes for at base item skal regnes som valid.
tags skal være unike, trimmede strenger.
meta skal alltid være object.
createdAt/updatedAt bruker camelCase.
Modulspesifikke records kan fortsatt bruke created_at/updated_at, men base bruker createdAt/updatedAt.
```

## 4. Source event contract

Eies av:

```text
js/ahaSources.js
```

localStorage-key:

```text
aha_source_events_v1
```

Supabase-tabell / repository-funksjon:

```text
aha_source_events
AHARepository.saveSourceEvent(...)
```

### Shape

```js
{
  id: string,
  source_type: string,
  source_app: string,
  content_type: string,
  title: string,
  text: string,
  user_created: boolean,
  imported: boolean,
  created_at: string,
  tags: string[],
  meta: object
}
```

### Feltbetydning

```text
id = stabil source event-id, vanligvis src_<timestamp>_<random>.
source_type = hva slags hendelse det er, f.eks. chat_message, note, note_edit, gallery, feed_post, insta_post, historygo_nextup.
source_app = hvilken modul/app som skapte hendelsen, f.eks. aha_chat, aha_notes, aha_gallery, aha_feed, aha_insta, historygo.
content_type = text, image, video, mixed eller modulspesifikk variant.
title = kort tittel eller fallback-label.
text = analyse-/visningstekst.
user_created = true når brukeren selv skapte materialet.
imported = true når materialet er importert fra History Go, Instagram eller annen importkilde.
created_at = ISO-tidspunkt for source event.
tags = trimmede strenger.
meta = modulspesifikk metadata.
```

### Regler

```text
Source event skal opprettes før insight.
Source event skal kunne eksistere uten insight.
Hvis både title og text er tomme, skal source event ikke lagres.
Top-level felter som ikke er del av source event-schema kan forsvinne; kritisk metadata skal derfor ligge i meta.
```

## 5. Ingest input contract

Eies av:

```text
js/ahaIngest.js
```

### Minimum input

```js
{
  source_type: string,
  source_app: string,
  content_type: string,
  title: string,
  text: string,
  user_created: boolean,
  imported: boolean,
  created_at: string,
  tags?: string[],
  meta?: object,
  skip_insight?: boolean
}
```

### Ekstra ingest-felter som kan brukes

```js
{
  theme_id?: string,
  subject_id?: string,
  field_id?: string,
  place_id?: string,
  person_id?: string,
  candidate_concepts?: Array<string|object>
}
```

### Regler

```text
AHAIngest.ingest(input) skal først lage source event via AHASources.
Deretter renser den tekst og lager signal via InsightsEngine.createSignalFromMessage(...).
Hvis skip_insight === true, skal source event lagres, men insight/signalet skal hoppes over.
skip_insight brukes særlig for AHA-agentens egne svar og for note_edit.
History Go-signaler skal ikke emnematches på nytt.
Emnematcher skriver bare emne_suggestions, ikke fasit.
Embedding-berikelse er fire-and-forget og skal ikke blokkere hovedflyten.
```

## 6. Signal contract

Signal er mellomobjektet mellom source event og insight.

Opprettes av:

```text
InsightsEngine.createSignalFromMessage(...)
```

Berikes i:

```text
js/ahaIngest.js
```

### Observed minimum shape

```js
{
  text: string,
  subject_id: string,
  theme_id: string,
  timestamp?: string,
  source_event_id: string|null,
  source_type: string|null,
  source_app: string|null,
  imported: boolean,
  meta: object
}
```

### Kandidatfelter ved AI-genererte insight candidates

```js
{
  candidate_title?: string|null,
  candidate_summary?: string|null,
  candidate_functional_type?: string|null,
  candidate_concepts?: Array<string|object>,
  candidate_thinkers?: string[],
  candidate_theories?: string[],
  candidate_traditions?: string[],
  candidate_theoretical_links?: Array<object>
}
```

### Regler

```text
Signal er ikke primær lagringskontrakt.
Signal skal bære source_event_id videre til insight.
Signal skal aldri være eneste sporbarhetspunkt; source event er råloggen.
```

## 7. Insight contract

Eies primært av:

```text
js/insightsChamber.js
```

Lagres i:

```text
aha_insight_chamber_v1
```

Leses av:

```text
js/ahaInsights.js
js/ahaSearch.js
js/ahaMindmap.js
js/ahaProfile.js
js/metaInsightsEngine.js
```

### Minimum read-shape

AHA må tåle flere historiske varianter av insight-felt.

```js
{
  id?: string,
  title?: string,
  heading?: string,
  label?: string,
  summary?: string,
  text?: string,
  content?: string,
  claim?: string,

  subject_id?: string,
  theme_id?: string,
  topic?: string,
  emne?: string,
  category?: string,

  source_event_id?: string,
  sourceEventId?: string,
  source_id?: string,
  sourceId?: string,
  event_id?: string,
  eventId?: string,
  source_event_ids?: string[],
  sourceEventIds?: string[],

  created_at?: string,
  createdAt?: string,
  first_seen?: string,
  firstSeen?: string,
  updated_at?: string,
  updatedAt?: string,
  last_updated?: string,
  lastUpdated?: string,

  concepts?: Array<string|object>,
  terms?: string[],
  tokens?: string[],
  keywords?: string[],
  raw_terms?: Array<string|object>,
  rawTerms?: Array<string|object>,

  thinkers?: string[],
  theories?: string[],
  traditions?: string[],
  theoretical_links?: Array<{
    name: string,
    theory?: string,
    relation: string
  }>,

  confidence?: number,
  score?: number,

  imported?: boolean,
  import_source?: string,
  meta?: object
}
```

### Suggestion-felter

```js
{
  emne_suggestions?: Array<{
    emne_id: string,
    subject_id: string|null,
    label: string|null,
    title: string|null,
    short_label: string|null,
    area_id: string|null,
    area_label: string|null,
    score: number,
    confidence: number,
    matched_terms: string[],
    source: "ahaEmneMatcher",
    status: "suggested",
    created_at: string
  }>,

  merge_suggestions?: Array<object>
}
```

### Regler

```text
Insight er motor-output, ikke rådata.
Insight skal kunne spores tilbake til source event når mulig.
Insight kan ha flere historiske feltvarianter; visningsmoduler må være tolerante.
Bekreftede emner skal ikke overskrives av ahaEmneMatcher.
emne_suggestions er forslag, ikke fasit.
merge_suggestions er forslag, ikke automatisk sammenslåing.
```

## 8. Chamber contract

localStorage-key:

```text
aha_insight_chamber_v1
```

Minimum shape:

```js
{
  insights: Insight[],
  patterns?: object[],
  meta_insights?: object[],
  emne_suggestions?: object[],
  merge_suggestions?: object[],
  merge_dismissals?: object[],
  metaProfile?: object,
  meta_profile?: object,
  _local_updated_at?: string
}
```

Regler:

```text
Chamber er canonical runtime-container for insights.
Chamber kan ha historiske og nye felt samtidig.
Visningsmoduler må tåle manglende felt.
AHAIngest skal lagre chamber etter addSignalToChamber.
```

## 9. Note contract

Eies av:

```text
js/ahaNotes.js
```

localStorage-key:

```text
aha_notes_v1
```

Supabase:

```text
aha_notes
AHARepository.saveNote(...)
AHARepository.loadNotes(...)
```

### Shape

```js
{
  id: string,
  title: string,
  text: string,
  tags: string[],
  created_at: string,
  updated_at: string,
  deleted_at?: string,
  last_source_event_id?: string,
  last_reanalyzed_at?: string,
  base?: BaseItem
}
```

### Source event ved create

```js
{
  source_type: "note",
  source_app: "aha_notes",
  content_type: "text",
  title,
  text,
  user_created: true,
  imported: false,
  created_at,
  meta: { note_id }
}
```

### Source event ved edit

```js
{
  source_type: "note_edit",
  source_app: "aha_notes",
  content_type: "text",
  title,
  text,
  user_created: true,
  imported: false,
  created_at: updated_at,
  meta: { note_id },
  skip_insight: true
}
```

### Source event ved explicit reanalysis

```js
{
  source_type: "note_reanalysis",
  source_app: "aha_notes",
  content_type: "text",
  title,
  text,
  user_created: true,
  imported: false,
  created_at: reanalyzed_at,
  meta: {
    note_id,
    reanalyze: true
  }
}
```

### Beslutning: note_edit er source-only

```text
note_create = source event + ordinær AHAIngest, slik at ny insight kan oppstå.
note_edit = source event only med skip_insight: true.
note_reanalysis = eksplisitt brukerhandling som kjører AHAIngest uten skip_insight, slik at ny insight kan oppstå.
```

### Regler

```text
Et notat er et levende dokument.
Små rettinger, omskrivinger og stavefeil skal ikke automatisk forurense chamber.
Edit-historikk skal fortsatt finnes i source-loggen.
Ny analyse av et redigert notat skal være en bevisst handling, ikke default.
```

## 10. Gallery item contract

Eies av:

```text
js/ahaGallery.js
```

localStorage-key:

```text
aha_gallery_v1
```

Supabase:

```text
aha_gallery_items
AHARepository.saveGalleryItem(...)
AHARepository.loadGalleryItems(...)
```

### Shape

```js
{
  id: string,
  type: "image"|"video",
  title: string,
  description: string,
  src: string,
  thumbnail: string,
  source_type: "gallery",
  source_app: "aha_gallery",
  user_created: true,
  imported: false,
  tags: string[],
  meta: object,
  created_at: string,
  deleted_at?: string,
  last_source_event_id?: string,
  base?: BaseItem
}
```

### Source event

```js
{
  source_type: "gallery",
  source_app: "aha_gallery",
  content_type: "image"|"video",
  title,
  text: "<title>\n<description>",
  user_created: true,
  imported: false,
  created_at,
  meta: {
    gallery_item_id,
    src,
    media_type
  }
}
```

### Regler

```text
Første MVP bruker URL/path, ikke ekte filopplasting.
src kan være URL/path/dataURL avhengig av modul.
Ekte storage må ikke bygges før storage/sync-kontrakt er låst.
```

## 11. Feed post contract

Eies av:

```text
js/ahaFeed.js
```

localStorage-key:

```text
aha_feed_posts_v1
```

Supabase:

```text
aha_feed_posts
AHARepository.saveFeedPost(...)
AHARepository.loadFeedPosts(...)
```

### Shape

```js
{
  id: string,
  text: string,
  tags: string[],
  meta: object,
  created_at: string,
  deleted_at?: string,
  last_source_event_id?: string,
  base?: BaseItem
}
```

### Source event

```js
{
  source_type: "feed_post",
  source_app: "aha_feed",
  content_type: "text",
  title: "AHA Feed-post",
  text,
  user_created: true,
  imported: false,
  created_at,
  meta: { feed_post_id }
}
```

### Regler

```text
Feed er enkel lokal post-feed.
Replies/tråder er ikke del av kontrakten ennå.
```

## 12. AHA Insta contracts

Eies av:

```text
js/ahaInsta.js
```

### 12.1 Insta post

localStorage-key:

```text
aha_insta_posts_v1
```

Supabase:

```text
aha_insta_posts
AHARepository.saveInstaPost(...)
AHARepository.loadInstaPosts(...)
```

Shape:

```js
{
  id: string,
  title: string,
  src: string,
  caption: string,
  content_type: "image"|"video"|string,
  tags: string[],
  ownerId: string,
  ownerUsername: string,
  visibility: "public"|"private",
  like_count: number,
  comment_count: number,
  created_at: string,
  updated_at?: string,
  deleted_at?: string,
  imported?: boolean,
  source_app?: string,
  source_type?: string,
  originalInstagramDate?: string|null,
  source_signature: string,
  meta: object,
  last_source_event_id?: string,
  base?: BaseItem
}
```

Source event for ny AHA Insta-post:

```js
{
  source_type: "insta_post",
  source_app: "aha_insta",
  content_type,
  title,
  text: "<title>\n<caption>",
  user_created: true,
  imported: false,
  created_at,
  meta: {
    insta_post_id,
    src
  }
}
```

Source event for importert Instagram-post når ingest er valgt:

```js
{
  source_type: "insta_post",
  source_app: "aha_insta",
  content_type,
  title,
  text: "<title>\n<caption>",
  user_created: true,
  imported: true,
  created_at,
  meta: {
    insta_post_id,
    src,
    import_session_id
  }
}
```

### 12.2 Insta story

localStorage-key:

```text
aha_insta_stories_v1
```

Shape:

```js
{
  id: string,
  ownerId: string,
  ownerUsername: string,
  mediaType: "image"|"video"|"unknown",
  src: string,
  caption: string,
  created_at: string,
  expiresAt: string,
  originalInstagramDate?: string|null,
  imported: boolean,
  archived: boolean,
  source_app?: string,
  source_type?: string,
  visibility: "public"|"private",
  meta: object
}
```

### 12.3 Insta profile

localStorage-key:

```text
aha_insta_profile_v1
```

Supabase:

```text
AHARepository.saveInstaProfile(...)
AHARepository.loadInstaProfile(...)
```

Shape:

```js
{
  id: string,
  username: string,
  displayName: string,
  bio: string,
  avatar: string,
  created_at: string,
  updated_at: string
}
```

### 12.4 Insta social actions

localStorage-keys:

```text
aha_insta_likes_v1
aha_insta_comments_v1
aha_insta_follows_v1
```

Like:

```js
{
  id: string,
  post_id: string,
  user_id: string,
  created_at: string,
  deleted_at: string|null
}
```

Comment:

```js
{
  id: string,
  post_id: string,
  user_id: string,
  username: string,
  text: string,
  created_at: string,
  deleted_at: string|null
}
```

Follow:

```js
{
  id: string,
  follower_id: string,
  following_id: string,
  following_username: string,
  created_at: string,
  deleted_at: string|null
}
```

### 12.5 Insta import session / preview

localStorage-keys:

```text
aha_insta_import_sessions_v1
aha_insta_import_preview_v1
```

Import session:

```js
{
  id: string,
  source: "instagram_export",
  status: "pending"|"parsed"|"failed"|"completed"|string,
  created_at: string,
  updated_at: string,
  importedPostCount: number,
  importedStoryCount: number,
  importedMediaCount: number,
  errors: string[],
  filesSeen: string[],
  parserMode: string
}
```

Preview item:

```js
{
  id: string,
  source: "instagram_export",
  originalInstagramId: string,
  originalInstagramDate: string|null,
  mediaType: "image"|"video"|"unknown",
  src: string,
  caption: string,
  title: string,
  type: "post"|"story"|"media",
  imported: true,
  visibility: "private"|"public",
  created_at: string,
  meta: object
}
```

### Regler

```text
AHA Insta er stor nok til å få eget kontraktdokument før større endringer.
ZIP-import er ikke kontraktfestet som fungerende ennå.
DataURL-import er lokal MVP med størrelsesgrense.
Social actions er lokale/synkbare actions, ikke ekte offentlig sosial graf.
```

## 13. List contract

Eies av:

```text
js/ahaLists.js
```

localStorage-key:

```text
aha_lists_v1
```

### Shape

```js
{
  id: string,
  title: string,
  type: "favorites"|"todo"|"concepts"|"process"|"quality"|"ai"|"shared_later",
  description: string,
  createdAt: string,
  updatedAt: string,
  tags: string[],
  items: ListItem[],
  source: "aha_lists",
  meta: object,
  deletedAt?: string
}
```

List item:

```js
{
  id: string,
  title: string,
  type: string,
  source: string,
  refId: string,
  addedAt: string,
  meta: object
}
```

### Regler

```text
Lister er organisering, ikke insight-produksjon.
Listeopprettelse, listeendring og listepunkt-endringer lager ikke source event i nåværende modell.
Listepunkter skal referere til eksisterende AHA-objekter med source + refId.
Lists er en write-module som bruker localStorage-key aha_lists_v1.
Lists bruker camelCase base-felt lokalt: createdAt, updatedAt og deletedAt.
List items er embedded i list.items i dagens localStorage-modell.
```

### Fremtidig sync-kontrakt

```text
Hvis Supabase-sync bygges senere, må mapping mellom lokal camelCase og remote snake_case bestemmes eksplisitt:
- local createdAt -> remote created_at
- local updatedAt -> remote updated_at
- local deletedAt -> remote deleted_at

Fremtidig Supabase-modell må velge én av disse schema-retningene før kode:
A. én tabell med embedded items JSON
B. to tabeller: lists + list_items

Denne PR-en velger ikke runtime-implementasjon hvis det krever schema.
Anbefalt minimal fremtidig sync-modell kan dokumenteres som embedded JSON først, men må verifiseres mot Supabase før kode.
Lists sync skal ikke gjøre Lists til insight-produsent eller source event-produsent.
```

## 14. Path contract

Eies av:

```text
js/ahaPaths.js
```

localStorage-key:

```text
aha_paths_v1
```

### Shape

```js
{
  id: string,
  title: string,
  type: "learning"|"process"|"project"|"habit"|"reading"|"historygo"|"publishing",
  description: string,
  createdAt: string,
  updatedAt: string,
  tags: string[],
  steps: PathStep[],
  source: "aha_paths",
  meta: object,
  deletedAt?: string
}
```

Path step:

```js
{
  id: string,
  title: string,
  type: string,
  source: string,
  refId: string,
  order: number,
  status: "planned"|"active"|"done"|"skipped",
  addedAt: string,
  meta: object
}
```

### Regler

```text
Paths/Stier er organisering/prosess, ikke insight-produksjon.
Path-opprettelse, path-endring og step-endringer lager ikke source event i nåværende modell.
Paths er en write-module som bruker localStorage-key aha_paths_v1.
Paths bruker camelCase base-felt lokalt: createdAt, updatedAt og deletedAt.
Path steps er embedded i path.steps i dagens localStorage-modell.
Steg skal referere til eksisterende AHA-objekter med source + refId.
Steps kan peke til andre AHA-objekter via source + refId, men sync må ikke mutere de objektene.
Rekkefølge styres av order.
Step-delete er hard remove i dagens lokale modell; dette må vurderes eksplisitt før sync fordi step-konflikter kan bli vanskelige.
```

### Step shape

```text
Step shape bruker disse feltene:
- id
- title
- type
- source
- refId
- order
- status
- addedAt
- meta
```

### Fremtidig sync-kontrakt

```text
Hvis Supabase-sync bygges senere, må mapping mellom lokal camelCase og remote snake_case bestemmes eksplisitt:
- local createdAt -> remote created_at
- local updatedAt -> remote updated_at
- local deletedAt -> remote deleted_at

Fremtidig Supabase-modell må velge én av disse schema-retningene før kode:
A. én tabell med embedded steps JSON
B. to tabeller: paths + path_steps

Denne PR-en velger ikke runtime-implementasjon hvis det krever schema.
Anbefalt minimal fremtidig sync-modell kan dokumenteres som embedded JSON først, men må verifiseres mot Supabase før kode.
Paths sync skal ikke gjøre Paths til insight-produsent eller source event-produsent.
```

## 15. Article / AHAavisa contract

Eies av:

```text
js/ahaAvisa.js
```

localStorage-key:

```text
aha_articles_v1
```

### Shape

```js
{
  id: string,
  title: string,
  section: "nyheter"|"kultur"|"politikk"|"sport"|"teknologi"|"filosofi"|"historygo"|"aha"|"debatt"|"notater",
  status: "draft"|"review"|"ready"|"published_local",
  summary: string,
  body: string,
  createdAt: string,
  updatedAt: string,
  tags: string[],
  references: ArticleReference[],
  source: "aha_avisa",
  publicationLayer: "personal"|"group"|"public_candidate",
  meta: object,
  deletedAt?: string
}
```

Article reference:

```js
{
  id: string,
  title: string,
  type: string,
  source: string,
  refId: string,
  addedAt: string,
  meta: object
}
```

### Regler

```text
published_local betyr bare lokal markering, ikke ekstern publisering.
publicationLayer styrer personlig / gruppe / offentlig kandidatlag.
Offentlig kandidat er ikke offentlig publisering.
AHAavisa lager ikke source event/insight i nåværende modell.
```

## 16. Group contract

Eies av:

```text
js/ahaGroups.js
```

localStorage-key:

```text
aha_groups_v1
```

### Shape

```js
{
  id: string,
  title: string,
  type: "circle"|"project"|"learning"|"publishing"|"historygo"|"private",
  description: string,
  createdAt: string,
  updatedAt: string,
  tags: string[],
  members: GroupMember[],
  references: GroupReference[],
  source: "aha_groups",
  meta: object,
  deletedAt?: string
}
```

Group member:

```js
{
  id: string,
  name: string,
  role: "owner"|"editor"|"member"|"observer",
  status: "local"|"invited_later"|"inactive",
  addedAt: string,
  meta: object
}
```

Group reference:

```js
{
  id: string,
  title: string,
  type: string,
  source: string,
  refId: string,
  addedAt: string,
  meta: object
}
```

### Regler

```text
Grupper er lokale/sirkler i nåværende versjon.
Medlemmer er lokale records, ikke ekte brukerkontoer.
Referanser peker til eksisterende AHA-objekter.
Ekte EchoNet-deling er ikke kontraktfestet ennå.
```

## 17. Search item contract

Eies av:

```text
js/ahaSearch.js
```

Search item er en read-only indeksform, ikke primær lagringsform.

### Shape

```js
{
  id: string,
  title: string,
  type: string,
  source: string,
  refId: string,
  text: string,
  tags: string[],
  createdAt: string,
  updatedAt: string,
  href: string,
  meta: object
}
```

### Regler

```text
Search item skal ikke lagres som canonical data.
Search item bygges fra eksisterende localStorage-kilder.
Semantic/embedding-søk er ikke del av denne kontrakten ennå.
```

## 18. Mindmap graph contract

Eies av:

```text
js/ahaMindmap.js
```

Graph er read-only avledet form, ikke primær lagringsform.

### Node

```js
{
  id: string,
  title: string,
  type: string,
  source: string,
  refId: string,
  href: string,
  meta: object
}
```

### Edge

```js
{
  id: string,
  from: string,
  to: string,
  type: string,
  label: string,
  meta: object
}
```

### Regler

```text
Graph bygges fra eksisterende AHA-data.
Graph skal ikke mutere source data.
Node-id bygges som type::source::refId.
```

## 19. Privacy settings contract

Eies av:

```text
js/ahaPrivacy.js
```

localStorage-key:

```text
aha_privacy_settings_v1
```

### Shape

```js
{
  id: "aha_privacy_settings",
  localOnly: boolean,
  allowCollectiveLearning: boolean,
  allowPublicPublishing: boolean,
  allowSocialSharing: boolean,
  allowHistoryGoImport: boolean,
  allowAnalytics: boolean,
  updatedAt: string,
  meta: object
}
```

### Regler

```text
localOnly default = true.
allowHistoryGoImport default = true.
Andre delings-/publiseringssamtykker default = false.
Personvernmodulen kan slette lokale AHA-nøkler med bekreftelsen SLETT.
History Go-nøkler vises for transparens, men slettes ikke av Personvern i nåværende versjon.
```

## 20. History Go import contract

Eies på eksport-siden av History Go og på import-siden av:

```text
js/ahaHistoryGoImport.js
```

localStorage-key:

```text
aha_import_payload_v1
```

### Minimum payload shape

```js
{
  exported_at?: string,
  exportedAt?: string,
  updated_at?: string,
  updatedAt?: string,

  nextup_learning_signal?: object,
  hg_learning_log_v1?: object|array,
  hg_insights_events_v1?: object|array,
  knowledge_universe?: object|array,
  notes?: object|array,
  dialogs?: object|array
}
```

### Importprioritet

```text
1. nextup_learning_signal
2. hg_learning_log_v1
3. hg_insights_events_v1
4. knowledge_universe
5. notes
6. dialogs
```

### Source event-regel

Alt importert History Go-materiale skal bruke:

```js
{
  source_app: "historygo",
  imported: true
}
```

Relevante metadatafelt:

```js
{
  concepts?: string[]|object[],
  related_emners?: string[],
  related_emner?: string[],
  categoryId?: string,
  category_id?: string,
  place_id?: string,
  person_id?: string,
  quizId?: string,
  targetId?: string,
  parentTargetId?: string,
  setId?: string,
  correctCount?: number,
  total?: number
}
```

### Regler

```text
History Go-import er valgfri.
AHA skal ikke gjette History Go-emner på nytt.
AHA skal stole på eksportert History Go-metadata.
History Go-import skal gå via AHAIngest, ikke direkte skrive insights uten source event.
```

## 21. Supabase persistence contract

Supabase er best-effort konto-/persistenslag, ikke eneste sannhet ennå.

### Kjente repository-funksjoner / tabeller

```text
source events
- aha_source_events
- saveSourceEvent
- loadSourceEvents

notes
- aha_notes
- saveNote
- loadNotes

gallery
- aha_gallery_items
- saveGalleryItem
- loadGalleryItems

feed
- aha_feed_posts
- saveFeedPost
- loadFeedPosts

insta
- aha_insta_posts
- saveInstaPost
- loadInstaPosts
- saveInstaProfile / loadInstaProfile
- saveInstaLike / loadInstaLikes
- saveInstaComment / loadInstaComments
- saveInstaFollow / loadInstaFollows

imports
- aha_imports
- saveImport
- loadImports

chamber
- aha_insight_chambers
- saveInsightChamber
- loadInsightChamber
```

### Regler

```text
localStorage fallback skal beholdes.
Supabase skal ikke bli eneste sannhet før sync-reglene er låst.
Moduler med pushLocalToDatabase skal først pushe lokal data og deretter lese remote.
Ved konflikt må hver modul ha eksplisitt merge-regel før videre modning.
```

## 22. Sletting / tombstone-regler

Nåværende system bruker blanding av snake_case og camelCase.

```text
deleted_at = mest brukt i notes, gallery, feed, insta og enkelte imported/module records.
deletedAt = mest brukt i lists, paths, articles og groups.
```

Regel fremover:

```text
Modulen skal fortsette med sin eksisterende deletion style til en egen migrering finnes.
Read-moduler skal tåle begge.
Sletting bør være soft delete når data kan være synket.
```

## 23. Naming-regler

```text
localStorage keys = snake_case med versjonssuffix, f.eks. aha_notes_v1.
Modulrecords = kan være snake_case eller camelCase avhengig av eksisterende modul.
BaseItem = camelCase.
SourceEvent = snake_case.
References = bruker source + refId.
Supabase fields = bør primært være snake_case, men repository-laget kan mappe.
```

## 24. Modulkontrakt-matrise

| Objekt | Eier | localStorage | Supabase | Skaper source event? | Skaper insight? | Primær rolle |
|---|---|---|---|---:|---:|---|
| BaseItem | `ahaContracts.js` | nei | nei | nei | nei | felles normalisering |
| SourceEvent | `ahaSources.js` | `aha_source_events_v1` | `aha_source_events` | ja | nei | rålogg |
| Chamber | `insightsChamber.js` / `ahaIngest.js` | `aha_insight_chamber_v1` | `aha_insight_chambers` | nei | ja, via ingest | canonical insight-container |
| Insight | `insightsChamber.js` | inni chamber | inni chamber / embeddings | nei | ja | motor-output |
| Note | `ahaNotes.js` | `aha_notes_v1` | `aha_notes` | ja | create: ja / edit: nei | brukerens tekst |
| GalleryItem | `ahaGallery.js` | `aha_gallery_v1` | `aha_gallery_items` | ja | ja via ingest | visuelt minne |
| FeedPost | `ahaFeed.js` | `aha_feed_posts_v1` | `aha_feed_posts` | ja | ja via ingest | kort post |
| InstaPost | `ahaInsta.js` | `aha_insta_posts_v1` | `aha_insta_posts` | ja | ja via ingest | bilde/video-post |
| InstaStory | `ahaInsta.js` | `aha_insta_stories_v1` | ikke låst | nei | nei | story/visning |
| InstaProfile | `ahaInsta.js` | `aha_insta_profile_v1` | profile-funksjoner | nei | nei | lokal sosial profil |
| InstaLike | `ahaInsta.js` | `aha_insta_likes_v1` | like-funksjoner | nei | nei | sosial action |
| InstaComment | `ahaInsta.js` | `aha_insta_comments_v1` | comment-funksjoner | nei | nei | sosial action |
| InstaFollow | `ahaInsta.js` | `aha_insta_follows_v1` | follow-funksjoner | nei | nei | sosial action |
| List | `ahaLists.js` | `aha_lists_v1` | ikke låst | nei | nei | organisering |
| Path | `ahaPaths.js` | `aha_paths_v1` | ikke låst | nei | nei | prosess/steg |
| Article | `ahaAvisa.js` | `aha_articles_v1` | ikke låst | nei | nei | publiseringsutkast |
| Group | `ahaGroups.js` | `aha_groups_v1` | ikke låst | nei | nei | lokal sirkel |
| SearchItem | `ahaSearch.js` | avledet | nei | nei | nei | read-only indeks |
| MindmapNode/Edge | `ahaMindmap.js` | avledet | nei | nei | nei | read-only graf |
| PrivacySettings | `ahaPrivacy.js` | `aha_privacy_settings_v1` | ikke låst | nei | nei | samtykke/kontroll |
| HistoryGoPayload | `ahaHistoryGoImport.js` | `aha_import_payload_v1` | `aha_imports` | ja ved import | ja via ingest | valgfri import |

## 25. Ikke-bryt-regler

```text
1. Ikke endre source event-shape uten migrering.
2. Ikke skriv insights uten source event når data kommer fra bruker/import.
3. Ikke la AHA-agentens egne svar bli ordinære insights.
4. Ikke la note_edit bli ordinær insight automatisk.
5. Ikke emnematch History Go-import på nytt.
6. Ikke bruk emne_suggestions som bekreftede emner.
7. Ikke gjør Supabase til eneste sannhet uten sync-dokument.
8. Ikke fjern localStorage fallback.
9. Ikke endre deletion style modulvis uten migrering.
10. Ikke bruk search/mindmap som canonical lagring.
11. Ikke gjør AHAavisa published_local til ekte publisering.
12. Ikke gjør Grupper til ekte deling uten privacy/sync-kontrakt.
13. Ikke bygg Meet/Music på egne datakontrakter før core-kontraktene er stabile.
```

## 26. Neste trygge dokument

Neste dokument bør være:

```text
docs/AHA_SYNC_RULES.md
```

Det skal låse:

```text
localStorage ↔ Supabase
last-write-wins vs merge
soft delete / tombstone
push local before pull remote
remote wins vs local wins
offline-first regler
per-modul sync-status
```

Ferdig Notes-kode etter dette:

```text
Notes
```

Ferdig konkret Notes-endring:

```text
note_edit-flyten i js/ahaNotes.js sender skip_insight: true til AHAIngest.
```

Ferdig eksplisitt funksjon:

```text
Eksplisitt "Analyser notat på nytt" / note_reanalysis-handling er lagt til for bevisst ny insight.
```
