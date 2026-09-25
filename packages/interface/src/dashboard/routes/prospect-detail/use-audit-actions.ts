/** Detaching an audit from the prospect (issue #532). */

import { sendJson } from '../../lib/api';
import type { ProspectDetailShared } from './shared';

export function useAuditActions(shared: ProspectDetailShared) {
  const { copy, refreshAll, setOutreachBusy, setOutreachNotice } = shared;

  const detachAudit = async (auditId: string): Promise<void> => {
    if (!window.confirm(copy.confirmDetachAudit)) return;
    setOutreachBusy(`detach-${auditId}`);
    setOutreachNotice(null);
    try {
      await sendJson(`/api/audits/${encodeURIComponent(auditId)}/prospect`, 'POST', {
        prospectId: null,
      });
      setOutreachNotice(copy.auditDetached);
      refreshAll();
    } catch {
      setOutreachNotice(copy.actionFailed);
    } finally {
      setOutreachBusy(null);
    }
  };

  return { detachAudit };
}

export type AuditActions = ReturnType<typeof useAuditActions>;
