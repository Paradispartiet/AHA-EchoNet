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

## Fargepipette (publisert – PR #1071)

«Fargepipette» lar brukeren velge synlig farge fra det sammensatte lerretet, inkludert lagopasitet og hvit bakgrunn. Verktøyet leser én piksel i dokumentkoordinater, setter penselfargen og går tilbake til «Pensel». Det tegner ingenting, oppretter ikke angrehistorikk, endrer ikke lag eller prosjekter og har ingen nettverkskall. En Chromium-/iPad WebKit-test kontrollerer eksakt farge, uendret lerret, angre og hvit bakgrunn. Funksjonen er merget og publisert i PR #1071. Automatisk kontroll i Chromium og iPad WebKit er bestått; fysisk Apple Pencil-kontroll er fortsatt åpen i #1058.


## Kopier markering til nytt lag (publisert – PR #1075)

Kopier pikslene fra **det valgte, synlige og ulåste laget** innenfor et markert rektangel til et nytt, separat redigerbart lag direkte over kildelaget. Originalens piksler blir ikke endret; det nye laget får kildelagets posisjon og opasitet og bare de markerte RGBA-pikslene. Dette fungerer også når kildelaget er flyttet. En tom markering oppretter ikke et lag. Laggrensen på åtte opprettholdes, og operasjonen kan angres og gjøres om. Den oppretter ingen nettverkskall eller endringer i V1/Galleri.

Nettlesertestene bekrefter at originalens PNG-bitmap bevares, at kopien bare viser markerte piksler, at angre/gjør om virker, at flyttede lag beholder dokumentposisjonen og at åtte-lagsgrensen håndheves. PR #1075 er merget (`4c4d2e1`); seks etter-merge-workflows, inkludert GitHub Pages, bestod. Fysisk iPad/Safari/Apple Pencil-verifisering må fortsatt skje i sak #1058.


## Klipp markering til nytt lag (ny utviklingskandidat)

«Klipp markering til nytt lag» flytter markerte RGBA-piksler **fra det aktive laget** til et nytt, separat redigerbart lag rett over kilden. Det markerte området blir gjennomsiktig i kildelaget; utenfor markeringen bevares alle kildens piksler eksakt. Alle andre lag blir uendret. Det nye laget får samme posisjon og opasitet som kilden. Både ordinære og tidligere flyttede lag støttes, uten PNG-omkoding.

Operasjonen krever en gyldig markering, et synlig og ulåst aktivt lag, minst én synlig piksel i markeringen og kapasitet under åtte-lagsgrensen. Ved tom markering endres ikke prosjektet eller angrehistorikken. Klippingen er ett angre-/gjør om-steg og støttes av eksisterende lokal lagring og redigerbar JSON-eksport. V1 og Galleri berøres ikke.

**Påkrevd verifisering før merge:** målrettede Playwright-tester i Chromium og iPad WebKit for transparente hull i kildelaget, uendret innhold utenfor markeringen, lagposisjon etter flytting, kopi kontra klipp, angre/gjør om, lås og åtte lag. Kontroller også samlet AHA-regresjon og nødvendige lokale kontrakter. Ingen ny fysisk iPad-verifisering påstås: #1058 forblir åpen.


## Lagmasker – ikke-destruktiv redigering (utviklingskandidat)

Et eksisterende lag kan nå få en **egen maske**. Masken er et redigerbart alfalag som starter helt synlig, uavhengig av selve lagets pikseldata. Når «Rediger maske» er aktivt, skjuler **Viskelær** deler av bildet ved å redusere maskens alfa; **Pensel** viser delene igjen. «Rediger maske» kan slås av for å male direkte på lagets originalbilde. «Skru av maske» viser originalen uten å slette masken, og «Fjern maske» tar bort masken, men bevarer bildets originalpiksler. Arbeid på skjulte/låste lag blokkeres.

Masken ligger i samme dokumentkoordinater som lagets bitmap og følger laget ved flytting, duplisering og transformering. Ved kopiering og klipping av en markering følger en **selvstendig kopi av masken** med til det nye laget. Alle maskeoperasjoner er angrebare. Eksisterende `aha-kunstrommet-v2`-prosjekter uten masker forblir gyldige; lag med masker har de **valgfrie** feltene `maskBitmap`, `maskEnabled` og eventuelt `maskPixelFixups`. Lokale prosjektkopier, JSON-backup, gjenåpning og PNG/utklipp bruker samme system som før. V1/Galleri, databasetabell og sky er urørt.

Automatiserte nettlesertester (Chromium og iPad WebKit) skal kontrollere uendret originalbitmap etter maskering, vis/skjul/angre/gjør om, lokal gjenåpning, sikkerhetskopi, flyttet og duplisert lag, masketransformering, ødelagt maskefil (avvis import uten datatap) og gammel prosjektkompatibilitet. Den fysiske iPad/Safari/Apple Pencil-kontrollen er fortsatt åpen i [#1058](https://github.com/Paradispartiet/AHA-EchoNet/issues/1058). Denne funksjonen skal ikke merkes fysisk godkjent ut fra simulatoren.


## Fyll markering med farge

Fyll en eksisterende rektangelmarkering med penselfargen på **aktivt, synlig og ulåst bildelag**. Bare rektangelet fylles, og bildet/lagene utenfor markeringen endres ikke. Laglokale koordinater sikrer at markeringen også fungerer etter at et lag er flyttet. Fylling utenfor det valgte lagets bitmap utfører ingen redigering og legger ikke til et angrepunkt. Operasjonen er ett angre-/gjør om-steg.

Når **lagmasken redigeres**, er bildefylling deaktivert for å unngå utilsiktede endringer i originalpikslene. Avslutt maskeredigering før fylling. Dette er en *fyll markering*-funksjon, ikke en flatebasert malingsbøtte eller maskefyll. Ingen ny app, database, prosjektformat, nettverk eller endring i Galleri.

Målrettede tester kontrollerer korrekt farge, uendret innhold utenfor utvalget og i andre lag, flyttet lag, låst lag, angre/gjør om og sperre under maskeredigering. Disse kjøres i både Chromium og iPad WebKit. Fysisk iPad/Apple Pencil-kontroll står fortsatt åpen i #1058.


## Frihåndsmarkering (lasso)
«Frihåndsmarkering (lasso)» tegner en lukket polygon med mus, finger eller penn. Konturen blir ikke en del av kunstverket. Markeringen er midlertidig og deles ikke med AHA, og eldre prosjektfiler fungerer uendret. Punktantallet er begrenset til 2048; svært små former forkastes.

Lasso bruker dokumentkoordinater ved zoom og flyttede lag. Pensel, viskelær og lagmaskepensel klippes etter formen. Fargefylling og beskjæring bruker polygonet. Kopier/Klipp markering til nytt lag bruker eksakte skannlinjegrenser: piksler utenfor polygonet blir aldri kopiert eller slettet, heller ikke innenfor omsluttende rektangel. Eksport av utsnitt gir gjennomsiktig PNG utenfor polygonet. Operasjoner beholder eksisterende angre/gjør om, lagring og laggrensen på åtte lag. Ingen ny database, nettverk, app eller Galleri-endring. Fysisk iPad og Apple Pencil gjenstår i #1058.


## Penseltyper og hurtigpalett

Den samme penselmotoren har fire tegneinnstillinger: **Vanlig** (opasitet 100 %, standard bredde), **Blyant** (50 % bredde, opasitet 100 %), **Tusj** (160 % bredde, opasitet 100 %) og **Lasur** (200 % bredde, opasitet 35 %). Størrelsesglideren og Apple Pencil-trykket fungerer fortsatt. Opasitet gjelder bare maling på bildet: viskelær og pensel på lagmasken beholder sin fulle effekt, så eksisterende masker ikke får uventet gjennomsiktighet.

Hurtigpaletten tilbyr åtte navngitte farger og oppdaterer den vanlige fargevelgeren. Andre farger kan fortsatt velges fritt. Å velge pensel eller farge oppretter ikke angrepunkter, endrer ikke kunstverket, overfører ikke data og lagres ikke som nye prosjektfelter. Når man begynner å tegne, blir pikslene fortsatt redigert og lagret via den eksisterende lokale lagmotoren. Masker, lasso, Galleri, V1, sikkerhetskopier og eksisterende prosjektfiler er uendret.

Tre nye Playwright-scenarier tester penselvalg og angre/gjør om, ulik bredde/opasitet, samt at maskemaling og viskelær ikke påvirkes av penselinnstillingen, i både Chromium og simulert iPad WebKit. Fysisk iPad/Apple Pencil-kontroll ligger fortsatt i #1058.


## Blandingsmoduser for lag

Aktivt lag har 16 blandingsmoduser i lagpanelet: Normal, Multipliser, Skjerm, Mørkere, Lysere, Fargebrenning, Fargebleking, Overlegg, Mykt lys, Hardt lys, Differanse, Ekskludering, Kulør, Metning, Farge og Lysverdi. Blend beregnes under visning og PNG-eksport ved sammensetting av lagene; lagets originale RGBA-piksler og eventuelle ikke-destruktive masker forblir uendret. Lagets opasitet, synlighet, flytting, rekkefølge, lasso, maske og transformering fungerer videre. En maskert bitmap blandes først etter at masken er påført. Endring av blandingsmodus er ett angre-/gjør om-steg.

Feltet `blendMode` er en valgfri metadatautvidelse innenfor **eksisterende** prosjektformat `aha-kunstrommet-v2`, uten nytt IndexedDB-skjema. Gamle prosjektfiler uten feltet åpnes som Normal. Import bruker en eksplisitt tillatelsesliste med 16 kunstneriske blandingsmoduser; ukjente eller destruktive komposisjonsoperasjoner faller tilbake til Normal. Hvis nettleseren ikke støtter en modus, brukes Normal ved visning. Skissebokk-kopier beholder blandingsmodus. Lagduplisering og kopier/klipp viderefører modus, og eksport, import, angre og lokal lagring beholder den. Ingen nettverkstilgang, automatisk deling eller endringer i Galleri/psykologirommet.

Nettlesertestene i Chromium og emulert iPad WebKit kontrollerer komposisjonsfarger for mørkere/lysere modus, uendrede originalpiksler, angre/gjør om, sikker import av ugyldige verdier, gamle prosjektfiler, masker og duplisering. Fysisk iPad/Apple Pencil verifiseres separat i #1058.


## Ikke-destruktive bildejusteringer – lys, kontrast og metning

Det eksisterende lagpanelet har glidere for **Lysstyrke** (50–150 %), **Kontrast** (50–150 %) og **Fargemetning** (0–200 %), med nøytralverdi 100 %. Justeringene er **per lag** og gjøres som en deterministisk RGBA-visningskopi før den eksisterende ikke-destruktive lagmasken legges over. Dette er kompatibelt med både Chromium og iPad WebKit, som ikke alltid støtter Canvas 2D `filter`. Visningskopier mellomlagres og ugyldiggjøres når bitmap eller innstillinger endres. Originalpikslene påvirkes ikke. Originale RGBA-bitmap, lagmasker og pikselkorreksjoner endres ikke. Blandingsmodus og opasitet fungerer fortsatt, og PNG-eksporten ser den samme komposisjonen som lerretet.

Gliderens tall oppdateres under bevegelsen, og bildet oppdateres når glideren slippes. Hver endring skaper ett angresteg. «Nullstill bildejusteringene» gjenoppretter alle tre verdiene til 100 % i ett angresteg. Låste lag kan ikke justeres; skjulte lag beholder verdiene. Duplisering, lasso-kopiering og klipping viderefører selvstendige kopier av justeringene.

Prosjektformatet er uendret `aha-kunstrommet-v2` med et **valgfritt** `adjustments`-metadataobjekt for hvert lag. Gamle prosjekter uten felt får alle verdier 100 %. Import godtar bare endelige tall, avrunder og begrenser dem til glidernes grenser. Manipulerte/ugyldige verdier faller tilbake til nøytral og kan ikke bli injisert i Canvas-filterstrenger. Angre/gjør om, lokal IndexedDB-lagring, prosjektkopi og import holder verdiene. Ingen nettverk, ny app, delt redigeringsflate eller endring av Galleri.

Tre nye nettleserscenarier i Chromium og emulert iPad WebKit kontrollerer komposisjonsfarger, uendrede originalpiksler, særskilte angresteg, nullstilling, metning, sikker import, gamle prosjekter, lokal gjenåpning, lagmasker, duplisering og markert utsnitt. Fysisk Apple Pencil/iPad-kontroll er fremdeles åpen i #1058.


## Rektangel og ellipse på eksisterende lag

**Rektangel** og **Ellipse** er verktøy i det samme lokale kunstlerretet. Formene kan være **fylt** eller tegnes som **omriss**, der omrissbredde styres av den vanlige Størrelse-glideren. Tegning skjer ved å dra med mus, finger eller penn og slippe ved ønsket størrelse. En SVG-forhåndsvisning følger pekeren og kan avbrytes med Escape eller `pointercancel`. Forhåndsvisningen skrives aldri i originalpikslene, prosjektkopien eller PNG-eksporten.

Først ved et gyldig slipp lages **ett angresteg**, og figuren tegnes som rasterpiksler på aktivt, synlig, ulåst bildelag. En pågående rektangel- eller lassomarkering klipper figuren i dokumentkoordinater, selv når laget er flyttet. Under redigering av lagmaske må brukeren avslutte maskeredigering før formverktøy kan velges. Ingen endring av V2-prosjektformat, Galleri, IndexedDB, lagmasker eller bildejusteringer.

Fire nettlesertester (Chromium og simulert iPad WebKit) dekker forhåndsvisning uten pikselendring, angre/gjør om, ellipseomriss, penselstørrelse, markering på flyttet lag, Escape, avbrutt peker, låst lag og maskesikker redigering. Fysisk Apple Pencil/iPad-testing ligger fortsatt i #1058.


## Linje- og pilverktøy

Det samme formpanelet inneholder **Linje** og **Pil**. Begge bruker fargevelgeren og den eksisterende `Størrelse`-glideren til strekens tykkelse. Linjen har runde ender; pilen har en fylt spiss som peker **mot slutten av dragbevegelsen**, også når brukeren drar mot venstre eller oppover. Pilspissen tilpasses streklengden, med en begrenset størrelse på små og store piler. «Fylt/Omriss»-valget deaktiveres når linje eller pil er valgt, fordi disse alltid bruker strek.

Begge verktøyene bruker Kunstrommets eksisterende, ikke-destruktive SVG-forhåndsvisning, som aldri inkluderes i et lag, PNG eller JSON før `pointerup`. Tegning av en gyldig linje/pil gir **ett angresteg**; et kort trykk uten lengde, Escape, `pointercancel` og låste/skjulte lag endrer ikke bildet. Aktiv rektangel- eller lassomarkering begrenser både strek og pilspiss på et flyttet lag. Under redigering av lagmaske er verktøyene sperret. Prosjektformat, lokal lagring, bildejusteringer og Galleri er uendret.

Tre nettleserscenarier i Chromium og emulert iPad WebKit verifiserer forhåndsvisning, vannrett/diagonal linje, omvendt pilretning og pilspiss, angre/gjør om, markering på flyttet lag og maskesikkerhet. Test på fysisk iPad/Apple Pencil er fortsatt åpen i #1058.


## Tekstverktøy – første etappe

Det eksisterende atelieret har et **Tekst**-verktøy med inntil fem linjer (maksimalt 280 tegn), tre lokale/systembaserte skrifttypevalg (sans-serif, serif, monospace), størrelse fra 14 til 120 px, fet skrift og den eksisterende fargevelgeren/hurtigpaletten. Skriv teksten i panelet, trykk på lerretet for plassering og velg **Legg tekst på lag**. En midlertidig SVG-forhåndsvisning (inkludert linjeskift og fontvalg) vises uten å påvirke bildets RGBA eller fil-/prosjektlagring før bekreftelse. Tom tekst, over fem linjer og tekst som ikke får plass i dokumentet avvises uten å opprette et angresteg.

Ved bekreftelse skapes et nytt, separat rasterlag over det aktive laget i **ett angresteg**. Eksisterende flytt, lagopasitet, blandingsmodus, justeringer, angre/gjør om, lokale prosjektfiler og eksport fungerer uten formatendring. Dette er *rastertekst*: plassering kan endres via Flytt lag, mens bokstavinnhold ikke lenger kan redigeres direkte etter bekreftelse (angre for å forsøke på nytt). Denne begrensningen vises tydelig i panelet. Tekstposisjon og SVG-forhåndsvisning lagres aldri i V2-prosjektet før bekreftelse. Trykk Escape eller Avbryt plassering for å fjerne forhåndsvisningen.

Tekstplassering er sperret mens brukeren redigerer lagmaske, og egne rastertekstlag begrenses av den eksisterende grensen på åtte lag. Ingen automatisk tekstanalyse, AI-kall eller skyopplasting. Fysisk iPad/Apple Pencil-test registreres fortsatt i #1058.


## Redigerbare tekstlag

Nye tekstlag beholder en avgrenset tekstbeskrivelse sammen med PNG-pikslene i prosjektformat V2. Velg laget og bruk **Rediger tekstlag** for å endre tekst, font, størrelse, fet skrift og farge uten å endre andre lag. Endringer vises på lerretet ved bekreftelse, og avbryt endrer ingen piksler. Flytting, maske, justeringer, duplisering og angre/gjør om beholder teksten. Tegning, fyll, beskjæring, klipp og geometrisk transform krever først **Gjør tekst om til piksler** (angrebart). Tidligere rastertekst forblir rastertekst; det er ikke mulig å gjenskape opprinnelige bokstaver fra gamle piksler. Eksport beholder pikselbildet også for eldre lesere av prosjektformatet.


## Fri transformering (numerisk førsteversjon)

**Fri transformering** åpner en separat forhåndsvisning av hele komposisjonen. Vinkel −180 til 180 grader og bredde/høyde 10–300 % kan justeres med låste eller uavhengige proporsjoner. Forhåndsvisningen endrer verken lerretet, prosjektkopien eller angrehistorikken. Bruk transformering beregner resultatet fra originalen i ett angresteg, med samme matrise for bilde og eventuell lagmaske, rundt dokumentets sentrum. Avbryt/Escape eller annet lagarbeid forkaster utkastet. Redigerbar tekst må rasteriseres først; låste/skjulte lag og aktiv maskeredigering sperres. Ingen formatendring, nettverk eller AI. Direkte skaleringshåndtak på lerretet er ikke en del av denne førsteversjonen.


## Direkte transformasjonskontroller

Fri transformering viser også en separat komposisjonskopi på lerretet med hjørne-/sidehåndtak, rotasjonshåndtak og flyttbart oransje sentrum. Rammen beregnes fra lagets opprinnelige alfa med et minste synlig gripeområde. Tallfeltene er fortsatt tilgjengelige og synkroniseres med drag. Pointercancel forkaster pågående drag; Avbryt/Escape forkaster hele utkastet. Håndtak og livevisning er egne DOM-elementer og inngår aldri i originalens PNG/JSON, lagring eller angrehistorikk. Innhold utenfor bitmapgrensene kan klippes ved bekreftelse; zoom/verktøy-/lagbytte avslutter utkastet. Fysisk iPad-testing er fortsatt nødvendig.


## Magnetiske hjelpelinjer – første trinn (4.3)

Valget **Fest til lerret og lag** er av som standard og gjelder bare Flytt lag. Under drag kan ytterkant eller sentrum av lagets opprinnelige, ikke-gjennomsiktige pikselinnhold feste seg til lerretets kanter eller midtlinjer innenfor åtte CSS-piksler. Rosa, stiplede hjelpelinjer viser treffet og skjules ved avsluttet drag. Alt-tasten gir midlertidig fri flytting med mus. Lagmasker endrer ikke grensene som brukes; tomme lag festes ikke. Ingen ny prosjektmetadata eller eksportinnhold. Angre bruker det eksisterende flyttesteget. Synlige, ikke-tomme lag med opasitet over null gir også magnetiske kanter og sentre; låste lag kan være referanser. Grensene beregnes én gang per drag, skjulte lag utelates, og det nærmeste treffet velges uavhengig på hver akse. Fysisk iPad-verifikasjon gjenstår.


## Flervalg ved lagflytting (4.4, første trinn)

Aktivt lag redigeres fortsatt individuelt. Avkryssing av ekstra synlige, ulåste lag i listen gjør at **Flytt lag** flytter dem sammen med aktivt lag, uten endring av relative avstander. Skjulte og låste lag utelates. Magnetisk justering bruker felles yttergrense og utelater gruppens egne lag som referanser. Ett drag gir ett angresteg; PNG- og JSON-format er uendret. Flervalg er midlertidig, tømmes ved nytt/åpnet prosjekt eller med Fjern flervalg. Navngitte, varige grupper og felles rotasjon/skalering er ikke implementert ennå.


## Navngitte laggrupper (4.4, andre trinn)

Opprett en gruppe av minst to synlige, ulåste lag via flervalget og et unikt navn (maks 50 tegn). Hvert lag har høyst ett gruppenavn; eksisterende grupper må løses opp før omgruppering. Velg gruppen fra listen for samlet flytting av synlige, ulåste medlemmer. Skjul/vis/lås/lås opp alle medlemmer med eksplisitte knapper; dette endrer de individuelle flaggene og kan angres i ett steg. Løs opp fjerner bare medlemskap. Gruppene er valgfri lagmetadata i eksisterende V2-format, bevares i lokal lagring, JSON, skissebokk kopi og angrehistorikk. Eldre filer uten metadata åpnes som før. Felles rotasjon/skalering, hierarkiske grupper og fysisk iPad-verifikasjon gjenstår.


## Samlet fri transformering (4.4, tredje trinn)

**Transformer flervalg** åpner eksisterende transformasjonsverktøy for minst to synlige, ulåste rasterlag. Felles ramme omfatter de valgte lagenes gripeområder og sentrum kan flyttes. Forhåndsvisning, rotasjon og uavhengig/proporsjonal skalering bruker samme dokumentmatrise på hver originalbitmap og eventuell maske. Bekreft gir ett angresteg for hele flervalget; avbryt beholder originalene. Vanlig Fri transformering gjelder fortsatt bare aktivt lag. Redigerbare tekstlag må rasteriseres eksplisitt. Som ved enkeltlag kan piksler utenfor det enkelte lagets bitmapgrenser klippes. Fysisk iPad og automatisk verifikasjon gjenstår.


## Justeringslag (4.6, første trinn)

Et eget lag av typen `adjustment` justerer den synlige komposisjonen under sin plass i lagstabelen, inkludert det hvite papiret. Lysstyrke, kontrast og metning (inkludert svart-hvitt ved 0 %) kan endres uten å skrive til underliggende bitmaps. Opasitet blander effekten med originalkomposisjonen, og lagmaskens alfa avgrenser effekten. Lag over justeringslaget påvirkes ikke. Laget kan skjules, flyttes i lagrekkefølgen, dupliseres, angres og lagres lokalt/JSON. Ingen ny database. Laget har fast dokumentposisjon og kan ikke males direkte på eller transformeres som rasterlag; bruk masken. Eldre prosjektfiler åpnes som før, men eldre appversjoner vil ikke gjengi den nye lagtypen riktig. Velg **+ Justeringslag** i lagpanelet. Dette åpner kontrollene for bildejusteringer.


### Fargebalanse og eksponeringsstyrke

Justeringslag har tre ekstra kontroller: relativ RGB-eksponeringsstyrke (−2 til +2 EV, faktor 2^EV i kodede RGB-verdier), temperatur (kald–varm, −100 til +100) og fargestikk (grønn–magenta, −100 til +100). Dette er kreative relative kontroller, ikke kalibrert RAW-eksponering eller Kelvin. De virker før kontrast og metning, med eksisterende opasitet og maske. Valgfri `toneAdjustments`-metadata valideres og avgrenses ved import, med nøytral 0 som standard. Angre, nullstill, duplisering, lokal lagring og JSON beholder verdiene. Vanlige rasterlags tidligere metadata er uendret.


## Nivåer og histogram (4.7, første trinn)

Justeringslag får svartpunkt 0–254, hvitpunkt 1–255 (alltid større enn svartpunkt) og gamma 0,25–4,00. En felles RGB-tabell anvendes etter fargebalanse, kontrast og metning og før maskert opasitetsblanding. Gamma over 1 lysner mellomtoner. Valgfri `levels`-metadata valideres ved import og lagres/dupliseres/angres; eldre filer bruker identitetsverdiene 0/255/1. Histogrammet er en manuelt oppdatert 32-intervalls lyshetsfordeling for den synlige sluttkomposisjonen inkludert papiret; det skjules ved neste redraw slik at gamle målinger ikke fremstår som aktuelle. Ingen analyse av rådata eller automatisk deling.


### RGB-fargekurver

Justeringslag har fire separate kurver (RGB, rød, grønn, blå), med fem faste inngangspunkter 0/64/128/192/255 og redigerbare utgangsverdier 0–255. Grafen følger valgte kanalens glidere; mellom punktene brukes lineær interpolasjon. Felles RGB-kurve anvendes etter nivåer, før hver kanal sin kurve, deretter maske og opasitet. Hver kurve kan nullstilles separat, og alle ved samlet nullstilling. Valgfri `curves`-metadata begrenses ved import og bevares ved lagring/duplisering/angre. Ingen endring i rasteroriginaler. Fri plassering av inngangspunkter og glatte splinekurver er ikke del av denne første versjonen.


## Gradientverktøy (4.8)

Lineær eller radial gradient med aktiv startfarge og egen sluttfarge eller gjennomsiktig slutt, reversering, og dokumentkoordinater som tar hensyn til lagets posisjon. Dra for å vise en retningslinje/radius, slipp for å male på valgt rasterlag i ett angresteg; pointercancel og Escape kasserer utkastet. Rektangel/lasso avgrenser effekten. Bruk nytt rasterlag for å bevare originalen. I maskemodus erstattes maskens alfa innen markeringen med synlig–skjult gradient (eller reversert), også for justeringslag; rasteroriginalen endres ikke. Ingen ny prosjektmetadata. Under dragging vises hele den midlertidige komposisjonen med en retningslinje over. Forhåndsvisningen bruker en separat kopi av rasterlaget eller masken og samme gradientberegning som endelig commit. Også justeringslagets maske, lagrekkefølge, blandingsmodus, opasitet og øvrige justeringer inngår. Tegning og eksport bruker fortsatt originalene frem til pointerup. Oppdateringer samles med requestAnimationFrame, og forhåndsvisningen skjules ved avbrudd. Fysisk iPad og nettlesertester gjenstår.


## Avansert pensel (4.9)

Eget valg i Penseltype, uten endring av de fire tidligere penslene. Hardhet 0–100 %, strøkopasitet 0–100 %, flyt per avtrykk 1–100 %, avtrykksavstand 5–100 % av grunnstørrelse, valgfri trykkstyrt bredde og flyt. Avtrykk med radial alfafalloff legges i et midlertidig strøklag med avstandsbasert sampling og interpolert trykk; strøkopasitet anvendes én gang ved sammensetting. En separat forhåndsvisning bruker samme lagrekkefølge, justeringer og masker som sluttbildet. Markering/lasso begrenser avtrykkene. Pointerup bekrefter ett angresteg; pointercancel/Escape forkaster. Maskepensel og viskelær bruker fortsatt den tidligere motoren. Innstillingene er foreløpig sesjonsinnstillinger, ikke prosjektmetadata. Fysisk iPad-ytelse og Apple Pencil-trykk gjenstår å verifisere.


## Mine pensler (etter 4.9)

Opptil 30 navngitte avanserte pensler per lokal AHA-profil med størrelse, farge, hardhet, strøkopasitet, flyt, avstand og trykkvalg. Velg/bruk, lagre, erstatt med bekreftelse, slett med bekreftelse og nullstill aktive innstillinger. Penselinnstillinger endrer ikke prosjektets rastere eller angrehistorikk. Biblioteket ligger i profilavgrenset localStorage på den aktuelle enheten, uten synkronisering eller ny database; lokal profilavgrensning er ikke kryptering eller en sikkerhetsgrense. Ugyldig lagring overskrives ikke automatisk. Nettlesertest dekker gjenåpning, profilbytte, sletting og uendrede lag. Eksport/import av penselbibliotek og fysisk iPad-testing gjenstår.


### Penselbibliotekets sikkerhetskopi

Eksportformat `aha-kunstrommet-brushes` versjon 1 inneholder bare navngitte penselinnstillinger, ingen profil-ID eller kunstverk. JSON-import på maks 40 000 byte validerer alle oppføringer før lagring. Eksisterende navn hoppes over; dersom nye pensler ikke får plass innen grensen 30, avbrytes hele importen. Profilbytte under filinnlesing avbryter. Ingen skysynkronisering. Test dekker eksport, kollisjon, gyldig/ugyldig import og uendrede originaler.


## Teksturpensler

Fire lokale, prosedyregenererte teksturer: kull, kritt, akvarellstruktur og tørrpensel. Avtrykkene bruker deterministiske 64×64 alfamasker med fire varianter per strøk, farget med aktiv farge, kombinert med hardhet, flyt, trykk og strøkopasitet. Teksturstyrke 0 % gir tidligere rundpensel, 100 % full kornstruktur. Ingen eksterne bilder eller nye nettverkskall. Penselbiblioteket bevarer valgfri tekstur og styrke; eldre versjon-1 filer uten feltene får rundpensel. Dette er stiliserte rasterteksturer, ikke fysisk simulering av pigment, væske eller papir. Nettlesertest dekker pikselvariasjon og lagring. Fysisk iPad-ytelse gjenstår.


### Penseldynamikk

Penselform 10–100 % (flat ellipse til sirkel), fast vinkel −180 til 180 grader, spredning inntil én grunnpenselbredde fra strøkbanen, rotasjonsvariasjon inntil ±180 grader og valgfri orientering etter strøkretningen. Avtrykksindeks gir deterministisk variasjon, uten ekstra nettverkskall. Både runde og teksturerte avtrykk transformeres; utklipp skjer i dokumentkoordinater. Første avtrykk bruker fast vinkel inntil en bevegelsesretning er kjent. Innstillinger lagres og eksporteres i penselbiblioteket, med bakoverkompatible nøytrale standardverdier. Dette er ikke fysisk Apple Pencil-tilt; maskepensel og viskelær er uendret. Test dekker rotasjon, deterministisk variasjon og gjenåpning. Fysisk iPad-testing gjenstår.


### Pennens helning

Valgfri helningsstyring med følsomhet 0–100 %. Pointer Events tiltX/tiltY omregnes til en normalisert helningsvektor, med altitudeAngle/azimuthAngle som reserve. Vektoren interpoleres mellom avtrykk; helning utvider avtrykket langs pennens projiserte akse og reduserer flyten moderat. Aktiv helning prioriterer pennens orientering over strøkretningen, mens fast vinkel og rotasjonsvariasjon fortsatt legges til. Mus, finger og manglende helningsdata gir tidligere oppførsel. Innstillingene bevares i penselbiblioteket; eldre filer har helning avslått. Automatisert test med syntetiske penneeventer dekker begge akser og musefallback; fysisk Apple Pencil-verifikasjon er fortsatt nødvendig. Tidligere beskrivelse av manglende tilt gjelder før denne utvidelsen.


## Atelierets arbeidsflate (5.0-forberedelse)

Fokusmodus er et reversibelt visningsvalg: skjuler introduksjon, sidepanel, tittel/notater og lange hjelpetekster, utvider lerretet og beholder tegneverktøy, angre, zoom og prosjektlagring. Gå tilbake til hele atelieret for lag og prosjekter. Avansert penselinspektør ligger etter lerretet, med snarvei fra verktøylinjen og tilbakeknapp. Sammenleggbare grupper for penselparametre, penselbibliotek, laggrupper, bildejustering og hjelpetekster. Ingen prosjektmetadata, raster eller historikk endres. Fokusmodus endres ikke midt i en aktiv pekerbevegelse eller fri transformering. Nettlesertest ved desktop- og iPad-lignende størrelse; fysisk iPad gjenstår.


### Atelierets penselutvalg

Åtte ferdige redigerbare penseloppsett: illustrasjonspenn, grafitt, kull, kritt, akvarellstruktur, tørrpensel, myk skygge og kalligrafi. Valg bevarer aktiv farge og fyller inn et forslag til navn; ingen lagring før brukeren velger Lagre. Strøkprøver for ferdige, aktive og valgte lagrede pensler bruker samme avtrykksmotor på små separate canvases, med nøytralt trykk, ingen helning, ingen markering og skalert størrelse (maks 28 px). Prøvene oppdateres ved endringer og caches etter innstillinger. Ingen endring av kunstverk, prosjektformat, angrehistorikk eller synkronisering. Automatisert test dekker strøkprøver, penselvalg, fargebevaring og uendrede rastere.


### Mine farger og paletter

Lokalt profilavgrenset fargebibliotek med 12 nylig valgte farger, inntil 20 navngitte paletter à 12 unike RGB-farger, redigerbart palettutkast og HSL-baserte komplementære, analoge og triadiske harmonier fra aktiv farge. Farger i utkastet kan fjernes, lagrede paletter kan redigeres eller slettes med bekreftelse. Bytte av farge i biblioteket bevarer aktivt verktøy. Nylige farger registreres ved bekreftet fargevalg, hurtigpalett og pipette; ikke ved tegning eller hver mellomverdi under fargevalg. Ingen kunstverk, prosjektmetadata, skybackup eller databaseendring. Lokal lagring er ikke en sikkerhetsgrense. Test dekker harmonier, lokal gjenåpning, profilbytte og uendrede rastere. Penselbiblioteket eksporteres separat; paletter har foreløpig ikke import/eksport.


### Sikkerhetskopi av fargepaletter

Navngitte paletter kan eksporteres i `aha-kunstrommet-palettes` versjon 1 (JSON). Kun palettnavn og RGB-farger følger med; ikke nylig valgte farger, profil-ID eller kunstverk. Import validerer hele filen (maks 30 000 byte, 20 paletter, 12 unike farger per palett) før lagring. Eksisterende navn beholdes, ugyldig fil eller plassmangel avbryter hele importen. Profilbytte under lesing avbryter. Import endrer ikke aktivt kunstverk. Dette erstatter den tidligere begrensningen om manglende palettimport/eksport. Nettlesertest dekker rundtur, navnekollisjon, ugyldig innhold og plassmangel.


## 6.0-forberedelse: komposisjonshjelpelinjer

Visningslag med rutenett, tredelingsregel, midtlinjer, ett- og topunktsperspektiv. Juster horisont, forsvinningspunkt(er) innenfor lerretet og synlighet. SVG-laget er separat fra rasteret, pekertransparent og følger zoom/fokusmodus. Det er en midlertidig visningsinnstilling, ikke del av prosjektformat, PNG, angrehistorikk eller lagring. Perspektivlinjene er visuelle (ingen penselmagnetisme eller automatisk perspektivkorrigering). Nettlesertest dekker geometri, zoom, uendret prosjekt/PNG og tegning med aktive hjelpelinjer. Fysisk iPad/Apple Pencil-verifikasjon av 5.0 står fortsatt åpen i #1058.


### 6.0-forberedelse: symmetritegning

Vertikal, horisontal og kombinert speiling med flyttbare akser (10–90 %). Vanlig pensel, viskelær, maskestrøk og avanserte penselavtrykk kopieres på aktivt lag i dokumentkoordinater. Avansert motor speiler også tekstur, vinkel, spredning og helning. Identiske sentre/segmenter på aksen avdupliseres; delvis overlapp kan bygge opp farge. Markering klipper hver kopi i dokumentkoordinater. Innstillingene fryses per strøk, og alle kopier inngår i samme angrehandling. Avansert avbrutt strøk blir ikke lagret. Separat akselinje følger zoom og eksporteres aldri. Symmetri er en midlertidig verktøyinnstilling, ikke prosjektmetadata. Figurer, tekst, gradienter og lagflytting speiles ikke. To nettlesertester dekker fireveis speiling, viskelær, undo/redo, avbrutt avansert strøk, flyttbar akse, markering og zoom. Fysisk Apple Pencil-verifikasjon gjenstår.


### Radiell symmetri

Mandalamodus med 3–12 jevnt fordelte rotasjoner (inkludert originalstrøket) rundt et flyttbart sentrum. Bruker samme symmetrimotor for vanlig/avansert pensel, viskelær og masker; hele avtrykket roteres, ikke bare posisjonen. Sektorlinjer er visuelle og følger zoom. Identiske sentre/segmenter avdupliseres; overlapp kan bygge opp farge. Innstillinger fryses per strøk. Ingen prosjektformatendring. Nettlesertest dekker seks rotasjoner, flyttbart sentrum, fireveis rotasjon av flat pensel og angre. Tolv er valgt som foreløpig øvre grense av hensyn til ytelse; fysisk iPad-testing gjenstår.


### Perspektivlås for penselstrøk

Valgfri lås i ett- og topunktsperspektiv. Første bevegelse over fire CSS-piksler velger nærmeste retning (ettpunkt: horisontal, vertikal eller forsvinningspunkt; topunkt: vertikal eller ett av forsvinningspunktene). Resten av strøket projiseres på samme rette linje og avgrenses ved lerretets kant. Separat oransje linje vises under strøket, men eksporteres aldri. Støtter vanlig/avansert pensel, viskelær og maskestrøk. Symmetri har forrang; perspektivlås anvendes ikke samtidig. Låsens parametre fryses per strøk, prosjektformatet endres ikke. Test dekker retning, angre, avansert pensel, eksport og symmetriprioritet. Fysisk Apple Pencil-verifikasjon gjenstår.


### Variable lerretsformat (6.0-kandidat)

Nye prosjekter kan opprettes i landskap 1200×800, portrett 800×1200, kvadrat 1200×1200, bredformat 1600×900, stående 900×1600 eller egendefinert 320–1600 px per side og maks 1 440 000 piksler. Standardknappen oppretter fortsatt 1200×800. Målene er faste gjennom prosjektets levetid; ingen omskalering av gamle verk. V2-formatets eksisterende width/height-felter brukes, og eldre 1200×800-filer forblir kompatible i den nye editoren (eldre editorversjoner kan ikke åpne nye størrelser). Lag/masker dekodes og dimensjonsvalideres før det åpne dokumentet endres; V1-konvertering skjer i separat lerret med gamle mål. SVG-guider og rasterforhåndsvisninger følger nye mål. Angrehistorikken nullstilles ved prosjektbytte. Kopier beholder lagrede dimensjoner og redigerbar tekst. Miniatyrbilder beholder proporsjoner. Begrensning på 8 lag, 12 angretrinn og 36 MB prosjekt beholdes inntil fysisk minne-/ytelsestest. Nettlesertester dekker portrett, masker, undo/redo, SVG, PNG-størrelse, gammel/ny import, avvisning av ugyldige mål, lokal gjenåpning og egendefinert lerret.


### Rasterlag-sammenslåing – avgrenset kandidat for 7.1 (#1144)

Slå sammen med laget under er bare tilgjengelig for tilstøtende, synlige, ulåste rasterlag med normal blanding, full lagopasitet, samme gruppe, uten masker (også deaktiverte), redigerbar tekst, justeringer eller forskyvning. Kompositt i transparent midlertidig lerret, deretter checkpoint og utskifting av de to lagene med ett rasterlag. Ett Angre gjenoppretter originalene i samme økt; etter lukking finnes ikke denne garantien. Brukeren får eksplisitt bekreftelse og anbefaling om sikkerhetskopi. Ingen hvit papirbakgrunn bakes inn. Avrundingsforskjeller ved delvis transparente kanter må fortsatt vurderes på ekte nettlesere. Laggrense, format og lagring er uendret. Masker, forskyvning, ikke-normal blend, opasitet og justeringer skal ikke bakes i denne første kandidaten. Utkastet må ikke merges før automatiske kontroller og fysisk iPad-godkjenning i #1058; #1142 håndteres separat.


### Klippemaske – kandidat for 7.2

En valgfri `clipToBelow: true` på et rasterlag begrenser dets synlige piksler til alfakanalen til laget direkte under, etter dette lagets maske, forskyvning og opasitet. Kildelagets piksler er uendret; klippingen gjelder komposisjon, levende forhåndsvisning, miniatyr og PNG. Dette er en enkelt alpha-stensil, ikke en isolert Photoshop-klippegruppe. Skjult eller ugyldig underlag skjuler klippet innhold; justeringslag og allerede klippede lag er ikke gyldige underlag. Omorganisering/innsetting/fjerning kan endre underlaget; etiketten viser gjeldende underlag. Duplisering av aktivt klippet lag og sammenslåing i prosjekt med klippemasker er sperret i kandidaten. Prosjektkopi og JSON beholder flagget; eldre editorer vil ignorere flagget og kan vise uavklippet innhold. Behold originale prosjektkopier og bruk ny editor. To klippflater allokeres ved behov, ikke per lag. Fysisk iPad-minnetest gjenstår. Bygger på #1145; ikke merge før denne og relevante automatiske og fysiske tester er godkjent. Ingen databaseendringer.


### Gruppeopasitet – kandidat for 7.3

Valgfri `groupOpacity` (0–1) på navngitte rasterlag. 100 % fjerner metadata og bevarer tidligere komposisjon. Ved lavere verdi komponeres en sammenhengende gruppeblokk med lik opasitet først på en transparent gjenbrukt flate, deretter legges hele blokken på dokumentet én gang. Overlapp blir ikke lysere på grunn av individuell reduksjon av opasitet. Spredte grupper behandles per sammenhengende blokk i opprinnelig stabelrekkefølge, ikke ved å flytte lag; ikke-normal blend virker inne i isolert blokk ved redusert opasitet. Ingen nestede grupper. Oppløsning av gruppe fjerner opasitetsmetadata. Gruppe med låste medlemmer kan ikke endres. Lagmasker, forhåndsvisning, historikk og JSON beholdes. Første kandidat sperrer kombinasjon med klippemasker i samme prosjekt (og avviser slik import), samt sammenslåing ved aktiv gruppeopasitet. Eldre editorer ignorerer feltet og kan vise full opasitet. Ikke merge før #1146 og automatiske samt fysiske iPad-kontroller (#1058) er godkjent. Ingen ny database eller økt laggrense.


### Minnearbeid – kandidat for 7.4

Pikselkorreksjonens binærbuffer allokeres etter faktisk antall delvis transparente piksler (8 byte per korreksjon), ikke 8 byte for alle dokumentpiksler. En helt tom eller helt ugjennomsiktig flate trenger ingen korreksjonsbuffer; på 1600×900 unngås da en midlertidig allokering på 11 520 000 byte per koding. RGBA-avlesning og PNG/base64-format er uendret. Angre/gjør om tar fortsatt en fersk, full snapshot, men gjenbruker levende raster eller maske når ID, dimensjoner, PNG og eksakte pikselkorreksjoner er identiske. Endrede flater dekodes sekvensielt før den atomiske installasjonen; import dekoder alltid uten gjenbruk. Historikken beholder 12 trinn og uendrede filgrenser. Historikk kan ikke startes midt i et aktivt strøk. Nøytrale bildejusteringer frigjør cache-referansen til tidligere filtrert raster. Dette reduserer noen konkrete allokeringer, men er ikke et målt iPad-minneresultat; sekvensiell dekoding kan også øke tidsbruk ved mange endrede lag. Ny test teller dekodinger ved metadataendring og rasterendring, og sammenligner full lagbackup med masker. Ingen databaseendring. Bygger på #1147, krever CI og fysisk iPad-verifisering (#1058) før merge.


### Adaptiv lagkapasitet – kandidat, ikke godkjent på fysisk iPad

Behold minst 8 lag for alle publiserte formater, og øk kun for mindre lerreter: maks(8, min(16, gulv(7 680 000 / (bredde × høyde)))). Eksempel 640×960: 12 lag; 480×640: 16 lag; 1200×800 og 1600×900: 8 lag. Dette er en konservativ pikselareal-proxy, ikke en garanti for faktisk minnebruk; maskerte lag, justeringer, midlertidige buffere og angrehistorikk krever ekstra minne. Lagringsgrensen 36 MB og 12 angretrinn beholdes. Alle nye lagveier, duplisering, fotoimport og prosjektimport følger samme dimensjonsbestemte grense; ved import brukes målene i filen, ikke åpne dokumentets mål. Eksisterende filer med opptil 8 lag forblir gyldige. Eldre editorer kan avvise filer med mer enn 8 lag.

**Ikke merge/publiser før #1058 har dokumentert fysisk iPad/Apple Pencil og belastningstest på 1,44 MP med 8 lag samt mindre lerreter med 12 og 16 lag, inkludert masker, undo/redo, lokal lagring og eksport.** Automatiske nettlesertester alene er ikke nok.


### Samlet 7.0-kandidat

Denne grenen samordner #1142, #1145, #1146, #1147 og #1148 med oppdatert hovedgren. Samme dimensjonsbaserte laggrense brukes også for duplisering med klippemaske-sperren. Ingen endringer i Psykologirommet eller database. De opprinnelige utkastene beholdes som sporbarhet, men skal ikke merges separat hvis den samlede kandidaten godkjennes. Hele kandidaten trenger egne automatiske kontroller og dokumentert fysisk iPad-test (#1058), ikke bare grønne resultater på delgrenene. Bruk syntetisk kunstverk, 8/12/16 lag, masker, sammenslåing, klippemaske og gruppeopasitet i separate prosjekter, angre/gjør om, lagring/åpning og eksport. Ingen økning utover 16 lag; avbryt ved minnefeil eller Safari-omstart.


## 8.1 – tegneflaten først (utviklingskandidat)

Kunstrommet får egen arbeidsbredde opptil 1520 CSS-piksler i stedet for den globale feedens 760 px. Lerretet følger verktøylinjen og det kontekstavhengige tekstpanelet; lagring/import/eksport ligger rett under, før navn, komposisjon, symmetri og øvrige innstillinger. De eksisterende verktøyene, DOM-ID-ene, fokusmodus og lagpanelet beholdes. På smalere skjermer plasseres lagpanelet under editoren. Sentrale knappemål er minst 44 px. Ingen endring av rastermotor, pikselmål, prosjektformat, lokal lagring eller nettverk. Ny nettlesertest dekker 390, 834 og 1180 CSS-piksler, rekkefølge, sidebredde, horisontal overflow og tilgang til lag og lagring i og utenfor fokusmodus. Fysisk iPad/Apple Pencil og belastningstest er fortsatt åpen i #1058.


### 8.1 – ikonverktøy og sammenleggbart lagpanel

13 tegne-/redigeringsverktøy og angre/gjør om får lokale SVG-ikoner, korte synlige navn, opprinnelige tilgjengelige navn og minst 48 CSS-piksler trykkflate. Alle eksisterende verktøy-ID-er og hendelser beholdes. Lagverktøy kan foldes sammen med en innfødt details/summary, som er åpen som standard; lagantall forblir synlig. Ingen ny lagring, motor eller nettverk. Test dekker verktøyvalg, trykkflate, sammenfolding/gjenåpning og uendrede lag i prosjektbackup. Kontekstavhengige verktøymenyer er ikke en del av denne etappen.


### 8.1 – kontekstavhengige verktøyinnstillinger

Penseltype vises ved Pensel, magnetisk justering ved Flytt lag, fyll/omriss ved rektangel/ellipse og størrelse ved pensel, viskelær, figurer, linje og pil. Gradient- og tekstpanelene følger fortsatt aktivt verktøy. Farge, hurtigpalett, zoom og angre/gjør om er alltid tilgjengelige (farge kan også brukes til markering). Verktøybytte bevarer innstillingsverdiene; skjulte kontroller blir ikke fjernet, nullstilt eller lagt i angrehistorikken. Ingen nye prosjektdata eller nettverkskall. Nettlesertest dekker synlighet, gjenvalg, identiske lag i eksport og angre. Eksisterende masketest velger Pensel eksplisitt før penseltype, i tråd med den nye arbeidsflyten. Fysisk iPad-testing gjenstår.


## Kunstrommet 9.1 – fargebasert områdevalg og ikke-destruktiv maske

Velg Fargemaske, trykk på en farget piksel på aktivt rasterlag og juster Fargetoleranse. Fireveis sammenhengende RGBA-område sammenlignes med startpikselen; gjennomsiktige piksler stopper utbredelsen. Blå forhåndsvisning er et separat lerret, ikke eksportert eller lagret. Lag maske skjuler eller beholder valgt område på aktivt lag i ett angresteg; originalbitmap bevares. Flyttede lag og zoom bruker dokumentkoordinater. Eksisterende lagmasker overskrives ikke; tekst-, justerings-, låste og skjulte lag er sperret. Dette er fargebasert segmentering, ikke KI eller semantisk objektgjenkjenning. Rektangel/lasso er separate verktøy. Ingen nettverk, nye prosjektfelter eller databaseendringer. Fysisk iPad-ytelse må kontrolleres i #1058.


## Kunstrommet 9.2 – kombiner fargeområder

Fargemaske har Ny markering, Legg til område og Trekk fra område. Legg til beregner union, Trekk fra differanse mellom eksisterende markering og den valgte sammenhengende fargeflaten. Toleranse endrer kun siste områdeoperasjon mot en beholdt baseline, også når markeringen blir tom; tidligere områder er uendret. Tomt valg kan ikke opprette maske. Kun to heldekkende binære markeringskart beholdes, uten voksende historikk. Ugyldig/transparent treff bevarer eksisterende markering. Avslutt med Lag maske, som før, i ett angresteg. Ingen prosjektmetadata, nettverk eller endring av originalbitmap. Fysisk iPad gjenstår.


## Kunstrommet 9.3 – myke maskekanter

Fargemaske får Myke kanter 0–32 dokumentpiksler. Null beholder eksakt binær maske fra 9.2. Positiv radius bruker separerbar glidende boksutjevning av det kombinerte binære valget med replikerte ytterpiksler, slik at dokumentgrensen ikke skaper en kunstig transparent kant. Blå markering gjenspeiler myk dekning; masken bruker samme alfaverdier (eller invers ved skjul). Toleranse, add/subtract og siste baseline forblir binære; mykhet kan endres uten akkumulert uskarphet. O(pikselantall) per radiusendring, midlertidig 16-bit buffer og ett cachet 8-bit alfakart. Oppdatering etter avsluttet sliderdrag for å begrense iPad-belastning. Ingen endring av originalbitmap eller eksisterende maskeskjema. Ett undo-steg ved bekreftelse. Dette er fjæring av maskekant, ikke AI-hårsegmentering. Fysisk iPad-test gjenstår.


## Kunstrommet 9.4 – presis kantjustering ved frilegging, første etappe

Juster markeringens kant −16 til +16 dokumentpiksler. Minus er erosjon av markert område, pluss dilatasjon; separerbar kvadratisk morfologi med glidende summer O(pikselantall) og replikerte ytterpiksler. Null gir den opprinnelige binære markeringen. Myke kanter beregnes etter kantjustering og bruker samme dekning i forhåndsvisning og endelig maske. Add/subtract/toleranse endrer fortsatt bare råmarkeringen. En helt borterodert markering kan ikke bekreftes, men kan gjenopprettes med mindre negativ verdi. Ved Behold kan en liten negativ verdi skjule en farget ytterkant; ved Skjul kan en positiv verdi skjule litt mer av bakgrunnen. Ingen endring av RGB, ingen faktisk fargedekontaminering, ingen KI. Eksisterende originalbitmap og undo beholdes. Slideroppdatering av bilde ved avsluttet drag. Fysisk iPad gjenstår.


## Kunstrommet 9.4b – lokal kantfargekorrigering som kopi

Etter maskering: åpne Korriger fargerester langs kanten i Lagmaske, velg styrke 0–100 % og Lag kantkorrigert kopi. En begrenset fireveis nærmeste-nabo-utbredelse henter RGB fra fullt dekkende, ugjennomsiktige motivpiksler inntil åtte rastersteg unna. Kun piksler med delvis maske og eksisterende rasteralfa korrigeres; blandingsvekten avtar med maskens dekning. Ingen endring av alpha, fullt synlige piksler, skjulte piksler eller masken. Dette er en konservativ lokal heuristikk, ikke eksakt rekonstruksjon av bakgrunnsfarge eller KI. Originalen skjules, beholdes komplett med masken, og korrigert kopi settes direkte over i ett angresteg. Operasjonen avvises hvis ingen endring, ved låst/skjult lag, inaktiv maske, klippemaske, navngitt gruppe eller full lagkapasitet. Ingen nye prosjektfelter, nettverk eller databaseendringer. Fysisk iPad-ytelse gjenstår.


## Kunstrommet 9.5a – lokalt motivforslag (ikke KI)

Marker et rektangel som inneholder hele motivet med bakgrunn rundt, velg Fargemaske og Foreslå motiv i markert ramme. Inntil åtte dominerende kvantiserte RGB-farger fra rammens ytterkant danner en bakgrunnsmodell. Fireveis utbredelse fra kanten finner tilknyttet bakgrunn; resterende ugjennomsiktige piksler innenfor rammen foreslås som forgrunn. Gjennomsiktig bakgrunn støttes. Forslag sperres hvis under 70 % av omkretsen matcher modellen; tomt valg kan ikke bekreftes. Toleranse regenererer siste motivforslag fra samme ramme, add/subtract og kantjustering kan brukes som før. Modus settes til Behold, slik at området utenfor forslaget skjules ved eksplisitt Lag maske. Ingen endring før bekreftelse. Begrensninger: motiv som berører rammen, lik bakgrunnsfarge, kompleks bakgrunn og hull kan gi feil; manuell etterkontroll er nødvendig. Ikke semantisk objektgjenkjenning, ingen modellvekter, nettverk eller database. Fysisk iPad gjenstår.

## Kunstrommet 9.5b – avgrenset lokal maskebro (utviklingskandidat)

Utviklingsflagget AHA_KUNSTROMMET_LOCAL_MASK_PILOT er avslått som standard. Ingen modell, nettverk eller nytt brukergrensesnitt aktiveres av denne endringen. Kun ved eksplisitt flagg og Fargemaske på synlig, ulåst rasterlag uten eksisterende maske i riktig lokal profil kan begin() gi en kopi av det aktive rasterets RGBA-piksler og laglokale koordinater. Ett engangstoken i minnet; preview avviser utdatert prosjekt, lag, profil, dimensjoner, posisjon, bitmaprevisjon, ugyldig eller tom/full binærmaske. Gjennomsiktige piksler inngår ikke i forslaget. Gyldig forslag bruker eksisterende blå forhåndsvisning, kantjustering, myke kanter og Lag maske. Fargetoleranse kan ikke rekalkulere et rent KI-forslag; manuelle add/subtract kan fortsatt brukes. Ingen lagendring før eksplisitt godkjenning, ett angresteg, originalraster bevares. Test med simulert maskesvar (ikke KI-inferens) dekker avskrudd flagg, engangstoken, ugyldig og utdatert svar, kopi av maske, forhåndsvisning, maske og undo. Faktisk runtimekobling, brukergrensesnitt for punkter, sikkerhetsrevisjon og fysisk iPad gjenstår. Ingen produksjonsaktivering.


### 9.5c – opt-in KI-markering i editor (utkast)
- Separat verktøyknapp, kun ved begge utviklingsflagg `AHA_KUNSTROMMET_LOCAL_MASK_PILOT` og `AHA_KUNSTROMMET_AI_TOOL_PILOT` før editorens oppstart. Ingen standardaktivering.
- Opptil 12 behold/fjern-punkter i aktivt rasterlags koordinater. Eksplisitt Analyser, avbryt/nullstill, deretter eksisterende kantjustering/fjæring og Lag maske. Ingen endring før bekreftelse.
- Dedikert engangsworker på samme origin; kun RGBA fra aktivt lag og punkter, ingen fjernmodell, bilde-URL, backend eller prosjektdata. Worker termineres ved avbrudd, endret kontekst eller timeout.
- Runtime og modellfiler er ikke inkludert i repo eller deploy. En kontrollert lokal testserver må først stage de låste filene fra 9.5b under `tools/kunstrommet-sam-pilot/runtime/` og `tools/kunstrommet-sam-pilot/models/`; ingen automatisk nedlasting fra editoren. Ingen produksjonsaktivering.
- Nettlesertest med simulert worker kontrollerer UI/transport/maske/undo, ikke reell inferens med brukerbilder. Reell editorinferens, visuelle punktmarkører, iPad-ytelse, mobil layout og publiseringsbeslutning gjenstår.

### 9.5d – punktmarkører og reell editorprøve (utkast)
- Grønne plusspunkter/røde minuspunkter i et separat, ikke-eksporterbart visningslag. Markører følger lerretets størrelse og zoom; fjern siste punkt uten å endre bildet. Fargebaserte kontroller skjules i KI-modus.
- Ny isolert editor-smoke med de verifiserte lokale modellfilene og syntetisk bilde. Kjører faktisk worker i Chromium og WebKit, kontrollerer KI-forhåndsvisning, originalbitmap og undo. Ikke fysisk iPad, ikke produksjon eller brukerbilder.

### 9.5e – gjenbruk av KI-bildeanalyse (utkast)
- Én worker, én modell og ett aktivt rasterlag per KI-økt. Første analyse beregner SAM-bildeembedding; nye punkter gjenbruker den via modellens dokumenterte embedding-input. Punktnormalisering og maskeberegning gjentas. Ny pikselkopi sendes ikke ved justeringer.
- Engangs forespørselstoken og sekvensnummer per maskesvar. Worker frigjøres ved kontekstendring, avbrudd, feil, skjult side, maskebekreftelse eller 60 sekunder uten ny analyse. Ingen persistens eller ekstern inferens.
- Utvidet transporttest og reell editor-smoke krever kald/varm kjøring med nøyaktig én encoderkjøring, uendrede originaldata, korrekt maske/undo. Måler begge tider uten ubegrunnet hastighetskrav. Fysisk iPad og produksjonsdistribusjon fortsatt ikke godkjent.

### 9.5f – regresjonsrettelse og gjentatte målinger (utkast)
- 9.5e målt i CI på 640 × 480 syntetisk bilde: Chromium 11 356 ms kald / 512 ms varm; WebKit 14 240 ms kald / 940 ms varm. Én encoderkjøring i begge. Ikke fysisk iPad.
- KI-kontroller og markørbeholder er nå statisk deklarert, skjult som standard; binding og worker-URL opprettes først ved begge opt-in-flagg. Eksisterende DOM-kontrakt beholdes uendret.
- Reell editor-smoke utvidet til fem varme punktjusteringer, med målinger per justering, nøyaktig én worker, uendrede rasterdata og bekreftet worker-avslutning ved maskebekreftelse. Dette er livssyklustest, ikke måling av total WASM-heap eller fysisk enhetsminne.

## 10.0a – samlet verktøyflate (utviklingskandidat)
- Viderefører eksisterende 9.5-verktøy og arbeidsflyter; ingen ny motor eller ny verktøytilstand. Tre direkte tilgjengelige grupper: Tegning (pensel, visk, pipette, gradient), Flytt og marker (flytt, hånd, marker, lasso, fargemaske og skjult KI-pilot), Form og tekst (firkant, ellipse, linje, pil, tekst).
- Alle tidligere ID-er, kontekstavhengige innstillinger og minst 44 px berøringsmål beholdes. Ingen ekstra menytrykk og ingen aktivering av KI. Test på 375/820/1180 CSS-pikslers bredde for grupper, mål, overflow og verktøyskifte.
- Eksisterende bildejusteringer inkluderer lys, kontrast, metning, nivåer, histogram, RGB-kurver og justeringslag. Perspektivhjelp for tegning er ikke fotografisk perspektivkorrigering. Klonestempel/retusjering og fotografisk perspektivkorrigering er senere kandidater, ikke implementert her.
- Fysisk iPad-test og 9.5-pilotens distribusjonsport er separate og uavklarte. Ikke bytt aktiv produksjonskonfig.

## 10.0b – klonestempel (utviklingskandidat)
- Velg kilde med finger/penn/mus, deretter mal på aktivt rasterlag. Kilden følger strøkets forskyvning, ny kilde velges eksplisitt. Størrelse, hardhet og styrke per avtrykk. Råpiksler fra aktivt lag, ikke sammensatt bilde eller justeringslag; eksisterende maske beholdes. Bruk duplisert lag for separat retusjkopi.
- Én midlertidig rasterkopi per strøk, liten avtrykksflate, ingen selvkopiering fra live-preview. Eksisterende markeringsklipp, lagkomposisjon og undo; pointercancel/Escape forkaster strøket. Kildepunkt er visningsdata, ikke eksportert. Ingen KI eller ekstern behandling.
- Test: kildetapp endrer ikke dokumentet, avbrutt strøk er uendret, riktig kopierte farger, andre områder uendret og undo. Fysisk iPad/ytelse ikke testet.

## 10.0c – lokal reparasjonspensel (utviklingskandidat)
- Samme kildevalg, avtrykk og angreflyt som klonestempel, men egen metodevelger i retusjkontrollene. Median av parvise RGB-forskjeller fra to ringer med 24 prøver hver rundt kilde og mål (ikke sentrum). Minst 12 gyldige par; ellers hoppes avtrykket over. Bevarer lokal tekstur relativt til farge-/lysnivå, men er ikke Poisson-healing, frekvensseparasjon eller KI.
- En ekstra RGBA-kopi av aktivt rålag per reparasjonsstrøk (maks 5,76 MB ved 1,44 Mpx), frigjøres ved bekreftelse/avbrudd. Ingen behandling av sammensatt bilde. Bare helt ugjennomsiktige kilde-/målpiksler deltar, så reparasjon fyller ikke transparent område. Eksisterende lagmaske og markeringsklipp beholdes. Ingen angresteg hvis alle avtrykk hoppes over.
- Syntetisk nettlesertest kontrollerer korrigert RGB, bevart tekstur og kilde, transparent mål uten endring og undo. Fysisk iPad, fotografisk kvalitet og ytelse gjenstår.

## 10.0d – fotografisk perspektivkorrigering (utviklingskandidat)
- Fire eksplisitte, normaliserte hjørnepunkter i separat forhåndsvisning av aktivt rålag. Hjørnevelger med automatisk neste hjørne etter trykk, konveksitets- og degenerasjonskontroll. Automatisk anslått sideforhold eller original/1:1/4:3/3:4/16:9. Ikke automatisk motivdeteksjon.
- Invers homografi med premultiplisert bilineær RGBA-interpolasjon. Utsnittet fyller et sentrert rektangel innenfor eksisterende lagdimensjoner; ytre område transparent. Samme projeksjon på eventuell lagmaske; andre lag, eksisterende lagforskyvning og dokumentformat uendret. Forhåndsvisning er rålaget, ikke maskert/justert komposisjon. Maks 320 px forhåndsvisning; full oppløsning bare ved Bruk perspektiv. Angre og avbryt; redigering av annet verktøy eller lag lukker utkastet.
- Syntetisk nettlesertest: kryssende hjørner avvises, gyldig utsnitt, ingen endring før bekreftelse, undo. Fysisk iPad og realistiske fotografier gjenstår.

## 10.0e – skarphet, detaljkontrast og støyreduksjon (utviklingskandidat)
- Tre uavhengige kontroller på aktivt rålag: lokal kantvektet 3×3 støyreduksjon, luminansbasert uskarp maske i liten skala og kontrast i større skala (avstand 4 px). Ingen KI, dekonvolusjon eller rekonstruksjon av tapt detalj. Effektene kan kombineres; skarphet dempes ved høy støyreduksjon.
- Sammenligning før/etter av samme valgbare utsnitt opptil 320×320 kildepiksler; filteret leser fra full original med halo. Visuell størrelse kan begrenses av panelet. Oversiktsbilde for valg av utsnitt. Forhåndsvisning på avsluttet sliderbevegelse; full oppløsning ved eksplisitt bekreftelse. Eksisterende alpha, maske, lagforskyvning, justeringer og andre lag beholdes; angre/avbryt. Dupliser aktivt lag for separat original. Dette er ikke et nytt vedvarende justeringslag.
- Syntetisk nettlesertest for støyimpuls, skarphet, preview/commit-samsvar, nøytrale områder, avbrudd og undo. Fysisk iPad, ytelse og realistiske foto gjenstår.

## 10.0 – samlet ferdigstilling
- #1165–#1169 utgjør fem sammenhengende commits. #1169 retargetes til main og brukes som samlet integrasjonskandidat. Behold underliggende PR-er som historikk frem til samlet merge. Ingen flere funksjoner før verifisering.
- Før retarget er alle fem lokale kontrakttester og Engine-jobber grønne; full browser-regresjon er fortsatt uavklart. Ny separat fokusjobb kjører nøyaktig fem 10.0a–e tester i begge nettleserprosjektene (10 tilfeller). Den erstatter ikke den ordinære fulle regresjonen.
- Ingen publisering/merge før samlet kandidat har grønne aktuelle arbeidsflyter og riktig main-base. Ingen aktivering av KI-pilot. Fysisk iPad, reelle foto og distribusjonsgodkjenning av KI er separate gjenstående kontroller.
