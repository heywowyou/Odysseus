import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSX, KeyboardEvent } from 'react';
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
import { formatDateTime } from '../lib/format';
import { vocabularyLabel } from '../lib/vocabulary';
import { ApiError, fetchJson, postEmpty, sendJson } from '../lib/api';
import { usePolling } from '../lib/use-polling';
import {
  HUB_STEP_ANCHORS,
  HUB_STEP_KEYS,
  auditChoices,
  hubPrimaryAction,
  hubTabs,
  isSold,
  pipelineSteps,
  selectedAuditId,
  selectionVerdictSentence,
} from './hub-model';
import type { HubStep, HubStepKey } from './hub-model';
import {
  outreachRefusalCopy,
  outreachRefusalSentence,
  type OutreachFirstEmailResponse,
  type OutreachPreviewPublishResponse,
} from './audit-detail-model';
import { reviewBadgeTone } from './prospects-model';
import type {
  OutreachDraftActionResponse,
  ProspectDetailResponse,
  ProspectReviewRequest,
  ProspectReviewResponse,
} from './prospects-model';
import {
  WaveDialog,
  mutateWaveRoster,
  waveRefusalSentence,
  waveScoringSentence,
} from './wave-dialog';
import { HubFicheSection } from './hub-fiche-section';
import { HubQuickCheckSection } from './hub-quick-check-section';
import { HubAuditSection } from './hub-audit-section';
import { HubReportSection } from './hub-report-section';
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

/** The pipeline strip between the header and the panels (plan 042 slice
 *  1): the same per-stage state and date the strip always carried, now
 *  with tab semantics - one stage's panel renders at a time. Hand-rolled
 *  ARIA tabs (no @radix-ui/react-tabs dependency): roving tabIndex and
 *  arrow-key activation per the WAI-ARIA tabs pattern. */
function PipelineStrip(props: {
  steps: HubStep[];
  activeTab: HubStepKey;
  onTabChange: (key: HubStepKey) => void;
}): JSX.Element {
  const { steps, activeTab, onTabChange } = props;
  const { strings } = useI18n();
  const tabRefs = useRef(new Map<HubStepKey, HTMLButtonElement>());

  const activate = (key: HubStepKey): void => {
    onTabChange(key);
    tabRefs.current.get(key)?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const index = steps.findIndex((step) => step.key === activeTab);
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % steps.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + steps.length) % steps.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = steps.length - 1;
    else return;
    event.preventDefault();
    const step = steps[next];
    if (step === undefined) return;
    activate(step.key);
  };

  return (
    <nav aria-label={strings.hub.pipelineLabel} className="mb-6">
      <div
        role="tablist"
        aria-label={strings.hub.pipelineLabel}
        className="flex flex-wrap items-center gap-x-1 gap-y-2"
        onKeyDown={onKeyDown}
      >
        {steps.map((step, index) => {
          const isSelected = step.key === activeTab;
          return (
            // presentation: the separators must not become the tablist's
            // children - ARIA requires the tabs themselves to own that role.
            <span key={step.key} role="presentation" className="flex items-center gap-1">
              {index > 0 ? (
                <ChevronRight
                  className="mx-1 size-3.5 shrink-0 text-ink-muted"
                  aria-hidden="true"
                />
              ) : null}
              <button
                ref={(node) => {
                  if (node === null) tabRefs.current.delete(step.key);
                  else tabRefs.current.set(step.key, node);
                }}
                type="button"
                role="tab"
                id={`hub-tab-${step.key}`}
                aria-selected={isSelected}
                aria-controls={HUB_STEP_ANCHORS[step.key]}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => onTabChange(step.key)}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs hover:bg-raised"
              >
                <span className={isSelected ? 'font-semibold text-ink' : 'text-ink-soft'}>
                  {strings.hub.steps[step.key]}
                </span>
                {step.key === 'report' ? null : (
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
                )}
              </button>
            </span>
          );
        })}
      </div>
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
  const [prescanStarting, setPrescanStarting] = useState(false);
  const [isOutreachBusy, setIsOutreachBusy] = useState(false);
  /** The one-time link of a publish made on this visit (a manual Aperçu
   *  publish, or the fresh preview a first-email call just made). Held only
   *  in page memory: Odysseus never stores the raw token. */
  const [publishedLink, setPublishedLink] = useState<string | null>(null);
  /** The active hub tab (plan 042 decision 3): component state, one URL.
   *  It lives in the page, above every section component, so a tab switch
   *  never remounts the page. */
  const [activeTab, setActiveTab] = useState<HubStepKey>('fiche');
  /** Which audit the Audit and Rapport client tabs render (default: the
   *  newest), and whether the operator revealed the paid chain's tab
   *  without a recorded `won` outcome. Both view state; nothing stored. */
  const [pickedAuditId, setPickedAuditId] = useState<string | null>(null);
  const [reportRevealed, setReportRevealed] = useState(false);
  /** Plan 043: the open wave-roster dialog, if any. The mutation itself is
   *  shared with the prospects list via wave-dialog.tsx. */
  const [waveDialog, setWaveDialog] = useState<'add' | 'remove' | null>(null);
  /** Plan 044: the paid full audit's confirm dialog. */
  const [isFullAuditOpen, setIsFullAuditOpen] = useState(false);

  // Plan 040 slice 7: the a-traiter rows and the audit page's preview note
  // deep-link into a hub section (/prospects/:id#hub-emails and friends).
  // The sections only exist once the detail has loaded, so the scroll is
  // deferred until then and replays when the hash itself changes. Since
  // plan 042 the anchor first names a tab: the panel is mounted by the tab
  // switch, and the scroll happens on the next tick so the panel exists.
  // A 'report' deep link only scrolls: whether the paid tab is visible is
  // the sold signal's decision, not the link's.
  const hasLoaded = data !== undefined;
  useEffect(() => {
    if (hash === '' || !hasLoaded) return;
    const anchor = hash.slice(1);
    const tabKey = HUB_STEP_KEYS.find((key) => HUB_STEP_ANCHORS[key] === anchor);
    if (tabKey !== undefined && tabKey !== 'report') setActiveTab(tabKey);
    const timer = window.setTimeout(() => scrollToAnchor(anchor), 0);
    return () => window.clearTimeout(timer);
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

  // Issue #201: the hub's own "Run quick check" action, the dashboard
  // counterpart of `odysseus prospect prescan run --domain <domain>`. The
  // job's own completion runs the on-demand scoring pass (issue #199), so
  // this single click is what used to take two CLI commands with no
  // dashboard hint of either.
  const runQuickCheck = async (): Promise<void> => {
    if (candidateId === undefined || prescanStarting) return;
    setPrescanStarting(true);
    try {
      const result = await postEmpty<{ started: boolean; jobId?: string; refusal?: string }>(
        `/api/prospects/${encodedId}/prescan`,
      );
      if (result.started && result.jobId !== undefined) {
        toast.success(strings.prospectDetail.quickCheckQueued);
        navigate(`/scans/${result.jobId}`);
        return;
      }
      toast.error(strings.prospectDetail.quickCheckRefused);
      refresh();
    } catch (caught) {
      toast.error(strings.prospectDetail.quickCheckRefused, {
        description: caught instanceof Error ? caught.message : undefined,
      });
    } finally {
      setPrescanStarting(false);
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
    try {
      // Plan 045 section 1.7: one call publishes its own v2 preview,
      // supersedes whatever was live, and drafts touch 1 - no token ever
      // held in page state between two requests.
      const result = await sendJson<OutreachFirstEmailResponse>(
        `/api/prospects/${encodedId}/outreach/first-email`,
        'POST',
        {},
      );
      if (result.previewUrl !== undefined) setPublishedLink(result.previewUrl);
      if (result.created) {
        toast.success(strings.auditDetail.outreachPreview.draftCreatedMessage);
      } else {
        toast.error(
          outreachRefusalCopy(result.refusal, language) ??
            strings.auditDetail.outreachPreview.draftRefusedMessage,
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

  const submitWave = async (
    mode: 'add' | 'remove',
    waveCandidateId: string,
    wave: string,
  ): Promise<void> => {
    try {
      const { refusal, scoring } = await mutateWaveRoster(waveCandidateId, wave, mode);
      if (refusal !== undefined) {
        toast.error(waveRefusalSentence(refusal, strings) ?? strings.operator.actionError);
        return;
      }
      toast.success(
        (mode === 'add' ? strings.hub.wave.addedToast : strings.hub.wave.removedToast).replace(
          '{wave}',
          wave,
        ),
        { description: waveScoringSentence(scoring, strings) },
      );
      refresh();
    } catch (caught) {
      toast.error(strings.operator.actionError, {
        description: caught instanceof Error ? caught.message : undefined,
      });
    }
  };

  const launchFullAudit = async (): Promise<void> => {
    if (candidateId === undefined) return;
    try {
      const result = await postEmpty<{ started: boolean; jobId?: string; refusal?: string }>(
        `/api/prospects/${encodedId}/full-audit`,
      );
      if (result.started && result.jobId !== undefined) {
        toast.success(strings.hub.audit.launchQueued);
        navigate(`/scans/${result.jobId}`);
        return;
      }
      const refusal =
        result.refusal !== undefined
          ? strings.hub.audit.launchRefusals[
              result.refusal as keyof typeof strings.hub.audit.launchRefusals
            ]
          : undefined;
      toast.error(refusal ?? strings.operator.actionError);
      refresh();
    } catch (caught) {
      toast.error(strings.operator.actionError, {
        description: caught instanceof Error ? caught.message : undefined,
      });
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
  const action = hubPrimaryAction(data);
  const steps = pipelineSteps(data, now);
  const sold = isSold(data);
  const tabs = hubTabs(steps, sold || reportRevealed);
  const choices = auditChoices(data);
  const auditId = selectedAuditId(choices, pickedAuditId);

  const sectionFor = (key: HubStepKey): JSX.Element | null => {
    switch (key) {
      case 'fiche':
        return <HubFicheSection detail={data} onRequestReview={setPendingAction} />;
      case 'quick-check':
        return (
          <HubQuickCheckSection
            candidateId={data.candidateId}
            detail={data}
            onRunQuickCheck={() => {
              void runQuickCheck();
            }}
            isQuickCheckBusy={prescanStarting}
          />
        );
      case 'audit':
        return (
          <HubAuditSection
            detail={data}
            auditId={auditId}
            onPickAudit={setPickedAuditId}
            onLaunchFullAudit={() => setIsFullAuditOpen(true)}
          />
        );
      case 'report':
        return <HubReportSection auditId={auditId} />;
      case 'preview':
        return (
          <HubPreviewSection
            auditId={auditId}
            preview={data.preview}
            publishedLink={publishedLink}
            isBusy={isOutreachBusy}
            onPublish={runPublish}
            onRevoke={runRevoke}
          />
        );
      case 'emails':
        return (
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
        );
      case 'outcome':
        return (
          <HubOutcomeSection
            thread={data.thread}
            outcomes={data.outcomes}
            refresh={refresh}
            onGoToEmails={() => setActiveTab('emails')}
          />
        );
    }
  };

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
          <Button size="sm" onClick={() => setActiveTab('emails')}>
            {strings.hub.primary.reviewDraft}
          </Button>
        );
      case 'prepare-follow-up':
        return (
          <Button size="sm" onClick={() => setActiveTab('emails')}>
            {strings.hub.primary.prepareFollowUp}
          </Button>
        );
      case 'record-outcome':
        return (
          <Button size="sm" onClick={() => setActiveTab('outcome')}>
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
  const selectionSentence =
    action.kind === 'scan-refused' ? selectionVerdictSentence(data, strings, language) : null;

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
          {selectionSentence !== null ? <> {selectionSentence}</> : null}
        </p>
      ) : null}
      {action.kind === 'review' ? (
        <div className="mb-4">
          <Button variant="danger" size="sm" onClick={() => setPendingAction('reject')}>
            {strings.operator.reject}
          </Button>
        </div>
      ) : null}

      {/* Plan 043: a roster-sourced hotel names its wave and can leave it;
          the record the line quotes is the roster entry itself, carried on
          the selection verdict. */}
      {data.selectionVerdict?.source === 'wave-roster' ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
          <span>
            {strings.hub.wave.rosterLine
              .replace('{wave}', data.selectionVerdict.wave ?? '-')
              .replace(
                '{date}',
                data.selectionVerdict.decidedAt !== undefined
                  ? formatDateTime(data.selectionVerdict.decidedAt, language)
                  : '-',
              )
              .replace('{actor}', data.selectionVerdict.actor ?? '-')}
          </span>
          <Button variant="secondary" size="sm" onClick={() => setWaveDialog('remove')}>
            {strings.hub.wave.removeAction}
          </Button>
        </div>
      ) : null}

      {action.kind === 'scan-refused' &&
      (action.refusal === 'not-selected' || action.refusal === 'cohort-not-approved') ? (
        <div className="mb-4">
          <Button variant="secondary" size="sm" onClick={() => setWaveDialog('add')}>
            {strings.hub.wave.addAction}
          </Button>
        </div>
      ) : null}

      {/* Issue #185: this is a decision about the sale gate on the Rapport
          client tab, not about this audit's findings - it sits with the
          pipeline strip it affects, not buried past the findings table. */}
      {!sold && !reportRevealed ? (
        <div className="mb-4">
          <button
            type="button"
            className="text-sm text-ink-soft underline underline-offset-2 hover:text-ink"
            onClick={() => setReportRevealed(true)}
          >
            {strings.hub.report.reveal}
          </button>
        </div>
      ) : null}

      <PipelineStrip steps={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      {/* One panel at a time (plan 042 slice 1): the ids stay the anchors
          the deep links reference, and the wrapper carries the tabpanel
          semantics the strip's buttons point at. */}
      <div
        key={activeTab}
        id={HUB_STEP_ANCHORS[activeTab]}
        role="tabpanel"
        aria-labelledby={`hub-tab-${activeTab}`}
        className="flex flex-col gap-6"
      >
        {sectionFor(activeTab)}
      </div>

      <ConfirmDialog
        open={isFullAuditOpen}
        onOpenChange={setIsFullAuditOpen}
        title={strings.hub.audit.launchConfirmTitle}
        description={strings.hub.audit.launchConfirmBody}
        confirmLabel={strings.hub.audit.launchFullAudit}
        cancelLabel={strings.common.cancel}
        onConfirm={launchFullAudit}
      />

      <WaveDialog
        open={waveDialog !== null}
        onOpenChange={(open) => {
          if (!open) setWaveDialog(null);
        }}
        mode={waveDialog ?? 'add'}
        candidateId={candidateId ?? null}
        hotelName={data.name}
        onSubmit={(waveCandidateId, wave) => submitWave(waveDialog ?? 'add', waveCandidateId, wave)}
      />

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
