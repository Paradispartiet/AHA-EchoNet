# AHA Sync Hub – current implementation audit

Statusdato: 2026-06-11  
Audit-baseline: `d6e73b2` (`feat: add AHA Sync Hub runtime adapter`)

Dette dokumentet kartlegger hva som faktisk finnes i gjeldende repository etter read-only-adapteren, compact diagnostics-arbeidet og de nyere manual-sync-lagene. Det er en dokumentasjonsaudit. Det aktiverer ikke runtime, sync, auto-sync, nye writes eller modul-lasting.

Den normative aktiveringsbeslutningen og gate-statusen ligger i [`AHA_SYNC_HUB_GO_NO_GO_MATRIX.md`](./AHA_SYNC_HUB_GO_NO_GO_MATRIX.md). Gjeldende beslutning er NO-GO for ekte manuell sync; auto-sync er permanent NO-GO.

Activation evidence for gates A–J er samlet i [`AHA_SYNC_HUB_ACTIVATION_EVIDENCE.md`](./AHA_SYNC_HUB_ACTIVATION_EVIDENCE.md). Reviewen opprettholder NO-GO for manual execution og permanent forbud mot auto-sync.

## 1. Kort konklusjon

Gjeldende kode har tre forskjellige nivåer som må holdes adskilt:

1. `window.AHASyncHub` i `js/ahaSyncHub.js` er en ren read-only inspeksjonsadapter. Den teller aktive lokale records og gjør ingen sync- eller databaseoperasjoner.
2. Den renderer som faktisk brukes av `renderSyncHubStatus()` i `js/ahaDashboard.js`, viser et enkelt read-only Home-kort basert på `AHASyncHub.inspectAll()`. Den tidligere kompakte operatorstatusen med target, blockers, siste run og `Advanced diagnostics` finnes fortsatt som hjelpefunksjoner i samme fil, men er ikke lenger koblet inn i den aktive rendereren etter adapter-endringen.
3. Manual-sync-runtime finnes fortsatt: `js/ahaManualSyncAdapter.js` og `js/ahaManualSyncStateMachine.js` er ikke stubs. Adapteren kan, når den kalles eksplisitt med alle gates bestått, skrive Lists, Paths, Groups og AHAavisa-data via eksisterende `AHARepository`-metoder og skrive audit-logg. Den nåværende Home-rendereren eksponerer imidlertid ikke denne confirmation-/execution-flyten.

Derfor er den presise statusen:

- Home Sync Hub: **read-only og aktiv som statuskort**.
- Advanced/compact operator diagnostics: **implementert i kildekoden, men ikke aktivt rendret fra gjeldende Home-renderer**.
- Manual-sync preview/checklist/history/retry-lag: **implementert, men nå i praksis frakoblet fra aktiv Home-flate**.
- Manual-sync execution API: **implementert og write-capable**, men **ikke brukeraktivert fra gjeldende Home-kort**.
- Auto-sync: **finnes ikke**.

## 2. Statusliste for Sync Hub-laget

| Lag | Finnes? | Filer | Status | Skriver data? |
|---|---|---|---|---|
| Read-only Home status card | Ja | `index.html`, `js/ahaSyncHub.js`, `js/ahaDashboard.js` | **Aktiv / read-only** | Nei. Aktiv renderer kaller bare `AHASyncHub.inspectAll()`. |
| Compact diagnostics | Delvis | `js/ahaDashboard.js`, `tests/aha-home-compact-status-cards.test.cjs` | **Implementert, men ikke aktivt koblet inn** | Ikke ved rendering. De bevarte builderne er preview/read-only, men confirmation-handleren kan delegere til write-adapter dersom den igjen rendres og alle gates passerer. |
| `AHASyncHub` runtime adapter | Ja | `js/ahaSyncHub.js`, `tests/aha-sync-hub-runtime-adapter.test.cjs` | **Aktiv / read-only** | Nei. |
| Manual sync activation path docs | Ja | `docs/AHA_SYNC_HUB_PLAN.md`, `docs/AHA_MANUAL_SYNC_CONTRACT.md`, `docs/AHA_MANUAL_SYNC_TARGET_CONTRACT.md` | **Dokumentert** | Nei. |
| Manual sync checklist docs | Ja | `docs/AHA_MANUAL_SYNC_ACTIVATION_CHECKLIST.md` | **Dokumentert** | Nei. |
| Manual sync blocker tests | Ja | `tests/aha-manual-sync-activation-blockers.test.cjs` | **Aktive tester** | Testene bruker fakes og verifiserer gates; de endrer ikke produksjonsdata. |
| Manual sync preview/run summary | Ja | `js/ahaDashboard.js`, `tests/aha-manual-sync-run-summary-preview.test.cjs` | **Preview-only, men ikke aktivt rendret nå** | Nei ved preview. |
| Manual sync target dry-run | Ja | `js/ahaManualSyncAdapter.js`, `js/ahaDashboard.js`, `tests/aha-manual-sync-database-target.test.cjs` | **Preview-only** | `runAhaManualSyncTargetDryRun()` setter `wouldExecute: false` og `wouldWrite: false`. |
| Manual sync adapter | Ja | `js/ahaManualSyncAdapter.js` | **Aktiv execution boundary, gated; ikke tilgjengelig fra aktiv Home-renderer** | Ja, ved eksplisitt `executeAhaManualSyncRun()` med beståtte gates. Den kan også skrive audit-entry for blokkerte execution-forsøk. |
| Manual sync state machine | Ja | `js/ahaManualSyncStateMachine.js`, `tests/aha-manual-sync-state-machine.test.cjs` | **Aktiv, ikke stub; per-run gated** | Ikke direkte. Den styrer transitions og write-tillatelse, men gjør ingen nettverks- eller storage-kall selv. |
| Manual sync history | Ja | `js/ahaManualSyncHistory.js`, `js/ahaManualSyncAdapter.js`, `js/ahaDashboard.js` | **Read-only reader/preview; ikke aktivt rendret nå** | Readeren skriver ikke, men leser audit-events via `AHARepository.loadSourceEvents()`. |
| Retry eligibility | Ja | `js/ahaManualSyncHistory.js`, relevante retry-tester | **Preview-only** | Nei. Det finnes ingen `Retry now` eller retry execution. |
| Faktisk manual-sync fra gjeldende Home UI | Nei | Aktiv `renderSyncHubStatus()` i `js/ahaDashboard.js` | **Ikke aktivert i gjeldende Home-flate** | Nei fra Home-kortet. |
| Programmatisk manual-sync execution | Ja | `window.AHAManualSyncAdapter.executeAhaManualSyncRun` | **Aktivert som gated runtime-API** | Ja, via `AHARepository.saveList`, `savePath`, `saveGroup`, `saveArticle` og audit writer. |

Denne siste forskjellen er viktig: det er ikke korrekt å beskrive hele manual-sync-runtime som bare disabled/preview. UI-entry pointet er borte fra aktiv renderer, men execution-adapteren er write-capable.

## 3. `window.AHASyncHub` runtime adapter

### Fil og eksporterte helpers

`js/ahaSyncHub.js` eksponerer `window.AHASyncHub` med:

- `modules`
- `safeReadArray(key)`
- `isDeletedRecord(record)`
- `countActiveRecords(key)`
- `inspectModule(moduleConfig)`
- `inspectAll()`

`inspectAll()` returnerer:

- `ok: true`
- `mode: "read_only"`
- `autoSync: false`
- én inspeksjonsrad per konfigurert modul

### localStorage-scope

Adapteren leser og teller disse fire nøklene:

| Modul | localStorage-key | Forventet tabell |
|---|---|---|
| Lists | `aha_lists_v1` | `aha_lists` |
| Paths | `aha_paths_v1` | `aha_paths` |
| Groups | `aha_groups_v1` | `aha_groups` |
| AHAavisa | `aha_articles_v1` | `aha_articles` |

`safeReadArray()` bruker bare `localStorage.getItem()`, behandler ugyldig JSON og ikke-array som tom liste, og muterer ikke data. `countActiveRecords()` filtrerer bort records der enten `deletedAt` eller `deleted_at` er truthy.

### Side effects og forbudte kall

| Spørsmål | Faktisk status |
|---|---|
| Kaller adapteren `syncFromDatabase()`? | Nei. Den sjekker bare om funksjonen finnes på forventet global modulruntime. |
| Kaller den `AHARepository`? | Nei. `AHARepository` er ikke referert i filen. |
| Skriver den localStorage? | Nei. Ingen `setItem`, `removeItem` eller `clear`. |
| Gjør den database-/Supabase-kall? | Nei. Ingen repository-, fetch-, klient- eller Supabase-kall. |
| Starter den auto-sync? | Nei. `autoSync` er eksplisitt `false`. |

Runtime-status per modul er `klarlagt` når Home ikke har lastet modulglobalen, `mangler_sync` når runtime finnes uten `syncFromDatabase`, og `sync_klar` når funksjonen finnes. `canSyncHere` er kun capability-metadata; inspeksjonen kaller aldri funksjonen.

## 4. AHA Home dashboard

### Mount og plassering

- Mount-id er `aha-sync-hub-status`.
- Mounten ligger i høyre statuspanel, `aside.aha-status-panel`, i `index.html`.
- `index.html` laster `js/ahaSyncHub.js` før manual-sync-lagene og `js/ahaDashboard.js`.

### Aktiv renderer

Den aktive `renderSyncHubStatus()` i `js/ahaDashboard.js`:

1. finner `#aha-sync-hub-status`;
2. viser en read-only fallback dersom `window.AHASyncHub.inspectAll` mangler;
3. kaller ellers `window.AHASyncHub.inspectAll()`;
4. viser Lists, Paths, Groups og AHAavisa med aktiv local count, localStorage-key, forventet tabell og runtime/capability-status;
5. sier uttrykkelig at ingen sync kjøres automatisk og at ingen sync kjøres fra kortet.

Hvis adapteren mangler, fortsetter dashboardet og viser `Sync Hub-adapter ikke lastet`; det forsøker ikke fallback-sync eller repository-kall.

### Compact og advanced diagnostics

Kildekoden inneholder fortsatt builder-/renderer-lag for:

- dry-run plan og validation
- payload preview
- operator checklist
- target selector
- state-machine-status
- target dry-run harness
- audit-log preview
- run-summary preview
- confirmation modal
- history/details
- retry eligibility
- compact blockers og last-run status

Etter gjeldende adapter-commit kaller den aktive `renderSyncHubStatus()` ingen av disse funksjonene. `Open Sync Hub`/`Advanced diagnostics`, target/included/last-run-kortet og history-panelet blir derfor ikke rendret på Home nå. Dette er en regresjon/drift mellom tidligere compact-card-dokumentasjon/testforventninger og gjeldende renderer, ikke en manglende implementasjon av helper-koden.

### Modulruntime-loading

Home laster fortsatt ikke:

- `js/ahaLists.js`
- `js/ahaPaths.js`
- `js/ahaGroups.js`
- `js/ahaAvisa.js`

`js/ahaDashboard.js` importerer eller laster dem heller ikke dynamisk. `AHASyncHub` rapporterer derfor normalt `module_not_loaded_on_home` for disse modulene.

## 5. Manual sync-status

| Del | Statusord | Faktisk status |
|---|---|---|
| Activation path | **Dokumentert** | Plan, execution contract, target contract og activation checklist finnes. |
| Checklist | **Dokumentert** | Både dokument og runtime checklist-builder finnes. Runtime-visningen er ikke koblet inn i aktiv Home-renderer. |
| Blockers | **Disabled/gated** | Validation, readiness, checklist, target, adapter, state machine, payload og explicit-confirmation gates finnes og testes. |
| Preview | **Preview-only** | Dry-run, payload, target, audit, run summary og retry eligibility finnes uten write i preview-funksjonene. |
| Adapter | **Aktivert som API** | Ikke stub. Kan prepare, dry-run, lese history og utføre gated writes. |
| State machine | **Aktivert som per-run gate** | Ikke stub. Tillater `blocked -> confirmed -> running -> success/failed`; rollback er ikke tilgjengelig uten eksplisitt capability. |
| Home confirmation UI | **Ikke aktivert** | Confirmation-/execution-helperne finnes, men aktiv Home-renderer rendrer eller binder dem ikke. |
| Faktisk sync fra Home | **Ikke aktivert** | Ingen synlig sync-knapp eller confirmation-flow i gjeldende Home-kort. |
| Faktisk sync via runtime-API | **Aktivert** | Et eksplisitt programmatisk kall kan skrive når alle gates og repository-metoder er tilgjengelige. |

### Adapterens write-grense

`executeAhaManualSyncRun()` krever eksplisitt confirmation token/flag, bestått preparation, konfigurert `database_existing` target, nødvendige repository-metoder og audit writer. Ved success kalles eksisterende repository-metoder per item:

- Lists: `AHARepository.saveList`
- Paths: `AHARepository.savePath`
- Groups: `AHARepository.saveGroup`
- AHAavisa: `AHARepository.saveArticle`

Deretter skrives audit-logg via `writeAhaManualSyncAuditLog` eller kompatibel writer. History leses via `loadSourceEvents`.

To begrensninger må være eksplisitte:

- Blokkerte execution-forsøk kan fortsatt forsøke å skrive en audit-entry. «Ingen payload-write uten confirmation» er derfor korrekt, mens «ingen databasewrite overhodet uten confirmation» ikke er korrekt for audit-sporet.
- `writeRunPayload()` kjører sekvensielt og kaster ved første mislykkede item-write. En feil i én modul kan dermed stoppe resterende items/moduler. Isolert per-modul failure continuation er ikke implementert.

## 6. Guardrails som fortsatt gjelder

### Bekreftet i gjeldende aktive Home-løype

- ingen auto-sync
- ingen sync ved page load
- ingen sync ved `renderDashboard`
- ingen sync ved `storage`-event
- ingen sync ved `aha:auth-ready`
- ingen sync når read-only Sync Hub-kortet rendres
- ingen skjult payload-write fra dashboard-rendereren
- ingen ekstern AHAavisa-publisering
- ingen ekte Groups/social sharing
- ingen localStorage-sletting ved remote-feil
- ingen modulruntime-loading av Lists/Paths/Groups/AHAavisa på Home

### Må fortsatt være sperret i videre arbeid

- auto-, scheduled- eller background sync
- sync trigget av page load, render, storage-event eller auth-ready
- direkte repository-/databasewrite fra dashboardkode; writes skal bare gå gjennom eksplisitt adapter/service boundary
- source events eller insights som utilsiktet sideeffekt av status/preview
- ekstern AHAavisa-publisering
- ekte Groups/social sharing
- sletting av localStorage ved remote-feil
- modulruntime-loading uten egen kontrakt og PR
- retry execution uten egen kontrakt
- påstand om rollback når rollback ikke finnes

Audit-logg er et eksplisitt unntak fra en absolutt «ingen source events»-formulering i execution-løypa: manual-sync-adapteren bruker source-event-lageret som sanitert audit-logg. Status-, preview- og `AHASyncHub`-løypene skal fortsatt ikke lage source events.

## 7. Relevante tester

| Test | Dekker |
|---|---|
| `tests/aha-sync-hub-runtime-adapter.test.cjs` | `window.AHASyncHub`, exports, fire keys, tombstones, `read_only`, `autoSync: false`, ingen `syncFromDatabase`, ingen `AHARepository`, kun localStorage-read. |
| `tests/aha-home-compact-status-cards.test.cjs` | Gjeldende read-only Home-kort, adapterbruk, fire keys/tabeller, manglende modulruntimes og ingen knapp/repository/storage-write i aktiv renderer. |
| `tests/aha-home-accessibility-polish.test.cjs` | Label på read-only mount samt at den bevarte confirmation modal- og history/details-markupen har nødvendige accessibility-attributter. |
| `tests/aha-home-copy-normalization.test.cjs` | Normalisert Sync Hub-copy og labels. |
| `tests/aha-manual-sync-activation-blockers.test.cjs` | Ingen direkte dashboard repository-write, ingen modulruntime-loading, target/confirmation gates, adapter readiness og dry-run/no-write. |
| `tests/aha-manual-sync-database-target.test.cjs` | Eksisterende database target, repository writes, audit, blocked/failure-forløp og no auto-trigger. |
| `tests/aha-manual-sync-end-to-end-verification.test.cjs` | Success, blocked, invalid, excluded modules, write failure, audit failure/partial success og sikkerhetsgarantier med test doubles. |
| `tests/aha-manual-sync-run-summary-preview.test.cjs` | Run summary er preview, viser blockers/readiness og låser execution/write-gates. |
| `tests/aha-manual-sync-state-machine.test.cjs` | States/transitions, explicit confirmation, ingen localStorage-persistens og ingen direkte network-kall. |
| `tests/aha-manual-sync-retry-eligibility-preview.test.cjs` | Sanitert, read-only retry eligibility og history boundary. |
| `tests/aha-manual-sync-retry-preview-static.test.cjs` | Ingen retry action, execute, audit-write, localStorage-write eller auto-sync fra retry-preview. |
| `tests/aha-sync-tombstone-regressions.test.cjs` | Tombstone-regresjoner i sync-relaterte moduler. |

Teststatus for denne audit-PR-en: `npm test` passerte 49 av 49 testfiler. Dette inkluderer alle Sync Hub-/manual-sync-testene i tabellen. `git diff --check` og relevante `node --check` kjøres også før commit.

## 8. Not yet active / ikke ferdig som trygg operatørflyt

Selv om execution-adapteren er write-capable, er en komplett og robust manuell Sync Hub-operatørflyt ikke aktiv på Home nå. Før den eventuelt kobles inn igjen eller omtales som ferdig aktivert, må en egen go/no-go-vurdering bekrefte:

- target strategy: `database_existing` er implementert, men må eksplisitt godkjennes som ønsket produktstrategi
- modulruntime-loading: avklare om fortsatt repository-basert write er riktig, eller om Lists/Paths/Groups/AHAavisa-runtime skal inngå; ingen runtime-loading skal snikes inn
- trygg tilgjengelighet for Lists, Paths, Groups og AHAavisa uten skjulte sideeffekter
- at dry-run/preview viser nøyaktig hva som vil skje og matcher execution payload
- at brukeren må åpne flyten og eksplisitt trykke `Confirm sync`
- at resultater vises per modul og per relevant item
- at feil i én modul ikke stopper hele huben; dette er ikke oppfylt av dagens fail-fast `writeRunPayload()`
- at tester låser ingen auto-sync, ingen page-load/render/storage/auth-trigger og ingen skjulte payload-writes
- at audit-write på blocked attempts er en bevisst, dokumentert beslutning
- at compact/advanced diagnostics enten gjenkobles i en egen runtime-PR eller at utdaterte UI-forventninger fjernes i en egen, eksplisitt beslutning
- at reell staging-verifikasjon dokumenteres før bred operatørbruk

Ingen av disse punktene skal løses i denne dokumentasjons-PR-en.

## 9. Neste anbefalte PR

Både `js/ahaManualSyncAdapter.js` og `js/ahaManualSyncStateMachine.js` finnes, og de er kommet lenger enn disabled/preview: de er write-capable runtime-komponenter. Samtidig er Home-entry pointet nå read-only og flere tidligere diagnostics-/execution-elementer er frakoblet.

Neste anbefalte PR er derfor fortsatt den konservative dokumentasjonsbeslutningen:

```text
docs: define Sync Hub manual sync go/no-go matrix
```

Go/no-go-matrisen bør avgjøre om den eksisterende write-capable adapteren skal forbli programmatisk gated, deaktiveres eksplisitt, eller senere kobles tilbake til en operatørflate. Den bør også eie beslutningene om fail-fast versus per-modul isolasjon, audit-write ved blocked attempts, target-strategi, staging evidence og compact diagnostics-driften.

Neste PR skal **ikke** aktivere ekte sync fra Home, auto-sync eller nye databasewrites.
