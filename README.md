# AHA-EchoNet



## AHA Profile boundary

AHA Profile is a local status/audit surface for the user's AHA. It shows local counts, recent activity, privacy status, AHA Meta-profile summaries, afterwork archive previews and local History Go import status.

AHA Profile is not a public or social profile. It does not create an EchoNet identity, account identity, backend profile, sync model or external profile sharing surface.

AHA Profile must not call AHAIngest, write source events, write to the insight chamber, write to History Go keys, modify privacy settings, call backend APIs or perform hidden sync. History Go information is read as local import/status only and AHA Profile does not write back to History Go.

The only allowed write from AHA Profile is `aha_pending_chat_prompt_v1`, and only after an explicit user action that opens Chat with a prepared local prompt. This pending prompt is not ingest, sync or backend persistence.

## AHA Meet shell contract

`AHA Meet` er foreløpig bare en shell og kontraktside for et senere personlig møtearkiv. Rollen er personlig refleksjon, møtenotater, innsikter og etterarbeid rundt møter, personer, steder og temaer; den er ikke sosial koordinering.

History Go er arenaen for steder, ruter og aktiviteter ute i verden. AHA Meet kan senere lese eller importere slike signaler som personlig refleksjonsmateriale, men skal ikke skrive tilbake til History Go-storage eller History Go-runtime.

AHA Meet har ingen invitasjoner, ingen kalenderintegrasjon, ingen EchoNet-deling, ingen Sync Hub-aktivering og ingen backend. Meet skal holdes som shell til en eksplisitt local-only datamodell, referansevalidering og separat delings-/backend-kontrakt finnes.

## AHA Local Insight Home V1

AHA Local Insight Home V1 is defined as the next local read-only surface that will combine the frozen Sync Overview, Conversation Snapshot, and Quality Status V1 layers. Runtime is not implemented yet.

AHA Conversation Insight Snapshot V1 is frozen as a local read-only understanding layer. It does not perform sync, approval, publishing, backend storage, or EchoNet actions.

AHA Quality Status Surface V1 is frozen as a local read-only quality layer. It does not perform sync, approval, publishing, backend storage, or EchoNet actions.

**Status baseline:** AHA quality gates for topic/source/geopolitics are green on the latest `npm test` baseline (115/115), while AHA Sync remains read-only/local-only and NO-GO for real sync or EchoNet activation. AHA Sync Overview V1 is a local read-only overview. It does not perform sync, approval, publishing, or EchoNet network actions.


## AHAavisa local publishing boundary

`AHAavisa` lagrer lokale artikkelutkast og lokale publiseringsmarkeringer i `aha_articles_v1`. `published_local` betyr bare at artikkelen er markert som publisert i den aktuelle nettleseren; det er ikke ekstern publisering, sosial deling eller backend-publisering.

`public_candidate` er bare en lokal kandidatmerking for mulig senere vurdering. Kandidatmerkingen er ikke samtykke til publisering alene, sender ikke data ut, aktiverer ikke EchoNet og oppretter ingen backend- eller sync-flyt.

Database-sync er av som standard og kan bare bruke repository-laget når `AHA_CONFIG.avisa.enableDatabaseSync === true` er satt eksplisitt. AHAavisa-referanser valideres mot eksisterende lokale AHA-objekter fra innsikter, lister, stier og notater, og deleted/archived objekter brukes ikke som nye referansemål.

## AHA Lists local reference collections

`Lists` lagrer lokale referansesamlinger i `aha_lists_v1`. En liste peker bare til eksisterende AHA-objekter fra innsikter, notater, Feed, Galleri eller AHA Insta; den oppretter ikke ny insight og er ikke en egen læringsmotor.

Lists er local-only som standard. Database-sync er av med mindre `AHA_CONFIG.lists.enableDatabaseSync === true` settes eksplisitt, og EchoNet/deling er ikke aktivert. Lists skal derfor brukes som lokal organisering av eksisterende materiale, ikke som sosial deling, backend-sync eller ny AHA-motor.


## AHA Paths local sequences

`Paths` lagrer lokale sekvenser i `aha_paths_v1`. En path peker til eksisterende AHA-objekter fra innsikter, lister eller notater, og organiserer bare rekkefølgen mellom disse referansene.

Paths skaper ikke ny insight alene, kjører ikke autoplanlegging og er ikke en læringsmotor. Modulen er local-only som standard. Database-sync er av med mindre `AHA_CONFIG.paths.enableDatabaseSync === true` settes eksplisitt, og EchoNet/deling er ikke aktivert.

## AHA Mindmap read-only local graph

`Mindmap` (`mindmap.html` / `js/ahaMindmap.js`) er en read-only lokal graf over eksisterende AHA-objekter og referanser. Den leser kjente lokale AHA-nøkler fra `localStorage`, blant annet insights, source events, lists, paths, articles, notes, feed, gallery, insta og groups.

## Groups local-only boundary

`Groups` (`groups.html` / `js/ahaGroups.js`) er et lokalt grupperom som lagrer grupper i `aha_groups_v1`. Medlemmer er lokale roller, ikke ekte brukerkontoer, og `invited_later` er bare lokal planmerking for senere vurdering.

Referanser i grupper peker til eksisterende lokale AHA-objekter (insights, lists, paths, AHAavisa-artikler, notes og feed). AHAavisa-utkast opprettet fra en gruppe forblir lokale gruppeutkast. Groups sender ingen invitasjoner, deler ikke eksternt, bruker ingen backend, aktiverer ikke EchoNet og kjører ikke database-sync med mindre `AHA_CONFIG.groups.enableDatabaseSync === true` settes eksplisitt.

Mindmap viser bare koblinger som allerede finnes i lokale referansefelt. Den skriver ikke data, reparerer ikke manglende koblinger, skaper ikke nye insights og er ikke en full kunnskapsmodell, anbefalingsmotor eller graph-database. Backend, sync og EchoNet er ikke aktivert for Mindmap.


## Sync Hub planned/no-op boundary

Sync Hub er ikke aktiv sync. Det er en planlagt/no-op integrasjonsflate som kan vise lokale kandidater, dry-run-status, coverage gaps og manuell review-status.

Sync Hub kaller ikke modulenes `syncFromDatabase()` automatisk, bruker ikke backend, bruker ikke EchoNet, deler ikke eksternt og skriver ikke tilbake til History Go. Moduler kan ha egne database-flagg, men Sync Hub kaller dem ikke automatisk.

EchoNet er et senere kollektivt lag og er ikke aktivert. All senere aktivering krever eksplisitt produkt-, backend-, personvern-, samtykke- og EchoNet-kontrakt før noen aktiv sync kan bygges.

## AHA / History Go import boundary

History Go er et eget samlings- og læringsunivers. AHA leser bare den delte eksportnøkkelen `aha_import_payload_v1`, og import skjer manuelt når brukeren trykker importknappen i `historygo.html`.

Importen lager AHA source events/insights via eksisterende `AHAIngest`; den bygger ikke ny AHA-motor og endrer ikke History Go-motoren. AHA skriver ikke tilbake til History Go-storage som standard. Slik write-back til `knowledge_universe`, `hg_learning_log_v1`, `hg_insights_events_v1`, `merits_by_category` og `people_collected` krever eksplisitt dev/test-flagg: `AHA_CONFIG.historygo.allowApplyToHistoryGoStorage === true`.

AHA databasepersist er også av som standard og `AHARepository.saveImport` brukes bare når `AHA_CONFIG.historygo.enableDatabasePersist === true`. Hver import skriver en kompakt lokal auditlogg i `aha_historygo_imports_v1` med import-id, payload-nøkler, counts og boundary-status, men ikke hele History Go-payloaden.

EchoNet, sync og backend er ikke aktivert for History Go-importen. `ahaEmneMatcher.js` skal ikke brukes for History Go-import; importgrensen går fra History Go-payload til AHA source events/insights og lokal importlogg.

## AHA Sources / Ingest Audit V1

`Sources / Ingest Audit` (`sources.html`) er et lokalt innsynslag over eksisterende AHA source/ingest-pipeline. Audit-visningen leser `aha_source_events_v1` og `aha_insight_chamber_v1` for å vise hva som kom inn som source events og hvilke innsikter/signaler som kan kobles tilbake til dem.

Visningen kan vise materiale fra Chat, Notes, Feed, Gallery, Insta og History Go når disse modulene har lagret stabil metadata som `source_app`, `source_type` eller `source_event_id`. Den gjør ingen skjult auto-discovery av localStorage-nøkler.

Audit-siden skriver ikke data, reparerer ikke gamle events, importerer ikke automatisk og aktiverer ikke sync, EchoNet, sosial deling eller backend. Den er kun en read-only oversikt over eksisterende lokal pipeline.

## Read-only AHA sync candidate approval summary

AHA Home viser nå en kompakt, redigert og lokal-only approval summary for AHA sync candidates under Sync Hub-previewen. Summaryen gjenbruker den eksisterende Personal AI Loop source approval-boundaryen via `buildPersonalAiLoopSourceApprovalSummary(...)`; det finnes ingen separat sync confirmation gate, ingen ny approvalmodell og ingen dupliserte source approval states.

Alle sync-kandidater starter fortsatt som `approvalState: "suggested"` innenfor `approvalBoundary: "personal_ai_loop_source_approval"`. Ingen kandidat blir automatisk `approved`, ingen kandidat lagres, ingen sync kjøres, og UI-et viser ikke rå brukerdata, raw payload, metadata eller full kandidatliste. AHA Home sender bare kompakte felter som id, state, safe label, type, category, risk, reason og blocker inn i den eksisterende Personal AI Loop-oppsummeringen.

Riktig runtime-grense er fortsatt:

```text
source event
→ AHASyncChannelRouter
→ AHASyncCandidateBuilder
→ existing Personal AI Loop source approval boundary
→ compact/redacted local-only approval summary
→ explicit user action required later
→ først senere kan sync vurderes
```


Dette dokumentet låser den nåværende arkitekturen for AHA-EchoNet, AHA, History Go og importflyten mellom dem.



## Read-only AHA Sync Insight Digest

`js/ahaSyncInsightDigest.js` bygger nå en compact/read-only digest for AHA Home fra eksisterende lokale source events, `AHASyncChannelRouter` og `AHASyncCandidateBuilder`. Digesten viser bare trygge tellere, boolean-signaler og generiske linjer for aktive innsiktskanaler, åpne spørsmål, begrepskoblinger, perspektiver, spenninger og samtalekoblinger.

Digesten er ikke ekte sync, deling, EchoNet eller prosjektstatus. Den skriver ikke til `localStorage`, sender ikke data, viser ikke rå `sourceEvent.text`, lager ingen backend og bruker fortsatt eksisterende Personal AI Loop source approval boundary: `personal_ai_loop_source_approval`.

## Read-only AHA Sync Candidate Builder

`js/ahaSyncCandidateBuilder.js` bygger nå midlertidige sync-kandidater fra lokale source events ved å bruke `AHASyncChannelRouter.routeSourceEvent(sourceEvent)` mot `AHA_SYNC_CHANNELS`. Kandidatene er bare en lokal conversation insight sync-modell: de har `visibility: "local_only"`, `requiresUserConfirmation: true`, `confidence: "candidate"`, `createdFrom: "read_only_route_candidate"`, `approvalBoundary: "personal_ai_loop_source_approval"` og `approvalState: "suggested"`.

Builderen lagrer ingen kandidater, skriver ikke til `localStorage`, leser ikke `localStorage` direkte, sender ingenting, gjør ingen `fetch`, endrer ikke DOM, kjører ingen ekte sync og aktiverer ikke EchoNet. Preview-labelen er trygg: den kan bruke kort `sourceEvent.title`, men bruker ikke rå `sourceEvent.text`. AHA Home viser bare en kompakt oppsummering av antall kandidater, antall som krever brukerbekreftelse, antall `local_only` og teller per kanal; full kandidatliste, rå brukerinnhold, metadata og brukeridentifikatorer vises ikke.

Dette er fortsatt conversation insight sync for samtaler, refleksjoner, begreper, spørsmål og perspektiver. Det er ikke prosjektstyring, og det legger ikke til eller bygger videre på `phase`, `priority`, `health`, `nextPr`, `repoStatus` eller `AHA_SYNC_HUB_PROJECTS`.

AHA sync candidates bruker den eksisterende Personal AI Loop source approval-boundaryen som sikkerhetsmodell. Det skal ikke lages en separat sync confirmation gate, parallell approvalmodell eller dupliserte approval states. Riktig flyt er:

```text
source event
→ AHASyncChannelRouter
→ AHASyncCandidateBuilder
→ existing Personal AI Loop source approval boundary
→ explicit user action required later
→ først senere kan sync vurderes
```

## Read-only AHA Sync Channel Preview

AHA Home viser nå en read-only route preview under `AHA_SYNC_CHANNELS`. Previewen leser eksisterende lokale AHA source events via den etablerte read-funksjonen, sender dem til `AHASyncChannelRouter.summarizeRoutes(sourceEvents)` og viser bare tellere per innsiktskanal samt antall ikke-routede source events.

Previewen viser ikke rå brukerinnhold, private meldinger, notattekst, rå metadata eller brukeridentifikatorer. Den skriver ikke routing-resultater, skriver ikke til `localStorage`, trigget ikke import, kjører ikke ekte sync, lager ingen backend og aktiverer ikke EchoNet. Dette er fortsatt conversation insight sync-preview: `AHA_SYNC_CHANNELS` er hovedmodellen, mens `AHA_SYNC_HUB_PROJECTS` fortsatt bare er legacy fallback / utviklingspreview.

## Read-only AHA Sync Channel Router

`js/ahaSyncChannelRouter.js` er første rene bro mellom AHA source events / samtaleinput og `AHA_SYNC_CHANNELS`. Routeren eksponerer `window.AHASyncChannelRouter`, leser kanalregisteret read-only og lager bare kandidatrouting for samtaleinnsikter, åpne spørsmål, begrepskoblinger, perspektiver, spenninger og samtalekoblinger.

Routeren skriver ikke data, leser ikke eller skriver `localStorage`, gjør ingen `fetch`, endrer ikke DOM og kjører ingen ekte sync. Den aktiverer ikke EchoNet og bygger ikke backend; den gir bare trygg klassifiseringslogikk som senere conversation insight sync kan bygge videre på.

## Kort definisjon

```text
AHA = jeg
History Go = det jeg samler
EchoNet = den kollektive overbygningen
AHA-EchoNet = den overordnede personlige AHA-motoren
```

AHA skal ikke forstås som en underdel av History Go. AHA er brukerens personlige lag: samtaler, refleksjoner, notater, galleri, egne tekster, egne bilder, egne poster, minner og selvvalgt materiale.

History Go er et eget samlings- og læringsunivers: steder, personer, quiz, badges, diplomer, Wonderkammer, fotballspillere, lag, observasjoner og lokal progresjon.

History Go kan sende materiale til AHA, men AHA skal kunne fungere helt uten History Go.

## Hovedregel

```text
History Go samler verden.
AHA bestemmer hva som blir del av deg.
```

History Go er én mulig kilde til AHA. Det er ikke grunnlaget for AHA.

## Produktfokus: AHA er ikke prosjektstyring

AHA skal ikke bygges som prosjektstyringsdashboard, repo-oversikt, prioriteringsliste eller intern notatblokk for utviklingen.

AHA er en innsiktsmotor for:

- samtaler
- refleksjoner
- selvdata
- begreper
- åpne spørsmål
- perspektiver
- uenighet og spenning
- koblinger mellom mennesker og samtaler

AHA Home kan vise teknisk status mens produktet bygges, men dette er ikke kjernen i AHA.

```text
Ikke bygg videre på prosjektstatusfelter som phase, priority, health, nextPr eller lignende som AHA-produktmodell.
```

## To innsiktsmotorer

Systemet har to innsiktsmotorer med ulike ansvar.

### 1. AHA-EchoNet-motoren

Dette er den overordnede personlige AHA-motoren.

Den skal registrere og forstå brukerens eget materiale:

```text
- chat-meldinger
- notes
- egne tekster
- egne bilder
- galleri
- egne videoer
- minner
- AHA Insta-poster
- AHA Feed / Twitter-poster
- refleksjoner
- favoritter
- valgfri History Go-import
```

Eksisterende AHA-motor i dette repoet er canonical.

Disse filene utgjør motorgrunnlaget:

```text
insightsChamber.js
= selve AHA-innsiktsmotoren

metaInsightsEngine.js
= metanivået / mønstre på tvers

ahaChat.js
= koblingen mellom UI, chat og motor

index.html
= eksisterende AHA Chat / innsiktsmotor-side
```

Det skal ikke lages en ny parallell AHA-motor. Nye moduler skal kobles inn i eksisterende motor.

`insights.html` er nå første visningsmodul for innsiktskammeret og leser eksisterende innsiktsdata uten å endre kontraktene.

`lists.html` er nå første modul som samler AHA-objekter på tvers via referanser fra innsikter, notater, feed, galleri og insta.

Innsiktskort kan nå legges direkte i AHA-lister som referanser.

Stier kan nå bygges av innsikter, lister og notater som referanser.

AHAavisa kan nå lage lokale artikkelutkast fra innsikter, lister, stier og notater som referanser.

Tankekart kan nå vise lokale koblinger mellom AHA-objekter som noder og referansebaserte edges.

Personvern / Kontroll kan nå vise lokal datarapport, eksportere AHA-data og lagre lokale samtykkeinnstillinger.

## AHA Privacy Data Report V2

Privacy / Kontroll er en lokal rapport over AHA-data i nettleserens `localStorage` på denne enheten. Rapporten svarer nøkternt på hva AHA kjenner til lokalt, uten å aktivere ny produktlogikk.

- History Go-nøkler vises for transparens, men slettes ikke fra Privacy.
- AHA-data kan eksporteres som JSON, inkludert rå AHA-nøkler og en `privacyReport` med samme lokale datarapport.
- AHA-nøkler kan slettes enkeltvis når brukeren skriver den eksplisitte bekreftelsen `SLETT`.
- Rapporten viser tellere for local-only, import, tombstone/slettet, sync, EchoNet og publiseringsflagg der feltene finnes.
- Rapporten aktiverer ikke sync, sosial deling, ekstern publisering eller EchoNet.

AHA Home / Profil samler nå lokal status fra innsikter, notes, galleri, feed, insta, lister, stier, AHAavisa, History Go-import og personvern.
Grupper / Sirkler kan nå lage lokale grupperom med medlemmer og referanser til AHA-objekter, uten ekte deling ennå.
Grupper / Sirkler har nå lokale arbeidsrom som viser medlemmer, delt bibliotek, resolved referanser og gruppeaktivitet.
Gruppe-arbeidsrom kan nå lage lokale AHAavisa-utkast basert på gruppens delte bibliotek og referanser.
AHAavisa har nå lokal publiseringsflyt med draft, review, ready og published_local, samt seksjonsfiltrering og gruppeutkast-badges.
AHAavisa har nå lokal lagmodell med personlig avis, gruppeavis og offentlig kandidatlag.

Innsikter, lister, stier og AHAavisa-utkast kan nå legges direkte i lokale Grupper / Sirkler som referanser.
Grupper / Sirkler er nå synlige i AHA Home, Søk/Bibliotek, Tankekart og Personvern/Kontroll.

### 2. History Go-innsiktsmotoren

History Go har sin egen lokale innsikts- og læringsmotor.

Den forstår History Go-data:

```text
- quiz
- riktige svar
- core_concepts
- learning log
- knowledge universe
- besøkte steder
- personer
- badges
- NextUp-valg
- observasjoner
- ruter
- Wonderkammer
- Civication-relatert progresjon
```

I History Go er sentrale deler:

```text
js/hgInsights.js
= logger riktige quiz-svar som begreps-/innsiktshendelser i hg_insights_events_v1

js/quizzes.js
= samler correctAnswers, conceptsCorrect, emnerTouched og lagrer quiz-/learning-events

js/learningLog.js
= én sannhet for quizhistorikk og observasjoner via hg_learning_log_v1

js/knowledge.js
= lagrer kunnskapspunkter i knowledge_universe og kan trigge sync til AHA

js/aha.js
= bygger History Go → AHA-payload og lagrer den i aha_import_payload_v1
```

History Go-motoren skal ikke erstattes av AHA-EchoNet. Den skal være lokal for History Go.

## Broen mellom History Go og AHA-EchoNet

Broen går via:

```text
aha_import_payload_v1
```

History Go produserer denne payloaden. AHA-EchoNet skal importere den.

Viktig: AHA-EchoNet skal ikke bruke `ahaEmneMatcher.js` for å gjette History Go-emner på nytt.

Riktig flyt er:

```text
History Go-data
→ History Go sin lokale innsikts-/læringsmotor
→ aha_import_payload_v1
→ AHA-EchoNet importadapter
→ eksisterende AHA-motor
```

Feil flyt er:

```text
History Go-data
→ AHA-EchoNet emnematcher
→ gjettet AHA-innsikt
```

## Hva History Go sender i dag

History Go sender primært AHA-kompatibelt grunnmateriale, ikke nødvendigvis ferdige AHA-EchoNet `Insight`-objekter i nøyaktig samme schema som `insightsChamber.js`.

Payloaden kan inneholde:

```text
knowledge_universe
hg_learning_log_v1
hg_insights_events_v1
merits_by_category
visited_places
nextup
nextup_learning_signal
hg_nextup_tri
hg_nextup_history_v1
hg_nextup_because
hg_nextup_mode_v1
hg_active_path_v1
nextup_profile
notes
dialogs
```

Derfor skal AHA-EchoNet-importen lese History Go-payloaden og gjøre den om til AHA-signaler eller AHA source events som eksisterende AHA-motor kan bearbeide.

## Importprioritet fra History Go

AHA-EchoNet sin History Go-import skal prioritere slik:

```text
1. nextup_learning_signal
2. hg_learning_log_v1
3. hg_insights_events_v1
4. knowledge_universe
5. notes
6. dialogs
7. visited_places / merits som metadata, ikke primær tekst
```

## Mapping ved import

### nextup_learning_signal

Dette er den mest AHA-lignende delen av History Go-eksporten.

Den kan inneholde:

```text
learning_style
inferred_interests
recommended_learning_paths
interpretation_texts
dominant_topics
active_path_summary
confidence
```

Den bør importeres som ett eller flere høyverdi-signaler med:

```text
source_app: historygo
source_type: historygo_nextup_profile
theme_id: historygo_nextup
imported: true
```

### hg_learning_log_v1

Dette er append-only læringslogg fra History Go.

Den kan inneholde:

```text
quiz_set_complete
quiz_perfect
quiz_legacy
observation
```

Signaltekst kan bygges fra:

```text
name
correctAnswers
concepts
related_emner
note
```

Metadata bør videreføres:

```text
targetId
parentTargetId
setId
categoryId
concepts
related_emner
correctCount
total
source_app: historygo
imported: true
```

### hg_insights_events_v1

Dette er History Go sine begreps-/innsiktshendelser fra riktige quizsvar.

Signaltekst kan bygges slik:

```text
History Go begreper: X, Y, Z
```

Metadata bør videreføres:

```text
quizId
categoryId
personId
placeId
concepts
source_app: historygo
source_type: historygo_concept_event
imported: true
```

### knowledge_universe

Dette er kunnskap låst opp gjennom quiz.

Strukturen er:

```text
category → dimension → knowledge items
```

Hvert kunnskapspunkt kan importeres som signal:

```text
{topic}: {text}
```

Metadata:

```text
category
dimension
knowledge_id
source_app: historygo
source_type: historygo_knowledge
imported: true
```

### notes og dialogs

Disse kan importeres som tekstlige AHA-signaler, men de skal merkes tydelig som importert fra History Go-kontekst hvis de kommer fra History Go-payloaden.

## Emnematcher-status

`emnerLoader.js` og `ahaEmneMatcher.js` brukes nå som et forslagssystem
inne i `AHAIngest`, ikke som hovedmotor.

```text
ahaEmneMatcher kan automatisk foreslå emner.
ahaEmneMatcher gjør ikke forslagene til bekreftede emner.
```

For rå AHA-tekst (chat, notes, feed, galleri, insta) skriver `AHAIngest`
matcherens treff til et provisorisk felt på insighten:

```text
emne_suggestions: [
  {
    emne_id,
    subject_id,
    label,
    score,
    confidence,
    source: "ahaEmneMatcher",
    status: "suggested",
    created_at
  }
]
```

`target.emner` og `target.matched_subjects` røres ikke automatisk —
de er forbeholdt brukerbekreftede eller importerte (HG) emner. UI kan
senere lese `emne_suggestions` og la brukeren bekrefte eller avvise hvert
forslag.

`AHAIngest` fyrer `aha:emne-suggested` når nye forslag legges til.

## AHA Feed local-only boundary

AHA Feed er en lokal AHA-flate for korte brukeropprettede tekstposter. Feed-poster lagres i `aha_feed_posts_v1` og merkes som lokale brukerdata, ikke som eksternt publiserte objekter.

Feed poster ikke til eksterne nettverk, aktiverer ikke sosial deling og deler ikke til EchoNet. Når en lokal feed-post skal bli AHA-innsikt, går den via eksisterende `AHAIngest` med `source_type: "aha_feed_post"`, `source_app: "aha"` og `local_only: true`, slik at source event og eventuell insight-signal kan spores uten å bygge en ny motor.

For History Go-import skal AHA-EchoNet stole på History Go sin egen
lokale lærings-/innsiktsmotor og den eksporterte payloaden. `AHAIngest`
hopper eksplisitt over `ahaEmneMatcher` for alt importert materiale
(`imported: true`, `source_app: "historygo"` eller `source_type` som
starter med `"historygo"`).

## Personlig AHA uten History Go

Den personlige AHA-motoren må kunne fungere helt selvstendig.

Primære kilder bør være:

```text
1. Chat
2. Notes
3. Galleri
4. Egne tekster
5. Egne bilder / videoer
6. Minner
7. AHA Insta
8. AHA Feed / Twitter
9. Valgfri History Go-import
```

Dette betyr at AHA-EchoNet først og fremst skal lese selvdata.

```text
Selvdata
= ting brukeren selv skriver, lager, velger og lagrer

Samledata
= ting brukeren låser opp eller samler i History Go
```

AHA skal primært forstå selvdata. Samledata kan importeres når brukeren ønsker det.

## AHA-komponentene som skal legges til

AHA-EchoNet skal ikke bare få History Go-import. Det skal også bygges ut med de andre AHA-komponentene rundt eksisterende motor.

Disse komponentene skal legges til gradvis, uten å lage ny motor:

```text
AHA Dashboard
= personlig startside / jeg-flate / inngang til modulene

AHA Chat
= eksisterende chat koblet til innsiktsmotoren

AHA Notes
= brukerens egne notater og tekster

AHA Galleri
= brukerens egne bilder, videoer, minner, AI-bilder, utvalgte kort og visuelle uttrykk

AHA Feed / Twitter
= korte tekstposter, innsikter, delinger, tråder

AHA Insta
= bilde-/videostrøm, visuelt uttrykk og galleri-nær publisering

AHA Sources
= rå kildelogg for alt brukeren skriver, lager, lagrer eller importerer

AHA Ingest
= felles bro som sender chat, notes, galleri, feed og History Go-import inn i eksisterende innsiktsmotor
```

Komponentene skal bruke eksisterende motor:

```text
source event
→ AHA ingest
→ InsightsEngine.createSignalFromMessage(...)
→ InsightsEngine.addSignalToChamber(...)
→ aha_insight_chamber_v1
→ MetaInsightsEngine
```

## Foreslått videre filstruktur i AHA-EchoNet

Eksisterende motor beholdes.

Nye filer og sider bør bygges rundt den:

```text
AHA-EchoNet/
├─ index.html                    # AHA Dashboard
├─ chat.html                     # flyttet/videreført AHA Chat-side
├─ notes.html                    # AHA Notes
├─ gallery.html                  # AHA Galleri
├─ feed.html                     # AHA Feed / Twitter
├─ insta.html                    # AHA Insta
├─ insightsChamber.js            # eksisterende motor
├─ metaInsightsEngine.js         # eksisterende metamotor
├─ ahaChat.js                    # eksisterende chatkobling
├─ ahaHistoryGoImport.js         # ny History Go-importadapter
├─ ahaSources.js                 # ny rå kildelogg
├─ ahaIngest.js                  # ny felles ingest-bro
├─ ahaNotes.js                   # ny Notes-modul
├─ ahaGallery.js                 # ny Galleri-modul
├─ ahaFeed.js                    # ny Feed-modul
├─ ahaInsta.js                   # ny Insta-modul
├─ ahaDashboard.js               # ny Dashboard-modul
├─ aha-chat.css                  # eksisterende stil
├─ aha-dashboard.css             # ny dashboard-stil
├─ aha-notes.css                 # ny notes-stil
├─ aha-gallery.css               # ny galleri-stil
├─ aha-feed.css                  # ny feed/insta-stil
└─ docs/
   ├─ AHA_ARCHITECTURE.md
   ├─ AHA_HISTORYGO_IMPORT.md
   └─ aha-python-engine-migration-status.md
```

Dette kan gjøres gradvis. Det viktigste er at alle komponentene sender data inn i samme eksisterende motor.

- AHA Python Engine migration status: `docs/aha-python-engine-migration-status.md`

## Foreslått localStorage-kontrakt

AHA-EchoNet:

```text
aha_insight_chamber_v1
= eksisterende innsiktskammer

aha_source_events_v1
= rå kildelogg for chat, notes, galleri, feed og import

aha_notes_v1
= personlige notater

aha_gallery_v1
= personlig galleri

aha_feed_posts_v1
= korte tekstposter / AHA Twitter

aha_insta_posts_v1
= bilde-/videoposter
```

History Go:

```text
aha_import_payload_v1
= History Go → AHA eksportpayload

hg_insights_events_v1
= begreps-/innsiktshendelser fra riktige quizsvar

hg_learning_log_v1
= append-only læringslogg for quiz og observasjoner

knowledge_universe
= kunnskapspunkter låst opp gjennom quiz
```

## Første konkrete byggeoppgave

Neste tekniske oppgave bør være:

```text
Bytt History Go-koblingen i AHA-EchoNet fra emnematcher-basert prototype til importadapter for aha_import_payload_v1, og legg samtidig grunnlaget for de andre AHA-komponentene rundt eksisterende motor.
```

Dette innebærer:

```text
1. Ikke lag ny motor.
2. Behold insightsChamber.js.
3. Behold metaInsightsEngine.js.
4. Fjern aktiv History Go-avhengighet til emnerLoader.js / ahaEmneMatcher.js.
5. Lag ahaHistoryGoImport.js.
6. La importknappen lese aha_import_payload_v1.
7. Konverter History Go-payload til AHA-signaler.
8. Lagre i eksisterende AHA chamber.
9. Merk alt importert materiale med source_app: historygo og imported: true.
10. Legg til AHA Sources / source event-logg.
11. Legg til AHA Ingest / felles ingest-bro.
12. Legg til tomme, trygge førsteversjoner av Dashboard, Notes, Galleri, Feed og Insta.
13. Koble komponentene til samme source/ingest-kontrakt, men ikke bygg full backend ennå.
```

## Codex-prompt for neste PR

```text
Du jobber i repoet `Paradispartiet/AHA-EchoNet`.

Oppgave:
Erstatt emnematcher-basert History Go-kobling med en importadapter som leser History Go sin eksisterende AHA-payload fra `aha_import_payload_v1`, og legg samtidig inn grunnstrukturen for de andre AHA-komponentene: Dashboard, Notes, Galleri, Feed/Twitter og Insta.

Viktig:
- Ikke lag ny AHA-motor.
- Ikke erstatt `insightsChamber.js`.
- Ikke erstatt `metaInsightsEngine.js`.
- AHA-EchoNet sin eksisterende motor er canonical.
- History Go har egen lokal innsikts-/læringsmotor.
- History Go eksporterer allerede grunnmateriale til `aha_import_payload_v1`.
- AHA-EchoNet skal ikke gjette History Go-emner på nytt med `ahaEmneMatcher.js`.
- De nye AHA-komponentene skal være innganger til eksisterende motor, ikke nye motorer.
- Ikke bygg backend nå.
- Ikke endre History-Go-repoet.

Først:
1. Les faktisk:
   - `index.html`
   - `ahaChat.js`
   - `insightsChamber.js`
   - `metaInsightsEngine.js`
   - `emnerLoader.js`
   - `ahaEmneMatcher.js`
   - `aha-chat.css`
   - `sw.js`

2. Kjør:
   - `node --check ahaChat.js`
   - `node --check insightsChamber.js`
   - `node --check metaInsightsEngine.js`

3. Rett kun reelle syntaksfeil før videre arbeid.
   Ikke gjør funksjonelle omskrivinger.

Deretter:
4. Fjern aktiv lasting av:
   - `emnerLoader.js`
   - `ahaEmneMatcher.js`

fra `index.html`.

5. Legg til ny fil:
   - `ahaHistoryGoImport.js`

Den skal:
- lese localStorage-key `aha_import_payload_v1`
- eksportere global `window.AHAHistoryGoImport`
- ha funksjonene:
  - `importHistoryGoData(payload)`
  - `importHistoryGoDataFromSharedStorage()`
  - `collectKnowledgeSignals(chamber, universe, fallbackTimestamp)`
  - `collectLearningLogSignals(chamber, events, fallbackTimestamp)`
  - `collectInsightEventSignals(chamber, events, fallbackTimestamp)`
  - `collectNextUpSignal(chamber, nextupLearningSignal, fallbackTimestamp)`

6. Adapteren skal bruke eksisterende AHA-motor:
- `InsightsEngine.createSignalFromMessage(...)`
- `InsightsEngine.addSignalToChamber(...)`
- `loadChamberFromStorage()`
- `saveChamberToStorage(...)`

7. Importprioritet:
- først `payload.nextup_learning_signal`
- deretter `payload.hg_learning_log_v1`
- deretter `payload.hg_insights_events_v1`
- deretter `payload.knowledge_universe`
- deretter `payload.notes`
- deretter `payload.dialogs`

8. Ikke bruk `ahaEmneMatcher.js` i importen.

9. For `hg_insights_events_v1`:
- lag signaltekst fra concepts:
  `History Go begreper: X, Y, Z`
- bruk `categoryId` som `theme_id` hvis finnes
- viderefør metadata:
  - place_id
  - person_id
  - concepts
  - quizId
  - imported: true
  - source_app: `historygo`
  - source_type: `historygo_concept_event`

10. For `hg_learning_log_v1`:
- lag tekst fra `name`, `correctAnswers`, `concepts`, `related_emner`, `note`
- bruk `categoryId` som `theme_id`
- viderefør metadata:
  - targetId
  - parentTargetId
  - setId
  - concepts
  - related_emner
  - correctCount
  - total
  - imported: true
  - source_app: `historygo`
  - source_type: event.type || `historygo_learning_event`

11. For `nextup_learning_signal`:
- lag ett signal med theme_id `historygo_nextup`
- tekst skal bygges fra:
  - `learning_style`
  - `interpretation_texts`
  - `inferred_interests`
  - `recommended_learning_paths`
- legg hele objektet i metadata.

12. For `knowledge_universe`:
- gå gjennom category → dimension → items
- lag signaltekst som:
  `{topic}: {text}`
- bruk category som theme_id
- legg dimension og item-id i metadata.

13. Legg til ny fil:
   - `ahaSources.js`

Den skal:
- bruke localStorage-key `aha_source_events_v1`
- eksportere global `window.AHASources`
- ha funksjonene:
  - `createSourceEvent(input)`
  - `loadSourceEvents()`
  - `saveSourceEvents(events)`
  - `addSourceEvent(input)`

Source event-schema:
- id
- source_type
- source_app
- content_type
- title
- text
- user_created
- imported
- created_at
- tags
- meta

14. Legg til ny fil:
   - `ahaIngest.js`

Den skal:
- eksportere global `window.AHAIngest`
- ha funksjonen `ingest(input)`
- lagre input som source-event via `AHASources.addSourceEvent(input)`
- hvis `InsightsEngine`, `loadChamberFromStorage` og `saveChamberToStorage` finnes:
  - lage signal med eksisterende `InsightsEngine.createSignalFromMessage(...)`
  - bruke `input.theme_id || input.source_type || "self"` som theme_id
  - sende signalet inn i `InsightsEngine.addSignalToChamber(...)`
  - lagre chamber
- dispatch event `aha:ingested`

15. Koble `ahaSources.js`, `ahaIngest.js` og `ahaHistoryGoImport.js` inn i `index.html`.

Riktig scriptrekkefølge:

<script src="insightsChamber.js"></script>
<script src="metaInsightsEngine.js"></script>
<script src="ahaFieldProfiles.js"></script>
<script src="ahaSources.js"></script>
<script src="ahaIngest.js"></script>
<script src="ahaChat.js"></script>
<script src="ahaHistoryGoImport.js"></script>

16. Behold knappen `#btn-import-hg`.
Den skal trigge `importHistoryGoDataFromSharedStorage()`.

17. Fjern eller kommenter ut Emnekatalog-blokken i `index.html`:
- `#emne-panel`
- `#emne-fields`
- `#emne-list`

Ikke fjern `field-id` nå hvis `ahaChat.js` fortsatt bruker den.

18. Legg til grunnstruktur for de andre AHA-komponentene:

Filer:
- `notes.html`
- `gallery.html`
- `feed.html`
- `insta.html`
- `ahaNotes.js`
- `ahaGallery.js`
- `ahaFeed.js`
- `ahaInsta.js`
- `aha-notes.css`
- `aha-gallery.css`
- `aha-feed.css`

Minimumskrav:
- Hver side skal laste eksisterende motorgrunnlag der det trengs.
- Hver modul skal lagre egne data i localStorage.
- Hver modul skal sende tekstlig materiale inn via `AHAIngest.ingest(...)`.
- Ingen modul skal lage egen innsiktsmotor.

LocalStorage keys:
- Notes: `aha_notes_v1`
- Galleri: `aha_gallery_v1`
- Feed: `aha_feed_posts_v1`
- Insta: `aha_insta_posts_v1`

19. Lag eller oppdater Dashboard:
- `index.html` kan fortsatt være enkel, men skal tydelig peke til:
  - AHA Chat
  - Notes
  - Galleri
  - Feed
  - Insta
  - Import History Go
- Hvis eksisterende `index.html` er for tett knyttet til chat, lag `chat.html` som kopi av eksisterende chat-side og gjør `index.html` til dashboard.
- Ikke gjør stor visuell redesign i denne PR-en. Bare ryddig grunnstruktur.

20. Legg til dokumenter:
- `docs/AHA_ARCHITECTURE.md`
- `docs/AHA_HISTORYGO_IMPORT.md`

Dokumentene skal forklare:
- AHA-EchoNet har eksisterende canonical AHA-motor.
- History Go har egen lærings-/innsiktsmotor.
- History Go eksporterer `aha_import_payload_v1`.
- AHA-EchoNet importerer dette som ferdig tolket læringsmateriale/signaler.
- AHA-EchoNet bruker ikke `ahaEmneMatcher.js` for History Go-import.
- History Go er valgfri kilde, ikke grunnlaget for personlig AHA.
- Notes, Galleri, Feed og Insta skal bruke `AHAIngest`, ikke egne motorer.

Testing:
- Kjør `node --check` på alle endrede JS-filer.
- Ikke endre History-Go-repoet.
- Ikke bygg ny backend.
- Ikke gjør stor UI-redesign.
```

## Fast prinsipp fremover

```text
Motoren finnes.
Ikke lag ny motor.
Gi motoren riktige innganger.
```

AHA-EchoNet skal være den personlige hovedmotoren.
History Go skal være en selvstendig samlingsmotor.
Importen skal være eksplisitt, merket og valgfri.
AHA-komponentene skal alle mate samme eksisterende motor.

## Riktig Sync-begrep

I AHA betyr sync at innsikt kan bevege seg mellom kilder, samtaler og etter hvert brukere.

Riktig sync-modell:

```text
source event
→ samtale / notat / import / refleksjon
→ AHAIngest
→ innsiktssignal
→ begreper / spørsmål / perspektiver
→ koblinger på tvers
→ senere EchoNet-lag
```

Feil sync-modell:

```text
prosjekt
→ status
→ phase
→ priority
→ intern roadmap
```

Presisering:

- prosjektoversikten i AHA Home kan beholdes som read-only utviklingspreview
- den skal ikke styre AHA-produktmodellen
- videre Sync Hub-arbeid skal handle om samtaleinnsikt, ikke prosjektadministrasjon

Første read-only modell for riktig AHA-retning ligger nå i `js/ahaSyncChannelsRegistry.js` som browser-global `window.AHA_SYNC_CHANNELS`. Registeret beskriver samtale-/innsiktskanaler for samtaleinnsikter, åpne spørsmål, begrepskoblinger, perspektiver, uenigheter/spenninger og samtalekoblinger. AHA Home viser disse kanalene som hovedmodell når registeret finnes. Den gamle `AHA_SYNC_HUB_PROJECTS`-oversikten er kun fallback merket som legacy utviklingspreview, og videre arbeid skal bygge på `AHA_SYNC_CHANNELS`, ikke prosjektfelter.

## Modulskall i AHA Home

AHA Home bruker en felles modulregistry i `ahaModules.js` for å vise alle hovedmoduler fra start.
`ahaContracts.js` er felles datakontrakt for modulobjekter slik at moduler kan kobles sammen på tvers uten å endre eksisterende motorflyt.
Eksisterende kjerneflater (Dashboard, Chat, Notes, Gallery, Feed, Insta) beholdes, mens øvrige moduler er tilgjengelige som synlige placeholder-innganger for videre bygging.

Søk / Bibliotek kan nå finne lokale AHA-objekter på tvers av chat-derived insights, notes, feed, gallery, insta, lists, paths og AHAavisa.

History Go-modulen i AHA viser nå importstatus, payload-oppsummering og importerte AHA source events uten automatisk import.

Gruppe-arbeidsrom viser nå en lokal grupperapport med referansestatus, utkaststatus og publiseringsmodenhet.

## AHA Music: Spotify-import MVP v1

AHA Music har nå en første datadrevet Spotify-import for brukerens eget bibliotek. Flyten er bevisst avgrenset til trygg import, normalisering og visning av Spotify-metadata.

### Importflyt

1. Konfigurer den offentlige Spotify Client ID-en én gang i `AHA_CONFIG.musicProviders.spotify` i `js/ahaConfig.js`. Brukeren skal aldri skrive inn Client ID, brukernavn eller passord i AHA Music.
2. Registrer redirect URI-en `https://paradispartiet.github.io/AHA-EchoNet/music.html` i Spotify Developer Dashboard.
3. Trykk **Koble til Spotify** og fullfør innloggingen hos Spotify. Modulen bruker Spotify Authorization Code with PKCE og ber bare om disse scopene:
   - `playlist-read-private`
   - `playlist-read-collaborative`
   - `user-library-read`
4. Etter redirect tilbake til `music.html` validerer modulen `state`, bytter autorisasjonskoden mot token, henter Spotify-profilen fra `GET /me` og bruker Spotify account ID som stabil provider-nøkkel. Deretter hentes spillelistene fra `GET /me/playlists`.
5. Brukeren velger én eller flere spillelister og trykker **Importer valgte**. Modulen henter spor fra `GET /playlists/{playlist_id}/items` og kan samtidig hente lagrede sanger fra `GET /me/tracks`.
6. Importen normaliserer data til AHA Music-strukturer for kilder, spillelister, spor, album, artister, spor-artister og spilleliste-spor. Spor dedupliseres på `spotify_track_id`.
7. Bibliotekssiden viser importstatus, importerte sanger og **Åpne i Spotify**-lenker for spor, album, artister og spillelister.

### Spotify-begrensninger og sikkerhet

- AHA Music lagrer kun metadata og Spotify-referanser, aldri lydfiler.
- Spotify-token, eventuell refresh token og provider-koblingen lagres midlertidig i `sessionStorage`. Ikke legg klienthemmeligheter i frontend; PKCE-flyten bruker kun offentlig Client ID.
- Spotify API-et gir tilgang i tråd med brukerens samtykke og de valgte scopene. Hvis token utløper, må brukeren koble til Spotify på nytt.
- Denne MVP-en bygger ikke AI-klassifisering. History Go-broen under bruker kun en kuratert seed-liste og nøktern lokal matching; den oppretter ikke nye History Go-steder.
- `localStorage` er lokal fallback/cache via `aha_music_library_v1`. Når AHA Supabase er konfigurert, kan samme normaliserte metadata speiles til tabellene `music_sources`, `music_playlists`, `music_tracks`, `music_albums`, `music_artists`, `music_track_artists` og `music_playlist_tracks`.


### AHA Music metadata-only boundary

AHA Music er modnet som et lokalt metadata-bibliotek, ikke som lydavspiller, Spotify-klient-backend eller AI-klassifiserer. `aha_music_library_v1` inneholder normaliserte metadata for kilder, spillelister, spor, album, artister, imports og relasjoner, men ingen lydfiler, audio blobs eller tokens.

- Spotify brukes bare etter eksplisitt brukerhandling: OAuth-tilkobling og valgt import av metadata.
- Spotify token og PKCE-verifier ligger i `sessionStorage` under `aha_music_spotify_token_v1` og `aha_music_spotify_pkce_v1`, ikke i localStorage-biblioteket eller privacy-exporten.
- Biblioteket lagres local-first i `aha_music_library_v1`; database-sync krever eksplisitt `AHA_CONFIG.music.enableDatabaseSync === true`.
- History Go-broen lagrer bare lokale forslag/rapporter i `aha_music_history_go_bridge_v1` og skriver ikke tilbake til History Go-lagring, `visited_places` eller `knowledge_universe`.
- EchoNet, Sync Hub, automatisk ingest, AI-klassifisering og audio playback/storage er avgrenset bort fra AHA Music.

### AHA Music Library v1

Biblioteklaget på `music.html` bruker den samme normaliserte Spotify-importen som MVP-en allerede skriver til `aha_music_library_v1` og, når Supabase er konfigurert, til tabellene `music_sources`, `music_playlists`, `music_tracks`, `music_albums`, `music_artists`, `music_track_artists` og `music_playlist_tracks`.

Strukturen i visningen er:

- **Bibliotekheader og statistikk:** teller importerte sanger, spillelister, album og artister fra det normaliserte datasettet.
- **Søk:** ett søkefelt matcher sangtittel, artistnavn, albumnavn og spillelistenavn.
- **Filtre:** spilleliste, artist, album og utgivelsesår dersom albumets `release_date` inneholder år.
- **Sanger:** viser cover fra album, tittel, artist, album, varighet, hvilke spillelister sangen finnes i og lenke til **Åpne i Spotify**.
- **Spillelister:** viser spillelistenavn, cover, antall spor, sist importert/synkronisert (`updated_at`), alle importerte spor i `position`-rekkefølge og Spotify-lenke.
- **Artister:** viser artistnavn, bilde hvis feltet finnes i dataene, antall importerte sanger, tilknyttede album, tilknyttede spillelister og Spotify-lenke.
- **Album:** viser cover, albumtittel, artistnavn fra importerte spor, utgivelsesdato hvis tilgjengelig, antall importerte sanger og Spotify-lenke.

Tomtilstander håndteres eksplisitt for ingen Spotify-konto/importdata, ingen importerte spillelister og ingen treff i søk/filtre. Biblioteket utvider ikke importlogikken og laster ikke ned lydfiler; det gjør kun importerte Spotify-metadata søkbare og lesbare i AHA Music.


### AHA Music → History Go Bridge v1

AHA Music har nå et første bro-lag som gjør importerte Spotify-metadata koblingsklare mot History Go uten å bygge kartvisning, unlocks eller nye History Go-steder. Kjernelogikken er `track → artist → place`: en importert sang kan bli et senere History Go-oppdagelsesobjekt gjennom artisten, for eksempel `Take On Me → a-ha → Oslo → History Go-sted` når stedet er verifisert.

Bridge-filene ligger i `data/aha-music/history-go/`:

- `musicHistoryGoBridgeSchema.json` beskriver schema for `musicArtistPlaceRelation`, `musicTrackPlaceRelation`, seed-kandidater og rapport.
- `musicHistoryGoSeedCandidates.json` inneholder første seed-sett for de 15 oppgitte artist/sted-kandidatene.
- `musicArtistPlaceRelations.json` og `musicTrackPlaceRelations.json` er genererte relasjonsfiler. I repo-baseline er de tomme fordi brukerens Spotify-import ikke ligger i repoet.
- `musicHistoryGoBridgeReport.json` er baseline-rapporten og kan regenereres fra en lokal AHA Music library-snapshot.

Bridge-jobben kan kjøres direkte eller via npm-scriptet:

```bash
node scripts/build-music-history-go-bridge.cjs path/to/aha_music_library_v1.json
npm run build:music-historygo-bridge -- path/to/aha_music_library_v1.json
```

Uten input skriver jobben en tom baseline. Med input leser den normaliserte AHA Music-felter (`artists`, `tracks`, `trackArtists`, `playlistTracks`) og matcher artistnavn mot seed-kandidatene i denne rekkefølgen:

1. eksakt match
2. case-insensitive match
3. normalisert match uten spesialtegn

Det gjøres ingen usikker fuzzy-match. Hvis et entydig History Go-`placeId` finnes i tilgjengelige lokale data, fylles `historyGoPlaceId` og relasjonen markeres `auto_matched`. Hvis stedet ikke finnes lokalt eller treffet ikke er entydig, beholdes `candidatePlaceName`, `historyGoPlaceId` settes til `null`, og status blir `needs_place_review`. `verified` er reservert for senere manuell kvalitetssikring.

`music.html` laster `js/ahaMusicHistoryGoBridge.js` og viser en enkel **Musikken din på kartet**-seksjon i biblioteket. Den teller sanger og artister med stedskobling, viser stedskandidater, og lister hvilke sanger som peker til hvert sted. Artistkort kan vise **Knyttet til steder** med `relationType`, `confidence` og `status`. Sangkort kan vise **Kan oppdages i History Go** med forklaring om at koblingen er arvet via artisten, for eksempel: “Denne sangen kan kobles til Oslo gjennom artisten a-ha.”



### AHA Insta local-only boundary

AHA Insta er en lokal Instagram-lignende AHA-flate for bilde-, video-, post-, story- og profilobjekter. Modulen er ikke en Instagram API-klient, kobler ikke til Instagram API, scraper ikke Instagram og har ingen backend eller ekstern bildelagring.

Lagringen er lokal: poster ligger i `aha_insta_posts_v1`, stories i `aha_insta_stories_v1`, profilen i `aha_insta_profile_v1`, import-preview i `aha_insta_import_preview_v1` og import sessions i `aha_insta_import_sessions_v1`. Likes, comments og follows ligger i egne `aha_insta_likes_v1`, `aha_insta_comments_v1` og `aha_insta_follows_v1`-nøkler og er bare lokale interaksjoner/filterdata, ikke en ekte sosial graf.

`visibility: "public"` betyr bare synlig lokalt i AHA-flaten, ikke ekstern publisering. AHA Insta publiserer ikke eksternt, bruker ikke native share, deler ikke til EchoNet og oppretter ikke ekstern konto-/profilkobling.

Import-preview er fortsatt bare forhåndsvisning i `aha_insta_import_preview_v1`. Parsing av Instagram-eksport eller lokale filer sender ingenting ut, skriver ikke til database og sender ikke automatisk data til `AHAIngest`; preview ryddes først når brukeren fullfører en valgt import.

Bare tekstlig kontekst — tittel eller caption — kan sendes til `AHAIngest`, og det skjer bare ved eksplisitt handling (`connectIngest: true`). Media-only poster uten tekst lagres lokalt, men ingestes ikke. Database-sync krever eksplisitt `AHA_CONFIG.insta.enableDatabaseSync === true`; uten dette holder `persistPost`, social persist, push og sync seg local-only.

### AHA Gallery local-only boundary

AHA Gallery er en lokal AHA-flate for bilder, minner og visuelle uttrykk. Gallery-objekter lagres i `aha_gallery_v1` som lokale brukerdata, merkes som `local_only`, og er ikke publisert eksternt eller delt til EchoNet.

Gallery laster ikke opp bilder eksternt, sender ikke bildeinnhold til backend, gjør ikke automatisk bildeanalyse og aktiverer ikke sync. Modulen kan derimot sende tekstlig kontekst — som tittel, caption/notat og tags — til eksisterende `AHAIngest` slik at AHA kan lage source event og eventuelt insight-signal fra brukerens tekst.

### AHA Music Canon v1

AHA Music har nå et eget datadrevet kanon-lag som er avgrenset fra Spotify-importen og AHA Music Library. Kanonen er første kuraterte datasett for å kunne sortere importert musikk historisk, kulturelt, teoretisk og vitenskapelig uten å kjøre automatisk klassifisering.

Kanonfilene ligger i `data/aha-music/canon/`:

- `musicCanonNodes.json` inneholder startnodene for epoker, sjangre/tradisjoner, vitenskap/musikkteori og kulturell kontekst.
- `musicCanonEdges.json` inneholder startkantene for påvirkningslinjer mellom kanon-noder.
- `musicCanonSchema.json` beskriver validerbar struktur for noder, kanter og reserverte fremtidige koblingsobjekter.

Hver node har `id`, `type`, `name`, `shortDescription`, `parentId`, `eraRange`, `region`, `tags` og `sortOrder`. Tillatte nodetyper er låst i schemaet, blant annet `era`, `genre`, `tradition`, `rhythm`, `harmony`, `production`, `technology`, `instrument`, `cultural_context`, `science_concept`, `music_theory` og `movement`.

Hver kant har `id`, `fromNodeId`, `toNodeId`, `relationType`, `shortDescription` og `confidence`. Tillatte relasjonstyper er `developed_from`, `influenced`, `belongs_to`, `parallel_to`, `reaction_against`, `uses_technique`, `emerged_in` og `transformed_into`.

`music.html` laster kanonen via `js/ahaMusicCanon.js` og viser:

- **Epoker**
- **Sjangre og tradisjoner**
- **Vitenskap og musikkteori**
- **Kulturell kontekst**
- **Påvirkningslinjer**

Brukeren kan klikke på en node for å se navn, type, kort beskrivelse, tags, relaterte noder og innkommende/utgående påvirkningslinjer. Det finnes også en eksplisitt tomtilstand for **ingen sanger koblet ennå**.

Datamodellen er klargjort for senere `track → canon nodes`, `artist → canon nodes` og `playlist → canon nodes`-koblinger gjennom reserverte link-felt i schemaet og lokale bibliotekfelter (`trackCanonNodes`, `artistCanonNodes`, `playlistCanonNodes`). Denne PR-en gjør ingen automatisk matching av importerte Spotify-sanger, artister eller spillelister; det kommer i en senere PR.

For å utvide kanonen senere:

1. Legg til en ny node i `musicCanonNodes.json` med unik `id` og en tillatt `type`.
2. Legg til eventuelle nye relasjoner i `musicCanonEdges.json`, men bare med `fromNodeId`/`toNodeId` som finnes i nodefilen.
3. Bruk kun tillatte `relationType`-verdier fra `musicCanonSchema.json`.
4. Kjør `npm test` for å validere seed-datasettet og UI-kontrakten.


### History Go Music Discovery v1

History Go kan nå lese AHA Music-brodata fra en lokal integrasjonsmappe og gjøre musikk oppdagbar på steder uten å lage unlock-logikk, quizgenerering eller kartbelønninger ennå. Loaderen ligger i `js/ahaMusicHistoryGoDiscovery.js` og leser som standard:

```text
data/integrations/aha-music/musicArtistPlaceRelations.json
data/integrations/aha-music/musicTrackPlaceRelations.json
data/integrations/aha-music/musicHistoryGoBridgeReport.json
```

Runtime-indeksen normaliserer data til `musicByPlace[historyGoPlaceId]` med `artists`, `tracks`, `relationTypes`, `statuses` og `confidenceSummary`. Bare relasjoner som har `historyGoPlaceId` vises i brukerflaten. Relasjoner uten `historyGoPlaceId` holdes som kandidater og er kun synlige via audit/utviklerstatus.

`historygo.html` viser en nøktern History Go-flate for musikk:

```text
placeId → musikkseksjon → artister → sanger
```

PlaceCard-forhåndsvisningen bruker labelen **Musikk**, viser “Knyttet til dette stedet”, “Artister knyttet til stedet”, “Sanger fra AHA Music”, relasjonstype, forklaring, confidence/status og eventuell tekst/lenke “Åpne i AHA Music” dersom relasjonen har URL/rute. Den samme indeksen brukes også til en enkel “Musikk i nærheten”-liste som teller artister og sanger per sted.

Audit er read-only og teller antall leste artist-/track-relasjoner, unike `placeId`-er med musikk, relasjoner med manglende `placeId`, `placeId` som ikke finnes i lokale History Go-data når slike data er tilgjengelige, og topp steder etter sanger/artister. Audit skriver aldri over AHA Music-kildedataene.

### AHA Music Export Bundle v1

History Go har nå én samlet, validert lesegrense for AHA Music i `data/exports/history-go/aha-music/`. Konsumenten skal lese `ahaMusicHistoryGoExport.json` og bruke `ahaMusicHistoryGoExport.schema.json` som kontrakt; `ahaMusicHistoryGoExport.report.json` er auditrapporten. Pakken samler importerte artister og spor, eksisterende artist-/spor-sted-relasjoner og eksisterende canon-koblinger uten ekstern enrichment eller endring av rådata.

Generer eller auditer pakken fra et lokalt `aha_music_library_v1`-snapshot:

```bash
npm run music:export:history-go -- path/to/aha_music_library_v1.json
npm run music:export:history-go:audit -- path/to/aha_music_library_v1.json
```

Kun relasjoner med en eksisterende `historyGoPlaceId` er sikre History Go-koblinger og får unlock-tekst. Relasjoner uten place ID blir med som `needs_place_review`, men skal ikke brukes som sikre sted-unlocks før de er verifisert. `rejected` relasjoner eksporteres ikke. Se eksportmappens `README.md` for full kontrakt, input-fallbacks og determinismeregler.

## AHA Knowledge Pipeline boundary

- **Knowledge Workbench** is a local control/status surface for pipeline health and next manual steps.
- **Data Intake** is a local candidate queue. Candidate items are not canonical knowledge.
- **Knowledge Curation** is the manual approval, dedupe and priority layer before any export.
- **Training Corpus export** must be explicit and approved, and creates only raw/needs-review local material.
- **Knowledge Map** is a derived local graph over approved/curated material, not canonical truth.
- **Graph Intelligence** is suggestion-only for gaps, links and next review actions.
- The pipeline does not call backend services, activate EchoNet, activate Sync Hub, write back to History Go, call AHAIngest, or write to the insight chamber.
- The pipeline does not auto-train models or fine-tune models.

## AHA Training and Personal AI boundary

Training Corpus is a local review corpus. It stores approved local AHA material for retrieval, context building, local example generation and future export decisions; it is not trained model data.

Training Examples are local examples and JSONL candidates. They require review and approval, and approved JSONL export is a local file/string only. Fine-tuning consent means future local export eligibility only; it does not start fine-tuning.

Personal AI is a local control/readiness/retrieval/preview/evaluation/audit surface. It builds local readiness reports, local retrieval indexes, local context, local preview answer packages, local evaluations and loop audits from approved material.

Boundary: no backend, no API/model call, no OpenAI/fine-tuning job, no remote upload, no EchoNet, no Sync Hub, no History Go write-back, no AHAIngest and no insight-chamber writes. Ekte ekstern modell/API/backend-integrasjon krever separat eksplisitt kontrakt og samtykke.
