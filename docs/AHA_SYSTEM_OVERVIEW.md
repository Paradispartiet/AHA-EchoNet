# AHA System Overview

Dette dokumentet låser en ren arbeidsoversikt over hva AHA er nå.

Dokumentet er et arkitektur-/strukturpunkt. Det er ikke en runtime-endring, ikke en ny motor og ikke en beslutning om å endre default analyseflyt.

## 1. Kort definisjon

```text
AHA = jeg
History Go = det jeg samler
EchoNet = den kollektive overbygningen
AHA-EchoNet = den overordnede personlige AHA-motoren
```

AHA er brukerens personlige innsiktsmotor. AHA skal forstå brukerens egne samtaler, notater, tekster, bilder, galleri, feedposter, Insta-poster, minner og valgfritt importert materiale.

History Go er ikke grunnlaget for AHA. History Go er en separat samlings- og læringsmotor som kan sende materiale til AHA.

Hovedregelen er:

```text
History Go samler verden.
AHA bestemmer hva som blir del av deg.
```

## 2. Systemkart

```text
AHA-EchoNet
├─ Personlig flate
│  ├─ Dashboard
│  ├─ Profil
│  ├─ Chat
│  ├─ Notes
│  ├─ Galleri
│  ├─ Feed
│  ├─ Insta
│  └─ Personvern / Kontroll
│
├─ Kildelag
│  └─ AHASources
│
├─ Ingest-lag
│  └─ AHAIngest
│
├─ Innsiktsmotor
│  ├─ insightsChamber.js
│  └─ metaInsightsEngine.js
│
├─ Presentasjons- og brukslag
│  ├─ Innsikter
│  ├─ Lister
│  ├─ Stier
│  ├─ Tankekart
│  ├─ Søk
│  ├─ AHAavisa
│  └─ Grupper
│
├─ Persistens
│  ├─ localStorage
│  └─ Supabase
│
├─ AI-agent backend
│  ├─ chat
│  ├─ embeddings
│  └─ insight candidates
│
└─ Valgfri import
   └─ History Go → aha_import_payload_v1 → AHAHistoryGoImport
```

## 3. Canonical motor

AHA-EchoNet har allerede en canonical motor. Den skal beholdes.

```text
js/insightsChamber.js
= selve innsiktsmotoren

js/metaInsightsEngine.js
= metanivået / mønstre på tvers

js/ahaChat.js
= chatkoblingen til motoren
```

Ingen nye moduler skal lage egen innsiktsmotor. Nye moduler skal sende kildemateriale inn via felles source/ingest-lag.

## 4. Canonical flyt

All ny AHA-data skal følge denne flyten når den skal bli innsiktsmateriale:

```text
source event
→ AHASources
→ AHAIngest
→ InsightsEngine.createSignalFromMessage(...)
→ InsightsEngine.addSignalToChamber(...)
→ aha_insight_chamber_v1
→ MetaInsightsEngine
```

Dette betyr:

```text
Chat / Notes / Galleri / Feed / Insta / History Go-import
→ samme source-kontrakt
→ samme ingest-kontrakt
→ samme chamber
→ samme meta-lag
```

## 5. Source event schema

`AHASources` er rå kildelogg for AHA.

Primær localStorage-key:

```text
aha_source_events_v1
```

Source event bør følge denne formen:

```text
id
source_type
source_app
content_type
title
text
user_created
imported
created_at
tags
meta
```

Regel:

```text
Source event = hva som kom inn
Insight = hva motoren forsto av det
```

Source event skal kunne eksistere uten at det nødvendigvis blir en insight.

## 6. Ingest-regler

`AHAIngest` er felles bro fra AHA-kilder til eksisterende AHA-motor.

Hovedansvar:

```text
1. Motta input fra modulene.
2. Lagre input som source event via AHASources.
3. Rense tekst for analyse.
4. Lage signal med InsightsEngine.createSignalFromMessage(...).
5. Legge signal inn i chamber.
6. Lagre chamber.
7. Fyres aha:ingested.
8. Kjøre ikke-blokkerende berikelse der det er tillatt.
```

`skip_insight: true` betyr:

```text
AHASources logger source eventet
AHAIngest hopper over createSignalFromMessage og addSignalToChamber
AHAIngest fyrer aha:source-only
```

Brukes særlig for AHA-agentens egne svar. Agentens svar skal kunne vises i chat og logges som source, men ikke bli ordinære brukerinnsikter.

## 7. Modulregister

Nåværende aktive AHA-moduler:

```text
AHA Profil
AHA Chat
Innsikter
Lister
Stier
Tankekart
History Go
Galleri
Notes
AHA Insta
Feed
AHAavisa
Grupper
Søk
Personvern
```

Shell / fase 2:

```text
Meet
Music
```

Status `active` betyr at modulen finnes som del av systemflaten. Det betyr ikke nødvendigvis at modulen er produktmoden, ferdig testet eller ferdig synket mot alle lag.

## 8. Personlig AHA uten History Go

AHA må kunne fungere helt uten History Go.

Primære AHA-kilder:

```text
1. Chat
2. Notes
3. Galleri
4. Egne tekster
5. Egne bilder / videoer
6. Minner
7. AHA Insta
8. AHA Feed
9. Valgfri History Go-import
```

Regel:

```text
AHA primært = selvdata
History Go = valgfri import
```

Selvdata betyr ting brukeren selv skriver, lager, velger og lagrer.

Samledata betyr ting brukeren låser opp eller samler i History Go.

## 9. History Go-import

History Go har egen lokal innsikts- og læringsmotor. AHA skal ikke gjette History Go-emner på nytt.

Riktig flyt:

```text
History Go-data
→ History Go sin lokale innsikts-/læringsmotor
→ aha_import_payload_v1
→ AHAHistoryGoImport
→ AHAIngest
→ eksisterende AHA-motor
```

Feil flyt:

```text
History Go-data
→ ahaEmneMatcher.js
→ gjettet AHA-innsikt
```

Importprioritet:

```text
1. nextup_learning_signal
2. hg_learning_log_v1
3. hg_insights_events_v1
4. knowledge_universe
5. notes
6. dialogs
```

Alt importert History Go-materiale skal merkes:

```text
source_app: historygo
imported: true
```

History Go-import skal videreføre relevant metadata, for eksempel:

```text
concepts
related_emner
categoryId
place_id
person_id
quizId
targetId
parentTargetId
setId
correctCount
total
```

## 10. ahaEmneMatcher

`ahaEmneMatcher.js` er et forslagssystem, ikke fasit.

For rå personlig AHA-tekst kan AHAIngest legge forslag på insighten:

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

Regel:

```text
target.emner = brukerbekreftede eller importerte emner
target.matched_subjects = ikke automatisk endret av matcher
emne_suggestions = provisoriske forslag
```

History Go-import skal ikke emnematches på nytt. AHA skal stole på History Go sin eksporterte metadata for History Go-materiale.

## 11. localStorage-kontrakter

AHA-EchoNet:

```text
aha_insight_chamber_v1
= eksisterende innsiktskammer

aha_source_events_v1
= rå kildelogg

aha_notes_v1
= personlige notater

aha_gallery_v1
= personlig galleri

aha_feed_posts_v1
= korte tekstposter

aha_insta_posts_v1
= bilde-/videoposter
```

History Go:

```text
aha_import_payload_v1
= History Go → AHA eksportpayload

hg_learning_log_v1
= append-only læringslogg

hg_insights_events_v1
= begreps-/innsiktshendelser

knowledge_universe
= kunnskapspunkter låst opp gjennom quiz

nextup_learning_signal
= profilert læringssignal fra NextUp
```

## 12. Supabase-lag

Supabase er konto- og persistenslag når brukeren er innlogget.

localStorage er fortsatt fallback.

Prinsipp:

```text
localStorage = lokal cache / fallback
Supabase = konto- og persistenslag når innlogget
canonical runtime = source events + chamber via AHAIngest
```

Relevante Supabase-tabeller i repository-laget:

```text
aha_source_events
aha_notes
aha_gallery_items
aha_feed_posts
aha_insta_posts
aha_imports
aha_insight_chambers
```

Regel:

```text
Supabase skal ikke bli eneste sannhet før fallback- og sync-regler er tydelig låst.
```

## 13. AI-agent backend

AHA har en Node/Express-basert AI-agent backend.

Nåværende ansvar:

```text
/api/aha-agent/chat
= samtalelag for AHA Chat

/api/aha-agent/embed
= embedding-endepunkt

/api/aha-agent/insight-candidates
= AI-genererte insight candidates
```

AI-agent backend støtter AHA. Den erstatter ikke den canonical AHA-motoren.

Agentens egne svar skal ikke automatisk bli ordinære insights. De skal logges som source-only når de sendes gjennom ingest.

## 14. Python Engine

Python Engine er staging / feature flag, ikke default.

Nåværende konseptuell flyt:

```text
AHA Chat
→ AHAEngineClient
→ optional Python AHA Engine på Render
→ canonical AHA analysis
→ canonicalAnalysisMeta
→ JavaScript fallback ved feil eller manglende URL
```

Regler:

```text
JavaScript Engine er fortsatt default.
Python Engine skal ikke gjøres default ennå.
Production-origin skal ikke sende payloads til staging uten eksplisitt aha_python_engine_url.
JavaScript fallback skal bevares som sikkerhetsnett.
```

Neste fase for Python Engine handler om kvalitet, ikke runtime-bytte:

```text
bedre analyse av fagtekst
bedre domain detection
bedre tema, hovedspenning og keyInsight
bedre fieldConnections
bedre History Go-koblinger
bedre suggestedActions
bedre confidence og warnings
flere test-fixtures
sammenligning mellom JavaScript og Python output
```

## 15. Ansvarsdeling

AHA eier:

```text
Profil
Identitet
Selvdata
Chat
Notater
Galleri
Feed
Insta
Personlig innsiktskammer
Meta-profil
Personvern
Kildekontroll
```

History Go eier:

```text
Steder
Personer
Quiz
Riktige svar
Learning log
Knowledge universe
NextUp
Wonderkammer
Badges / merits
Besøkte steder
Lokal progresjon
```

EchoNet er senere overbygning:

```text
Grupper
Sirkler
Deling
Fellesrom
Kollektive innsikter
Offentlig kandidatlag
```

## 16. Nåværende ferdig-nok-status

```text
✅ Canonical AHA-motor finnes
✅ Felles source-lag finnes
✅ Felles ingest-lag finnes
✅ Dashboard finnes
✅ Modulregister finnes
✅ History Go-importadapter finnes
✅ Supabase repository-lag finnes
✅ AI-agent backend finnes
✅ Python Engine staging finnes
✅ History Go → AHA payload finnes
✅ AHA Chat skiller brukermeldinger fra AI-svar
```

## 17. Uavklarte / risikoområder

### 17.1 Aktive moduler betyr ikke modne moduler

Mange moduler står som aktive. Det må ikke tolkes som at hver modul har komplett produktlogikk, full sync, ferdig UI og stabile kontrakter.

### 17.2 localStorage og Supabase kan gi to sannheter

Dette må håndteres med tydelige sync-regler før systemet bygges tyngre.

### 17.3 History Go må ikke bli AHA-grunnlaget

History Go skal være valgfri import. Personlig AHA skal primært forstå brukerens selvdata.

### 17.4 AI-svar må ikke forurense chamber

AHA-agentens egne svar skal ikke bli ordinære brukerinnsikter.

### 17.5 Python Engine må ikke bli default for tidlig

Python Engine skal forbedres og testes før eventuell production-konfigurasjon eller bredere utrulling.

## 18. Ikke-bryt-regler

```text
1. Ikke lag ny AHA-motor.
2. Ikke erstatt insightsChamber.js.
3. Ikke erstatt metaInsightsEngine.js.
4. Alle nye moduler skal bruke AHASources + AHAIngest når de skal skape innsiktsmateriale.
5. Ikke gjør History Go til AHA-grunnlaget.
6. Ikke emnematch History Go-import på nytt.
7. Ikke bruk ahaEmneMatcher som fasit.
8. Ikke la AHA-agentens svar bli ordinære insights.
9. Ikke gjør Python Engine default ennå.
10. Ikke fjern localStorage fallback uten egen beslutning.
11. Ikke gjør Supabase til eneste sannhet før sync-reglene er låst.
12. Ikke bland personlig AHA, History Go og EchoNet som om de er samme lag.
```

## 19. Anbefalt neste PR-rekkefølge

### PR A — Dokumentasjonslås

Legg til / behold dette dokumentet som systemoversikt.

Mål:

```text
Alle senere endringer kan sjekkes mot én oversikt før kode røres.
```

### PR B — Modulmodenhet-matrise

Lag en enkel oversikt over hver modul:

```text
modul
side
script
status
brukerdata
source event?
ingest?
Supabase?
localStorage?
kjente hull
```

Ingen runtime-endring.

### PR C — Datakontrakt-matrise

Lås kontraktene for:

```text
source events
notes
gallery
feed
insta
imports
chamber
insights
```

Ingen runtime-endring.

### PR D — Sync-regler

Dokumenter og eventuelt forbedre regelen for localStorage ↔ Supabase.

Mål:

```text
Unngå to sannheter.
```

### PR E — Modul for modul gjennomgang

Gå én modul om gangen:

```text
Notes først
Gallery deretter
Feed deretter
Insta deretter
Search / Lists / Paths etterpå
```

For hver modul:

```text
1. Les hele målfilen.
2. Bekreft faktisk flyt.
3. Koble bare manglende deler til AHASources/AHAIngest.
4. Ikke endre motor.
5. Ikke bygge ny backend.
```

## 20. Arbeidsregel fremover

Før kode:

```text
1. Finn riktig fil.
2. Les faktisk filen.
3. Plasser endringen presist.
4. Endre minst mulig.
5. Ikke bland moduler.
6. Ikke repeter tidligere arbeid.
7. Test syntaks / enkel flyt.
8. Oppdater dokumentasjon hvis kontrakt endres.
```

Dette dokumentet er styringskartet for AHA frem til en nyere systemoversikt erstatter det.
