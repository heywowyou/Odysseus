import { describe, expect, it } from 'vitest';
import { buildWritingSystemPrompt } from './writing-prompt.js';

// item 43: the executive summary led with the raw total findings count
// ("98 problèmes"), of which most were minor - rhetorically inflated
// relative to what actually matters. The prompt now instructs the model
// to lead with the actionable (critical + serious) count instead.
describe('item 43: the writing prompt instructs leading with the actionable count', () => {
  it('instructs the model not to lead the executive summary with the raw total', () => {
    const prompt = buildWritingSystemPrompt('fr', false, null);
    expect(prompt).toContain('Lead the executiveSummary with the actionable number');
    expect(prompt).toContain('not the raw total findings count');
  });
});
