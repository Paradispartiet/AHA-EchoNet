# AHA Feed/Insta: manuell stagingkontroll med to reelle kontoer

Dette er et forberedt testverktøy, ikke en deploy. Det kjører ikke automatisk.

Når en separat, godkjent HTTPS stagingserver og to reelle testkontoer finnes, kan driftsansvarlig sette disse miljøvariablene fra en beskyttet kilde:

- AHA_SOCIAL_STAGING_API_ORIGIN: eksakt staging-HTTPS-origin.
- AHA_SOCIAL_STAGING_EXPECTED_HOST: uavhengig kontrollert vertsnavn.
- AHA_SOCIAL_STAGING_TOKEN_A og AHA_SOCIAL_STAGING_TOKEN_B: to ulike tidsbegrensede JWT-er.
- AHA_SOCIAL_SMOKE_ACK: RUN_SOCIAL_STAGING_2_ACCOUNTS.

Kjør deretter manuelt: node scripts/aha-social-staging-two-account-smoke.mjs

Skriptet nekter produksjonslignende vertsnavn, HTTP, feil ACK og gjenbruk av token. Det oppretter nøyaktig ett syntetisk Feed-innlegg fra konto A, kontrollerer lesetilgang hos konto B, nekter B sletting, sletter innlegget som A og verifiserer at det er borte hos B. Ved feil forsøkes opprydding. JWT, posttekst og responsinnhold loggføres ikke.

Viktig: Dette må gjennomføres først når staging faktisk er etablert og tillatt. Skriptet aktiverer ingen tjeneste, ingen produksjonsfunksjoner og ingen egresskostnadssperre. Bildefunksjon, moderering og fysisk iPad Safari må også testes separat før offentlig lansering.