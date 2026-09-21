import { getCriterionName } from '@odysseus/llm';
import { ARTICLE_47_REGIME_ID } from '@odysseus/core';
import type {
  AuditManualFields,
  Finding,
  ObligationAssessment,
  ReportLanguage,
} from '@odysseus/core';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, fillTemplate, renderSheetHeader, sheet } from '../html-utils.js';
import { buildConformanceRollup } from '../conformance-rollup.js';
import { SEVERITY } from '../design-tokens.js';
import { sectionTitle } from '../section-registry.js';
import { pickPrimaryBasis } from './methodology.js';

function headCell(label: string, extra = ''): string {
  return `<div style="padding:var(--space-2);font-size:11px;letter-spacing:0.02em;text-transform:uppercase;color:color-mix(in srgb, var(--color-text) 60%, transparent);border-bottom:1px solid var(--color-divider);${extra}">${escapeHtml(label)}</div>`;
}

function cell(html: string, extra = '', attributes = ''): string {
  return `<div ${attributes}style="padding:var(--space-2);border-bottom:1px solid var(--color-divider);${extra}">${html}</div>`;
}

function fieldRow(label: string, value: string): string {
  return `
    <div>
      <h5>${escapeHtml(label)}</h5>
      <p style="font-size:13px;opacity:0.7">${escapeHtml(value)}</p>
    </div>
  `;
}

/** item 19: the déclaration d'accessibilité and RGAA belong to article 47
 *  (loi n° 2005-102), never to the EAA/SMB route - a client resolved to
 *  EAA has no article-47 obligations and this artifact does not apply to
 *  them at all. Renders '' (the whole section-10 sheet then never
 *  exists, per render-html.ts's section-registry pattern from Session A)
 *  unless the resolved regime (methodology.ts's pickPrimaryBasis) is
 *  article 47. What the correct EAA-route information-obligation
 *  deliverable should be is not decided this session (flagged in the
 *  feedback doc as a Jules decision); suppressing is the safe default
 *  rather than shipping a wrong-regime artifact. */
export function isArticle47Regime(assessment: ObligationAssessment | undefined): boolean {
  if (!assessment || (assessment.status !== 'in_scope' && assessment.status !== 'likely_in_scope'))
    return false;
  const basis = pickPrimaryBasis(assessment);
  return basis?.regimeId === ARTICLE_47_REGIME_ID;
}

/** A draft accessibility statement skeleton, one row per WCAG criterion
 *  the scan actually found failing. The status column is always the same
 *  fixed label: buildConformanceRollup only ever lists a criterion when
 *  at least one finding failed it (conformance-rollup.ts), so
 *  "non-conformant" restates that fact rather than adding a new legal
 *  judgment - same reasoning conformance-summary.ts already documents for
 *  its own rows. Client fills in the rest before publishing.
 *
 *  item 20: per-criterion status is the binary conforme/non-conforme
 *  RGAA and EN 301 549 actually use - the old "Non conforme
 *  (partiellement)" blended that with the whole-document three-value
 *  rating (totalement/partiellement/non conforme) into a string that
 *  exists in neither vocabulary. */
export function renderAccessibilityStatement(
  strings: ReportStrings,
  ordinal: number,
  language: ReportLanguage,
  findings: Finding[],
  obligationAssessment: ObligationAssessment | undefined,
  manualFields?: AuditManualFields,
  scopePageUrls?: ReadonlySet<string>,
): string {
  if (!isArticle47Regime(obligationAssessment)) return '';

  const a = strings.accessibilityStatement;
  // Issue #291: same visited-scope confinement as every other page count.
  const rows = buildConformanceRollup(findings, scopePageUrls);
  // item 4: reads the live title of the priorities section (section-04)
  // from the same registry the TOC uses, instead of quoting a fixed
  // string that could (and did) drift from the section's actual name.
  const remediationPlanBody = fillTemplate(a.remediationPlanBodyTemplate, {
    section: sectionTitle('section-04', strings),
  });
  // item 21: a 'detected' (scraped) contact email is a decision the
  // client needs to make about a document they might publish as-is - it
  // never renders as a finished value, only as an explicit "to confirm"
  // field. An 'operator' (Jules-confirmed) value renders as final, and
  // an absent field falls back to the generic to-complete copy, same as
  // before.
  const contactField = manualFields?.declarationContactEmail;
  const contactBody =
    contactField === undefined
      ? a.contactBody
      : contactField.provenance === 'detected'
        ? fillTemplate(a.contactEmailToConfirmTemplate, { email: contactField.value })
        : contactField.value;

  const tableRows = rows
    .map(
      (row) => `
        <div class="row-atomic">
          ${cell(`${escapeHtml(row.criterion)} - ${escapeHtml(getCriterionName(row.criterion, language) ?? '')}`)}
          ${cell(escapeHtml(a.nonConformantLabel), `color:${SEVERITY.critical.color}`, 'data-report-severity="critical"')}
        </div>
      `,
    )
    .join('');

  return sheet(
    `
    ${renderSheetHeader(ordinal, a.eyebrow, a.heading, 'var(--space-2)')}
    <p style="font-size:12px;opacity:0.55;margin-bottom:var(--space-6)">${escapeHtml(a.intro)}</p>
    <div style="display:grid;grid-template-columns:1fr 220px;font-size:14px;margin-bottom:var(--space-6)">
      ${headCell(a.criterionColumnLabel)}
      ${headCell(a.statusColumnLabel)}
      ${tableRows}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-6);margin-bottom:var(--space-6)">
      ${fieldRow(a.firstPublicationDateLabel, a.toCompletePlaceholder)}
      ${fieldRow(a.technologiesLabel, a.toCompletePlaceholder)}
      ${fieldRow(a.testEnvironmentLabel, a.toCompletePlaceholder)}
      ${fieldRow(a.nonAccessibleContentLabel, a.toCompletePlaceholder)}
      ${fieldRow(a.feedbackProcedureLabel, a.toCompletePlaceholder)}
      ${fieldRow(a.recoursePathLabel, a.toCompletePlaceholder)}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-6)">
      <div>
        <h5>${escapeHtml(a.contactHeading)}</h5>
        <p style="font-size:13px;opacity:0.7">${escapeHtml(contactBody)}</p>
      </div>
      <div>
        <h5>${escapeHtml(a.remediationPlanHeading)}</h5>
        <p style="font-size:13px;opacity:0.7">${escapeHtml(remediationPlanBody)}</p>
      </div>
    </div>
  `,
    '',
    'section-10',
  );
}
