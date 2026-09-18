import { describe, expect, it } from 'vitest';
import type { AcquisitionAttemptRecord } from './check-attempt-ledger.js';
import {
  assembleAuditEvidenceGraph,
  confirmedFindingsDigest,
  type AuditEvidenceGraphInput,
} from './evidence-graph.js';
import {
  buildPerformanceMeasurementSet,
  PROVISIONAL_STABILITY_TOLERANCES,
  type PerformanceMeasurementSet,
} from './performance-measurement-set.js';
import {
  attempt,
  AXE_FINDING,
  cleanAttempts,
  cleanInput,
  finding,
  HEURISTIC_FINDING,
  HOME,
  inventory,
  ORIGIN,
  page,
  ROOMS,
  scope,
} from './evidence-graph-fixtures.js';

function blockingCodes(input: AuditEvidenceGraphInput): string[] {
  return assembleAuditEvidenceGraph(input)
    .quality.issues.filter((issue) => issue.severity === 'blocking')
    .map((issue) => issue.code);
}

describe('assembleAuditEvidenceGraph', () => {
  it('approves a complete, coherent, isolated audit without operator input', () => {
    const graph = assembleAuditEvidenceGraph(cleanInput());
    expect(graph.quality.issues).toEqual([]);
    expect(graph.quality.verdict).toBe('reportable-complete');
    expect(graph.approval?.approvalMode).toBe('system');
    expect(graph.approval?.approvedBySystemVersion).toBe('test-build:evidence-approval-policy-v1');
    expect(graph.observations.observations).toHaveLength(1);
    expect(graph.readinessRecords).toHaveLength(2);
  });

  it('computes identical roots for identical inputs', () => {
    const first = assembleAuditEvidenceGraph(cleanInput());
    const second = assembleAuditEvidenceGraph(cleanInput());
    expect(second.raw.digest).toBe(first.raw.digest);
    expect(second.audit.digest).toBe(first.audit.digest);
    expect(second.quality.digest).toBe(first.quality.digest);
  });

  it('refuses approval when the browser ran without approved isolation', () => {
    const input = cleanInput({
      isolation: {
        ok: false,
        profile: 'none',
        findings: [
          {
            code: 'chromium-sandbox-disabled-without-attestation',
            detail: 'no sandbox',
            remediation: 'use the scan container',
          },
        ],
      },
    });
    const graph = assembleAuditEvidenceGraph(input);
    expect(graph.quality.verdict).toBe('failed');
    expect(graph.approval).toBeUndefined();
    expect(blockingCodes(input)).toContain('environment-unapproved');
  });

  it('treats unmeasured temporal coherence as blocking, not as coherent', () => {
    const input = cleanInput({
      temporalCoherence: { status: 'unknown', reasonCode: 'temporal-anchors-not-captured' },
    });
    expect(assembleAuditEvidenceGraph(input).approval).toBeUndefined();
    expect(blockingCodes(input)).toContain('temporal-coherence-unverified');
  });

  it('sends detected drift to the operator rather than failing it', () => {
    const graph = assembleAuditEvidenceGraph(
      cleanInput({
        temporalCoherence: {
          status: 'drift-detected',
          startedAt: '2026-09-18T09:00:00.000Z',
          finishedAt: '2026-09-18T09:30:00.000Z',
          materialTargets: [ROOMS],
          evidenceRefs: [],
        },
      }),
    );
    expect(graph.quality.verdict).toBe('needs-operator-review');
    expect(graph.approval).toBeUndefined();
  });

  it('fails a page check that never produced accepted evidence', () => {
    const attempts = cleanAttempts().map((record) =>
      record.checkId === 'axe' && record.target.kind === 'page' && record.target.url === ROOMS
        ? attempt('axe', { kind: 'page', url: ROOMS }, {
            outcome: 'failed',
            failureClass: 'scanner-timeout',
            diagnosticCode: 'nav-timeout',
            sourceArtifactDigest: null,
          } as Partial<AcquisitionAttemptRecord>)
        : record,
    );
    const input = cleanInput({ attempts });
    const graph = assembleAuditEvidenceGraph(input);
    expect(graph.quality.verdict).toBe('failed');
    expect(blockingCodes(input)).toContain('unresolved-material-gap');
    expect(graph.coverage.unresolvedGaps.map((gap) => gap.checkId)).toContain('axe');
  });

  it('fails a scanned page with no attempt at all for a registered check', () => {
    const attempts = cleanAttempts().filter(
      (record) =>
        !(record.checkId === 'axe' && record.target.kind === 'page' && record.target.url === ROOMS),
    );
    expect(blockingCodes(cleanInput({ attempts }))).toContain('unresolved-material-gap');
  });

  it('fails a required site check with no recorded attempt', () => {
    const attempts = cleanAttempts().filter((record) => record.checkId !== 'security-headers');
    expect(blockingCodes(cleanInput({ attempts }))).toContain('site-level-unknown');
  });

  it('discloses robots-disallowed pages in both languages and still approves', () => {
    const frozen = scope();
    const graph = assembleAuditEvidenceGraph(
      cleanInput({
        inventory: inventory(frozen, [
          { url: `${ORIGIN}/prive`, disposition: 'robots' },
          { url: `${ORIGIN}/admin`, disposition: 'robots' },
        ]),
      }),
    );
    expect(graph.quality.verdict).toBe('reportable-with-known-limitations');
    expect(graph.approval).toBeDefined();
    const robots = graph.quality.mandatoryDisclosures.find(
      (entry) => entry.code === 'robots-disallowed-pages',
    );
    expect(robots?.summary.fr).toBe(
      "2 pages du site n'ont pas été analysées, car son fichier robots.txt en interdit l'accès à notre robot d'analyse.",
    );
    expect(robots?.summary.en).toContain('2 pages of the site were not analysed');
    expect(robots?.evidenceRefs).toEqual([`${ORIGIN}/admin`, `${ORIGIN}/prive`]);
  });

  it('uses the singular sentence for a single affected page', () => {
    const graph = assembleAuditEvidenceGraph(
      cleanInput({
        inventory: inventory(scope(), [{ url: `${ORIGIN}/prive`, disposition: 'robots' }]),
      }),
    );
    expect(graph.quality.mandatoryDisclosures[0]?.summary.fr).toMatch(/^Une page du site/);
  });

  it('rejects a finding with no accepted evidence behind it', () => {
    const stray = finding({
      ruleId: 'color-contrast',
      pageUrls: [`${ORIGIN}/inconnue`],
      elements: [{ pageUrl: `${ORIGIN}/inconnue`, selector: 'p', snippet: '<p>' }],
    });
    const input = cleanInput({ findings: [AXE_FINDING, stray] });
    const graph = assembleAuditEvidenceGraph(input);
    expect(graph.quality.verdict).toBe('failed');
    expect(blockingCodes(input)).toContain('consistency-gate-failed');
  });

  it('keeps heuristic findings out of the confirmed findings digest', () => {
    const graph = assembleAuditEvidenceGraph(
      cleanInput({ findings: [AXE_FINDING, HEURISTIC_FINDING] }),
    );
    expect(graph.signals).toHaveLength(1);
    expect(graph.signals[0]?.ruleId).toBe('alt-text-quality-heuristic');
    expect(graph.audit.confirmedFindingsDigest).toBe(confirmedFindingsDigest([AXE_FINDING]));
    expect(graph.approval).toBeDefined();
  });

  it('changes the raw root when a different artifact is accepted', () => {
    const before = assembleAuditEvidenceGraph(cleanInput());
    const attempts = cleanAttempts().map((record) =>
      record.checkId === 'axe' && record.target.kind === 'page' && record.target.url === HOME
        ? { ...record, sourceArtifactDigest: 'sha256:another-capture' }
        : record,
    );
    const after = assembleAuditEvidenceGraph(cleanInput({ attempts }));
    expect(after.raw.digest).not.toBe(before.raw.digest);
  });

  it('sends disagreeing repeated observations to the operator', () => {
    const attempts = [
      ...cleanAttempts(),
      attempt('axe', { kind: 'page', url: ROOMS }, {
        executionProfile: 'isolated-retry',
        startedAt: '2026-09-18T09:05:00.000Z',
        finishedAt: '2026-09-18T09:05:30.000Z',
        materialResultDigest: 'sha256:different-result',
      } as Partial<AcquisitionAttemptRecord>),
    ];
    const graph = assembleAuditEvidenceGraph(cleanInput({ attempts }));
    expect(graph.quality.issues.map((issue) => issue.code)).toContain('unstable-material-result');
    expect(graph.quality.verdict).toBe('needs-operator-review');
  });

  it('discloses an opaque third-party frame but blocks an untraversed first-party one', () => {
    const thirdParty = assembleAuditEvidenceGraph(
      cleanInput({
        pages: [
          page(HOME, [
            {
              frameUrl: 'https://booking.example/widget',
              frameOrigin: 'https://booking.example',
              sameOrigin: false,
              materiality: 'material',
              axeTraversed: false,
            },
          ]),
          page(ROOMS),
        ],
      }),
    );
    expect(thirdParty.quality.verdict).toBe('reportable-with-known-limitations');
    expect(thirdParty.quality.mandatoryDisclosures.map((entry) => entry.code)).toEqual([
      'third-party-frame-opaque',
    ]);

    const firstParty = cleanInput({
      pages: [
        page(HOME, [
          {
            frameUrl: `${ORIGIN}/carte`,
            frameOrigin: ORIGIN,
            sameOrigin: true,
            materiality: 'material',
            axeTraversed: false,
          },
        ]),
        page(ROOMS),
      ],
    });
    expect(blockingCodes(firstParty)).toContain('unresolved-material-gap');
  });

  it('blocks a rendered page with no readiness record', () => {
    const input = cleanInput({ pages: [page(HOME), { url: ROOMS }] });
    expect(blockingCodes(input)).toContain('unresolved-material-gap');
  });

  it('refuses attempts recorded under another scope', () => {
    const attempts = [
      ...cleanAttempts(),
      attempt('axe', { kind: 'page', url: HOME }, {}, 'sha256:other-scope'),
    ];
    expect(blockingCodes(cleanInput({ attempts }))).toContain('raw-evidence-invalid');
  });

  it('blocks when no robots policy was persisted', () => {
    expect(blockingCodes(cleanInput({ robotsChain: [] }))).toContain('robots-policy-unresolved');
  });

  describe('performance measurement sets', () => {
    const labRun = (n: number) =>
      attempt(
        'lighthouse',
        { kind: 'performance', url: HOME, performanceProfile: `lab-run-${n}` },
        { surfaceId: 'surface:lighthouse-default-lab' },
      );
    const attempts = [...cleanAttempts(), labRun(1), labRun(2), labRun(3)];
    const measured = (n: number, lcp: number) => ({
      runId: `lab-run-${n}`,
      observedAt: new Date(`2026-09-18T09:0${n}:00.000Z`),
      environmentFingerprintRef: 'audit-environment',
      outcome: { kind: 'measured' as const, metrics: { performanceScore: 0.7, lcp } },
    });
    // Persisted and read back, as the evidence stage sees it.
    const measurementSet = (runs = [measured(1, 3000), measured(2, 3100), measured(3, 3050)]) =>
      JSON.parse(
        JSON.stringify(
          buildPerformanceMeasurementSet({
            url: HOME,
            profile: 'mobile',
            pageClass: 'homepage',
            selectionReasons: ['homepage-url-present'],
            runs,
            tolerances: PROVISIONAL_STABILITY_TOLERANCES,
          }),
        ),
      ) as PerformanceMeasurementSet;
    const withSet = (set: PerformanceMeasurementSet | undefined) =>
      cleanInput({
        attempts,
        pages: [
          { ...page(HOME), ...(set !== undefined ? { performanceMeasurement: set } : {}) },
          page(ROOMS),
        ],
      });

    it('binds an intact set into the raw root and approves', () => {
      const set = measurementSet();
      const graph = assembleAuditEvidenceGraph(withSet(set));
      expect(graph.quality.verdict).toBe('reportable-complete');
      expect(graph.raw.acceptedArtifactDigests).toContain(set.digest);
    });

    it('blocks a measured page without a set', () => {
      expect(blockingCodes(withSet(undefined))).toContain('performance-confidence-insufficient');
    });

    it('blocks a set that leaves out one of the recorded runs', () => {
      const partial = measurementSet([measured(1, 3000), measured(2, 3100)]);
      expect(blockingCodes(withSet(partial))).toContain('performance-confidence-insufficient');
    });

    it('blocks a set edited after it was built', () => {
      const edited = measurementSet();
      (edited.accepted.metrics[0] as { value: number }).value = 0.99;
      expect(blockingCodes(withSet(edited))).toContain('performance-confidence-insufficient');
    });
  });
});
