# Tankekraft – refleksjonsopplevelse V1

## Hensikt
Tankekraft i «Mitt AHA» er en måte å **bruke egne tanker mer bevisst** på, ikke en intelligensmåling.
Den gir brukeren tre spørsmål som kan brukes uten AI:
1. Hva vet jeg faktisk ut fra materialet?
2. Hvilken annen forklaring kan være mulig?
3. Hva vil jeg undersøke neste gang?

## Datagrunnlag
- Bruk den eksisterende `MetaInsightsEngine` gjennom `AHAProfile.collectAhaMetaProfile()`.
- Vis eksisterende temaer, begreper, mulige koblinger, spenninger og refleksjonsforslag.
- Dette er maskinelle fortolkninger av lokalt materiale, ikke faglig vurderte fakta eller konklusjoner om en persons evner.
- Hvis Meta-data mangler, vis et ærlig tomrom. De tre generelle spørsmålene kan fortsatt vises.

## Språk og tillit
- Skriv «mulig sammenheng» fremfor å erklære en årsak.
- Bruk «arbeidsmønster i materialet», ikke diagnose eller egenskap ved personen.
- Intern beredskapsindikator kan forklares i et teknisk detaljfelt. Den skal ikke brukes som personlig score, rangering eller belønning.
- Hvis brukeren ønsker å undersøke i Chat, skal handlingen være eksplisitt og omtales som spørsmål, ikke som «bekreftelse».

## Ikke innført
Ingen nye analyser, betalte API-kall, backend, synk, automatisk lagring eller bruk av AI-chat-svar som kilde for Meta.
Profilen beholder `docs/AHA_PROFILE_BOUNDARY.md` og kan bare lagre eksisterende ventende Chat-prompt etter brukerhandling.

## Kontrollpunkter
- Med data: viser foreløpige mønstre, kildebegrensning og spørsmål. Brukeren kan følge egne tanker videre uten å åpne Chat.
- Uten data: viser ikke oppdiktede personlighetsmønstre eller resultater.
- Intern score ligger bak detaljkontroll og forklares som **ikke** et mål på intelligens eller sannhet.
- Brukertekst HTML-escapes; visningen skriver ikke til chamber, kildehendelser eller eksterne tjenester.
- Regresjonstest: `tests/aha-tankekraft-reflection-ux-v1.test.cjs`.
