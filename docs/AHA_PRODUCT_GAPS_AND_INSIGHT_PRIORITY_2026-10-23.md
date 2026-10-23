# AHA: innsiktskvalitet og reell funksjonsdekning – 23. oktober 2026

## Produktvurdering
Grønne tekniske tester dokumenterer ikke at en innsikt er nyttig, faktuelt korrekt eller interessant. Den eksisterende `docs/AHA_MODULE_MATURITY_MATRIX.md` bruker "ready" om moduler som i flere tilfeller **kun har local-only funksjonalitet**. Dette må ikke oversettes til "fullt produkt".

## Bekreftede hull
| Funksjon | Hva er faktisk på plass? | Mangler før løftet om en full funksjon er oppfylt |
|---|---|---|
| Chat/innsiktsproduksjon | Egen AI-syntese, kilde- og kvalitetssløyfe, lokale innsikter | Systematisk menneskelig vurdering av om forklaringene virkelig gir nye, kildebundne og relevante poeng; måle reelle feiltyper |
| Innsiktsarkiv | Lokal lesing, søk, filtrering, liste-/gruppereferanser | Bedre kvalitetssignal og forståelig belegg; denne PR-en legger til utdragskontroll og etterprøving uten å oppgradere påstander |
| Meet | Synlig shell/konsept | Lokal modell for møtejournal, redigering, referanser og sletting før separat sosial avtale-/delingskontrakt |
| Sync Hub | Read-only preview/dry-run | Reell, samtykkestyrt synk og eksplisitt backend-/sikkerhetskontrakt |
| Groups | Lokale grupper, roller og referanser | Ekte medlemskap, invitasjoner og deling |
| Feed/Insta | Lokale poster og medier/metadata | Reell kontobasert sosial publisering, deling, opplastning |
| Galleri | Lokale galleriobjekter og tekstsporing | Faktisk filopplasting og bildehåndtering; ingen automatisk bildeanalyse |
| Music | Bibliotek og valgte Spotify-metadata | Avspilling/streaming og musikkopplevelse utover metadata |
| Personal AI | Lokal retrieval, kontroll, simulert/evaluert svargrunnlag | Det er ikke en trent personlig modell; reell modellintegrasjon krever egen brukeravtale, sikkerhet og måling |

## Første korrigerende leveranse – PR for kilde- og innsiktsarkiv
1. Ikke la et automatisk ordlikhetsutdrag se ut som påviselig støtte for et tolkende utsagn. Behold kildetekst og merk den som *kontekst*, med usikkerhet og manuell kontroll.
2. Vis tilgjengelig kilde, usikkerhet, betydning og konkret mulig etterprøving på innsiktskortet. Ikke dikt opp metadata som ikke er lagret.
3. Gjør «Åpne kilde» til en fungerende, lokal lenke til riktig source event.
4. Behold eksisterende samtykke, RLS og AHAIngest. Ingen nye systemer, automatisk publisering eller skriving til History Go.

## Neste produktrekkefølge
1. **Bedre innsikt fremfor flere innsikter.** Eget evalueringssett med ekte anonymiserte/brukergodkjente tekster: presisjon, kildekorrekthet, faktisk ny forståelse, motargument, begrensninger og relevans. Mål problemer i AI-syntesen, ikke bare i visningen.
2. **Chat → innsikt → handling.** Gjør arkivet til et nyttig sted å følge opp påstander, korrigere feil og samle bekreftede funn, uten å lage nye parallelle kunnskapsmotorer.
3. **Bygg én sidefunksjon ordentlig om gangen.** Meet som lokalt møtearkiv er en rimelig kandidat, før full sync eller sosiale nettverk. Ikke bruk `ready` som synonym for en ferdig, offentlig tjeneste.
4. **Live verifikasjon.** To faktiske innloggede AHA-kontoer må prøve meldinger, rapportering og blokkering; History Go Social Meet-migreringen krever separat produksjonsbevis.

## Godkjenningskriterium
En innsikt er ikke "god" fordi den får en høy maskinell score. Brukerrelevans, en påstand som tåler kildekontroll, tydelig skille mellom sitat/tolkning/hypotese og fravær av oppdiktede koblinger må kunne dokumenteres med vurderte eksempler.
