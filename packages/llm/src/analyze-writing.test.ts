import { afterEach, describe, expect, it, vi } from 'vitest';
import { OPENAI_MODEL, WRITING_OPENAI_TEMPERATURE, MAX_RETRIES } from './constants.js';
import type { WritingInput, WritingPassOutput } from './writing-schema.js';
import {
  configureLlmTelemetrySink,
  NullLlmTelemetrySink,
  RecordingLlmTelemetrySink,
} from './telemetry/llm-telemetry.js';

vi.mock('./client.js', () => ({
  callOpenAiForWriting: vi.fn(),
}));

const { callOpenAiForWriting } = await import('./client.js');
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
  transactionalFlowStatus: 'unknown',
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
  // canonical label is "Sérieux" (docs/report/report-design-system.md), not
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

function buildViolatingThemeTitleOutput(): WritingPassOutput {
  // The title is model-written prose like every other field: the same
  // guard table that rejects a sanction claim in businessImpact rejects
  // it in the title the report renders as a heading.
  const output = buildCleanFrenchOutput();
  output.themes[0]!.title = 'Contraste : des risques juridiques évitables';
  return output;
}

describe('analyzeWriting', () => {
  const sink = new RecordingLlmTelemetrySink();

  afterEach(() => {
    sink.events.length = 0;
    configureLlmTelemetrySink(new NullLlmTelemetrySink());
  });

  it('issue #254: reports schemaValidFirstAttempt telemetry, including token usage, for a clean pass', async () => {
    configureLlmTelemetrySink(sink);
    vi.mocked(callOpenAiForWriting)
      .mockReset()
      .mockResolvedValueOnce({
        output: buildCleanFrenchOutput(),
        usage: { promptTokens: 900, completionTokens: 300, totalTokens: 1200 },
      });

    await analyzeWriting(input, ['t1'], false);

    expect(sink.events).toEqual([
      expect.objectContaining({
        kind: 'call-succeeded',
        pass: 'writing',
        model: OPENAI_MODEL,
        language: 'fr',
        attemptCount: 1,
        schemaValidFirstAttempt: true,
        promptTokens: 900,
        completionTokens: 300,
        totalTokens: 1200,
      }),
    ]);
  });

  it('issue #254: reports a call-exhausted event with no prompt/output content when every attempt fails', async () => {
    configureLlmTelemetrySink(sink);
    vi.mocked(callOpenAiForWriting)
      .mockReset()
      .mockResolvedValue({ output: buildFailingEnglishTitleOutput() });

    await expect(analyzeWriting(input, ['t1'], false)).rejects.toThrow();

    expect(sink.events).toEqual([
      expect.objectContaining({
        kind: 'call-exhausted',
        pass: 'writing',
        language: 'fr',
        attemptCount: MAX_RETRIES + 1,
      }),
    ]);
    const allowedKeys = new Set([
      'kind',
      'pass',
      'model',
      'language',
      'attemptCount',
      'durationMs',
      'schemaValidFirstAttempt',
      'promptTokens',
      'completionTokens',
      'totalTokens',
      'reasoningTokens',
    ]);
    for (const event of sink.events) {
      for (const key of Object.keys(event)) {
        expect(allowedKeys.has(key)).toBe(true);
      }
    }
  });

  it('returns the output on a clean pass', async () => {
    vi.mocked(callOpenAiForWriting).mockReset().mockResolvedValueOnce({
      output: buildCleanFrenchOutput(),
    });

    const result = await analyzeWriting(input, ['t1'], false);

    expect(result.output.themes).toHaveLength(1);
    expect(result.model).toBe(OPENAI_MODEL);
    expect(result.temperature).toBe(WRITING_OPENAI_TEMPERATURE);
    expect(callOpenAiForWriting).toHaveBeenCalledTimes(1);
  });

  it('retries once on a theme-key mismatch, then succeeds', async () => {
    vi.mocked(callOpenAiForWriting)
      .mockReset()
      .mockResolvedValueOnce({ output: buildMismatchedKeyOutput() })
      .mockResolvedValueOnce({ output: buildCleanFrenchOutput() });

    const result = await analyzeWriting(input, ['t1'], false);

    expect(result.output.themes[0]!.themeKey).toBe('t1');
    expect(callOpenAiForWriting).toHaveBeenCalledTimes(2);
  });

  it('retries once when the first response fails the language-compliance guard, then succeeds', async () => {
    vi.mocked(callOpenAiForWriting)
      .mockReset()
      .mockResolvedValueOnce({ output: buildFailingEnglishTitleOutput() })
      .mockResolvedValueOnce({ output: buildCleanFrenchOutput() });

    const result = await analyzeWriting(input, ['t1'], false);

    expect(result.output.themes[0]!.title).toBe('Contraste des couleurs insuffisant');
    expect(callOpenAiForWriting).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries when every attempt fails language compliance', async () => {
    vi.mocked(callOpenAiForWriting)
      .mockReset()
      .mockResolvedValue({ output: buildFailingEnglishTitleOutput() });

    await expect(analyzeWriting(input, ['t1'], false)).rejects.toThrow(/exhausted \d+ attempts/);
    expect(callOpenAiForWriting).toHaveBeenCalledTimes(MAX_RETRIES + 1);
  });

  it('retries once when the first response uses a non-canonical severity word, then succeeds', async () => {
    vi.mocked(callOpenAiForWriting)
      .mockReset()
      .mockResolvedValueOnce({ output: buildNonCanonicalSeverityWordOutput() })
      .mockResolvedValueOnce({ output: buildCleanFrenchOutput() });

    const result = await analyzeWriting(input, ['t1'], false);

    expect(result.output.executiveSummary).not.toMatch(/majeur/i);
    expect(callOpenAiForWriting).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries when every attempt uses a non-canonical severity word', async () => {
    vi.mocked(callOpenAiForWriting)
      .mockReset()
      .mockResolvedValue({ output: buildNonCanonicalSeverityWordOutput() });

    await expect(analyzeWriting(input, ['t1'], false)).rejects.toThrow(/exhausted \d+ attempts/);
    expect(callOpenAiForWriting).toHaveBeenCalledTimes(MAX_RETRIES + 1);
  });

  // Issue #309: both new guards reject and retry like every other guard.
  it('retries when a response bolts the provider onto an action or uses French jargon', async () => {
    const trailing = buildCleanFrenchOutput();
    trailing.themes[0]!.recommendedActions = [
      'Le contraste des boutons doit être relevé, et votre prestataire technique peut ajuster les couleurs.',
    ];
    const jargon = buildCleanFrenchOutput();
    jargon.themes[0]!.businessImpact =
      'Les canonicals renvoient les visiteurs vers une autre page.';
    vi.mocked(callOpenAiForWriting)
      .mockReset()
      .mockResolvedValueOnce({ output: trailing })
      .mockResolvedValueOnce({ output: jargon })
      .mockResolvedValueOnce({ output: buildCleanFrenchOutput() });

    await analyzeWriting(input, ['t1'], false);

    expect(callOpenAiForWriting).toHaveBeenCalledTimes(3);
    const retryPrompts = vi.mocked(callOpenAiForWriting).mock.calls.map((call) => call[2]);
    expect(retryPrompts[1]).toContain('provider named in the wrong place');
    expect(retryPrompts[2]).toContain('prose register defect');
  });

  it('retries once when the first response cites WCAG 2.1, then succeeds', async () => {
    vi.mocked(callOpenAiForWriting)
      .mockReset()
      .mockResolvedValueOnce({ output: buildWcag21CitationOutput() })
      .mockResolvedValueOnce({ output: buildCleanFrenchOutput() });

    const result = await analyzeWriting(input, ['t1'], false);

    expect(result.output.themes[0]!.recommendedActions[0]).not.toMatch(/2\.1/);
    expect(callOpenAiForWriting).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries when every attempt cites WCAG 2.1', async () => {
    vi.mocked(callOpenAiForWriting)
      .mockReset()
      .mockResolvedValue({ output: buildWcag21CitationOutput() });

    await expect(analyzeWriting(input, ['t1'], false)).rejects.toThrow(/exhausted \d+ attempts/);
    expect(callOpenAiForWriting).toHaveBeenCalledTimes(MAX_RETRIES + 1);
  });

  it('retries once when the first response asserts an unhedged business claim, then succeeds', async () => {
    vi.mocked(callOpenAiForWriting)
      .mockReset()
      .mockResolvedValueOnce({ output: buildUnhedgedBusinessClaimOutput() })
      .mockResolvedValueOnce({ output: buildCleanFrenchOutput() });

    const result = await analyzeWriting(input, ['t1'], false);

    expect(result.output.themes[0]!.businessImpact).not.toMatch(/rentable/i);
    expect(callOpenAiForWriting).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries when every attempt asserts an unhedged business claim', async () => {
    vi.mocked(callOpenAiForWriting)
      .mockReset()
      .mockResolvedValue({ output: buildUnhedgedBusinessClaimOutput() });

    await expect(analyzeWriting(input, ['t1'], false)).rejects.toThrow(/exhausted \d+ attempts/);
    expect(callOpenAiForWriting).toHaveBeenCalledTimes(MAX_RETRIES + 1);
  });

  it('retries once when executiveSummary contains a digit, then succeeds', async () => {
    vi.mocked(callOpenAiForWriting)
      .mockReset()
      .mockResolvedValueOnce({ output: buildDigitInSummaryOutput() })
      .mockResolvedValueOnce({ output: buildCleanFrenchOutput() });

    const result = await analyzeWriting(input, ['t1'], false);

    expect(result.output.executiveSummary).not.toMatch(/\d/);
    expect(callOpenAiForWriting).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries when every attempt puts a digit in executiveSummary', async () => {
    vi.mocked(callOpenAiForWriting)
      .mockReset()
      .mockResolvedValue({ output: buildDigitInSummaryOutput() });

    await expect(analyzeWriting(input, ['t1'], false)).rejects.toThrow(/exhausted \d+ attempts/);
    expect(callOpenAiForWriting).toHaveBeenCalledTimes(MAX_RETRIES + 1);
  });

  it('retries once when the first response puts a legal claim in a theme title, then succeeds', async () => {
    vi.mocked(callOpenAiForWriting)
      .mockReset()
      .mockResolvedValueOnce({ output: buildViolatingThemeTitleOutput() })
      .mockResolvedValueOnce({ output: buildCleanFrenchOutput() });

    const result = await analyzeWriting(input, ['t1'], false);

    expect(result.output.themes[0]!.title).toBe('Contraste des couleurs insuffisant');
    expect(callOpenAiForWriting).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries when every attempt puts a legal claim in a theme title', async () => {
    vi.mocked(callOpenAiForWriting)
      .mockReset()
      .mockResolvedValue({ output: buildViolatingThemeTitleOutput() });

    await expect(analyzeWriting(input, ['t1'], false)).rejects.toThrow(/exhausted \d+ attempts/);
    expect(callOpenAiForWriting).toHaveBeenCalledTimes(MAX_RETRIES + 1);
  });

  // plan 028, lever L: audit-rehearsal notes recorded reports
  // contradicting their own finding counts in prose.
  it('retries once when a recommended action states an invented finding count, then succeeds', async () => {
    const violating = buildCleanFrenchOutput();
    violating.themes[0]!.recommendedActions = [
      'Ce thème regroupe 12 constats modérés à corriger en priorité.',
    ];
    vi.mocked(callOpenAiForWriting)
      .mockReset()
      .mockResolvedValueOnce({ output: violating })
      .mockResolvedValueOnce({ output: buildCleanFrenchOutput() });

    const result = await analyzeWriting(input, ['t1'], false);

    expect(result.output.themes[0]!.recommendedActions[0]).not.toMatch(/\d/);
    expect(callOpenAiForWriting).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries when every attempt states an invented finding count', async () => {
    const violating = buildCleanFrenchOutput();
    violating.themes[0]!.recommendedActions = [
      'Ce thème regroupe 12 constats modérés à corriger en priorité.',
    ];
    vi.mocked(callOpenAiForWriting).mockReset().mockResolvedValue({ output: violating });

    await expect(analyzeWriting(input, ['t1'], false)).rejects.toThrow(/exhausted \d+ attempts/);
    expect(callOpenAiForWriting).toHaveBeenCalledTimes(MAX_RETRIES + 1);
  });

  // plan 028, lever J: audit-rehearsal notes recorded "la priorité 1
  // ci-dessus" pointing at content that rendered below it.
  it('retries once when businessImpact references another theme by page position, then succeeds', async () => {
    const violating = buildCleanFrenchOutput();
    violating.themes[0]!.businessImpact =
      'Comme indiqué ci-dessus, ce thème doit être corrigé en priorité pour vos visiteurs.';
    vi.mocked(callOpenAiForWriting)
      .mockReset()
      .mockResolvedValueOnce({ output: violating })
      .mockResolvedValueOnce({ output: buildCleanFrenchOutput() });

    const result = await analyzeWriting(input, ['t1'], false);

    expect(result.output.themes[0]!.businessImpact).not.toContain('ci-dessus');
    expect(callOpenAiForWriting).toHaveBeenCalledTimes(2);
  });

  it('throws after exhausting retries when every attempt uses a positional reference', async () => {
    const violating = buildCleanFrenchOutput();
    violating.themes[0]!.businessImpact =
      'Comme indiqué ci-dessus, ce thème doit être corrigé en priorité pour vos visiteurs.';
    vi.mocked(callOpenAiForWriting).mockReset().mockResolvedValue({ output: violating });

    await expect(analyzeWriting(input, ['t1'], false)).rejects.toThrow(/exhausted \d+ attempts/);
    expect(callOpenAiForWriting).toHaveBeenCalledTimes(MAX_RETRIES + 1);
  });
});

function buildGravesSummaryOutput(): WritingPassOutput {
  // The observed failure from issue #21: the French writing pass for
  // lacoorniche.com (2026-09-01) deterministically wrote "graves" in
  // executiveSummary; eight consecutive attempts across three runs were
  // all rejected because the rejection reason never reached the model.
  const output = buildCleanFrenchOutput();
  output.executiveSummary =
    'Votre site présente des défauts graves qui pénalisent son efficacité commerciale.';
  return output;
}

describe('analyzeWriting retry feedback (issue #21)', () => {
  it('sends no rejection feedback on the first attempt', async () => {
    vi.mocked(callOpenAiForWriting).mockReset().mockResolvedValueOnce({
      output: buildCleanFrenchOutput(),
    });

    await analyzeWriting(input, ['t1'], false);

    expect(vi.mocked(callOpenAiForWriting).mock.calls[0]![2]).toBeUndefined();
  });

  it('feeds the severity guard rejection into the next attempt, then succeeds', async () => {
    vi.mocked(callOpenAiForWriting)
      .mockReset()
      .mockResolvedValueOnce({ output: buildGravesSummaryOutput() })
      .mockResolvedValueOnce({ output: buildCleanFrenchOutput() });

    const result = await analyzeWriting(input, ['t1'], false);

    expect(result.output.executiveSummary).not.toMatch(/grave/i);
    const calls = vi.mocked(callOpenAiForWriting).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[1]![2]).toContain('rejected by the automated guard');
    expect(calls[1]![2]).toContain('"graves"');
    expect(calls[1]![2]).toContain('fixes exactly this problem');
  });

  it('carries the latest failure reason across a thrown attempt', async () => {
    vi.mocked(callOpenAiForWriting)
      .mockReset()
      .mockResolvedValueOnce({ output: buildGravesSummaryOutput() })
      .mockRejectedValueOnce(new Error('connection reset by peer'))
      .mockResolvedValueOnce({ output: buildCleanFrenchOutput() });

    const result = await analyzeWriting(input, ['t1'], false);

    expect(result.model).toBe(OPENAI_MODEL);
    const calls = vi.mocked(callOpenAiForWriting).mock.calls;
    expect(calls).toHaveLength(3);
    // The feedback always names the most recent failure, not the first.
    expect(calls[1]![2]).toContain('"graves"');
    expect(calls[2]![2]).toContain('connection reset by peer');
    expect(calls[2]![2]).not.toContain('"graves"');
  });

  it('feeds a legal-consequence rejection into the next attempt', async () => {
    vi.mocked(callOpenAiForWriting)
      .mockReset()
      .mockResolvedValueOnce({ output: buildViolatingThemeTitleOutput() })
      .mockResolvedValueOnce({ output: buildCleanFrenchOutput() });

    await analyzeWriting(input, ['t1'], false);

    const calls = vi.mocked(callOpenAiForWriting).mock.calls;
    expect(calls[1]![2]).toContain('rejected by the automated guard');
    expect(calls[1]![2]).toContain('risques juridiques');
  });
});
