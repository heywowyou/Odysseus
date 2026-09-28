/**
 * JavaScript's `\b` and `\w` only know ASCII letters, even with the `u`
 * flag. A French word that ends in an accented letter (« pénalité »,
 * « modéré ») therefore never satisfies a trailing `\b` before a space, a
 * comma or the end of the text, and one that starts with one (« établie »)
 * never satisfies a leading `\b` after a space. Every prose guard written
 * with `\b` silently missed the correctly accented word (issue #534).
 */
const WORD_CHAR = String.raw`[\p{L}\p{N}_]`;

/** A Unicode-aware word end: no letter or number follows. */
export const WORD_END = String.raw`(?![\p{L}\p{N}])`;

const UNICODE_BOUNDARY = `(?:(?<=${WORD_CHAR})(?!${WORD_CHAR})|(?<!${WORD_CHAR})(?=${WORD_CHAR}))`;

/**
 * Rewrites a guard pattern so its `\b` and `\w` mean a Unicode word
 * boundary and a Unicode word character, and adds the `u` flag. Guard
 * tables keep the familiar `\b` spelling and wrap each entry, so a new
 * entry cannot reintroduce the ASCII pitfall. A `\b` or `\w` inside a
 * character class is refused rather than rewritten, since `[\b]` is a
 * backspace and a class cannot hold a lookaround.
 */
export function unicodeWords(pattern: RegExp): RegExp {
  let source = '';
  let inClass = false;
  for (let i = 0; i < pattern.source.length; i += 1) {
    const char = pattern.source[i];
    if (char === '\\') {
      const next = pattern.source[i + 1];
      if ((next === 'b' || next === 'w') && inClass) {
        throw new Error(`unicodeWords: \\${next} inside a character class in ${pattern}`);
      }
      if (next === 'b') source += UNICODE_BOUNDARY;
      else if (next === 'w') source += WORD_CHAR;
      else source += `\\${next ?? ''}`;
      i += 1;
      continue;
    }
    if (char === '[') inClass = true;
    else if (char === ']') inClass = false;
    source += char;
  }
  const flags = pattern.flags.includes('u') ? pattern.flags : `${pattern.flags}u`;
  return new RegExp(source, flags);
}
