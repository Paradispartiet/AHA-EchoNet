# Verifisering: chamber-sync etter PR #40, #41 og #42

Dato: 2026-05-10
Branch: main

Denne sjekklisten oppsummerer manuell verifisering av SQL + runtime wiring.
Ingen feature-endringer er gjort.

## iPad/Safari testplan
1. Kjør `supabase/chamber.sql` i Supabase SQL Editor (etter `schema.sql` + `policies.sql`).
2. Åpne AHA i Safari på iPad og logg inn.
3. I Chat: send 3-5 meldinger med ulike tema for å trigge ingest.
4. Bekreft i DevTools/console at local chamber er oppdatert:
   - `JSON.parse(localStorage.getItem("aha_insight_chamber_v1"))`
5. Kjør push manuelt:
   - `await AHAChamberSync.push()`
6. I Supabase Table Editor: åpne `aha_insight_chambers` og bekreft:
   - `profile_id` = din bruker
   - `insight_count` > 0
   - `updated_at` nylig oppdatert
7. Åpne appen i ny Safari-tab med samme bruker (eller hard refresh) og bekreft pull:
   - chamber lastes uten tap av insights.
8. Verifiser at Notes/Gallery/Feed/Insta teller aktive poster (soft-deletede skal ikke telles i dashboard).
9. Soft-delete en note/post og bekreft:
   - element forsvinner fra aktiv visning
   - data kan fortsatt eksistere med `deleted_at` i DB
10. Re-kjør `await AHAChamberSync.push()` og bekreft at kall er idempotent (ingen feil, konsistent `insight_count`).
