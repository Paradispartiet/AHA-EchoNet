# Kunstrommet 8.2 – privat sikkerhetskopi, stagingkandidat

**Ikke aktivert.** Ingen produksjonsendringer, ingen brukerfiler sendt. Uavhengig av UI-PR #1153. Eksisterende IndexedDB og JSON-eksport forblir primær løsning.

## Beslutning

Bruk eksisterende AHA Supabase-konto og AHADb-klient, ikke lokal profil-ID som autorisasjon. Privat Storage-bucket `aha-kunstrommet-private-backups` for fullstendige redigerbare JSON-prosjekter (maks 36 MiB, samme som editorens eksisterende filgrense). Lagringsadresse er auth.uid/projekt-UUID/revisjons-UUID.json. Ingen titler eller notater i stien. Uforanderlige revisjoner, aldri upsert. Privat betyr tilgangsstyrt, ikke ende-til-ende-kryptert; administratorer kan få tilgang til innhold. Ingen AI, Gallery eller canonical sync får innholdet.

Staging-scriptet er ikke en automatisk migrasjon. Eierskap kontrolleres med auth.uid(), anonym innlogging avvises, og upload krever serverstyrt app_metadata. Tidligere pilotbrukere kan hente og slette egne kopier. Restriktive policyer forhindrer at en bred permissiv policy åpner bucketens filer, uten å endre øvrige buckets. RLS, private bucket-innstillinger og faktiske API-grants må kontrolleres i staging. En dedikert PostgreSQL-test bruker syntetiske brukere og modellerer storage.objects, ikke faktisk Supabase HTTP eller filinnhold.

## Neste implementering og aktiveringsporter

1. Manuell «Sikkerhetskopi i skyen», med aktiv konto, bekreftelse, synlig filstørrelse og kostnads-/kvotekontroll. Bruk samme validerte JSON-eksport som editoren; velg en ny revisjons-ID. For store filer brukes avbruddsrobust opplasting (TUS, ingen upsert). Bekreft serverresultat før suksessmelding. Konto-/profilbytte, utlogging og nettverksfeil avbryter; ingen lokal sletting.
2. «Hent sikkerhetskopi» leser bare egne revisjoner, validerer hele prosjektet før åpning, oppretter lokal kopi med egen ID, og erstatter aldri et åpent eller ulagret prosjekt. Bruk eksisterende importvalidering. Privat visning må ikke bruke offentlige URL-er.
3. Test på separat Supabase staging: to vanlige kontoer, anonym/anon, forsøk på forfalsket sti, kopiering/overskriving, revokert pilot, faktisk upload/download/delete, store filer, ugyldig format, kontoendring, kvoter og restfiler. Verifiser at øvrige buckets fungerer uendret. Storage API og SQL-policytest er ulike porter.
4. Før produksjonsaktivering: avklar total kontokvote og kostnad, admin-/slettingsrutiner, dokumentert backup/gjenoppretting, og oppdater ParadisDBs databaseregister med verifisert faktisk plassering, ansvar, kapasitet og aktiveringsstatus. Ingen offentlig bucket, service-role i frontend eller automatisk opplasting. Database-/Storage-endring krever egen aktiveringsbeslutning.
5. Senere synkronisering: uforanderlige revisjoner og konfliktkopier på begge enheter, deretter eksplisitt synkvalg. Ingen automatisk konfliktoverskriving, ingen realtime-dataoverføring under strøk. Lagringskvote, retensjon, opprydding og eventuelt ende-til-ende-kryptering må avklares før utrulling.

Kilder: https://supabase.com/docs/guides/storage/security/access-control og https://supabase.com/docs/guides/storage/uploads/resumable-uploads. Eksisterende AHA-mønster: supabase/psychology-encrypted-vault-pilot.sql (separat datadomene).


## 8.2 – manuelle knapper og transportkandidat

En skjult, avslått pilot i Mine prosjekter tilbyr «Lagre i skyen», «Hent fra skyen» og «Hent som lokal kopi». Den krever både eksplisitt stagingflagg og eksakt preview-origin; ingen SDK lastes eller autentisering/nettverk startes av Kunstrommet ved sideåpning. AHA-klienten må kobles inn i verifisert, separat staging før aktivering. Serverens RLS og app_metadata er den egentlige autorisasjonen. Brukerens verifiserte konto må samsvare med lokal profil; kontoendring kontrolleres før/etter nettverksoperasjoner. En allerede startet opplasting kan ikke garanteres avbrutt; den må derfor aldri omtales som slettet eller ikke lagret uten serverkvittering.

Den første transportpiloten avgrenser filer til 6 MiB (bytekontroll av Blob), uavhengig av bucketens 36 MiB-tak. TUS for større filer gjenstår. Ingen overskriving, ingen offentlig URL eller automatisk overføring. Listen viser inntil 50 prosjektmapper og 50 revisjoner per mappe med ID/dato; meningsfulle private titler, full paginering, samlet kvote og slettefunksjon gjenstår. En hentet fil valideres med editorens format-, dimensjons-, lag- og PNG/maskekontroller og settes inn med IndexedDB add under en ny ID, uten å installere den i åpent lerret. Kopien får ingen thumbnail før ordinær lagring. Ingen referanser til Galleri eller innsiktsmotor opprettes.

Node-test bruker falsk klient og verifiserer sperret flagg/origin, avbrudd, kontobytte, pilotkrav, bytegrense, private stier, insert-only og hentet kopi. Reell Storage HTTP, SDK-innlasting, iPad, kvote/retensjon, avbruddsrobust opplasting, UI og endelig gjenopprettingskontroll må godkjennes før noen aktivering.


## 8.2 – gjenoppretting og foreløpig kvotekontroll

Gjenoppretting kan nå lese filer opptil 36 MiB, uavhengig av at standard opplasting fortsatt er begrenset til 6 MiB. Enheten validerer ett PNG-lag eller maske om gangen og kontrollerer størrelsen på den komplette lokale posten før insert. En ekte nettlesertest av editorens lokale IndexedDB-kopi sjekker avvist korrupt PNG, avvist kontoendring, ny ID, uendret åpent lerret, tittel/notat og gjenåpning med piksler. Ingen Storage-nettverk brukes i denne testen.

En konservativ, **kun veiledende klientkontroll** på 100 MiB per konto er foreslått for piloten: summer rapportert metadata.size for private revisjoner, avvis ny opplasting hvis inventaret ikke kan verifiseres eller overskrider 200 mapper/filer. Dette er ikke en serverkvote, beskytter ikke mot samtidige opplastinger eller direkte API-kall, og må ikke brukes som aktiveringsgrunnlag. Endelig kvote og kostnadsgrense må godkjennes, og serverhåndheving må implementeres før aktivering. TUS-opplasting, full paginering og slettefunksjon gjenstår. Ingen endring i produksjon eller bucket.

Nettleserregresjon: 193/194 bestått på forrige commit; iPad WebKit leste penselpreview før requestAnimationFrame hadde oppdatert forventet piksel. Testen poller nå samme 143–146-krav før avbryt. Dette er en testjustering basert på asynkron rendering; ny CI må bekrefte hypotesen.


## 8.2 – serverreservasjoner og sletting, stagingkandidat

Ny konservativ småfilpilot: 16 reserverbare, unike objektstier per konto, bucketgrense 6 MiB, maks 96 MiB i ferdige objekter. RLS-beskyttet tabell `public.aha_kunstrommet_backup_slots`, unik (user_id,slot) og CHECK 1–16 håndhever antallet også ved samtidige reservasjoner. Restriktiv Storage INSERT krever eksakt reservert sti. Ingen privilegert funksjon eller direkte SQL-mutasjon av storage.objects i appen. Ingen automatisk frigjøring: mislykket upload og sletting kan etterlate reservasjon. Operatør må kontrollere Storage API og pågående uploads før plass frigis. Dette er en stagingmodell, ikke ferdig produksjonskvote; uferdige uploads og faktisk backendforbruk må testes. Kontosletting må rydde Storage og reservasjoner før auth.users slettes. 36 MiB lokal restore beholdes, TUS og fleksibel bytekvote gjenstår.

Bruker kan eksplisitt slette én skyversjon med Storage API remove, kontrollere kvittering og fravær i listen. Lokale filer berøres ikke. Ubekreftet resultat meldes som ubekreftet. RLS- og transporttester utvidet. Ingen aktivering, produksjonsendring eller brukerdata. Dokumentasjon: https://supabase.com/docs/guides/storage/security/access-control.


## 8.2 – isolert TUS-transportkandidat

Ny separat modul (ikke lastet av HTML) for avbruddsrobust overføring av inntil 36 MiB. TUS 1.0, 6 MiB blokker, direkte Storage-host for eksplisitt prosjektref, ingen redirect av autentisering, ingen upsert, én uforanderlig objektsti. En mistet PATCH-kvittering gjenopptas manuelt i samme sesjon med HEAD og serverens offset; et ubekreftet POST, utløpt URL eller ugyldig offset åpner ikke automatisk en ny upload. Kontosjekk ved hver forespørsel; ingen URL, token eller prosjektdata persistert av modulen. Fullført byteoverføring er ikke nok: separat callback må verifisere privat readback av eksakt objekt, konto, størrelse og innholdsdigest. Transporttesten bruker falsk HTTP-server, ikke Supabase. Ingen UI-integrasjon eller produksjonsbruk. Referanse: https://supabase.com/docs/guides/storage/uploads/resumable-uploads.

Serverkvoten på 16 x 6 MiB beholdes foreløpig; store filer må ha egen, transaksjonssikker reservasjon før TUS kobles til. Ikke frigjør reserverte stier bare ved sletting eller timeout: TUS-URL kan være gyldig inntil 24 timer, og sletting alene beviser ikke at pågående uploads er stoppet. Sikker automatisk opprydding krever en verifisert serverprosess med sperring av ny upload, utløps-/revisjonskontroll, avstemming av faktisk Storage-objekt og test mot ekte API. Ikke implementert. Reell TUS, CORS, staging-konto/SDK, iPad og kvotebruk må verifiseres før aktivering.

Forrige RLS-jobb feilet med psql invalid command grunnet duplisert SQL-tekst under innsetting av regex. SQL-filen er rekonstruert med én transaksjon og unike policyer; ny CI må bekrefte resultatet.
