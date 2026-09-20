import { describe, expect, it } from 'vitest';
import { criticWritingInput, criticWrittenOutput } from './test-support/critic-fixtures.js';
import {
  applyWritingOverrides,
  findOverrideLineageMismatch,
  parseWritingOverrideFile,
  type WritingOverride,
  type WritingOverrideFile,
} from './writing-overrides.js';

const input = criticWritingInput();
const written = criticWrittenOutput();

const IMPACT_PATH = 'themes[0](t1).businessImpact';
const CURRENT_IMPACT = written.themes[0]!.businessImpact;

function override(overrides: Partial<WritingOverride> = {}): WritingOverride {
  return {
    path: IMPACT_PATH,
    from: CURRENT_IMPACT,
    to: 'Les textes peu contrastés restent difficiles à lire sur les pages mesurées.',
    reason: 'Le texte d’origine reste vague sur la portée.',
    ...overrides,
  };
}

function apply(...overrides: WritingOverride[]) {
  return applyWritingOverrides({ input, written, overrides });
}

function lineageFile(overrides: Partial<WritingOverrideFile> = {}): WritingOverrideFile {
  return {
    auditId: 'audit-1',
    language: 'fr',
    analysisDigest: `sha256:${'a'.repeat(64)}`,
    findingsDigest: `sha256:${'b'.repeat(64)}`,
    overrides: [override()],
    ...overrides,
  };
}

const lineage = {
  auditId: 'audit-1',
  language: 'fr' as const,
  analysisDigest: `sha256:${'a'.repeat(64)}`,
  findingsDigest: `sha256:${'b'.repeat(64)}`,
};

describe('parseWritingOverrideFile', () => {
  it('accepts the file the finalizer writes', () => {
    expect(parseWritingOverrideFile(lineageFile())).toEqual(lineageFile());
  });

  it('rejects an unknown key rather than silently dropping it, so a typo in a digest name is not read as no binding at all', () => {
    expect(() => parseWritingOverrideFile({ ...lineageFile(), analysisDigests: 'typo' })).toThrow();
  });

  it('requires a reason, because an unexplained rewrite of a delivered report is what this exists to avoid', () => {
    const file = lineageFile({ overrides: [{ ...override(), reason: '' }] });
    expect(() => parseWritingOverrideFile(file)).toThrow();
  });
});

describe('findOverrideLineageMismatch', () => {
  it('passes a file written against this exact analysis', () => {
    expect(findOverrideLineageMismatch(lineageFile(), lineage)).toBeUndefined();
  });

  it('refuses corrections written against text that has since been regenerated', () => {
    const stale = lineageFile({ analysisDigest: `sha256:${'c'.repeat(64)}` });
    expect(findOverrideLineageMismatch(stale, lineage)).toMatch(/regenerated/u);
  });

  it('refuses when the findings changed, since the prose describes a different set of them', () => {
    const stale = lineageFile({ findingsDigest: `sha256:${'d'.repeat(64)}` });
    expect(findOverrideLineageMismatch(stale, lineage)).toMatch(/findings have changed/u);
  });

  it('refuses the other language of the same audit', () => {
    expect(findOverrideLineageMismatch(lineageFile({ language: 'en' }), lineage)).toMatch(/en/u);
  });
});

describe('applyWritingOverrides', () => {
  it('replaces the named field and leaves every other one identical', () => {
    const result = apply(override());

    expect(result.status).toBe('applied');
    if (result.status !== 'applied') return;
    expect(result.output.themes[0]!.businessImpact).toBe(
      'Les textes peu contrastés restent difficiles à lire sur les pages mesurées.',
    );
    expect(result.output.themes[1]).toBe(written.themes[1]);
    expect(result.output.executiveSummary).toBe(written.executiveSummary);
    expect(result.output.notes).toBe(written.notes);
  });

  /** Operator prose gets the same guillemet spacing and dash normalization
   *  as model prose. It lands in the same PDF, and an ordinary space inside
   *  guillemets is a real line-break defect there (trade-off 29). */
  it('applies French typography to the operator’s prose, so the corrected field matches the rest of the report', () => {
    const result = apply(
      override({ to: 'Le libellé « Réserver » reste illisible – corrigez son contraste.' }),
    );

    expect(result.status).toBe('applied');
    if (result.status !== 'applied') return;
    expect(result.output.themes[0]!.businessImpact).toBe(
      'Le libellé « Réserver » reste illisible - corrigez son contraste.',
    );
  });

  /** The registry is the allowlist: severities, finding ids, counts and
   *  ranking are not prose fields, so no path reaches them. */
  it('refuses a path outside the prose-field registry', () => {
    const result = apply(override({ path: 'themes[0](t1).priorityRank' }));

    expect(result).toMatchObject({ status: 'refused' });
    expect((result as { reason: string }).reason).toMatch(/not a prose field/u);
  });

  it('refuses a path naming a theme key that is not at that index', () => {
    const result = apply(override({ path: 'themes[1](t1).businessImpact' }));

    expect(result).toMatchObject({ status: 'refused' });
  });

  it('refuses when the current text is not what the override was written against', () => {
    const result = apply(override({ from: 'Un texte que le rapport ne contient pas.' }));

    expect(result).toMatchObject({ status: 'refused' });
    expect((result as { reason: string }).reason).toMatch(/no longer reads as the override/u);
  });

  it('refuses the same field twice, which would leave which correction won undefined', () => {
    const result = apply(override(), override({ to: 'Une autre formulation.' }));

    expect(result).toMatchObject({ status: 'refused' });
    expect((result as { reason: string }).reason).toMatch(/twice/u);
  });

  /** Rule 1 and rule 6 apply to the operator's prose too: it lands in the
   *  same report. The sanitizer reaches these two first and replaces the
   *  sentence with a fallback; refusing rather than shipping that fallback
   *  is what keeps the delivered report the text the operator approved. */
  it('refuses a correction that invents a page count the report template owns', () => {
    const result = apply(
      override({ to: 'Les textes peu contrastés gênent la lecture sur 42 pages du site.' }),
    );

    expect(result).toMatchObject({ status: 'refused' });
    expect((result as { reason: string }).reason).toMatch(/rewritten by sanitation/u);
  });

  it('refuses a correction that claims a legal consequence', () => {
    const result = apply(
      override({
        to: 'Ces écarts exposent l’établissement à une amende en cas de contrôle.',
      }),
    );

    expect(result).toMatchObject({ status: 'refused' });
    expect((result as { reason: string }).reason).toMatch(/rewritten by sanitation/u);
  });

  /** Past the sanitizer, the guard table still judges the operator. The
   *  sanitizer has no opinion about which language the prose is in; the
   *  guard does, and a French report may not carry an English correction. */
  it('refuses a correction written in the wrong language for the report', () => {
    const result = apply(
      override({
        to: 'Low contrast text remains hard to read for the visitors concerned on the measured pages.',
      }),
    );

    expect(result).toMatchObject({ status: 'refused' });
    expect((result as { reason: string }).reason).toMatch(/guard\(s\) the original passed/u);
  });

  it('carries the original’s sanitation warnings forward, minus those on fields the operator rewrote', () => {
    const result = applyWritingOverrides({
      input,
      written,
      overrides: [override()],
      warnings: [
        { code: 'legal-claim-removed', field: IMPACT_PATH },
        { code: 'legal-claim-removed', field: 'notes' },
      ],
    });

    expect(result.status).toBe('applied');
    if (result.status !== 'applied') return;
    expect(result.warnings).toEqual([{ code: 'legal-claim-removed', field: 'notes' }]);
  });
});
