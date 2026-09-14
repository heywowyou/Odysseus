import { useState } from 'react';
import type { JSX } from 'react';
import { Badge } from '../components/ui/badge';
import type { BadgeTone } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { CopyButton } from '../components/ui/copy-button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '../components/ui/dialog';
import { Skeleton } from '../components/ui/skeleton';
import { useI18n } from '../i18n/provider';
import { vocabularyLabel } from '../lib/vocabulary';
import { fetchJson, postEmpty, sendJson } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { canGenerateFollowUp } from './prospects-model';
import type { ProspectDetailResponse, ProspectHubActionability } from './prospects-model';
import type { OutreachDraftText } from './outreach-model';

type ThreadDraft = NonNullable<ProspectDetailResponse['thread']>['drafts'][number];

const STATE_TONES: Record<string, BadgeTone> = {
  'e1-drafted': 'accent',
  'e1-sent': 'accent',
  'e2-drafted': 'accent',
  'e2-sent': 'accent',
  'e3-drafted': 'accent',
  'e3-sent': 'accent',
  closed: 'neutral',
};

/** The hub's fifth section: the thread's state, this hotel's drafts with
 *  their text and their approve/skip review, the first email, and the due
 *  follow-up (approved IA, section 5). Draft metadata comes from the
 *  composed detail's thread view; the text is fetched when its dialog
 *  opens, the same lazy pattern as the drafts queue. */
export function HubEmailsSection(props: {
  thread: ProspectDetailResponse['thread'];
  isBusy: boolean;
  onFirstEmail: () => void;
  onFollowUp: () => void;
  refresh: () => void;
  firstEmailAction?: ProspectHubActionability | undefined;
  firstEmailBlockedReason?: string | null | undefined;
  followUpAction?: ProspectHubActionability | undefined;
}): JSX.Element {
  const {
    thread,
    isBusy,
    onFirstEmail,
    onFollowUp,
    refresh,
    firstEmailAction,
    firstEmailBlockedReason: serverBlockedReason,
    followUpAction,
  } = props;
  const { strings, language } = useI18n();
  const [isMarkingReviewed, setIsMarkingReviewed] = useState(false);

  // Issue #186: recording an outcome does not clear the reply's
  // needsReview flag (only reconcile-mailbox's own sync does), so this is
  // the dashboard's only caller of the review endpoint that exists
  // specifically to clear it.
  const markReviewed = async (threadId: string): Promise<void> => {
    setIsMarkingReviewed(true);
    try {
      await postEmpty(`/api/outreach/replies/${encodeURIComponent(threadId)}/review`);
      refresh();
    } finally {
      setIsMarkingReviewed(false);
    }
  };

  const createdDrafts = thread?.drafts.filter((draft) => draft.status === 'created') ?? [];
  const locallyCanStartFirstEmail =
    (thread === null || thread.state === 'open') && createdDrafts.length === 0;
  const canStartFirstEmail =
    firstEmailAction === undefined
      ? locallyCanStartFirstEmail
      : firstEmailAction.state === 'available';
  const canFollowUp =
    followUpAction === undefined
      ? thread !== null && canGenerateFollowUp(thread.state)
      : followUpAction.state === 'available';
  // Plan 045 section 2.5: greyed with a reason instead of hidden, so the
  // operator sees why the first-email action is absent rather than a gap.
  const firstEmailBlockedReason =
    serverBlockedReason ??
    (canStartFirstEmail || canFollowUp
      ? null
      : thread !== null && thread.state !== 'open'
        ? strings.hub.emails.firstEmailBlockedThreadStarted
        : createdDrafts.length > 0
          ? strings.hub.emails.firstEmailBlockedPendingDraft
          : null);

  const touchName = (touch: number): string =>
    touch <= 1
      ? strings.hub.emails.firstEmailName
      : strings.hub.emails.followUpName.replace('{n}', String(touch - 1));

  return (
    <Card title={strings.hub.steps.emails} description={strings.outreachThread.description}>
      {thread !== null ? (
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={STATE_TONES[thread.state] ?? 'neutral'}>
            {vocabularyLabel(
              strings.labels.thread,
              thread.state,
              strings.common.vocabularyFallback,
            )}
          </Badge>
          <span className="text-xs text-ink-muted">
            {strings.outreachThread.touchLabel} {thread.currentTouch} ·{' '}
            {formatDateTime(thread.stateEnteredAt, language)}
          </span>
        </div>
      ) : null}

      {thread?.needsReview != null ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <p className="text-sm text-ink-soft" role="status">
            {strings.hub.emails.needsReviewNotice}
          </p>
          <Button
            variant="secondary"
            size="sm"
            isLoading={isMarkingReviewed}
            disabled={isMarkingReviewed}
            onClick={() => {
              void markReviewed(thread.threadId);
            }}
          >
            {strings.hub.emails.markReviewed}
          </Button>
        </div>
      ) : null}

      {createdDrafts.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">{strings.hub.emails.noPendingDraft}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {createdDrafts.map((draft) => (
            <DraftReviewRow
              key={draft.draftId}
              draft={draft}
              name={touchName(draft.touch)}
              refresh={refresh}
            />
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        {canStartFirstEmail || firstEmailBlockedReason !== null ? (
          <Button
            size="sm"
            isLoading={isBusy}
            disabled={isBusy || !canStartFirstEmail}
            onClick={onFirstEmail}
          >
            {strings.outreachThread.generateFirstEmail}
          </Button>
        ) : null}
        {canFollowUp ? (
          <Button size="sm" isLoading={isBusy} disabled={isBusy} onClick={onFollowUp}>
            {strings.outreachThread.generateFollowUp}
          </Button>
        ) : null}
      </div>
      {firstEmailBlockedReason !== null ? (
        <p className="mt-2 text-sm text-ink-soft" role="note">
          {firstEmailBlockedReason}
        </p>
      ) : null}
    </Card>
  );
}

/** One created draft: its touch name and date, and a review dialog that
 *  shows the persisted text with the approve and skip actions inside, so
 *  a review costs two clicks on this page (approved IA flow table). The
 *  dialog stays read-only about the text itself: no edit, no send. */
function DraftReviewRow(props: {
  draft: ThreadDraft;
  name: string;
  refresh: () => void;
}): JSX.Element {
  const { draft, name, refresh } = props;
  const { strings, language } = useI18n();
  const copy = strings.drafts;
  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState<OutreachDraftText | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionFailed, setActionFailed] = useState(false);

  // Fetched on open, like the drafts queue's dialog: bodies are bulky and
  // the thread view stays metadata-only on purpose.
  const loadText = async (): Promise<void> => {
    setIsLoading(true);
    setLoadFailed(false);
    try {
      setText(
        await fetchJson<OutreachDraftText>(
          `/api/outreach/drafts/${encodeURIComponent(draft.draftId)}/text`,
        ),
      );
    } catch {
      setLoadFailed(true);
    } finally {
      setIsLoading(false);
    }
  };

  const review = async (action: 'approve' | 'skip'): Promise<void> => {
    setIsSubmitting(true);
    setActionFailed(false);
    try {
      await sendJson(`/api/outreach/drafts/${encodeURIComponent(draft.draftId)}/review`, 'POST', {
        action,
      });
      setIsOpen(false);
      refresh();
    } catch {
      setActionFailed(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-raised px-3 py-2">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-sm font-medium text-ink">{name}</span>
        <span className="text-xs text-ink-muted">{formatDateTime(draft.createdAt, language)}</span>
        {draft.hasProviderDraft ? (
          // Plan 040 slice 7: the provider's own name, not its raw code.
          <Badge tone="neutral">{strings.hub.emails.providerDraft}</Badge>
        ) : null}
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => {
          setIsOpen(true);
        }}
      >
        {copy.viewText}
      </Button>
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);
          if (open && text === null && !isLoading) {
            void loadText();
          }
        }}
      >
        <DialogContent>
          <DialogTitle>{text?.businessName ?? name}</DialogTitle>
          <DialogDescription>{copy.textDialogDescription}</DialogDescription>
          {actionFailed ? (
            <p className="text-sm text-danger" role="alert">
              {strings.outreachThread.actionError}
            </p>
          ) : null}
          <div className="mt-4 flex flex-col gap-4">
            {isLoading ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : loadFailed || text === null ? (
              <div className="flex flex-col items-start gap-3">
                <p className="text-sm text-danger">{strings.common.requestFailed}</p>
                <Button
                  variant="secondary"
                  onClick={() => {
                    void loadText();
                  }}
                >
                  {strings.common.retry}
                </Button>
              </div>
            ) : (
              <>
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-ink">{copy.textSubjectLabel}</span>
                    <CopyButton
                      text={text.subject}
                      label={copy.copyButton}
                      copiedLabel={copy.copiedLabel}
                    />
                  </div>
                  <p className="mt-1 break-words rounded-lg border border-line bg-panel p-3 text-sm text-ink">
                    {text.subject}
                  </p>
                </div>
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium text-ink">{copy.textBodyLabel}</span>
                    <CopyButton
                      text={text.body}
                      label={copy.copyButton}
                      copiedLabel={copy.copiedLabel}
                    />
                  </div>
                  <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-panel p-3 font-sans text-sm text-ink">
                    {text.body}
                  </pre>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              size="sm"
              isLoading={isSubmitting}
              disabled={isSubmitting}
              onClick={() => {
                void review('skip');
              }}
            >
              {copy.skip}
            </Button>
            <Button
              size="sm"
              isLoading={isSubmitting}
              disabled={isSubmitting}
              onClick={() => {
                void review('approve');
              }}
            >
              {copy.approve}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}
