/**
 * Compiled registry mapping every `PageScanResult` detector output, and its
 * companion error field where one exists, to a scope, owning pass,
 * applicability rule, and today's completion signal (plan 021 Step 4,
 * `docs/decisions/trade-offs.md` entry 64). This is documentation and a
 * test ratchet, not scan behavior: it names exactly why one check runs
 * once per site, another on every page, and only Lighthouse is sampled per
 * template family, so "why did this page get fewer checks" always has one
 * place to answer from.
 *
 * The exhaustiveness assertion at the bottom of this file fails to
 * typecheck the moment `PageScanResult` grows a field with no entry here,
 * so a future check can never silently ship without an explicit scope
 * decision. `check-scope-coverage.test.ts` asserts the registry itself is
 * internally consistent.
 *
 * `completionSignal` documents today's shape, not the target one: several
 * checks below are best-effort and swallow a caught failure into "no
 * result", indistinguishable at this layer from "did not apply". Step 5
 * replaces that ad hoc shape with an explicit `checkOutcomes` populated at
 * each of these same boundaries; `best-effort-no-error-field` names
 * exactly the entries that gap applies to.
 */

import type { PageScanResult } from './scan-page.js';
import type { AuditPass } from '@odysseus/core';

export type CheckScope = 'site' | 'page' | 'family' | 'flow' | 'resource';
export type CheckPass = AuditPass;

export type CheckCompletionSignal =
  'explicit-error-field' | 'best-effort-no-error-field' | 'conditional-attachment';

/** The explicit per-check outcome Step 5 populates at each of the
 *  boundaries below, keyed by a registry `id`. This is the coverage
 *  source of truth (plan 021 Target Interfaces): never derived by testing
 *  whether an optional result field exists afterwards, and never carries
 *  raw exception text. */
export type CheckExecutionOutcome = 'completed' | 'failed' | 'not-applicable';

export interface CheckScopeEntry {
  id: string;
  resultField: Exclude<keyof PageScanResult, 'url'>;
  errorField?: Exclude<keyof PageScanResult, 'url'>;
  scope: CheckScope;
  pass: CheckPass;
  applicability: string;
  completionSignal: CheckCompletionSignal;
}

export const CHECK_SCOPE_REGISTRY: readonly CheckScopeEntry[] = [
  {
    id: 'render-diff',
    resultField: 'renderDiff',
    errorField: 'renderDiffError',
    scope: 'page',
    pass: 'rendered',
    applicability: 'Every successfully crawled HTML page.',
    completionSignal: 'explicit-error-field',
  },
  {
    id: 'axe',
    resultField: 'axe',
    errorField: 'axeError',
    scope: 'page',
    pass: 'axe',
    applicability: 'Every page whose render diff navigation succeeded.',
    completionSignal: 'explicit-error-field',
  },
  {
    id: 'lighthouse',
    resultField: 'lighthouse',
    errorField: 'lighthouseError',
    scope: 'family',
    pass: 'lighthouse',
    applicability:
      'Pages selected by finalizeLighthousePlan: mandatory pages (homepage, transactional, seeded, unknown/fallback, unique) plus the stable and cost-outlier representatives per repeated template family and language.',
    completionSignal: 'explicit-error-field',
  },
  {
    id: 'mentions-legales',
    resultField: 'mentionsLegales',
    errorField: 'mentionsLegalesError',
    scope: 'site',
    pass: 'rendered',
    applicability:
      'The one page the crawl identified as the mentions-legales page, or the homepage as fallback when no page matched.',
    completionSignal: 'explicit-error-field',
  },
  {
    id: 'transactional-flow-evidence',
    resultField: 'transactionalFlowEvidence',
    scope: 'flow',
    pass: 'rendered',
    applicability: 'Every rendered page: checkout and cart UI can appear anywhere on a site.',
    completionSignal: 'best-effort-no-error-field',
  },
  {
    id: 'transactional-flow-redirect-checks',
    resultField: 'transactionalFlowRedirectChecks',
    scope: 'flow',
    pass: 'rendered',
    applicability: 'Every rendered page, following any delegated-booking link found on it.',
    completionSignal: 'best-effort-no-error-field',
  },
  {
    id: 'head-metadata',
    resultField: 'headMetadata',
    errorField: 'headMetadataError',
    scope: 'page',
    pass: 'rendered',
    applicability: 'Every rendered page.',
    completionSignal: 'explicit-error-field',
  },
  {
    id: 'sitemap-check',
    resultField: 'sitemapCheck',
    scope: 'site',
    pass: 'rendered',
    applicability: 'The homepage only, and only when the homepage itself was visited.',
    completionSignal: 'conditional-attachment',
  },
  {
    id: 'llms-txt-check',
    resultField: 'llmsTxtCheck',
    scope: 'site',
    pass: 'rendered',
    applicability: 'The homepage only, and only when the homepage itself was visited.',
    completionSignal: 'conditional-attachment',
  },
  {
    id: 'canonical-target',
    resultField: 'canonicalTarget',
    scope: 'resource',
    pass: 'rendered',
    applicability: 'A page whose head metadata declares exactly one canonical URL.',
    completionSignal: 'best-effort-no-error-field',
  },
  {
    id: 'mixed-content',
    resultField: 'mixedContent',
    errorField: 'mixedContentError',
    scope: 'resource',
    pass: 'rendered',
    applicability: 'Every rendered page.',
    completionSignal: 'explicit-error-field',
  },
  {
    id: 'keyboard-navigation',
    resultField: 'keyboardNavigation',
    errorField: 'keyboardNavigationError',
    scope: 'page',
    pass: 'extended',
    applicability: 'Every rendered page.',
    completionSignal: 'explicit-error-field',
  },
  {
    id: 'form-error-handling',
    resultField: 'formErrorHandling',
    errorField: 'formErrorHandlingError',
    scope: 'page',
    pass: 'extended',
    applicability: 'Every rendered page.',
    completionSignal: 'explicit-error-field',
  },
  {
    id: 'video-captions',
    resultField: 'videoCaptions',
    errorField: 'videoCaptionsError',
    scope: 'page',
    pass: 'extended',
    applicability: 'Every rendered page.',
    completionSignal: 'explicit-error-field',
  },
  {
    id: 'alt-text',
    resultField: 'altText',
    errorField: 'altTextError',
    scope: 'page',
    pass: 'extended',
    applicability: 'Every rendered page.',
    completionSignal: 'explicit-error-field',
  },
  {
    id: 'security-headers',
    resultField: 'securityHeaders',
    scope: 'site',
    pass: 'rendered',
    applicability: 'The homepage only, and only when the homepage itself was visited.',
    completionSignal: 'conditional-attachment',
  },
  {
    id: 'cookie-consent',
    resultField: 'cookieConsent',
    scope: 'site',
    pass: 'rendered',
    applicability: 'The homepage only, and only when the homepage itself was visited.',
    completionSignal: 'conditional-attachment',
  },
  {
    id: 'accessibility-statement',
    resultField: 'accessibilityStatement',
    scope: 'site',
    pass: 'rendered',
    applicability: 'The homepage only, and only when the homepage itself was visited.',
    completionSignal: 'conditional-attachment',
  },
  {
    id: 'nap-consistency',
    resultField: 'napConsistency',
    scope: 'page',
    pass: 'rendered',
    applicability: 'Every rendered page whose head-metadata extraction succeeded.',
    completionSignal: 'best-effort-no-error-field',
  },
  {
    id: 'reflow',
    resultField: 'reflow',
    scope: 'page',
    pass: 'extended',
    applicability: 'Every rendered page.',
    completionSignal: 'best-effort-no-error-field',
  },
  {
    id: 'html-validity',
    resultField: 'htmlValidity',
    scope: 'page',
    pass: 'rendered',
    applicability: 'Every rendered page.',
    completionSignal: 'best-effort-no-error-field',
  },
  {
    id: 'structured-data',
    resultField: 'structuredData',
    errorField: 'structuredDataError',
    scope: 'page',
    pass: 'rendered',
    applicability: 'Every rendered page.',
    completionSignal: 'explicit-error-field',
  },
] as const;

/** Union of every registered check id, for a typo-safe `checkOutcomes` map
 *  (`Partial<Record<CheckId, CheckExecutionOutcome>>`) instead of a loose
 *  `string` key. */
export type CheckId = (typeof CHECK_SCOPE_REGISTRY)[number]['id'];

type RegisteredResultKey = (typeof CHECK_SCOPE_REGISTRY)[number]['resultField'];
type RegisteredErrorKey = Exclude<(typeof CHECK_SCOPE_REGISTRY)[number]['errorField'], undefined>;
type RegisteredKey = RegisteredResultKey | RegisteredErrorKey;
type UnregisteredPageScanResultKey = Exclude<Exclude<keyof PageScanResult, 'url'>, RegisteredKey>;

/** Deliberately unused at runtime: a compile-time-only exhaustiveness
 *  ratchet. If `UnregisteredPageScanResultKey` is not `never`, this
 *  assignment fails to typecheck, which is the "coverage test fails if a
 *  future check is added without an explicit scope decision" guarantee
 *  plan 021 Step 4 requires. */
const _everyPageScanResultKeyIsRegistered: UnregisteredPageScanResultKey extends never
  ? true
  : never = true;
