import { describe, expect, it } from 'vitest';
import type { ProseField } from '../../prose-fields.js';
import { findOutreachNumberViolations } from './outreach-number-guard.js';

describe('findOutreachNumberViolations', () => {
  it('finds nothing in digit-free prose', () => {
    const fields: ProseField[] = [{ field: 'question', text: 'Est-ce le cas chez vous ?' }];
    expect(findOutreachNumberViolations(fields)).toEqual([]);
  });

  it('flags any digit by default', () => {
    const fields: ProseField[] = [
      { field: 'question', text: 'Cela concerne 3 pages de votre site.' },
    ];
    const violations = findOutreachNumberViolations(fields);
    expect(violations).toContainEqual(expect.objectContaining({ field: 'question', matched: '3' }));
  });

  it('respects an explicit allowlist', () => {
    const fields: ProseField[] = [{ field: 'closing', text: 'Voir le critère 1.1.1.' }];
    expect(findOutreachNumberViolations(fields, ['1.1.1'])).toEqual([]);
  });
});
