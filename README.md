# AHA-EchoNet

Dette dokumentet låser den nåværende arkitekturen for AHA-EchoNet, AHA, History Go og importflyten mellom dem.

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
   └─ AHA_HISTORYGO_IMPORT.md
```

Dette kan gjøres gradvis. Det viktigste er at alle komponentene sender data inn i samme eksisterende motor.

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

## Modulskall i AHA Home

AHA Home bruker en felles modulregistry i `ahaModules.js` for å vise alle hovedmoduler fra start.
`ahaContracts.js` er felles datakontrakt for modulobjekter slik at moduler kan kobles sammen på tvers uten å endre eksisterende motorflyt.
Eksisterende kjerneflater (Dashboard, Chat, Notes, Gallery, Feed, Insta) beholdes, mens øvrige moduler er tilgjengelige som synlige placeholder-innganger for videre bygging.
