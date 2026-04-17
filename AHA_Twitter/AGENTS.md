# AGENTS.md

## Project
This folder contains the AHA Twitter MVP inside the AHA-EchoNet repository.

AHA Twitter is not a standard Twitter clone.
It is a calm, structured knowledge feed where each post can connect to AHA graph nodes such as ideas, places, people, and topics.

The unique product core is:
- a feed of posts
- structured post types
- graph relations between posts and nodes
- a first usable AHA graph panel for each post

## Current product phase
This folder is for the first working MVP.

Build for:
- Next.js
- TypeScript
- Supabase
- simple, scalable structure

Do NOT build yet:
- Hasura
- Milvus
- Azure infrastructure
- advanced semantic resonance
- concept-density analytics
- D3 / force-directed graph
- overengineered microservices

## Product intent
The app should feel:
- calm
- minimal
- structured
- knowledge-oriented
- not noisy or addictive

Avoid building a dopamine-feed or a visually chaotic Twitter clone.

## Primary MVP requirements
Implement or maintain these core capabilities:

1. Authentication
- Supabase Auth
- at minimum email/password
- reuse existing auth if already present

2. Data model
Use or adapt these entities:
- profiles
- posts
- graph_nodes
- post_nodes
- follows

3. Feed
Users should be able to:
- create a post
- choose post type
- view posts in a feed
- open a graph panel from a post

4. AHA graph
Each post can connect to nodes of type:
- idea
- place
- person
- topic

If a node does not exist, create it.
If it already exists, reuse it.

5. Graph panel
When a user clicks “Se sammenheng” / “Show connections”:
- load graph data live from the database
- show the current post as focus
- show related nodes clearly
- make node types visually distinct

## UI rules
Use a dark UI with a restrained visual language.

Preferred direction:
- dark blue / near-black background
- darker cards/panels
- green AHA accent
- feed centered
- desktop sidebar allowed
- clean spacing
- left-aligned text
- no visual clutter

Do not introduce random colors, flashy animations, or social-media gimmicks.

## Technical rules
- Prefer existing repo conventions over inventing new structure
- Reuse existing components if possible
- Keep changes local to `AHA_Twitter/` unless clearly necessary
- Use TypeScript
- Prefer simple server-side or route-handler patterns that fit the repo
- Use current Supabase SSR approach if server auth/client separation is needed
- Add only the minimal files needed for a complete MVP
- Avoid duplicate architecture

## Database rules
If database setup is missing, create SQL or migration files for:
- schema
- indexes if needed
- Row Level Security policies

MVP security expectations:
- users can create and edit their own posts
- users can only create graph links for their own posts
- graph nodes may be readable by authenticated users in MVP
- document any assumptions clearly

## Working style
Before coding:
1. Inspect the folder and surrounding repo structure
2. Identify framework, router, styling system, and existing auth/data patterns
3. Produce a short implementation plan
4. Then implement

Do not stop after the plan unless blocked by missing information.

## Definition of done
The task is only done when all of the following are true:
- the MVP builds in this folder
- posts can be created
- posts can store post type
- posts can connect to graph nodes
- graph nodes are persisted in Supabase
- “Show connections” loads live graph data
- GraphPanel renders the post and its connected nodes
- setup steps are documented
- required env variables are documented
- required SQL/migrations are documented

## Final handoff format
At the end of a task, always provide:
- a short summary of what was built
- new files
- changed files
- SQL/migrations to run
- env variables required
- how to run locally
- blockers / assumptions / follow-ups

## Scope discipline
Do not add extra features that were not requested.
Do not turn the MVP into a full platform build.
Do not begin enterprise architecture early.
Ship the smallest correct version first.
