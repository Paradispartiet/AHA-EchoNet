# AHA Insight Engine Evaluation Contract V1

## Status

Dette dokumentet definerer hvordan den nye Semantic Core skal evalueres.

Målet er ikke å sammenligne AHA mot ett bestemt fasitsvar ord for ord. Målet er å bevise at motoren finner **de riktige semantiske objektene**, unngår systematiske feil og produserer innsikter som faktisk tilfører forståelse.

Forretningsmodellen krever at innsiktsverdi, begrepstetthet, semantisk resonans og innsiktsmetning kan måles. Derfor må evalueringssettet teste disse egenskapene direkte.

---

## 1. Golden fixture-prinsipp

Repoet skal ha et permanent sett på **30–50 varierte golden fixtures** før Semantic Core V2 regnes som produksjonsmoden.

Start med et mindre seed-sett, men bygg videre til 30–50 før full aktivering.

Fixtures skal dekke minst:

- fagtekst
- essay / idétekst
- kunst-/kulturkritikk
- nyhets-/reportasjetekst
- personlig refleksjon
- praktisk arbeidsnotat
- møtereferat
- argumentasjon med motargument
- tekst med tydelig årsak/virkning
- tekst med usikkerhet/hypoteser
- korte fragmenter
- lange rike tekster
- blandede domener
- tekst med mange egennavn
- tekst med få egennavn, men mange abstrakte concepts

---

## 2. En fixture tester egenskaper, ikke ordlyd

Forslått format:

```json
{
  "id": "fixture_example",
  "source": "...",
  "expect": {
    "entities": {
      "must_include": [],
      "must_not_treat_as_concepts": []
    },
    "concepts": {
      "must_include_any_of": [],
      "forbidden": [],
      "minimum_meaningful_count": 0
    },
    "claims": {
      "must_capture_families": [],
      "minimum_grounded": 0
    },
    "relations": {
      "must_include_types": [],
      "minimum_grounded": 0
    },
    "insights": {
      "minimum_synthesized": 0,
      "forbidden_patterns": [],
      "maximum_source_overlap": 0.9
    },
    "quality": {
      "forbidden_warnings": [],
      "must_fail_closed_if": []
    }
  }
}
```

Expectation-families kan bruke canonical aliases og semantisk ekvivalens. Testen skal ikke kreve én bestemt formulering.

---

## 3. Brecht / Karl von Appen som permanent regresjon

Denne teksten skal beholdes som en av fixture-typene fordi den avdekket flere systematiske feil samtidig.

### Entities som bør oppdages

Eksempler:

- Karl von Appen — person
- Bertolt Brecht — person
- Berliner Ensemble — institution/organization
- Galleri F-15 — place/institution
- Moderna Museet — institution
- relevante verk/titler når kildegrunnlaget er tydelig

### Entities som ikke skal dominere concept-listen

Motoren skal ikke presentere en liste som hovedsakelig består av:

```text
appen
brecht
karl
galleri
blei
utstilling
```

Personnavn/institusjoner hører primært hjemme som entities. Vanlige overflateord hører hjemme som raw terms eller forkastes.

### Concept-familier som en god motor bør kunne oppdage

Ikke som eksakt ordlyd, men semantisk:

- scenografi
- forholdet mellom form og innhold
- kunstnerisk frihet
- kunstneriske/gitte rammer
- formell variasjon / formell spennvidde
- kunstnerisk teknikk / teknisk mestring
- politisk kunst / kunst og politikk når støttet
- kunstnerisk samarbeid / realisering av en annens idé

### Claim-/proposition-familier

Motoren bør kunne representere blant annet:

- von Appen arbeidet med et innhold/rammeverk som i stor grad var gitt av Brecht
- von Appen brukte forskjellige teknikker/formløsninger mellom forestillinger
- skribenten tolker dette som et eksempel på at gitte rammer kan være forenlige med, eller fremme, kunstnerisk frihet/formell variasjon
- teknisk/formell mestring fremstilles som viktig for å realisere innhold

### Relation-familier

Minst noen relevante relasjoner bør være mulige, for eksempel:

```text
Brecht --collaborates_with--> von Appen
von Appen --creates/realizes--> scenografi
rammer --constrain/enable--> formvalg
formell variasjon --supports/expresses--> kunstnerisk frihet
teknikk --serves--> innhold
```

Testen skal ikke kreve akkurat disse labelsene hvis relation ontology bruker canonical synonymer.

### Synthesized insight-krav

Minst én accepted synthesized insight skal tilføre forståelse utover kildeutdraget.

Eksempel på semantic family:

```text
Kreativ frihet kan oppstå innenfor tydelige rammer fordi begrensningen flytter
kunstnerisk arbeid over i valg av form, teknikk og realisering.
```

Dette er et **evaluerings-eksempel**, ikke en runtime-fasit som skal mates inn i motoren.

### Forbudte regresjoner

Denne fixture skal feile hvis motoren:

- klassifiserer teksten som «usikker årsaksforståelse» uten kildegrunnlag
- hevder at den lange, konkrete teksten har «lav informasjonsdensitet»
- produserer «Mønster: appen går igjen og bærer teksten» som viktig insight
- bruker «modeller» som substring-bevis for teoribegrepet `modell`
- fyller concept-listen med navn og bøyningsord
- godkjenner et rent tekstutdrag som synthesized insight
- gir `passed` samtidig som sentrale tolkninger mangler evidence

---

## 4. Entity ≠ concept-tests

Fixtures med mange navn skal bevise at:

- personer blir entities
- steder blir entities
- institusjoner blir entities
- verk blir work/title entities
- navn kan inngå i relations
- navn blir ikke automatisk meaningful concepts

Samtidig må testene tillate concepts som inneholder egennavn når navnet er del av et faktisk etablert fagbegrep.

---

## 5. Meaningful concept-tests

Concept evaluation må ha tre typer assertions:

### 5.1 Positive concepts

Motoren finner minst én canonical representant fra forventet semantic family.

### 5.2 Forbidden surface terms

Ord som åpenbart er råspråk, stopwords eller irrelevante navn skal ikke promoteres.

### 5.3 Phrase preference

Når kilden støtter et meningsbærende flerordsbegrep, skal det normalt prioriteres foran svakere enkeltdeler.

Eksempel:

```text
«kunstnerisk frihet» > «frihet»
«form og innhold» > «form»
```

Dette er en preferanse, ikke en regel om at enkeltord aldri kan være concepts.

---

## 6. Claim grounding-tests

Hvert canonical claim må ha minst ett gyldig evidence anchor.

Testene skal kontrollere:

- anchor finnes i riktig SourceEvent
- anchor peker til riktig source hash
- proposition er forenlig med evidence
- modality beholdes
- negasjon beholdes
- hvem som mener noe beholdes når det er relevant

Eksempel på kritisk feil:

```text
Kilde: «Skribenten spør om X kan være tilfelle.»
Feil claim: «X er tilfelle.»
```

---

## 7. Relation-tests

Typed relations må evalueres på:

- gyldige `from_ref` og `to_ref`
- tillatt relation type
- evidence
- directionality
- negasjon/modality der relevant

To objects som bare forekommer i samme tekst skal **ikke** automatisk få en sterk causal/supports-relation.

Co-occurrence kan lagres som avledet svak relation, men må være eksplisitt skilt fra meningsrelasjoner.

---

## 8. Synthesized insight transformation-test

Transformation kan ikke måles bare som lav ordlikhet.

En candidate må minst bestå:

1. **evidence test** — bygger på gyldige claims/relations
2. **semantic delta** — tilfører syntese/generaliserbar sammenheng utover ett source excerpt
3. **excerpt test** — er ikke i hovedsak én sammenhengende kildepassasje
4. **specificity test** — er ikke generisk filler
5. **portability test** — kan kobles til senere materiale uten å miste meningen

En kandidat med lav tekstoverlapp, men feil semantikk, skal fortsatt forkastes.

---

## 9. Fail-closed fixtures

Testsettet skal inneholde materiale der en god motor **ikke** bør produsere sikre synthesized insights.

Eksempler:

- svært kort fragment uten kontekst
- kun navn/tall
- uklart sitat uten avsender
- tekst med intern selvmotsigelse som ikke kan løses
- tekst der causal relation bare er spekulasjon

Forventet resultat:

```text
SourceEvent bevart
Evidence bevart
Entities/basic concepts når sikre
0 eller få synthesized insights
quality/status forklarer hvorfor
```

Dette er bedre enn generisk filler.

---

## 10. Equivalence vs resonance-tests

### 10.1 Parafrase-equivalence

To tekster som uttrykker samme proposition med ulik ordlyd skal kunne reinforce/merge-suggest.

### 10.2 Related-but-not-same

To tekster som handler om samme tema, men hevder forskjellige ting, skal kunne få resonance-edge uten å merge.

### 10.3 Contradiction

To semantisk nære claims med motsatt polarity skal markeres som mulig contradiction/tension, ikke reinforce hverandre.

### 10.4 Entity collision

To tekster som nevner samme person, men handler om forskjellige begreper/påstander, skal ikke merge bare på grunn av navnet.

---

## 11. Embedding-tests

Ekte embeddings skal testes som én del av matching, ikke som eneste sannhet.

Fixtures bør inneholde:

- semantisk ekvivalente parafraser
- tematisk relaterte, men ulike claims
- semantisk motsatte claims med mye felles vokabular
- unrelated tekster med noen like ord

Målet er å kalibrere separate terskler for:

```text
equivalence
resonance
unrelated
```

---

## 12. Concept Density V2-tests

Concept density må testes på ordnet rangering før eksakte terskler låses.

Eksempel:

```text
A: lang tekst med mange egennavn og gjentatte overflateord
B: kortere fagtekst med flere tydelige meningsbærende concepts

forventning:
concept_density_v2(B) > concept_density_v2(A)
```

Testene skal også bevise at:

- aliases ikke dobbelttelles
- entities ikke blåser opp concept count
- inferred concepts med lav confidence ikke teller likt som explicit/registry concepts
- flerordsconcepts ikke splittes til kunstig høyt antall

---

## 13. Insight Saturation V2-tests

### 13.1 Duplicate inflation

Samme insight gjentatt ti ganger fra samme kilde skal ikke gi høy metning.

### 13.2 Reinforcement

Samme proposition støttet av flere uavhengige kilder bør øke consensus/reinforcement.

### 13.3 Diversity

Flere genuinely distinct insights innen samme tema skal øke semantic diversity.

### 13.4 Coherence

Et tema med mange tilfeldige, løst relaterte observations skal ikke få samme coherence som et område med claims/relations som faktisk henger sammen.

### 13.5 Synthesis depth

Et tema med bare source observations skal være mindre modent enn et tema med kildebundne synthesized insights.

---

## 14. Meta Profile-tests

Meta skal testes separat fra enkelttekstanalyse.

Fixture sequence over tid bør bevise at Meta kan oppdage:

- stabile concepts
- nye concepts
- temaer som vokser eller avtar
- tilbakevendende propositions
- endret standpunkt
- contradictions/tensions
- forbindelser på tvers av domener

Meta skal også ignorere eller nedvek­te:

- rejected insights
- weak legacy objects
- duplicate observations
- AI-agentens egne svar

---

## 15. Produktprojection-tests

Den samme SemanticDocument/chamber-kjernen skal kunne drive:

### Begreper
Bare canonical meaningful concepts.

### Lister
Semantisk grupperte objects; ikke tilfeldig sentence dumping.

### Stier
En faktisk progresjon, for eksempel:

```text
observasjon → begrep → claim → syntese → ny kobling
```

eller temporal utvikling når kilden krever det.

### Tankekart
Nodes og typed relations med provenance.

### Meta
Cross-time patterns fra de samme objects.

Hvis hver flate trenger sin egen alternative analyse av råteksten, har Semantic Core ikke lykkes.

---

## 16. QA-orakel og ChatGPT-svar

Et godt språkmodellsvar kan brukes manuelt under fixture-design for å spørre:

> Hvilke semantiske elementer burde en kompetent analyse ha oppdaget?

Men svaret skal aldri:

- bli runtime-input
- kopieres til expected exact strings
- lagres som brukerens Insight
- brukes til å fylle Meta

Fixtures eies av mennesker og uttrykker semantic properties, ikke modellens formulering.

---

## 17. Hard pass/fail vs kalibrering

### Hard failures

Eksempler:

- manglende provenance
- invalid source hash
- entity presentert som eneste concept-output
- fabricated evidence
- negasjon mistet
- synthesized insight er rent source excerpt
- agent reply brukt som canonical source
- rejected object påvirker Meta som accepted

### Kalibreringsmål

Disse bør først måles, ikke hardlåses:

- antall concepts per tekst
- exact saturation weights
- exact embedding thresholds
- max/min number of insight candidates
- hvor aggressiv portability skal være

Golden-settet brukes til å kalibrere disse før tersklene blir production gates.

---

## 18. Produksjonsklar definisjon

Semantic Core kan aktiveres bredt når:

1. 30–50 golden fixtures er grønne på hard gates
2. Brecht/Appen-regresjonen er grønn uten special-case kode
3. fail-closed fixtures gir konservativ output
4. entity/concept-skillet er stabilt
5. proposition/evidence-binding er stabil
6. typed relations består directionality/grounding-testene
7. duplicate, resonance og contradiction skilles
8. concept_density_v2 oppfører seg semantisk riktig
9. insight_saturation_v2 tåler duplicate-/diversity-testene
10. Meta-sequence fixtures viser meningsfull cross-time utvikling
11. ingen brukerrettet chat-response inngår i canonical semantic input
12. gamle V1-objects kan sameksistere uten å forurense V2-score ukontrollert

Før dette kjøres V2 i shadow/diagnostic mode og sammenlignes mot dagens output.
