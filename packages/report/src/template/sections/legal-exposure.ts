import {
  EAA_REGIME_ID,
  eaaSanctionFigureSentence,
  getRegime,
  LCEN_MENTIONS_LEGALES_REGIME_ID,
  LCEN_MENTIONS_LEGALES_RULE_ID,
} from '@odysseus/core';
import type {
  AuditManifest,
  AuditManualFields,
  Finding,
  ObligationAssessment,
  ReportLanguage,
} from '@odysseus/core';
import type { ReportStrings } from '../strings/i18n.js';
import {
  escapeCopy,
  escapeHtml,
  fillTemplate,
  formatDate,
  formatElapsedDuration,
  renderSheetHeader,
  sheet,
  auditDate,
} from '../html-utils.js';
import { pickPrimaryBasis, renderLegalCitationParagraph } from './methodology.js';
import { SEVERITY } from '../design-tokens.js';
import { detectVendor } from '../third-party-attribution.js';
import { effectifCodeFromAssessment, translateEffectifLabel } from '../effectif-label.js';
import { SYNTHETIC_REGISTRY_SOURCE } from '../../constants.js';

/** P0.3 (2026-08-21 La Corniche feedback pass): how many example pages to
 *  name when the transactional-flow component was found on-site. A short
 *  illustrative sample, not the exhaustive page dump this replaced. */
const TRANSACTIONAL_FLOW_EXAMPLE_PAGE_COUNT = 3;

/** item 24/0.1/1.11: no lawyer or auditor receiving this document could
 *  independently verify which entity the determination concerns without
 *  the SIREN itself - the report stated the headcount band the Sirene
 *  lookup produced but never the SIREN that lookup was for. Manual
 *  ("operator") wins over the extracted value, the same precedent
 *  lcen-resolution.ts and resolveEffectiveSiren already use elsewhere.
 *
 *  Revised for item 0.1/1.11 (La Corniche pass): "report, don't conclude"
 *  requires printing every registry input relied on, not just the SIREN.
 *  When a real Sirene lookup succeeded (registrySnapshot present, spliced
 *  on by obligation-stage.ts), print denomination, effectifs bracket,
 *  retrieval date and source verbatim. Falls back to the SIREN-only note
 *  when no lookup ever succeeded (undetermined status, failed lookup),
 *  same as before this revision. */
function renderSirenNote(
  strings: ReportStrings,
  language: ReportLanguage,
  manifest: AuditManifest,
  manualFields: AuditManualFields | undefined,
  obligationAssessment: ObligationAssessment | undefined,
  lcenBlockRendered: boolean,
): string {
  const l = strings.legalExposure;
  const siren = manualFields?.siren?.value ?? manifest.siteSignals?.siren;
  const snapshot = obligationAssessment?.registrySnapshot;

  // 2026-08-25 Lagnonu review, D9: with no SIREN and an LCEN finding, this
  // fallback line and the LCEN block above it said the same thing two
  // lines apart. The LCEN wording is the better of the two - it names RCS
  // and TVA as well, and scopes the claim to the pages actually visited -
  // so this one yields rather than restating it. Only the fallback is
  // suppressed: a real registry snapshot or a known SIREN is different
  // information and still renders.
  if (lcenBlockRendered && !snapshot && !siren) return '';

  const synthetic = snapshot?.source === SYNTHETIC_REGISTRY_SOURCE;
  const text = snapshot
    ? fillTemplate(synthetic ? l.syntheticRegistrySnapshotTemplate : l.registrySnapshotTemplate, {
        denomination: snapshot.denomination,
        siren: siren ?? '-',
        effectifs:
          translateEffectifLabel(
            effectifCodeFromAssessment(obligationAssessment),
            snapshot.effectifBandLabel,
            language,
          ) ?? l.registrySnapshotEffectifsUnavailable,
        // registrySnapshot.retrievedAt is typed as a real Date, but this
        // value is loaded from a persisted analysis JSON file with no
        // reviver (same as every other date field in this pipeline -
        // the audit date above goes through auditDate(), which does the same), so it
        // arrives as a string at runtime. Confirmed by a real "Invalid
        // time value" crash against a live La Corniche regeneration
        // before this wrap was added.
        date: formatDate(new Date(snapshot.retrievedAt), language),
      })
    : siren
      ? fillTemplate(l.sirenTemplate, {
          siren,
          date: formatDate(auditDate(manifest), language),
        })
      : l.sirenUnavailable;
  // P2.1: a one-line trust note, only when a real registry snapshot
  // renders - explains that the denomination is reproduced verbatim from
  // Sirene rather than derived from the domain, since it can carry
  // formatting artifacts (an unbalanced parenthesis, seen on a real
  // report) that read as a scraping error at first glance.
  const provenanceNote = snapshot
    ? `<p style="font-size:11px;opacity:0.5;margin-top:2px">${escapeHtml(synthetic ? l.syntheticRegistrySnapshotNote : l.registrySnapshotVerbatimNote)}</p>`
    : '';
  return `<p style="font-size:12.5px;opacity:0.65;margin-top:var(--space-2)">${escapeHtml(text)}</p>${provenanceNote}`;
}

/** Issue #42: when the obligation engine resolved the transactional-flow
 *  gate to likely_in_scope via a 'transactional-flow-inconclusive' fact,
 *  the status card alone reads like a routine "to be confirmed"; the
 *  client deserves to know detection actually found booking controls it
 *  could not resolve, which is a materially stronger hint than silence.
 *  Reads the engine's own fact (never recomputes the decision) and the
 *  underlying siteSignals only for the example pages, the same pattern
 *  renderTransactionalFlowScopeNote uses for confirmed evidence. */
function renderTransactionalFlowInconclusiveNote(
  strings: ReportStrings,
  manifest: AuditManifest,
  obligationAssessment: ObligationAssessment | undefined,
): string {
  const inconclusive = obligationAssessment?.basis.some((b) =>
    b.facts.some((f) => f.kind === 'transactional-flow-inconclusive'),
  );
  if (!inconclusive) return '';

  const l = strings.legalExposure;
  const examplePages = [
    ...new Set(
      [
        ...(manifest.siteSignals?.transactionalFlowAmbiguities ?? []).map((a) => a.pageUrl),
        ...(manifest.siteSignals?.transactionalFlowRedirectChecks ?? [])
          .filter((check) => check.resolution === 'undetermined')
          .map((check) => check.pageUrl),
      ].sort(),
    ),
  ]
    .slice(0, TRANSACTIONAL_FLOW_EXAMPLE_PAGE_COUNT)
    .join(', ');

  const text = examplePages
    ? fillTemplate(l.transactionalFlowInconclusiveTemplate, { examplePages })
    : l.transactionalFlowInconclusiveNoExample;
  return `<p style="font-size:12.5px;opacity:0.65;margin-top:var(--space-2)">${escapeHtml(text)}</p>`;
}

/** item 0.1: a manual hasTransactionalFlow override that disagrees with
 *  what the scanner actually detected must be visible, not silently
 *  trusted - assessObligations() still only ever sees one resolved
 *  boolean (obligation-stage.ts's resolveSiteSignals), so this reads the
 *  conflict record that resolution already keeps (siteSignalResolutions),
 *  the same "state the conflict, don't resolve it silently" precedent
 *  sirenMismatch already established for SIREN. */
function renderTransactionalFlowConflictNote(
  strings: ReportStrings,
  obligationAssessment: ObligationAssessment | undefined,
): string {
  const resolution = obligationAssessment?.siteSignalResolutions?.hasTransactionalFlow;
  if (
    !resolution ||
    resolution.detectedValue === undefined ||
    resolution.detectedValue === resolution.value
  )
    return '';

  const l = strings.legalExposure;
  const detectedValue = resolution.detectedValue
    ? l.transactionalFlowConflictDetectedPresent
    : l.transactionalFlowConflictDetectedAbsent;
  const manualValue = resolution.value
    ? l.transactionalFlowConflictManualPresent
    : l.transactionalFlowConflictManualAbsent;
  const text = fillTemplate(l.transactionalFlowConflictTemplate, { detectedValue, manualValue });
  return `<p data-report-severity="serious" style="font-size:12.5px;opacity:0.85;margin-top:var(--space-2);color:${SEVERITY.serious.color}">${escapeHtml(text)}</p>`;
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
function renderTransactionalFlowScopeNote(
  strings: ReportStrings,
  manifest: AuditManifest,
  obligationAssessment: ObligationAssessment | undefined,
): string {
  const l = strings.legalExposure;
  const evidence = manifest.siteSignals?.transactionalFlowEvidence ?? [];
  if (evidence.length === 0) return '';

  // Issue #71: this note names the transactional flow found on the site,
  // which reads as a direct contradiction next to an "obligation does not
  // apply" status headline when the SME exemption is what actually
  // resolved that status. checkSmeExemption
  // (packages/core/src/compliance/assessObligations.ts) short-circuits to
  // out_of_scope before ever inspecting siteSignals.hasTransactionalFlow,
  // so a real site can carry transactional-flow evidence that played no
  // part in the printed status at all. The 'sme-exemption' fact kind is
  // only ever attached on that exempt branch, so its presence is a
  // reliable signal that the flow evidence below is not load-bearing for
  // the status this section just printed - suppress the note rather than
  // let it contradict the headline. Assessments computed without the SME
  // exemption applying (or with no assessment at all) are unaffected.
  const eaaBasis = obligationAssessment?.basis.find((b) => b.regimeId === EAA_REGIME_ID);
  const smeExempt = eaaBasis?.facts.some((f) => f.kind === 'sme-exemption') ?? false;
  if (smeExempt) return '';

  const delegated = evidence.filter((e) => e.kind === 'delegated-booking-redirect');
  // P0.3: name the actual detected component(s) rather than dumping every
  // page the mechanism happens to appear on - it's a site-wide layout
  // component (e.g. a booking widget's own iframe or embedded script), not
  // something confined to the pages it was captured on. Reuses the same
  // vendor-prefix table third-party-attribution.ts already applies to
  // findings, since evidence[].selector is the same shape.
  const onSite = evidence.filter((e) => e.kind !== 'delegated-booking-redirect');
  const vendors = [
    ...new Set(
      onSite.map((e) => detectVendor(e.selector)).filter((v): v is string => v !== undefined),
    ),
  ];
  const examplePages = [...new Set(onSite.map((e) => e.pageUrl))]
    .sort()
    .slice(0, TRANSACTIONAL_FLOW_EXAMPLE_PAGE_COUNT)
    .join(', ');

  const text =
    delegated.length > 0
      ? l.transactionalFlowDelegatedTemplate
      : vendors.length > 0
        ? fillTemplate(l.transactionalFlowOnSiteTemplate, {
            vendors: vendors.join(', '),
            examplePages,
          })
        : fillTemplate(l.transactionalFlowOnSiteNoVendorTemplate, { examplePages });

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
 *  docs/rules/obligation-basis.md's route-3 case-law entries, is explicitly
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
/** A7b (2026-08-24): the LCEN identification obligation, surfaced to the
 *  client for the first time. The scanner has detected it since milestone 8
 *  (lcen-mentions-legales-missing), but it only ever appeared as one row in
 *  the annex under an unrelated category, while section 03 - the page a
 *  client or their lawyer reads for "what does the law require of me" - was
 *  entirely about the EAA. A regime the scanner tests for and the report
 *  stays silent about is worse than not testing for it.
 *
 *  Deliberately not routed through assessObligations(). That function
 *  resolves a scope question (in_scope / likely_in_scope / out_of_scope)
 *  from registry facts, and LCEN has no scope test at all - it attaches to
 *  editing a professional online service, with no size or sector threshold.
 *  Folding it in would mean inventing a status for a regime that has none,
 *  and would move `status`, which drives the cover badge and several other
 *  strings. It is its own block, from its own trigger.
 *
 *  Trade-off 11 holds: every legal word here is spliced from regimes.ts
 *  (name, threshold text, authority, citation, all verified against
 *  Legifrance) or from a fixed string, never written by the model. The
 *  criterion may be stated where EAA scope may not, because it is not
 *  size-dependent, sector-dependent or contested - see
 *  docs/rules/obligation-basis.md section 8bis. No sanction amount is stated,
 *  which CLAUDE.md rule 6 forbids for a specific client and which section
 *  8bis independently marks unverified after the SREN restructuring.
 *
 *  Renders only when the finding is actually present. A client who does
 *  publish the identifier gets silence, not a passing grade: the scan
 *  visits a bounded number of pages and cannot certify an absence of
 *  breach anywhere on a site. `findings` is the post-resolveLcenFinding
 *  array, so an operator who confirmed by hand where the identifier lives
 *  suppresses this block through the same single decision point every
 *  other consumer reads. */
function renderLcenBlock(
  strings: ReportStrings,
  language: ReportLanguage,
  findings: readonly Finding[],
): string {
  const hasLcenFinding = findings.some(
    (finding) => finding.ruleId === LCEN_MENTIONS_LEGALES_RULE_ID,
  );
  if (!hasLcenFinding) return '';

  const regime = getRegime(LCEN_MENTIONS_LEGALES_REGIME_ID, language);
  if (!regime) return '';

  const l = strings.legalExposure;
  // regime.authorityPrefixFr exists for methodology.ts's "dont le contrôle
  // relève {prefix} {authority}" construction. This label is a nominative
  // ("Autorité compétente : ..."), which takes no preposition - prepending
  // it here produced "Autorité compétente : de la Direction générale".
  const authorityDisplay = regime.authority;

  return `
    <div class="card elev-sm" style="margin-top:var(--space-4)">
      <div class="card-kicker">${escapeHtml(l.lcenKicker)}</div>
      <div class="card-title">${escapeHtml(regime.name)}</div>
      <p style="font-size:12.5px;margin-top:var(--space-2)">${escapeCopy(regime.thresholdDescription, language)}</p>
      <p style="font-size:12.5px;margin-top:var(--space-2)">${escapeCopy(l.lcenObserved, language)}</p>
      <p style="font-size:11.5px;margin-top:var(--space-2)" class="text-muted">${escapeHtml(
        fillTemplate(l.lcenSourceTemplate, {
          citation: regime.legalCitation,
          authority: authorityDisplay,
        }),
      )}</p>
      <p style="font-size:11.5px;margin-top:2px" class="text-muted">${escapeHtml(l.lcenScanLimitNote)}</p>
    </div>
  `;
}

function renderGeneralEaaReference(
  strings: ReportStrings,
  language: ReportLanguage,
  obligationAssessment: ObligationAssessment | undefined,
): string {
  if (
    !obligationAssessment ||
    (obligationAssessment.status !== 'in_scope' &&
      obligationAssessment.status !== 'likely_in_scope') ||
    pickPrimaryBasis(obligationAssessment)?.regimeId !== EAA_REGIME_ID
  )
    return '';

  return `
    <div class="card elev-sm" style="margin-top:var(--space-6)" data-general-eaa-reference>
      <div class="card-kicker">${escapeHtml(strings.legalExposure.generalEaaReferenceHeading)}</div>
      <div class="card-body">${escapeCopy(eaaSanctionFigureSentence(language), language)}</div>
    </div>
  `;
}

export function renderLegalExposure(
  strings: ReportStrings,
  ordinal: number,
  language: ReportLanguage,
  obligationAssessment: ObligationAssessment | undefined,
  generatedAt: Date,
  manifest: AuditManifest,
  findings: readonly Finding[],
  manualFields?: AuditManualFields,
): string {
  const l = strings.legalExposure;
  if (
    obligationAssessment?.basis.some((basis) =>
      basis.facts.some((fact) => fact.kind === 'overseas-jurisdiction-unverified'),
    ) === true
  ) {
    return sheet(
      `
    ${renderSheetHeader(ordinal, l.eyebrow, l.heading)}
    <div class="card elev-sm" data-overseas-regime>
      <div class="card-kicker">${escapeHtml(l.obligationStatusLabel)}</div>
      <div class="card-title">${escapeHtml(l.overseasStatusLabel)}</div>
      <div class="card-body">${escapeCopy(l.overseasStatusDescription, language)}</div>
    </div>
    <p style="font-size:11px;opacity:0.5;margin-top:var(--space-4)">${escapeHtml(l.disclaimerNote)}</p>
  `,
      '',
      'section-02',
    );
  }
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

  const lcenBlock = renderLcenBlock(strings, language, findings);
  const generalEaaReference = renderGeneralEaaReference(strings, language, obligationAssessment);
  const synthetic = obligationAssessment?.registrySnapshot?.source === SYNTHETIC_REGISTRY_SOURCE;

  return sheet(
    `
    ${renderSheetHeader(ordinal, l.eyebrow, l.heading)}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4);margin-bottom:var(--space-6)">
      <div class="card elev-sm">
        <div class="card-kicker">${escapeHtml(l.eaaDeadlineLabel)}</div>
        <div class="card-title">${escapeHtml(l.eaaDeadlineValue)}</div>
        <div class="card-body">${escapeCopy(eaaDeadlineNote, language)}</div>
      </div>
      <div class="card elev-sm">
        <div class="card-kicker">${escapeHtml(l.obligationStatusLabel)}</div>
        <div class="card-title">${escapeHtml(l.statusLabels[status])}</div>
        <div class="card-body">${escapeCopy((synthetic ? l.syntheticStatusShortDescriptions : l.statusShortDescriptions)[status], language)}</div>
        ${actionNote}
      </div>
    </div>
    <p style="font-size:13.5px;opacity:0.85">${escapeHtml(paragraph)}</p>
    ${renderTransactionalFlowScopeNote(strings, manifest, obligationAssessment)}
    ${renderTransactionalFlowInconclusiveNote(strings, manifest, obligationAssessment)}
    ${renderTransactionalFlowConflictNote(strings, obligationAssessment)}
    ${lcenBlock}
    ${renderSirenNote(strings, language, manifest, manualFields, obligationAssessment, lcenBlock !== '')}
    ${generalEaaReference}
    <p style="font-size:11px;opacity:0.5;margin-top:var(--space-4)">${escapeHtml(synthetic ? l.syntheticDisclaimerNote : l.disclaimerNote)}</p>
  `,
    '',
    'section-02',
  );
}
