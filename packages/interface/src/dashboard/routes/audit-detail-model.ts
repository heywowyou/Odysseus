/**
 * Pure model for the audit detail page: everything the route component
 * renders or sends is computed here so it stays unit-testable without a
 * component tree, the same split as the other rebuilt dashboard routes.
 */

import type { DashboardLanguage } from '../i18n/types';
import { en } from '../i18n/en';
import { fr } from '../i18n/fr';
import type {
  AuditFailureResponse,
  AuditLifecycle,
  FindingElementResponse,
  FindingResponse,
  IdentityField,
  ManualFieldsResponse,
  RuleCopyResponse,
  Severity,
} from './audit-detail-types';

/** Display order for severities, most severe first. */
export const SEVERITIES: readonly Severity[] = ['critical', 'serious', 'moderate', 'minor'];

export type SectorChoice = '' | 'general' | 'hospitality';

/** One string per enrichment form field; '' means "not set", which the
 *  patch builder must never send (an absent key leaves the stored value
 *  untouched). */
export interface ManualFieldValues {
  siren: string;
  sirenSourceUrl: string;
  raisonSociale: string;
  nomCommercial: string;
  sector: SectorChoice;
  revenueBand: string;
  declarationContactEmail: string;
  recipientName: string;
}

export type ManualFieldKey = keyof ManualFieldValues;

/** Manual fields whose value is a free string (siren included); sector is
 *  excluded because it is a constrained choice with its own setter. */
export type TextManualFieldKey = Exclude<ManualFieldKey, 'sector'>;

/** PATCH /manual-fields body: plain non-empty strings, keys the server
 *  recognizes (routes/audits.ts). The client never sends provenance. */
export type ManualFieldsPatch = Partial<Record<ManualFieldKey, string>>;

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
};

export function isSeverity(value: string): value is Severity {
  return value === 'critical' || value === 'serious' || value === 'moderate' || value === 'minor';
}

/** The page title is the site's bare hostname. A stored siteUrl is always
 *  a valid URL in practice, but the fallback keeps a malformed row
 *  readable instead of crashing a purely presentational value. */
export function hostnameOf(siteUrl: string): string {
  try {
    return new URL(siteUrl).hostname;
  } catch {
    return siteUrl;
  }
}

/** Most severe first; Array.prototype.sort is stable, so findings of the
 *  same severity keep the server's order. Returns a new array. */
export function sortFindings(findings: readonly FindingResponse[]): FindingResponse[] {
  return [...findings].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/** The dashboard consumes this persisted scanner rule through its HTTP
 * boundary, so it identifies the dedicated alert by the stable rule ID
 * rather than trying to infer it from translated titles or category. */
const PUBLISHER_IDENTIFICATION_RULE_ID = 'lcen-mentions-legales-missing';

export function findPublisherIdentificationFinding(
  findings: readonly FindingResponse[],
): FindingResponse | undefined {
  return findings.find((finding) => finding.ruleId === PUBLISHER_IDENTIFICATION_RULE_ID);
}

/** By-value mirror of @odysseus/report's REPORT_PAGE_COUNT_WARNING_THRESHOLD:
 *  this project reads no workspace packages, the same discipline as
 *  audit-detail-types.ts. A report above it is still previewable and
 *  deliverable; its row only gains a non-blocking warning. */
export const REPORT_PAGE_COUNT_WARNING_THRESHOLD = 60;

/** Pure warning decision for a report row (plan 018). A legacy row with
 *  no measured page count never warns: absence is not read as a value. */
export function hasPageCountWarning(pageCount: number | undefined): pageCount is number {
  return pageCount !== undefined && pageCount > REPORT_PAGE_COUNT_WARNING_THRESHOLD;
}

/** Plan 032 (issue #162): the reports card notice when the selected
 *  analysis pair came from the audit fallback gate. Undefined when the
 *  pair is model-generated, so the card renders nothing new for every
 *  existing audit. Reads the language tables directly for the same
 *  by-value discipline as the rest of this file. */
export function fallbackNoticeText(
  isStaticFallback: boolean,
  language: DashboardLanguage,
): string | undefined {
  if (!isStaticFallback) return undefined;
  return language === 'fr'
    ? fr.auditDetail.analysisStaticFallbackNotice
    : en.auditDetail.analysisStaticFallbackNotice;
}

/** The scanner's precomputed total (a site-wide issue is one row with a
 *  count, not 400 rows); elements only carry a capped sample. */
export function countOccurrences(finding: FindingResponse): number {
  return finding.occurrences;
}

/** pageUrls is already deduped by the locked findings contract, but the
 *  column promises unique pages, so defend here rather than trust the
 *  writer. */
export function countPages(finding: FindingResponse): number {
  return new Set(finding.pageUrls).size;
}

// ---------------------------------------------------------------------------
// Issue #90: report-stage failure
// ---------------------------------------------------------------------------

/** The two remediation cases a stored failure can name. The typed one is
 *  the D8 identity gate: the job carries exactly which detected fields it
 *  is waiting to have confirmed. Everything else (a render crash, a lint
 *  refusal) is still a report-stage failure whose crawl is done, but the
 *  only prescription available is the generic one. */
export type FailureReasonKind = 'identity-confirmation' | 'report-stage';

export function failureReasonKind(failure: AuditFailureResponse): FailureReasonKind {
  return failure.needsInputFields !== undefined && failure.needsInputFields.length > 0
    ? 'identity-confirmation'
    : 'report-stage';
}

/** Whether the audit detail page should render the failure card: only
 *  while the reports are not usable. Once a fresh bilingual pair exists
 *  (the operator confirmed the fields and regenerated), the failure
 *  history stays in the API response but must not read as a current
 *  problem over a page whose reports are fine. */
export function isReportStageFailure(detail: {
  failure: AuditFailureResponse | undefined;
  lifecycle: AuditLifecycle;
}): boolean {
  return (
    detail.failure !== undefined &&
    (detail.lifecycle === 'scanned' || detail.lifecycle === 'analysed')
  );
}

// ---------------------------------------------------------------------------
// Issue #93: findings table discriminators, expansion, reviewed copy
// ---------------------------------------------------------------------------

/** Rule-id keyed view of the API's reviewed rule copy. */
export type RuleCopyMap = Record<string, RuleCopyResponse>;

/** The row title: English reports use the finding's own (English) title
 *  verbatim, the same rule the PDF follows; French replaces it with the
 *  reviewed translation when one exists and falls back to the raw
 *  detector title only when the rule genuinely has no copy. */
export function findingDisplayTitle(
  finding: FindingResponse,
  ruleCopy: RuleCopyMap | undefined,
  language: DashboardLanguage,
): string {
  if (language !== 'fr') return finding.title;
  return ruleCopy?.[finding.ruleId]?.titleFr ?? finding.title;
}

/** Short French gloss under the rule, for the cryptic detector codes the
 *  report itself explains; English reports render none, again matching
 *  the PDF. */
function findingGloss(
  finding: FindingResponse,
  ruleCopy: RuleCopyMap | undefined,
): string | undefined {
  return ruleCopy?.[finding.ruleId]?.glossFr;
}

/** Reviewed remediation line in the interface language, or undefined
 *  when the rule has no reviewed copy: absence is rendered as nothing,
 *  never as a reworded guess. */
export function findingRemediation(
  finding: FindingResponse,
  ruleCopy: RuleCopyMap | undefined,
  language: DashboardLanguage,
): string | undefined {
  const copy = ruleCopy?.[finding.ruleId];
  if (copy === undefined) return undefined;
  return language === 'fr' ? copy.remediationFr : copy.remediationEn;
}

/** The element identity that makes duplicate detector titles
 *  distinguishable at a glance: the finding id is already short and
 *  sequential (f001, f002, ...), and the first occurrence's selector
 *  says which element on the page it is. */
export function firstElementSelector(finding: FindingResponse): string | undefined {
  const selector = finding.elements[0]?.selector;
  return selector === undefined || selector === '' ? undefined : selector;
}

/** How many affected pages the expansion lists before the "+ N autres"
 *  line; pageUrls is uncapped in storage, so the slice is what keeps a
 *  90-page finding from taking over the card. */
const FINDING_PAGE_PREVIEW_COUNT = 8;

/** How many occurrences (selector, snippet, page) the expansion lists
 *  before the "+ N autres" line; elements are already a capped sample in
 *  storage, this only bounds the rendered height. */
const FINDING_ELEMENT_PREVIEW_COUNT = 5;

export interface FindingExpansionView {
  remediation: string | undefined;
  gloss: string | undefined;
  pages: string[];
  hiddenPageCount: number;
  elements: FindingElementResponse[];
  hiddenElementCount: number;
}

/** Everything an expanded row shows, computed in one pass so the
 *  component stays presentational. */
export function findingExpansionView(
  finding: FindingResponse,
  ruleCopy: RuleCopyMap | undefined,
  language: DashboardLanguage,
): FindingExpansionView {
  const pages = [...new Set(finding.pageUrls)];
  const previewCount = Math.min(pages.length, FINDING_PAGE_PREVIEW_COUNT);
  const elementCount = Math.min(finding.elements.length, FINDING_ELEMENT_PREVIEW_COUNT);
  return {
    remediation: findingRemediation(finding, ruleCopy, language),
    gloss: findingGloss(finding, ruleCopy),
    pages: pages.slice(0, previewCount),
    hiddenPageCount: pages.length - previewCount,
    elements: finding.elements.slice(0, elementCount),
    hiddenElementCount: finding.elements.length - elementCount,
  };
}

export function normalizeSiren(value: string): string {
  return value.replace(/\s/g, '');
}

/** Ported by value from @odysseus/core's isValidSiren (via the old page's
 *  app-new-scan.ts, which does the same): the dashboard project does not
 *  read workspace packages. Client-side checksum is a UX nicety only; the
 *  server re-validates with the real implementation on both the preview
 *  and the PATCH route. Luhn over the 9 digits. */
export function isValidSiren(value: string): boolean {
  const cleaned = normalizeSiren(value);
  if (!/^\d{9}$/.test(cleaned)) return false;
  let sum = 0;
  for (let i = 0; i < cleaned.length; i++) {
    let digit = Number(cleaned.charAt(cleaned.length - 1 - i));
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

/** Form seed from the API's optional provenanced fields: absent fields
 *  become '' (the "not set" the patch builder never sends), and an
 *  out-of-contract sector value degrades to '' instead of poisoning the
 *  select. */
export function manualFieldValuesFromResponse(
  manualFields: ManualFieldsResponse | null | undefined,
): ManualFieldValues {
  const text = (field: { value: string } | undefined): string => field?.value ?? '';
  const sector = manualFields?.sector?.value;
  return {
    siren: text(manualFields?.siren),
    sirenSourceUrl: text(manualFields?.sirenSourceUrl),
    raisonSociale: text(manualFields?.raisonSociale),
    nomCommercial: text(manualFields?.nomCommercial),
    sector: sector === 'general' || sector === 'hospitality' ? sector : '',
    revenueBand: text(manualFields?.revenueBand),
    declarationContactEmail: text(manualFields?.declarationContactEmail),
    recipientName: text(manualFields?.recipientName),
  };
}

const IDENTITY_FIELDS = ['nomCommercial', 'raisonSociale'] as const;

export interface UnconfirmedIdentityField {
  field: IdentityField;
  value: string;
}

/** Plan 045 slice 1.3: mirrors packages/report's
 *  findUnconfirmedIdentityFields (D8's cover-identity gate) client-side,
 *  over the manualFields the detail response already carries - the exact
 *  set the stepper's Prepare step must offer an inline Confirm for,
 *  without waiting for a report-stage failure to surface the same fields
 *  as AuditFailureResponse.needsInputFields. */
export function unconfirmedIdentityFields(
  manualFields: ManualFieldsResponse | null | undefined,
): UnconfirmedIdentityField[] {
  if (!manualFields) return [];
  const unconfirmed: UnconfirmedIdentityField[] = [];
  for (const field of IDENTITY_FIELDS) {
    const entry = manualFields[field];
    if (entry === undefined || entry.provenance !== 'detected') continue;
    unconfirmed.push({ field, value: entry.value });
  }
  return unconfirmed;
}

/** The PATCH body: only keys the operator actually changed, only non-empty
 *  values, so a save can never erase a stored field by sending '' and
 *  never re-sends unchanged data (which would needlessly rewrite
 *  provenance on the server). Text values are trimmed and the SIREN is
 *  stripped of spaces, matching what the server stores; sector is only
 *  ever sent as 'general' or 'hospitality'. */
export function buildManualFieldsPatch(
  values: ManualFieldValues,
  baseline: ManualFieldValues,
): ManualFieldsPatch {
  const patch: ManualFieldsPatch = {};
  const textCandidates: ReadonlyArray<[TextManualFieldKey, string, string]> = [
    ['siren', normalizeSiren(values.siren), normalizeSiren(baseline.siren)],
    ['sirenSourceUrl', values.sirenSourceUrl.trim(), baseline.sirenSourceUrl],
    ['raisonSociale', values.raisonSociale.trim(), baseline.raisonSociale],
    ['nomCommercial', values.nomCommercial.trim(), baseline.nomCommercial],
    ['revenueBand', values.revenueBand.trim(), baseline.revenueBand],
    [
      'declarationContactEmail',
      values.declarationContactEmail.trim(),
      baseline.declarationContactEmail,
    ],
    ['recipientName', values.recipientName.trim(), baseline.recipientName],
  ];
  for (const [key, value, base] of textCandidates) {
    if (value !== '' && value !== base) {
      patch[key] = value;
    }
  }
  if (
    (values.sector === 'general' || values.sector === 'hospitality') &&
    values.sector !== baseline.sector
  ) {
    patch.sector = values.sector;
  }
  return patch;
}

// ---------------------------------------------------------------------------
// Plan 037 slice 5: outreach preview card responses and gates
// ---------------------------------------------------------------------------

/** GET /api/audits/:auditId/outreach-preview. A refusal is an expected,
 *  correct outcome of the readiness gates; `refusal` is the server's
 *  stable code, turned into operator copy by outreachRefusalSentence
 *  below and never translated in place. */
export type OutreachPreviewRenderResponse =
  { rendered: true; html: string } | { rendered: false; refusal: string };

/** POST /api/audits/:auditId/outreach-preview/publish. The url carries the
 *  raw one-time token and exists only in this one response. */
export type OutreachPreviewPublishResponse =
  | { published: true; previewId: string; url: string; publicExpiresAt: string }
  | { published: false; refusal: string };

/** POST /api/prospects/:candidateId/outreach/first-email. Plan 045 section
 *  1.7: publish, supersede whatever was live, and draft in one call.
 *  `previewUrl` carries the fresh one-time link whenever this call
 *  published one - even when drafting itself then refused, since a real
 *  publish is a side effect the page must never let go unreported. */
export type OutreachFirstEmailResponse =
  { created: true; previewUrl: string } | { created: false; refusal: string; previewUrl?: string };

/** The one short sentence per stable refusal code, in the interface
 *  language. Refusal codes are stable API strings, so this table is the
 *  only place that turns one into operator copy; a code with no entry
 *  returns undefined and each caller picks its own fallback. */
export function outreachRefusalCopy(
  refusal: string,
  language: DashboardLanguage,
): string | undefined {
  const table =
    language === 'fr'
      ? fr.auditDetail.outreachPreview.refusalReasons
      : en.auditDetail.outreachPreview.refusalReasons;
  return table[refusal];
}

/** Render and publish refusals always end up as a sentence: a known code
 *  maps through outreachRefusalCopy, an unknown one falls back to the
 *  unavailable notice carrying the raw code, deliberately untranslated. */
export function outreachRefusalSentence(refusal: string, language: DashboardLanguage): string {
  return (
    outreachRefusalCopy(refusal, language) ??
    (language === 'fr'
      ? fr.auditDetail.outreachPreview.unavailableWithReason
      : en.auditDetail.outreachPreview.unavailableWithReason
    ).replace('{refusal}', refusal)
  );
}

/** Revoke enablement: a live v2 preview exists, or this session published
 *  one and the detail fetch has not caught up yet. An audit with neither
 *  has nothing to take down. */
export function canRevokeOutreachPreview(
  hasLiveV2Preview: boolean,
  sessionPublished: boolean,
): boolean {
  return hasLiveV2Preview || sessionPublished;
}

// ---------------------------------------------------------------------------
// Plan 040 slice 5: the client-report stepper
// ---------------------------------------------------------------------------

/** The five steps of the client-report stepper, in the order the IA fixes
 *  them. */
export type ReportStepKey = 'prepare' | 'redact' | 'choose' | 'produce' | 'approve';

/** DOM ids of the stepper's steps, so the failure card can jump to the
 *  step to redo instead of carrying its own regenerate button. */
export const REPORT_STEP_ANCHORS: Record<ReportStepKey, string> = {
  prepare: 'audit-step-prepare',
  redact: 'audit-step-redact',
  choose: 'audit-step-choose',
  produce: 'audit-step-produce',
  approve: 'audit-step-approve',
};

export type ReportStepState = 'done' | 'active' | 'todo';

export interface ReportStep {
  key: ReportStepKey;
  state: ReportStepState;
  /** Whether the step renders its body at all. A step the ladder has not
   *  reached renders muted with its number and title but no button. */
  enabled: boolean;
}

/** Everything the ladder reads. The preparation view decides the first
 *  three steps; the audit row itself the last two, so an audit whose
 *  preparation was never created (the endpoint answers 404) still reaches
 *  the production steps. */
export interface ReportStepperInput {
  acknowledgementCurrent: boolean;
  warningCount: number;
  candidateStatus: 'ready' | 'failed' | 'selected' | undefined;
  isWritingSelected: boolean;
  lifecycle: AuditLifecycle;
  /** Any stored report pair (the analysis produced rows), fresh or not. */
  hasStoredReportPair: boolean;
  /** A fresh, deliverable pair: lifecycle rendered or approved. */
  hasFreshReportPair: boolean;
  /** Plan 045 slice 1.2: whether a bilingual analysis pair resolves for
   *  this audit at all (AuditDetailResponse.analysisPair). An audit like
   *  Belleval - confirmed identity fields, both analyses present, zero
   *  reports - has neither an approved candidate nor a stored report row,
   *  so without this the produce step stayed disabled with nothing left to
   *  unlock it. */
  analysisPair: 'selected' | 'legacy-latest' | 'none';
  /** Plan 045 slice 1.2: whether the request behind produce will refresh
   *  stale findings first (AuditDetailResponse.findingsStale), so the
   *  button's own label can say so instead of the operator discovering it
   *  only after clicking. */
  findingsStale: boolean;
}

/** The five steps of the client-report stepper (approved IA, "The audit
 *  page"): each step unlocks when the previous one is done, walking the
 *  missing-context warnings, the writing candidate, its approval, the PDF
 *  production, and the delivery approval.
 *
 *  Two deliberate openings in the ladder: a done step stays enabled (an
 *  operator may redo it), and the production step also unlocks from a
 *  stored pair alone, because a report-stage failure on an `analysed`
 *  audit must be redoable there; that failure is exactly why the pair
 *  never became fresh. */
export function reportStepperSteps(input: ReportStepperInput): ReportStep[] {
  const prepareDone = input.acknowledgementCurrent || input.warningCount === 0;
  const redactDone =
    input.candidateStatus === 'ready' ||
    input.candidateStatus === 'selected' ||
    input.isWritingSelected;
  const chooseDone = redactDone && input.isWritingSelected;
  const produceDone = input.hasFreshReportPair;
  const approveDone = produceDone && input.lifecycle === 'approved';

  // The ladder: a step is reachable when its predecessor is done, and a
  // done step is always reachable again (redo). Production's real gate is
  // "does a bilingual analysis pair resolve at all" (analysisPair !==
  // 'none'): the old chooseDone-or-stored-pair pair of openings both
  // implied that gate but did not cover it, which is exactly how Belleval
  // (confirmed fields, both analyses, zero reports, no approved candidate)
  // stayed stuck at needs-input with nothing left to click.
  const steps: { key: ReportStepKey; done: boolean; enabled: boolean }[] = [
    { key: 'prepare', done: prepareDone, enabled: true },
    // Plan 045 section 2.2: a missing-context warning is informational, not
    // a gate - the writing step no longer waits on its acknowledgement
    // (which nothing downstream enforces any more either).
    { key: 'redact', done: redactDone, enabled: true },
    { key: 'choose', done: chooseDone, enabled: redactDone },
    { key: 'produce', done: produceDone, enabled: input.analysisPair !== 'none' },
    { key: 'approve', done: approveDone, enabled: produceDone },
  ];
  return steps.map(({ key, done: isDone, enabled: isEnabled }) => ({
    key,
    state: isDone ? 'done' : isEnabled ? 'active' : 'todo',
    enabled: isEnabled,
  }));
}
