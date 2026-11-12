# Paradisavisa → Aha: privat kontobibliotek, manuell V1

## Formål og status

Aha og History GO bruker allerede samme Supabase Auth-identitet. PR #1036 har i tillegg nå en **frivillig kontosikkerhetskopi** for lesebiblioteket i Aha, knyttet til nøyaktig `auth.uid()` via PostgreSQL RLS.

**Viktig: Dette er fremdeles kode i draft-PR.** Nettleserkoden og SQL-migrasjonen er lagt til, men migrasjonen er **ikke utført i Supabase**, og funksjonen er derfor **ikke bekreftet aktiv eller tilgjengelig i produksjon**.

Denne implementasjonen gjelder dagens eksisterende `public.aha_profiles` og Supabase Auth-løsning, ikke det separat planlagte canonical `aha.*`-schemaet.

## Valgfrie brukerhandlinger

1. **Logg inn med Aha** i Paradisavisa med den samme kontoen som i History GO.
2. I Aha: «Mine artikler» viser lokalt lesebibliotek uten å laste opp noe.
3. **Lagre bibliotek på Aha-kontoen**: kontroller autentisert bruker med `auth.getUser()`, be om bekreftelse med artikler og datatype, les eksisterende skyversjon, bevar eldre lagringer og temaord, skriv kontoeide metadata i små grupper. Ingen automatisk opplasting.
4. **Hent fra Aha-kontoen**: kontroller samme bruker, hent bare kontoeide rader og importer via den allerede validerte JSON-kontrakten. Lokal automatisk sporing beholdes av og på uendret, og markeringer overskrives ikke ukritisk.
5. **Slett skybiblioteket**: separat bekreftet slettehandling. Lokalt bibliotek blir igjen.

Kun metadata som er nødvendig for et privat lesebibliotek sendes: kanonisk artikkelsti, tittel, ingress, kort utdrag (maks 1100 tegn), kategori, publiseringsdato, leste/lagrede/åpnede tidsstempler, åpningsantall og inntil 12 egendefinerte emneord. Hele publiserte artikler, passord, bildefiler og autentiseringstoken sendes ikke i bibliotekpayload.

## Trygg oppførsel

- `aha_paradisavisa_library_v1` er den lokale datakilden. `trackingEnabled` overføres **aldri** til skyen og kan ikke aktiveres ved import.
- Delte innloggingssesjoner betyr ikke automatisk samtykke til leselogg i skyen.
- `aha_paradisavisa_cloud_owner_v1` låser skyhandlinger på en lokal enhet til kontoen som først tok en sikkerhetskopi. Kontobytte avbryter opplasting og nedlasting i stedet for å blande innhold.
- **Ny personvernsperre:** Når den lokale lesehistorikken har en konto-eier, krever artikkelbiblioteket, Paradisavisas artikkelknapper og Ahas tankekart bekreftet innlogging med denne eieren før de viser eller endrer denne historikken. Utlogging og kontobytte låser igjen visningen. Ueide gjestebiblioteker er fortsatt tilgjengelige uten konto.
- Dette er en **grensesnitt- og skylagringssperre**, ikke kryptert eller komplett profiladskillelse av samme localStorage i delt nettleserprofil. Teknisk kyndige brukere på samme enhet kan fortsatt lese nettleserlagringen. Full adskillelse krever kontooppdelte lokale lagringsnøkler og en kontrollert migrasjon av eksisterende historikk.
- Import beholder brukerens lokale lagringsmarkeringer og endrer ikke samtykke til automatisk lesehistorikk.
- Ved opplasting er sammenslåing additiv: gamle sky-markeringer og temaord beholdes; en utdatert enhet kan ikke slette nyere skydetaljer. Et bevisst valg om å fjerne hele skybiblioteket finnes separat.
- Hvis tabell/RLS ikke er aktivert, eller innlogging ikke kan bekreftes, gjør frontend **ingen** usikre fallback-skrivinger til generelle Aha-tabeller.

## Databasemigrasjon og aktivering

Migrasjon i repo: `supabase/legacy-paradisavisa-reading-library-v1.sql`.

Forutsetninger:
- Riktig Supabase-prosjekt er identisk med Aha/History GO-prosjektet som er konfigurert i `js/ahaConfig.js` og `History-Go/js/aha.js`.
- Kjør migrasjonen kun etter egen databasebackup og kontroll på staging-prosjekt.
- Migrasjonen oppretter `public.aha_paradisavisa_reading_library` med nøkkel `(profile_id, article_id)`, minimerte data og RLS.
- RLS er aktiv og tvunget. Rollen `authenticated` får bare tilgang til rader der `profile_id = auth.uid()`. Anonyme brukere får ingen tabellrettigheter.
- **CI-kontroll:** `aha-paradisavisa-rls.yml` oppretter en tom PostgreSQL 16-database med emulerte Supabase-roller, kjører den nøyaktige SQL-migrasjonen og tester to brukere pluss anonym tilgang. Denne kontrollen er bestått, men erstatter **ikke** ekte Supabase-test før produksjonsaktivering.
- Test minst to **ekte forskjellige Supabase-brukere**: hver ser bare egne rader, A kan ikke lese/endre/slette Bs data; anonym får ingen tilgang.
- Kontroller eksport, nettleserbytte, logg ut, brukerbytte, sletting, nettverksfeil, dobbeltklikk og iPhone/iPad Safari.
- Aktiver etter godkjent CI, databasemigrasjon i riktig prosjekt, og godkjent menneskelig sikkerhetsgjennomgang. Ingen tjeneste/sekret-rolle legges inn i frontend.

## Begrensninger

- Manuell synk krever et eksplisitt klikk hver gang; dette er ikke kontinuerlig bakgrunnssynk.
- Lesehistorikk som aldri er loggført tidligere, kan ikke rekonstrueres.
- Deling av leste artikler i Aha/EchoNet er **ikke** implementert. Biblioteket er privat.
- Ahas fremtidige canonical databaserollout er en separat beslutning.
- PR-ene er fortsatt utkast og må gjennomgås samlet med avisens PR #161.
