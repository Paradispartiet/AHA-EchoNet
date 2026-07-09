# AHA Release Readiness Snapshot

This snapshot documents the current local-only release readiness state for AHA-EchoNet.

It does not activate backend, sync, EchoNet, external sharing, model training, fine-tuning or History Go write-back.

## Source of truth

- Runtime registry: `js/ahaModules.js`
- Maturity audit: `docs/AHA_MODULE_MATURITY_MATRIX.md`
- Registry/matrix consistency: `docs/AHA_REGISTRY_MATRIX_CONSISTENCY.md`

## Ready modules

All modules whose matrix maturity is `ready` are listed below.

| module id | title | role | boundary summary | primary safe next step |
|---|---|---|---|---|
| `profile` | AHA Profil | personal | Local-only read-only profil/statusflate som samler lokale AHA-tellinger, siste aktivitet, personvernstatus, AHA Meta-profil og History Go importstatus uten backend, sync, EchoNet, sosial profil, AHAIngest, insight-chamber writes eller History Go write-back. | Hold Profile som status/auditflate; fremtidig offentlig profil, kontoidentitet, EchoNet-identitet eller sync må kreve eksplisitt samtykke og backend-kontrakt. |
| `chat` | AHA Chat | core | Stor modul med mange fallback-løp; moden, men bør fortsatt beskyttes mot dupliserte source events og støy. | Hold videre arbeid til små safety-/regresjonstester rundt eksisterende AHAIngest-flyt. |
| `knowledge-workbench` | Knowledge Workbench | system | Local-only kontroll-/statusflate for knowledge pipeline med tydelig manuell flyt; ingen AHAIngest, insight writes, auto-training, backend, sync, EchoNet eller auto-approval. | Hold Workbench som kontrollflate; nye handlinger må være eksplisitte brukerhandlinger med testet boundary. |
| `data-intake` | Data Intake | system | Local-only kandidat-/inntakskø med safety metadata, samtykkegrenser, manuell godkjenning før Training Corpus, fine-tuning av som standard og tester for ingen backend/EchoNet/History Go write-back/AHAIngest/insight writes. | Hold Intake som kandidatlag; ikke gjør scanned materiale til kunnskap uten review og samtykke. |
| `knowledge-curation` | Knowledge Curation | system | Local-only kurateringslag som grupperer, dedupliserer og prioriterer intake-kandidater, men krever manuell godkjenning før eksport; Training Corpus/Examples eksport blir raw/needs-review og ingen History Go/EchoNet/backend/insight writes. | Hold Curation som manuelt godkjenningslag; ikke auto-apply forslag til varig kunnskap. |
| `knowledge-map` | Knowledge Map | system | Avledet local-only kunnskapskart med source/opphavsmetadata på noder/kanter, canonical_truth=false, ingen kilde-mutasjon, ingen AHAIngest/insight writes/backend/EchoNet/History Go write-back og tester for derived graph boundary. | Hold Knowledge Map som avledet graf/audit; ikke gjør den til canonical sannhet eller graph-database. |
| `knowledge-graph-intelligence` | Graph Intelligence | system | Local-only suggestion layer for grafkoblinger, hull og neste review-steg med auto_apply av, canonical_truth=false og tester for ingen auto-write til map/curation/training/backend/EchoNet. | Hold Graph Intelligence som forslag; krever manuell review før noe blir kunnskap. |
| `personal-ai` | Personal AI | system | Local-only kontroll-, readiness-, retrieval-, preview-, evaluation- og auditflate basert på godkjent lokalt materiale, med tester for ingen modelltrening, fine-tuning, backend/API-kall, EchoNet, Sync Hub, AHAIngest, insight writes eller History Go write-back. | Hold Personal AI som lokal kontrollsløyfe; ekte modell/API/backend-integrasjon krever eksplisitt kontrakt og samtykke. |
| `training` | Training | system | Local-only review corpus og training examples med fine-tuning av som standard, tydelig skille mellom corpus/examples/retrieval og ekte modelltrening, lokal JSONL-eksport uten upload/backend, safety metadata og tester for ingen AHAIngest/insight writes/EchoNet/Sync Hub/History Go write-back. | Hold Training som lokalt corpus/examples/exportlag; ekte fine-tuning eller backend upload krever eksplisitt samtykke, eksportkontrakt og separat implementasjon. |
| `insights` | Meta Insights | knowledge | Modulen er primært read-only arkiv/visning; videre skriving må fortsatt gå via eksisterende motor/ingest. | Behold som lesemodul og legg bare til trygge filtre/sporbarhet. |
| `sources` | Sources | system | Read-only audit over source events and insight links; no repair/write actions. | Add explicit per-module ingest diagnostics only when modules expose stable metadata; do not add hidden auto-discovery. |
| `lists` | Lists | knowledge | Local-only referansesamling med eksplisitt database-sync av, safety metadata, referansevalidering mot lokale AHA-objekter, tombstone-håndtering og tester for duplikater/ugyldige referanser. | Hold Lists som organisering av eksisterende AHA-objekter; ikke gjør den til egen kunnskapsmotor eller sosial deling. |
| `paths` | Paths | knowledge | Local-only sekvenssamling med eksplisitt database-sync av, safety metadata, stegvalidering mot lokale AHA-objekter, tombstone-håndtering og tester for duplikater/ugyldige referanser. | Hold Paths som rekkefølge/organisering av eksisterende AHA-objekter; ikke gjør den til læringsmotor, automasjon eller sosial deling. |
| `mindmap` | Tankekart | knowledge | Read-only lokal graf over eksisterende AHA-objekter og referanser med source/opprinnelsesmetadata, tombstone/archived-håndtering, edge-validering og tester som bekrefter ingen writes/backend/sync/EchoNet. | Hold Mindmap som visning/audit av lokale koblinger; ikke gjør den til full kunnskapsmodell, anbefalingsmotor eller graph-database. |
| `historygo` | History Go | historygo | Manuell local-only import boundary fra `aha_import_payload_v1` til AHA source events/insights med kompakt importlogg, databasepersist av som standard, ingen write-back til History Go-lagring uten eksplisitt flagg, og tester for AHA/HG-separasjon, no sync/backend/EchoNet og no EmneMatcher. | Hold History Go som eget læringsunivers; AHA skal bare lese/importere signaler og ikke bli ny HG-motor. |
| `gallery` | Galleri | personal | Lokal-only galleriobjekter har eksplisitt ikke-publisert/EchoNet-ikke-delt metadata, tekstlig AHAIngest-sporbarhet, stabil source-id mot åpenbar re-ingest-duplisering og søk-regresjonstest. | Hold Gallery lokal-only; ikke aktiver filopplasting, automatisk bildeanalyse, ekstern bildesending, sync eller EchoNet-deling. |
| `notes` | Notes | personal | Modulen har direkte AHAIngest-kobling; hovedrisiko er reanalyse/duplisering og tom tekst. | Fortsett små regresjonstester for reanalyse og source-event-sporbarhet. |
| `insta` | AHA Insta | personal | Local-only Instagram-lignende flate med lokale poster/stories/profil/likes/comments/follows, eksplisitt import-preview før import, optional AHAIngest kun for tekst/captions, database-sync av som standard, safety metadata på poster/import/profil/social records, tombstone/archived-håndtering og tester for ingen ekstern deling/backend/sync/EchoNet. | Hold Insta som lokal personlig medieflate; ekte sosial graf, ekstern publisering, konto-linking, filopplasting og EchoNet må komme senere med eksplisitt backend- og samtykkekontrakt. |
| `feed` | Feed | social | Lokal-only postflyt med nøktern UI-copy, eksplisitt AHAIngest-sporbarhet og modulspesifikke tester for tom tekst, lagring, local_only, ingen fetch/sync/EchoNet og enkel duplikatbeskyttelse. | Hold videre arbeid til små lokale safety-regresjoner; ikke aktiver sosial publisering, EchoNet eller sync fra Feed. |
| `music` | AHA Music | personal | Metadata-only AHA Music-bibliotek med Spotify-import av valgte metadata, database-sync av som standard, token/PKCE holdt utenfor localStorage-biblioteket, safety metadata på library/imports/tracks/artists/albums/playlists/relations, ingen lydlagring/avspilling, ingen AI-klassifisering, lokal History Go-bridge uten write-back og tester for no backend/EchoNet/SyncHub/audio/auto-ingest. | Hold Music som lokalt metadata- og koblingsbibliotek; ekte streaming, filopplasting, AI-analyse, EchoNet-deling og History Go-writeback må komme senere med eksplisitt samtykke og kontrakt. |
| `avisa` | AHAavisa | publishing | Local-only artikkel- og publiseringsflate med `published_local` som nettleser-lokal status, database-sync av som standard, safety metadata, lokal referansevalidering, tombstone/archived-håndtering og tester som bekrefter ingen ekstern publisering/backend/sync/EchoNet. | Hold AHAavisa som lokal skrive- og organiseringsflate; ekte publisering, deling og redaksjonell pipeline kommer senere og må kreve eksplisitt samtykke. |
| `groups` | Groups | social | Local-only grupperom med lokale medlemmer/roller, delt bibliotek av validerte lokale AHA-referanser, database-sync av som standard, safety metadata, tombstone/archived-håndtering, lokal AHAavisa-utkastflyt og tester som bekrefter ingen ekstern deling/invitasjoner/backend/sync/EchoNet. | Hold Groups som lokal organisering og samarbeidsforberedelse; ekte deling, invitasjoner og EchoNet må komme senere med eksplisitt samtykke og backend-kontrakt. |
| `search` | Søk | system | Eksplisitt local-only søkeindeks for modne AHA-lag inkludert Music metadata, Training review corpus/examples, Knowledge Pipeline, Knowledge Map, Graph Intelligence og Personal AI-evalueringer, med secret redaction, ingen auto-discovery, ingen writes, backend, EchoNet, Sync Hub eller History Go runtime-indexering. | Utvid søk bare eksplisitt når nye lag modnes; aldri blind localStorage-indeksering eller tokenindeksering. |
| `privacy` | Personvern | system | Privacy dekker eksplisitt modne AHA-lag inkludert Music, Training, Knowledge Pipeline, Personal AI og Profile, med token/PKCE/OAuth/API-key blokkering, local-only flagg, safe export og tester for ingen hemmeligheter eller sync/backend/EchoNet-implikasjon. | Utvid datarapporten eksplisitt når nye keys legges til; aldri skjult auto-discovery eller eksport av hemmeligheter. |

Expected ready modules include all active modules except intentional non-ready modules.

## Intentional non-ready modules

### Meet

Status: `shell`

AHA Meet is only a shell for a later local personal meeting archive/reflection layer.

It has no runtime storage, invitations, calendar integration, backend, sync, EchoNet or History Go write-back.

### Sync Hub

Status: `planned`

Sync Hub is planned/no-op.

It may show local candidates, dry-run status and manual review concepts.

It does not perform auto-sync, backend calls, EchoNet sharing, external sharing or History Go write-back.

## Explicitly not active

The current release does not include:

- backend account system
- login/account identity
- public profile
- EchoNet identity
- social sharing
- invitations
- calendar integration
- active Sync Hub
- external publishing
- remote upload
- model training
- fine-tuning
- model/API calls from Personal AI
- direct History Go write-back
- automatic source repair
- hidden localStorage discovery
- token/PKCE/OAuth export
- new AHA engine

## Current safe product posture

AHA is currently a local-first personal insight system.

The ready surface is:

- local capture
- local AHAIngest where already established
- local source/insight audit
- local profile/status
- local knowledge workbench
- local intake/curation
- local derived knowledge map
- local training corpus/examples
- local Personal AI readiness/retrieval/preview/evaluation/audit
- local music metadata
- local writing/publishing drafts
- local groups as organizing rooms
- local search
- local privacy report/export

## Safe next product steps

The safest next steps are:

1. Release-readiness UI/status surface
2. Demo path through the ready modules
3. Local data seed/examples for testing
4. Better empty states and onboarding text
5. Manual backup/export/import for local AHA data
6. Optional backend contract document, without implementation
7. Optional EchoNet contract document, without implementation

## Not safe yet

Do not build these until there is an explicit contract, consent model, privacy model, tests and backend decision:

- real Sync Hub
- EchoNet sharing
- account login
- public profile
- real social graph
- real invitations
- calendar integration
- external publishing
- model fine-tuning/upload
- cloud backup/sync
- History Go write-back
- payment/subscription system

## Current rule

Ready means local-only, tested, bounded and documented.

Shell means visible concept only.

Planned means no-op or documentation-only.

Any transition from local-only to backend, sync, EchoNet, sharing, account identity, model training or write-back requires a separate contract and tests.
