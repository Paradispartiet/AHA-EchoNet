# AHA 1.0 – Eksporter testpakke

## Bruk
Åpne **AHA Chat → Verktøy → Eksporter testpakke** etter at en analyse er ferdig. Dette laster ned en JSON-fil med kildeidentiteten fra akkurat den aktive analysen. Funksjonen krever gyldig kilde-SHA-256 og en analysekjørings-ID. Det er ingen nettverkskall, ingen modellkostnader, ingen auto-kunnskapslagring og ingen serveropplasting. Filen kan inneholde hele artikkelteksten og personopplysninger: kontroller innholdet før du deler den.

## Hva pakken viser
- Original kilde, eksakt SHA-256, run-ID, analyse-ID og source-ID.
- Eksisterende kildebundet eksportflate: svar, faglig analyse, innsikter, begreper, etterarbeid og eventuelt autoritativ AnalysisBundleV2 og projiserte kunnskapsstier.
- Modellenes kandidatopplysninger fra lokal *siste analyse*-cache, inkludert tilgjengelige avvisningsgrunner og runtime-trace **bare hvis** både run-ID, SHA-256 og originaltekst stemmer med aktiv analyse.
- Lagret etterarbeid og arkiverte innsikter/stier **bare ved eksplisitt identitetsmatch**, ikke ved lik artikkeltekst alene. En local SourceEvent krever korrekt source-ID og nøyaktig originaltekst.
- Maskinelle evalueringsdata og en tom menneskelig review-mal; ingen automatisk faglig godkjenning.
- En **coverage**-oversikt over hva som mangler, inkludert historiske modellforsøk som ikke er arkivert.

## Begrensninger
Dette er en eksport av **aktiv analysekjøring**, ikke en fullkopi av brukerprofilen eller databasen. Siste auto-cache overskrives, og det finnes ennå ikke et fullstendig, varig per-forsøk-arkiv for hver modellinteraksjon. Reelle tidligere modellforsøk, tapte mellomresultater, ikke-lagrede kilder eller historiske vurderinger blir aldri fylt inn med gjetninger. En JSON-fil med `coverage.status=partial` er fortsatt nyttig til testing, men ikke et bevis for at AHA har beholdt alt. Innsikter i pakken er ikke vitenskapelig godkjent.

## Test
Kjør `node tests/aha-analysis-test-package-export.test.cjs`. Testen verifiserer hentbar fil, hash- og run-lås, avviste kandidater, slettede/stale objekter, kilde- og run-isolasjon samt synlig knapp i Chat.

Senere steg: eksplisitt, personvernkontrollert lokal arkivering av *alle* faktiske modellforsøk per analyse, hvis fullstendig replay er påkrevd. Ikke bruk den eksisterende auto-cachen som historisk fasit.
