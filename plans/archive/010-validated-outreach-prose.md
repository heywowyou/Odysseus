# Plan 010: Generate and validate hotel outreach prose

> **Executor instructions**: Complete plan 006 first. Plan 008 may run in
> parallel, but its exact facts-block interface must be settled before final
> assembly tests. The model writes connective prose only and never chooses
> evidence or legal content. Update plan 010 in the index when complete.
>
> **Drift check (run first)**:
> `git diff --stat f7ef7cf..HEAD -- packages/llm/src packages/core/src/compliance packages/interface/src docs/rules/llm-layer-rules.md docs/rules/outreach-rules.md docs/rules/obligation-basis.md`
> Stop if the model client, guard pipeline, or outreach doctrine changed.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plan 006; integrates with plan 008 facts block
- **Category**: direction
- **Planned at**: commit `f7ef7cf`, 2026-08-27

## Why this matters

The LLM can adapt tone to the hotel's site language, but it must not select a
finding, invent a number, rewrite legal facts, or produce a send-ready message
that bypasses deterministic disclosures. This slice mirrors the paid-analysis
pattern: minimal aliased input, constrained JSON schema, Zod validation,
rejecting guards, retry, then deterministic assembly.

## Current state

- `packages/llm/src/client.ts` uses the Mistral SDK, JSON schemas, Zod schemas,
  and retrying analysis functions.
- `analyzeWriting` rejects theme-key mismatches, language drift, non-canonical
  severity, legal-consequence claims, invented page counts, and disallowed
  digits. Failed output is discarded, not repaired.
- `docs/rules/llm-layer-rules.md` requires the outreach call to reuse that posture and
  says language follows the prospect's site.
- `docs/rules/outreach-rules.md` defines three touches: E1 is 60 to 90 words with one
  preview link; E2 is two sentences with different evidence and no new link;
  E3 closes the loop and offers deletion. First contact requires identity,
  per-prospect data origin, purpose, and free opt-out.
- Hotel-specific argument B cannot ship while its source remains secondary.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Schema/prompt tests | `pnpm exec vitest run packages/llm/src/outreach` | all pass |
| Assembly tests | `pnpm exec vitest run packages/interface/src/outreach/assemble-outreach-draft.test.ts` | all pass |
| Existing LLM regression | `pnpm exec vitest run packages/llm/src/analyze-writing.test.ts packages/llm/src/client.test.ts` | all pass |
| Validation | `pnpm run check` | exit 0 |
| Full suite | `pnpm run test` | all pass, except a reported pre-existing fixture baseline |

## Scope

**In scope**:

- `packages/llm/src/outreach/schema.ts`, mirrored JSON schema, prompt, guards,
  generator, and tests (create)
- `packages/llm/src/index.ts`
- `packages/interface/src/outreach/assemble-outreach-draft.ts` and tests
- Reuse of the plan-008 facts block and plan-005 evidence aliases
- Documentation updates needed to freeze the output contract

**Out of scope**:

- Gmail, previews, scheduling, sending, or thread state
- Model selection of findings/evidence or access to raw HTML/full pages
- Model-written legal text, disclosures, price, link, sender identity, origin,
  opt-out, signature, or deletion promise
- Population/prevalence statistics, penalty language, conclusions, competitors,
  official RGAA/conformity claims, or unsupplied numbers
- Live Mistral calls in tests or changing paid-report prompts/guards

## Git workflow

- Work directly on `main`; do not create another branch.
- Use an imperative commit such as `Generate guarded hotel outreach prose`.
- Do not push unless asked.

## Steps

### Step 1: Define one constrained prose contract per touch

Create a discriminated Zod schema and mirrored Mistral JSON schema. The model
returns only:

- E1: establishment-specific subject, opening, evidence sentence, and
  low-commitment question
- E2: exactly two short sentences referring to the supplied second alias
- E3: one short closing sentence before the deterministic deletion/opt-out line

It does not return a complete email, facts block, URL, footer, signature, or
disclosure. Use stable evidence aliases like `e1`/`e2`; never show model-facing
finding IDs. Keep fields shallow and length-bounded.

**Verify**: schema-shape tests prove Zod and JSON schema stay aligned and reject
extra fields, wrong touch fields, empty prose, URLs, and overlong values.

### Step 2: Build a minimal prompt input

Input contains language, establishment display name, touch number, one selected
public observation/criterion alias, coarse page role, and permitted age framing
flag. E1 and E2 receive different deterministic aliases. E3 receives no scan
evidence. Do not send raw HTML, full findings, selectors, URLs, other prospects,
reference statistics, obligation assessment, or legal source text.

System prompt must directly state all outreach prohibitions; do not claim they
are inherited from the paid-report prompt. Require plain text, no Markdown,
truthful subject, and no meeting request in E1.

**Verify**: prompt snapshots contain the selected alias and prohibitions and do
not contain raw IDs/URLs/HTML/legal block/other findings.

### Step 3: Add outreach-specific rejecting guards

After Zod parsing, reject and retry for:

- wrong language or prohibited Markdown/HTML/URL
- alias mismatch or evidence language unsupported by supplied observation
- any digit/number not in an explicit scan-derived allowlist (normally empty)
- population/prevalence/statistical language
- legal status, penalty, inspection, litigation, competitor, RGAA/conformity,
  price, or offer claims
- named-person salutation, free-mail address, phone ask, meeting/calendar ask,
  curiosity-gap subject, or more than one evidence item
- E1/E2/E3 structural/length violations

Reuse existing guard helpers where their exact semantics fit. Do not weaken a
paid-report guard to make outreach pass. Exhausted retries throw and produce no
partial draft.

**Verify**: one test per rejection class plus retry-then-success and exhausted
retry cases, using a stub model client only.

### Step 4: Assemble deterministic content outside the model

In `interface`, assemble generated prose with code-owned content in this order:

1. generated touch prose
2. the one preview link for E1 only
3. optional plan-008 facts block only in the touch and source state permitted by
   canonical outreach rules
4. deterministic sender identity/signature
5. E1 origin/purpose/privacy/opt-out disclosures
6. E3 exact deletion and opt-out offer

The assembler takes structured values and returns subject plus plain-text body.
It must verify any inserted facts block is byte-identical to the builder output
and run final guards across the whole body. A failed assembly is discarded,
never repaired.

Given the current secondary hotel legal source, production assembly defaults to
argument-A-only. The generic facts block may be enabled only after plan 008's
source gate and canonical approval allow it.

**Verify**: assembly tests prove byte identity, E1 one-link limit, E2/E3 no
link, required disclosures, evidence separation, word/sentence constraints,
and prohibited-phrase absence in both languages.

### Step 5: Expose one deep generation interface

Export a single `generateOutreachProse(input, modelClient?)` interface from
`llm`. Keep attempts, schemas, prompts, and individual guards internal. Export
one assembler from `interface` that accepts validated prose plus deterministic
facts. Tests should cross these interfaces rather than testing implementation
details beyond schema/guard-focused unit tests.

**Verify**: public exports are narrow; paid analysis exports and tests remain
unchanged; `pnpm run check` passes.

## Test plan

- Schema parity and negative-shape tests.
- Prompt content/redaction snapshots.
- Stubbed model responses for every guard and retry outcome.
- FR/EN assembly fixtures for E1/E2/E3.
- Assertions for word count, sentence count, link count, evidence alias, byte
  identity, disclosures, and all prohibited claim families.
- No live model call is required for completion; an operator-approved manual
  sample review occurs before plan 011 creates real drafts.

## Done criteria

- [ ] Model input contains one aliased evidence item and no raw/private audit
  material.
- [ ] Model output is constrained JSON, Zod-validated, guarded, and retried.
- [ ] Legal content and disclosures are deterministic and byte-checked.
- [ ] E1/E2/E3 structure follows canonical sequence and link limits.
- [ ] Exhausted retries create no draftable output.
- [ ] Existing paid-analysis behavior is unchanged.
- [ ] Focused tests and `pnpm run check` pass; plan 010 is `DONE`.

## STOP conditions

Stop if plans 005/008 interfaces are not stable; hotel legal source approval is
missing for proposed argument B; the model would need raw pages or full
findings; output cannot be guarded deterministically; a dependency/locked
contract change is needed; or canonical touch rules conflict after drift.

## Maintenance notes

Add a new prompt/schema version for material changes and retain the version on
every draft record. Never broaden the model input merely because a new stored
field exists. Conversion analysis should compare touch/evidence variants, not
silently tune prompts without versioned outcomes.
