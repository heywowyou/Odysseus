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

export function renderCover(strings: ReportStrings, manifest: AuditManifest, analysis: StoredAnalysis): string {
  const pagesScanned = manifest.pages.filter((page) => page.status === 'visited').length;
  const riskLabel = strings.cover.riskLevels[analysis.overallRisk];

  return `
    <header class="cover">
      <div class="wordmark">ODYSSEUS</div>
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
