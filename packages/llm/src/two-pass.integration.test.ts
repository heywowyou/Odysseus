import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import type { AuditManifest, Finding } from '@odysseus/core';
import {
  buildFallbackSiteContext,
  buildStructureInput,
  buildWritingInput,
  computeSiteStats,
  filterFindingsForLlm,
} from './build-input.js';
import type { StructurePassOutput } from './structure-schema.js';
import type { WritingPassOutput } from './writing-schema.js';

vi.mock('./client.js', () => ({
  callMistralForStructure: vi.fn(),
  callMistralForWriting: vi.fn(),
}));

const { callMistralForStructure, callMistralForWriting } = await import('./client.js');
const { analyzeStructure } = await import('./analyze-structure.js');
const { analyzeWriting } = await import('./analyze-writing.js');
const { mergeAnalysisPasses } = await import('./merge.js');

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/** Same real fixture as build-input.test.ts: the 17 findings that
 *  survive the severity filter on the sas-fernande.fr scan whose real
 *  fr/en analyses (2026-08-02T18-28-34Z-fr.json /
 *  2026-08-02T18-30-16Z-en.json) motivated this whole two-pass split -
 *  8 quick wins in French, 7 in English, from identical input. */
function loadSasFernandeFilteredFindings(): Finding[] {
  const findingsPath = path.join(
    moduleDir,
    '../../../artifacts/sas-fernande.fr/2026-08-02T17-31-56Z/findings.json',
  );
  const findings = JSON.parse(readFileSync(findingsPath, 'utf-8')) as Finding[];
  return filterFindingsForLlm(findings);
}

function loadSasFernandeAllFindings(): Finding[] {
  const findingsPath = path.join(
    moduleDir,
    '../../../artifacts/sas-fernande.fr/2026-08-02T17-31-56Z/findings.json',
  );
  return JSON.parse(readFileSync(findingsPath, 'utf-8')) as Finding[];
}

function loadSasFernandeManifest(): AuditManifest {
  const manifestPath = path.join(
    moduleDir,
    '../../../artifacts/sas-fernande.fr/2026-08-02T17-31-56Z/manifest.json',
  );
  return JSON.parse(readFileSync(manifestPath, 'utf-8')) as AuditManifest;
}

/** Answers in the dense alias space the model is actually shown (x1..xN over
 *  the input order), not in real finding IDs - see finding-alias.ts.
 *  analyzeStructure resolves them back, so everything downstream of it in this
 *  test still works in real IDs. */
function buildFixedStructureOutput(findings: readonly Finding[]): StructurePassOutput {
  const half = Math.ceil(findings.length / 2);
  const aliases = findings.map((_, index) => `x${index + 1}`);
  const firstHalf = aliases.slice(0, half);
  const secondHalf = aliases.slice(half);

  return {
    themes: [
      {
        findingIds: firstHalf,
        category: 'accessibility',
        effort: 'low',
        impact: 'high',
        priorityRank: 1,
      },
      {
        findingIds: secondHalf,
        category: 'performance',
        effort: 'medium',
        impact: 'medium',
        priorityRank: 2,
      },
    ],
    quickWins: [firstHalf[0]!],
    overallRisk: 'high',
  };
}

function buildWritingOutputFor(language: 'fr' | 'en', themeKeys: string[]): WritingPassOutput {
  const prose =
    language === 'fr'
      ? {
          title: 'Contraste des couleurs insuffisant sur le site',
          businessImpact:
            'Vos visiteurs les plus âgés risquent de ne pas lire votre contenu correctement.',
          executiveSummary:
            'Votre site présente plusieurs problèmes qui affectent son efficacité commerciale.',
          action: 'Augmenter le contraste des couleurs sur les boutons et le texte.',
        }
      : {
          title: 'Insufficient color contrast across the site',
          businessImpact: 'Older visitors may find it difficult to browse your website easily.',
          executiveSummary:
            'Your site has several issues that affect its commercial effectiveness.',
          action: 'Increase the contrast ratio on buttons and body text.',
        };

  return {
    themes: themeKeys.map((themeKey) => ({
      themeKey,
      title: prose.title,
      businessImpact: prose.businessImpact,
      recommendedActions: [prose.action],
    })),
    executiveSummary: prose.executiveSummary,
    notes: '',
  };
}

describe('two-pass analysis produces identical structure across languages', () => {
  it('shares findingIds, priorityRank, effort, impact, category, quickWins, and overallRisk between fr and en, differing only in prose', async () => {
    const filtered = loadSasFernandeFilteredFindings();
    // Not a pinned count: this fixture is re-derivable with `normalize <dir>`
    // and its finding total moves with every dedupe change. What this test
    // needs is enough themes to compare across two languages.
    expect(filtered.length).toBeGreaterThan(1);

    const siteContext = buildFallbackSiteContext();
    const structureInput = buildStructureInput(filtered, siteContext);

    vi.mocked(callMistralForStructure)
      .mockReset()
      .mockResolvedValueOnce({
        output: buildFixedStructureOutput(filtered),
      });

    const structureResult = await analyzeStructure(
      structureInput,
      filtered,
      false,
      loadSasFernandeManifest(),
    );
    const themeKeys = structureResult.themes.map((t) => t.themeKey);

    const structureDoc = {
      themes: structureResult.themes,
      quickWins: structureResult.quickWins,
      overallRisk: structureResult.overallRisk,
    };
    const siteStats = computeSiteStats(loadSasFernandeAllFindings(), loadSasFernandeManifest());

    vi.mocked(callMistralForWriting)
      .mockReset()
      .mockResolvedValueOnce({
        output: buildWritingOutputFor('fr', themeKeys),
      });
    const frWritingInput = buildWritingInput(
      structureResult.themes,
      filtered,
      siteContext,
      'fr',
      siteStats,
      null,
    );
    const frWriting = await analyzeWriting(frWritingInput, themeKeys, false);
    const mergedFr = mergeAnalysisPasses(structureDoc, frWriting.output, filtered, 'fr');

    vi.mocked(callMistralForWriting)
      .mockReset()
      .mockResolvedValueOnce({
        output: buildWritingOutputFor('en', themeKeys),
      });
    const enWritingInput = buildWritingInput(
      structureResult.themes,
      filtered,
      siteContext,
      'en',
      siteStats,
      null,
    );
    const enWriting = await analyzeWriting(enWritingInput, themeKeys, false);
    const mergedEn = mergeAnalysisPasses(structureDoc, enWriting.output, filtered, 'en');

    const structuralProjection = (output: typeof mergedFr) =>
      output.themes.map((t) => ({
        findingIds: t.findingIds,
        priorityRank: t.priorityRank,
        effort: t.effort,
        impact: t.impact,
        category: t.category,
      }));

    expect(structuralProjection(mergedFr)).toEqual(structuralProjection(mergedEn));
    expect(mergedFr.quickWins).toEqual(mergedEn.quickWins);
    expect(mergedFr.overallRisk).toBe(mergedEn.overallRisk);

    // Only prose differs.
    expect(mergedFr.themes[0]!.title).not.toBe(mergedEn.themes[0]!.title);
    expect(mergedFr.executiveSummary).not.toBe(mergedEn.executiveSummary);
  });
});
