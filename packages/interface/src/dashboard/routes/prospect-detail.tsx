import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSX, KeyboardEvent } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { ChevronRight } from 'lucide-react';
import { PAGE_WIDTH, PageHeader } from '../components/page-header';
import { Badge } from '../components/ui/badge';
import { Button, buttonStyles } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { EmptyState } from '../components/ui/empty-state';
import { Skeleton } from '../components/ui/skeleton';
import { useI18n } from '../i18n/provider';
import type { DashboardLanguage, DashboardStrings } from '../i18n/types';
import { formatDateTime } from '../lib/format';
import { vocabularyLabel } from '../lib/vocabulary';
import { ApiError, fetchJsonValidated, postEmpty, sendJson } from '../lib/api';
import { auditDetailSchema, prospectHubSnapshotSchema } from '../lib/api-schemas';
import { usePolling } from '../lib/use-polling';
import {
  HUB_STEP_ANCHORS,
  HUB_STEP_KEYS,
  auditChoices,
  hubPrimaryAction,
  hubTabs,
  outreachActionAuditId,
  parseHubStepKey,
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
import { AuditReportPanel } from './audit-report-panel';
import type { AuditDetailResponse } from './audit-detail-types';
import { reviewBadgeTone } from './prospects-model';
import { prospectPollIntervalMs } from './prospects-model';
import type {
  OutreachDraftActionResponse,
  ProspectActiveJob,
  ProspectDetailResponse,
  ProspectHubActionability,
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
import { HubPreviewSection } from './hub-preview-section';
import { HubEmailsSection } from './hub-emails-section';
import { HubOutcomeSection } from './hub-outcome-section';

type ReviewAction = 'accept' | 'reject';

export function actionBlockedReason(
  action: ProspectHubActionability | undefined,
  strings: DashboardStrings,
  language: DashboardLanguage,
): string | null {
  if (action?.state !== 'blocked') return null;
  return (
    strings.hub.scanRefusals[action.reason as keyof typeof strings.hub.scanRefusals] ??
    outreachRefusalSentence(action.reason, language)
  );
}

/** The hub's Rapport client tab (plan 045 stage 3.2): shown whenever a full
 *  audit exists, rendering the same panel the audit page itself renders
 *  (audit-report-panel.tsx) - no separate "sold" or "revealed" gate any
 *  more (hub-report-section.tsx, deleted, used to gate this on isSold).
 *  This is the only place that fetches the audit detail for the tab; the
 *  page polls every five seconds only while one of the panel's writes is
 *  in flight, and refetches after each action, the same policy as the
 *  audit detail page. */
function HubReportTab(props: { auditId: string | null }): JSX.Element | null {
  const { auditId } = props;
  const { strings } = useI18n();
  const [isBusy, setIsBusy] = useState(false);

  const path = auditId === null ? null : `/api/audits/${encodeURIComponent(auditId)}`;
  const fetcher = useCallback(
    async (signal: AbortSignal): Promise<AuditDetailResponse> => {
      const validated = await fetchJsonValidated(path ?? '', auditDetailSchema, { signal });
      return validated as unknown as AuditDetailResponse;
    },
    [path],
  );
  const { data, error, refresh } = usePolling<AuditDetailResponse>(fetcher, isBusy ? 5_000 : 0, {
    enabled: path !== null,
    key: path ?? 'none',
  });

  // Switching audits (or leaving the tab) must not leave a busy flag the
  // new audit never set - the same rule as the audit detail page.
  useEffect(() => {
    setIsBusy(false);
  }, [auditId]);

  if (auditId === null) return null;
  if (error !== undefined && data === undefined) {
    return (
      <Card title={strings.hub.steps.report}>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-soft">{strings.common.requestFailed}</p>
          <Button variant="secondary" size="sm" onClick={refresh} className="self-start">
            {strings.common.retry}
          </Button>
        </div>
      </Card>
    );
  }
  if (data === undefined) {
    return (
      <Card title={strings.hub.steps.report}>
        <p className="text-sm text-ink-muted">{strings.common.loading}</p>
      </Card>
    );
  }
  return (
    <AuditReportPanel auditId={data.auditId} detail={data} onBusy={setIsBusy} refresh={refresh} />
  );
}

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
 *  any job currently owns part of this prospect's workflow, otherwise
 *  once (and again after each action).
 *
 *  Issue #220: outreachScanJobId alone used to be the only polling
 *  trigger, so a running Quick check or paid Full audit never refreshed
 *  the hub on its own. activeJobs is the general signal; outreachScanJobId
 *  stays in the check too for a payload from a build that predates it
 *  (activeJobs is optional on the response type for exactly that reason). */
function useProspectDetail(candidateId: string | undefined): ProspectDetailState {
  const path =
    candidateId === undefined ? null : `/api/prospects/${encodeURIComponent(candidateId)}`;
  const [isNotFound, setIsNotFound] = useState(false);
  const [intervalMs, setIntervalMs] = useState(0);

  useEffect(() => {
    setIsNotFound(false);
  }, [candidateId]);

  const fetcher = useCallback(
    async (signal: AbortSignal): Promise<ProspectDetailResponse> => {
      try {
        const validated = await fetchJsonValidated(path ?? '', prospectHubSnapshotSchema, {
          signal,
        });
        return validated as unknown as ProspectDetailResponse;
      } catch (cause: unknown) {
        if (cause instanceof ApiError && cause.status === 404) {
          setIsNotFound(true);
        }
        throw cause;
      }
    },
    [path],
  );

  const polling = usePolling<ProspectDetailResponse>(fetcher, intervalMs, {
    enabled: path !== null,
    key: path ?? 'none',
  });

  const nextIntervalMs = prospectPollIntervalMs(polling.data);
  useEffect(() => {
    setIntervalMs((current) => (current === nextIntervalMs ? current : nextIntervalMs));
  }, [nextIntervalMs]);

  return { ...polling, isNotFound };
}

const ACTIVE_JOB_LABEL_KEY: Record<
  ProspectActiveJob['kind'],
  keyof DashboardStrings['common']['typeLabels']
> = {
  'quick-check': 'hotelPrescan',
  'light-audit': 'prospecting',
  'prospecting-audit': 'outreachFullScan',
  'full-audit': 'fullAudit',
};

function activeJobKindToLabelKey(
  kind: ProspectActiveJob['kind'],
): keyof DashboardStrings['common']['typeLabels'] {
  return ACTIVE_JOB_LABEL_KEY[kind];
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
                            : step.state === 'stale'
                              ? 'font-medium text-sev-serious'
                              : step.state === 'refreshing'
                                ? 'font-medium text-accent-bright'
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

  const [scanStarting, setScanStarting] = useState(false);
  const [prescanStarting, setPrescanStarting] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [recheckQualificationBusy, setRecheckQualificationBusy] = useState(false);
  const [qualificationOverrideBusy, setQualificationOverrideBusy] = useState(false);
  const [isOutreachBusy, setIsOutreachBusy] = useState(false);
  /** The one-time link of a publish made on this visit (a manual Aperçu
   *  publish, or the fresh preview a first-email call just made). Held only
   *  in page memory: Odysseus never stores the raw token, so it never
   *  belongs in the URL either - a tab/audit navigation below leaves it
   *  untouched. */
  const [publishedLink, setPublishedLink] = useState<string | null>(null);
  /** Plan 043: the open wave-roster dialog, if any. The mutation itself is
   *  shared with the prospects list via wave-dialog.tsx. */
  const [waveDialog, setWaveDialog] = useState<'add' | 'remove' | null>(null);

  // Issue #221: the active hub tab and the picked audit are addressable
  // query state (?tab=...&audit=...), not component state - so a copied
  // URL reopens the same stage and artifact, and browser back/forward
  // walks prior hub stages. Neither param is ever validated against the
  // real tabs/choices here (that needs the loaded detail); the effects
  // below correct an unreachable or foreign value once data has loaded.
  const [searchParams, setSearchParams] = useSearchParams();

  const setActiveTab = useCallback(
    (key: HubStepKey, options?: { replace?: boolean }): void => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          next.set('tab', key);
          return next;
        },
        { replace: options?.replace ?? false },
      );
    },
    [setSearchParams],
  );

  const setPickedAuditId = useCallback(
    (nextAuditId: string | null): void => {
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          if (nextAuditId === null) next.delete('audit');
          else next.set('audit', nextAuditId);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Plan 040 slice 7: the a-traiter rows and the audit page's preview note
  // deep-link into a hub section (/prospects/:id#hub-emails and friends).
  // The sections only exist once the detail has loaded, so the scroll is
  // deferred until then. Since plan 042 the anchor first names a tab: the
  // panel is mounted by the tab switch, and the scroll happens once the
  // panel exists. Plan 045 stage 3.2: the Rapport client tab is visible
  // whenever a full audit exists (hubTabs below), so a 'report' deep link
  // can switch to it like any other tab.
  //
  // Issue #221: this legacy hash scheme still works - it now drives the
  // same query-param tab state, with replace:true so an incoming hash link
  // does not itself add a history entry. react-router's setSearchParams
  // navigates to a bare "?search" target, dropping the hash, so `hash`
  // itself goes back to '' the instant the tab switch lands - the anchor
  // is captured once, on mount, into a ref rather than read again later.
  const hasLoaded = data !== undefined;
  const deepLinkAnchorRef = useRef(hash === '' ? null : hash.slice(1));
  useEffect(() => {
    const anchor = deepLinkAnchorRef.current;
    if (anchor === null || !hasLoaded) return;
    const tabKey = HUB_STEP_KEYS.find((key) => HUB_STEP_ANCHORS[key] === anchor);
    if (tabKey !== undefined) setActiveTab(tabKey, { replace: true });
  }, [hasLoaded, setActiveTab]);

  // The scroll itself is a second effect, keyed on searchParams as well:
  // the tab switch above lands asynchronously, so a scroll scheduled in
  // the same pass can fire before the tab's panel (and its target id)
  // exists in the DOM. Re-running once the URL settles means the anchor is
  // present by the time this effect's own timeout fires; a premature
  // attempt against a not-yet-mounted id is a silent no-op (scrollToAnchor
  // optional-chains the lookup).
  useEffect(() => {
    const anchor = deepLinkAnchorRef.current;
    if (anchor === null || !hasLoaded) return;
    const timer = window.setTimeout(() => scrollToAnchor(anchor), 0);
    return () => window.clearTimeout(timer);
  }, [hasLoaded, searchParams]);

  // Issue #221 required behavior: an audit id in the URL that does not
  // belong to this prospect (foreign, stale, or simply unknown) must not
  // crash or silently select an unrelated audit. selectedAuditId already
  // falls back to the newest owned choice; once the detail has loaded, a
  // requested id the fallback did not honor is corrected in place so the
  // address bar never keeps pointing at an audit the hub did not actually
  // select.
  useEffect(() => {
    if (data === undefined) return;
    const requested = searchParams.get('audit');
    if (requested === null) return;
    const resolved = selectedAuditId(auditChoices(data), requested);
    if (resolved === requested) return;
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (resolved === null) next.delete('audit');
        else next.set('audit', resolved);
        return next;
      },
      { replace: true },
    );
  }, [data, searchParams, setSearchParams]);

  // Same fallback for the tab itself: the only tab whose visibility depends
  // on the loaded detail is 'report' (shown only once a full audit exists).
  // A stale/unrecognised tab value already renders as the default 'fiche'
  // below without needing a rewrite; only the loaded-but-unreachable case
  // needs the URL corrected.
  useEffect(() => {
    if (data === undefined) return;
    const requestedTab = parseHubStepKey(searchParams.get('tab'));
    if (requestedTab !== 'report') return;
    if (auditChoices(data).length > 0) return;
    setActiveTab('fiche', { replace: true });
  }, [data, searchParams, setActiveTab]);

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
      toast.error(strings.prospectDetail.quickCheckRefused, {
        description:
          result.refusal !== undefined
            ? (strings.hub.scanRefusals[result.refusal as keyof typeof strings.hub.scanRefusals] ??
              undefined)
            : undefined,
      });
      refresh();
    } catch (caught) {
      toast.error(strings.prospectDetail.quickCheckRefused, {
        description: caught instanceof Error ? caught.message : undefined,
      });
    } finally {
      setPrescanStarting(false);
    }
  };

  // Issue #217: the hub's single recovery action for a stale prospect - the
  // server decides which of qualification/quick-check/score is behind and
  // reruns only that (route: POST /api/prospects/:id/refresh), so this
  // click never needs the operator to know which field went stale.
  const runRefresh = async (): Promise<void> => {
    if (candidateId === undefined || refreshBusy) return;
    setRefreshBusy(true);
    try {
      await postEmpty<{ refreshed: string[] }>(`/api/prospects/${encodedId}/refresh`);
      toast.success(strings.hub.quickCheck.refreshQueued);
      refresh();
    } catch (caught) {
      toast.error(strings.hub.quickCheck.refreshFailed, {
        description: caught instanceof Error ? caught.message : undefined,
      });
    } finally {
      setRefreshBusy(false);
    }
  };

  // Answers "why can't I recheck a rejected qualification" (the operator
  // has no way today to ask for a second look at a current-but-rejected
  // verdict, only a stale/missing one): the same /refresh route, now
  // widened server-side to also re-probe that case, reported with its own
  // outcome-specific toast instead of the generic "refresh queued" since
  // the operator is waiting to hear qualified-or-still-rejected, not just
  // that something ran.
  const runRecheckQualification = async (): Promise<void> => {
    if (candidateId === undefined || recheckQualificationBusy) return;
    setRecheckQualificationBusy(true);
    try {
      const result = await postEmpty<{
        qualification:
          { outcome: 'qualified'; result: string } | { outcome: 'skipped' | 'error' } | null;
      }>(`/api/prospects/${encodedId}/refresh`);
      if (
        result.qualification?.outcome === 'qualified' &&
        result.qualification.result === 'qualified'
      ) {
        toast.success(strings.hub.fiche.recheckQualificationQualified);
      } else if (result.qualification?.outcome === 'qualified') {
        toast.info(
          strings.hub.fiche.recheckQualificationStillRejected.replace(
            '{reason}',
            result.qualification.result,
          ),
        );
      } else {
        toast.error(strings.hub.fiche.recheckQualificationFailed);
      }
      refresh();
    } catch (caught) {
      toast.error(strings.hub.fiche.recheckQualificationFailed, {
        description: caught instanceof Error ? caught.message : undefined,
      });
    } finally {
      setRecheckQualificationBusy(false);
    }
  };

  // Issue #237: the operator's correction of a rejected automatic
  // qualification. Unlike runRecheckQualification (a second automatic
  // probe), this records a manual decision that survives later automatic
  // reruns and unblocks the outreach full-scan action.
  const runOverrideQualification = async (): Promise<void> => {
    if (candidateId === undefined || qualificationOverrideBusy) return;
    setQualificationOverrideBusy(true);
    try {
      await postEmpty(`/api/prospects/${encodedId}/qualification-override`);
      toast.success(strings.hub.fiche.qualificationOverrideSucceeded);
      refresh();
    } catch (caught) {
      toast.error(strings.hub.fiche.qualificationOverrideFailed, {
        description: caught instanceof Error ? caught.message : undefined,
      });
    } finally {
      setQualificationOverrideBusy(false);
    }
  };

  const runRemoveQualificationOverride = async (): Promise<void> => {
    if (candidateId === undefined || qualificationOverrideBusy) return;
    setQualificationOverrideBusy(true);
    try {
      await postEmpty(`/api/prospects/${encodedId}/qualification-override/remove`);
      toast.success(strings.hub.fiche.qualificationOverrideRemoveSucceeded);
      refresh();
    } catch (caught) {
      toast.error(strings.hub.fiche.qualificationOverrideRemoveFailed, {
        description: caught instanceof Error ? caught.message : undefined,
      });
    } finally {
      setQualificationOverrideBusy(false);
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
    const actionAuditId = data === undefined ? null : outreachActionAuditId(data);
    if (actionAuditId === null || isOutreachBusy) return;
    setIsOutreachBusy(true);
    try {
      const result = await postEmpty<OutreachPreviewPublishResponse>(
        `/api/audits/${encodeURIComponent(actionAuditId)}/outreach-preview/publish`,
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
  const choices = auditChoices(data);
  const auditId = selectedAuditId(choices, searchParams.get('audit'));
  const previewAuditId = outreachActionAuditId(data);
  const tabs = hubTabs(steps, auditId !== null);
  const requestedTab = parseHubStepKey(searchParams.get('tab'));
  const activeTab =
    requestedTab !== null && tabs.some((step) => step.key === requestedTab)
      ? requestedTab
      : 'fiche';

  const sectionFor = (key: HubStepKey): JSX.Element | null => {
    switch (key) {
      case 'fiche':
        return (
          <HubFicheSection
            detail={data}
            onRequestReview={(action) => {
              void handleReview(action);
            }}
            onRecheckQualification={() => {
              void runRecheckQualification();
            }}
            isRecheckQualificationBusy={recheckQualificationBusy}
            onOverrideQualification={() => {
              void runOverrideQualification();
            }}
            onRemoveQualificationOverride={() => {
              void runRemoveQualificationOverride();
            }}
            isQualificationOverrideBusy={qualificationOverrideBusy}
          />
        );
      case 'quick-check':
        return (
          <HubQuickCheckSection
            candidateId={data.candidateId}
            detail={data}
            onRunQuickCheck={() => {
              void runQuickCheck();
            }}
            isQuickCheckBusy={prescanStarting}
            onRefresh={() => {
              void runRefresh();
            }}
            isRefreshBusy={refreshBusy}
            action={data.actions?.runQuickCheck}
            blockedReason={actionBlockedReason(data.actions?.runQuickCheck, strings, language)}
          />
        );
      case 'audit':
        return (
          <HubAuditSection
            detail={data}
            auditId={auditId}
            onPickAudit={setPickedAuditId}
            onLaunchFullAudit={() => {
              void launchFullAudit();
            }}
          />
        );
      case 'report':
        return <HubReportTab auditId={auditId} />;
      case 'preview':
        return (
          <HubPreviewSection
            auditId={previewAuditId}
            preview={data.preview}
            publishedLink={publishedLink}
            hasTouch1Draft={
              data.thread?.drafts.some(
                (draft) => draft.touch === 1 && draft.status === 'created',
              ) ?? false
            }
            isBusy={isOutreachBusy}
            onPublish={runPublish}
            onRevoke={runRevoke}
            action={data.actions?.publishPreview}
            blockedReason={actionBlockedReason(data.actions?.publishPreview, strings, language)}
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
            firstEmailAction={data.actions?.createFirstEmail}
            firstEmailBlockedReason={actionBlockedReason(
              data.actions?.createFirstEmail,
              strings,
              language,
            )}
            followUpAction={data.actions?.createFollowUp}
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
          <Button
            size="sm"
            onClick={() => {
              void handleReview('accept');
            }}
          >
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

      {/* Issue #220: every job currently owning part of this prospect's
          workflow, not only the outreach full scan the Audit tab already
          shows inline. One line per job so two allowed simultaneous jobs
          (a Quick check alongside a browser-heavy audit) never hide one
          another. */}
      {data.activeJobs !== undefined && data.activeJobs.length > 0 ? (
        <ul className="mb-4 flex flex-wrap items-center gap-3" role="status">
          {data.activeJobs.map((job) => (
            <li key={job.jobId} className="flex items-center gap-2">
              <Badge tone="accent">
                {strings.common.typeLabels[activeJobKindToLabelKey(job.kind)]}
              </Badge>
              <Link
                to={`/scans/${encodeURIComponent(job.jobId)}`}
                className={buttonStyles('secondary', 'sm')}
              >
                {strings.hub.primary.seeProgress}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

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
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              void handleReview('reject');
            }}
          >
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

      <WaveDialog
        open={waveDialog !== null}
        onOpenChange={(open) => {
          if (!open) setWaveDialog(null);
        }}
        mode={waveDialog ?? 'add'}
        candidateId={candidateId ?? null}
        hotelName={data.name}
        initialWave={waveDialog === 'remove' ? data.selectionVerdict?.wave : null}
        onSubmit={(waveCandidateId, wave) => submitWave(waveDialog ?? 'add', waveCandidateId, wave)}
      />
    </article>
  );
}
