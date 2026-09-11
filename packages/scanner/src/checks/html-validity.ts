/**
 * C7 (2026-08-24): structural HTML validity, checked locally.
 *
 * The W3C validator was considered and rejected in the milestone 8.6 tool
 * survey, correctly: it is a rate-limited public service not meant for
 * per-audit automation. `html-validate` is the same capability as an npm
 * package, running offline against `page.content()` inside the existing
 * onRenderedPage hook - no network, no second headless browser, no
 * third-party service seeing a client's markup.
 *
 * Rules are chosen by an explicit ALLOWLIST, never by taking a preset
 * wholesale. This is CLAUDE.md trade-off 1's lesson applied before the
 * fact rather than after: Lighthouse's `seo` category smuggled
 * `image-alt` past a category-level exclusion and duplicated axe's own
 * finding with a different severity, and `html-validate:recommended`
 * would do the same thing - its `wcag/h37` rule is literally "<img> is
 * missing required alt attribute", confirmed firing on a probe.
 *
 * Two kinds of rule are excluded on principle:
 *
 *   - Anything under `wcag/`. axe-core owns accessibility here and audits
 *     the same page directly. Emitting both produces duplicate findings
 *     with two severity mappings for one defect.
 *   - Style preferences (`doctype-style` wanting an uppercase DOCTYPE,
 *     attribute quoting, tag case). These are not defects, and a client
 *     paying for an audit should not be handed a house-style opinion
 *     dressed as a finding.
 *
 * What is left is markup that is genuinely malformed: duplicate ids,
 * elements closed in the wrong order, content in a parent that cannot
 * contain it. Each changes how a parser builds the DOM, which is why it
 * matters to a crawler, an assistive technology and an AI engine alike.
 *
 * Note on WCAG: none of these carries a criterion. 4.1.1 (Parsing) used
 * to cover exactly this and was REMOVED in WCAG 2.2, on the reasoning
 * that modern parsers recover from most of it. Tagging these 4.1.1 would
 * cite a criterion that no longer exists in the referential this audit
 * states on its own cover. They are real defects; they are simply not
 * conformance failures, and the report says so by not claiming one.
 */

import type { Page } from 'playwright';
import { HtmlValidate, type Message } from 'html-validate';

/**
 * Confirmed against real html-validate output (v11) rather than copied
 * from its docs. Add a rule here only after seeing it fire on real markup
 * and confirming axe does not already report the same defect.
 */
const ALLOWED_RULES: ReadonlySet<string> = new Set([
  // Duplicate ids break every `for=`, `aria-labelledby` and
  // `aria-describedby` pointing at them, and break in-page anchors. axe
  // deprecated its own `duplicate-id`/`duplicate-id-active`, keeping only
  // `duplicate-id-aria`, so the general case is a real gap, not overlap.
  'no-dup-id',
  'no-dup-attr',
  // Malformed nesting: the parser silently builds a different tree from
  // the one the author wrote.
  'close-order',
  'no-implicit-close',
  'unclosed-element',
  'element-permitted-content',
  'element-permitted-parent',
  'element-permitted-occurrences',
  'void-content',
  'attr-delimiter',
]);

export interface HtmlValidityIssue {
  ruleId: string;
  message: string;
  line: number;
  column: number;
}

export interface HtmlValidityCheckResult {
  pageUrl: string;
  checked: boolean;
  /** Total reportable issues found, before the listing cap below. */
  issueCount: number;
  issues: HtmlValidityIssue[];
  checkError?: string;
}

/** More than this from one page is a template defect repeated by a loop,
 *  not distinct problems. The count above is still reported in full;
 *  only the listing is capped, so the annex can never inherit the
 *  unbounded-cell problem A4 was needed to fix. */
const MAX_REPORTED_ISSUES = 20;

const validator = new HtmlValidate({
  root: true,
  extends: ['html-validate:recommended'],
});

function selectReportableMessages(messages: readonly Message[]): HtmlValidityIssue[] {
  return messages
    .filter(
      (message): message is Message & { ruleId: string } =>
        message.ruleId !== undefined && ALLOWED_RULES.has(message.ruleId),
    )
    .map((message) => ({
      ruleId: message.ruleId,
      message: message.message,
      line: message.line,
      column: message.column,
    }));
}

export async function checkHtmlValidity(
  page: Page,
  pageUrl: string,
): Promise<HtmlValidityCheckResult> {
  try {
    const html = await page.content();
    const report = await validator.validateString(html);
    const issues = selectReportableMessages(report.results.flatMap((result) => result.messages));
    return {
      pageUrl,
      checked: true,
      issueCount: issues.length,
      issues: issues.slice(0, MAX_REPORTED_ISSUES),
    };
  } catch (error) {
    return {
      pageUrl,
      checked: false,
      issueCount: 0,
      issues: [],
      checkError: error instanceof Error ? error.message : String(error),
    };
  }
}
