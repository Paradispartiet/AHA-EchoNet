# AHA Insight Engine Code Audit — 2026-08-19

## Formål

Dette dokumentet beskriver **hva som faktisk finnes i repoet nå**, slik at Semantic Core-ombyggingen starter fra riktige seams og ikke bygger parallelle systemer.

Det normative målet ligger i `AHA_INSIGHT_ENGINE_REBUILD_PLAN_V2.md`.

---

## 1. `js/insightsChamber.js` — behold canonical lifecycle

### Behold

- `createSignalFromMessage(...)`
- chamber lifecycle
- create / reinforce / merge suggestion
- source provenance
- topic stats som offentlig seam
- persistence-kontrakten

### Bygg om / deprecate internt

- source-text fallback som Insight summary
- hovedbruk av små leksikon og suffix-regler for concepts
- fragmentbaserte claims
- hardkodede pattern-regler som om de var generell semantikk
- lexical/token concept density som produktmetrisk fasit
- count-dominert saturation
- similarity som ikke tydelig skiller equivalence og resonance

### Hovedrisiko

Hvis `candidate_summary` mangler kan rå `signal.text` bli Insight summary. Dette gjør det mulig å lagre SourceEvent-innhold som om det var en ferdig insight.

---

## 2. `js/ahaChatInsightPipeline.js` — riktig orchestration seam

### Viktig eksisterende funksjon

`generateAIInsightCandidates(text, context)` sender source text direkte til:

```text
/api/aha-agent/insight-candidates
```

med strukturert kandidatformat.

Dette er konseptuelt riktig fordi analysekallet er separat fra brukerens chat-response.

### Problem

Den deterministiske `buildSemanticInsightCandidates(...)`-fallbacken grupperer kildesetninger etter enkle tema-/regexsignaler. Den kan derfor produsere sentence repackaging i stedet for syntese.

### Fremtidig rolle

Modulen bør bli orchestration-laget for:

```text
SourceEvent
→ SemanticDocument request/fallback
→ validation
→ candidate quality gate
→ chamber
```

---

## 3. `/api/aha-agent/insight-candidates` — klientseam finnes, server må avklares

Kodegjennomgangen fant en tydelig klientkontrakt for source-direct candidate analysis, men fant ikke en autoritativ implementasjon av dette endepunktet i den tilgjengelige repo-backenden.

Før Semantic Core kobles på production må vi derfor:

1. identifisere hvor endepunktet faktisk hostes, eller
2. implementere det i canonical backend, og
3. versjonere response-schemaet.

Ingen dokumentasjon skal late som denne serverimplementasjonen allerede er canonical bare fordi klienten har en URL-path.

---

## 4. `backend/aha_engine` — deterministic support, ikke full semantic brain

Dagens Python-engine er FastAPI/Pydantic-basert og analyzer-laget er i hovedsak rule/template-driven.

Riktig rolle i V2:

- deterministic fallback
- contract validation
- regression testing
- enkel source classification

Hvis Python-engine senere skal eie SemanticDocument-generering må den få en reell semantic model/provider-seam eller tilsvarende semantisk kapasitet.

---

## 5. `js/ahaEmbeddings.js` — behold som ekte semantic similarity layer

Eksisterende modul:

- bruker `/api/aha-agent/embed`
- bruker multilingual embedding provider
- lagrer embeddings i `aha_insight_embeddings`
- støtter `findSimilarToText` og `findSimilarToInsight`
- bygger embedding-input fra flere Insight-felt

Dette skal gjenbrukes etter at canonical objects blir bedre.

### Regel

Embedding similarity er evidens for semantic proximity, ikke automatisk bevis for equivalence.

---

## 6. `js/ahaSemanticRetrieval.js` — behold som lokal forklarbar fallback

Denne modulen bygger et lokalt vektet feature-rom fra:

- tokens
- stems
- phrases
- concepts
- project terms

Det er nyttig for lokal hybrid retrieval og explainability.

Det er **ikke** samme type vektorrepresentasjon som provider-backed embeddings og skal ikke bli hovedmotor for proposition equivalence.

---

## 7. `js/ahaChatConceptPolicy.js` — flytt nedstrøms

Modulen inneholder:

- weak concept filters
- canonicalization
- phrase preferences
- domain-specific edge preferences

Dette er nyttig som:

```text
semantic concepts
→ canonicalization/display guard
```

Det er ikke tilstrekkelig som general-purpose concept extractor.

---

## 8. `js/ahaAnalysisQualityEvaluator.js` — behold kontrakten, bygg om semantics

Evaluatoren har gode dimensjoner:

- source grounding
- specificity
- transformation
- actionability
- distinctness
- uncertainty honesty

Men flere mål er leksikalske.

Spesielt kan `transformationScore` belønne lav tekstoverlapp selv når tolkningen er semantisk feil.

V2 må koble evaluator til SemanticDocument:

- claims
- evidence
- relations
- semantic consistency
- entity/concept distinction
- synthesis status

---

## 9. `js/metaInsightsEngine.js` — behold canonical meta-lag

Meta bygger allerede blant annet:

- topics
- concept index
- semantic/global profile
- co-occurrence
- temporal profile
- tensions
- recommendations
- meta insight

Problemet er i stor grad kvaliteten på chamber-inputen.

V2 bør gjøre Meta quality-aware, ikke erstatte den.

---

## 10. `js/ahaKnowledgeMap.js` — behold som derived graph/read model

Knowledge Map er eksplisitt avledet og noncanonical.

Det bygger nodes/edges fra blant annet:

- projects
- concepts
- sources
- curation
- training corpus/examples
- memory claims
- people/places/music/history objects

Mange edges er i dag basert på `has_concept`, tags, source linkage og mentions.

Etter Semantic Core bør typed relations fra canonical objects kunne materialiseres inn her som derived graph edges med provenance.

---

## 11. `js/ahaKnowledgeGraphIntelligence.js` — behold som downstream suggestion engine

Modulen analyserer blant annet:

- strong/weak projects
- concept centrality
- isolated nodes
- missing links
- knowledge gaps
- training opportunities

Den er allerede merket suggestion-only/noncanonical.

Riktig rolle er å analysere en god Knowledge Map, ikke å erstatte source semantic analysis.

---

## 12. `js/ahaEngineClient.js` — legacy analysis seam må ikke styre V2

Engine client har en optional Python analysis path og shape-validering av canonical analysis.

Shape validation beviser bare at feltene finnes. Det beviser ikke at analysen er riktig.

SemanticDocumentV1 bør få en egen versjonert request/response-kontrakt. Den kan implementeres i samme backend, men skal ikke presses inn i en eldre shape bare for bakoverkompatibilitet.

Legacy payload inneholder også `assistantReply`; dette feltet må ikke bli en skjult semantic source i V2.

---

## 13. `js/ahaChatAgentRuntime.js` — separat brukerrettet chat

Agent runtime bygger chat-request med:

- message
- relevant chamber/meta state
- memory context
- personal context

Dette er svarmotoren til brukeren.

Den skal holdes arkitektonisk separat fra source→SemanticDocument.

---

## 14. Current metric mismatch

### Concept density V1

Dagens motor bruker i stor grad unike innholdsord fra title/summary som proxy.

Det samsvarer ikke med produktdefinisjonen av begrepstetthet som tetthet av **meningsbærende begreper**.

Derfor skal V1-metricen versjoneres som legacy og `concept_density_v2` bygges fra canonical concepts.

### Insight saturation V1

Dagens score har et betydelig count-komponent og kan ikke alene representere:

- source diversity
- semantic diversity
- consensus/reinforcement
- depth/coherence
- engagement

Derfor skal V1 beholdes i shadow/legacy mens V2 kalibreres.

---

## 15. Konklusjon

Vi trenger ikke rive hele AHA.

De riktige systemgrensene finnes i stor grad allerede:

```text
Source / ingest
Insight candidate seam
Embeddings
Chamber lifecycle
Meta
Knowledge Map
Quality evaluator
```

Det som mangler er en **generell, kildebundet SemanticDocument-kjerne** mellom SourceEvent og chamberet.

Ombyggingen skal derfor være kirurgisk:

```text
BEHOLD lifecycle + persistence + meta + embeddings + derived graph
ERSTATT svak source semantics + semantic metrics
KOBLE alle produktflater til samme nye semantic objects
```

Dette er den korteste veien til en innsiktsmotor som både samsvarer med produktmodellen og kan forbedres/testes systematisk.
