# Kunstrommet V1 – personlig atelier

Status: **utkast til PR, local-only pilot**. Ikke publisert, ikke mobilgodkjent.

## Produktgrense
**Eksisterende Aha Galleri er den eneste samlingen for bilde-, video- og inspirasjonsreferanser.** Kunstrommet er et personlig atelier for å *lage* kunst og holde skisser under arbeid. Det er ikke et nytt Galleri. Psykologirommet er helt uavhengig.

Kunstrommet bruker `AHAGallery.load()` til å vise en liten liste av eksisterende referanser. «Bruk som inspirasjon» kopierer bare referansens tittel og beskrivelse inn i den åpne skissens *ulagrede* notat ved et eksplisitt klikk. Ingen bilder, videoer, nettadresser eller mediefiler kopieres, og det opprettes ingen ekstra Galleri-database. Verk som lages i Kunstrommet legges heller ikke automatisk i Galleriet.

Galleriet kan inneholde eksterne medier som først hentes når du åpner selve Galleriet. Kunstrommet viser bare referansenes tekst og laster ikke inn mediebilder til inspirasjonslisten.

## I denne første versjonen
- Lerret 1200 × 800, tegning med Pointer Events (mus, berøring, pekepenn), penselfarge, hurtigpalett, tykkelse og hvitt viskelær.
- Angre og gjør om (innenfor aktiv arbeidsøkt) med Ctrl/⌘-snarveier, navngiving og frie kunstnernotater.
- Inkrementell visning av penselstrøk for å redusere forsinkelser på nettbrett og beskyttelse mot utilsiktet ekstra pekere.
- Lokal skissebok i IndexedDB med åpne, lagre, slette; per lokal AHA-profilnøkkel, med advarsel før tap av ulagrede endringer.
- Skissebok med **forhåndsvisninger fra eksisterende penselstrøk**, søk i titler og notater, og «Lag kopi». Forhåndsvisningene tegnes midlertidig i nettleseren, ikke som ekstra bildefiler. Kopier får egen ID og ingen arvet Aha-kildeidentitet.
- For rask visning av store arkiv vises inntil 40 av de nyeste treffene om gangen; eldre skisser kan finnes via søket.
- Eksport av PNG og prosjektformatet `aha-kunstrommet-v1` som JSON; import av validerte prosjekter.
- Direkte navigasjon til AHA Home, tankekart og Galleri. Den eksisterende gallerisiden har en egen snarvei tilbake til Kunstrommet.
- **Etter eksplisitt brukerhandling** kan et lagret kunstverk legges i en valgt lokal Aha-samling. Referansen lagres per lokal profil i `aha_kunstrommet_refs_v2_<profil>`, og samlingstilknytningen lagres i Kunstrommets egen profilfiltrerte indeks `aha_kunstrommet_memberships_v1`. Ahas delte `aha_lists_v1` lagrer verken kunstverkstittel eller selve referansen.
- For brukeren vises koblingen som et *virtuelt medlem* i Ahas samlinger og som en read-only kant i tankekartet. Bare verkets prosjekt-ID og tittel brukes lokalt; **ikke** penselstrøk, piksler, notater eller andre mediedata. Lenken åpner originalen i IndexedDB og kan trekkes tilbake uten å slette skissen.
- Tidligere versjons samlingsrader med kunstverk flyttes automatisk til Kunstrommets profilfiltrerte koblingsindeks ved åpning av Ahas samlinger. Gamle, felles referansenøkler migreres til profilspesifikke nøkler og fjernes etter vellykket kopiering.
- Ahas tankekart viser kun kunstverk som er frivillig lagt til som referanser. Kartet viser forbindelsen mellom samling og kunstverk og lenker tilbake til `kunstrommet.html#art-...` for å åpne originalen. Verket er tilgjengelig bare på samme nettleser/enhet/profil.
- **Eksplisitt** handling «Send tekst til Aha» bruker eksisterende AHAIngest til å sende **bare tittel og notat** som lokal kilde/innsikt; ingen piksler, vektorstreker eller bildefiler sendes.

## Viktige begrensninger
- Ateliertegninger er **lokalt lagret i denne nettleseren og på denne enheten**. Innlogging gir ikke automatisk synkronisering eller backup. Tømming av nettleserdata kan slette skissene.
- Profilnøkkelen brukes til lokal filtrering, **ikke sikker autentisering eller kryptering**. Samlingsvisning og tankekart skjuler kunstverk for andre lokale profilnøkler, og kunstverktitler skal ikke lenger ligge i Ahas delte samlingsdata. Men all lokalStorage på samme nettleserprofil kan teknisk leses av kode med tilsvarende tilgang. Ikke bruk løsningen for sensitiv kunst på delte enheter før trygg innloggingsisolasjon er tilgjengelig.
- Ahas tekstinnsending og referansebro er **to forskjellige handlinger**: førstnevnte sender kun tekst til eksisterende AHAIngest; sistnevnte legger et pekerobjekt til en valgt samling. Det er fortsatt ingen direkte stireferanse, og ingen av handlingene sender tegningen. Kopiering eller søk utløser ingen Aha-innsending.
- Viskelæret legger hvit pensel over streker, og første versjon støtter ikke lag, import av eksterne bildefiler eller kollasj.
- Begrensninger på 3 000 strøk og 2 400 punkter per strøk verner mot ubegrenset minnebruk; overføres ikke automatisk til sky.
- Ingen EchoNet-deling, publisering, database-sync, KI-bildeanalyse eller automatiske API-kall fra selve verkstedet. Samlingskobling blokkeres hvis Lists' databasesynkronisering uttrykkelig er aktivert. «Fjern kunstverkets samlingskoblinger» sletter profilens egne medlemskap og kunstverksreferansen etter bekreftelse, uten å slette skissen eller tidligere separate Aha-tekstinnsendinger. Sletting av skissen rydder også lokale kunstverkskoblinger så lenge List-synkronisering er av. Den delte Aha-listen blir ikke skrevet om ved nye kunstverkskoblinger.

## Før eventuell merge/lansering
1. Kjør `node tests/aha-kunstrommet-contract.test.cjs`, `node tests/aha-kunstrommet-interaction.test.cjs`, `node tests/aha-kunstrommet-references.test.cjs`, komplett `npm test` og Playwright for Chromium/iPad WebKit på siste PR-commit.
2. Gjennomfør manuell testing på desktop, Android og **fysisk iPhone/iPad Safari**, inkludert penn/berøring, scroll og zoom.
3. Test IndexedDB-kvoter, sletting av nettleserdata, lagre/åpne, eksport/import på to enheter, avbrutte bevegelser og utilgjengelig lagring.
4. Kontroller at AHAIngest kun kalles etter eksplisitt knappetrykk, at kunstverkstitler/ID ikke skrives til `aha_lists_v1` eller ekstern database, og at gamle felles indekser migreres tapsfritt.
5. Behold Kunstrommet og Psykologirommet i separate moduler, datalag og utviklingsløp.

Neste fase: flere penseltyper, ekte viskelær, inspirasjonsvegg, versjonshistorikk, fullt lokal profilpersonvern for samlinger og direkte stireferanser.
