import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { FileText } from 'lucide-react';
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
import { fetchJson, sendJson } from '../lib/api';
import { formatDateTime, formatRelativeTime } from '../lib/format';
import { usePolling } from '../lib/use-polling';
import { PAGE_SIZE, clampedOffset, pageState } from './outreach-model';
import type { OutreachDraftRow, OutreachDraftsPage } from './outreach-model';

const POLL_INTERVAL_MS = 5000;
const SKELETON_ROW_COUNT = 8;

export function DraftsPage(): JSX.Element {
  const { strings, language } = useI18n();
  const [offset, setOffset] = useState(0);
  const { data, error, lastUpdatedAt, refresh } = usePolling(
    () => fetchJson<OutreachDraftsPage>(`/api/outreach/drafts?limit=${PAGE_SIZE}&offset=${offset}`),
    POLL_INTERVAL_MS,
    { key: `outreach-drafts:${offset}` },
  );
  const [pendingDraftId, setPendingDraftId] = useState<string | null>(null);
  const [actionFailed, setActionFailed] = useState(false);

  // An action on the last row of the last page shrinks the list; step the
  // window back instead of showing a phantom empty page.
  useEffect(() => {
    if (data !== undefined && offset !== clampedOffset(data.total, PAGE_SIZE, offset)) {
      setOffset(clampedOffset(data.total, PAGE_SIZE, offset));
    }
  }, [data, offset]);

  const review = async (draftId: string, action: 'approve' | 'skip'): Promise<void> => {
    setPendingDraftId(draftId);
    setActionFailed(false);
    try {
      await sendJson(`/api/outreach/drafts/${draftId}/review`, 'POST', { action });
      refresh();
    } catch {
      setActionFailed(true);
    } finally {
      setPendingDraftId(null);
    }
  };

  let body: JSX.Element;
  if (data === undefined && error !== undefined) {
    body = (
      <Card>
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-danger">{error}</p>
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
    body = <EmptyState icon={FileText} title={strings.drafts.empty} />;
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
                <TableHeaderCell>{strings.drafts.columns.hotel}</TableHeaderCell>
                <TableHeaderCell className="w-20">{strings.drafts.columns.touch}</TableHeaderCell>
                <TableHeaderCell>{strings.drafts.columns.createdAt}</TableHeaderCell>
                <TableHeaderCell>{strings.drafts.columns.providerState}</TableHeaderCell>
                <TableHeaderCell>{strings.drafts.columns.reviewState}</TableHeaderCell>
                <TableHeaderCell className="w-52">{null}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.rows.map((draft: OutreachDraftRow) => (
                <TableRow key={draft.draftId}>
                  <TableCell>
                    <span className="font-medium text-ink">{draft.candidateId}</span>
                    <span className="ml-2 text-xs uppercase text-ink-muted">{draft.language}</span>
                  </TableCell>
                  <TableCell>{draft.touch}</TableCell>
                  <TableCell>
                    <div className="text-ink">{formatDateTime(draft.createdAt, language)}</div>
                    <div className="text-xs text-ink-muted">
                      {formatRelativeTime(draft.createdAt, strings.common.relativeTime)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge tone={draft.hasProviderDraft ? 'neutral' : 'serious'}>
                      {draft.hasProviderDraft ? 'gmail' : '-'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge tone="accent">{strings.labels.review.pending}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        isLoading={pendingDraftId === draft.draftId}
                        disabled={pendingDraftId !== null}
                        onClick={() => {
                          void review(draft.draftId, 'approve');
                        }}
                      >
                        {strings.drafts.approve}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pendingDraftId !== null}
                        onClick={() => {
                          void review(draft.draftId, 'skip');
                        }}
                      >
                        {strings.drafts.skip}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {pages.hasPrevious || pages.hasNext ? (
          <nav className="mt-4 flex items-center justify-between" aria-label="pagination">
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
        {lastUpdatedAt !== undefined ? (
          <p className="mt-3 text-right text-xs text-ink-muted">
            {strings.audits.updatedAt.replace(
              '{time}',
              formatDateTime(new Date(lastUpdatedAt), language),
            )}
          </p>
        ) : null}
      </>
    );
  }

  return (
    <article>
      <PageHeader title={strings.drafts.title} description={strings.drafts.description} />
      <p
        className="mb-4 rounded-xl border border-line-strong bg-panel px-5 py-4 text-sm font-medium text-ink"
        role="note"
      >
        {strings.drafts.neverSendNote}
      </p>
      {body}
    </article>
  );
}
