import {
  ARTICLE_47_REGIME_ID,
  EAA_REGIME_ID,
  LCEN_MENTIONS_LEGALES_RULE_ID,
  KEYBOARD_TRAP_RULE_ID,
  FOCUS_ORDER_MISMATCH_RULE_ID,
  FORM_ERROR_NOT_ASSOCIATED_RULE_ID,
  VIDEO_MISSING_CAPTIONS_RULE_ID,
  getRegime,
  summarizeAuditCoverage,
  type AuditManifest,
  type Finding,
  type ObligationAssessment,
  type ObligationBasis,
  type ObligationBasisFact,
  type ReportLanguage,
} from '@odysseus/core';
import type { ReportStrings } from '../strings/i18n.js';
import { computeLanguageCoverage } from '../language-coverage.js';
import {
  escapeHtml,
  fillTemplate,
  formatDate,
  formatNumber,
  pluralize,
  renderSheetHeader,
  sheet,
  auditDate,
} from '../html-utils.js';
import { translateEffectifLabel } from '../effectif-label.js';
import { buildCoverageDisclosure } from '../coverage-disclosure.js';

/** Sirene's own effectif-band labels (see packages/interface's
 *  sirene-client.ts) are French-only, since they come from an INSEE
 *  table. An English report translates by INSEE code here rather than by
 *  the label string, keeping this a small, hand-synced pairing with that
 *  client's own code list - the same "duplicate a small table near a
 *  boundary, document why" precedent CLAUDE.md already uses elsewhere,
 *  since packages/report does not and should not depend on
 *  packages/interface. */
function formatEur(amount: number, language: ReportLanguage): string {
  const formatted = formatNumber(amount, language);
  return language === 'fr' ? `${formatted} €` : `€${formatted}`;
}

function renderFact(
  fact: ObligationBasisFact,
  strings: ReportStrings,
  language: ReportLanguage,
): string | null {
  const m = strings.methodology;
  switch (fact.kind) {
    case 'effectif-band':
      return fillTemplate(m.legalCitationEffectifFactTemplate, {
        label: translateEffectifLabel(fact.code, fact.label, language),
      });
    case 'turnover':
      return fillTemplate(m.legalCitationTurnoverFactTemplate, {
        amount: formatEur(fact.amountEur, language),
        threshold: formatEur(fact.thresholdEur, language),
      });
    case 'sme-exemption':
      return fillTemplate(m.legalCitationSmeFactTemplate, {
        effectifCode: fact.effectifCode,
        turnover: formatEur(fact.turnoverEur, language),
      });
    // item 41: names the specific flow type(s) actually detected instead
    // of listing all three possibilities with "ou", which read as the
    // tool being unsure which one it found. 'booking-engine-script' and
    // 'delegated-booking-redirect' are booking-specific; 'checkout-form'
    // and 'payment-embed' are cart/payment-specific. Both classes present
    // falls back to the combined label, matching the doc's own fallback
    // when detection genuinely can't narrow it down further.
    case 'transactional-flow': {
      const kinds = new Set(fact.evidence.map((e) => e.kind));
      const hasBooking =
        kinds.has('booking-engine-script') ||
        kinds.has('delegated-booking-redirect') ||
        kinds.has('booking-engine-domain-reference') ||
        kinds.has('booking-iframe');
      const hasCartOrPayment = kinds.has('checkout-form') || kinds.has('payment-embed');
      const flowType =
        hasBooking && hasCartOrPayment
          ? m.transactionalFlowTypeLabels.both
          : hasBooking
            ? m.transactionalFlowTypeLabels.booking
            : hasCartOrPayment
              ? m.transactionalFlowTypeLabels.cartOrPayment
              : m.transactionalFlowTypeLabels.both;
      // item 0.7: this used to always say "directement en ligne" even when
      // the only evidence found was a delegated third-party redirect,
      // which immediately contradicted legal-exposure.ts's own scope note
      // a few paragraphs later ("délégué à un prestataire tiers [...] ce
      // domaine n'a pas été exploré"). Both paragraphs now read the same
      // on-site/delegated determination off the evidence kinds, so they
      // can't disagree.
      const isDelegatedOnly =
        kinds.has('delegated-booking-redirect') &&
        !kinds.has('booking-engine-script') &&
        !kinds.has('checkout-form') &&
        !kinds.has('payment-embed') &&
        !kinds.has('booking-engine-domain-reference') &&
        !kinds.has('booking-iframe');
      const location = isDelegatedOnly
        ? m.legalCitationTransactionalFlowLocationDelegated
        : m.legalCitationTransactionalFlowLocationOnSite;
      return fillTemplate(m.legalCitationTransactionalFlowFactTemplate, { flowType, location });
    }
    case 'transactional-flow-unknown':
      return m.legalCitationTransactionalFlowUnknownFact;
    // Issue #42: distinguish "the detector ran and found nothing" (the
    // no-transactional-flow sentence below) from "the detector ran and
    // left booking signals it could not resolve". Same status
    // (likely_in_scope), materially different sentence for the client.
    case 'transactional-flow-inconclusive':
      return m.legalCitationTransactionalFlowInconclusiveFact;
    // Issue #294: the only flow evidence was a form element, which alone
    // establishes nothing - the gate reads "not confirmed", never "flow
    // observed".
    case 'transactional-flow-form-only':
      return m.legalCitationTransactionalFlowFormOnlyFact;
    case 'no-transactional-flow':
      return m.legalCitationNoTransactionalFlowFact;
    case 'siren-missing':
      return m.legalCitationSirenMissingFact;
    case 'sirene-lookup-failed':
      return fillTemplate(m.legalCitationSireneLookupFailedTemplate, { reason: fact.reason });
  }
}

function renderFacts(
  basis: ObligationBasis,
  strings: ReportStrings,
  language: ReportLanguage,
): string {
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
export function pickPrimaryBasis(
  assessment: Extract<ObligationAssessment, { status: 'in_scope' | 'likely_in_scope' }>,
): ObligationBasis | undefined {
  const eaaBasis = assessment.basis.find((b) => b.regimeId === EAA_REGIME_ID);
  const article47Basis = assessment.basis.find((b) => b.regimeId === ARTICLE_47_REGIME_ID);

  if (eaaBasis) {
    const eaaOwnStatus: ObligationAssessment['status'] = eaaBasis.facts.some(
      (f) => f.kind === 'transactional-flow',
    )
      ? 'in_scope'
      : eaaBasis.facts.some(
            (f) =>
              f.kind === 'transactional-flow-unknown' ||
              f.kind === 'transactional-flow-inconclusive',
          )
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

  if (!assessment) {
    const regime = getRegime(EAA_REGIME_ID, language);
    if (!regime) return '';
    const authorityDisplay =
      language === 'fr' ? `${regime.authorityPrefixFr} ${regime.authority}` : regime.authority;
    return fillTemplate(m.legalCitationUndeterminedParagraph, {
      regimeName: regime.name,
      authority: authorityDisplay,
      legalCitation: regime.legalCitation,
      facts: m.legalCitationSirenMissingFact,
    });
  }

  const basis =
    assessment.status === 'in_scope' || assessment.status === 'likely_in_scope'
      ? pickPrimaryBasis(assessment)
      : assessment.basis[0];
  const regime = basis ? getRegime(basis.regimeId, language) : undefined;
  if (!basis || !regime) {
    // Should not happen in practice (assessObligations always attaches a
    // basis entry for in_scope/likely_in_scope), but a missing regime
    // must never fall through to a broken template render.
    return m.legalCitationUndeterminedParagraph;
  }

  const facts = renderFacts(basis, strings, language);
  const template = {
    in_scope: m.legalCitationInScopeTemplate,
    likely_in_scope: m.legalCitationLikelyInScopeTemplate,
    out_of_scope: m.legalCitationOutOfScopeParagraph,
    undetermined: m.legalCitationUndeterminedParagraph,
  }[assessment.status];
  // item 3.15: "sous le contrôle de {authority}" produced "sous le
  // contrôle de Direction générale..." (missing "la") because `authority`
  // is a single canonical string shared with English (regimes.ts's own
  // documented convention), which cannot carry a French article without
  // either duplicating it per language or leaking a French word into the
  // English report. French prepends "de la"/"du" (from
  // regime.authorityPrefixFr, since "de le" is not valid French - it
  // contracts to "du") here, at fill time, language-scoped; English's
  // template has no preposition to prepend at all ("overseen by
  // {authority}").
  const authorityDisplay =
    language === 'fr' ? `${regime.authorityPrefixFr} ${regime.authority}` : regime.authority;
  const paragraph = fillTemplate(template, {
    regimeName: regime.name,
    authority: authorityDisplay,
    legalCitation: regime.legalCitation,
    facts,
  });

  return paragraph;
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
  /** Manual-input-layer milestone: when set, the operator has confirmed
   *  where the SIREN/RCS/TVA is displayed and lcen-resolution.ts already
   *  removed the finding from `findings` - this takes priority over
   *  every other branch below, since there is no longer a finding to
   *  reference and no ambiguity left to explain. */
  resolvedSirenSourceUrl: string | undefined,
): string {
  const m = strings.methodology;
  if (resolvedSirenSourceUrl) {
    return fillTemplate(m.sirenSourceResolvedTemplate, { url: resolvedSirenSourceUrl });
  }
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
/** item 1.10/B8: the methodology paragraph claims an extended
 *  accessibility pass (keyboard traps, focus order, form error handling,
 *  video captions) but nothing ever rendered its result - a clean pass is
 *  a selling point and was invisible. The four rule ids below are exactly
 *  the ones that pass emits (normalize-keyboard-navigation.ts,
 *  normalize-form-error-handling.ts, normalize-video-captions.ts); the
 *  alt-text heuristic already has its own "Signaux à vérifier" block
 *  (conformance-summary.ts) so it is not repeated here.
 *
 *  Revised for item 1.7 (La Corniche pass): originally rendered only when
 *  every one of the four checks found nothing at all, on the reasoning
 *  that a fired check's findings already appear in the report's normal
 *  findings flow. In practice this meant one check finding anything (a
 *  single video without captions, on a real report) silently suppressed
 *  the whole note, so the other three checks - which genuinely found
 *  nothing - went unstated. renderExtendedPassNote below now states each
 *  check individually whenever at least one of them found something. */
const EXTENDED_PASS_RULE_IDS: readonly string[] = [
  KEYBOARD_TRAP_RULE_ID,
  FOCUS_ORDER_MISMATCH_RULE_ID,
  FORM_ERROR_NOT_ASSOCIATED_RULE_ID,
  VIDEO_MISSING_CAPTIONS_RULE_ID,
];

/** Plan 036, binding decision 5 (both placements): the methodology-section
 *  half of the LCEN coverage disclosure, next to legal-exposure.ts's own
 *  observed-and-limit block and the finding's own description carrying the
 *  same boundary. Reads the checked page from the finding's own evidence
 *  payload (normalize-custom.ts's MentionsLegalesCheckedPages), never
 *  hand-written per report, so the sentence can never drift from what the
 *  finding itself recorded. Falls back to the finding's pageUrl for a
 *  finding stored before this evidence upgrade landed (rawEvidence.
 *  checkedPages absent, not null). Renders only when the finding actually
 *  fired; a compliant site has nothing to disclose here. */
function renderMentionsLegalesCoverageNote(
  strings: ReportStrings,
  findings: readonly (Pick<Finding, 'ruleId'> &
    Partial<Pick<Finding, 'rawEvidence' | 'pageUrls'>>)[],
): string {
  const finding = findings.find((f) => f.ruleId === LCEN_MENTIONS_LEGALES_RULE_ID);
  if (!finding) return '';
  const checkedPages = finding.rawEvidence?.checkedPages as { resolvedUrl?: unknown } | null;
  const resolvedUrl = checkedPages?.resolvedUrl;
  const checkedUrl = typeof resolvedUrl === 'string' ? resolvedUrl : (finding.pageUrls?.[0] ?? '');
  return fillTemplate(strings.methodology.mentionsLegalesCoverageTemplate, { url: checkedUrl });
}

/** item 1.7 (La Corniche pass): a real report had a video-captions
 *  finding, which silently suppressed the whole note under the old
 *  all-or-nothing logic - so nothing said the other three checks
 *  (keyboard traps, focus order, form errors) genuinely found nothing.
 *  Falls back to the single combined sentence only in the all-clean case
 *  (kept for its own existing test coverage); otherwise states each of
 *  the four checks individually, clean or with its own count, so a real
 *  clean result is never hidden behind one other check's finding. */
function renderExtendedPassNote(
  strings: ReportStrings,
  language: ReportLanguage,
  findings: readonly Pick<Finding, 'findingId' | 'ruleId'>[],
): string {
  const m = strings.methodology;
  const anyFound = findings.some((f) => EXTENDED_PASS_RULE_IDS.includes(f.ruleId));
  if (!anyFound) return m.extendedPassNoneFoundNote;

  const checks: [string, string][] = [
    [m.extendedPassCheckKeyboardTrapsLabel, KEYBOARD_TRAP_RULE_ID],
    [m.extendedPassCheckFocusOrderLabel, FOCUS_ORDER_MISMATCH_RULE_ID],
    [m.extendedPassCheckFormErrorsLabel, FORM_ERROR_NOT_ASSOCIATED_RULE_ID],
    [m.extendedPassCheckVideoCaptionsLabel, VIDEO_MISSING_CAPTIONS_RULE_ID],
  ];

  const checkList = checks
    .map(([label, ruleId]) => {
      const count = findings.filter((f) => f.ruleId === ruleId).length;
      const status =
        count === 0
          ? m.extendedPassCheckCleanLabel
          : `${formatNumber(count, language)} ${pluralize(count, m.extendedPassCheckFoundSingular, m.extendedPassCheckFoundPlural)}`;
      return `${label} (${status})`;
    })
    .join(', ');

  return fillTemplate(m.extendedPassResultTemplate, { checks: checkList });
}

/** P0.1 (2026-08-21 La Corniche feedback pass): the generic "n'a pas
 *  abouti... voir Méthodologie" pointer used to lead here and find no
 *  further detail, even though the real per-page reason was already
 *  captured in the manifest (page.errors.lighthouse) and simply never
 *  read by the report. Groups by the failure message with each page's own
 *  URL stripped out, so the same underlying failure repeated across many
 *  pages collapses to one reason line instead of one near-identical line
 *  per page. Returns undefined when every page that was scanned at all
 *  had a successful Lighthouse pass. */
/** Turns the tool's own failure message into wording a client can read.
 *
 *  The raw message is internal ("runLighthouseIsolated: worker for <url> exited
 *  before returning a result (code 1, signal null)"). Printing it in a paid
 *  deliverable breaks the plain-language rule, and its literal "null" trips
 *  render-lint's stringified-null rule, which aborts the whole render. Grouping
 *  now happens on the translated cause, so two spellings of one cause (an exit
 *  code and a SIGTERM, say) collapse to a single line instead of two.
 *
 *  The patterns match the causes actually present in stored scans. An
 *  unrecognized message deliberately falls back to `unknown` rather than
 *  passing the raw text through. */
function classifyLighthouseFailure(message: string, m: ReportStrings['methodology']): string {
  const reasons = m.lighthouseFailureReasons;
  if (/failed to fetch browser websocket url|fetch failed/i.test(message)) {
    return reasons.browserUnreachable;
  }
  if (/did not respond within/i.test(message)) return reasons.timedOut;
  if (/exited before returning a result/i.test(message)) return reasons.processStopped;
  return reasons.unknown;
}

function summarizeLighthouseFailures(
  strings: ReportStrings,
  manifest: AuditManifest,
  language: ReportLanguage,
): string | undefined {
  const m = strings.methodology;
  const failures = manifest.pages
    .map((page) => page.errors.lighthouse)
    .filter((message): message is string => message !== undefined);
  if (failures.length === 0) return undefined;

  const totalPages = manifest.pages.filter((page) => page.status === 'visited').length;
  const counts = new Map<string, number>();
  for (const message of failures) {
    const reason = classifyLighthouseFailure(message, m);
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }

  const reasonLines = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) =>
      fillTemplate(m.lighthouseFailureReasonTemplate, {
        count: formatNumber(count, language),
        total: formatNumber(totalPages, language),
        reason,
      }),
    );

  return `${m.lighthouseFailureIntroSentence} ${reasonLines.join(' ')}`;
}

function privacySecurityCoverageNote(
  manifest: AuditManifest,
  findings: readonly Partial<Pick<Finding, 'category'>>[],
  strings: ReportStrings,
): string | undefined {
  const coverage = manifest.privacySecurityCoverage;
  if (
    coverage === undefined ||
    coverage.securityHeaders !== 'completed' ||
    coverage.cookieConsent !== 'completed'
  ) {
    return strings.methodology.privacySecurityChecksUnavailable;
  }
  return findings.some((finding) => finding.category === 'privacy')
    ? undefined
    : strings.methodology.privacySecurityChecksClean;
}

export function renderMethodology(
  strings: ReportStrings,
  ordinal: number,
  manifest: AuditManifest,
  language: ReportLanguage,
  obligationAssessment?: ObligationAssessment,
  findings: readonly (Pick<Finding, 'findingId' | 'ruleId'> &
    Partial<Pick<Finding, 'category' | 'pageUrls' | 'rawEvidence'>>)[] = [],
  resolvedSirenSourceUrl?: string,
): string {
  const m = strings.methodology;
  const eyebrow = m.eyebrow;
  const axeVersion = manifest.tool.axeCoreVersion ?? '-';
  const lighthouseVersion = manifest.tool.lighthouseVersion ?? '-';
  const auditCoverage = summarizeAuditCoverage(manifest);
  const pagesScanned =
    auditCoverage.kind === 'current'
      ? auditCoverage.content.completed + auditCoverage.content.partial
      : manifest.pages.filter((page) => page.status === 'visited').length;

  const toolingParagraph = fillTemplate(m.toolingParagraphTemplate, {
    axeVersion,
    lighthouseVersion,
    pages: `${formatNumber(pagesScanned, language)} ${pluralize(pagesScanned, m.pagesScannedSingular, m.pagesScannedPlural)}`,
    date: formatDate(auditDate(manifest), language),
  });
  const reportCoverage = buildCoverageDisclosure(strings, manifest, language);
  const coverageNote = `<p style="font-size:12.5px;margin-top:var(--space-2);max-width:66ch">${escapeHtml(
    [reportCoverage.summary, ...reportCoverage.details].join(' '),
  )}</p>`;

  // 2026-08-25 Lagnonu review, item 1.3's remaining half: state the language
  // coverage actually achieved, so "65 pages analysees" can never again be
  // read as covering a language the crawl never reached.
  const coverage = computeLanguageCoverage(manifest);
  const languageCoverageNote =
    coverage === undefined
      ? ''
      : `<p style="font-size:12.5px;margin-top:var(--space-2);max-width:66ch">${escapeHtml(
          fillTemplate(m.languageCoverageTemplate, { languages: coverage.scanned.join(', ') }),
        )}${
          coverage.discoveredOnly.length === 0
            ? ''
            : ` ${escapeHtml(fillTemplate(m.languageNotScannedTemplate, { languages: coverage.discoveredOnly.join(', ') }))}`
        }</p>`;

  const analyzedPages = manifest.pages.filter((page) => page.status === 'visited');
  const hasDiscoveryProvenance =
    analyzedPages.length > 0 && analyzedPages.every((page) => page.discoveryMethod !== undefined);
  const linkedPages = analyzedPages.filter((page) => page.discoveryMethod === 'link').length;
  const seededPages = analyzedPages.filter((page) => page.discoveryMethod === 'seed').length;
  const sitemapOnlyPages = analyzedPages.filter(
    (page) => page.discoveryMethod === 'sitemap-only',
  ).length;
  const sitemapCoverageText = hasDiscoveryProvenance
    ? fillTemplate(
        seededPages > 0 ? m.sitemapCoverageWithSeedsTemplate : m.sitemapCoverageTemplate,
        {
          total: formatNumber(analyzedPages.length, language),
          linked: formatNumber(linkedPages, language),
          seeded: formatNumber(seededPages, language),
          sitemapOnly: formatNumber(sitemapOnlyPages, language),
        },
      )
    : undefined;
  const sitemapCoverageNote = sitemapCoverageText
    ? `<p style="font-size:12.5px;margin-top:var(--space-2);max-width:66ch">${escapeHtml(sitemapCoverageText)}</p>`
    : '';

  const sitemapSummary = manifest.crawl.sitemapCoverage;
  const sitemapIncomplete =
    sitemapSummary !== undefined &&
    (sitemapSummary.failedSitemapCount > 0 ||
      sitemapSummary.filteredPageCount > 0 ||
      sitemapSummary.capOmittedPageCount > 0);
  const sitemapIncompleteNote = sitemapIncomplete
    ? fillTemplate(m.sitemapIncompleteTemplate, {
        failed: formatNumber(sitemapSummary.failedSitemapCount, language),
        filtered: formatNumber(sitemapSummary.filteredPageCount, language),
        omitted: formatNumber(sitemapSummary.capOmittedPageCount, language),
      })
    : undefined;

  const sirenNote = renderSirenProvenanceNote(
    strings,
    obligationAssessment,
    findings,
    resolvedSirenSourceUrl,
  );
  const extendedPassNote = renderExtendedPassNote(strings, language, findings);
  const mentionsLegalesCoverageNote = renderMentionsLegalesCoverageNote(strings, findings);
  const lighthouseFailureNote = summarizeLighthouseFailures(strings, manifest, language);
  const privacySecurityNote = privacySecurityCoverageNote(manifest, findings, strings);

  // Manual-input-layer milestone: pages excluded as social-platform
  // redirects are never silently dropped (crawl.ts still records every
  // one in the manifest with status 'skipped-external-redirect') - this
  // states the count so the client sees what was skipped and why,
  // without blowing this section's 1-sheet cap with a per-URL table.
  const socialExclusionCount = manifest.pages.filter(
    (page) => page.status === 'skipped-external-redirect',
  ).length;
  const socialExclusionNote =
    socialExclusionCount === 1
      ? m.socialExclusionDisclosureSingularTemplate
      : socialExclusionCount > 1
        ? fillTemplate(m.socialExclusionDisclosureTemplate, { count: socialExclusionCount })
        : undefined;

  // item 3.11: "20 pages" appeared everywhere with nothing stating it is
  // a configured cap, not the whole site - a client could reasonably
  // believe the entire site was covered. Only stated when the cap
  // actually bound (visitedCount >= maxPages, meaning the crawl stopped
  // because of the limit, not because it ran out of pages to find): if
  // the whole site is smaller than the cap, the cap never constrained
  // anything and a sentence about it would be a non sequitur.
  const crawlCapNote =
    manifest.crawl.visitedCount >= manifest.crawl.maxPages
      ? fillTemplate(m.crawlCapDisclosureTemplate, { maxPages: manifest.crawl.maxPages })
      : undefined;

  // B9: the full legal-citation paragraph used to be rendered here a
  // second time, verbatim, duplicating legal-exposure.ts's own copy of
  // the same paragraph on a different page. Kept once there; this section
  // only points back to it now.
  return sheet(
    `
    ${renderSheetHeader(ordinal, eyebrow, m.heading)}
    <p style="font-size:13.5px;opacity:0.85;max-width:68ch">${escapeHtml(toolingParagraph)}</p>
    ${coverageNote}
    ${languageCoverageNote}
    ${sitemapCoverageNote}
    ${sitemapIncompleteNote ? `<p style="font-size:13.5px;opacity:0.85;max-width:68ch">${escapeHtml(sitemapIncompleteNote)}</p>` : ''}
    ${crawlCapNote ? `<p style="font-size:13.5px;opacity:0.85;max-width:68ch">${escapeHtml(crawlCapNote)}</p>` : ''}
    ${socialExclusionNote ? `<p style="font-size:13.5px;opacity:0.85;max-width:68ch">${escapeHtml(socialExclusionNote)}</p>` : ''}
    ${lighthouseFailureNote ? `<p style="font-size:13.5px;opacity:0.85;max-width:68ch">${escapeHtml(lighthouseFailureNote)}</p>` : ''}
    ${mentionsLegalesCoverageNote ? `<p style="font-size:13.5px;opacity:0.85;max-width:68ch">${escapeHtml(mentionsLegalesCoverageNote)}</p>` : ''}
    ${privacySecurityNote ? `<p style="font-size:13.5px;opacity:0.85;max-width:68ch">${escapeHtml(privacySecurityNote)}</p>` : ''}
    <div class="hr"></div>
    <p style="font-size:13.5px;opacity:0.85;max-width:68ch">${escapeHtml(m.automatedCoverageCaveat)}</p>
    ${extendedPassNote ? `<p style="font-size:13.5px;opacity:0.85;max-width:68ch">${escapeHtml(extendedPassNote)}</p>` : ''}
    <div class="hr"></div>
    <p style="font-size:13.5px;opacity:0.85;max-width:68ch">${escapeHtml(m.legalCitationPointerSentence)}</p>
    ${sirenNote ? `<p style="font-size:13.5px;opacity:0.85;max-width:68ch">${escapeHtml(sirenNote)}</p>` : ''}
  `,
    '',
    'section-11',
  );
}
