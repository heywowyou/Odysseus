import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assertFindingsProvenance, type FindingsProvenance } from '@odysseus/core';
import type { StoredAnalysis } from '@odysseus/report';
import {
  findReusableAnalysis,
  isReusableAnalysis,
  isSameFindingsProvenance,
} from './analysis-reuse.js';

const provenance = (digest: string): FindingsProvenance => ({
  findingsSchemaVersion: 1,
  normalizationFingerprint: 'fingerprint-1',
  findingsDigest: digest,
});

const criteria = {
  auditId: 'audit-1',
  findingsProvenance: provenance('sha256:same'),
  structureGeneratedAt: '2026-09-17T10:00:00.000Z',
  siteContext: undefined,
};

function storedAnalysis(overrides: Partial<StoredAnalysis> = {}): Partial<StoredAnalysis> {
  return {
    analysisId: 'analysis-fr-1',
    auditId: 'audit-1',
    language: 'fr',
    model: 'test-model',
    temperature: 0.2,
    generatedAt: new Date('2026-09-17T10:30:00.000Z'),
    findingsProvenance: provenance('sha256:same'),
    structureGeneratedAt: '2026-09-17T10:00:00.000Z',
    executiveSummary: 'Résumé.',
    overallRisk: 'medium',
    themes: [
      {
        title: 'Contraste',
        category: 'accessibility',
        businessImpact: 'Some visitors cannot read the text.',
        effort: 'low',
        impact: 'medium',
        priorityRank: 1,
        findingIds: ['f1'],
        recommendedActions: ['Increase text contrast.'],
      },
    ],
    quickWins: [],
    notes: '',
    ...overrides,
  } as Partial<StoredAnalysis>;
}

// Issue #410: the English pass exhausting its retries used to discard the
// French pass that had already succeeded, because the deliverable is the pair
// and the only route forward was to run the writing again. On a real 378-page
// audit (2026-09-17) that meant paying for the French generation twice and
// losing the prose a review had already been done on.
describe('isReusableAnalysis', () => {
  it('reuses an analysis a fresh run would reproduce', () => {
    expect(isReusableAnalysis(storedAnalysis(), criteria)).toBe(true);
  });

  it('refuses one written with other business facts than a fresh run would get (issue #559)', () => {
    const catalogue = {
      businessType: 'unknown (no intake context provided)',
      primaryGoal: 'unknown (no intake context provided)',
      languagesServed: [],
      targetMarkets: [],
      propertyType: 'Hôtel (quatre étoiles)',
      city: 'Biarritz',
      sector: 'hospitality',
    };
    // Written before the catalogue was wired: no facts at all.
    expect(isReusableAnalysis(storedAnalysis(), { ...criteria, siteContext: catalogue })).toBe(
      false,
    );
    expect(
      isReusableAnalysis(storedAnalysis({ siteContext: catalogue }), {
        ...criteria,
        siteContext: { ...catalogue, city: 'Bayonne' },
      }),
    ).toBe(false);
    expect(
      isReusableAnalysis(storedAnalysis({ siteContext: catalogue }), {
        ...criteria,
        siteContext: { ...catalogue },
      }),
    ).toBe(true);
  });

  it('refuses one from another audit', () => {
    expect(isReusableAnalysis(storedAnalysis({ auditId: 'audit-2' }), criteria)).toBe(false);
  });

  it('refuses one whose findings provenance has moved on', () => {
    expect(
      isReusableAnalysis(
        storedAnalysis({ findingsProvenance: provenance('sha256:renormalized') }),
        criteria,
      ),
    ).toBe(false);
  });

  it('refuses one written against a different structure document', () => {
    expect(
      isReusableAnalysis(
        storedAnalysis({ structureGeneratedAt: '2026-09-16T08:00:00.000Z' }),
        criteria,
      ),
    ).toBe(false);
  });

  // Fail closed: "I cannot tell" and "it does not match" get the same answer,
  // per the standing provenance guardrail.
  it.each(['findingsProvenance', 'structureGeneratedAt', 'analysisId'] as const)(
    'refuses one with no %s, as an analysis written before this change has',
    (field) => {
      const stored = storedAnalysis();
      delete stored[field];
      expect(isReusableAnalysis(stored, criteria)).toBe(false);
    },
  );

  it('refuses a static-fallback analysis, which made no model call to save', () => {
    expect(
      isReusableAnalysis(storedAnalysis({ generationMode: 'static-fallback' }), criteria),
    ).toBe(false);
  });

  it('refuses nothing at all', () => {
    expect(isReusableAnalysis(undefined, criteria)).toBe(false);
  });
});

describe('findReusableAnalysis', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'odysseus-analysis-reuse-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const write = async (name: string, analysis: Partial<StoredAnalysis>): Promise<void> => {
    await fs.writeFile(path.join(dir, name), JSON.stringify(analysis, null, 2));
  };

  it('finds nothing when the directory does not exist', async () => {
    expect(await findReusableAnalysis(path.join(dir, 'absent'), 'fr', criteria)).toBeUndefined();
  });

  it('reads only the requested language', async () => {
    await write('2026-09-17T10-30-00Z-en.json', storedAnalysis({ language: 'en' }));

    expect(await findReusableAnalysis(dir, 'fr', criteria)).toBeUndefined();
    expect((await findReusableAnalysis(dir, 'en', criteria))?.analysis.language).toBe('en');
  });

  it('prefers the newest compatible file, ISO filenames sorting chronologically', async () => {
    await write('2026-09-17T10-30-00Z-fr.json', storedAnalysis({ analysisId: 'older' }));
    await write('2026-09-17T11-30-00Z-fr.json', storedAnalysis({ analysisId: 'newer' }));

    expect((await findReusableAnalysis(dir, 'fr', criteria))?.analysis.analysisId).toBe('newer');
  });

  it('skips a newer incompatible file for an older compatible one', async () => {
    await write('2026-09-17T10-30-00Z-fr.json', storedAnalysis({ analysisId: 'compatible' }));
    await write(
      '2026-09-17T11-30-00Z-fr.json',
      storedAnalysis({ analysisId: 'stale', findingsProvenance: provenance('sha256:other') }),
    );

    expect((await findReusableAnalysis(dir, 'fr', criteria))?.analysis.analysisId).toBe(
      'compatible',
    );
  });

  it('ignores JSON that does not satisfy the stored LLM output schema', async () => {
    await write('2026-09-17T11-30-00Z-fr.json', storedAnalysis({ executiveSummary: '' }));

    expect(await findReusableAnalysis(dir, 'fr', criteria)).toBeUndefined();
  });

  it('ignores a file that is not readable JSON rather than failing the run', async () => {
    await fs.writeFile(path.join(dir, '2026-09-17T11-30-00Z-fr.json'), '{ half written');
    await write('2026-09-17T10-30-00Z-fr.json', storedAnalysis({ analysisId: 'intact' }));

    expect((await findReusableAnalysis(dir, 'fr', criteria))?.analysis.analysisId).toBe('intact');
  });

  it('returns generatedAt as a Date, the in-memory convention', async () => {
    await write('2026-09-17T10-30-00Z-fr.json', storedAnalysis());

    const found = await findReusableAnalysis(dir, 'fr', criteria);

    expect(found?.analysis.generatedAt).toBeInstanceOf(Date);
    expect(found?.analysis.generatedAt.toISOString()).toBe('2026-09-17T10:30:00.000Z');
  });
});

// Reuse asks the same question the assertion asks, as a decision rather than
// a failure. Two functions answering one question can drift, so they are held
// against each other: whatever the assertion rejects, the predicate must call
// different, and vice versa.
describe('isSameFindingsProvenance agrees with assertFindingsProvenance', () => {
  const base = provenance('sha256:same');

  const variants: [string, FindingsProvenance | undefined][] = [
    ['identical', { ...base }],
    ['a different digest', { ...base, findingsDigest: 'sha256:other' }],
    ['a different normalization fingerprint', { ...base, normalizationFingerprint: 'other' }],
    [
      'a different schema version',
      { ...base, findingsSchemaVersion: 99 as unknown as typeof base.findingsSchemaVersion },
    ],
    ['nothing at all', undefined],
  ];

  it.each(variants)('treats %s the same way both times', (_label, actual) => {
    let threw = false;
    try {
      assertFindingsProvenance(actual, base, 'analysis');
    } catch {
      threw = true;
    }
    expect(isSameFindingsProvenance(actual, base)).toBe(!threw);
  });
});
