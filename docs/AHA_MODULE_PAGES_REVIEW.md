# AHA module pages review fra Home entry points

Statusdato: 2026-06-07

## 1. Formål og avgrensning

Dette dokumentet kartlegger modulopplevelsen som åpnes fra AHA Home for:

- Lists / Lister
- Paths / Stier
- Groups / Grupper
- AHAavisa

Kartleggingen beskriver eksisterende runtime; den endrer den ikke. Denne PR-en endrer ikke `index.html`, modulenes HTML-sider, `js/`, `css/`, sync behavior, database-/write-flow eller module behavior. Den legger ikke til features og aktiverer ikke auto-sync.

AHA Home- og Sync Hub-runden er lukket før denne kartleggingen. Sync Hub er operational/gated, manual sync er database-wired og audit-backed, og auto-sync finnes ikke. Videre arbeid skal derfor handle om modulopplevelse, ikke mer Sync Hub-scaffolding.

## 2. Kilder som er gjennomgått

Primærkartleggingen bygger på:

- `index.html`
- `js/ahaDashboard.js`
- `js/ahaModules.js`
- `js/ahaLists.js`
- `js/ahaPaths.js`
- `js/ahaGroups.js`
- `js/ahaAvisa.js`
- `js/ahaRepository.js`
- `lists.html`, `paths.html`, `groups.html`, `avisa.html`
- `css/aha-dashboard.css`
- `css/aha-lists.css`, `css/aha-paths.css`, `css/aha-groups.css`, `css/aha-avisa.css`
- relevante AHA-dokumenter, særlig `AHA_IMPLEMENTATION_STATUS.md`, `AHA_MODULE_MATURITY_MATRIX.md`, `AHA_MODULES_README.md`, `AHA_SYSTEM_OVERVIEW.md` og `AHA_SYNC_HUB_PLAN.md`

## 3. Home entry points

### 3.1 Felles entry point

`index.html` har en venstre modulmeny med mount-id `aha-modules-grid`. `js/ahaDashboard.js` bygger module health og kaller `AHAModules.renderMenu()`. `js/ahaModules.js` eier modulregisteret, sorteringen, lenkene og health badge-renderingen.

De fire modulene åpnes som vanlige lenker fra modulmenyen:

| Home-navn | Modul-id | Home-lenke | Destinasjon | Modulregisterstatus |
|---|---|---|---|---|
| Lister | `lists` | hele modulkortet | `lists.html` | `active`, phase 2 |
| Stier | `paths` | hele modulkortet | `paths.html` | `active`, phase 2 |
| Grupper | `groups` | hele modulkortet | `groups.html` | `active`, phase 2 |
| AHAavisa | `avisa` | hele modulkortet | `avisa.html` | `active`, phase 2 |

Kortene har ikon, tittel, kort beskrivelse og health badge. Ingen av disse fire har en egen Home-CTA utenfor modulmenyen, og ingen har deep link til et bestemt objekt eller en create-flow.

### 3.2 Rekkefølge og synlighet

`AHAavisa` er eksplisitt med i modulmenyens prioriterte rekkefølge. `Lister`, `Stier` og `Grupper` er ikke i `PREFERRED_ORDER` og sorteres derfor alfabetisk etter de prioriterte modulene sammen med andre ikke-prioriterte moduler. På skjermbredder under 820 px blir modulmenyen en horisontalt scrollbar rad med kort på fast bredde. Entry points finnes fortsatt, men modulene som ikke er prioritert kan ligge utenfor første viewport og kreve horisontal scrolling.

### 3.3 Hva health badges faktisk betyr

For Lists, Paths, Groups og AHAavisa kommer badgegrunnlaget fra Sync Hubs lokale dry-run-inspeksjon av:

- `aha_lists_v1`
- `aha_paths_v1`
- `aha_groups_v1`
- `aha_articles_v1`

Mulige Home-badges er `Ready`, `Warning`, `Blocked`, `Empty`, `Missing` og `Unknown`, eventuelt med antall. For disse modulene betyr de i praksis:

- **Ready:** et lesbart lokalt dataset har minst ett aktivt objekt og ingen valideringsfeil.
- **Warning:** lokal struktur kan leses, men valideringen har advarsler.
- **Blocked:** lokal JSON/struktur eller validering har feil.
- **Empty:** lokal nøkkel finnes, men har ingen aktive objekter.
- **Missing:** lokal nøkkel finnes ikke.
- **Unknown:** health kunne ikke klassifiseres.

Badgen er dermed **lokal dataset health**, ikke et bevis på at modulsiden er funksjonelt komplett, at data er lagret i database, eller at siste manuelle sync lyktes. Dette skillet er ikke tydelig på modulsidene i dag.

## 4. Samlet status

Statusskalaen i denne reviewen betyr:

- **ready:** tydelig og helhetlig modulopplevelse uten vesentlige kjente hull.
- **usable:** kjerneoppgaven kan gjennomføres, men UX/status/robusthet trenger opprydding.
- **partial:** viktige deler fungerer, men modulens lovede betydning eller hovedflyt er bare delvis implementert.
- **scaffold:** hovedsakelig skall eller placeholder.
- **broken:** kjent hovedflyt kan ikke brukes som tiltenkt.
- **unknown:** implementasjonen kan ikke vurderes sikkert fra eksisterende kode/dokumentasjon.

| Modul | Reviewstatus | Kort begrunnelse |
|---|---|---|
| Lists | **usable** | Lokal oppretting, visning, referanser, sletting og gruppekobling fungerer, men sync-/feilstatus mangler og sidehierarkiet prioriterer «Tilbake» over modulens create-action. |
| Paths | **usable** | Lokale stier med ordnede steg kan opprettes og vedlikeholdes, men struktur/progresjon er enkel, syncstatus er usynlig og empty/error UX er svak. |
| Groups | **partial** | Lokale grupper, medlemmer, referanser, arbeidsrom og AHAavisa-utkast finnes, men ekte medlemskap/deling finnes ikke, siden er tett og teknisk, og betydningen «gruppe» er større enn den implementerte lokale planleggingsflaten. |
| AHAavisa | **partial** | Utkast, body, referanser, status og lokale publiseringslag finnes, men publisering er kun en lokal statusmarkering, arbeidsflaten er action-tung, og data-/syncstatus er ikke synlig. |

Ingen av de fire vurderes som `ready`, `scaffold`, `broken` eller `unknown`.

## 5. Ønsket module UX-prinsipp

Alle AHA-modulsider bør følge samme lesbare shell, i denne rekkefølgen:

1. **Module title** – ett stabilt navn som samsvarer med Home.
2. **Short purpose** – én kort setning om brukerens mål, uten fase-/implementasjonsspråk.
3. **Health/status badge** – skill mellom lokal data, database-/syncstatus og funksjonell begrensning.
4. **Primary action** – én tydelig handling som starter modulens kjerneoppgave.
5. **Recent/important items** – relevante objekter eller oversikt før avanserte kontroller.
6. **Empty state** – forklar hva modulen er, hvorfor den er tom og hva brukeren skal gjøre.
7. **Details/advanced only when needed** – metadata, tekniske kildestrenger, timestamps, filtre og sekundær administrasjon skal ikke dominere første viewport.

Et normalisert shell bør i tillegg ha konsekvent Home-backlink, heading hierarchy, statusplassering, action hierarchy, focus treatment og mobil oppførsel. Dette skal være neste PR, ikke implementeres her.

## 6. Lists / Lister

### 6.1 Eierskap, entry point og mount

| Felt | Kartlegging |
|---|---|
| Home-visning | Modulkortet `Lister` i `aha-modules-grid` |
| Entry point | Hele kortet lenker til `lists.html` |
| JS-eier | `js/ahaLists.js`; `js/ahaGroups.js` lastes også for «legg liste i gruppe» |
| Side/mount | Statisk create-/stats-shell i `lists.html`; listekort mountes i `#lists-list` |
| Andre sentrale ids | `#list-create-form`, `#lists-refresh`, `#lists-count`, `#list-items-count` |
| Lagringsnøkkel | `aha_lists_v1` |
| Home health | Lokal dry-run av `aha_lists_v1` |

### 6.2 Data som leses

Lists leser selve listene fra `aha_lists_v1`. For valg av listepunkter leser modulen også lokale data fra:

- `aha_insight_chamber_v1`
- `aha_notes_v1`
- `aha_feed_posts_v1`
- `aha_gallery_v1`
- `aha_insta_posts_v1`

`js/ahaGroups.js` leser `aha_groups_v1` slik at en hel liste kan legges som referanse i en gruppe.

Listemodellen har tittel, type, beskrivelse, tags, timestamps, items, source/meta og tombstone-felt. Listepunkter viser tittel, type, source og referanse-id.

### 6.3 Actions og action hierarchy

**Faktisk kjernehandling:** opprette en liste med `Lag liste`.

**Primary action i dagens visuelle shell:** `Tilbake til AHA Home` er stylet som primary i topppanelet. Selve `Lag liste`-knappen mangler tilsvarende eksplisitt primary-styling. Handlingshierarkiet er derfor snudd i forhold til modulens formål.

Sekundære actions:

- Oppdater lokal render.
- Slett liste via tombstone.
- Legg et tilgjengelig AHA-objekt til i listen.
- Fjern et listepunkt.
- Legg hele listen som referanse i en gruppe.

Det finnes intern `updateList()`, men ingen generell UI for å redigere tittel, type, beskrivelse eller tags etter oppretting.

### 6.4 Empty states og error states

Når ingen aktive lister finnes, viser mounten: `Ingen lister ennå. Opprett en liste over.` Dette er handlingsrettet, men visuelt et generisk panel og uten egen knapp/fokusflyt tilbake til skjemaet.

På hvert listekort kan manglende beskrivelse vises som `Ingen beskrivelse`, tomme items som `Ingen punkter i listen`, og manglende grupper med lenke til Groups.

Error states er i praksis ikke synlige:

- ugyldig localStorage JSON faller stille tilbake til tomt datasett;
- repository write-feil fanges eller ignoreres uten brukerstatus;
- manglende repository gir bare lokal drift;
- add/remove-feil returnerer ofte `null` uten inline feedback;
- sletting har ingen bekreftelse eller undo.

### 6.5 Persistens og syncstatus

Modulen er **editable og localStorage-first**. Alle UI-writes lagres først i `aha_lists_v1`. Scriptet har repository-hooks (`saveList`, `loadLists`) og `syncFromDatabase()` med latest-action merge/tombstones.

Den selvstendige `lists.html` laster imidlertid ikke config/db/auth/repository-script, og siden kaller ikke `syncFromDatabase()` ved oppstart eller via `Oppdater`. I denne konkrete siden betyr `Oppdater` bare ny lokal render. Runtime-opplevelsen på modulsiden er derfor lokal, selv om repository-støtte finnes i kodebasen og kan brukes når scriptet kjøres i en kontekst der `AHARepository` er tilgjengelig.

Ingen sideindikator forklarer:

- localStorage versus database;
- om repository er tilgjengelig;
- siste sync;
- pending/failed write;
- at Home-badgen kun validerer lokalt datasett.

### 6.6 UX, mobile/tablet og accessibility

Styrker:

- native labels i create-formen;
- responsiv `auto-fit`-grid for skjema og stats;
- tydelige korttitler, type- og antallsbadges;
- listepunkter er synlige med kilde/type.

Utfordringer:

- tekniske typeverdier (`favorites`, `shared_later`) vises direkte;
- rå ISO-timestamps og source-identifikatorer gir teknisk støy;
- select for alle tilgjengelige objekter kan bli svært lang;
- create-formen kommer før eksisterende/recent items;
- knapper for sletting/fjerning mangler bekreftelse og tydelig destructive semantics;
- dynamiske statusendringer har ikke dokumentert live region;
- ingen programmatisk status/health inne på siden;
- to-kolonners minimumsbredde på 220 px kan bli trang på små skjermer før gridet kollapser.

### 6.7 Første opprydding

Behold funksjonene, men normaliser shell og action hierarchy først: tittel/purpose/status, `Lag liste` som primary action, Home som sekundær navigasjon, eksisterende/recent lists før avansert metadata, og tydelig lokal data-/syncforklaring.

## 7. Paths / Stier

### 7.1 Eierskap, entry point og mount

| Felt | Kartlegging |
|---|---|
| Home-visning | Modulkortet `Stier` i `aha-modules-grid` |
| Entry point | Hele kortet lenker til `paths.html` |
| JS-eier | `js/ahaPaths.js`; `js/ahaGroups.js` lastes for gruppekobling |
| Side/mount | Statisk create-/stats-shell i `paths.html`; stier mountes i `#paths-list` |
| Andre sentrale ids | `#path-create-form`, `#paths-refresh`, `#paths-count`, `#path-steps-count` |
| Lagringsnøkkel | `aha_paths_v1` |
| Home health | Lokal dry-run av `aha_paths_v1` |

### 7.2 Data som leses og path structure

Paths leser stier fra `aha_paths_v1`. Tilgjengelige steg bygges fra lokale:

- insights i `aha_insight_chamber_v1`;
- lists i `aha_lists_v1`;
- notes i `aha_notes_v1`.

En sti har tittel, type, beskrivelse, tags, timestamps og en ordnet `steps`-array. Hvert steg har tittel, type, source, refId, order og addedAt. Renderingen viser stegene som en nummerert/ordnet liste med kilde og type.

Strukturen er forståelig på grunnnivå: en sti er en navngitt sekvens av referanser. Den viser derimot ikke progresjon, fullført/aktivt steg, varighet, avhengigheter eller drag-and-drop/reordering. «Sti», «rute» og «sekvens» forklares ikke utover purpose-teksten.

### 7.3 Actions og action hierarchy

**Faktisk kjernehandling:** opprette en sti med `Lag sti`.

`Lag sti` er stylet primary i skjemaet, men topppanelet bruker også primary-styling på `Tilbake til AHA Home`. Modulen har dermed to visuelt primære handlinger, hvor navigasjon vises før kjernehandlingen.

Sekundære actions:

- Oppdater lokal render.
- Slett sti via tombstone.
- Legg til steg fra innsikt/liste/notat.
- Fjern steg.
- Legg hele stien som referanse i en gruppe.

Det finnes ingen UI for å omorganisere steg eller redigere path metadata etter oppretting.

### 7.4 Empty states og error states

Tom hovedtilstand er `Ingen stier ennå. Opprett en sti over.` Hvert tomt path-kort viser at stien ikke har steg. Manglende grupper gir lenke til Groups.

Som i Lists er error handling hovedsakelig stille fallback:

- ugyldig localStorage blir tomt datasett;
- repository-feil vises ikke;
- ugyldige/dupliserte steg gir ingen tydelig brukerfeil;
- delete/remove mangler confirm/undo;
- «Oppdater» gir ingen suksess-/feilstatus.

Empty state er brukbar, men ikke sterk nok til å forklare hva en god første sti er eller foreslå et eksempel.

### 7.5 Persistens og syncstatus

Modulen er **editable og localStorage-first**. Writes går til `aha_paths_v1`; repository-hooks og `syncFromDatabase()` finnes med merge/tombstone-håndtering.

`paths.html` laster ikke repository/auth/db-laget, og `Oppdater` kaller bare lokal render. Databasekapabilitet i scriptet er derfor ikke det samme som aktiv databasesynk på siden. Siden viser ingen data source, pending write, siste sync eller fallback-status.

### 7.6 UX, mobile/tablet og accessibility

Styrker:

- eksplisitte `for`/`id`-labels i create-formen;
- path steps og rekkefølge er synlig;
- flex-wrap brukes for metadata;
- select kan krympe med `min-width: 0`.

Utfordringer:

- rå type-/sourceverdier og ISO-timestamps er tekniske;
- stegvalg serialiserer flere felter i option value, som er robusthets-/vedlikeholdsgjeld;
- lange steg- eller source-navn kan gjøre kort tette;
- add-row må håndtere select + knapp + gruppekontroller på små skjermer uten en eksplisitt modulspesifikk breakpoint;
- ingen tydelig aktiv/progress state gjør sekvensen mindre handlingsorientert;
- dynamiske tilbakemeldinger er ikke live-regioner;
- destructive actions mangler confirm/undo og forklaring av tombstone;
- ingen health/status på selve siden.

### 7.7 Første opprydding

Normaliser shell og forklar «sti» som en ordnet arbeids-/læringssekvens. Gjør `Lag sti` til eneste primary action, vis eksisterende stier og første neste steg tydelig, og flytt tekniske metadata ned.

## 8. Groups / Grupper

### 8.1 Eierskap, entry point og mount

| Felt | Kartlegging |
|---|---|
| Home-visning | Modulkortet `Grupper` i `aha-modules-grid` |
| Entry point | Hele kortet lenker til `groups.html` |
| JS-eier | `js/ahaGroups.js`; `js/ahaAvisa.js` lastes for å opprette AHAavisa-utkast fra en gruppe |
| Side/mount | Nesten hele siden rendres inn i `#groups-root` |
| Navigasjon internt | Aktiv gruppe lagres som hash/deep link og åpnes som arbeidsrom |
| Lagringsnøkkel | `aha_groups_v1` |
| Home health | Lokal dry-run av `aha_groups_v1` |

### 8.2 Hva grupper betyr i AHA

I dagens runtime er en gruppe/sirkel et **lokalt organiserings- og planleggingsrom** med:

- navn, type, beskrivelse og tags;
- lokale medlemmer med rolle og status;
- referanser til insights, lists, paths, articles, notes og feed;
- et arbeidsrom med bibliotek, aktivitet og rapport;
- mulighet til å lage lokalt AHAavisa-utkast fra gruppen.

Det er ikke et faktisk flerbrukerrom. Ekte invitasjon, identitet, tilgangskontroll, servermedlemskap, samarbeid og deling er ikke bygget. UI sier dette i privacy-/purpose-tekst, men Home-beskrivelsen «Fellesrom for samarbeid, deling og kollektiv EchoNet-bygging» kan likevel skape en større forventning enn modulsiden oppfyller.

### 8.3 Membership og innhold

Medlemskap er synlig per gruppekort med navn, rolle og lokal status. Brukeren kan legge til og fjerne lokale medlemmer. Det finnes roller (`owner`, `editor`, `member`, `observer`), men runtime viser ingen rollebasert autorisasjon; rollen er metadata.

Innholdet er synlig som et delt bibliotek av referanser. Gruppekort viser både medlemmer og referanser, og arbeidsrommet filtrerer biblioteket etter innholdstype. Dette gir høy funksjonsdekning, men gjør overview-kortene lange og administrasjonstunge.

### 8.4 Actions og action hierarchy

**Faktisk kjernehandling:** opprette en lokal gruppe/sirkel. `Lag gruppe` er primary i create-formen.

Toppanelet styler også `Tilbake til AHA Home` som primary. Deretter finnes mange sideordnede handlinger:

- Oppdater.
- Velg og åpne aktiv gruppe.
- Åpne arbeidsrom.
- Slett gruppe.
- Legg til/fjern medlem.
- Legg til/fjern referanse.
- Filtrer bibliotek.
- Gå tilbake til oversikt.
- Lag AHAavisa-utkast fra gruppe.

Primary action er derfor forståelig i skjemaet, men ikke tydelig i den samlede siden.

### 8.5 Empty states og error states

Når ingen grupper finnes, viser aktiv-gruppepanelet `Ingen grupper finnes ennå`, men den tomme kortlisten gir ingen egen rik empty state. Medlemmer og referanser har separate `Ingen ... ennå`-rader.

Error-/statusdekningen er begrenset:

- localStorage parse-feil faller stille tilbake;
- repository-feil vises ikke;
- add/remove/delete har lite eller ingen feedback;
- draft-oppretting har en inline suksess-/feiltekst, men den er ikke dokumentert som live region;
- ingen bekreftelse eller undo ved sletting;
- ingen forklaring dersom en referansekilde mangler eller er slettet;
- privacy-tekst beskriver funksjonell begrensning, men ikke data source/sync state.

### 8.6 Persistens og syncstatus

Groups er **editable, localStorage-first og bare delvis sosialt implementert**. Writes går til `aha_groups_v1`. Repository-hooks og `syncFromDatabase()` finnes.

`groups.html` laster ikke auth/db/repository-script. Den laster `ahaAvisa.js`, men ikke `ahaPrivacy.js`, slik at AHAavisa-scriptets privacy-helper kan mangle i denne konteksten; optional chaining hindrer crash, men dette understreker at sideavhengighetene er implisitte. Ingen automatisk eller eksplisitt databasesync startes fra Groups-siden.

Home health beskriver lokal gruppefil, ikke medlemskap, samarbeid, repository readiness eller siste sync.

### 8.7 UX, mobile/tablet og accessibility

Styrker:

- medlemskap og referanser er faktisk synlige;
- arbeidsrom gir et tydeligere detaljnivå enn bare kortlisten;
- filters, badges og forms bruker native controls;
- grids bruker `auto-fit`, og flere action-rader kan wrappe.

Utfordringer:

- «Fase 4A» er intern teknisk tekst i modulheaderen;
- `Grupper / Sirkler` avviker fra Home-navnet `Grupper`;
- hele siden rendres på nytt ved mange actions, noe som sannsynligvis flytter fokus til document/body og mister brukerens posisjon;
- overview viser create-form, stats, selector, full member management og full reference management samtidig;
- trekolonne inline-form (`2fr 1fr auto`) har ingen eksplisitt smalskjermskollaps;
- roller/status/type/source vises som interne engelske verdier;
- knapper og forms som genereres dynamisk har få eksplisitte accessible names utover synlig tekst og begrenset statusannonsering;
- destructive actions er visuelt like sekundærhandlinger;
- hash-basert arbeidsrom har ikke dokumentert fokusflytting til workspace-heading.

### 8.8 Første opprydding

Normaliser først shell og språk: `Grupper`, kort purpose «lokale organiseringsrom», tydelig `Local only`/`Deling ikke aktiv`-status og én primary action. Flytt medlems-/referanseadministrasjon til valgt arbeidsrom eller details, slik at gruppeoversikten viser recent/important groups først.

## 9. AHAavisa

### 9.1 Eierskap, entry point og mount

| Felt | Kartlegging |
|---|---|
| Home-visning | Modulkortet `AHAavisa` i `aha-modules-grid` |
| Entry point | Hele kortet lenker til `avisa.html` |
| JS-eier | `js/ahaAvisa.js`; `js/ahaGroups.js` brukes for gruppekobling; `js/ahaPrivacy.js` brukes for publiseringsbegrensning |
| Side/mount | Statisk create-/overview-shell i `avisa.html`; artikler mountes i `#avisa-articles` |
| Andre sentrale ids | `#avisa-create-btn`, `#avisa-refresh-btn`, stats-, filter- og warning-ids |
| Lagringsnøkkel | `aha_articles_v1` |
| Home health | Lokal dry-run av `aha_articles_v1` |

### 9.2 Artikler, innlegg og utkast

Modulen har artikkelutkast med:

- tittel, section, summary, body og tags;
- statusene `draft`, `review`, `ready`, `published_local`;
- publiseringslagene `personal`, `group`, `public_candidate`;
- references til insights, lists, paths og notes;
- metadata som kan knytte et utkast til en gruppe.

Dette er en artikkel-/utkastmodul, ikke en feed av publiserte innlegg. `published_local` sender ikke data ut; det markerer bare lokal status i nettleseren. UI forklarer dette tydelig i overview-panelet.

### 9.3 Actions og action hierarchy

**Faktisk kjernehandling:** `Lag artikkelutkast`.

Toppanelet styler `Tilbake til AHA Home` som primary, mens create-knappen ikke har eksplisitt primary-klasse. Modulen har deretter mange likestilte actions:

- Oppdater lokal render.
- Lag utkast.
- Lagre brødtekst.
- Flytt mellom draft/review/ready/published_local.
- Velg publiseringslag.
- Legg til/fjern referanser.
- Legg artikkel som referanse i gruppe.
- Slett artikkel.
- Filtrer på section og publiseringslag.

Handlingsmengden gjør at den viktigste neste handlingen per artikkel ikke er tydelig.

### 9.4 Empty states og error states

Tom hovedtilstand er `Ingen artikkelutkast ennå. Opprett et utkast over.` Manglende grupper peker til Groups. Tomme references og body håndteres inne i artikkelkortene.

Error states er svake:

- tom tittel gjør at create returnerer uten synlig valideringsmelding;
- localStorage parse-feil blir tomt datasett;
- repository write-/load-feil vises ikke;
- statusendringer og body-save har ingen vedvarende suksess-/feilstatus;
- sletting mangler confirm/undo;
- public candidate kan blokkeres av privacy-regel, men feedback og statusplassering er ikke del av et felles module health-mønster.

### 9.5 Persistens og syncstatus

AHAavisa er **editable og localStorage-first**, med lokal statusflyt og lokal publiseringsmarkering. Writes går til `aha_articles_v1`. Repository-hooks og `syncFromDatabase()` finnes.

`avisa.html` laster ikke auth/db/repository-script og kaller ikke database-sync. `Oppdater` rerendrer lokal state. Siden er derfor ikke «synced» i sin selvstendige runtime selv om repository-støtte finnes og Sync Hubs manuelle databaseflow kan håndtere modulen utenfor denne sideflyten.

Ingen artikkelsideindikator viser local/database source, siste sync, pending write eller Home-healthforklaringen.

### 9.6 UX, mobile/tablet og accessibility

Styrker:

- lokal publiseringsbegrensning forklares eksplisitt;
- status- og layer-tall gir oversikt;
- layer- og section-filtre har group-labels;
- textarea er full bredde, og flere action-/filterrader kan wrappe.

Utfordringer:

- ni statsbadges, to filtergrupper og tekniske statusverdier gjør overview tett;
- article cards kombinerer redigering, workflow, layers, references, groups og delete i samme flate;
- `.avisa-ref-add select` har `min-width: 260px` uten eksplisitt smalskjermoverride;
- header/action rows kan bli tette med lange titler;
- create labels bruker wrapper-labels, men feltene har ikke ids koblet med `for`;
- statusendringer, save og filterendringer annonseres ikke tydelig til skjermleser;
- re-render kan miste fokus etter hver handling;
- engelske/interne status- og sourceverdier blandes med norsk UI;
- «publisert lokalt» kan fortsatt misforstås som publisering hvis forklaring ikke er synlig nær actionen.

### 9.7 Første opprydding

Normaliser shell, gjør `Lag artikkelutkast` til primary action, vis recent drafts først og reduser default-kortet til tittel, status, summary og tydelig neste action. Flytt references, layers og avansert workflow til details/advanced.

## 10. Cross-module issues

### 10.1 Inkonsistente titles og shell

- Home bruker `Lister`, `Stier`, `Grupper`, `AHAavisa`.
- Modulheaders bruker både `AHA Modul`, `AHA Stier`, `Fase 4A` og ingen felles eyebrow.
- Groups bruker `Grupper / Sirkler`, mens Home bruker `Grupper`.
- Maksbredde og layoutklasse varierer via inline style og ulike module CSS-filer.
- Home-backlink er visuelt primary på alle sidene, selv om create-action er modulens egentlige primary action.

### 10.2 Inkonsistente empty states

Alle fire bruker en tekstlig «Ingen ... ennå»-variant, men:

- de ligger i ulike strukturer;
- de har ikke en felles ikon/title/purpose/action-mal;
- de forklarer sjelden hva et godt første objekt er;
- de flytter ikke fokus eller tilbyr en direkte create-CTA i empty state;
- Groups mangler en samlet empty state for hele kortlisten.

### 10.3 Uklare primary actions

Create er kjernehandling i alle fire moduler, men Home-backlink får ofte strongest visual treatment. På objektkortene konkurrerer delete, add, remove, status, group og refresh med den viktigste neste handlingen.

### 10.4 Manglende eller misvisende health/status

Home har health badges, men modulsidene viser dem ikke. Home-badgen representerer lokal dataset health og count, ikke:

- repository connection;
- siste manual sync;
- write-resultat;
- funksjonell modenhet;
- sosial/publishing readiness.

Groups og AHAavisa har særlig behov for en separat capability-status som `Local only`, fordi «deling» og «publisering» ellers kan misforstås.

### 10.5 For mye teknisk tekst

Gjennomgående teknisk støy:

- faseetiketter;
- engelske enumverdier;
- source-id-er;
- refId-er;
- rå ISO-timestamps;
- storage-/publiseringsbegreper uten samlet forklaring.

Dette bør være details/advanced, ikke hovedinnhold.

### 10.6 Mobile/tablet layout

- Home gjør modulmenyen horisontalt scrollbar under 820 px; ikke-prioriterte entry points kan være utenfor første viewport.
- Modulene har delvis fleksible grids, men mangler et felles page-shell-breakpoint.
- Groups sin trekolonne inline-form og AHAavisa sin 260 px select er konkrete smalskjermrisikoer.
- Mange actions i hvert kort øker høyde, wrapping og scrollmengde.
- Inline `max-width` varierer mellom sidene og bør normaliseres.

### 10.7 Accessibility, labels og focus

- Native labels finnes mange steder, men er ikke konsekvent koblet med `for`/`id`.
- Dynamiske save/error/success/statusmeldinger mangler et gjennomgående `aria-live`-mønster.
- Full re-render etter handlinger kan miste fokus og kontekst.
- Destructive actions mangler konsekvent navn, bekreftelse/undo og visuell differensiering.
- Filter-/statusknapper kommuniserer ikke alltid selected/current state utover CSS-klasse.
- Health/status på Home er tilgjengelig merket, men samme kontekst følger ikke brukeren inn på modulsiden.

### 10.8 Data source ambiguity

Alle modulscript har både localStorage og optional repository-støtte, mens de selvstendige sidene bare laster localStorage-konteksten. Dokumentasjon og tester omtaler repository-persistens, men en bruker på modulsiden får ikke vite at:

- lokal write skjer umiddelbart;
- repository kanskje ikke er lastet;
- `Oppdater` ikke er sync;
- Home health er lokal inspeksjon;
- manual sync skjer i den gated Sync Hub-flyten, ikke automatisk her.

Dette bør avklares med copy/status i en senere runtime-PR, uten å introdusere auto-sync.

### 10.9 Duplicate UI/action patterns

Create forms, refresh, stats, cards, badges, add-reference-selects, group-linking, delete/remove og empty states er implementert separat. Lik funksjon har ulike klasser, ordlyd, hierarki og feedback. Før modulspesifikke feature-PR-er bør disse mønstrene få et normalisert shell og felles UX-kontrakt.

## 11. Hva som er ferdig, halvferdig eller tomt

| Område | Ferdig nok | Halvferdig / uklart | Tomt / finnes ikke |
|---|---|---|---|
| Home entry points | Alle fire kan åpnes fra modulmenyen | Prioritering/synlighet på små skjermer varierer | Egen quick action/deep link per modul |
| Lists | Lokal CRUD-ish flyt, referanser og gruppekobling | Edit metadata, feedback, syncforståelse | Aktiv database-/syncstatus på siden |
| Paths | Lokal create, ordered steps, remove og gruppekobling | Progresjon, reorder, path semantics, feedback | Aktiv database-/syncstatus på siden |
| Groups | Lokale grupper, medlemmer, referanser, workspace, report og draft-kobling | «Gruppe» som sosialt konsept, rollebetydning, sidehierarki | Ekte invitasjon, samarbeid og deling |
| AHAavisa | Lokale utkast, body, references, workflow og layers | Tydelig neste action, publish semantics, feedback | Ekte ekstern publisering |
| Cross-module status | Home viser lokal health | Sammenheng mellom Home badge og modulside | Felles module status shell |
| Error handling | Defensive fallbacks hindrer flere crashes | Feil er i stor grad usynlige | Felles inline error/retry-pattern |

## 12. Anbefalt videre PR-rekkefølge

Arbeidet bør deles i små PR-er og ikke starte mer Sync Hub-scaffolding:

1. **`chore: normalize AHA module page shells`** — anbefalt neste PR. Normaliser title, purpose, Home-backlink, health/capability-statusplass, primary action-slot, recent/important-slot og advanced/details-slot uten å endre dataflyt.
2. **`chore: standardize AHA module empty states`** — én mal med forklaring, trygg create-CTA og tilgjengelig focus/status.
3. **`chore: clarify primary actions for AHA modules`** — én primary action per side og tydelig sekundær/destructive hierarchy.
4. **`chore: improve AHA module mobile layout`** — felles breakpoints, stable wrapping, full-width controls ved behov og mindre action-overload.
5. **`feat: improve Lists module experience`** — tydeligere items, metadataredigering, feedback og forståelig lokal/syncstatus.
6. **`feat: improve Paths module experience`** — tydelig sekvens/progresjon, bedre stegstyring og forståelig lokal/syncstatus.
7. **`feat: improve Groups module experience`** — avgrens local-only-betydning, forenkle overview/workspace og tydeliggjør membership/content.
8. **`feat: improve AHAavisa module experience`** — recent drafts, tydelig workflow, mindre action-støy og klar lokal publish-/syncstatus.

## 13. Ikke del av denne review-PR-en

Denne dokumentasjons-PR-en skal ikke brukes til å:

- endre `index.html`;
- endre modulenes HTML-sider;
- endre `js/` eller `css/`;
- endre sync behavior;
- endre database-/write-flow;
- endre module behavior;
- legge til features;
- slette moduler;
- aktivere auto-sync.

Neste anbefalte PR er:

```text
chore: normalize AHA module page shells
```

## 14. Oppfølging: module shell normalization gjennomført

`chore: normalize AHA module page shells` er gjennomført som en avgrenset UI-/strukturendring:

- Lists, Paths, Groups og AHAavisa har konsistente title-, purpose-, health-, action- og content-områder;
- empty/error-copy er kort og sanitert;
- eksisterende tekniske/local-only forklaringer i Groups og AHAavisa ligger under collapsed `Advanced details`;
- health bruker samme statusvokabular som modulmenyen, uten nye databasekall;
- mobile/tablet-layout har felles wrapping/stacking;
- sync-, write-, persistence-, adapter-, audit-, state machine- og retry-flow er uendret;
- auto-sync er fortsatt ikke innført.

Modulene trenger fortsatt egne feature-forbedringer senere: Lists trenger bedre metadataredigering/feedback, Paths trenger tydeligere progresjon og stegstyring, Groups trenger tydeligere avgrensning av local-only medlemskap/deling, og AHAavisa trenger en enklere workflow og tydeligere publish semantics. Disse forbedringene er ikke del av shell-normaliseringen.

Neste anbefalte PR er:

```text
chore: standardize AHA module empty states
```
