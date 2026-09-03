import type { WritingPassOutput } from './writing-schema.js';

export interface ThemeKeyMismatch {
  missing: string[];
  extra: string[];
  duplicate: string[];
}

/** Correlation guard for the writing pass: every themeKey shown to the
 *  model must come back exactly once, verbatim. A non-empty mismatch is
 *  treated exactly like an invented finding ID - rejected, logged,
 *  retried. See docs/rules/llm-layer-rules.md section 9.
 *
 *  Defense in depth since issue #36, not the primary mechanism: the
 *  provider schema is now keyed by the expected theme keys
 *  (writing-output-schema.ts), so a missing, extra, or duplicate key
 *  should be unrepresentable before this ever runs. Kept because "should
 *  be" is doing real work in that sentence - a provider that silently
 *  stops honouring strict mode, or a schema-build defect, would otherwise
 *  pass unnoticed. If this guard fires again, that is a signal worth
 *  reading, not a case for patching the model's output. */
export function findThemeKeyMismatches(
  expectedThemeKeys: readonly string[],
  writingOutput: WritingPassOutput,
): ThemeKeyMismatch {
  const expected = new Set(expectedThemeKeys);
  const seen = new Set<string>();
  const duplicate = new Set<string>();
  const extra: string[] = [];

  for (const theme of writingOutput.themes) {
    if (seen.has(theme.themeKey)) duplicate.add(theme.themeKey);
    seen.add(theme.themeKey);
    if (!expected.has(theme.themeKey)) extra.push(theme.themeKey);
  }

  const missing = expectedThemeKeys.filter((key) => !seen.has(key));
  return { missing, extra, duplicate: [...duplicate] };
}

export function isThemeKeyMismatchEmpty(mismatch: ThemeKeyMismatch): boolean {
  return (
    mismatch.missing.length === 0 && mismatch.extra.length === 0 && mismatch.duplicate.length === 0
  );
}
