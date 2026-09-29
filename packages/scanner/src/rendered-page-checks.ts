/**
 * Issue #570: every check that reuses the rendered navigation, in the order
 * PageCheckRunner runs them. The order carries the dependencies:
 *
 * - the redirect checks add to the transactional-flow evidence;
 * - head metadata reads the raw response's X-Robots-Tag;
 * - the canonical target and NAP consistency read head metadata;
 * - the checks that send input events or change the viewport run after
 *   every read-only check, so no read sees a state they left behind;
 * - the post passes (consent baseline, hydration sweep, local states) run
 *   after every check has finished with the page, since scrolling and
 *   toggling would contaminate baseline evidence.
 */

import type { Browser } from 'playwright';
import { runAxe } from './axe.js';
import { getPageTimeoutMs } from './config.js';
import { normalizePageIdentityUrl } from './links.js';
import { extractMentionsLegales } from './checks/mentions-legales.js';
import {
  detectTransactionalFlow,
  detectUnresolvedBookingControls,
  findDelegatedBookingRedirectChecks,
} from './checks/transactional-flow.js';
import { extractHeadMetadata } from './checks/head-metadata.js';
import { checkCanonicalTarget } from './checks/canonical-target.js';
import { extractMixedContentResources } from './checks/mixed-content.js';
import { walkKeyboardNavigation } from './checks/keyboard-navigation.js';
import { checkFormErrorHandling } from './checks/form-error-handling.js';
import { checkVideoCaptions } from './checks/video-captions.js';
import { checkPlaceholderLabels } from './checks/placeholder-labels.js';
import { extractAltTextFacts } from './checks/alt-text.js';
import { checkNapConsistency } from './checks/nap-consistency.js';
import { checkReflow } from './checks/reflow.js';
import { checkHtmlValidity } from './checks/html-validity.js';
import { checkStructuredData } from './checks/structured-data.js';
import { extractRenderedDomCostFacts } from './checks/rendered-cost-profile.js';
import { findPublishedRoleContact } from './role-contact.js';
import { observeFrames } from './page-readiness.js';
import { collectSurfaceLinks } from './surface-discovery.js';
import { HYDRATION_SWEEP_UNAVAILABLE, runHydrationSweep } from './hydration-sweep.js';
import { observeBaselineConsentState, runLocalStateExploration } from './state-surface.js';
import { defineCheck, toErrorMessage, type PageCheck } from './page-check-runner.js';
import type { RenderedAnalysisOptions } from './page-scan-types.js';

export interface RenderedCheckContext {
  browser: Browser;
  options: RenderedAnalysisOptions;
  perCheckBudgetMs: number;
  /** The raw response's X-Robots-Tag, read before the rendered pass. */
  rawXRobotsTag: string | null | undefined;
  /** Resource totals recorded since before navigation. */
  readResourceTotals:
    | (() => Promise<{
        resourceCount: number;
        knownTransferBytes: number;
        unknownTransferSizeCount: number;
      }>)
    | undefined;
}

type Check = PageCheck<RenderedCheckContext>;

const axe: Check = defineCheck({
  id: 'axe',
  field: 'axe',
  budget: 'check',
  posture: 'error-field',
  run: ({ page }) => runAxe(page),
});

/** No frame record is itself recorded: the evidence graph treats a page
 *  without one as frame coverage unknown, never as frame-free. */
const frames: Check = defineCheck({
  id: 'frames',
  field: 'frames',
  budget: 'check',
  posture: 'untracked',
  run: ({ page, url }) => observeFrames(page, url),
});

const mentionsLegales: Check = defineCheck({
  id: 'mentions-legales',
  field: 'mentionsLegales',
  budget: 'check',
  posture: 'error-field',
  applies: ({ url, context: { options } }) =>
    (options.mentionsLegalesCandidateUrls?.includes(url) ?? false) ||
    (options.mentionsLegalesCandidateUrls === undefined &&
      options.mentionsLegalesUrl !== undefined &&
      url === options.mentionsLegalesUrl),
  run: async ({ page, url, context: { options } }) => {
    const bodyText = await page.evaluate(() => document.body.innerText);
    return {
      ...extractMentionsLegales(url, bodyText),
      checkedPages: {
        resolvedUrl: options.mentionsLegalesUrl ?? url,
        homepageFallback: options.mentionsLegalesHomepageFallback ?? false,
        searchedUrls: options.mentionsLegalesSearchedUrls ?? [],
      },
    };
  },
});

/** Transactional-flow detection is best-effort evidence, not a finding: a
 *  failure must not surface as a page error the way axe or render-diff
 *  failures do, and an empty result is already the correct fallback for
 *  "nothing detected". The redirect checks and ambiguities share it. */
const transactionalFlowEvidence: Check = defineCheck({
  id: 'transactional-flow-evidence',
  field: 'transactionalFlowEvidence',
  budget: 'check',
  posture: 'best-effort',
  run: ({ page, url }) => detectTransactionalFlow(page, url),
  fallback: () => [],
});

const transactionalFlowRedirectChecks: Check = defineCheck({
  id: 'transactional-flow-redirect-checks',
  field: 'transactionalFlowRedirectChecks',
  budget: 'redirect',
  posture: 'best-effort',
  run: ({ page, url, context: { browser, options, perCheckBudgetMs } }) =>
    findDelegatedBookingRedirectChecks(page, url, {
      browser,
      // Each destination navigation must fit this check's budget.
      timeoutMs: Math.min(options.timeoutMs ?? getPageTimeoutMs(), perCheckBudgetMs),
      ...(options.userAgent !== undefined ? { userAgent: options.userAgent } : {}),
      ...(options.redirectHostCache !== undefined ? { hostCache: options.redirectHostCache } : {}),
      ...(options.bookingEngineUrl !== undefined
        ? { bookingEngineUrl: options.bookingEngineUrl }
        : {}),
      ...(options.guard !== undefined ? { guard: options.guard } : {}),
    }),
  // Only a confirmed single-property redirect promotes to transactional-flow
  // evidence (drives hasTransactionalFlow); 'marketplace' and 'undetermined'
  // checks stay recorded on the redirect checks only, per the "attach
  // evidence for whatever was concluded, not just the boolean" rule.
  onSuccess: ({ url, result }, checks) => {
    for (const check of checks) {
      if (check.resolution !== 'single-property') continue;
      (result.transactionalFlowEvidence ??= []).push({
        kind: 'delegated-booking-redirect',
        selector: 'a[href]',
        pageUrl: url,
        detail: check.detail,
        providerUrl: check.destinationUrl ?? check.linkUrl,
      });
    }
  },
  fallback: () => [],
});

const transactionalFlowAmbiguities: Check = defineCheck({
  id: 'transactional-flow-ambiguities',
  field: 'transactionalFlowAmbiguities',
  budget: 'check',
  posture: 'best-effort',
  run: ({ page, url }) => detectUnresolvedBookingControls(page, url),
  fallback: () => [],
});

const headMetadata: Check = defineCheck({
  id: 'head-metadata',
  field: 'headMetadata',
  budget: 'check',
  posture: 'error-field',
  run: ({ page, url, context: { rawXRobotsTag } }) =>
    extractHeadMetadata(page, url, {
      ...(rawXRobotsTag !== undefined ? { xRobotsTag: rawXRobotsTag } : {}),
    }),
});

/** Best effort: a missed address only leaves the operator to find it by
 *  hand, so a failure here is not a check outcome. */
const roleContact: Check = defineCheck({
  id: 'role-contact',
  field: 'roleContact',
  budget: 'check',
  posture: 'untracked',
  run: ({ page, url }) => findPublishedRoleContact(page, url),
});

/**
 * Only meaningful once head metadata names exactly one canonical URL: zero
 * means nothing to check, more than one is normalize-head-metadata.ts's
 * canonical-conflicting check. checkCanonicalTarget turns a fetch failure
 * into undetermined evidence itself, so a thrown error means the budget
 * expired or the address guard refused; it is recorded, since nothing left
 * the attempt classified as a bare tool-error, both undiagnosable and the
 * most expensive rung of the recovery ladder.
 */
const canonicalTarget: Check = defineCheck({
  id: 'canonical-target',
  field: 'canonicalTarget',
  budget: 'self',
  posture: 'error-field',
  applies: ({ result }) => result.headMetadata?.canonicalUrls.length === 1,
  run: async ({ url, result, withBudget, context: { options } }) => {
    const canonicalUrl = result.headMetadata!.canonicalUrls[0]!;
    const cacheKey = normalizePageIdentityUrl(canonicalUrl) ?? canonicalUrl;
    let request = options.canonicalTargetCache?.get(cacheKey);
    if (request === undefined) {
      const scheduler = options.scheduler;
      const cache = options.canonicalTargetCache;
      // Issue #537: waiting for a polite slot is not the check's work, so
      // the first request is paced before its budget starts; a Crawl-delay
      // alone used to exceed it.
      const pending = (async () => {
        await scheduler?.pace();
        return withBudget('canonical-target', () =>
          checkCanonicalTarget(url, canonicalUrl, options.timeoutMs ?? getPageTimeoutMs(), {
            ...(scheduler !== undefined ? { scheduler, firstHopPaced: true } : {}),
            ...(options.networkPolicy !== undefined
              ? { networkPolicy: options.networkPolicy }
              : {}),
            ...(options.onNetworkSafetyBlocked !== undefined
              ? { onNetworkSafetyBlocked: options.onNetworkSafetyBlocked }
              : {}),
          }),
        );
      })();
      request = pending;
      cache?.set(cacheKey, pending);
      // A timeout or refusal is not a fact about the target: evict it so a
      // later page, or the recovery retry, asks again.
      pending.catch(() => {
        if (cache?.get(cacheKey) === pending) cache.delete(cacheKey);
      });
    }
    const cached = await request;
    return cached === null ? undefined : { ...cached, pageUrl: url };
  },
});

const mixedContent: Check = defineCheck({
  id: 'mixed-content',
  field: 'mixedContent',
  budget: 'check',
  posture: 'error-field',
  run: ({ page, url }) => extractMixedContentResources(page, url),
});

const videoCaptions: Check = defineCheck({
  id: 'video-captions',
  field: 'videoCaptions',
  budget: 'check',
  posture: 'error-field',
  run: ({ page, url }) => checkVideoCaptions(page, url),
});

const placeholderLabels: Check = defineCheck({
  id: 'placeholder-labels',
  field: 'placeholderLabels',
  budget: 'check',
  posture: 'error-field',
  run: ({ page, url }) => checkPlaceholderLabels(page, url),
});

const altText: Check = defineCheck({
  id: 'alt-text',
  field: 'altText',
  budget: 'check',
  posture: 'error-field',
  run: ({ page, url }) => extractAltTextFacts(page, url),
});

const structuredData: Check = defineCheck({
  id: 'structured-data',
  field: 'structuredData',
  budget: 'check',
  posture: 'error-field',
  run: ({ page, url }) => checkStructuredData(page, url),
});

/** Reads page.content() only, no DOM mutation, so it sits with the other
 *  read-only checks rather than late with the ones that send input events. */
const htmlValidity: Check = defineCheck({
  id: 'html-validity',
  field: 'htmlValidity',
  budget: 'check',
  posture: 'best-effort',
  run: ({ page, url }) => checkHtmlValidity(page, url),
  concluded: (value) => value.checked,
});

/** Read-only, and not a registered check: it feeds the Lighthouse
 *  tie-break, not a client-facing finding, so it records no outcome. */
const renderedCostProfile: Check = defineCheck({
  id: 'rendered-cost-profile',
  field: 'renderedCostProfile',
  budget: 'self',
  posture: 'untracked',
  run: async ({ page, url, withBudget, context: { readResourceTotals } }) => {
    const domCostFacts = await withBudget('rendered-cost-profile', () =>
      extractRenderedDomCostFacts(page),
    );
    const resourceTotals = (await withBudget(
      'rendered-resource-profile',
      () => readResourceTotals?.() ?? Promise.resolve(undefined),
    )) ?? { resourceCount: 0, knownTransferBytes: 0, unknownTransferSizeCount: 0 };
    return { url, ...domCostFacts, ...resourceTotals };
  },
});

/** Needs head metadata's parsed JSON-LD. Best effort: a failure is the
 *  absence of a comparison, not a page error worth surfacing. */
const napConsistency: Check = defineCheck({
  id: 'nap-consistency',
  field: 'napConsistency',
  budget: 'check',
  posture: 'best-effort',
  applies: ({ result }) => result.headMetadata !== undefined,
  run: ({ page, url, result }) => checkNapConsistency(page, url, result.headMetadata!.jsonLdBlocks),
});

/** Sends real input events, so it runs after every read-only check: a
 *  later check never has to reason about DOM state a Tab walk changed
 *  (focus styles, a dropdown opened on :focus). */
const keyboardNavigation: Check = defineCheck({
  id: 'keyboard-navigation',
  field: 'keyboardNavigation',
  budget: 'mutating',
  posture: 'error-field',
  run: ({ page, url }, signal) => walkKeyboardNavigation(page, url, signal),
});

/** Triggers form validation (see form-error-handling.ts for the safety
 *  reasoning: request-blocking route, never a real click or submit()). */
const formErrorHandling: Check = defineCheck({
  id: 'form-error-handling',
  field: 'formErrorHandling',
  budget: 'mutating',
  posture: 'error-field',
  run: ({ page, url }, signal) => checkFormErrorHandling(page, url, signal),
});

/** Last of the checks: changing the viewport re-runs every media query and
 *  resize listener, far more disruptive than the Tab walk or the validation
 *  trigger. It restores the viewport itself, but nothing depends on that. */
const reflow: Check = defineCheck({
  id: 'reflow',
  field: 'reflow',
  budget: 'mutating',
  posture: 'best-effort',
  run: ({ page, url }, signal) => checkReflow(page, url, signal),
  concluded: (value) => value.checked,
});

/** Plan 059 step 13: the delivered consent/overlay state, read exactly as
 *  delivered, before the sweep or a toggle changes it. */
const consentBaseline: Check = defineCheck({
  id: 'consent-baseline',
  field: 'consentBaseline',
  phase: 'post',
  budget: 'check',
  posture: 'untracked',
  applies: ({ context: { options } }) => options.stateSurfaces === true,
  run: ({ page }) => observeBaselineConsentState(page),
  fallback: () => ({ state: 'undetermined', controlCount: 0 }),
});

/** Plan 059 step 11: scrolling pulls in lazy content, so it would
 *  contaminate any evidence taken before it (section 9, "Baseline first");
 *  placed here it can only extend what the page's artifacts record after. */
const hydrationSweep: Check = defineCheck({
  id: 'hydration-sweep',
  field: 'hydrationSweep',
  phase: 'post',
  budget: 'self',
  posture: 'untracked',
  applies: ({ context: { options } }) => options.hydrationSweep === true,
  run: async ({ page, withBudget, context: { options } }) => {
    const sweep = await withBudget(
      'hydration-sweep',
      () => runHydrationSweep(page),
      'mutating-post-pass',
    );
    sweep.discoveredLinks = await withBudget('surface-links', () =>
      collectSurfaceLinks(page, {
        baseUrl: page.url(),
        ...(options.exclusionPatterns !== undefined
          ? { exclusionPatterns: options.exclusionPatterns }
          : {}),
      }),
    ).catch(() => []);
    return sweep;
  },
  onSuccess: ({ result }, sweep) => {
    if (result.readiness !== undefined) {
      result.readiness = { ...result.readiness, hydrationProgress: sweep.progress };
    }
  },
  // A sweep that cannot even run leaves the page's readiness honestly
  // saying the hydration dimension was not measured.
  onFailure: ({ result }, error) => {
    if (result.readiness !== undefined) {
      result.readiness = { ...result.readiness, hydrationProgress: 'failed' };
    }
    result.surfaceLimitations = [
      ...(result.surfaceLimitations ?? []),
      { ...HYDRATION_SWEEP_UNAVAILABLE, detail: toErrorMessage(error) },
    ];
  },
});

/** Plan 059 step 13: bounded safe local-state exploration, after the sweep
 *  so both page-changing passes are strictly post-baseline. */
const localStates: Check = defineCheck({
  id: 'local-state-exploration',
  field: 'localStates',
  phase: 'post',
  budget: 'mutating-post-pass',
  posture: 'untracked',
  applies: ({ context: { options } }) => options.stateSurfaces === true,
  run: ({ page, context: { options } }) =>
    runLocalStateExploration(page, {
      ...(options.exclusionPatterns !== undefined
        ? { exclusionPatterns: options.exclusionPatterns }
        : {}),
    }),
  onFailure: ({ result }, error) => {
    result.surfaceLimitations = [
      ...(result.surfaceLimitations ?? []),
      {
        code: 'local-state-exploration-unavailable',
        fr: "L'exploration sûre des états locaux d'une page n'a pas pu être effectuée.",
        en: "One page's safe local-state exploration could not be performed.",
        detail: toErrorMessage(error),
      },
    ];
  },
});

export const RENDERED_PAGE_CHECKS: readonly Check[] = [
  axe,
  frames,
  mentionsLegales,
  transactionalFlowEvidence,
  transactionalFlowRedirectChecks,
  transactionalFlowAmbiguities,
  headMetadata,
  roleContact,
  canonicalTarget,
  mixedContent,
  videoCaptions,
  placeholderLabels,
  altText,
  structuredData,
  htmlValidity,
  renderedCostProfile,
  napConsistency,
  keyboardNavigation,
  formErrorHandling,
  reflow,
  consentBaseline,
  hydrationSweep,
  localStates,
];
