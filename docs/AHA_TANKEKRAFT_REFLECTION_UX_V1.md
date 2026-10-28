# Tankekraft – refleksjonsopplevelse V1

## Hensikt
Tankekraft i «Mitt AHA» er en måte å **bruke egne tanker mer bevisst** på, ikke en intelligensmåling.
Aha trenger en reell AI-motor for å fungere som tiltenkt. Tankekraft skal videreføre AI-baserte innsikter. Profilvisningen kan vise lagret materiale og tre spørsmål som forbereder neste AI-analyse, men dette er **ikke** en fullverdig Tankekraft-analyse når AI ikke er tilgjengelig:
1. Hva vet jeg faktisk ut fra materialet?
2. Hvilken annen forklaring kan være mulig?
3. Hva vil jeg undersøke neste gang?

## Datagrunnlag
- Bruk den eksisterende `MetaInsightsEngine` gjennom `AHAProfile.collectAhaMetaProfile()`.
- Vis eksisterende temaer, begreper, mulige koblinger, spenninger og refleksjonsforslag.
- Eksisterende Meta-profil er en lesning og mønsterberegning over lokalt materiale. Den alene er ikke dokumentasjon på at en generativ AI-modell har analysert materialet. Den skal heller ikke beskrives som en vurdering av en persons evner.
- Hvis Meta-data mangler, vis et ærlig tomrom. De tre generelle spørsmålene kan fortsatt vises.

## Språk og tillit
- Skriv «mulig sammenheng» fremfor å erklære en årsak.
- Bruk «arbeidsmønster i materialet», ikke diagnose eller egenskap ved personen.
- Intern beredskapsindikator kan forklares i et teknisk detaljfelt. Den skal ikke brukes som personlig score, rangering eller belønning.
- Hvis brukeren ønsker å undersøke i Chat, skal handlingen være eksplisitt og omtales som spørsmål, ikke som «bekreftelse».

## Ikke innført
Denne PR-en implementerer ikke en ny AI-leverandør, modellkjøring, backend, synk eller automatisk lagring. Dette er en avgrenset visningsendring, ikke et alternativ til AI. Dagens dokumenterte `semantic-document`-endepunkt krever faktisk OpenAI Responses API og feiler lukket ved manglende modell. Det er derfor misvisende å love full Aha-funksjon uten AI eller uten en aktiv modelltilkobling.
Profilen beholder `docs/AHA_PROFILE_BOUNDARY.md` og kan bare lagre eksisterende ventende Chat-prompt etter brukerhandling.

## Kontrollpunkter
- Med data: viser foreløpige mønstre, kildebegrensning og spørsmål fra eksisterende materiale. Ingen nye AI-konklusjoner skal påstås uten modellkjøring.
- Uten data: viser ikke oppdiktede personlighetsmønstre eller resultater.
- Intern score ligger bak detaljkontroll og forklares som **ikke** et mål på intelligens eller sannhet.
- Brukertekst HTML-escapes; visningen skriver ikke til chamber, kildehendelser eller eksterne tjenester.
- Regresjonstest: `tests/aha-tankekraft-reflection-ux-v1.test.cjs`.

## AI er et funksjonskrav

- **Kjernefunksjonene** Chat, nye meningsfulle innsikter og aktiv AI-støttet Tankekraft krever en fungerende AI-kapasitet.
- Et tilgjengelig grensesnitt, visning av lagrede data, deterministisk ekstraksjon og generelle spørsmål er **ikke** en AI-erstatning.
- Ved manglende eller feilende AI må analyseflyten vise en tydelig utilgjengelig-/feilstatus, ikke gi regelbaserte svar merkelappen «AI-analyse».
- En alternativ modell eller leverandør kan vurderes, men skal være reelt integrert, testet og dokumentert før produktet sies å fungere med den.
