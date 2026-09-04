import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { FileText } from 'lucide-react';
import { PAGE_WIDTH, PageHeader } from '../components/page-header';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '../components/ui/dialog';
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
import type { OutreachDraftRow, OutreachDraftsPage, OutreachDraftText } from './outreach-model';

const POLL_INTERVAL_MS = 5000;
const SKELETON_ROW_COUNT = 8;

/** Copies one text field and flips to the copied label for a moment. The
 *  clipboard can refuse (permissions, insecure context); the button then
 *  stays usable and quiet, because the text is still on screen to select. */
function CopyButton(props: { text: string; label: string; copiedLabel: string }): JSX.Element {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => {
        void navigator.clipboard
          .writeText(props.text)
          .then(() => {
            setCopied(true);
            window.setTimeout(() => {
              setCopied(false);
            }, 2000);
          })
          .catch(() => {});
      }}
    >
      {copied ? props.copiedLabel : props.label}
    </Button>
  );
}

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

  // Issue #15: read-only view of the draft's persisted text. Strictly a
  // read plus a clipboard copy: the dialog has no send, edit, or review
  // action, matching the page's stated rule that sending stays a manual
  // Gmail act.
  const [textDraft, setTextDraft] = useState<OutreachDraftRow | null>(null);
  const [draftText, setDraftText] = useState<OutreachDraftText | null>(null);
  const [textLoading, setTextLoading] = useState(false);
  const [textError, setTextError] = useState(false);
  const [textRetryNonce, setTextRetryNonce] = useState(0);

  // An action on the last row of the last page shrinks the list; step the
  // window back instead of showing a phantom empty page.
  useEffect(() => {
    if (data !== undefined && offset !== clampedOffset(data.total, PAGE_SIZE, offset)) {
      setOffset(clampedOffset(data.total, PAGE_SIZE, offset));
    }
  }, [data, offset]);

  // Fetched on open, not with the list: bodies are bulky and the list stays
  // metadata-only on purpose. The stale flag keeps a slow response for one
  // draft from landing in a dialog the operator has since re-pointed.
  useEffect(() => {
    if (textDraft === null) return;
    let stale = false;
    setTextLoading(true);
    setTextError(false);
    setDraftText(null);
    fetchJson<OutreachDraftText>(`/api/outreach/drafts/${textDraft.draftId}/text`)
      .then((text) => {
        if (!stale) setDraftText(text);
      })
      .catch(() => {
        if (!stale) setTextError(true);
      })
      .finally(() => {
        if (!stale) setTextLoading(false);
      });
    return () => {
      stale = true;
    };
  }, [textDraft, textRetryNonce]);

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
                <TableHeaderCell>{strings.drafts.columns.prospect}</TableHeaderCell>
                <TableHeaderCell className="w-20">{strings.drafts.columns.touch}</TableHeaderCell>
                <TableHeaderCell>{strings.drafts.columns.createdAt}</TableHeaderCell>
                <TableHeaderCell>{strings.drafts.columns.providerState}</TableHeaderCell>
                <TableHeaderCell>{strings.drafts.columns.reviewState}</TableHeaderCell>
                <TableHeaderCell className="w-64">{null}</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.rows.map((draft: OutreachDraftRow) => (
                <TableRow key={draft.draftId}>
                  <TableCell>
                    <span className="ident text-ink">{draft.candidateId}</span>
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
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setTextDraft(draft);
                        }}
                      >
                        {strings.drafts.viewText}
                      </Button>
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
    <article className={PAGE_WIDTH.surface}>
      <PageHeader title={strings.drafts.title} description={strings.drafts.description} />
      <p
        className="mb-4 rounded-xl border border-line-strong bg-panel px-5 py-4 text-sm font-medium text-ink"
        role="note"
      >
        {strings.drafts.neverSendNote}
      </p>
      {body}
      <Dialog
        open={textDraft !== null}
        onOpenChange={(open) => {
          if (!open) setTextDraft(null);
        }}
      >
        <DialogContent>
          <DialogTitle>
            {draftText?.businessName ?? textDraft?.candidateId ?? strings.drafts.title}
          </DialogTitle>
          <DialogDescription>{strings.drafts.textDialogDescription}</DialogDescription>
          <div className="mt-4 flex flex-col gap-4">
            {textLoading ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : textError ? (
              <div className="flex flex-col items-start gap-3">
                <p className="text-sm text-danger">{strings.common.requestFailed}</p>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setTextRetryNonce((nonce) => nonce + 1);
                  }}
                >
                  {strings.common.retry}
                </Button>
              </div>
            ) : draftText !== null ? (
              <>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  <span className="text-ink-muted">
                    {strings.drafts.textRecipientLabel}{' '}
                    <span className="ident text-ink">{draftText.recipient}</span>
                  </span>
                  <span className="text-ink-muted">
                    {strings.drafts.columns.touch}{' '}
                    <span className="text-ink">{draftText.touch}</span>
                  </span>
                  <span className="text-xs uppercase text-ink-muted">{draftText.language}</span>
                  <span className="text-ink-muted">
                    {strings.drafts.columns.createdAt}{' '}
                    <span className="text-ink">
                      {formatDateTime(new Date(draftText.createdAt), language)}
                    </span>
                  </span>
                </div>
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-ink">
                      {strings.drafts.textSubjectLabel}
                    </span>
                    <CopyButton
                      text={draftText.subject}
                      label={strings.drafts.copyButton}
                      copiedLabel={strings.drafts.copiedLabel}
                    />
                  </div>
                  <p className="mt-1 break-words rounded-lg border border-line bg-panel p-3 text-sm text-ink">
                    {draftText.subject}
                  </p>
                </div>
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-ink">
                      {strings.drafts.textBodyLabel}
                    </span>
                    <CopyButton
                      text={draftText.body}
                      label={strings.drafts.copyButton}
                      copiedLabel={strings.drafts.copiedLabel}
                    />
                  </div>
                  <p className="mt-1 max-h-72 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-panel p-3 text-sm text-ink">
                    {draftText.body}
                  </p>
                </div>
              </>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setTextDraft(null);
              }}
            >
              {strings.common.cancel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}
