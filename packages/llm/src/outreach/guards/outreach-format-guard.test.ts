import { describe, expect, it } from 'vitest';
import type { ProseField } from '../../prose-fields.js';
import { findOutreachFormatViolations } from './outreach-format-guard.js';

function field(text: string): ProseField[] {
  return [{ field: 'evidenceSentence', text }];
}

describe('findOutreachFormatViolations', () => {
  it('finds nothing in plain prose', () => {
    expect(findOutreachFormatViolations(field('Une phrase tout à fait ordinaire.'))).toEqual([]);
  });

  it('flags an HTML tag', () => {
    const violations = findOutreachFormatViolations(field('Regardez <strong>ceci</strong>.'));
    expect(violations).toContainEqual(expect.objectContaining({ rule: 'html' }));
  });

  it('flags an email address', () => {
    const violations = findOutreachFormatViolations(field('Écrivez à contact@example.com.'));
    expect(violations).toContainEqual(expect.objectContaining({ rule: 'email' }));
  });

  it('flags a URL', () => {
    const violations = findOutreachFormatViolations(field('Voir https://example.com/rapport.'));
    expect(violations).toContainEqual(expect.objectContaining({ rule: 'url' }));
  });

  it('flags Markdown emphasis', () => {
    const violations = findOutreachFormatViolations(field('Ceci est **important** pour vous.'));
    expect(violations).toContainEqual(expect.objectContaining({ rule: 'markdown' }));
  });

  it('flags a Markdown link', () => {
    const violations = findOutreachFormatViolations(
      field('Voir [le rapport](https://example.com).'),
    );
    expect(violations.length).toBeGreaterThan(0);
  });
});
