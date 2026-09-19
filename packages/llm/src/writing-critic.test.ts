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
}));

const { callOpenAiForCritic, callOpenAiForWriting } = await import('./client.js');
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

/** A repair response for only the t1 theme, as the schema built from the
 *  repair's theme subset would return it. */
function repairedT1(overrides: Partial<WritingPassOutput['themes'][number]> = {}) {
  return {
    output: {
      themes: [
        {
          themeKey: 't1',
          title: 'Contrastes et lisibilité',
          businessImpact:
            'Les textes peu contrastés restent difficiles à lire sur les pages mesurées.',
          recommendedActions: ['Augmentez le contraste des textes et soulignez les liens.'],
          ...overrides,
        },
      ],
      executiveSummary: 'Résumé réécrit qui ne doit pas être repris.',
      notes: 'Notes réécrites qui ne doivent pas être reprises.',
    },
  };
}

async function writeFirst() {
  vi.mocked(callOpenAiForWriting).mockResolvedValueOnce({ output: criticWrittenOutput() });
  return analyzeWriting(input, keys, false);
}

beforeEach(() => {
  switchState.enabled = true;
});

afterEach(() => {
  vi.mocked(callOpenAiForWriting).mockReset();
  vi.mocked(callOpenAiForCritic).mockReset();
});

describe('critiqueAndRepairWriting', () => {
  it('with the switch off returns the writer result itself and makes no call', async () => {
    switchState.enabled = false;
    const written = await writeFirst();

    const result = await critiqueAndRepairWriting(input, keys, false, written);

    expect(result).toBe(written);
    expect(result.critic).toBeUndefined();
    expect(callOpenAiForCritic).not.toHaveBeenCalled();
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
    expect(callOpenAiForWriting).toHaveBeenCalledTimes(1);
  });

  it('applies a targeted repair: the flagged theme is replaced, every other field is identical', async () => {
    const written = await writeFirst();
    vi.mocked(callOpenAiForCritic).mockResolvedValueOnce({ output: { issues: [issue()] } });
    vi.mocked(callOpenAiForWriting).mockResolvedValueOnce(repairedT1());

    const result = await critiqueAndRepairWriting(input, keys, false, written);

    expect(result.output.themes[0]!.businessImpact).toBe(
      'Les textes peu contrastés restent difficiles à lire sur les pages mesurées.',
    );
    // Byte identity for everything the critic did not flag.
    expect(result.output.themes[1]).toBe(written.output.themes[1]);
    expect(JSON.stringify(result.output.themes[1])).toBe(JSON.stringify(written.output.themes[1]));
    expect(result.output.executiveSummary).toBe(written.output.executiveSummary);
    expect(result.output.notes).toBe(written.output.notes);
    expect(result.critic?.record).toEqual({
      ran: true,
      issuesRaised: 1,
      issuesAccepted: 1,
      repairApplied: true,
    });
    expect(result.critic?.sidecar.repairedFields).toEqual([
      'themes[0](t1).title',
      'themes[0](t1).businessImpact',
      'themes[0](t1).recommendedActions[0]',
    ]);
    expect(result.sanitizationWarnings).toEqual([]);

    // Writer + critic + repair: 4 fresh / 3 reused, never more.
    expect(callOpenAiForWriting).toHaveBeenCalledTimes(2);
    expect(callOpenAiForCritic).toHaveBeenCalledTimes(1);
    const [repairInput, , feedback] = vi.mocked(callOpenAiForWriting).mock.calls[1]!;
    expect(repairInput.themes.map((theme) => theme.themeKey)).toEqual(['t1']);
    expect(feedback).toContain('themes[0](t1).businessImpact');
    expect(feedback).toContain('booking engine');
  });

  it('replaces the executive summary only when it was flagged', async () => {
    const written = await writeFirst();
    vi.mocked(callOpenAiForCritic).mockResolvedValueOnce({
      output: { issues: [issue({ field: 'executiveSummary', category: 'contradicts-evidence' })] },
    });
    vi.mocked(callOpenAiForWriting).mockResolvedValueOnce(repairedT1());

    const result = await critiqueAndRepairWriting(input, keys, false, written);

    expect(result.output.executiveSummary).toBe('Résumé réécrit qui ne doit pas être repris.');
    expect(result.output.notes).toBe(written.output.notes);
    expect(result.output.themes[0]).toBe(written.output.themes[0]);
    expect(result.output.themes[1]).toBe(written.output.themes[1]);
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
    expect(callOpenAiForWriting).toHaveBeenCalledTimes(1);
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
    expect(callOpenAiForWriting).toHaveBeenCalledTimes(1);
  });

  it('discards a repair that fails a blocking guard and warns with field paths only', async () => {
    const written = await writeFirst();
    vi.mocked(callOpenAiForCritic).mockResolvedValueOnce({
      output: {
        issues: [
          issue(),
          issue({
            field: 'themes[0](t1).recommendedActions[0]',
            category: 'remedy-mismatch',
          }),
        ],
      },
    });
    // A French theme title written in English fails the blocking
    // language-compliance guard.
    vi.mocked(callOpenAiForWriting).mockResolvedValueOnce(
      repairedT1({ title: 'Slow page loading across the whole site' }),
    );

    const result = await critiqueAndRepairWriting(input, keys, false, written);

    expect(result.output).toBe(written.output);
    expect(result.critic?.record.repairApplied).toBe(false);
    expect(result.critic?.sidecar.status).toBe('repair-discarded');
    expect(result.sanitizationWarnings).toEqual([
      { code: 'critic-unresolved', field: 'themes[0](t1).businessImpact' },
      { code: 'critic-unresolved', field: 'themes[0](t1).recommendedActions[0]' },
    ]);
    for (const warning of result.sanitizationWarnings) {
      expect(Object.keys(warning).sort()).toEqual(['code', 'field']);
    }
    expect(JSON.stringify(result.sanitizationWarnings)).not.toContain('booking engine');
    // No retry of a rejected repair, no second critic.
    expect(callOpenAiForWriting).toHaveBeenCalledTimes(2);
    expect(callOpenAiForCritic).toHaveBeenCalledTimes(1);
  });

  it('fails open on a repair provider error', async () => {
    const written = await writeFirst();
    vi.mocked(callOpenAiForCritic).mockResolvedValueOnce({ output: { issues: [issue()] } });
    vi.mocked(callOpenAiForWriting).mockRejectedValueOnce(new Error('429 Rate limit exceeded'));

    const result = await critiqueAndRepairWriting(input, keys, false, written);

    expect(result.output).toBe(written.output);
    expect(result.critic?.sidecar).toMatchObject({ status: 'repair-discarded' });
    expect(result.sanitizationWarnings).toEqual([
      { code: 'critic-unresolved', field: 'themes[0](t1).businessImpact' },
    ]);
    expect(callOpenAiForWriting).toHaveBeenCalledTimes(2);
  });

  it('keeps the repair sanitation warnings on the full output theme order', async () => {
    const written = await writeFirst();
    vi.mocked(callOpenAiForCritic).mockResolvedValueOnce({
      output: {
        issues: [issue({ field: 'themes[1](t2).businessImpact', findingIds: ['f3'] })],
      },
    });
    vi.mocked(callOpenAiForWriting).mockResolvedValueOnce({
      output: {
        themes: [
          {
            themeKey: 't2',
            title: 'Images sans description',
            businessImpact:
              'Les images sans description restent muettes pour un lecteur d’écran. Le thème t2 le confirme.',
            recommendedActions: ['Ajoutez une description courte à chaque image porteuse de sens.'],
          },
        ],
        executiveSummary: 'Ignoré.',
        notes: 'Ignoré.',
      },
    });

    const result = await critiqueAndRepairWriting(input, keys, false, written);

    expect(result.critic?.record.repairApplied).toBe(true);
    expect(result.output.themes[1]!.businessImpact).toBe(
      'Les images sans description restent muettes pour un lecteur d’écran.',
    );
    expect(result.sanitizationWarnings).toEqual([
      { code: 'internal-reference-removed', field: 'themes[1](t2).businessImpact' },
    ]);
  });
});
