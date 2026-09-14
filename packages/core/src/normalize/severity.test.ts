import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { CUSTOM_CHECK_SEVERITY, severityFromCustom } from './severity.js';

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
