import { describe, expect, it } from 'vitest';
import { outreachPreviewStringsV2 } from './strings-v2.js';

/** Same guards as the v1 strings-parity test, pointed at the v2 scorecard
 *  strings: key parity, non-empty leaves, no language leakage, and the
 *  trade-off 29 no-break-space rule. */
function flatten(value: unknown, prefix = ''): Record<string, string> {
  if (typeof value === 'string') return { [prefix]: value };
  const out: Record<string, string> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    Object.assign(out, flatten(child, prefix === '' ? key : `${prefix}.${key}`));
  }
  return out;
}

const FR = flatten(outreachPreviewStringsV2('fr'));
const EN = flatten(outreachPreviewStringsV2('en'));

describe('the v2 scorecard strings', () => {
  it('define the same keys in both languages', () => {
    expect(Object.keys(FR).sort()).toEqual(Object.keys(EN).sort());
  });

  it('leave no value empty', () => {
    for (const [key, value] of Object.entries({ ...FR, ...EN })) {
      expect(value.trim(), key).not.toBe('');
    }
  });

  it('never reuse the English string as the French one', () => {
    for (const key of Object.keys(FR)) {
      const fr = FR[key] as string;
      if (fr.split(' ').length < 5) continue;
      expect(fr, key).not.toBe(EN[key]);
    }
  });

  it('carry no em or en dash, and no narrow no-break space', () => {
    for (const [key, value] of Object.entries({ ...FR, ...EN })) {
      expect(value, key).not.toMatch(/[\u2013\u2014]/u);
      expect(value, key).not.toContain('\u202f');
    }
  });
});
