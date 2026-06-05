# AHA manual sync execution contract

Statusdato: 2026-06-05

Dette dokumentet definerer kontrakten for en første fremtidig manuell AHA Sync Hub-sync. Det er en dokumentasjonskontrakt før faktisk implementasjon, ikke runtime-kode, ikke en databasebeslutning og ikke en aktivering av Manual sync-knappen.

Kontrakten finnes for å hindre at en senere PR gir Manual sync-knappen skrivekraft før scope, payload, gates, audit log, failure behavior og rollback-regler er eksplisitt forstått.

## 1. Formål

Manual sync execution contract skal beskrive nøyaktig hva en fremtidig manuell sync kan gjøre, hva den må kontrollere først, hva den skal logge, og hva den aldri skal gjøre automatisk.

Kontrakten dekker:

```text
- hvilke moduler som kan inngå
- forventet payload-format
- hvilke gates som må passeres
- hva som skjer ved warnings
- hva som blokkerer sync
- hva som skrives hvor
- hva som aldri skal skrives
- failure behavior
- rollback- og partial failure-regler
- audit log-krav
- krav til eksplisitt manuell bekreftelse
```

Denne PR-en implementerer ikke sync, repository save/load, databasekall, localStorage-skriving eller runtime-atferd. Den dokumenterer bare kontrakten som senere implementasjoner må følge.

## 2. Moduler i scope for første manuelle sync

Første manuelle sync kan bare gjelde disse modulene:

| Modul | Payload module id | Eksisterende localStorage key | Modulruntime-fil som fortsatt ikke skal lastes direkte av Home for sync |
|---|---|---|---|
| Lists | `lists` | `aha_lists_v1` | `js/ahaLists.js` |
| Paths | `paths` | `aha_paths_v1` | `js/ahaPaths.js` |
| Groups | `groups` | `aha_groups_v1` | `js/ahaGroups.js` |
| AHAavisa | `ahaavisa` | `aha_articles_v1` | `js/ahaAvisa.js` |

AHA Home skal fortsatt ikke laste modulfilene `js/ahaLists.js`, `js/ahaPaths.js`, `js/ahaGroups.js` eller `js/ahaAvisa.js` direkte bare for å gi Sync Hub skrivekraft. Sync Hub skal bruke kontrollert payload-preview og en eksplisitt sync-kontrakt, ikke direkte modul-runtime som ukontrollert write path.

Hvis en senere PR velger å laste modulruntime, lage en egen sync-side eller lage en egen hub-runtime, må den PR-en dokumentere hvorfor og vise at denne kontrakten fortsatt følges.

## 3. Preconditions og gates

Faktisk manuell sync kan bare vurderes i en senere PR hvis alle disse kravene er oppfylt:

```text
- readiness status er ready
- validation errors er 0
- payload preview har minst én inkludert modul
- operator checklist har 0 blocked items
- brukeren har gjort eksplisitt manuell bekreftelse for denne sync-runen
- Manual sync-knappen er aktivert i en egen fremtidig PR
- audit log-strategi er definert før write
- database/repository/backend target er eksplisitt valgt i en egen PR
```

Warnings blokkerer ikke nødvendigvis sync. De må likevel:

```text
- vises tydelig i UI før write
- inngå i payload summary eller validation summary
- bekreftes manuelt av brukeren
- logges i audit log hvis sync faktisk kjøres
```

En warning kan bli blocking hvis senere implementasjon definerer den som en risiko for datatap, ukjent target, ugyldig shape eller uklar rollback.

## 4. Blocking rules

Sync skal blokkeres hvis ett eller flere av disse punktene er sant:

```text
- localStorage ikke kan inspiseres
- dataset har ugyldig struktur
- items mangler id, key eller slug der identifikator kreves
- items mangler egnet title, name, label eller headline der lesbar label kreves
- det finnes dublette id-er, keys eller slugs innen samme modul
- readiness er blocked
- operator checklist har blocked items
- payload preview ikke kan bygges
- ingen moduler er inkludert i payload preview
- database/repository target ikke er eksplisitt konfigurert
- audit log-strategi ikke er definert
- brukeren ikke har bekreftet manuelt for denne sync-runen
- Manual sync-knappen fortsatt er disabled/gated
- write path ville kreve skjult save/load, databasekall eller auto-sync
```

Blocking state skal ikke kunne overstyres av vanlig klikk på Manual sync-knappen. Hvis det senere bygges en særskilt override-mekanisme, må den ha egen PR, egen UI, egen audit log og egen risikovurdering.

## 5. Payload contract

Payload skal bygges fra validert preview-data, ikke direkte fra ukontrollert runtime-state. Preview-laget skal være den kontrollerte kilden for hva operatøren ser og bekrefter før write.

Forventet payload-shape per modul:

```js
{ module: "lists", items: [...] }
{ module: "paths", items: [...] }
{ module: "groups", items: [...] }
{ module: "ahaavisa", items: [...] }
```

En samlet sync-run kan representeres som en liste av modul-payloads:

```js
{
  runId: "...",
  trigger: "manual",
  modules: [
    { module: "lists", items: [...] },
    { module: "paths", items: [...] },
    { module: "groups", items: [...] },
    { module: "ahaavisa", items: [...] }
  ]
}
```

Minimum item-felt skal valideres før write:

```text
- stabil identifikator: id, key eller slug
- lesbar label: title, name, label eller headline
- type/category hvis modulen bruker slike felt
- createdAt/updatedAt hvis modulen bruker slike felt eller konfliktreglene krever dem
- module-specific original fields bare hvis de eksplisitt tillates i en senere PR
```

Payload-kontrakten skal ikke implicit endre modulenes data-shape. Hvis et originalt module-specific felt skal inkluderes, normaliseres, forkastes eller skrives, må dette dokumenteres eksplisitt i en senere PR før write aktiveres.

Payload skal ikke inneholde full sensitive data hvis summary, id-er, counts eller checksum holder for audit/preview. Full payload skal bare logges hvis en egen senere PR dokumenterer at det er nødvendig og trygt.

## 6. Write contract og target-status

Fremtidig sync må definere eksplisitt hvor data skrives før den kan skrive noe. Denne kontrakten antar ikke database ennå.

Mulige fremtidige targets er uavklart:

```text
- AHARepository
- database/API
- annen sync-backend
```

Regler før target kan brukes:

```text
- ingen target kan brukes før den er eksplisitt valgt i en egen PR
- ingen save/load skal innføres skjult
- ingen databasekall skal innføres uten egen PR
- ingen repository save/load skal innføres uten egen PR
- ingen auto-sync
- ingen write ved page load
- ingen write ved åpning av kontrollpanel
- ingen write til localStorage som sideeffekt av denne dokumentasjonskontrakten
```

Hvis senere sync bruker AHARepository, må PR-en navngi repository-metodene. Hvis den bruker database/API, må PR-en navngi endpoint/tabell/operasjon og auth-/sessionkrav. Hvis den bruker en annen backend, må target-kontrakten dokumenteres før write.

## 7. Manual confirmation contract

Før faktisk write i en senere implementasjon må brukeren gjøre eksplisitt manuell bekreftelse:

```text
- brukeren må trykke en aktivert Manual sync-knapp
- brukeren må se payload summary
- brukeren må se warnings/errors-status
- brukeren må bekrefte én ekstra gang før write starter
- bekreftelsen gjelder én sync-run
- bekreftelsen skal ikke lagres permanent
- ingen sync ved page load
- ingen sync ved åpning av kontrollpanel
- ingen sync bare fordi payload preview bygges
- ingen sync bare fordi readiness blir ready
```

Den ekstra bekreftelsen bør vise minst inkluderte moduler, ekskluderte moduler, item counts, warnings, target og rollback/partial failure-status. Hvis errors finnes, skal bekreftelsen ikke kunne starte write.

## 8. Audit log contract

En fremtidig faktisk sync skal lage audit log. Audit log-strategien må defineres før write aktiveres.

Audit log bør minst inneholde:

```text
- timestamp
- run id
- operator/manual trigger
- included modules
- excluded modules
- item counts
- validation summary
- readiness status
- payload hash eller checksum hvis mulig
- target
- result status
- errors/warnings
- rollback/partial failure status
```

Audit log skal ikke lagre sensitive data eller full payload hvis det ikke er nødvendig. Hvis full payload må logges for debugging eller compliance, må dette være eksplisitt valgt, minimert og dokumentert i en egen PR.

Audit log må også kunne skille mellom:

```text
- forsøk som ble blokkert før write
- bekreftede runs som startet write
- runs som feilet før første modul ble skrevet
- partial success
- full success
- failed rollback
- successful rollback
```

## 9. Failure behavior

En fremtidig sync-run skal ha tydelig status. Tillatte run-statuser:

```text
not_started
blocked
confirmed
running
partial_success
success
failed
rolled_back
```

Failure behavior:

```text
- en modulfeil skal ikke skjule andre modulresultater
- ingen stille feil
- feil skal vises i UI
- audit log skal registrere feil
- validation/readiness-feil skal stoppe sync før write
- runtime write-feil skal knyttes til modul, target og run id
- warnings skal vises og logges hvis runen kjøres
- lokal data skal ikke slettes som konsekvens av remote/backend-feil
```

Modulresultater bør rapporteres separat slik at Lists, Paths, Groups og AHAavisa kan vise egne statuser selv når samlet sync-run ender som `partial_success` eller `failed`.

## 10. Rollback og partial failure

Første ekte sync bør helst være atomic for hele runen eller modul-atomic per modul.

Hvis atomic write ikke finnes, må fremtidig implementasjon gjøre ett av disse valgene før write aktiveres:

```text
- blokkere sync til atomic/rollback-strategi finnes
- dokumentere eksplisitt partial failure behavior
- implementere og dokumentere rollback-strategi
```

Ingen fremtidig PR skal innføre uklar partial write. Det skal alltid være klart:

```text
- hvilke moduler som kan være skrevet
- hvilke items som kan være skrevet
- om write kan reverseres
- hva audit log sier om rollback
- hva UI viser etter partial failure
- om brukeren må gjøre manuell oppfølging
```

Hvis rollback feiler, skal status ikke skjules som vanlig `failed`. Den skal rapporteres som rollback-relatert feil med run id, modul, target og kjent partial state.

## 11. Hva denne dokumentasjons-PR-en ikke gjør

Denne PR-en skal ikke:

```text
- endre index.html
- endre js/ahaDashboard.js
- endre CSS
- aktivere sync-knappen
- legge til sync-funksjoner
- legge til databasekall
- legge til repository save/load
- skrive til localStorage
- endre runtime-atferd
```

Denne PR-en er derfor trygg som dokumentasjonssteg mellom komplett pre-sync UI og fremtidig confirmation modal / faktisk write.

## 12. Neste anbefalte PR etter kontrakten

Neste anbefalte PR er:

```text
feat: add AHA manual sync confirmation modal
```

Confirmation modal skal fortsatt ikke trenge å utføre write. Den bør først gjøre bekreftelsesflyten eksplisitt: payload summary, warnings/errors-status, target-status, audit-log-forventning og én ekstra run-scoped bekreftelse.

Faktisk write/sync skal komme senere, etter at target, audit log storage og rollback/partial failure behavior er valgt i egen PR.
