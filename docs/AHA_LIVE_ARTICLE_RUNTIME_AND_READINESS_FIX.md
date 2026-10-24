# AHA 1.0 – kontraktkompatibilitet og reell analyseberedskap

Oppdaget med virkelig bruker-testpakke \`run_yp4bm6\` fra artikkelen *De skrev henne ned*: \`analysis_bundle_v2.status=incomplete\`, \`synthesis_gate.status=not_run\`, \`approved_count=0\`. Sporingen oppgir \`runtime_build_mismatch:frontend_backend_sha\`, selv om seks eksakte runtime-kontraktversjoner stemmer mellom frontend og backend. GitHub Pages og agenten på Render publiseres uavhengig.

## Rettelse
1. **Kontroller alle seks runtime-kontrakter strengt.** Manglende backend-manifest og avvikende skjema/kontrakt forblir blokkert.
2. **Bruk ikke lik git-SHA som kompatibilitetskrav.** SHA-avvik og manglende backend-SHA bevares som \`deployment_warnings\` for feilsøking, men et kompatibelt API får lov til å kjøre. Ingen modellkjøring utløses i denne PR-en.
3. **Ikke kall ufullstendig analyse «ready».** Explorer viser nå tydelig at de teknisk kildeverifiserte feltene bare er kildestruktur når den autoritative synteseporten ikke ble kjørt eller ikke gav godkjente innsikter.
4. **Ikke kall kildebaserte produktforslag irrelevante når syntesen aldri ble kjørt.** Slike «ikke relevant»-status fra en tom projeksjon vises som \`Ikke vurdert ennå\`. Dette gjelder presentasjonen, ikke den autoritative produktmodellens data.

Denne rettelsen beviser ikke at forskningsanalysen blir god: kjør den samme kilden igjen, eksporter en ny testpakke og undersøk om den autoritative syntesekjøringen faktisk skjer, om gate og kvalitetssikrede innsikter er tilgjengelige, og om kildebelegget holder. Bruk fortsatt manuell kvalitetsvurdering. Ikke godkjenn eller synk innsikter automatisk.

Regresjonstest: \`node tests/aha-independent-runtime-compatibility-and-ui-readiness.test.cjs\`. Testene bruker bare korte syntetiske data, aldri hele artikkelteksten.
