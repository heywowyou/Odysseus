---
name: implement
description: "Explicit implementation workflow for a selected spec or ticket set."
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets.

Use /tdd where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Once done, use /code-review to review the work.

Commit only when the operator asked for a commit or the active task already includes one.
