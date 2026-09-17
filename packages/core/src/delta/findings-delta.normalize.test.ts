import { describe, expect, it } from 'vitest';
import {
  buildAxeNode,
  buildAxeResultsInput,
  buildAxeViolation,
  buildNormalizePageInput,
} from '../normalize/fixtures.js';
import { normalizeAudit } from '../normalize/normalize.js';
import type { Finding } from '../types/findings.js';
import {
  computeFindingsDelta,
  type DeltaFinding,
  type FindingsDeltaRun,
} from './findings-delta.js';

const STARTED_AT = new Date('2026-08-02T00:00:00.000Z');

const axe = buildAxeResultsInput([
  buildAxeViolation({
    id: 'color-contrast',
    nodes: [buildAxeNode({ target: ['#nav a'] }), buildAxeNode({ target: ['#footer a'] })],
  }),
]);

function contrastFindings(auditId: string, paths: string[]): Finding[] {
  return normalizeAudit({
    auditId,
    startedAt: STARTED_AT,
    pages: paths.map((path) => buildNormalizePageInput({ url: `https://example.com${path}`, axe })),
  });
}

function toRun(auditId: string, findings: Finding[]): FindingsDeltaRun {
  return {
    auditId,
    siteUrl: 'https://example.com/',
    startedAt: STARTED_AT.toISOString(),
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
      normalizationFingerprint: 'same',
      findingsDigest: `sha256:${auditId}`,
    },
    findings: findings.map(
      ({ findingId, ruleId, category, severity, title, pageUrls, dedupeKey }): DeltaFinding => ({
        findingId,
        ruleId,
        category,
        severity,
        title,
        pageUrls,
        dedupeKey,
      }),
    ),
  };
}

describe('computeFindingsDelta over real normalization', () => {
  it('keeps a shared-scope merged finding persistent when the re-audit reaches one more page', () => {
    const baseline = contrastFindings('before', ['/', '/a']);
    const current = contrastFindings('after', ['/', '/a', '/b']);
    expect(baseline).toHaveLength(1);
    expect(current).toHaveLength(1);
    // Precondition: the merged key follows the page list, so it moved.
    expect(baseline[0]!.dedupeKey).not.toBe(current[0]!.dedupeKey);

    const delta = computeFindingsDelta(toRun('before', baseline), toRun('after', current));

    expect(delta.counts.persistent).toBe(1);
    expect(delta.counts.new).toBe(0);
    expect(delta.counts.resolved).toBe(0);
  });
});
