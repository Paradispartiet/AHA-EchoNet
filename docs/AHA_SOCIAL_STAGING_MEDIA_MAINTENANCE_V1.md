# AHA Feed/Insta – operatørstyrt stagingopprydding

**Standardtilstand: bare plan, ingen databaseforbindelse.** Det er ennå ikke godkjent en separat sosial stagingdatabase. Derfor har `ops/social-staging-media-maintenance-v1.json` `stagingProjectRef:null`, `previewAuthorized:false` og `purgeAuthorized:false`.

`node scripts/aha-social-staging-media-maintenance.cjs --plan` viser gjeldende sperre, helt uten nettverk.

Når en *egen* sosial stagingdatabase og kostnader er godkjent, må eksakt prosjektref og driftsrettigheter først festes i policyfilen. Deretter krever `--preview` stagingmiljø, uavhengig prosjektbekreftelse, separat admin-DSN, pin'et TLS-CA med `verify-full` og `AHA_SOCIAL_MAINTENANCE_CONFIRMATION=CHECK_AHA_SOCIAL_STAGE_MEDIA`.

`--preview` returnerer bare aggregerte tall: total lagring og antall/bytes fra ubrukte bilder eldre enn 24 timer og bilder fra eier-slettede innlegg eldre enn 30 dager. Ingen bilder, profildata, JWT, DSN eller databasefeilmeldinger vises.

Faktisk `--purge` krever *i tillegg* `purgeAuthorized:true` og bekreftelsen `RUN_AHA_SOCIAL_STAGE_MEDIA_PURGE`. Den bruker bare eksisterende operator-funksjon `aha_social.purge_expired_media_v1()`. Runtime og nettlesere får aldri tilgang til funksjonen. Dette er ingen tidsplanlagt jobb.

Scriptet nekter bruk av de allerede kjente canonical-staging- og Auth-prosjektene, så de kan ikke brukes som sosial staging. Ingen infrastruktur opprettes, og produksjonssperren forblir på plass. Tester i `tests/aha-social-staging-media-maintenance.test.cjs` verifiserer at default er avslått og at uten riktig policy kan verken lesing eller sletting starte.
