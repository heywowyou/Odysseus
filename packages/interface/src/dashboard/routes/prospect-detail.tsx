import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { ChevronRight } from 'lucide-react';
import { PAGE_WIDTH, PageHeader } from '../components/page-header';
import { Badge } from '../components/ui/badge';
import { Button, buttonStyles } from '../components/ui/button';
import { ConfirmDialog } from '../components/ui/dialog';
import { EmptyState } from '../components/ui/empty-state';
import { Skeleton } from '../components/ui/skeleton';
import { useI18n } from '../i18n/provider';
import { vocabularyLabel } from '../lib/vocabulary';
import { ApiError, fetchJson, postEmpty, sendJson } from '../lib/api';
import { usePolling } from '../lib/use-polling';
import { HUB_STEP_ANCHORS, hubPrimaryAction, pipelineSteps } from './hub-model';
import type { HubStep } from './hub-model';
import {
  isPreviewUnavailableDraftRefusal,
  outreachRefusalCopy,
  outreachRefusalSentence,
  tokenFromPublishedUrl,
  type OutreachDraftResponse,
  type OutreachPreviewPublishResponse,
} from './audit-detail-model';
import { reviewBadgeTone } from './prospects-model';
import type {
  OutreachDraftActionResponse,
  ProspectDetailResponse,
  ProspectReviewRequest,
  ProspectReviewResponse,
} from './prospects-model';
import { HubFicheSection } from './hub-fiche-section';
import { HubQuickCheckSection } from './hub-quick-check-section';
import { HubAuditSection } from './hub-audit-section';
import { HubPreviewSection } from './hub-preview-section';
import { HubEmailsSection } from './hub-emails-section';
import { HubOutcomeSection } from './hub-outcome-section';

type ReviewAction = 'accept' | 'reject';

interface ProspectDetailState {
  data: ProspectDetailResponse | undefined;
  error: string | undefined;
  refresh: () => void;
  isNotFound: boolean;
}

/** useApi-flavoured fetch of the prospect detail with two additions: the
 *  polling layer flattens every failure to a message string and drops
 *  ApiError.status, so the fetcher records a 404 itself; and the poll
 *  interval follows the IA's detail-page policy, five seconds only while
 *  an outreach scan this hotel started is in flight, otherwise once (and
 *  again after each action). */
function useProspectDetail(candidateId: string | undefined): ProspectDetailState {
  const path =
    candidateId === undefined ? null : `/api/prospects/${encodeURIComponent(candidateId)}`;
  const [isNotFound, setIsNotFound] = useState(false);
  const [intervalMs, setIntervalMs] = useState(0);

  useEffect(() => {
    setIsNotFound(false);
  }, [candidateId]);

  const fetcher = useCallback(async (): Promise<ProspectDetailResponse> => {
    try {
      return await fetchJson<ProspectDetailResponse>(path ?? '');
    } catch (cause: unknown) {
      if (cause instanceof ApiError && cause.status === 404) {
        setIsNotFound(true);
      }
      throw cause;
    }
  }, [path]);

  const polling = usePolling<ProspectDetailResponse>(fetcher, intervalMs, {
    enabled: path !== null,
    key: path ?? 'none',
  });

  const runningJobId = polling.data?.outreachScanJobId;
  useEffect(() => {
    const next = runningJobId != null ? 5_000 : 0;
    setIntervalMs((current) => (current === next ? current : next));
  }, [runningJobId]);

  return { ...polling, isNotFound };
}

function scrollToAnchor(anchor: string): void {
  // Optional call: a test DOM has no layout engine, so scrollIntoView may
  // not exist; in a real browser it always does.
  document.getElementById(anchor)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
}

/** The pipeline strip between the header and the sections: one jump per
 *  stage, each carrying its state and date (approved IA). */
function PipelineStrip(props: { steps: HubStep[] }): JSX.Element {
  const { steps } = props;
  const { strings } = useI18n();
  return (
    <nav aria-label={strings.hub.pipelineLabel} className="mb-6">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-2">
        {steps.map((step, index) => {
          const isActive = step.state === 'active';
          return (
            <li key={step.key} className="flex items-center gap-1">
              {index > 0 ? (
                <ChevronRight
                  className="mx-1 size-3.5 shrink-0 text-ink-muted"
                  aria-hidden="true"
                />
              ) : null}
              <button
                type="button"
                onClick={() => scrollToAnchor(HUB_STEP_ANCHORS[step.key])}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs hover:bg-raised"
              >
                <span className={isActive ? 'font-semibold text-ink' : 'text-ink-soft'}>
                  {strings.hub.steps[step.key]}
                </span>
                <span
                  className={
                    step.state === 'done'
                      ? 'text-ink-muted'
                      : step.state === 'active'
                        ? 'font-medium text-accent-bright'
                        : step.state === 'blocked'
                          ? 'font-medium text-danger'
                          : 'text-ink-muted'
                  }
                >
                  {strings.hub.stepStates[step.state]}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function ProspectDetailPage(): JSX.Element {
  const { candidateId } = useParams<{ candidateId: string }>();
  const { strings, language } = useI18n();
  const navigate = useNavigate();
  const { hash } = useLocation();
  const { data, error, refresh, isNotFound } = useProspectDetail(candidateId);

  const [pendingAction, setPendingAction] = useState<ReviewAction | null>(null);
  const [scanStarting, setScanStarting] = useState(false);
  const [isOutreachBusy, setIsOutreachBusy] = useState(false);
  /** The one-time token of a publish made on this visit. Held only in
   *  page memory so the first-email call can hand it back; it never
   *  leaves the page (the publish-and-draft constraint the IA records). */
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [publishedLink, setPublishedLink] = useState<string | null>(null);
  const [draftHint, setDraftHint] = useState(false);

  // Plan 040 slice 7: the a-traiter rows and the audit page's preview note
  // deep-link into a hub section (/prospects/:id#hub-emails and friends).
  // The sections only exist once the detail has loaded, so the scroll is
  // deferred until then and replays when the hash itself changes.
  const hasLoaded = data !== undefined;
  useEffect(() => {
    if (hash === '' || !hasLoaded) return;
    scrollToAnchor(hash.slice(1));
  }, [hash, hasLoaded]);

  const encodedId = candidateId === undefined ? '' : encodeURIComponent(candidateId);

  const startOutreachScan = async (): Promise<void> => {
    if (candidateId === undefined || scanStarting) return;
    setScanStarting(true);
    try {
      const result = await postEmpty<{ started: boolean; jobId?: string; refusal?: string }>(
        `/api/prospects/${encodedId}/outreach/full-scan`,
      );
      if (result.started && result.jobId !== undefined) {
        toast.success(strings.prospectDetail.outreachScanQueued);
        navigate(`/scans/${result.jobId}`);
        return;
      }
      toast.error(strings.prospectDetail.outreachScanRefused);
      refresh();
    } catch {
      toast.error(strings.prospectDetail.outreachScanRefused);
    } finally {
      setScanStarting(false);
    }
  };

  const handleReview = async (action: ReviewAction): Promise<void> => {
    if (candidateId === undefined) return;
    const body: ProspectReviewRequest = { action };
    try {
      const result = await sendJson<ProspectReviewResponse>(
        `/api/prospects/${encodedId}/review`,
        'POST',
        body,
      );
      toast.success(
        result.reviewState === 'accepted' ? strings.operator.accepted : strings.operator.rejected,
      );
      refresh();
    } catch {
      // The private console has one operator; the distinction between a
      // 409 and a network blip carries no different copy to show.
      toast.error(strings.operator.actionError);
    }
  };

  const runPublish = async (): Promise<void> => {
    const auditId = data?.outreachAudit?.auditId;
    if (auditId === undefined || isOutreachBusy) return;
    setIsOutreachBusy(true);
    try {
      const result = await postEmpty<OutreachPreviewPublishResponse>(
        `/api/audits/${encodeURIComponent(auditId)}/outreach-preview/publish`,
      );
      if (result.published) {
        setPublishedLink(result.url);
        setSessionToken(tokenFromPublishedUrl(result.url));
        setDraftHint(false);
      } else {
        toast.error(outreachRefusalSentence(result.refusal, language));
      }
      refresh();
    } catch (caught) {
      toast.error(strings.auditDetail.outreachPreview.actionError, {
        description: caught instanceof Error ? caught.message : undefined,
      });
    } finally {
      setIsOutreachBusy(false);
    }
  };

  const runRevoke = async (): Promise<void> => {
    if (candidateId === undefined || isOutreachBusy) return;
    setIsOutreachBusy(true);
    try {
      await postEmpty(`/api/prospects/${encodedId}/preview/revoke`);
      toast.success(strings.auditDetail.outreachPreview.revokedMessage);
      refresh();
    } catch (caught) {
      toast.error(strings.auditDetail.outreachPreview.actionError, {
        description: caught instanceof Error ? caught.message : undefined,
      });
    } finally {
      setIsOutreachBusy(false);
    }
  };

  const runCreateFirstEmail = async (): Promise<void> => {
    if (candidateId === undefined || isOutreachBusy) return;
    setIsOutreachBusy(true);
    setDraftHint(false);
    try {
      const result = await sendJson<OutreachDraftResponse>(
        `/api/prospects/${encodedId}/outreach/draft`,
        'POST',
        // Without a token from a publish on this visit the call still
        // runs; the server fails it closed with 'preview-not-published',
        // which the Aperçu section's hint turns into the reissue remedy.
        { previewToken: sessionToken ?? '' },
      );
      if (result.created) {
        toast.success(strings.auditDetail.outreachPreview.draftCreatedMessage);
      } else if (
        typeof result.refusal === 'string' &&
        isPreviewUnavailableDraftRefusal(result.refusal)
      ) {
        setDraftHint(true);
        scrollToAnchor(HUB_STEP_ANCHORS.preview);
      } else {
        toast.error(
          (typeof result.refusal === 'string'
            ? outreachRefusalCopy(result.refusal, language)
            : undefined) ?? strings.auditDetail.outreachPreview.draftRefusedMessage,
        );
      }
      refresh();
    } catch (caught) {
      toast.error(strings.auditDetail.outreachPreview.actionError, {
        description: caught instanceof Error ? caught.message : undefined,
      });
    } finally {
      setIsOutreachBusy(false);
    }
  };

  const runFollowUp = async (): Promise<void> => {
    if (candidateId === undefined || isOutreachBusy) return;
    setIsOutreachBusy(true);
    try {
      const result = await sendJson<OutreachDraftActionResponse>(
        `/api/prospects/${encodedId}/outreach/follow-up`,
        'POST',
        {},
      );
      if (result.created) {
        toast.success(strings.outreachThread.followUpCreated);
      } else {
        toast.error(strings.outreachThread.actionRefused);
      }
      refresh();
    } catch {
      toast.error(strings.outreachThread.actionError);
    } finally {
      setIsOutreachBusy(false);
    }
  };

  if (isNotFound) {
    return (
      <article className={PAGE_WIDTH.surface}>
        <EmptyState
          title={strings.operator.notFound}
          action={
            <Link to="/prospects" className={buttonStyles('secondary')}>
              {strings.operator.backToProspects}
            </Link>
          }
        />
      </article>
    );
  }

  if (error !== undefined && data === undefined) {
    return (
      <article>
        <EmptyState
          title={strings.common.requestFailed}
          description={error}
          action={
            <Button variant="secondary" onClick={refresh}>
              {strings.common.retry}
            </Button>
          }
        />
      </article>
    );
  }

  if (data === undefined) {
    return (
      <article aria-busy="true" aria-label={strings.common.loading}>
        <div className="mb-8">
          <Skeleton className="h-7 w-64" />
          <Skeleton className="mt-2 h-4 w-96 max-w-full" />
        </div>
        <div className="flex flex-col gap-6">
          <Skeleton className="h-40" />
          <Skeleton className="h-56" />
          <Skeleton className="h-40" />
        </div>
      </article>
    );
  }

  const now = Date.now();
  const action = hubPrimaryAction(data, now);
  const steps = pipelineSteps(data, now);
  const auditId = data.outreachAudit?.auditId ?? null;

  const primaryButton = (): JSX.Element | null => {
    switch (action.kind) {
      case 'review':
        return (
          <Button size="sm" onClick={() => setPendingAction('accept')}>
            {strings.operator.accept}
          </Button>
        );
      case 'start-scan':
        return (
          <Button
            size="sm"
            isLoading={scanStarting}
            disabled={scanStarting}
            onClick={() => {
              void startOutreachScan();
            }}
          >
            {strings.hub.primary.startScan}
          </Button>
        );
      case 'see-progress':
        return (
          <Link
            to={`/scans/${encodeURIComponent(action.jobId)}`}
            className={buttonStyles('primary', 'sm')}
          >
            {strings.hub.primary.seeProgress}
          </Link>
        );
      case 'publish-preview':
        return (
          <Button
            size="sm"
            isLoading={isOutreachBusy}
            disabled={isOutreachBusy}
            onClick={() => scrollToAnchor(HUB_STEP_ANCHORS.preview)}
          >
            {data.preview === null
              ? strings.auditDetail.outreachPreview.publishAction
              : strings.auditDetail.outreachPreview.reissueAction}
          </Button>
        );
      case 'create-first-email':
        return (
          <Button
            size="sm"
            isLoading={isOutreachBusy}
            disabled={isOutreachBusy}
            onClick={() => {
              void runCreateFirstEmail();
            }}
          >
            {strings.hub.primary.createFirstEmail}
          </Button>
        );
      case 'review-draft':
        return (
          <Button size="sm" onClick={() => scrollToAnchor(HUB_STEP_ANCHORS.emails)}>
            {strings.hub.primary.reviewDraft}
          </Button>
        );
      case 'prepare-follow-up':
        return (
          <Button size="sm" onClick={() => scrollToAnchor(HUB_STEP_ANCHORS.emails)}>
            {strings.hub.primary.prepareFollowUp}
          </Button>
        );
      case 'record-outcome':
        return (
          <Button size="sm" onClick={() => scrollToAnchor(HUB_STEP_ANCHORS.outcome)}>
            {strings.hub.primary.recordOutcome}
          </Button>
        );
      default:
        return null;
    }
  };

  const refusalSentence =
    action.kind === 'scan-refused'
      ? (strings.hub.scanRefusals[action.refusal as keyof typeof strings.hub.scanRefusals] ??
        strings.hub.scanRefusedLabel)
      : null;

  return (
    <article>
      <PageHeader
        eyebrow={
          <Link to="/prospects" className="hover:text-accent-bright">
            {strings.nav.prospects}
          </Link>
        }
        title={data.name}
        subject={[data.commune, data.postcode].filter(Boolean).join(' ') || undefined}
        description={strings.prospectDetail.description}
        meta={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={reviewBadgeTone(data.reviewState)}>
              {vocabularyLabel(
                strings.labels.review,
                data.reviewState,
                strings.common.vocabularyFallback,
              )}
            </Badge>
            {action.kind === 'scan-refused' ? null : primaryButton()}
          </span>
        }
      />

      {action.kind === 'scan-refused' ? (
        <p
          className="mb-4 max-w-reading rounded-lg border border-line bg-raised px-4 py-3 text-sm text-ink-soft"
          role="note"
        >
          <span className="font-medium text-ink">{strings.hub.scanRefusedLabel}</span>{' '}
          {refusalSentence}
        </p>
      ) : null}
      {action.kind === 'review' ? (
        <div className="mb-4">
          <Button variant="danger" size="sm" onClick={() => setPendingAction('reject')}>
            {strings.operator.reject}
          </Button>
        </div>
      ) : null}

      <PipelineStrip steps={steps} />

      <div className="flex flex-col gap-6">
        <div id={HUB_STEP_ANCHORS.fiche}>
          <HubFicheSection detail={data} onRequestReview={setPendingAction} />
        </div>
        <div id={HUB_STEP_ANCHORS['quick-check']}>
          <HubQuickCheckSection candidateId={data.candidateId} detail={data} />
        </div>
        <div id={HUB_STEP_ANCHORS.audit}>
          <HubAuditSection detail={data} />
        </div>
        <div id={HUB_STEP_ANCHORS.preview}>
          <HubPreviewSection
            auditId={auditId}
            preview={data.preview}
            publishedLink={publishedLink}
            draftHint={draftHint}
            isBusy={isOutreachBusy}
            onPublish={runPublish}
            onRevoke={runRevoke}
          />
        </div>
        <div id={HUB_STEP_ANCHORS.emails}>
          <HubEmailsSection
            thread={data.thread}
            isBusy={isOutreachBusy}
            onFirstEmail={() => {
              void runCreateFirstEmail();
            }}
            onFollowUp={() => {
              void runFollowUp();
            }}
            refresh={refresh}
          />
        </div>
        <div id={HUB_STEP_ANCHORS.outcome}>
          <HubOutcomeSection thread={data.thread} outcomes={data.outcomes} refresh={refresh} />
        </div>
      </div>

      <ConfirmDialog
        open={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
        title={
          pendingAction === 'reject'
            ? strings.operator.confirmRejectTitle
            : strings.operator.confirmAcceptTitle
        }
        description={
          pendingAction === 'reject'
            ? strings.operator.confirmRejectBody
            : strings.operator.confirmAcceptBody
        }
        confirmLabel={
          pendingAction === 'reject' ? strings.operator.reject : strings.operator.accept
        }
        cancelLabel={strings.common.cancel}
        onConfirm={() => handleReview(pendingAction ?? 'accept')}
      />
    </article>
  );
}
