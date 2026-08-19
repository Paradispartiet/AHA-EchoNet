# AHA Semantic Model Contract V1

## Status

Dette dokumentet beskriver serverkontrakten mellom AHA-agentens språkmodell og `SemanticDocumentV1`.

```text
contract module: implemented
HTTP endpoint wiring: not implemented in this PR
source-direct analysis: required
Structured Outputs: JSON Schema / strict
raw source returned: no
canonical Insight write: no
Meta write: no
persistent SemanticDocument write: no
synthesis allowed: no
```

Runtime-modulen er:

```text
server/ahaSemanticModelContract.js
```

Kontrakten er pure ESM og gjør ingen nettverkskall eller lagring selv.

---

## 1. Hvorfor kontrakten kommer før HTTP-ruten

AHA har allerede en fungerende OpenAI-seam i root `server.js` via `/api/aha-agent/insight-candidates`.

Den dedikerte SemanticDocument-modellen skal likevel ikke kobles direkte til produktflyten før vi har bevist tre ting separat:

1. modelloutput har et strengt maskinlesbart schema
2. source/evidence-reglene kan valideres deterministisk etter modellkallet
3. uvalidert modelloutput kan aldri behandles som semantisk sannhet

Derfor er denne etappen **contract first**.

Neste etappe kobler kontrakten til et versjonert source-direct HTTP-endepunkt i samme AHA-agent-backend.

---

## 2. Structured model output

Modelloutput har schema:

```text
aha_semantic_model_output_v1
```

Top-level:

```text
{
  schema
  entities[]
  concepts[]
  propositions[]
  relations[]
  unresolved_inferences[]
}
```

JSON Schema bruker:

```text
type = json_schema
strict = true
additionalProperties = false
```

Dette erstatter ikke server-side validering. Structured output begrenser formen; AHA validerer i tillegg at source/evidence faktisk stemmer.

---

## 3. Source er eneste evidensautoritet

Systeminstruksen låser:

```text
SOURCE_TEXT = eneste evidensautoritet
```

Følgende får ikke brukes som semantisk kilde:

```text
assistantReply
assistant_reply
chat_response
ai_response
model_response
candidate_insights
meta_profile
```

Forbudet håndheves både i request-context og rekursivt i modellpayloaden.

---

## 4. Entities

```text
{
  source_surface
  canonical_label
  entity_type
  evidence_quotes[]
  confidence
}
```

`source_surface` må finnes ordrett i source.

Tillatte typer:

```text
person
organization
place
work
event
other
```

Canonical label kan normalisere navnet, men kan ikke erstatte source evidence.

---

## 5. Concepts

```text
{
  source_surface
  canonical_label
  evidence_quotes[]
  confidence
}
```

Også Concept krever at `source_surface` finnes ordrett i source.

Dette gjør modellens rolle rikere enn Phase 1B-extractoren uten å gi den rett til å finne på begreper uten source-binding.

---

## 6. Propositions

Tillatte proposition-kategorier:

```text
source_claim
interpretation
inference
```

Shape:

```text
{
  kind
  text
  evidence_quotes[]
  confidence
}
```

### source_claim

For `source_claim` gjelder den strengeste regelen:

```text
proposition.text must be an exact substring of SOURCE_TEXT
```

Ingen parafrase kan masquerere som source claim.

### interpretation

En interpretation kan være en ny formulering, men må:

- være eksplisitt merket `interpretation`
- ha ordrette evidence quotes fra source
- ikke automatisk bli canonical Insight

### inference

En inference kan trekke en mulig slutning, men må:

- være eksplisitt merket `inference`
- ha ordrette evidence quotes
- forbli under semantic quality gate

---

## 7. Relations

Modellkontrakten kan foreslå rikere semantiske relasjoner enn den deterministiske Phase 1C-extractoren:

```text
associated_with
part_of
influences
causes
supports
contradicts
explains
precedes
other
```

Hver relation må ha:

```text
from_label
to_label
epistemic_status
evidence_quotes[]
confidence
```

Tillatt epistemisk status:

```text
source_explicit
interpretation
inference
```

Dette betyr ikke at alle foreslåtte relasjoner blir canonical. Kontrakten gjør epistemisk status eksplisitt slik at neste quality gate kan vurdere dem.

---

## 8. Unresolved inferences

```text
{
  text
  evidence_quotes[]
  confidence
}
```

Dette feltet er en karantene for plausible, men uavklarte slutninger.

Det er uttrykkelig forskjellig fra source claims og skal senere kunne brukes til spørsmål, videre analyse eller testing uten å bli lagret som etablert innsikt.

---

## 9. Evidence validation er fail-closed

Serverkontrakten validerer etter modelloutput.

Hele payloaden er ugyldig dersom blant annet:

- en evidence quote ikke finnes ordrett i source
- en Entity/Concept `source_surface` ikke finnes i source
- en `source_claim.text` ikke finnes ordrett i source
- obligatorisk evidence mangler
- enum-verdi er ukjent
- item-count overskrider kontrakten
- ukjente felt dukker opp
- assistant/chat-response-data dukker opp noe sted

AHA skal **ikke** stille filtrere bort den hallusinerte delen og behandle resten som en godkjent modellrespons. Semantic truth skal feile lukket.

---

## 10. Responses request

`buildSemanticModelResponsesRequest(...)` bygger en Responses-request med:

```text
model
input[system]
input[user: source_text + safe context]
text.format.type = json_schema
text.format.name = aha_semantic_model_output_v1
text.format.strict = true
text.format.schema = SEMANTIC_MODEL_JSON_SCHEMA
```

Request-builderen avviser:

- tom source
- source over 8000 tegn
- manglende modellnavn
- context som ikke er objekt
- context med assistant/chat response-felter

---

## 11. Safe response envelope

Når et senere HTTP-endepunkt har fått en validert model payload, skal svaret pakkes i:

```text
aha_semantic_model_contract_v1
```

Policy:

```text
source_text_returned = false
canonical_write = false
persistent_write = false
meta_write = false
synthesis_allowed = false
```

Full source text returneres ikke som eget felt.

---

## 12. Hva denne etappen ikke gjør

Denne kontrakts-PR-en:

- endrer ikke `/chat`
- endrer ikke `/insight-candidates`
- oppretter ikke SemanticDocument-endepunkt ennå
- kaller ikke OpenAI fra kontraktsmodulen
- endrer ikke browser-runtime
- lagrer ikke model payload
- oppretter ikke canonical Insights
- endrer ikke Meta

---

## 13. Neste etappe

Neste serveretappe er:

```text
POST /api/aha-agent/semantic-document
```

Ruten skal:

1. validere request
2. kreve Responses API / structured output-seamen
3. kalle modellen med `buildSemanticModelResponsesRequest(...)`
4. parse output
5. kjøre `requireValidSemanticModelPayload(...)`
6. returnere safe response envelope
7. returnere fail-closed feil hvis evidence-validering feiler
8. aldri returnere rå model payload ved valideringsfeil
9. aldri skrive canonical/persistent data

Først etter at endpointet og shadow-integrasjonen er bevist kan vi bygge `Synthesized Insight Quality Gate`.
