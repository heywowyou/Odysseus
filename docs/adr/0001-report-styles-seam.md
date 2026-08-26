# A typed style seam for report sections, with a fixed canonical caption width

Report sections hand-typed CSS in `style=""` attributes with no compile-time or
test enforcement, which let `var(--space-5)` (never declared in `nocturne.css`)
silently compute to zero spacing in a real La Corniche PDF, and let the muted
body-caption role's `max-width` drift to three different values (64ch, 66ch,
68ch) across files with no semantic reason. We introduced
`packages/report/src/template/report-styles.ts` with two fixed-shape builders,
`spacing(token: SpaceToken)` and `captionStyle()`, both returning bare CSS
declaration fragments for callers to compose into their own `style=""`
attribute, and migrated every existing call site of those two roles onto them
in one pass.

`captionStyle()` takes zero parameters: `max-width` is locked to 66ch (the
majority of the pre-existing call sites) rather than left as a per-call-site
parameter. This is a deliberate convergence, not a neutral refactor — a
reasonable reader will see identical-looking caption paragraphs stop varying
in width across sections and might wonder whether that was intentional. It
was: no semantic justification was found for the prior variation, and keeping
width as a parameter would have made future drift an available (if typed)
choice instead of removing it.

`spacing-tokens.test.ts`'s runtime scan of every `.ts`/`.css` file stays
alongside the new compile-time `SpaceToken` union: nothing stops a future
author writing a raw `var(--space-x)` inline instead of using `spacing()`, and
the compile-time union only protects callers who actually use the builder.

## Considered options

- **Property-aware wrappers** (`marginBottom(token)`, `padding(token)`, one
  per CSS property) instead of a single bare-fragment `spacing(token)`.
  Rejected: token usage spans margin-top, margin-bottom, padding, and padding
  shorthand combos: one bare-value function composes with all of them without
  multiplying the interface.
- **`captionStyle({ maxWidthCh })`**, keeping width as a typed parameter.
  Rejected in favor of a fixed 66ch: margin-bottom is genuinely incidental to
  where a caption sits and stays a separate `spacing()` call at those sites,
  but width had no such justification, so fixing it removes the drift instead
  of formalizing it.
- **Generate `SpaceToken` from `nocturne.css` at build time**, making drift
  structurally impossible. Rejected: `nocturne.css` is a locked file
  ("extracted verbatim from the approved Claude Design artifact... do not
  edit values here") with only six tokens today; a codegen step is more
  machinery than a rarely-changing six-token file needs. The existing
  hand-maintained-union-plus-test-guard pattern (`spacing-tokens.test.ts`)
  gets the same safety without one.
