import { useCallback, useEffect, useState } from 'react';
import type { JSX, ReactNode } from 'react';
import { useParams, Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { PAGE_WIDTH, PageHeader } from '../components/page-header';
import { Badge } from '../components/ui/badge';
import { Button, buttonStyles } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { ConfirmDialog } from '../components/ui/dialog';
import { EmptyState } from '../components/ui/empty-state';
import { InfoTip } from '../components/ui/info-tip';
import { Skeleton } from '../components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '../components/ui/table';
import { useI18n } from '../i18n/provider';
import { vocabularyLabel } from '../lib/vocabulary';
import { ApiError, fetchJson, postEmpty, sendJson } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { usePolling } from '../lib/use-polling';
import { prospectSubPages, qualificationBadgeTone, reviewBadgeTone } from './prospects-model';
import type {
  ProspectDetailResponse,
  ProspectReviewRequest,
  ProspectReviewResponse,
} from './prospects-model';

type ReviewAction = 'accept' | 'reject';

interface ProspectDetailState {
  data: ProspectDetailResponse | undefined;
  error: string | undefined;
  refresh: () => void;
  isNotFound: boolean;
}

/** useApi-flavoured fetch of the prospect detail with one addition: the
 *  polling layer flattens every failure to a message string and drops
 *  ApiError.status, so the fetcher records a 404 itself and the page can
 *  render the dedicated not-found state (same shape as audit-detail). */
function useProspectDetail(candidateId: string | undefined): ProspectDetailState {
  const path =
    candidateId === undefined ? null : `/api/prospects/${encodeURIComponent(candidateId)}`;
  const [isNotFound, setIsNotFound] = useState(false);

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

  const polling = usePolling<ProspectDetailResponse>(fetcher, 0, {
    enabled: path !== null,
    key: path ?? 'none',
  });
  return { ...polling, isNotFound };
}

/** href for a raw websites value: the value when it already carries an
 *  http(s) scheme, https-prefixed otherwise, so 'www.exemple.fr' opens as a
 *  site instead of resolving as a path relative to the dashboard. Any other
 *  scheme is undefined: the caller renders the raw string as plain text, so
 *  an unusual stored scheme never becomes an anchor href (React 19 already
 *  blocks javascript:, this keeps the rule in the code that builds the
 *  href). */
export function websiteHref(raw: string): string | undefined {
  if (/^https?:/i.test(raw)) return raw;
  if (/:/.test(raw)) return undefined;
  return `https://${raw}`;
}

/** A labelled catalogue row: label from the strings table, value from the
 *  payload, rendered only when the value exists. The value is a node so a
 *  row can carry a link (the hotel's own domain). */
function DefinitionRow(props: { label: string; value: ReactNode }): JSX.Element {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line py-1.5 last:border-b-0">
      <span className="text-xs text-ink-muted">{props.label}</span>
      <span className="text-sm text-ink">{props.value}</span>
    </div>
  );
}

export function ProspectDetailPage(): JSX.Element {
  const { candidateId } = useParams<{ candidateId: string }>();
  const { strings, language } = useI18n();
  const navigate = useNavigate();
  const { data, error, refresh, isNotFound } = useProspectDetail(candidateId);
  const [pendingAction, setPendingAction] = useState<ReviewAction | null>(null);
  const [scanStarting, setScanStarting] = useState(false);

  // Plan 037: the one candidate-to-scan path. The server resolves the
  // domain and validates the selection; the page only navigates to the
  // created scan's progress view, never matching audits by domain.
  const startOutreachScan = async (): Promise<void> => {
    if (candidateId === undefined || scanStarting) return;
    setScanStarting(true);
    try {
      const result = await postEmpty<{ started: boolean; jobId?: string; refusal?: string }>(
        `/api/prospects/${encodeURIComponent(candidateId)}/outreach/full-scan`,
      );
      if (result.started && result.jobId !== undefined) {
        toast.success(strings.prospectDetail.outreachScanQueued);
        navigate(`/scans/${result.jobId}`);
        return;
      }
      toast.error(strings.prospectDetail.outreachScanRefused);
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
        `/api/prospects/${encodeURIComponent(candidateId)}/review`,
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

  const review = data.review;
  const hasProvenance = review.actor !== null || review.reason !== null;
  const qualification = data.qualification;
  const qualificationEvents = data.qualificationHistory.rows;

  return (
    <article>
      <PageHeader
        title={data.name}
        description={strings.prospectDetail.description}
        actions={
          <>
            <Badge tone={reviewBadgeTone(data.reviewState)}>
              {vocabularyLabel(
                strings.labels.review,
                data.reviewState,
                strings.common.vocabularyFallback,
              )}
            </Badge>
            <Button size="sm" onClick={() => setPendingAction('accept')}>
              {strings.operator.accept}
            </Button>
            <Button variant="danger" size="sm" onClick={() => setPendingAction('reject')}>
              {strings.operator.reject}
            </Button>
          </>
        }
      />

      {hasProvenance ? (
        <p className="mb-4 text-xs text-ink-muted">
          <span className="font-medium text-ink-soft">{strings.operator.provenanceLabel}</span>
          {' · '}
          {review.actor ?? ''}
          {review.reason !== null ? ` · ${review.reason}` : ''}
          {review.decidedAt !== null ? ` · ${formatDateTime(review.decidedAt, language)}` : ''}
        </p>
      ) : null}

      <div className="flex flex-col gap-6">
        <Card title={strings.prospectDetail.sections.catalogue}>
          <div className="grid grid-cols-1 gap-x-6 md:grid-cols-2">
            <div>
              <DefinitionRow label={strings.prospectDetail.catalogue.name} value={data.name} />
              {data.commune !== null || data.postcode !== null ? (
                <DefinitionRow
                  label={strings.prospectDetail.catalogue.city}
                  value={[data.commune, data.postcode].filter(Boolean).join(' ')}
                />
              ) : null}
              {data.ownRegistrableDomain !== null ? (
                <DefinitionRow
                  label={strings.prospectDetail.catalogue.ownDomain}
                  value={
                    <a
                      href={`https://${data.ownRegistrableDomain}`}
                      target="_blank"
                      rel="noreferrer"
                      title={strings.prospectDetail.openSite}
                      aria-label={strings.prospectDetail.openSite}
                      className="hover:text-accent-bright"
                    >
                      {data.ownRegistrableDomain}
                    </a>
                  }
                />
              ) : null}
              {data.groupDomain !== null ? (
                <DefinitionRow
                  label={strings.prospectDetail.catalogue.groupId}
                  value={data.groupDomain}
                />
              ) : null}
            </div>
            <div>
              <DefinitionRow
                label={strings.prospectDetail.sections.identity}
                value={vocabularyLabel(
                  strings.labels.identity,
                  data.identityStatus,
                  strings.common.vocabularyFallback,
                )}
              />
              <DefinitionRow
                label={strings.prospects.columns.qualification}
                value={vocabularyLabel(
                  strings.labels.qualification,
                  data.qualificationOutcome,
                  strings.common.vocabularyFallback,
                )}
              />
              <DefinitionRow
                label={strings.prospects.columns.review}
                value={vocabularyLabel(
                  strings.labels.review,
                  data.reviewState,
                  strings.common.vocabularyFallback,
                )}
              />
              <DefinitionRow
                label="candidateId"
                value={<span className="ident">{data.candidateId}</span>}
              />
            </div>
          </div>
        </Card>

        <Card title={strings.prospectDetail.sections.identity}>
          <div className="flex flex-col gap-4">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {strings.prospectDetail.sourcesHeading}
              </h3>
              {data.conflicts.length === 0 ? (
                <p className="text-sm text-ink-muted">{strings.prospectDetail.outcomeNone}</p>
              ) : (
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell className="w-48">
                        {strings.prospectDetail.sources.field}
                      </TableHeaderCell>
                      <TableHeaderCell>{strings.prospectDetail.sources.value}</TableHeaderCell>
                      <TableHeaderCell>{strings.prospectDetail.sources.source}</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.conflicts.map((conflict) => (
                      <TableRow key={`${conflict.kind}:${conflict.detail}`}>
                        <TableCell className="text-xs text-ink-muted">{conflict.kind}</TableCell>
                        <TableCell className="text-ink">{conflict.detail}</TableCell>
                        <TableCell className="text-xs text-ink-soft">
                          {conflict.candidateIds.join(', ')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
            <div>
              <ul className="flex flex-col gap-1">
                {data.sourceRefs.map((ref) => (
                  <li
                    key={`${ref.source}:${ref.sourceId}`}
                    className="font-mono text-xs text-ink-soft"
                  >
                    {ref.source}/{ref.sourceId} ({ref.sourceVersion}) · {ref.ingestRunId}
                  </li>
                ))}
                {data.websites.map((website) => {
                  const href = websiteHref(website.raw);
                  return (
                    <li
                      key={website.raw}
                      className="font-mono text-xs text-ink-soft"
                      title={website.unusableReason ?? undefined}
                    >
                      {href === undefined ? (
                        website.raw
                      ) : (
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          title={strings.prospectDetail.openSite}
                          aria-label={strings.prospectDetail.openSite}
                          className="hover:text-accent-bright"
                        >
                          {website.raw}
                        </a>
                      )}{' '}
                      [{website.kind}
                      {website.registrableDomain !== null ? ` → ${website.registrableDomain}` : ''}]
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </Card>

        <Card title={strings.prospectDetail.sections.qualification}>
          <div className="flex flex-col gap-4">
            {qualification === null ? (
              <p className="text-sm text-ink-muted">{strings.prospectDetail.outcomeNone}</p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={qualificationBadgeTone(qualification.outcome)}>
                  {qualification.outcome}
                </Badge>
                <span className="text-xs text-ink-muted">
                  {strings.prospectDetail.sources.field}: {qualification.qualificationVersion} ·{' '}
                  {formatDateTime(qualification.evaluatedAt, language)}
                </span>
              </div>
            )}
            {qualification !== null && qualification.reasons.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {qualification.reasons.map((reason) => (
                  <li key={reason} className="text-sm font-medium text-ink">
                    {strings.prospectDetail.qualification.reason}: {reason}
                  </li>
                ))}
              </ul>
            ) : null}
            {qualificationEvents.length > 0 ? (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                  {strings.prospectDetail.qualification.events}
                </h3>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell className="w-48">
                        {strings.prospectDetail.thread.lastEventAt}
                      </TableHeaderCell>
                      <TableHeaderCell>
                        {strings.prospectDetail.qualification.outcome}
                      </TableHeaderCell>
                      <TableHeaderCell>
                        {strings.prospectDetail.qualification.reason}
                      </TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {qualificationEvents.map((event) => (
                      <TableRow key={event.qualificationId}>
                        <TableCell className="text-xs text-ink-muted">
                          {formatDateTime(event.evaluatedAt, language)}
                        </TableCell>
                        <TableCell>
                          <Badge tone={qualificationBadgeTone(event.outcome)}>
                            {event.outcome}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-ink-soft">
                          {event.reasons.join(', ')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
          </div>
        </Card>

        {data.contact !== null ? (
          <Card title={strings.prospectDetail.sections.contact}>
            {/* Field values are the store's typed vocabularies mapped to
                operator copy (issue #95), and a field with no value is
                omitted instead of rendering an empty labelled row. The store
                contact view carries no address material, so nothing here can
                leak one. */}
            <div>
              <DefinitionRow
                label={strings.prospectDetail.contact.decision}
                value={vocabularyLabel(
                  strings.labels.contact,
                  data.contact.state,
                  strings.common.vocabularyFallback,
                )}
              />
              <DefinitionRow
                label={strings.prospectDetail.contact.reason}
                value={vocabularyLabel(
                  strings.labels.contactReason,
                  data.contact.reason,
                  strings.common.vocabularyFallback,
                )}
              />
              <DefinitionRow
                label={strings.prospectDetail.contact.mailbox}
                value={vocabularyLabel(
                  strings.labels.mailDomain,
                  data.contact.mxStatus,
                  strings.common.vocabularyFallback,
                )}
              />
              {data.contact.sourceKind !== null ? (
                <DefinitionRow
                  label={strings.prospectDetail.contact.source}
                  value={vocabularyLabel(
                    strings.labels.contactSource,
                    data.contact.sourceKind,
                    strings.common.vocabularyFallback,
                  )}
                />
              ) : null}
              <DefinitionRow
                label={strings.prospectDetail.contact.validatedAt}
                value={formatDateTime(data.contact.validatedAt, language)}
              />
            </div>
          </Card>
        ) : null}

        {data.thread !== null ? (
          <Card title={strings.prospectDetail.sections.thread}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>{strings.prospectDetail.thread.state}</TableHeaderCell>
                  <TableHeaderCell>{strings.prospectDetail.thread.touch}</TableHeaderCell>
                  <TableHeaderCell>{strings.prospectDetail.thread.lastEventAt}</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell className="text-ink">{data.thread.state}</TableCell>
                  <TableCell className="numeric">{data.thread.currentTouch}</TableCell>
                  <TableCell className="text-xs text-ink-muted">
                    {formatDateTime(data.thread.stateEnteredAt, language)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Card>
        ) : null}

        <Card title={strings.prospectDetail.sections.outcome}>
          {data.outcomes.rows.length === 0 ? (
            <p className="text-sm text-ink-muted">{strings.prospectDetail.outcomeNone}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {data.outcomes.rows.map((event) => (
                <li key={event.outcomeId} className="text-sm text-ink">
                  {event.outcome}
                  {event.lostReason !== null ? ` (${event.lostReason})` : ''} · {event.actor} ·{' '}
                  {formatDateTime(event.recordedAt, language)}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <div className="flex flex-wrap items-center gap-2">
            {/* Plan 037: shown only when the server-side plan says the
                scan may start, so the operator never clicks a button the
                worker would have to refuse. */}
            {data.outreachScan.canStart ? (
              <Button
                variant="primary"
                size="sm"
                disabled={scanStarting}
                onClick={() => {
                  void startOutreachScan();
                }}
              >
                {strings.prospectDetail.startOutreachScan}
              </Button>
            ) : null}
            {/* The audit link pre-fills the scan form with the hotel's own
                site; it only exists when the prospect resolved to one. */}
            {data.ownRegistrableDomain !== null ? (
              <Link
                to={`/scans/new?url=${encodeURIComponent(`https://${data.ownRegistrableDomain}`)}`}
                className={buttonStyles('secondary', 'sm')}
              >
                {strings.prospectDetail.launchAudit}
              </Link>
            ) : null}
            {prospectSubPages(data.candidateId).map((page) => {
              const label =
                page.key === 'prescan'
                  ? strings.prospectDetail.openPrescan
                  : page.key === 'score'
                    ? strings.prospectDetail.openScore
                    : page.key === 'evidence'
                      ? strings.prospectDetail.openEvidence
                      : page.key === 'preview'
                        ? strings.prospectDetail.openPreview
                        : strings.prospectDetail.openOutreach;
              return (
                <span key={page.key} className="inline-flex items-center gap-1">
                  <Link to={page.path} className={buttonStyles('secondary', 'sm')}>
                    {label}
                  </Link>
                  <InfoTip label={label} hint={strings.hints[page.key]} />
                </span>
              );
            })}
          </div>
        </Card>
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
