/**
 * Pure model for the audit report panel (plan 045 stage 3.1): the client
 * report used to be a five-step ladder where an unreached step rendered no
 * button at all (audit-report-stepper.tsx, now gone). The panel replaces
 * that ladder with rows that are always visible; a row whose action is not
 * available yet renders greyed with an inline reason instead of
 * disappearing, so the operator always sees the full shape of what remains.
 */

import type { DashboardLanguage } from '../i18n/types';
import { en } from '../i18n/en';
import { fr } from '../i18n/fr';
import type { AuditLifecycle, ReportStatusResponse } from './audit-detail-types';
import type { ReportProductionStateResponse } from './prepare-report-types';

export type AuditReportPanelRowKey = 'findings' | 'identity' | 'writing' | 'produce' | 'delivery';

export type AuditReportPanelRowStatus = 'done' | 'blocked' | 'ready';

export interface AuditReportPanelRow {
  key: AuditReportPanelRowKey;
  status: AuditReportPanelRowStatus;
  /** Present only when the row's action cannot be taken yet; the reason is
   *  shown inline next to the greyed control, never by hiding it. */
  disabledReason?: string;
}

export interface AuditReportPanelInput {
  findingsStale: boolean;
  hasUnconfirmedIdentityFields: boolean;
  /** AuditDetailResponse.analysisPair: whether a bilingual writing pair
   *  resolves at all, the fact that actually gates producing PDFs. */
  analysisPair: 'selected' | 'legacy-latest' | 'none';
  lifecycle: AuditLifecycle;
}

/** A fresh, deliverable pair: lifecycle rendered or approved. */
function hasFreshReportPair(lifecycle: AuditLifecycle): boolean {
  return lifecycle === 'rendered' || lifecycle === 'approved';
}

/** The five rows, each computed independently: nothing here gates another
 *  row the way the old ladder did. Writing is never blocked (plan 045
 *  section 2.1/2.2 already dropped every ceremony that used to gate it). */
export function auditReportPanelRows(
  input: AuditReportPanelInput,
  language: DashboardLanguage,
): AuditReportPanelRow[] {
  const reasons = (language === 'fr' ? fr : en).auditDetail.panel;
  const freshDelivery = hasFreshReportPair(input.lifecycle);
  return [
    { key: 'findings', status: input.findingsStale ? 'blocked' : 'done' },
    { key: 'identity', status: input.hasUnconfirmedIdentityFields ? 'blocked' : 'done' },
    { key: 'writing', status: 'ready' },
    {
      key: 'produce',
      status: input.analysisPair === 'none' ? 'blocked' : 'ready',
      ...(input.analysisPair === 'none'
        ? { disabledReason: reasons.produceUnavailableReason }
        : {}),
    },
    {
      key: 'delivery',
      status: freshDelivery ? 'ready' : 'blocked',
      ...(!freshDelivery ? { disabledReason: reasons.deliveryUnavailableReason } : {}),
    },
  ];
}

export function findPanelRow(
  rows: readonly AuditReportPanelRow[],
  key: AuditReportPanelRowKey,
): AuditReportPanelRow {
  const row = rows.find((candidate) => candidate.key === key);
  if (row === undefined) throw new Error(`no panel row for ${key}`);
  return row;
}

/** The produce button's label and whether it can be clicked: unavailable
 *  when no bilingual pair resolves yet, and its own text says up front when
 *  clicking it will refresh stale findings first rather than the operator
 *  discovering that only after the click. */
export function produceButtonState(
  row: AuditReportPanelRow,
  findingsStale: boolean,
  language: DashboardLanguage,
): { enabled: boolean; label: string; hint?: string } {
  const copy = (language === 'fr' ? fr : en).auditDetail.panel;
  return {
    enabled: row.status !== 'blocked',
    label: findingsStale ? copy.produceButtonRefreshFirst : copy.produceButton,
    ...(findingsStale ? { hint: copy.produceRefreshFirstHint } : {}),
  };
}

const STALE_DATA_REFUSAL =
  /^Report generation aborted: (?:stale .+ uses (?:normalization fingerprint|findings schema version)|legacy .+ has no (?:findings provenance|analysis ID))/u;
const IDENTITY_REFUSAL = /^Report generation aborted: the client identity on the cover/u;

/** Turns a refused PDF production into operator language. The raw renderer
 *  message stays available as technical detail; only its page number and
 *  overflow amount are lifted into the explanation. */
export function describeProduceFailure(
  rawMessage: string | undefined,
  language: DashboardLanguage,
): { heading: string; explanation: string; technicalDetail?: string } {
  const copy = (language === 'fr' ? fr : en).auditDetail.panel;
  const detail = rawMessage?.trim() === '' ? undefined : rawMessage?.trim();
  const base = {
    heading: copy.produceFailedHeading,
    ...(detail ? { technicalDetail: detail } : {}),
  };
  const overflow = detail?.match(
    /printable content rectangle on physical page (\d+) at \w+ by ([\d.]+)px(?: in finding ([^\s.]+))?(?: in section "([^"]*)")?(?:, block starting "([^"]*)")?\./u,
  );
  if (overflow) {
    const amount = String(Math.round(Number(overflow[2])));
    return {
      ...base,
      explanation:
        copy.produceFailedOverflow.replace('{page}', overflow[1]!).replace('{amount}', amount) +
        (overflow[3] === undefined
          ? ''
          : ` ${copy.produceFailedOverflowFinding.replace('{finding}', overflow[3])}`) +
        (overflow[4] === undefined
          ? ''
          : ` ${copy.produceFailedOverflowSection.replace('{section}', overflow[4])}`) +
        (overflow[5] === undefined
          ? ''
          : ` ${copy.produceFailedOverflowBlock.replace('{excerpt}', overflow[5])}`),
    };
  }
  // Every refusal shares the "Report generation aborted:" prefix, so the
  // data refusals are matched first by their own wording; only what remains
  // is a renderer or layout refusal.
  if (detail !== undefined && STALE_DATA_REFUSAL.test(detail)) {
    return { ...base, explanation: copy.produceFailedStaleData };
  }
  if (detail !== undefined && IDENTITY_REFUSAL.test(detail)) {
    return { ...base, explanation: copy.produceFailedIdentity };
  }
  if (detail?.startsWith('Report generation aborted:')) {
    return { ...base, explanation: copy.produceFailedLayout };
  }
  return { ...base, explanation: copy.produceFailedGeneric };
}

export type ProductionStepKey = 'confirmed' | 'writing' | 'pdf' | 'ready';
export type ProductionStepState = 'done' | 'current' | 'pending' | 'failed';

export interface ReportProductionView {
  /** Null when nothing is running and no run ended in this server session:
   *  the panel then shows no production banner. */
  banner: {
    tone: 'active' | 'ready' | 'failed';
    title: string;
    description: string;
    technicalDetail?: string;
  } | null;
  steps: { key: ProductionStepKey; label: string; state: ProductionStepState }[];
  /** True while any stage runs: every production-starting action is off. */
  busy: boolean;
  /** Replaces both action labels while busy, naming the running stage. */
  busyLabel?: string;
}

/** Issue #376: every production control and the status banner derive from
 *  the server's one production state, never from a local loading flag, so a
 *  refresh mid-run restores the same view. */
export function reportProductionView(
  state: ReportProductionStateResponse | undefined,
  language: DashboardLanguage,
): ReportProductionView {
  const copy = (language === 'fr' ? fr : en).auditDetail.panel.production;
  const current = state ?? { status: 'idle' as const };
  const order: ProductionStepKey[] = ['confirmed', 'writing', 'pdf', 'ready'];
  const stepsWith = (states: ProductionStepState[]): ReportProductionView['steps'] =>
    order.map((key, index) => ({ key, label: copy.steps[key], state: states[index]! }));

  switch (current.status) {
    case 'writing':
      return {
        banner: { tone: 'active', title: copy.writingTitle, description: copy.writingDescription },
        steps: stepsWith(['done', 'current', 'pending', 'pending']),
        busy: true,
        busyLabel: copy.writingBusyLabel,
      };
    case 'pdf-generation':
      return {
        banner: { tone: 'active', title: copy.pdfTitle, description: copy.pdfDescription },
        steps: stepsWith(['done', 'done', 'current', 'pending']),
        busy: true,
        busyLabel: copy.pdfBusyLabel,
      };
    case 'completed':
      return {
        banner: { tone: 'ready', title: copy.readyTitle, description: copy.readyDescription },
        steps: stepsWith(['done', 'done', 'done', 'done']),
        busy: false,
      };
    case 'failed':
      return {
        banner: {
          tone: 'failed',
          title: copy.failedTitle,
          description:
            current.stage === 'writing' ? copy.failedWritingDescription : copy.failedPdfDescription,
          technicalDetail: current.message,
        },
        steps: stepsWith(
          current.stage === 'writing'
            ? ['done', 'failed', 'pending', 'pending']
            : ['done', 'done', 'failed', 'pending'],
        ),
        busy: false,
      };
    default:
      return {
        banner: null,
        steps: stepsWith(['done', 'pending', 'pending', 'pending']),
        busy: false,
      };
  }
}

/** Issue #391: approval covers the French and English pair, and the server
 *  refuses it unless both are fresh and their PDFs verify. The approve
 *  action is offered only when that holds, so it never fails with a raw
 *  server message. */
export function canApproveReportPair(reports: readonly ReportStatusResponse[]): boolean {
  return (['fr', 'en'] as const).every((language) =>
    reports.some(
      (report) => report.language === language && report.pdfAvailable && report.status === 'fresh',
    ),
  );
}
