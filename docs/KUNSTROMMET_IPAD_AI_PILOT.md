# Kunstrommet 9.5 – kontrollert fysisk iPad-pilot

Bygger på #1162 (deaktivert grunnpilot) og #1163 (editor). Denne preflighten **publiserer ingenting** og inkluderer ikke brukerdata eller AHA-konto.

- Pakker kun editor, CSS, lokal worker, låste modell-/runtimefiler og ett offentlig testfoto. To flagg aktiveres kun i den separate kopien.
- Ingen auth, sync, Galleri-bro, backend, API-tokens eller produksjonskodeendringer. CSP begrenser script, worker og forbindelser til samme origin. Noindex er ikke adgangskontroll.
- Måler samlet størrelse og avviser enkeltfiler over 25 MiB. Modell/runtime må gjennom egen lisens-/distribusjonskontroll før hosting. Ingen artefaktopplasting eller deploy i denne workflowen.
- Før hosting: bruk separat beskyttet preview-origin med verifisert Cloudflare Access, aldri overskriv eksisterende AHA-preview eller produksjon. Verifiser faktisk CSP og MIME for wasm/onnx, og at ingen nettverkskall forlater origin. Ikke koble til konto eller importer private bilder.

## Fysisk prøve i Safari på iPad
1. Åpne den beskyttede pilotadressen. Lagre testfotoet til Filer og importer det.
2. Velg KI-markering, sett grønne punkter i motivet og røde i bakgrunnen. Trykk Analyser. Notér første analysetid.
3. Endre ett punkt og analyser fem ganger. Notér svartid og eventuelle Safari-reloads eller heng.
4. Kontroller zoom/rotasjon, kantjustering, myke kanter, Lag maske og Angre.
5. Bytt lag/prosjekt, avbryt analyse, skjul siden, og kontroller at ny analyse kan startes etterpå. Ikke tøm Safari-data.
6. Registrer iPad-modell, iPadOS-versjon, lerretsdimensjoner og målingene. Ingen påstand om faktisk enhetsminne uten egnet måleverktøy.

Først etter bestått fysisk prøve og separate sikkerhets-/distribusjonskontroller vurderes normal aktivering. GitHub Actions WebKit er ikke fysisk iPad.
