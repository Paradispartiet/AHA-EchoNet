# Paradisavisa → AHA · lokal lesebro V1 (utkast)

## Brukerreise
1. Les artikkel i \`/Paradisavisa/artikler/\` eller \`/posts/\`.
2. Velg **Lagre i Aha**, **Merk som lest** eller aktiver fremtidig lesehistorikk.
3. I Aha åpner brukeren **Bibliotek → Leste og lagrede artikler**.
4. Filtrer på innhold, tema, publiserings- og lesetid; merk egne temaord.
5. Legg artikkelen eksplisitt i en eksisterende samling eller kunnskapssti.
6. Tankekartet viser artikkelen som en egen kildebundet node og viser bare faktisk lagrede samlings-/stikoblinger.

## Datakontrakt
- \`aha_paradisavisa_library_v1\`: lokal JSON med \`version:1\`, \`trackingEnabled:boolean\` og \`articles:[]\`.
- Artikkel-ID er kanonisk sti under \`/Paradisavisa/(artikler|posts)/...\`. Beholder URL, tittel, ingress, kort tekstutdrag (maks 1100 tegn), kategori, publiseringsdato, valgfrie temaord, \`savedAt\`, \`readAt\`, \`openedAt\` og \`openCount\`.
- Data lagres **kun i nettleserens localStorage** under samme origin (\`paradispartiet.github.io\`). Det opprettes ikke identitet, konto, skybackup, analysemodell, trening, nettverksdeling eller serverinnsamling.
- Automatisk loggføring er **av som standard** og aktiveres ved eksplisitt trykk. En åpning er ikke det samme som lest; lest markeres manuelt eller når artikkelslutten vises etter samtykke.
- Manuell lagring og lesemarkering fungerer uten å slå på automatisk sporing.
- Ingen retroaktiv import av tidligere faktisk lesing, og ingen synk mellom enheter eller browser-profiler.
- Eksporter JSON og slett lesehistorikk via Aha. Ved sletting beholdes brukervalgte lagringer og samlings-/stikoblinger.
- V1 krever at avis og Aha ligger på **samme origin**. Hvis kanonisk Aha ligger på et annet domene, må V2 bruke en eksplisitt eksport/import eller autentisert samtykkestyrt overføring. Aldri forsøk cross-origin localStorage.

## Eiergrenser
- \`aha_articles_v1\` er **AHAavisas egne lokale utkast**, ikke publiserte Paradisavisa-artikler; ikke skriv i denne nøkkelen.
- Samlinger (\`aha_lists_v1\`) og stier (\`aha_paths_v1\`) får bare referanser med \`source:"paradisavisa"\`, \`type:"article"\`, \`refId\` lik kanonisk sti, via eksplisitt brukerhandling.
- Tankekart kan vise slike noder og relasjoner; det finner **ikke** opp AI-lenker fra felles ord eller temaer.
- Innsikter/AI-kall er ikke aktivert, og det opprettes ikke AHA source events via skjult ingest.
- Brukerens eksisterende AHA-kunnskap må aldri overskrives av en artikkelimport.
- Ingen mulighet for å lese tidligere faktisk lesing hvis dette aldri er loggført.

## Utrulling/gates
- Koden er en prototype i et tilgjengelig \`Paradispartiet/AHA-EchoNet\`-repo, men tidligere PR-er viser at **kanonisk Aha-repo ennå ikke er verifisert**. Derfor **ikke merge/deploy** før eiersted er avklart.
- Avis- og Aha-PR må rulles ut sammen; løsningen må testes fra de to ekte GitHub Pages-stiene på samme origin.
- Kjør nye tester samt full regressjon/CI på begge repoene. Test på faktisk iPhone/iPad Safari, inkludert lokallagring, privat modus, tilbake-navigasjon, VoiceOver og 320px visning.
- Kontroller personvern, per-article opt-out, historikksletting, duplikatvern og at ingen tredjepartsnettverkskall eller lokal profil kommer på avveie.
- Ved utvidelse til innholdsbasert semantisk sortering/AI må datagrunnlag, kildebelegg og eget samtykke defineres separat.

## Ikke i V1
- Automatiske artikkanalyser, AI-genererte innsikter, semantiske forbindelser, synk til Aha-konto, EchoNet-deling og automatisk retroaktiv lesehistorikk.
- Kategori og tema i V1 kommer fra artikkelmetadata og brukerens egne temaord; de er ikke maskinprodusert klassifikasjon.
