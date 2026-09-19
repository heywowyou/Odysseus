import { describe, expect, it } from 'vitest';
import { validateCriticIssues } from './critic-issues.js';
import { criticWritingInput, criticWrittenOutput } from './test-support/critic-fixtures.js';

const input = criticWritingInput();
const written = criticWrittenOutput();

function issue(overrides: Record<string, unknown> = {}) {
  return {
    field: 'themes[0](t1).businessImpact',
    category: 'unsupported-inference',
    findingIds: ['f1'],
    problem: 'The impact names the booking engine, which no finding concerns.',
    ...overrides,
  };
}

describe('validateCriticIssues', () => {
  it('accepts an issue bound to its own theme packet', () => {
    const result = validateCriticIssues(input, written, [issue()]);
    expect(result.accepted).toEqual([issue()]);
    expect(Object.values(result.dropped).every((count) => count === 0)).toBe(true);
  });

  it('drops and counts a finding ID from another theme', () => {
    const result = validateCriticIssues(input, written, [issue({ findingIds: ['f1', 'f3'] })]);
    expect(result.accepted).toEqual([]);
    expect(result.dropped['out-of-theme-finding']).toBe(1);
  });

  it('drops and counts a finding ID that exists in no packet', () => {
    const result = validateCriticIssues(input, written, [issue({ findingIds: ['f99'] })]);
    expect(result.accepted).toEqual([]);
    expect(result.dropped['unknown-finding']).toBe(1);
  });

  it.each([
    'themes[5](t6).businessImpact',
    'themes[0](t2).businessImpact',
    'themes[0](t1).recommendedActions[3]',
    'themes[0](t1).legalRelevance',
    'summary',
  ])('drops and counts the unknown field %s', (field) => {
    const result = validateCriticIssues(input, written, [issue({ field })]);
    expect(result.accepted).toEqual([]);
    expect(result.dropped['unknown-field']).toBe(1);
  });

  it('drops and counts an excluded category without discarding its valid neighbours', () => {
    const result = validateCriticIssues(input, written, [
      issue({ category: 'generic-consequence' }),
      issue({ category: 'tone' }),
      issue({ field: 'themes[1](t2).recommendedActions[0]', findingIds: ['f3'] }),
    ]);
    expect(result.accepted).toHaveLength(1);
    expect(result.dropped['excluded-category']).toBe(2);
  });

  it('lets the executive summary and notes cite any theme', () => {
    const result = validateCriticIssues(input, written, [
      issue({ field: 'executiveSummary', findingIds: ['f1', 'f3'] }),
      issue({ field: 'notes', category: 'unexplained-jargon', findingIds: ['f2'] }),
    ]);
    expect(result.accepted).toHaveLength(2);
  });

  it('drops malformed issues and a second issue on the same field and category', () => {
    const result = validateCriticIssues(input, written, [
      issue(),
      issue({ problem: 'Same defect, restated.' }),
      issue({ findingIds: [] }),
      'not an issue',
      null,
    ]);
    expect(result.accepted).toHaveLength(1);
    expect(result.dropped.duplicate).toBe(1);
    expect(result.dropped['invalid-shape']).toBe(3);
  });
});
