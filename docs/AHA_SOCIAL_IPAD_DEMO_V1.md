# Slik prøver du AHA Feed/Insta på iPad

PR #1035 inkluderer en ny **interaktiv, helt lokal** side: `social-demo.html`. Den bruker de faktiske `js/ahaSocialNetwork.js` og `js/ahaSocialMedia.js`, men et innkapslet minnesimulert API. Ingen innlogging, nettverk til social-backend, database eller eksterne publiseringer brukes.

## For brukeren

Åpne `social-demo.html?vis=feed` eller `social-demo.html?vis=insta` på den Vercel-PR-forhåndsvisningen som GitHub viser. (Tilgang kan kreve Vercel-autentisering, og forhåndsvisningsadressen kan endre seg mellom commits.) På iPad:

1. Velg **Feed** eller **Insta**, skriv et kort innlegg / velg et bilde.
2. Huk av publiseringssamtykket, trykk **Publiser**. Demoen simulerer et svar og viser innlegget lokalt.
3. Bytt mellom **Konto A** og **Konto B** og trykk eventuelt Oppdater for å teste synlighet og handlinger.
4. Bruk **Nullstill** eller oppdater fanen for å tømme alle fiktive data. Ingen data beholdes i localStorage eller i en database.

**Viktig:** Dette er ikke en funksjonell live-stagingtest. Testen simulerer både API, JWT og database i én nettleserfane og verifiserer bare frontend. Det er ikke mulig å åpne demoen på en annen enhet og se de samme postene. Publisering til andre brukere krever separat godkjent og opprettet stagingserver. PR-en skal fortsatt stå som utkast og produksjonens kostnadssperre beholdes.

## Sikkerhet

Demoens nettverksadapter avviser alle `fetch`-forespørsler unntatt en eksakt, ikke-eksisterende `https://aha-social-offline-demo.invalid`-adresse og sender aldri en virkelig nettverksforespørsel dit. Den mocker kun to ikke-eksisterende tokenverdier og gir AHA Social-koden vanlige JavaScript-svarobjekter. Bilder holdes som Blob i faneminne. Eksterne bilder og brukerens private AHA-data blir ikke lest automatisk.

Playwright-testen `tests/browser/aha-social-offline-demo.spec.cjs` kjører interaktivt i Chromium og iPad WebKit; den kontrollerer lokal publisering, kontobytte, sletting, bildevisning, reset og at ingen nettverkspakker går til den simulerte social-backenden.
