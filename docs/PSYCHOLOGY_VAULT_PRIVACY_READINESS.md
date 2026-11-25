# Kontohvelv: personvern og oppbevaring – beslutningsgrunnlag

Status 25. november 2026. Kun syntetisk pilot er godkjent. Dette er et internt utkast, ikke en komplett personvernerklæring eller en godkjenning av behandling av ekte refleksjoner.

## Dokumentert teknisk avgrensning
- Frivillig, manuell kryptert filkopi. Lokal eksport og gjenoppretting fungerer uten kontolagring. Ingen passord, notattekst, AI-analyse eller automatisk innsiktssynk i hvelvet.
- Konto-ID, størrelse, tidsstempel og kryptert fil er synlig for lagringstjenesten; behandlingen er ikke anonym.
- Egen eierstyrt nedlasting og sletting. Sletting av aktiv kopi er ikke sletting av lokale filer, tidligere nedlastinger eller historiske databasekopier.
- Kontoavslutning: FK cascade finnes i SQL; faktisk hosted sletting og eventuell backupretensjon må kontrolleres. Ingen løfte om at sletting på tvers av tjenester skjer automatisk.
- Filformatet alene beviser ikke at filen er riktig kryptert. Tapt passord kan ikke gjenopprettes av AHA.

## Før ordinær åpning – ansvarlig må dokumentere
- Identitet og kontaktpunkt for behandlingsansvarlig, eventuelt personvernombud.
- Formål og behandlingsgrunnlag etter artikkel 6; vurder artikkel 9 dersom innholdet kan omfatte helseopplysninger eller andre særlige kategorier. Ikke anta at en avkryssing for manuell opplasting oppfyller disse kravene.
- Faktiske mottakere, databehandlere, avtaler, region og eventuelle overføringer utenfor EØS.
- Verifisert aktiv oppbevaringstid eller kriterier, nøyaktig retensjon for databasekopier, logger og eventuell gjenoppretting etter sletting. Forslag: ingen automatisk sletting av eksisterende kontokopi ut fra kvote; avklar inaktivitet og kontolukking separat.
- Brukerrettigheter, kontaktkanal, klageadgang, og rutine for innsyn/sletting/eksport. Vurder behov for DPIA og særskilt vern av barn.
- Sikkerhetshendelser, administratortilgang, dataminimering, verifisert kapasitet og beredskap ved stans. Ikke åpne før ansvarlig har godkjent risiko og publisert korrekt brukerrettet informasjon.

Kilde: Datatilsynet, https://www.datatilsynet.no/rettigheter-og-plikter/virksomhetenes-plikter/informasjon-og-apenhet/hva-skal-virksomheten-gi-informasjon-om/ .

Ingen endring av produksjonstilgang, lagringstid, avtaler eller databaseregler i denne PR-en.
