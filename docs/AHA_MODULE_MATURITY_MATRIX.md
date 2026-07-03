# AHA Module Maturity Matrix

Denne matrisen er en nøktern kartlegging av modulene som er registrert i `js/ahaModules.js`. Den endrer ingen runtime, produktlogikk, motor, sync eller backend.

## Vurderingsgrunnlag

- Registry-kilde: `js/ahaModules.js`.
- Leste kontrakt-/flytfiler: `js/ahaContracts.js`, `js/ahaSources.js`, `js/ahaIngest.js`, `js/ahaSyncChannelsRegistry.js`.
- Leste sider: `index.html`, `chat.html`, `notes.html`, `gallery.html`, `feed.html`, `insta.html`, `insights.html`, `lists.html`, `paths.html`, `mindmap.html`, `historygo.html`, `search.html`, `privacy.html`, `personal-ai.html`, `training.html`, `knowledge-workbench.html`, `intake.html`, `curation.html`, `knowledge-map.html`, `music.html`, `avisa.html`, `groups.html`, `meet.html`.
- `registry_status` er bare statusen i modulregisteret. Den teller ikke alene som modenhet.
- `uses_AHASources`, `uses_AHAIngest` og `writes_to_insight_chamber` beskriver observert direkte/indirekte runtime-kobling i den aktuelle modulsiden og primær-JS.
- `appears_in_search` betyr om modulens egne lag er inkludert i `js/ahaSearch.js`, ikke om modulens HTML har søkefelt.
- `has_tests` er basert på observerte testfiler i `tests/`, primært med modulnavn/funksjonsområde i filnavnet.
- `maturity` er en forsiktig dokumentasjonsvurdering: `ready`, `partial`, `shell`, `planned`, `broken` eller `unknown`.

## Matrix

| module_id | title | type | registry_status | phase | page | primary_js | data_keys | uses_AHASources | uses_AHAIngest | writes_to_insight_chamber | appears_in_search | has_empty_state | has_tests | maturity | blocking_gap | next_safe_step |
|---|---|---|---:|---:|---|---|---|---|---|---|---|---|---|---|---|---|
| profile | AHA Profil | personal | active | 1 | `profile.html` | `js/ahaProfile.js` | `aha_profile_name`, `aha_profile_id`, AHA Home counts | unknown | unknown | unknown | no | unknown | yes | partial | Registrert side peker til `profile.html`, men kartleggingen dekket primært AHA Home/profilstatus i `index.html`. | Kartlegg `profile.html` og `ahaProfile.js` separat før modulen kalles ferdig. |
| chat | AHA Chat | core | active | 1 | `chat.html` | `js/ahaChat.js`, `js/ahaChatPersistence.js` | `aha_insight_chamber_v1`, `aha_source_events_v1`, `aha_chat_sessions_v1`, `aha_chat_current_session_v1`, `aha_chat_highlights_v1`, `aha_afterwork_v1` | yes | yes | yes | source events and derived insights only | yes | yes | ready | Stor modul med mange fallback-løp; moden, men bør fortsatt beskyttes mot dupliserte source events og støy. | Hold videre arbeid til små safety-/regresjonstester rundt eksisterende AHAIngest-flyt. |
| knowledge-workbench | Knowledge Workbench | system | active | 2 | `knowledge-workbench.html` | `js/ahaKnowledgeWorkbench.js`, `js/ahaKnowledgeWorkbenchDashboard.js` | `aha_knowledge_workbench_status_v1`, intake/curation/map/training keys | no | no | no | no | yes | yes | partial | Samler flere arbeidssteg, men er fortsatt kontroll-/workflowlag og ikke selv canonical AHA-motor. | Dokumenter grenser mellom workbench, godkjenning og Training Corpus tydeligere i UI-copy/tester. |
| data-intake | Data Intake | system | active | 2 | `intake.html` | `js/ahaDataIntake.js`, `js/ahaDataIntakeDashboard.js`, `js/ahaSourceConnectors.js` | `aha_data_intake_queue_v1`, `aha_source_connectors_last_scan_v1`, scanned source keys | no | no | no | no | yes | yes | partial | Importerer/godkjenner kandidater lokalt, men må ikke forveksles med ekte sync eller automatisk trening. | Utvid dokumentasjon og tester for approval boundary og kildeklassifisering. |
| knowledge-curation | Knowledge Curation | system | active | 2 | `curation.html` | `js/ahaKnowledgeCuration.js`, `js/ahaKnowledgeCurationDashboard.js` | `aha_knowledge_curation_v1`, `aha_training_corpus_v1`, `aha_training_examples_v1` | no | no | no | no | yes | yes | partial | Curation er nyttig, men avhenger av manuell godkjenning og Data Intake-kvalitet. | Stram inn status-/samtykkeflyt før mer automasjon legges på. |
| knowledge-map | Knowledge Map | system | active | 2 | `knowledge-map.html` | `js/ahaKnowledgeMap.js`, `js/ahaKnowledgeMapDashboard.js` | `aha_knowledge_map_v1`, curation/training/memory source keys | no | no | no | no | yes | yes | partial | Kartet er bygget fra lokale kuraterte lag, men er ikke canonical sannhet eller innsiktsmotor. | Legg til flere les-bare valideringer for node-/edge-opphav. |
| knowledge-graph-intelligence | Graph Intelligence | system | active | 2 | `knowledge-map.html#graph-intelligence` | `js/ahaKnowledgeGraphIntelligence.js` | `aha_knowledge_graph_intelligence_v1`, `aha_knowledge_map_v1` | no | no | no | no | yes | yes | partial | Foreslår koblinger og hull, men forslagene trenger tydelig manuell behandling før de blir kunnskap. | Hold output som forslag og styrk tester for no-auto-approval. |
| personal-ai | Personal AI | system | active | 1 | `personal-ai.html` | `js/ahaPersonalAiControl.js`, `js/ahaPersonalAiDashboard.js`, retrieval/composer/evaluation modules | `aha_personal_ai_control_status_v1`, `aha_personal_ai_loop_audit_v1`, `aha_personal_answer_evaluations_v1`, training/retrieval keys | no | no | no | no | yes | yes | partial | Kontrollpanelet kan teste readiness, men personlig AI er avhengig av godkjent corpus og retrieval-kvalitet. | Prioriter audit-/readiness-dokumentasjon fremfor nye generative evner. |
| training | Training | system | active | 2 | `training.html` | `js/ahaTrainingCorpus.js`, `js/ahaTrainingExamples.js`, `js/ahaTrainingDashboard.js` | `aha_training_corpus_v1`, `aha_training_examples_v1`, approved source keys | no | no | no | no | yes | yes | partial | Corpus finnes lokalt, men må ikke behandles som produksjonstrening uten eksplisitt godkjenning og eksportgrenser. | Dokumenter hva som er corpus, examples, retrieval og ikke-fine-tuning. |
| insights | Meta Insights | knowledge | active | 1 | `insights.html` | `js/ahaInsights.js` | `aha_insight_chamber_v1`, `aha_source_events_v1` | yes | no | no | yes | yes | yes | ready | Modulen er primært read-only arkiv/visning; videre skriving må fortsatt gå via eksisterende motor/ingest. | Behold som lesemodul og legg bare til trygge filtre/sporbarhet. |
| sync-hub | Sync Hub | integration | planned | 2 | `index.html#aha-sync-hub-status` | `js/ahaSyncHub.js`, `js/ahaSyncChannelRouter.js`, `js/ahaSyncCandidateBuilder.js`, sync preview modules | `aha_sync_*`, `aha_manual_sync_*`, read-only source-event inputs | yes | no | no | no | yes | yes | planned | Registry sier planned og README sier NO-GO for ekte sync/EchoNet; bare lokal read-only preview er trygt. | Fortsett med read-only candidate/coverage docs; ikke aktiver sync. |
| lists | Lists | knowledge | active | 1 | `lists.html` | `js/ahaLists.js` | `aha_lists_v1`, `aha_insight_chamber_v1`, `aha_notes_v1`, `aha_feed_posts_v1`, `aha_gallery_v1`, `aha_insta_posts_v1` | no | no | no | yes | yes | yes | partial | Kan samle referanser, men skaper ikke dyp innsikt og avhenger av eksisterende objekter. | Legg til bedre referansevalidering og tomtilstandsdokumentasjon. |
| paths | Paths | knowledge | active | 1 | `paths.html` | `js/ahaPaths.js` | `aha_paths_v1`, `aha_insight_chamber_v1`, `aha_lists_v1`, `aha_notes_v1` | no | no | no | yes | yes | yes | partial | Stier er lokale referansesamlinger, ikke full læringsmotor. | Prioriter trygg linking, tombstones og eksport/visning før automasjon. |
| mindmap | Tankekart | knowledge | active | 1 | `mindmap.html` | `js/ahaMindmap.js` | `aha_insight_chamber_v1`, `aha_source_events_v1`, `aha_lists_v1`, `aha_paths_v1`, `aha_articles_v1`, `aha_notes_v1`, `aha_feed_posts_v1`, `aha_gallery_v1`, `aha_insta_posts_v1`, `aha_groups_v1` | no | no | no | no | yes | yes | partial | Visuell graf er nyttig, men basert på lokale lag og må ikke tolkes som full kunnskapsmodell. | Styrk les-bare opprinnelse, filtrering og tombstone-håndtering. |
| historygo | History Go | historygo | active | 1 | `historygo.html` | `js/ahaHistoryGoImport.js`, `js/ahaHistoryGoStatus.js` | `aha_import_payload_v1`, `aha_imports_v1`, `aha_source_events_v1`, `aha_insight_chamber_v1` | yes | yes | yes | source events/insights only | yes | yes | partial | Importbroen er aktiv, men AHA og History Go-motorene må holdes adskilt. | Dokumenter importgrensen og behold manuell/lokal import uten Civication-blanding. |
| gallery | Galleri | personal | active | 1 | `gallery.html` | `js/ahaGallery.js` | `aha_gallery_v1`, `aha_source_events_v1`, `aha_insight_chamber_v1` | yes | yes | yes | yes | yes | unknown | partial | Lagrer visuelt materiale lokalt og kan ingestes, men bildeanalyse/metadata er begrenset. | Legg til modulspesifikke tester for ingest og søk-indeksering. |
| notes | Notes | personal | active | 1 | `notes.html` | `js/ahaNotes.js` | `aha_notes_v1`, `aha_source_events_v1`, `aha_insight_chamber_v1` | yes | yes | yes | yes | yes | yes | ready | Modulen har direkte AHAIngest-kobling; hovedrisiko er reanalyse/duplisering og tom tekst. | Fortsett små regresjonstester for reanalyse og source-event-sporbarhet. |
| insta | AHA Insta | personal | active | 1 | `insta.html` | `js/ahaInsta.js` | `aha_insta_posts_v1`, `aha_insta_stories_v1`, `aha_insta_import_sessions_v1`, `aha_insta_import_preview_v1`, `aha_insta_profile_v1`, likes/comments/follows keys | yes | yes | yes | yes | yes | yes | partial | Har mye lokal sosial/import-funksjon, men import/ingest må holdes eksplisitt og ikke bli ekte nettverk. | Prioriter import-preview, samtykke og søk/tombstone-regresjoner. |
| feed | Feed | social | active | 1 | `feed.html` | `js/ahaFeed.js` | `aha_feed_posts_v1`, `aha_source_events_v1`, `aha_insight_chamber_v1` | yes | yes | yes | yes | yes | unknown | partial | Enkel lokal postflyt med ingest; mangler tydelig dokumentert sosial grense og modulspesifikke tester. | Legg til safety-test for lokal-only feed-post og AHAIngest-kall. |
| meet | Meet | social | shell | 2 | `meet.html` | none beyond `js/ahaModules.js`, `js/ahaGlobalNav.js` | none observed | no | no | no | no | yes | yes | shell | Shell-side uten egen runtime eller datamodell. | Behold som shell; neste steg er bare krav-/kontraktdokumentasjon. |
| music | AHA Music | personal | active | 2 | `music.html` | `js/ahaMusic.js`, `js/ahaMusicCanon.js`, `js/ahaMusicHistoryGoBridge.js` | `aha_music_library_v1`, `aha_music_spotify_token_v1`, `aha_music_spotify_pkce_v1`, `aha_music_spotify_connection_v1`, `aha_music_history_go_bridge_v1` | no | no | no | no | yes | yes | partial | Har import/metadata og History Go-bro, men er ikke koblet til innsiktskammeret og må ikke laste lyd eller kjøre AI-klassifisering. | Dokumenter kanon/metadata-grenser og hold History Go-discovery som lokal bridge. |
| avisa | AHAavisa | publishing | active | 2 | `avisa.html` | `js/ahaAvisa.js` | `aha_articles_v1`, `aha_insight_chamber_v1`, `aha_lists_v1`, `aha_paths_v1`, `aha_notes_v1`, `aha_groups_v1` | no | no | no | yes | yes | yes | partial | Lokal publiseringsflyt finnes, men ekte publisering/deling er ikke aktivert. | Behold `published_local`-semantikk og styrk personvern-/gruppegrense. |
| groups | Groups | social | active | 2 | `groups.html` | `js/ahaGroups.js` | `aha_groups_v1`, `aha_privacy_settings_v1`, referenced AHA object keys | no | no | no | yes | yes | yes | partial | Lokale grupperom kan samle referanser, men ekte deling/EchoNet finnes ikke. | Fortsett local-only gruppebibliotek og tydeliggjør ingen ekstern deling. |
| search | Søk | system | active | 2 | `search.html` | `js/ahaSearch.js` | reads `aha_insight_chamber_v1`, `aha_source_events_v1`, notes/gallery/feed/insta/lists/paths/articles/groups keys | no | no | no | yes | yes | yes | ready | Søk dekker mange AHA-lag, men ikke alle system-/training-/music-lag. | Utvid indeks eksplisitt når nye lag modnes; ikke skjult autoindeksering. |
| privacy | Personvern | system | active | 1 | `privacy.html` | `js/ahaPrivacy.js` | `aha_privacy_settings_v1`, AHA data report keys | no | no | no | no | yes | unknown | partial | Viser/eksporterer lokal data, men dekker ikke alle nyere training/music/workbench-nøkler fullt ut. | Oppdater datarapporten når matrise og nye lokale nøkler stabiliseres. |

## Prioritert byggerekkefølge

1. Core contracts
2. Source/Ingest
3. Chat
4. Notes
5. Feed
6. Gallery/Insta
7. Search/Bibliotek
8. Insights
9. Lists/Paths/Mindmap
10. Personal AI / Training Corpus
11. Knowledge Workbench
12. History Go import
13. Music
14. Privacy
15. Groups
16. AHAavisa
17. Meet
18. Sync Hub / EchoNet later

## Ikke-mål for denne kartleggingen

- Ingen ny AHA-motor.
- Ingen endringer i `insightsChamber.js` eller `metaInsightsEngine.js`.
- Ingen backend.
- Ingen ekte sync.
- Ingen EchoNet-aktivering.
- Ingen stor UI-redesign.
- Ingen Civication-blanding inn i AHA.
