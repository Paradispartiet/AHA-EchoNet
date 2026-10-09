# AHA Chat: History Go Social Meet etter aksept (2026-10-09)

## Formål

En serververifisert akseptert eller gjennomført Spotmeeting-invitasjon i History Go kan åpne **en privat AHA-samtale**. Dette gjør ikke partene automatisk til AHA-venner, og sender ingen History Go-besøksdata til AHA. Før kontakt kan brukere ikke skrive fritt til fremmede.

## Datalag / deploy

AHA bruker dagens Supabase `public.aha_friend_requests` + `public.aha_friend_messages`. Nye request-rader med `source='social_meet'` kan bare opprettes av `public.aha_open_social_meet_chat(meet_invite_id)` etter sjekk av ekte `hg_spotmeeting_invites`, partenes JWT-identiteter, gyldig status, HG/AHA-blokkering og HG-moderering.

Invitasjonskvoten på 12/døgn gjelder fortsatt kun ordinære AHA-venneinvitasjoner, ikke serververifisert åpning av et eksisterende møte.

Kjør **kun** `supabase/social-meet-direct-chat.sql` mot den aktive AHA-produksjonsdatabasen **etter** `supabase/friend-chat.sql` og History Go sine eksisterende canonical Social Meet-tabeller. Ikke legg migrasjonen inn i `supabase/migrations/`, fordi den mappen eies av det separate `aha.*` canonical rehearsal-løpet og ikke inneholder de eldre tabellene.

## Produktflyt

- History Go Social Meet viser **Privat chat** bare på aksepterte/fullførte invitasjoner fra ekte `fastapi`-backend, ikke local/fallback.
- History Go viser AHA Chat i eget panel, med `?embed=1&meetInviteId=<uuid>`; kun invitasjons-ID deles. RPC verifiserer partene, ikke klientens påstand.
- Begge bruker samme autentiserte Supabase-prosjekt og må ha AHA-profil.
- I AHA står disse under **Kontakter fra Social Meet**, ikke **Venner**.
- **Bli venner** er en ny ordinær AHA-invitasjon med mottakeraksept.
- Meldings-RLS verifiserer gyldig møtestatus ved hvert kall. Kansellert, rapportert, blokkert eller utløpt inviteringsgrunnlag stenger chatten, også etter at den ble opprettet. Gjennomført møte gir videre samtalekontakt.
- **Rapporter** lagrer kun strukturert grunn i `aha_friend_private.chat_reports`. Rapporten er privat og gir ikke tilgang for den andre parten. **Blokker** fungerer separat.
- Meldinger analyseres ikke automatisk av AHA-AI og er ikke ende-til-ende-kryptert.

## Test- og utrullingsporter

Isolert staging-transaksjon med tre brukere er bestått: kun partene kunne åpne og lese, fremmede ble avvist, blokkering i HG stengte innsyn. Hele fixture-skjemaet ble rullet tilbake. AHA full CI og History Go sin målrettede test/CI må være grønne; AHA migrasjon/deploy skal skje før History Go merge.

**Ikke oppgi at reelle brukersamtaler er gjennomspilt før to separate innloggede kontoer faktisk er testet.** Denne testporten er fortsatt åpen. Rapporteringslager er etablert, men operativ moderator-dashboard/review-workflow er en egen oppgave før storskala offentlig sosial utrulling.
