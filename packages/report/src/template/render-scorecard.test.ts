import { describe, expect, it } from 'vitest';
import { renderScorecardGrade } from './render-scorecard.js';

describe('renderScorecardGrade', () => {
  it.each([
    ['A', '#4cc98a', '#152a29'],
    ['B', 'var(--color-accent-300)', '#1b2b37'],
    ['C', '#d6c96e', '#262a26'],
    ['D', '#d97b82', '#262028'],
  ] as const)('renders grade %s with its semantic colour', (grade, color, bg) => {
    const html = renderScorecardGrade(grade, 'Required disclaimer.');

    expect(html).toContain(`data-grade="${grade}"`);
    expect(html).toContain(`color:${color};background:${bg}`);
    expect(html).toContain('Required disclaimer.');
  });
});
