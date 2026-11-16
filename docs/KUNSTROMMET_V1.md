# Kunstrommet V1 – personlig atelier

Status: **utkast til PR, local-only pilot**. Ikke publisert, ikke mobilgodkjent.

## Produktgrense
Kunstrommet er et eget personlig kunstverksted i Aha, **uavhengig av Psykologirommet**. Eksisterende Galleri er uendret, og kan fortsatt lagre visuelle referanser. Kunstrommet er for å **skape** egne bilder, ikke å administrere mediereferanser.

## I denne første versjonen
- Lerret 1200 × 800, tegning med Pointer Events (mus, berøring, pekepenn), penselfarge, hurtigpalett, tykkelse og hvitt viskelær.
- Angre og gjør om (innenfor aktiv arbeidsøkt) med Ctrl/⌘-snarveier, navngiving og frie kunstnernotater.
- Inkrementell visning av penselstrøk for å redusere forsinkelser på nettbrett og beskyttelse mot utilsiktet ekstra pekere.
- Lokal skissebok i IndexedDB med åpne, lagre, slette; per lokal AHA-profilnøkkel, med advarsel før tap av ulagrede endringer.
- Skissebok med **forhåndsvisninger fra eksisterende penselstrøk**, søk i titler og notater, og «Lag kopi». Forhåndsvisningene tegnes midlertidig i nettleseren, ikke som ekstra bildefiler. Kopier får egen ID og ingen arvet Aha-kildeidentitet.
- For rask visning av store arkiv vises inntil 40 av de nyeste treffene om gangen; eldre skisser kan finnes via søket.
- Eksport av PNG og prosjektformatet `aha-kunstrommet-v1` som JSON; import av validerte prosjekter.
- Direkte navigasjon til AHA Home, tankekart og Galleri.
- **Etter eksplisitt brukerhandling** kan et lagret kunstverk legges i en valgt lokal Aha-samling. En separat, lokal og profilavgrenset referanseindeks (`aha_kunstrommet_references_v1`) inneholder bare prosjekt-ID og tittel – **ikke** penselstrøk, piksler, notater eller andre mediedata. Samlingen peker på det faktiske kunstverket i IndexedDB. Koblingen kan trekkes tilbake fra Kunstrommet, uten å slette selve kunstverket.
- Ahas tankekart viser kun kunstverk som er frivillig lagt til som referanser. Kartet viser forbindelsen mellom samling og kunstverk og lenker tilbake til `kunstrommet.html#art-...` for å åpne originalen. Verket er tilgjengelig bare på samme nettleser/enhet/profil.
- **Eksplisitt** handling «Send tekst til Aha» bruker eksisterende AHAIngest til å sende **bare tittel og notat** som lokal kilde/innsikt; ingen piksler, vektorstreker eller bildefiler sendes.

## Viktige begrensninger
- Ateliertegninger er **lokalt lagret i denne nettleseren og på denne enheten**. Innlogging gir ikke automatisk synkronisering eller backup. Tømming av nettleserdata kan slette skissene.
- Profilnøkkelen brukes til lokal partisjonering, ikke sikker autentisering mellom brukere på en delt enhet. Ahas eksisterende samlinger kan være delt mellom lokale profiler i samme nettleser; artverksnoden skjules for andre lokale profilnøkler, men en tidligere lagret samlingsrad kan fortsatt vise tittelen. Bruk derfor ikke denne pilotfunksjonen for spesielt sensitivt materiale på delte enheter.
- Ahas tekstinnsending og referansebro er **to forskjellige handlinger**: førstnevnte sender kun tekst til eksisterende AHAIngest; sistnevnte legger et pekerobjekt til en valgt samling. Det er fortsatt ingen direkte stireferanse, og ingen av handlingene sender tegningen. Kopiering eller søk utløser ingen Aha-innsending.
- Viskelæret legger hvit pensel over streker, og første versjon støtter ikke lag, import av eksterne bildefiler eller kollasj.
- Begrensninger på 3 000 strøk og 2 400 punkter per strøk verner mot ubegrenset minnebruk; overføres ikke automatisk til sky.
- Ingen EchoNet-deling, publisering, database-sync, KI-bildeanalyse eller automatiske API-kall fra selve verkstedet. Samlingskobling blokkeres hvis Lists' databasesynkronisering uttrykkelig er aktivert. «Fjern kunstverkets samlingskoblinger» sletter de lokale samlingsreferansene og referanseindeksen etter bekreftelse, uten å slette skissen eller tidligere separate Aha-tekstinnsendinger. Sletting av skissen rydder også lokale samlingskoblinger så lenge List-synkronisering er av.

## Før eventuell merge/lansering
1. Kjør `node tests/aha-kunstrommet-contract.test.cjs`, `node tests/aha-kunstrommet-interaction.test.cjs`, `node tests/aha-kunstrommet-references.test.cjs`, komplett `npm test` og Playwright for Chromium/iPad WebKit på siste PR-commit.
2. Gjennomfør manuell testing på desktop, Android og **fysisk iPhone/iPad Safari**, inkludert penn/berøring, scroll og zoom.
3. Test IndexedDB-kvoter, sletting av nettleserdata, lagre/åpne, eksport/import på to enheter, avbrutte bevegelser og utilgjengelig lagring.
4. Kontroller at AHAIngest kun kalles etter eksplisitt knappetrykk og at ingen bilde- eller profilopplysninger utilsiktet sendes.
5. Behold Kunstrommet og Psykologirommet i separate moduler, datalag og utviklingsløp.

Neste fase: flere penseltyper, ekte viskelær, inspirasjonsvegg, versjonshistorikk, fullt lokal profilpersonvern for samlinger og direkte stireferanser.
