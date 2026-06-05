# AHA Manual Sync Target Contract

Statusdato: 2026-06-05

Dette dokumentet definerer target-kontrakten for fremtidig AHA Sync Hub manual sync før noen target får skrive-makt. Det er en dokumentasjonskontrakt, ikke runtime-kode, ikke en adapter-implementasjon, ikke en database-/repository-integrasjon og ikke en beslutning om å aktivere faktisk sync.

## 1. Formål

Manual sync target contract skal låse hva et fremtidig manual sync target er, hvordan det kan vurderes, og hvilke gates som må være oppfylt før en target kan aktiveres i en egen senere PR.

Kontrakten dekker:

```text
- hva et sync target er
- hvilke target-typer som kan vurderes senere
- hva som kreves før target kan aktiveres
- write boundary
- repository/API/database-regler
- atomicitet / rollback
- audit log-krav per target
- hva som aldri skal skje automatisk
```

Et sync target er den eksplisitt valgte, dokumenterte og testede write-destinasjonen en fremtidig manuell sync-run kan sende validert payload til. Target er ikke UI-valget alene; det er en faktisk adapter med definert payload-kontrakt, auth/config, write-regler, result-status, audit log-strategi og rollback-/partial failure-atferd.

Denne PR-en konfigurerer ingen target. Target selector preview er fortsatt preview-only og aktiverer ikke sync.

## 2. Future-only targets i scope

Følgende target-id-er kan vises eller dokumenteres som mulige fremtidige targets, men bare `not_configured` er nåværende trygg default:

| Target id | Status nå | Betydning |
|---|---|---|
| `not_configured` | Default / safe | Ingen write target er valgt eller tilgjengelig. |
| `aha_repository_future` | Future-only / preview-only | Mulig fremtidig adapter mot eksplisitte `AHARepository` save/load-metoder. |
| `database_api_future` | Future-only / preview-only | Mulig fremtidig adapter mot dokumenterte API-/database-endepunkter. |
| `custom_sync_backend_future` | Future-only / preview-only | Mulig fremtidig adapter mot egen sync-backend med dokumentert kontrakt. |

Regler:

```text
- not_configured er default og trygg tilstand.
- future targets er kun preview inntil egen PR implementerer adapter.
- ingen target er aktiv nå.
- target selector preview aktiverer ikke sync.
- Manual sync / Confirm sync skal fortsatt være disabled/gated.
```

## 3. Target activation rules

En target kan bare aktiveres i en egen fremtidig PR hvis alle disse kravene er oppfylt:

```text
- manual sync execution contract er oppfylt
- readiness er ready
- validation errors er 0
- payload preview har minst én inkludert modul
- operator checklist har 0 blocked items
- audit log-strategi er implementert
- target adapter er eksplisitt valgt og dokumentert
- write behavior er testet
- rollback/partial failure behavior er definert
- brukeren må bekrefte én sync-run manuelt
```

Target-aktivering må være eksplisitt i kode, dokumentasjon og tester. En UI-preview, target-label eller valgt dropdown-verdi er ikke en aktivert target.

## 4. Blocking rules

Target activation og faktisk write skal blokkeres hvis ett eller flere av disse punktene er sant:

```text
- target er not_configured
- target er future_only / preview_only
- target adapter mangler
- database/API/repository credentials mangler eller er uavklart
- write target ikke har audit log-støtte
- rollback eller partial failure behavior er uavklart
- payload contract ikke matcher target contract
- validation errors finnes
- readiness er blocked
- operator checklist har blocked items
- bruker ikke har bekreftet manuelt
```

Blocking state skal ikke kunne overstyres av target selector preview, page load, panelåpning, localStorage-state eller tidligere brukerhandling. Hvis en senere PR innfører en override-mekanisme, må den ha egen UI, egen audit log, egen risikovurdering og eksplisitt avgrensning.

## 5. Write boundary

Target adapter er eneste sted fremtidig write kan skje. Dashboard/UI skal ikke skrive direkte til database, repository eller API.

Write boundary-regler:

```text
- target adapter er eneste sted fremtidig write kan skje
- dashboard/UI skal ikke skrive direkte til database/repository/API
- payload skal komme fra validert payload preview / execution contract
- ingen write ved page load
- ingen write ved åpning av kontrollpanel
- ingen write ved target preview-valg
- ingen auto-sync
- ingen skjult save/load
```

UI kan vise status, payload summary, target preview, warnings, errors, readiness, checklist og confirmation copy. UI skal ikke gjøre save/load, fetch, Supabase/Firebase/database-klientkall eller repository-kall som sideeffekt av rendering, åpning av kontrollpanel eller preview-valg.

## 6. Target-specific contracts

### 6.1 `not_configured`

`not_configured` er default target og den eneste trygge nåværende tilstanden.

Kontrakt:

```text
- default target
- alltid safe
- ingen write mulig
- Manual sync / Confirm sync skal forbli disabled
- audit preview kan vise target: not_configured
```

`not_configured` skal aldri mappes til repository, database, API eller backend. Det betyr eksplisitt at ingen write-destinasjon er valgt.

### 6.2 `aha_repository_future`

`aha_repository_future` kan bare aktiveres hvis en `AHARepository` target-adapter lages i en egen PR.

Kontrakt:

```text
- kan bare aktiveres hvis AHARepository target-adapter er laget i egen PR
- save/load-metoder må være eksplisitt identifisert
- ingen direkte save/load fra dashboard
- audit log må registrere repository target
- rollback/partial failure må defineres før aktivering
```

En fremtidig PR må navngi nøyaktige repository-metoder per modul, forklare om adapteren skriver én modul av gangen eller hele runen samlet, og teste write behavior. Dashboardet kan ikke kalle `AHARepository.save*` eller `AHARepository.load*` direkte.

### 6.3 `database_api_future`

`database_api_future` kan bare aktiveres hvis en API-/database-adapter lages i en egen PR.

Kontrakt:

```text
- kan bare aktiveres hvis API/database-adapter er laget i egen PR
- ingen fetch/supabase/firebase/database-klient i dashboard
- credentials/config må være eksplisitt dokumentert
- API-endepunkter må dokumenteres
- atomicitet eller partial failure-strategi må være definert
- audit log må registrere endpoint/target uten sensitive secrets
```

En fremtidig PR må dokumentere endpoint, metode, auth/session-krav, tabell/ressurs, request/response-shape, feilkoder og hvordan sensitive config håndteres. Audit log kan registrere target-id, endpoint-navn eller ressursnavn, men ikke tokens, nøkler, connection strings eller andre secrets.

### 6.4 `custom_sync_backend_future`

`custom_sync_backend_future` kan bare aktiveres hvis en egen backend-adapter PR definerer og tester kontrakten.

Kontrakt:

```text
- kan bare aktiveres med egen backend-adapter PR
- kontrakten må beskrive payload, auth, result status og rollback
- ingen ukjent backend kan kobles skjult
- audit log må registrere backend target og result status
```

En custom backend må være navngitt, dokumentert og eksplisitt valgt. Det skal ikke finnes skjulte runtime-switcher, miljøvariabler eller preview-verdier som kobler en ukjent backend uten dokumentert adapter.

## 7. Payload compatibility

Target contract må matche manual sync payload contract. Første payload-scope er disse modulene:

```text
- Lists
- Paths
- Groups
- AHAavisa
```

Forventet module payload-shape:

```js
{ module: "lists", items: [...] }
{ module: "paths", items: [...] }
{ module: "groups", items: [...] }
{ module: "ahaavisa", items: [...] }
```

Target adapter må validere:

```text
- module id
- item count
- id/key/slug
- title/name/label/headline
- allowed fields
- duplicate ids
- unsupported fields hvis relevant
```

Hvis en target krever et annet feltsett, mapping, namespace, versjon eller normalisering, må dette dokumenteres i adapter-PR-en før write aktiveres. Target adapter skal ikke implicit endre module data-shape, forkaste felt eller legge til target-spesifikke felt uten dokumentert payload mapping.

## 8. Audit log per target

Faktisk target-write må audit-logges. Audit log-strategien må implementeres før target activation.

Audit log må minst inneholde:

```text
- timestamp
- run id
- selected target
- target type
- target status
- included modules
- excluded modules
- item counts
- readiness status
- validation summary
- payload summary/checksum hvis mulig
- operator confirmation
- write result
- errors/warnings
- rollback/partial failure status
```

Audit log skal ikke lagre secrets eller unødvendig full payload. Hvis full payload må logges, må en senere PR dokumentere hvorfor, minimere innholdet, maskere sensitive felt og teste at secrets ikke lagres.

Audit log må kunne skille mellom blokkert før write, bekreftet men ikke startet, running, partial success, success, failed og rolled back.

## 9. Failure / rollback

Target adapter må returnere tydelig result status. Ingen feil skal være stille, skjulte eller bare konsollbaserte.

Tillatte result-statuser:

```text
- not_started
- blocked
- confirmed
- running
- partial_success
- success
- failed
- rolled_back
```

Failure-/rollback-regler:

```text
- ingen stille feil
- target adapter må returnere tydelig result status
- partial_success er ikke lov uten eksplisitt partial failure contract
- hvis rollback ikke finnes, må sync enten være atomic eller blokkert
- modul-atomic kan vurderes, men må dokumenteres per target
```

Hvis en target bare kan garantere modul-atomic write, må adapter-PR-en dokumentere hvilke moduler som kan lykkes uavhengig, hvordan partial state rapporteres, hvordan retry fungerer, og hva operatøren må gjøre etter partial failure.

## 10. Security / secrets

Security- og secrets-regler:

```text
- secrets skal ikke ligge i dashboard-kode
- secrets skal ikke vises i UI
- audit log skal ikke logge secrets
- target selector preview skal ikke inneholde ekte credentials
- database/API/repository-config må håndteres i egen PR
```

Credentials, API tokens, Supabase/Firebase config, database connection strings og repository-auth skal ikke hardkodes i Sync Hub UI. En fremtidig adapter-PR må dokumentere hvor config kommer fra, hvordan den valideres, hvordan manglende config blokkerer write, og hvordan audit log maskerer sensitive verdier.

## 11. Hva som aldri skal skje automatisk

Manual sync target contract forbyr automatisk eller skjult write:

```text
- ingen auto-sync
- ingen sync ved page load
- ingen sync ved åpning av kontrollpanel
- ingen sync ved target preview-valg
- ingen write fordi readiness blir ready
- ingen write fordi payload preview kan bygges
- ingen write fordi operator checklist har 0 blocked items
- ingen skjult save/load
- ingen skjult backend-kobling
- ingen skjult localStorage-skriving som del av target activation
```

Brukeren må alltid bekrefte én sync-run manuelt etter å ha sett payload summary, target, readiness, validation summary, warnings/errors og rollback-/partial failure-status.

## 12. Ikke gjør dette i target contract-PR-en

Denne dokumentasjons-PR-en må ikke:

```text
- endre index.html
- endre js/ahaDashboard.js
- endre css
- aktivere Manual sync
- aktivere Confirm sync
- koble til target
- legge til target adapter
- legge til repository save/load
- legge til database/API/fetch/supabase/firebase
- skrive til localStorage
- endre runtime-atferd
```

Neste anbefalte PR etter denne dokumentasjonskontrakten er:

```text
feat: add AHA manual sync adapter interface stub
```

Adapter interface stub skal fortsatt ikke skrive data. Den bør bare definere et trygt grensesnitt, statuser og no-write/no-op behavior før noen target-adapter får faktisk skrivekraft.
