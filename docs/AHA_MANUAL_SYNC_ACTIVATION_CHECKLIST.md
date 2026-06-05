# AHA Manual Sync Execution Activation Checklist

Statusdato: 2026-06-05

Dette dokumentet er en dokumentasjonslås for fremtidig aktivering av AHA Sync Hub manual sync execution. Det er ikke runtime-kode, ikke target-konfigurasjon, ikke audit log-skriving og ikke en beslutning om å aktivere Manual sync eller Confirm sync.

## 1. Formål

Activation checklist er den siste dokumenterte sperren før faktisk manuell sync kan implementeres. Den definerer nøyaktig hva som må være sant før en fremtidig PR noensinne kan:

```text
- aktivere Manual sync
- aktivere Confirm sync
- skrive audit log
- sende payload
- skrive til target
- kalle adapter executeRun
- gjøre database/API/repository-kall
```

Sjekklisten dekker:

```text
- hvilke preflight-lag som må være implementert og validert
- hvilke statusverdier som må være green/ready
- hvilke kontrakter som må være oppfylt
- hvilke runtime-komponenter som fortsatt må være disabled inntil activation-PR
- hvilke handlinger som fortsatt er forbudt uten egen PR
```

Denne sjekklisten aktiverer ikke sync. Den er bare en dokumentert go/no-go-port for senere activation-, target-adapter-, audit log- og write-PR-er.

## 2. Required implemented layers

Før activation kan vurderes, må disse lagene finnes, være koblet inn som preflight/statuslag og være validert uten write:

```text
- read-only status hub
- manual action shell
- dry-run planner
- validation layer
- readiness gate
- payload preview
- operator checklist
- disabled/gated Manual sync button
- manual sync execution contract
- confirmation modal
- audit log preview
- target selector preview
- manual sync target contract
- adapter interface stub
- execution state machine stub
- run summary preview
```

Alle disse lagene må fortsatt kunne vise status uten å skrive data, sende payload, koble til target, skrive audit log, gjøre repository/database/API-kall eller lagre sync execution state i localStorage.

## 3. Required docs/contracts

Følgende dokumenterte kontrakter må være på plass før activation kan vurderes:

```text
- manual sync execution contract
- manual sync target contract
- payload contract
- write boundary
- audit log requirements
- rollback / partial failure rules
- security / secrets rules
```

Kontraktene må beskrive både hva som er tillatt og hva som blokkerer activation. Dersom en kontrakt mangler, er uklar eller fortsatt er future-only, skal activation blokkeres.

## 4. Activation checklist

Alle punktene under må være oppfylt før Manual sync eller Confirm sync kan aktiveres i en senere egen activation-PR.

### A. Data readiness

```text
[ ] readiness status must be ready
[ ] validation errors must be 0
[ ] warnings must be visible and manually acknowledged
[ ] payload preview must include at least one module
[ ] payload preview must exclude modules with errors
[ ] duplicate ids must be blocked
[ ] missing ids must be blocked
```

### B. Target readiness

```text
[ ] selected target must not be not_configured
[ ] selected target must not be preview_only/future_only
[ ] target adapter must be explicitly implemented
[ ] target adapter must be tested
[ ] target adapter must not live in dashboard code
[ ] credentials/secrets must not be stored in dashboard code
[ ] target write behavior must be documented
```

### C. Adapter readiness

```text
[ ] adapter status must be enabled only in activation PR
[ ] canExecute must remain false until activation PR
[ ] canWrite must remain false until activation PR
[ ] executeRun must not be callable from UI before activation
[ ] executeRun must return structured result
[ ] executeRun must never silently fail
```

### D. State machine readiness

```text
[ ] transition to confirmed must require explicit user confirmation
[ ] transition to running must require confirmed state
[ ] transition to success must require successful target result
[ ] transition to partial_success must only be allowed if partial failure contract exists
[ ] rollback behavior must be defined before rolled_back is reachable
```

### E. Audit readiness

```text
[ ] audit log writing must be implemented before sync write
[ ] audit log must include run id, timestamp, target, modules, counts, validation/readiness summary, result status and errors
[ ] audit log must not store secrets
[ ] audit log must not dump full payload unless explicitly approved
[ ] failed writes must be audit-logged
```

### F. UI readiness

```text
[ ] Manual sync can only be enabled when all gates pass
[ ] Confirm sync can only be enabled inside confirmation modal after explicit review
[ ] user must see payload summary before confirmation
[ ] user must see target summary before confirmation
[ ] user must see warnings/errors before confirmation
[ ] confirmation must apply to one run only
[ ] no confirmation state may be stored permanently
```

### G. Safety / no auto behavior

```text
[ ] no sync on page load
[ ] no sync when opening Sync Hub
[ ] no sync when selecting target preview
[ ] no sync when opening confirmation modal
[ ] no auto-sync
[ ] no hidden save/load
[ ] no direct dashboard writes
```

## 5. Activation blockers

Activation skal blokkeres hvis ett eller flere av disse punktene er sanne:

```text
- readiness is blocked
- validation errors exist
- payload has zero included modules
- target is not_configured
- target is preview_only/future_only
- adapter canExecute is false
- adapter canWrite is false
- state machine blocks confirmed/running
- audit log writing is not implemented
- rollback/partial failure is undefined
- secrets/config are unclear
- user confirmation flow is incomplete
- tests/static checks fail
```

Hvis en blocker oppstår under execution i en fremtidig write-enabled PR, skal run ikke fortsette som success. Den må enten stoppes før write, markeres failed på en auditert måte, eller følge en eksplisitt partial failure-/rollback-kontrakt.

## 6. Required tests before activation

En fremtidig activation-PR må minst ha tester eller statiske checks som beviser:

```text
- Manual sync remains disabled before activation
- Confirm sync remains disabled before activation
- no fetch/supabase/firebase in dashboard
- no AHARepository save/load in dashboard
- no localStorage.setItem for sync execution state
- no imports of js/ahaLists.js
- no imports of js/ahaPaths.js
- no imports of js/ahaGroups.js
- no imports of js/ahaAvisa.js
- adapter executeRun returns structured result
- blocked state cannot transition to running
- missing target blocks activation
- validation errors block activation
- audit log failure blocks write or marks run failed
- partial_success is unreachable unless partial failure contract exists
```

Disse testene skal kjøres før activation kan merges. Dersom en check ikke kan automatiseres, må activation-PR-en dokumentere hvorfor og legge inn en tydelig manuell review-gate.

## 7. Future activation PR rules

En fremtidig activation-PR må være egen, liten og eksplisitt. Den skal kun koble sammen allerede dokumenterte, implementerte og testede deler når alle krav i denne sjekklisten er oppfylt.

Activation-PR-en må ikke samtidig:

```text
- lage ny target adapter
- endre payload contract
- endre validation rules
- endre rollback strategy
- innføre auto-sync
- flytte write inn i dashboard
- skjule database/repository/API-kall
```

Target-adapter, audit log-skriving, rollback-/partial failure-implementasjon og activation må holdes som små, reviewbare steg der write boundary er synlig.

## 8. Ikke gjør dette i denne dokumentasjons-PR-en

Denne dokumentasjons-PR-en må ikke:

```text
- endre index.html
- endre js/ahaDashboard.js
- endre js/ahaManualSyncAdapter.js
- endre js/ahaManualSyncStateMachine.js
- endre css
- aktivere Manual sync
- aktivere Confirm sync
- koble til target
- legge til target adapter
- legge til repository save/load
- legge til database/API/fetch/supabase/firebase
- skrive til localStorage
- skrive audit log
- sende payload
- endre runtime-atferd
```

## 9. Activation boundary

Inntil en egen activation-PR er merget, skal runtime fortsatt være disabled/gated:

```text
- Manual sync remains disabled/gated
- Confirm sync remains disabled/gated
- adapter canExecute remains false
- adapter canWrite remains false
- executeRun remains unavailable for UI-triggered writes
- target selector remains preview-only unless a separate target-adapter PR explicitly changes it
- run summary remains preview-only
- audit log preview remains preview-only
```

Faktisk sync, faktisk audit log-skriving, target write, repository/database/API-kall og payload-send kommer fortsatt senere og bare etter at activation blocker tests er implementert og bestått.

## 10. Neste anbefalte PR

Neste anbefalte PR etter denne dokumentasjonslåsen er:

```text
feat: add AHA manual sync activation blocker tests
```

Målet med den PR-en er å bevise at activation fortsatt er blokkert inntil alle gates, kontrakter, target-regler, adapter-regler, state machine-regler, audit-regler og safety-regler i dette dokumentet er oppfylt.
