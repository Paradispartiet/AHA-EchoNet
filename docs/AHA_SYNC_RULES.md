# AHA Sync Rules

Dette dokumentet låser dagens regler for `localStorage` ↔ Supabase i AHA-EchoNet før mer runtime-kode endres.

Dokumentet er en dokumentasjonslås. Det er ikke en runtime-endring, ikke en Supabase-migrasjon, ikke en endring av tabeller og ikke en modulendring.

Relaterte låser:

```text
docs/AHA_SYSTEM_OVERVIEW.md
docs/AHA_MODULE_MATURITY_MATRIX.md
docs/AHA_DATA_CONTRACT_MATRIX.md
```

Viktig siste kontekst:

```text
PR #299 er merged og gjør note_edit source-only.
Første videre kodekandidat etter dette sync-dokumentet er fortsatt Notes.
```

## 1. Kort definisjon

```text
localStorage = lokal fallback, cache og offline-nær brukerflate.
Supabase = konto-/persistenslag når bruker er innlogget og repository-lag finnes.
AHARepository = valgfri bro mellom modulene og Supabase.
```

Hovedregelen er:

```text
AHA skal alltid kunne fungere lokalt.
Supabase skal styrke persistens og kontoflyt, ikke være eneste sannhetskilde i UI-et.
```

## 2. localStorage som fallback/cache

`localStorage` er fortsatt den tryggeste minimumslagringen for AHA-modulene.

Regler:

```text
1. En modul må kunne lese/skrive egen lokale key uten Supabase.
2. Hvis AHARepository mangler, Supabase-klient mangler eller bruker ikke er innlogget, skal modulen falle tilbake til localStorage.
3. Lokal data skal ikke slettes bare fordi Supabase ikke svarer.
4. Lokal data skal kunne brukes som cache etter vellykket pull fra Supabase.
5. Render bør bruke lokal data først, og deretter oppdatere hvis remote sync lykkes.
```

Dagens repository-fallback bruker eksplisitt fallback-respons, typisk:

```js
{ ok: false, fallback: "localStorage" }
{ ok: false, fallback: "not_signed_in" }
```

## 3. Supabase som konto-/persistenslag når innlogget

Supabase brukes som valgfritt konto- og persistenslag når:

```text
1. AHADb/Supabase-klient finnes.
2. AHAAuth kan finne profile_id.
3. AHARepository har relevant save/load-funksjon.
4. Modulens side eller runtime har lastet repository-laget.
```

Supabase skal da brukes til:

```text
- å lagre brukerens konto-tilknyttede records
- å gjenfinne records på tvers av nettlesere/enheter
- å holde soft delete/tombstone-status der modulen støtter det
- å gi dashboard/counts konto-nære tall når mulig
```

Supabase skal ikke brukes til å overstyre AHA-motoren uten at source/ingest-kontrakt er fulgt.

## 4. Push local before pull remote

For modulene Notes, Galleri og Feed starter dagens sync-regel slik:

```text
1. Les lokal liste fra localStorage.
2. Hvis lokal liste har items, push lokale items til Supabase via AHARepository.
3. Pull remote liste fra Supabase.
```

Etter pull er modulreglene ulike:

```text
Notes: merge local+remote etter id, velg nyeste handling fra deleted_at/updated_at/created_at, skriv merged liste lokalt og render merged liste.
Feed: merge local+remote etter id, velg nyeste handling fra deleted_at/updated_at/created_at, skriv merged liste lokalt og render merged liste.
Galleri: skriv remote-listen tilbake til localStorage og render remote-listen.
```

Formålet er å unngå at lokale endringer som ennå ikke er pushet forsvinner når brukeren logger inn eller når `aha:auth-ready` fyrer. For Notes betyr dette også at en nyere lokal tombstone ikke blindt fjernes av en eldre remote aktiv note etter pull.

Midlertidig konsekvens:

```text
Notes bruker en enkel per-note last-write-wins merge etter pull, med remote som vinner ved lik action time.
For Galleri finnes det i dag ingen full merge per felt etter pull; remote-listen erstatter lokal liste etter at lokale items er forsøkt pushet. For Feed brukes enkel per-post last-write-wins merge etter pull, med remote som vinner ved lik action time.
```

## 5. Last-write-wins som midlertidig regel

Dagens midlertidige konfliktregel er `last-write-wins` der modulen har nok tidspunkt til å sammenligne.

Regler:

```text
1. Nyeste kjente handling vinner.
2. `deleted_at` regnes som en handlingstid, ikke bare som fravær.
3. `updated_at` vinner over eldre `created_at` når det finnes.
4. Hvis modulen ikke har full merge-logikk, brukes push-before-pull og remote-resultatet som ny lokal cache.
5. Dette er midlertidig; det er ikke en endelig multi-device konfliktmodell.
```

Insta har tydeligst last-write-wins i dag:

```text
- poster merges etter id/source_signature og dato fra updated_at/deleted_at/created_at
- likes/comments/follows reconciles etter action time
- nyere tombstone kan vinne over stale lokal aktiv rad
- nyere lokal handling kan vinne over stale remote tombstone
```

## 6. Soft delete / tombstones

Sletting skal være soft delete der modulens contract har `deleted_at`.

Regler:

```text
1. Sletting setter `deleted_at` til ISO-tidspunkt.
2. UI-render filtrerer bort items med `deleted_at`.
3. Soft-deleted items skal fortsatt kunne pushes til Supabase slik at slettingen bevares.
4. En tombstone må ikke blindt fjernes fra lokal cache før remote har fått mulighet til å se den.
5. Hard delete er ikke default sync-regel.
```

Dette gjelder i dag særlig:

```text
Notes: deleted_at + updated_at ved delete.
Galleri: deleted_at ved delete.
Feed: deleted_at + updated_at ved delete.
Insta posts: deleted_at ved delete.
Insta likes/comments/follows: deleted_at/null som action-status.
```

## 7. Hvordan `deleted_at` og `deletedAt` håndteres

Dagens modulrecords bruker primært snake_case:

```text
deleted_at
created_at
updated_at
```

Base contract bruker camelCase for base-felt:

```text
createdAt
updatedAt
```

Sync-regler:

```text
1. Supabase-facing modulrecords skal bruke `deleted_at`.
2. localStorage modulrecords for Notes/Galleri/Feed/Insta skal bruke `deleted_at`.
3. `deletedAt` er ikke dagens canonical felt for disse modulrecords.
4. Hvis kode møter `deletedAt` fra eldre/ekstern data, må fremtidig normalisering mappe det til `deleted_at` før repository-save.
5. Ikke innfør blandet `deleted_at`/`deletedAt` i samme modul uten eksplisitt migreringsregel.
```

Praktisk regel:

```text
For sync: `deleted_at` er canonical.
For base item: behold eksisterende base contract-format.
```

## 8. Hvordan Notes, Galleri, Feed og Insta syncer i dag

### 8.1 Notes

Dagens lag:

```text
localStorage-key: aha_notes_v1
Supabase-tabell: aha_notes
Repository: AHARepository.saveNote(...) / AHARepository.loadNotes(...)
```

Dagens flow:

```text
create note
→ AHAIngest source_type=note
→ source event + insight
→ localStorage aha_notes_v1
→ best-effort saveNote
```

```text
edit note
→ AHAIngest source_type=note_edit, skip_insight=true
→ source event only
→ localStorage aha_notes_v1
→ best-effort saveNote
```

```text
delete note
→ set deleted_at and updated_at
→ localStorage aha_notes_v1
→ best-effort saveNote
→ render hides deleted note
```

Sync:

```text
syncFromDatabase pushes all local notes first, then pulls remote notes, merges local and remote notes by id, saves the merged list locally and renders.
```

Notes conflictregel:

```text
1. Sammenlign nyeste handlingstid fra deleted_at, updated_at og created_at.
2. deleted_at teller som handlingstid.
3. Nyeste handling vinner.
4. Ved lik handlingstid vinner remote note.
5. Hvis remote pull feiler, skal lokal cache ikke slettes.
```

### 8.2 Galleri

Dagens lag:

```text
localStorage-key: aha_gallery_v1
Supabase-tabell: aha_gallery_items
Repository: AHARepository.saveGalleryItem(...) / AHARepository.loadGalleryItems(...)
```

Dagens flow:

```text
create gallery item
→ AHAIngest source_type=gallery
→ source event + insight
→ localStorage aha_gallery_v1
→ best-effort saveGalleryItem
```

```text
delete gallery item
→ set deleted_at
→ localStorage aha_gallery_v1
→ best-effort saveGalleryItem
→ render hides deleted item
```

Sync:

```text
syncFromDatabase pushes local gallery items first, then pulls remote gallery items, saves remote list locally and renders.
```

Merk:

```text
Galleri er URL/path/dataURL MVP. Ekte storage skal ikke bygges før storage/sync-kontrakt er låst.
```

### 8.3 Feed

Dagens lag:

```text
localStorage-key: aha_feed_posts_v1
Supabase-tabell: aha_feed_posts
Repository: AHARepository.saveFeedPost(...) / AHARepository.loadFeedPosts(...)
```

Dagens flow:

```text
create feed post
→ AHAIngest source_type=feed_post
→ source event + insight
→ localStorage aha_feed_posts_v1
→ best-effort saveFeedPost
```

```text
delete feed post
→ set deleted_at and updated_at
→ localStorage aha_feed_posts_v1
→ best-effort saveFeedPost
→ render hides deleted post
```

Sync:

```text
syncFromDatabase pushes local feed posts first, then pulls remote feed posts, merges local and remote posts by id, saves the merged list locally and renders.
```

### 8.4 Insta

Dagens lag:

```text
localStorage-key: aha_insta_posts_v1
localStorage-key: aha_insta_stories_v1
localStorage-key: aha_insta_import_sessions_v1
localStorage-key: aha_insta_import_preview_v1
localStorage-key: aha_insta_profile_v1
localStorage-key: aha_insta_likes_v1
localStorage-key: aha_insta_comments_v1
localStorage-key: aha_insta_follows_v1
```

Supabase/repository finnes i dag for:

```text
AHARepository.saveInstaPost(...) / AHARepository.loadInstaPosts(...)
AHARepository.saveInstaProfile(...) / AHARepository.loadInstaProfile(...)
AHARepository.saveInstaLike(...) / AHARepository.loadInstaLikes(...)
AHARepository.saveInstaComment(...) / AHARepository.loadInstaComments(...)
AHARepository.saveInstaFollow(...) / AHARepository.loadInstaFollows(...)
```

Dagens post-flow:

```text
create AHA Insta post
→ AHAIngest source_type=insta_post
→ source event + insight
→ localStorage aha_insta_posts_v1
→ best-effort saveInstaPost
```

```text
delete Insta post
→ set deleted_at
→ localStorage aha_insta_posts_v1
→ best-effort saveInstaPost
→ render hides deleted post
```

Dagens post-sync:

```text
1. Load local posts.
2. Push active local posts before pull.
3. Load remote posts.
4. Merge local and remote by id/source_signature.
5. Prefer newest by updated_at/deleted_at/created_at, with remote preferred on equal/incoming cases.
6. Save merged list locally and render.
```

Dagens social-sync:

```text
1. Load remote likes/comments/follows when repository supports it.
2. Reconcile local and remote by id.
3. Compare action time from deleted_at/updated_at/created_at.
4. Save reconciled collection locally.
5. Push reconciled collection back to Supabase.
```

Merk:

```text
Insta social actions er syncbare actions, ikke en ferdig offentlig sosial graf.
Insta import preview/sessions/stories er primært lokale i dagens kontrakt.
```

## 9. Moduler som ikke har Supabase-sync ennå

Følgende moduler er localStorage-only eller read-only uten egen Supabase-sync i dagens modulkontrakt:

```text
Innsikter
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

Nyanse:

```text
AHA Chat har delvis repository/chamber/embedding-koblinger, men er ikke dekket av denne modulvise Notes/Galleri/Feed/Insta-syncregelen.
AHA Profil leser konto-/dashboardstatus via underliggende auth/repo, men eier ikke en egen full syncet profildatamodul i denne låsen.
History Go-import kan lagre import via repository hvis repository-laget er lastet, men siden er primært en manuell/lokal importflate.
```

Ikke bygg Supabase-sync for disse modulene før egen contract/sync-regel er låst.

## 10. Konfliktregler per modul

| Modul | Dagens konfliktregel | Tombstone-regel | Risiko | Midlertidig beslutning |
|---|---|---|---|---|
| Notes | Push local før pull remote; merge local+remote by id; newest wins by deleted_at/updated_at/created_at; remote wins on equal action time. | `deleted_at` + `updated_at` ved delete; render filtrerer slettede. | Ingen full felt-merge; stale remote kan fortsatt påvirke cache hvis remote har nyere action time. | Behold enkel Notes-merge; ikke bygg full versjonering ennå. |
| Galleri | Push local før pull remote; remote-listen blir lokal cache etter pull. | `deleted_at` ved delete; render filtrerer slettede. | Ingen full felt-merge; media-storage ikke løst. | Behold URL/path MVP. Ikke bygg storage ennå. |
| Feed | Push local før pull remote; merge local+remote by id; newest wins by deleted_at/updated_at/created_at; remote wins on equal action time. | `deleted_at` + `updated_at` ved delete; render filtrerer slettede. | Ingen full felt-merge; stale remote kan fortsatt påvirke cache hvis remote har nyere action time. | Behold enkel postmodell. |
| Insta posts | Push aktive lokale poster før pull; merge local+remote by id/source_signature; newest wins by updated_at/deleted_at/created_at. | `deleted_at` ved delete; render filtrerer slettede. | Active-only pre-push kan gjøre lokale tombstones avhengige av tidligere persistPost. | Ikke utvid før Insta har eget kontraktdokument. |
| Insta profile | Remote profile kan oppdatere lokal profile hvis remote `updated_at` er nyere. | Ingen post-tombstone-regel. | Profil er modulspesifikk og ikke full kontoprofilmodell. | Behold enkel profile-sync. |
| Insta likes/comments/follows | Reconcile by id; newest action time wins. | `deleted_at` tombstone vinner når nyere; null betyr aktiv handling. | Lokal sosial graf er simulert. | Ikke gjør dette til ekte sosial graf ennå. |
| History Go-import | Lokal/manual import; repository-save kan skje hvis lag finnes. | Ikke modulvis tombstone i denne låsen. | Import kan ikke bli AHA-grunnlag uten samtykke/flyt. | Behold manuell import. |
| Lister/Stier/AHAavisa/Grupper/Søk/Personvern | Ingen egen Supabase-sync. | Ikke låst. | Risiko for brudd hvis sync bygges uten contract. | Dokumenter kontrakt før kode. |
| Meet/Music | Ingen reell dataflyt. | Ikke relevant. | Rene skall. | Ikke bygg før core er stabil. |

## 11. Ikke-bryt-regler

Disse reglene skal gjelde før videre kodeendringer:

```text
1. Ikke fjern localStorage fallback.
2. Ikke gjør Supabase obligatorisk for moduler som fungerer lokalt i dag.
3. Ikke endre Supabase-tabeller uten egen migrasjons-/contract-lås.
4. Ikke bytt canonical delete-felt fra deleted_at til deletedAt i modulrecords.
5. Ikke hard-delete tombstones som fortsatt trengs for sync.
6. Ikke la note_edit lage ny insight automatisk; PR #299 gjør note_edit source-only.
7. Ikke bygg Galleri storage/opplasting før storage/sync-kontrakt er låst.
8. Ikke bygg ekte EchoNet-/gruppe-deling før privacy og sync er låst.
9. Ikke bygg Supabase-sync for localStorage-only moduler uten modulkontrakt.
10. Ikke innfør ny innsiktsmotor; bruk AHASources → AHAIngest → InsightsEngine.
11. Ikke la remote pull slette lokal data ved auth-/nettverksfeil.
12. Ikke endre runtime-kode som del av dette dokumentet.
```

## 12. Neste trygge kodekandidat etter sync-dokumentet

Neste trygge kodekandidat er fortsatt Notes.

Begrunnelse:

```text
- enkel dataform
- eksisterende localStorage-key: aha_notes_v1
- eksisterende Supabase-tabell: aha_notes
- eksisterende AHARepository.saveNote/loadNotes
- eksisterende soft delete med deleted_at
- PR #299 har låst note_edit som source-only
- lavere risiko enn Insta, Galleri storage eller gruppe-/sharing-lag
```

Trygg Notes-retning etter dette dokumentet:

```text
1. Verifiser Notes sync uten å endre andre moduler.
2. Normaliser Notes conflict-regel eksplisitt i kode hvis nødvendig.
3. Behold note_edit source-only.
4. Behold deleted_at som canonical tombstone-felt.
5. Ikke innfør rik editor, versjonering eller reanalyse før sync er stabil.
```

Første konkrete kandidat:

```text
Notes: gjør sync-regelen tydeligere og tryggere rundt local tombstones / remote pull, uten å endre source-only-regelen for note_edit.
```
