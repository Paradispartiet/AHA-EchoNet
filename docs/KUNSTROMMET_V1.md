# Kunstrommet V1 – personlig atelier

Status: **utkast til PR, local-only pilot**. Ikke publisert, ikke mobilgodkjent.

## Produktgrense
Kunstrommet er et eget personlig kunstverksted i Aha, **uavhengig av Psykologirommet**. Eksisterende Galleri er uendret, og kan fortsatt lagre visuelle referanser. Kunstrommet er for å **skape** egne bilder, ikke å administrere mediereferanser.

## I denne første versjonen
- Lerret 1200 × 800, tegning med Pointer Events (mus, berøring, pekepenn), penselfarge, tykkelse og hvitt viskelær.
- Angre og gjør om (innenfor aktiv arbeidsøkt), navngiving og frie kunstnernotater.
- Lokal skissebok i IndexedDB med åpne, lagre, slette; per lokal AHA-profilnøkkel, med advarsel før tap av ulagrede endringer.
- Eksport av PNG og prosjektformatet `aha-kunstrommet-v1` som JSON; import av validerte prosjekter.
- Direkte navigasjon til AHA Home, tankekart og Galleri.
- **Eksplisitt** handling «Send tekst til Aha» bruker eksisterende AHAIngest til å sende **bare tittel og notat** som lokal kilde/innsikt; ingen piksler, vektorstreker eller bildefiler sendes.

## Viktige begrensninger
- Ateliertegninger er **lokalt lagret i denne nettleseren og på denne enheten**. Innlogging gir ikke automatisk synkronisering eller backup. Tømming av nettleserdata kan slette skissene.
- Profilnøkkelen brukes til lokal partisjonering, ikke sikker autentisering mellom brukere på en delt enhet.
- Aha-tekstinnsendelse er ikke en direkte kobling av selve skissen til eksisterende samlinger/stier. Den krever eget referansearbeid senere.
- Viskelæret legger hvit pensel over streker, og første versjon støtter ikke lag, import av eksterne bildefiler eller kollasj.
- Begrensninger på 3 000 strøk og 2 400 punkter per strøk verner mot ubegrenset minnebruk; overføres ikke automatisk til sky.
- Ingen EchoNet-deling, publisering, database-sync, KI-bildeanalyse eller automatiske API-kall fra selve verkstedet.

## Før eventuell merge/lansering
1. Kjør `node tests/aha-kunstrommet-contract.test.cjs` og komplett `npm test` på PR-commit.
2. Gjennomfør manuell testing på desktop, Android og **fysisk iPhone/iPad Safari**, inkludert penn/berøring, scroll og zoom.
3. Test IndexedDB-kvoter, sletting av nettleserdata, lagre/åpne, eksport/import på to enheter, avbrutte bevegelser og utilgjengelig lagring.
4. Kontroller at AHAIngest kun kalles etter eksplisitt knappetrykk og at ingen bilde- eller profilopplysninger utilsiktet sendes.
5. Behold Kunstrommet og Psykologirommet i separate moduler, datalag og utviklingsløp.

Neste fase: bedre pensler, ekte viskelær, historikk, fargepaletter, inspirasjonsvegg, versjonshistorikk og eksplisitt Aha-objektreferanse til samlinger/stier.
