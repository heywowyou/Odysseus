import { afterEach, describe, expect, it, vi } from 'vitest';

const completeMock = vi.fn();

vi.mock('@mistralai/mistralai', () => ({
  Mistral: vi.fn().mockImplementation(() => ({
    chat: { complete: completeMock },
  })),
}));

vi.mock('./config.js', () => ({
  getMistralApiKey: () => 'test-key',
}));

const { callMistralForStructure, callMistralForWriting } = await import('./client.js');

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
  themes: [],
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

const validWritingOutput = {
  themes: [
    {
      themeKey: 'theme-1',
      title: 'Missing alt text',
      businessImpact: 'Screen reader users cannot understand the images.',
      recommendedActions: ['Add alt text to all images.'],
    },
  ],
  executiveSummary: 'The site has one accessibility issue worth fixing.',
  notes: '',
};

function choice(overrides: { finishReason?: string; content?: unknown } = {}) {
  return {
    choices: [
      {
        finishReason: overrides.finishReason ?? 'stop',
        message: {
          content:
            'content' in overrides ? overrides.content : JSON.stringify(validStructureOutput),
        },
      },
    ],
  };
}

describe('callMistralForStructure', () => {
  afterEach(() => {
    completeMock.mockReset();
  });

  it('returns the schema-validated output on a successful call', async () => {
    completeMock.mockResolvedValue(choice({ content: JSON.stringify(validStructureOutput) }));
    const result = await callMistralForStructure(structureInput, false);
    expect(result.output).toEqual(validStructureOutput);
  });

  it('throws when the response has no choices', async () => {
    completeMock.mockResolvedValue({ choices: [] });
    await expect(callMistralForStructure(structureInput, false)).rejects.toThrow(
      'contained no choices',
    );
  });

  it('throws when the response was truncated (finishReason length)', async () => {
    completeMock.mockResolvedValue(choice({ finishReason: 'length' }));
    await expect(callMistralForStructure(structureInput, false)).rejects.toThrow('truncated');
  });

  it('throws when the message content is not a plain string', async () => {
    completeMock.mockResolvedValue(choice({ content: [{ type: 'text', text: 'x' }] }));
    await expect(callMistralForStructure(structureInput, false)).rejects.toThrow(
      'unexpected shape',
    );
  });

  it('throws when the content is not valid JSON', async () => {
    completeMock.mockResolvedValue(choice({ content: 'not json' }));
    await expect(callMistralForStructure(structureInput, false)).rejects.toThrow();
  });

  it('throws when the parsed content fails schema validation', async () => {
    completeMock.mockResolvedValue(choice({ content: JSON.stringify({ themes: [] }) }));
    await expect(callMistralForStructure(structureInput, false)).rejects.toThrow();
  });
});

describe('callMistralForWriting', () => {
  afterEach(() => {
    completeMock.mockReset();
  });

  it('returns the schema-validated output on a successful call', async () => {
    completeMock.mockResolvedValue(choice({ content: JSON.stringify(validWritingOutput) }));
    const result = await callMistralForWriting(writingInput, false);
    expect(result.output).toEqual(validWritingOutput);
  });

  it('appends the previous rejection to the user message so a retry is a correction (issue #21)', async () => {
    completeMock.mockResolvedValue(choice({ content: JSON.stringify(validWritingOutput) }));
    await callMistralForWriting(
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
    await expect(callMistralForWriting(writingInput, false)).rejects.toThrow(
      'contained no choices',
    );
  });

  it('throws when the response was truncated (finishReason length)', async () => {
    completeMock.mockResolvedValue(choice({ finishReason: 'length' }));
    await expect(callMistralForWriting(writingInput, false)).rejects.toThrow('truncated');
  });

  it('throws when the message content is not a plain string', async () => {
    completeMock.mockResolvedValue(choice({ content: null }));
    await expect(callMistralForWriting(writingInput, false)).rejects.toThrow('unexpected shape');
  });

  it('throws when the parsed content fails schema validation', async () => {
    completeMock.mockResolvedValue(choice({ content: JSON.stringify({ themes: [] }) }));
    await expect(callMistralForWriting(writingInput, false)).rejects.toThrow();
  });
});
