# AHA Insight Contract

Dette dokumentet formaliserer AHA-innsiktsmotorens canonical kontrakt. Den eksisterende motoren i `js/insightsChamber.js` beholdes; kvalitetsløftet skal forbedre hva som blir et signal, et begrep, en påstand og en ferdig innsikt uten å opprette en parallell motor.

Se også `AHA_INSIGHT_ENGINE_SEMANTIC_CORE_V1.md` for den konkrete semantiske målarkitekturen.

## Signal

`Signal` er minste enhet som mates inn i innsiktsmotoren.

Kjernefelter:
- `id`
- `timestamp`
- `subject_id`
- `theme_id`
- `text`

Valgfrie kontekstfelter (videreføres til insight):
- `place_id`
- `person_id`
- `field_id`
- `emner[]`

Et Signal er analyseinput. Det er ikke i seg selv en ferdig innsikt.

## SourceEvent

`SourceEvent` er rå hendelseslogg fra kilder (chat, notes, galleri, importer, osv.).

Kjernefelter:
- `id`
- `source_type`
- `source_app`
- `content_type`
- `title`
- `text`
- `user_created`
- `imported`
- `created_at`
- `tags[]`
- `meta`

SourceEvent brukes som sporbar kilde; Signal brukes til analyse.

Canonical skille:

```text
SourceEvent = hva som kom inn.
Insight = hva AHA forsto av det.
```

Det betyr at en kopi eller lett omskriving av `SourceEvent.text` normalt ikke er tilstrekkelig som ferdig Insight.

## Insight

`Insight` er aggregert innsikt i kammeret, opprettet/reinforced fra signaler.

Typiske felter:
- `id`, `subject_id`, `theme_id`
- `title`, `summary`
- `strength { evidence_count, total_score }`
- `depth_score`
- `status`
- `insight_type`
- `functional_type`
- `first_seen`, `last_updated`
- `semantic`, `dimensions`, `narrative`, `semiotic`
- `raw_terms`, `concepts`, `claims`, `patterns`, `markers`
- `emner[]`, `emne_suggestions[]`
- `merged_into` (når sammenslått)

Fremtidig semantisk berikelse kan i tillegg knytte et Insight til typed `entities`, `relations` og `evidence_anchors`. Disse skal berike canonical Insight, ikke erstatte chamberet.

## Insight.status

Gyldige statusverdier:
- `suggested`
- `accepted`
- `edited`
- `rejected`
- `archived`
- `merged`

Nye insights opprettes med `status: suggested`.

Aktive innsikter = innsikter som **ikke** er:
- `archived`
- `rejected`
- `merged`
- eller har `merged_into`

## Insight.insight_type

`insight_type` beholdes som semantisk/psykologisk type fra eksisterende motor.

Den uttrykker *hvordan* innsikten oppleves/tolkes (emosjonelt/kognitivt mønster), og skal ikke fjernes.

## Insight.functional_type

`functional_type` uttrykker innsiktens funksjonelle rolle i tenkning/arbeid.

Gyldige verdier i dagens kontrakt:
- `observation`
- `principle`
- `decision`
- `question`
- `problem`
- `solution`
- `pattern`
- `task`
- `definition`
- `contradiction`
- `memory`
- `learning_point`

Dette supplerer `insight_type` (erstatter den ikke).

I det semantiske kvalitetsløftet skal det i tillegg være tydelig om en kandidat er en **kildenær observasjon** eller en **syntetisert tolkning/prinsipiell innsikt**. Kildenære observasjoner kan ligge tett på teksten; syntetiserte innsikter skal bestå transformasjonsporten nedenfor.

## raw_terms vs concepts

- `raw_terms`: råord/overflateord, ofte høy recall, lav semantisk presisjon.
- `concepts`: meningsenheter/begreper med høyere semantisk verdi.

I embedding og analyse prioriteres concepts høyere enn raw_terms.

Dette skillet er normativt, ikke bare teknisk:

- egennavn skal normalt behandles som entities, ikke automatisk concepts
- høyfrekvente ord er ikke concepts bare fordi de forekommer ofte
- abstrakte endelser kan være en fallback-indikator, men kan ikke være hovedkriteriet for begrepsstatus
- flerordsbegreper og canonical fagbegreper skal prioriteres foran tilfeldige enkeltord når kilden støtter dem

## claims

`claims` er påstands-laget: eksplisitte utsagn som kan spores, sammenlignes og motsies over tid.

Målkontrakten er at claims representerer normaliserte proposisjoner med kildebelegg, ikke bare kopierte setninger.

Eksempel:

```text
proposition: «Gitte rammer kan fremme formell variasjon.»
evidence: konkret kildepassasje
```

## patterns

`patterns` er gjentakende tekstlige/semantiske mønstre.

Et pattern skal ikke være et tilfeldig ordtreff. Det må være en tolkbar gjentakelse eller struktur som kan støttes av flere signaler, claims, concepts eller relasjoner.

## markers

`markers` er signalmarkører (f.eks. modalitet, symbolske trekk, nøkkelindikatorer) for filtrering og senere scoring.

## Entities og relations

Neste semantiske kjerne skal skille eksplisitt mellom:

```text
entities
= personer, steder, institusjoner, verk, hendelser

concepts
= meningsbærende ideer, prosesser og abstraksjoner

relations
= typed koblinger mellom entities, concepts og claims
```

Relations skal gjøre det mulig å representere forhold som `supports`, `contradicts`, `enables`, `constrains`, `causes`, `example_of`, `part_of` og andre dokumenterte koblinger.

## Semantisk kvalitetsport for ferdige insights

En syntetisert insight-kandidat skal vurderes på minst:

1. **Grounding** — kan den spores til kildebelegg?
2. **Transformation** — tilfører den forståelse utover ren ekstraksjon/omskriving?
3. **Portability** — kan innsikten gjenkjennes eller brukes i annet materiale senere?
4. **Specificity** — sier den noe presist og meningsfullt?
5. **Relation value** — kobler den relevante concepts/claims/entities når materialet gir grunnlag?
6. **Distinctness** — er den ny, eller bør den reinforce/merge en eksisterende insight?

Hard regel:

> Et syntetisert Insight som hovedsakelig kan finnes som én sammenhengende passasje i kilden, skal normalt ikke godkjennes som ferdig syntese. Det skal enten forbli evidence/source observation eller transformeres videre.

## AI-agentgrense

AHA-agentens chat-svar er ikke canonical insight-materiale.

Det kan brukes i utvikling som QA-referanse for hva en kompetent språkmodell oppfatter i en fixture, men skal ikke:

- skrives som ordinært Insight
- brukes som sannhetskilde for concepts/claims/relations
- mates til Meta-profil som om det var brukerens egen forståelse
- brukes som skjult semantic fallback som gjør canonical-motoren avhengig av Chat-svaret

Agentens egne svar skal fortsatt kunne logges source-only med eksisterende `skip_insight`-grense.

## merge_suggestions

`merge_suggestions` er forslag om at to insights sannsynligvis representerer samme tanke.

Lifecycle:
- forslag registreres som `pending`
- bruker kan bekrefte (`confirmed`) eller avvise (`dismissed`)
- ingen auto-merge

Ved bekreftet merge settes kilde-insight med `merged_into` og ekskluderes fra aktive lister.

Etter Semantic Core-løftet bør merge/reinforcement prioritere canonical concepts, proposition similarity og relations foran ren leksikalsk likhet.

## emne_suggestions

`emne_suggestions` er forslag om emne-tilknytning.

Lifecycle:
- forslag legges inn med `suggested`
- bruker kan bekrefte (`confirmed`) eller avvise (`dismissed`)
- kun bekreftede forslag løftes til `emner[]`

## Meta-kontrakt

`MetaInsightsEngine` er metanivået over chamberet. Meta-profilen skal bygges fra varige AHA-objekter — accepted/reinforced insights, concepts, claims, relations, tensions og tidsutvikling — ikke fra den siste AI-chatresponsen.

Meta-profilen skal derfor bli bedre når chamberets semantiske kvalitet blir bedre. Meta-algoritmen skal ikke brukes som reparasjonslag for svake kildeutdrag som feilaktig er blitt lagret som insights.