import { useCallback, useEffect, useState } from 'react';
import type { JSX, ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { PAGE_WIDTH, PageHeader } from '../components/page-header';
import { Badge, badgeStyles, type BadgeTone } from '../components/ui/badge';
import { Button, buttonStyles } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { CoverageBar } from '../components/ui/coverage-bar';
import { ConfirmDialog } from '../components/ui/dialog';
import { EmptyState } from '../components/ui/empty-state';
import { InfoTip } from '../components/ui/info-tip';
import { ProgressBar } from '../components/ui/progress-bar';
import { Spinner } from '../components/ui/spinner';
import { StatusDot } from '../components/ui/status-dot';
import { useI18n } from '../i18n/provider';
import { ApiError, fetchJsonValidated, sendJson } from '../lib/api';
import { scanJobDetailSchema } from '../lib/api-schemas';
import type { ScanJobDetail, ScanUrlResult } from '../lib/api-types';
import { isStateChanged, problemCopy } from '../lib/operator-copy';
import { cn } from '../lib/cn';
import { delaySeconds, summarizePushback, type PushbackSummary } from '../lib/pushback';
import { usePolling } from '../lib/use-polling';
import { hostnameOf } from './audit-detail-model';
import { IdentityConfirmField } from './identity-confirm-field';
import type { IdentityField } from './identity-confirm-field';
import { scanFailureReason } from './scan-failure-model';
import {
  agedEtaMs,
  contentScanProgress,
  coverageSegments,
  crawlProgress,
  currentPhaseLabel,
  formatEta,
  hasCoverage,
  hasStagedAnalysisProgress,
  isTerminal,
  lighthouseProgress,
  scanProgress,
  terminalCardKind,
  urlResultState,
  type UrlResultState,
} from './scan-progress-model';

// Issue #223: the server only recomputes etaMs when a progress event
// fires, so this ticks a re-render once a second while a phase is live -
// agedEtaMs then ages the last-seen etaMs down between polls instead of
// the countdown sitting frozen for up to POLL_INTERVAL_MS.
function useNowTicker(enabled: boolean): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [enabled]);
  return nowMs;
}

// Plan 040 poll policy: scan progress stays at 3s while the job is running
// (the `enabled` flag below already stops polling once it settles).
const POLL_INTERVAL_MS = 3000;

function fillProgressCopy(template: string, values: Record<string, number>): string {
  return Object.entries(values).reduce(
    (copy, [key, value]) => copy.replace(`{${key}}`, String(value)),
    template,
  );
}

function slowRelaunchHref(job: ScanJobDetail, delayMs: number): string | undefined {
  if (job.siteUrl === undefined) return undefined;
  const params = new URLSearchParams({
    url: job.siteUrl,
    type: job.type === 'quick-check' ? 'quick-check' : 'full-audit',
    delaySeconds: String(delaySeconds(delayMs)),
    scanConcurrency: '1',
  });
  if (job.prospectId !== undefined) params.set('prospectId', job.prospectId);
  return `/scans/new?${params.toString()}`;
}

/** The slower relaunch the pushback notice offers, or undefined while the
 *  scanner's own slowdown is still enough. */
function slowRelaunch(job: ScanJobDetail): { href: string; delayMs: number } | undefined {
  const summary = pushbackSummaryOf(job);
  if (summary === undefined || !summary.relaunchAdvised) return undefined;
  const href = slowRelaunchHref(job, summary.suggestedDelayMs);
  return href === undefined ? undefined : { href, delayMs: summary.suggestedDelayMs };
}

function pushbackSummaryOf(job: ScanJobDetail): PushbackSummary | undefined {
  return summarizePushback(
    job.progress.pushbackEvents ?? [],
    job.options.delayMs ?? job.progress.crawl?.effectiveDelayMs ?? 0,
    job.progress.crawlExclusions?.blocked ?? 0,
    job.progress.pacingRecoveryEvents ?? [],
  );
}

function PushbackNotice({
  job,
  relaunchPending,
  onRelaunch,
}: {
  job: ScanJobDetail;
  relaunchPending: boolean;
  onRelaunch: () => void;
}): JSX.Element | null {
  const { strings } = useI18n();
  const summary = pushbackSummaryOf(job);
  if (summary === undefined) return null;
  const note = (
    <p className="text-sm text-ink-soft">
      {fillProgressCopy(
        summary.latestWasRecovery
          ? strings.progress.pushbackRecoveredNote
          : strings.progress.pushbackSlowedNote,
        {
          count: summary.latestWasRecovery ? summary.recoveryCount : summary.eventCount,
          delay: delaySeconds(summary.currentDelayMs),
        },
      )}
    </p>
  );
  if (slowRelaunch(job) === undefined) return <Card>{note}</Card>;
  return (
    <Card className="border-sev-moderate/50 bg-sev-moderate/5">
      {note}
      <p className="mt-2 text-sm text-ink-soft">{strings.progress.pushbackRelaunchWarning}</p>
      {relaunchPending ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-ink-soft">
          <Spinner />
          {strings.progress.slowRelaunchPendingNote}
        </p>
      ) : (
        <Button variant="secondary" size="sm" className="mt-3" onClick={onRelaunch}>
          {strings.progress.slowRelaunchLink}
        </Button>
      )}
    </Card>
  );
}

/** Old page badge colors: success green for a done URL, red for a failed
 *  one, accent violet while still in flight. */
const URL_STATE_TONES: Record<UrlResultState, BadgeTone> = {
  complete: 'minor',
  failed: 'critical',
  running: 'accent',
};

export function ScanProgressPage(): JSX.Element {
  const { strings } = useI18n();
  const params = useParams<{ jobId: string }>();
  const jobId = params.jobId;

  // A 404 can never recover, and a terminal document can no longer change;
  // either one disables the poll. Both are learned from fetch responses, so
  // they live in state the fetcher writes instead of in the polled data
  // (which cannot gate its own fetch). Reset on jobId so navigating between
  // jobs starts clean, matching the state reset usePolling does on a key
  // change.
  const [missing, setMissing] = useState(false);
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    setMissing(false);
    setSettled(false);
  }, [jobId]);

  const fetcher = useCallback(
    (signal: AbortSignal): Promise<ScanJobDetail | null> => {
      if (jobId === undefined) return Promise.resolve(null);
      return fetchJsonValidated(`/api/scans/${jobId}`, scanJobDetailSchema, { signal })
        .then((job) => {
          setSettled(isTerminal(job.status));
          return job;
        })
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 404) {
            setMissing(true);
            return null;
          }
          throw error;
        });
    },
    [jobId],
  );

  const { data, error, refresh } = usePolling<ScanJobDetail | null>(fetcher, POLL_INTERVAL_MS, {
    enabled: jobId !== undefined && !missing && !settled,
    key: jobId ?? 'none',
  });

  const job = data ?? undefined;

  // A live job can be stopped; the confirm dialog carries the consequence,
  // so the header control itself stays quiet.
  const [confirmStopOpen, setConfirmStopOpen] = useState(false);
  // Plan 061: the server decides whether Stop is available and hands the
  // state token the command must present.
  const stopCapability = job?.capabilities.cancel;
  const stoppable = stopCapability?.state === 'available';

  const stopJob = async (): Promise<boolean> => {
    if (jobId === undefined || stopCapability === undefined) return false;
    try {
      await sendJson(`/api/scans/${encodeURIComponent(jobId)}/cancel`, 'POST', {
        stateToken: stopCapability.stateToken,
      });
      // Running work first becomes cancel-requested, so keep polling until
      // the worker confirms the terminal cancelled state. A queued job may
      // already be terminal on this refresh.
      refresh();
      return true;
    } catch (error) {
      toast.error(problemCopy(error, strings.workState) ?? strings.audits.actionFailed);
      if (isStateChanged(error)) refresh();
      return false;
    }
  };

  // A slower relaunch has to stop this scan first: the site's launch slot
  // stays taken until the worker has actually stopped, so the new scan would
  // be refused as busy. The form opens once the job is terminal.
  const navigate = useNavigate();
  const [confirmRelaunchOpen, setConfirmRelaunchOpen] = useState(false);
  const [pendingRelaunchHref, setPendingRelaunchHref] = useState<string | undefined>();
  const relaunch = job === undefined ? undefined : slowRelaunch(job);
  const requestRelaunch = (): void => {
    if (relaunch === undefined) return;
    if (stoppable) setConfirmRelaunchOpen(true);
    else void navigate(relaunch.href);
  };
  const stopAndRelaunch = async (): Promise<void> => {
    if (relaunch === undefined) return;
    if (await stopJob()) setPendingRelaunchHref(relaunch.href);
  };
  useEffect(() => {
    if (pendingRelaunchHref !== undefined && job !== undefined && isTerminal(job.status)) {
      void navigate(pendingRelaunchHref);
    }
  }, [pendingRelaunchHref, job, navigate]);

  let body: ReactNode;
  if (data === null) {
    // Unknown job: no retry action, but a way back to scan history.
    body = (
      <EmptyState
        title={strings.progress.notFound}
        action={
          <Link to="/audits" className={buttonStyles('secondary', 'sm')}>
            {strings.progress.notFoundAction}
          </Link>
        }
      />
    );
  } else if (job === undefined) {
    body =
      error !== undefined ? (
        <EmptyState
          title={strings.common.requestFailed}
          description={error}
          action={
            <Button variant="secondary" size="sm" onClick={refresh}>
              {strings.common.retry}
            </Button>
          }
        />
      ) : (
        <Card>
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-ink-muted">
            <Spinner />
            {strings.common.loading}
          </div>
        </Card>
      );
  } else {
    body = (
      <JobView
        job={job}
        refresh={refresh}
        relaunchPending={pendingRelaunchHref !== undefined}
        onRelaunch={requestRelaunch}
      />
    );
  }

  return (
    <article className={PAGE_WIDTH.reading}>
      <PageHeader
        eyebrow={
          job === undefined
            ? undefined
            : job.type === 'full-audit'
              ? strings.common.typeLabels.fullAudit
              : job.type === 'outreach-full-scan' || job.type === 'prospecting-audit'
                ? strings.common.typeLabels.outreachFullScan
                : job.type === 'quick-check'
                  ? strings.common.typeLabels.hotelPrescan
                  : strings.common.typeLabels.prospecting
        }
        subject={job?.siteUrl === undefined ? undefined : hostnameOf(job.siteUrl)}
        title={strings.progress.title}
        description={strings.progress.description}
        actions={
          stoppable ? (
            <Button variant="secondary" size="sm" onClick={() => setConfirmStopOpen(true)}>
              {strings.progress.stopButton}
            </Button>
          ) : undefined
        }
        meta={
          job === undefined ? undefined : (
            <div className="flex flex-col gap-4">
              {/* The phase belongs in the header, not floating above the
                  cards: phases without a progress row of their own
                  (normalizing, writing, rendering the PDFs) are otherwise
                  invisible while they run. */}
              <div className="flex items-center gap-2 text-sm">
                {isTerminal(job.status) ? null : (
                  <StatusDot
                    status={job.status === 'cancel-requested' ? 'cancel-requested' : 'running'}
                  />
                )}
                <span className="text-ink-soft">
                  {job.status === 'cancel-requested'
                    ? strings.common.statusLabels['cancel-requested']
                    : terminalCardKind(job) === 'report-issue'
                      ? strings.common.statusLabels['report-issue']
                      : currentPhaseLabel(job.phase, strings.progress.phaseLabels)}
                </span>
              </div>
              {hasCoverage(job) ? (
                <CoverageBar
                  segments={coverageSegments(job, strings.common.coverage)}
                  caption={strings.common.coverage.caption}
                />
              ) : null}
            </div>
          )
        }
      />
      {body}
      <ConfirmDialog
        open={confirmStopOpen}
        onOpenChange={setConfirmStopOpen}
        title={strings.progress.confirmStopTitle}
        description={strings.progress.confirmStopBody}
        confirmLabel={strings.progress.stopButton}
        cancelLabel={strings.common.cancel}
        onConfirm={async () => {
          await stopJob();
        }}
      />
      <ConfirmDialog
        open={confirmRelaunchOpen}
        onOpenChange={setConfirmRelaunchOpen}
        title={strings.progress.confirmSlowRelaunchTitle}
        description={fillProgressCopy(strings.progress.confirmSlowRelaunchBody, {
          delay: delaySeconds(relaunch?.delayMs ?? 0),
        })}
        confirmLabel={strings.progress.slowRelaunchLink}
        cancelLabel={strings.common.cancel}
        onConfirm={stopAndRelaunch}
      />
    </article>
  );
}

/** One phase of a live run. The three phases used to be three separate cards,
 *  which read as three unrelated things rather than as one run moving through
 *  its stages; they are rows of a single panel now, and the estimate sits on
 *  the row it belongs to instead of below it. */
function PhaseRow(props: {
  label: string;
  hint: string;
  value: number | null;
  etaMs?: number | undefined;
  etaCalculatedAt?: string | undefined;
  nowMs: number;
  rough?: boolean;
  note?: string | undefined;
  running?: boolean;
}): JSX.Element {
  const { strings } = useI18n();
  const {
    label,
    hint,
    value,
    etaMs,
    etaCalculatedAt,
    nowMs,
    rough = false,
    note,
    running = false,
  } = props;
  const displayedEtaMs = etaMs === undefined ? undefined : agedEtaMs(etaMs, etaCalculatedAt, nowMs);
  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <div className="flex items-center gap-1.5">
          {running ? <StatusDot status="running" /> : null}
          {/* A phase is a readout line, not a document section: the three
              rows sit inside one untitled card, so a heading here would skip
              a level under the page title. */}
          <p className={cn('text-sm font-medium', running ? 'text-ink' : 'text-ink-soft')}>
            {label}
          </p>
          <InfoTip label={label} hint={hint} />
        </div>
        {displayedEtaMs !== undefined ? (
          <p className="numeric shrink-0 text-xs text-ink-muted">
            {/* Issue #223: once the aged countdown hits 0 while the phase
                is still running, a fresh progress event just hasn't landed
                yet - say so instead of showing a stuck "0 s". */}
            {displayedEtaMs > 0 || !running ? (
              <>
                {strings.progress.etaLabel}: {formatEta(displayedEtaMs)}
                {rough ? ` ${strings.progress.etaRoughSuffix}` : ''}
              </>
            ) : (
              strings.progress.etaFinishingLabel
            )}
          </p>
        ) : null}
      </div>
      <ProgressBar value={value} ariaLabel={label} />
      {note !== undefined ? <p className="numeric mt-2 text-xs text-ink-muted">{note}</p> : null}
    </div>
  );
}

/** Live view of one job document. The phase line mirrors the old page's
 *  phase status text for full audits; for prospecting the spinner card
 *  carries the phase copy instead, so the label never shows twice. */
function JobView({
  job,
  refresh,
  relaunchPending,
  onRelaunch,
}: {
  job: ScanJobDetail;
  refresh: () => void;
  relaunchPending: boolean;
  onRelaunch: () => void;
}): JSX.Element {
  const terminal = isTerminal(job.status);
  const prospecting =
    job.type === 'prospecting' || job.type === 'quick-check' || job.type === 'prospecting-audit';
  return (
    <div className="flex flex-col gap-4">
      <PushbackNotice job={job} relaunchPending={relaunchPending} onRelaunch={onRelaunch} />
      {prospecting ? (
        <ProspectingView job={job} terminal={terminal} />
      ) : (
        <FullAuditView job={job} terminal={terminal} refresh={refresh} />
      )}
    </div>
  );
}

function FullAuditView({
  job,
  terminal,
  refresh,
}: {
  job: ScanJobDetail;
  terminal: boolean;
  refresh: () => void;
}): JSX.Element {
  const { strings } = useI18n();
  const nowMs = useNowTicker(!terminal);
  // The old page swaps the phase bars for the result card once terminal;
  // cancelled keeps its own quiet card so a stopped job never reads as
  // failed or complete.
  if (terminal) {
    const kind = terminalCardKind(job);
    if (kind === 'failed') return <FailedCard job={job} />;
    if (kind === 'report-issue') return <ReportIssueCard job={job} />;
    if (kind === 'cancelled') return <CancelledCard />;
    if (kind === 'needs-input') return <NeedsInputCard job={job} refresh={refresh} />;
    return <CompleteCard job={job} />;
  }

  // ETA lines follow the old page: each bar shows its estimate only while
  // its own phase is the current one, and only the scan estimate carries
  // the rough suffix.
  const crawlEta = job.phase === 'crawl' ? job.progress.crawl?.etaMs : undefined;
  const crawlEtaCalculatedAt =
    job.phase === 'crawl' ? job.progress.crawl?.etaCalculatedAt : undefined;
  const scanEta = job.phase === 'scan' ? job.progress.scan?.etaMs : undefined;
  const scanEtaCalculatedAt = job.phase === 'scan' ? job.progress.scan?.etaCalculatedAt : undefined;
  const contentEta = job.phase === 'content-scan' ? job.progress.contentScan?.etaMs : undefined;
  const contentEtaCalculatedAt =
    job.phase === 'content-scan' ? job.progress.contentScan?.etaCalculatedAt : undefined;
  const lighthouseEta = job.phase === 'lighthouse' ? job.progress.lighthouse?.etaMs : undefined;
  const lighthouseEtaCalculatedAt =
    job.phase === 'lighthouse' ? job.progress.lighthouse?.etaCalculatedAt : undefined;
  const staged = hasStagedAnalysisProgress(job);
  const content = job.progress.contentScan;
  const lighthouse = job.progress.lighthouse;
  // Issue #400: each progress sentence sits under the phase it describes;
  // performance selection and measurement belong to the performance row,
  // everything else about checked pages to the content row.
  const performanceNote =
    job.phase === 'select-performance' && content !== undefined
      ? fillProgressCopy(strings.progress.performanceSelectionMessage, {
          target: content.target,
        })
      : job.phase === 'lighthouse' && content !== undefined && lighthouse !== undefined
        ? fillProgressCopy(strings.progress.lighthouseProgressMessage, {
            content: content.completed,
            completed: lighthouse.completed,
            target: lighthouse.target,
          })
        : undefined;
  const contentNote =
    performanceNote === undefined && content !== undefined
      ? fillProgressCopy(strings.progress.contentProgressMessage, {
          completed: content.completed,
          target: content.target,
        })
      : undefined;

  return (
    <Card>
      <div className="divide-y divide-line">
        <PhaseRow
          label={strings.progress.crawlPhaseLabel}
          hint={strings.hints.crawl}
          /* A null crawl progress is an uncapped crawl (issue 18): the bar
             renders indeterminate instead of pretending to know a percentage. */
          value={crawlProgress(job)}
          etaMs={crawlEta}
          etaCalculatedAt={crawlEtaCalculatedAt}
          nowMs={nowMs}
          running={job.phase === 'crawl'}
        />
        {staged ? (
          <>
            <PhaseRow
              label={strings.progress.contentScanPhaseLabel}
              hint={strings.hints.scan}
              value={contentScanProgress(job)}
              etaMs={contentEta}
              etaCalculatedAt={contentEtaCalculatedAt}
              nowMs={nowMs}
              rough
              note={contentNote}
              running={job.phase === 'content-scan'}
            />
            <PhaseRow
              label={strings.progress.lighthousePhaseLabel}
              hint={strings.hints.scan}
              value={lighthouseProgress(job)}
              etaMs={lighthouseEta}
              etaCalculatedAt={lighthouseEtaCalculatedAt}
              nowMs={nowMs}
              rough
              note={performanceNote}
              running={job.phase === 'lighthouse' || job.phase === 'select-performance'}
            />
          </>
        ) : (
          <PhaseRow
            label={strings.progress.scanPhaseLabel}
            hint={strings.hints.scan}
            value={scanProgress(job)}
            etaMs={scanEta}
            etaCalculatedAt={scanEtaCalculatedAt}
            nowMs={nowMs}
            rough
            running={job.phase === 'scan'}
          />
        )}
      </div>
    </Card>
  );
}

function ProspectingView({
  job,
  terminal,
}: {
  job: ScanJobDetail;
  terminal: boolean;
}): JSX.Element {
  const { strings } = useI18n();
  return (
    <>
      {!terminal ? (
        <Card>
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <Spinner />
            {strings.progress.phaseLabels.scanning}
          </div>
          {job.progress.message !== undefined ? (
            <p className="mt-2 text-xs text-ink-muted">{job.progress.message}</p>
          ) : null}
        </Card>
      ) : null}
      {job.type !== 'quick-check' &&
      job.type !== 'prospecting-audit' &&
      job.type !== 'full-audit' ? (
        <Card title={strings.progress.urlResultsHeading}>
          <ul className="divide-y divide-line">
            {(job.urlResults ?? []).map((row) => (
              <UrlRow key={row.url} row={row} linked={job.status === 'complete'} />
            ))}
          </ul>
        </Card>
      ) : null}
      {terminal ? (
        job.status === 'failed' ? (
          <FailedCard job={job} />
        ) : job.status === 'cancelled' ? (
          <CancelledCard />
        ) : (
          <CompleteCard job={job} />
        )
      ) : null}
    </>
  );
}

/** One per-URL row of a prospecting batch. Completed rows link to their
 *  audit (the per-URL report access the old page exposed); the job's
 *  auditIds aggregate exactly the ids the rows carry. The status badge
 *  speaks in localized status copy keyed on the row's three display
 *  states; the raw job status code never reaches the operator. */
function UrlRow({ row, linked }: { row: ScanUrlResult; linked: boolean }): JSX.Element {
  const { strings } = useI18n();
  const state = urlResultState(row.status);
  const label = strings.common.statusLabels[state];
  const auditId = linked ? row.auditId : undefined;
  return (
    <li className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
      <span className="min-w-0 font-mono text-[13px] break-all text-ink-soft">{row.url}</span>
      {auditId !== undefined ? (
        <Link
          to={`/audits/${auditId}`}
          className={cn(
            badgeStyles(URL_STATE_TONES[state]),
            'shrink-0 transition-colors hover:bg-overlay',
          )}
        >
          {label}
        </Link>
      ) : (
        <Badge tone={URL_STATE_TONES[state]} className="shrink-0">
          {label}
        </Badge>
      )}
    </li>
  );
}

function CompleteCard({ job }: { job: ScanJobDetail }): JSX.Element {
  const { strings } = useI18n();
  return (
    <Card title={strings.progress.completeHeading} className="border-sev-minor/40">
      <div className="mt-3 flex flex-wrap gap-2">
        {job.auditId !== undefined ? (
          // Plan 040 slice 7: the link opens the audit page, so it says so
          // (the old "full report" wording promised a different document).
          <Link to={`/audits/${job.auditId}`} className={buttonStyles('primary', 'sm')}>
            {strings.progress.goToAuditLink}
          </Link>
        ) : null}
        {job.prospectId !== undefined ? (
          <Link
            to={`/prospects/${encodeURIComponent(job.prospectId)}#emails`}
            className={buttonStyles(job.auditId !== undefined ? 'secondary' : 'primary', 'sm')}
          >
            {strings.progress.goToProspectLink}
          </Link>
        ) : null}
      </div>
    </Card>
  );
}

/** Issue #386: the scan finished and its audit was saved; only the report
 *  failed. Reads as a completed scan, with the report failure as its own
 *  block, so the operator regenerates from the audit page instead of
 *  rescanning a site that is already captured. */
function ReportIssueCard({ job }: { job: ScanJobDetail }): JSX.Element {
  const { strings } = useI18n();
  // Server-declared (routes/scan-outcome.ts); non-null whenever this card
  // renders, so the fallback only satisfies the type.
  const stage = job.reportFailureStage ?? 'unknown';
  return (
    <Card title={strings.progress.completeHeading} className="border-sev-serious/40">
      <div className="mt-1 flex flex-col items-start gap-2">
        <h3 className="text-sm font-semibold text-ink">{strings.progress.reportFailedHeading}</h3>
        <p className="text-sm text-ink-soft">{strings.progress.reportFailedStages[stage]}</p>
        {job.error !== undefined ? <p className="text-sm text-ink-soft">{job.error}</p> : null}
        <p className="text-xs text-ink-muted">{strings.progress.failedRescanHint}</p>
        {job.auditId !== undefined ? (
          <Link to={`/audits/${job.auditId}`} className={buttonStyles('primary', 'sm')}>
            {strings.progress.goToAuditLink}
          </Link>
        ) : null}
      </div>
    </Card>
  );
}

function FailedCard({ job }: { job: ScanJobDetail }): JSX.Element {
  const { strings } = useI18n();
  const reason = scanFailureReason(job.error);
  return (
    <Card title={strings.progress.failedHeading} className="border-danger/40">
      <p className="text-sm text-ink-soft">{strings.progress.failureReasons[reason]}</p>
      {job.error !== undefined ? (
        <details className="mt-3 rounded-lg border border-line bg-raised px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-ink-muted">
            {strings.progress.failureTechnicalDetails}
          </summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-xs text-ink-soft">
            {job.error}
          </pre>
        </details>
      ) : null}
      {/* Issue #187: the coverage gate's failure text names the crawl delay
          and scan concurrency fields as the remedy but had no link to
          them; the server declares the gate case (`coverageGateBlocked`)
          so the link does not depend on matching the sentence here. */}
      {job.coverageGateBlocked ? (
        <Link
          to="/scans/new#new-scan-delay-seconds"
          className="mt-2 inline-block text-sm text-accent-bright underline underline-offset-2"
        >
          {strings.progress.coverageGateFieldsLink}
        </Link>
      ) : null}
      {/* Issue #90: a failed job whose audit was persisted failed after the
          crawl, so the fix lives on the audit page; say so instead of
          leaving the re-scan reflex as the only visible path. */}
      {job.auditId !== undefined ? (
        <div className="mt-3 flex flex-col items-start gap-3">
          <p className="text-xs text-ink-muted">{strings.progress.failedRescanHint}</p>
          <Link to={`/audits/${job.auditId}`} className={buttonStyles('primary', 'sm')}>
            {strings.progress.goToAuditLink}
          </Link>
        </div>
      ) : !job.coverageGateBlocked ? (
        <Link to="/scans/new" className={buttonStyles('primary', 'sm')}>
          {strings.progress.newScanLink}
        </Link>
      ) : null}
    </Card>
  );
}

/** A stopped job is an operator decision, not a failure: quiet card, no
 *  danger styling. */
function CancelledCard(): JSX.Element {
  const { strings } = useI18n();
  return (
    <Card title={strings.progress.stoppedHeading}>
      <p className="text-sm text-ink-soft">{strings.progress.cancelledNote}</p>
    </Card>
  );
}

/** Field labels are reused from auditDetail's manual-fields form (the same
 *  two identity fields, same copy) rather than duplicating them here. */
function needsInputFieldLabel(
  field: string,
  strings: ReturnType<typeof useI18n>['strings'],
): string {
  if (field === 'nomCommercial') return strings.auditDetail.nomCommercialLabel;
  if (field === 'raisonSociale') return strings.auditDetail.raisonSocialeLabel;
  return field;
}

/** Issue #73: the pipeline finished and stopped deliberately on the D8
 *  identity-confirmation gate, not a crash - its own card, amber rather
 *  than the danger styling FailedCard uses, listing exactly which fields
 *  are awaited. Plan 045 slice 1.3: each awaited field confirms inline
 *  here instead of only linking away to the audit page - confirming the
 *  last one triggers the PDFs automatically, so refresh() re-polls the job
 *  and picks up its resulting status. */
function NeedsInputCard({
  job,
  refresh,
}: {
  job: ScanJobDetail;
  refresh: () => void;
}): JSX.Element {
  const { strings } = useI18n();
  const auditId = job.auditId;
  const identityFields = (job.needsInputFields ?? []).filter(
    (entry): entry is { field: IdentityField; value: string } =>
      entry.field === 'nomCommercial' || entry.field === 'raisonSociale',
  );
  return (
    <Card title={strings.progress.needsInputHeading} className="border-sev-moderate/40">
      <p className="text-sm text-ink-soft">{strings.progress.needsInputNote}</p>
      {auditId !== undefined && identityFields.length > 0 ? (
        <div className="mt-3 flex flex-col gap-3">
          {identityFields.map((entry) => (
            <IdentityConfirmField
              key={entry.field}
              auditId={auditId}
              field={entry.field}
              detectedValue={entry.value}
              onConfirmed={refresh}
            />
          ))}
        </div>
      ) : job.needsInputFields !== undefined && job.needsInputFields.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-1 text-sm text-ink-soft">
          {job.needsInputFields.map((entry) => (
            <li key={entry.field}>
              <span className="font-medium text-ink">
                {needsInputFieldLabel(entry.field, strings)}:
              </span>{' '}
              {entry.value}
            </li>
          ))}
        </ul>
      ) : null}
      {job.auditId !== undefined ? (
        <Link to={`/audits/${job.auditId}`} className={cn(buttonStyles('primary', 'sm'), 'mt-4')}>
          {strings.progress.goToAuditLink}
        </Link>
      ) : null}
    </Card>
  );
}
