# AHA Chat – Snakk med en venn (V1)

Denne funksjonen er en separat menneske-til-menneske-kanal, tilgjengelig fra **AHA Chat → Snakk med en venn**.

## Samtalegrenser

- AHA-AI forblir på `chat.html`; vennemeldinger ligger kun på `friend-chat.html`.
- Vennechat krever innlogget Supabase-bruker og frivillig opprettet, offentlig `@brukernavn`.
- En bruker inviterer et annet brukernavn. Mottakeren må godta før meldinger kan sendes. Begge må ha opprettet et frivillig AHA-brukernavn.
- Maksimalt 12 invitasjoner per avsender per UTC-døgn håndheves i databasen; sletting av invitasjonen nullstiller ikke dagskvoten.
- Brukeren kan blokkere en annen bruker. Blokkering hindrer gjensidig lesing og sending i eksisterende tråder samt nye invitasjoner, og kan oppheves fra listen over blokkerte.
- Bare to deltakere kan lese meldinger, håndhevet i Postgres RLS. Ingen e-postadresser vises i vennekatalogen.
- Meldinger sendes **ikke** til OpenAI, Personal AI, Ingest, Chamber, Meta eller History Go.
- Tekstmeldinger lagres i Supabase, ikke i lokal AHA-backup. De er **ikke ende-til-ende-kryptert**.
- En deltaker kan fjerne vennskapet. Da slettes meldingsradene for begge via `ON DELETE CASCADE`. Dette varsles eksplisitt i UI.
- Ved ny melding brukes autorisert Supabase Realtime Postgres Changes. Ved manglende realtime brukes polling hvert 12. sekund mens siden er synlig.

## Aktivering og kontroll

1. Supabase-prosjektet **AHA** (`wshmybqyksrwkawqleiz`) må være aktivt. Per 9. oktober 2026 ble det rapportert `INACTIVE`. Ikke vis V1 som fullt live før databasen svarer.
2. Kjør `supabase/friend-chat.sql` eksplisitt mot riktig, kontrollert Supabase-prosjekt; filen er additiv til det eksisterende `public.aha_profiles`-laget, ikke det inaktive kanoniske `aha.*`-schemaet.
3. Kontroller at SQL/RLS gir: A kan invitere B, B kan godta, A og B kan sende og lese; C får ingen meldinger, kan ikke godta invitasjonen og kan ikke sende meldinger på tråden.
4. Kjør `node tests/aha-friend-chat-contract.test.cjs` og `tests/browser/aha-friend-chat-v1.spec.cjs` i Chromium og iPad WebKit. Staging har bestått en transaksjonell 3-bruker RLS-test inklusive blokkering og kvote, med rollback av alle fixturetabeller.
5. Kontroller live på to ekte innloggede kontoer: meldinger begge veier, innlogging, nettverksbrudd, blokkering/oppheving og fjerning.
6. Utrulling krever aktiv AHA-produksjonsdatabase, deployet SQL og grønne repository- og browser-tester. Full flerkontotest og rapporteringsfunksjon er egne lanseringsforbehold.

## Videre funksjoner

Blokkering og invitasjonskvote er implementert. Varslinger, rapporterings-/modereringflyt og videre tiltak mot automatisert misbruk krever egen produksjon før bred sosial utrulling. V1 begrenser invitasjoner til brukere som kjenner et frivillig delt brukernavn. Det finnes ingen automatisk brukerimport, History Go Social Meet-integrasjon eller global e-postsøk.
