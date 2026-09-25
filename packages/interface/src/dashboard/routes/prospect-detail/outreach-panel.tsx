/** Audit state, outreach language, the thread, its drafts and the live
 *  preview (issue #532). */

import type { JSX } from 'react';
import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router';
import { Card } from '../../components/ui/card';
import { Select } from '../../components/ui/select';
import { Button, buttonStyles } from '../../components/ui/button';
import { scanAgeLabel } from '../prospect-hub-detail-model';
import { daysSince } from './types';
import type { ProspectDetailShared } from './shared';
import type { OutreachActions } from './use-outreach-actions';

export function OutreachPanel(props: {
  shared: ProspectDetailShared;
  outreach: OutreachActions;
}): JSX.Element {
  const {
    prospect,
    copy,
    strings,
    formatDate,
    saving,
    outreachBusy,
    outreachNotice,
    livePreview,
    livePreviewUrl,
    drafts,
    work,
    auditStateLabel,
    qualifyingAudit,
    outreachLanguage,
  } = props.shared;
  const { discardDraft, revokePreview, copyPreviewLink, changeOutreachLanguage } = props.outreach;
  return (
    <Card id="emails" title={copy.outreach}>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <p className="text-sm font-medium">
            {copy.auditState.replace('{state}', auditStateLabel)}
          </p>
        </div>
        <div>
          <p className="text-xs text-ink-muted">{copy.site}</p>
          {qualifyingAudit ? (
            <>
              <Link
                className="mt-1 block font-medium text-ink hover:underline"
                to={`/audits/${encodeURIComponent(qualifyingAudit.auditId)}`}
              >
                {copy.auditKindLabels[qualifyingAudit.scanIntent ?? qualifyingAudit.kind] ??
                  strings.common.vocabularyFallback}
              </Link>
              <p className="mt-1 text-xs text-ink-muted">
                {copy.scanDate
                  .replace('{date}', formatDate(qualifyingAudit.startedAt))
                  .replace('{age}', scanAgeLabel(daysSince(qualifyingAudit.startedAt), copy))}
              </p>
              {qualifyingAudit.auditId === work?.qualifyingAuditId &&
              work.dataVersionState === 'older' ? (
                <p className="mt-1 text-xs text-ink-muted">{copy.olderDataVersion}</p>
              ) : null}
            </>
          ) : (
            <p className="mt-1 text-ink-muted">{copy.noPrimarySiteAudit}</p>
          )}
        </div>
      </div>
      <label className="mt-4 grid max-w-xs gap-1 border-t border-line pt-4 text-sm">
        <span className="text-xs text-ink-muted">{copy.outreachLanguage}</span>
        <Select
          value={outreachLanguage}
          disabled={
            saving ||
            drafts.some(
              (draft) => draft.status === 'created' || draft.status === 'mailbox-delete-pending',
            )
          }
          onChange={(event) => void changeOutreachLanguage(event.target.value)}
        >
          <option value="fr">{copy.languageLabels.fr}</option>
          <option value="en">{copy.languageLabels.en}</option>
        </Select>
        <span className="text-xs text-ink-muted">{copy.outreachLanguageHint}</span>
      </label>
      <div className="mt-4 border-t border-line pt-4">
        <p className="text-xs text-ink-muted">{copy.threadState}</p>
        {prospect.thread ? (
          <p className="mt-1 text-sm">
            {strings.labels.thread[prospect.thread.state as keyof typeof strings.labels.thread] ??
              strings.common.vocabularyFallback}
            <span className="ml-2 text-xs text-ink-muted">
              {formatDate(prospect.thread.updatedAt)}
            </span>
          </p>
        ) : (
          <p className="mt-1 text-sm text-ink-muted">{copy.noThread}</p>
        )}
        {drafts.length > 0 ? (
          <ul className="mt-3 grid gap-2">
            {drafts.slice(0, 3).map((draft) => (
              <li key={draft.draftId} className="rounded-lg border border-line px-3 py-2 text-sm">
                <p className="font-medium">
                  {copy.draftLabel.replace('{touch}', String(draft.touch))}
                </p>
                <p>{draft.subject}</p>
                <p className="text-xs text-ink-muted">
                  {copy.draftCreated.replace('{date}', formatDate(draft.createdAt))}
                </p>
                <dl className="mt-2 grid gap-1 text-xs">
                  <div className="flex gap-2">
                    <dt className="text-ink-muted">{copy.draftRecipient}</dt>
                    <dd className="break-all">{draft.recipient ?? copy.notProvided}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-ink-muted">{copy.outreachLanguage}</dt>
                    <dd>
                      {draft.language === undefined
                        ? copy.notProvided
                        : copy.languageLabels[draft.language]}
                    </dd>
                  </div>
                </dl>
                {draft.status === 'mailbox-delete-pending' ? (
                  <p
                    role="status"
                    className="mt-2 rounded bg-raised px-2 py-1 text-xs text-ink-soft"
                  >
                    {copy.draftMailboxDeletePending}
                  </p>
                ) : null}
                {draft.body && draft.status !== 'mailbox-delete-pending' ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-medium">
                      {copy.draftBody}
                    </summary>
                    <pre className="mt-1 whitespace-pre-wrap break-words font-sans text-sm">
                      {draft.body}
                    </pre>
                  </details>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  {draft.previewUrl ? (
                    <a
                      className={buttonStyles('secondary', 'sm')}
                      href={draft.previewUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {copy.openPreview}
                      <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                  ) : null}
                  {draft.referenceAuditUrl ? (
                    <a
                      className={buttonStyles('secondary', 'sm')}
                      href={draft.referenceAuditUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {copy.openReferenceAudit}
                      <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                  ) : null}
                  {draft.mailboxUrl && draft.status === 'created' ? (
                    <a
                      className={buttonStyles('secondary', 'sm')}
                      href={draft.mailboxUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {copy.openInMailbox}
                      <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                  ) : null}
                  {draft.status === 'created' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={outreachBusy !== null}
                      isLoading={outreachBusy === `discard-${draft.draftId}`}
                      onClick={() => void discardDraft(draft.draftId)}
                    >
                      {copy.discardDraft}
                    </Button>
                  ) : null}
                </div>
                {draft.referenceAuditRequestCount !== undefined &&
                draft.referenceAuditRequestCount > 0 ? (
                  <p className="mt-2 text-xs text-ink-muted">
                    {copy.referenceAuditRequestSignal.replace(
                      '{count}',
                      String(draft.referenceAuditRequestCount),
                    )}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-ink-muted">{copy.noDraft}</p>
        )}
      </div>
      {livePreview !== undefined ? (
        <div className="mt-3 rounded-lg border border-line px-3 py-2 text-sm">
          <p className="text-xs text-ink-muted">
            {copy.previewLink}{' '}
            {copy.previewExpires.replace('{date}', formatDate(livePreview.publicExpiresAt))}
          </p>
          {livePreviewUrl !== null ? (
            <a
              className="break-all text-ink hover:underline"
              href={livePreviewUrl}
              target="_blank"
              rel="noreferrer"
            >
              {livePreviewUrl}
            </a>
          ) : (
            <p className="text-xs text-ink-muted">{copy.previewLinkUnavailable}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {livePreviewUrl !== null ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void copyPreviewLink(livePreviewUrl)}
              >
                {copy.copyPreviewLink}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              disabled={outreachBusy !== null}
              isLoading={outreachBusy === `revoke-${livePreview.previewId}`}
              onClick={() => void revokePreview(livePreview.previewId)}
            >
              {copy.revokePreview}
            </Button>
          </div>
        </div>
      ) : null}
      {outreachNotice ? (
        <p className="mt-3 text-sm text-ink-muted" role="status">
          {outreachNotice}
        </p>
      ) : null}
    </Card>
  );
}
