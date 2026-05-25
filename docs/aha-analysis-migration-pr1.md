# AHA-migrering PR 1: Nåværende analyseflyt og canonical analysis object

## Scope
Denne PR-en kartlegger dagens analyseflyt i frontend (AHA Chat / innsiktsmotor) og innfører ett canonical analysis object som senere kan leveres av en Python-backend.

Ingen UI-endring, ingen DB-endring, ingen Python-backend i denne PR-en.

## Dagens analyseflyt (faktisk)

1. **Brukerinput tas imot i chatten**
   - `sendChatMessage()` henter tekst fra `#chat-input`, legger brukerlinje i loggen og sender teksten videre i dagens pipeline.
   - Fil: `ahaChat.js`.

2. **Assistant reply bygges**
   - Først forsøkes lokalt/heuristisk svar (`buildLocalAhaReply` / fallback-strategier), deretter ev. server-kall via AHA-agent-endepunkt når aktivt.
   - Reply legges i chat-visning og logges som source event.
   - Fil: `ahaChat.js`, server-endepunkt i `server.js` (`/api/aha-agent/chat`).

3. **Analyse bygges (etterarbeid)**
   - `buildAutoOutputs(userText, ahaReply)` lager dagens analysepayload: `textType`, `reflection`, `sortItems`, `day`, `thoughts`, `list`, `insightCards`, `path`, `subjectMatches`.
   - Ved feil brukes `buildAutoOutputFallbackPayload(...)`.
   - Fil: `ahaChat.js`.

4. **AHA ser-kort og analysefelter settes**
   - `buildAhaSerCard(payload, sourceText)` destillerer felter brukt i UI:
     - `tema`, `hovedspenning`, `viktigsteInnsikt`, `fagkoblinger`, `nesteSteg`, `kortSvar`.
   - Fil: `ahaChat.js`.

5. **Analyse rendres i UI**
   - `renderAutoOutputPayload(payload)` bygger «AHA ser»-seksjonen + øvrige auto-kort.
   - Fil: `ahaChat.js`.

6. **Innsikt lagres**
   - `saveAutoOutputAsAfterwork(...)` lagrer etterarbeid lokalt i afterwork-storage.
   - `ensureAfterworkForLatestAnalysis(...)` sikrer persist ved siste analyse.
   - I tillegg logges source events og innsikter håndteres via ingest/chamber-flyt.
   - Filer: `ahaChat.js`, `ahaIngest.js`, `insightsChamber.js`.

7. **Kopier/eksporter analyse**
   - `copyAhaAnalysisExportMarkdown()` (kopi til clipboard) og `exportAhaAnalysisJson()`.
   - Bundle bygges i `buildAhaAnalysisExportBundle(...)`.
   - Fil: `ahaChatExport.js` (+ wiring i `ahaChat.js`).

8. **History Go-kobling / context**
   - UI-forslag rendres av `buildHistoryGoSuggestion(...)`.
   - «Koble til History Go»-handling finnes på lagret afterwork-kort.
   - Ingest kommenterer eksplisitt at History Go har egen motor.
   - Filer: `ahaChat.js`, `ahaIngest.js`, `historygo.html` / `ahaHistoryGoStatus.js`.

## Canonical AHA analysis object (frontend-kontrakt i PR 1)

Frontend normaliserer nå til følgende struktur (`canonicalAnalysis`), uten å endre dagens visning:

```json
{
  "contentType": "",
  "domain": "",
  "theme": "",
  "mainTension": "",
  "keyInsight": "",
  "fieldConnections": [],
  "historyGoLinks": [],
  "suggestedActions": [],
  "confidence": {
    "contentType": 0,
    "domain": 0,
    "theme": 0,
    "mainTension": 0,
    "historyGoLinks": 0
  },
  "warnings": []
}
```

### `historyGoLinks` (strukturert)
`historyGoLinks` støtter objekter (ikke bare strings), f.eks:

```json
{
  "type": "place",
  "id": "morgenbladet",
  "title": "Morgenbladet",
  "reason": "Teksten handler om pressehistorie og offentlighet."
}
```

## Ny normalisering i PR 1

- `buildCanonicalAnalysis(...)` i `ahaChat.js` produserer canonical felt på toppen av eksisterende struktur.
- `normalizeAhaAnalysis(rawAnalysis)` i `ahaChatExport.js` lager en smal, robust normalisering for eksportlaget.
- Eksportbundle inneholder nå `canonicalAnalysis` i tillegg til eksisterende felt.

## Hva Python-backend senere må returnere

Python-backend bør returnere canonical object med feltene over. Frontend kan da:

- rendere eksisterende «AHA ser»-UI fra canonical felt,
- beholde dagens kort/etterarbeid-visning,
- fortsatt eie presentasjon, interaksjon, lagring og eksportformat i frontend.

Det betyr at backend ansvaret er **analyseinnhold**, mens frontend fortsatt eier **rendering/UI**.
