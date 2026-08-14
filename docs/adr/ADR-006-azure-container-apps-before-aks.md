# ADR-006: Azure Container Apps brukes før AKS

- Status: **Accepted**
- Dato: 14. august 2026
- Implementert: Nei
- Omfang: Backend Foundation v1 og senere produksjonsdrift

## Kontekst

Dagens frontend driftes på GitHub Pages, mens Node-backend og FastAPI-staging er beskrevet gjennom Render. Den langsiktige prosjektplanen peker på Azure for skalerbarhet, sikkerhet og institusjonelle krav.

AKS kan gi omfattende kontroll, men introduserer Kubernetes-drift, nettverk, clusteroppgraderinger, policyhåndtering og høyere operasjonell kompleksitet. Backend Foundation v1 trenger først og fremst stabil containerdrift, varige jobber, database, kø, hemmeligheter og observability.

## Beslutning

Første Azure-målarkitektur skal bruke administrerte plattformtjenester med **Azure Container Apps før AKS**.

Første foreslåtte tjenestekart:

| Azure-tjeneste | Ansvar |
|---|---|
| Azure Container Apps | NestJS API, Hasura dersom porten godkjennes, LangGraph-worker og FastAPI Engine |
| Azure Database for PostgreSQL Flexible Server | Canonical PostgreSQL-data og første pgvector-lag |
| Azure Service Bus | Varige analyse-, embedding-, sync- og publiseringsjobber |
| Azure Blob Storage | Vedlegg, eksportfiler og andre store objekter |
| Azure Key Vault | API-nøkler, databasehemmeligheter, certifikater og rotasjon |
| Azure Monitor / Application Insights | Metrics, tracing, feil, avhengigheter og jobbobservasjon |
| Azure Container Registry | Versjonerte og skannede container-images |

AKS vurderes bare dersom dokumentert behov ikke kan løses tilfredsstillende i Container Apps eller andre administrerte tjenester.

## Miljøer

Minst tre logiske miljøer skal skilles:

- `local/dev`
- `staging`
- `production`

Staging og production skal ha separate:

- databaser eller isolerte databaseinstanser
- køer og topics
- secrets
- identiteter
- storage containers
- telemetry-ressurser
- domener og tillatte origins

Produksjonsdata skal ikke kopieres til staging uten en egen anonymiserings- og godkjenningsprosess.

## Infrastructure as Code

Azure-infrastrukturen skal defineres i Git gjennom Bicep, Terraform eller annen eksplisitt valgt IaC-standard. Valget av språk kan avgjøres i en senere implementerings-ADR, men følgende gjelder uansett:

- ingen håndbygget produksjonsinfrastruktur som eneste sannhet
- alle miljøendringer skal være reviewbare
- secrets skal ikke ligge i repo eller state i klartekst
- drift skal kunne rekonstrueres fra dokumentert konfigurasjon
- rollback og destroy-beskyttelse skal være definert

## Identitet og secrets

- Managed Identity skal brukes der Azure-tjenester kan autentisere uten statiske secrets.
- Key Vault skal være canonical hemmelighetslager i Azure.
- Frontend får aldri service credentials.
- Nøkkelrotasjon skal være testbar uten kodeendring.
- Tilgang til production-secrets skal være minst mulig og auditert.

## Nettverk og datalokasjon

- Første produksjonsregion skal velges innen EU/EØS ut fra tjenestestøtte, databehandlerkrav og beredskap.
- Databasetrafikk og interne tjenester skal begrenses gjennom private eller kontrollerte nettverksgrenser der det er praktisk.
- Offentlige ingresspunkter skal ha eksplisitte CORS-, rate-limit- og autentiseringsregler.
- Rå forsknings- eller samtaledata skal ikke flyttes mellom regioner uten dokumentert formål og behandlingsgrunnlag.

## Jobbdrift

Analyse-, embedding-, sync- og publiseringsjobber skal være:

- idempotente
- restartbare
- sporbare med correlation/request ID
- bundet til bruker, tenant, kilde og samtykkescope
- beskyttet av retry-policy
- sendt til dead-letter ved vedvarende feil
- mulig å stoppe ved tilbaketrukket samtykke

Container Apps jobs eller varige worker-replikaer kan brukes etter faktisk arbeidsmønster. Jobbtilstanden skal ikke bare ligge i containerens minne.

## Observability

Før produksjonsaktivering skal systemet minst måle:

- request rate, latency og feil
- databaseforbindelser og spørringsbelastning
- kødybde og dead-letter
- AI-jobbvarighet, retries og kostnad
- embedding- og retrieval-latency
- auth- og permission-avvisninger
- sync-konflikter
- dataeksport og sletting
- deploymentversjon og migrasjonsversjon

Logger skal redigeres slik at rå samtaletekst, tokens og hemmeligheter ikke blir standardtelemetri.

## Backup og beredskap

Stagingporten skal inkludere:

- automatiske databasebackuper
- faktisk restore-test til separat miljø
- dokumentert RPO og RTO
- gjenoppretting av Blob Storage der nødvendig
- database migration rehearsal
- rollback for API og worker
- hendelseshåndteringsplan
- secret-rotasjon

En backup som aldri er gjenopprettet teller ikke som verifisert beredskap.

## AKS-port

AKS kan vurderes hvis minst ett dokumentert behov foreligger:

- selvhostet Milvus krever kontroll som Container Apps ikke gir
- avansert nettverk eller service mesh er nødvendig
- spesialisert GPU-/nodepool-drift er varig og kostnadseffektiv
- workload- eller compliancekrav krever Kubernetes-kontroll
- et kompetent driftsteam kan eie oppgraderinger, sikkerhet og beredskap

Valg av AKS krever ny ADR med kostnad, kompetansebehov, sikkerhetsmodell og rollback.

## Konsekvenser

### Positive

- lavere driftskompleksitet enn AKS
- naturlig containervei fra dagens tjenester
- eventdrevet skalering uten egen clusterdrift
- tydelig separasjon av API, workers, kø og database
- enklere staging før enterprise-pilot

### Kostnader og risiko

- plattformbegrensninger kan senere kreve flytting
- Azure-tjenester må kostnadsovervåkes
- IaC, observability og beredskap krever betydelig arbeid
- leverandørspesifikke integrasjoner må holdes utenfor domenelogikken

## Aktiveringsport

ADR-en kan markeres `Implemented` først når Azure staging har:

- reproducerbar IaC
- NestJS, worker og FastAPI med separate identiteter
- PostgreSQL med testet migrasjon
- varig kø og dead-letter-test
- Key Vault uten repo-secrets
- traces og metrics på tvers av tjenester
- backup og faktisk restore-test
- sikker containerbuild og sårbarhetsskanning
- EU/EØS-datalokasjon og nødvendige avtaler dokumentert
- null automatisk produksjonsdeling eller datamigrering
- rollback til tidligere stagingdrift

## Forkastede alternativer

### AKS som første Azure-steg

Forkastet fordi clusterdrift ikke er nødvendig for å validere Backend Foundation v1.

### Flytte til Azure før datamodellen er stabil

Forkastet. Hostingflytting løser ikke uklar canonical data, synk, samtykke eller idempotens.

### Azure som domeneavhengighet

Forkastet. Azure er driftsplattform; domene- og samtykkekontrakter skal kunne testes uavhengig av hosting.
