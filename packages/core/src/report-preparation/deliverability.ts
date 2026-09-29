/**
 * Issue #567: whether an audit's report is current and deliverable, answered
 * once. The dashboard, approval, download, the outreach preview, To do and
 * job reconciliation each used to answer it their own way. Five copies of the
 * findings-provenance comparison disagreed on a missing provenance (one read
 * two missing records as a match), and the preview store accepted a report
 * rendered from an analysis that was no longer selected.
 *
 * Two levels:
 *  - current: the selected analysis pair was written from the audit's
 *    findings, and the latest report in each selected language was rendered
 *    from that analysis over those findings. Cheap: no PDF is read.
 *  - deliverable: current, and each report's PDF is present with its stored
 *    digest, read through the caller's PDF check.
 *
 * Pure apart from the injected PDF check, so every surface can run it over the
 * rows it already loaded.
 */
import type { FindingsProvenance } from '../normalize/findings-provenance.js';
import type { ReportLanguage } from '../types/llm-output.js';
import type { ReportTheme } from '../types/report.js';

/**
 * The one findings-provenance comparison. Fails closed: a missing record, or
 * one without a digest, is never current (the charter's provenance guardrail).
 */
export function findingsProvenanceMatches(
  a: Partial<FindingsProvenance> | null | undefined,
  b: Partial<FindingsProvenance> | null | undefined,
): boolean {
  return (
    a?.findingsDigest !== undefined &&
    b?.findingsDigest !== undefined &&
    a.findingsSchemaVersion === b.findingsSchemaVersion &&
    a.normalizationFingerprint === b.normalizationFingerprint &&
    a.findingsDigest === b.findingsDigest
  );
}

/** The analysis fields deliverability reads. */
export interface DeliverabilityAnalysis {
  analysisId: string;
  findingsProvenance?: Partial<FindingsProvenance>;
}

/** The selected pair, as resolveSelectedAnalysisPair returns it. */
export type DeliverabilitySelection<A extends DeliverabilityAnalysis = DeliverabilityAnalysis> =
  { kind: 'selected' | 'legacy-latest'; fr: A; en?: A } | { kind: 'none' };

/** The report fields deliverability reads. */
export interface DeliverabilityReport {
  reportId?: string;
  analysisId?: string;
  findingsProvenance?: Partial<FindingsProvenance>;
  pdfDigest?: string;
  variants?: { light?: { pdfDigest: string } };
}

export interface ApprovalReportRef {
  reportId: string;
  pdfDigest: string;
  variantDigests?: { light?: string };
}

/** The approval fields deliverability reads. */
export interface DeliverabilityApproval {
  fr: ApprovalReportRef;
  en?: ApprovalReportRef;
}

export type NotCurrentReason =
  | 'audit-unstamped'
  | 'no-selection'
  | 'selection-stale'
  | 'missing-report'
  | 'report-not-selected'
  | 'report-stale';

export type EnglishState<R> =
  | { state: 'not-selected' }
  | { state: 'current'; report: R }
  | { state: 'not-current'; reason: NotCurrentReason };

export type CurrentPairVerdict<R extends DeliverabilityReport, A extends DeliverabilityAnalysis> =
  | { current: true; fr: R; frAnalysis: A; english: EnglishState<R> }
  | { current: false; reason: NotCurrentReason };

export interface CurrentPairInput<
  R extends DeliverabilityReport,
  A extends DeliverabilityAnalysis,
> {
  /** The audit's own findings provenance. */
  auditFindings: Partial<FindingsProvenance> | undefined;
  selection: DeliverabilitySelection<A>;
  /** The latest report per language, or null. */
  fr: R | null;
  en: R | null;
}

function languageVerdict(
  analysis: DeliverabilityAnalysis,
  report: DeliverabilityReport | null,
  auditFindings: Partial<FindingsProvenance>,
): NotCurrentReason | undefined {
  if (!findingsProvenanceMatches(analysis.findingsProvenance, auditFindings)) {
    return 'selection-stale';
  }
  if (report === null) return 'missing-report';
  if (report.analysisId !== analysis.analysisId) return 'report-not-selected';
  if (!findingsProvenanceMatches(report.findingsProvenance, auditFindings)) return 'report-stale';
  return undefined;
}

/**
 * The French report decides currency; French is the canonical deliverable.
 * English, when the selection carries it, is judged the same way and
 * reported separately: outreach needs only French, while the dashboard and
 * approval need the whole selected pair (isWholePairCurrent).
 */
export function assessCurrentPair<R extends DeliverabilityReport, A extends DeliverabilityAnalysis>(
  input: CurrentPairInput<R, A>,
): CurrentPairVerdict<R, A> {
  const auditFindings = input.auditFindings;
  if (auditFindings?.findingsDigest === undefined) {
    return { current: false, reason: 'audit-unstamped' };
  }
  if (input.selection.kind === 'none') return { current: false, reason: 'no-selection' };
  const { fr: frAnalysis, en: enAnalysis } = input.selection;
  const frenchReason = languageVerdict(frAnalysis, input.fr, auditFindings);
  if (frenchReason !== undefined) return { current: false, reason: frenchReason };
  let english: EnglishState<R> = { state: 'not-selected' };
  if (enAnalysis !== undefined) {
    const englishReason = languageVerdict(enAnalysis, input.en, auditFindings);
    english =
      englishReason === undefined
        ? { state: 'current', report: input.en! }
        : { state: 'not-current', reason: englishReason };
  }
  return { current: true, fr: input.fr!, frAnalysis, english };
}

export interface CurrentReportPair<R> {
  fr: R;
  en?: R;
}

/** The whole selected pair is current: French, and English when selected. */
export function wholeCurrentPair<R extends DeliverabilityReport, A extends DeliverabilityAnalysis>(
  verdict: CurrentPairVerdict<R, A>,
): CurrentReportPair<R> | undefined {
  if (!verdict.current || verdict.english.state === 'not-current') return undefined;
  return verdict.english.state === 'current'
    ? { fr: verdict.fr, en: verdict.english.report }
    : { fr: verdict.fr };
}

/** Whether one report's PDF, in the dark theme unless named, is present with
 *  its stored digest. Supplied by the caller, which owns artifact storage. */
export type PdfVerifier<R> = (report: R, language: ReportLanguage) => Promise<boolean>;

/** The whole selected pair, current and with every PDF verified. */
export async function deliverablePair<
  R extends DeliverabilityReport,
  A extends DeliverabilityAnalysis,
>(
  verdict: CurrentPairVerdict<R, A>,
  verifyPdf: PdfVerifier<R>,
): Promise<CurrentReportPair<R> | undefined> {
  const pair = wholeCurrentPair(verdict);
  if (pair === undefined) return undefined;
  if (pair.fr.reportId === undefined || (pair.en !== undefined && pair.en.reportId === undefined)) {
    return undefined;
  }
  if (!(await verifyPdf(pair.fr, 'fr'))) return undefined;
  if (pair.en !== undefined && !(await verifyPdf(pair.en, 'en'))) return undefined;
  return pair;
}

export type AuditLifecycle = 'scanned' | 'analysed' | 'rendered' | 'approved';

/** The dashboard's lifecycle: analysed once a selected pair was written from
 *  the audit's findings, rendered once that pair's reports are deliverable,
 *  approved once the latest approval covers exactly that pair. */
export function auditLifecycle<R extends DeliverabilityReport>(input: {
  auditFindings: Partial<FindingsProvenance> | undefined;
  selection: DeliverabilitySelection;
  deliverable: CurrentReportPair<R> | undefined;
  approval: DeliverabilityApproval | null;
}): AuditLifecycle {
  if (input.deliverable !== undefined) {
    return approvalMatchesReportPair(input.approval, input.deliverable) ? 'approved' : 'rendered';
  }
  const { selection } = input;
  const analysed =
    selection.kind !== 'none' &&
    findingsProvenanceMatches(selection.fr.findingsProvenance, input.auditFindings) &&
    (selection.en === undefined ||
      findingsProvenanceMatches(selection.en.findingsProvenance, input.auditFindings));
  return analysed ? 'analysed' : 'scanned';
}

/** What an approval records of one report: its identity and its digests. */
export function approvalRefForReport(report: DeliverabilityReport): ApprovalReportRef {
  if (!report.reportId || !report.pdfDigest) {
    throw new Error('cannot approve a report without a report ID and digest');
  }
  return {
    reportId: report.reportId,
    pdfDigest: report.pdfDigest,
    ...(report.variants?.light === undefined
      ? {}
      : { variantDigests: { light: report.variants.light.pdfDigest } }),
  };
}

/** The approval record of a deliverable pair. */
export function approvalRecordFor(pair: CurrentReportPair<DeliverabilityReport>): {
  fr: ApprovalReportRef;
  en?: ApprovalReportRef;
} {
  return {
    fr: approvalRefForReport(pair.fr),
    ...(pair.en !== undefined ? { en: approvalRefForReport(pair.en) } : {}),
  };
}

/** Whether two deliverable pairs are the same version: same reports, same
 *  dark and light digests. Approval re-checks this inside its transaction. */
export function isSamePairVersion(
  a: CurrentReportPair<DeliverabilityReport>,
  b: CurrentReportPair<DeliverabilityReport>,
): boolean {
  const same = (x: DeliverabilityReport | undefined, y: DeliverabilityReport | undefined) =>
    x?.reportId === y?.reportId &&
    x?.pdfDigest === y?.pdfDigest &&
    x?.variants?.light?.pdfDigest === y?.variants?.light?.pdfDigest;
  return same(a.fr, b.fr) && same(a.en, b.en);
}

/**
 * Whether one language's report is the exact one that approval covers.
 *
 * Distinct from approvalMatchesReportPair on purpose. That asks "does this
 * approval cover this whole pair", which is the right question when approving
 * and when reporting an audit's lifecycle. Delivering a single language is a
 * narrower question, and asking the pair question there made a bilingual
 * audit's French report undeliverable.
 */
export function approvalCoversReport(
  approval: DeliverabilityApproval | null,
  language: ReportLanguage,
  report: DeliverabilityReport,
  theme: ReportTheme = 'dark',
): boolean {
  if (!approval || !report.reportId) return false;
  const approved = language === 'fr' ? approval.fr : approval.en;
  const darkMatches =
    approved !== undefined &&
    approved.reportId === report.reportId &&
    approved.pdfDigest === report.pdfDigest;
  if (!darkMatches) return false;
  if (theme === 'dark') return true;
  return (
    approved?.variantDigests?.light !== undefined &&
    report.variants?.light?.pdfDigest !== undefined &&
    approved.variantDigests.light === report.variants.light.pdfDigest
  );
}

/** French approval is sufficient for the canonical report. When the approval
 *  also contains English, that attachment must match too. */
export function approvalMatchesReportPair(
  approval: DeliverabilityApproval | null,
  reports: CurrentReportPair<DeliverabilityReport>,
): boolean {
  if (
    !approval ||
    !reports.fr.reportId ||
    approval.fr.reportId !== reports.fr.reportId ||
    approval.fr.pdfDigest !== reports.fr.pdfDigest
  ) {
    return false;
  }
  const approvedFrenchLight = approval.fr.variantDigests?.light;
  if (
    approvedFrenchLight !== undefined &&
    approvedFrenchLight !== reports.fr.variants?.light?.pdfDigest
  )
    return false;

  if (approval.en === undefined) return true;
  const englishMatches = Boolean(
    reports.en?.reportId &&
    approval.en.reportId === reports.en.reportId &&
    approval.en.pdfDigest === reports.en.pdfDigest,
  );
  if (!englishMatches) return false;

  const approvedEnglishLight = approval.en.variantDigests?.light;
  if (
    approvedEnglishLight !== undefined &&
    approvedEnglishLight !== reports.en?.variants?.light?.pdfDigest
  )
    return false;
  return true;
}

export type DeliveryRefusal = 'not-current' | 'not-approved';

/**
 * Whether one language may be delivered in one theme. The report must be the
 * current report of the selected pair for its language, and the approval must
 * cover it. English is an attachment to an approved French deliverable, so it
 * also requires the French report still to be the approved one.
 */
export function mayDeliver<R extends DeliverabilityReport, A extends DeliverabilityAnalysis>(
  verdict: CurrentPairVerdict<R, A>,
  approval: DeliverabilityApproval | null,
  language: ReportLanguage,
  theme: ReportTheme,
): { deliver: true; report: R } | { deliver: false; refusal: DeliveryRefusal } {
  if (!verdict.current) return { deliver: false, refusal: 'not-current' };
  if (language === 'fr') {
    return approvalCoversReport(approval, 'fr', verdict.fr, theme)
      ? { deliver: true, report: verdict.fr }
      : { deliver: false, refusal: 'not-approved' };
  }
  if (verdict.english.state !== 'current') return { deliver: false, refusal: 'not-current' };
  const en = verdict.english.report;
  return approvalCoversReport(approval, 'en', en, theme) &&
    approvalCoversReport(approval, 'fr', verdict.fr, 'dark')
    ? { deliver: true, report: en }
    : { deliver: false, refusal: 'not-approved' };
}
