/**
 * Runners for the consent and safe local-state surfaces (plan 059 sections
 * 3.5 and 9). The selection logic lives in consent-state.ts and is pure;
 * this module owns the browser-side facts: extracting attribute-level
 * control summaries, clicking only what selection proved safe, watching
 * for side effects, and recording every transition.
 *
 * Contamination rules are structural here: the consent surface runs in its
 * own storage-fresh context and its own navigation, so page A's consent
 * choices can never personalize page B; the local-state exploration only
 * ever runs after the page's immutable baseline evidence is complete; and
 * every interaction is checked against the side-effect guard — a control
 * that navigates or submits stops the exploration and is recorded as
 * aborted, never retried by other means.
 */
import type { Browser, Page } from 'playwright';
import { AUDIT_BROWSER_LOCALE } from './audit-locale.js';
import { getCrawlerUserAgent, getRenderSettleTimeoutMs } from './config.js';
import { runAxe, type AxeResults } from './axe.js';
import {
  CONSENT_INTERACTION_AMBIGUOUS,
  CONSENT_INTERACTION_UNSAFE,
  observeConsentBaseline,
  planLocalStateControls,
  selectSafeConsentRejection,
  stateControlKey,
  type ConsentBaselineObservation,
  type ConsentRejectionDecision,
  type LocalStateTransitionRecord,
  type StateControlCandidate,
} from './consent-state.js';
import {
  BASELINE_DESKTOP_VIEWPORT,
  consentSurface as buildConsentSurface,
  type ScanSurface,
} from './evidence-surfaces.js';
import { collectSurfaceLinks } from './surface-discovery.js';
import { summarizeAxeViolations, type SurfaceAxeViolationSummary } from './mobile-surface.js';
import {
  observeRenderedReadiness,
  watchSignificantResourceFailures,
  type RenderedReadinessObservation,
} from './page-readiness.js';
import type { NetworkSafetyBlockHandler } from './browser-network-safety.js';
import { openScannerContext } from './scanner-context.js';
import type { NetworkTargetPolicy } from './network-target-policy.js';

/** Per-page budget for safe local-state exploration (section 9). */
const LOCAL_STATE_BUDGET_PER_PAGE = 8;

/** How long a clicked control has to show its effect before the guard
 *  compares page state. Bounded: the scanner never waits indefinitely on a
 *  page's own scripts. */
const SIDE_EFFECT_GUARD_SETTLE_MS = 400;

const MAX_CONSENT_CONTAINERS = 10;
const MAX_SUMMARIZED_CONTROLS = 40;

/** One interactive element summarized from the live DOM. Attribute-level
 *  only: what crosses into stored evidence is element identity, never
 *  visitor-facing text. */
async function collectStateControlCandidates(page: Page): Promise<{
  consent: StateControlCandidate[];
  localState: StateControlCandidate[];
  containerRef?: string;
}> {
  const summaries = await page.evaluate(
    ({ maxContainers, maxControls }) => {
      const cssPath = (element: Element): string => {
        const parts: string[] = [];
        let node: Element | null = element;
        let depth = 0;
        while (node !== null && depth < 10) {
          const current: Element = node;
          let part = current.tagName.toLowerCase();
          if (current.id !== '') {
            parts.unshift(`#${CSS.escape(current.id)}`);
            break;
          }
          const parent: HTMLElement | null = current.parentElement;
          if (parent !== null) {
            const siblings: Element[] = Array.from(parent.children).filter(
              (child: Element) => child.tagName === current.tagName,
            );
            if (siblings.length > 1) part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
          }
          parts.unshift(part);
          node = parent;
          depth += 1;
        }
        return parts.join(' > ');
      };

      const summarize = (element: Element, controlsId: string | null) => ({
        selector: cssPath(element),
        tag: element.tagName.toLowerCase(),
        role: element.getAttribute('role'),
        type: element.getAttribute('type'),
        identityTokens: [
          element.id,
          ...Array.from(element.classList),
          element.getAttribute('name') ?? '',
          element.getAttribute('data-test') ?? '',
          element.getAttribute('data-testid') ?? '',
          element.getAttribute('data-automation-id') ?? '',
        ]
          .filter((token) => token !== '')
          .map((token) => token.toLowerCase())
          .slice(0, 12),
        insideForm: element.closest('form') !== null,
        isNavigation:
          element.tagName === 'A' && (element as HTMLAnchorElement).getAttribute('href') !== null,
        controlsId,
        controlsIdExists: controlsId !== null && document.getElementById(controlsId) !== null,
      });

      const containers = Array.from(
        document.querySelectorAll(
          '[id*="consent" i],[class*="consent" i],[id*="cookie" i],[class*="cookie" i],[id*="cmp" i],[class*="cmp" i],[role="dialog"],#tarteaucitron,#axeptio,#onetrust-banner-sdk,#didomi-customization,#didomi-popup',
        ),
      ).slice(0, maxContainers);
      const containerRef =
        containers.length > 0 ? cssPath(containers[0]!).slice(0, 200) : undefined;

      const consent = [];
      for (const container of containers) {
        for (const element of Array.from(
          container.querySelectorAll('button, input, a, [role="button"]'),
        )) {
          if (consent.length >= maxControls) break;
          consent.push(summarize(element, null));
        }
      }

      const localState = [];
      for (const element of Array.from(document.querySelectorAll('details:not([open])'))) {
        if (localState.length >= maxControls) break;
        localState.push({ ...summarize(element, null), tag: 'details' });
      }
      for (const element of Array.from(
        document.querySelectorAll('button[aria-controls], [role="button"][aria-controls]'),
      )) {
        if (localState.length >= maxControls) break;
        const controlsId = element.getAttribute('aria-controls');
        if (controlsId === null || document.getElementById(controlsId) === null) continue;
        localState.push(summarize(element, controlsId));
      }

      return { consent, localState, containerRef: containerRef ?? null };
    },
    { maxContainers: MAX_CONSENT_CONTAINERS, maxControls: MAX_SUMMARIZED_CONTROLS },
  );

  const toCandidate = (summary: {
    selector: string;
    tag: string;
    role: string | null;
    type: string | null;
    identityTokens: string[];
    insideForm: boolean;
    isNavigation: boolean;
    controlsId: string | null;
    controlsIdExists: boolean;
  }): StateControlCandidate | undefined => {
    if (summary.controlsId !== null && !summary.controlsIdExists) return undefined;
    return {
      selector: summary.selector,
      tag:
        summary.tag === 'button' || summary.tag === 'input' || summary.tag === 'a'
          ? summary.tag
          : summary.tag === 'details'
            ? 'details'
            : 'other',
      role: summary.role,
      type: summary.type,
      identityTokens: summary.identityTokens,
      insideForm: summary.insideForm,
      isNavigation: summary.isNavigation,
      controlsId: summary.controlsId,
      key: stateControlKey(summary.selector),
    };
  };

  const consent = summaries.consent
    .map(toCandidate)
    .filter((candidate): candidate is StateControlCandidate => candidate !== undefined);
  const localState = summaries.localState
    .map(toCandidate)
    .filter((candidate): candidate is StateControlCandidate => candidate !== undefined);
  return {
    consent,
    localState,
    ...(summaries.containerRef !== null ? { containerRef: summaries.containerRef } : {}),
  };
}

/** The consent overlay state as delivered, read off the baseline page. */
export async function observeBaselineConsentState(page: Page): Promise<ConsentBaselineObservation> {
  const { consent, containerRef } = await collectStateControlCandidates(page);
  return observeConsentBaseline(consent, containerRef);
}

/** One page's consent surface outcome. */
export interface ConsentSurfaceOutcome {
  /** Present only when the surface actually ran (a safe rejection was
   *  established and performed). */
  surface?: ScanSurface;
  baseline: ConsentBaselineObservation;
  readiness?: RenderedReadinessObservation;
  axeViolations?: SurfaceAxeViolationSummary[];
  axeError?: string;
  /** The banner was provably gone after the click. */
  dismissed: boolean;
  /** Same-origin anchors read after dismissal. */
  links: string[];
  transition?: {
    controlKey: string;
    matchedPattern: string;
    abortedBySideEffectGuard?: boolean;
    guardReason?: string;
  };
  /** Why no surface ran, when one was warranted but refused or failed. */
  limitation?: { code: string; fr: string; en: string; detail?: string };
}

export interface ConsentSurfaceOptions {
  evidenceEpoch: number;
  timeoutMs?: number;
  userAgent?: string;
  beforeNavigation?: () => Promise<void>;
  guard?: import('./page-work-guard.js').PageWorkGuard;
  networkPolicy?: NetworkTargetPolicy;
  onNetworkSafetyBlocked?: NetworkSafetyBlockHandler;
  axeAnalyze?: (page: Page) => Promise<AxeResults>;
  exclusionPatterns?: readonly string[];
}

/**
 * Runs the consent-rejected surface in its own storage-fresh context:
 * navigate, observe the delivered banner, and only when the deterministic
 * selection established exactly one safe reject/dismiss control, click it,
 * verify the dismissal, and audit the underlying page (axe, links). Every
 * other outcome is recorded honestly: no banner, ambiguous, unsafe, or a
 * guard abort.
 */
export async function runConsentSurfaceAnalysis(
  browser: Browser,
  url: string,
  options: ConsentSurfaceOptions,
): Promise<ConsentSurfaceOutcome> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const settleTimeoutMs = getRenderSettleTimeoutMs();
  // The consent surface is a desktop-profile pass under the same identity
  // as every other pass; it never negotiates a different user agent.
  const userAgent = options.userAgent ?? getCrawlerUserAgent();

  const context = await openScannerContext(
    browser,
    {
      userAgent,
      viewport: { ...BASELINE_DESKTOP_VIEWPORT },
      deviceScaleFactor: 1,
      hasTouch: false,
      locale: AUDIT_BROWSER_LOCALE,
    },
    {
      guard: options.guard,
      networkPolicy: options.networkPolicy,
      onNetworkSafetyBlocked: options.onNetworkSafetyBlocked,
    },
  );
  try {
    context.setDefaultTimeout(timeoutMs);
    context.setDefaultNavigationTimeout(timeoutMs);
    const page = await context.newPage();
    // A consent click can open a native dialog; it is dismissed, never
    // accepted. The dismissal rejects when the context closes first (a
    // watchdog, a navigation), and an unhandled rejection shuts the whole
    // server down (issue #539), so its failure is swallowed.
    page.on('dialog', (dialog) => {
      void dialog.dismiss().catch(() => undefined);
    });
    const readFailures = watchSignificantResourceFailures(page);
    await options.beforeNavigation?.();
    const response = await page.goto(url, { waitUntil: 'load' });
    let networkQuiet = true;
    try {
      await page.waitForLoadState('networkidle', { timeout: settleTimeoutMs });
    } catch {
      networkQuiet = false;
    }
    const readiness = await observeRenderedReadiness(page, {
      response,
      networkQuiet,
      readFailures,
    });
    const { consent, containerRef } = await collectStateControlCandidates(page);
    const baseline = observeConsentBaseline(consent, containerRef);
    const decision: ConsentRejectionDecision = selectSafeConsentRejection(consent);
    if (decision.kind !== 'safe-reject') {
      const limitation =
        decision.kind === 'ambiguous'
          ? { ...CONSENT_INTERACTION_AMBIGUOUS, detail: decision.reason }
          : decision.kind === 'unsafe'
            ? { ...CONSENT_INTERACTION_UNSAFE, detail: decision.reason }
            : undefined;
      return {
        baseline,
        readiness,
        dismissed: false,
        links: [],
        ...(limitation !== undefined ? { limitation } : {}),
      };
    }

    const surface = buildConsentSurface({
      evidenceEpoch: options.evidenceEpoch,
      pageIdentity: url,
      userAgent,
    });
    const control = page.locator(decision.selector).first();
    const urlBefore = page.url();
    let clickError: string | undefined;
    try {
      await control.click({ timeout: timeoutMs });
      await page.waitForTimeout(SIDE_EFFECT_GUARD_SETTLE_MS);
    } catch (error) {
      clickError = error instanceof Error ? error.message : String(error);
    }
    const urlAfter = page.url();
    const abortedBySideEffectGuard = urlAfter !== urlBefore;
    // Dismissal is verified against the live DOM, not assumed from the
    // click's exit status.
    const stillThere =
      clickError === undefined && !abortedBySideEffectGuard
        ? await page
            .locator(decision.selector)
            .first()
            .isVisible()
            .catch(() => true)
        : true;
    const dismissed = !stillThere;

    let axeViolations: SurfaceAxeViolationSummary[] = [];
    let axeError: string | undefined;
    let links: string[] = [];
    if (dismissed) {
      try {
        axeViolations = summarizeAxeViolations(await (options.axeAnalyze ?? runAxe)(page));
      } catch (error) {
        axeError = error instanceof Error ? error.message : String(error);
      }
      links = await collectSurfaceLinks(page, {
        baseUrl: page.url(),
        ...(options.exclusionPatterns !== undefined
          ? { exclusionPatterns: options.exclusionPatterns }
          : {}),
      }).catch(() => []);
    }

    return {
      surface: {
        ...surface,
        readinessOutcome: dismissed ? readiness.outcome : 'blocked',
      },
      baseline,
      readiness,
      axeViolations,
      ...(axeError !== undefined ? { axeError } : {}),
      dismissed,
      links,
      transition: {
        controlKey: decision.controlKey,
        matchedPattern: decision.matchedPattern,
        ...(abortedBySideEffectGuard
          ? { abortedBySideEffectGuard: true, guardReason: 'the click navigated the page' }
          : {}),
        ...(clickError !== undefined && !abortedBySideEffectGuard
          ? { guardReason: clickError }
          : {}),
      },
    };
  } finally {
    options.guard?.untrack(context);
    await context.close();
  }
}

/**
 * Safe local-state exploration on an already-checked page: toggles the
 * bounded set of provably same-document disclosure controls, records every
 * transition, and stops at the first side-effect-guard violation.
 */
export interface LocalStateExplorationRecord {
  transitions: LocalStateTransitionRecord[];
  links: string[];
  /** True when exploration stopped early because the guard fired. */
  guardAborted?: boolean;
  guardReason?: string;
}

export async function runLocalStateExploration(
  page: Page,
  options: { exclusionPatterns?: readonly string[] } = {},
): Promise<LocalStateExplorationRecord> {
  const { localState } = await collectStateControlCandidates(page);
  const plans = planLocalStateControls(localState, LOCAL_STATE_BUDGET_PER_PAGE);
  const transitions: LocalStateTransitionRecord[] = [];
  const startedUrl = page.url();
  for (const plan of plans) {
    const controlKey = plan.controlKey;
    if (plan.kind === 'details') {
      const locator = page.locator(plan.selector).first();
      const before = (await locator.evaluate((el) => (el as HTMLDetailsElement).open)) as boolean;
      const urlBefore = page.url();
      await locator.click({ timeout: 2_000 }).catch(() => undefined);
      await page.waitForTimeout(SIDE_EFFECT_GUARD_SETTLE_MS);
      const after = (await locator.evaluate((el) => (el as HTMLDetailsElement).open)) as boolean;
      const navigated = page.url() !== urlBefore;
      transitions.push({
        kind: 'details',
        controlKey,
        selector: plan.selector,
        before: before ? 'open' : 'closed',
        after: navigated ? 'unknown' : after ? 'open' : 'closed',
        ...(navigated
          ? { abortedBySideEffectGuard: true, guardReason: 'the toggle navigated the page' }
          : {}),
      });
      if (navigated) {
        return {
          transitions,
          links: [],
          guardAborted: true,
          guardReason: 'a details toggle navigated the page; exploration stopped',
        };
      }
      continue;
    }
    const locator = page.locator(plan.selector).first();
    const before = await locator.getAttribute('aria-expanded');
    const urlBefore = page.url();
    await locator.click({ timeout: 2_000 }).catch(() => undefined);
    await page.waitForTimeout(SIDE_EFFECT_GUARD_SETTLE_MS);
    const after = await locator.getAttribute('aria-expanded');
    const navigated = page.url() !== urlBefore;
    transitions.push({
      kind: 'aria-controls',
      controlKey,
      selector: plan.selector,
      before: before === 'true' ? 'open' : before === 'false' ? 'closed' : 'unknown',
      after: navigated
        ? 'unknown'
        : after === 'true'
          ? 'open'
          : after === 'false'
            ? 'closed'
            : 'unknown',
      ...(navigated
        ? { abortedBySideEffectGuard: true, guardReason: 'the toggle navigated the page' }
        : {}),
    });
    if (navigated || page.url() !== startedUrl) {
      return {
        transitions,
        links: [],
        guardAborted: true,
        guardReason: 'a disclosure toggle navigated the page; exploration stopped',
      };
    }
  }
  const links = await collectSurfaceLinks(page, {
    baseUrl: page.url(),
    ...(options.exclusionPatterns !== undefined
      ? { exclusionPatterns: options.exclusionPatterns }
      : {}),
  }).catch(() => []);
  return { transitions, links };
}
