# AHA Semantic Live-Reviewed Gold V1

## Status

Dette er første håndmerkede baseline mot **faktiske, validerte produksjonsoutputs** fra den konfigurerte AHA semantic-model-ruten.

```text
corpus: semantic-live-reviewed
valid gold cases: 6
model: gpt-4.1-mini-2025-04-14
endpoint: /api/aha-agent/semantic-document
production_gate_authority: false
synthesis_allowed: false
canonical_write: false
meta_write: false
persistent_write: false
```

Gold-corpuset er QA-grunnlag. Det åpner ingen produksjonsport.

## 1. Corpus

De seks gyldige live-casene dekker ulike semantiske utfordringer:

1. begrensninger og kreativitet
2. aktiv gjenhenting og senere hukommelse
3. blandede bruksformer og aktivitetsmønster
4. delegasjon og nye koordineringsgrenser
5. modularitet og grensesnittfeil
6. standardisering og fleksibilitet

Det første caset ligger i `constraints-creativity-v1.json`; de øvrige fem ble kjørt mot samme produksjonsendepunkt og håndmerket mot den faktiske model-shadow-outputen.

Et ekstra museumscase ble **ikke** tatt inn i gold-metrikken. Fem av fem forsøk ble avvist fail-closed av source/evidence-validatoren. Avvisningene er bevart i `rejected-live-captures-v1.json` som separat reliability-evidence.

## 2. Aggregate precision / recall / F1

| Dimensjon | Precision | Recall | F1 |
|---|---:|---:|---:|
| Entities | 0.900000 | 0.947368 | 0.923077 |
| Concepts | 0.960000 | 0.648649 | 0.774194 |
| Source claims | 1.000000 | 1.000000 | 1.000000 |
| Relations | 0.500000 | 0.550000 | 0.523810 |
| Interpretations | 0.166667 | 0.166667 | 0.166667 |

```text
aggregate macro_f1 = 0.677550
```

Tallene er målt av eksisterende `AHASemanticGoldEvaluator` + `AHASemanticGoldSuite`, ikke manuelt beregnede presentasjonstall.

## 3. Hva baseline faktisk viser

### Source claims er ikke flaskehalsen

Modellen traff alle 18 håndmerkede source claims:

```text
precision = 1.0
recall = 1.0
f1 = 1.0
```

Den source-direct kontrakten og exact-source claim-separasjonen fungerer derfor svært godt i dette lille live-corpuset.

### Entities er allerede sterke

Entity F1 er `0.923077`. De fleste konkrete referenter blir funnet og typet brukbart. Feilene er primært scope-/klassifikasjonsvalg, ikke et grunnleggende ekstraksjonsproblem.

### Concepts har høy precision, men mangler dekning

Concept precision er `0.96`, mens recall er `0.648649`.

Modellen finner altså som regel gode concepts når den først velger dem, men den lar flere analytisk viktige concepts bli liggende implisitt i source claims. Eksempler er kausal usikkerhet, nøkkelpersonavhengighet, ansvarsgrenser og leveranseforsinkelse.

### Relations er et reelt kvalitetsproblem

Relation F1 er `0.523810`.

To hovedfeil går igjen:

- modellen bruker `causes` der source bare forsvarer svakere `influences` eller `associated_with`
- modellen lager lokale forbindelser mellom surface labels uten å uttrykke den viktigere strukturelle relasjonen

Delegasjons- og modularitetscasene gjør dette tydelig. Dette må være en hard del av Insight Quality Gate V2: synthesized Insight kan ikke arve ubegrunnet kausalitet fra relation-laget.

## 4. Hovedflaskehalsen: interpretation / synthesis

Interpretation-resultatet er:

```text
true_positive = 1
predicted = 6
expected = 6
precision = 0.166667
recall = 0.166667
f1 = 0.166667
```

Dette er den viktigste baseline-observasjonen.

Modellen kan produsere lokale interpretations, men de er ofte bare en kort parafrase eller en enkelt inferens. De samler ikke source claims til den generaliserbare forståelsen gold-merkingen krever.

Eksempler:

### Læring

Modellen lager separat at aktiv gjenhenting:

- oppleves vanskeligere
- gir bedre senere hukommelse

Men den syntetiserer ikke spenningen: **en læringsstrategi kan føles vanskeligere samtidig som den gir bedre langtidsretensjon**.

### Modularitet

Modellen beskriver uavhengige endringer og feil ved grensesnitt hver for seg. Den formulerer ikke mekanismen: **modularisering kan flytte koordinasjonskompleksitet fra en felles kodebase til grensene mellom moduler**.

### Standardisering

Her lykkes modellen. Den formulerer at faste og valgfrie felt skaper en balanse mellom standardisering og fleksibilitet. Dette er det ene live-caset som matcher den håndmerkede synthesized interpretation.

Det viser at modellen har kapasiteten, men at dagens semantic-model-trinn ikke fremtvinger denne typen abstraksjon systematisk.

## 5. Hva som ikke teller som en Insight

Live-baseline låser følgende produktregel:

```text
source observation != synthesized Insight
light paraphrase != synthesized Insight
local inference != synthesized Insight
```

Source observations kan være evidence. De får ikke Insight-status bare fordi de er korrekte.

En synthesized Insight må tilføre semantisk transformasjon, for eksempel:

- prinsipp
- mekanisme
- mønster
- spenning
- konsekvens
- generaliserbar forståelse

uten å gå utover evidensen.

## 6. Capture reliability er separat fra semantic quality

Produksjonsendepunktet er fail-closed på exact-source/evidence-validering, og det fungerte som sikkerhetsmekanisme i live-runden.

Samtidig var output-stabiliteten ujevn:

- retrieval og mixed-use ga gyldige outputs direkte i første capture-runde
- delegasjon krevde nytt gyldig forsøk
- modularitet krevde flere forsøk før output passerte validatoren
- museumscaset ble avvist fem av fem ganger
- standardisering/fleksibilitet passerte på første forsøk

Dette er en separat reliability-observasjon. Ugyldige outputs blir ikke scoret som om de var gyldige semantic shadows, og de åpner ingen fallback-write.

## 7. Neste byggeetappe: Interpretation / Insight Synthesis V2

Neste store produktjobb skal være et separat trinn etter `SemanticDocument`:

```text
Source
→ entities / concepts / source claims / relations
→ Interpretation candidates
→ Insight Quality Gate V2
→ Chamber
```

Synthesis-trinnet skal eksplisitt lete etter:

```text
principle
mechanism
pattern
tension
consequence
generalizable understanding
```

Det skal ikke bare spørre hva teksten sier.

Første candidate-kontrakt bør minst ha:

```text
insight
type
abstraction
evidence
why_it_matters
confidence
uncertainty?
```

Quality Gate V2 skal avvise kandidaten dersom den:

- bare gjentar eller lett parafraserer source
- er generisk
- mangler evidence
- introduserer ubegrunnet kausalitet
- ikke tilfører semantisk transformasjon
- skjuler relevant usikkerhet

## 8. Write-policy etter denne fasen

Live-reviewed gold fullfører evalueringsgrunnlaget, men endrer ikke write-policy:

```text
canonical Insight synthesis write = disabled
Meta write = disabled
persistent SemanticDocument storage = disabled
production gate authority = disabled
```

Først når Interpretation / Insight Synthesis V2 måles og forbedres mot dette corpuset, kan en kontrollert canonical Insight-write vurderes. Meta kobles på etter at Insight-laget faktisk produserer godt råstoff.
