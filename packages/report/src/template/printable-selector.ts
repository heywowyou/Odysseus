/**
 * A CSS selector as the report prints it.
 *
 * Selectors are copied from the audited page, so they can carry text in
 * any script: the Château Royal scan reached the annex with
 * `[placeholder="メールアドレス"]`. The report embeds Avenir Next and
 * DejaVu Sans Mono, which cover Latin, Greek and Cyrillic but no East
 * Asian or other scripts, so such a character was drawn from a host font
 * (the PDF file check refuses the report) or, on a host without one, as an
 * empty box.
 *
 * A character outside those scripts is written as its CSS escape instead
 * (`\30E1 `). The printed selector still matches the same element when a
 * developer pastes it into the browser's console.
 */
const PRINTABLE_SCRIPTS = /[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}]/u;
const COMMON_OR_INHERITED = /[\p{Script=Common}\p{Script=Inherited}]/u;
const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;
/** Common-script punctuation from U+2E80 onward is CJK or fullwidth
 *  punctuation (、。！), which the embedded faces lack too. */
const FIRST_EAST_ASIAN_CODE_POINT = 0x2e80;

function isPrintable(char: string): boolean {
  if (PRINTABLE_SCRIPTS.test(char)) return true;
  if (!COMMON_OR_INHERITED.test(char) || PICTOGRAPHIC.test(char)) return false;
  return char.codePointAt(0)! < FIRST_EAST_ASIAN_CODE_POINT;
}

export function printableSelector(selector: string): string {
  let out = '';
  for (const char of selector) {
    out += isPrintable(char) ? char : `\\${char.codePointAt(0)!.toString(16).toUpperCase()} `;
  }
  return out;
}
