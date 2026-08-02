import { describe, expect, it } from 'vitest';
import { extractAxeCandidates } from './normalize-axe.js';
import { buildAxeNode, buildAxeResultsInput, buildAxeViolation } from './fixtures.js';

describe('extractAxeCandidates', () => {
  it('emits one candidate per (violation, node) pair', () => {
    const axe = buildAxeResultsInput([
      buildAxeViolation({
        id: 'color-contrast',
        nodes: [
          buildAxeNode({ target: ['#a'] }),
          buildAxeNode({ target: ['#b'] }),
        ],
      }),
    ]);

    const candidates = extractAxeCandidates(axe, 'https://example.com/');
    expect(candidates).toHaveLength(2);
    expect(candidates.map((c) => c.element?.selector)).toEqual(['#a', '#b']);
    expect(candidates.every((c) => c.source === 'axe')).toBe(true);
    expect(candidates.every((c) => c.category === 'accessibility')).toBe(true);
  });

  it('maps severity from node impact, falling back to violation impact', () => {
    const axe = buildAxeResultsInput([
      buildAxeViolation({
        impact: 'moderate',
        nodes: [
          buildAxeNode({ impact: 'critical' }),
          buildAxeNode({ impact: null }),
        ],
      }),
    ]);

    const candidates = extractAxeCandidates(axe, 'https://example.com/');
    expect(candidates[0]?.severity).toBe('critical');
    // node impact null falls back to the violation's own impact
    expect(candidates[1]?.severity).toBe('moderate');
  });

  it('derives wcagCriteria from the violation tags', () => {
    const axe = buildAxeResultsInput([
      buildAxeViolation({ tags: ['wcag2aa', 'wcag143'] }),
    ]);
    const candidates = extractAxeCandidates(axe, 'https://example.com/');
    expect(candidates[0]?.wcagCriteria).toEqual(['1.4.3']);
  });

  it('flattens shadow-DOM nested target arrays into one selector', () => {
    const axe = buildAxeResultsInput([
      buildAxeViolation({
        nodes: [buildAxeNode({ target: ['#host', ['#inner', '.deep']] })],
      }),
    ]);
    const candidates = extractAxeCandidates(axe, 'https://example.com/');
    expect(candidates[0]?.element?.selector).toBe('#host >>> #inner .deep');
  });

  it('preserves the full target array and impact in rawEvidenceForPage', () => {
    const axe = buildAxeResultsInput([
      buildAxeViolation({ nodes: [buildAxeNode({ target: ['#a', ['#b']], impact: 'serious' })] }),
    ]);
    const candidates = extractAxeCandidates(axe, 'https://example.com/');
    expect(candidates[0]?.rawEvidenceForPage['target']).toEqual(['#a', ['#b']]);
    expect(candidates[0]?.rawEvidenceForPage['impact']).toBe('serious');
  });

  it('truncates long snippets to MAX_SNIPPET_LENGTH', () => {
    const longHtml = '<div>' + 'x'.repeat(1000) + '</div>';
    const axe = buildAxeResultsInput([
      buildAxeViolation({ nodes: [buildAxeNode({ html: longHtml })] }),
    ]);
    const candidates = extractAxeCandidates(axe, 'https://example.com/');
    expect(candidates[0]?.element?.snippet.length).toBe(500);
  });

  it('returns an empty array for no violations', () => {
    expect(extractAxeCandidates(buildAxeResultsInput([]), 'https://example.com/')).toEqual([]);
  });
});
