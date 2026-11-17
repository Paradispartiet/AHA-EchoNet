# Kunstrommet V2 – første lagbaserte atelier (utkast)

## Avgrensning

PR #1050 er nå den **eneste aktive Kunstrommet-PR-en**, direkte mot main. V1-PR #1043 ble lukket som erstattet, ikke merget. Hele V1-grunnlaget finnes i denne PR-en, men brukerne får **bare én redigeringsside**, kunstrommet.html. Den gamle kunstrommet-v2.html videresender til den ene hovedsiden.

V1-databasen beholdes uendret, men eldre skisser kan vises i samme rom og åpnes som nye redigerbare V2-kopier. Samlinger, tankekart og eksisterende Galleri gjenbrukes; ingen ny Galleri-database opprettes. V1-testfixtur finnes bare under tests/fixtures for regresjoner.

V2 er ennå ikke Photoshop og skal ikke markedsføres som produksjonsklar. Målet for første milepæl er tre–fire faktiske lag, fotoimport, flytting, tegning, ekte transparent viskelær, lagrekkefølge, synlighet, låsing, opasitet og gjenåpning av redigerbare prosjekter.

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

## Release-gates

1. Kjør Playwright-testene for bildeimport, lagtegning, viskelær, angre/gjør om, lagring, gjenåpning og V1-import.
2. Kjør hele AHA-testpakken mot siste commit, ikke bare isolerte tester.
3. Test på fysisk iPad Safari med finger og Apple Pencil, inklusive orientering, filvelger, tegnestrek og langvarig lagarbeid.
4. Kontroller lagringsgrenser/kvotefeil, bildefiler og usynlige/låste lag manuelt.
5. Behold V2 PR som **draft** og ikke merge/publiser før både V1-portene og V2-portene er bestått.

## Neste trinn (ikke implementert i denne PR)

Trykkfølsomme pensler, multitouch pinch-zoom, presise utvalgsverktøy, avanserte masker, ikke-destruktive bildejusteringer, tekst- og vektorlag, store dokumenter, PSD-format og valgfrie Aha-referanser for V2. Bruk eksisterende Aha Galleri – ikke lag et nytt galleri.

## Konsolidering (17. november 2026)

- PR #1043: lukket som erstattet, uten merge.
- PR #1050: eneste aktive Kunstrommet-PR mot main, fortsatt draft.
- Ingen automatisk migrering eller destruktiv oppdatering av eksisterende V1-skisser.
- Aha/Galleri-tjenestene er felles; bildedata forblir lokalt og bare eksplisitte metadata kan overføres.
- Både gammel V1-frontend (testfixtur) og ny konsolidert frontend skal dekkes av CI før publisering.

## Sluttkontroll på fysisk iPad (ikke gjennomført)

CI dekker Chromium og iPad WebKit-emulering, men det erstatter ikke en fysisk iPad med Apple Pencil. PR #1050 må forbli **draft** inntil følgende protokoll er gjennomført og resultatet er dokumentert i PR-en.

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

Dokumenter i PR-en: iPad-modell, iPadOS-versjon, Safari-versjon, Apple Pencil-type, dato, testansvarlig, observasjoner og eventuelle feil/skjermbilder. **Ikke kryss av uten faktisk testing.**

En automatisert Playwright-test simulerer nå `QuotaExceededError`, kontrollerer tydelig sikkerhetskopi-varsel og at lagringen kan forsøkes på nytt. Den erstatter ikke faktisk kontroll av lagringskvote på enheten.
