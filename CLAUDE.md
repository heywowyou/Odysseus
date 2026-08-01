# Odysseus

Internal tooling for a productized web audit service sold to French small
and mid-size businesses. Two audit types share one engine: technical /
SPA-SEO, and accessibility against WCAG 2.2 AA and EN 301 549.

Full context: `docs/brief.md`. Read it before proposing any architecture.

## Non-negotiable rules

1. **Deterministic scanners detect. The LLM explains, groups, prioritizes,
   and translates.** The model may never introduce a finding absent from
   its structured input. This single rule is the credibility of the whole
   business.
2. Every finding traces back to a scanner rule ID and an affected element.
3. All LLM output is validated with Zod. Any response referencing a
   finding ID not present in the input is rejected, logged, and retried.
   See `packages/core/src/types/llm-output.ts`.
4. The LLM never receives raw HTML or full page content. Normalized
   findings plus site context only.
5. Crawling is polite: respect robots.txt, identifiable user agent,
   delay between requests, hard page cap, hard per-page timeout.
6. Never overstate legal exposure in any generated text. Accessibility
   obligations depend on company size and sector. State the criterion,
   not a verdict on whether a law applies to a given client.

## Locked contracts, do not modify without asking

- `packages/core/src/types/findings.ts` — findings model v1
- `packages/core/src/normalize/severity.ts` — severity mapping
- `packages/core/src/types/llm-output.ts` — LLM schema and guards

Every downstream layer reads these shapes. Changing them invalidates
stored audits and breaks monitoring diffs. If a change is genuinely
needed, say so and stop. Do not change them and continue.

## Stack

Node 22, TypeScript strict, pnpm workspace, ESM.
Playwright (Chromium), `@axe-core/playwright`, Lighthouse as a Node
module, Mongoose 9, Zod, Commander, Vitest, pino.

No Redis, no BullMQ, no Express API, no Next.js dashboard, no public web
interface. Those are later phases and are deliberately not being built.

PDF generation uses Playwright's Chromium, not Puppeteer. One browser
dependency, not two.

Lighthouse cannot accept a Playwright `Page`. Launch Chromium with a
remote debugging port and pass that port to Lighthouse, reusing the same
browser instance used for rendering and the axe pass. Do not load each
page more than twice (once raw, once rendered).

## Scope discipline

This is a command-line tool. Do not scaffold an API, a queue, a UI, or a
public-facing scanner unless explicitly asked. Do not add dependencies
without asking first. Prefer standard library and existing dependencies.

When a task is ambiguous, ask rather than assuming. Inventing structure
is worse than pausing.

## Testing

Run against `fixtures/spa-demo`, a local client-rendered React app with
deliberately seeded faults. Never run development scans against live
third-party sites. Vitest for unit tests, with scanner output fixtures
committed so tests do not require a browser.

## Style

- TypeScript strict, no `any`, explicit return types on exported functions.
- Plain language in every user-facing string. No jargon, no acronyms
  without expansion on first use.
- All user-facing strings must support French and English from the start.
  Structure them accordingly, do not hardcode English and retrofit.
- No em dashes or en dashes in generated text, code comments, or report
  copy.
- Comments explain why, not what.

## Build order

Currently at Phase 1. Work in vertical slices, one milestone per session:

1. Render diff only, CLI invocable
2. Crawler: internal link discovery, robots.txt, depth and page caps
3. Scanners: axe-core and Lighthouse against one shared Chromium instance
4. Normalize and dedupe into MongoDB
5. LLM prioritization layer with schema validation
6. PDF report generation, bilingual

Do not start a milestone before the previous one has tests passing.
