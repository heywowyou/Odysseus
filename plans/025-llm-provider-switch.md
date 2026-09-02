# Plan 025: Switch the LLM provider from Mistral to OpenAI gpt-4.1-mini

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MEDIUM
- **Depends on**: none
- **Category**: llm provider swap
- **Planned at**: commit `74b5950`, 2026-09-01

Operator approvals bundled in this plan: adding the `openai` dependency and
removing `@mistralai/mistralai` (CLAUDE.md's locked dependency list changes
accordingly), plus the consequential edits to `CLAUDE.md`,
`docs/rules/llm-layer-rules.md`, `docs/rules/operator-obligations.md`, and
`docs/decisions/trade-offs.md`. Ordering this plan is the approval; step 4
records it durably in trade-offs. No other locked contract changes.

## Why this matters

Mistral's largest model is unusable from the current account (HTTP 403
`tier_not_allowed`, see the `MISTRAL_MODEL` comment in
`packages/llm/src/constants.ts:14-22`), so every live pass runs
`mistral-medium-latest` as a stopgap at $1.50 in / $7.50 out per 1M tokens.

`docs/research/llm-provider-alternatives.md` (2026-08-29) compared the
alternatives against this project's seven criteria: strict server-side
`json_schema`, strong French and English client-facing prose, no
reasoning-token budget trap, `temperature: 0.2` accepted, price at volume, EU
data posture, and small migration. Its conclusion:

- **gpt-4.1-mini ($0.40 in / $1.60 out) is the only candidate passing all
  seven with no caveats**, roughly 3.7x cheaper on input and 4.7x cheaper on
  output than the current baseline, about $0.026 per 16k-token generation
  versus about $0.12. It is not a reasoning model, so the Magistral-style
  thinking-blocks-share-the-output-budget failure mode cannot recur.
- Rejected alternatives, so the executor does not relitigate them:
  gpt-4o-mini ($0.15/$0.60, same request shape, deferred pending a French
  prose verdict, see step 5's fallback), GLM-4.5/4.7-Flash (free, but no
  server-side schema enforcement and a China-based vendor, fails the
  structured-output criterion for production), GPT-5 mini/nano (reject
  `temperature: 0.2`), DeepSeek V4 (`json_object` only, thinking on by
  default), Qwen flash (no strict `json_schema` on the Singapore
  international region), Claude Haiku 4.5 (pricier, different API shape),
  grok-4.3 (no cheap tier).

Cost matters directly for plan 014's first-100 rollout: prospecting calls the
model once per prospect, audits two to three times per audit.

## Model id decision

Pin the dated snapshot `gpt-4.1-mini-2025-04-14`, not the moving
`gpt-4.1-mini` alias. The llm layer records `model` and `temperature` on
every persisted analysis precisely so a provider-side change never reads as
the client's site changing (`docs/rules/llm-layer-rules.md` section 3); a
pinned snapshot applies the same discipline to the constant itself. The alias
is rejected because it silently shifts behavior when OpenAI repoints it. When
OpenAI eventually announces snapshot deprecation, changing this one constant
is the whole migration (note it in `deploy/runbook.md`, step 4).

## Current state

- Exactly two files import the SDK: `packages/llm/src/client.ts` and
  `packages/llm/src/outreach/outreach-client.ts`. Both use the identical
  surface: `new Mistral({ apiKey })`, `client.chat.complete({ model,
  maxTokens, temperature, messages, responseFormat })`,
  `response.choices?.[0]`, `choice.finishReason === 'length'`,
  `choice.message?.content` with a plain-string check, then an explicit
  Zod `.parse(JSON.parse(content))`.
- `client.ts` holds three calls: `callMistralForStructure` (L59-109),
  `callMistralForWriting` (L119-172), `callMistralForReview` (L185-226).
  `outreach-client.ts` holds `callMistralForOutreach` (L39-102), dispatching
  per touch to one of three schema/JSON-mirror pairs.
- Constants: `MISTRAL_MODEL = 'mistral-medium-latest'` (L22, tier-gate
  comment L14-21), `MISTRAL_TEMPERATURE = 0.2` (L34), `MAX_OUTPUT_TOKENS =
  16000` (L48, Magistral rationale L41-47), `REVIEWER_MAX_OUTPUT_TOKENS =
  16000` (L56), `MAX_RETRIES = 2` (L12). Config: `getMistralApiKey()` reads
  `MISTRAL_API_KEY` (`packages/llm/src/config.ts:50-59`), re-exported from
  `packages/llm/src/index.ts:75`.
- Importers of the `MISTRAL_*` constants and `getMistralApiKey` are all
  inside `packages/llm`: `client.ts`, `analyze-structure.ts`,
  `analyze-writing.ts`, `analyze-review.ts`, `outreach/outreach-client.ts`,
  `outreach/generate-outreach-prose.ts`, plus the public re-export and five
  test files. No package outside `@odysseus/llm` imports them. External env
  references: `.env.example:1`, `README.md:43`, `deploy/runbook.md:125`.
- The seven hand-mirrored JSON Schemas (`structure-output-schema.ts`,
  `writing-output-schema.ts`, `reviewer-output-schema.ts`,
  `outreach/output-schema.ts` touch 1-3) already follow OpenAI strict-mode
  conventions: `additionalProperties: false` at every object level, all
  properties listed in `required`, no top-level unions (outreach dispatches
  per touch instead). They transfer unchanged as shape hints; the Zod
  schemas remain the validation authority, and the mirror-sync tests stay.
- Test seams: `client.test.ts` is the only SDK-module mock
  (`vi.mock('@mistralai/mistralai', ...)` with a `choice()` helper building
  `{ choices: [{ finishReason, message: { content } }] }`). Five files mock
  the wrapper functions by name and would follow a rename:
  `analyze-structure.test.ts`, `analyze-writing.test.ts`,
  `analyze-review.test.ts`, `two-pass.integration.test.ts`, and
  `outreach/generate-outreach-prose.test.ts`. Assertions compare against the
  imported constants, so they survive a value change and only need the
  rename. `interface` pipeline tests carry fixture strings
  `model: 'mistral-test'` (`analysis-stage.test.ts:110,127,145`,
  `report-stage.test.ts:81`).
- Persisted model identifiers are plain strings
  (`packages/store/src/schemas/analysis.schema.ts:22-27`); ~100 frozen
  artifacts and fixture JSONs record `mistral-medium-latest` as historical
  run data and stay untouched, as do the historical test literals
  `'mistral-medium-latest'` and `'mistral: exhausted retries'` in store and
  core tests (they describe already-persisted data, not current behavior;
  production retry-exhaustion messages are provider-neutral).
- Research-verified OpenAI facts
  (`docs/research/llm-provider-alternatives.md`): chat completions accepts
  `temperature` 0 to 2 for gpt-4.1-mini; strict `json_schema` via
  `response_format: { type: 'json_schema', json_schema: { name, schema,
  strict: true } }` in the same shape the code already sends; API data is
  not used for training by default; an EU data-residency endpoint
  (`eu.api.openai.com`) exists with regional storage and processing at a 10
  percent uplift, enabled at the organization level; official TypeScript
  SDK.

## Scope

**In scope**:

- `packages/llm` (config, constants, client, outreach client, re-exports,
  comments, package.json) and its test files
- fixture strings and doc comments in `packages/interface`,
  `packages/cli/src/commands/analyze.ts`,
  `packages/store/src/schemas/analysis.schema.ts`
- `CLAUDE.md`, `docs/rules/llm-layer-rules.md`,
  `docs/rules/operator-obligations.md`, `docs/decisions/trade-offs.md`
  (new entry), `docs/agents/coding-conventions.md`, `README.md`,
  `.env.example`, `deploy/runbook.md`, `plans/README.md`
- one live smoke test per JSON schema and one French/English A/B
  regeneration on an already-saved audit (no site re-scan)

**Out of scope**:

- any prompt-text change (prompts stay byte-identical), guard, threshold,
  retry-budget, or schema change
- locked contracts (`packages/core/src/types/llm-output.ts` and the rest of
  the locked list)
- switching to gpt-4o-mini (documented fallback only, see stop conditions)
- frozen artifacts, fixture JSONs, and historical test literals
- Mistral mentions in historical/archive documents and archived plans
- plan 014, 020, 021 work; new live browser scans; pushes

## Steps

### Step 1: Swap the SDK and the three analysis-pass call sites

1. `packages/llm/package.json`: replace `@mistralai/mistralai` with
   `openai` (latest), update the description (L5). Run the install so the
   lockfile follows; in the WSL shell where `pnpm` is not on PATH, use the
   recorded explicit-node workaround (see Verification note below). If the
   lockfile still cannot be updated, stop and ask the operator to run
   `pnpm install`; never hand-edit it.
2. `config.ts`: `getMistralApiKey()` becomes `getOpenAiApiKey()` reading
   `OPENAI_API_KEY`, same loud-error style; add `getOpenAiBaseUrl()`
   returning `process.env['OPENAI_BASE_URL'] || undefined` (undefined lets
   the SDK default apply). Keep the deliberate duplication header comment
   intact.
3. `constants.ts`: `MISTRAL_MODEL` becomes `OPENAI_MODEL =
   'gpt-4.1-mini-2025-04-14'`, `MISTRAL_TEMPERATURE` becomes
   `OPENAI_TEMPERATURE = 0.2`. Rewrite the comments: the tier-gate comment
   is history (say so, one line); the temperature comment keeps the
   repeatability rationale and notes gpt-4.1-mini accepts 0 to 2; the
   `MAX_OUTPUT_TOKENS` comment keeps the truncation history and gains that
   the current provider is not a reasoning model.
4. `client.ts`: `createClient()` returns
   `new OpenAI({ apiKey: getOpenAiApiKey(), baseURL: getOpenAiBaseUrl() })`.
   Port all three calls. Request mapping: `chat.complete` becomes
   `chat.completions.create`; `maxTokens` becomes `max_completion_tokens`;
   `responseFormat: { type: 'json_schema', jsonSchema: { name,
   schemaDefinition, strict: true } }` becomes `response_format: { type:
   'json_schema', json_schema: { name, schema, strict: true } }`; messages
   and `temperature` are unchanged. Response mapping: `finishReason` becomes
   `finish_reason`, content handling is identical. Add one small hardening:
   a non-null `message.refusal` throws the same way a malformed body does,
   feeding the existing retry loop (OpenAI exposes what Mistral lacked).
   Update the doc comments (the refusal-signal sentence and the
   `reasoningEffort` paragraph become provider history) and the error
   strings.
5. `analyze-structure.ts`, `analyze-writing.ts`, `analyze-review.ts`:
   rename imports, update the stamped `model`/`temperature` constants and
   the refusal-signal comments.
6. `index.ts`: update the re-exports (`getOpenAiApiKey`, and the constants
   if re-exported).
7. Tests: rewrite the SDK-module mock in `client.test.ts` around the
   `openai` package shape (`chat.completions.create`, `finish_reason`,
   `message.content`, `message.refusal`), add one case proving a
   refusal throws into the retry path; rename the wrapper mocks in
   `analyze-structure.test.ts`, `analyze-writing.test.ts`,
   `analyze-review.test.ts`, `two-pass.integration.test.ts`.

**Verify**: focused Vitest over those five test files passes, and
`tsc -b packages/llm` (or the explicit-node equivalent) exits 0.

### Step 2: Port the outreach call site

`outreach/outreach-client.ts`: `callMistralForOutreach` becomes
`callOpenAiForOutreach` with the same request/response mapping as step 1 and
the same per-touch schema dispatch. `outreach/generate-outreach-prose.ts`:
rename the import, update the stamp and the two live-Mistral behavior
comments (mark them dated history if the wording still carries). Update the
mock in `outreach/generate-outreach-prose.test.ts`.

**Verify**: focused Vitest over `generate-outreach-prose.test.ts` passes.

### Step 3: Naming and comment hygiene (no behavior)

1. `packages/interface/src/pipeline/analysis-stage.test.ts:110,127,145` and
   `report-stage.test.ts:81`: `'mistral-test'` becomes `'openai-test'`.
2. `packages/store/src/schemas/analysis.schema.ts:22-32`: doc comments
   become provider-neutral ("model identifier as recorded at generation
   time"); the Mongoose field definitions are unchanged.
3. Schema-mirror headers (`structure-output-schema.ts:3-6`,
   `writing-output-schema.ts:3`, `reviewer-output-schema.ts:3`,
   `outreach/output-schema.ts:3`) and `outreach/outreach-schema.ts:10`:
   replace the Mistral-SDK rationale with the standing one (explicit,
   auditable shape hint; workspace stays on zod v3; sync tests are the
   drift guard).
4. `outreach/outreach-prompt.ts:17` and `writing-prompt.ts`: mark live
   Mistral measurements as dated history if cited as current behavior.
5. `rate-limit-pacing.ts:9`: drop the Mistral code 1300 reference; the 429
   regex is provider-agnostic and stays. Note the fresh-key low-tier rate
   limits for the runbook in step 4.
6. `packages/cli/src/commands/analyze.ts:34` help text and
   `packages/interface/src/pipeline/analysis-stage.ts:3,295` doc comments.

**Verify**: lint, `tsc -b` for the touched packages, and the docs check all
exit 0.

### Step 4: Documentation

Order matters: this step lands before any live OpenAI call in step 5,
because the standing analysis authorization names the provider.

1. `CLAUDE.md`: L402 dependency list (`@mistralai/mistralai` becomes
   `openai`); L438 llm package description; L584 "Tests never call the live
   Mistral API" becomes provider-neutral; L590-598 standing authorization
   becomes "configured OpenAI API" with the cost sentence updated (about
   $0.026 per generation).
2. `docs/rules/llm-layer-rules.md`: sections 3 and 8 plus the passages at
   L126, L141, L152-155, L160-163, L177, L179-184, L199-204 rewritten to
   the new provider; dated live measurements (L647, L669, L705-735) stay,
   labeled as history; the section 8 closing note about zod v4 is reworded
   (the mirrors are kept deliberately; the sync tests remain the drift
   guard).
3. `docs/decisions/trade-offs.md`: new entry (next free number) recording
   the decision, cost and criteria evidence, the rejected alternatives, and
   the operator approval; amend trade-off 53's cross-reference note
   (L2400-2409) to point at the new entry as the required provider
   comparison. Update the compact trade-off index in `CLAUDE.md` if it
   lists 53.
4. `docs/rules/operator-obligations.md` L59-61, L72, L83: the deployer/
   provider statement names OpenAI; note the DPA, no-training-on-API-data
   default, and the EU residency option at a 10 percent uplift.
5. `docs/agents/coding-conventions.md:101`, `README.md:43`,
   `.env.example` (`OPENAI_API_KEY=`, commented `OPENAI_BASE_URL=`),
   `deploy/runbook.md` (key setup, EU endpoint opt-in, snapshot
   deprecation note, fresh-key rate-limit tiers).
6. `plans/README.md`: mark this plan's status per its outcome.

**Verify**: `node scripts/check-agent-docs.mjs` exits 0 (all local links
resolve).

### Step 5: Verification and quality evidence

1. Full gates: workspace build and typecheck, the full unit suite, store
   suite (Mongo test service per `plans/README.md` verification baseline),
   formatting, docs check, i.e. the `pnpm run check` equivalent.
2. Schema smoke test against the live API: one minimal call per JSON schema
   (seven cheap calls, well under a cent) proving OpenAI strict mode
   accepts every shape hint. Requires `OPENAI_API_KEY` in `.env`,
   operator-provided; without it, stop before this sub-step and ask.
3. Quality A/B, the evidence trade-off 53 requires for a provider change:
   regenerate the analysis in French and English from an already-saved
   audit's `findings.json` (no site re-scan; standing-authorized after
   step 4). The guards run as always. Compare theme grouping against the
   stored Mistral output, then read the French prose as a client would
   (per CLAUDE.md's testing section, live verification is a manual read).
4. Record the evidence (costs, guard outcomes, the operator's prose
   verdict) in the new trade-offs entry and the session log; leave the
   session log `ready-for-commit`.

**Verify**: all gates green; the A/B artifacts exist under the audit's
`analyses/` with `model: 'gpt-4.1-mini-2025-04-14'` recorded.

## Test plan

- `client.test.ts` rewritten for the `openai` SDK shape, including the new
  refusal-throws case and the `finish_reason: 'length'` truncation case.
- Wrapper-mock renames in the five dependent test files; assertions stay
  constant-based.
- Mirror-sync tests (`structure-output-schema` / `writing-output-schema`
  sync assertions) pass unchanged, proving the mirrors still describe the
  Zod schemas.
- Full unit and store suites green before handoff.

## Done criteria

- [ ] No file under maintained source imports `@mistralai/mistralai`; the
      dependency is removed and `openai` is in `packages/llm` and the
      lockfile.
- [ ] All four call sites (structure, writing, review, outreach) run
      `gpt-4.1-mini-2025-04-14` at temperature 0.2 through strict
      `json_schema`, with Zod validation, guards, retry budget, and
      fail-loud behavior unchanged.
- [ ] Persisted analyses record the new model identifier; historical data
      and fixtures untouched.
- [ ] All step 4 documents updated consistently, including the new
      trade-offs entry with the recorded quality evidence.
- [ ] `pnpm run check` and the full test suite pass.
- [ ] French and English A/B outputs exist and the operator has read the
      French prose.
- [ ] `plans/README.md` shows this plan's final status.

## Stop conditions

Stop and report if:

- OpenAI strict mode rejects a shape hint in a way a mirror-only fix cannot
  solve (the fix must never touch the Zod authority);
- the pinned snapshot id is not accepted by the API (model-not-found):
  confirm the current dated snapshot from OpenAI's docs, and if it differs,
  treat that as a one-constant change under this plan and note it in the
  trade-offs entry;
- the French prose fails the operator read: the documented fallback is a
  one-constant switch to `gpt-4o-mini` (same code path, cheaper) or a
  revert of the whole commit, Mistral remaining intact in git history;
- the `pnpm install` for the lockfile cannot be completed in the executor's
  shell;
- anything would require editing a locked contract or the locked
  `llm-output.ts`.

## Verification note (executor environment)

In the WSL shell where `pnpm` is not on PATH, use the recorded
explicit-node pattern from prior sessions, for example:
`/home/heywow/.nvm/versions/node/v22.23.2/bin/node node_modules/vitest/vitest.mjs run --project unit <files>` and
`/home/heywow/.nvm/versions/node/v22.23.2/bin/node scripts/check-agent-docs.mjs`.
Run `git status --short` first and treat the plan 020 session's uncommitted
changes as deliberate; this plan's slices must not fold, revert, or
reorder them.

## Maintenance notes

- The research backing this plan lives in
  `docs/research/llm-provider-alternatives.md`; if prices or capabilities
  are re-checked later, update that file rather than citing it from memory.
- If the operator later wants `gpt-4o-mini` for cost, that is a
  one-constant change plus a French prose read, not a new plan.
- `MISTRAL_API_KEY` may remain in the operator's `.env` harmlessly; remove
  it whenever convenient after cutover.
