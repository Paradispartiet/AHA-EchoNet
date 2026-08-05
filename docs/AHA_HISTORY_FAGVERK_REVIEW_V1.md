# AHA History Fagverk review v1

## Scope

This review package evaluates the complete registered `historie` subject from History Go before any runtime activation.

Reviewed upstream:

- repository: `Paradispartiet/History-Go`
- source commit: `c16a187453d16a40f9cab4ca694c32e96014f31b`
- corpus digest: `e5123cb96d9b89c83aad56efc327c1089bfe5f887f29322d39a4a936c9f19444`
- chapters: 23
- module files: 69

The existing AHA runtime contains one legacy History seed chapter, `1814_statsdannelse`. This review therefore represents an intentional expansion from 1 to 23 chapters, not a source-only rebase.

## Review boundary

The following remain separate:

1. **Observed release** records what History Go currently publishes.
2. **Candidate corpus** is imported review material and is not a runtime input.
3. **History subject approval** records that the subject-specific review gates passed.
4. **Runtime activation** requires a later, explicit activation pull request.

This pull request must not add `historie` to `active_subjects` in the runtime manifest.

## Scoring policy

History uses a subject-specific review scorer with:

- 292 classified term collisions
- 96 high-risk collisions made non-scoring
- 108 medium-risk collisions down-weighted unless they are generic language
- 88 low-risk shared phrases retained only as context
- a mandatory temporal anchor, including explicit years or reviewed temporal phrases
- mandatory chapter anchors for all 23 chapters
- chapter-scoped supplemental evidence terms
- minimum score 7
- minimum two scoring terms
- ambiguity margin 3

The temporal gate prevents generic legal, political, technical, personal, or academic language from becoming History merely because it mentions institutions, change, systems, sources, or actors.

## Evaluation gates

The review package contains:

- 23 positive cases, one for each chapter
- 23 confusion cases separating neighboring History chapters
- 12 unsupported generic or non-historical cases
- all 16 canonical AHA fixtures

Expected evaluation:

- 58 of 58 policy cases pass
- all 23 chapters are covered
- 16 of 16 fixtures pass
- four fixtures receive a History chapter:
  - two Morgenbladet/public-sphere fixtures
  - Eidsvoll and the Constitution
  - Bislett as urban historical change
- twelve fixtures remain unsupported by History

## Approval and activation

A successful subject approval means only:

- the 23-chapter candidate is structurally complete
- the expansion from the legacy seed is explicit
- the History term policy is deterministic
- the evaluation and fixture gates pass
- a later runtime activation pull request may be prepared

It does **not** change the approved or active runtime pointer.
