# AHA Feed/Insta – operatørstyrt stagingopprydding

**Standardtilstand: bare plan, ingen databaseforbindelse.** Det er ennå ikke godkjent en separat sosial stagingdatabase. Derfor har `ops/social-staging-media-maintenance-v1.json` `stagingProjectRef:null`, `previewAuthorized:false` og `purgeAuthorized:false`.

`node scripts/aha-social-staging-media-maintenance.cjs --plan` viser gjeldende sperre, helt uten nettverk.

Når en *egen* sosial stagingdatabase og kostnader er godkjent, må eksakt prosjektref og driftsrettigheter først festes i policyfilen. Deretter krever `--preview` stagingmiljø, uavhengig prosjektbekreftelse, separat admin-DSN, pin'et TLS-CA med `verify-full` og `AHA_SOCIAL_MAINTENANCE_CONFIRMATION=CHECK_AHA_SOCIAL_STAGE_MEDIA`.

`--preview` returnerer bare aggregerte tall: total lagring og antall/bytes fra ubrukte bilder eldre enn 24 timer og bilder fra eier-slettede innlegg eldre enn 30 dager. Ingen bilder, profildata, JWT, DSN eller databasefeilmeldinger vises.

Faktisk `--purge` krever *i tillegg* `purgeAuthorized:true` og bekreftelsen `RUN_AHA_SOCIAL_STAGE_MEDIA_PURGE`. Den bruker bare eksisterende operator-funksjon `aha_social.purge_expired_media_v1()`. Runtime og nettlesere får aldri tilgang til funksjonen. Dette er ingen tidsplanlagt jobb.

Scriptet nekter bruk av de allerede kjente canonical-staging- og Auth-prosjektene, så de kan ikke brukes som sosial staging. Ingen infrastruktur opprettes, og produksjonssperren forblir på plass. Tester i `tests/aha-social-staging-media-maintenance.test.cjs` verifiserer at default er avslått og at uten riktig policy kan verken lesing eller sletting starte.

## Ekstra sperre før faktisk sletting

En `--purge` krever nå at operatøren først kjører en egen `--preview` og leser hvor mange bilder og hvor mange bytes som kan fjernes. Ved sletting må **begge** verdiene settes eksplisitt i `AHA_SOCIAL_MAINTENANCE_EXPECTED_PURGE_COUNT` og `AHA_SOCIAL_MAINTENANCE_EXPECTED_PURGE_BYTES`. Verktøyet henter tallene på nytt i lesemodus umiddelbart før sletting. Hvis de er ulike, mangler eller antallet er null, avbrytes handlingen uten å kalle slettefunksjonen. Hvis antallet likevel endres mellom forhåndskontroll og gjennomføring, rapporteres `countChangedDuringPurge` i resultatet for manuell avviksbehandling. Opprett ingen automatisk oppryddingsplan.

## Atomisk slettekontroll

Siste kontroll og sletting kjøres i **én PostgreSQL-transaksjon**. Den låser både `aha_social.posts` og `aha_social.media` mot samtidige endringer, kontrollerer det godkjente antallet og antall bytes på nytt, og kaller først deretter operatørfunksjonen. Ved avvik, lock-timeout eller uventet slettet antall rulles **hele transaksjonen tilbake**. SQL bygges kun fra validerte heltall, aldri fra profilinnhold, tokens eller DSN. Dette er fremdeles ikke en automatisk jobb.

### Virkelig PostgreSQL-test av sletterutinen

`bash scripts/aha-social-media-atomic-purge-rehearsal.sh` kjøres kun mot GitHub Actions' midlertidige PostgreSQL 16-database. Den legger inn ett syntetisk utløpt bilde, forsøker sletting med et feilaktig godkjent antall og kontrollerer rollback. Deretter slettes nøyaktig dette ene bildet under lås med korrekt antall og bytes. Ikke-utløpte vedlegg verifiseres bevart. Scriptet nekter øvrige miljøer før første databasespørring.
