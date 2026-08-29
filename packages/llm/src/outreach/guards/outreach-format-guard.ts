import type { ProseField } from '../../prose-fields.js';

/**
 * Outreach prose is plain-text email body content, never Markdown or HTML,
 * and never carries its own link or reply address - the single preview
 * link (touch 1) and the reply address are spliced by the assembler
 * outside the model's fields, so any URL or email address in a field is
 * always a leak, never a legitimate answer. Checked in a fixed rule order
 * per field so a field matching several rules still reports one reason.
 */
export interface OutreachFormatViolation {
  field: string;
  text: string;
  rule: 'html' | 'email' | 'url' | 'markdown';
  matched: string;
}

const HTML_PATTERN = /<\s*\/?\s*[a-z][^>]*>/i;
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const URL_PATTERN = /https?:\/\/\S+|www\.\S+/i;
const MARKDOWN_PATTERNS: readonly RegExp[] = [
  /\*\*[^*]+\*\*/,
  /(?<!\w)_[^_]+_(?!\w)/,
  /^#{1,6}\s/m,
  /\[[^\]]+\]\([^)]+\)/,
  /^[-*]\s/m,
];

export function findOutreachFormatViolations(
  fields: readonly ProseField[],
): OutreachFormatViolation[] {
  const violations: OutreachFormatViolation[] = [];

  for (const { field, text } of fields) {
    const htmlMatch = text.match(HTML_PATTERN);
    if (htmlMatch) {
      violations.push({ field, text, rule: 'html', matched: htmlMatch[0] });
      continue;
    }
    const emailMatch = text.match(EMAIL_PATTERN);
    if (emailMatch) {
      violations.push({ field, text, rule: 'email', matched: emailMatch[0] });
      continue;
    }
    const urlMatch = text.match(URL_PATTERN);
    if (urlMatch) {
      violations.push({ field, text, rule: 'url', matched: urlMatch[0] });
      continue;
    }
    for (const pattern of MARKDOWN_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        violations.push({ field, text, rule: 'markdown', matched: match[0] });
        break;
      }
    }
  }

  return violations;
}
