import type { Severity } from '@odysseus/core';
import type { ReportStrings } from './strings/i18n.js';
import { escapeHtml } from './html-utils.js';
import { SEVERITY } from './design-tokens.js';

/** `.tag` (nocturne.css) coloured per design-tokens.ts's SEVERITY map,
 *  matching report.reference.html's own severity tag markup exactly
 *  (`<span class="tag" style="background:{{bg}};color:{{color}}">{{label}}</span>`).
 *  Colour is never the only differentiator: the label text is always
 *  present alongside it (WCAG 1.4.1). */
export function renderSeverityBadge(strings: ReportStrings, severity: Severity): string {
  const label = strings.findingsAppendix.severityLabels[severity];
  const { color, bg } = SEVERITY[severity];
  return `<span class="tag" data-report-severity="${severity}" style="background:${bg};color:${color}">${escapeHtml(label)}</span>`;
}
