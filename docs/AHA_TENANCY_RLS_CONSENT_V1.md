# AHA Tenancy, RLS and Consent Contract v1

Status: **fail-closed kontrakt — ikke aktiv runtime**  
Dato: 14. august 2026

Denne kontrakten definerer hvordan det canonical `aha.*`-schemaet skal isolere brukere og arbeidsrom, hvilke rader en autentisert bruker senere kan lese direkte, og hvilke handlinger som krever et eksakt samtykkespor.

Leveransen aktiverer ikke frontendtilgang, kontoimport, synk, EchoNet-deling, Hasura eller NestJS. Den oppretter ingen table grants eller function grants. Alle sensitive writes forblir backend-only etter ADR-003.

Maskinlesbar matrise:

```text
docs/AHA_TENANCY_RLS_CONSENT_MATRIX_V1.json
```

SQL-migrering:

```text
supabase/migrations/20260814220000_aha_tenancy_rls_consent_v1.sql
```

## 1. Sikkerhetsmodellen

Kontrakten bruker flere lag samtidig:

```text
verifisert JWT
→ auth-provider + subject
→ canonical profile
→ aktivt workspace-medlemskap og rolle
→ RLS SELECT-policy
→ eventuelt aktivt, eksakt delingssamtykke
```

RLS er defense in depth. Det erstatter ikke:

- JWT-verifisering
- NestJS-domenevalidering
- samtykke- og formålskontroll
- idempotens
- audit
- rate limiting
- redigering av sensitive API-responser

## 2. Identitetsoppløsning

Den eneste brukeridentiteten som inngår i v1-policyene er et verifisert JWT-subjekt:

```text
request.jwt.claims.sub
+ request.jwt.claims.aha_provider
→ aha.profiles.auth_subject
+ aha.profiles.auth_provider
→ aha.current_profile_id()
```

For dagens Supabase-retning er default provider `supabase` når et gyldig `sub` finnes. En senere NestJS-/Azure-integrasjon kan sette en annen provider i den verifiserte requestkonteksten.

Følgende brukes **ikke** som autorisasjonskilde:

- `user_metadata`
- `raw_user_meta_data`
- profilens visningsnavn
- e-postadresse
- klientoppgitte rollefelt
- frontendtoggle

Arbeidsromroller hentes fra canonical PostgreSQL-tabeller for hvert request. De legges ikke som varig autorisasjonssannhet i et mulig gammelt JWT.

## 3. Tillitsgrense for request claims

`request.jwt.claims` er bare pålitelig når laget foran PostgreSQL har:

1. verifisert signaturen
2. kontrollert issuer og audience
3. kontrollert utløp og eventuell tilbakekalling
4. etablert databaseforbindelsen med en begrenset runtime-rolle
5. satt claims transaksjonslokalt for det aktuelle requestet

En frontend får aldri en direkte PostgreSQL-connection string og kan ikke få en rolle som kan sette sin egen autorisasjonskontekst gjennom SQL.

Dersom Supabase Data API brukes til senere read-only-spørringer, kommer claims fra Supabases verifiserte JWT-kontekst. Dersom NestJS bruker direkte databaseforbindelse, må NestJS verifisere JWT og sette requestkontekst på en transaksjonsbundet forbindelse.

## 4. PostgreSQL-roller og table-owner-grensen

PostgreSQL-superbrukere, roller med `BYPASSRLS` og normalt tabellens eier kan omgå RLS. Derfor gjelder følgende aktiveringsregel:

- produksjonsruntime skal bruke en dedikert `NOLOGIN`/least-privilege rolle eller tilsvarende rollemedlemskap
- runtime-rollen skal ikke eie `aha.*`-tabellene
- runtime-rollen skal ikke ha `BYPASSRLS`
- migration-/owner-rollen skal ikke brukes av webserveren
- service-/secret keys skal aldri være tilgjengelige i frontend

Schema v1 bruker ikke `FORCE ROW LEVEL SECURITY`, fordi migrerings- og beredskapsjobber fortsatt trenger et kontrollert ownerlag. Sikkerheten avhenger derfor også av streng rolle- og secret-håndtering.

## 5. Roller og arbeidsrom

Canonical roller og minimumsrang:

| Rolle | Rang | Tillatt nivå |
|---|---:|---|
| `observer` | 10 | lese arbeidsromdata |
| `member` | 40 | delta gjennom backendkommandoer |
| `editor` | 70 | redigere gjennom backendkommandoer |
| `owner` | 100 | administrere arbeidsrom og medlemmer |

`aha.workspace_role_rank(workspace_id)` vurderer:

- om profil er registrert owner
- aktivt medlemskap
- medlemskapets rolle
- arbeidsromstatus
- tombstones

Hjelpefunksjonene er:

```text
aha.can_read_workspace(...)
aha.can_edit_workspace(...)
aha.can_admin_workspace(...)
```

Bare read-funksjonen brukes i dagens direkte RLS-policyer. Edit/admin brukes til avgrensede leseflater som invitasjoner, sharing grants, feedback og jobbstatus; de gir ikke direkte databasewrite.

## 6. Direkte databaseoperasjoner

Kontrakten oppretter 36 `FOR SELECT`-policyer og ingen direkte:

- `INSERT`-policyer
- `UPDATE`-policyer
- `DELETE`-policyer
- `ALL`-policyer

Det betyr:

```text
RLS SELECT = mulig fremtidig read path
sensitive write = NestJS command boundary
```

I tillegg opprettes ingen grants. Funksjonenes standard-`EXECUTE` trekkes tilbake fra `PUBLIC`. Selv lesepolicyene er derfor inaktive til en senere leveranse oppretter en konkret, minst privilegert runtime-rolle og gir bare de nødvendige rettighetene.

## 7. Lesetilgang per datakategori

### Egen identitet

- Profil: bare egen aktive profil.
- Devices: bare devices knyttet til egen profil.
- Consent receipts: bare receipt-eier.
- Import batches/items: bare import-eier.
- Device sync cursors: bare device-eier.
- Data exports og deletion requests: bare request-eier.

### Arbeidsromdata

Aktive medlemmer/owner kan lese:

- arbeidsrom og medlemsliste
- samtaler, deltakere og meldinger
- source events og vedleggsmetadata
- analysekjøringer, påstander og kildebelegg
- publikasjoner i source-workspace

Invitasjoner er strengere: bare workspace-admin eller profil som allerede er registrert som accepted profile kan lese raden direkte. Før aksept formidles invitasjonen via token- og backendflyt, ikke en bred databasequery.

### Delbare objekter

Bare fire object types kan leses gjennom generic sharing grant i v1:

```text
insight
concept_list
knowledge_path
article
```

Rå samtaler, meldinger, source events, vedlegg og analysis evidence kan ikke gjøres til generiske share targets gjennom denne funksjonen.

En delt objektlesing krever samtidig:

- aktiv sharing grant
- ikke utløpt eller tilbakekalt grant
- aktivt medlemskap i target workspace
- aktivt og eksakt consent receipt
- korrekt source workspace
- nøyaktig object type og object ID

Barnedata som insight versions, list items, path steps og article versions leses bare når parentobjektet er lesbart.

En insight relation vises bare når begge tilknyttede insights er lesbare. Dette hindrer at en relasjon lekker ID eller eksistens til et utilgjengelig objekt.

### Strengere og backend-only data

- Insight feedback: bare feedback-eier eller workspace-admin.
- Sharing grants: bare grantor eller admin i source/target workspace.
- AI jobs: requester eller workspace-admin.
- `audit_events`: ingen direkte SELECT-policy.
- `idempotency_keys`: ingen direkte SELECT-policy.
- `outbox_events`: ingen direkte SELECT-policy.

Audit skal senere leses gjennom en redigert API-flate som ikke returnerer rå interne payloads.

## 8. Samtykkeformål og eksakte scopes

V1 har tre utadrettede samtykkeformål:

| Purpose | Handling | Scope |
|---|---|---|
| `account_import` | import av valgt lokal payload til konto/workspace | workspace + source kind + payload hash |
| `workspace_share` | deling av ett objekt til ett workspace | object type + object ID + target workspace |
| `public_publish` | offentlig publisering av én artikkelversjon | article ID + article version + public target |

Scope lagres som canonical JSONB-tekst generert av databasefunksjoner. Den kan derfor sammenlignes eksakt og kan ikke erstattes av et bredt fritekstscope som «del alt».

Hjelpefunksjoner:

```text
aha.account_import_scope(...)
aha.workspace_share_scope(...)
aha.publication_scope(...)
aha.consent_is_active(...)
```

Et receipt er aktivt bare dersom:

- ID, profil og workspace matcher
- purpose matcher eksakt
- scope matcher eksakt
- status er `granted`
- `granted_at` finnes og ikke ligger frem i tid
- `withdrawn_at` er null
- `expires_at` enten er null eller ligger frem i tid

## 9. Databasehåndheving av samtykke

Tre triggerporter validerer samtykke også når en fremtidig backend skriver med privilegert rolle:

### Sharing grant

En aktiv grant avvises uten gyldig `workspace_share`-receipt for eksakt objekt og target workspace.

### Account import

`aha.import_batches` får obligatorisk `consent_receipt_id`. Previewed, running og fullførte importtilstander avvises uten gyldig `account_import`-receipt for eksakt payload hash.

Et lokalt preview kan fortsatt bygges uten serverrad. Batch-raden oppstår først etter brukerens uttrykkelige importhandling.

### Offentlig publisering

Public candidate, approved eller published avvises uten gyldig `public_publish`-receipt for eksakt article ID og article version.

Workspace-interne og feilede/tilbakekalte arbeidsflyttilstander kan behandles uten å kreve at et tidligere receipt fortsatt er aktivt, slik at tilgang kan stanses og rollback gjennomføres.

## 10. Tilbaketrekking og utløp

Når samtykke eller sharing grant trekkes tilbake eller utløper:

- generic shared-object read returnerer false
- nye aktive grants/publications/importhandlinger avvises
- tidligere audit og consent receipt beholdes
- rollback, revocation og deletion kan fortsatt gjennomføres
- avledede embeddings og cacher skal senere deaktiveres gjennom outbox/jobbflyt

Tilbaketrekking skal ikke slette revisjonshistorikken skjult. Den stanser videre behandling og tilgang i samsvar med formål og retentionkontrakt.

## 11. RLS-policyenes karakter

Policyene er permissive SELECT-policyer med én tydelig tillatelsesregel per tabell. Det finnes ingen permissiv write-policy som en senere policy utilsiktet kan OR-es sammen med.

Før nye policyer legges til, må man kontrollere hvordan PostgreSQL kombinerer permissive policyer med `OR` og restrictive policyer med `AND`. En ny «hjelpepolicy» kan ellers åpne flere rader enn forventet.

Views over sensitive tabeller skal enten:

- bruke `security_invoker = true` der PostgreSQL-versjonen støtter det
- eller være i et utilgjengelig schema med eksplisitte grants

## 12. Hasura-grensen

Hasura er ikke aktivert av denne kontrakten.

Hvis Hasura senere får en read/subscription-prøve:

- samme canonical membership- og consentregler skal gjelde
- Hasura permissions kan ikke bli en uavhengig sannhet
- sensitive mutations går fortsatt gjennom NestJS
- session variables må stamme fra verifisert identitet
- metadata og permissions ligger i Git
- cross-tenant tests må kjøres mot faktiske GraphQL-queries og subscriptions

## 13. Testmatrise før aktivering

Stagingtesten må minst dekke:

### Identitet

- manglende JWT → null profile → null rows
- ugyldig claims-JSON → null profile → null rows
- ukjent subject → null rows
- user-editable metadata påvirker ikke rettigheter
- suspended/deleted profile → null rows

### Tenantisolasjon

- owner leser eget workspace
- editor/member/observer leser aktivt workspace
- revoked/inactive membership leser ingenting
- bruker A kan ikke lese workspace B
- cross-workspace foreign references avvises
- target workspace ser bare eksplisitt delte objekter

### Samtykke

- riktig receipt + exact scope godtas
- feil profile, workspace, purpose, scope eller version avvises
- expired receipt avvises
- withdrawn receipt avvises
- import med annen payload hash avvises
- publisering av annen article version avvises
- deling til annet target workspace avvises

### Skrivegrense

- browserrolle kan ikke insert/update/delete
- runtime-rolle eier ikke tabeller og har ikke `BYPASSRLS`
- service-/migration-role brukes ikke av webserver
- triggerporter avviser privilegert write uten consent
- audit, idempotency og outbox kan ikke leses direkte

## 14. Aktiveringsport

Kontrakten kan først markeres `Implemented` når:

1. migrasjonene er kjørt i ren stagingdatabase
2. JWT-konteksten er verifisert end-to-end
3. dedikert non-owner/no-BYPASSRLS runtime-rolle finnes
4. bare nødvendige policy helpers har `EXECUTE`
5. tabell- og schemagrants følger matrisa
6. hele cross-tenant- og consent-testmatrisa er grønn
7. NestJS auth/command/audit-foundation er på plass
8. ingen direkte browserwrites finnes
9. rollback til local-first er demonstrert
10. backup og faktisk restore er gjennomført

Neste roadmapleveranse etter denne kontrakten er:

```text
PR 4 — NestJS foundation med auth-bro, health, validation og audit
```

## 15. Eksterne tekniske referanser

- PostgreSQL Row Security Policies: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase database security: https://supabase.com/docs/guides/database/secure-data
