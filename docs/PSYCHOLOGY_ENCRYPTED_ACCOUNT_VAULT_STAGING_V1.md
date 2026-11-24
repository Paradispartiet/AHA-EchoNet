# Psykologirommet – separat kryptert kontohvelv (staging v1)

**Staging-kontroll 21. november 2026:** Supabase-prosjektet `AHA Staging`
(`sstuzwppsheivczyqrim`) er aktivt igjen. Den separate tabellen er
installert der med streng kontroll av de åtte tillatte krypteringsfeltene.
Test direkte mot faktisk PostgreSQL 17.6 med `SET LOCAL ROLE authenticated`
og to midlertidige `auth.uid()`-verdier besto: kun egne rader, ingen
oppdatering eller overskriving, avviste ukrypterte ekstranøkler og anonyme
lesere. Transaksjonen ble rullet tilbake; ingen testbrukere eller filer
ble beholdt. Dette **er ikke** det samme som en full test med ekte JWT
gjennom Supabase Data API og to reelle innlogginger.

**Produksjon:** Prosjektet `AHA` (`wshmybqyksrwkawqleiz`) er
**ikke** endret og kontohvelvet er fortsatt deaktivert med funksjonsbryter
`false`. Ikke flytt staging-testdata eller slå på bryteren som følge av
resultatet alene.

**Status: IKKE AKTIVERT.** AHA-kontoen bruker fortsatt ikke fjernlagring av
Psykologirommets private notater. Denne endringen er en testbar, separat
kryptofillagring, ikke vanlig AHA-sync eller automatisk synkronisering.

## Grunnleggende datagrense

1. History-Go/Psykologirommet produserer **på brukerens eksplisitte valg**
   en JSON-fil kryptert i nettleseren med AES-256-GCM og nøkkel utledet fra et
   selvvalgt passord med PBKDF2-SHA256 (310 000 iterasjoner, tilfeldig salt/IV).
2. AHA kan ved manuelt filvalg kun ta imot denne krypterte JSON-konvolutten:
   `format`, `version`, `kdf`, `iterations`, `cipher`, `salt`, `iv`, `data`.
   AHA dekrypterer aldri filen eller ber om passord.
3. Kryptert fil lagres i en **egen** Supabase-tabell,
   `public.aha_psychology_encrypted_backups` (én rad per autentisert konto),
   uten kobling til AHA-insikter, den kanoniske sync-journalen, AI eller chat.
4. Brukeren laster selv ned den krypterte filen fra AHA på en annen enhet, åpner
   Psykologirommet og gjenoppretter i et **tomt lokalt notatarkiv** med passordet.
   Det er ingen automatisk konto-sync og ingen automatisk sammenslåing.

## Sikkerhetsmodell

- PostgreSQL RLS er aktivert med `FORCE ROW LEVEL SECURITY`.
- Kun `authenticated` får `SELECT`, `INSERT`, `DELETE` for sin egen
  `auth.uid()`. Ingen `UPDATE`-policy eller `UPDATE`-grant.
- Primærnøkkel `user_id` stopper en ny opplasting fra å overskrive eldre backup.
- Manuell sletting er en separat handling med tydelig bekreftelse.
- Anonyme brukere har ingen tabelldatarrettigheter.
- Serveren kan se konto-ID, tid, filstørrelse og kryptert JSON, **ikke lesbare notater**.
  Filformat og klienten kan ikke bevise at ethvert opplastet datasett faktisk
  er kryptografisk sikkert; bruk bare den dokumenterte History-Go-eksporten.
- Historiske private notater i `localStorage` forblir *ukrypterte*.
  Dette oppdraget endrer ikke sikkerheten til lokal lagring.
- Passordet lagres ikke av AHA eller Supabase. Tapt passord betyr at filen
  ikke kan åpnes igjen. Browser/script-integritet og kontoautorisasjon er
  fortsatt kritiske sikkerhetsforutsetninger.
- Slå aldri på kontohvelvet uten å ha kontrollert hosted RLS som egen rolle.
  Lokal PostgreSQL-simulering er en nødvendig test, men ikke tilstrekkelig.

## GitHub-kontroller

- `tests/aha-psychology-encrypted-vault.test.cjs` kjører i eksisterende
  `AHA Node tests`: manuell aktivering, kryptert-konvoluttvalidering,
  ingen bakgrunnskall, egen konto, avvist ukryptert innhold, ingen overskriving
  og eksplisitt sletting.
- `supabase/tests/aha_psychology_encrypted_vault_rls.sql` kjører i
  eksisterende PostgreSQL 16 staging-rehearsal (samme GitHub-workflow):
  to brukeridentiteter, anonyme rettigheter, RLS-select/insert/delete,
  forbud mot UPDATE og duplikatopplasting.
- AHA-syntaks, lanseringsport og øvrige produksjonskontroller.

## Før eventuell produksjonsaktivering

1. Revider filformat og CSP på AHA-domene, Auth-sesjonshåndtering og
   kryptografisk integritet ende til ende.
2. Kjør grønn PostgreSQL 16-RLS-rehearsal. Opprett deretter **separat
   hosted Supabase staging** med migrasjonen
   `supabase/psychology-encrypted-vault.sql`.
3. Verifiser cross-tenant-tester på *hosted* Supabase med to reelle, ikke-
   privilegerte JWT-er, samt nettverksbrudd, duplicate, stor fil og sletting.
4. Prøv manuelt full eksport → opplasting → nedlasting → gjenoppretting på
   desktop og fysisk iPad. Verifiser at ingen privat tekst forekommer i
   nettverksforespørsler, AHA-innsikter eller analyse.
5. Ta eksplisitt beslutning om driftsansvar, lagringskostnad,
   personverninformasjon, sletting og retensjon av databasens sikkerhetskopier.
6. Først etter dette: Sett
   `window.AHA_PSYCHOLOGY_ACCOUNT_VAULT_ENABLED = true` i
   `js/ahaPsychologyVaultConfig.js`. Det er *ikke* en sikkerhetsgrense;
   serverens RLS er sikkerhetsgrensen.
7. Følg publiseringskontrollene og test mot produksjonsoppsettet før du
   kommuniserer funksjonen som tilgjengelig for sluttbrukere.

**Ingen SQL deployes fra en GitHub-PR**, og å merge denne koden aktiverer
ikke kontohvelvet så lenge flagget er `false`.

## Separat AHA-origin: Vercel-prosjekt verifisert 24. november 2026

**IKKE AKTIVER HVELV ELLER VERCEL-INNLOGGING.** Verifikasjon direkte via
den tilkoblede Vercel-kontoen viste at den godkjente teamressursen
`aha-echonets-projects` har prosjektet `aha-echonet`, med registrert
adresse `https://aha-echonet.vercel.app`. Den sist registrerte
produksjonspubliseringen er fra **5. desember 2025 (Oslo-tid)**, commit
`27c8121`, med Git-tilknytning `AHA-EchoNet/AHA-EchoNet`. Dette er ikke
det nåværende utviklingsrepoet `Paradispartiet/AHA-EchoNet`.

**Viktig korreksjon:** Adressen `https://aha-echo-net.vercel.app` som
ble brukt i PR #1101 og de opprinnelige navigasjonslenkene, er **ikke**
registrert på det tilkoblede teamet. Den må ikke allowlistes i Supabase,
brukes som autoritativ AHA-innloggingsadresse eller anbefales til brukere.
Domenets eventuelle eier er ikke fastslått.

PR #1101 innførte en PKCE-sperre og et avslått opt-in-flagg for den
tidligere antatte adressen. Denne er ingen bekreftet ferdig innlogging,
og flagget `AHA_VERCEL_AUTH_CALLBACK_ALLOWLIST_VERIFIED` må **ikke**
slås på basert på tidligere dokumentasjon. Den eksisterende
GitHub Pages-innloggingen er ikke endret. Konto-filbackup er fortsatt
deaktivert med `AHA_PSYCHOLOGY_ACCOUNT_VAULT_ENABLED = false`.

Etter kontrollen ble brukerrettede lenker til den ubekreftede adressen
fjernet i PR #1104. De viser bare veien tilbake til det eksisterende
Psykologirommet i History-Go og manuell kryptert lokal filbackup.
Dette er ikke det samme som en ferdig isolert AHA-origin.

**Før eventuell aktivering:**
1. Bestem hvilken **separat og verifisert** nettadresse som skal være
   AHA sin nye privat-origin, og verifiser at den er knyttet til riktig
   GitHub-repo og nåværende kode. Ikke flytt gammel Vercel-produksjon
   eller kopier databaser uten egen godkjent plan.
2. Konfigurer samme host for app, login og `auth-callback.html`;
   kontroller eksakt tillatt redirect under riktig Supabase Auth-prosjekt.
   Ikke bruk brede wildcards eller den ubekreftede adressen.
3. Verifiser ekte PKCE med to separate testidentiteter, JWT-basert RLS
   i staging, korrekt kryptert filopplasting, nedlasting og gjenoppretting.
4. Kontroller personvern, sletting, drift og fysisk iPad før en separat
   beslutning om produksjonsmigrasjon og aktivering.

Se issue #1099 for utestående infrastruktur og sikkerhetskrav.
