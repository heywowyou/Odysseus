/**
 * Turns what a scan actually did into Plan 059 check attempts (sections 5.8
 * and 10), and decides which of those attempts deserve a targeted retry.
 *
 * `runRenderedAnalysis` already reports an explicit outcome per registered
 * check. That is the right source, but it answers a narrower question than the
 * ledger asks: it says whether a check completed, not why it did not, and it
 * says nothing about a check whose navigation never happened. This module
 * closes both gaps before anything reaches the ledger:
 *
 * - every registered page check gets an attempt on every scanned page, so a
 *   check that silently never ran is a recorded failure rather than an absent
 *   row nobody notices;
 * - a failure is classified into the closed taxonomy from the error the check
 *   left behind, so the recovery ladder sees a timeout as a timeout and a
 *   policy refusal as a refusal, never as a generic "failed";
 * - a success carries a digest of its material result only, so an honest
 *   retry that captured new screenshot bytes of the same state is not mistaken
 *   for a disagreement (section 3.9).
 *
 * Attempts are stored on the page's own scan.json as serialisable inputs, not
 * as a live ledger. A multi-hour audit writes pages one at a time and resumes
 * from disk, so the page is the unit that survives a crash; the site-wide
 * ledger is assembled from those records afterwards, deterministically, by
 * `assembleCheckAttemptLedger`.
 */

import { canonicalDigest } from '@odysseus/core';
import {
  CHECK_SCOPE_REGISTRY,
  type CheckExecutionOutcome,
  type CheckId,
} from './check-scope-coverage.js';
import {
  attemptSelectionKey,
  CHECK_ATTEMPT_LEDGER_VERSION,
  failureClassForHttpStatus,
  nextExecutionProfile,
  resolveAttemptSet,
  type AttemptExecutionProfile,
  type AttemptFailureClass,
  type AttemptSetResolution,
  type AcquisitionAttemptRecord,
  type AttemptTarget,
  type CheckAttempt,
  type CheckAttemptLedger,
  type SelectionDecision,
} from './check-attempt-ledger.js';
import type { PageScanResult } from './scan-page.js';

/** Registered checks the rendered pass owns: everything except Lighthouse,
 *  which runs in its own stage and records its own attempts. */
const RENDERED_CHECK_IDS: readonly CheckId[] = CHECK_SCOPE_REGISTRY.filter(
  (entry) => entry.id !== 'lighthouse',
).map((entry) => entry.id as CheckId);

const REGISTRY_BY_ID = new Map(CHECK_SCOPE_REGISTRY.map((entry) => [entry.id, entry]));

/**
 * Keys whose values change between two honest captures of the same state:
 * wall-clock instants, durations, and file locations of captured bytes.
 * Stripped before the material digest so re-observing a page does not look
 * like the page changing.
 */
const VOLATILE_KEY =
  /(^timestamp$|At$|Ms$|^duration|^screenshot|Path$|^toolOptions$|^testEnvironment$|^testRunner$)/u;

function stripVolatile(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripVolatile);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, member] of Object.entries(value as Record<string, unknown>)) {
      if (VOLATILE_KEY.test(key)) continue;
      out[key] = stripVolatile(member);
    }
    return out;
  }
  return value;
}

interface AxeRuleLike {
  id: string;
  impact?: string | null;
  nodes?: ReadonlyArray<{ target?: unknown }>;
}

/**
 * axe's material result is which rules flagged which elements. Its report
 * also carries pass lists, timings and environment details that vary run to
 * run without the page changing, so only the violation and incomplete sets
 * are compared, element targets sorted.
 */
function axeMaterial(axe: unknown): unknown {
  const project = (rules: unknown) =>
    ((rules as AxeRuleLike[] | undefined) ?? [])
      .map((rule) => ({
        id: rule.id,
        impact: rule.impact ?? null,
        targets: (rule.nodes ?? []).map((node) => JSON.stringify(node.target ?? null)).sort(),
      }))
      .sort((left, right) => left.id.localeCompare(right.id));
  const results = axe as { violations?: unknown; incomplete?: unknown };
  return { violations: project(results.violations), incomplete: project(results.incomplete) };
}

/** Digest of one check's material result on a page, or null when the check
 *  left no result to compare. */
export function materialResultDigest(checkId: string, page: PageScanResult): string | null {
  const entry = REGISTRY_BY_ID.get(checkId);
  if (entry === undefined) throw new Error(`materialResultDigest: unregistered check ${checkId}`);
  const value = (page as unknown as Record<string, unknown>)[entry.resultField];
  if (value === undefined) return null;
  const material = checkId === 'axe' ? axeMaterial(value) : stripVolatile(value);
  return canonicalDigest({ checkId, material });
}

function errorTextFor(checkId: string, page: PageScanResult): string | undefined {
  const entry = REGISTRY_BY_ID.get(checkId);
  if (entry?.errorField === undefined) return undefined;
  const value = (page as unknown as Record<string, unknown>)[entry.errorField];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Maps an error message a check left behind onto the closed failure
 * taxonomy. Ordered from the most specific signal to the least: a policy
 * refusal or an HTTP answer outranks the generic shape of the exception that
 * carried it. The fallback is `tool-error`, which retries in a fresh context,
 * rather than `unknown`, because an uncategorised exception out of one of our
 * own checks is a tool failure by construction.
 */
export function classifyCheckFailure(message: string | undefined): {
  failureClass: AttemptFailureClass;
  diagnosticCode: string;
} {
  const text = message ?? '';
  if (/network.?safety|refused-address|forbidden-scheme/iu.test(text)) {
    return { failureClass: 'network-safety-block', diagnosticCode: 'network-safety-block' };
  }
  if (/robots/iu.test(text) && /disallow/iu.test(text)) {
    return { failureClass: 'robots-policy', diagnosticCode: 'robots-disallowed' };
  }
  const status = /\bHTTP[ /]?(?:status )?(\d{3})\b/iu.exec(text);
  if (status !== null && Number(status[1]) >= 400) {
    const code = Number(status[1]);
    return { failureClass: failureClassForHttpStatus(code), diagnosticCode: `http-${code}` };
  }
  if (/^dependency:/u.test(text)) {
    return { failureClass: 'dependency-error', diagnosticCode: 'dependency-error' };
  }
  if (/watchdog/iu.test(text)) {
    return { failureClass: 'scanner-timeout', diagnosticCode: 'page-watchdog' };
  }
  if (/timeout|timed out/iu.test(text)) {
    return { failureClass: 'scanner-timeout', diagnosticCode: 'check-timeout' };
  }
  if (/has been closed|crash|disconnected|Target closed/iu.test(text)) {
    return { failureClass: 'browser-environment-error', diagnosticCode: 'browser-closed' };
  }
  if (/net::ERR_|ECONNRESET|ECONNREFUSED|socket hang up/iu.test(text)) {
    return { failureClass: 'origin-transient-error', diagnosticCode: 'network-error' };
  }
  if (text === '') return { failureClass: 'tool-error', diagnosticCode: 'check-failed' };
  return { failureClass: 'tool-error', diagnosticCode: 'check-error' };
}

export interface PageAttemptContext {
  url: string;
  surfaceId: string;
  scopeDigest: string;
  evidenceEpoch: number;
  startedAt: Date;
  finishedAt: Date;
  executionProfile: AttemptExecutionProfile;
}

/** Content address of the acquisition artifact one attempt read. */
function pageArtifactDigest(page: PageScanResult): string {
  const {
    acquisitionAttempts: _attempts,
    checkOutcomes: _outcomes,
    renderedCostProfile: _cost,
    ...content
  } = page;
  return canonicalDigest(stripVolatile(content));
}

/**
 * One attempt per requested check for one rendered-analysis run of a page.
 *
 * A check with no reported outcome is a failure, not an absence. When the
 * navigation itself failed, every dependent check inherits the navigation's
 * failure class, because that is why it produced nothing; `axe` in particular
 * reports `not-applicable` in that case, which is true of the run and false of
 * the page, so it is overridden here.
 */
export function pageAttemptRecords(
  page: PageScanResult,
  checkOutcomes: Partial<Record<CheckId, CheckExecutionOutcome>>,
  context: PageAttemptContext,
  checkIds: readonly CheckId[],
): AcquisitionAttemptRecord[] {
  const base = {
    target: { kind: 'page', url: context.url } as AttemptTarget,
    surfaceId: context.surfaceId,
    scopeDigest: context.scopeDigest,
    evidenceEpoch: context.evidenceEpoch,
    startedAt: context.startedAt.toISOString(),
    finishedAt: context.finishedAt.toISOString(),
    executionProfile: context.executionProfile,
    sourceArtifactDigest: pageArtifactDigest(page),
  };
  const navigationFailed = checkOutcomes['render-diff'] !== 'completed';
  const navigationFailure = classifyCheckFailure(page.renderDiffError);

  return checkIds.map((checkId): AcquisitionAttemptRecord => {
    const outcome = checkOutcomes[checkId];
    if (checkId !== 'render-diff' && navigationFailed) {
      return {
        ...base,
        checkId,
        outcome: 'failed',
        failureClass: navigationFailure.failureClass,
        diagnosticCode: 'navigation-failed',
      };
    }
    if (outcome === 'not-applicable') {
      return {
        ...base,
        checkId,
        outcome: 'failed',
        failureClass: 'not-applicable',
        diagnosticCode: 'not-applicable',
      };
    }
    if (outcome === 'completed') {
      const digest = materialResultDigest(checkId, page);
      // A completed check with no stored result is a clean result for the
      // checks that only attach output when they found something; the
      // digest still has to name the check so two clean runs agree.
      return {
        ...base,
        checkId,
        outcome: 'succeeded',
        materialResultDigest: digest ?? canonicalDigest({ checkId, material: null }),
      };
    }
    const classified =
      outcome === 'failed'
        ? classifyCheckFailure(errorTextFor(checkId, page) ?? page.renderDiffError)
        : { failureClass: 'unknown' as const, diagnosticCode: 'outcome-missing' };
    return { ...base, checkId, outcome: 'failed', ...classified };
  });
}

export interface RetryRequest {
  checkId: CheckId;
  nextProfile: AttemptExecutionProfile;
}

/**
 * Which checks on a page may be retried next, and under which profile. A
 * check that already has a success is not retried; a check whose latest
 * failure is terminal (404, robots, network safety, not-applicable,
 * rate-limit) or whose ladder is exhausted is left as a recorded gap.
 */
export function retryRequestsFor(records: readonly AcquisitionAttemptRecord[]): RetryRequest[] {
  const byCheck = new Map<string, AcquisitionAttemptRecord[]>();
  for (const record of records) {
    if (record.target.kind !== 'page') continue;
    const list = byCheck.get(record.checkId) ?? [];
    list.push(record);
    byCheck.set(record.checkId, list);
  }
  const requests: RetryRequest[] = [];
  for (const [checkId, attempts] of byCheck) {
    if (attempts.some((attempt) => attempt.outcome === 'succeeded')) continue;
    const latest = [...attempts].sort((left, right) =>
      left.finishedAt.localeCompare(right.finishedAt),
    )[attempts.length - 1]!;
    if (latest.outcome !== 'failed') continue;
    const decision = nextExecutionProfile(latest.failureClass, latest.executionProfile);
    if (decision.retryable && decision.nextProfile !== 'stop-escalate') {
      requests.push({ checkId: checkId as CheckId, nextProfile: decision.nextProfile });
    }
  }
  return requests.sort((left, right) => left.checkId.localeCompare(right.checkId));
}

/**
 * The page result a retry leaves behind: the original, with each retried
 * check's result and error fields replaced by the retry's whenever the retry
 * succeeded. A check the retry did not fix keeps its original fields, so the
 * scan.json never trades one failure message for another without reason.
 */
export function mergeRetriedChecks(
  original: PageScanResult,
  retry: PageScanResult,
  retryOutcomes: Partial<Record<CheckId, CheckExecutionOutcome>>,
  checkIds: readonly CheckId[],
): { page: PageScanResult; checkOutcomes: Partial<Record<CheckId, CheckExecutionOutcome>> } {
  const page: Record<string, unknown> = { ...original };
  const checkOutcomes = { ...(original.checkOutcomes ?? {}) };
  for (const checkId of checkIds) {
    if (retryOutcomes[checkId] !== 'completed') continue;
    const entry = REGISTRY_BY_ID.get(checkId)!;
    const retried = retry as unknown as Record<string, unknown>;
    if (retried[entry.resultField] === undefined) delete page[entry.resultField];
    else page[entry.resultField] = retried[entry.resultField];
    if (entry.errorField !== undefined) delete page[entry.errorField];
    checkOutcomes[checkId] = 'completed';
    // A recovered navigation also recovers what it was measured from and
    // what was observed on it; leaving the original's (absent or failed)
    // observations beside the retry's result would describe another load.
    if (checkId === 'render-diff') {
      for (const field of ['renderedCostProfile', 'readiness', 'structuralAnchor'] as const) {
        if (retry[field] === undefined) delete page[field];
        else page[field] = retry[field];
      }
    }
    if (checkId === 'axe') {
      if (retry.frames === undefined) delete page['frames'];
      else page['frames'] = retry.frames;
    }
  }
  return { page: { ...(page as unknown as PageScanResult), checkOutcomes }, checkOutcomes };
}

function toLedgerAttempt(record: AcquisitionAttemptRecord): CheckAttempt {
  const body =
    record.outcome === 'succeeded'
      ? {
          evidenceEpoch: record.evidenceEpoch,
          scopeDigest: record.scopeDigest,
          checkId: record.checkId,
          target: record.target,
          surfaceId: record.surfaceId,
          startedAt: record.startedAt,
          finishedAt: record.finishedAt,
          executionProfile: record.executionProfile,
          sourceArtifactDigest: record.sourceArtifactDigest,
          outcome: 'succeeded' as const,
          materialResultDigest: record.materialResultDigest,
        }
      : {
          evidenceEpoch: record.evidenceEpoch,
          scopeDigest: record.scopeDigest,
          checkId: record.checkId,
          target: record.target,
          surfaceId: record.surfaceId,
          startedAt: record.startedAt,
          finishedAt: record.finishedAt,
          executionProfile: record.executionProfile,
          sourceArtifactDigest: record.sourceArtifactDigest,
          outcome: 'failed' as const,
          failureClass: record.failureClass,
          diagnosticCode: record.diagnosticCode,
        };
  return {
    ...body,
    attemptId: `attempt:${canonicalDigest(body).slice('sha256:'.length, 'sha256:'.length + 16)}`,
  } as CheckAttempt;
}

export interface AssembledAttemptLedger {
  ledger: CheckAttemptLedger;
  /** Resolution per selection key, in key order. */
  resolutions: ReadonlyMap<string, AttemptSetResolution>;
}

/**
 * Builds the site-wide ledger from every page's persisted records in one
 * pass, then appends one deterministic acceptance per key whose attempts
 * resolve to a single agreed success.
 *
 * `appendCheckAttempt` copies and refreezes the whole ledger on every call,
 * which is the right trade for the incremental API and quadratic for a
 * thousand-page audit with twenty checks a page. This produces the same
 * records (the attempt identity is the same content address) in linear time.
 * Decisions carry the instant of the last attempt they decide over rather
 * than the wall clock, so assembling the same records twice yields the same
 * ledger digest.
 */
export function assembleCheckAttemptLedger(
  evidenceEpoch: number,
  records: readonly AcquisitionAttemptRecord[],
): AssembledAttemptLedger {
  const seen = new Set<string>();
  const attempts: CheckAttempt[] = [];
  for (const record of records) {
    if (record.evidenceEpoch !== evidenceEpoch) {
      throw new Error(
        `assembleCheckAttemptLedger: attempt from epoch ${record.evidenceEpoch} in epoch ${evidenceEpoch}`,
      );
    }
    const attempt = toLedgerAttempt(record);
    if (seen.has(attempt.attemptId)) continue;
    seen.add(attempt.attemptId);
    attempts.push(attempt);
  }
  attempts.sort((left, right) => {
    const byKey = attemptSelectionKey(left).localeCompare(attemptSelectionKey(right));
    if (byKey !== 0) return byKey;
    const byStart = left.startedAt.localeCompare(right.startedAt);
    return byStart !== 0 ? byStart : left.attemptId.localeCompare(right.attemptId);
  });

  const byKey = new Map<string, CheckAttempt[]>();
  for (const attempt of attempts) {
    const key = attemptSelectionKey(attempt);
    const list = byKey.get(key) ?? [];
    list.push(attempt);
    byKey.set(key, list);
  }

  const resolutions = new Map<string, AttemptSetResolution>();
  const selections: SelectionDecision[] = [];
  for (const [key, group] of byKey) {
    const resolution = resolveAttemptSet(group);
    resolutions.set(key, resolution);
    if (resolution.kind !== 'accepted') continue;
    const decidedAt = group.reduce(
      (latest, attempt) => (attempt.finishedAt > latest ? attempt.finishedAt : latest),
      group[0]!.finishedAt,
    );
    selections.push({
      sequence: selections.length,
      attemptId: resolution.attempt.attemptId,
      state: 'accepted',
      decidedBy: 'deterministic',
      reasonCode: resolution.reasonCode,
      decidedAt,
    });
  }

  return {
    ledger: Object.freeze({
      version: CHECK_ATTEMPT_LEDGER_VERSION,
      evidenceEpoch,
      attempts: Object.freeze(attempts),
      selections: Object.freeze(selections),
    }),
    resolutions,
  };
}

/**
 * Checks computed once per site and attached to the homepage's scan.json.
 * Their evidence is a property of the origin, so their attempts are recorded
 * against a site target rather than repeated as page attempts that would say
 * `not-applicable` on every other page.
 */
const SITE_ATTACHED_CHECK_IDS: readonly CheckId[] = [
  'sitemap-check',
  'llms-txt-check',
  'security-headers',
  'cookie-consent',
  'accessibility-statement',
];

/**
 * Site checks every full audit must hold accepted evidence for. The sitemap
 * and CrUX site checks are conditional (no sitemap state to record, no CrUX
 * key configured) and are judged only when they ran.
 */
export const REQUIRED_SITE_CHECK_IDS: readonly string[] = [
  'llms-txt-check',
  'security-headers',
  'cookie-consent',
  'accessibility-statement',
];

/** Page-target checks the rendered pass owns. */
export const PAGE_CHECK_IDS: readonly CheckId[] = RENDERED_CHECK_IDS.filter(
  (checkId) => !SITE_ATTACHED_CHECK_IDS.includes(checkId),
);

/** Site-level fetches are plain HTTP requests with the crawler identity, not
 *  a browser surface; they share this one surface id. */
export const SITE_REQUEST_SURFACE_ID = 'surface:site-request';

/** Site-level acquisitions with no registry entry, recorded under these ids. */
export const CRUX_FIELD_DATA_CHECK_ID = 'crux-field-data';

/**
 * A site check's result on one run. The value is kept even when the run
 * failed, because several site checks report a fetch failure inside their
 * result (`fetchError`, `checkError`) and downstream consumers already read
 * that shape; `failure` is what tells the ledger the run produced no usable
 * evidence.
 */
export interface SiteCheckRun<T> {
  value: T;
  material: unknown;
  failure?: string;
}

export interface SiteCheckAcquisitionContext {
  origin: string;
  surfaceId: string;
  scopeDigest: string;
  evidenceEpoch: number;
  /** False for callers outside the full-audit evidence path, which keep
   *  their historical single request. */
  retry: boolean;
}

/**
 * Runs one site-level check through the section 10 ladder and records every
 * attempt. `run` receives the profile it runs under so a diagnostic retry can
 * use its longer bound. The last run's value is returned either way; whether
 * it counts as evidence is decided by the recorded attempts, and a check whose
 * ladder runs out leaves failed attempts that the evidence assessment reports
 * as a site-level gap. A thrown error is recorded and rethrown, because the
 * throwers here are policy refusals that must stop the scan.
 */
export async function acquireSiteCheck<T>(
  checkId: string,
  context: SiteCheckAcquisitionContext,
  run: (profile: AttemptExecutionProfile) => Promise<SiteCheckRun<T>>,
): Promise<{ value: T; records: AcquisitionAttemptRecord[] }> {
  const records: AcquisitionAttemptRecord[] = [];
  let profile: AttemptExecutionProfile = 'normal';
  for (;;) {
    const startedAt = new Date();
    const base = () => ({
      checkId,
      target: { kind: 'site', origin: context.origin } as AttemptTarget,
      surfaceId: context.surfaceId,
      scopeDigest: context.scopeDigest,
      evidenceEpoch: context.evidenceEpoch,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      executionProfile: profile,
    });
    let result: SiteCheckRun<T>;
    try {
      result = await run(profile);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      records.push({
        ...base(),
        sourceArtifactDigest: null,
        outcome: 'failed',
        ...classifyCheckFailure(message),
      });
      (error as { acquisitionAttempts?: AcquisitionAttemptRecord[] }).acquisitionAttempts = records;
      throw error;
    }
    if (result.failure === undefined) {
      const materialResultDigest = canonicalDigest({
        checkId,
        material: stripVolatile(result.material),
      });
      records.push({
        ...base(),
        sourceArtifactDigest: materialResultDigest,
        outcome: 'succeeded',
        materialResultDigest,
      });
      return { value: result.value, records };
    }
    const classified = classifyCheckFailure(result.failure);
    records.push({ ...base(), sourceArtifactDigest: null, outcome: 'failed', ...classified });
    const next = nextExecutionProfile(classified.failureClass, profile);
    if (!context.retry || !next.retryable || next.nextProfile === 'stop-escalate') {
      return { value: result.value, records };
    }
    profile = next.nextProfile;
  }
}

/** Lighthouse drives its own emulated device, so its attempts name that
 *  measurement surface rather than the page's baseline desktop surface. */
const LIGHTHOUSE_LAB_SURFACE_ID = 'surface:lighthouse-default-lab';

interface LighthouseLike {
  categories?: Record<string, { score?: number | null }>;
  audits?: Record<string, { score?: number | null; numericValue?: number }>;
}

/**
 * One Lighthouse run as an attempt. Each measurement-set member is its own
 * performance target (`lab-run-N`), because two lab runs disagreeing is noise
 * the measurement set summarises, not a contradiction to resolve; retries of
 * one member compete for that member's slot only.
 */
export function lighthouseAttemptRecord(input: {
  url: string;
  runIndex: number;
  scopeDigest: string;
  evidenceEpoch: number;
  startedAt: Date;
  finishedAt: Date;
  executionProfile: AttemptExecutionProfile;
  lighthouse: unknown;
  lighthouseError: string | undefined;
}): AcquisitionAttemptRecord {
  const base = {
    checkId: 'lighthouse',
    target: {
      kind: 'performance',
      url: input.url,
      performanceProfile: `lab-run-${input.runIndex}`,
    } as AttemptTarget,
    surfaceId: LIGHTHOUSE_LAB_SURFACE_ID,
    scopeDigest: input.scopeDigest,
    evidenceEpoch: input.evidenceEpoch,
    startedAt: input.startedAt.toISOString(),
    finishedAt: input.finishedAt.toISOString(),
    executionProfile: input.executionProfile,
  };
  if (input.lighthouse === undefined) {
    return {
      ...base,
      sourceArtifactDigest: null,
      outcome: 'failed',
      ...classifyCheckFailure(input.lighthouseError),
    };
  }
  const report = input.lighthouse as LighthouseLike;
  const material = {
    categories: Object.fromEntries(
      Object.entries(report.categories ?? {}).map(([id, category]) => [id, category.score ?? null]),
    ),
    audits: Object.fromEntries(
      Object.entries(report.audits ?? {}).map(([id, audit]) => [
        id,
        { score: audit.score ?? null, numericValue: audit.numericValue ?? null },
      ]),
    ),
  };
  const materialResultDigest = canonicalDigest({ checkId: 'lighthouse', material });
  return {
    ...base,
    sourceArtifactDigest: materialResultDigest,
    outcome: 'succeeded',
    materialResultDigest,
  };
}
