import { describe, expect, it } from 'vitest';
import {
  computeFindingsDelta,
  type DeltaFinding,
  type FindingsDeltaRun,
} from './findings-delta.js';

function finding(
  key: string,
  severity: DeltaFinding['severity'],
  pages: string[] = ['https://hotel.fr/'],
): DeltaFinding {
  return {
    findingId: `f-${key}`,
    ruleId: `rule-${key}`,
    category: 'accessibility',
    severity,
    title: `Title ${key}`,
    pageUrls: pages,
    dedupeKey: key,
  };
}

function run(
  auditId: string,
  findings: DeltaFinding[],
  overrides: Partial<FindingsDeltaRun> = {},
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
    ...overrides,
  };
}

describe('computeFindingsDelta', () => {
  it('classifies findings as new, resolved, persistent and changed-severity by dedupe key', () => {
    const delta = computeFindingsDelta(
      run('before', [
        finding('kept', 'serious'),
        finding('fixed', 'critical', ['https://hotel.fr/', 'https://hotel.fr/a']),
        finding('moved', 'moderate'),
      ]),
      run('after', [
        finding('kept', 'serious', ['https://hotel.fr/', 'https://hotel.fr/b']),
        finding('moved', 'critical'),
        finding('added', 'minor'),
      ]),
    );

    expect(delta.counts).toEqual({ new: 1, resolved: 1, persistent: 1, 'changed-severity': 1 });
    expect(delta.rows.map((row) => [row.class, row.dedupeKey])).toEqual([
      ['new', 'added'],
      ['changed-severity', 'moved'],
      ['resolved', 'fixed'],
      ['persistent', 'kept'],
    ]);
    expect(delta.rows.find((row) => row.dedupeKey === 'moved')).toMatchObject({
      baseline: { findingId: 'f-moved', severity: 'moderate', pageCount: 1 },
      current: { findingId: 'f-moved', severity: 'critical', pageCount: 1 },
    });
    expect(delta.rows.find((row) => row.dedupeKey === 'fixed')).toEqual({
      class: 'resolved',
      dedupeKey: 'fixed',
      ruleId: 'rule-fixed',
      category: 'accessibility',
      title: 'Title fixed',
      baseline: { findingId: 'f-fixed', severity: 'critical', pageCount: 2 },
    });
    expect(delta.baseline).toEqual({ auditId: 'before', startedAt: '2026-09-01T10:00:00.000Z' });
    expect(delta.changedSeveritySuppressed).toBe(false);
    expect(delta.versionDifferences).toEqual([]);
    expect(delta.configDifferences).toEqual([]);
  });

  it('orders rows within a class by severity, then rule', () => {
    const delta = computeFindingsDelta(
      run('before', []),
      run('after', [finding('b', 'minor'), finding('c', 'critical'), finding('a', 'minor')]),
    );
    expect(delta.rows.map((row) => row.dedupeKey)).toEqual(['c', 'a', 'b']);
  });

  it('suppresses changed-severity and discloses the version when a gating tool changed', () => {
    const before = run('before', [finding('moved', 'moderate')]);
    const delta = computeFindingsDelta(
      before,
      run('after', [finding('moved', 'serious')], {
        tool: { ...before.tool, axeCoreVersion: null, chromiumVersion: '131' },
      }),
    );

    expect(delta.changedSeveritySuppressed).toBe(true);
    expect(delta.counts).toMatchObject({ persistent: 1, 'changed-severity': 0 });
    expect(delta.rows[0]).toMatchObject({
      class: 'persistent',
      baseline: { severity: 'moderate' },
      current: { severity: 'serious' },
    });
    expect(delta.versionDifferences).toEqual([
      { field: 'axeCoreVersion', baseline: '4.10.0', current: null },
      { field: 'chromiumVersion', baseline: '130', current: '131' },
    ]);
  });

  it('discloses a render-context version change without suppressing severity changes', () => {
    const before = run('before', [finding('moved', 'moderate')]);
    const delta = computeFindingsDelta(
      before,
      run('after', [finding('moved', 'serious')], {
        tool: { ...before.tool, playwrightVersion: '1.51.0' },
      }),
    );
    expect(delta.changedSeveritySuppressed).toBe(false);
    expect(delta.counts['changed-severity']).toBe(1);
    expect(delta.versionDifferences).toHaveLength(1);
  });

  it('suppresses changed-severity when the normalization fingerprint differs', () => {
    const before = run('before', [finding('moved', 'moderate')]);
    const delta = computeFindingsDelta(
      before,
      run('after', [finding('moved', 'serious')], {
        findingsProvenance: { ...before.findingsProvenance, normalizationFingerprint: 'def' },
      }),
    );
    expect(delta.normalizationChanged).toBe(true);
    expect(delta.changedSeveritySuppressed).toBe(true);
    expect(delta.counts['changed-severity']).toBe(0);
  });

  it('discloses a different page or depth limit', () => {
    const delta = computeFindingsDelta(
      run('before', []),
      run('after', [], { config: { maxPages: 30, maxDepth: 5 } }),
    );
    expect(delta.configDifferences).toEqual([{ field: 'maxPages', baseline: 100, current: 30 }]);
  });

  it('refuses runs of different sites, the same audit twice, or a duplicated dedupe key', () => {
    expect(() =>
      computeFindingsDelta(run('before', []), run('after', [], { siteUrl: 'https://other.fr/' })),
    ).toThrow(/https:\/\/other\.fr\//);
    expect(() => computeFindingsDelta(run('same', []), run('same', []))).toThrow(/same audit/);
    expect(() =>
      computeFindingsDelta(
        run('before', [finding('dup', 'minor'), finding('dup', 'serious')]),
        run('after', []),
      ),
    ).toThrow(/two findings with dedupe key dup/);
  });
});
