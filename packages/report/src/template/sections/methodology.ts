import {
  ARTICLE_47_REGIME_ID,
  EAA_REGIME_ID,
  LCEN_MENTIONS_LEGALES_RULE_ID,
  getRegime,
  type AuditManifest,
  type Finding,
  type ObligationAssessment,
  type ObligationBasis,
  type ObligationBasisFact,
  type ReportLanguage,
} from '@odysseus/core';
import type { ReportStrings } from '../strings/i18n.js';
import { escapeHtml, fillTemplate, formatDate, formatNumber, renderSheetHeader, sheet } from '../html-utils.js';

/** Sirene's own effectif-band labels (see packages/interface's
 *  sirene-client.ts) are French-only, since they come from an INSEE
 *  table. An English report translates by INSEE code here rather than by
 *  the label string, keeping this a small, hand-synced pairing with that
 *  client's own code list - the same "duplicate a small table near a
 *  boundary, document why" precedent CLAUDE.md already uses elsewhere,
 *  since packages/report does not and should not depend on
 *  packages/interface. */
const EFFECTIF_BAND_LABELS_EN: Record<string, string> = {
  NN: 'an unreported headcount',
  '00': '0 employees',
  '01': '1 to 2 employees',
  '02': '3 to 5 employees',
  '03': '6 to 9 employees',
  '11': '10 to 19 employees',
  '12': '20 to 49 employees',
  '21': '50 to 99 employees',
  '22': '100 to 199 employees',
  '31': '200 to 249 employees',
  '32': '250 to 499 employees',
  '41': '500 to 999 employees',
  '42': '1,000 to 1,999 employees',
  '51': '2,000 to 4,999 employees',
  '52': '5,000 to 9,999 employees',
  '53': '10,000 employees or more',
};

function translateEffectifLabel(code: string, frenchLabel: string, language: ReportLanguage): string {
  if (language === 'fr') return frenchLabel;
  return EFFECTIF_BAND_LABELS_EN[code] ?? frenchLabel;
}

function formatEur(amount: number, language: ReportLanguage): string {
  const formatted = formatNumber(amount, language);
  return language === 'fr' ? `${formatted} €` : `€${formatted}`;
}

function renderFact(fact: ObligationBasisFact, strings: ReportStrings, language: ReportLanguage): string | null {
  const m = strings.methodology;
  switch (fact.kind) {
    case 'effectif-band':
      return fillTemplate(m.legalCitationEffectifFactTemplate, {
        label: translateEffectifLabel(fact.code, fact.label, language),
      });
    case 'turnover':
      return fillTemplate(m.legalCitationTurnoverFactTemplate, {
        threshold: formatEur(fact.thresholdEur, language),
      });
    case 'transactional-flow':
      return m.legalCitationTransactionalFlowFact;
    case 'transactional-flow-unknown':
      return m.legalCitationTransactionalFlowUnknownFact;
    // sme-exemption, no-transactional-flow, siren-missing, and
    // sirene-lookup-failed are read by legalCitationOutOfScopeParagraph/
    // legalCitationUndeterminedParagraph's own fixed copy, not by this
    // per-fact renderer, which only backs the in_scope/likely_in_scope
    // templates.
    default:
      return null;
  }
}

function renderFacts(basis: ObligationBasis, strings: ReportStrings, language: ReportLanguage): string {
  return basis.facts
    .map((fact) => renderFact(fact, strings, language))
    .filter((text): text is string => text !== null)
    .join(' ');
}

/** EAA "owns" the merged status only when its own facts actually justify
 *  it: a confirmed transactional flow means EAA's own gate is in_scope,
 *  an unconfirmed one means likely_in_scope, anything else (exemption or
 *  a confirmed absence) means out_of_scope on EAA's own terms. Article 47
 *  is only ever the one that can push a merged status to in_scope on its
 *  own (assessObligations never lets it produce anything else), so it is
 *  picked as primary precisely when EAA's own status does not already
 *  explain the merged 'in_scope' - citing EAA in that case would
 *  overstate what the EAA gate itself determined. */
function pickPrimaryBasis(
  assessment: Extract<ObligationAssessment, { status: 'in_scope' | 'likely_in_scope' }>,
): ObligationBasis | undefined {
  const eaaBasis = assessment.basis.find((b) => b.regimeId === EAA_REGIME_ID);
  const article47Basis = assessment.basis.find((b) => b.regimeId === ARTICLE_47_REGIME_ID);

  if (eaaBasis) {
    const eaaOwnStatus: ObligationAssessment['status'] = eaaBasis.facts.some((f) => f.kind === 'transactional-flow')
      ? 'in_scope'
      : eaaBasis.facts.some((f) => f.kind === 'transactional-flow-unknown')
        ? 'likely_in_scope'
        : 'out_of_scope';
    if (eaaOwnStatus === assessment.status) return eaaBasis;
  }

  return article47Basis ?? eaaBasis;
}

/** Exported for legal-exposure.ts, which promotes this same deterministic
 *  splice to its own page (2026-08-16 report redesign) without adding any
 *  independent legal wording of its own - trade-off 11: one function
 *  producing the citation text, called from two render sites, never two
 *  hand-synced copies. */
export function renderLegalCitationParagraph(
  strings: ReportStrings,
  assessment: ObligationAssessment | undefined,
  language: ReportLanguage,
): string {
  const m = strings.methodology;

  if (!assessment || assessment.status === 'undetermined') {
    return m.legalCitationUndeterminedParagraph;
  }

  if (assessment.status === 'out_of_scope') {
    return m.legalCitationOutOfScopeParagraph;
  }

  const basis = pickPrimaryBasis(assessment);
  const regime = basis ? getRegime(basis.regimeId, language) : undefined;
  if (!basis || !regime) {
    // Should not happen in practice (assessObligations always attaches a
    // basis entry for in_scope/likely_in_scope), but a missing regime
    // must never fall through to a broken template render.
    return m.legalCitationUndeterminedParagraph;
  }

  const facts = renderFacts(basis, strings, language);
  const template =
    assessment.status === 'in_scope' ? m.legalCitationInScopeTemplate : m.legalCitationLikelyInScopeTemplate;
  const paragraph = fillTemplate(template, {
    regimeName: regime.name,
    authority: regime.authority,
    legalCitation: regime.legalCitation,
    facts,
  });

  return `${paragraph} ${m.legalCitationExemptionRouteSentence}`;
}

/**
 * Manual-SIREN milestone. Distinguishes three cases, read off
 * sirenSource/sirenMismatch - never set by assessObligations itself, only
 * spliced on by packages/interface's obligation-stage.ts once a SIREN has
 * been chosen:
 *  - extracted (or no SIREN at all): no note, no change to existing
 *    wording.
 *  - manual, no mismatch: the site does not publish this SIREN itself.
 *    Links to the LCEN finding when one exists (the common case - none of
 *    SIREN/RCS/TVA found); a site that published an RCS or TVA without a
 *    SIREN has no such finding to link to, so falls back to a shorter
 *    sentence with the same substance.
 *  - mismatch: both numbers stated plainly, no editorializing about which
 *    is "correct" - a mismatch can mean the site is operated by a
 *    different legal entity than the one being audited.
 */
function renderSirenProvenanceNote(
  strings: ReportStrings,
  assessment: ObligationAssessment | undefined,
  findings: readonly Pick<Finding, 'findingId' | 'ruleId'>[],
): string {
  const m = strings.methodology;
  if (!assessment) return '';

  if (assessment.sirenMismatch) {
    return fillTemplate(m.legalCitationSirenMismatchTemplate, {
      manualSiren: assessment.sirenMismatch.manualSiren,
      extractedSiren: assessment.sirenMismatch.extractedSiren,
    });
  }

  if (assessment.sirenSource === 'manual') {
    const findingId = findings.find((f) => f.ruleId === LCEN_MENTIONS_LEGALES_RULE_ID)?.findingId;
    return findingId
      ? fillTemplate(m.legalCitationManualSirenWithFindingTemplate, {
          findingId,
        })
      : m.legalCitationManualSirenNoFindingSentence;
  }

  return '';
}

/** B15/B16: methodology and limitations used to be two sections that
 *  duplicated the same automated-coverage caveat near-verbatim, and
 *  neither stated the crawl size. Merged into one section
 *  (docs/report-v2-prototype-haaitza-fr.html section 9), with the crawl
 *  size and date folded into the tooling paragraph itself. */
export function renderMethodology(
  strings: ReportStrings,
  manifest: AuditManifest,
  language: ReportLanguage,
  obligationAssessment?: ObligationAssessment,
  findings: readonly Pick<Finding, 'findingId' | 'ruleId'>[] = [],
): string {
  const m = strings.methodology;
  const eyebrow = m.eyebrow;
  const axeVersion = manifest.tool.axeCoreVersion ?? '-';
  const lighthouseVersion = manifest.tool.lighthouseVersion ?? '-';
  const pagesScanned = manifest.pages.filter((page) => page.status === 'visited').length;

  const toolingParagraph = fillTemplate(m.toolingParagraphTemplate, {
    axeVersion,
    lighthouseVersion,
    pages: pagesScanned,
    date: formatDate(new Date(manifest.startedAt), language),
  });

  const sirenNote = renderSirenProvenanceNote(strings, obligationAssessment, findings);

  // B9: the full legal-citation paragraph used to be rendered here a
  // second time, verbatim, duplicating legal-exposure.ts's own copy of
  // the same paragraph on a different page. Kept once there; this section
  // only points back to it now.
  return sheet(`
    ${renderSheetHeader(eyebrow, m.heading)}
    <p style="font-size:13.5px;opacity:0.85;max-width:68ch">${escapeHtml(toolingParagraph)}</p>
    <div class="hr"></div>
    <p style="font-size:13.5px;opacity:0.85;max-width:68ch">${escapeHtml(m.automatedCoverageCaveat)}</p>
    <div class="hr"></div>
    <p style="font-size:13.5px;opacity:0.85;max-width:68ch">${escapeHtml(m.legalCitationPointerSentence)}</p>
    ${sirenNote ? `<p style="font-size:13.5px;opacity:0.85;max-width:68ch">${escapeHtml(sirenNote)}</p>` : ''}
  `, '', 'section-11');
}
