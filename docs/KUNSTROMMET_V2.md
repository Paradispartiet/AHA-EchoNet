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

Et eget lag av typen `adjustment` justerer den synlige komposisjonen under sin plass i lagstabelen, inkludert det hvite papiret. Lysstyrke, kontrast og metning (inkludert svart-hvitt ved 0 %) kan endres uten å skrive til underliggende bitmaps. Opasitet blander effekten med originalkomposisjonen, og lagmaskens alfa avgrenser effekten. Lag over justeringslaget påvirkes ikke. Laget kan skjules, flyttes i lagrekkefølgen, dupliseres, angres og lagres lokalt/JSON. Ingen ny database. Laget har fast dokumentposisjon og kan ikke males direkte på eller transformeres som rasterlag; bruk masken. Eldre prosjektfiler åpnes som før, men eldre appversjoner vil ikke gjengi den nye lagtypen riktig. Fargetemperatur og fysisk iPad-test gjenstår.
