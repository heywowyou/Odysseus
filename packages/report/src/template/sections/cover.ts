import type { AuditManifest } from '@odysseus/core';
import type { StoredAnalysis } from '../../types.js';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, fillTemplate, formatDate } from '../html-utils.js';

/** The report always states its own language in that same language - a
 *  French report says "Français" regardless of what other languages are
 *  available, an English report says "English". Not user-facing choice
 *  data, just a fixed self-description, so a plain map rather than a
 *  ReportStrings entry. */
const LANGUAGE_SELF_NAME: Record<StoredAnalysis['language'], string> = {
  fr: 'Français',
  en: 'English',
};

/** Cover layout ported from docs/design/report-mockup-standalone.flat.html's
 *  COVER section (docs/report-design-tokens.md): a centered kicker/title/
 *  subtitle block over a radial-gradient ground, then a six-field grid
 *  (site, date, scope, language, standard, risk) below a short accent
 *  rule. The mockup's own "Page 1 / 16" corner label and per-severity
 *  risk glyph are deck-viewer chrome with no equivalent here and were
 *  dropped rather than ported. */
export function renderCover(strings: ReportStrings, manifest: AuditManifest, analysis: StoredAnalysis): string {
  const pagesScanned = manifest.pages.filter((page) => page.status === 'visited').length;
  const riskLabel = strings.cover.riskLevels[analysis.overallRisk];

  return `
    <header class="cover">
      <div class="cover-top">
        <span class="cover-kicker">${escapeHtml(strings.cover.kicker)}</span>
        <h1>${escapeHtml(strings.cover.reportTitle)}</h1>
        <div class="cover-subtitle">${escapeHtml(strings.cover.subtitle)}</div>
      </div>
      <div class="cover-bottom">
        <div class="cover-rule"></div>
        <div class="cover-grid">
          <div class="cover-field">
            <span class="cover-field-label">${escapeHtml(strings.cover.siteLabel)}</span>
            <span class="cover-field-value">${escapeHtml(manifest.siteUrl)}</span>
          </div>
          <div class="cover-field">
            <span class="cover-field-label">${escapeHtml(strings.cover.dateLabel)}</span>
            <span class="cover-field-value">${escapeHtml(formatDate(new Date(manifest.startedAt), analysis.language))}</span>
          </div>
          <div class="cover-field">
            <span class="cover-field-label">${escapeHtml(strings.cover.pagesScannedLabel)}</span>
            <span class="cover-field-value">${escapeHtml(fillTemplate(strings.cover.pagesScannedValueTemplate, { count: pagesScanned }))}</span>
          </div>
          <div class="cover-field">
            <span class="cover-field-label">${escapeHtml(strings.cover.languageLabel)}</span>
            <span class="cover-field-value">${escapeHtml(LANGUAGE_SELF_NAME[analysis.language])}</span>
          </div>
          <div class="cover-field">
            <span class="cover-field-label">${escapeHtml(strings.cover.wcagReferentialLabel)}</span>
            <span class="cover-field-value">WCAG 2.2 AA</span>
          </div>
          <div class="cover-field">
            <span class="cover-field-label">${escapeHtml(strings.cover.riskSmallLabel)}</span>
            <span class="risk-badge risk-${analysis.overallRisk}">${escapeHtml(riskLabel)}</span>
          </div>
        </div>
      </div>
    </header>
  `;
}
