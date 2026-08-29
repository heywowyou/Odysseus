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
  siteStats: { pagesScanned: 1, totalFindings: 1, critical: 0, serious: 1, moderate: 0, minor: 0 },
  dominantPerformanceMetric: null,
};

function buildCleanFrenchOutput(): WritingPassOutput {
  return {
    themes: [
      {
        themeKey: 't1',
        title: 'Contraste des couleurs insuffisant',
        businessImpact:
          'Vos visiteurs les plus âgés risquent de ne pas lire votre contenu correctement.',
        recommendedActions: ['Augmenter le contraste des couleurs sur les boutons et le texte.'],
      },
    ],
    executiveSummary:
      'Votre site présente plusieurs problèmes qui affectent son efficacité commerciale.',
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

function buildDigitInSummaryOutput(): WritingPassOutput {
  // report-feedback-la-corniche.md item 0.4: the writing pass used to be
  // asked to cite exact counts, which drifted from the report's own
  // bound counts once render-time finding resolution ran after this pass
  // already had.
  const output = buildCleanFrenchOutput();
  output.executiveSummary =
    "L'audit a identifié 66 problèmes prioritaires sur un total de 94 constats.";
  return output;
}

function buildNonCanonicalSeverityWordOutput(): WritingPassOutput {
  // Verbatim from the real observed failure, artifacts/haaitza.com/
  // 2026-08-08T11-07-43Z/analyses/2026-08-08T11-23-48Z-fr.json, except for
  // the word this asserts against: report-feedback-haaitza.md B3 found the
  // canonical label is "Sérieux" (docs/report-design-system.md), not
  // "majeur" - the guard's banned word flipped accordingly.
  const output = buildCleanFrenchOutput();
  output.executiveSummary =
    'Nous avons identifié 130 problèmes, dont 8 critiques, 26 majeurs et 24 modérés.';
  return output;
}

function buildWcag21CitationOutput(): WritingPassOutput {
  // Same fault class as the first live run's legalRelevance fields
  // (sas-fernande.fr, 2026-08-02): a 2.1 citation next to a report whose
  // methodology says 2.2. Here in a model-written field.
  const output = buildCleanFrenchOutput();
  output.themes[0]!.recommendedActions = [
    'Rendez le contraste conforme au critère WCAG 2.1 1.4.3.',
  ];
  return output;
}

function buildUnhedgedBusinessClaimOutput(): WritingPassOutput {
  // Verbatim from the real observed failure, artifacts/sas-fernande.fr/
  // 2026-08-02T17-31-56Z/analyses/2026-08-02T18-28-34Z-fr.json.
  const output = buildCleanFrenchOutput();
  output.themes[0]!.businessImpact =
    "Le visiteur abandonne. C'est une perte directe de demandes commerciales sur la page la plus rentable du site.";
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

  it('retries once when the first response uses a non-canonical severity word, then succeeds', async () => {
    vi.mocked(callMistralForWriting)
      .mockReset()
      .mockResolvedValueOnce({ output: buildNonCanonicalSeverityWordOutput() })
      .mockResolvedValueOnce({ output: buildCleanFrenchOutput() });

    const result = await analyzeWriting(input, ['t1'], false);

    expect(result.output.executiveSummary).not.toMatch(/majeur/i);
    expect(callMistralForWriting).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries when every attempt uses a non-canonical severity word', async () => {
    vi.mocked(callMistralForWriting)
      .mockReset()
      .mockResolvedValue({ output: buildNonCanonicalSeverityWordOutput() });

    await expect(analyzeWriting(input, ['t1'], false)).rejects.toThrow(/exhausted \d+ attempts/);
    expect(callMistralForWriting).toHaveBeenCalledTimes(MAX_RETRIES + 1);
  });

  it('retries once when the first response cites WCAG 2.1, then succeeds', async () => {
    vi.mocked(callMistralForWriting)
      .mockReset()
      .mockResolvedValueOnce({ output: buildWcag21CitationOutput() })
      .mockResolvedValueOnce({ output: buildCleanFrenchOutput() });

    const result = await analyzeWriting(input, ['t1'], false);

    expect(result.output.themes[0]!.recommendedActions[0]).not.toMatch(/2\.1/);
    expect(callMistralForWriting).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries when every attempt cites WCAG 2.1', async () => {
    vi.mocked(callMistralForWriting)
      .mockReset()
      .mockResolvedValue({ output: buildWcag21CitationOutput() });

    await expect(analyzeWriting(input, ['t1'], false)).rejects.toThrow(/exhausted \d+ attempts/);
    expect(callMistralForWriting).toHaveBeenCalledTimes(MAX_RETRIES + 1);
  });

  it('retries once when the first response asserts an unhedged business claim, then succeeds', async () => {
    vi.mocked(callMistralForWriting)
      .mockReset()
      .mockResolvedValueOnce({ output: buildUnhedgedBusinessClaimOutput() })
      .mockResolvedValueOnce({ output: buildCleanFrenchOutput() });

    const result = await analyzeWriting(input, ['t1'], false);

    expect(result.output.themes[0]!.businessImpact).not.toMatch(/rentable/i);
    expect(callMistralForWriting).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries when every attempt asserts an unhedged business claim', async () => {
    vi.mocked(callMistralForWriting)
      .mockReset()
      .mockResolvedValue({ output: buildUnhedgedBusinessClaimOutput() });

    await expect(analyzeWriting(input, ['t1'], false)).rejects.toThrow(/exhausted \d+ attempts/);
    expect(callMistralForWriting).toHaveBeenCalledTimes(MAX_RETRIES + 1);
  });

  it('retries once when executiveSummary contains a digit, then succeeds', async () => {
    vi.mocked(callMistralForWriting)
      .mockReset()
      .mockResolvedValueOnce({ output: buildDigitInSummaryOutput() })
      .mockResolvedValueOnce({ output: buildCleanFrenchOutput() });

    const result = await analyzeWriting(input, ['t1'], false);

    expect(result.output.executiveSummary).not.toMatch(/\d/);
    expect(callMistralForWriting).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries when every attempt puts a digit in executiveSummary', async () => {
    vi.mocked(callMistralForWriting)
      .mockReset()
      .mockResolvedValue({ output: buildDigitInSummaryOutput() });

    await expect(analyzeWriting(input, ['t1'], false)).rejects.toThrow(/exhausted \d+ attempts/);
    expect(callMistralForWriting).toHaveBeenCalledTimes(MAX_RETRIES + 1);
  });
});
