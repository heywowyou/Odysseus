import { describe, expect, it, vi } from 'vitest';
import { MAX_RETRIES, OPENAI_MODEL, OPENAI_TEMPERATURE } from '../constants.js';
import { WORD_SHORTFALL_EXTRA_ATTEMPTS } from './generate-outreach-prose.js';
import type { OutreachProseInput } from './outreach-input.js';
import type { OutreachProseOutput } from './outreach-schema.js';

vi.mock('./outreach-client.js', () => ({
  callOpenAiForOutreach: vi.fn(),
}));

const { callOpenAiForOutreach } = await import('./outreach-client.js');
const { generateOutreachProse } = await import('./generate-outreach-prose.js');

function touch1Input(overrides: Partial<OutreachProseInput> = {}): OutreachProseInput {
  return {
    language: 'fr',
    touch: 1,
    businessName: 'Hôtel des Voyageurs',
    evidence: {
      alias: 'e1',
      observation: "Une partie du contenu ne s'affiche pas sans JavaScript.",
      pageRole: 'homepage',
    },
    ageFramingPermitted: false,
    ...overrides,
  };
}

function touch2Input(overrides: Partial<OutreachProseInput> = {}): OutreachProseInput {
  return {
    language: 'fr',
    touch: 2,
    businessName: 'Hôtel des Voyageurs',
    evidence: {
      alias: 'e2',
      observation: 'La navigation au clavier reste bloquée sur un élément.',
      pageRole: 'booking',
    },
    ageFramingPermitted: true,
    ...overrides,
  };
}

function touch3Input(overrides: Partial<OutreachProseInput> = {}): OutreachProseInput {
  return {
    language: 'fr',
    touch: 3,
    businessName: 'Hôtel des Voyageurs',
    ageFramingPermitted: false,
    ...overrides,
  };
}

function cleanTouch1Output(overrides: Partial<Extract<OutreachProseOutput, { touch: 1 }>> = {}) {
  return {
    touch: 1 as const,
    evidenceRef: 'e1' as const,
    subject: "Un point sur l'affichage de votre site",
    opening:
      "Nous avons regardé la version publique de votre site il y a quelques jours dans le cadre d'un test rapide sur la manière dont elle s'affiche pour un nouveau visiteur.",
    evidenceSentence:
      "Une partie du contenu de la page ne s'affiche pas correctement sans JavaScript, ce qui peut gêner certains visiteurs qui découvrent votre établissement pour la première fois.",
    question:
      'Est-ce le comportement que vous souhaitez offrir à vos visiteurs qui réservent en ligne?',
    ...overrides,
  };
}

function cleanTouch2Output(): Extract<OutreachProseOutput, { touch: 2 }> {
  return {
    touch: 2,
    evidenceRef: 'e2',
    sentences: [
      'Nous avions remarqué que la navigation au clavier restait bloquée sur un élément de la page de réservation.',
      "C'est le genre de détail qui peut décourager un visiteur pressé de finaliser sa réservation en ligne.",
    ],
  };
}

function cleanTouch3Output(): Extract<OutreachProseOutput, { touch: 3 }> {
  return {
    touch: 3,
    closing:
      'Nous restons disponibles si vous souhaitez que nous retirions ces informations de notre suivi.',
  };
}

describe('generateOutreachProse - clean pass across touches', () => {
  it('returns touch 1 output on a clean pass', async () => {
    vi.mocked(callOpenAiForOutreach)
      .mockReset()
      .mockResolvedValueOnce({ output: cleanTouch1Output() });

    const result = await generateOutreachProse(touch1Input(), 'text-missing-from-raw-html');

    expect(result.output.touch).toBe(1);
    expect(result.model).toBe(OPENAI_MODEL);
    expect(result.temperature).toBe(OPENAI_TEMPERATURE);
    expect(callOpenAiForOutreach).toHaveBeenCalledTimes(1);
  });

  it('returns touch 2 output on a clean pass', async () => {
    vi.mocked(callOpenAiForOutreach)
      .mockReset()
      .mockResolvedValueOnce({ output: cleanTouch2Output() });

    const result = await generateOutreachProse(touch2Input(), 'keyboard-trap');

    expect(result.output.touch).toBe(2);
    expect(callOpenAiForOutreach).toHaveBeenCalledTimes(1);
  });

  it('returns touch 3 output on a clean pass with no selected observation key', async () => {
    vi.mocked(callOpenAiForOutreach)
      .mockReset()
      .mockResolvedValueOnce({ output: cleanTouch3Output() });

    const result = await generateOutreachProse(touch3Input(), undefined);

    expect(result.output.touch).toBe(3);
    expect(callOpenAiForOutreach).toHaveBeenCalledTimes(1);
  });

  it('normalizes typography on the way out (dash and guillemet spacing)', async () => {
    vi.mocked(callOpenAiForOutreach)
      .mockReset()
      .mockResolvedValueOnce({
        output: cleanTouch1Output({
          opening:
            "Nous avons – rapidement – regardé la version publique de votre site il y a quelques jours dans le cadre d'un test rapide sur la manière dont elle s'affiche pour un nouveau visiteur.",
        }),
      });

    const result = await generateOutreachProse(touch1Input(), 'text-missing-from-raw-html');

    expect(result.output.touch).toBe(1);
    if (result.output.touch === 1) {
      expect(result.output.opening).not.toMatch(/[—–]/u);
      expect(result.output.opening).toContain(' - ');
    }
  });
});

describe('generateOutreachProse - guard rejections (touch 1)', () => {
  it('retries once on an alias leak, then succeeds', async () => {
    vi.mocked(callOpenAiForOutreach)
      .mockReset()
      .mockResolvedValueOnce({
        output: cleanTouch1Output({
          evidenceSentence: cleanTouch1Output().evidenceSentence + ' (voir e1)',
        }),
      })
      .mockResolvedValueOnce({ output: cleanTouch1Output() });

    const result = await generateOutreachProse(touch1Input(), 'text-missing-from-raw-html');

    expect(callOpenAiForOutreach).toHaveBeenCalledTimes(2);
    expect(result.output.touch).toBe(1);
  });

  it('throws after exhausting retries when every attempt leaks the alias', async () => {
    vi.mocked(callOpenAiForOutreach)
      .mockReset()
      .mockResolvedValue({
        output: cleanTouch1Output({
          evidenceSentence: cleanTouch1Output().evidenceSentence + ' (voir e1)',
        }),
      });

    await expect(
      generateOutreachProse(touch1Input(), 'text-missing-from-raw-html'),
    ).rejects.toThrow(/exhausted \d+ attempts/);
    expect(callOpenAiForOutreach).toHaveBeenCalledTimes(MAX_RETRIES + 1);
  });

  it('retries once on an observation-scope drift, then succeeds', async () => {
    vi.mocked(callOpenAiForOutreach)
      .mockReset()
      .mockResolvedValueOnce({
        output: cleanTouch1Output({
          evidenceSentence: 'Le contraste de couleur de votre bouton principal est insuffisant.',
        }),
      })
      .mockResolvedValueOnce({ output: cleanTouch1Output() });

    const result = await generateOutreachProse(touch1Input(), 'text-missing-from-raw-html');

    expect(callOpenAiForOutreach).toHaveBeenCalledTimes(2);
    expect(result.output.touch).toBe(1);
  });

  it('throws after exhausting retries when every attempt drifts to a different observation', async () => {
    vi.mocked(callOpenAiForOutreach)
      .mockReset()
      .mockResolvedValue({
        output: cleanTouch1Output({
          evidenceSentence: 'Le contraste de couleur de votre bouton principal est insuffisant.',
        }),
      });

    await expect(
      generateOutreachProse(touch1Input(), 'text-missing-from-raw-html'),
    ).rejects.toThrow(/exhausted \d+ attempts/);
    expect(callOpenAiForOutreach).toHaveBeenCalledTimes(MAX_RETRIES + 1);
  });

  it('retries once on a doctrine vocabulary violation, then succeeds', async () => {
    vi.mocked(callOpenAiForOutreach)
      .mockReset()
      .mockResolvedValueOnce({
        output: cleanTouch1Output({
          opening: cleanTouch1Output().opening + ' Vos concurrents ont déjà corrigé ce point.',
        }),
      })
      .mockResolvedValueOnce({ output: cleanTouch1Output() });

    const result = await generateOutreachProse(touch1Input(), 'text-missing-from-raw-html');

    expect(callOpenAiForOutreach).toHaveBeenCalledTimes(2);
    expect(result.output.touch).toBe(1);
  });

  it('throws after exhausting retries when every attempt mentions a competitor', async () => {
    vi.mocked(callOpenAiForOutreach)
      .mockReset()
      .mockResolvedValue({
        output: cleanTouch1Output({
          opening: cleanTouch1Output().opening + ' Vos concurrents ont déjà corrigé ce point.',
        }),
      });

    await expect(
      generateOutreachProse(touch1Input(), 'text-missing-from-raw-html'),
    ).rejects.toThrow(/exhausted \d+ attempts/);
    expect(callOpenAiForOutreach).toHaveBeenCalledTimes(MAX_RETRIES + 1);
  });

  it('retries once on a legal-consequence claim, then succeeds', async () => {
    vi.mocked(callOpenAiForOutreach)
      .mockReset()
      .mockResolvedValueOnce({
        output: cleanTouch1Output({
          evidenceSentence:
            cleanTouch1Output().evidenceSentence + ' Cela pourrait entraîner des sanctions.',
        }),
      })
      .mockResolvedValueOnce({ output: cleanTouch1Output() });

    const result = await generateOutreachProse(touch1Input(), 'text-missing-from-raw-html');

    expect(callOpenAiForOutreach).toHaveBeenCalledTimes(2);
    expect(result.output.touch).toBe(1);
  });

  it('throws after exhausting retries when every attempt claims a legal consequence', async () => {
    vi.mocked(callOpenAiForOutreach)
      .mockReset()
      .mockResolvedValue({
        output: cleanTouch1Output({
          evidenceSentence:
            cleanTouch1Output().evidenceSentence + ' Cela pourrait entraîner des sanctions.',
        }),
      });

    await expect(
      generateOutreachProse(touch1Input(), 'text-missing-from-raw-html'),
    ).rejects.toThrow(/exhausted \d+ attempts/);
    expect(callOpenAiForOutreach).toHaveBeenCalledTimes(MAX_RETRIES + 1);
  });

  it('retries once on an invented digit, then succeeds', async () => {
    vi.mocked(callOpenAiForOutreach)
      .mockReset()
      .mockResolvedValueOnce({
        output: cleanTouch1Output({
          evidenceSentence:
            cleanTouch1Output().evidenceSentence +
            ' Environ 15 visiteurs sont concernés chaque semaine.',
        }),
      })
      .mockResolvedValueOnce({ output: cleanTouch1Output() });

    const result = await generateOutreachProse(touch1Input(), 'text-missing-from-raw-html');

    expect(callOpenAiForOutreach).toHaveBeenCalledTimes(2);
    expect(result.output.touch).toBe(1);
  });

  it('throws after exhausting retries when every attempt invents a digit', async () => {
    vi.mocked(callOpenAiForOutreach)
      .mockReset()
      .mockResolvedValue({
        output: cleanTouch1Output({
          evidenceSentence:
            cleanTouch1Output().evidenceSentence +
            ' Environ 15 visiteurs sont concernés chaque semaine.',
        }),
      });

    await expect(
      generateOutreachProse(touch1Input(), 'text-missing-from-raw-html'),
    ).rejects.toThrow(/exhausted \d+ attempts/);
    expect(callOpenAiForOutreach).toHaveBeenCalledTimes(MAX_RETRIES + 1);
  });

  it('retries once on a leaked URL, then succeeds', async () => {
    vi.mocked(callOpenAiForOutreach)
      .mockReset()
      .mockResolvedValueOnce({
        output: cleanTouch1Output({
          evidenceSentence:
            cleanTouch1Output().evidenceSentence + ' Voir https://exemple.fr pour plus de détails.',
        }),
      })
      .mockResolvedValueOnce({ output: cleanTouch1Output() });

    const result = await generateOutreachProse(touch1Input(), 'text-missing-from-raw-html');

    expect(callOpenAiForOutreach).toHaveBeenCalledTimes(2);
    expect(result.output.touch).toBe(1);
  });

  it('throws after exhausting retries when every attempt leaks a URL', async () => {
    vi.mocked(callOpenAiForOutreach)
      .mockReset()
      .mockResolvedValue({
        output: cleanTouch1Output({
          evidenceSentence:
            cleanTouch1Output().evidenceSentence + ' Voir https://exemple.fr pour plus de détails.',
        }),
      });

    await expect(
      generateOutreachProse(touch1Input(), 'text-missing-from-raw-html'),
    ).rejects.toThrow(/exhausted \d+ attempts/);
    expect(callOpenAiForOutreach).toHaveBeenCalledTimes(MAX_RETRIES + 1);
  });

  it('retries once when a field is written in the wrong language, then succeeds', async () => {
    vi.mocked(callOpenAiForOutreach)
      .mockReset()
      .mockResolvedValueOnce({
        output: cleanTouch1Output({
          evidenceSentence:
            'Part of the content does not display without JavaScript, which may confuse visitors discovering your hotel for the first time.',
        }),
      })
      .mockResolvedValueOnce({ output: cleanTouch1Output() });

    const result = await generateOutreachProse(touch1Input(), 'text-missing-from-raw-html');

    expect(callOpenAiForOutreach).toHaveBeenCalledTimes(2);
    expect(result.output.touch).toBe(1);
  });

  it('throws after exhausting retries when every attempt is in the wrong language', async () => {
    vi.mocked(callOpenAiForOutreach)
      .mockReset()
      .mockResolvedValue({
        output: cleanTouch1Output({
          evidenceSentence:
            'Part of the content does not display without JavaScript, which may confuse visitors discovering your hotel for the first time.',
        }),
      });

    await expect(
      generateOutreachProse(touch1Input(), 'text-missing-from-raw-html'),
    ).rejects.toThrow(/exhausted \d+ attempts/);
    expect(callOpenAiForOutreach).toHaveBeenCalledTimes(MAX_RETRIES + 1);
  });

  it('retries once when the word budget is missed, then succeeds', async () => {
    vi.mocked(callOpenAiForOutreach)
      .mockReset()
      .mockResolvedValueOnce({
        output: cleanTouch1Output({
          evidenceSentence: "Une partie du contenu ne s'affiche pas sans JavaScript.",
        }),
      })
      .mockResolvedValueOnce({ output: cleanTouch1Output() });

    const result = await generateOutreachProse(touch1Input(), 'text-missing-from-raw-html');

    expect(callOpenAiForOutreach).toHaveBeenCalledTimes(2);
    expect(result.output.touch).toBe(1);
  });

  it('lands within the extra word-shortfall attempts after the base budget is spent', async () => {
    // Issue #14's run 1: 53 words (fixture equivalent of the live 56) on every
    // base attempt. The extras exist so a fourth attempt can clear the floor
    // instead of the run dying at three.
    const short = () =>
      cleanTouch1Output({
        evidenceSentence: "Une partie du contenu ne s'affiche pas sans JavaScript.",
      });
    vi.mocked(callOpenAiForOutreach)
      .mockReset()
      .mockResolvedValueOnce({ output: short() })
      .mockResolvedValueOnce({ output: short() })
      .mockResolvedValueOnce({ output: short() })
      .mockResolvedValue({ output: cleanTouch1Output() });

    const result = await generateOutreachProse(touch1Input(), 'text-missing-from-raw-html');

    expect(result.output.touch).toBe(1);
    expect(callOpenAiForOutreach).toHaveBeenCalledTimes(MAX_RETRIES + 1 + 1);
  });

  it('escalates the word ask by the undershoot across repeated shortfalls', async () => {
    // The fixture's short output counts 53 words. The first retry is asked
    // for the floor plus two; the next ask grows by the model's own
    // undershoot (62 + 9 + 2 = 73), capped at the band midpoint, so the ask
    // outruns the observed 56-58 landing zone instead of meeting it again.
    const short = () =>
      cleanTouch1Output({
        evidenceSentence: "Une partie du contenu ne s'affiche pas sans JavaScript.",
      });
    vi.mocked(callOpenAiForOutreach)
      .mockReset()
      .mockResolvedValueOnce({ output: short() })
      .mockResolvedValueOnce({ output: short() })
      .mockResolvedValueOnce({ output: short() })
      .mockResolvedValue({ output: cleanTouch1Output() });

    await generateOutreachProse(touch1Input(), 'text-missing-from-raw-html');

    const feedbackFor = (attemptIndex: number) =>
      vi.mocked(callOpenAiForOutreach).mock.calls[attemptIndex]?.[1] ?? '';
    expect(feedbackFor(1)).toContain('at least 62 words');
    expect(feedbackFor(2)).toContain('at least 73 words');
    expect(feedbackFor(3)).toContain('at least 75 words');
    // The floor stated to the model never moves.
    expect(feedbackFor(2)).toContain('below the required minimum of 60');
  });

  it('throws after spending every attempt, including the extras, on shortfalls', async () => {
    vi.mocked(callOpenAiForOutreach)
      .mockReset()
      .mockResolvedValue({
        output: cleanTouch1Output({
          evidenceSentence: "Une partie du contenu ne s'affiche pas sans JavaScript.",
        }),
      });

    await expect(
      generateOutreachProse(touch1Input(), 'text-missing-from-raw-html'),
    ).rejects.toThrow(/exhausted 5 attempts/);
    expect(callOpenAiForOutreach).toHaveBeenCalledTimes(
      MAX_RETRIES + 1 + WORD_SHORTFALL_EXTRA_ATTEMPTS,
    );
  });

  it('ends at the base budget when the last base attempt fails on something other than length', async () => {
    // Two short attempts, then a vocabulary leak: the extras exist only for
    // pure word-count shortfalls, so the third rejection ends the run.
    vi.mocked(callOpenAiForOutreach)
      .mockReset()
      .mockResolvedValueOnce({
        output: cleanTouch1Output({
          evidenceSentence: "Une partie du contenu ne s'affiche pas sans JavaScript.",
        }),
      })
      .mockResolvedValueOnce({
        output: cleanTouch1Output({
          evidenceSentence: "Une partie du contenu ne s'affiche pas sans JavaScript.",
        }),
      })
      .mockResolvedValue({
        output: cleanTouch1Output({
          evidenceSentence: cleanTouch1Output().evidenceSentence + ' (voir e1)',
        }),
      });

    await expect(
      generateOutreachProse(touch1Input(), 'text-missing-from-raw-html'),
    ).rejects.toThrow(/exhausted 3 attempts/);
    expect(callOpenAiForOutreach).toHaveBeenCalledTimes(MAX_RETRIES + 1);
  });

  it('retries once on a raw API/parse failure, then succeeds', async () => {
    vi.mocked(callOpenAiForOutreach)
      .mockReset()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({ output: cleanTouch1Output() });

    const result = await generateOutreachProse(touch1Input(), 'text-missing-from-raw-html');

    expect(callOpenAiForOutreach).toHaveBeenCalledTimes(2);
    expect(result.output.touch).toBe(1);
  });

  it('passes no rejection reason on the first attempt', async () => {
    vi.mocked(callOpenAiForOutreach)
      .mockReset()
      .mockResolvedValueOnce({ output: cleanTouch1Output() });

    await generateOutreachProse(touch1Input(), 'text-missing-from-raw-html');

    expect(vi.mocked(callOpenAiForOutreach).mock.calls[0]?.[1]).toBeUndefined();
  });

  it('feeds the guard rejection reason back into the retry attempt', async () => {
    vi.mocked(callOpenAiForOutreach)
      .mockReset()
      .mockResolvedValueOnce({
        output: cleanTouch1Output({
          evidenceSentence: "Une partie du contenu ne s'affiche pas sans JavaScript.",
        }),
      })
      .mockResolvedValueOnce({ output: cleanTouch1Output() });

    const result = await generateOutreachProse(touch1Input(), 'text-missing-from-raw-html');

    expect(callOpenAiForOutreach).toHaveBeenCalledTimes(2);
    expect(result.output.touch).toBe(1);
    const retryFeedback = vi.mocked(callOpenAiForOutreach).mock.calls[1]?.[1];
    expect(retryFeedback).toContain('too-few-words');
    expect(retryFeedback).toContain('below the required minimum of 60');
    expect(retryFeedback).toContain('more words than last time');
  });

  it('feeds a generic guard rejection back without word arithmetic', async () => {
    vi.mocked(callOpenAiForOutreach)
      .mockReset()
      .mockResolvedValueOnce({
        output: cleanTouch1Output({
          evidenceSentence: cleanTouch1Output().evidenceSentence + ' (voir e1)',
        }),
      })
      .mockResolvedValueOnce({ output: cleanTouch1Output() });

    await generateOutreachProse(touch1Input(), 'text-missing-from-raw-html');

    const retryFeedback = vi.mocked(callOpenAiForOutreach).mock.calls[1]?.[1];
    expect(retryFeedback).toContain('alias violation');
    expect(retryFeedback).not.toContain('more words than last time');
  });

  it('feeds an API failure reason back into the retry attempt too', async () => {
    vi.mocked(callOpenAiForOutreach)
      .mockReset()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({ output: cleanTouch1Output() });

    await generateOutreachProse(touch1Input(), 'text-missing-from-raw-html');

    expect(vi.mocked(callOpenAiForOutreach).mock.calls[1]?.[1]).toContain('network error');
  });
});
