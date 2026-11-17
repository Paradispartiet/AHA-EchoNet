# Kunstrommet V2 – første lagbaserte atelier (utkast)

## Avgrensning

Denne utviklingsversjonen bygger på head til V1-PR #1043, men ligger i separat gren og separat draft-PR. PR-en skal ha V1-grenen som base frem til V1 eventuelt merges. V1-koden, databasen og eksisterende Aha Galleri forblir uendret. På V1-siden finnes kun en frivillig lenke til V2.

V2 er ennå ikke Photoshop og skal ikke markedsføres som produksjonsklar. Målet for første milepæl er tre–fire faktiske lag, fotoimport, flytting, tegning, ekte transparent viskelær, lagrekkefølge, synlighet, låsing, opasitet og gjenåpning av redigerbare prosjekter.

## Løsning

- Egen side: kunstrommet-v2.html.
- Egen implementasjon: js/ahaKunstrommetV2.js.
- Egen responsiv CSS: css/aha-kunstrommet-v2.css.
- 1200 × 800 rasterlerret, inntil 8 lokale lag (tegnelag eller importerte JPG/PNG/WebP), maks 12 MB per foto.
- Separat transparent Canvas for hvert lag; kompositt vises med hvit bakgrunn.
- Pensel og viskelær påvirker **bare aktivt lag**. Viskelær bruker destination-out og ødelegger ikke lag under.
- Verktøyet «Flytt lag» flytter hele aktive laget. Rekkefølge, låsing, visning og opasitet kan endres.
- Lokal skissebok i aha_kunstrommet_v2 (IndexedDB), filtrert med samme lokale profilnøkkel som V1. Ingen automatisk lagring eller skybackup.
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
