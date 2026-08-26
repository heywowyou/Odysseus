import type { AuditManifest } from '@odysseus/core';
import type { ReportStrings } from '../strings/i18n.js';
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

/** Static, code-owned copy - no scan data involved. Doc §3 cap: 3 cards,
 *  1 sheet.
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
export function renderNextSteps(strings: ReportStrings, ordinal: number, manifest: AuditManifest, language: 'fr' | 'en'): string {
  const n = strings.nextSteps;

  const questionBody = fillTemplate(n.questionBodyTemplate, { email: ODYSSEUS_CONTACT_EMAIL });
  const authorship = fillTemplate(n.authorshipTemplate, {
    producer: ODYSSEUS_PRODUCER_NAME,
    date: formatDate(new Date(manifest.startedAt), language),
    version: manifest.tool.odysseusVersion,
    reportId: manifest.auditId,
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

  const cards = [
    { title: n.questionTitle, body: questionBody },
    { title: n.reauditTitle, body: `${n.reauditBody} ${reauditPricing}` },
    { title: n.postFixTitle, body: n.postFixBody },
  ]
    .map(
      (card) => `
        <div class="card elev-sm">
          <div class="card-title">${escapeHtml(card.title)}</div>
          <div class="card-body">${escapeHtml(card.body)}</div>
        </div>
      `,
    )
    .join('');

  // P4.1 (2026-08-21 La Corniche feedback pass): Prochaines étapes always
  // starts on its own fresh page, same reasoning as Priorités above.
  return sheet(`
    ${renderSheetHeader(ordinal, n.eyebrow, n.heading)}
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:var(--space-4);margin-bottom:var(--space-6)">
      ${cards}
    </div>
    <div class="hr"></div>
    <p style="font-size:11px;opacity:0.55;margin-top:var(--space-4)">${escapeHtml(authorship)}</p>
    <p style="font-size:11px;opacity:0.55;margin-top:4px">${escapeHtml(issuerBlock)}</p>
    <p style="font-size:11px;opacity:0.55;margin-top:4px;max-width:70ch">${escapeHtml(n.liabilityStatement)}</p>
  `, 'sheet-standalone', 'section-14');
}
