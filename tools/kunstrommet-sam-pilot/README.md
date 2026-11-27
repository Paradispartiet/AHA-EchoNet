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

Før kjøring: bygg en isolert lokal testdistribusjon, gjennomgå og lås Transformers.js 3.8.1 med lockfil og sikkerhetskontroll. Legg nettleserbundlen og matchende WASM/ESM runtime i runtime/ (worker forventer transformers.web.js); bekreft faktiske bundlefilnavn. Legg config/preprocessor_config og de to verifiserte ONNX-filene fra låst revisjon under models/Xenova/slimsam-77-uniform/ (onnx/ for vekter). Kontroller alle filer og lisenser, inkludert runtime. Ingen runtime- eller modellfiler er lagt inn i repo nå. Ikke legg private bilder i pilot. Server den isolerte mappen på localhost eller separat beskyttet testorigin, med CSP som også gjelder Worker-responsen: default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self'; ingen tredjepartsforespørsler. Kontroller nettverkslogg; HTML-meta alene beskytter ikke workerens nettverk. Ingen produksjonsdeploy eller service worker.

Kontrakttest: node tools/kunstrommet-sam-pilot/core.test.mjs. Den tester valg av gyldig maskekanal, dimensjonsvern, punkt og IoU på syntetiske tensorer. Dette er ikke en KI-test. Pilotens startknapp kjører faktisk SamModel/AutoProcessor hvis revidert runtime og modellfiler er tilgjengelige. Arbeideren bruker WASM med én tråd; avbryt/timeout terminerer worker. Resultat: modellscore, faktisk IoU mot syntetisk fasit, modellinnlasting og inferenstid. Ingen nettverksfallback. Hvis modellen ikke lastes, vises feil, ikke falsk KI-resultat.

Godkjenningsport: fysisk iPad, 3 gjentatte kjøringer etter kald oppstart, ingen fanecrash eller minnepress, mål tid og enhetens observerbare minne; sammenlign senere på et representativt ikke-privat fotosett med manuell fasit (hår, lav kontrast, flere objekter, komplekse bakgrunner), verifiser maskeformat og koordinater, avbryt, offline etter lokal distribusjon. Før integrasjon må standardverktøyene fortsatt fungere og lokal maskekommit være reversibel. Ingen automatisk aktivering, opplasting, API-nøkler eller betalt inferens.
