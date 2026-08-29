import { describe, expect, it, vi } from 'vitest';
import { MAX_RETRIES, MISTRAL_MODEL, MISTRAL_TEMPERATURE } from '../constants.js';
import type { OutreachProseInput } from './outreach-input.js';
import type { OutreachProseOutput } from './outreach-schema.js';

vi.mock('./outreach-client.js', () => ({
  callMistralForOutreach: vi.fn(),
}));

const { callMistralForOutreach } = await import('./outreach-client.js');
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
      "Bonjour, nous avons regardé la version publique de votre site il y a quelques jours dans le cadre d'un test rapide sur la manière dont elle s'affiche pour un nouveau visiteur.",
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
    vi.mocked(callMistralForOutreach)
      .mockReset()
      .mockResolvedValueOnce({ output: cleanTouch1Output() });

    const result = await generateOutreachProse(touch1Input(), 'text-missing-from-raw-html');

    expect(result.output.touch).toBe(1);
    expect(result.model).toBe(MISTRAL_MODEL);
    expect(result.temperature).toBe(MISTRAL_TEMPERATURE);
    expect(callMistralForOutreach).toHaveBeenCalledTimes(1);
  });

  it('returns touch 2 output on a clean pass', async () => {
    vi.mocked(callMistralForOutreach)
      .mockReset()
      .mockResolvedValueOnce({ output: cleanTouch2Output() });

    const result = await generateOutreachProse(touch2Input(), 'keyboard-trap');

    expect(result.output.touch).toBe(2);
    expect(callMistralForOutreach).toHaveBeenCalledTimes(1);
  });

  it('returns touch 3 output on a clean pass with no selected observation key', async () => {
    vi.mocked(callMistralForOutreach)
      .mockReset()
      .mockResolvedValueOnce({ output: cleanTouch3Output() });

    const result = await generateOutreachProse(touch3Input(), undefined);

    expect(result.output.touch).toBe(3);
    expect(callMistralForOutreach).toHaveBeenCalledTimes(1);
  });

  it('normalizes typography on the way out (dash and guillemet spacing)', async () => {
    vi.mocked(callMistralForOutreach)
      .mockReset()
      .mockResolvedValueOnce({
        output: cleanTouch1Output({
          opening:
            "Bonjour – nous avons regardé la version publique de votre site il y a quelques jours dans le cadre d'un test rapide sur la manière dont elle s'affiche pour un nouveau visiteur.",
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
    vi.mocked(callMistralForOutreach)
      .mockReset()
      .mockResolvedValueOnce({
        output: cleanTouch1Output({
          evidenceSentence: cleanTouch1Output().evidenceSentence + ' (voir e1)',
        }),
      })
      .mockResolvedValueOnce({ output: cleanTouch1Output() });

    const result = await generateOutreachProse(touch1Input(), 'text-missing-from-raw-html');

    expect(callMistralForOutreach).toHaveBeenCalledTimes(2);
    expect(result.output.touch).toBe(1);
  });

  it('throws after exhausting retries when every attempt leaks the alias', async () => {
    vi.mocked(callMistralForOutreach)
      .mockReset()
      .mockResolvedValue({
        output: cleanTouch1Output({
          evidenceSentence: cleanTouch1Output().evidenceSentence + ' (voir e1)',
        }),
      });

    await expect(
      generateOutreachProse(touch1Input(), 'text-missing-from-raw-html'),
    ).rejects.toThrow(/exhausted \d+ attempts/);
    expect(callMistralForOutreach).toHaveBeenCalledTimes(MAX_RETRIES + 1);
  });

  it('retries once on an observation-scope drift, then succeeds', async () => {
    vi.mocked(callMistralForOutreach)
      .mockReset()
      .mockResolvedValueOnce({
        output: cleanTouch1Output({
          evidenceSentence: 'Le contraste de couleur de votre bouton principal est insuffisant.',
        }),
      })
      .mockResolvedValueOnce({ output: cleanTouch1Output() });

    const result = await generateOutreachProse(touch1Input(), 'text-missing-from-raw-html');

    expect(callMistralForOutreach).toHaveBeenCalledTimes(2);
    expect(result.output.touch).toBe(1);
  });

  it('throws after exhausting retries when every attempt drifts to a different observation', async () => {
    vi.mocked(callMistralForOutreach)
      .mockReset()
      .mockResolvedValue({
        output: cleanTouch1Output({
          evidenceSentence: 'Le contraste de couleur de votre bouton principal est insuffisant.',
        }),
      });

    await expect(
      generateOutreachProse(touch1Input(), 'text-missing-from-raw-html'),
    ).rejects.toThrow(/exhausted \d+ attempts/);
    expect(callMistralForOutreach).toHaveBeenCalledTimes(MAX_RETRIES + 1);
  });

  it('retries once on a doctrine vocabulary violation, then succeeds', async () => {
    vi.mocked(callMistralForOutreach)
      .mockReset()
      .mockResolvedValueOnce({
        output: cleanTouch1Output({
          opening: cleanTouch1Output().opening + ' Vos concurrents ont déjà corrigé ce point.',
        }),
      })
      .mockResolvedValueOnce({ output: cleanTouch1Output() });

    const result = await generateOutreachProse(touch1Input(), 'text-missing-from-raw-html');

    expect(callMistralForOutreach).toHaveBeenCalledTimes(2);
    expect(result.output.touch).toBe(1);
  });

  it('throws after exhausting retries when every attempt mentions a competitor', async () => {
    vi.mocked(callMistralForOutreach)
      .mockReset()
      .mockResolvedValue({
        output: cleanTouch1Output({
          opening: cleanTouch1Output().opening + ' Vos concurrents ont déjà corrigé ce point.',
        }),
      });

    await expect(
      generateOutreachProse(touch1Input(), 'text-missing-from-raw-html'),
    ).rejects.toThrow(/exhausted \d+ attempts/);
    expect(callMistralForOutreach).toHaveBeenCalledTimes(MAX_RETRIES + 1);
  });

  it('retries once on a legal-consequence claim, then succeeds', async () => {
    vi.mocked(callMistralForOutreach)
      .mockReset()
      .mockResolvedValueOnce({
        output: cleanTouch1Output({
          evidenceSentence:
            cleanTouch1Output().evidenceSentence + ' Cela pourrait entraîner des sanctions.',
        }),
      })
      .mockResolvedValueOnce({ output: cleanTouch1Output() });

    const result = await generateOutreachProse(touch1Input(), 'text-missing-from-raw-html');

    expect(callMistralForOutreach).toHaveBeenCalledTimes(2);
    expect(result.output.touch).toBe(1);
  });

  it('throws after exhausting retries when every attempt claims a legal consequence', async () => {
    vi.mocked(callMistralForOutreach)
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
    expect(callMistralForOutreach).toHaveBeenCalledTimes(MAX_RETRIES + 1);
  });

  it('retries once on an invented digit, then succeeds', async () => {
    vi.mocked(callMistralForOutreach)
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

    expect(callMistralForOutreach).toHaveBeenCalledTimes(2);
    expect(result.output.touch).toBe(1);
  });

  it('throws after exhausting retries when every attempt invents a digit', async () => {
    vi.mocked(callMistralForOutreach)
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
    expect(callMistralForOutreach).toHaveBeenCalledTimes(MAX_RETRIES + 1);
  });

  it('retries once on a leaked URL, then succeeds', async () => {
    vi.mocked(callMistralForOutreach)
      .mockReset()
      .mockResolvedValueOnce({
        output: cleanTouch1Output({
          evidenceSentence:
            cleanTouch1Output().evidenceSentence + ' Voir https://exemple.fr pour plus de détails.',
        }),
      })
      .mockResolvedValueOnce({ output: cleanTouch1Output() });

    const result = await generateOutreachProse(touch1Input(), 'text-missing-from-raw-html');

    expect(callMistralForOutreach).toHaveBeenCalledTimes(2);
    expect(result.output.touch).toBe(1);
  });

  it('throws after exhausting retries when every attempt leaks a URL', async () => {
    vi.mocked(callMistralForOutreach)
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
    expect(callMistralForOutreach).toHaveBeenCalledTimes(MAX_RETRIES + 1);
  });

  it('retries once when a field is written in the wrong language, then succeeds', async () => {
    vi.mocked(callMistralForOutreach)
      .mockReset()
      .mockResolvedValueOnce({
        output: cleanTouch1Output({
          evidenceSentence:
            'Part of the content does not display without JavaScript, which may confuse visitors discovering your hotel for the first time.',
        }),
      })
      .mockResolvedValueOnce({ output: cleanTouch1Output() });

    const result = await generateOutreachProse(touch1Input(), 'text-missing-from-raw-html');

    expect(callMistralForOutreach).toHaveBeenCalledTimes(2);
    expect(result.output.touch).toBe(1);
  });

  it('throws after exhausting retries when every attempt is in the wrong language', async () => {
    vi.mocked(callMistralForOutreach)
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
    expect(callMistralForOutreach).toHaveBeenCalledTimes(MAX_RETRIES + 1);
  });

  it('retries once when the word budget is missed, then succeeds', async () => {
    vi.mocked(callMistralForOutreach)
      .mockReset()
      .mockResolvedValueOnce({
        output: cleanTouch1Output({
          evidenceSentence: "Une partie du contenu ne s'affiche pas sans JavaScript.",
        }),
      })
      .mockResolvedValueOnce({ output: cleanTouch1Output() });

    const result = await generateOutreachProse(touch1Input(), 'text-missing-from-raw-html');

    expect(callMistralForOutreach).toHaveBeenCalledTimes(2);
    expect(result.output.touch).toBe(1);
  });

  it('throws after exhausting retries when every attempt misses the word budget', async () => {
    vi.mocked(callMistralForOutreach)
      .mockReset()
      .mockResolvedValue({
        output: cleanTouch1Output({
          evidenceSentence: "Une partie du contenu ne s'affiche pas sans JavaScript.",
        }),
      });

    await expect(
      generateOutreachProse(touch1Input(), 'text-missing-from-raw-html'),
    ).rejects.toThrow(/exhausted \d+ attempts/);
    expect(callMistralForOutreach).toHaveBeenCalledTimes(MAX_RETRIES + 1);
  });

  it('retries once on a raw API/parse failure, then succeeds', async () => {
    vi.mocked(callMistralForOutreach)
      .mockReset()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({ output: cleanTouch1Output() });

    const result = await generateOutreachProse(touch1Input(), 'text-missing-from-raw-html');

    expect(callMistralForOutreach).toHaveBeenCalledTimes(2);
    expect(result.output.touch).toBe(1);
  });
});
