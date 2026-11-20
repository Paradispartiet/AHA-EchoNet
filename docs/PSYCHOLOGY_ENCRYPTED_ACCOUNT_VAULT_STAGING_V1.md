# Psykologirommet – separat kryptert kontohvelv (staging v1)

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
