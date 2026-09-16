import type { Finding, PreparationPreviewLanguage } from '@odysseus/core';
import type { StoredAnalysis } from '../../types.js';
import type { ReportStrings } from '../strings/i18n.js';
import {
  escapeHtml,
  fillTemplate,
  formatNumber,
  pluralize,
  renderSheetHeader,
  sheet,
} from '../html-utils.js';
import { sectionTitle, type SectionId } from '../section-registry.js';
import { selectRenderedThemes } from './themes.js';
import type { RenderedPriority } from '../rendered-priorities.js';

/** The deterministic complication facts (plan 018 step 5), all computed
 *  from inputs already in hand at render time: no manifest, no new scan,
 *  no claim about the client's bookings, traffic, or legal obligations.
 *  Criteria and verified inputs only - any conclusion stays with the
 *  reader and their counsel. */
interface IntroFacts {
  /** Distinct findings after dedupe, i.e. findings.length. */
  findingCount: number;
  /** Findings whose severity is critical or serious. */
  criticalSeriousCount: number;
  /** Distinct pages across every finding's pageUrls. Site-wide findings
   *  without page URLs can only make the real footprint larger, which the
   *  "at least" wording in the template accounts for. */
  affectedPageCount: number;
  /** Ranked priorities actually shown: the provided rendered-priorities
   *  view, or the same selection the action list below falls back to. */
  priorityCount: number;
}

function computeIntroFacts(
  analysis: StoredAnalysis,
  findings: readonly Finding[],
  priorities: readonly RenderedPriority[] | undefined,
  findingsById: ReadonlyMap<string, Finding>,
): IntroFacts {
  return {
    findingCount: findings.length,
    criticalSeriousCount: findings.filter(
      (finding) => finding.severity === 'critical' || finding.severity === 'serious',
    ).length,
    affectedPageCount: new Set(findings.flatMap((finding) => finding.pageUrls)).size,
    priorityCount: priorities
      ? priorities.length
      : selectRenderedThemes(analysis.themes, findingsById).length,
  };
}

/** Plan 018 step 5: section-00 opens the report as a Situation,
 *  Complication narrative, not a reading guide. The situation states what
 *  this diagnostic is for and how it was built; the complication states
 *  deterministic pages/findings/priorities facts plus the legal reminder
 *  pointing at the later legal section. The decision question belongs to
 *  the cover alone: issue #314 removed its repeat here, where it sat in
 *  large type between two blocks it connected to neither. P3 (2026-08-21 La Corniche feedback pass) history: the section
 *  exists to answer "why am I, the non-technical director, holding this,
 *  and what do I do with it" - structural/navigational, template-driven,
 *  no new LLM pass.
 *
 *  Two earlier removals, both de-duplication: the question's old heading
 *  (issue #52), which labelled as a question the sentence directly below
 *  it, and the former top-3 action list (issue
 *  #54), which repeated the priorities the executive summary's start-here
 *  block announces on the next page, with the detail this page never
 *  carried. The section ends on the audience roles and the scope note.
 *
 *  Audience rows are role labels only and are
 *  anchored to the new canonical order semantics: section-02 (legal
 *  exposure) now renders after the evidence, and section-14 (next steps)
 *  after it (issue #333), so each row lists its ids in canonical reading order and
 *  every display resolves through sectionTitle's live titles, never a
 *  hardcoded number. */
export function renderReportIntro(
  strings: ReportStrings,
  ordinal: number,
  analysis: StoredAnalysis,
  findings: readonly Finding[],
  priorities?: readonly RenderedPriority[],
  preparation?: PreparationPreviewLanguage,
): string {
  const r = strings.reportIntro;
  const findingsById = new Map(findings.map((finding) => [finding.findingId, finding]));
  const facts = computeIntroFacts(analysis, findings, priorities, findingsById);

  const countPhrase = (count: number, singular: string, plural: string): string =>
    `${formatNumber(count, analysis.language)} ${pluralize(analysis.language, count, singular, plural)}`;
  const complication = fillTemplate(r.complicationBodyTemplate, {
    findings: countPhrase(facts.findingCount, r.findingSingular, r.findingPlural),
    criticalSerious: formatNumber(facts.criticalSeriousCount, analysis.language),
    pages: countPhrase(facts.affectedPageCount, r.pageSingular, r.pagePlural),
    priorities: countPhrase(facts.priorityCount, r.prioritySingular, r.priorityPlural),
  });

  // The legal reminder resolves the legal section through its canonical
  // title (section-registry.ts's sectionTitle for 'section-02'), and the
  // ordinal passed in above is this section's own live display number via
  // renderSheetHeader: no hand-typed "section 2" that a reorder could
  // break (plan 018 moved section-02 behind the action synthesis).
  const legalSectionTitle = sectionTitle('section-02', strings);
  const legalReminder = fillTemplate(r.consequenceRegulatory, {
    legalSection: legalSectionTitle,
  });
  const scopeNote = fillTemplate(r.notALegalOpinionNote, {
    legalSection: legalSectionTitle,
    methodologySection: sectionTitle('section-11', strings),
  });

  // Plan 019: the automatic opening hook, only when preparation resolved
  // it from real findings evidence. Evidence-unavailable mixed copy stays
  // unrendered: it would read as a measured conclusion when it is not.
  const hookBlock =
    preparation && !preparation.hook.evidenceUnavailable
      ? `<p style="font-size:14px;font-weight:500;margin:0 0 var(--space-4);max-width:var(--measure-prose)">${escapeHtml(preparation.hook.value)}</p>`
      : '';

  // Role labels from the canonical audience map.
  const audienceRows = (
    [
      [r.roleManagementLabel, ['section-01', 'section-04', 'section-14']],
      [r.roleTechnicalLabel, ['section-04', 'section-05', 'section-12']],
      [r.roleCommunicationsLabel, ['section-04', 'section-08']],
      [r.roleLegalLabel, ['section-02', 'section-11']],
    ] as const satisfies readonly (readonly [string, readonly SectionId[]])[]
  )
    .map(([label, ids]) => {
      const sections = ids.map((id) => sectionTitle(id, strings)).join(', ');
      return `<tr><td style="padding:6px 12px 6px 0;font-size:12.5px;font-weight:500;white-space:nowrap;vertical-align:top">${escapeHtml(label)}</td><td style="padding:6px 0;font-size:12.5px;opacity:0.8">${escapeHtml(sections)}</td></tr>`;
    })
    .join('');

  return sheet(
    `
    ${renderSheetHeader(ordinal, r.eyebrow, r.heading, 'var(--space-6)')}
    ${hookBlock}
    <h5>${escapeHtml(r.situationHeading)}</h5>
    <p style="font-size:12.5px;opacity:0.9;margin:0 0 var(--space-4);max-width:var(--measure-prose)">${escapeHtml(r.situationBody)}</p>
    <h5>${escapeHtml(r.complicationHeading)}</h5>
    <p style="font-size:12.5px;opacity:0.9;margin:0 0 var(--space-2);max-width:var(--measure-prose)">${escapeHtml(complication)}</p>
    <p style="font-size:12.5px;opacity:0.9;margin:0 0 var(--space-6);max-width:var(--measure-prose)">${escapeHtml(legalReminder)}</p>
    <h5>${escapeHtml(r.audienceHeading)}</h5>
    <table style="width:100%;border-collapse:collapse;margin-bottom:var(--space-6)"><tbody>${audienceRows}</tbody></table>
    <p style="font-size:11.5px;opacity:0.6;margin:0;max-width:var(--measure-prose)">${escapeHtml(scopeNote)}</p>
  `,
    '',
    'section-00',
  );
}
