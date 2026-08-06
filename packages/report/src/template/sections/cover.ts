import type { AuditManifest } from '@odysseus/core';
import type { StoredAnalysis } from '../../types.js';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, formatDate } from '../html-utils.js';

/** The report always states its own language in that same language - a
 *  French report says "Français" regardless of what other languages are
 *  available, an English report says "English". Not user-facing choice
 *  data, just a fixed self-description, so a plain map rather than a
 *  ReportStrings entry. */
const LANGUAGE_SELF_NAME: Record<StoredAnalysis['language'], string> = {
  fr: 'Français',
  en: 'English',
};

const RISK_GLYPH: Record<StoredAnalysis['overallRisk'], string> = {
  high: '&#9650;', // triangle, same glyph as sev-critical
  medium: '&#9670;', // diamond, same glyph as sev-serious
  low: '&#9679;', // filled circle, same glyph as sev-moderate
};

/** Inline, self-contained per docs/report-v2-refactor.md's zero-network-
 *  render rule - a meander (Greek key) pattern under the wordmark, from
 *  docs/report-v2-prototype-haaitza-fr.html verbatim. */
const MEANDER_SVG = `<svg class="meander" viewBox="0 0 240 12" aria-hidden="true" preserveAspectRatio="xMinYMid meet"><path fill="none" stroke="currentColor" stroke-width="1.4" d="M0 11 H6 V1 H18 V8 H12 V5 M18 1 H30 V11 H24 M30 11 H36 V1 H48 V8 H42 V5 M48 1 H60 V11 H54 M60 11 H66 V1 H78 V8 H72 V5 M78 1 H90 V11 H84 M90 11 H96 V1 H108 V8 H102 V5 M108 1 H120 V11 H114 M120 11 H126 V1 H138 V8 H132 V5 M138 1 H150 V11 H144 M150 11 H156 V1 H168 V8 H162 V5 M168 1 H180 V11 H174 M180 11 H186 V1 H198 V8 H192 V5 M198 1 H210 V11 H204 M210 11 H216 V1 H228 V8 H222 V5 M228 1 H240 V11 H234"/></svg>`;

export function renderCover(strings: ReportStrings, manifest: AuditManifest, analysis: StoredAnalysis): string {
  const pagesScanned = manifest.pages.filter((page) => page.status === 'visited').length;
  const riskLabel = strings.cover.riskLevels[analysis.overallRisk];

  return `
    <header class="cover">
      <div>
        <div class="wordmark">ODYSSEUS</div>
        ${MEANDER_SVG}
      </div>
      <div class="cover-mid">
        <span class="eyebrow">${escapeHtml(strings.cover.eyebrow)}</span>
        <h1>${escapeHtml(strings.cover.reportTitle)}</h1>
        <div class="cover-url">${escapeHtml(manifest.siteUrl)}</div>
        <div class="risk risk-${analysis.overallRisk}">
          <span>${RISK_GLYPH[analysis.overallRisk]}</span>
          <span><small>${escapeHtml(strings.cover.riskSmallLabel)}</small>${escapeHtml(riskLabel)}</span>
        </div>
      </div>
      <div class="cover-meta">
        <div><b>${escapeHtml(formatDate(new Date(manifest.startedAt), analysis.language))}</b>${escapeHtml(strings.cover.dateLabel)}</div>
        <div><b>${pagesScanned}</b>${escapeHtml(strings.cover.pagesScannedLabel)}</div>
        <div><b>${escapeHtml(LANGUAGE_SELF_NAME[analysis.language])}</b>${escapeHtml(strings.cover.languageLabel)}</div>
        <div><b>WCAG 2.2 AA</b>${escapeHtml(strings.cover.wcagReferentialLabel)}</div>
      </div>
    </header>
  `;
}
