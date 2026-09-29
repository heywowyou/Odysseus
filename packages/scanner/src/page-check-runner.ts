/**
 * Issue #570: runs the checks that reuse one rendered navigation, from a
 * declared list, and owns what every check used to repeat by hand in
 * runRenderedAnalysis: the budget, the page-changing work a timed-out check
 * may leave behind, the check outcome, and where its value and error land.
 *
 * Each check declares its run function, its budget class, and its failure
 * posture. A check tracked by the check-scope registry writes its value to the
 * registry's `resultField` and, for the `error-field` posture, its error text
 * to the registry's `errorField`; an untracked pass names its own field.
 *
 * Budgets (issue #537, plan 075 A5): a check that exceeds its budget fails
 * alone. The page's analysis is abandoned only when the page itself stops
 * answering. A timed-out check that changes the page (input events, viewport,
 * scrolling) may still be running, so the next such check waits for it to
 * settle, briefly, and is skipped if it does not.
 */

import type { Page } from 'playwright';
import { CHECK_SCOPE_REGISTRY } from './check-scope-coverage.js';
import type { CheckExecutionOutcome, CheckId, PageScanResult } from './page-scan-types.js';

/** How long a page gets to answer a trivial evaluate after one of its checks
 *  timed out. A page that cannot is unusable (a busy main thread, a crashed
 *  renderer), so the rest of its analysis is abandoned. */
const PAGE_PROBE_TIMEOUT_MS = 2_000;
/** The post-check passes scroll and explore the page in bounded steps
 *  (HYDRATION_MAX_STEPS alone settles for 7.5 s), so they get several check
 *  budgets rather than none: before, only the 420 s page watchdog bounded
 *  them, and hitting it discarded every completed check. */
const POST_PASS_BUDGET_FACTOR = 4;
/** Up to MAX_REDIRECT_FOLLOWS third-party navigations, each bounded by one
 *  check budget, fit inside this one. */
const REDIRECT_CHECK_BUDGET_FACTOR = 4;

/**
 * - `check`: one check budget, read-only.
 * - `mutating`: one check budget; changes the page, so it waits for a
 *   timed-out page-changing check to settle first.
 * - `redirect`: several check budgets, for third-party navigations.
 * - `post-pass` / `mutating-post-pass`: several check budgets, for the
 *   bounded scroll and exploration passes.
 * - `self`: the check budgets its own steps through `withBudget`.
 */
export type CheckBudgetClass =
  'check' | 'mutating' | 'redirect' | 'post-pass' | 'mutating-post-pass' | 'self';

/**
 * - `error-field`: a failure records the error text in the registry's
 *   error field and a `failed` outcome.
 * - `best-effort`: evidence, not a finding. A failure is not a page error;
 *   it records a `failed` outcome and the check's fallback value.
 * - `untracked`: no registry entry and no outcome; a failure leaves the
 *   fallback value (absent by default).
 */
export type FailurePosture = 'error-field' | 'best-effort' | 'untracked';

export type ResultDraft = Omit<PageScanResult, 'lighthouse' | 'lighthouseError'>;
type ResultField = Exclude<keyof ResultDraft, 'url'>;

export interface PageCheckRun<C> {
  context: C;
  page: Page;
  url: string;
  /** The page's result so far: an earlier check's value is readable here. */
  result: ResultDraft;
  withBudget<T>(
    label: string,
    action: (signal: AbortSignal) => Promise<T>,
    budget?: Exclude<CheckBudgetClass, 'self'>,
  ): Promise<T>;
}

export interface PageCheck<C, F extends ResultField = ResultField> {
  /** The registry id for a tracked check; the budget label otherwise. */
  id: string;
  /** Where the value lands; for a tracked check, the registry's
   *  `resultField`, which the runner verifies. */
  field: F;
  budget: CheckBudgetClass;
  posture: FailurePosture;
  /** Runs only after every baseline check, once no timed-out page-changing
   *  work is still running. */
  phase?: 'post';
  /** False records `not-applicable` (tracked) and runs nothing. */
  applies?: (run: PageCheckRun<C>) => boolean;
  run: (run: PageCheckRun<C>, signal: AbortSignal) => Promise<ResultDraft[F]>;
  /** A value that ran but could not conclude records `failed`. */
  concluded?: (value: NonNullable<ResultDraft[F]>) => boolean;
  /** Effects on other fields once the value is stored. Not budgeted: kept
   *  out of `run` so late work from a timed-out check cannot apply them. */
  onSuccess?: (run: PageCheckRun<C>, value: NonNullable<ResultDraft[F]>) => void;
  fallback?: (run: PageCheckRun<C>) => ResultDraft[F];
  onFailure?: (run: PageCheckRun<C>, error: unknown) => void;
}

/** Erases a check's field type so checks of different fields share a list. */
export function defineCheck<C, F extends ResultField>(check: PageCheck<C, F>): PageCheck<C> {
  return check as unknown as PageCheck<C>;
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error('page analysis aborted');
}

/** Whether the page still answers a trivial evaluate. Bounded, never throws. */
async function isPageResponsive(page: Page | undefined): Promise<boolean> {
  if (page === undefined) return false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const probe = Promise.resolve()
    .then(async () => {
      if (page.isClosed()) return false;
      await page.evaluate(() => true);
      return true;
    })
    .catch(() => false);
  const expired = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), PAGE_PROBE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([probe, expired]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Runs one check without letting a stalled promise hold the whole rendered
 * page hostage. Each check gets its own abort signal, aborted when its budget
 * expires, so a check that honours it stops. The late promise is observed
 * after a timeout so a rejected browser operation cannot become an unhandled
 * rejection while the next check is already running. `onTimeout` runs before
 * the check is reported failed, so the caller can decide, before the next
 * check starts, whether the page itself is still usable. */
async function runWithCheckBudget<T>(
  label: string,
  action: (signal: AbortSignal) => Promise<T>,
  budgetMs: number,
  signal: AbortSignal,
  onTimeout: (error: Error, abandoned: Promise<unknown>) => Promise<void>,
): Promise<T> {
  if (signal.aborted) throw abortReason(signal);
  const checkController = new AbortController();
  const relayPageAbort = (): void => checkController.abort(abortReason(signal));
  signal.addEventListener('abort', relayPageAbort, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = Promise.resolve().then(() => {
    if (checkController.signal.aborted) throw abortReason(checkController.signal);
    return action(checkController.signal);
  });
  work.catch(() => undefined);
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`check-timeout: ${label} exceeded ${budgetMs}ms`);
      checkController.abort(error);
      void onTimeout(error, work)
        .catch(() => undefined)
        .finally(() => reject(error));
    }, budgetMs);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    signal.removeEventListener('abort', relayPageAbort);
  }
}

export interface PageCheckRunnerOptions {
  perCheckBudgetMs: number;
  /** Aborts the whole page's analysis (the page watchdog). */
  signal?: AbortSignal;
  /** Closed when the page stops answering, so its browser work ends. */
  closeAll?: () => Promise<void>;
}

export class PageCheckRunner {
  readonly outcomes: Partial<Record<CheckId, CheckExecutionOutcome>> = {};
  private readonly controller = new AbortController();
  private readonly abandonedWork = new Set<Promise<unknown>>();
  private page: Page | undefined;

  constructor(private readonly options: PageCheckRunnerOptions) {
    const external = options.signal;
    if (external?.aborted) this.abortFromExternal();
    else external?.addEventListener('abort', () => this.abortFromExternal(), { once: true });
  }

  /** Records a check the runner did not run, such as a site-wide result
   *  attached to the homepage or a check a failed navigation made moot. */
  record(id: CheckId, outcome: CheckExecutionOutcome): void {
    this.outcomes[id] = outcome;
  }

  private abortFromExternal(): void {
    this.controller.abort(this.options.signal?.reason ?? new Error('page analysis aborted'));
  }

  private budgetMs(budget: Exclude<CheckBudgetClass, 'self'>): number {
    const perCheck = this.options.perCheckBudgetMs;
    if (budget === 'redirect') return perCheck * REDIRECT_CHECK_BUDGET_FACTOR;
    if (budget === 'post-pass' || budget === 'mutating-post-pass') {
      return perCheck * POST_PASS_BUDGET_FACTOR;
    }
    return perCheck;
  }

  private async abandonedWorkSettled(): Promise<boolean> {
    if (this.abandonedWork.size === 0) return true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settled = Promise.allSettled([...this.abandonedWork]).then(() => true);
    const expired = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), this.options.perCheckBudgetMs);
    });
    try {
      return await Promise.race([settled, expired]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  /** One budgeted step on the current page. */
  async withBudget<T>(
    label: string,
    action: (signal: AbortSignal) => Promise<T>,
    budget: Exclude<CheckBudgetClass, 'self'> = 'check',
  ): Promise<T> {
    const changesPage = budget === 'mutating' || budget === 'mutating-post-pass';
    if (changesPage && !(await this.abandonedWorkSettled())) {
      throw new Error(
        `check-skipped: ${label} not started while a timed-out page-changing check still runs`,
      );
    }
    return runWithCheckBudget(
      label,
      action,
      this.budgetMs(budget),
      this.controller.signal,
      async (error, abandoned) => {
        if (await isPageResponsive(this.page)) {
          if (!changesPage) return;
          this.abandonedWork.add(abandoned);
          void abandoned.catch(() => undefined).finally(() => this.abandonedWork.delete(abandoned));
          return;
        }
        this.controller.abort(error);
        void this.options.closeAll?.().catch(() => undefined);
      },
    );
  }

  /** Runs the checks in order against one rendered page. */
  async runChecks<C>(
    checks: readonly PageCheck<C>[],
    page: Page,
    url: string,
    result: ResultDraft,
    context: C,
  ): Promise<void> {
    this.page = page;
    const run: PageCheckRun<C> = {
      context,
      page,
      url,
      result,
      withBudget: (label, action, budget) => this.withBudget(label, action, budget),
    };
    let baselineDone = false;
    for (const check of checks) {
      if (check.phase === 'post' && !baselineDone) {
        if (this.controller.signal.aborted || !(await this.abandonedWorkSettled())) return;
        baselineDone = true;
      }
      await this.runCheck(check, run);
    }
  }

  private async runCheck<C>(check: PageCheck<C>, run: PageCheckRun<C>): Promise<void> {
    const fields = checkFields(check);
    const tracked = check.posture !== 'untracked';
    const writable = run.result as Record<string, unknown>;
    if (check.applies !== undefined && !check.applies(run)) {
      if (tracked) this.outcomes[check.id] = 'not-applicable';
      return;
    }
    try {
      const value =
        check.budget === 'self'
          ? await check.run(run, this.controller.signal)
          : await this.withBudget(check.id, (signal) => check.run(run, signal), check.budget);
      if (value === undefined) delete writable[fields.result];
      else writable[fields.result] = value;
      if (tracked) {
        const concluded = value === undefined || (check.concluded?.(value as never) ?? true);
        this.outcomes[check.id] = concluded ? 'completed' : 'failed';
      }
      if (value !== undefined) check.onSuccess?.(run, value as never);
    } catch (error) {
      if (tracked) this.outcomes[check.id] = 'failed';
      if (check.posture === 'error-field') {
        writable[fields.error!] = toErrorMessage(error);
      } else {
        const fallback = check.fallback?.(run);
        if (fallback === undefined) delete writable[fields.result];
        else writable[fields.result] = fallback;
      }
      check.onFailure?.(run, error);
    }
  }
}

/** Where a check's value and error land: the registry's fields for a tracked
 *  check, the check's own field otherwise. */
export function checkFields(check: Pick<PageCheck<unknown>, 'id' | 'posture' | 'field'>): {
  result: string;
  error?: string;
} {
  if (check.posture === 'untracked') return { result: check.field };
  const entry = CHECK_SCOPE_REGISTRY.find((candidate) => candidate.id === check.id);
  if (entry === undefined) throw new Error(`check ${check.id} is not in the check-scope registry`);
  if (entry.resultField !== check.field) {
    throw new Error(
      `check ${check.id} writes ${check.field}, the registry says ${entry.resultField}`,
    );
  }
  if (check.posture === 'error-field' && entry.errorField === undefined) {
    throw new Error(`check ${check.id} records its error but the registry names no error field`);
  }
  return {
    result: entry.resultField,
    ...(entry.errorField !== undefined ? { error: entry.errorField } : {}),
  };
}
