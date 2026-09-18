/**
 * Plan 059 step 39 fault-injection cases for the measurement/recovery rows of
 * the section 18 adversarial evidence matrix: the recovery ladder, the
 * failure taxonomy's verdict routing, epoch/lease staleness and the mid-run
 * robots tightening, each proven through the real assembly and approval
 * pipeline via the harness. Deterministic and offline.
 */
import { describe, expect, it } from 'vitest';
import { PAGE_CHECK_IDS } from './evidence-acquisition.js';
import type { AuditEvidenceGraphInput } from './evidence-graph.js';
import {
  assertApproved,
  assertFailClosed,
  epochPathGate,
  failedAttemptRecord,
  inventoryWithRows,
  leaseHandoverIsStale,
  missingLeaseIsStale,
  retrySuccessRecord,
  rootsOf,
  runFaultCase,
} from './evidence-quality-harness.js';
import { cleanAttempts, cleanInput, ORIGIN, ROOMS } from './evidence-graph-fixtures.js';
import type { AcquisitionAttemptRecord, AttemptFailureClass } from './check-attempt-ledger.js';
import {
  buildRobotsPolicySnapshot,
  describeRobotsPolicyTransition,
  type RobotsPolicySnapshot,
} from './robots-policy-snapshot.js';

const ROOMS_MATERIAL = `sha256:material-axe-${ROOMS}`;

function pageAttempts(url: string): readonly AcquisitionAttemptRecord[] {
  return cleanAttempts().filter(
    (record) => record.target.kind === 'page' && record.target.url === url,
  );
}

function robotsRevision(
  revision: number,
  robotsText: string,
  disallow: readonly string[],
): RobotsPolicySnapshot {
  return buildRobotsPolicySnapshot({
    evidenceEpoch: 1,
    revision,
    origin: ORIGIN,
    userAgent: 'OdysseusBot/1.0',
    robotsText,
    retrievedAt: new Date(`2026-09-18T0${revision}:00:00.000Z`),
    rules: {
      found: true,
      disallow: [...disallow],
      allow: ['/'],
      sitemapUrls: [],
      ...(revision > 0 ? { crawlDelayMs: 2000 } : {}),
    },
    configuredDelayMs: 1000,
  });
}

function withoutRoomAxe(clean: AuditEvidenceGraphInput): AcquisitionAttemptRecord[] {
  return clean.attempts.filter(
    (record) =>
      !(record.checkId === 'axe' && record.target.kind === 'page' && record.target.url === ROOMS),
  );
}

describe('measurement/recovery matrix rows', () => {
  const recoveryAfter = (failureClass: AttemptFailureClass, diagnosticCode: string) =>
    runFaultCase({
      id: `recovery/${failureClass}-then-isolated-success`,
      inject: (clean) => ({
        ...clean,
        attempts: [
          ...withoutRoomAxe(clean),
          failedAttemptRecord('axe', { kind: 'page', url: ROOMS }, failureClass, diagnosticCode),
          retrySuccessRecord('axe', { kind: 'page', url: ROOMS }, ROOMS_MATERIAL),
        ],
      }),
    });

  it('recovers an axe timeout through an isolated retry', () => {
    const result = recoveryAfter('scanner-timeout', 'nav-timeout');
    assertApproved(result);
    expect(result.verdict).toBe('reportable-complete');
    const keyAttempts = result.graph.attemptLedger.attempts.filter(
      (record) =>
        record.checkId === 'axe' && record.target.kind === 'page' && record.target.url === ROOMS,
    );
    expect(keyAttempts).toHaveLength(2);
    // The retry's success is the accepted evidence; the timeout stays recorded.
    expect(result.graph.attemptLedger.selections.some((s) => s.reasonCode === 'sole-success')).toBe(
      true,
    );
    const retry = keyAttempts.find((record) => record.executionProfile === 'isolated-retry');
    expect(retry).toBeDefined();
    const cell = result.graph.coverage.entries.find(
      (entry) => entry.checkId === 'axe' && entry.targetKey === `page:${ROOMS}`,
    );
    expect(cell?.outcome).toBe('completed');
    expect(cell?.attemptRefs).toContain(retry?.attemptId);
  });

  it('recovers a browser crash through a fresh browser', () => {
    const result = recoveryAfter('browser-environment-error', 'browser-crashed');
    assertApproved(result);
    expect(result.verdict).toBe('reportable-complete');
  });

  it('sends a persistent anti-bot wall to the operator instead of a disclosure', () => {
    const result = runFaultCase({
      id: 'recovery/persistent-anti-bot-rate-limit',
      inject: (clean) => ({
        ...clean,
        attempts: [
          ...withoutRoomAxe(clean),
          failedAttemptRecord(
            'axe',
            { kind: 'page', url: ROOMS },
            'anti-bot-rate-limit',
            'rate-limited',
          ),
        ],
      }),
    });
    assertFailClosed(result);
    // The anti-bot class routes to the operator (pacing or allowlisting)
    // rather than to a system-resolved gap or a client-facing disclosure.
    expect(result.verdict).toBe('needs-operator-review');
    expect(result.blockingCodes).toContain('operator-resolution-required');
    const operator = result.issues.find((issue) => issue.code === 'operator-resolution-required');
    expect(operator?.resolution).toBe('operator');
    // A walled page is an unresolved gap, not a disclosable limitation.
    expect(result.disclosureCodes).toEqual([]);
  });

  it('discloses a genuine 404 as the site answering and still approves', () => {
    const result = runFaultCase({
      id: 'recovery/genuine-404-disclosed',
      inject: (clean) => ({
        ...clean,
        attempts: clean.attempts.map((record) =>
          record.target.kind === 'page' && record.target.url === ROOMS
            ? failedAttemptRecord(record.checkId, record.target, 'site-http-state', 'http-404')
            : record,
        ),
      }),
    });
    assertApproved(result);
    expect(result.verdict).toBe('reportable-with-known-limitations');
    expect(result.disclosureCodes).toContain('site-http-state-during-analysis');
    for (const checkId of PAGE_CHECK_IDS) {
      const cell = result.graph.coverage.entries.find(
        (entry) => entry.checkId === checkId && entry.targetKey === `page:${ROOMS}`,
      );
      expect(cell?.outcome).toBe('site-http-state');
    }
  });

  it('discloses an inventory-level error page without a gap', () => {
    const result = runFaultCase({
      id: 'recovery/genuine-404-inventory-disposition',
      inject: (clean) => ({
        ...clean,
        inventory: inventoryWithRows(clean.scope, [
          {
            url: `${ORIGIN}/tarifs-supprimes`,
            source: 'link',
            disposition: 'http-error-status',
          },
        ]),
      }),
    });
    assertApproved(result);
    expect(result.disclosureCodes).toContain('site-http-error-pages');
  });

  it('leaves a persistent 5xx as an unresolved gap', () => {
    const result = runFaultCase({
      id: 'recovery/persistent-503-unresolved-gap',
      inject: (clean) => ({
        ...clean,
        attempts: [
          ...withoutRoomAxe(clean),
          failedAttemptRecord(
            'axe',
            { kind: 'page', url: ROOMS },
            'origin-transient-error',
            'http-503',
          ),
        ],
      }),
    });
    assertFailClosed(result);
    expect(result.blockingCodes).toContain('unresolved-material-gap');
  });

  it('discloses a partial extended pass that left the page unstable', () => {
    const result = runFaultCase({
      id: 'recovery/partial-extended-pass-unstable-readiness',
      inject: (clean) => {
        const rooms = clean.pages[1];
        if (rooms?.readiness === undefined) throw new Error('fixture readiness missing');
        return {
          ...clean,
          pages: [
            ...clean.pages.slice(0, 1),
            { ...rooms, readiness: { ...rooms.readiness, outcome: 'unstable' as const } },
          ],
        };
      },
    });
    assertApproved(result);
    expect(result.verdict).toBe('reportable-with-known-limitations');
    expect(result.disclosureCodes).toContain('page-readiness-unstable');
  });

  it('fails a site-level check whose dependency never recovered', () => {
    const result = runFaultCase({
      id: 'recovery/site-level-dependency-failure',
      inject: (clean) => ({
        ...clean,
        attempts: clean.attempts.map((record) =>
          record.checkId === 'security-headers' && record.target.kind === 'site'
            ? failedAttemptRecord(
                'security-headers',
                record.target,
                'dependency-error',
                'dependency-unreachable',
              )
            : record,
        ),
      }),
    });
    assertFailClosed(result);
    expect(result.verdict).toBe('failed');
    expect(result.blockingCodes).toContain('site-level-unknown');
  });

  it('fails a corrupted inventory artifact that this build cannot restore', () => {
    const result = runFaultCase({
      id: 'recovery/corrupt-artifact-inventory-unrestorable',
      inject: (clean) => ({
        ...clean,
        // Deliberate corruption: a snapshot written by another ledger
        // generation, as a damaged or stale artifact would arrive.
        inventory: {
          ...clean.inventory,
          ledgerVersion: 'inventory-ledger-v0',
        } as unknown as typeof clean.inventory,
      }),
    });
    assertFailClosed(result);
    expect(result.blockingCodes).toContain('raw-evidence-invalid');
    const invalid = result.issues.find((issue) => issue.code === 'raw-evidence-invalid');
    expect(invalid?.evidenceRefs).toContain('inventory-version-mismatch');
  });

  it('sends first/retry material disagreement to the operator as unstable', () => {
    const result = runFaultCase({
      id: 'recovery/first-retry-disagreement-unstable',
      inject: (clean) => ({
        ...clean,
        attempts: [
          ...clean.attempts,
          retrySuccessRecord('axe', { kind: 'page', url: ROOMS }, 'sha256:material-disagreeing'),
        ],
      }),
    });
    assertFailClosed(result);
    expect(result.verdict).toBe('needs-operator-review');
    expect(result.blockingCodes).toContain('unstable-material-result');
    const cell = result.graph.coverage.entries.find(
      (entry) => entry.checkId === 'axe' && entry.targetKey === `page:${ROOMS}`,
    );
    expect(cell?.reasonCode).toBe('unstable-result');
    expect(cell?.outcome).toBe('failed');
  });

  it('changes the raw root when a different acquisition artifact is accepted', () => {
    const control = rootsOf(cleanInput());
    const changed = runFaultCase({
      id: 'recovery/acceptance-change-moves-raw-root',
      inject: (clean) => ({
        ...clean,
        attempts: clean.attempts.map((record) =>
          record.checkId === 'axe' && record.target.kind === 'page' && record.target.url === ROOMS
            ? { ...record, sourceArtifactDigest: 'sha256:another-capture' }
            : record,
        ),
      }),
    });
    expect(changed.graph.raw.digest).not.toBe(control.rawDigest);
  });

  it('refuses attempts carried over from another evidence epoch', () => {
    const stale = pageAttempts(ROOMS).find((record) => record.checkId === 'axe');
    expect(stale).toBeDefined();
    const result = runFaultCase({
      id: 'recovery/attempt-from-superseded-epoch',
      inject: (clean) => ({
        ...clean,
        attempts: [
          ...clean.attempts,
          ...(stale !== undefined
            ? [
                {
                  ...stale,
                  evidenceEpoch: 2,
                  startedAt: '2026-09-18T09:07:00.000Z',
                  finishedAt: '2026-09-18T09:07:30.000Z',
                },
              ]
            : []),
        ],
      }),
    });
    assertFailClosed(result);
    expect(result.blockingCodes).toContain('raw-evidence-invalid');
    const invalid = result.issues.find((issue) => issue.code === 'raw-evidence-invalid');
    expect(invalid?.evidenceRefs).toContain('attempt-epoch-mismatch');
  });

  it('fences a superseded worker out through the acquisition lease', () => {
    expect(leaseHandoverIsStale('worker-a', 'worker-a')).toBe(false);
    expect(leaseHandoverIsStale('worker-a', 'worker-b')).toBe(true);
    expect(missingLeaseIsStale('worker-a')).toBe(true);
  });

  it('keeps already-captured evidence valid when robots tightens mid-run', () => {
    const chain = [
      robotsRevision(0, 'User-agent: *\nAllow: /', []),
      robotsRevision(1, 'User-agent: *\nAllow: /\nDisallow: /chambres\nCrawl-delay: 2', [
        '/chambres',
      ]),
    ];
    const control = runFaultCase({ id: 'recovery/robots-control' });
    const result = runFaultCase({
      id: 'recovery/robots-stricter-mid-run',
      inject: (clean) => ({
        ...clean,
        robotsChain: chain,
        inventory: inventoryWithRows(clean.scope, [
          { url: `${ORIGIN}/admin`, source: 'link', disposition: 'robots' },
        ]),
      }),
    });
    // Evidence captured before the tightening stands; the newly forbidden
    // page is disclosed, not silently missing.
    assertApproved(result);
    expect(result.verdict).toBe('reportable-with-known-limitations');
    expect(result.disclosureCodes).toContain('robots-disallowed-pages');
    expect(result.graph.raw.digest).not.toBe(control.graph.raw.digest);

    const gate = epochPathGate(chain, ['/', '/chambres']);
    expect(gate.allowed).toEqual(['/']);
    expect(gate.refused).toEqual(['/chambres']);
    expect(gate.effectiveDelayMs).toBe(2000);
    // The transition is described against the chain as it stood before the
    // revalidation, which is what the run holds when it fetches the new file.
    const transition = describeRobotsPolicyTransition([chain[0]!], chain[1]!, ['/chambres']);
    expect(transition.changed).toBe(true);
    expect(transition.newlyDisallowed).toEqual(['/chambres']);
    expect(transition.delayIncreasedToMs).toBe(2000);
  });
});
