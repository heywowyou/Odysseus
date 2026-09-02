import type { AuditManifest } from '@odysseus/core';
import type { ReportStrings } from '../strings/i18n.js';
import type { ReportRenderMetadata } from '../../types.js';
import type { RenderedPriority } from '../rendered-priorities.js';
import {
  escapeHtml,
  fillTemplate,
  formatDate,
  formatNumber,
  renderSheetHeader,
  sheet,
  ODYSSEUS_CONTACT_EMAIL,
  ODYSSEUS_PRODUCER_NAME,
  ODYSSEUS_REAUDIT_LEAD_TIME_DAYS,
  ODYSSEUS_REAUDIT_PRICE_EUR_HT,
  ODYSSEUS_SIGNATORY_NAME,
  ODYSSEUS_REGISTRATION_NUMBER,
} from '../html-utils.js';
import { isQuickWinTheme } from './themes.js';

/** Static, code-owned copy - no scan data involved beyond the derived
 *  counts below. Plan 018 step 7: the section is ONE compact synthesis,
 *  read just before the full legal reference. It recaps the stake without
 *  ever inventing a financial amount, the deterministic coverage of the
 *  rendered priorities, the responsible roles, and the re-audit offer
 *  priced only through ODYSSEUS_REAUDIT_PRICE_EUR_HT /
 *  ODYSSEUS_REAUDIT_LEAD_TIME_DAYS (html-utils.ts), which stay the single
 *  price source. Re-audit comparisons are scanner-computable facts only:
 *  findings by severity and failed WCAG criteria, plus Chrome UX Report
 *  real-user data when the manifest carries it. A client's own conversion
 *  rate is named strictly as their separate measurement; this section
 *  never promises a conversion or revenue improvement.
 *
 *  `renderedPriorities` is the same report view model the priorities and
 *  checklist sections consume, passed through so this synthesis can never
 *  disagree with them. It is optional so the current render-body call
 *  stays valid; when it is absent the coverage sentence falls back to a
 *  number-free pointer, never to invented figures.
 *
 *  item 30 [REGRESSION]: "Une question ?" used to say requests could go
 *  "directement à l'équipe Odysseus" with no stated address - flagged
 *  once on the haaitza pass, recurred. ODYSSEUS_CONTACT_EMAIL is a code
 *  constant (html-utils.ts), not a manual-input field or LLM output, so
 *  it cannot silently disappear the way either of those could again.
 *
 *  item 31: no authorship, terms, or liability block anywhere in a paid
 *  deliverable that may be forwarded to counsel - producer, generation
 *  date, tool version (manifest.tool.odysseusVersion), and a report ID
 *  (manifest.auditId) are all already-available facts, not new data
 *  collection. */
export function renderNextSteps(
  strings: ReportStrings,
  ordinal: number,
  manifest: AuditManifest,
  language: 'fr' | 'en',
  renderMetadata?: ReportRenderMetadata,
  renderedPriorities?: readonly RenderedPriority[],
): string {
  const n = strings.nextSteps;

  const questionBody = fillTemplate(n.questionBodyTemplate, { email: ODYSSEUS_CONTACT_EMAIL });
  const authorship = fillTemplate(n.authorshipTemplate, {
    producer: ODYSSEUS_PRODUCER_NAME,
    scanDate: formatDate(new Date(manifest.finishedAt), language),
    scanBuild: manifest.tool.odysseusVersion,
    renderDate: formatDate(renderMetadata?.renderedAt ?? new Date(manifest.startedAt), language),
    renderBuild: renderMetadata?.rendererBuild ?? manifest.tool.odysseusVersion,
    templateVersion: String(renderMetadata?.templateVersion ?? 'legacy'),
    reportId: renderMetadata?.reportId ?? manifest.auditId,
  });
  const issuerBlock = fillTemplate(n.issuerBlockTemplate, {
    signatory: ODYSSEUS_SIGNATORY_NAME,
    registrationNumber: ODYSSEUS_REGISTRATION_NUMBER,
  });
  const reauditPricing = fillTemplate(n.reauditPricingTemplate, {
    price: formatNumber(ODYSSEUS_REAUDIT_PRICE_EUR_HT, language),
    days: formatNumber(ODYSSEUS_REAUDIT_LEAD_TIME_DAYS, language),
    email: ODYSSEUS_CONTACT_EMAIL,
  });

  // Plan 018 step 7: deterministic coverage numbers, derived from the same
  // RenderedPriority view the priority cards and checklist consume. A
  // priority covers serious/critical findings when at least one of its own
  // findings carries that severity; the quick-win test is themes.ts's F40
  // definition (low effort, medium or high impact), so this line and the
  // cards' badge can never disagree.
  const coverage = renderedPriorities
    ? fillTemplate(n.synthesisCoverageTemplate, {
        priorities: formatNumber(renderedPriorities.length, language),
        seriousCritical: formatNumber(
          renderedPriorities.filter((priority) =>
            priority.findings.some(
              (finding) => finding.severity === 'critical' || finding.severity === 'serious',
            ),
          ).length,
          language,
        ),
        quickWins: formatNumber(
          renderedPriorities.filter((priority) => isQuickWinTheme(priority.theme)).length,
          language,
        ),
      })
    : n.synthesisCoverageFallback;

  // The comparison may only name Chrome UX Report field data when the
  // manifest actually carries it, same predicate section 09 renders its
  // real-user block with (core-web-vitals-table.ts).
  const comparison = manifest.cruxFieldData?.available
    ? n.synthesisComparisonWithFieldData
    : n.synthesisComparisonWithoutFieldData;

  const synthesisParagraphs = [
    n.synthesisStake,
    coverage,
    n.synthesisRoles,
    n.synthesisReauditRecommendation,
    comparison,
    n.synthesisConversionNote,
    reauditPricing,
  ]
    .map(
      (text) =>
        `<p style="font-size:12.5px;opacity:0.85;margin-top:0;margin-bottom:var(--space-3);max-width:78ch">${escapeHtml(text)}</p>`,
    )
    .join('\n');

  // P4.1 (2026-08-21 La Corniche feedback pass): Prochaines étapes always
  // starts on its own fresh page, same reasoning as Priorités above.
  return sheet(
    `
    ${renderSheetHeader(ordinal, n.eyebrow, n.heading, 'var(--space-6)')}
    ${synthesisParagraphs}
    <div class="hr"></div>
    <p style="font-size:12.5px;opacity:0.85;margin-top:var(--space-4);max-width:78ch"><strong>${escapeHtml(n.questionTitle)}</strong> ${escapeHtml(questionBody)}</p>
    <p style="font-size:11px;opacity:0.55;margin-top:var(--space-4)">${escapeHtml(authorship)}</p>
    <p style="font-size:11px;opacity:0.55;margin-top:4px">${escapeHtml(issuerBlock)}</p>
    <p style="font-size:11px;opacity:0.55;margin-top:4px;max-width:70ch">${escapeHtml(n.liabilityStatement)}</p>
  `,
    '',
    'section-14',
  );
}
