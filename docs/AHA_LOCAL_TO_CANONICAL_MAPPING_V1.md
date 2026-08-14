# AHA Local-to-Canonical Mapping v1

Status: **førstegangsimport- og migreringskart — ingen runtimeaktivering**  
Dato: 14. august 2026

Dette dokumentet bestemmer hvilke lokale AHA-data som har en canonical PostgreSQL-mapping i Backend Foundation v1, hvilke som forblir lokale eller legacy, og hvilke som krever en senere domenemigrering.

Hovedregelen er:

```text
Ingen localStorage-key blir lastet opp bare fordi brukeren logger inn.
Ingen ukjent form blir tolket som en nærliggende canonical type.
Ingen privacy setting regnes som server-side samtykke.
```

## 1. Importnivåer

| Status | Betydning |
|---|---|
| `mapped` | Har definert canonical mål og kan inngå i en senere eksplisitt import. |
| `device_only` | Er enhets-/UI-state og skal ikke bli canonical brukerdata. |
| `local_only` | Skal forbli lokalt med mindre en ny kontrakt og brukerhandling innføres. |
| `deferred` | Domenet er reelt, men denne schema-versjonen har ikke trygg mapping. |
| `derived` | Kan regenereres fra canonical data og skal ikke være egen sannhet. |
| `rejected` | Skal ikke importeres til canonical modell. |

## 2. Canonical mapping

### AHA Chat

| Lokal kilde | Status | Canonical mål | Regel |
|---|---|---|---|
| `aha_chat_sessions_v1[]` | `mapped` | `aha.conversations` | Én lokal session blir én samtale i valgt privat workspace. Stabil lokal ID beholdes. |
| `session.messages[]` | `mapped` | `aha.messages` | Rolle, tekst, createdAt, tags, concepts og metadata normaliseres; rekkefølge bestemmes deterministisk. |
| `aha_chat_current_session_v1` | `device_only` | Ingen | Dette er aktiv UI/session-peker og skal ikke synkroniseres som canonical objekt. |
| tekniske/statusmeldinger | `rejected` eller eksplisitt beholdt | Ingen som standard | Importpreview skal kunne ekskludere rent tekniske meldinger; ingen skjult heuristisk sletting etter import. |

Agent- og brukermeldinger bevares som meldinger. At AHA-agentens svar ikke skal bli ordinære insights gjelder fortsatt; melding og insight er separate domener.

### Source events

| Lokal kilde | Status | Canonical mål | Regel |
|---|---|---|---|
| `aha_source_events_v1[]` | `mapped` | `aha.source_events` | Stabil event-ID, source type/app, content type, tekst, tags, metadata og created time bevares. |
| source event vedlegg | `deferred` | `aha.source_attachments` | Bare når storage-/filkontrakt finnes; dataURL og private filer lastes ikke opp automatisk. |

Source event kan importeres uten at det opprettes en insight. `skip_insight`-semantikken beholdes.

### Insight chamber

| Lokal kilde | Status | Canonical mål | Regel |
|---|---|---|---|
| `aha_insight_chamber_v1.insights[]` | `mapped` | `aha.insights` + `aha.insight_versions` | Insight-ID beholdes. Aktiv formulering blir første canonical versjon. Historiske feltvarianter normaliseres gjennom importadapter, ikke i database-trigger. |
| source-referanser på insight | `mapped` | `source_event_id` / provenance | Alle verifiserbare source IDs bevares; uklare varianter rapporteres som import warning. |
| insight-relasjoner | `mapped` når eksplisitt | `aha.insight_relations` | Bare navngitte/eksplisitte relasjoner importeres. Semantisk likhet alene blir ikke relasjon. |
| kvalitetsfeedback | `mapped` når den er knyttet til insight/analyse | `aha.insight_feedback` | Respons, domain, source hash og tid bevares. |
| `superseded`, `contested` og andre minnestatuser | `mapped` | `aha.memory_revisions` + insight status | Audit-historikk beholdes; inaktivt minne gjøres ikke aktivt ved import. |
| chamberets toppnivå-blob | `derived` / legacy archive | Ingen canonical blob | Hele JSONB-chamberet er ikke system of record i v1. En importkvittering kan lagre hash og telling, ikke en skjult ny canonical blob. |
| `patterns`, `meta_insights`, `metaProfile` | `deferred` | Senere eksplisitt modell | Skal ikke pakkes inn i `insights` uten egen kontrakt. |
| `emne_suggestions`, `merge_suggestions` | `deferred` / candidate | Senere review-kontrakt | Forslag er ikke canonical sannhet og blir ikke automatisk bekreftet. |

### Begrepslister

| Lokal kilde | Status | Canonical mål | Regel |
|---|---|---|---|
| `aha_concept_lists_v1[]` | `mapped` | `aha.concept_lists` | ID, tittel, beskrivelse, type, tags, metadata og source bevares. |
| `terms[]` / begrepsposter | `mapped` | `aha.concept_list_items` | Begrep, definisjon, posisjon og metadata normaliseres til egne rader. |

### Generelle samlinger

| Lokal kilde | Status | Canonical mål | Regel |
|---|---|---|---|
| `aha_lists_v1[]` | `deferred` | Ingen i schema v1 | Dette er generelle referansesamlinger, ikke begrepslister. De skal ikke feilaktig importeres til `aha.concept_lists`. |
| `list.items[]` | `deferred` | Senere `collections`-modell eller eksplisitt mapping | Referanseintegritet og tombstones må kontraktfestes først. |

### Kunnskapsstier

| Lokal kilde | Status | Canonical mål | Regel |
|---|---|---|---|
| `aha_paths_v1[]` | `mapped` | `aha.knowledge_paths` | ID, mål, type, mode, beskrivelse, læringsutbytte, tags og metadata bevares. |
| `path.steps[]` | `mapped` | `aha.knowledge_path_steps` | ID, source/refId, order, status, narrativ og ferdigkriterium normaliseres. |

Hard-fjernede lokale steps kan ikke rekonstrueres som tombstones. Før aktiv sync må nye lokale writes bruke tombstone eller opplisting av revisionshistorikk.

### AHAavisa

| Lokal kilde | Status | Canonical mål | Regel |
|---|---|---|---|
| `aha_articles_v1[]` | `mapped` | `aha.articles` + `aha.article_versions` | Stabil ID beholdes; aktiv body/summary/title blir første canonical versjon. |
| `article.references[]` | `mapped` | `aha.article_references` | Referansens source/refId og rekkefølge bevares. |
| `published_local` | `mapped som workflowstatus` | `aha.articles.status` | Betyr fortsatt bare lokal workflowmarkering, ikke ekstern publisering. |
| `public_candidate` | `mapped som kandidatstatus` | `publication_scope` | Er ikke samtykke og oppretter ikke automatisk `aha.publications`. |
| eksplisitt publiseringshandling | senere runtime | `aha.publications` | Krever NestJS-kommando, consent receipt, audit og ekstern publisher-kontrakt. |

## 3. Legacy/deferred-domener

Følgende domener skal ikke skjult massekonverteres i schema v1:

| Lokal nøkkel/domene | Status | Begrunnelse |
|---|---|---|
| `aha_notes_v1` | `deferred` | Levende dokument, edit-/reanalysegrense og versjonering må modelleres eksplisitt. Source events kan migreres separat når brukeren godkjenner dem. |
| `aha_gallery_v1` | `deferred` | Krever Blob Storage, filhash, mediarettigheter og upload-samtykke. URL/dataURL skal ikke bli automatisk cloud-fil. |
| `aha_feed_posts_v1` | `deferred` | Feed er foreløpig lokal; ekte sosial eller delt feed krever egen synlighets- og modereringsmodell. |
| `aha_insta_posts_v1` og relaterte Insta-nøkler | `deferred` | Krever egen sosial graf, importprovenance, media storage og rettighetsmodell. |
| AHA Music / Spotify metadata | `deferred` | Dagens `public.music_*` forblir valgfritt legacy-lag. Ny canonical mapping krever lisens-, source- og playlistkontrakt. |
| Training corpus/examples | `local_only` eller `deferred` | Trening, retrieval og fine-tuning må holdes adskilt; intet lastes opp uten eksplisitt kontrakt og samtykke. |
| Personal AI-evalueringer og workbench state | `local_only` / `deferred` | Kontroll- og auditflater er ikke automatisk brukerdata for server. |
| Galleri-/Insta-dataURL-er og lokale filer | `local_only` | Skal aldri plasseres i JSON-import eller databasefelt som skjult filopplasting. |

At et domene er `deferred` betyr ikke at det skal slettes. Det betyr at dagens lokale data beholdes urørt til en egen migrering kan bevise identitet, samtykke, revisionshistorikk og rollback.

## 4. Personvern og samtykke

| Lokal kilde | Status | Canonical mål | Regel |
|---|---|---|---|
| `aha_privacy_settings_v1` | `device_only` som preferanse | Ikke direkte `aha.consent_receipts` | En lokal innstilling er ikke juridisk eller server-side samtykkekvittering. |
| eksplisitt importgodkjenning | `mapped ved handling` | `aha.consent_receipts` + `aha.import_batches` | Policyversjon, formål, scope og bevis lagres. |
| eksplisitt deling | `mapped ved handling` | `aha.consent_receipts` + `aha.sharing_grants` | Deling er objekt-, mål- og tillatelsesspesifikk. |
| tilbaketrekking | `mapped ved handling` | receipt/grant status + audit | Stanser videre behandling og tilgang etter kontrakten. |

Ingen importadapter får opprette generisk «brukeren har samtykket til alt» basert på innlogging eller gamle toggles.

## 5. Kvalitetsprofil og feedback

`aha_analysis_quality_profile_v1` er en lokal, aggregert kvalitetsprofil. Den forblir local-only i denne migreringen.

Individuell, eksplisitt feedback som allerede er knyttet til en bestemt insight eller analyse kan senere importeres til `aha.insight_feedback` når importpreview viser dette. Aggregert profil, terskler og brukerens feilmønster lastes ikke opp som standard.

Rå kildetekst skal ikke dupliseres i feedbacktabellen.

## 6. History Go

History Go er en separat lærings- og samlingsmotor.

- Bare en payload validert mot `aha_import_payload_v1` kan bli importkandidat.
- Ukjente hovedversjoner avvises.
- Importen oppretter `aha.import_batches` og per-objekt `aha.import_items`.
- Faktiske canonical objekter opprettes bare for payloadfelter med godkjent mapping.
- History Go-metadata og canonical fagproveniens bevares.
- AHA skriver ikke tilbake til History Go i Backend Foundation v1.
- Samme payload/import-id skal være idempotent.

## 7. Importkvittering

En senere importflyt skal rapportere minst:

```text
batch id
policy/contract version
workspace
source app and payload version
selected object counts
created
updated
skipped as duplicate
rejected as invalid
deferred
kept local-only
warnings
errors
rollback status
```

`aha.import_batches` er overordnet kvittering, mens `aha.import_items` binder hver lokal ID til eventuell canonical ID og resultatstatus.

## 8. Idempotens og stabil identitet

- Lokal stabil ID brukes som canonical ID når den passer kontrakten.
- En import-item har unik kombinasjon av batch og local ID.
- Samme importbatch eller idempotency key skal ikke lage duplikater.
- Hash brukes som kontrollsignal, ikke som eneste identitet når stabil ID finnes.
- Kollisjon mellom to ulike objekter med samme ID skal feile og kreve review; adapteren skal ikke stille overskrive.

## 9. Aktiveringsgrense

Denne mappingen er dokumentasjon og schemaforberedelse. Ingen import kjøres før:

- tenancy/RLS/samtykke-PR-en er merget
- import DTO/schema er versjonert
- preview og explicit confirm finnes
- fixtures dekker hvert `mapped` domene
- deferred/local-only-materiale er testet for null opplasting
- eksport etter import har identitets- og telleparitet
- rollback er demonstrert i staging
