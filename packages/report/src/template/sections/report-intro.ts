import type { Finding } from '@odysseus/core';
import type { StoredAnalysis } from '../../types.js';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, fillTemplate, renderSheetHeader, sheet } from '../html-utils.js';
import { sectionTitle } from '../section-registry.js';
import { selectRenderedThemes } from './themes.js';
import { detectFindingVendor, isThirdPartyFinding } from '../third-party-attribution.js';

const TOP_ACTION_COUNT = 3;

/**
 * P3 (2026-08-21 La Corniche feedback pass): the résumé (section-01)
 * answers "what did you find" - nothing in the report answered "why am
 * I, the non-technical director, holding this, and what do I do with
 * it." A new section-00, before the résumé. Structural/navigational, not
 * analytical: template-driven, no new LLM pass - "Vos trois prochaines
 * actions" reuses section-04's own top-3-theme data (title, effort,
 * first-party/third-party ownership) rather than regenerating anything,
 * so it can never drift out of sync with the priorities section.
 */
export function renderReportIntro(
  strings: ReportStrings,
  ordinal: number,
  analysis: StoredAnalysis,
  findings: readonly Finding[],
): string {
  const r = strings.reportIntro;
  const findingsById = new Map(findings.map((finding) => [finding.findingId, finding]));

  const audienceRows = (
    [
      ['section-01', 'section-02', 'section-04', 'section-14'],
      ['section-04', 'section-10', 'section-12'],
      ['section-02'],
    ] as const
  )
    .map((ids, i) => {
      const labels = [r.audienceYouLabel, r.audienceAgencyLabel, r.audienceCounselLabel][i]!;
      const sections = ids.map((id) => sectionTitle(id, strings)).join(', ');
      return `<tr><td style="padding:6px 12px 6px 0;font-size:12.5px;font-weight:500;white-space:nowrap;vertical-align:top">${escapeHtml(labels)}</td><td style="padding:6px 0;font-size:12.5px;opacity:0.8">${escapeHtml(sections)}</td></tr>`;
    })
    .join('');

  const measuresList = [r.measuresAccessibility, r.measuresSeo, r.measuresGeo, r.measuresRendering]
    .map((line) => `<li style="margin-bottom:6px">${escapeHtml(line)}</li>`)
    .join('');

  const consequencesList = [r.consequenceBooking, r.consequenceRegulatory, r.consequenceVisibility]
    .map((line) => `<li style="margin-bottom:6px">${escapeHtml(line)}</li>`)
    .join('');

  const topThemes = selectRenderedThemes(analysis.themes, findingsById).slice(0, TOP_ACTION_COUNT);
  const actionsList = topThemes
    .map((theme) => {
      const themeFindings = theme.findingIds.map((id) => findingsById.get(id)).filter((f): f is Finding => f !== undefined);
      const contact = whoToContact(strings, themeFindings);
      const effortLabel = strings.themes.effortImpactLevels[theme.effort];
      const text = fillTemplate(r.nextActionItemTemplate, { title: theme.title, contact, effort: effortLabel });
      return `<li style="margin-bottom:8px">${escapeHtml(text)}</li>`;
    })
    .join('');

  return sheet(`
    ${renderSheetHeader(ordinal, r.eyebrow, r.heading)}
    <h5>${escapeHtml(r.audienceHeading)}</h5>
    <table style="width:100%;border-collapse:collapse;margin-bottom:var(--space-5)"><tbody>${audienceRows}</tbody></table>
    <h5>${escapeHtml(r.measuresHeading)}</h5>
    <ul style="margin:0 0 var(--space-5);padding-left:1.2em;font-size:12.5px;opacity:0.9">${measuresList}</ul>
    <h5>${escapeHtml(r.consequencesHeading)}</h5>
    <ul style="margin:0 0 var(--space-5);padding-left:1.2em;font-size:12.5px;opacity:0.9">${consequencesList}</ul>
    <p style="font-size:11.5px;opacity:0.6;margin-bottom:var(--space-5)">${escapeHtml(r.notALegalOpinionNote)}</p>
    ${
      actionsList
        ? `<h5>${escapeHtml(r.nextActionsHeading)}</h5><ol style="margin:0;padding-left:1.2em;font-size:12.5px;opacity:0.9">${actionsList}</ol>`
        : ''
    }
  `, 'sheet-standalone', 'section-00');
}

/** Same first-party/third-party classification renderOwnershipSplitNote
 *  (themes.ts) uses, reduced to a single "who to contact" phrase for this
 *  page's action list rather than a full split sentence. */
function whoToContact(strings: ReportStrings, themeFindings: readonly Finding[]): string {
  const r = strings.reportIntro;
  const thirdParty = themeFindings.filter((f) => isThirdPartyFinding(f));
  const firstParty = themeFindings.filter((f) => !isThirdPartyFinding(f));

  if (thirdParty.length > 0 && firstParty.length === 0) {
    const vendors = [...new Set(thirdParty.map((f) => detectFindingVendor(f)).filter((v): v is string => v !== undefined))];
    return vendors.length > 0 ? vendors.join(', ') : r.contactUnknownVendor;
  }
  if (thirdParty.length > 0 && firstParty.length > 0) {
    return r.contactAgencyAndVendor;
  }
  return r.contactAgency;
}
