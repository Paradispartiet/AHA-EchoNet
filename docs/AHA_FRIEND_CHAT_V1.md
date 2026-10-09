# AHA Chat – Snakk med en venn (V1)

Denne funksjonen er en separat menneske-til-menneske-kanal, tilgjengelig fra **AHA Chat → Snakk med en venn**.

## Samtalegrenser

- AHA-AI forblir på `chat.html`; vennemeldinger ligger kun på `friend-chat.html`.
- Vennechat krever innlogget Supabase-bruker og frivillig opprettet, offentlig `@brukernavn`.
- En bruker inviterer et annet brukernavn. Mottakeren må godta før meldinger kan sendes.
- Bare to deltakere kan lese meldinger, håndhevet i Postgres RLS. Ingen e-postadresser vises i vennekatalogen.
- Meldinger sendes **ikke** til OpenAI, Personal AI, Ingest, Chamber, Meta eller History Go.
- Tekstmeldinger lagres i Supabase, ikke i lokal AHA-backup. De er **ikke ende-til-ende-kryptert**.
- En deltaker kan fjerne vennskapet. Da slettes meldingsradene for begge via `ON DELETE CASCADE`. Dette varsles eksplisitt i UI.
- Ved ny melding brukes autorisert Supabase Realtime Postgres Changes. Ved manglende realtime brukes polling hvert 12. sekund mens siden er synlig.

## Aktivering og kontroll

1. Supabase-prosjektet **AHA** (`wshmybqyksrwkawqleiz`) må være aktivt. Per 9. oktober 2026 ble det rapportert `INACTIVE`. Ikke vis V1 som fullt live før databasen svarer.
2. Kjør `supabase/friend-chat.sql` eksplisitt mot riktig, kontrollert Supabase-prosjekt; filen er additiv til det eksisterende `public.aha_profiles`-laget, ikke det inaktive kanoniske `aha.*`-schemaet.
3. Kontroller at SQL/RLS gir: A kan invitere B, B kan godta, A og B kan sende og lese; C får ingen meldinger, kan ikke godta invitasjonen og kan ikke sende meldinger på tråden.
4. Kjør `node tests/aha-friend-chat-contract.test.cjs` og browser-QA på mobil/iPad og desktop med **to ekte testkontoer**. Bekreft fornyet innlogging, toveis meldinger, nettverksbrudd og fjerning.
5. Ikke sett funksjonen som komplett eller godkjent for bred utrulling før database- og flerkontotest er gjennomført.

## Videre funksjoner

Brukerblokkering, varslinger, rapportering og misbruks-/invitasjonsratebegrensninger bør ferdigstilles før åpen sosial utrulling. V1 begrenser invitasjoner til brukere som kjenner et frivillig delt brukernavn. Det finnes ingen automatisk brukerimport eller global e-postsøk.
