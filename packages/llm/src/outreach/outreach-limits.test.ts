import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { OUTREACH_TOUCH_LIMITS } from './outreach-limits.js';

const OUTREACH_RULES_PATH = fileURLToPath(
  new URL('../../../../docs/outreach-rules.md', import.meta.url),
);

function readOutreachRules(): string {
  return readFileSync(OUTREACH_RULES_PATH, 'utf8');
}

describe('OUTREACH_TOUCH_LIMITS', () => {
  it('matches the touch 1 shape stated in docs/outreach-rules.md', () => {
    const doc = readOutreachRules();
    expect(doc).toContain('60');
    expect(doc).toContain('90');
    expect(OUTREACH_TOUCH_LIMITS[1].minWords).toBe(60);
    expect(OUTREACH_TOUCH_LIMITS[1].maxWords).toBe(90);
    expect(OUTREACH_TOUCH_LIMITS[1].maxLinks).toBe(1);
  });

  it('matches the touch 2 and touch 3 link limits stated in docs/outreach-rules.md', () => {
    const doc = readOutreachRules();
    expect(doc).toContain('no new link');
    expect(OUTREACH_TOUCH_LIMITS[2].maxLinks).toBe(0);
    expect(OUTREACH_TOUCH_LIMITS[2].sentences).toBe(2);
    expect(OUTREACH_TOUCH_LIMITS[3].maxLinks).toBe(0);
    expect(OUTREACH_TOUCH_LIMITS[3].sentences).toBe(1);
  });
});
