# Kunstrommet 9.5b – separat SlimSAM-pilot

Status: kildekode og syntetiske kontrakttester; **ikke aktivert i Kunstrommet, ingen reell modellkjøring verifisert**.

Kandidat: Xenova/slimsam-77-uniform, Apache-2.0, revisjon d827ef090922d0c7b96fc6111908fb996ff3d1c1. Referanser:
- https://huggingface.co/Xenova/slimsam-77-uniform
- https://huggingface.co/Xenova/slimsam-77-uniform/tree/main/onnx
- https://huggingface.co/docs/transformers.js/v3.8.1/api/models
- https://onnxruntime.ai/docs/get-started/with-javascript/web.html

Kun kvantiserte encoder og decoder (~13.8 MB samlet, ekskludert runtime, konfig og cache):
- vision_encoder_quantized.onnx SHA256 cce23c7b2e5d4f330932738fb67ba518e04b0d99ccdd1cccd22a7da4e01f2971
- prompt_encoder_mask_decoder_quantized.onnx SHA256 cb90b279f549d2cab7fd6e20c38522438c65d84bdcca3d2a764cff7d857fdce2

Før kjøring: bygg en isolert lokal testdistribusjon, gjennomgå og lås Transformers.js 3.8.1 med lockfil og sikkerhetskontroll. Legg nettleserbundlen og matchende WASM/ESM runtime i runtime/ (worker forventer transformers.js); bekreft faktiske bundlefilnavn. Legg config/preprocessor_config og de to verifiserte ONNX-filene fra låst revisjon under models/Xenova/slimsam-77-uniform/ (onnx/ for vekter). Kontroller alle filer og lisenser, inkludert runtime. Ingen runtime- eller modellfiler er lagt inn i repo nå. Ikke legg private bilder i pilot. Server den isolerte mappen på localhost eller separat beskyttet testorigin, med CSP som også gjelder Worker-responsen: default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self'; ingen tredjepartsforespørsler. Kontroller nettverkslogg; HTML-meta alene beskytter ikke workerens nettverk. Ingen produksjonsdeploy eller service worker.

Kontrakttest: node tools/kunstrommet-sam-pilot/core.test.mjs. Den tester valg av gyldig maskekanal, dimensjonsvern, punkt og IoU på syntetiske tensorer. Dette er ikke en KI-test. Pilotens startknapp kjører faktisk SamModel/AutoProcessor hvis revidert runtime og modellfiler er tilgjengelige. Arbeideren bruker WASM med én tråd; avbryt/timeout terminerer worker. Resultat: modellscore, faktisk IoU mot syntetisk fasit, modellinnlasting og inferenstid. Ingen nettverksfallback. Hvis modellen ikke lastes, vises feil, ikke falsk KI-resultat.

Godkjenningsport: fysisk iPad, 3 gjentatte kjøringer etter kald oppstart, ingen fanecrash eller minnepress, mål tid og enhetens observerbare minne; sammenlign senere på et representativt ikke-privat fotosett med manuell fasit (hår, lav kontrast, flere objekter, komplekse bakgrunner), verifiser maskeformat og koordinater, avbryt, offline etter lokal distribusjon. Før integrasjon må standardverktøyene fortsatt fungere og lokal maskekommit være reversibel. Ingen automatisk aktivering, opplasting, API-nøkler eller betalt inferens.


## Avgrenset faktisk inferenstest (CI)

Ny workflow aha-kunstrommet-sam-pilot.yml kjører syntetiske kontrakter, pakker ut tre filer fra eksakt Transformers.js 3.8.1 npm-pakke uten å installere runtime-avhengigheter eller kjøre lifecycle scripts, henter bare fire filer fra låst offentlig modellrevisjon og verifiserer SHA-256 for begge ONNX-filer. npm-pakkens rapporterte integritet og runtimefilenes SHA-256 logges, men er foreløpig ikke uavhengig forhåndspinnet; gjennomgå disse før eventuell distribusjon. Konfig hentes fra samme immutable revisjon. Isolert localhost-server gir CSP også til Worker. Playwright kjører ekte WASM-inferens i Chromium og WebKit, logger tidsbruk, modellscore, syntetisk IoU, observerte nettverksforespørsler og feil; blokkerer eksterne requests. Foreløpig testgrense IoU >= 0,5 for dette ene motivet, ikke et kvalitetsmål for foto. Ingen artefakt- eller produksjonsopplasting, ingen secrets, ingen ekte brukerbilder. Modellfilene ligger kun i runnerens temp-mappe. Fysisk iPad, runtime-integritet og representativ fotokvalitet er fortsatt egne godkjenningsporter. Lokalt arbeidsmiljø kunne ikke slå opp huggingface.co eller registry.npmjs.org; faktisk kjøring avventes i CI.

CI 27.11: workflowen kom i gang etter retting av runner.temp. Syntetiske tensorkontrakter og npm ci bestod, men Playwright 1.55.0 støtter ikke ubuntu-latest/26.04. Lås runner til ubuntu-24.04, som eksisterende Kunstrommet V2-workflow bruker. Ingen modellfiler ble lastet i den feilede kjøringen. npm ci rapporterte seks sårbarheter (1 moderat, 4 høy, 1 kritisk) i eksisterende testavhengigheter; årsak og runtimeintegritet må undersøkes separat før distribusjon. Ingen audit-fix eller endring av prosjektets lockfil i denne PR-en.

Diagnostikk: worker rapporterer steg (runtime, processor, model, preprocess, inference, postprocess, mask-contract). Feil gir avgrenset feilmelding og siste steg, også ved timeout/workerfeil. Kun syntetisk testmotiv, ingen brukerdata eller eksterne forespørsler. CI beholder IoU-kravet. Faktisk inferens må fortsatt observeres.

CI 27.11: runner, nettlesere, npm-pakke og begge ONNX SHA-256-kontroller bestod. Chromium og WebKit stoppet ved import av transformers.web.js fordi denne varianten har eksterne onnxruntime-common og onnxruntime-web. Offisiell webpack-konfigurasjon for 3.8.1 (https://github.com/huggingface/transformers.js/blob/3.8.1/webpack.config.js) bekrefter at dist/transformers.js er BUNDLE_BUILD med ONNX Runtime inkludert. Piloten bruker derfor den varianten fra samme eksakte npm-tarball. Tarballens SHA-512 er låst til observert verdi fra forrige CI og beregnes på faktiske bytes; de to WASM/ESM-filene sjekkes mot observerte SHA-256. Dette er en reproduksjonskontroll, ikke uavhengig sikkerhetsrevisjon. Ingen CDN-import, endring av modell eller svekking av CSP/IoU-krav. Reell inferens avventes.

### Første faktiske inferens og guidet oppfølging

CI 46073794507 (commit a400386): Chromium 2152 ms innlasting, 9555 ms analyse, IoU 0.253843; WebKit 4614 ms innlasting, 8911 ms analyse, IoU 0.253957. Begge modeller kjørte, null observerte eksterne nettverksforespørsler. Kvalitetskravet 0.5 feilet. Modellscore >1 er rå modellscore, ikke kalibrert sannsynlighet. Hypotese: enkeltpunkt på kontraststripe velger delmotiv. Ny kandidat måler samme motiv med ett klikk og med fem positive/fire negative klikk. Alle tre maskekandidater, areal, samsvar med klikk, modellscore og IoU logges. Masken velges utelukkende ut fra klikk og modellscore, aldri fasit. Ingen senking av IoU-grensen; guidet maske må bestå. To analyser i samme worker, frigjør tensorer mellom analyser; tid per analyse og innlasting separat. Fysisk iPad og representativ fotokvalitet fortsatt utestet.

### Veiledet test bestått og utvidet testsett

CI 46074379640 (f37bc44): Chromium IoU 0.992115, modellinnlasting 1545 ms, guidet analyse 6443 ms; WebKit IoU 0.990697, innlasting 3471 ms, guidet analyse 5966 ms. Ett klikk ga fortsatt 0.253843/0.253957. Alle tre kandidater ble målt, og masken ble valgt uten fasit. Begge nettlesere bestod den faktiske inferenstesten. Testen gjaldt ett syntetisk motiv.

Ny testutvidelse: ring med indre hull, lav kontrast med deterministisk tekstur, og konkurrerende nabomotiv. Fast definerte positive/negative klikk, separat fasit og uendret IoU-minstekrav 0.5 for hvert motiv og hver nettleser. Ingen valg basert på fasit. Modell lastes én gang per worker, tensorer frigis etter hvert motiv; økt total timeout til 240 sek for fem analyser. Kvalitetsresultatene for de tre nye motivene er ikke målt ennå. Syntetisk testsett erstatter ikke foto eller fysisk iPad.

### Utvidet syntetisk test bestått; fotografipilot

CI 46074729807: ring IoU 0.991996/0.992729, lav kontrast 0.948036/0.946276, nabomotiv 0.990808/0.984300 (Chromium/WebKit). Alle fire syntetiske motiver bestod i begge nettlesere. Nye fotofiler hentes fra fast scikit-image-commit e8a42ba85aaf5fd9322ef9ca51bc21063b22fcae og kontrolleres mot prosjektets _registry.py. Chelsea (Stefan van der Walt) og Coffee (Rachel Michetti) er CC0, se https://scikit-image.org/docs/0.25.x/api/skimage.data.html. Kun disse to offentlige bildene er tillatt. Ingen referansemaske tilgjengelig: ett fast sentrumsklikk tester dekoding, dimensjoner, faktisk inferens og maskekontrakt, ikke helmotivs-kvalitet. CI lagrer inntil fire offentlige foto-overlays i kortvarig artefakt for manuell kontroll. Ingen brukerbilder, produksjonsendringer eller IoU-krav på foto uten uavhengig fasit. Syntetiske kvalitetskrav uendret. Fotokjøringen er ikke verifisert ennå.
