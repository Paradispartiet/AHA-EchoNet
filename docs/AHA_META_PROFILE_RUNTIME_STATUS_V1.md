# AHA Meta Profile Runtime Status V1

## Status

Meta-profilen har en canonical motor i `js/metaInsightsEngine.js`. Problemet som gjorde at Meta-profilen kunne være tom var runtime-wiring, ikke mangel på meta-algoritmer.

Denne statusen dokumenterer feilen og den reparerte grensen.

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

Chat-bootstrap har nå en liten read-only compatibility-delegasjon fra den gamle export-seamen til:

```text
MetaInsightsEngine.buildUserMetaProfile(chamber, "sub_laring")
```

Dette skriver ikke Meta-data til chamberet. Det gjenoppretter bare riktig beregning for export mens runtime-composition-seamen senere kan migreres direkte.

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

Se `AHA_INSIGHT_ENGINE_SEMANTIC_CORE_V1.md` for målarkitekturen.

## AI-agentgrense

AI-chat-svaret skal ikke brukes til å fylle Meta-profilen eller reparere et svakt chamber.

Det kan brukes som QA-referanse i utvikling, men Meta-profilens sannhetsgrunnlag er brukerens canonical AHA-materiale og brukerbekreftet meta-minne.

## Verifikasjon

Regresjonen skal bevise:

1. `profile.html` laster InsightsEngine før MetaInsightsEngine og MetaInsightsEngine før `ahaProfile.js`.
2. Chat-exportens compatibility-seam delegerer Meta-bygging til MetaInsightsEngine.
3. Et ikke-tomt chamber for `sub_laring` gir en ikke-tom `meta_insight`.
4. Provider-laget inneholder ikke den fjernede AI-reply semantic fallbacken.