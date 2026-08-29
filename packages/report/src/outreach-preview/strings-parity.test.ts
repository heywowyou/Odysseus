import { describe, expect, it } from 'vitest';
import { outreachPreviewStrings } from './strings.js';

const NO_BREAK_SPACE = '\u00a0';
const NARROW_NO_BREAK_SPACE = '\u202f';

/** Every leaf string, keyed by its path, so a missing nested key is as visible
 *  as a missing top-level one. */
function flatten(value: unknown, prefix = ''): Record<string, string> {
  if (typeof value === 'string') return { [prefix]: value };
  const out: Record<string, string> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    Object.assign(out, flatten(child, prefix === '' ? key : `${prefix}.${key}`));
  }
  return out;
}

const FR = flatten(outreachPreviewStrings('fr'));
const EN = flatten(outreachPreviewStrings('en'));

describe('the preview strings', () => {
  it('define the same keys in both languages', () => {
    expect(Object.keys(FR).sort()).toEqual(Object.keys(EN).sort());
  });

  it('leave no value empty', () => {
    for (const [key, value] of Object.entries({ ...FR, ...EN })) {
      expect(value.trim(), key).not.toBe('');
    }
  });

  it('never reuse the English string as the French one', () => {
    // A key-parity test passes happily when someone copies English into fr.ts.
    // Proper nouns and the shared contact address legitimately match, so only
    // real sentences are compared.
    for (const key of Object.keys(FR)) {
      const fr = FR[key] as string;
      if (fr.split(' ').length < 5) continue;
      expect(fr, key).not.toBe(EN[key]);
    }
  });

  it('uses a no-break space inside every French guillemet pair', () => {
    // Trade-off 29: U+00A0, never U+202F, which risks a missing glyph.
    for (const value of Object.values(FR)) {
      for (const match of value.matchAll(/«(.)/gsu)) {
        expect(match[1]).toBe(NO_BREAK_SPACE);
      }
      for (const match of value.matchAll(/(.)»/gsu)) {
        expect(match[1]).toBe(NO_BREAK_SPACE);
      }
      expect(value).not.toContain(NARROW_NO_BREAK_SPACE);
    }
  });
});
