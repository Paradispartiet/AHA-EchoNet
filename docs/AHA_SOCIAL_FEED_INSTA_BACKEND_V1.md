# AHA Feed og Insta: staging-sosial backend v1

**Status 12. november 2026: PR-kandidat, ikke driftsatt.** Ingen migrasjon, kundedata eller produksjonsinnstillinger endres av denne PR-en.

## Formål

To eksisterende lokale flater får én felles sosial backend i AHA sin eksisterende NestJS/PostgreSQL-arkitektur. Nye poster blir bare offentlige etter en eksplisitt \`publish:true\`-handling. Lokale Feed/Insta-poster og tidligere \`visibility:public\` i localStorage blir ikke publisert automatisk.

## API — alle endepunkter krever verifisert JWT

- \`GET /v1/social/posts?kind=feed|insta&limit=20\`
- \`POST /v1/social/posts\` — \`{kind,text,mediaUrl?,requestKey,publish:true}\`
- \`GET /v1/social/posts/:id/comments\`
- \`DELETE /v1/social/posts/:id\` — bare opphavspersonen
- \`POST /v1/social/posts/:id/like\` — \`{liked:true|false}\`
- \`POST /v1/social/posts/:id/comments\` — \`{text}\`
- \`POST /v1/social/posts/:id/reports\` — \`{reason:"spam"|"abuse"|"privacy"|"other"}\`

## Isolasjon

Ny \`aha_social\`-schema holder sosiale innlegg og interaksjoner adskilt fra privat canonical AHA. RLS er aktiv og uten direkte tabellpolicyer. Avgrensede \`SECURITY DEFINER\`-funksjoner finner innlogget profil fra verifiserte databaseclaims. Ingen nettleser- eller runtime-grants legges til i migrasjonen. Rutinene har eksplisitte sjekker for eierskap, synlighet, profil, kvoter og innholdslengde.

Server er **hardstoppet i production** og krever \`AHA_SOCIAL_STAGING_ENABLED=true\` i ikke-produksjonsmiljø. Medier kan kun vise en eksisterende HTTPS-ressurs fra \`AHA_SOCIAL_MEDIA_ORIGINS\` (kommaseparert origin-allowlist). Ingen bilde-/videoopplasting er implementert.

## Før produksjon

1. Kjør og test migrasjonen separat i staging og gi en dedikert staging runtime bare \`USAGE\` på schema og \`EXECUTE\` på de syv endepunktsfunksjonene — ikke \`require_profile_v1\`, og aldri direkte tabellgrants.
2. Test med **to reelle innloggede profiler**: gjensidig lesing av frivillig publiserte innlegg, nekting av fremmed sletting, like/kommentar, rapportering og kvoter.
3. Utvikle sikker bildeopplasting/storage, modereringskø med faktiske operatørhandlinger, blokkering og tydelig lokal vs delt UI i \`feed.html\` og \`insta.html\`.
4. Test i fysisk iPad Safari, mobil og desktop. Ingen automatisk AI-ingest, synk eller deling av eksisterende lokalt materiale.
5. Undersøk og opphev kostnadssperren **i egen godkjent produksjonsprosess**; nåværende kilde er \`ops/canonical-sync-production-rollout-v1.json\` med \`cost_hold_remote_disabled\`.

Dette er en faktisk serverimplementasjon, men **ikke** en påstand om at Feed/Insta nå er lansert som sosial tjeneste.

## To-profil regresjon i isolert PostgreSQL

`supabase/tests/aha_postgresql_social_rehearsal_v1.sql` kjøres med `aha_runtime_rehearsal` fra den eksisterende PostgreSQL 16-workflowen etter eksplisitte, **kun lokale** funksjonsrettigheter. Konto A publiserer Feed; konto B leser, liker, kommenterer og rapporterer, men kan ikke slette innlegget. Konto B publiserer Insta; konto A leser innlegget. Testen verifiserer også idempotens, at slettede innlegg ikke vises, at direkte tabellwrites nekteres, at interne hjelpefunksjoner ikke kan kalles, at NULL-limit nekteres og at ukjent profil ikke kan lese. Den utfører ingen hosted staging-/production-kall og er ikke en fysisk to-brukertest.

## Moderering i staging

Nye funksjoner `aha_social.moderation_queue_v1(limit)` og `aha_social.moderate_post_v1(postId, action, note)` krever en **egen, manuelt gitt** aktiv rad i `aha_social.moderators`, knyttet til verifisert profil. Ingen bruker kan gi seg selv denne rollen via API-et. Køen viser rapportert innhold med rapportantall og årsaker, ikke identiteten til rapportørene. Beslutningene `hide` og `dismiss` skriver til et separat append-only `aha_social.moderation_events`-register. Dismissed rapport åpnes ikke automatisk på nytt ved identisk rapport fra samme person. Rollen seedes kun i isolert CI-database; **ingen** produksjonsmoderator opprettes.

SQL-regresjon `supabase/tests/aha_postgresql_social_moderation_rehearsal_v1.sql` tester ikke-moderator-avslag, forsøk på selvpromotering, kø, avvisning av rapport, gjenrapportering, skjuling, utilgjengelige skjulte innlegg og forbud mot forfalskede revisjonslogger.

Backend-controller: `GET /v1/social/moderation/reports?limit=20` og `POST /v1/social/moderation/posts/:id/decision` med `{action:"hide"|"dismiss",note}`. Begge krever signert Bearer JWT; databasen krever separat moderatorregistrering. HTTP-testen bruker tre testidentiteter og kontrollert testlagring, ikke produksjonsdata.

## Modereringsgrensesnitt

`social-moderation.html` er et separat stagingpanel som krever eksisterende AHA-innlogging og eksplisitt klientkonfigurasjon (`AHA_SOCIAL_STAGING_ENABLED === true`, godkjent HTTPS `AHA_SOCIAL_API_ORIGIN`). Hver beslutning krever begrunnelse og vises bare for aktive moderatorer fordi API og database utfører uavhengige tilgangskontroller. Siden lenkes **ikke** fra den ordinære produksjonsnavigasjonen. Dette er en demonstrerbar testklient, ikke en driftsatt operatørvakt.

## Begrenset staging-opplasting av bilder

En ny, isolert `aha_social.media`-tabell støtter maksimalt 512 KiB store WebP/PNG-bilder for teknisk to-kontotest. **Ikke produksjonslagring.** Opplastingen er privat til brukeren selv inntil et eksplisitt Insta-innlegg peker på media-ID-en. Lesetilgangen gis bare til eieren eller til innloggede brukere når tilhørende innlegg er publisert og ikke skjult/slettet. `upload_media_v1`, `read_media_v1` og en operatørstyrt `purge_expired_media_v1` er skilt fra eldre private AHA-data. Ubenyttede medieobjekter utløper logisk etter 24 timer og skal slettes ved operatørkjørt opprydding; ingen automatisk produksjonsjobb opprettes.

For offentlig versjon kreves riktig objektlagring, revisjon av EXIF/metadata, kostnads- og kvotekontroll, og full test av filopplasting på iPad.
