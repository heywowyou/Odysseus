import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { MailQuestion } from 'lucide-react';
import { PageHeader } from '../components/page-header';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { EmptyState } from '../components/ui/empty-state';
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
import { fetchJson, postEmpty } from '../lib/api';
import { formatDateTime, formatRelativeTime } from '../lib/format';
import { usePolling } from '../lib/use-polling';
import { PAGE_SIZE, clampedOffset, pageState } from './outreach-model';
import type { RepliesPage } from './outreach-model';

const POLL_INTERVAL_MS = 5000;
const SKELETON_ROW_COUNT = 8;

export function RepliesPage(): JSX.Element {
  const { strings, language } = useI18n();
  const [offset, setOffset] = useState(0);
  const { data, error, refresh } = usePolling(
    () => fetchJson<RepliesPage>(`/api/outreach/replies?limit=${PAGE_SIZE}&offset=${offset}`),
    POLL_INTERVAL_MS,
    { key: `outreach-replies:${offset}` },
  );
  const [pendingThreadId, setPendingThreadId] = useState<string | null>(null);
  const [actionFailed, setActionFailed] = useState(false);

  useEffect(() => {
    if (data !== undefined && offset !== clampedOffset(data.total, PAGE_SIZE, offset)) {
      setOffset(clampedOffset(data.total, PAGE_SIZE, offset));
    }
  }, [data, offset]);

  const review = async (threadId: string): Promise<void> => {
    setPendingThreadId(threadId);
    setActionFailed(false);
    try {
      await postEmpty(`/api/outreach/replies/${threadId}/review`);
      refresh();
    } catch {
      setActionFailed(true);
    } finally {
      setPendingThreadId(null);
    }
  };

  let body: JSX.Element;
  if (data === undefined && error !== undefined) {
    body = (
      <Card>
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-danger">{strings.common.requestFailed}</p>
          <p className="text-xs text-ink-muted">{error}</p>
          <Button variant="secondary" onClick={refresh}>
            {strings.common.retry}
          </Button>
        </div>
      </Card>
    );
  } else if (data === undefined) {
    body = (
      <Card>
        <div className="flex flex-col gap-2">
          {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      </Card>
    );
  } else if (data.rows.length === 0 && offset === 0) {
    body = <EmptyState icon={MailQuestion} title={strings.replies.empty} />;
  } else {
    const pages = pageState(data.total, PAGE_SIZE, offset);
    body = (
      <>
        {actionFailed ? (
          <p className="mb-3 text-sm text-danger" role="alert">
            {strings.operator.actionError}
          </p>
        ) : null}
        <div className="overflow-hidden rounded-xl border border-line bg-panel">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>{strings.replies.columns.hotel}</TableHeaderCell>
                <TableHeaderCell>{strings.replies.columns.receivedAt}</TableHeaderCell>
                <TableHeaderCell>{strings.replies.columns.state}</TableHeaderCell>
                <TableHeaderCell>{strings.replies.columns.reason}</TableHeaderCell>
                <TableHeaderCell className="w-44">{null}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.rows.map((reply) => (
                <TableRow key={reply.threadId}>
                  <TableCell>
                    <span className="font-medium text-ink">{reply.candidateId}</span>
                    <div className="text-xs text-ink-muted">{reply.domain}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-ink">
                      {formatDateTime(reply.reviewDetectedAt, language)}
                    </div>
                    <div className="text-xs text-ink-muted">
                      {formatRelativeTime(reply.reviewDetectedAt, strings.common.relativeTime)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge tone="neutral">
                      {vocabularyLabel(
                        strings.labels.thread,
                        reply.state,
                        strings.common.vocabularyFallback,
                      )}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-72 text-sm text-ink-soft">
                    {reply.reviewReason}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="secondary"
                      size="sm"
                      isLoading={pendingThreadId === reply.threadId}
                      disabled={pendingThreadId !== null}
                      onClick={() => {
                        void review(reply.threadId);
                      }}
                    >
                      {strings.replies.markReviewed}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {pages.hasPrevious || pages.hasNext ? (
          <nav
            className="mt-4 flex items-center justify-between"
            aria-label={strings.operator.paginationLabel}
          >
            <Button
              variant="secondary"
              size="sm"
              disabled={!pages.hasPrevious}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            >
              {strings.operator.paginationPrevious}
            </Button>
            <span className="text-xs text-ink-muted">
              {strings.operator.paginationPageOf
                .replace('{page}', String(pages.page))
                .replace('{pages}', String(pages.pages))}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={!pages.hasNext}
              onClick={() => setOffset(offset + PAGE_SIZE)}
            >
              {strings.operator.paginationNext}
            </Button>
          </nav>
        ) : null}
      </>
    );
  }

  return (
    <article>
      <PageHeader title={strings.replies.title} description={strings.replies.description} />
      <p
        className="mb-4 rounded-xl border border-line-strong bg-panel px-5 py-4 text-sm text-ink-soft"
        role="note"
      >
        {strings.replies.metadataNote}
      </p>
      {body}
    </article>
  );
}
