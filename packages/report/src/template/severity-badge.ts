import type { Severity } from '@odysseus/core';
import type { ReportStrings } from './strings/i18n.js';
import { escapeHtml } from './html-utils.js';

/** Triangle, diamond, filled circle, hollow circle: legible in greyscale
 *  and to colour-blind readers without relying on the badge's colour
 *  alone. See docs/report-v2-refactor.md R4 (fixes E33, WCAG 1.4.1's own
 *  criterion applied to the report itself). */
export const SEVERITY_GLYPH: Record<Severity, string> = {
  critical: '&#9650;', // ▲
  serious: '&#9670;', // ◆
  moderate: '&#9679;', // ●
  minor: '&#9675;', // ○
};

const SEVERITY_CLASS: Record<Severity, string> = {
  critical: 'sev-critical',
  serious: 'sev-serious',
  moderate: 'sev-moderate',
  minor: 'sev-minor',
};

export function renderSeverityBadge(strings: ReportStrings, severity: Severity): string {
  const label = strings.findingsAppendix.severityLabels[severity];
  return `<span class="badge ${SEVERITY_CLASS[severity]}">${SEVERITY_GLYPH[severity]}&nbsp;${escapeHtml(label)}</span>`;
}
