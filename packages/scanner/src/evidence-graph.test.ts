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
import { MOBILE_SURFACE_PROFILE, buildScanSurface } from './evidence-surfaces.js';
import { buildAuditScopeSnapshot, canonicalDigest } from '@odysseus/core';
import {
  attempt,
  auditProfile,
  AXE_FINDING,
  cleanAttempts,
  cleanInput,
  finding,
  HEURISTIC_FINDING,
  HOME,
  HOME_PROFILE,
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

  it('keeps planned-out-of-scope mobile and consent surfaces from creating a material gap', () => {
    const input = cleanInput();
    const sampledInput = {
      ...input,
      pages: input.pages.map((page) =>
        page.url === ROOMS
          ? {
              ...page,
              plannedOutOfScopeSurfaceIds: ['surface:mobile-planned', 'surface:consent-planned'],
            }
          : page,
      ),
    };
    const graph = assembleAuditEvidenceGraph(sampledInput);
    expect(graph.quality.issues.map((issue) => issue.code)).not.toContain(
      'unresolved-material-gap',
    );
    expect(graph.deltaCoverage.plannedOutOfScopeSurfaces).toEqual([
      'surface:consent-planned',
      'surface:mobile-planned',
    ]);
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
      "2 pages du site n'ont pas été analysées, car son fichier robots.txt en interdit l'accès à notre outil d'analyse.",
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

  it('carries the findings-delta coverage with per-finding coordinates', () => {
    const graph = assembleAuditEvidenceGraph(cleanInput());
    expect(graph.deltaCoverage.version).toBe('findings-delta-coverage-v1');
    expect(graph.deltaCoverage.scopeSignature).toBe(graph.raw.scopeDigest);
    expect(graph.deltaCoverage.inventorySignature).toBe(graph.raw.inventoryDigest);
    expect(graph.deltaCoverage.surfaces).toContain('baseline-desktop');
    expect(graph.deltaCoverage.checks).toContainEqual(
      expect.objectContaining({ checkId: 'axe', surfaces: ['baseline-desktop'] }),
    );
    /* The confirmed axe finding is pinned to the check and surface whose
     * accepted evidence saw it; the heuristic signal is not confirmed and
     * carries no coordinates. */
    expect(graph.deltaCoverage.observations?.['dedupe-image-alt']).toEqual({
      checkId: 'axe',
      surfaceId: 'baseline-desktop',
    });
    expect(Object.keys(graph.deltaCoverage.observations ?? {})).toEqual(['dedupe-image-alt']);
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

describe('mobile surfaces in the evidence graph (plan 059 step 10)', () => {
  const mobileSurface = (pageIdentity: string) =>
    buildScanSurface({
      evidenceEpoch: 1,
      pageIdentity,
      viewport: MOBILE_SURFACE_PROFILE.viewport,
      deviceScaleFactor: MOBILE_SURFACE_PROFILE.deviceScaleFactor,
      hasTouch: true,
      media: { colorScheme: 'light', reducedMotion: 'no-preference' },
      userAgent: 'OdysseusBot/1.0 (+https://odysseusaudit.com/bot)',
      interactionState: 'baseline',
      storageIsolationGroup: 'fresh-context-per-page',
      readinessOutcome: 'ready',
    });

  const withMobileSurfaces = (): AuditEvidenceGraphInput => {
    const home = mobileSurface(HOME);
    const rooms = mobileSurface(ROOMS);
    return cleanInput({
      pages: [
        { ...page(HOME), surfaces: [home] },
        { ...page(ROOMS), surfaces: [rooms] },
      ],
    });
  };

  it('binds the exact surface fingerprints that ran into the raw root', () => {
    const graph = assembleAuditEvidenceGraph(withMobileSurfaces());
    const homeFingerprint = mobileSurface(HOME).surfaceFingerprint;
    expect(graph.raw.acceptedArtifactDigests).toContain(homeFingerprint);
  });

  it('discloses the UA-negotiated-variant limitation wherever mobile coverage is claimed', () => {
    const graph = assembleAuditEvidenceGraph(withMobileSurfaces());
    const limitation = graph.quality.issues.find(
      (issue) => issue.disclosure?.code === 'mobile-ua-negotiated-variant-untested',
    );
    expect(limitation).toBeDefined();
    expect(limitation?.severity).toBe('limitation');
  });

  it('changes the coverage signature digest when a mobile surface joins the audit', () => {
    const withoutMobile = assembleAuditEvidenceGraph(cleanInput());
    const withMobile = assembleAuditEvidenceGraph(withMobileSurfaces());
    expect(withMobile.audit.evidenceCoverageSignature.digest).not.toBe(
      withoutMobile.audit.evidenceCoverageSignature.digest,
    );
  });

  it('emits no mobile limitation when no mobile surface ran', () => {
    const graph = assembleAuditEvidenceGraph(cleanInput());
    expect(
      graph.quality.issues.some(
        (issue) => issue.disclosure?.code === 'mobile-ua-negotiated-variant-untested',
      ),
    ).toBe(false);
  });
});

// Plan 075 J3: a consent banner held the Tab walk on the homepage, so its
// keyboard navigation was not evaluated and the report must say so.
describe('Tab walks held by a dialog in the evidence graph', () => {
  const heldWalk = {
    pageUrl: HOME,
    tabbableCount: 40,
    tabbableSelectors: Array.from({ length: 40 }, (_, i) => `#t${i}`),
    tabbableContainers: Array.from({ length: 40 }, (_, i) => (i < 3 ? '#didomi-host' : null)),
    focusSequence: Array.from({ length: 45 }, (_, i) => i % 3),
  };

  it('discloses the pages whose keyboard navigation was not evaluated', () => {
    const graph = assembleAuditEvidenceGraph(
      cleanInput({ pages: [{ ...page(HOME), keyboardNavigation: heldWalk }, page(ROOMS)] }),
    );

    const limitation = graph.quality.issues.find(
      (issue) => issue.disclosure?.code === 'keyboard-walk-held-by-dialog',
    );
    expect(limitation?.severity).toBe('limitation');
    expect(limitation?.evidenceRefs).toEqual([HOME]);
    expect(limitation?.disclosure?.summary.fr).toContain('une fenêtre ouverte au chargement');
  });

  it('discloses nothing when the walk went through the page', () => {
    const walked = {
      ...heldWalk,
      tabbableContainers: Array<string | null>(40).fill(null),
      focusSequence: Array.from({ length: 45 }, (_, i) => i % 40),
    };
    const graph = assembleAuditEvidenceGraph(
      cleanInput({ pages: [{ ...page(HOME), keyboardNavigation: walked }, page(ROOMS)] }),
    );

    expect(
      graph.quality.issues.some(
        (issue) => issue.disclosure?.code === 'keyboard-walk-held-by-dialog',
      ),
    ).toBe(false);
  });
});

describe('hydration readiness in the evidence graph (plan 059 step 11)', () => {
  it('persists real hydration progress instead of a constant not-run', () => {
    const graph = assembleAuditEvidenceGraph(
      cleanInput({
        pages: [
          {
            ...page(HOME),
            readiness: {
              navigationMilestone: 'load',
              httpStatus: 200,
              domReady: true,
              fontsReady: true,
              networkQuiet: true,
              mutationQuiescent: true,
              significantResourceFailures: [],
              outcome: 'ready',
              hydrationProgress: 'bounded-expansion',
            },
          },
          page(ROOMS),
        ],
      }),
    );

    const home = graph.readinessRecords.find((record) => record.pageIdentity === HOME);
    const rooms = graph.readinessRecords.find((record) => record.pageIdentity === ROOMS);
    expect(home?.hydrationProgress).toBe('bounded-expansion');
    expect(rooms?.hydrationProgress).toBe('not-run');
  });

  it('discloses pages whose content kept expanding past the sweep bound', () => {
    const graph = assembleAuditEvidenceGraph(
      cleanInput({
        pages: [
          {
            ...page(HOME),
            hydration: {
              startScrollHeight: 800,
              endScrollHeight: 30800,
              startDomNodeCount: 200,
              endDomNodeCount: 6200,
              startResourceCount: 10,
              endResourceCount: 10,
              steps: 30,
              quiescent: false,
              continuedExpansionAtBound: true,
              progress: 'bounded-expansion',
            },
          },
          page(ROOMS),
        ],
      }),
    );

    const limitation = graph.quality.issues.find(
      (issue) => issue.disclosure?.code === 'hydration-bound-reached',
    );
    expect(limitation).toBeDefined();
    expect(limitation?.severity).toBe('limitation');
    expect(limitation?.evidenceRefs).toEqual([HOME]);
  });

  it('emits no hydration-bound limitation when every sweep settled', () => {
    const graph = assembleAuditEvidenceGraph(
      cleanInput({
        pages: [
          {
            ...page(HOME),
            hydration: {
              startScrollHeight: 800,
              endScrollHeight: 1600,
              startDomNodeCount: 200,
              endDomNodeCount: 400,
              startResourceCount: 10,
              endResourceCount: 12,
              steps: 4,
              quiescent: true,
              continuedExpansionAtBound: false,
              progress: 'bounded-expansion',
            },
          },
          page(ROOMS),
        ],
      }),
    );

    expect(
      graph.quality.issues.some((issue) => issue.disclosure?.code === 'hydration-bound-reached'),
    ).toBe(false);
  });
});

describe('page and depth truncation blocks a full audit (plan 059 step 14)', () => {
  const withOmitted = (disposition: 'page-cap' | 'depth-bound') =>
    cleanInput({
      inventory: inventory(scope(), [{ url: `${ORIGIN}/omitted`, disposition }]),
    });

  it('keeps a default page-cap truncation of an otherwise eligible page blocking', () => {
    expect(blockingCodes(withOmitted('page-cap'))).toContain('inventory-unreconciled');
  });

  it('keeps a default depth-bound truncation of an otherwise eligible page blocking', () => {
    expect(blockingCodes(withOmitted('depth-bound'))).toContain('inventory-unreconciled');
  });

  it('downgrades an operator-set bound to the disclosed scope limitation', () => {
    const frozen = scope();
    const operatorFrozen = buildAuditScopeSnapshot({
      evidenceEpoch: frozen.evidenceEpoch,
      startUrl: frozen.startUrl,
      hostAliases: frozen.hostAliases,
      scanIntent: frozen.scanIntent,
      seeds: frozen.seeds,
      exclusions: frozen.exclusions,
      externalTransactionalFlows: frozen.externalTransactionalFlows,
      bounds: {
        ...frozen.bounds,
        maxPages: { value: frozen.bounds.maxPages.value, origin: 'operator' },
      },
      sitemapMode: frozen.sitemapMode,
      expectedLanguages: frozen.expectedLanguages,
      networkPolicyId: frozen.networkPolicyId,
    });
    const input = cleanInput({
      scope: operatorFrozen,
      inventory: inventory(operatorFrozen, [{ url: `${ORIGIN}/omitted`, disposition: 'page-cap' }]),
    });

    expect(blockingCodes(input)).not.toContain('inventory-unreconciled');
    const graph = assembleAuditEvidenceGraph(input);
    expect(
      graph.quality.issues.some((issue) => issue.disclosure?.code === 'scope-bound-truncation'),
    ).toBe(true);
  });
});

describe('page semantic profiles in the evidence graph (plan 059 step 26)', () => {
  it('binds one classified profile per scanned page into the audit root', () => {
    const graph = assembleAuditEvidenceGraph(cleanInput());
    expect(graph.semanticProfiles.map((profile) => profile.pageIdentity)).toEqual([HOME, ROOMS]);
    expect(
      graph.semanticProfiles.find((profile) => profile.pageIdentity === ROOMS)?.semanticRole,
    ).toBe('commercial');
    expect(
      graph.semanticProfiles.find((profile) => profile.pageIdentity === HOME)?.semanticRole,
    ).toBe('unknown');
    expect(graph.audit.pageSemanticProfilesDigest).toBe(
      canonicalDigest(graph.semanticProfiles.map((profile) => profile.digest).sort()),
    );
  });

  it('records the running classifier in the delta coverage', () => {
    const graph = assembleAuditEvidenceGraph(cleanInput());
    expect(graph.deltaCoverage.semanticClassifierVersion).toBe(
      graph.semanticProfiles[0]?.classifierVersion,
    );
    expect(graph.deltaCoverage.semanticClassifierVersion).not.toBe('semantic-classifier-not-run');
  });

  it('never lets an unknown or absent semantic role gate or suppress anything', () => {
    // Every page without an extracted profile classifies as unknown, and
    // the audit stays reportable-complete: the profile is report-facing.
    const graph = assembleAuditEvidenceGraph(cleanInput({ pages: [page(HOME), page(ROOMS)] }));
    expect(graph.semanticProfiles.map((profile) => profile.semanticRole)).toEqual([
      'unknown',
      'unknown',
    ]);
    expect(graph.semanticProfiles.every((profile) => profile.reasonCodes.length > 0)).toBe(true);
    expect(graph.quality.verdict).toBe('reportable-complete');
    expect(graph.quality.issues).toEqual([]);
    expect(graph.approval).toBeDefined();
  });

  it('changes the audit root when a page carries different signals, but not the findings', () => {
    const before = assembleAuditEvidenceGraph(cleanInput());
    const retyped = cleanInput({
      pages: [
        page(HOME, [], HOME_PROFILE),
        page(ROOMS, [], auditProfile(ROOMS, [{ kind: 'transactional-form', detail: '1 form(s)' }])),
      ],
    });
    const after = assembleAuditEvidenceGraph(retyped);
    expect(
      after.semanticProfiles.find((profile) => profile.pageIdentity === ROOMS)?.semanticRole,
    ).toBe('transactional');
    expect(after.audit.digest).not.toBe(before.audit.digest);
    expect(after.raw.digest).toBe(before.raw.digest);
    expect(after.audit.confirmedFindingsDigest).toBe(before.audit.confirmedFindingsDigest);
    expect(after.observations.digest).toBe(before.observations.digest);
  });
});

describe('pattern evidence in the evidence graph (plan 059 step 27)', () => {
  const url = (path: string) => `${ORIGIN}/${path}`;

  /** A full audit input over the given scanned URLs, with every page
   *  carrying the fixture page's clean readiness evidence. */
  const inputWithPages = (urls: readonly string[]) => {
    const frozen = scope();
    const extras = urls
      .filter((candidate) => candidate !== HOME && candidate !== ROOMS)
      .map((candidate) => ({ url: candidate, disposition: 'scanned' as const }));
    return cleanInput({
      inventory: inventory(frozen, extras),
      attempts: cleanAttempts(urls),
      pages: urls.map((candidate) => page(candidate)),
    });
  };

  it('yields one pattern with the right observation and page sets for a shared component', () => {
    const shared = finding({
      ruleId: 'image-alt',
      findingId: 'finding-shared-card-visual',
      dedupeKey: 'dedupe-shared-card-visual',
      pageUrls: [HOME, ROOMS],
      elements: [
        { pageUrl: HOME, selector: 'img.card-visual', snippet: '<img class="card-visual">' },
        { pageUrl: ROOMS, selector: 'img.card-visual', snippet: '<img class="card-visual">' },
      ],
    });
    const graph = assembleAuditEvidenceGraph(cleanInput({ findings: [shared] }));
    expect(graph.patterns).toHaveLength(1);
    const pattern = graph.patterns[0]!;
    expect(pattern.ruleId).toBe('image-alt');
    expect(pattern.structuralSignature).toBe('img.card-visual');
    expect(pattern.affectedPageIdentities).toEqual([HOME, ROOMS]);
    expect(pattern.observationIds).toHaveLength(2);
    expect(pattern.authoritativeForFindingIdentity).toBe(false);
    expect(pattern.provesSourceCodeOwnership).toBe(false);
    expect(graph.audit.patternEvidenceDigest).toBe(
      canonicalDigest(graph.patterns.map((entry) => entry.digest).sort()),
    );
  });

  it('does not merge similar selectors from different components', () => {
    const card = url('chateau');
    const spa = url('spa');
    const cardFindingA = finding({
      ruleId: 'link-name',
      findingId: 'finding-card-home',
      dedupeKey: 'dedupe-card-home',
      pageUrls: [HOME],
      elements: [{ pageUrl: HOME, selector: '.card .title a', snippet: '<a>' }],
    });
    const cardFindingB = finding({
      ruleId: 'link-name',
      findingId: 'finding-card-chateau',
      dedupeKey: 'dedupe-card-chateau',
      pageUrls: [card],
      elements: [{ pageUrl: card, selector: '.card .title a', snippet: '<a>' }],
    });
    const panelFindingA = finding({
      ruleId: 'link-name',
      findingId: 'finding-panel-rooms',
      dedupeKey: 'dedupe-panel-rooms',
      pageUrls: [ROOMS],
      elements: [{ pageUrl: ROOMS, selector: '.panel .title a', snippet: '<a>' }],
    });
    const panelFindingB = finding({
      ruleId: 'link-name',
      findingId: 'finding-panel-spa',
      dedupeKey: 'dedupe-panel-spa',
      pageUrls: [spa],
      elements: [{ pageUrl: spa, selector: '.panel .title a', snippet: '<a>' }],
    });
    const input = inputWithPages([HOME, ROOMS, card, spa]);
    input.findings = [cardFindingA, cardFindingB, panelFindingA, panelFindingB];
    const graph = assembleAuditEvidenceGraph(input);

    expect(graph.patterns).toHaveLength(2);
    expect(graph.patterns.map((pattern) => pattern.structuralSignature).sort()).toEqual([
      '.card > .title > a',
      '.panel > .title > a',
    ]);
    // Each pattern carries exactly its own component's observations.
    expect(graph.patterns.map((pattern) => pattern.observationIds.length)).toEqual([2, 2]);
  });

  it('leaves finding totals, dedupe and the verdict untouched', () => {
    const shared = finding({
      ruleId: 'image-alt',
      findingId: 'finding-shared-card-visual',
      dedupeKey: 'dedupe-shared-card-visual',
      pageUrls: [HOME, ROOMS],
      elements: [
        { pageUrl: HOME, selector: 'img.card-visual', snippet: '<img class="card-visual">' },
        { pageUrl: ROOMS, selector: 'img.card-visual', snippet: '<img class="card-visual">' },
      ],
    });
    const graph = assembleAuditEvidenceGraph(cleanInput({ findings: [shared] }));

    // The confirmed-findings digest binds the findings alone; pattern
    // inference is not part of it, however many observations it groups.
    expect(graph.audit.confirmedFindingsDigest).toBe(confirmedFindingsDigest([shared]));
    // Delta coordinates stay exactly the confirmed findings' dedupe keys.
    expect(Object.keys(graph.deltaCoverage.observations ?? {})).toEqual([
      'dedupe-shared-card-visual',
    ]);
    // One finding means one total, whatever the pattern says about its reach.
    expect(graph.observations.observations).toHaveLength(2);
    expect(graph.quality.verdict).toBe('reportable-complete');
    expect(graph.quality.issues).toEqual([]);
    // And an audit with nothing shared keeps zero patterns.
    const clean = assembleAuditEvidenceGraph(cleanInput());
    expect(clean.patterns).toEqual([]);
    expect(clean.audit.confirmedFindingsDigest).toBe(confirmedFindingsDigest([AXE_FINDING]));
  });

  it('never derives a pattern from a heuristic signal', () => {
    const signal = finding({
      ruleId: HEURISTIC_FINDING.ruleId,
      findingId: 'finding-heuristic-shared',
      dedupeKey: 'dedupe-heuristic-shared',
      pageUrls: [HOME, ROOMS],
      elements: [
        { pageUrl: HOME, selector: 'img.card-visual', snippet: '<img class="card-visual">' },
        { pageUrl: ROOMS, selector: 'img.card-visual', snippet: '<img class="card-visual">' },
      ],
    });
    const graph = assembleAuditEvidenceGraph(cleanInput({ findings: [AXE_FINDING, signal] }));
    expect(graph.signals).toHaveLength(1);
    expect(graph.patterns).toEqual([]);
  });
});
