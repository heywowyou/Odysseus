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
import type { AuditLifecycle } from './audit-detail-types';

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
