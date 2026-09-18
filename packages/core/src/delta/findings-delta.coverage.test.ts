import { describe, expect, it } from 'vitest';
import {
  buildLegacyFindingsDeltaCoverage,
  compareDeltaObservationAcrossRuns,
  FINDINGS_DELTA_COVERAGE_VERSION,
  type DeltaCheckObservability,
  type FindingsDeltaCoverage,
} from './coverage-comparability.js';
import {
  computeFindingsDelta,
  type DeltaFinding,
  type FindingsDeltaRun,
} from './findings-delta.js';

const HOME = 'https://hotel.fr/';
const MOBILE = 'mobile';

function finding(
  key: string,
  severity: DeltaFinding['severity'],
  pages: string[] = [HOME],
  ruleId = 'color-contrast',
): DeltaFinding {
  return {
    findingId: `f-${key}`,
    ruleId,
    category: 'accessibility',
    severity,
    title: 'Contrast',
    pageUrls: pages,
    dedupeKey: key,
  };
}

function axeCheck(overrides: Partial<DeltaCheckObservability> = {}): DeltaCheckObservability {
  return {
    checkId: 'axe',
    version: '1',
    surfaces: ['baseline-desktop'],
    frameCapability: 'document-only',
    semanticallyConditional: false,
    ...overrides,
  };
}

function coverage(overrides: Partial<FindingsDeltaCoverage> = {}): FindingsDeltaCoverage {
  return {
    version: FINDINGS_DELTA_COVERAGE_VERSION,
    scopeSignature: 'scope-1',
    inventorySignature: 'inventory-1',
    capabilityRegistryVersion: 'cap-v1',
    semanticClassifierVersion: 'classifier-1',
    checks: [axeCheck()],
    surfaces: ['baseline-desktop', 'surface:site-request'],
    observations: {},
    ...overrides,
  };
}

function run(
  auditId: string,
  findings: DeltaFinding[],
  coverageOverrides: Partial<FindingsDeltaCoverage> | false = {},
): FindingsDeltaRun {
  return {
    auditId,
    siteUrl: 'https://hotel.fr/',
    startedAt: '2026-09-01T10:00:00.000Z',
    tool: {
      odysseusVersion: '1.0.0',
      findingsSchemaVersion: 1 as never,
      axeCoreVersion: '4.10.0',
      lighthouseVersion: '12.0.0',
      playwrightVersion: '1.50.0',
      chromiumVersion: '130',
    },
    config: { maxPages: 100, maxDepth: 5 },
    findingsProvenance: {
      findingsSchemaVersion: 1 as never,
      normalizationFingerprint: 'abc',
      findingsDigest: `sha256:${auditId}`,
    },
    findings,
    ...(coverageOverrides !== false ? { coverage: coverage(coverageOverrides) } : {}),
  };
}

describe('section 18 cross-run/re-audit rows', () => {
  it('keeps a comparable present-before-and-after finding persistent', () => {
    const delta = computeFindingsDelta(
      run('before', [finding('kept', 'serious')], {
        observations: { kept: { checkId: 'axe', surfaceId: 'baseline-desktop' } },
      }),
      run('after', [finding('kept', 'serious')], {
        observations: { kept: { checkId: 'axe', surfaceId: 'baseline-desktop' } },
      }),
    );

    expect(delta.counts).toEqual({
      new: 0,
      'newly-observable': 0,
      resolved: 0,
      'not-comparable': 0,
      persistent: 1,
      'changed-severity': 0,
    });
    expect(delta.rows[0]).toMatchObject({ class: 'persistent', dedupeKey: 'kept' });
    expect(delta.rows[0]?.coverage).toBeUndefined();
  });

  it('calls a finding resolved only when the current run could still observe it', () => {
    const delta = computeFindingsDelta(
      run('before', [finding('fixed', 'serious')], {
        observations: { fixed: { checkId: 'axe', surfaceId: 'baseline-desktop' } },
      }),
      run('after', [], {}),
    );

    expect(delta.counts.resolved).toBe(1);
    expect(delta.counts['not-comparable']).toBe(0);
    expect(delta.rows[0]?.class).toBe('resolved');
  });

  it('calls a comparable current-only finding new', () => {
    const delta = computeFindingsDelta(
      run('before', [], {}),
      run('after', [finding('added', 'serious')], {
        observations: { added: { checkId: 'axe', surfaceId: 'baseline-desktop' } },
      }),
    );

    expect(delta.counts.new).toBe(1);
    expect(delta.counts['newly-observable']).toBe(0);
    expect(delta.rows[0]?.class).toBe('new');
  });

  it('classifies a mobile-only finding against a pre-059 baseline as newly observable', () => {
    const baseline = run('before', [finding('desktop', 'serious')], false);
    baseline.coverage = buildLegacyFindingsDeltaCoverage();
    const delta = computeFindingsDelta(
      baseline,
      run('after', [finding('desktop', 'serious'), finding('mobile-only', 'critical')], {
        surfaces: ['baseline-desktop', 'surface:site-request', MOBILE],
        observations: {
          desktop: { checkId: 'axe', surfaceId: 'baseline-desktop' },
          'mobile-only': { checkId: 'axe', surfaceId: MOBILE },
        },
      }),
    );

    expect(delta.rows.find((row) => row.dedupeKey === 'mobile-only')).toMatchObject({
      class: 'newly-observable',
      coverage: { kind: 'newly-observable', reason: 'surface-absent-in-baseline' },
    });
    expect(delta.rows.find((row) => row.dedupeKey === 'desktop')).toMatchObject({
      class: 'persistent',
    });
    expect(delta.counts['newly-observable']).toBe(1);
    expect(delta.counts.new).toBe(0);
  });

  it('classifies a finding from a check the baseline never ran as newly observable', () => {
    const delta = computeFindingsDelta(
      run('before', [], {
        checks: [axeCheck()],
        observations: {},
      }),
      run('after', [finding('lighthouse-new', 'moderate')], {
        checks: [axeCheck(), axeCheck({ checkId: 'lighthouse', version: '1' })],
        observations: {
          'lighthouse-new': { checkId: 'lighthouse', surfaceId: 'baseline-desktop' },
        },
      }),
    );

    expect(delta.rows[0]).toMatchObject({
      class: 'newly-observable',
      coverage: { kind: 'newly-observable', reason: 'check-absent-in-baseline' },
    });
  });

  it('never calls a finding resolved when its check no longer runs', () => {
    const delta = computeFindingsDelta(
      run('before', [finding('gone', 'serious')], {
        checks: [axeCheck()],
        observations: { gone: { checkId: 'axe', surfaceId: 'baseline-desktop' } },
      }),
      run('after', [], { checks: [axeCheck({ checkId: 'lighthouse' })], observations: {} }),
    );

    expect(delta.rows[0]).toMatchObject({
      class: 'not-comparable',
      coverage: { kind: 'not-comparable', reason: 'check-absent-in-current' },
      baseline: { findingId: 'f-gone' },
    });
    expect(delta.rows[0]?.current).toBeUndefined();
    expect(delta.counts.resolved).toBe(0);
    expect(delta.counts['not-comparable']).toBe(1);
  });

  it('never calls a finding resolved when its surface is no longer run', () => {
    const delta = computeFindingsDelta(
      run('before', [finding('gone', 'serious')], {
        observations: { gone: { checkId: 'axe', surfaceId: 'baseline-desktop' } },
      }),
      run('after', [], { surfaces: ['surface:site-request'] }),
    );

    expect(delta.rows[0]).toMatchObject({
      class: 'not-comparable',
      coverage: { kind: 'not-comparable', reason: 'surface-absent-in-current' },
    });
    expect(delta.counts.resolved).toBe(0);
  });

  it('discloses an expanded inventory beside rescoped pairing without fake regression', () => {
    const A = 'https://hotel.fr/a';
    const B = 'https://hotel.fr/b';
    const delta = computeFindingsDelta(
      run('before', [finding('b1', 'serious', [HOME, A])], { inventorySignature: 'inventory-1' }),
      run('after', [finding('c1', 'serious', [HOME, A, B])], { inventorySignature: 'inventory-2' }),
    );

    expect(delta.rows).toHaveLength(1);
    expect(delta.rows[0]).toMatchObject({
      class: 'persistent',
      dedupeKey: 'c1',
      baseline: { findingId: 'f-b1' },
      current: { findingId: 'f-c1' },
    });
    expect(delta.counts).toMatchObject({ new: 0, resolved: 0, persistent: 1 });
    expect(delta.coverage).toEqual({
      scopeChanged: false,
      inventoryChanged: true,
      capabilityRegistryChanged: false,
    });
  });

  it('discloses a scope change but never calls scope difference incomparability', () => {
    const delta = computeFindingsDelta(
      run('before', [finding('kept', 'serious')], { scopeSignature: 'scope-1' }),
      run('after', [finding('kept', 'serious')], { scopeSignature: 'scope-2' }),
    );

    expect(delta.rows[0]?.class).toBe('persistent');
    expect(delta.coverage).toMatchObject({ scopeChanged: true });
  });

  it('stays reusable when only the scanner version changed and the coverage matches', () => {
    const before = run('before', [finding('kept', 'serious')], {
      observations: { kept: { checkId: 'axe', surfaceId: 'baseline-desktop' } },
    });
    const delta = computeFindingsDelta(
      before,
      run('after', [finding('kept', 'serious')], {
        observations: { kept: { checkId: 'axe', surfaceId: 'baseline-desktop' } },
      }),
    );

    expect(delta.changedSeveritySuppressed).toBe(false);
    expect(delta.versionDifferences).toEqual([]);
    expect(delta.coverage).toEqual({
      scopeChanged: false,
      inventoryChanged: false,
      capabilityRegistryChanged: false,
    });
    expect(delta.counts['not-comparable']).toBe(0);
    expect(delta.counts.persistent).toBe(1);

    /* A newer scanner whose observability is unchanged stays reusable: the
     * version difference is disclosed, nothing becomes incomparable, and a
     * severity move is treated as tooling, not as the site. */
    const upgradedRun = run('after', [finding('kept', 'critical')], {
      observations: { kept: { checkId: 'axe', surfaceId: 'baseline-desktop' } },
    });
    const upgraded = computeFindingsDelta(before, {
      ...upgradedRun,
      tool: { ...upgradedRun.tool, odysseusVersion: '2.0.0' },
    });
    expect(upgraded.changedSeveritySuppressed).toBe(true);
    expect(upgraded.counts.persistent).toBe(1);
    expect(upgraded.counts['changed-severity']).toBe(0);
    expect(upgraded.counts['not-comparable']).toBe(0);
    expect(upgraded.coverage).toEqual(delta.coverage);
  });

  it('cannot reuse old evidence for a claim it never supported, without touching the rest', () => {
    const baseline = run('before', [finding('desktop-fixed', 'serious')], false);
    baseline.coverage = buildLegacyFindingsDeltaCoverage();
    const delta = computeFindingsDelta(
      baseline,
      run('after', [finding('desktop-fixed', 'serious'), finding('mobile-only', 'critical')], {
        surfaces: ['baseline-desktop', 'surface:site-request', MOBILE],
        observations: {
          'desktop-fixed': { checkId: 'axe', surfaceId: 'baseline-desktop' },
          'mobile-only': { checkId: 'axe', surfaceId: MOBILE },
        },
      }),
    );

    /* The mobile claim is the only one the old evidence cannot support. */
    expect(delta.rows.find((row) => row.dedupeKey === 'mobile-only')?.class).toBe(
      'newly-observable',
    );
    /* The desktop claim keeps the full comparable semantics. */
    expect(delta.rows.find((row) => row.dedupeKey === 'desktop-fixed')).toMatchObject({
      class: 'persistent',
    });
  });

  it('marks a baseline finding whose check version changed as not comparable', () => {
    const delta = computeFindingsDelta(
      run('before', [finding('gone', 'serious')], {
        checks: [axeCheck({ version: '1' })],
        observations: { gone: { checkId: 'axe', surfaceId: 'baseline-desktop' } },
      }),
      run('after', [], { checks: [axeCheck({ version: '2' })] }),
    );

    expect(delta.rows[0]).toMatchObject({
      class: 'not-comparable',
      coverage: { kind: 'not-comparable', reason: 'check-version-changed' },
    });
  });

  it('marks a baseline finding whose frame capability changed as not comparable', () => {
    const delta = computeFindingsDelta(
      run('before', [finding('gone', 'serious')], {
        checks: [axeCheck({ frameCapability: 'document-only' })],
        observations: { gone: { checkId: 'axe', surfaceId: 'baseline-desktop' } },
      }),
      run('after', [], { checks: [axeCheck({ frameCapability: 'open-shadow' })] }),
    );

    expect(delta.rows[0]).toMatchObject({
      class: 'not-comparable',
      coverage: { kind: 'not-comparable', reason: 'frame-capability-changed' },
    });
  });

  it('marks rows not comparable when a conditional check outlived its classifier', () => {
    const delta = computeFindingsDelta(
      run('before', [finding('gone', 'serious')], {
        semanticClassifierVersion: 'classifier-1',
        checks: [axeCheck({ semanticallyConditional: true })],
        observations: { gone: { checkId: 'axe', surfaceId: 'baseline-desktop' } },
      }),
      run('after', [], {
        semanticClassifierVersion: 'classifier-2',
        checks: [axeCheck({ semanticallyConditional: true })],
      }),
    );

    expect(delta.rows[0]).toMatchObject({
      class: 'not-comparable',
      coverage: { kind: 'not-comparable', reason: 'semantic-classifier-changed' },
    });
  });
});

describe('legacy degradation', () => {
  it('classifies exactly as before when neither run carries coverage', () => {
    const delta = computeFindingsDelta(
      run('before', [finding('fixed', 'serious', [HOME], 'rule-fixed')], false),
      run('after', [finding('added', 'minor', [HOME], 'rule-added')], false),
    );

    expect(delta.coverage).toBeUndefined();
    expect(delta.counts).toEqual({
      new: 1,
      'newly-observable': 0,
      resolved: 1,
      'not-comparable': 0,
      persistent: 0,
      'changed-severity': 0,
    });
    expect(delta.rows.every((row) => row.coverage === undefined)).toBe(true);
  });

  it('never claims observability from one side alone', () => {
    const delta = computeFindingsDelta(
      run('before', [finding('kept', 'serious')], false),
      run('after', [finding('kept', 'serious'), finding('mobile-only', 'critical')], {
        surfaces: ['baseline-desktop', MOBILE],
        observations: {
          'mobile-only': { checkId: 'axe', surfaceId: MOBILE },
        },
      }),
    );

    /* A baseline without a signature cannot prove what it could not see,
     * so the mobile finding stays plain `new`. */
    expect(delta.coverage).toBeUndefined();
    expect(delta.rows.find((row) => row.dedupeKey === 'mobile-only')?.class).toBe('new');
  });

  it('ignores a coverage signature from a future version instead of reading it', () => {
    const delta = computeFindingsDelta(
      run('before', [finding('kept', 'serious')], {
        version: 'findings-delta-coverage-v999' as never,
      }),
      run('after', [finding('kept', 'serious')], {
        version: 'findings-delta-coverage-v999' as never,
      }),
    );

    expect(delta.coverage).toBeUndefined();
    expect(delta.rows[0]?.class).toBe('persistent');
  });

  it('falls back to the plain class for a finding without recorded coordinates', () => {
    const delta = computeFindingsDelta(
      run('before', [finding('kept', 'serious')], { observations: {} }),
      run('after', [finding('kept', 'serious'), finding('unmapped', 'minor')], {
        observations: { kept: { checkId: 'axe', surfaceId: 'baseline-desktop' } },
      }),
    );

    expect(delta.coverage).toBeDefined();
    expect(delta.rows.find((row) => row.dedupeKey === 'unmapped')?.class).toBe('new');
    expect(delta.rows.find((row) => row.dedupeKey === 'kept')?.class).toBe('persistent');
  });
});

describe('compareDeltaObservationAcrossRuns', () => {
  it('answers newly observable before the surface question when the check is new', () => {
    const comparability = compareDeltaObservationAcrossRuns(
      coverage({ checks: [axeCheck()] }),
      coverage({
        checks: [axeCheck(), axeCheck({ checkId: 'lighthouse' })],
        surfaces: ['baseline-desktop', MOBILE],
      }),
      { checkId: 'lighthouse', surfaceId: MOBILE },
    );
    expect(comparability).toEqual({ kind: 'newly-observable', reason: 'check-absent-in-baseline' });
  });

  it('answers the surface question alone when one side has no check detail', () => {
    const legacy = buildLegacyFindingsDeltaCoverage();
    expect(
      compareDeltaObservationAcrossRuns(legacy, coverage(), {
        checkId: 'axe',
        surfaceId: 'baseline-desktop',
      }),
    ).toEqual({ kind: 'comparable' });
    expect(
      compareDeltaObservationAcrossRuns(coverage(), legacy, {
        checkId: 'axe',
        surfaceId: 'baseline-desktop',
      }),
    ).toEqual({ kind: 'comparable' });
    expect(
      compareDeltaObservationAcrossRuns(legacy, coverage({ surfaces: [MOBILE] }), {
        checkId: 'axe',
        surfaceId: 'baseline-desktop',
      }),
    ).toEqual({ kind: 'not-comparable', reason: 'surface-absent-in-current' });
  });
});
