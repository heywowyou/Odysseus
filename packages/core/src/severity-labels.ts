import type { ReportLanguage } from './types/llm-output.js';
import type { Severity } from './types/findings.js';

/**
 * Issue #554: the one definition of the client-facing severity words. The
 * report's tiles and statistics, the outreach preview, the writing pass's
 * vocabulary guard and (by a parity test, since the dashboard build reads no
 * workspace package) the dashboard all use these. They once drifted: the
 * guard banned « sérieux » after the report had switched to it.
 */
export const SEVERITY_LABELS: Readonly<Record<ReportLanguage, Readonly<Record<Severity, string>>>> =
  {
    fr: { critical: 'critique', serious: 'sérieux', moderate: 'modéré', minor: 'mineur' },
    en: { critical: 'critical', serious: 'serious', moderate: 'moderate', minor: 'minor' },
  };

/** The same words as tile and column headings, capitalized. */
export function severityHeadings(language: ReportLanguage): Record<Severity, string> {
  const labels = SEVERITY_LABELS[language];
  const heading = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
  return {
    critical: heading(labels.critical),
    serious: heading(labels.serious),
    moderate: heading(labels.moderate),
    minor: heading(labels.minor),
  };
}
