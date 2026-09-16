import { describe, expect, it } from 'vitest';
import { hookFamilyForCategory, resolveHookFamily } from './hook-family.js';
import { buildFinding } from './test-fixtures.js';
import type { Finding } from '../types/findings.js';

describe('resolveHookFamily', () => {
  it('resolves accessibility on a strict accessibility majority', () => {
    const findings: Finding[] = [
      buildFinding({ source: 'axe', category: 'accessibility', severity: 'critical' }),
      buildFinding({ source: 'axe', category: 'accessibility', severity: 'serious' }),
      buildFinding({ source: 'lighthouse', category: 'performance', severity: 'moderate' }),
    ];
    expect(resolveHookFamily(findings).family).toBe('accessibility');
  });

  it('resolves speed and booking from performance and rendering categories', () => {
    const findings: Finding[] = [
      buildFinding({ source: 'lighthouse', category: 'performance', severity: 'critical' }),
      buildFinding({ source: 'renderdiff', category: 'rendering', severity: 'serious' }),
      buildFinding({ source: 'axe', category: 'accessibility', severity: 'minor' }),
    ];
    expect(resolveHookFamily(findings).family).toBe('speed-and-booking');
  });

  it('resolves search and AI visibility from seo and geo categories', () => {
    const findings: Finding[] = [
      buildFinding({ source: 'custom', category: 'seo', severity: 'critical' }),
      buildFinding({ source: 'custom', category: 'geo', severity: 'serious' }),
      buildFinding({ source: 'custom', category: 'privacy', severity: 'minor' }),
    ];
    expect(resolveHookFamily(findings).family).toBe('search-and-ai-visibility');
  });

  it('resolves privacy from privacy findings alone', () => {
    const findings: Finding[] = [
      buildFinding({ source: 'custom', category: 'privacy', severity: 'critical' }),
      buildFinding({ source: 'axe', category: 'accessibility', severity: 'moderate' }),
    ];
    expect(resolveHookFamily(findings).family).toBe('privacy');
  });

  it('returns mixed on an exact tie', () => {
    const findings: Finding[] = [
      buildFinding({ source: 'axe', category: 'accessibility', severity: 'critical' }),
      buildFinding({ source: 'lighthouse', category: 'performance', severity: 'critical' }),
    ];
    expect(resolveHookFamily(findings).family).toBe('mixed');
  });

  it('returns mixed when the strongest family holds only half the weight', () => {
    const findings: Finding[] = [
      buildFinding({ source: 'axe', category: 'accessibility', severity: 'critical' }),
      buildFinding({ source: 'lighthouse', category: 'performance', severity: 'serious' }),
      buildFinding({ source: 'custom', category: 'privacy', severity: 'serious' }),
    ];
    // accessibility 4 of 10: not a strict majority.
    expect(resolveHookFamily(findings).family).toBe('mixed');
  });

  it('returns mixed with no findings at all', () => {
    expect(resolveHookFamily([]).family).toBe('mixed');
    expect(resolveHookFamily([]).totalWeight).toBe(0);
  });

  it('uses the locked severity weights critical 4, serious 3, moderate 2, minor 1', () => {
    const findings: Finding[] = [
      buildFinding({ source: 'custom', category: 'privacy', severity: 'critical' }),
      buildFinding({ source: 'axe', category: 'accessibility', severity: 'serious' }),
      buildFinding({ source: 'axe', category: 'accessibility', severity: 'minor' }),
    ];
    const resolution = resolveHookFamily(findings);
    expect(resolution.weightedTotals.privacy).toBe(4);
    expect(resolution.weightedTotals.accessibility).toBe(4);
    expect(resolution.totalWeight).toBe(8);
    // An exact tie at the top resolves to mixed.
    expect(resolution.family).toBe('mixed');
  });

  it('is deterministic for the same input', () => {
    const findings: Finding[] = [
      buildFinding({ source: 'axe', category: 'accessibility', severity: 'critical' }),
      buildFinding({ source: 'axe', category: 'accessibility', severity: 'serious' }),
      buildFinding({ source: 'lighthouse', category: 'performance', severity: 'moderate' }),
      buildFinding({ source: 'custom', category: 'seo', severity: 'minor' }),
    ];
    expect(resolveHookFamily(findings)).toEqual(resolveHookFamily([...findings].reverse()));
  });
});

// Issue #307: the report checks the hook against its top priority's category.
describe('hookFamilyForCategory', () => {
  it('maps each category to the family whose weight it feeds', () => {
    expect(hookFamilyForCategory('accessibility')).toBe('accessibility');
    expect(hookFamilyForCategory('performance')).toBe('speed-and-booking');
    expect(hookFamilyForCategory('rendering')).toBe('speed-and-booking');
    expect(hookFamilyForCategory('seo')).toBe('search-and-ai-visibility');
    expect(hookFamilyForCategory('geo')).toBe('search-and-ai-visibility');
  });
});
