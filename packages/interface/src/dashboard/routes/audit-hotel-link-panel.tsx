/** Attach/detach control for an audit's prospect relationship. */

import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { useI18n } from '../i18n/provider';
import { fetchJson, sendJson } from '../lib/api';
import type { AuditProspectResponse } from './audit-detail-types';

interface ProspectSearchRow {
  prospectId: string;
  name: string;
  commune?: string;
  postcode?: string;
}

function useProspectSearch(query: string): {
  rows: ProspectSearchRow[];
  isLoading: boolean;
} {
  const [rows, setRows] = useState<ProspectSearchRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === '') {
      setRows([]);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    const timer = window.setTimeout(() => {
      void fetchJson<{ rows: ProspectSearchRow[] }>(
        `/api/prospects?q=${encodeURIComponent(trimmed)}&page=1&pageSize=5`,
      )
        .then((result) => {
          if (!cancelled) setRows(result.rows);
        })
        .catch(() => {
          if (!cancelled) setRows([]);
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  return { rows, isLoading };
}

function AttachDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (prospectId: string) => void;
}): JSX.Element {
  const { strings } = useI18n();
  const copy = strings.auditDetail.prospectLink;
  const [query, setQuery] = useState('');
  const { rows, isLoading } = useProspectSearch(query);

  useEffect(() => {
    if (props.open) setQuery('');
  }, [props.open]);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogTitle>{copy.dialogTitle}</DialogTitle>
        <Input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={copy.searchPlaceholder}
          className="mt-3"
        />
        <ul className="mt-3 flex max-h-72 flex-col gap-1 overflow-y-auto">
          {rows.map((row) => (
            <li key={row.prospectId}>
              <button
                type="button"
                className="flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left text-sm hover:bg-raised"
                onClick={() => props.onPick(row.prospectId)}
              >
                <span className="text-ink">{row.name}</span>
                <span className="text-xs text-ink-muted">
                  {[row.commune, row.postcode].filter((part) => part !== undefined).join(' · ')}
                </span>
              </button>
            </li>
          ))}
          {!isLoading && query.trim() !== '' && rows.length === 0 ? (
            <li className="px-2 py-1.5 text-sm text-ink-muted">{copy.searchEmpty}</li>
          ) : null}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

export function AuditProspectLinkPanel(props: {
  auditId: string;
  prospect: AuditProspectResponse | null;
  canAttachProspect: boolean;
  onChanged: () => void;
}): JSX.Element | null {
  const { auditId, prospect, canAttachProspect, onChanged } = props;
  const { strings } = useI18n();
  const copy = strings.auditDetail.prospectLink;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canAttachProspect) return null;

  const update = async (prospectId: string | null): Promise<void> => {
    setIsBusy(true);
    setError(null);
    try {
      await sendJson(`/api/audits/${encodeURIComponent(auditId)}/prospect`, 'POST', { prospectId });
      setDialogOpen(false);
      onChanged();
    } catch {
      setError(copy.actionError);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {prospect === null ? (
        <>
          <span className="text-ink-muted">{copy.notLinked}</span>
          <Button
            variant="secondary"
            size="sm"
            disabled={isBusy}
            onClick={() => setDialogOpen(true)}
          >
            {copy.linkAction}
          </Button>
        </>
      ) : (
        <>
          <Badge tone="neutral">{prospect.name}</Badge>
          <Button
            variant="secondary"
            size="sm"
            isLoading={isBusy}
            disabled={isBusy}
            onClick={() => {
              if (window.confirm(copy.unlinkConfirm)) void update(null);
            }}
          >
            {copy.unlinkAction}
          </Button>
        </>
      )}
      {error !== null ? <span className="text-danger">{error}</span> : null}
      <AttachDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onPick={(prospectId) => void update(prospectId)}
      />
    </div>
  );
}
