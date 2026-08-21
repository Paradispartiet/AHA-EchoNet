# AHA analyse- og innsiktskvalitet — implementert kontrakt

Status: **7 av 7 kvalitetskontrakter er implementert, men live end-to-end etterlevelse er ikke produksjonsverifisert**.

Dette dokumentet beskriver den operative kontrakten. Det er ikke en påstand om at alle analyser alltid blir perfekte; kontrakten bestemmer hvordan AHA skal oppdage, forbedre, avgrense og synliggjøre kvalitet.

En live audit 2026-08-21 viste at den aktive Chat-komposisjonen fortsatt kan bryte kontrakten gjennom stale afterwork/subject data, metadata som innsikt, svake begreper og feilaktig godkjent kilde-/temastatus. Kontrakten er derfor implementert som lag, men full produksjonsetterlevelse er fortsatt åpen. Autoritativ utbedrings- og releaseplan: [`AHA_ANALYSIS_KNOWLEDGE_PRODUCTS_V2_PLAN_2026-08-21.md`](./AHA_ANALYSIS_KNOWLEDGE_PRODUCTS_V2_PLAN_2026-08-21.md).

## 1. Lærende kvalitetsprofil

Modul: `aha_analysis_quality_profile_v1`

AHA samler brukerens eksplisitte vurderinger:

- nyttig
- for generell
- feil tolket
- mangler belegg

Signalene oppsummeres lokalt, både globalt og per fagdomene. Når det finnes tilstrekkelig grunnlag, skjerpes tersklene for spesifisitet, kildebelegg eller konservativ tolkning.

Grenser:

- ingen automatisk modelltrening
- ingen rå kildetekst i kvalitetsprofilen
- ingen synk til EchoNet eller tredjepart
- små utvalg aktiverer ikke aggressiv tilpasning

## 2. Belegg og sikkerhet under synlige påstander

Modul: `aha_quality_completion_v1`

Hver synlige tolkning kan vise:

- selve tolkningen
- direkte kildebelegg eller eksplisitt melding om at belegg mangler
- sikkerhetsnivå: høy, middels eller lav
- målt kildeoverlapp når dette finnes
- hva som fortsatt er usikkert

En påstand uten direkte belegg kan ikke fremstå som høyt sikker selv om et oppstrøms system har gitt den en sterk etikett.

## 3. Én kontrollert kvalitetsrevisjon

Kontrakter: `aha_analysis_quality_contract_v1`, `aha_analysis_quality_revision_v1` og `aha_visible_analysis_quality_gate_v1`

Synlig analyse vurderes blant annet etter:

- kildeforankring
- spesifisitet
- selvstendig bearbeiding fremfor kopiering
- handlingsverdi
- forskjellighet mellom punkter
- ærlig usikkerhet

Ved svak kvalitet forsøker AHA maksimalt én kontrollert forbedring før visning. Dersom kildegrunnlaget er for tynt, skal systemet undertrykke usikre påstander og be om mer konkret tekst i stedet for å fylle hullene.

## 4. Presise tankekart

Modul: `aha_adaptive_artifacts_v1`

Analysebaserte tankekart bruker presise begreper fra aktiv tekst og analyse. Generiske reserve-noder som «Tolkning», «Kildebelegg», «Usikkerhet», «Neste test» og «Hovedinnsikt» skal ikke brukes som innholdserstatning.

Relasjonstaksonomien er:

- `cause` — fører til
- `contrast` — står i kontrast til
- `support` — støtter
- `example` — er eksempel på
- `uncertainty` — gjør usikker

Relasjonene har synlig tekst og forklaring, ikke bare anonyme forbindelseslinjer.

## 5. Målstyrte stier

Modul: `aha_adaptive_artifacts_v1`

Stier velger egen struktur etter brukerens mål:

- forstå
- undersøke
- skrive
- lære
- gjennomføre

Hver måltype har egne steg, læringsutfall og ferdigkriterier. Systemet skal ikke gi en omskrevet variant av samme generelle læringsmal for alle formål.

Eksisterende lokale analyseartefakter oppgraderes når de har samme kildeidentitet, i stedet for å dupliseres ukontrollert.

## 6. Revisjonsbevisst langtidshukommelse

Moduler: `aha_memory_revision_v1` og `aha_memory_retrieval_guard_v1`

Nyere innsikt kan eksplisitt:

- korrigere eller erstatte en eldre innsikt
- bestride eller stå i konflikt med en eldre innsikt

Den eldre innsikten slettes ikke. Den beholdes i revisjonshistorikken og markeres som `superseded` eller `contested`. Den nyere innsikten beholder en sporbar relasjon tilbake.

Viktige sikkerhetsregler:

- semantisk likhet alene overskriver aldri historikk
- rettelser uten direkte mål-ID må både ha eksplisitt rettelsessignal og tilstrekkelig tematisk samsvar
- relasjonen er idempotent
- arkiverte, slettede, avviste, sammenslåtte, utdaterte, irrelevante, erstattede og bestridte innsikter filtreres fra aktiv lokal og semantisk retrieval
- inaktive innsikter brukes heller ikke som nye embeddings, merge-kandidater eller kalibreringsgrunnlag
- audit-historikken beholdes lokalt

## 7. Strengere språkredigering

Modul: `aha_quality_completion_v1`

Et konservativt sluttlag redigerer bare generert presentasjonstekst. Det kan:

- fjerne eksakte setnings- og listeduplikater
- redusere tomme overgangsfraser og oversatt AI-språk
- filtrere generiske nøkkelord når mer presise begreper finnes
- normalisere åpenbare språkfeil og unødig repetisjon

Kildesitater, kode, blokksitater, tekstfelt og elementer merket som ordrette kilder ligger utenfor språkredigeringen.

## Kilde- og kjøringsgrenser

Alle kvalitetslag må respektere den aktive analysekjøringen og dens kildeidentitet. Et resultat fra en eldre eller annen kjøring skal ikke kunne:

- vises som aktiv analyse
- lagres som aktivt etterarbeid
- eksporteres som om det tilhører gjeldende tekst
- forurense tankekart, stier eller fagkoblinger

## Leveranser

- PR #724 — ranger og kildeforankre innsiktskandidater
- PR #726 — lokal kvalitetsprofil, synlig belegg og én kontrollert revisjon
- PR #727 — steng senbundne eksporter ved integritetsbrudd
- PR #728 — eksplisitt sikkerhetsnivå og strengere analysespråk
- PR #729 — presise tankekart og målstyrte stier
- PR #730 — revisjonsbevisst langtidshukommelse og aktiv retrieval-guard

## Forventet videre arbeid

Kvalitetskontrakten er komplett, men skal nå håndheves gjennom den autoritative live AnalysisBundle-kjeden og valideres på reelle brukerdata. Nye feil skal først uttrykkes som konkrete regresjonsfixturer og tester. Den første obligatoriske regresjonen er en sekvensiell tidligere-kilde → Livsarket → hard reload-kjøring i samme lagringskontekst. Terskler kan kalibreres, men de grunnleggende grensene — kildebinding, én kontrollert revisjon, eksplisitt rettelse, audit-historikk og ingen skjult trening — skal ikke svekkes uten en ny versjonert kontrakt.
