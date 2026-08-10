# AHA Business Fagverk review v1

Næringsliv er gjennomgått som en separat, ikke-aktiv fagpakke fra History Go-commit `c16a187453d16a40f9cab4ca694c32e96014f31b`.

## Omfang

Reviewpakken dekker:

- 12 kapitler
- 36 modulfiler, nøyaktig tre per kapittel
- 140 registrerte kollisjonstermer: 65 høy-, 51 medium- og 24 lavrisiko
- 60 obligatoriske fagankere
- 60 kapittelspesifikke supplementbelegg
- 12 positive evalueringscaser
- 12 forvekslingscaser
- 12 avståelsescaser
- alle 16 canonical AHA-fixturer

## Beslutningsgrense

Vanlige ord som «arbeid», «marked», «pris», «kunde», «kapital», «teknologi» og «økonomi» kan ikke utløse et Næringsliv-treff.

Rå `title_terms`, `concept_terms` og `support_terms` fra kandidatfilen er reviewkontekst, men er ikke beslutningsgivende. Et kapittel kan bare velges når teksten samtidig har:

1. minst ett eksplisitt Næringsliv-/kapittelanker,
2. minst to godkjente supplementbelegg fra samme kapittel,
3. minimumsscore 7,
4. minst to skårende termer, og
5. tilstrekkelig avstand til andre kvalifiserte kapitler.

Kollisjonsinventaret beholdes i corpus-auditen og bindes inn i policysammendraget, men brukes ikke som motorinput.

## Resultat

- 36 av 36 evalueringscaser består.
- Alle 12 kapitler er dekket.
- 16 av 16 canonical-fixturer avstår korrekt.
- Alle fem reviewporter består før subject approval kan materialiseres.

## Runtimegrense

Godkjenningen gjelder bare reviewartefakter. Næringsliv legges ikke til `history-go-fagverk-release.approved.json`, `history-go-fagverk-release.runtime-active.json` eller Python-runtime i denne endringen.

Aktiv runtime forblir:

- Historie: 23 kapitler
- Natur: 11 kapitler
- Politikk: 13 kapitler
- Totalt: 47 kapitler

En eventuell Næringsliv-aktivering krever en egen pull request med materialisert runtimekorpus, runtimepolicy, Python-regresjon og kryssfaglig kontroll.
