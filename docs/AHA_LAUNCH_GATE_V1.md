# AHA launch gate v1

Denne porten låser den kritiske local-first-flyten etter ferdig oppsplitting av AHA Chat.

## Automatisert port

`npm run test:launch-gate` må bestå før merge. Porten kontrollerer samlet:

1. Home → Chat og Home → History Go er tilgjengelige brukerinnganger.
2. Chat laster provider-, capability-, composition- og bootstrapgrensene i produksjonsrekkefølge.
3. Chat-session, minnekontroller og etterarbeid overlever en ny sidekontekst.
4. Samme Chat-melding lagres ikke to ganger.
5. Eksporten er bundet til aktiv `aha_analysis_run_v1`, riktig kildehash og riktig etterarbeid.
6. History Go-import leser ingenting før eksplisitt samtykke.
7. En ekte History Go-fixture gir seks forventede AHA-signaler.
8. Samme payload etter reload gir null nye signaler, null ny importlogg og null writes.
9. History Go-eide nøkler endres ikke.
10. Backend, Sync Hub og EchoNet aktiveres ikke.

Porten består av en samlet reload-/lagringsreise og de eksisterende golden-, analyse-, eksport-, import- og robusthetskontraktene. GitHub Actions viser den som en egen `AHA launch gate v1`-sjekk.

## Reell Safari-enhetsport

Node CI kan kontrollere viewport-, safe-area-, dynamisk viewport- og touchkontraktene, men kan ikke sertifisere en fysisk iPad eller iPhone. Før en offentlig release må følgende utføres på ekte Safari og registreres som release-evidens:

- iPhone stående og liggende
- iPad fullskjerm og Split View
- Home → Chat → send/analyser → reload → eksport
- Home → History Go → samtykke → import → reload → gjentatt import
- tastaturåpning, scrolling, safe-area, 44 px trykkmål og lukking av global navigasjon
- ingen doble meldinger, innsikter eller History Go-signaler etter reload

Denne manuelle enhetsporten er eksplisitt og kan ikke markeres som bestått av en simulert Node- eller Chromium-kjøring.

`safari-release-check.html` gjør porten kjørbar på fysisk enhet. Siden avviser andre iOS-nettlesere, feil enhetsfamilie og feil iPhone-orientering, og krever alle manuelle kontroller samt en eksplisitt bekreftelse på fysisk Safari før en testøkt kan lagres som bestått. Fire separate profiler kreves: iPhone stående, iPhone liggende, iPad fullskjerm og iPad Split View. Evidensen lagres kun i `aha_safari_device_evidence_v1` på den aktuelle enheten og kan eksporteres/importeres som JSON for å samle øktene fra to enheter uten backend. Automatiserte tester låser kontrakten, men kan aldri opprette bestått fysisk evidens.

## Sikkerhetsgrense

Porten aktiverer ikke backend, databasepersist, konto/login, Sync Hub, EchoNet, ekstern publisering, modelltrening, fine-tuning eller History Go-tilbakeskriving.
