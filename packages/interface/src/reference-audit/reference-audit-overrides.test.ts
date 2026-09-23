import { describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SMALL_SITE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../fixtures/test-audits/small-site',
);

async function readFixture(name: string): Promise<never> {
  return JSON.parse(await fs.readFile(path.join(SMALL_SITE, name), 'utf-8')) as never;
}

async function frenchAnalysis(): Promise<never> {
  const dir = path.join(SMALL_SITE, 'analyses');
  const name = (await fs.readdir(dir))
    .filter((entry) => entry.endsWith('-fr.json'))
    .sort()
    .at(-1)!;
  const parsed = JSON.parse(await fs.readFile(path.join(dir, name), 'utf-8')) as {
    generatedAt: string;
  };
  return { ...parsed, generatedAt: new Date(parsed.generatedAt) } as never;
}

vi.mock('@odysseus/report', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@odysseus/report')>();
  return {
    ...actual,
    renderReferenceAuditHtml: vi.fn(async () => '<html></html>'),
    generateReferenceAuditPdf: vi.fn(async () => ({ pdf: new Uint8Array([1]), pageCount: 1 })),
  };
});

const { buildReferenceAuditCandidate } = await import('./reference-audit-release.js');

async function source() {
  return {
    manifest: await readFixture('manifest.json'),
    findings: await readFixture('findings.json'),
    analysis: await frenchAnalysis(),
    renderedAt: new Date('2026-09-23T10:00:00.000Z'),
    rendererBuild: 'test',
  };
}

describe('reference audit prose overrides', () => {
  it('applies corrections bound to the example lineage, and refuses any other binding', async () => {
    const plain = await buildReferenceAuditCandidate(await source());
    const target = plain.overrideTarget;
    const summary = target.proseFields.find((entry) => entry.field === 'executiveSummary')!;
    const file = {
      auditId: target.auditId,
      language: 'fr' as const,
      analysisDigest: target.analysisDigest,
      findingsDigest: target.findingsDigest,
      overrides: [
        {
          path: 'executiveSummary',
          from: summary.text,
          to: `${summary.text.split('. ')[0]!.replace(/\.$/u, '')}.`,
          reason: 'drop a repeated closing sentence',
        },
      ],
    };

    const corrected = await buildReferenceAuditCandidate({ ...(await source()), overrides: file });
    expect(corrected.overrideCount).toBe(1);
    expect(corrected.showcase.bundle.analysis.executiveSummary).toBe(file.overrides[0]!.to);

    await expect(
      buildReferenceAuditCandidate({
        ...(await source()),
        overrides: { ...file, analysisDigest: 'sha256:other' },
      }),
    ).rejects.toThrow(/overrides refused/u);
  });
});
