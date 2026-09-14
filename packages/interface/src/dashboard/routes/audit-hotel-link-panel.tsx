/**
 * Issue #216: the audit detail page's manual hotel-link recovery action.
 * The automatic domain match (linkAuditToHotelByDomain, store) already
 * links most audits on its own; this panel covers what it deliberately
 * refuses to guess (a shared/vendor-hosted domain) or got wrong, and lets
 * the operator undo either kind of link.
 */

import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { useI18n } from '../i18n/provider';
import { fetchJson, sendDelete, sendJson } from '../lib/api';
import type { ProspectListResponse, ProspectRow } from './prospects-model';
import type { AuditHotelResponse } from './audit-detail-types';

/** One outstanding search request at a time: a stale earlier response
 *  (e.g. from a query the operator already replaced) is dropped rather
 *  than allowed to overwrite the newer one - the standard sequence-token
 *  guard used elsewhere in the dashboard for a debounced fetch. */
function useProspectSearch(query: string): { rows: ProspectRow[]; isLoading: boolean } {
  const [rows, setRows] = useState<ProspectRow[]>([]);
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
      void fetchJson<ProspectListResponse>(
        `/api/prospects?q=${encodeURIComponent(trimmed)}&limit=5`,
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

function LinkDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (candidateId: string) => void;
}): JSX.Element {
  const { strings } = useI18n();
  const copy = strings.auditDetail.hotelLink;
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
            <li key={row.candidateId}>
              <button
                type="button"
                className="flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left text-sm hover:bg-raised"
                onClick={() => props.onPick(row.candidateId)}
              >
                <span className="text-ink">{row.name}</span>
                <span className="text-xs text-ink-muted">
                  {[row.commune, row.postcode].filter((part) => part !== null).join(' · ')}
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

export function AuditHotelLinkPanel(props: {
  auditId: string;
  hotel: AuditHotelResponse | null;
  canLinkManually: boolean;
  onChanged: () => void;
}): JSX.Element | null {
  const { auditId, hotel, canLinkManually, onChanged } = props;
  const { strings } = useI18n();
  const copy = strings.auditDetail.hotelLink;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canLinkManually) return null;

  const link = async (candidateId: string): Promise<void> => {
    setIsBusy(true);
    setError(null);
    try {
      await sendJson(`/api/audits/${encodeURIComponent(auditId)}/hotel-link`, 'POST', {
        candidateId,
      });
      setDialogOpen(false);
      onChanged();
    } catch {
      setError(copy.actionError);
    } finally {
      setIsBusy(false);
    }
  };

  const unlink = async (): Promise<void> => {
    if (!window.confirm(copy.unlinkConfirm)) return;
    setIsBusy(true);
    setError(null);
    try {
      await sendDelete(`/api/audits/${encodeURIComponent(auditId)}/hotel-link`);
      onChanged();
    } catch {
      setError(copy.actionError);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {hotel === null ? (
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
          {hotel.matchedOn === 'manual' ? <Badge tone="neutral">{copy.manualBadge}</Badge> : null}
          <Button
            variant="secondary"
            size="sm"
            isLoading={isBusy}
            disabled={isBusy}
            onClick={() => {
              void unlink();
            }}
          >
            {copy.unlinkAction}
          </Button>
        </>
      )}
      {error !== null ? <span className="text-danger">{error}</span> : null}
      <LinkDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onPick={(candidateId) => {
          void link(candidateId);
        }}
      />
    </div>
  );
}
