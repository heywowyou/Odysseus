/**
 * What the prospect page's panels share (issue #532): the loaded record, the
 * values derived from it, the busy flags and the outreach notice several
 * panels set, and the one refresh every mutation ends with.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useI18n } from '../../i18n/provider';
import { formatDateTime } from '../../lib/format';
import type { PollingState } from '../../lib/use-polling';
import { visibleDrafts } from '../prospect-hub-detail-model';
import {
  TERMINAL_STATUSES,
  type ProspectActionability,
  type ProspectHubDetail,
  type ProspectOutreachAction,
} from './types';

export function useProspectDetailShared(
  prospect: ProspectHubDetail,
  response: Pick<PollingState<ProspectHubDetail | null>, 'refresh'>,
  actionability: Pick<PollingState<ProspectActionability>, 'data' | 'error' | 'refresh'>,
) {
  const { strings, language } = useI18n();
  const copy = strings.prospectHub.detail;
  const navigate = useNavigate();
  const formatDate = (value: string): string => formatDateTime(value, language);
  const actorLabel = (actor: string): string =>
    copy.actorLabels[actor] ?? strings.common.vocabularyFallback;
  const [saving, setSaving] = useState(false);
  const [outreachBusy, setOutreachBusy] = useState<string | null>(null);
  const [outreachNotice, setOutreachNotice] = useState<string | null>(null);

  const primaryWebsite = prospect.websites.find((item) => item.primary) ?? prospect.websites[0];
  const audits = prospect.audits ?? [];
  const previews = prospect.previews ?? [];
  // Issue #288: the live preview's link stays on the record, so it is shown,
  // copied, and revoked next to the publish action for as long as it is live.
  const livePreview = previews.find((preview) => preview.status === 'live');
  const livePreviewUrl = livePreview?.url ?? null;
  const drafts = visibleDrafts(prospect.drafts ?? []);
  const work = prospect.work;
  const recommendation = work?.recommendation;
  const activeScan = work?.activeScan;
  const auditState = work?.auditState ?? 'missing';
  const auditStateLabel = copy.auditStateLabels[auditState] ?? strings.common.vocabularyFallback;
  const recentEvents = prospect.events.slice(0, 3);
  const qualifyingAudit =
    (work?.qualifyingAuditId === undefined
      ? undefined
      : audits.find((audit) => audit.auditId === work.qualifyingAuditId)) ?? audits[0];

  // Issue #279: every mutation can change what outreach is allowed, so the
  // record and its gates always refresh together.
  const refreshAll = (): void => {
    response.refresh();
    actionability.refresh();
  };

  const gateFor = (action: ProspectOutreachAction) => actionability.data?.actions[action];
  const gateReason = (action: ProspectOutreachAction): string => {
    const check = gateFor(action);
    if (check?.reason !== undefined) {
      // Labels are sentence fragments for "Action refusée : {reason}"; shown
      // alone they start with a capital (issue #395).
      const label = copy.refusalLabels[check.reason] ?? strings.common.vocabularyFallback;
      return label.charAt(0).toUpperCase() + label.slice(1);
    }
    return actionability.error ?? copy.loading;
  };

  const recommendationReason =
    recommendation?.reason === undefined
      ? undefined
      : (copy.recommendationReasons[recommendation.reason] ?? strings.common.vocabularyFallback);

  return {
    prospect,
    strings,
    copy,
    navigate,
    formatDate,
    actorLabel,
    saving,
    setSaving,
    outreachBusy,
    setOutreachBusy,
    outreachNotice,
    setOutreachNotice,
    primaryWebsite,
    audits,
    previews,
    livePreview,
    livePreviewUrl,
    drafts,
    work,
    recommendation,
    activeScan,
    auditStateLabel,
    recentEvents,
    qualifyingAudit,
    refreshAll,
    gateFor,
    gateReason,
    recommendationReason,
    contactsCopy: copy.contacts,
    stakeholders: prospect.stakeholders ?? [],
    outreachLanguage: prospect.outreachLanguage ?? 'fr',
    terminal: TERMINAL_STATUSES.includes(prospect.status),
    archived: prospect.archivedAt !== undefined,
  };
}

export type ProspectDetailShared = ReturnType<typeof useProspectDetailShared>;
