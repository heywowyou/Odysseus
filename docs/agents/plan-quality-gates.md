# Plan quality and executable closure

This repository treats a plan as an executable quality contract, not as persuasive prose.
The following ten safeguards exist because repeated architecture review can still miss a
requirement when the requirement has no concrete artifact or failing test.

## Ten mandatory safeguards

1. **Requirement-to-proof traceability.** Every non-archived executable plan must contain
   an `Executable closure contract` and require a requirement-to-proof mapping from each
   binding invariant to its owning implementation and focused proof.
2. **Focused proof, not suite-name proof.** `pnpm run check` or a broad green suite may
   support closure but cannot be the only proof for a specific invariant.
3. **Qualitative words need acceptance semantics.** Terms such as strongest, bounded,
   responsive, clear, durable, private, safe, exemplary or recoverable must resolve to a
   numeric budget, exhaustive mapping, negative test, or explicitly recorded human
   acceptance procedure.
4. **Quality-critical model roles are explicit profiles.** LLM pipelines with multiple
   roles use an exhaustive role/profile registry. A generic model catch-all is not a
   profile system.
5. **No silent weak fallback.** A quality-critical role may not silently fall back to a
   legacy/smaller model, wildcard profile, or unrelated global model constant.
6. **Performance has frozen budgets.** Performance/scale plans name response, query,
   page-size and interaction budgets before they can be closed; thresholds move only by
   dated, measured amendment.
7. **Security claims need negative proof.** Isolation/privacy claims require production
   fingerprints plus tests that demonstrate forbidden secret access, network reach and
   unauthenticated artifact access fail.
8. **Accessibility claims name the standard and manual proof.** Accessibility plans state
   the target standard and pair automated checks with recorded keyboard/focus/zoom/reflow/
   assistive-technology acceptance.
9. **Implemented is not done.** A root plan may remain `IMPLEMENTED` while operator,
   production, corpus or closure-trace proof is outstanding. `DONE` requires a committed
   `Closure evidence:` record in that plan.
10. **The repository checks the contract.** `pnpm run plans:check` mechanically enforces
    the structural and plan-specific ratchets above, and `pnpm run check` includes it.

## Writing a new root plan

A new executable `plans/*.md` file (excluding the historical archive and the Plan-059
exception while its existing handoff is active) must include:

- a Definition of done;
- an Executable closure contract;
- the phrase `requirement-to-proof` describing the closure artifact;
- focused negative/race/fault/manual proof where the risk cannot be established by an
  ordinary happy-path unit test.

The plan should name the artifact or seam that will carry a binding requirement. If the
author cannot name one yet, the requirement is a design question rather than a closure
criterion.

## Closing a plan

Before changing a root plan to `DONE`:

1. produce the requirement-to-proof mapping;
2. run `pnpm run plans:check`;
3. run the focused proofs named by the mapping;
4. run the repository validation appropriate to the change;
5. record a `Closure evidence:` line with the committed artifact/test references and any
   explicitly human-only acceptance result.

A prose-only final review can find missing ideas, but it cannot substitute for this
closure evidence.
