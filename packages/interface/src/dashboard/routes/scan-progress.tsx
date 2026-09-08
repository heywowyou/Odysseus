import { useCallback, useEffect, useState } from 'react';
import type { JSX, ReactNode } from 'react';
import { Link, useParams } from 'react-router';
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
import { ApiError, fetchJson, postEmpty } from '../lib/api';
import type { ScanJobDetail, ScanUrlResult } from '../lib/api-types';
import { canStop } from '../lib/job-actions';
import { cn } from '../lib/cn';
import { usePolling } from '../lib/use-polling';
import { hostnameOf } from './audit-detail-model';
import {
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
  urlResultState,
  type UrlResultState,
} from './scan-progress-model';

const POLL_INTERVAL_MS = 3000;

function fillProgressCopy(template: string, values: Record<string, number>): string {
  return Object.entries(values).reduce(
    (copy, [key, value]) => copy.replace(`{${key}}`, String(value)),
    template,
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

  const fetcher = useCallback((): Promise<ScanJobDetail | null> => {
    if (jobId === undefined) return Promise.resolve(null);
    return fetchJson<ScanJobDetail>(`/api/scans/${jobId}`)
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
  }, [jobId]);

  const { data, error, refresh } = usePolling<ScanJobDetail | null>(fetcher, POLL_INTERVAL_MS, {
    enabled: jobId !== undefined && !missing && !settled,
    key: jobId ?? 'none',
  });

  const job = data ?? undefined;

  // A live job can be stopped; the confirm dialog carries the consequence,
  // so the header control itself stays quiet.
  const [confirmStopOpen, setConfirmStopOpen] = useState(false);
  const stoppable =
    job !== undefined &&
    !isTerminal(job.status) &&
    (job.type === 'full-audit' || job.type === 'prospecting' || job.type === 'hotel-prescan') &&
    canStop(job.status);

  const stopJob = async (): Promise<void> => {
    if (jobId === undefined) return;
    try {
      await postEmpty(`/api/scans/${encodeURIComponent(jobId)}/cancel`);
      // Once the fetched document reads terminal the fetcher settles and
      // polling stops; refresh surfaces the cancelled card on this tick
      // instead of waiting for a poll that will no longer happen.
      refresh();
    } catch {
      toast.error(strings.audits.actionFailed);
    }
  };

  let body: ReactNode;
  if (data === null) {
    // Unknown job: a quiet dead end on purpose, no retry action.
    body = <EmptyState title={strings.progress.notFound} />;
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
    body = <JobView job={job} />;
  }

  return (
    <article className={PAGE_WIDTH.reading}>
      <PageHeader
        eyebrow={
          job === undefined
            ? undefined
            : job.type === 'full-audit'
              ? strings.common.typeLabels.fullAudit
              : job.type === 'hotel-prescan'
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
                {isTerminal(job.status) ? null : <StatusDot status="running" />}
                <span className="text-ink-soft">
                  {currentPhaseLabel(job.phase, strings.progress.phaseLabels)}
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
        onConfirm={stopJob}
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
  rough?: boolean;
  note?: string | undefined;
  running?: boolean;
}): JSX.Element {
  const { strings } = useI18n();
  const { label, hint, value, etaMs, rough = false, note, running = false } = props;
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
        {etaMs !== undefined ? (
          <p className="numeric shrink-0 text-xs text-ink-muted">
            {strings.progress.etaLabel}: {formatEta(etaMs)}
            {rough ? ` ${strings.progress.etaRoughSuffix}` : ''}
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
function JobView({ job }: { job: ScanJobDetail }): JSX.Element {
  const terminal = isTerminal(job.status);
  const prospecting = job.type === 'prospecting' || job.type === 'hotel-prescan';
  return (
    <div className="flex flex-col gap-4">
      {prospecting ? (
        <ProspectingView job={job} terminal={terminal} />
      ) : (
        <FullAuditView job={job} terminal={terminal} />
      )}
    </div>
  );
}

function FullAuditView({ job, terminal }: { job: ScanJobDetail; terminal: boolean }): JSX.Element {
  const { strings } = useI18n();
  // The old page swaps the phase bars for the result card once terminal;
  // cancelled keeps its own quiet card so a stopped job never reads as
  // failed or complete.
  if (terminal) {
    if (job.status === 'failed') return <FailedCard job={job} />;
    if (job.status === 'cancelled') return <CancelledCard />;
    if (job.status === 'needs-input') return <NeedsInputCard job={job} />;
    return <CompleteCard job={job} />;
  }

  // ETA lines follow the old page: each bar shows its estimate only while
  // its own phase is the current one, and only the scan estimate carries
  // the rough suffix.
  const crawlEta = job.phase === 'crawl' ? job.progress.crawl?.etaMs : undefined;
  const scanEta = job.phase === 'scan' ? job.progress.scan?.etaMs : undefined;
  const contentEta = job.phase === 'content-scan' ? job.progress.contentScan?.etaMs : undefined;
  const lighthouseEta = job.phase === 'lighthouse' ? job.progress.lighthouse?.etaMs : undefined;
  const staged = hasStagedAnalysisProgress(job);
  const content = job.progress.contentScan;
  const lighthouse = job.progress.lighthouse;
  const stagedSummary =
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
        : content !== undefined
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
          running={job.phase === 'crawl'}
        />
        {staged ? (
          <>
            <PhaseRow
              label={strings.progress.contentScanPhaseLabel}
              hint={strings.hints.scan}
              value={contentScanProgress(job)}
              etaMs={contentEta}
              rough
              running={job.phase === 'content-scan'}
            />
            <PhaseRow
              label={strings.progress.lighthousePhaseLabel}
              hint={strings.hints.scan}
              value={lighthouseProgress(job)}
              etaMs={lighthouseEta}
              rough
              note={stagedSummary}
              running={job.phase === 'lighthouse' || job.phase === 'select-performance'}
            />
          </>
        ) : (
          <PhaseRow
            label={strings.progress.scanPhaseLabel}
            hint={strings.hints.scan}
            value={scanProgress(job)}
            etaMs={scanEta}
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
      {job.type === 'prospecting' ? (
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
      {job.auditId !== undefined ? (
        <Link to={`/audits/${job.auditId}`} className={buttonStyles('primary', 'sm')}>
          {strings.progress.viewDetailLink}
        </Link>
      ) : null}
    </Card>
  );
}

function FailedCard({ job }: { job: ScanJobDetail }): JSX.Element {
  const { strings } = useI18n();
  return (
    <Card title={strings.progress.failedHeading} className="border-danger/40">
      {job.error !== undefined ? <p className="text-sm text-ink-soft">{job.error}</p> : null}
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
 *  are awaited and linking to where they get confirmed. */
function NeedsInputCard({ job }: { job: ScanJobDetail }): JSX.Element {
  const { strings } = useI18n();
  return (
    <Card title={strings.progress.needsInputHeading} className="border-sev-moderate/40">
      <p className="text-sm text-ink-soft">{strings.progress.needsInputNote}</p>
      {job.needsInputFields !== undefined && job.needsInputFields.length > 0 ? (
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
