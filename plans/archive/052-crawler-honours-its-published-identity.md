# Plan 052: The crawler obeys robots.txt rules written for it and identifies itself on every request

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report; do not improvise. When done, update this plan's status row in
> `plans/README.md`, unless a reviewer dispatched you and said they maintain
> the index.
>
> **Drift check (run first)**:
> `git diff --stat 38a516f2..HEAD -- packages/scanner/src/robots.ts packages/scanner/src/robots.test.ts packages/scanner/src/crawl.ts packages/scanner/src/crawl.test.ts packages/scanner/src/browser.ts packages/scanner/src/checks/llms-txt.ts packages/scanner/src/checks/security-headers.ts packages/scanner/src/checks/cookie-consent.ts packages/scanner/src/scan-site.ts packages/interface/src/pipeline/audit-stage.ts .env.example`
> If any of these changed, compare the "Current state" excerpts with the live
> code. A mismatch is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (charter non-negotiable rule 5: polite crawling)
- **Planned at**: commit `38a516f2`, 2026-09-17

## Why this matters

The project charter (`CLAUDE.md`, non-negotiable rule 5) says: "Crawling is
polite: respect `robots.txt`, use the identifiable user agent, preserve pacing
and hard timeouts."

Four defects break that rule today:

1. **Bot-specific groups never match.** `parseRobotsTxt` compares each
   `User-agent:` value with the whole lower-cased UA header
   (`odysseusauditbot/0.1 (+https://odysseusaudit.com/bot)`). A robots.txt
   line holds a product token (`OdysseusBot`), so an exact match can never
   happen. Every site is crawled under its `*` group, even when it wrote a
   group that blocks our bot.
2. **The public instructions name the wrong token.** The public `/bot` page
   and `/llms.txt` tell site owners the UA contains `OdysseusBot/1.0` and to
   write `User-agent: OdysseusBot`. The crawler actually sends
   `OdysseusAuditBot/0.1`. A site that follows our own published opt-out is
   still crawled.
3. **Query strings are ignored.** Rules are matched against `pathname` only,
   so `Disallow: /*?sort=` never fires.
4. **The redirect target is not checked.** Only the requested URL is checked,
   so a redirect to a disallowed same-site path is still loaded and analysed.

Separately, three site-level requests (the robots.txt fetch, `/llms.txt`, and
the security-headers GET) send Node's default UA instead of ours.

After this plan:

- the crawler matches robots.txt groups by product token;
- its default identity is the one the public site publishes;
- query strings and post-redirect URLs are checked;
- every request to the audited site carries the crawler UA.

## Current state

### Files and roles

- `packages/scanner/src/robots.ts`: pure robots.txt parser and matcher, plus
  the raw fetch.
- `packages/scanner/src/crawl.ts`: the crawl loop that enforces robots.txt.
- `packages/scanner/src/browser.ts:11`: default UA constant.
- `packages/scanner/src/config.ts:141-149`: `getCrawlerUserAgent()`, the single
  source of the UA. Today the env variable `CRAWLER_USER_AGENT` overrides the
  default; Step 2 removes that override (operator decision, 2026-09-17).
- `packages/scanner/src/checks/llms-txt.ts` and
  `packages/scanner/src/checks/security-headers.ts`: site-level fetches with no
  UA header.
- `packages/scanner/src/scan-site.ts:1122-1150`: calls those checks.
- `packages/interface/src/pipeline/audit-stage.ts:195-245`: builds the audit
  config (`userAgent: getCrawlerUserAgent()` at line 206). It calls `scanSite`
  without `userAgent`, so the `scanSite` helpers only get a UA when they fall
  back to `getCrawlerUserAgent()` themselves.
- `packages/site/app/bot/page.tsx:112-117,229-234` and
  `packages/site/app/llms.txt/route.ts:33`: public copy naming
  `OdysseusBot/1.0` and `User-agent: OdysseusBot`. **Do not edit these.** The
  crawler changes to match the published copy.

### Excerpts

`packages/scanner/src/robots.ts:94-96`, the broken match:

```ts
  const ua = userAgent.toLowerCase();
  const matched =
    groups.find((g) => g.agents.includes(ua)) ?? groups.find((g) => g.agents.includes('*'));
```

`packages/scanner/src/robots.ts:159-165`, which sends no UA header:

```ts
export async function fetchRobotsText(origin: string, timeoutMs: number): Promise<string | null> {
  try {
    const response = await fetch(new URL('/robots.txt', origin), {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
```

`packages/scanner/src/robots.ts:220-231`: `checkAiCrawlerAccess` calls
`parseRobotsTxt(robotsText, agent)` with **bare** tokens such as `'GPTBot'`.
Token extraction must leave a bare token unchanged.

`packages/scanner/src/browser.ts:11`:

```ts
export const ODYSSEUS_USER_AGENT = 'OdysseusAuditBot/0.1 (+https://odysseusaudit.com/bot)';
```

`.env.example:19`:

```
CRAWLER_USER_AGENT=OdysseusAudit/0.1 (+https://odysseusaudit.com/bot)
```

`packages/scanner/src/crawl.ts:547` (enforcement) and `:862` (the
robots-disallow-broad tally):

```ts
        if (!isAllowedByRobots(robotsRules, new URL(item.url).pathname)) {
...
    const blockingPattern = findBlockingPattern(robotsRules, new URL(page.url).pathname);
```

`packages/scanner/src/crawl.ts:573-583`: after `goto`, the loop reads
`browserPage.url()` for the off-site redirect check but never re-checks
robots.txt:

```ts
          const response = await browserPage.goto(item.url, { waitUntil: 'load' });
          const httpStatus = response?.status();
          const contentType = response?.headers()['content-type'];
          ...
          const finalHost = safeHostname(browserPage.url());
          const requestedHost = new URL(item.url).hostname;
          const isOffSite = finalHost !== null && !isSameSiteHostname(requestedHost, finalHost);

          if (isOffSite || (finalHost !== null && isSocialPlatformHost(finalHost))) {
            recordPage({ url: item.url, depth: item.depth, status: 'skipped-external-redirect', ...
```

`packages/scanner/src/checks/llms-txt.ts:24` and
`packages/scanner/src/checks/security-headers.ts:33`:

```ts
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    const response = await fetch(origin, { signal: AbortSignal.timeout(timeoutMs) });
```

`packages/scanner/src/checks/cookie-consent.ts:254-256` opens a context with
the default HeadlessChrome UA when `options.userAgent` is undefined:

```ts
  const context = await browser.newContext(
    options.userAgent !== undefined ? { userAgent: options.userAgent } : {},
  );
```

### Conventions

- ESM with `.js` suffixes on relative imports.
- Explicit return types on exported functions.
- Comments explain *why*, not *what*. Match the dense doc-comment style
  already in `robots.ts`.
- Test descriptions state observable behaviour.
- Tests never touch the network: `crawl.test.ts` stubs global `fetch` with
  `installFetchStub` and a fake browser (`makeFakeBrowser`, around lines
  70-128), and `checks/llms-txt.test.ts` starts a local `node:http` server.
  Follow those patterns.
- The fallback pattern to copy is already in `crawl.ts:354`:
  `const userAgent = options.userAgent ?? getCrawlerUserAgent();`.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Focused unit tests | `pnpm test packages/scanner/src/robots.test.ts packages/scanner/src/crawl.test.ts packages/scanner/src/checks/llms-txt.test.ts packages/scanner/src/checks/security-headers.test.ts` | all pass |
| Scanner unit tier | `pnpm test packages/scanner` | all pass |
| Format | `pnpm run format` | exit 0 |
| Full gate | `pnpm run check` | exit 0 |
| Unit suite | `pnpm test` | all pass (fixture-freshness failures caused by missing real-scan data on this machine are pre-existing; confirm they also fail on `38a516f2`) |

## Scope

**In scope:**

- `packages/scanner/src/robots.ts`, `packages/scanner/src/robots.test.ts`
- `packages/scanner/src/crawl.ts`, `packages/scanner/src/crawl.test.ts`
- `packages/scanner/src/browser.ts` (the UA constant and its doc comment only)
- `packages/scanner/src/checks/llms-txt.ts`, `checks/llms-txt.test.ts`
- `packages/scanner/src/checks/security-headers.ts`, `checks/security-headers.test.ts`
- `packages/scanner/src/checks/cookie-consent.ts` (the UA fallback only)
- `packages/scanner/src/scan-site.ts` (passing the UA to the two checks only)
- `packages/scanner/src/config.ts` (`getCrawlerUserAgent` and its doc comment only)
- `.env.example` (remove line 19 only)
- `docs/decisions/trade-offs.md` (one new entry at the end, Step 5)
- Test files whose hard-coded `'OdysseusAuditBot/...'` strings break **only**
  because of the constant change. Update the string and nothing else.

**Out of scope** (do not touch):

- `packages/site/**` and `packages/site/app/llms.txt/route.ts`. The public copy
  is correct and is the target identity. Publishing site changes is an external
  action.
- robots.txt behaviour on 5xx, 429 or a network error. The operator decided
  on 2026-09-17 to keep allow-all (see Step 5). Do not change the fetch or
  parse behaviour.
- Per-origin robots for www/apex variants and for
  `packages/interface/src/prospecting/mentions-legales-fetch.ts`. It benefits
  from Step 1 automatically; don't edit it.
- Routing the Node fetches through the address guard (a separate hardening).
- `AI_CRAWLER_USER_AGENTS` and `checkAiCrawlerAccess` semantics.

## Git workflow

- Branch: `advisor/052-crawler-robots-identity`.
- Commit messages are imperative and describe behaviour, e.g.
  `Match robots.txt groups by the crawler's product token`.
- The repository's commit-msg hook rejects `Co-Authored-By` or "Generated
  with" trailers. Never add them.
- Do not push or open a PR unless the operator says so.

## Steps

### Step 1: Match robots.txt groups by product token

In `robots.ts`, add and export a small pure helper:

```ts
/** RFC 9309 matches a group by the crawler's product token, case-insensitively:
 *  the part of the User-Agent before the first '/' or whitespace. A bare
 *  token (the AI crawler list passes these) is its own product token. */
export function robotsProductToken(userAgent: string): string
```

Change `parseRobotsTxt` so it:

- builds the set of tokens to match: `robotsProductToken(userAgent)`, plus
  `odysseusbot` and `odysseusauditbot` when the product token is either of
  them. A site that blocked the token it saw in its logs (`OdysseusAuditBot`)
  and one that followed our published snippet (`OdysseusBot`) are both
  honoured;
- selects **every** group whose agent list contains one of those tokens
  (RFC 9309 merges them), concatenating their `disallow` and `allow` arrays and
  taking the largest `crawlDelayMs`;
- falls back to the merged `*` groups only when no specific group matched.

Update the doc comment above `parseRobotsTxt`. Remove the "group merging ...
out of scope" sentence from the `patternToRegExp` comment if it no longer
holds.

Add tests in `robots.test.ts`:

- `parseRobotsTxt('User-agent: OdysseusBot\nDisallow: /\n', 'OdysseusBot/1.0 (+https://odysseusaudit.com/bot)').disallow` equals `['/']`;
- the same with `User-agent: odysseusauditbot` and UA `OdysseusAuditBot/0.1 (+https://odysseusaudit.com/bot)`;
- a file with both a `*` group (`Disallow: /admin`) and an `OdysseusBot` group (`Disallow: /private`) uses only the specific group;
- two separate `OdysseusBot` groups merge;
- `checkAiCrawlerAccess('User-agent: GPTBot\nDisallow: /\n', ['GPTBot'])` still reports blocked (regression guard for bare tokens).

**Verify**: `pnpm test packages/scanner/src/robots.test.ts` → all pass,
including the new cases.

### Step 2: Fix the identity to the published one, with no override

The operator decided (2026-09-17) that the crawler identity is fixed in code:
an environment override could silently send a name that site owners' rules
don't target.

- Set `ODYSSEUS_USER_AGENT` in `browser.ts` to
  `'OdysseusBot/1.0 (+https://odysseusaudit.com/bot)'`. Add a one-line comment
  saying it must match the token published on the public `/bot` page and
  `/llms.txt`, and fix the doc comment at `browser.ts:6` that mentions
  `CRAWLER_USER_AGENT`.
- In `config.ts`, make `getCrawlerUserAgent()` return `ODYSSEUS_USER_AGENT`
  and nothing else. Remove the `ensureEnvLoaded()` call only if nothing else
  in that function needs it. Rewrite the doc comment: the identity is fixed in
  code on purpose, and changing it means changing the public `/bot` page too.
  Keep the function (many callers use it).
- Delete the `CRAWLER_USER_AGENT` line from `.env.example`, and any comment
  line directly above it that only describes that variable.
- Run `grep -rn "OdysseusAuditBot/0.1 (+https" packages --include=*.ts | grep -v dist/`.
  Update any non-test source hit. Update test fixtures only if a test now
  fails because of the change.

**Verify**: `grep -rn "OdysseusAudit/0.1" .env.example packages --include=*.ts | grep -v dist/` → no output.
`grep -rn "CRAWLER_USER_AGENT" --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=plans --exclude-dir=.git .` → no output.
`pnpm test packages/scanner` → all pass.

### Step 3: Match robots.txt rules against path plus query, and re-check after redirects

In `crawl.ts`:

1. Add a local helper
   `function robotsTarget(url: string): string { const parsed = new URL(url); return parsed.pathname + parsed.search; }`
   and use it at both call sites (enforcement near line 547, the tally near
   line 862) instead of `new URL(...).pathname`.
2. After navigation, in the branch where the page is **not** off-site and not
   a social platform, check `browserPage.url()`. If its host is same-site and
   `!isAllowedByRobots(robotsRules, robotsTarget(browserPage.url()))`, record
   the page with `status: 'skipped-robots'` (keep `url: item.url`, depth,
   discoveryMethod, discoveredFrom and httpStatus, as the off-site branch
   does), then skip all further analysis of that page. Follow the control flow
   of the existing `skipped-external-redirect` branch exactly, including page
   close and frontier snapshot behaviour. Read the whole `try` block before
   editing.

Add unit tests in `crawl.test.ts`, using `installFetchStub` and
`makeFakeBrowser`:

- robots body `User-agent: *\nDisallow: /*?sort=\n` with a homepage linking to
  `https://example.com/rooms?sort=price`: that page has status
  `skipped-robots`;
- robots body `User-agent: OdysseusBot\nDisallow: /\n` and `crawlSite` called
  **without** `userAgent`: the homepage is `skipped-robots` and
  `visitedCount` is 0. This test proves the default UA and the token match
  work together;
- a redirect case. Extend the fake browser minimally so `goto` for
  `/old` sets `currentUrl` to `https://example.com/private/new`, with robots
  `User-agent: *\nDisallow: /private\n`. The `/old` page records
  `skipped-robots`. If extending the fake browser needs more than about 15
  lines, write this case in `crawl-redirect.e2e.test.ts` instead, following
  its existing pattern.

**Verify**: `pnpm test packages/scanner/src/crawl.test.ts` → all pass.
Also run `pnpm run test:e2e -- packages/scanner/src/crawl.e2e.test.ts packages/scanner/src/crawl-redirect.e2e.test.ts` → all pass.

### Step 4: Send the crawler UA on every site-level request

- `robots.ts`: add an optional third parameter
  `userAgent = getCrawlerUserAgent()` to `fetchRobotsText`. Import from
  `./config.js`, and check for an import cycle: `config.ts` imports
  `browser.ts`, not `robots.ts`, so this should be fine. Send
  `headers: { 'user-agent': userAgent }`. Make `fetchRobotsRules` pass its
  `userAgent` through. In `crawl.ts:388`, pass `userAgent`.
- `checks/llms-txt.ts` and `checks/security-headers.ts`: add an optional
  `userAgent: string = getCrawlerUserAgent()` parameter and send the header.
- `scan-site.ts:1122-1135`: pass `options.userAgent ?? getCrawlerUserAgent()`
  to both checks. It already imports from `./config.js`; confirm.
- `checks/cookie-consent.ts:254`: always pass
  `{ userAgent: options.userAgent ?? getCrawlerUserAgent() }`.

Tests: in `checks/llms-txt.test.ts` and `checks/security-headers.test.ts`, have
the local server record `req.headers['user-agent']`. Assert it starts with
`OdysseusBot/` when no UA is passed, and equals a custom value when one is.

**Verify**: `pnpm test packages/scanner/src/checks/llms-txt.test.ts packages/scanner/src/checks/security-headers.test.ts` → all pass.
`grep -n "fetch(" packages/scanner/src/robots.ts packages/scanner/src/checks/llms-txt.ts packages/scanner/src/checks/security-headers.ts` → every hit sits in a call that sets `'user-agent'`.

### Step 5: Record the two identity and robots decisions

Append a new numbered entry at the end of `docs/decisions/trade-offs.md`,
using the next free number (`grep -n "^### [0-9]" docs/decisions/trade-offs.md | tail -1`)
and the format of the entries above it (heading with the decision and date,
short paragraphs, a "Rejected:" line). Title:
`The crawler's identity is fixed in code, and an unreachable robots.txt still allows crawling (operator decision, 2026-09-17)`.
It must state:

- The crawler sends `OdysseusBot/1.0 (+https://odysseusaudit.com/bot)`, the
  name the public `/bot` page tells site owners to target. Robots groups are
  matched by product token, and `OdysseusAuditBot` groups are honoured as an
  alias of the old name. There is no environment override, so a server
  setting can't send a name owners' rules miss.
- When robots.txt answers 5xx or 429, or the request fails, the crawl proceeds
  as if no rules exist. RFC 9309 recommends treating that as disallow-all; the
  operator chose coverage, because a flaky robots.txt would otherwise produce
  an empty paid audit. A missing robots.txt (4xx) is allow-all under the RFC
  too.
- Rejected: an environment override with a warning, refusing to start on an
  unexpected name, retrying then skipping the site, retrying then scanning only
  the home page.

**Verify**: `pnpm run docs:check` → exit 0.

### Step 6: Full gates

**Verify**: `pnpm run format && pnpm run check` → exit 0. `pnpm test` → all
pass, apart from pre-existing fixture-freshness failures (confirm they also
fail on `38a516f2` with `git stash`).

## Test plan

New tests are listed in Steps 1, 3 and 4. They cover:

- product-token matching;
- the legacy token;
- group merging;
- the bare-token AI list regression;
- query-string rules;
- the default-UA end-to-end block;
- the redirect re-check;
- the UA header on the two checks.

Structural patterns: `robots.test.ts` (pure cases), `crawl.test.ts`
(`installFetchStub` plus `makeFakeBrowser`), `checks/llms-txt.test.ts` (local
http server).

## Done criteria

- [ ] `pnpm run check` exits 0
- [ ] `pnpm test packages/scanner` exits 0 with the new tests present
- [ ] `grep -n "agents.includes(ua)" packages/scanner/src/robots.ts` → no output
- [ ] `grep -n "OdysseusBot/1.0" packages/scanner/src/browser.ts` → one hit
- [ ] `grep -rn "CRAWLER_USER_AGENT" --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=plans --exclude-dir=.git .` → no output
- [ ] `grep -n "new URL(item.url).pathname\|new URL(page.url).pathname" packages/scanner/src/crawl.ts` → no robots-related hits
- [ ] `git status` shows only in-scope files modified
- [ ] `plans/README.md` row 052 updated

## STOP conditions

- The excerpts above don't match the live code.
- `packages/site/app/bot/page.tsx` no longer names `OdysseusBot`. The target
  identity is then unclear, so ask the operator.
- Importing `getCrawlerUserAgent` into `robots.ts` or the checks creates an
  import cycle that dependency-cruiser (`pnpm run architecture:check`) rejects.
- The redirect re-check turns out to need restructuring the page `try` block
  beyond adding one branch.
- Any e2e test that previously passed starts failing for a reason other than
  the UA string literal.

## Maintenance notes

- **Identity is code-only:** a leftover `CRAWLER_USER_AGENT` in the
  production environment is now ignored and harmless; the operator can delete
  it at leisure. Changing the bot name requires changing the public `/bot`
  page and `/llms.txt` in the same release.
- **Decided, not pending:** an unreachable robots.txt (5xx, 429, network
  error) still means allow-all, recorded in trade-offs by Step 5. Revisit only
  if a site owner complains.
- **Report semantics:** `robotsDisallowMatches` (the SEO "robots disallow
  broad" finding) now reads our bot's group when a site has one. A site that
  blocks only our bot is simply not crawled, so no report exists. Reviewers
  should confirm nothing else consumes `robotsRules` as if it were the `*`
  group.
- **Resume:** crawl checkpoints pin the whole config, which includes
  `userAgent`. A crawl interrupted before deploy restarts from zero rather
  than resuming. That is acceptable, and deploys already refuse to run over
  active jobs (trade-off 76).
