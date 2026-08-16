import { describe, expect, it } from 'vitest';
import { extractLlmsTxtCandidates, LLMS_TXT_MISSING_RULE_ID } from './normalize-llms-txt.js';

const PAGE_URL = 'https://example.com/';

describe('llms-txt-missing', () => {
  it('fires when llms.txt was not found', () => {
    const candidates = extractLlmsTxtCandidates({ found: false }, PAGE_URL);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.ruleId).toBe(LLMS_TXT_MISSING_RULE_ID);
    expect(candidates[0]?.category).toBe('geo');
    expect(candidates[0]?.severity).toBe('minor');
    expect(candidates[0]?.pageUrl).toBe(PAGE_URL);
    expect(candidates[0]?.element).toBeNull();
  });

  it('does not fire when llms.txt was found', () => {
    expect(extractLlmsTxtCandidates({ found: true }, PAGE_URL)).toEqual([]);
  });
});
