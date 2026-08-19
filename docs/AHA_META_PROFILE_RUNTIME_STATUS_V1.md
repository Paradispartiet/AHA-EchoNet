# AHA Meta Profile Runtime Status V1

## Status

Meta-profilen har en canonical motor i `js/metaInsightsEngine.js`. Problemet som gjorde at Meta-profilen kunne være tom var runtime-wiring, ikke mangel på meta-algoritmer.

Denne statusen dokumenterer både den reparerte runtime-grensen og den gjenværende **semantiske kvalitetsgrensen**.

Viktig:

> En ikke-tom Meta-profil beviser at runtime-wiring virker. Den beviser ikke at Meta-profilen bygger på gode insights.

Se også:

- `AHA_INSIGHT_ENGINE_SEMANTIC_CORE_V1.md`
- `AHA_INSIGHT_ENGINE_REBUILD_PLAN_V2.md`
- `AHA_INSIGHT_ENGINE_EVALUATION_CONTRACT_V1.md`

## Canonical eierskap

```text
js/insightsChamber.js
= canonical insight chamber

js/metaInsightsEngine.js
= canonical meta engine
```

`MetaInsightsEngine.buildUserMetaProfile(chamber, subjectId)` bygger blant annet:

- topics
- global semantic profile
- concepts
- academic profile
- co-occurrence graph
- temporal profile
- tensions
- phrases
- recommendations
- `meta_insight`

Meta-profilen skal leses fra dette laget. `chamber.meta` er ikke en erstatning for den beregnede Meta-profilen.

## Feil 1 — Profil-siden lastet ikke MetaInsightsEngine

`profile.html` lastet `ahaProfile.js`, men ikke:

```text
js/insightsChamber.js
js/metaInsightsEngine.js
```

`ahaProfile.js` forsøker å kalle `global.MetaInsightsEngine.buildUserMetaProfile(...)`, men faller stille tilbake når motoren mangler.

Resultatet var at den rike `fullMeta` / `metaInsight`-delen ikke kunne materialiseres på Profil-siden selv om chamberet hadde innsikter.

### Reparasjon

Profil-siden laster nå i riktig rekkefølge:

```text
insightsChamber.js
→ metaInsightsEngine.js
→ ahaProfile.js
```

## Feil 2 — Chat-eksport spurte feil motor

Chat-export bygger `metaProfile` gjennom `deps.buildMetaProfile(chamber)`.

Runtime-komposisjonen hadde en legacy-seam som spurte `InsightsEngine` etter `buildMetaProfile()`. `InsightsEngine` eier ikke den metoden; den eies av `MetaInsightsEngine` som `buildUserMetaProfile()`.

Når metoden manglet falt eksporten tilbake til:

```text
chamber.meta || {}
```

I et normalt chamber kan `chamber.meta` være tomt selv om `chamber.insights` inneholder mye materiale. Dermed kunne eksporten vise:

```text
Meta-profil: {}
```

### Reparasjon

Provider-laget har nå en liten read-only compatibility-delegasjon fra den gamle export-seamen til:

```text
MetaInsightsEngine.buildUserMetaProfile(chamber, "sub_laring")
```

Dette skriver ikke Meta-data til chamberet og gjør ikke `ahaChat.js` større. Det gjenoppretter bare riktig beregning for export mens runtime-composition-seamen senere kan migreres direkte.

## Viktig skille: tom Meta-profil vs svak Meta-profil

Etter wiring-reparasjonen kan Meta-profilen fortsatt være **svak** hvis chamberet er svakt.

Det er et annet problem.

Dagens meta engine har relativt rike analyser for:

- concept index
- co-occurrence
- temporal development
- tensions
- recommendations

Men den leser canonical insights fra chamberet. Hvis disse innsiktene i hovedsak er tekstutdrag og `concepts` er overflateord, vil Meta-profilen bygge mønstre på dårlig grunnmateriale.

Derfor er riktig rekkefølge:

```text
1. Meta runtime må faktisk være koblet til.
2. Semantic insight core må produsere gode concepts/claims/relations/insights.
3. MetaInsightsEngine kan deretter utnytte disse objektene på tvers av tid.
```

## Nåværende semantiske status

Etter wiring-reparasjonen skal Meta regnes som:

```text
runtime: operational
semantic quality: provisional
```

Årsaken er ikke primært Meta-algoritmen. Kodegjennomgangen viser at chamber-inputen fortsatt kan være svak:

- Insight summary kan falle tilbake til rå source text.
- Concepts kan komme fra små leksikon/endelsesheuristikker og overflateord.
- Claims er ofte tekstsegmenter, ikke normaliserte proposisjoner.
- Patterns og similarity er delvis regel-/leksikalsk basert.
- Concept density måler i dagens motor i stor grad orddiversitet, ikke canonical meaningful concepts.
- Insight saturation kan fortsatt inflateres av antall objects før semantic diversity og synthesis depth er gode nok.

Det betyr at Meta kan produsere en teknisk rik profil over et semantisk svakt chamber.

## Meta etter Semantic Core V2

Meta skal etter ombyggingen bli quality-aware og prioritere:

1. `accepted_synthesized` insights
2. reinforced insights
3. canonical meaningful concepts
4. normaliserte claims/propositions
5. typed relations
6. contradictions/tensions
7. temporal development
8. source diversity
9. brukerbekreftet meta-minne

Legacy og svake objects skal kunne leses, men må nedvektes slik at de ikke blåser opp profilen bare fordi de finnes i stort antall.

Forslått provenance på nye objects:

```text
semantic_version
analyzer_origin
analyzer_version
quality_status
```

Meta skal kunne bruke disse feltene til filtrering/vekting.

## Meta skal ikke analysere én tekst på nytt

Meta-profilens ansvar er cross-time understanding:

```text
Hva går igjen?
Hva er nytt?
Hva endrer seg?
Hvilke begreper binder ulike områder sammen?
Hvilke propositions står i spenning eller konflikt?
Hvor finnes forbindelser brukeren ikke nødvendigvis har sett selv?
```

En enkelt kildeteksts `AHA SER` eller chat-response er ikke Meta-profilen.

## AI-agentgrense

AI-chat-svaret skal ikke brukes til å fylle Meta-profilen eller reparere et svakt chamber.

Det kan brukes som QA-referanse i utvikling, men Meta-profilens sannhetsgrunnlag er brukerens canonical AHA-materiale og brukerbekreftet meta-minne.

Semantic Core kan bruke et **eget source-direct strukturert analysekall**, men det skal bygge semantiske objects fra kilden og ha egen provenance. Det er noe annet enn å bruke det brukerrettede agent-svaret.

## Concept density og insight saturation

Meta og publiseringslogikken skal etter hvert bruke versjonerte V2-metrics:

```text
concept_density_v2
= meaningful canonical concepts, ikke unique word ratio

insight_saturation_v2
= coverage + source diversity + semantic diversity + reinforcement
  + relational coherence + synthesis depth (+ eksplisitt engagement-signal)
```

V1-score skal beholdes som legacy/shadow under kalibrering. V2 skal ikke aktiveres som production gate før golden fixtures er grønne.

## Verifikasjon

### Runtime-wiring

Verifikasjonen samlet skal bevise:

1. `profile.html` laster InsightsEngine før MetaInsightsEngine og MetaInsightsEngine før `ahaProfile.js`.
2. Chat-exportens compatibility-seam delegerer Meta-bygging til MetaInsightsEngine uten å gjøre `ahaChat.js` større.
3. De eksisterende Meta-engine/profile-testene beviser at et chamber med relevant materiale gir en beregnet Meta-profil.
4. Provider-laget inneholder ikke den fjernede AI-reply semantic fallbacken.

### Semantic quality etter V2

Golden sequence-fixtures skal i tillegg bevise at Meta:

1. prioriterer quality-approved semantic objects
2. ikke lar duplicate observations dominere
3. oppdager stabile og nye concepts over tid
4. kan representere endret standpunkt / contradiction når propositions støtter det
5. bruker typed relations når de finnes
6. ikke bygger profil fra AHA-agentens egne svar
7. kan sameksistere med legacy objects uten ukontrollert score-inflasjon

Inntil disse V2-portene er grønne skal Meta beskrives som **runtime-operativ, semantisk foreløpig**.
