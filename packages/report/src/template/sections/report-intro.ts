import type { Finding } from '@odysseus/core';
import type { StoredAnalysis } from '../../types.js';
import type { ReportStrings } from '../strings/i18n.js';
import {
  escapeHtml,
  fillTemplate,
  formatNumber,
  renderSheetHeader,
  sheet,
  stripInlineMarkdown,
} from '../html-utils.js';
import { resolveGenericDecisionQuestion } from '../generic-question.js';
import { sectionTitle, type SectionId } from '../section-registry.js';
import { selectRenderedThemes } from './themes.js';
import { detectFindingVendor, isThirdPartyFinding } from '../third-party-attribution.js';
import type { RenderedPriority } from '../rendered-priorities.js';

const TOP_ACTION_COUNT = 3;

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
 *  Complication, Question narrative, not a reading guide. The situation
 *  states what this diagnostic is for and how it was built; the
 *  complication states deterministic pages/findings/priorities facts plus
 *  the legal reminder pointing at the later legal section; the question is
 *  the same generic decision sentence the cover renders, taken from the
 *  one shared resolver (../generic-question.ts) so the two sites cannot
 *  drift. P3 (2026-08-21 La Corniche feedback pass) history: the section
 *  exists to answer "why am I, the non-technical director, holding this,
 *  and what do I do with it" - structural/navigational, template-driven,
 *  no new LLM pass. "Vos trois prochaines actions" still reuses the
 *  top-3-theme data (title, first-party/third-party ownership) rather than
 *  regenerating anything, so it can never drift out of sync with the
 *  priorities section; effort wording stays on the detailed card only.
 *
 *  Audience rows are role labels only (names arrive in plan 019) and are
 *  anchored to the new canonical order semantics: section-02 (legal
 *  exposure) now renders after the synthesis, and section-14 (next steps)
 *  before it, so each row lists its ids in canonical reading order and
 *  every display resolves through sectionTitle's live titles, never a
 *  hardcoded number. */
export function renderReportIntro(
  strings: ReportStrings,
  ordinal: number,
  analysis: StoredAnalysis,
  findings: readonly Finding[],
  priorities?: readonly RenderedPriority[],
): string {
  const r = strings.reportIntro;
  const findingsById = new Map(findings.map((finding) => [finding.findingId, finding]));
  const facts = computeIntroFacts(analysis, findings, priorities, findingsById);

  const complication = fillTemplate(r.complicationBodyTemplate, {
    findings: formatNumber(facts.findingCount, analysis.language),
    criticalSerious: formatNumber(facts.criticalSeriousCount, analysis.language),
    pages: formatNumber(facts.affectedPageCount, analysis.language),
    priorities: formatNumber(facts.priorityCount, analysis.language),
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

  // The question is the resolver's exact bytes, the same sentence the
  // cover renders - plan 019 extends the resolver's input, it must never
  // fork the copy into a second string table.
  const question = resolveGenericDecisionQuestion(analysis.language);

  // Role labels only, one row per audience, ids listed in the canonical
  // reading order (plan 018: section-14 before section-02, the legal
  // section after the synthesis). Titles resolve live, so a future order
  // change cannot leave a stale number here.
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

  const topThemes = (
    priorities
      ? priorities.map((priority) => priority.theme)
      : selectRenderedThemes(analysis.themes, findingsById)
  ).slice(0, TOP_ACTION_COUNT);
  const actionsList = topThemes
    .map((theme) => {
      const themeFindings = theme.findingIds
        .map((id) => findingsById.get(id))
        .filter((f): f is Finding => f !== undefined);
      const contact = whoToContact(strings, themeFindings);
      // Effort deliberately left out of this sentence (plan 018 step 5):
      // "Complexity" is the detailed card's own metadata (themes.ts).
      const text = fillTemplate(r.nextActionItemTemplate, {
        title: stripInlineMarkdown(theme.title),
        contact,
      });
      return `<li style="margin-bottom:8px">${escapeHtml(text)}</li>`;
    })
    .join('');

  return sheet(
    `
    ${renderSheetHeader(ordinal, r.eyebrow, r.heading)}
    <h5>${escapeHtml(r.situationHeading)}</h5>
    <p style="font-size:12.5px;opacity:0.9;margin:0 0 var(--space-4)">${escapeHtml(r.situationBody)}</p>
    <h5>${escapeHtml(r.complicationHeading)}</h5>
    <p style="font-size:12.5px;opacity:0.9;margin:0 0 var(--space-2)">${escapeHtml(complication)}</p>
    <p style="font-size:12.5px;opacity:0.9;margin:0 0 var(--space-4)">${escapeHtml(legalReminder)}</p>
    <h5>${escapeHtml(r.questionHeading)}</h5>
    <p style="font-size:17px;opacity:0.9;margin:0 0 var(--space-6);max-width:38ch">${escapeHtml(question)}</p>
    <h5>${escapeHtml(r.audienceHeading)}</h5>
    <table style="width:100%;border-collapse:collapse;margin-bottom:var(--space-6)"><tbody>${audienceRows}</tbody></table>
    ${
      actionsList
        ? `<h5>${escapeHtml(r.nextActionsHeading)}</h5><ol style="margin:0 0 var(--space-4);padding-left:1.2em;font-size:12.5px;opacity:0.9">${actionsList}</ol>`
        : ''
    }
    <p style="font-size:11.5px;opacity:0.6;margin:0">${escapeHtml(scopeNote)}</p>
  `,
    '',
    'section-00',
  );
}

/** Same first-party/third-party classification renderOwnershipSplitNote
 *  (themes.ts) uses, reduced to a single "who to contact" phrase for this
 *  page's action list rather than a full split sentence. */
function whoToContact(strings: ReportStrings, themeFindings: readonly Finding[]): string {
  const r = strings.reportIntro;
  const thirdParty = themeFindings.filter((f) => isThirdPartyFinding(f));
  const firstParty = themeFindings.filter((f) => !isThirdPartyFinding(f));

  if (thirdParty.length > 0 && firstParty.length === 0) {
    const vendors = [
      ...new Set(
        thirdParty.map((f) => detectFindingVendor(f)).filter((v): v is string => v !== undefined),
      ),
    ];
    return vendors.length > 0 ? vendors.join(', ') : r.contactUnknownVendor;
  }
  if (thirdParty.length > 0 && firstParty.length > 0) {
    return r.contactAgencyAndVendor;
  }
  return r.contactAgency;
}
