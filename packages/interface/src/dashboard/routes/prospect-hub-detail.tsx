import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { PAGE_WIDTH } from '../components/page-header';
import { buttonStyles } from '../components/ui/button';
import { EmptyState } from '../components/ui/empty-state';
import { useI18n } from '../i18n/provider';
import { ApiError, fetchJson } from '../lib/api';
import { useApi, type ApiState } from '../lib/use-api';
import { usePolling, type PollingState } from '../lib/use-polling';
import { ActionsPanel } from './prospect-detail/actions-panel';
import { HistoryPanel } from './prospect-detail/history-panel';
import { OutreachPanel } from './prospect-detail/outreach-panel';
import { ProspectHeader } from './prospect-detail/prospect-header';
import { RecentActivityPanel } from './prospect-detail/recent-activity-panel';
import { RecommendedPanel } from './prospect-detail/recommended-panel';
import { useProspectDetailShared } from './prospect-detail/shared';
import { SummaryPanel } from './prospect-detail/summary-panel';
import type { ProspectActionability, ProspectHubDetail } from './prospect-detail/types';
import { useAuditActions } from './prospect-detail/use-audit-actions';
import { useContactActions } from './prospect-detail/use-contact-actions';
import { useIdentityEdit } from './prospect-detail/use-identity-edit';
import { useLifecycleActions } from './prospect-detail/use-lifecycle-actions';
import { useOutreachActions } from './prospect-detail/use-outreach-actions';
import { useScanLauncher } from './prospect-detail/use-scan-launcher';

/**
 * The prospect page. Issue #532 split it into one component per panel under
 * prospect-detail/, each with its mutation hook; this file fetches the record
 * and its outreach gates, handles the missing and loading states, and lays
 * the panels out once the record is loaded.
 */
export function ProspectHubDetailPage(): JSX.Element {
  const { strings } = useI18n();
  const copy = strings.prospectHub.detail;
  const { prospectId } = useParams<{ prospectId: string }>();
  const [searchParams] = useSearchParams();
  const requestedReturnTo = searchParams.get('returnTo');
  const returnTo = requestedReturnTo?.startsWith('/prospects') ? requestedReturnTo : '/prospects';
  const [missing, setMissing] = useState(false);
  const prospectPath = prospectId ? `/api/prospects/${encodeURIComponent(prospectId)}` : null;
  const prospectFetcher = useCallback(
    (signal: AbortSignal) => {
      if (prospectPath === null) return Promise.resolve(null);
      return fetchJson<ProspectHubDetail>(prospectPath, { signal })
        .then((value) => {
          setMissing(false);
          return value;
        })
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 404) setMissing(true);
          throw error;
        });
    },
    [prospectPath],
  );
  const response = usePolling<ProspectHubDetail | null>(prospectFetcher, 0, {
    enabled: prospectPath !== null,
    key: prospectPath ?? 'none',
  });
  const actionability = useApi<ProspectActionability>(
    prospectId ? `/api/prospects/${encodeURIComponent(prospectId)}/actionability` : null,
  );
  const prospect = response.data;

  // Issue #277: deep links like #emails arrive before the record renders.
  const loaded = response.data !== undefined;
  useEffect(() => {
    if (!loaded || window.location.hash === '') return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
  }, [loaded]);

  if (!prospect && missing)
    return (
      <div className={`${PAGE_WIDTH.reading} px-5 py-8`}>
        <EmptyState
          title={copy.missing}
          description={copy.missingDescription}
          action={
            <Link to={returnTo} className={buttonStyles()}>
              {copy.return}
            </Link>
          }
        />
      </div>
    );
  if (!prospect)
    return (
      <div className={`${PAGE_WIDTH.reading} px-5 py-8`}>
        {response.error !== undefined ? (
          <EmptyState
            title={strings.common.requestFailed}
            description={response.error}
            action={
              <button className={buttonStyles()} onClick={response.refresh}>
                {strings.common.retry}
              </button>
            }
          />
        ) : (
          <p className="text-sm text-ink-muted">{copy.loading}</p>
        )}
      </div>
    );

  return (
    <ProspectDetailView
      prospect={prospect}
      response={response}
      actionability={actionability}
      returnTo={returnTo}
    />
  );
}

/** Rendered only once the record is loaded, so every panel hook can rely on
 *  it, and kept mounted across refreshes so drafts in progress survive. */
function ProspectDetailView(props: {
  prospect: ProspectHubDetail;
  response: PollingState<ProspectHubDetail | null>;
  actionability: ApiState<ProspectActionability>;
  returnTo: string;
}): JSX.Element {
  const shared = useProspectDetailShared(props.prospect, props.response, props.actionability);
  const contacts = useContactActions(shared);
  const identity = useIdentityEdit(shared);
  const lifecycle = useLifecycleActions(shared);
  const outreach = useOutreachActions(shared);
  const scan = useScanLauncher(shared);
  const auditActions = useAuditActions(shared);

  return (
    <div className={`${PAGE_WIDTH.reading} px-5 py-8`}>
      {props.response.error !== undefined ? (
        <p role="alert" className="mb-4 text-sm text-danger">
          {props.response.error}
        </p>
      ) : null}
      <ProspectHeader
        shared={shared}
        lifecycle={lifecycle}
        outreach={outreach}
        returnTo={props.returnTo}
      />

      <div className="grid gap-5">
        <RecommendedPanel shared={shared} outreach={outreach} scan={scan} />
        <SummaryPanel shared={shared} identity={identity} contacts={contacts} />
        <OutreachPanel shared={shared} outreach={outreach} />
        <ActionsPanel shared={shared} outreach={outreach} scan={scan} lifecycle={lifecycle} />
        <RecentActivityPanel shared={shared} />
        <HistoryPanel shared={shared} outreach={outreach} auditActions={auditActions} />
      </div>
    </div>
  );
}
