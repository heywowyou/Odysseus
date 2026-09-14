import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { CUSTOM_CHECK_SEVERITY, severityFromCustom, severityFromLighthouse } from './severity.js';
import type { Severity } from '../types/findings.js';
import { PROPERTY_TEST_PARAMETERS } from '../property-test-support.js';

const ALLOWED_SEVERITIES: readonly Severity[] = ['critical', 'serious', 'moderate', 'minor'];

const normalizeDir = path.dirname(fileURLToPath(import.meta.url));

function customRuleIdsDeclaredByNormalizers(): string[] {
  const ruleIds: string[] = [];
  const declaration = /\bconst\s+[A-Z0-9_]+_RULE_ID\s*=\s*['"]([^'"]+)['"]/g;

  for (const entry of readdirSync(normalizeDir)) {
    if (!entry.startsWith('normalize-') || !entry.endsWith('.ts') || entry.endsWith('.test.ts')) {
      continue;
    }

    const source = readFileSync(path.join(normalizeDir, entry), 'utf8');
    if (!source.includes('severityFromCustom(')) continue;

    for (const match of source.matchAll(declaration)) {
      if (match[1]) ruleIds.push(match[1]);
    }
  }

  return ruleIds;
}

describe('severityFromCustom', () => {
  it('keeps every custom rule declared by a normalizer mapped', () => {
    const declaredRuleIds = customRuleIdsDeclaredByNormalizers();
    const unmapped = declaredRuleIds.filter(
      (ruleId) => CUSTOM_CHECK_SEVERITY[ruleId] === undefined,
    );

    expect(declaredRuleIds.length).toBeGreaterThan(0);
    expect(unmapped).toEqual([]);
  });

  it('warns loudly and defaults to moderate for an unmapped rule', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(severityFromCustom('unmapped-test-rule')).toBe('moderate');
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      '[severity] custom check "unmapped-test-rule" has no severity mapping, defaulting to moderate',
    );

    warn.mockRestore();
  });
});

describe('severityFromLighthouse', () => {
  it('always returns a value on the unified severity scale, for any score/weight', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constant(null), fc.float({ min: 0, max: 1, noNaN: true })),
        fc.float({ min: 0, max: Math.fround(100), noNaN: true }),
        (score, weight) => {
          const severity = severityFromLighthouse(score, weight);
          expect(ALLOWED_SEVERITIES).toContain(severity);
        },
      ),
      PROPERTY_TEST_PARAMETERS,
    );
  });

  it('never lets a weight below 10 produce critical', () => {
    // A low-weight Lighthouse audit is capped (see severity.ts): weight < 3
    // caps at 'moderate', weight < 10 caps at 'serious'. Regardless of how
    // badly the audit failed, 'critical' requires weight >= 10.
    fc.assert(
      fc.property(
        fc.float({ min: 0, max: 1, noNaN: true }),
        fc.float({ min: 0, max: Math.fround(9.999), noNaN: true }),
        (score, weight) => {
          expect(severityFromLighthouse(score, weight)).not.toBe('critical');
        },
      ),
      PROPERTY_TEST_PARAMETERS,
    );
  });
});
