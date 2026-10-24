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

## Kildesitat-kontroll
`candidate_audit.literal_source_quote_checks` dokumenterer om hvert bevart sitat finnes **ordrett** i originalteksten, inkludert start- og sluttposisjoner. Dette er ikke en kontroll av hvorvidt påstanden støttes av sitatet. Manglende eller ikke-gjenfunnet sitat blir tydelig markert.

`candidate_audit.prefilter_rejections` tar med avvisningsgrunnene som finnes i runtime-tracen. Denne tracen lagrer kun tittel og grunn, ikke hele avviste kandidatteksten; `coverage.missing` rapporterer dette eksplisitt. Ingen historiske modellforsøk oppfinnes i eksporten.

## Vurder testpakker i nettleseren (AHA 1.0)

Etter **Chat → Verktøy → Eksporter testpakke**, trykk **Vurder testpakke**, eller åpne `testpakke.html` direkte. Dette er en mobil-/iPad-tilpasset, lokal gjennomgang, uten konto- eller modellkrav:

1. Velg eksportert JSON-fil. AHA validerer SHA-256 mot hele originalteksten, run-ID og eventuelt autoritativ AnalysisBundleV2-identitet. Endrede/stale filer avvises.
2. Les tilgjengelige kandidatpåstander, begrunnelser, usikkerhet, planlagt etterprøving, prefilter-avvisninger og ordrette sitatsjekker. Sitatene kontrolleres på nytt direkte fra kildeteksten (et ordrett sitat **er ikke** faglig godkjenning).
3. Fyll ut seks vurderingskriterier og egne merknader for hver kandidat. Ingen forhåndsutfylt faglig score eller automatisk godkjenning.
4. Valgfritt: Last inn testpakke 2 fra samme nøyaktige originaltekst med en annen run-ID. Vis sammenlignbare tall; mer/færre sitater eller kandidater er **ikke** bevis på bedre innsiktskvalitet.
5. Trykk **Last ned min faglige vurdering**. Får en separat lokal JSON-fil med vurderinger og sammenligning, uten å duplisere hele originalteksten. Ingen data sendes til server eller legges automatisk i kunnskapsarkivet.

Sidens importerte data og utkast holdes bare i minnet mens siden er åpen. Knappen **Tøm valgte data** rydder visningen. Faglig vurdering av faktisk artikkel og metode krever fortsatt manuell kontroll. Historiske modelldetaljer som mangler i eksporten, kan ikke rekonstrueres av vurderingssiden.

Test: `node tests/aha-test-package-review-ui.test.cjs`. HTML-filen `chat.html` forblir uendret av hensyn til eksisterende produksjonsbevis; lenken opprettes av den eksisterende Chat-verktøymodulen.
