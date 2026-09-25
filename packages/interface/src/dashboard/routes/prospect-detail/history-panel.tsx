/** Every audit, preview and event of the prospect (issue #532). */

import type { JSX } from 'react';
import { ExternalLink, History } from 'lucide-react';
import { Link } from 'react-router';
import { Card } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { eventLabelKey } from './types';
import type { ProspectDetailShared } from './shared';
import type { OutreachActions } from './use-outreach-actions';
import type { AuditActions } from './use-audit-actions';

export function HistoryPanel(props: {
  shared: ProspectDetailShared;
  outreach: OutreachActions;
  auditActions: AuditActions;
}): JSX.Element {
  const { prospect, copy, strings, formatDate, actorLabel, outreachBusy, audits, previews } =
    props.shared;
  const { revokePreview } = props.outreach;
  const { detachAudit } = props.auditActions;
  return (
    <Card
      id="history"
      title={copy.history}
      actions={<History className="size-4 text-ink-muted" aria-hidden="true" />}
    >
      <details>
        <summary className="cursor-pointer text-sm font-medium text-ink">
          {copy.fullHistory}
        </summary>
        <div className="mt-4 grid gap-4">
          <div>
            <p className="mb-2 text-xs text-ink-muted">{copy.websites}</p>
            {audits.length > 0 ? (
              <div className="grid gap-2">
                {audits.map((audit) => (
                  <div
                    key={audit.auditId}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm"
                  >
                    <Link
                      className="min-w-0 hover:underline"
                      to={`/audits/${encodeURIComponent(audit.auditId)}`}
                    >
                      <span className="font-medium">
                        {copy.auditKindLabels[audit.kind] ?? strings.common.vocabularyFallback}
                      </span>
                      <span className="ml-2 text-ink-muted">{audit.siteUrl}</span>
                    </Link>
                    <span className="flex items-center gap-2">
                      <span className="text-xs text-ink-muted">{formatDate(audit.startedAt)}</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={outreachBusy !== null}
                        isLoading={outreachBusy === `detach-${audit.auditId}`}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void detachAudit(audit.auditId);
                        }}
                      >
                        {copy.detachAudit}
                      </Button>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-muted">{copy.notProvided}</p>
            )}
          </div>
          <div>
            <p className="mb-2 text-xs text-ink-muted">{copy.preview}</p>
            {previews.length > 0 ? (
              <div className="grid gap-2">
                {previews.map((preview) => (
                  <div
                    key={preview.previewId}
                    className="rounded-lg border border-line px-3 py-2 text-sm"
                  >
                    <span className="font-medium">
                      {copy.previewStatusLabels[preview.status] ??
                        strings.common.vocabularyFallback}
                    </span>
                    <span className="ml-2 text-xs text-ink-muted">
                      {formatDate(preview.publishedAt)}
                    </span>
                    {preview.status === 'live' ? (
                      <span className="ml-2 text-xs text-ink-muted">
                        {copy.previewExpires.replace('{date}', formatDate(preview.publicExpiresAt))}
                      </span>
                    ) : null}
                    <span className="mt-1 flex flex-wrap items-center gap-2">
                      {preview.url !== undefined && preview.status === 'live' ? (
                        <a
                          className="inline-flex items-center gap-1 text-xs text-ink hover:underline"
                          href={preview.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {copy.openPreview}
                          <ExternalLink className="size-3" aria-hidden="true" />
                        </a>
                      ) : null}
                      {preview.status === 'live' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={outreachBusy !== null}
                          isLoading={outreachBusy === `revoke-${preview.previewId}`}
                          onClick={() => void revokePreview(preview.previewId)}
                        >
                          {copy.revokePreview}
                        </Button>
                      ) : null}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-muted">{copy.notProvided}</p>
            )}
          </div>
          <div>
            <p className="mb-2 text-xs text-ink-muted">{copy.recentActivity}</p>
            {prospect.events.length > 0 ? (
              <ol className="space-y-3">
                {prospect.events.map((event) => (
                  <li key={event.eventId} className="border-l-2 border-line pl-3 text-sm">
                    <p className="font-medium">
                      {copy.eventLabels[eventLabelKey(event)] ?? strings.common.vocabularyFallback}
                    </p>
                    <p className="text-xs text-ink-muted">
                      {formatDate(event.at)} · {actorLabel(event.actor)}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-ink-muted">{copy.noEvents}</p>
            )}
          </div>
        </div>
      </details>
    </Card>
  );
}
