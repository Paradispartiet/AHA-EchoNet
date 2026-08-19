# AHA Canonical Production Two-Profile Round-Trip v1

Status: **CLOSEOUT FULLFØRT. LIVE EVIDENCE: 2 AV 2 PROFILER BESTÅTT MED FØRSTE ROUND-TRIP + IDENTISK REPLAY. PROFIL #3 ER FORTSATT PAUSET MENS TO-PROFIL-STABILITET OBSERVERES.**

## Formål

Denne porten beviser normal canonical production-sync med ekte AHA-data for begge de to allerede allowlistede pilotprofilene:

```text
lokal AHA-endring
→ canonical frontend adapter
→ IndexedDB outbox
→ POST /v1/sync/push
→ production PostgreSQL + sync journal
→ bootstrap eller pull
→ canonical local apply
→ lokal hash-rebaseline
→ identisk replay
```

Ingen separat testprotokoll eller testdatabase brukes. Operatorflaten gjenbruker de samme canonical komponentene som den eksplisitte manuelle production-syncen i AHA.

## Operatorflate

```text
canonical-sync-production-roundtrip.html
?ahaCanonicalProductionRoundTrip=1
RUN_AHA_CANONICAL_TWO_PROFILE_ROUND_TRIP
Verifier build: hash-domains-v2
```

Production API-origin kommer fra `AHACanonicalProductionHomeSync.PRODUCTION_API_ORIGIN`. Privat workspace utledes fra innlogget Supabase-identitet. Operatoren kan ikke velge endpoint eller workspace manuelt.

Bare det å laste siden starter ikke auth-lesing, storage-mutasjon, IndexedDB-mutasjon, fetch, retry, profilaktivering eller sync. Kjøringen krever URL-port, eksakt bekreftelsesfrase, eksplisitt samtykke og eksplisitt brukerhandling.

## Closeout-krav

Første run er grønn bare når:

```text
pushed > 0
bootstrapApplied + pullApplied > 0
pushConflicts = 0
pushRejected = 0
conflictCount = 0
alle aktive object states har gyldig serverhash og lokalhash
cursor går aldri bakover
pushCursor eller pullCursor går fremover
```

Identisk replay er grønn bare når:

```text
localChanged = 0
enqueued = 0
pushed = 0
pushConflicts = 0
pushRejected = 0
conflictCount = 0
aktive server-/lokalhash-domener er komplette og gyldige
cursor går aldri bakover
batch digest er stabilt
```

## Hash-konsistens: separate integritetsdomener

`serverPayloadHash` og `localPayloadHash` beskriver forskjellige canonical representasjoner og skal ikke kreves å være identiske.

- `serverPayloadHash` beskriver serverens materialiserte snapshot/journal-state.
- `localPayloadHash` beskriver frontendens canonical projection som brukes til lokal change detection og rebaseline.

Closeout krever at begge hash-domener finnes og er gyldige SHA-256-verdier for alle aktive states. Direkte equality mellom dem er bare diagnostikk. Replay krever at det samlede batch-digestet for object-state-evidencen er stabilt.

## Live evidence 2026-08-19

Canonical operatørevidence ligger i:

```text
ops/evidence/canonical-sync-production-two-profile-roundtrip-v1.json
```

Status:

```text
pilot_slot_1 = VERIFIED
pilot_slot_2 = VERIFIED
verifiedProfileSlots = 2 / 2
closeoutComplete = true
```

### pilot_slot_1

Første round-trip:

```text
PASS
localChanged = 6
enqueued = 6
pushed = 6
bootstrapApplied = 38
pullApplied = 0
conflicts = 0
rejected = 0
cursorAdvanced = true
hashDomainsComplete = true
activeHashPairs = 38 / 38
missingActiveHashValues = 0
invalidHashValues = 0
```

Identisk replay:

```text
PASS
localChanged = 0
enqueued = 0
pushed = 0
conflicts = 0
hashDomainsComplete = true
hashDigestStable = true
```

### pilot_slot_2

Første round-trip:

```text
PASS
localChanged = 6
enqueued = 6
pushed = 6
bootstrapApplied = 7
pullApplied = 0
conflicts = 0
rejected = 0
cursorAdvanced = true
hashDomainsComplete = true
activeHashPairs = 7 / 7
missingActiveHashValues = 0
invalidHashValues = 0
```

Identisk replay:

```text
PASS
localChanged = 0
enqueued = 0
pushed = 0
conflicts = 0
hashDomainsComplete = true
hashDigestStable = true
```

Begge profiler har dermed bevist ekte lokal mutasjon → production push → server read/apply → rebaseline → idempotent replay uten duplikate writes eller konflikter.

## Privacy/evidence boundary

Evidence inneholder ikke:

```text
Supabase subject / profil-ID
workspace-ID
access token
rå canonical payload
serverState
rå AHA-samtaletekst
objekt-ID-er
```

Pilotprofilene omtales bare som `pilot_slot_1` og `pilot_slot_2`.

## Profil #3 er fortsatt pauset

Round-trip-porten er nå fullført, men dette godkjenner ikke profil #3 automatisk. Rollout-policyen beholder:

```text
currentVerifiedProfileCount = 2
nextExpansionPaused = true
twoProfileRoundTripEvidenceComplete = true
nextExpansionRequiresStabilityObservation = true
stabilityObservationComplete = false
```

Neste fase er en stabilitetsperiode med de samme to pilotprofilene. Følg minst:

```text
auth_rejections
permission_rejections
sync_conflicts
sync_push_results
request_latency
database_connections
database_query_load
```

Først etter dokumentert stabilitet kan en separat reviewed beslutning vurdere profil #3 og deretter en kontrollert utvidelse til 3–5 profiler. General production-sync og automatic/login/background sync er fortsatt separate senere beslutninger.
