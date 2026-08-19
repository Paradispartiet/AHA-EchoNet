# AHA Semantic Model Endpoint V1

## Status

Endpointet materialiserer den allerede testede `AHA_SEMANTIC_MODEL_CONTRACT_V1` som en source-direct HTTP-seam i den eksisterende AHA-agent-backenden.

```text
route: POST /api/aha-agent/semantic-document
backend: existing root server.js / AHA agent
Responses API required: yes
Structured Output required: yes
chat-completions fallback: forbidden
server-side evidence validation: fail-closed
raw source returned: no
raw model output returned on failure: no
canonical write: no
persistent write: no
Meta write: no
synthesis allowed: no
```

---

## 1. Request

```json
{
  "text": "source text",
  "context": {},
  "format": "aha_semantic_model_output_v1"
}
```

`format` er valgfritt. Hvis det oppgis må det være nøyaktig `aha_semantic_model_output_v1`.

Grenser:

- `text` må være ikke-tom string
- maks 8000 tegn
- `context` må være objekt hvis det finnes
- context med assistant/chat response-felter avvises av kontrakten

---

## 2. Ingen svak fallback

Denne ruten krever:

```text
openai.responses.create
```

Hvis Responses-seamen ikke finnes:

```text
503 semantic_model_responses_unavailable
```

Ruten faller uttrykkelig **ikke** tilbake til:

```text
openai.chat.completions.create
response_format: json_object
fri JSON-parsing
```

Dette skiller SemanticDocument-seamen fra eldre, mer tolerante analyse-endepunkter.

---

## 3. Modellrequest

Handleren bruker:

```text
buildSemanticModelResponsesRequest(...)
```

fra `server/ahaSemanticModelContract.js`.

Requesten bruker strict JSON Schema Structured Output og source-direct systempolicy.

---

## 4. Post-model validation

Etter OpenAI-responsen leser handleren:

```text
response.output_parsed
```

hvis det finnes som objekt, ellers:

```text
response.output_text
```

Deretter kjøres:

```text
requireValidSemanticModelPayload(payload, sourceText)
```

Dette betyr at schema-conformance fra modellleverandøren ikke alene er nok. AHA kontrollerer også exact-source evidence.

---

## 5. Fail-closed response

Ved hallusinert eller ugyldig model payload returneres:

```text
502 semantic_model_validation_failed
```

Responsen kan inneholde korte valideringskoder, men ikke:

- raw model output
- source text
- hallusinerte model strings

Failure-policy:

```text
source_text_returned = false
raw_model_output_returned = false
canonical_write = false
persistent_write = false
meta_write = false
synthesis_allowed = false
```

---

## 6. Upstream failure

Hvis OpenAI-kallet feiler returneres:

```text
502 semantic_model_openai_error
```

Handleren kan returnere upstream status/code, men ikke upstream error message/body. Dette hindrer at provider-respons eller sensitiv feiltekst lekker til klienten.

---

## 7. Success response

Etter gyldig model payload returneres safe envelope:

```text
aha_semantic_model_contract_v1
```

med:

```text
analysis
model
response_id
policy
```

Policy beholder:

```text
source_text_returned = false
canonical_write = false
persistent_write = false
meta_write = false
synthesis_allowed = false
```

`analysis` er dermed validert semantisk modelloutput, men **ikke** en canonical Insight og **ikke** en Meta-write.

---

## 8. Testkontrakt

`tests/aha-semantic-model-endpoint-v1.test.cjs` beviser blant annet:

- missing OpenAI key → 503
- manglende Responses-seam → 503
- chat completions blir aldri kalt som fallback
- invalid text/context/format stopper før modellkall
- assistant-response-data i context stoppes før modellkall
- gyldig structured output → 200 safe envelope
- hallusinert evidence → 502 fail-closed
- validation failure lekker ikke raw model output/source
- upstream-feilmelding lekker ikke
- `output_parsed` støttes
- root `server.js` registrerer nøyaktig `/api/aha-agent/semantic-document`

---

## 9. Hva endpointet fortsatt ikke gjør

Endpointet:

- lagrer ikke SemanticDocument
- skriver ikke til canonical sync
- skriver ikke til Insight Chamber
- skriver ikke til Meta
- endrer ikke `/chat`
- endrer ikke `/insight-candidates`
- endrer ikke browser-runtime
- åpner ikke `synthesis_allowed`

---

## 10. Neste etappe

Neste produktetappe er **shadow client integration**:

```text
AHA Chat source event
→ deterministic SemanticDocument shadow
→ semantic-document endpoint
→ validated Semantic Model output
→ merge/compare into shadow representation
→ quality/evaluation metrics
```

Ingen modelloutput skal materialiseres som canonical Insight før en egen `Synthesized Insight Quality Gate` er implementert og bevist.
