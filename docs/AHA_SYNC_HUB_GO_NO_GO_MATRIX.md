# AHA Sync Hub – go/no-go-matrise for ekte manuell sync

Statusdato: 2026-06-12
Beslutningsstatus: **NO-GO for aktivering av ekte manuell sync**

Dette dokumentet er beslutningsgrunnlaget for om AHA Sync Hub kan få en brukeraktivert write-path. Det beskriver gjeldende repository-status; det aktiverer ikke sync, endrer ikke runtime og gir ikke eksisterende preview-/adapterkode ny tillatelse til å skrive.

Activation evidence for gates A–J er samlet i `AHA_SYNC_HUB_ACTIVATION_EVIDENCE.md`, den konsoliderte checklist reviewen finnes i `AHA_SYNC_HUB_ACTIVATION_CHECKLIST_REVIEW.md`, og module loading strategy er dokumentert i `AHA_SYNC_HUB_MODULE_LOADING_STRATEGY.md`. Preview evidence og strategy docs er ikke det samme som execution GO. Reviewene opprettholder NO-GO for manual execution og permanent forbud mot auto-sync.

## 1. Beslutning nå

| Kapabilitet | Status nå | Beslutning |
|---|---|---|
| Read-only Home-status via `AHASyncHub.inspectAll()` | Aktiv og testet | **GO** |
| Compact diagnostics | Implementert som hjelpefunksjoner og testet, men ikke koblet til aktiv Home-renderer | **GO som read-only kode; ikke en aktiv UI-flate** |
| Preview, payload-oppsummering, checklist, target dry-run og per-module result preview | Eget no-write target-adapterlag og read-only previewflater er implementert og testet i aktiv Home-renderer | **GO som preview-only; ikke execution GO** |
| Blocker-evaluering og state machine | Implementert og testet for sentrale blockers | **GO som guard/preview; ikke aktiveringsgodkjenning** |
| Manual-sync-adapter | Gated, men programmatisk write-capable via `AHARepository.save*` og audit writer | **NO-GO som brukeraktivert execution** |
| Ekte manual sync fra aktiv Home UI | Ikke eksponert av aktiv renderer | **NO-GO** |
| Sync-knapp i aktiv Home UI | Ikke eksponert av aktiv renderer | **NO-GO** |
| Auto-sync | Skal ikke finnes eller innføres | **Permanent NO-GO** |

**Samlet beslutning:** Read-only status og testet preview-/blocker-logikk kan beholdes. Ekte manual sync, write-path fra UI og enhver automatisk trigger er ikke godkjent.

## 2. Tillatt nå

Følgende er innenfor nåværende godkjente scope, så lenge de forblir uten execution-sideeffekter:

- read-only status og telling av aktive lokale records
- compact diagnostics som read-only hjelpefunksjoner
- payload-/target-preview
- dry-run med `wouldExecute: false` og `wouldWrite: false`
- operator-checklist og blocker-visning
- blocker-, adapter-, state-machine- og preview-tester
- disabled/gated adapter- og state-machine-status
- read-only history/details-visning av allerede eksisterende audit-data
- eksplisitt beskjed om at ingen sync kjøres

At kode finnes for confirmation, execution eller audit betyr ikke at den er godkjent for aktivering. Dagens aktive Home-renderer viser bare read-only `AHASyncHub`-status.

## 3. Ikke tillatt ennå

Følgende er NO-GO inntil en egen activation-PR oppfyller alle gates i denne matrisen:

- ekte `syncFromDatabase()`-kall fra Sync Hub/Home UI
- `AHARepository` write/load-kjøring startet fra en Sync Hub-knapp
- database-/Supabase-write startet av Sync Hub UI
- aktivering av den eksisterende write-capable execution-adapteren for sluttbrukere
- sync ved page load
- sync fra `renderDashboard()` eller annen render-funksjon
- sync ved `storage`-event
- sync ved auth-ready/session-ready/profile-ready
- sync ved åpning av Sync Hub, modal eller preview
- sync ved target-valg eller annen `change`-hendelse
- sync uten et nytt, eksplisitt brukerklikk for akkurat den kjøringen
- auto-sync; dette er **permanent NO-GO**, også etter en eventuell manual-sync-aktivering

## 4. Go/no-go-tabell

Statusverdiene betyr:

- **GO:** kravet er dokumentert og bevist tilstrekkelig for dagens read-only/preview-scope.
- **PARTIAL:** deler finnes, men kravet er ikke komplett nok for activation.
- **NO-GO:** kravet mangler, har uavklart risiko eller er ikke bevist for ekte execution.
- **PERMANENT NO-GO:** atferden skal aldri aktiveres som del av Sync Hub.

| Gate | Required before activation | Current status | Evidence/source file | Go/No-go | Notes |
|---|---|---|---|---|---|
| **A. Runtime target gate** | Hver kandidat må ha eksplisitt modulnavn, localStorage-key, repository-tabell og sync-funksjon. Execution-target og write-metode per modul må være entydige og konsistente. | `AHASyncHub.modules` kartlegger Lists, Paths, Groups og AHAavisa til globals, keys, tabeller og `syncFromDatabase`. Execution-adapteren har separat mapping til `saveList`, `savePath`, `saveGroup`, `saveArticle`. Dry-run bruker samme fire datasett, men AHAavisa-id er `avisa` i read-only-registry og `ahaavisa` i manual-sync-laget. | `js/ahaSyncHub.js`; `js/ahaManualSyncAdapter.js`; `js/ahaDashboard.js`; `docs/AHA_MANUAL_SYNC_TARGET_CONTRACT.md`; `tests/aha-sync-hub-runtime-adapter.test.cjs`; `tests/aha-manual-sync-database-target.test.cjs` | **PARTIAL / NO-GO** | Faktiske kandidater og write-metoder finnes, men én kanonisk registry/kontrakt må låse id-er og target-semantikk før activation. UI skal ikke kalle modulenes `syncFromDatabase()` direkte. |
| **B. Module loading gate** | Home skal forbli preview-only og må ikke laste modulruntime. Første activation-fase skal bruke en dedikert execution-side, og ingen uavklarte init/bind-sideeffekter fra Lists, Paths, Groups eller AHAavisa er tillatt. | `AHA_SYNC_HUB_MODULE_LOADING_STRATEGY.md` dokumenterer Home-boundaryen, vurderer tre alternativer og anbefaler en dedikert execution-side. Home laster fortsatt ikke `ahaLists.js`, `ahaPaths.js`, `ahaGroups.js` eller `ahaAvisa.js`. Strategien er ikke implementert, og module loading er ikke aktivert. | `docs/AHA_SYNC_HUB_MODULE_LOADING_STRATEGY.md`; `index.html`; `js/ahaSyncHub.js`; `tests/aha-manual-sync-activation-blockers.test.cjs`; `tests/aha-manual-sync-end-to-end-verification.test.cjs` | **NO-GO** | Dokumentert strategi betyr ikke execution GO. Boundaryen må låses i tester, execution-siden må planlegges og sideeffekter må auditeres i senere dedikerte PR-er før activation kan vurderes. |
| **C. Manual trigger gate** | Ekte sync kan bare starte etter eksplisitt brukerklikk og engangsbekreftelse. Knappen må være disabled under kjøring. Ingen render-, load-, storage-, auth- eller target-change-trigger. | Den bevarte confirmation-handleren delegerer bare fra et eksplisitt klikk og statiske tester avviser flere skjulte triggere. Aktiv Home-renderer renderer imidlertid ikke flyten. Det er ikke dokumentert/testet at en fremtidig aktiv knapp låses mot dobbeltklikk under hele async-kjøringen, og execution-API-et kan kalles programmatisk. | `js/ahaDashboard.js`; `js/ahaManualSyncStateMachine.js`; `tests/aha-manual-sync-database-target.test.cjs`; `tests/aha-manual-sync-end-to-end-verification.test.cjs`; `tests/aha-manual-sync-state-machine.test.cjs` | **PARTIAL / NO-GO** | Explicit click-regelen finnes, men aktiv UI-lås, re-entry-beskyttelse og alle forbudte event paths må bevises samlet før activation. Auto-sync er permanent forbudt. |
| **D. Dry-run/preview gate** | Før kjøring skal brukeren se target, inkluderte moduler, record-antall, blockers og forventet handling. Preview skal aldri skrive data. | `AHAManualSyncDryRunTargetAdapter` beskriver Lists, Paths, Groups og AHAavisa, teller aktive records/tombstones, inspiserer runtime uten å kalle sync-funksjonen og returnerer en blokkert plan med `executionAllowed: false`, `autoSync: false` og `wouldWrite: false`. Eksisterende payload preview, checklist og run-summary finnes også. Flyten er ikke aktivt rendret på Home nå. | `js/ahaManualSyncDryRunTargetAdapter.js`; `js/ahaDashboard.js`; `js/ahaManualSyncAdapter.js`; `tests/aha-manual-sync-dry-run-target-adapter.test.cjs`; `tests/aha-sync-hub-go-no-go-blockers.test.cjs`; `tests/aha-manual-sync-run-summary-preview.test.cjs` | **GO for preview-only; NO-GO for activation** | Gate D har sterkere no-write/target evidence. Execution er fortsatt NO-GO så lenge andre gates ikke er GO, og en egen activation-PR er fortsatt obligatorisk. |
| **E. Blocker gate** | `blocked` må gjøre execution umulig. Tester må dekke readiness, validation, checklist, target, confirmation og state transitions. | Adapter/state machine validerer sentrale blockers. Testene dekker blant annet readiness, checklist, target, validation og manglende confirmation. Et blokkert eksplisitt execution-forsøk kan fortsatt skrive en audit-entry, men ikke moduldata. | `js/ahaManualSyncAdapter.js`; `js/ahaManualSyncStateMachine.js`; `tests/aha-manual-sync-activation-blockers.test.cjs`; `tests/aha-manual-sync-state-machine.test.cjs`; `tests/aha-manual-sync-end-to-end-verification.test.cjs` | **GO som blocker-baseline; NO-GO for activation** | Matrisen må låses i tester slik at nye event paths, registry-avvik og audit-sideeffekter ikke omgår blockers. |
| **F. Per-module error gate** | Feil i én modul skal gi strukturert resultat per modul uten å stoppe rapportering for resten. LocalStorage skal aldri slettes ved remote-feil. Partial failure/rollback må være eksplisitt definert. | Modulenes egne repository-sync-tester beskytter localStorage ved remote/load-feil. Manual-sync execution bruker repository writes og har `rollbackStatus: not_available`; en kastet write-feil går til run-level `failed`, uten dokumentert, ferdig per-modul continuation/rollback-kontrakt. | `js/ahaManualSyncAdapter.js`; `js/ahaLists.js`; `js/ahaPaths.js`; `js/ahaGroups.js`; `js/ahaAvisa.js`; relevante `tests/aha-*-repository-persistence.test.cjs`; `tests/aha-manual-sync-end-to-end-verification.test.cjs` | **NO-GO** | Før activation må resultatmodell, fortsett/stopp-policy, retry og rollback/kompensasjon være testet per modul. |
| **G. No-write safety gate** | Tester må bevise at preview/inspection ikke gjør hidden writes og ikke skaper source events, insights, ekstern AHAavisa-publisering eller Groups social sharing. | Read-only-adapter og preview har statiske/dynamiske no-write-sjekker. Dashboardet skriver ikke direkte, og Home laster ikke modulruntime. Execution-adapteren er derimot med hensikt write-capable og skriver audit til source events ved execution-forsøk; full forbidden-call-matrise er ikke samlet som en activation-lås. | `js/ahaSyncHub.js`; `js/ahaManualSyncAdapter.js`; `js/ahaDashboard.js`; `tests/aha-sync-hub-runtime-adapter.test.cjs`; `tests/aha-manual-sync-activation-blockers.test.cjs`; `tests/aha-manual-sync-end-to-end-verification.test.cjs` | **GO for read-only/preview; NO-GO for activation** | Activation-testene må eksplisitt låse alle fem forbudte sideeffektklassene, ikke bare direkte dashboard-writes. |
| **H. Audit/history gate** | Audit/history skal opprettes etter et eksplisitt execution-forsøk, ikke av ren preview. Den skal skille blocked/failed/success, minimere payload og aldri lagre hemmeligheter. | Repository har kompakt manual-sync-audit via source events; history sanitizer og tester dekker metadata og hemmelighetsfiltrering. Dry-run skriver ikke audit. Et eksplisitt, men blokkert `executeAhaManualSyncRun()` skriver en `blocked` audit-entry. | `js/ahaRepository.js`; `js/ahaManualSyncAdapter.js`; `js/ahaManualSyncHistory.js`; `tests/aha-manual-sync-database-target.test.cjs`; `tests/aha-manual-sync-end-to-end-verification.test.cjs` | **PARTIAL / NO-GO** | Før activation må policyen eksplisitt godkjenne når blocked attempts auditeres, og bevise at preview aldri fremstilles som kjørt sync. Audit-feil gir i dag `partial_success` etter vellykket domain-write og må inngå i aktiveringsbeslutningen. |
| **I. Supabase/session gate** | Supabase skal være optional. Manglende client, session, profile eller table skal gi fallback/blocked status uten krasj. Local mode skal fortsatt fungere. | Repository-laget har lokal/fallback-orientert arkitektur, og Home read-only-inspeksjon trenger ikke session. Manual-sync target-validering sjekker repository write-metoder, men go/no-go-suiten dokumenterer ikke en komplett matrise for manglende session/profile/table under ekte execution. | `js/ahaRepository.js`; `js/ahaManualSyncAdapter.js`; `js/ahaSyncHub.js`; repository-/auth-tester | **PARTIAL / NO-GO** | Activation krever eksplisitte tests for no client, signed-out, missing profile, missing table og remote failure, med bevart local mode. |
| **J. Test gate** | Adapter-, compact dashboard-, blocker-, state-machine-, preview/dry-run- og forbidden-call/no-write-tester må passere sammen. Testene må samsvare med aktiv renderer og besluttet arkitektur. | Relevante tester finnes, og module loading strategy er dokumentert. Home loading boundary er ennå ikke låst av en dedikert strategy-test, og flere activation-krav over er ikke samlet i én matrise-lås. | `tests/aha-sync-hub-runtime-adapter.test.cjs`; `tests/aha-home-compact-status-cards.test.cjs`; `tests/aha-manual-sync-activation-blockers.test.cjs`; `tests/aha-manual-sync-state-machine.test.cjs`; `tests/aha-manual-sync-database-target.test.cjs`; `tests/aha-manual-sync-run-summary-preview.test.cjs`; `tests/aha-manual-sync-end-to-end-verification.test.cjs` | **NO-GO** | Hele relevante suiten må være grønn, og manglende gate-caser må legges til før activation. En testet kodevei som ikke er aktivt rendret er ikke alene aktiveringsbevis. |

## 5. Trigger-policy: permanent sperret automatikk

Manual sync betyr én brukerinitiert kjøring. Følgende skal forbli sperret både før og etter en eventuell activation:

| Trigger | Beslutning |
|---|---|
| Nytt eksplisitt klikk + bekreftelse for én run | Kan vurderes når alle gates er GO |
| Page load / initialisering | **Permanent NO-GO** |
| `renderDashboard()` / rerender | **Permanent NO-GO** |
| `storage`-event | **Permanent NO-GO** |
| auth-ready/session-ready/profile-ready | **Permanent NO-GO** |
| åpning av Sync Hub/modal/preview | **Permanent NO-GO** |
| target selection/change | **Permanent NO-GO** |
| timer, polling, background job eller annen auto-sync | **Permanent NO-GO** |

## 6. Activation rule

> **Manual sync kan bare aktiveres i en egen fremtidig activation-PR etter at alle GO-gates er grønne og dokumentert. Activation-PR-en må være eksplisitt navngitt og må ikke kombineres med andre UX/refactor/data-shape-endringer.**

En eventuell activation-PR skal hete:

```text
feat: activate manual AHA Sync Hub execution
```

Dette navnet er en fremtidig review-grense, ikke en planlagt aktivering nå. PR-en skal **ikke** opprettes før alle gates A–J er GO. Den skal ikke samtidig endre payload-shape, target-registry, modulinit, audit-kontrakt, rollback-policy, visuell redesign eller generell refaktorering. Auto-sync inngår aldri i activation.

## 7. Neste anbefalte PR

Module loading strategy er nå dokumentert, men den er ikke implementert og gir ikke execution GO. Neste steg er å låse den eksisterende Home-boundaryen uten å laste modulruntime eller aktivere sync:

```text
test: lock Sync Hub module loading boundary
```

Den PR-en skal være test-only og bevise at Home fortsatt ikke laster Lists-/Paths-/Groups-/AHAavisa-runtime via page load, render eller andre forbudte paths. Den skal ikke bygge execution-siden, aktivere execution eller skrive data. Activation-PR-navnet forblir `feat: activate manual AHA Sync Hub execution`, og den PR-en er fortsatt ikke tillatt før alle gates A–J er GO. Ekte manual sync forblir NO-GO, og auto-sync forblir permanent forbudt.
