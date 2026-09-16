import { describe, expect, it } from 'vitest';
import {
  extractPlaceholderLabelCandidates,
  PLACEHOLDER_ONLY_LABEL_RULE_ID,
} from './normalize-placeholder-labels.js';

const PAGE_URL = 'https://example.com/contact';

describe('placeholder-only-label', () => {
  it('fires once per field named only by its placeholder', () => {
    const candidates = extractPlaceholderLabelCandidates({
      pageUrl: PAGE_URL,
      controls: [
        {
          selector: '#email',
          controlType: 'email',
          placeholder: 'Votre e-mail',
          hasOtherName: false,
        },
        {
          selector: '#message',
          controlType: 'textarea',
          placeholder: 'Message',
          hasOtherName: false,
        },
      ],
    });
    expect(candidates.map((c) => c.element?.selector)).toEqual(['#email', '#message']);
    expect(candidates[0]).toMatchObject({
      ruleId: PLACEHOLDER_ONLY_LABEL_RULE_ID,
      category: 'accessibility',
      severity: 'moderate',
      wcagCriteria: ['3.3.2'],
      pageUrl: PAGE_URL,
    });
    expect(candidates[0]?.description).toContain('Votre e-mail');
  });

  it('does not fire when another source names the field', () => {
    expect(
      extractPlaceholderLabelCandidates({
        pageUrl: PAGE_URL,
        controls: [
          {
            selector: '#email',
            controlType: 'email',
            placeholder: 'Votre e-mail',
            hasOtherName: true,
          },
        ],
      }),
    ).toEqual([]);
  });

  it('does not fire for a blank placeholder', () => {
    expect(
      extractPlaceholderLabelCandidates({
        pageUrl: PAGE_URL,
        controls: [{ selector: '#q', controlType: 'text', placeholder: '  ', hasOtherName: false }],
      }),
    ).toEqual([]);
  });
});
