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

## Preflight 28.11.2026
- Første pakkekjøring: 38 389 083 byte; største fil 21 596 019 byte (WASM). Ingen filer over 25 MiB. Se https://github.com/EchoNetAHA/AHA-EchoNet/actions/runs/46114325198 . Cloudflare dokumenterer 25 MiB per enkeltfil: https://developers.cloudflare.com/pages/platform/limits/ .
- Lisensindikasjon: den eksakte Xenova-modellrevisjonen er merket Apache-2.0 (https://huggingface.co/Xenova/slimsam-77-uniform/tree/d827ef090922d0c7b96fc6111908fb996ff3d1c1); Transformers.js Apache-2.0 (https://github.com/huggingface/transformers.js/blob/main/LICENSE); ONNX Runtime Web MIT (https://www.npmjs.com/package/onnxruntime-web). Chelsea-foto CC0, Stefan van der Walt (https://scikit-image.org/docs/0.24.x/api/skimage.data.html#skimage.data.chelsea). Før distribusjon må eksakte lisens- og tredjepartsnotiser for den bundlete runtime identifiseres og medfølge; disse lenkene alene er ikke godkjenning.
- Pakken har SHA-256-inventar, fjernet navigasjon og uvirksomme AHA-brokontroller. Ny CI serverer den faktiske output-katalogen med dens CSP og lokale MIME-typer, uten å injisere KI-flagg. Sjekker 5 varme justeringer, reversibel maske og worker-frigjøring i Chromium/WebKit. Ingen deploy.
