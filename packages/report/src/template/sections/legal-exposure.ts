import { EAA_REGIME_ID, eaaSanctionFigureSentence } from '@odysseus/core';
import type { AuditManifest, AuditManualFields, ObligationAssessment, ReportLanguage } from '@odysseus/core';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, fillTemplate, formatDate, formatElapsedDuration, renderSheetHeader, sheet } from '../html-utils.js';
import { pickPrimaryBasis, renderLegalCitationParagraph } from './methodology.js';

/** item 24: no lawyer or auditor receiving this document could
 *  independently verify which entity the determination concerns without
 *  the SIREN itself - the report stated the headcount band the Sirene
 *  lookup produced but never the SIREN that lookup was for. Manual
 *  ("operator") wins over the extracted value, the same precedent
 *  lcen-resolution.ts and resolveEffectiveSiren already use elsewhere.
 *  "date" is the audit date, the closest available proxy for when the
 *  Sirene-derived headcount band was current - no separate Sirene-lookup
 *  timestamp is stored anywhere this section can read. */
function renderSirenNote(
  strings: ReportStrings,
  language: ReportLanguage,
  manifest: AuditManifest,
  manualFields: AuditManualFields | undefined,
): string {
  const l = strings.legalExposure;
  const siren = manualFields?.siren?.value ?? manifest.siteSignals?.siren;
  const text = siren
    ? fillTemplate(l.sirenTemplate, { siren, date: formatDate(new Date(manifest.startedAt), language) })
    : l.sirenUnavailable;
  return `<p style="font-size:12.5px;opacity:0.65;margin-top:var(--space-2)">${escapeHtml(text)}</p>`;
}

/** item 28: the transactional/booking flow is the entire legal hook for
 *  the EAA obligation, but nothing stated whether the actual flow was
 *  in-scope for this crawl - a delegated off-domain booking engine (the
 *  common case for hotels, per the transactional-flow detector's own
 *  module doc) sits outside a single-origin crawl by construction, so
 *  the most legally exposed surface of the business could go unaudited
 *  silently. Derived entirely from SiteSignals.transactionalFlowEvidence
 *  (packages/scanner's transactional-flow.ts), not a new capability - a
 *  'delegated-booking-redirect' entry means the flow was resolved to an
 *  off-domain provider that check followed but the crawl itself never
 *  visited as a page. */
function renderTransactionalFlowScopeNote(strings: ReportStrings, manifest: AuditManifest): string {
  const l = strings.legalExposure;
  const evidence = manifest.siteSignals?.transactionalFlowEvidence ?? [];
  if (evidence.length === 0) return '';

  const delegated = evidence.filter((e) => e.kind === 'delegated-booking-redirect');
  // item 0.2: `detail` is internal English classification reasoning, never
  // a client-facing domain - derive the actual hostname from providerUrl
  // instead. A providerUrl that fails to parse is dropped rather than
  // shown malformed.
  const providerDomains = [
    ...new Set(
      delegated
        .map((e) => {
          try {
            return e.providerUrl ? new URL(e.providerUrl).hostname : null;
          } catch {
            return null;
          }
        })
        .filter((domain): domain is string => domain !== null),
    ),
  ];
  const text =
    delegated.length > 0
      ? fillTemplate(l.transactionalFlowDelegatedTemplate, {
          domain: providerDomains.length > 0 ? providerDomains.join(', ') : l.transactionalFlowDelegatedDomainUnknown,
        })
      : fillTemplate(l.transactionalFlowOnSiteTemplate, {
          pages: [...new Set(evidence.map((e) => e.pageUrl))].sort().join(', '),
        });

  return `<p style="font-size:12.5px;opacity:0.65;margin-top:var(--space-2)">${escapeHtml(text)}</p>`;
}

/** item 18: the section stated which obligation applies but never the
 *  actual exposure (fine amount, case law state) - originally two
 *  deterministic facts from packages/core's enforcement-facts.ts, rendered
 *  only when the resolved regime is EAA/SMB (methodology.ts's
 *  pickPrimaryBasis). Article 47's own sanction figure is not stated
 *  here at all this session - a client resolved to article 47 is not
 *  the case this feedback pass exercised, and inventing that copy path
 *  without a reviewed report to check it against would be exactly the
 *  kind of unverified addition rule 1 forbids.
 *
 *  Revised 2026-08-18 (B9/item 1.14): eaaCaseLawStateSentence() (the
 *  Lille/Caen paragraph) was removed from this block. Its source,
 *  docs/obligation-basis.md's route-3 case-law entries, is explicitly
 *  tagged `Status: secondary` ("internal use only" per the doc's own
 *  section 0 verification convention), sourced from press summaries, not
 *  the ordonnances themselves - section 9's own remaining-verification
 *  list still names "the Caen and Lille ordonnances themselves rather
 *  than press summaries" as unresolved. obligation-basis.md's governing
 *  rule ("nothing legal may be stated anywhere in the product unless it
 *  appears here with status primary... secondary is internal use only")
 *  makes this content not eligible to reach a client, regardless of how
 *  neutrally it is phrased. Only the sanction figure remains here, which
 *  is genuinely primary-sourced (art. R451-4 code de la consommation).
 *  Re-add the case-law sentence only once the underlying ordonnances are
 *  verified against Légifrance or an official publication and the status
 *  in obligation-basis.md itself is upgraded to primary - do not
 *  re-introduce it by relaxing this check instead. */
function renderEaaExposureBlock(strings: ReportStrings, language: ReportLanguage, assessment: ObligationAssessment | undefined): string {
  if (!assessment || (assessment.status !== 'in_scope' && assessment.status !== 'likely_in_scope')) return '';
  const basis = pickPrimaryBasis(assessment);
  if (!basis || basis.regimeId !== EAA_REGIME_ID) return '';

  const l = strings.legalExposure;
  return `
    <div style="margin-top:var(--space-6)">
      <h5>${escapeHtml(l.exposureHeading)}</h5>
      <p style="font-size:13.5px;opacity:0.85;max-width:66ch">${escapeHtml(eaaSanctionFigureSentence(language))}</p>
    </div>
  `;
}

/** The date EAA obligations enter into application (arrêté du 9 octobre
 *  2023 / loi n° 2023-171), matching l.eaaDeadlineValue's display text.
 *  Kept as a real Date, not just a display string, so item 17's elapsed-
 *  duration note can be computed rather than hand-updated every report. */
const EAA_APPLICATION_DATE = new Date('2025-06-28');

/** Promotes methodology.ts's own legal-citation paragraph to a dedicated
 *  page for visibility. Deliberately calls the same exported function
 *  methodology.ts uses rather than deriving its own text: this section
 *  must never become a second, independent source of legal framing
 *  (CLAUDE.md rule 6, trade-off 11). The two cards above the paragraph
 *  add no new legal nuance either - the EAA deadline is a fact about the
 *  law itself, not about this client, and the status label/short
 *  description are a plain restatement of assessObligations()'s own
 *  status enum. */
export function renderLegalExposure(
  strings: ReportStrings,
  ordinal: number,
  language: ReportLanguage,
  obligationAssessment: ObligationAssessment | undefined,
  generatedAt: Date,
  manifest: AuditManifest,
  manualFields?: AuditManualFields,
): string {
  const l = strings.legalExposure;
  const status = obligationAssessment?.status ?? 'undetermined';
  const eaaDeadlineNote = fillTemplate(l.eaaDeadlineNoteTemplate, {
    duration: formatElapsedDuration(EAA_APPLICATION_DATE, generatedAt, language),
  });

  const paragraph = renderLegalCitationParagraph(strings, obligationAssessment, language);

  // B7: the cover badge no longer reads as a legal risk score (relabeled
  // in cover.ts), but an undetermined status on its own still leaves the
  // client with no next step. State the single resolving action without
  // asserting what the answer would be.
  const actionNote =
    status === 'undetermined'
      ? `<p style="font-size:12.5px;opacity:0.65;margin-top:var(--space-2)">${escapeHtml(l.undeterminedActionNote)}</p>`
      : '';

  return sheet(`
    ${renderSheetHeader(ordinal, l.eyebrow, l.heading)}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);margin-bottom:var(--space-6)">
      <div class="card elev-sm">
        <div class="card-kicker">${escapeHtml(l.eaaDeadlineLabel)}</div>
        <div class="card-title">${escapeHtml(l.eaaDeadlineValue)}</div>
        <div class="card-body">${escapeHtml(eaaDeadlineNote)}</div>
      </div>
      <div class="card elev-sm">
        <div class="card-kicker">${escapeHtml(l.obligationStatusLabel)}</div>
        <div class="card-title">${escapeHtml(l.statusLabels[status])}</div>
        <div class="card-body">${escapeHtml(l.statusShortDescriptions[status])}</div>
        ${actionNote}
      </div>
    </div>
    <p style="font-size:13.5px;opacity:0.85;max-width:66ch">${escapeHtml(paragraph)}</p>
    ${renderTransactionalFlowScopeNote(strings, manifest)}
    ${renderEaaExposureBlock(strings, language, obligationAssessment)}
    ${renderSirenNote(strings, language, manifest, manualFields)}
    <p style="font-size:11px;opacity:0.5;margin-top:var(--space-4)">${escapeHtml(l.disclaimerNote)}</p>
  `, '', 'section-02');
}
