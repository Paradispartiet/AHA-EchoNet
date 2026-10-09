# AHA Design Consolidation V1

**Status: COMPLETE on merge of the final QA/cleanup gate.**

The implementation is complete. The final merge gate is the repository's full Node/Engine/syntax/launch suite plus the browser QA in Desktop Chrome and iPad Pro 11 WebKit.

## Goal

Make AHA feel like one finished application rather than several generations of product UI layered together.

This work is presentation-first. It must preserve existing AHA engines, local data contracts, History Go boundaries, ingestion flows, Personal AI behavior, training/retrieval semantics, and module functionality unless a later PR explicitly scopes a functional change.

## Resolved design diagnosis

V1 consolidated the overlapping design generations rather than replacing AHA with another redesign.

The original conflicts are now resolved:

- `.aha-dashboard` plus global navigation/footer owns the outer product shell.
- Chat retains its dedicated full-height `.app-shell` for the conversation layout while sharing canonical tokens and global navigation; it is not a second page-width owner.
- ad hoc inline main widths were replaced by named shell-width variants.
- the legacy `css/ahaModule.css` compatibility layer has no consumers and is removed in the final cleanup.
- Dashboard, global navigation and Chat share the canonical token layer.
- ordinary controls, fields, cards and panels use shared geometry.
- advanced/operator surfaces remain available but are visually secondary to everyday workflows.
- module identity uses one internal monoline SVG icon system instead of mixed emoji/symbols.
- module-specific color is applied as restrained semantic accent on a black AHA base.

## Visual direction

AHA keeps black as its visual base. The canonical palette uses near-black backgrounds and surfaces, high-contrast cool-white text, yellow as the recognizable AHA signature, and controlled blue, cyan, violet, green and coral accents for hierarchy, states and module identity. The additional colors should create contrast and character without turning the application into a blue/navy theme.

## Design principles

1. One AHA product shell.
2. One canonical token vocabulary for color, typography, spacing, radius, elevation, borders and motion.
3. Page-specific CSS may define domain presentation, but must not redefine the global shell.
4. Consumer-facing workflows stay primary; diagnostics and operator controls move one level deeper.
5. Existing functionality is preserved while presentation is consolidated.
6. Changes ship in small PRs with regression coverage rather than one broad visual rewrite.

## Work sequence

### Phase 1 — Shell ownership

- Remove legacy page-level layout rules from module stylesheets.
- Make `.aha-dashboard` plus the global navigation/footer the canonical outer shell.
- Replace ad hoc inline width ownership with named shell width variants.
- Document which stylesheet owns global layout.

Acceptance: loading a legacy module stylesheet cannot change the page's outer width, centering or global padding.

### Phase 2 — Canonical design tokens

Create one shared token layer for:

- backgrounds and surfaces
- foreground and muted text
- AHA accent
- semantic success/warning/error states
- border opacity
- spacing scale
- corner-radius scale
- elevation
- interactive focus
- motion durations

Map existing dashboard, nav and chat aliases to canonical tokens before removing old aliases.

Acceptance: shared shell and primitives no longer depend on conflicting color/radius constants.

### Phase 3 — Shared primitives

Canonical geometry: ordinary buttons and fields use a 12px control radius; reusable cards use 16px; larger panels use 20px; status indicators and chips alone use the full pill radius. Main controls target 42–44px height so the app feels consistent and remains comfortable on touch devices.

Consolidate the reusable UI vocabulary:

- page header
- panel/card
- primary/secondary/ghost/destructive buttons
- form fields
- tabs
- pills/status
- list rows
- empty states
- sheets/dialogs
- stats
- section headers

Acceptance: Notes, Feed, Gallery, Insta, Profile and knowledge surfaces can use the same base primitives without local copies.

### Phase 4 — Information hierarchy

Separate AHA into two visual layers:

**Primary product**
- Start
- Chat
- Bibliotek
- Personal AI
- Mitt AHA
- personal creation/social surfaces

**Advanced / control**
- Data Intake
- Curation
- Knowledge Map / Graph Intelligence
- Training
- Sources
- Sync Hub
- technical/system diagnostics

Nothing is removed. Advanced controls stop competing visually with everyday use.

Acceptance: a normal user can navigate AHA without needing to interpret implementation terminology.

### Phase 5 — Icon system

Use one internal monoline SVG icon system with a shared 24×24 viewBox, currentColor stroke, 1.8 stroke width and fixed rendered metrics in Home/global navigation. Every registered module must have its own icon plus a generic fallback.

Acceptance: no primary module identity depends on platform-rendered emoji, and every registered module has canonical SVG coverage.

### Phase 6 — Home and Chat polish

Once the shell is stable:

- simplify Home to a clear current-state / continue-working hierarchy
- retain the newer global navigation
- reduce stacked panels and repeated status
- bring Chat surfaces onto the same tokens and component metrics
- keep analysis and advanced inspection secondary to the conversation

Acceptance: Home and Chat visibly belong to the same application.

### Phase 7 — Module migration

Migrate modules in controlled groups:

1. Notes / Feed / Gallery
2. Insta / Music / AHAavisa
3. Profile / Search / Insights
4. Knowledge Workbench / Intake / Curation / Knowledge Map
5. Training / Sources / Privacy / Status / Meet / Groups / History Go bridge

Each migration should remove obsolete local presentation rules instead of adding another override layer.

### Phase 8 — Visual QA and cleanup

- iPad/mobile viewport review
- desktop review
- touch target and canonical control-size contract
- focus treatment contract
- horizontal overflow checks across the primary V1 surfaces
- empty/loading/error state coverage retained by existing module tests
- remove dead legacy styles only after all consumers are migrated

Final browser QA covers Home, Chat, Mitt AHA, Notes, Feed, Gallery, AHA Insta, AHA Music, Search/Bibliotek, Begrepslister, Kunnskapsstier, Tankekart, Personal AI, Knowledge Workbench and the AHA-side History Go bridge in both Desktop Chrome and iPad Pro 11 WebKit.

## First implementation slice

The first code change removes the global `body` width/margin/padding rule from `css/ahaModule.css`.

Reason: pages that load this legacy stylesheet already render inside the newer `.aha-dashboard` product shell. The old `body` rule therefore creates a second outer layout owner and is a direct source of inconsistent width and spacing.

This first slice intentionally changed no module behavior and retained the legacy form/list/card primitives for subsequent migration. Those primitives were later migrated to scoped product styles, and the unused `css/ahaModule.css` file is removed by the final cleanup.

## Definition of done for V1

- one canonical shell owns page layout
- one shared token vocabulary
- no legacy module stylesheet can globally resize the application
- primary navigation and hierarchy are consistent across product pages
- everyday AHA surfaces do not foreground developer terminology
- module-specific visual character remains possible without redefining global primitives
- responsive behavior is deliberate on iPad/mobile rather than accumulated overrides
- regression tests protect the shell contract


## V1 completion record

V1 is considered complete only when the final QA/cleanup pull request is green on the exact merge head.

Completion evidence:

- no HTML consumer references `css/ahaModule.css`
- no product `main` owns layout width through inline `max-width`
- canonical tokens define black-first color, focus and control geometry
- shared shell widths are centrally owned
- module icons use the internal SVG system
- primary, personal, knowledge, AI, system, social and History Go bridge surfaces have completed their controlled migrations
- the final browser suite checks representative V1 surfaces for canonical shell presence, mobile viewport metadata and horizontal overflow in Desktop Chrome and iPad Pro 11 WebKit
- existing deterministic Node, Engine, syntax and launch gates must remain green

No History Go core behavior is part of this design consolidation.
