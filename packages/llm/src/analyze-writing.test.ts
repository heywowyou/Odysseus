import { describe, expect, it, vi } from 'vitest';
import { MISTRAL_MODEL, MISTRAL_TEMPERATURE, MAX_RETRIES } from './constants.js';
import type { WritingInput, WritingPassOutput } from './writing-schema.js';

vi.mock('./client.js', () => ({
  callMistralForWriting: vi.fn(),
}));

const { callMistralForWriting } = await import('./client.js');
const { analyzeWriting } = await import('./analyze-writing.js');

const input: WritingInput = {
  language: 'fr',
  siteContext: {
    businessType: 'e-commerce',
    primaryGoal: 'sales',
    languagesServed: ['fr'],
    targetMarkets: ['fr'],
  },
  themes: [
    {
      themeKey: 't1',
      category: 'accessibility',
      findings: [
        {
          findingId: 'f1',
          source: 'axe',
          ruleId: 'color-contrast',
          category: 'accessibility',
          severity: 'serious',
          wcagCriteria: ['1.4.3'],
          title: 'Insufficient color contrast',
          description: 'Text does not meet minimum contrast ratio',
          pageUrls: ['https://example.com/'],
          occurrences: 1,
        },
      ],
    },
  ],
};

function buildCleanFrenchOutput(): WritingPassOutput {
  return {
    themes: [
      {
        themeKey: 't1',
        title: 'Contraste des couleurs insuffisant',
        businessImpact: 'Vos visiteurs les plus âgés risquent de ne pas lire votre contenu correctement.',
        legalRelevance: 'Concerne le critère WCAG 2.2 1.4.3 relatif au contraste des couleurs.',
        recommendedActions: ['Augmenter le contraste des couleurs sur les boutons et le texte.'],
      },
    ],
    executiveSummary: 'Votre site présente plusieurs problèmes qui affectent son efficacité commerciale.',
    notes: '',
  };
}

function buildFailingEnglishTitleOutput(): WritingPassOutput {
  // Verbatim from the real observed failure, artifacts/sas-fernande.fr/
  // 2026-08-02T17-31-56Z/analyses/2026-08-02T18-28-34Z-fr.json.
  const output = buildCleanFrenchOutput();
  output.themes[0]!.title = 'Slow page loading across the whole site';
  return output;
}

function buildMismatchedKeyOutput(): WritingPassOutput {
  const output = buildCleanFrenchOutput();
  output.themes[0]!.themeKey = 'wrong-key';
  return output;
}

describe('analyzeWriting', () => {
  it('returns the output on a clean pass', async () => {
    vi.mocked(callMistralForWriting).mockReset().mockResolvedValueOnce({
      output: buildCleanFrenchOutput(),
    });

    const result = await analyzeWriting(input, ['t1'], false);

    expect(result.output.themes).toHaveLength(1);
    expect(result.model).toBe(MISTRAL_MODEL);
    expect(result.temperature).toBe(MISTRAL_TEMPERATURE);
    expect(callMistralForWriting).toHaveBeenCalledTimes(1);
  });

  it('retries once on a theme-key mismatch, then succeeds', async () => {
    vi.mocked(callMistralForWriting)
      .mockReset()
      .mockResolvedValueOnce({ output: buildMismatchedKeyOutput() })
      .mockResolvedValueOnce({ output: buildCleanFrenchOutput() });

    const result = await analyzeWriting(input, ['t1'], false);

    expect(result.output.themes[0]!.themeKey).toBe('t1');
    expect(callMistralForWriting).toHaveBeenCalledTimes(2);
  });

  it('retries once when the first response fails the language-compliance guard, then succeeds', async () => {
    vi.mocked(callMistralForWriting)
      .mockReset()
      .mockResolvedValueOnce({ output: buildFailingEnglishTitleOutput() })
      .mockResolvedValueOnce({ output: buildCleanFrenchOutput() });

    const result = await analyzeWriting(input, ['t1'], false);

    expect(result.output.themes[0]!.title).toBe('Contraste des couleurs insuffisant');
    expect(callMistralForWriting).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries when every attempt fails language compliance', async () => {
    vi.mocked(callMistralForWriting)
      .mockReset()
      .mockResolvedValue({ output: buildFailingEnglishTitleOutput() });

    await expect(analyzeWriting(input, ['t1'], false)).rejects.toThrow(/exhausted \d+ attempts/);
    expect(callMistralForWriting).toHaveBeenCalledTimes(MAX_RETRIES + 1);
  });
});
