Her er en ferdig README.md for AHA_Twitter/, skrevet slik at både du, andre utviklere og Codex forstår nøyaktig hva dette er, hvordan det kjøres, og hva som er “ferdig”.

Du kan lime dette rett inn i AHA_Twitter/README.md.

⸻

:::writing{variant=“standard” id=“84217”}

AHA Twitter

AHA Twitter er en del av EchoNet/AHA-systemet.
Dette er en MVP av et nytt sosialt lag – ikke en tradisjonell Twitter-klone.

🧠 Hva dette er

AHA Twitter er en kunnskapsfeed der:

* brukere poster tanker, innsikter og spørsmål
* hver post kan kobles til:
    * idéer
    * steder
    * personer
    * temaer
* disse koblingene danner et første AHA graph

Målet er å gjøre sammenhenger synlige, ikke bare publisere innhold.

⸻

🎯 MVP-mål

Denne mappen inneholder første fungerende versjon av:

* Feed med poster
* PostInput (opprett post)
* Post-typer:
    * thought
    * insight
    * question
* AHA-noder:
    * idea
    * place
    * person
    * topic
* GraphPanel (vis sammenhenger per post)
* Supabase backend med Postgres + Auth + RLS

Dette er minimum for å teste AHA-konseptet.

⸻

🧱 Teknologi

* Next.js (App Router)
* TypeScript
* Supabase (Postgres + Auth + RLS)
* Tailwind (valgfritt, men anbefalt)

⸻

📁 Struktur (kort forklart)

app/           → routing og API
components/    → UI (feed, graph, auth)
lib/           → supabase, db, services
types/         → TypeScript-typer
supabase/      → SQL migrasjoner
public/        → statiske filer

⸻

🗄️ Datamodell

Kjerne-tabeller:

* profiles
* posts
* graph_nodes
* post_nodes
* follows

Viktigste relasjon

post → post_nodes → graph_nodes

Dette er fundamentet for AHA graph.

⸻

🔐 Sikkerhet

* Supabase Auth brukes for innlogging
* Row Level Security (RLS) er aktivert
* Brukere kan:
    * opprette egne poster
    * koble egne poster til noder
* Graph-noder er lesbare i MVP

⸻

⚙️ Setup

1. Installer

npm install

⸻

2. Environment variables

Opprett .env.local:

NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...

Se .env.example for mal.

⸻

3. Database

Kjør SQL-filer i supabase/migrations/ i Supabase:

* oppretter tabeller
* setter opp RLS
* triggere (profil ved signup)

⸻

4. Start app

npm run dev

Åpne:

http://localhost:3000

⸻

✍️ Hvordan bruke MVP

1. Registrer bruker
2. Opprett post
3. Legg til:
    * idé
    * sted
    * person
4. Post lagres
5. Trykk “Se sammenheng”
6. GraphPanel viser koblinger

⸻

🧠 Designprinsipper

* rolig UI
* ingen støy
* strukturert informasjon
* venstrestilt tekst
* tydelig typografi
* mørkt tema

Dette skal føles som en tenkeplattform, ikke en sosial strøm.

⸻

🚫 Hva vi IKKE bygger nå

* Hasura
* NestJS backend
* Milvus / vector DB
* avansert AI-tagging
* force-directed graph (D3)
* media uploads
* komplekse profiler

Hold MVP ren.

⸻

🔄 Neste steg

Når MVP fungerer:

* automatisk node-tagging (AI)
* relaterte poster
* filtrering på node
* AHA-stier
* bedre graph-visualisering

⸻

🧭 Definisjon av ferdig (MVP)

Dette er “ferdig” når:

* app starter lokalt
* bruker kan logge inn
* post kan opprettes
* post kan kobles til noder
* noder lagres i DB
* GraphPanel viser live data

⸻

⚠️ Viktige regler

* Ikke legg til features uten behov
* Ikke utvid arkitektur for tidlig
* Ikke bygg enterprise-løsninger nå
* Hold fokus på:
    * post
    * node
    * relasjon
    * graph

⸻

🧩 For Codex

Se AGENTS.md for:

* arbeidsregler
* scope
* leveransekrav

Codex skal:

1. lese repo
2. lage plan
3. implementere MVP
4. dokumentere endringer

⸻

👤 Prosjektkontekst

AHA Twitter er en del av:

* EchoNet (kollektivt læringssystem)
* AHA (personlig læringsmotor)

Dette er første steg mot et større kunnskapsøkosystem.

⸻

💬 Kort sagt

Dette er ikke en ny Twitter.

Det er starten på et system som viser:

hvordan tanker henger sammen.
:::

⸻

🧠 Hva dette gjør for deg

Med AGENTS.md + README.md + mappearkitektur på plass, har du nå:

* tydelig produktretning
* tydelig teknisk retning
* klare grenser for Codex
* definisjon av “ferdig”
* riktig MVP-scope

👉 Det betyr at Codex ikke begynner å improvisere feil vei.

⸻
