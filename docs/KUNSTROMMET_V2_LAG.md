# Kunstrommet V2 – lagbasert atelier (første milepæl)

**Status:** Egen *stacked draft PR* over Kunstrommet V1 / PR #1043. Ikke produksjonsklart, ikke en Photoshop-klone, ikke fysisk iPad-testet. V1 skal fortsatt kunne ferdigstilles uten V2.

## Hensikt
Utvikle det personlige Kunstrommet til en lagbasert editor som grunnlag for tegning, maling og senere bilderedigering. **Eksisterende Aha Galleri forblir eneste Galleri** og er ikke kopiert inn i atelieret. Psykologirommet er en separat funksjon.

## Første implementasjon
- Hvert prosjekt har en lagstabel (nederst først), et aktivt lag og penselstrøk som peker på sitt lag med `layerId`.
- Lag kan opprettes (inntil 24), velges, navngis, vises/skjules, låses/låses opp, flyttes opp/ned og gis gjennomsiktighet 0–100 %. Sletting etter bekreftelse fjerner kun det valgte laget og dets strøk; siste lag kan ikke slettes.
- Skjulte, låste og helt gjennomsiktige lag kan ikke tegnes på. Malingen komponeres i lagrekkefølge; delvis gjennomsiktige lag tegnes via separat offscreen-canvas for korrekt *gruppeopasitet*, ikke opasitet per strek.
- Endringer blir først lagret i eksisterende lokal IndexedDB ved manuell «Lagre skisse». Ingen sky, backend, EchoNet eller KI-kall legges til.
- Legacy V1-prosjekter med flate `strokes` får automatisk én lagreferanse i minnet når de åpnes. Gamle originaldata beholdes fram til eksplisitt lagring.
- JSON-eksport av en standard én-lagsskisse beholder `aha-kunstrommet-v1`; et prosjekt med flere lag eller endrede laginnstillinger får **`aha-kunstrommet-v2`** med hele lagstabelen. Begge formater kan importeres med validerte ID-er, penselstrøk og grenser.
- PNG eksporteres som flat, synlig komposisjon. «Lag kopi» bevarer lagene, men overtar ingen Aha-innsendingshistorikk eller delingsstatus.

## Hva denne versjonen **ikke** gjør
- Ingen fotoimport, raster-/pikselmasker, Photoshop PSD-støtte, RAW, fargeprofiler, smarte objekter eller multilevel-redigeringshistorikk ennå.
- «Viskelær» er fortsatt hvit pensel, ikke ekte pikselviskelær med alfa.
- Arbeidsflaten er 1200×800 og maksimal grensestørrelse for antall strøk/punkter er beholdt. Lange økter og store bilder må ytelsestestes på ekte iPad.
- Eksisterende Galleri er fremdeles en separat samling, med bare eksplisitt *tekstbasert* inspirasjonskopi inn i Kunstrommet. Ingen automatisk publisering av kunstverk eller bildeanalyse.

## Kontrollkrav før V2 kan merges til V1-grenen
1. Grønn `npm test` (inkludert V1-regresjon og `aha-kunstrommet-v2-layers.test.cjs`).
2. Grønn Playwright i Chromium og simulert iPad WebKit (`tests/browser/aha-kunstrommet-v2.spec.cjs`).
3. Test V1 JSON-import/-eksport, V2 JSON eksport/import, lagre/åpne, undo/redo, låsing, skjuling, opasitet, omorganisering og sletting.
4. Fysisk iPad Safari/Apple Pencil: berøringsstreker, rekkefølge, lag-UI, høy CPU/minnebruk, tapt fokus, offlinelagring og skjermrotasjon.
5. Ingen skjult/fremmed bildeoverføring, uønskede Aha-dataoverføringer eller endringer i eksisterende Galleri/Psykologirommet.

**Avhengighet:** V2-PR bør først vurderes etter at V1 (#1043) er godkjent eller etter en eksplisitt samkjøring. Ikke squash-/merge V2 direkte i `main` som en snarvei rundt V1-godkjenningen.
