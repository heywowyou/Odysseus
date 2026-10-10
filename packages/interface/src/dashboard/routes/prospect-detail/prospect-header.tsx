/** The page header, the lifecycle notices and every confirmation dialog
 *  (issue #532). */

import type { JSX } from 'react';
import { Archive, ArchiveRestore, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';
import { PageHeader } from '../../components/page-header';
import { Badge } from '../../components/ui/badge';
import { ConfirmDialog } from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { archiveImpactSummary, deletionImpactSummary } from '../prospect-hub-model';
import { archiveConfirmDescription } from '../prospect-hub-detail-model';
import { label, permanentDeleteDescription } from './types';
import type { ProspectDetailShared } from './shared';
import type { LifecycleActions } from './use-lifecycle-actions';
import type { OutreachActions } from './use-outreach-actions';

export function ProspectHeader(props: {
  shared: ProspectDetailShared;
  lifecycle: LifecycleActions;
  outreach: OutreachActions;
  returnTo: string;
}): JSX.Element {
  const { prospect, copy, strings, formatDate, audits, terminal, archived } = props.shared;
  const {
    lifecycleBusy,
    deletionImpact,
    setDeletionImpact,
    archiveImpact,
    setArchiveImpact,
    lifecycleNotice,
    restore,
    requestArchive,
    archive,
    deletePermanently,
  } = props.lifecycle;
  const {
    pendingOutcome,
    setPendingOutcome,
    pendingTerminalStatus,
    setPendingTerminalStatus,
    recordOutcome,
    changeStatus,
  } = props.outreach;
  const { returnTo } = props;
  return (
    <>
      <PageHeader
        eyebrow={
          <Link className="inline-flex items-center gap-1 hover:underline" to={returnTo}>
            <ArrowLeft className="size-3" aria-hidden="true" />
            {copy.back}
          </Link>
        }
        title={prospect.name}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {archived ? <Badge tone="neutral">{copy.archivedBadge}</Badge> : null}
            <Badge tone={terminal ? 'neutral' : 'accent'}>
              {label(prospect.status, copy.statusLabels)}
            </Badge>
            {archived ? (
              <Button size="sm" isLoading={lifecycleBusy} onClick={() => void restore()}>
                <ArchiveRestore className="size-4" aria-hidden="true" />
                {copy.restore}
              </Button>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                isLoading={lifecycleBusy}
                onClick={() => void requestArchive()}
              >
                <Archive className="size-4" aria-hidden="true" />
                {copy.archive}
              </Button>
            )}
          </div>
        }
      />
      {archived ? (
        <p className="mb-5 rounded-lg border border-line bg-raised px-4 py-3 text-sm text-ink-soft">
          {copy.archivedNotice.replace('{date}', formatDate(prospect.archivedAt!))}
        </p>
      ) : null}
      {lifecycleNotice ? (
        <p
          role="status"
          className="mb-5 rounded-lg border border-line bg-raised px-4 py-3 text-sm text-ink"
        >
          {lifecycleNotice}
        </p>
      ) : null}
      {/* Issue #560: a slimmed delivered audit is kept, not pending deletion. */}
      {archived && audits.some((audit) => audit.retention?.slimmedAt === undefined) ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-raised px-4 py-3 text-sm text-ink-soft">
          <p>{copy.archiveCleanupPending}</p>
          <Button
            size="sm"
            variant="secondary"
            isLoading={lifecycleBusy}
            onClick={() => void archive()}
          >
            {copy.finishArchiveCleanup}
          </Button>
        </div>
      ) : null}
      {pendingOutcome !== null ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setPendingOutcome(null);
          }}
          title={copy.confirmSensitiveOutcomeTitle}
          description={copy.confirmSensitiveOutcomeDescription}
          confirmLabel={copy.outcomeLabels[pendingOutcome.outcome] ?? copy.outcome}
          cancelLabel={strings.common.cancel}
          onConfirm={() => recordOutcome(pendingOutcome)}
        />
      ) : null}
      {pendingTerminalStatus !== null ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setPendingTerminalStatus(null);
          }}
          title={copy.confirmTerminalStatusTitle}
          description={copy.confirmTerminalStatusDescription}
          confirmLabel={copy.statusLabels[pendingTerminalStatus] ?? copy.statusCorrection}
          cancelLabel={strings.common.cancel}
          onConfirm={() => changeStatus(pendingTerminalStatus)}
        />
      ) : null}
      {archiveImpact !== null ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setArchiveImpact(null);
          }}
          title={copy.archiveTitle}
          description={archiveConfirmDescription(
            archiveImpactSummary(archiveImpact, copy.deletionImpactLabels),
            copy,
          )}
          confirmLabel={copy.archive}
          cancelLabel={strings.common.cancel}
          onConfirm={archive}
        />
      ) : null}
      {deletionImpact !== null ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setDeletionImpact(null);
          }}
          title={copy.deletePermanentlyTitle}
          description={permanentDeleteDescription(
            deletionImpactSummary(deletionImpact, copy.deletionImpactLabels),
            copy,
          )}
          confirmLabel={copy.deletePermanently}
          cancelLabel={strings.common.cancel}
          onConfirm={deletePermanently}
        />
      ) : null}
    </>
  );
}
