# Kontohvelv – kostnadsramme og aktiveringsport

Status 25. november 2026: Den syntetiske produksjonspiloten er bestått (issue #1099). Generell kontolagring er fortsatt avslått. Dette dokumentet er et forslag til driftsramme, ikke en godkjent migrasjon eller endring av abonnement.

## Forslag for gratis drift

Supabase Free oppgir 500 MB databaseplass per prosjekt og 5 GB ordinær egress; se https://supabase.com/pricing og https://supabase.com/docs/guides/platform/billing-on-supabase. Dette er felles ressurser, ikke dedikerte til hvelvet. Automatiske databasebackuper er ikke inkludert i Free. Faktisk plan, region, ledig kapasitet og retensjon må bekreftes av operatør før åpning.

- Behold lokal eksport/gjenoppretting med eksisterende 12 MiB filgrense og uavhengig lokal fil.
- Foreslå maksimalt 512 KiB (524288 byte) per **ny kontokopi** i første ordinære fase, én rad per konto. Ingen automatisk overskriving eller opplasting. Større arkiv kan fortsatt eksporteres lokalt.
- Foreslå samlet logisk filbudsjett 50 MiB (52428800 byte), varsel ved 25 MiB. Tilsvarer maksimalt 100 fullstore filer ved 512 KiB; dette er ikke en garanti for 100 aktive brukere eller fysisk diskforbruk.
- Overvåk hele databasens størrelse, hvelvets tabellstørrelse inkl. TOAST/indeks, samt organisasjonens egress. Reserver kapasitet til resten av AHA. En strengere grense må kunne velges etter faktisk bruk.
- Ved stopp: sperr nye INSERT på serveren, behold eierens SELECT/DELETE. Ikke slett eller avkort eksisterende filer, og ikke endre abonnement automatisk. En klientbryter er ikke en serverkvote.

## Operatørkontroll – kun aggregater (ikke kjørt)

Kjør med autorisert driftsrolle i riktig prosjekt. Ingen identifikatorer, notater, passord eller krypterte filtekster skal returneres. Ikke eksponer denne rapporten til vanlige brukere.

```sql
select pg_database_size(current_database()) as database_bytes,
       pg_total_relation_size('public.aha_psychology_encrypted_backups'::regclass)
         as vault_physical_bytes;
select count(*) as vault_file_count,
       coalesce(sum(octet_length(encrypted_file)), 0) as vault_payload_bytes,
       coalesce(max(octet_length(encrypted_file)), 0) as largest_file_bytes,
       count(*) filter (where octet_length(encrypted_file) > 524288)
         as files_over_proposed_limit
from public.aha_psychology_encrypted_backups;
```

Målingen er et øyeblikksbilde og ikke en kvote. Kontroller egress og abonnement i Dashboard. PostgreSQL fysisk størrelse kan avvike fra logisk sum grunnet blant annet TOAST, indekser, dead tuples og annet databaseoverhead; dashboardets faktiske måling er også nødvendig. WAL og eksterne kopier kan ha egne kapasitets- og retensjonseffekter.

## Obligatorisk før ordinær åpning

1. Mål faktisk kapasitet med rapporten, avklar kostnadsramme og maksimal filstørrelse med driftsansvarlig.
2. Lag separat staging-implementasjon for serverhåndhevet per-fil- og samlet kvote. Ikke stol på en klientkontroll eller uisolert SUM i RLS. Bruk en transaksjonssikker løsning, test samtidige opplastinger, grenseverdier, sletting, rollback og administrativ stopp. Ingen nye privilegerte offentlige RPC-er uten sikkerhetsgjennomgang.
3. Behold eksisterende større kopier lesbare og slettbare; en ny grense skal kun påvirke nye innsettinger. Ikke endre History-Go-eksportformat eller kryptering.
4. Avklar personvern, retensjon, tilgang og beredskap. Gratisplanens manglende automatiske backuper gjør at brukeren alltid bør beholde egen kryptert fil.
5. Dokumenter reell hosted RLS med to ikke-privilegerte testidentiteter og separat produksjonsgodkjenning. Først deretter endre pilot-policy eller generell aktiveringsbryter.

Ingen databaseendring i denne PR-en. Pilotens eksisterende 12 MiB grense forblir uendret inntil verifisert staging-løsning og eksplisitt godkjenning.
