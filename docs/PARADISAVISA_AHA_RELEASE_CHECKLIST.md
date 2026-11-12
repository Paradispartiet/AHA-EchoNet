# Paradisavisa + Aha – produksjonskontroll før aktivering (12.11.2026)

## Status

- Paradisavisa PR #161 er **draft**. Samkjøring mot `main` ble gjort på feature-grenen med commit `eee206909736f50c2dfc28aaa877c4ac6a2ad9d7` (ikke produksjonsmerge).
- Aha/EchoNet PR #1036 er **draft**, ennå ikke merget eller distribuert.
- Begge bruker eksisterende Aha Supabase Auth: `https://wshmybqyksrwkawqleiz.supabase.co`. Bekreftet i `AHA-EchoNet/js/ahaConfig.js` og `History-Go/js/aha.js` på main, samt History Go sin `js/auth/require-login.js`. Avisen leser den samme delte autentiseringstoken-nøkkelen `sb-wshmybqyksrwkawqleiz-auth-token` kun som tidlig indikator; kontoen må uansett verifiseres med `auth.getUser()`.
- **Ingen migrasjon er kjørt** på den faktiske Supabase-instansen. Ingen skymigrasjon, merge eller produksjonspublisering er utført i denne kontrollen.

## Trinn 1 – tekniske PR-gates

- Kontroller at Paradisavisas siste `main` fortsatt er inkludert som forelder i #161, og at GitHub viser `mergeable: true`. Dersom `main` har flyttet seg: samkjør først, behold nye redaksjonelle tester og bilder.
- Kontroller at GitHub Actions for PR #161 består både full artikkelvalidering og visuell nettleserkontroll (mobil, iPad-størrelse, desktop), samt den separate Aha-bro-regresjonen.
- Kontroller at #1036 har grønne Node-/Engine-/syntakstester, launch gate, nettleserevaluering og PostgreSQL-testen `aha-paradisavisa-rls.yml`.
- Ingen release basert kun på tidligere SHA; alle kontroller må gjelde siste HEAD i hver PR.

## Trinn 2 – sikker migrasjon i riktig Supabase

- Bruk **Aha/History GO-prosjektet** `wshmybqyksrwkawqleiz`, ikke Fysen-prosjektet eller et annet Supabase-prosjekt.
- Kontroller prosjektidentitet med et verifisert prosjekt i Supabase-dashboard, og ta en databasebackup. Ikke legg service_role-nøkkel, DB-passord eller autentiseringstoken i GitHub/frontend.
- Prøvekjør `supabase/legacy-paradisavisa-reading-library-v1.sql` på staging/testmiljø med samme schema, Auth/RLS og databaseversjon. Undersøk om migrasjonen allerede er anvendt før kjøring for å unngå uforutsette overskrivninger.
- Bekreft at tabellen `public.aha_paradisavisa_reading_library` er tom ved første aktivering og at `auth.uid()`-policyer kun tillater `SELECT/INSERT/UPDATE/DELETE` for kontoeieren.
- Etter vellykket staging, godkjen migrasjon separat mot riktig produksjonsprosjekt. Ingen produksjonsmigrasjon uten verifisert konto-/prosjekttilgang.

## Trinn 3 – ekte funksjonstest med to brukere

1. Logg inn med bruker A via e-postlenke og Google på Aha, og kontroller at Paradisavisa viser riktig Aha-konto uten ny registrering.
2. Lagre én avisartikkel manuelt. Kontroller at `trackingEnabled` ikke slås på, og at ingen skytabell skrives uten at brukeren velger «Lagre bibliotek på Aha-kontoen».
3. Last opp og hent skybiblioteket på to forskjellige enheter. Lesbare artikkelmetadata skal bare vises for kontoen som eier dem.
4. Logg ut av Paradisavisa; sjekk samme Supabase-økt i Aha og History GO. Gjenta ved kontobytte fra A til B i samme nettleser.
5. Forsøk B: SELECT, INSERT med A sin `profile_id`, UPDATE og DELETE av A sin rad i faktisk Supabase. Alle krysstilgangsforsøk skal nektes. Test også anonym klient.
6. Kontroller manuell sletting av skybibliotek: skyen skal være tom mens lokal kopi og samtykke er uendret.
7. Test returadresse til avisforside, enkel artikkel og Aha-bibliotek etter login; avvis ekstern URL, encoded backslash og åpent redirect.
8. Test fysisk Safari på iPhone/iPad, inkludert tilbakeknapp, ny fane og nyinnlogging etter utlogging.

## Viktig personvernavgrensning

Eksisterende lokal `aha_paradisavisa_library_v1` ligger fortsatt som klartekst i én nettleserprofil. Den brukergrensesnittbaserte eierkontrollen hindrer vanlig visning og redigering på tvers av Aha-kontoer, men ikke teknisk innsyn i nettleserlagringen på samme enhet. Før bred lansering på delte enheter vurderes kontooppdelte lagringsnøkler og styrt migrasjon; ikke lov kryptografisk isolasjon.

## Lanseringsrekkefølge

- Dokumenter uavhengig gjennomgang og vellykkede staging-/produksjonstester først.
- Merge #1036 og #161 koordinert etter siste grønn CI og avklart PR-konfliktstatus. Kontroller etterpå at begge sider lastes fra GitHub Pages og bruker den validerte auth-callbacken.
- Ikke slå på automatisk skyopplasting, lesesporing, EchoNet-deling eller en ny brukerregistrering. Dette er eksplisitt frivillige funksjoner.
