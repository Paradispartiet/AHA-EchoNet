# AHA Sync Hub / Control Center plan

Statusdato: 2026-06-04

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

## 10. Anbefalt plassering

Første kodekandidat bør være en egen Sync Hub / Control Center-seksjon på AHA Home eller en egen side.

Før kode må AHA Home / dashboard entry points kartlegges:

```text
- Finn hvilken index/home-fil som eier AHA Home-flaten.
- Finn eksisterende dashboard-seksjoner og lasting av AHA-moduler.
- Finn hvor status kan vises uten å trigge sync.
- Ikke velg endelig UI før AHA Home-strukturen er kartlagt.
```

Denne dokumentasjons-PR-en velger derfor ikke endelig plassering.

## 11. Neste trygge kodekandidat

Etter denne dokumentasjonsplanen bør neste PR være kartlegging før kode:

```text
1. Kartlegg AHA Home / dashboard entry points.
2. Finn hvor Sync Hub bør vises.
3. Bygg eventuelt minimal read-only Sync Hub status først.
4. Legg deretter til manuell sync-knapp.
5. Ikke auto-sync.
```

Anbefalt neste PR-tittel:

```text
docs: map AHA Home sync hub entry points
```

Hvis AHA Home-strukturen allerede er kartlagt i en senere PR, kan neste kodekandidat være:

```text
feat: add read-only AHA sync status hub
```

Anbefalingen nå er likevel kartlegging først, ikke runtime-kode.
