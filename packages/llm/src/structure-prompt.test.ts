import { describe, expect, it } from 'vitest';
import { buildStructureSystemPrompt } from './structure-prompt.js';

/**
 * Issue #297: a real Haaitza report filed an automatic page reload under a
 * theme about link and image text, heading-structure findings under a theme
 * about language annotations, and a layout-stability metric under a theme
 * about loading time. The prompt asked only for "roughly 8 to 15 themes",
 * which reads as a size target; the grouping rule itself was never stated.
 */
describe('structure prompt theme coherence (issue #297)', () => {
  it('states that a theme is one remediation job', () => {
    const prompt = buildStructureSystemPrompt(false);

    expect(prompt).toContain('A theme is one remediation job');
    expect(prompt).toContain('fixing one is the same task as fixing the other');
  });

  it('says a poorly fitting finding gets its own theme or none, rather than padding one', () => {
    const prompt = buildStructureSystemPrompt(false);

    expect(prompt).toContain('even when it means one finding gets a theme of its own');
    expect(prompt).toContain('Never pad a theme with unrelated rules to reach a size');
    expect(prompt).toContain('better left ungrouped than filed under one they contradict');
  });

  it('keeps the rule in both the fallback-context and normal variants', () => {
    for (const usedFallbackContext of [true, false]) {
      expect(buildStructureSystemPrompt(usedFallbackContext)).toContain(
        'A theme is one remediation job',
      );
    }
  });
});
