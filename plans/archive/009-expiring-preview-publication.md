# Plan 009: Publish expiring previews and prospecting compliance pages

> **Executor instructions**: Complete plan 008 first. This plan has a mandatory
> provider approval gate. Implement local/in-memory behavior and the public
> contract before provisioning production infrastructure. Update plan 009 in
> the index only after production choice and tests are recorded.
>
> **Drift check (run first)**:
> `git diff --stat f7ef7cf..HEAD -- packages/interface/src packages/store/src packages/site/app packages/site/next.config.ts packages/site/package.json docs/rules/operator-obligations.md docs/rules/prospect-qualification.md docs/rules/outreach-rules.md`
> Stop if the standalone-site isolation, retention, or opt-out doctrine changed.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plan 008
- **Category**: direction
- **Planned at**: commit `f7ef7cf`, 2026-08-27

## Why this matters

The preview must be reachable without an attachment yet remain unguessable,
temporary, unindexable, and easy to withdraw. The public Next.js site is
intentionally isolated from Mongo and the private audit engine, so publication
needs a narrow object-storage seam rather than a database import or public scan
route.

## Current state

- `packages/site` is a standalone Next.js site. It currently imports neither
  private packages nor Mongo.
- `/bot` is bilingual but contains stale contact/legal details and says the bot
  runs Lighthouse during prospecting, while the shipped prescan skips it.
- Suppressions already use permanent domain/address hashes through
  `addSuppressionEntry` and `isSuppressed` in `packages/store`.
- Canonical prospect data retention is 90 days. The M9 preview design sets a
  shorter 30-day public lifetime; private metadata/artifacts must still be gone
  by 90 days at the latest.
- No object-storage provider or dependency is approved in current canonical
  docs. Choosing one is an operator decision, not an implementation detail.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Publisher tests | `pnpm exec vitest run packages/interface/src/outreach/preview-publisher.test.ts` | all pass |
| Store tests | `pnpm exec vitest run packages/store/src/outreach-previews.test.ts` | all pass |
| Site tests | `pnpm exec vitest run packages/site` | all newly added tests pass |
| Site build | `pnpm --filter @odysseus/site build` | Next.js build exits 0 |
| Full suite | `pnpm run test` | all pass, except a reported pre-existing fixture baseline |

## Scope

**In scope**:

- A `PreviewPublisher` port, in-memory adapter, and approved production adapter
  under `packages/interface/src/outreach/`
- Interface config getters and tests for the approved provider
- `packages/store/src/schemas/outreach-preview.schema.ts`, helper, tests, and
  exports
- Private CLI commands to publish/revoke/inspect previews
- A site-local, read-only provider adapter under `packages/site/lib/`; it must
  not import the interface publisher or any private workspace package
- `packages/site/app/apercu/[token]/page.tsx` and route tests
- `packages/site/app/robots.ts`
- Bilingual `/confidentialite-prospection`, `/desinscription`, and corrected
  `/bot` pages
- Required response headers and deployment documentation

**Out of scope**:

- Mongo/private-package imports in `packages/site`
- A public scanner or preview-generation endpoint
- Raw token persistence, domain-derived tokens, public bucket listing, or
  permanent preview URLs
- Tracking pixels, cookies, analytics, third-party scripts, or open metrics
- An unauthenticated public suppression database write
- Email drafting/sending or Gmail
- Provider selection, dependency installation, DNS, or account provisioning
  without operator approval

## Git workflow

- Work directly on `main`; do not create another branch.
- Use small imperative commits such as `Publish opaque expiring previews` and
  `Add prospecting privacy and opt-out pages`.
- Do not push or deploy unless asked.

## Steps

### Step 1: Obtain the production-provider decision

Present two or three options compatible with the standalone site and the
existing deployment target. For each, state data region, private-object access,
expiry/lifecycle support, request authentication, dependency needs, operating
cost, and how the Next.js server independently reads one object without Mongo
or a private workspace import. Recommend one and obtain explicit operator
approval before adding a dependency or account.

The required port is intentionally small:

```ts
interface PreviewPublisher {
  put(input: { objectKey: string; html: string; publicExpiresAt: Date }): Promise<void>;
  get(objectKey: string): Promise<{ html: string; publicExpiresAt: Date } | null>;
  delete(objectKey: string): Promise<void>;
}
```

Provide an in-memory adapter for tests and one production adapter. This is a
real seam because both exist. Do not expose provider configuration to callers.

**Verify**: decision and approval are recorded; adapter contract tests pass for
in-memory and production adapters without logging content or tokens.

### Step 2: Create opaque token and metadata storage

Generate 32 random bytes with Node crypto and encode base64url. Return the raw
token only once to the operator/caller. Store only a SHA-256 token hash and use
that hash as or within the private object key. Add immutable preview metadata:

- `previewId`, `tokenHash`, `objectKey`, `prospectId`, `prescanId`
- content/evidence contract versions
- `publishedAt`, `publicExpiresAt` at 30 days
- private `expiresAt` no later than 90 days with TTL index
- status and revocation timestamp/reason

Do not store the HTML in Mongo. Add helpers to create, resolve by hash for
private tools, and revoke through an idempotent state transition.

**Verify**: tests prove token entropy/format, no raw token at rest, uniqueness,
30-day public expiry, 90-day maximum private retention, and idempotent revoke.

### Step 3: Publish only validated plan-008 HTML

Build an orchestration module that takes an already selected prescan, rechecks
suppression, generates HTML through the plan-008 interface, writes the object,
then records metadata. On partial failure, delete the object or leave a clearly
recoverable orphan record; never return a URL before both sides succeed. Revoke
deletes the object and marks metadata.

**Verify**: fault-injection tests cover object write failure, metadata failure,
cleanup failure, duplicate request/idempotency, suppression, and expired
prescan. Logs contain IDs but no raw address, token, or HTML.

### Step 4: Serve the opaque route without private-engine imports

Implement `/apercu/[token]` server-side. Validate token syntax before hashing,
derive the object key, read through the approved provider's site-safe access
path, and return:

- 404 for malformed/unknown/revoked tokens without distinguishing causes
- 410 for a valid object past `publicExpiresAt`
- the validated HTML for a live object
- `X-Robots-Tag: noindex, nofollow, noarchive`
- `Cache-Control` that cannot outlive public expiry
- `Referrer-Policy: no-referrer` and appropriate content-security headers

Do not log the path/token. Add `/apercu/` to robots disallow; robots is
defence-in-depth, not access control. Confirm the route does not import
`@odysseus/store`, `@odysseus/interface`, or Mongo.

Because `packages/site` is deliberately standalone, implement its provider
read operation as a tiny internal read-only adapter. Do not share the interface
publisher by adding a package dependency. Keep the duplicated surface limited
to object-key derivation and the validated `{ html, publicExpiresAt }` response;
use identical contract fixtures in both packages to detect drift.

**Verify**: route tests cover every status/header, expiry boundary, malformed
tokens, provider error, and static import grep. `robots.txt` disallows preview
paths.

### Step 5: Add truthful compliance and opt-out surfaces

Create bilingual prospecting privacy and opt-out pages. State identity,
purposes, categories, exact open/company-site sources, legitimate-interest
basis as approved by canonical docs, 90-day retention, recipients/providers,
rights, and monitored contact address. `/desinscription` provides a simple free
mailto/reply path and explains immediate preview removal and future
suppression. Do not claim one-click database processing if none exists.

Correct `/bot` to distinguish paid full audit from three-page/no-Lighthouse
prescan, use current legal/contact facts, and preserve robots/pacing language.
Add a private CLI path that turns an objection into the existing permanent
hash-only suppression and revokes live previews.

**Verify**: content tests assert FR/EN required facts and prohibit stale
registration/contact/Lighthouse claims. CLI tests prove suppression plus
revocation and no raw permanent address storage.

### Step 6: Perform approved deployment checks

Only after explicit deployment authorization, configure provider credentials,
publish a synthetic preview with no third-party data, inspect headers/statuses,
revoke it, and prove it becomes unavailable. Record provider region, lifecycle
rule, credential owner, and rollback procedure without recording secrets.

**Verify**: deployment checklist records live 200, 410/404, noindex headers,
robots entry, revoke behavior, and no secret/token in logs. No real hotel data
is needed for this step.

## Test plan

- Port contract tests shared by in-memory and approved production adapters.
- Store tests for hashes, TTLs, revocation, and no raw token.
- Orchestration fault-injection tests.
- Next route tests for syntax, hash lookup, statuses, cache and security headers.
- Static package-isolation tests.
- FR/EN compliance-copy tests and private suppression CLI tests.

## Done criteria

- [x] Operator-approved provider decision is recorded.
- [x] Raw tokens exist only at creation and in the recipient URL.
- [x] Public previews expire at 30 days and private records by 90 days.
- [x] Site remains isolated from Mongo and the private audit engine.
- [x] Preview routes are unindexable, untracked, revocable, and safely cached.
- [x] Privacy, opt-out, and bot pages are truthful and bilingual.
- [x] Focused tests and `pnpm run check` pass; plan 009 is `DONE`.

Step 6 (deployment) completed 2026-08-29: Scaleway bucket provisioned, Vercel
env vars set, redeployed, and a synthetic end-to-end check (200/404/robots/
revoke) passed against the live site. See `docs/decisions/trade-offs.md`,
trade-off 43, "Provisioned and verified, 2026-08-29".

## STOP conditions

Stop if no provider is approved; a dependency/package-boundary change is
required; the deployment cannot keep objects private or suppress token logging;
the site would need Mongo/private-package imports; legal/privacy copy lacks
approval; or external provisioning/deployment authorization is absent.

## Maintenance notes

Provider-specific code stays behind `PreviewPublisher`. Rotate a token by
publishing a new preview and revoking the old one. Any future analytics proposal
must start from the no-cookie/no-pixel decision and receive a separate legal and
product review.
