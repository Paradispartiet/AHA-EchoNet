# AHA 1.0 – Innsikt → undersøkelsessti

Status: brukerinitiert lokal funksjon, ikke faglig godkjenning.

Innsiktsarkivet tilbyr **Lag undersøkelsessti** for innsikter med en stabil ID som fortsatt finnes i kammeret. Handlingen benytter eksisterende AHAPaths.createPath og AHAPaths.addStepToPath, uten ny database eller egen sti-motor. Ingen automatisk stiopprettelse.

En sti har tre tydelige steg:

1. **Påstanden:** åpne den konkrete innsikten og skill observasjon fra tolkning.
2. **Kilde og begrensninger:** viser bare et ordrett sitat hvis det faktisk finnes i den tilknyttede lokale kildeteksten. Ellers står det eksplisitt at kildebelegg ikke er verifisert. Eventuelt kjent usikkerhet beholdes.
3. **Neste undersøkelse:** viser innsiktens eksisterende next_test som et ikke-utført forslag, eller ber om en relevant kilde/sammenligning/måling.

Siden oppretter referanser, **ikke godkjente påstander**. Ingen kandidat får økt sannhetsstatus, ingen kanonisk kunnskap opprettes, og alle steg starter som planned. Stien kan åpnes via vanlig paths.html#path-....

Sikkerhetsgrenser: eksplisitt klikk, verifisert aktiv stabil innsikts-ID, avviste/slettede/arkiverte/utdaterte innsikter kan ikke brukes. En aktiv sti gjenbrukes for samme innsikt (ingen dubletter). Om et steg feiler, blir den delvise stien deaktivert. Stier opprettet gjennom denne flyten er alltid local-only, også hvis generell path-DB-sync er konfigurert; de skal ikke overføres automatisk til backend.

Test: node tests/aha-insight-investigation-path-v1.test.cjs. Kontrollerer source-belegg, manglende kilde, deduplisering, avvisning, antall steg og fravær av nettverk/backend-write.

Dette er et produktsteg og må ikke forveksles med vitenskapelig evaluering av AHA-modellens innsiktskvalitet. Den separate manuelle live-rapporten er fortsatt nødvendig.
