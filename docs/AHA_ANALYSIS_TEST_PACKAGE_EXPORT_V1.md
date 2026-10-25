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

## Komplett tilgjengelig testgrunnlag (utvidet eksport, kompatibel v1)
**Eksporter testpakke** inkluderer nå alle tilgjengelige, kilde- og run-bundne data, også felt den vanlige UI-visningen ikke bruker:

- Hele originalteksten, SHA-256, source-ID, analysis-ID, run-ID og full lokal SourceEvent-metadata (kun eksakt kildeidentitet).
- Fullt aktivt kjøringsobjekt, rå auto-cache, rå auto-payload, full autoritativ AnalysisBundleV2 og semantisk dokument fra **samme** kjøring under `full_run_data` og `diagnostics`.
- Fullt bevarte AI-kandidater **uten felt-whitelist**; på nye kjøringer også rå modellkandidater, full modellsyntese, normaliserte kandidater før filter, hele avviste kandidater og kandidater etter filter i `candidate_audit`. Tidligere analyse-cache kan ikke gi disse feltene tilbakevirkende.
- AHA-svar, faglig analyse, begreper, sitater, kildesitatkontroller, kvalitetsgate, feil/blokkeringer, runtime-informasjon, modellidentitet, deploy-advarsler, lister/stier og kildebundet etterarbeid når dette eksisterer.
- Run-bundne arkiverte innsikter og stier; ingen eldre analyser blir importert bare fordi de har samme artikkeltekst.
- `coverage.available` og `coverage.missing` dokumenterer eksplisitt alle relevante mangler. Tekniske data er **ikke** en faglig godkjenning.

## Begrensninger
Dette er en eksport av **den aktive analysekjøringen**, ikke en fullkopi av brukerprofilen eller databasen. Den eksporterer ikke API-nøkler, andre personers materiale, hele chat-/chamber-historikken eller gamle run-objekter uten identitetsmatch. Den oppretter ingen serveropplasting og ingen automatisk AI- eller kunnskapsgodkjenning.

Siste auto-cache overskrives, og det finnes ennå ikke et fullstendig, varig per-forsøk-arkiv for hver modellinteraksjon. Nye kjøringer beholder mer rå modellinformasjon i den eksisterende cachen, men det er fortsatt **ikke** en garantert historisk logg over alle tidligere modellkall. Tapte mellomresultater, ikke-lagrede kilder og historiske vurderinger kan ikke gjenskapes. `coverage.status=partial` betyr at alt tilgjengelig er eksportert, **ikke** at alle data noensinne produsert er bevart.

## Test
Kjør `node tests/aha-analysis-test-package-export.test.cjs`. Testen verifiserer hentbar fil, hash- og run-lås, avviste kandidater, slettede/stale objekter, kilde- og run-isolasjon samt synlig knapp i Chat.

Senere steg: eksplisitt, personvernkontrollert lokal arkivering av *alle* faktiske modellforsøk per analyse, hvis fullstendig replay er påkrevd. Ikke bruk den eksisterende auto-cachen som historisk fasit.

## Kildesitat-kontroll
`candidate_audit.literal_source_quote_checks` dokumenterer om hvert bevart sitat finnes **ordrett** i originalteksten, inkludert start- og sluttposisjoner. Dette er ikke en kontroll av hvorvidt påstanden støttes av sitatet. Manglende eller ikke-gjenfunnet sitat blir tydelig markert.

`candidate_audit.prefilter_rejections` tar med avvisningsgrunner som finnes i runtime-tracen. For nye vellykkede syntesekjøringer bevares også fullstendige avviste kandidatobjekter under `candidate_audit.prefilter_rejected_full_candidates`. Eldre trace med kun tittel og grunn markeres som mangelfull gjennom `coverage.missing`. Ingen historiske modellforsøk oppfinnes i eksporten.

## Vurder testpakker i nettleseren (AHA 1.0)

Etter **Chat → Verktøy → Eksporter testpakke**, trykk **Vurder testpakke**, eller åpne `testpakke.html` direkte. Dette er en mobil-/iPad-tilpasset, lokal gjennomgang, uten konto- eller modellkrav:

1. Velg eksportert JSON-fil. AHA validerer SHA-256 mot hele originalteksten, run-ID og eventuelt autoritativ AnalysisBundleV2-identitet. Endrede/stale filer avvises.
2. Les tilgjengelige kandidatpåstander, begrunnelser, usikkerhet, planlagt etterprøving, prefilter-avvisninger og ordrette sitatsjekker. Sitatene kontrolleres på nytt direkte fra kildeteksten (et ordrett sitat **er ikke** faglig godkjenning).
3. Fyll ut seks vurderingskriterier og egne merknader for hver kandidat. Ingen forhåndsutfylt faglig score eller automatisk godkjenning.
4. Valgfritt: Last inn testpakke 2 fra samme nøyaktige originaltekst med en annen run-ID. Vis sammenlignbare tall; mer/færre sitater eller kandidater er **ikke** bevis på bedre innsiktskvalitet.
5. Trykk **Last ned min faglige vurdering**. Får en separat lokal JSON-fil med vurderinger og sammenligning, uten å duplisere hele originalteksten. Ingen data sendes til server eller legges automatisk i kunnskapsarkivet.

Sidens importerte data og utkast holdes bare i minnet mens siden er åpen. Knappen **Tøm valgte data** rydder visningen. Faglig vurdering av faktisk artikkel og metode krever fortsatt manuell kontroll. Historiske modelldetaljer som mangler i eksporten, kan ikke rekonstrueres av vurderingssiden.

Test: `node tests/aha-test-package-review-ui.test.cjs`. HTML-filen `chat.html` forblir uendret av hensyn til eksisterende produksjonsbevis; lenken opprettes av den eksisterende Chat-verktøymodulen.
