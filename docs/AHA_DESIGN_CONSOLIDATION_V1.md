# AHA Design Consolidation V1

## Goal

Make AHA feel like one finished application rather than several generations of product UI layered together.

This work is presentation-first. It must preserve existing AHA engines, local data contracts, History Go boundaries, ingestion flows, Personal AI behavior, training/retrieval semantics, and module functionality unless a later PR explicitly scopes a functional change.

## Current design diagnosis

The repository already contains a strong newer product shell, especially the shared global navigation and the visual hierarchy introduced around PRs #641 and #642. The main design debt is not a missing redesign; it is overlapping generations of layout and component styling.

The main conflicts are:

- `css/aha-dashboard.css` contains both the original dashboard layer and later app-layout refactors.
- `css/aha-global-nav.css` provides the newer shared product shell.
- `css/ahaModule.css` still applies legacy global page layout directly to `body`.
- Chat has an older dark-blue component vocabulary that only partially matches the dashboard shell.
- several modules still expose operator/developer concepts as primary user interface.
- page widths and spacing are frequently set ad hoc in HTML.
- module icons mix symbols and emoji instead of one coherent icon language.

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

Replace the current mixed emoji/symbol icon map with one coherent icon treatment and fixed metrics.

Acceptance: no primary module identity depends on platform-rendered emoji.

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
- touch target checks
- focus/keyboard checks
- overflow checks
- empty/loading/error state review
- remove dead legacy selectors only after all consumers are migrated

## First implementation slice

The first code change removes the global `body` width/margin/padding rule from `css/ahaModule.css`.

Reason: pages that load this legacy stylesheet already render inside the newer `.aha-dashboard` product shell. The old `body` rule therefore creates a second outer layout owner and is a direct source of inconsistent width and spacing.

This first slice intentionally changes no module behavior and retains the legacy form/list/card primitives for subsequent migration.

## Definition of done for V1

- one canonical shell owns page layout
- one shared token vocabulary
- no legacy module stylesheet can globally resize the application
- primary navigation and hierarchy are consistent across product pages
- everyday AHA surfaces do not foreground developer terminology
- module-specific visual character remains possible without redefining global primitives
- responsive behavior is deliberate on iPad/mobile rather than accumulated overrides
- regression tests protect the shell contract
