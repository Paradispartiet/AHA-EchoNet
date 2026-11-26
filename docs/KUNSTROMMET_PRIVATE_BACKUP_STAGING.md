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
