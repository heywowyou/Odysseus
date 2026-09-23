import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WritingCriticIssue } from './critic-schema.js';
import { criticWritingInput, criticWrittenOutput } from './test-support/critic-fixtures.js';
import type { WritingPassOutput } from './writing-schema.js';

const switchState = vi.hoisted(() => ({ enabled: true }));

vi.mock('./constants.js', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  get WRITING_CRITIC_ENABLED() {
    return switchState.enabled;
  },
}));

vi.mock('./client.js', () => ({
  callOpenAiForWriting: vi.fn(),
  callOpenAiForCritic: vi.fn(),
  callOpenAiForFieldRepair: vi.fn(),
}));

const { callOpenAiForCritic, callOpenAiForFieldRepair, callOpenAiForWriting } =
  await import('./client.js');
const { analyzeWriting } = await import('./analyze-writing.js');
const { critiqueAndRepairWriting } = await import('./writing-critic.js');

const input = criticWritingInput();
const keys = ['t1', 't2'];

function issue(overrides: Partial<WritingCriticIssue> = {}): WritingCriticIssue {
  return {
    field: 'themes[0](t1).businessImpact',
    category: 'unsupported-inference',
    findingIds: ['f1'],
    problem: 'The impact names the booking engine, which no finding concerns.',
    ...overrides,
  };
}

const REPAIRED_IMPACT =
  'Les textes peu contrastés restent difficiles à lire sur les pages mesurées.';

/** The pre-critic output with a second t1 action, so removal and
 *  renumbering can be observed. */
function twoActionOutput(): WritingPassOutput {
  const output = criticWrittenOutput();
  output.themes[0]!.recommendedActions = [
    'Augmentez le contraste des textes et des liens concernés.',
    'Soulignez les liens placés dans un paragraphe.',
  ];
  return output;
}

async function writeFirst(output: WritingPassOutput = criticWrittenOutput()) {
  vi.mocked(callOpenAiForWriting).mockResolvedValueOnce({ output });
  return analyzeWriting(input, keys, false);
}

beforeEach(() => {
  switchState.enabled = true;
});

afterEach(() => {
  vi.mocked(callOpenAiForWriting).mockReset();
  vi.mocked(callOpenAiForCritic).mockReset();
  vi.mocked(callOpenAiForFieldRepair).mockReset();
});

describe('critiqueAndRepairWriting', () => {
  it('with the switch off returns the writer result itself and makes no call', async () => {
    switchState.enabled = false;
    const written = await writeFirst();

    const result = await critiqueAndRepairWriting(input, keys, false, written);

    expect(result).toBe(written);
    expect(result.critic).toBeUndefined();
    expect(callOpenAiForCritic).not.toHaveBeenCalled();
    expect(callOpenAiForFieldRepair).not.toHaveBeenCalled();
    expect(callOpenAiForWriting).toHaveBeenCalledTimes(1);
  });

  it('adds exactly one critic call and no repair when there is no actionable issue', async () => {
    const written = await writeFirst();
    vi.mocked(callOpenAiForCritic).mockResolvedValueOnce({ output: { issues: [] } });

    const result = await critiqueAndRepairWriting(input, keys, false, written);

    expect(result.output).toBe(written.output);
    expect(result.sanitizationWarnings).toEqual(written.sanitizationWarnings);
    expect(result.critic?.record).toEqual({
      ran: true,
      issuesRaised: 0,
      issuesAccepted: 0,
      repairApplied: false,
    });
    // Writer + critic: 3 fresh / 2 reused once the structure call is counted.
    expect(callOpenAiForWriting).toHaveBeenCalledTimes(1);
    expect(callOpenAiForCritic).toHaveBeenCalledTimes(1);
    expect(callOpenAiForFieldRepair).not.toHaveBeenCalled();
  });

  it('treats a response whose every issue is dropped as no actionable issue', async () => {
    const written = await writeFirst();
    vi.mocked(callOpenAiForCritic).mockResolvedValueOnce({
      output: { issues: [issue({ findingIds: ['f3'] }), issue({ field: 'unknown' })] },
    });

    const result = await critiqueAndRepairWriting(input, keys, false, written);

    expect(result.output).toBe(written.output);
    expect(result.critic?.record).toMatchObject({ issuesRaised: 2, issuesAccepted: 0 });
    expect(result.critic?.sidecar.dropped).toMatchObject({
      'out-of-theme-finding': 1,
      'unknown-field': 1,
    });
    expect(callOpenAiForFieldRepair).not.toHaveBeenCalled();
  });

  it('replaces only the flagged field; every other field, even in the same theme, is identical', async () => {
    const written = await writeFirst(twoActionOutput());
    vi.mocked(callOpenAiForCritic).mockResolvedValueOnce({ output: { issues: [issue()] } });
    vi.mocked(callOpenAiForFieldRepair).mockResolvedValueOnce({
      output: { 'themes[0](t1).businessImpact': REPAIRED_IMPACT },
    });

    const result = await critiqueAndRepairWriting(input, keys, false, written);

    expect(result.output.themes[0]!.businessImpact).toBe(REPAIRED_IMPACT);
    expect(result.output.themes[0]!.title).toBe(written.output.themes[0]!.title);
    expect(result.output.themes[0]!.recommendedActions).toEqual(
      written.output.themes[0]!.recommendedActions,
    );
    expect(result.output.themes[1]).toBe(written.output.themes[1]);
    expect(result.output.executiveSummary).toBe(written.output.executiveSummary);
    expect(result.output.notes).toBe(written.output.notes);
    expect(result.critic?.record).toEqual({
      ran: true,
      issuesRaised: 1,
      issuesAccepted: 1,
      repairApplied: true,
    });
    expect(result.critic?.sidecar.repairedFields).toEqual(['themes[0](t1).businessImpact']);
    expect(result.critic?.sidecar.replacements).toEqual([
      {
        field: 'themes[0](t1).businessImpact',
        before: written.output.themes[0]!.businessImpact,
        after: REPAIRED_IMPACT,
      },
    ]);
    expect(result.sanitizationWarnings).toEqual([]);

    // Writer + critic + repair: 4 fresh / 3 reused, never more.
    expect(callOpenAiForWriting).toHaveBeenCalledTimes(1);
    expect(callOpenAiForCritic).toHaveBeenCalledTimes(1);
    expect(callOpenAiForFieldRepair).toHaveBeenCalledTimes(1);
    // The repair sees every theme and the whole current report.
    const [repairInput, , repairWritten, repairIssues] =
      vi.mocked(callOpenAiForFieldRepair).mock.calls[0]!;
    expect(repairInput.themes.map((theme) => theme.themeKey)).toEqual(['t1', 't2']);
    expect(repairWritten).toBe(written.output);
    expect(repairIssues).toEqual([issue()]);
  });

  it('rewrites a flagged summary alone, with every theme left untouched', async () => {
    const written = await writeFirst();
    vi.mocked(callOpenAiForCritic).mockResolvedValueOnce({
      output: { issues: [issue({ field: 'executiveSummary', category: 'contradicts-evidence' })] },
    });
    vi.mocked(callOpenAiForFieldRepair).mockResolvedValueOnce({
      output: {
        executiveSummary: 'Les constats portent sur la lisibilité des textes et des images.',
      },
    });

    const result = await critiqueAndRepairWriting(input, keys, false, written);

    expect(result.output.executiveSummary).toBe(
      'Les constats portent sur la lisibilité des textes et des images.',
    );
    expect(result.output.notes).toBe(written.output.notes);
    expect(result.output.themes[0]).toBe(written.output.themes[0]);
    expect(result.output.themes[1]).toBe(written.output.themes[1]);
  });

  it('removes a redundant action returned empty and renumbers the rest', async () => {
    const written = await writeFirst(twoActionOutput());
    vi.mocked(callOpenAiForCritic).mockResolvedValueOnce({
      output: {
        issues: [
          issue({
            field: 'themes[0](t1).recommendedActions[0]',
            category: 'cross-theme-redundancy',
          }),
        ],
      },
    });
    vi.mocked(callOpenAiForFieldRepair).mockResolvedValueOnce({
      output: { 'themes[0](t1).recommendedActions[0]': '' },
    });

    const result = await critiqueAndRepairWriting(input, keys, false, written);

    expect(result.critic?.record.repairApplied).toBe(true);
    expect(result.output.themes[0]!.recommendedActions).toEqual([
      'Soulignez les liens placés dans un paragraphe.',
    ]);
    expect(result.critic?.sidecar.replacements).toEqual([
      {
        field: 'themes[0](t1).recommendedActions[0]',
        before: 'Augmentez le contraste des textes et des liens concernés.',
        after: null,
      },
    ]);
  });

  it('discards a repair that would leave a theme with no action', async () => {
    const written = await writeFirst();
    vi.mocked(callOpenAiForCritic).mockResolvedValueOnce({
      output: {
        issues: [
          issue({
            field: 'themes[0](t1).recommendedActions[0]',
            category: 'cross-theme-redundancy',
          }),
        ],
      },
    });
    vi.mocked(callOpenAiForFieldRepair).mockResolvedValueOnce({
      output: { 'themes[0](t1).recommendedActions[0]': '' },
    });

    const result = await critiqueAndRepairWriting(input, keys, false, written);

    expect(result.output).toBe(written.output);
    expect(result.critic?.sidecar.status).toBe('repair-discarded');
  });

  it('discards an empty replacement for a field that cannot be removed', async () => {
    const written = await writeFirst();
    vi.mocked(callOpenAiForCritic).mockResolvedValueOnce({ output: { issues: [issue()] } });
    vi.mocked(callOpenAiForFieldRepair).mockResolvedValueOnce({
      output: { 'themes[0](t1).businessImpact': ' ' },
    });

    const result = await critiqueAndRepairWriting(input, keys, false, written);

    expect(result.output).toBe(written.output);
    expect(result.critic?.sidecar.status).toBe('repair-discarded');
    expect(result.sanitizationWarnings).toEqual([
      { code: 'critic-unresolved', field: 'themes[0](t1).businessImpact' },
    ]);
  });

  it('fails open when a repair violates the writing schema', async () => {
    const written = await writeFirst();
    vi.mocked(callOpenAiForCritic).mockResolvedValueOnce({ output: { issues: [issue()] } });
    vi.mocked(callOpenAiForFieldRepair).mockResolvedValueOnce({
      output: {
        'themes[0](t1).businessImpact':
          'Première phrase. Deuxième phrase. Troisième phrase. Quatrième phrase. Cinquième phrase.',
      },
    });

    const result = await critiqueAndRepairWriting(input, keys, false, written);

    expect(result.output).toBe(written.output);
    expect(result.critic?.record.repairApplied).toBe(false);
    expect(result.critic?.sidecar.status).toBe('repair-discarded');
    expect(result.sanitizationWarnings).toEqual([
      { code: 'critic-unresolved', field: 'themes[0](t1).businessImpact' },
    ]);
  });

  it('fails open on a critic provider error', async () => {
    const written = await writeFirst();
    vi.mocked(callOpenAiForCritic).mockRejectedValueOnce(new Error('503 upstream unavailable'));

    const result = await critiqueAndRepairWriting(input, keys, false, written);

    expect(result.output).toBe(written.output);
    expect(result.sanitizationWarnings).toEqual(written.sanitizationWarnings);
    expect(result.critic?.record).toEqual({
      ran: false,
      issuesRaised: 0,
      issuesAccepted: 0,
      repairApplied: false,
    });
    expect(result.critic?.sidecar).toMatchObject({
      status: 'critic-skipped',
      reason: '503 upstream unavailable',
    });
    expect(callOpenAiForFieldRepair).not.toHaveBeenCalled();
  });

  it('fails open on an invalid critic response', async () => {
    const written = await writeFirst();
    vi.mocked(callOpenAiForCritic).mockRejectedValueOnce(
      new Error('Array must contain at most 12 element(s)'),
    );

    const result = await critiqueAndRepairWriting(input, keys, false, written);

    expect(result.output).toBe(written.output);
    expect(result.critic?.sidecar.status).toBe('critic-skipped');
    expect(callOpenAiForCritic).toHaveBeenCalledTimes(1);
    expect(callOpenAiForFieldRepair).not.toHaveBeenCalled();
  });

  it('discards a repair that fails a blocking guard and warns with field paths only', async () => {
    const written = await writeFirst();
    vi.mocked(callOpenAiForCritic).mockResolvedValueOnce({
      output: {
        issues: [
          issue(),
          issue({
            field: 'themes[0](t1).title',
            category: 'remedy-mismatch',
          }),
        ],
      },
    });
    // A French theme title written in English fails the blocking
    // language-compliance guard.
    vi.mocked(callOpenAiForFieldRepair).mockResolvedValueOnce({
      output: {
        'themes[0](t1).businessImpact': REPAIRED_IMPACT,
        'themes[0](t1).title': 'Slow page loading across the whole site',
      },
    });

    const result = await critiqueAndRepairWriting(input, keys, false, written);

    expect(result.output).toBe(written.output);
    expect(result.critic?.record.repairApplied).toBe(false);
    expect(result.critic?.sidecar.status).toBe('repair-discarded');
    expect(result.sanitizationWarnings).toEqual([
      { code: 'critic-unresolved', field: 'themes[0](t1).businessImpact' },
      { code: 'critic-unresolved', field: 'themes[0](t1).title' },
    ]);
    for (const warning of result.sanitizationWarnings) {
      expect(Object.keys(warning).sort()).toEqual(['code', 'field']);
    }
    expect(JSON.stringify(result.sanitizationWarnings)).not.toContain('booking engine');
    // No retry of a rejected repair, no second critic.
    expect(callOpenAiForFieldRepair).toHaveBeenCalledTimes(1);
    expect(callOpenAiForCritic).toHaveBeenCalledTimes(1);
  });

  it('fails open on a repair provider error', async () => {
    const written = await writeFirst();
    vi.mocked(callOpenAiForCritic).mockResolvedValueOnce({ output: { issues: [issue()] } });
    vi.mocked(callOpenAiForFieldRepair).mockRejectedValueOnce(new Error('429 Rate limit exceeded'));

    const result = await critiqueAndRepairWriting(input, keys, false, written);

    expect(result.output).toBe(written.output);
    expect(result.critic?.sidecar).toMatchObject({ status: 'repair-discarded' });
    expect(result.sanitizationWarnings).toEqual([
      { code: 'critic-unresolved', field: 'themes[0](t1).businessImpact' },
    ]);
    expect(callOpenAiForFieldRepair).toHaveBeenCalledTimes(1);
  });

  it('sanitizes a replacement and keeps its warning on the field path', async () => {
    const written = await writeFirst();
    vi.mocked(callOpenAiForCritic).mockResolvedValueOnce({
      output: {
        issues: [issue({ field: 'themes[1](t2).businessImpact', findingIds: ['f3'] })],
      },
    });
    vi.mocked(callOpenAiForFieldRepair).mockResolvedValueOnce({
      output: {
        'themes[1](t2).businessImpact':
          'Les images sans description restent muettes pour un lecteur d’écran. Le thème t2 le confirme.',
      },
    });

    const result = await critiqueAndRepairWriting(input, keys, false, written);

    expect(result.critic?.record.repairApplied).toBe(true);
    expect(result.output.themes[1]!.businessImpact).toBe(
      'Les images sans description restent muettes pour un lecteur d’écran.',
    );
    expect(result.output.themes[0]).toBe(written.output.themes[0]);
    expect(result.sanitizationWarnings).toEqual([
      { code: 'internal-reference-removed', field: 'themes[1](t2).businessImpact' },
    ]);
  });
});
