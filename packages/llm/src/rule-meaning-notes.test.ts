import { ALT_TEXT_QUALITY_HEURISTIC_RULE_ID } from '@odysseus/core';
import { describe, expect, it } from 'vitest';
import { buildRuleMeaningNote } from './rule-meaning-notes.js';

describe('buildRuleMeaningNote', () => {
  it('returns an empty string when no shown rule ID has a note', () => {
    expect(buildRuleMeaningNote(new Set(['some-other-rule']), 'fr')).toBe('');
  });

  it('returns the French note when the alt-text heuristic rule is shown', () => {
    const note = buildRuleMeaningNote(new Set([ALT_TEXT_QUALITY_HEURISTIC_RULE_ID]), 'fr');
    expect(note).toContain('alt-text-quality-heuristic');
    expect(note).toContain('un signal à vérifier manuellement');
  });

  it('returns the English note when the language is English', () => {
    const note = buildRuleMeaningNote(new Set([ALT_TEXT_QUALITY_HEURISTIC_RULE_ID]), 'en');
    expect(note).toContain('a signal worth checking manually');
  });

  it('ignores unrelated rule IDs shown alongside a known one', () => {
    const note = buildRuleMeaningNote(
      new Set(['some-other-rule', ALT_TEXT_QUALITY_HEURISTIC_RULE_ID]),
      'fr',
    );
    expect(note).toContain('alt-text-quality-heuristic');
  });
});
