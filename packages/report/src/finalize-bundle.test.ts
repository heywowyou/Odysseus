import { describe, expect, it } from 'vitest';
import type { FindingsProvenance } from '@odysseus/core';
import { buildFindingsProvenance } from '@odysseus/core';
import type { WritingOverrideFile } from '@odysseus/llm';
import {
  applyOverridesToBundle,
  findWritingInputRebuildIssue,
  projectWritingOutput,
  rebuildWritingInput,
} from './finalize-bundle.js';
import { buildRenderBundle, type RenderBundle } from './render-bundle.js';
import {
  loadSmallSiteAnalysis,
  loadSmallSiteFindings,
  loadSmallSiteManifest,
} from './test-fixtures.js';
import type { StoredAnalysis } from './types.js';

const manifest = await loadSmallSiteManifest();
const findings = await loadSmallSiteFindings();
const baseAnalysis = await loadSmallSiteAnalysis('fr');
const provenance: FindingsProvenance = buildFindingsProvenance(findings);

function analysisWithId(overrides: Partial<StoredAnalysis> = {}): StoredAnalysis {
  return { ...baseAnalysis, analysisId: 'analysis-1', ...overrides };
}

function bundle(analysis = analysisWithId()): RenderBundle {
  return buildRenderBundle({
    manifest,
    findings,
    analysis,
    findingsProvenance: provenance,
    renderInputs: {},
    rendererBuild: 'test',
  });
}

function overrideFile(
  built: RenderBundle,
  overrides: WritingOverrideFile['overrides'],
): WritingOverrideFile {
  return {
    auditId: built.lineage.auditId,
    language: built.lineage.language,
    analysisDigest: built.lineage.analysisDigest,
    findingsDigest: built.lineage.findingsProvenance.findingsDigest,
    overrides,
  };
}

/** The correction the tests apply: the first theme's business impact, rewritten
 *  to prose that says less rather than more, so no guard has anything to
 *  object to. */
function firstImpactOverride(built: RenderBundle, to: string) {
  return overrideFile(built, [
    {
      path: `themes[0](t1).businessImpact`,
      from: built.analysis.themes[0]!.businessImpact,
      to,
      reason: 'Formulation revue avec le client.',
    },
  ]);
}

const REVIEWED_IMPACT =
  'Les visiteurs concernés rencontrent des obstacles sur les éléments mesurés.';

describe('rebuildWritingInput', () => {
  /** The whole design rests on this: the input side and the output side derive
   *  their correlation keys by the same rule, so the theme-key guard sees a
   *  matched pair rather than an invented one. */
  it('correlates the rebuilt input with the projected output theme for theme', () => {
    const input = rebuildWritingInput({ manifest, findings, analysis: baseAnalysis });

    expect(input.themes.map((theme) => theme.themeKey)).toEqual(
      projectWritingOutput(baseAnalysis).themes.map((theme) => theme.themeKey),
    );
    expect(input.themes).toHaveLength(baseAnalysis.themes.length);
  });

  it('carries each theme’s own findings, so a correction is judged against the evidence its theme groups', () => {
    const input = rebuildWritingInput({ manifest, findings, analysis: baseAnalysis });

    for (const [index, theme] of input.themes.entries()) {
      const stored = baseAnalysis.themes[index]!;
      expect(theme.category).toBe(stored.category);
      // The severity floor and diversion partition can drop a finding the
      // stored theme lists, so the input's packet is a subset, never a
      // superset, and never a different theme's findings.
      for (const finding of theme.findings) {
        expect(stored.findingIds).toContain(finding.findingId);
      }
    }
  });

  it('seeds the provider phrase from the audit, so a re-render never renames the client’s provider', () => {
    const first = rebuildWritingInput({ manifest, findings, analysis: baseAnalysis });
    const second = rebuildWritingInput({ manifest, findings, analysis: baseAnalysis });

    expect(first.providerPhrase).toBe(second.providerPhrase);
    expect(first.providerPhrase).toBeDefined();
  });

  it('counts the whole audit in siteStats, not only what the model was shown', () => {
    const input = rebuildWritingInput({ manifest, findings, analysis: baseAnalysis });

    expect(input.siteStats.totalFindings).toBe(findings.length);
  });
});

describe('findWritingInputRebuildIssue', () => {
  it('passes an ordinary model-generated analysis', () => {
    expect(findWritingInputRebuildIssue(baseAnalysis)).toBeUndefined();
  });

  it('refuses a fallback analysis, whose prose no writing pass produced', () => {
    const issue = findWritingInputRebuildIssue({
      ...baseAnalysis,
      generationMode: 'static-fallback',
    });

    expect(issue).toMatch(/fallback gate/u);
  });

  /** A stored theme's category is wider than the structure pass's: the
   *  evidence-bound path groups a geo project deterministically. Rebuilding an
   *  input for it would claim the writer saw something it never did. */
  it('refuses an analysis carrying a theme category no structure pass produces', () => {
    const themes = [...baseAnalysis.themes];
    themes[0] = { ...themes[0]!, category: 'geo' };
    const issue = findWritingInputRebuildIssue({ ...baseAnalysis, themes });

    expect(issue).toMatch(/geo/u);
  });
});

describe('applyOverridesToBundle', () => {
  it('returns the same bundle with the operator’s prose in the analysis', () => {
    const built = bundle();
    const result = applyOverridesToBundle(built, firstImpactOverride(built, REVIEWED_IMPACT));

    expect(result.status).toBe('applied');
    if (result.status !== 'applied') return;
    expect(result.bundle.analysis.themes[0]!.businessImpact).toBe(REVIEWED_IMPACT);
    expect(result.bundle.manifest).toBe(built.manifest);
    expect(result.bundle.findings).toBe(built.findings);
  });

  /** Every field the deterministic layer owns has to survive an override
   *  untouched, or the correction would be changing what the audit found. */
  it('leaves ranking, effort, impact, finding ids and legal relevance exactly as generated', () => {
    const built = bundle();
    const result = applyOverridesToBundle(built, firstImpactOverride(built, REVIEWED_IMPACT));

    expect(result.status).toBe('applied');
    if (result.status !== 'applied') return;
    for (const [index, theme] of result.bundle.analysis.themes.entries()) {
      const before = built.analysis.themes[index]!;
      expect({ ...theme, businessImpact: before.businessImpact }).toEqual(before);
    }
    expect(result.bundle.analysis.quickWins).toEqual(built.analysis.quickWins);
    expect(result.bundle.analysis.overallRisk).toBe(built.analysis.overallRisk);
  });

  /** The lineage still describes the analysis the corrections were written
   *  against. That is what the upload compares to the audit's current state,
   *  and what makes a finalization a later regeneration has overtaken visible
   *  rather than silent. */
  it('leaves the lineage describing the pre-override analysis', () => {
    const built = bundle();
    const result = applyOverridesToBundle(built, firstImpactOverride(built, REVIEWED_IMPACT));

    expect(result.status).toBe('applied');
    if (result.status !== 'applied') return;
    expect(result.bundle.lineage).toEqual(built.lineage);
  });

  it('refuses a file written against an analysis that has since been regenerated', () => {
    const built = bundle();
    const file = firstImpactOverride(built, REVIEWED_IMPACT);
    const result = applyOverridesToBundle(built, {
      ...file,
      analysisDigest: `sha256:${'f'.repeat(64)}`,
    });

    expect(result).toMatchObject({ status: 'refused' });
    expect((result as { reason: string }).reason).toMatch(/regenerated/u);
  });

  it('refuses a file whose findings digest no longer matches the bundle', () => {
    const built = bundle();
    const file = firstImpactOverride(built, REVIEWED_IMPACT);
    const result = applyOverridesToBundle(built, {
      ...file,
      findingsDigest: `sha256:${'e'.repeat(64)}`,
    });

    expect(result).toMatchObject({ status: 'refused' });
    expect((result as { reason: string }).reason).toMatch(/findings have changed/u);
  });

  it('refuses a correction to a deterministic field', () => {
    const built = bundle();
    const result = applyOverridesToBundle(
      built,
      overrideFile(built, [
        {
          path: 'themes[0](t1).legalRelevance',
          from: built.analysis.themes[0]!.legalRelevance ?? '',
          to: 'Une autre formulation juridique.',
          reason: 'Essai.',
        },
      ]),
    );

    expect(result).toMatchObject({ status: 'refused' });
    expect((result as { reason: string }).reason).toMatch(/not a prose field/u);
  });
});
