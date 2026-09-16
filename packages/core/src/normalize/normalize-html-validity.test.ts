import { describe, expect, it } from 'vitest';
import {
  HTML_VALIDITY_RULE_ID,
  normalizeHtmlValidity,
  type HtmlValidityCheckInput,
} from './normalize-html-validity.js';

const pageUrl = 'https://example.com/';

function issue(ruleId: string, line: number) {
  return { ruleId, message: `${ruleId} at ${line}`, line, column: 1 };
}

describe('normalizeHtmlValidity', () => {
  it.each<[string, HtmlValidityCheckInput]>([
    ['the check did not run', { checked: false, issueCount: 1, issues: [issue('no-dup-id', 3)] }],
    ['the page has no issues', { checked: true, issueCount: 0, issues: [] }],
  ])('emits nothing when %s', (_label, checkInput) => {
    expect(normalizeHtmlValidity(checkInput, pageUrl)).toEqual([]);
  });

  it('emits one minor seo finding per underlying rule, sorted by rule', () => {
    const candidates = normalizeHtmlValidity(
      {
        checked: true,
        issueCount: 3,
        issues: [issue('no-dup-id', 10), issue('close-order', 4), issue('no-dup-id', 20)],
      },
      pageUrl,
    );

    expect(candidates).toHaveLength(2);
    for (const candidate of candidates) {
      expect(candidate.ruleId).toBe(HTML_VALIDITY_RULE_ID);
      expect(candidate.category).toBe('seo');
      expect(candidate.severity).toBe('minor');
      expect(candidate.wcagCriteria).toEqual([]);
    }
    const [closeOrder, duplicateId] = candidates;
    expect(closeOrder?.element?.selector).toBe('[html-validate:close-order]');
    expect(duplicateId?.element).toEqual({
      pageUrl,
      selector: '[html-validate:no-dup-id]',
      snippet: 'no-dup-id at 10',
    });
    expect(duplicateId?.description).toContain('2 instance(s) of "no-dup-id"');
    expect(duplicateId?.description).toContain('(line 10)');
    expect(duplicateId?.rawEvidenceForPage).toMatchObject({ ruleId: 'no-dup-id', issueCount: 2 });
  });

  it('keeps line numbers out of the selector so a shifted page dedupes', () => {
    const before = normalizeHtmlValidity(
      { checked: true, issueCount: 1, issues: [issue('no-dup-id', 10)] },
      pageUrl,
    );
    const after = normalizeHtmlValidity(
      { checked: true, issueCount: 1, issues: [issue('no-dup-id', 11)] },
      pageUrl,
    );
    expect(after[0]?.element?.selector).toBe(before[0]?.element?.selector);
  });
});
