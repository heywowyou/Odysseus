import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OutreachProseInput } from './outreach-input.js';

const completeMock = vi.fn();

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: completeMock } },
  })),
}));

vi.mock('../config.js', () => ({
  getOpenAiApiKey: () => 'test-key',
  getOpenAiBaseUrl: () => undefined,
}));

const { callOpenAiForOutreach } = await import('./outreach-client.js');

const touch1Input: OutreachProseInput = {
  language: 'fr',
  touch: 1,
  businessName: 'Hôtel des Voyageurs',
  evidence: {
    alias: 'e1',
    observation: "Une partie du contenu ne s'affiche pas sans JavaScript.",
    pageRole: 'homepage',
  },
  ageFramingPermitted: false,
};

const validTouch1Output = {
  touch: 1,
  evidenceRef: 'e1',
  subject: "Un point sur l'affichage de votre site",
  opening: 'Nous avons regardé la version publique de votre site il y a quelques jours.',
  evidenceSentence: "Une partie du contenu ne s'affiche pas sans JavaScript.",
  question: 'Est-ce un choix délibéré ?',
};

function choice(
  overrides: { finishReason?: string; content?: unknown; refusal?: string | null } = {},
) {
  return {
    choices: [
      {
        finish_reason: overrides.finishReason ?? 'stop',
        message: {
          content: 'content' in overrides ? overrides.content : JSON.stringify(validTouch1Output),
          refusal: overrides.refusal ?? null,
        },
      },
    ],
  };
}

describe('callOpenAiForOutreach', () => {
  afterEach(() => {
    completeMock.mockReset();
  });

  it('returns the schema-validated output on a successful call', async () => {
    completeMock.mockResolvedValue(choice());
    const result = await callOpenAiForOutreach(touch1Input);
    expect(result.output).toEqual(validTouch1Output);
  });

  it('appends the provider Retry-After to a 429 error message (issue #31)', async () => {
    completeMock.mockRejectedValue(
      Object.assign(new Error('429 Rate limit exceeded'), {
        status: 429,
        headers: new Headers({ 'retry-after': '7' }),
      }),
    );

    await expect(callOpenAiForOutreach(touch1Input)).rejects.toThrow('(provider retry-after: 7s)');
  });

  it('leaves provider errors without a readable Retry-After untouched', async () => {
    completeMock.mockRejectedValue(
      Object.assign(new Error('429 Rate limit exceeded'), { status: 429, headers: new Headers() }),
    );

    await expect(callOpenAiForOutreach(touch1Input)).rejects.toThrow(/^429 Rate limit exceeded$/);
  });
});
