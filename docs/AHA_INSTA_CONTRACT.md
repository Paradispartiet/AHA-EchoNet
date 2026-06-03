# AHA Insta contract

Status: kontrakt før videre kodearbeid.

Denne filen låser AHA Insta som dokumentert modulflate før storage, import, sosial graf eller større sync-endringer bygges videre.

## 1. Formål

AHA Insta er AHA sin personlige, local-first sosiale/memoir/media-flate. Modulen lar brukeren lage og vise Insta-lignende poster, import-preview fra Instagram-eksport, stories, profil og lokale sosiale handlinger.

AHA Insta er ikke et ferdig offentlig sosialt nettverk. `visibility`, likes, comments og follows finnes som lokal/synkbar modell, men betyr ikke at AHA har bygget EchoNet/offentlig publisering, global feed, gruppepublisering eller ekte offentlig sosial graf.

## 2. Ikke-bryt-regler

Følgende er låst for videre arbeid til egen kontrakt eller egen PR finnes:

- Ikke bygg ekte sosial graf i AHA Insta.
- Ikke bygg offentlig deling eller EchoNet-publisering.
- Ikke bygg storage/opplasting ennå.
- Ikke bygg ZIP-import ennå hvis den ikke allerede er trygg og dokumentert.
- Ikke la likes, comments eller follows bli ordinære insights automatisk.
- Ikke la profile changes bli ordinære insights automatisk.
- Ikke la import-preview bli ordinære insights automatisk.
- Ikke endre `AHAIngest`.
- Ikke endre `AHARepository`.
- Ikke endre AHA-motoren.
- Ikke endre andre moduler som del av AHA Insta-kontrakten.

## 3. LocalStorage keys

Alle kjente AHA Insta localStorage-nøkler fra `js/ahaInsta.js`:

| Key | Innhold | Nåværende syncstatus |
| --- | --- | --- |
| `aha_insta_posts_v1` | Insta posts | Lokal cache + best-effort `AHARepository.saveInstaPost` / `loadInstaPosts` |
| `aha_insta_stories_v1` | Insta stories | Primært lokal i dagens kode |
| `aha_insta_import_sessions_v1` | Import sessions | Lokal statuslogg for importforsøk |
| `aha_insta_import_preview_v1` | Import preview items | Lokal preview før valgt import |
| `aha_insta_profile_v1` | Lokal AHA Insta-profil | Lokal cache + best-effort `saveInstaProfile` / `loadInstaProfile` |
| `aha_insta_likes_v1` | Likes | Lokal/synkbar social action |
| `aha_insta_comments_v1` | Comments | Lokal/synkbar social action |
| `aha_insta_follows_v1` | Follows | Lokal/synkbar social action |

## 4. Insta post contract

LocalStorage key: `aha_insta_posts_v1`.

### Shape

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
  visibility: "public"|"private"|string,
  like_count: number,
  comment_count: number,
  created_at: string,
  updated_at?: string,
  deleted_at?: string|null,
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

### Required fields

- `id`: unik lokal post-id.
- `title`: teksttittel, kan være tom streng.
- `src`: media-URL, path eller DataURL/local preview-verdi, kan være tom streng.
- `caption`: posttekst, kan være tom streng.
- `content_type`: media/content type. Dagens ny-post-flyt bruker `image` eller `video`.
- `tags`: array, default `[]`.
- `ownerId`: lokal AHA Insta profile-id.
- `ownerUsername`: lokal AHA Insta username.
- `visibility`: kontraktuell/lokal synlighet, default `public` for ny AHA Insta-post.
- `like_count`: tallfelt, default `0`; UI teller i praksis aktive likes fra social action-listen.
- `comment_count`: tallfelt, default `0`; UI teller i praksis aktive comments fra social action-listen.
- `created_at`: ISO-tidspunkt.
- `source_signature`: dedupe-signatur beregnet fra kilde/media/tid/caption/permalink.
- `meta`: objekt, default `{}`.

### Optional fields

- `updated_at`: kan finnes fra remote/repository eller senere endringsflyt.
- `deleted_at`: soft-delete tombstone; manglende/null betyr aktiv post.
- `imported`: `true` når posten er importert fra Instagram-preview; `false`/manglende for vanlig AHA Insta-post.
- `source_app`: for nye AHA-post-events er `aha_insta`; importerte post-records bruker i dagens kode `instagram` som record-kilde.
- `source_type`: for ingest-event er `insta_post`; importerte post-records bruker i dagens kode `instagram_export` som importkilde.
- `originalInstagramDate`: original dato fra Instagram-eksport når kjent.
- `last_source_event_id`: id fra `AHAIngest` når ny post faktisk ingestes.
- `base`: optional BaseItem fra `AHAContracts.createBaseItem`.

### Derived / normalized fields

- `content_type` avledes fra media type når ikke eksplisitt satt.
- `ownerId` / `ownerUsername` fylles fra lokal profile ved normalisering.
- `source_signature` beregnes av `createPostSignature` og brukes for dedupe/merge.
- `like_count` og `comment_count` er ikke canonical sosial graf; aktiv visning bruker lokale/synkbare social action-lister.
- `base` kan avledes ved ny post via AHAContracts, men er ikke nødvendig for importerte poster.

## 5. Insta story contract

LocalStorage key: `aha_insta_stories_v1`.

### Shape

```js
{
  id: string,
  ownerId: string,
  ownerUsername: string,
  mediaType: "image"|"video"|"unknown"|string,
  src: string,
  caption: string,
  created_at: string,
  expiresAt: string,
  originalInstagramDate?: string|null,
  imported: boolean,
  archived: boolean,
  source_app?: string,
  source_type?: string,
  visibility: "public"|"private"|string,
  meta: object
}
```

### Feltregler

- `id`, `ownerId`, `ownerUsername`, `mediaType`, `src`, `caption`, `created_at`, `expiresAt`, `imported`, `archived`, `visibility` og `meta` er dagens aktive story-felt.
- `originalInstagramDate` brukes når story kommer fra Instagram-preview og originaldato finnes.
- Importerte stories får i dagens kode `imported: true`, `archived: false`, `source_app: "instagram"`, `source_type: "instagram_export"` og `meta.import_session_id`.
- Stories rendres bare når `archived` ikke er satt/truthy.
- Stories er primært lokale i dagens kontrakt; ingen egen repository-sync er dokumentert i `js/ahaInsta.js`.

## 6. Insta profile contract

LocalStorage key: `aha_insta_profile_v1`.

### Shape

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

Dette er lokal AHA Insta-profil for Insta-flaten. Den er ikke nødvendigvis full AHA-kontoprofil, identitetsmodell eller global brukerprofil.

Feltregler:

- `id`: lokal profil-id, default genereres med `user_...`.
- `username`: lokal handle, default `meg`, normaliseres uten `@`.
- `displayName`: visningsnavn, default `Meg` eller username.
- `bio`: lokal profiltekst.
- `avatar`: lokal avatar-URL/path/DataURL-verdi.
- `created_at`: første opprettelsestidspunkt.
- `updated_at`: siste profilendringstidspunkt og sammenligningsfelt ved profile-sync.

## 7. Social action contracts

AHA Insta social actions er lokale/synkbare handlinger. De er ikke ekte offentlig sosial graf, ikke globale relasjoner, ikke offentlig publisering og ikke ordinære AHA insights.

### 7.1 Likes

LocalStorage key: `aha_insta_likes_v1`.

```js
{
  id: string,
  post_id: string,
  user_id: string,
  created_at: string,
  deleted_at: string|null
}
```

Regler:

- `deleted_at: null` betyr aktiv like.
- `deleted_at: string` betyr unlike/tombstone.
- I lokal cache fjernes like-record ved unlike, men tombstone-record sendes best-effort til repository.
- Sync bruker `AHARepository.saveInstaLike` / `loadInstaLikes` når tilgjengelig.
- Sync sammenligner action time fra `deleted_at`, `updated_at`, `created_at`.
- Reconciled lokal likes-liste filtrerer bort tombstones (`keepDeleted: false`).

### 7.2 Comments

LocalStorage key: `aha_insta_comments_v1`.

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

Regler:

- `deleted_at: null` betyr aktiv kommentar.
- `deleted_at: string` betyr soft-deleted kommentar.
- Comments beholdes lokalt etter reconcile også når deleted (`keepDeleted: true`).
- UI viser bare kommentarer uten `deleted_at`.
- Sync bruker `AHARepository.saveInstaComment` / `loadInstaComments` når tilgjengelig.
- Sync sammenligner action time fra `deleted_at`, `updated_at`, `created_at`.

### 7.3 Follows

LocalStorage key: `aha_insta_follows_v1`.

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

Regler:

- `deleted_at: null` betyr aktiv follow.
- `deleted_at: string` betyr unfollow/tombstone.
- I lokal cache fjernes follow-record ved unfollow, men tombstone-record sendes best-effort til repository.
- Sync bruker `AHARepository.saveInstaFollow` / `loadInstaFollows` når tilgjengelig.
- Sync sammenligner action time fra `deleted_at`, `updated_at`, `created_at`.
- Reconciled lokal follows-liste filtrerer bort tombstones (`keepDeleted: false`).

## 8. Import contracts

### 8.1 Import sessions

LocalStorage key: `aha_insta_import_sessions_v1`.

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

En import session representerer ett lokalt importforsøk. Den dokumenterer parsermodus, status, filer som ble sett, teller for preview-resultat og lokale parserfeil. Den er ikke et bevis på offentlig publisering eller ferdig importert AHA-data.

### 8.2 Import preview

LocalStorage key: `aha_insta_import_preview_v1`.

```js
{
  id: string,
  source: "instagram_export",
  originalInstagramId: string,
  originalInstagramDate: string|null,
  mediaType: "image"|"video"|"unknown"|string,
  src: string,
  caption: string,
  title: string,
  type: "post"|"story"|"media"|string,
  imported: true,
  visibility: "private"|"public"|string,
  created_at: string,
  meta: object
}
```

Preview representerer mulige import-items før brukeren fullfører import. Preview er ikke insight, ikke offentlig post og ikke ferdig AHA-publisering.

### 8.3 Imported posts

Når bruker fullfører import av preview-item som ikke er story:

- Det opprettes/merges en post i `aha_insta_posts_v1`.
- `imported: true` markerer at posten kommer fra importflyt.
- `source_app` settes i dagens record til `instagram`.
- `source_type` settes i dagens record til `instagram_export`.
- `visibility` settes fra brukerens importvalg (`private` default, `public` hvis valgt), men dette er fortsatt lokal/kontraktuell synlighet.
- `source_signature` beregnes og brukes for dedupe/merge mot eksisterende posts.
- `persistPost` kalles bare når posten er ny eller fingerprint endres.
- Ingest skjer bare når eksisterende kode faktisk gjør det: bruker har valgt `connectIngest`, posten er ny/endret, og posten har `caption` eller `title`.
- Importerte poster som ingestes bruker source event med `source_type: "insta_post"` og `source_app: "aha_insta"`.

Instagram-import skal ikke automatisk bli offentlig publisering.

### 8.4 Imported stories

Når bruker fullfører import av preview-item med `type: "story"`:

- Det opprettes en story i `aha_insta_stories_v1`.
- `imported: true` markerer importert story.
- `source_app: "instagram"` og `source_type: "instagram_export"` markerer importkilde i story-record.
- `meta.import_session_id` peker til import session når tilgjengelig.
- Story ingestes ikke automatisk til AHAIngest i dagens kode.
- Story publiseres ikke offentlig automatisk.

## 9. Ingest-regler

- Ny AHA Insta-post kan gå til `AHAIngest`.
- Source event for ny/importert post som faktisk ingestes skal bruke `source_type: "insta_post"`.
- Source event skal bruke `source_app: "aha_insta"`.
- `content_type` skal følge media/content type (`image`, `video` eller annen dokumentert type).
- `title` og `caption` blir analysetekst ved å slå sammen title og caption med linjeskift.
- Ny brukeropprettet post bruker `imported: false` i ingest-event.
- Importert post bruker `imported: true` i ingest-event bare når importflyten faktisk velger ingest.
- Likes, comments og follows skal ikke automatisk bli ordinære insights.
- Profile changes skal ikke automatisk bli ordinære insights.
- Import-preview skal ikke automatisk bli insight før import/ingest er valgt.
- Stories skal ikke automatisk ingestes uten egen dokumentert flyt.

## 10. Sync-regler

Dette beskriver dagens sync slik den faktisk finnes i `js/ahaInsta.js`. Dette er dokumentasjon, ikke runtime-endring.

### 10.1 Posts

Repository-metoder når tilgjengelig:

```text
AHARepository.saveInstaPost(...)
AHARepository.loadInstaPosts(...)
```

Dagens post-sync:

1. Last lokale posts fra `aha_insta_posts_v1`.
2. Push både aktive lokale posts og `deleted_at` tombstones til repository før pull.
3. Last remote posts.
4. Merge local + remote med `mergePosts`.
5. Dedupe/merge matcher først på `id`, deretter på `source_signature`.
6. Ved match sammenlignes `updated_at`, `deleted_at`, `created_at` via `resolvePostDate`.
7. Remote/incoming foretrekkes ved lik eller nyere action time.
8. Merged liste lagres lokalt og render filtrerer bort `deleted_at`.

Post-sync er derfor ikke lenger active-only i pre-push-steget: lokale post-tombstones får ny mulighet til å nå repository før remote pull, selv om tidligere best-effort `persistPost` ikke rakk å lagre tombstone.

### 10.2 Profile

Repository-metoder når tilgjengelig:

```text
AHARepository.saveInstaProfile(...)
AHARepository.loadInstaProfile(...)
```

Dagens profile-sync:

- Lokal profile lagres via `saveProfile` og best-effort `saveInstaProfile`.
- Ved sync lastes remote profile hvis repository støtter det.
- Remote profile erstatter lokal profile bare når `remote.updated_at` er nyere enn lokal `updated_at`, eller lokal mangler.
- Remote `display_name` mappes til lokal `displayName`, og remote `local_id` kan mappes til lokal `id`.
- Profile-sync er ikke full AHA-kontoprofil-sync.

### 10.3 Likes

- Bruker `loadInstaLikes` / `saveInstaLike` når repository støtter det.
- Reconcile skjer by `id`.
- Nyeste action time vinner, basert på `deleted_at`, `updated_at`, `created_at`.
- Reconciled state pushes tilbake.
- Lokalt beholdes bare aktive likes etter reconcile.

### 10.4 Comments

- Bruker `loadInstaComments` / `saveInstaComment` når repository støtter det.
- Reconcile skjer by `id`.
- Nyeste action time vinner, basert på `deleted_at`, `updated_at`, `created_at`.
- Reconciled state pushes tilbake.
- Lokalt beholdes også deleted comments etter reconcile slik at comment tombstones kan leve videre lokalt.

### 10.5 Follows

- Bruker `loadInstaFollows` / `saveInstaFollow` når repository støtter det.
- Reconcile skjer by `id`.
- Nyeste action time vinner, basert på `deleted_at`, `updated_at`, `created_at`.
- Reconciled state pushes tilbake.
- Lokalt beholdes bare aktive follows etter reconcile.

### 10.6 Stories

- Stories lagres i `aha_insta_stories_v1`.
- Dagens kode har `loadStories` / `saveStories`, men ingen repository-metoder for story-sync i `js/ahaInsta.js`.
- Stories er derfor primært lokale i dagens kontrakt.
- Importerte stories opprettes ved fullført import og render filtrerer bort `archived`.

### 10.7 Import sessions

- Import sessions lagres i `aha_insta_import_sessions_v1`.
- Dagens kode har `loadImportSessions`, `saveImportSessions`, `createImportSession` og `updateImportSession`.
- Det finnes ingen repository-sync for import sessions i `js/ahaInsta.js`.
- Sessions er lokal status/logg for importforsøk.

### 10.8 Import preview

- Import preview lagres i `aha_insta_import_preview_v1`.
- Preview skrives etter parsing og slettes med `clearImportPreview` når valgte items fullføres.
- Det finnes ingen repository-sync for import preview i `js/ahaInsta.js`.
- Preview er lokal og skal ikke automatisk bli insight, offentlig post eller sosial publisering.

## 11. Tombstone-regler

- `deleted_at` betyr soft delete/tombstone.
- `deleted_at` skal telle som action time når sync sammenligner status.
- `deleted_at: null` eller manglende `deleted_at` betyr aktiv record.
- UI/render skal filtrere bort tombstoned posts/comments der dagens kode gjør det.
- For social actions er `deleted_at` canonical action status: newer tombstone vinner over stale active record, newer active record vinner over stale tombstone.
- Insta post delete setter `deleted_at` og `updated_at` til samme tombstone-tidspunkt, og post-sync pusher både aktive posts og tombstones før pull.
- Ikke hard-delete tombstones som fortsatt trengs for sync.

## 12. Storage/media-regler

- AHA Insta er ikke en ferdig storage-løsning.
- `src` kan være URL, path eller DataURL/local preview i dagens MVP.
- DataURL/local preview kan finnes for små lokale importfiler, men er ikke endelig storage.
- Dagens kode har lokal størrelsesgrense for DataURL-import og peker på at større filer må håndteres via Storage/backend senere.
- Ekte filopplasting/storage skal ha egen kontrakt før kode.
- Ikke bygg storage/opplasting i denne PR-en.

## 13. Public/private/group-regler

- `visibility` kan finnes på posts, stories og preview/importvalg.
- `public` / `private` er foreløpig lokal/kontraktuell status, ikke nødvendigvis ekte offentlig publisering.
- Instagram-import skal ikke bli offentlig publisering automatisk.
- EchoNet/offentlig deling er ikke bygget her.
- Grupper, public feed, global discovery eller offentlig publisering må ikke kobles inn uten egen privacy- og sync-kontrakt.

## 14. Kjente hull / risiko

- AHA Insta er større og mer kompleks enn Notes, Feed og Galleri.
- Storage/opplasting er ikke låst.
- ZIP-import skal ikke regnes som ferdig; dagens kode avviser `.zip` med feilmelding og parser ikke ZIP.
- Ekte sosial graf er ikke bygget.
- Likes/comments/follows er lokal/simulert sosial modell, ikke offentlig graf.
- Public/private er ikke ekte publiseringssystem ennå.
- Tombstone/sync for posts pusher nå lokale `deleted_at`-records før pull, men full felt-merge/versjonering er fortsatt ikke bygget.
- Stories kan trenge egen syncregel senere.
- Import preview og import sessions kan trenge egen syncregel senere.
- Importerte stories har ikke ingest-flow i dagens kode.
- Importert post-record bruker `source_app: "instagram"` / `source_type: "instagram_export"`, mens ingest-event for importert post bruker `source_app: "aha_insta"` / `source_type: "insta_post"`; dette skillet må bevares til eventuell senere migrering er dokumentert.

## 15. Neste trygge kodekandidat etter dokumentet

Tombstone/sync-kandidaten for posts er utført på lavt nivå: post-sync pusher nå både aktive posts og `deleted_at` tombstones før pull. Neste trygge kodekandidat bør fortsatt holde seg innen eksisterende avgrensninger og ikke bygge større Insta-flater uten egen kontrakt.

Avgrensning for senere PR-er:

- Ikke bygg storage.
- Ikke bygg sosial graf.
- Ikke bygg import.
- Ikke endre AHAIngest.
- Ikke endre AHARepository utover eventuell allerede-kontraktfestet bruk.
- Ikke endre andre moduler.
