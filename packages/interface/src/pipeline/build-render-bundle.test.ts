import { describe, expect, it } from 'vitest';
import {
  canonicalDigest,
  FINDINGS_SCHEMA_VERSION,
  type AuditManifest,
  type Finding,
  type FindingsProvenance,
} from '@odysseus/core';
import { REPORT_TEMPLATE_VERSION, type StoredAnalysis } from '@odysseus/report';
import { buildRenderBundle, parseRenderBundle } from './build-render-bundle.js';

const provenance: FindingsProvenance = {
  findingsSchemaVersion: FINDINGS_SCHEMA_VERSION,
  normalizationFingerprint: 'fingerprint',
  findingsDigest: `sha256:${'a'.repeat(64)}`,
};

const manifest = {
  auditId: 'audit-1',
  siteUrl: 'https://example.test/',
} as unknown as AuditManifest;
const findings: Finding[] = [];

function buildAnalysis(overrides: Partial<StoredAnalysis> = {}): StoredAnalysis {
  return {
    analysisId: 'analysis-1',
    auditId: 'audit-1',
    language: 'fr',
    model: 'test-model',
    temperature: 0,
    generatedAt: new Date('2026-09-17T10:59:25.000Z'),
    findingsProvenance: provenance,
    overallRisk: 'medium',
    executiveSummary: 'résumé',
    themes: [],
    quickWins: [],
    notes: '',
    ...overrides,
  } as StoredAnalysis;
}

function build(analysis = buildAnalysis()) {
  return buildRenderBundle({
    manifest,
    findings,
    analysis,
    findingsProvenance: provenance,
    renderInputs: {},
    rendererBuild: 'build-abc',
  });
}

describe('buildRenderBundle', () => {
  it('binds the bundle to the audit, analysis and findings it was built from', () => {
    const bundle = build();

    expect(bundle.lineage).toMatchObject({
      auditId: 'audit-1',
      language: 'fr',
      analysisId: 'analysis-1',
      findingsProvenance: provenance,
      rendererBuild: 'build-abc',
      reportTemplateVersion: REPORT_TEMPLATE_VERSION,
    });
    expect(bundle.lineage.analysisDigest).toBe(canonicalDigest(buildAnalysis()));
  });

  it('gives a changed analysis a different digest, so an override written against the old text is refusable', () => {
    const before = build().lineage.analysisDigest;
    const after = build(buildAnalysis({ executiveSummary: 'un autre résumé' })).lineage
      .analysisDigest;

    expect(after).not.toBe(before);
  });

  it('refuses a legacy analysis with no analysis id, which nothing could bind an override to', () => {
    const legacy = buildAnalysis();
    delete (legacy as { analysisId?: string }).analysisId;

    expect(() => build(legacy)).toThrow(/no analysis ID/);
  });

  it('carries the resolved render inputs through verbatim', () => {
    const gradeOverride = { grade: 'C', reason: 'revu' } as never;
    const bundle = buildRenderBundle({
      manifest,
      findings,
      analysis: buildAnalysis(),
      findingsProvenance: provenance,
      renderInputs: { gradeOverride },
      rendererBuild: 'build-abc',
    });

    expect(bundle.gradeOverride).toBe(gradeOverride);
  });
});

describe('parseRenderBundle', () => {
  /** The legal-exposure section measures elapsed time from
   *  `analysis.generatedAt` with getFullYear/getMonth/getDate. JSON.parse
   *  alone leaves a string there, which is a TypeError at render time rather
   *  than a formatting difference, so the parser has to revive it. */
  it('revives the analysis date a JSON round-trip would leave as a string', () => {
    const bundle = build();
    const parsed = parseRenderBundle(JSON.stringify(bundle));

    expect(parsed.analysis.generatedAt).toBeInstanceOf(Date);
    expect(parsed.analysis.generatedAt.toISOString()).toBe('2026-09-17T10:59:25.000Z');
    expect(parsed.analysis.generatedAt.getFullYear()).toBe(2026);
  });

  it('round-trips the lineage unchanged, so the digests still bind after transfer', () => {
    const bundle = build();

    expect(parseRenderBundle(JSON.stringify(bundle)).lineage).toEqual(bundle.lineage);
  });

  /** Pins which dates the render path actually needs as Date objects, so a
   *  future input that does need reviving cannot be added silently. The
   *  manifest and findings are deliberately left as the strings JSON gives:
   *  production already renders both straight out of JSON.parse off disk, so
   *  reviving them here would diverge from what the server does. */
  it('leaves the manifest and findings as the plain JSON the server also renders from', () => {
    const withDatedFinding = buildRenderBundle({
      manifest,
      findings: [{ firstSeenAt: new Date('2026-01-01T00:00:00.000Z') } as unknown as Finding],
      analysis: buildAnalysis(),
      findingsProvenance: provenance,
      renderInputs: {},
      rendererBuild: 'build-abc',
    });

    const parsed = parseRenderBundle(JSON.stringify(withDatedFinding));

    expect(parsed.findings[0]).toEqual({ firstSeenAt: '2026-01-01T00:00:00.000Z' });
  });
});
