# AHA Sync Hub / Control Center plan

Statusdato: 2026-06-05

Dette dokumentet er en planleggingslås for en fremtidig AHA Sync Hub / Control Center. Det er ikke runtime-kode, ikke en UI-beslutning, ikke en Supabase-migrasjon og ikke en beslutning om å starte automatisk sync.

## 1. Formål

AHA Sync Hub / Control Center skal gi brukeren ett tydelig sted for å se og senere kjøre manuell sync-status på tvers av AHA-moduler.

Huben skal vise:

```text
- hva som finnes lokalt
- hva som kan synkes
- hva som sist ble forsøkt synket
- hva som feilet
- hva som fortsatt er localStorage-only
- at Supabase ikke er obligatorisk
- at localStorage fortsatt er fallback/cache
```

AHA Sync Hub skal ikke være en ny datamotor. Den skal bare orkestrere og vise status for eksisterende modulkontrakter når de finnes.

## 2. V1 skal være manuell

Første versjon skal være eksplisitt manuell:

```text
- Ingen auto-sync.
- Ingen sync ved page load.
- Ingen background sync.
- Ingen skjult sync når huben rendres.
- Supabase er fortsatt valgfritt.
- localStorage er fortsatt fallback/cache.
```

Fremtidig hovedhandling kan være én tydelig knapp:

```text
Synk AHA-data
```

Individuelle modulknapper kan vurderes senere, bare der `syncFromDatabase` faktisk finnes:

```text
Synk Lists
Synk Paths
Synk Groups
Synk AHAavisa
```

## 3. Sync Hub V1-kandidater

Disse modulene er ferdige nok på modulnivå til å være Sync Hub V1-kandidater fordi de har kontrakt, repository save/load, best-effort push-on-write, `syncFromDatabase`, merge by latest action, localStorage fallback/cache og tester.

| Modul | localStorage key | Global module name | Sync-funksjon | Repository save/load | Forventet tabell |
|---|---|---|---|---|---|
| Lists | `aha_lists_v1` | `window.AHALists` | `AHALists.syncFromDatabase` | `AHARepository.saveList` / `AHARepository.loadLists` | `aha_lists` |
| Paths | `aha_paths_v1` | `window.AHAPaths` | `AHAPaths.syncFromDatabase` | `AHARepository.savePath` / `AHARepository.loadPaths` | `aha_paths` |
| Groups | `aha_groups_v1` | `window.AHAGroups` | `AHAGroups.syncFromDatabase` | `AHARepository.saveGroup` / `AHARepository.loadGroups` | `aha_groups` |
| AHAavisa / Articles | `aha_articles_v1` | `window.AHAAvisa` | `AHAAvisa.syncFromDatabase` | `AHARepository.saveArticle` / `AHARepository.loadArticles` | `aha_articles` |

V1-kandidat betyr ikke at huben skal auto-synce modulen. Det betyr bare at en fremtidig manuell hub kan vise status og senere tilby manuell sync for modulen.

## 4. Repository-støtte er ikke det samme som full Sync Hub-readiness

Sync Hub må skille tydelig mellom disse nivåene:

```text
1. Repository save/load finnes.
2. Push-on-write finnes.
3. syncFromDatabase finnes.
4. Full module-level sync pattern finnes.
```

En modul skal ikke merkes som full Sync Hub-kandidat bare fordi repository-metoder finnes. Full V1-readiness krever at runtime-modulen har `syncFromDatabase` og en dokumentert modulvis sync-/merge-kontrakt.

Forsiktig kartlegging ut fra gjeldende status- og sync-regeldokumenter:

| Modul | Repository save/load | Push-on-write | syncFromDatabase | Full module-level sync pattern | Sync Hub-behandling |
|---|---|---|---|---|---|
| Notes | Finnes i eksisterende status/regler | Finnes i eksisterende status/regler | Finnes i eksisterende status/regler | Finnes, men ikke listet som ny V1-hubkandidat i denne planen | Kan vises som eksisterende sync-modul etter egen runtime-kartlegging |
| Feed | Finnes i eksisterende status/regler | Finnes i eksisterende status/regler | Finnes i eksisterende status/regler | Finnes, men ikke listet som ny V1-hubkandidat i denne planen | Kan vises som eksisterende sync-modul etter egen runtime-kartlegging |
| Gallery / Galleri | Finnes i eksisterende status/regler | Finnes i eksisterende status/regler | Finnes i eksisterende status/regler | Finnes, men storage/opplasting er ikke bygget | Kan vises forsiktig; må ikke antyde at media-storage finnes |
| Insta | Delvis dokumentert for posts/profile/actions | Delvis dokumentert | Delvis dokumentert | Posts/actions er dokumentert; Stories/import preview/session er ikke ferdig sync | Vis status per delområde, ikke som én full sosial-sync |
| Imports | Ikke full modulvis sync-status i denne planen | Ikke full modulvis sync-status i denne planen | Ikke bekreftet her | Ikke full module-level sync pattern i denne planen | Vis som local/manual eller krever kartlegging før action |
| Chamber | Ikke full modulvis sync-status i denne planen | Ikke full modulvis sync-status i denne planen | Ikke bekreftet her | Ikke full module-level sync pattern i denne planen | Vis som ikke støttet / krever egen kontrakt før action |

Denne planen skal ikke påstå full Sync Hub-readiness for Notes, Feed, Gallery, Insta, Imports eller Chamber uten at faktisk runtime entry point, globalt modulnavn, localStorage-key, repository-metoder og `syncFromDatabase` er kartlagt i kode.

## 5. LocalStorage-only moduler

For moduler der full sync-støtte ikke er dokumentert og kartlagt, skal huben senere kunne vise:

```text
- local only
- not sync-enabled
- no manual sync action yet
```

Huben skal ikke gjette tabeller, repository-metoder eller sync-funksjoner. Dersom statusfilen eller sync-reglene ikke dokumenterer full sync, må modulen merkes som ikke støttet ennå eller krever kartlegging.

## 6. Fremtidig UI-prinsipp

Denne PR-en velger ikke endelig UI og bygger ikke kode. En fremtidig UI bør vise per modul:

```text
- Modulnavn
- Lokal status
- Repository status
- Sist forsøkt sync
- Resultat
- Antall lokale records hvis enkelt
- Manuell sync-knapp hvis syncFromDatabase finnes
```

Anbefalte resultatstatuser:

```text
Klar
Synket
Lokal fallback
Ikke innlogget
Mangler repository
Feil fra database
Ikke støttet ennå
```

Manuell sync-knapp skal bare vises eller aktiveres for moduler der `syncFromDatabase` finnes og er kartlagt.

## 7. Anbefalt sync-resultat-kontrakt

Fremtidig hub-kode bør normalisere modulresultater til en felles shape før visning:

```js
{
  moduleId,
  label,
  ok,
  status,
  fallback,
  count,
  syncedAt,
  error
}
```

Dette dokumentet innfører ikke denne kontrakten i runtime nå. Det er bare en anbefaling for senere hub-kode, slik at UI kan vise konsistente statuser selv om modulene returnerer ulike detaljer.

## 8. Ikke-bryt-regler for Sync Hub

AHA Sync Hub må ikke:

```text
- auto-synce ved page load
- gjøre Supabase obligatorisk
- slette localStorage ved remote-feil
- skjule lokal fallback
- lage source events
- lage insights
- mutere refererte objekter
- publisere AHAavisa eksternt
- gjøre Groups til ekte social sharing
- endre Lists/Paths/Groups/AHAavisa data-shape
- endre conflict rules i modulene
```

Huben skal bruke eksisterende modulfunksjoner og respektere modulenes egne konfliktregler. Huben skal ikke bli et sted der data-shape eller merge-regler endres indirekte.

## 9. Feil og fallback

Huben skal tåle:

```text
- manglende AHARepository
- manglende Supabase session/profile
- manglende tabell
- invalid remote payload
- repository exception
- module missing syncFromDatabase
```

I alle slike tilfeller skal huben:

```text
- vise tydelig status
- beholde lokal data
- ikke slette localStorage
- ikke stoppe hele huben hvis én modul feiler
- vise localStorage fallback/cache tydelig
```

Supabase-feil er ikke en global AHA-feil. De betyr at modulen må kunne fortsette lokalt.

## 10. AHA Home entry point mapping

Denne kartleggingen er dokumentasjon før runtime-kode. Den bygger ikke Sync Hub, endrer ikke JS/HTML/CSS og starter ikke sync.

### 10.1 Eierskap og hovedområder

AHA Home eies av `index.html`. Runtime-rendering for dashboardet eies av `js/ahaDashboard.js`, og modulmenyen eies av `js/ahaModules.js`.

`index.html` har tre relevante hovedområder:

```text
1. Venstre panel: aside.aha-modules-panel / modulmeny.
2. Midtpanel: section.aha-home-panel / AHA Home.
3. Høyre panel: aside.aha-status-panel / System/Status.
```

Sync Hub skal ikke bygges som auto-sync i `renderDashboard()` eller annen dashboard-rendering. Dashboard-rendering kan senere vise read-only status, men må ikke starte sync, databasekall eller bakgrunnsarbeid.

### 10.2 Første anbefalte plassering

Første plassering bør være høyre statuspanel:

```text
aside.aha-status-panel
```

Anbefalt plassering i panelet:

```text
- etter aha-dashboard-stats / historygo/privacy-status
- før eller etter Siste aktivitet, avhengig av layout
```

Foreslått fremtidig mount-id:

```text
aha-sync-hub-status
```

Dette bør først være et lite read-only statuskort. Første kode bør ikke velge full side hvis et lite statuskort i høyre statuspanel holder.

### 10.3 Alternative plasseringer senere

Senere alternativer, etter read-only statuskortet, kan være:

```text
- egen full side: sync.html
- egen seksjon i midt AHA Home-panel
```

Disse alternativene bør vente hvis de krever mer runtime, egen script-loading eller større UI-beslutning enn et lite statuskort.

### 10.4 Eksisterende DOM-punkter på AHA Home

Relevante eksisterende DOM-punkter:

| DOM-id | Rolle for Sync Hub-kartlegging |
|---|---|
| `aha-dashboard-stats` | Eksisterende statuskort/tall i høyre statuspanel. |
| `aha-historygo-status` | Eksisterende History Go-status i høyre statuspanel. |
| `aha-privacy-status` | Eksisterende privacy-status i høyre statuspanel. |
| `aha-recent-activity` | Eksisterende liste for Siste aktivitet i høyre statuspanel. |
| `out` | Eksisterende teknisk dashboard-output i høyre statuspanel. |
| `aha-status-updated` | Eksisterende oppdatert-tid/status i høyre statuspanel. |
| `aha-modules-grid` | Eksisterende mount for modulmenyen i venstre panel. |
| `aha-sync-hub-status` | Foreslått fremtidig mount-id for read-only Sync Hub-statuskort. |

`aha-sync-hub-status` finnes ikke ennå; en senere kode-PR kan legge den til i `aside.aha-status-panel`.

### 10.5 Eksisterende dashboard-runtime som kan gjenbrukes senere

`js/ahaDashboard.js` har allerede runtime-hjelpere som en senere read-only statusflate kan gjenbruke eller følge mønsteret til:

```text
- readArray(key)
- localStats()
- databaseStats()
- renderStatCards()
- renderDashboard()
- AHADashboard.getLastState()
```

Denne dokumentasjons-PR-en endrer ikke disse funksjonene. En senere kode-PR må fortsatt passe på at `renderDashboard()` ikke starter auto-sync.

### 10.6 Script-loading-konsekvens på Home

`index.html` laster allerede disse fellesfilene på AHA Home:

```text
js/ahaRepository.js
js/ahaModules.js
js/ahaProfile.js
js/ahaDashboard.js
```

`index.html` laster per nå ikke modulruntime-filene for de fire nye Sync Hub V1-kandidatene:

```text
js/ahaLists.js
js/ahaPaths.js
js/ahaGroups.js
js/ahaAvisa.js
```

Konsekvens:

```text
- Read-only Sync Hub kan telle localStorage direkte uten modulruntime.
- Manuell sync-knapp kan ikke trygt kalle AHALists/AHAPaths/AHAGroups/AHAAvisa.syncFromDatabase fra Home før disse modulene er lastet.
- Hvis manuell sync bygges på Home, må en senere PR enten:
  A. laste de fire modulfilene på index.html
  B. lage egen sync.html som laster dem
  C. lage separat hub-runtime som registrerer modulene eksplisitt
```

Denne PR-en bestemmer ikke endelig script-loading for manuell sync, fordi det krever runtime-arbeid.

## 11. Faseplan etter kartleggingen

AHA Sync Hub skal utvikles i små, låste faser. Hver fase må bevare reglene om ingen auto-sync, ingen skjulte databasekall og ingen runtime-write uten egen kontrakt.

```text
1. ✅ Read-only AHA sync status hub
2. ✅ Manual action shell
3. ✅ Dry-run planner
4. ✅ Validation layer
5. ✅ Readiness gate
6. ✅ Payload preview
7. ✅ Operator checklist
8. ✅ Gated disabled Manual sync button
9. ✅ Manual sync execution contract
10. ✅ Confirmation modal
11. ✅ Audit log preview
12. ✅ Target selector preview
13. ✅ Manual sync target contract
14. ✅ Adapter interface stub
15. ✅ Execution state machine stub
16. ✅ Run summary preview
17. ✅ Execution activation checklist (dokumentasjon, ikke runtime activation)
18. ✅ Activation blocker tests (test/safety only, ikke runtime activation)
19. Neste: Target adapter dry-run harness
20. Senere: faktisk write/sync etter eksplisitt target-, audit- og rollback-PR
```

Manual sync execution contract er dokumentert i `docs/AHA_MANUAL_SYNC_CONTRACT.md`. Den er en kontrakt før faktisk implementasjon og definerer moduler i scope, preconditions/gates, blocking rules, payload-shape, write target-status, manuell bekreftelse, audit log, failure behavior og rollback/partial failure-regler.

## 12. Manual sync execution contract-fasen

Denne fasen ligger etter den gated disabled Manual sync-knappen og før confirmation modal. Formålet er å låse hva en fremtidig manuell sync må gjøre før knappen får faktisk skrivekraft.

Kontrakten presiserer at første manuelle sync bare kan gjelde:

```text
- Lists
- Paths
- Groups
- AHAavisa
```

Home skal fortsatt ikke laste disse modulruntime-filene direkte bare for sync:

```text
js/ahaLists.js
js/ahaPaths.js
js/ahaGroups.js
js/ahaAvisa.js
```

Sync Hub skal bruke kontrollert payload-preview / sync-kontrakt, ikke direkte modul-runtime som ukontrollert write path.

Kontrakten krever at faktisk sync senere bare kan vurderes når readiness er `ready`, validation errors er 0, payload preview har minst én inkludert modul, operator checklist har 0 blocked items, brukeren har bekreftet manuelt, Manual sync-knappen er aktivert i egen fremtidig PR, audit log-strategi er definert og write target er eksplisitt valgt.

Warnings blokkerer ikke nødvendigvis sync, men må vises, inngå i summary/audit og bekreftes manuelt før write.

## 13. Confirmation modal-fasen er implementert

Confirmation modal er nå implementert som UI-only preview/requirements-flate. Den skriver ikke data, starter ikke sync, sender ikke payload, kaller ikke repository/database/API og aktiverer ikke Manual sync eller Confirm sync. Den gjør bekreftelsesflyten eksplisitt:

```text
- payload summary
- included/excluded modules
- item counts
- warnings/errors-status
- readiness status
- target-status
- audit log-forventning
- rollback/partial failure-status
- én ekstra run-scoped manuell bekreftelse
```

Bekreftelsen skal gjelde én sync-run og ikke lagres permanent. Confirm sync er fortsatt disabled til faktisk manual sync execution er implementert i en senere PR. Det skal fortsatt ikke finnes sync ved page load, sync ved åpning av kontrollpanel, skjult save/load, databasekall eller auto-sync.

## 13.1 Audit log preview-fasen er implementert

Audit log preview er nå implementert som read-only/UI-only preview. Den viser hva en fremtidig audit record ville inneholde, inkludert preview-run-id, preview-generert timestamp, trigger/status/target, included/excluded modules, item counts, readiness, validation summary, checklist summary, payload preview summary, warnings/errors og rollback/write-status.

Denne fasen skriver ikke audit log, velger ikke write target og starter ikke sync. Previewen er in-memory/UI-only og skal ikke brukes som faktisk audit-id.

## 13.2 Target selector preview-fasen er implementert

Target selector preview er nå implementert som read-only/UI-only og in-memory UI-state. Den viser fremtidige target-valg (`not_configured`, `aha_repository_future`, `database_api_future`, `custom_sync_backend_future`), target-status, gate reason og valgt preview-target i audit log preview og confirmation modal.

Denne fasen konfigurerer ikke target, skriver ikke audit log, starter ikke sync, sender ikke payload, kaller ikke repository/database/API/fetch/Supabase/Firebase og skriver ikke til localStorage. Manual sync og Confirm sync er fortsatt disabled/gated uansett valgt preview-target.


## 13.3 Manual sync target contract-fasen er implementert

Manual sync target contract er nå dokumentert i `docs/AHA_MANUAL_SYNC_TARGET_CONTRACT.md` etter target selector preview-fasen. Kontrakten definerer hva et fremtidig manual sync target er, hvilke target-id-er som kan vurderes senere, target activation rules, blocking rules, write boundary, target-spesifikke kontrakter, payload compatibility, audit log per target, failure/rollback-regler og security/secrets-regler.

Kontrakten låser disse target-statusene som future-only eller safe default:

```text
- not_configured = default/safe, ingen write mulig
- aha_repository_future = preview-only til egen AHARepository adapter-PR
- database_api_future = preview-only til egen API/database adapter-PR
- custom_sync_backend_future = preview-only til egen backend adapter-PR
```

Denne fasen kobler ikke til target, legger ikke til adapter, aktiverer ikke Manual sync eller Confirm sync, skriver ikke audit log, skriver ikke til localStorage og endrer ikke runtime-atferd. Target selector preview er fortsatt preview-only. Faktisk write/sync kommer fortsatt senere etter eksplisitt target-adapter, audit log-skriving og rollback-/partial failure-implementasjon.


## 13.4 Manual sync adapter interface stub-fasen er implementert

Adapter interface stub er nå implementert som et trygt no-write/no-op grensesnitt. Den kan forberede en stub-run for preview/status, men `executeRun` returnerer fortsatt blocked/disabled og kan ikke starte faktisk sync. Adapteren kobler ikke til target, skriver ikke audit log, sender ikke payload, kaller ikke repository/database/API og skriver ikke til localStorage.

## 13.5 Execution state machine stub-fasen er implementert

Execution state machine stub er nå implementert for fremtidige manual sync-runs. Default state er `blocked` med `previousState=not_started`, `canExecute=false`, `canWrite=false`, `isStub=true` og `writeStatus=disabled_stub_only`.

State machine er preview/status only og skriver ikke data. Den definerer state-navnene `not_started`, `blocked`, `confirmed`, `running`, `partial_success`, `success`, `failed` og `rolled_back`, men `confirmed`, `running`, `success` og `partial_success` er blokkert i denne fasen og kan ikke nås fra UI. Running/success-states kan dermed ikke brukes til faktisk execution ennå.

Run summary preview-fasen er nå implementert. Den oppsummerer fremtidige run-signaler uten write, uten faktisk target, uten audit log-skriving, uten payload-send og uten auto-sync. Faktisk write/sync kommer fortsatt senere.

## 13.6 Run summary preview-fasen er implementert

Run summary preview er nå implementert som kompakt, read-only og in-memory oversikt i expanded Sync Hub-kontrollpanel og confirmation modal. Den samler readiness gate, validation summary, payload preview, operator checklist, audit log preview, target selector preview, adapter status og execution state machine status i én preview før en fremtidig manual sync-run.

Summaryen viser preview-run-id, timestamp, valgt preview-target, target-/adapter-/state machine-status, inkluderte/ekskluderte moduler, totalPreviewItems, validation counts, readiness, checklist counts, audit/write/rollback status, blockers, warnings og next required steps. Den viser eksplisitt `canExecute=false` og `canWrite=false`.

Run summary skriver ikke data, sender ikke payload, skriver ikke audit log, kaller ikke repository/database/API, kobler ikke til target, skriver ikke til localStorage og starter ikke sync. Manual sync-knappen og Confirm sync forblir disabled/gated. Faktisk write/sync kommer senere etter execution activation checklist, target-adapter, audit log-skriving og rollback-/partial failure-regler.

## 13.7 Execution activation checklist-fasen er implementert

Execution activation checklist er nå dokumentert i `docs/AHA_MANUAL_SYNC_ACTIVATION_CHECKLIST.md` etter run summary preview-fasen. Dette er dokumentasjon, ikke runtime activation. Den definerer siste go/no-go-sperre før faktisk manual sync execution kan vurderes i en senere PR.

Checklist-fasen lister required implemented layers, required docs/contracts, data readiness, target readiness, adapter readiness, state machine readiness, audit readiness, UI readiness, safety/no-auto rules, activation blockers, required tests før activation og regler for en fremtidig activation-PR.

Denne fasen aktiverer ikke Manual sync eller Confirm sync, kobler ikke target, skriver ikke audit log, sender ikke payload, gjør ikke repository/database/API/fetch/Supabase/Firebase-kall, skriver ikke til localStorage og endrer ikke runtime-atferd. Faktisk write/sync kommer fortsatt senere etter egne target-, audit-, rollback-/partial failure- og activation-PR-er.

Activation blocker tests-fasen er nå implementert. Den beviser at Manual sync / Confirm sync fortsatt er blokkert før activation, at dashboard/sync-runtime ikke har skjulte write paths, at target/adapter/state machine blokkerer riktig, og at `partial_success` er unreachable uten partial failure-kontrakt. Testene aktiverer ikke sync, kobler ikke target, sender ikke payload, skriver ikke audit log og gjør ikke faktisk write.


## 13.8 Activation blocker tests-fasen er implementert

Activation blocker tests er nå lagt til som test-/safety-lås etter execution activation checklist-fasen. De tester adapterstatus, target validation, prepare/execute-resultater, missing/not_configured/future-only targets, state machine states, blokkerte transitions og statiske forbidden-call guards for relevante sync-runtime-filer.

Denne fasen aktiverer ikke Manual sync eller Confirm sync, kobler ikke target, sender ikke payload, skriver ikke audit log, gjør ikke repository/database/API/fetch/Supabase/Firebase-kall, skriver ikke til localStorage og starter ikke auto-sync. Faktisk write/sync kommer fortsatt senere.

Neste fase er target adapter dry-run harness. Den skal fortsatt være dry-run/no-write og bare legge grunnlag for å validere target-spesifikk form før en senere separat activation/write-PR.

## 14. Faktisk write/sync kommer senere

Faktisk write/sync skal ikke innføres som del av contract-, confirmation modal-, audit log preview-, adapter stub-, state machine stub-, run summary preview- eller activation checklist-fasen. Activation checklist er dokumentasjon, ikke runtime activation. Activation blocker tests finnes nå uten write. En senere target-adapter dry-run harness må fortsatt holde seg no-write, og en enda senere target-adapter/write-PR må eksplisitt velge target før write:

```text
- AHARepository via dokumentert target-adapter
- database/API via dokumentert target-adapter
- annen sync-backend via dokumentert target-adapter
```

Ingen target kan brukes før den er valgt i egen PR. Ingen save/load, databasekall, repository-kall eller localStorage-skriving skal innføres skjult. Ingen fremtidig PR skal innføre uklar partial write; første ekte sync bør være atomic eller modul-atomic, eller så må sync blokkeres til rollback/partial failure behavior er dokumentert.

## 15. Ikke-bryt-regler for videre Sync Hub-arbeid

Reglene fra denne planen gjelder fortsatt:

```text
- ingen auto-sync
- ingen sync ved page load
- ingen background sync
- ingen skjult sync når huben rendres
- Supabase er ikke obligatorisk
- localStorage er fallback/cache
- Sync Hub skal ikke lage source events
- Sync Hub skal ikke lage insights
- Sync Hub skal ikke mutere refererte objekter
- Sync Hub skal ikke publisere AHAavisa eksternt
- Sync Hub skal ikke gjøre Groups til ekte social sharing
- Sync Hub skal ikke aktivere Manual sync-knappen uten egen PR
- Sync Hub skal ikke skrive før target, audit log og rollback/partial failure-regler er valgt
```

## 16. Neste anbefalte PR

Neste anbefalte PR etter activation blocker tests-fasen er:

```text
feat: add AHA manual sync target adapter dry-run harness
```

Akseptanse for den PR-en bør være en fortsatt no-write target adapter dry-run harness: ingen faktisk target-tilkobling for write, ingen payload-send, ingen audit log-skriving, ingen repository/database/API/fetch/Supabase/Firebase/localStorage write paths og ingen activation av Manual sync eller Confirm sync. Faktisk write/sync kommer fortsatt senere etter eksplisitt target-adapter, audit log-skriving og rollback-/partial failure-implementasjon.
