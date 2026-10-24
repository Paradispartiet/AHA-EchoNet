# AHA Meet – lokal journal og grense mot sosiale tjenester

Dette dokumentet erstatter den gamle shell-spesifikasjonen: AHA Meet har nå en **fungerende local-only journal**, men det er fortsatt **ikke** en sosial møte-, kalender- eller invitasjonstjeneste.

## I drift som lokal personlig funksjon

- Opprett et notat for møte, besøk eller aktivitet med dato, tittel, notater og læringspunkt.
- Finn notater igjen, rediger, slett og søk uten nettverk.
- Eksporter JSON og importer en slik sikkerhetskopi additivt; eksisterende ID-er overskrives ikke.
- Lokal lagringsnøkkel: `aha_meet_journal_v1`.
- `local_only: true` på hver post, med streng datovalidering og maksimalt 250 notater.
- DOM viser brukertekst via `textContent`, aldri ved å tolke notatene som HTML.
- Dette er personlig møteminne og *personal reflection*, ikke en automatisk kilde for innsiktsmotoren eller modelltrening.

## Inaktive grenser

Det finnes **no backend**, **no EchoNet**, **no Sync Hub**, **no invitation system**, **no calendar integration**, **no social coordination** og **no write-back** til History Go i AHA Meet.

Det finnes heller ingen delte møter, chat, RSVP, offentlig profil, sosial publisering eller automatisk import fra History Go. Disse krever egne backend-, samtykke- og sikkerhetskontrakter. Ikke kall den lokale journalen for et ferdig sosialt møteprodukt.

## Relation to History Go

History Go is the separate place-based arena. AHA Meet **must not write back** to History Go storage or modify:

- `visited_places`
- `hg_learning_log_v1`
- `knowledge_universe`
- `trivia_universe`
- `aha_import_payload_v1`

AHA Meet reads none of these keys automatically. Ingen eksterne kilde- eller møtedata importeres uten eksplisitt fremtidig kontrakt.

## Relation to Groups and AHAavisa

AHA Meet is separate from Groups, and does not publish to AHAavisa. Shared workspace permissions are not implied by a private meeting note.

## Release criteria

- Node: CRUD, validering, dublettsikker import/eksport, ugyldige data, local-only og ingen nettverkskall.
- Chromium og iPad WebKit: opprett, gjenåpne, rediger, søk, slett, gjenopprett JSON, liten mobilskjerm og trygg visning av HTML-lignende tekst.
- Registry, modenhetsmatrise og release-snapshot må samsvare.
- Ekstern deling, invitasjoner, kalender, backend, EchoNet, sync og History Go write-back forblir utilgjengelige.
