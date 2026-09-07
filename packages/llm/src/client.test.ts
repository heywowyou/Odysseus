import { afterEach, describe, expect, it, vi } from 'vitest';
import { WRITING_OPENAI_TEMPERATURE } from './constants.js';

const completeMock = vi.fn();

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: { completions: { create: completeMock } },
  })),
}));

vi.mock('./config.js', () => ({
  getOpenAiApiKey: () => 'test-key',
  getOpenAiBaseUrl: () => undefined,
}));

const { callOpenAiForStructure, callOpenAiForWriting } = await import('./client.js');

const structureInput = {
  siteContext: {
    businessType: 'restaurant',
    primaryGoal: 'bookings',
    languagesServed: ['fr'],
    targetMarkets: ['fr'],
  },
  findings: [],
};

const writingInput = {
  language: 'fr' as const,
  siteContext: structureInput.siteContext,
  themes: [{ themeKey: 'theme-1', category: 'accessibility' as const, findings: [] }],
  siteStats: { pagesScanned: 1, totalFindings: 0, critical: 0, serious: 0, moderate: 0, minor: 0 },
  dominantPerformanceMetric: null,
};

const validStructureOutput = {
  themes: [
    {
      findingIds: ['f1'],
      category: 'accessibility',
      effort: 'low',
      impact: 'medium',
      priorityRank: 1,
    },
  ],
  quickWins: ['fix alt text'],
  overallRisk: 'medium',
};

/** What the provider now returns: themes keyed by theme key, with no
 *  themeKey field inside, so a duplicate key cannot be expressed at all
 *  (issue #36). */
const validWritingResponse = {
  themes: {
    'theme-1': {
      title: 'Missing alt text',
      businessImpact:
        'Screen reader users cannot understand the images. This makes core content inaccessible to them. It also puts the site at legal risk.',
      recommendedActions: ['Add alt text to all images.', 'Review new uploads for alt text.'],
    },
  },
  executiveSummary: 'The site has one accessibility issue worth fixing.',
  notes: '',
};

/** What callOpenAiForWriting hands back: the array shape the rest of the
 *  codebase reads, with themeKey restored from the property name. */
const validWritingOutput = {
  themes: [
    {
      themeKey: 'theme-1',
      title: 'Missing alt text',
      businessImpact:
        'Screen reader users cannot understand the images. This makes core content inaccessible to them. It also puts the site at legal risk.',
      recommendedActions: ['Add alt text to all images.', 'Review new uploads for alt text.'],
    },
  ],
  executiveSummary: 'The site has one accessibility issue worth fixing.',
  notes: '',
};

function choice(
  overrides: { finishReason?: string; content?: unknown; refusal?: string | null } = {},
) {
  return {
    choices: [
      {
        finish_reason: overrides.finishReason ?? 'stop',
        message: {
          content:
            'content' in overrides ? overrides.content : JSON.stringify(validStructureOutput),
          refusal: overrides.refusal ?? null,
        },
      },
    ],
  };
}

describe('callOpenAiForStructure', () => {
  afterEach(() => {
    completeMock.mockReset();
  });

  it('returns the schema-validated output on a successful call', async () => {
    completeMock.mockResolvedValue(choice({ content: JSON.stringify(validStructureOutput) }));
    const result = await callOpenAiForStructure(structureInput, false);
    expect(result.output).toEqual(validStructureOutput);
    expect(completeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-5.4-mini',
        temperature: 0.2,
        reasoning_effort: 'none',
        max_completion_tokens: 16000,
        response_format: expect.objectContaining({
          type: 'json_schema',
          json_schema: expect.objectContaining({ strict: true }),
        }),
      }),
    );
  });

  it('throws when the response has no choices', async () => {
    completeMock.mockResolvedValue({ choices: [] });
    await expect(callOpenAiForStructure(structureInput, false)).rejects.toThrow(
      'contained no choices',
    );
  });

  it('throws when the response was truncated (finishReason length)', async () => {
    completeMock.mockResolvedValue(choice({ finishReason: 'length' }));
    await expect(callOpenAiForStructure(structureInput, false)).rejects.toThrow('truncated');
  });

  it('throws when the provider returns an explicit refusal', async () => {
    completeMock.mockResolvedValue(choice({ refusal: 'I cannot comply.' }));
    await expect(callOpenAiForStructure(structureInput, false)).rejects.toThrow(
      'refused the request',
    );
  });

  it('throws when the message content is not a plain string', async () => {
    completeMock.mockResolvedValue(choice({ content: [{ type: 'text', text: 'x' }] }));
    await expect(callOpenAiForStructure(structureInput, false)).rejects.toThrow('unexpected shape');
  });

  it('throws when the content is not valid JSON', async () => {
    completeMock.mockResolvedValue(choice({ content: 'not json' }));
    await expect(callOpenAiForStructure(structureInput, false)).rejects.toThrow();
  });

  it('throws when the parsed content fails schema validation', async () => {
    completeMock.mockResolvedValue(choice({ content: JSON.stringify({ themes: [] }) }));
    await expect(callOpenAiForStructure(structureInput, false)).rejects.toThrow();
  });

  it('appends the provider Retry-After to a 429 error message (issue #30)', async () => {
    completeMock.mockRejectedValue(
      Object.assign(new Error('429 Rate limit exceeded'), {
        status: 429,
        headers: new Headers({ 'retry-after': '7' }),
      }),
    );
    await expect(callOpenAiForStructure(structureInput, false)).rejects.toThrow(
      '(provider retry-after: 7s)',
    );
  });

  it('leaves provider errors without a readable Retry-After untouched', async () => {
    completeMock.mockRejectedValue(
      Object.assign(new Error('429 Rate limit exceeded'), { status: 429, headers: new Headers() }),
    );
    await expect(callOpenAiForStructure(structureInput, false)).rejects.toThrow(
      /^429 Rate limit exceeded$/,
    );
  });
});

describe('callOpenAiForWriting', () => {
  afterEach(() => {
    completeMock.mockReset();
  });

  it('returns the schema-validated output on a successful call', async () => {
    completeMock.mockResolvedValue(choice({ content: JSON.stringify(validWritingResponse) }));
    const result = await callOpenAiForWriting(writingInput, false);
    expect(result.output).toEqual(validWritingOutput);
  });

  // Plan 027: the writing pass uses its own, higher temperature than the
  // structure pass above - prose has no repeatability requirement, and 0.2
  // was measured to make near-verbatim example copying likely.
  it("uses the writing pass's own temperature, not the structure pass's", async () => {
    completeMock.mockResolvedValue(choice({ content: JSON.stringify(validWritingResponse) }));
    await callOpenAiForWriting(writingInput, false);
    expect(completeMock).toHaveBeenCalledWith(
      expect.objectContaining({ temperature: WRITING_OPENAI_TEMPERATURE }),
    );
  });

  it('asks the provider for a schema keyed by the theme keys it shows (issue #36)', async () => {
    completeMock.mockResolvedValue(choice({ content: JSON.stringify(validWritingResponse) }));
    await callOpenAiForWriting(writingInput, false);

    const schema = completeMock.mock.calls[0]![0].response_format.json_schema.schema;
    expect(schema.properties.themes.type).toBe('object');
    expect(schema.properties.themes.required).toEqual(['theme-1']);
    expect(schema.properties.themes.additionalProperties).toBe(false);
  });

  it('appends the previous rejection to the user message so a retry is a correction (issue #21)', async () => {
    completeMock.mockResolvedValue(choice({ content: JSON.stringify(validWritingResponse) }));
    await callOpenAiForWriting(
      writingInput,
      false,
      'Your previous response was rejected by the automated guard: test reason.',
    );

    const messages = completeMock.mock.calls[0]![0].messages;
    expect(messages).toHaveLength(2);
    expect(messages[1].content).toContain(
      'Your previous response was rejected by the automated guard: test reason.',
    );
  });

  it('throws when the response has no choices', async () => {
    completeMock.mockResolvedValue({ choices: [] });
    await expect(callOpenAiForWriting(writingInput, false)).rejects.toThrow('contained no choices');
  });

  it('throws when the response was truncated (finishReason length)', async () => {
    completeMock.mockResolvedValue(choice({ finishReason: 'length' }));
    await expect(callOpenAiForWriting(writingInput, false)).rejects.toThrow('truncated');
  });

  it('throws when the message content is not a plain string', async () => {
    completeMock.mockResolvedValue(choice({ content: null }));
    await expect(callOpenAiForWriting(writingInput, false)).rejects.toThrow('unexpected shape');
  });

  it('throws when the parsed content fails schema validation', async () => {
    completeMock.mockResolvedValue(choice({ content: JSON.stringify({ themes: [] }) }));
    await expect(callOpenAiForWriting(writingInput, false)).rejects.toThrow();
  });

  it('appends the provider Retry-After to a 429 on the writing path too (issue #30)', async () => {
    completeMock.mockRejectedValue(
      Object.assign(new Error('429 Rate limit exceeded'), {
        status: 429,
        headers: new Headers({ 'retry-after-ms': '500' }),
      }),
    );
    await expect(callOpenAiForWriting(writingInput, false)).rejects.toThrow(
      '(provider retry-after: 500ms)',
    );
  });
});
