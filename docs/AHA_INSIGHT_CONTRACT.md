# AHA Insight Contract

Dette dokumentet formaliserer dagens AHA-innsiktsmotor slik den allerede finnes i repoet, uten å innføre ny motor eller ny arkitektur.

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

Gyldige verdier:
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

## raw_terms vs concepts

- `raw_terms`: råord/overflateord, ofte høy recall, lav semantisk presisjon.
- `concepts`: meningsenheter/begreper med høyere semantisk verdi.

I embedding og analyse prioriteres concepts høyere enn raw_terms.

## claims

`claims` er påstands-laget: eksplisitte utsagn som kan spores, sammenlignes og motsies over tid.

## patterns

`patterns` er gjentakende tekstlige/semantiske mønstre (f.eks. frekvens, kontraster, tilbakevendende struktur).

## markers

`markers` er signalmarkører (f.eks. modalitet, symbolske trekk, nøkkelindikatorer) for filtrering og senere scoring.

## merge_suggestions

`merge_suggestions` er forslag om at to insights sannsynligvis representerer samme tanke.

Lifecycle:
- forslag registreres som `pending`
- bruker kan bekrefte (`confirmed`) eller avvise (`dismissed`)
- ingen auto-merge

Ved bekreftet merge settes kilde-insight med `merged_into` og ekskluderes fra aktive lister.

## emne_suggestions

`emne_suggestions` er forslag om emne-tilknytning.

Lifecycle:
- forslag legges inn med `suggested`
- bruker kan bekrefte (`confirmed`) eller avvise (`dismissed`)
- kun bekreftede forslag løftes til `emner[]`
