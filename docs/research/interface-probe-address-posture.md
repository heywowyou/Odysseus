# Posture decision: prospecting probes of internal addresses

Research date: 2026-09-09. This note is the decision record behind GitHub issue #158 (advisor plan 028, planned at commit `71da99a`). Every repository fact below was re-verified against the live working tree on this date; the plan's drift check (`git diff --stat 71da99a..HEAD` over `packages/interface/src/prospecting`, `packages/interface/src/sirene`, `packages/interface/src/outreach`, `deploy/compose.yaml`) returned an empty diff, so all excerpts the plan was written from still match. Line numbers cite the tree as of this date. It recommends one of three postures and implements nothing; code, if approved, is a follow-up plan.

## Purpose and scope

The interface process serves the dashboard and, in the same process, runs the prospecting stage, which makes plain-fetch HTTP probes of prospect websites. Those probes bound their redirects and (in one helper) keep redirect targets on the prospect's own registrable domain, but nothing checks any host against loopback, private (RFC 1918), link-local, or unique-local addresses. In the production deploy the process runs in a container next to Caddy on a private Docker network, so a prospect URL that resolved to an internal name or address would probe the deployment's own network. This note records whether that is reachable, whether any legitimate workflow needs it, and which posture the operator is asked to approve.

Hard boundary, unchanged from the issue: the Chromium crawler fetching arbitrary third-party URLs is the product and is out of scope. Only the non-Chromium fetches in `packages/interface/src` are examined.

## Fetch inventory

Step 1 greps (non-test, `packages/interface/src`): `*.ts` hits in exactly five files and `*.tsx` hits in exactly two dashboard route files. No other non-test `fetch(` exists in the package.

| Site | Helper or client | What it fetches | URL provenance |
| --- | --- | --- | --- |
| `packages/interface/src/prospecting/probe-url.ts:139` | `probeUrl` (signature at 116 to 119) | Caller-supplied arbitrary URL, `redirect: 'manual'`, hop bound at 5 (line 23), redirect targets gated by the injected `sameSite` predicate (line 172) | Caller-supplied; see the six call sites below |
| `packages/interface/src/prospecting/fetch-candidate-page.ts:92` | `fetchPageText` (84 to 88) | Caller-supplied arbitrary URL, no `redirect` option, so redirects are followed by default with no hop bound and no same-site rule | Caller-supplied; see the six call sites below |
| `packages/interface/src/sirene/sirene-client.ts:119` | Sirene search client | The fixed constant `https://recherche-entreprises.api.gouv.fr/search` (line 20) | Fixed host (code constant) |
| `packages/interface/src/outreach/scaleway-preview-publisher.ts:12` (comment; runtime transport at 56) | `aws4fetch` signed request through the injected `doFetch` | The operator-configured bucket endpoint origin (lines 57 to 58), virtual-host style | Operator configuration |
| `packages/interface/src/dashboard/lib/api.ts:26` | `fetchJson` | Same-origin `/api/...` paths from dashboard routes and `useApi` (`dashboard/lib/use-api.ts:10`) | Browser-side, same-origin only |
| `packages/interface/src/dashboard/routes/audit-detail.tsx:237` | `openReportPdf` | Same-origin report URLs built at lines 274 to 275 and passed at 284 to 286 (`/api/audits/<id>/report/...`) | Browser-side, same-origin only |
| `packages/interface/src/dashboard/routes/login.tsx:50` | Raw fetch (deliberate, see its comment) | The literal `/api/session/login` | Browser-side, same-origin only |

The two dashboard `.tsx` sites run in the operator's browser, not in the server process, so they cannot reach the deployment's private network and are excluded from the posture question. That leaves, in the server process: one fixed public API host, one operator-configured bucket origin, and the two arbitrary-URL prospecting helpers.

### The six prospecting call sites and where their URLs come from

Provenance categories: (i) ingested catalogue data, (ii) derived from fetched page content, (iii) operator input typed into a route.

| Call site | Helper | Target | Category |
| --- | --- | --- | --- |
| `check-hotel-site.ts:164` | `probeUrl` | Homepage built by `homepageUrlFor` (lines 67 to 71) from the candidate domain passed by `qualifyHotels`, whose candidates come from the store's `listCandidatesToQualify` (`hotel-qualification/qualify-hotels.ts:251`, `:296`), driven from `packages/cli/src/commands/prospect/hotel-qualify.ts:121` | (i) |
| `check-hotel-site.ts:222` | `probeUrl` | Mentions legales URL picked by `findMentionsLegalesUrl` over same-origin anchors extracted from the homepage this probe just fetched (lines 188, 213) | (ii) |
| `hotel-contacts/fetch-contact-pages.ts:96` | `probeUrl` | Homepage built by `homepageUrlFor` (lines 62 to 66) from the cohort member domain, driven from `packages/cli/src/commands/prospect/contacts.ts:109` over qualification-store members | (i) |
| `hotel-contacts/fetch-contact-pages.ts:131` | `probeUrl` | Contact and mentions targets from `extractAnchorHrefs(homepage.html, homepage.finalUrl)` (line 112; same-origin filtered by default), plus the stored known mentions URL from plan 003 qualification data | (ii) |
| `mentions-legales-fetch.ts:48` | `fetchPageText` | `https://<domain>/` built at `queue/pipeline/run-prospect-ingestion-job.ts:177` from an AFNIC catalogue row streamed by the ingestion job (call at `:178`) | (i) |
| `mentions-legales-fetch.ts:69` | `fetchPageText` | Mentions legales URL picked by `findMentionsLegalesUrl` over the fetched homepage's anchors (`mentions-legales-fetch.ts:53`) | (ii) |

Operator input never reaches these helpers. `/api/scans` seeds are parsed at `routes/scans.ts:87` to 93 into job options and reach only `runAuditStage` (`queue/pipeline/run-full-audit-job.ts:71`), the Chromium audit crawler. Neither `routes/scans.ts` nor the full-audit job imports anything from `prospecting/`. The reconciliation pass `reconcileRedirects` re-probes adopted domains read from stored qualification rows (`hotel-qualification/reconcile-redirects.ts:265` to 286), also via `checkHotelSite` at `hotel-qualify.ts:216`, so it is category (i) with category (ii) ancestry and adds no third source.

## Deployment reachability

1. The compose stack has two services, `app` (`deploy/compose.yaml:15`) and `caddy` (`:80`), on one compose network. Docker's embedded DNS resolves both service names from inside the app container. The app's port is `expose: '4600'` and is never published (lines 65 to 69); Caddy publishes 80 and 443 (lines 82 to 84) and is the only front door. The interface binds `0.0.0.0:4600` inside its container (line 48), so from the app container both `localhost:4600` and `app:4600` answer.
2. `host.docker.internal` exists only through the commented `extra_hosts` block (lines 74 to 78), for the local smoke path against the host's test Mongo on port 27018, with the instruction "Keep commented out on the server" (line 76). Mongo itself is Atlas, not on this network (lines 1 to 2).
3. No production prospecting code targets an internal address. A grep for `localhost`, `127.0.0.1`, `0.0.0.0`, `host.docker.internal`, `app`, and `caddy` across `packages/interface/src/prospecting` and `packages/cli/src/commands/prospect` (non-test) returned no matches.
4. Fixture HTTP servers are test-only: `createServer` or `listen(` matches `packages/interface/src/auth/server-auth.test.ts`; the only non-test match is `packages/interface/src/server.ts`, the interface process's own listener, which is never a fetch target.
5. The two helpers' redirect postures differ. `probeUrl` bounds redirects at five hops (`probe-url.ts:23`) and refuses off-site targets through the `sameSite` gate (`probe-url.ts:172` to 174, wired to the registrable-domain rule at `check-hotel-site.ts:170` and `fetch-contact-pages.ts:79`); when the candidate's own registrable domain cannot be derived, `sameSite` is false for every redirect, so all redirects are refused. Neither helper inspects the initial host. `fetchPageText` (`fetch-candidate-page.ts:92` to 95) passes no `redirect` option: redirects are followed with no hop bound, no same-site rule, and the landing URL is reported as the page URL (line 99).

## Options

- **Option A, documented posture.** Keep current behaviour and record it here as an accepted risk. No code changes.
- **Option B, resolve-then-connect guard.** Add a guard to the prospecting fetch helpers: resolve the target host and refuse loopback, private, link-local, and unique-local addresses, with an explicit allowlist environment variable as the escape hatch. Applied to both helpers so `fetchPageText` does not stay the unguarded sibling.
- **Option C, ingestion-time validation only.** Reject internal-looking declared domains when candidates are resolved, and leave fetch-time behaviour unchanged.

## Recommendation

| Option | Cost | Effect |
| --- | --- | --- |
| **B (recommended)** | Moderate: one shared address guard exercised by both helpers, tests over the guard, one allowlist env var documented in the runbook | No fetch path in the prospecting stage, initial or redirected, can land on a loopback, private, link-local, or unique-local address; nothing any current workflow depends on is refused |
| A | None | The exposure below is documented, not reduced; `fetchPageText` keeps following page-controlled redirects anywhere |
| C | Low: validation at candidate resolution only | Closes only the rare category (i) door; the live path through category (ii) redirects stays open while reading as fixed |

**Recommendation: Option B**, with the follow-up plan required to cover both helpers.

The decision tips on four recorded facts, not on general advice:

1. An internal host is reachable by name from the probing process. The compose network resolves `app` and `caddy` (fact 1), and the interface process itself answers on `localhost:4600` and `app:4600` from inside its container.
2. What sits on that network is worth protecting. The interface process holds the dashboard's password session, accepts scan-creation routes, keeps the Atlas Mongo credentials in its environment, and writes the artifacts volume. The stakes are lowered by fact 2 (no database on the private network, `host.docker.internal` disabled on the server) but not removed.
3. There is a live path, not only a hygiene worry. Category (ii) targets are page-controlled: a prospect page that answers with a redirect to an internal name is followed by `fetchPageText` with no bound and no same-site rule (fact 5). `probeUrl`'s gate covers only its own redirect hops, and neither helper checks the initial host. Category (i) declared values are third-party catalogue data whose DNS is outside this deployment's control, so even the initial host can resolve to a private address without any code misbehaving.
4. A guard breaks nothing. No production workflow targets an internal address (fact 3) and fixture servers are test-only (fact 4), so every address the guard would refuse is an address no legitimate fetch was making. The allowlist escape hatch covers hypothetical future local testing; production keeps it unset, matching the `extra_hosts` posture (fact 2).

Option A is worse because it accepts, in writing, a path that fact 3 exposes to any prospect page and that fact 1 points at the process named in fact 2, while fact 4 establishes that refusing that path costs no workflow anything. Acceptance protects nothing here because the status quo's partial guard (`sameSite`) already shows the codebase treats off-site drift as a fact worth stopping.

Option C is worse because of the provenance split: it inspects only category (i) declared domains at ingestion, while the reachable path runs through category (ii) redirect targets that ingestion never sees. It would close the rare door and leave the open one, and the closed posture would then read as if the exposure were handled.

Residual risks under Option B, stated so the operator can weigh them:

- DNS rebinding between the resolve step and the connect step is **out of the recommendation's scope**. A guard that resolves then connects can still be raced by an attacker controlling a prospect domain's DNS. Closing that fully means pinning the connection to the resolved address (a custom dispatcher), which is a deeper change than this posture decision; this note records it as accepted residual risk for the guard as described.
- An address check alone does not fix `fetchPageText`'s unbounded redirects. The follow-up plan must reconcile the two helpers' redirect postures, per the plan's own maintenance note: at minimum the guard evaluates every redirect hop in both helpers; the coherent version gives `fetchPageText` the same discipline `probeUrl` already has (the five-hop bound and the same-registrable-domain gate), because otherwise page-controlled redirects keep steering the process onto arbitrary public hosts even after the internal ranges are refused.
- Resolution adds one DNS lookup per request and per hop, negligible against the crawl-delay pacing the stage already applies.
- The allowlist environment variable is operator-only power: anyone who can set it can re-open the hole. It exists for local smoke and stays unset in production.

This decision is scoped to the non-Chromium prospecting fetches. The Chromium crawler's fetching of arbitrary third-party URLs remains the product and is untouched by every option.

Extension (issue #340): the guard now lives in `packages/scanner/src/address-guard.ts` and also covers the scanner requests whose destination comes from page content rather than from the operator: the canonical-target fetch (manual redirects, each off-host hop checked, crawler user agent) and the booking-link destination navigation (checked before `goto`, then every request of that browser context through route interception). A host equal to the scanned page's own host stays allowed, since the operator chose it. The crawl of the operator-chosen site is still unguarded. If the deploy topology changes (the app gains a published port, a new compose service, or the smoke `extra_hosts` is enabled on the server), the reachability facts above go stale and the posture must be revisited.
