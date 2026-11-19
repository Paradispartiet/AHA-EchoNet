# Kunstrommet – lagbasert personlig atelier (integrert i Aha)

## Avgrensning

PR #1050 ble **merget til `main` 17. november 2026** (merge-commit `39258a9`). V1-PR #1043 og den alternative, stablede lag-PR-en #1051 er lukket som erstattet uten merge. V1-grunnlaget er bevart, men brukerne får **bare én redigeringsside**, `kunstrommet.html`. Den gamle `kunstrommet-v2.html` videresender til hovedsiden.

V1-databasen beholdes uendret, men eldre skisser kan vises i samme rom og åpnes som nye redigerbare V2-kopier. Samlinger, tankekart og eksisterende Galleri gjenbrukes; ingen ny Galleri-database opprettes. V1-testfixtur finnes bare under tests/fixtures for regresjoner.

Kunstrommet er et integrert første lagbasert atelier, **ikke et fullverdig Photoshop-alternativ**. Det støtter inntil åtte lag, fotoimport, flytting, tegning, transparent viskelær, lagrekkefølge, synlighet, låsing, opasitet og gjenåpning av redigerbare prosjekter. Fysisk iPad/Apple Pencil er fortsatt ikke godkjent.

## Løsning

- Én hovedside: kunstrommet.html; eldre V2-lenke videresendes.
- Én redigeringsmotor: js/ahaKunstrommetV2.js, med en metadata-basert Aha/legacy-bridge i js/ahaKunstrommetBridge.js.
- Egen responsiv CSS: css/aha-kunstrommet-v2.css.
- 1200 × 800 rasterlerret, inntil 8 lokale lag (tegnelag eller importerte JPG/PNG/WebP), maks 12 MB per foto.
- Separat transparent Canvas for hvert lag; kompositt vises med hvit bakgrunn.
- Pensel og viskelær påvirker **bare aktivt lag**. Viskelær bruker destination-out og ødelegger ikke lag under.
- Verktøyet «Flytt lag» flytter hele aktive laget. Rekkefølge, låsing, visning og opasitet kan endres.
- Lokal skissebok i aha_kunstrommet_v2 (IndexedDB), filtrert med samme lokale profilnøkkel som V1. Ingen automatisk lagring eller skybackup.
- Samlet skissebok beholder V1s nyttige funksjoner: forhåndsvisning av ferdig kompositt, søk i tittel og notat, kopiering med ny privat prosjekt-ID og bekreftet sletting.
- Thumbnail lagres lokalt som en liten PNG i V2-prosjektet. Ingen automatisk kopiering eller publisering til Aha Galleri.
- Redigerbart JSON-prosjekt (versjon 2) lagrer hver lagbitmap som PNG pluss lagmetadata og notater. Eksplisitt PNG-eksport gir ferdig kompositt.
- Manuell import av V1-JSON med penselstrøk til et flatt rasterlag. V1-databasen berøres ikke.
- Angre/gjør om med maksimalt 12 snapshots i minnet.

## Sikkerhet og personvern

- All bildeimport krever brukerens aktive filvalg. Ingen automatisk kopiering fra Aha Galleri.
- Ingen bilder, piksler eller notater sendes til AHAIngest, EchoNet, Supabase eller nettjenester.
- Filer lagres i nettleserens IndexedDB; nettsteddata kan slettes av nettleser eller bruker. Eksport er nødvendig for sikkerhetskopi.
- Profilfiltrering er **ikke** sikker isolasjon på delt enhet; den bruker ikke kryptografisk autorisasjon.
- Import av prosjektfiler valideres på format, størrelse og lagantall. Importerte HTML-/SVG-filer eller remote URL-er støttes ikke.
- Ingen automatisk flytting av V1-skisser, Galleri-publisering eller KI-redigering.

## Status for release-kontroller

- **Bestått ved merge:** Playwright for Chromium og iPad WebKit, Kunstrommet-kontrakttester, AHA Engine, Node, syntaks og AHA launch gate på HEAD `f2e2bea`. Simulert `QuotaExceededError` og eksport/ny lagring er testet automatisk.
- **GitHub:** PR #1050 er merget til `main` i `39258a9`, etter uttrykkelig beslutning fra prosjekteier. Alle automatiske PR-kontroller var grønne ved merge.
- **Ikke gjennomført:** fysisk iPad Safari med finger/Apple Pencil, ytelse over tid, reell lagringskvote og manuell kontroll av bildefiler, låste/skjulte lag og eldre skisser på enheten. Disse punktene er åpne etterkontroller, **ikke godkjente tester**.
- **Avgrensning:** Sammenflettingen innebærer ikke at Kunstrommet er testet på fysisk Apple Pencil eller at lokale prosjekter har skybackup.

## Tegneiterasjon – trykk, zoom og hånd (integrert)

Dette er videreutvikling av **den samme** `kunstrommet.html`, `js/ahaKunstrommetV2.js` og den eksisterende lokale skisseboken. Ingen ny app, redigeringsmotor, databasemigrering eller endret prosjektformat.

- Penselstreken bruker `PointerEvent.pressure` når nettleseren faktisk rapporterer trykk fra en penn. Lett/hardt trykk gir smalere/bredere strøk; mus, finger og penn uten rapportert trykk bruker standardbredde. Viskelæret beholder sin tidligere bredde.
- Zoomknappene gir 50 %, 75 %, 100 %, 125 %, 150 %, 200 % og 300 % av visningsstørrelsen. Zoom påvirker bare CSS-visningen og ikke faktiske piksler i lagene eller PNG-/JSON-eksport.
- «Hånd» panorerer visningsområdet uten å endre kunstverk, angi ulagrede endringer eller lage unødige angretilstander. «Flytt lag» fortsetter å endre det valgte laget.
- Nettlesertester for pennebreddens variasjon og for visnings-only zoom/hånd er lagt til.
- **Ikke implementert:** multitouch pinch-to-zoom, trykkfølsomt viskelær, tilt, håndflateregistrering utover nettleserens Pointer Events eller synkronisering.
- **Må verifiseres på fysisk enhet:** Apple Pencil-trykk, berøring/panorering, langsiktige tegneøkter, Safari-ytelse og faktisk lokal lagringskvote (se issue #1058).

## Videre funksjoner (ikke implementert)

Penselteksturer og tilt, multitouch pinch-zoom, presise utvalgsverktøy, avanserte masker, ikke-destruktive bildejusteringer, tekst- og vektorlag, store dokumenter og PSD-format. Frivillige Aha-samlingsreferanser finnes allerede i første versjon. Bruk eksisterende Aha Galleri – ikke lag et nytt galleri.

## Konsolidering (17. november 2026)

- PR #1043: lukket som erstattet, uten merge.
- PR #1050: **merget** til `main` 17. november 2026 (`39258a9`).
- PR #1051: **lukket** som alternativ/stablet implementasjon; beholdt i GitHub-historikken uten merge.
- Ingen automatisk migrering eller destruktiv oppdatering av eksisterende V1-skisser.
- Aha/Galleri-tjenestene er felles; bildedata forblir lokalt og bare eksplisitte metadata kan overføres.
- V1-regresjonsfixtur og den konsoliderte frontenden ble dekket av CI ved merge; fysisk iPad-kontroll gjenstår.

## Sluttkontroll på fysisk iPad (ikke gjennomført)

CI dekker Chromium og iPad WebKit-emulering, men det erstatter ikke en fysisk iPad med Apple Pencil. PR #1050 er allerede merget; følgende protokoll må derfor gjennomføres som **dokumentert etterkontroll** og kan ikke regnes som bestått før den er utført.

- [ ] Åpne `kunstrommet.html` i Safari på fysisk iPad. Bekreft at skjerm, sidepanel og knapper kan brukes både stående og liggende.
- [ ] Tegn flere strøk med Apple Pencil og finger, inkludert raske og langsomme strøk, og kontroller at scrolling ikke avbryter tegningen.
- [ ] Importer et JPG/PNG-bilde fra iPadens filvelger, opprett minst tre lag og kontroller rekkefølge, flytting, synlighet, låsing og opasitet.
- [ ] Bruk viskelær på bare aktivt lag; bekreft at laget under er urørt. Kontroller angre og gjør om.
- [ ] Lagre lokalt, lukk fanen, åpne Kunstrommet på nytt og bekreft at lag, navn og arbeidsnotat er redigerbare.
- [ ] Eksporter både PNG og redigerbar prosjektfil. Importer prosjektfilen og kontroller at lagene er bevart.
- [ ] Test med mange penselstrøk og store bilder over en lengre økt, og kontroller at Safari ikke mister prosjektet eller låser seg.
- [ ] Kontroller på samme iPad at V1-originaler forblir urørt når «Åpne som kopi» brukes; sjekk også samlingsreferanser og eksisterende Galleri.
- [ ] Kontroller reell lagringsgrense/lav ledig plass på en ufarlig testprofil. Verifiser at feilen varsles, at redigerbart prosjekt kan eksporteres, og at ingen melding hevder vellykket lagring.

### Registrering

Dokumenter i en oppfølgingskommentar lenket til PR #1050: iPad-modell, iPadOS-versjon, Safari-versjon, Apple Pencil-type, dato, testansvarlig, observasjoner og eventuelle feil/skjermbilder. **Ikke kryss av uten faktisk testing.**

En automatisert Playwright-test simulerer nå `QuotaExceededError`, kontrollerer tydelig sikkerhetskopi-varsel og at lagringen kan forsøkes på nytt. Den erstatter ikke faktisk kontroll av lagringskvote på enheten.

## Kunstrommet 3.0 – markering, beskjæring og lagtransformering (integrert)

Dette videreutvikler **samme Kunstrommet**, basert på PR #1059 som ble merget til `main` 19. november 2026 (merge-commit `e961450`). PR #1063 ble merget til `main` 19. november 2026 i commit `f16732b`, etter bestått samlet integrasjonskontroll. Ingen ny app, database, bildeopplasting til server eller automatisk Aha-overføring.

- **Marker område:** Trekk et rektangel direkte på lerretet. Markeringen er kun en visuell, midlertidig redigeringsramme og lagres ikke i kunstverket. Endrer ikke angrehistorikken eller bildepikslene.
- **Pensel og viskelær innenfor markeringen:** Strøk klippes til valgt rektangel, med lagets posisjon tatt med i beregningen.
- **Beskjær valgt lag:** Gjør piksler utenfor markeringen gjennomsiktige **på aktivt lag**, uten å endre øvrige lag eller størrelsen på dokumentet (1200 × 800). Krever synlig, ulåst lag; kan angres.
- **Eksporter utsnitt:** Oppretter en separat PNG nøyaktig med markeringens bredde og høyde uten å endre prosjektet. Den er basert på den synlige, sammensatte tegningen.
- **Dupliser lag:** Kopierer RGBA-bitmappen direkte til et nytt, redigerbart lag, uten decode/encode-rundetap. Følger grensen på åtte lag.
- **Transformer aktivt lag:** Speil vannrett, roter 90°, skaler til 75 % eller 125 % rundt lerretets sentrum. Dette er destruktive rastertransformasjoner med angre/gjør om. Innhold utenfor 1200 × 800 klippes. Låste eller skjulte lag kan ikke transformeres.

### Kontrollkrav for ny etappe

- [x] Chromium og iPad WebKit: markering av rektangel, eksakt størrelse på utsnittseksport, og tegning bare innenfor markeringen. 40/40 PASS på `40fe2c0` ([GitHub Actions](https://github.com/Paradispartiet/AHA-EchoNet/actions/runs/44472867479)).
- [x] Lagisolering: beskjæring av ett lag påvirker aldri piksler i laget under; angre restaurerer (automatisert test PASS).
- [x] Lokale kontrakttester, duplisering, transformering av også flyttede lag, angre, V1/V2-kompatibilitet, import/eksport og Aha-referanser gjennomført i Kunstrommet-testpakken; AHA Engine PASS på `40fe2c0`.
- [x] Samlet Aha-regresjon, Node, syntaks og launch gate bestått på siste integrasjonskandidat til PR #1063: 6/6 arbeidsflyter PASS; Kunstrommet 40/40, Aha 126 PASS og 8 SKIP.
- [ ] Manuell iPad/Safari/Apple Pencil-kontroll av gestikk, markering og redigering etter godkjent testgrensesnitt. Ikke marker emulering som fysisk test.

## Neste lille utvidelse – fargepipette (PR under utvikling)

«Fargepipette» lar brukeren velge synlig farge fra det sammensatte lerretet, inkludert lagopasitet og hvit bakgrunn. Verktøyet leser én piksel i dokumentkoordinater, setter penselfargen og går tilbake til «Pensel». Det tegner ingenting, oppretter ikke angrehistorikk, endrer ikke lag eller prosjekter og har ingen nettverkskall. En Chromium-/iPad WebKit-test kontrollerer eksakt farge, uendret lerret, angre og hvit bakgrunn. Dette er en egen utviklings-PR og ikke publisert før godkjente kontroller.
