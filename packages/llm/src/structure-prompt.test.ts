import { describe, expect, it } from 'vitest';
import { buildStructureSystemPrompt } from './structure-prompt.js';
import { MAX_STRUCTURE_THEMES } from './structure-schema.js';

/**
 * Issue #297: a real Haaitza report filed an automatic page reload under a
 * theme about link and image text, heading-structure findings under a theme
 * about language annotations, and a layout-stability metric under a theme
 * about loading time. Plan 067 now uses a soft 5-8 target while keeping
 * remediation coherence authoritative over the count.
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

  it('uses a soft 5 to 8 theme target with explicit exceptions instead of a quota', () => {
    const prompt = buildStructureSystemPrompt(false);

    expect(prompt).toContain('soft target of 5 to 8 themes');
    expect(prompt).toContain('guidance, not a hard quota');
    expect(prompt).toContain('use fewer');
    expect(prompt).toContain('use more');
  });

  it('keeps the rule in both the fallback-context and normal variants', () => {
    for (const usedFallbackContext of [true, false]) {
      expect(buildStructureSystemPrompt(usedFallbackContext)).toContain(
        'A theme is one remediation job',
      );
    }
  });
});

/** A 596-page site's structure pass returned more than 20 themes on all
 *  three attempts because neither the prompt nor the API schema stated the
 *  ceiling the Zod authority enforces. */
describe('structure theme ceiling', () => {
  it('states the ceiling as a hard limit and says what to do beyond it', () => {
    for (const usedFallbackContext of [true, false]) {
      const prompt = buildStructureSystemPrompt(usedFallbackContext);
      expect(prompt).toContain(`Never return more than ${MAX_STRUCTURE_THEMES} themes`);
      expect(prompt).toContain(
        'leave the findings of the lowest-priority remaining jobs ungrouped',
      );
    }
  });
});
