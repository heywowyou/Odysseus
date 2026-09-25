import type { JSX } from 'react';
import { Badge, type BadgeTone } from '../components/ui/badge';
import { Card } from '../components/ui/card';
import { useI18n } from '../i18n/provider';
import { useApi } from '../lib/use-api';
import type { StorageStatusResponse } from '../../retention/storage-status';
import { buildStorageStatusView, type StorageStatusView } from './storage-status-model';

const LEVEL_TONE: Record<StorageStatusView['level'], BadgeTone> = {
  ok: 'minor',
  warning: 'moderate',
  danger: 'critical',
  unknown: 'neutral',
};

/** Plan 077: the artifacts disk's fill level and the last retention run.
 *  Placed on the Tools page: the dashboard IA names no system or health
 *  location and there is no Settings page. */
export function StorageStatusCard(): JSX.Element | null {
  const { strings, language } = useI18n();
  const copy = strings.storage;
  const response = useApi<StorageStatusResponse>('/api/storage-status');
  if (response.data === undefined) return null;
  const view = buildStorageStatusView(response.data, copy, language);

  return (
    <Card title={copy.heading} description={copy.description}>
      <div className="flex flex-col gap-4" data-storage-level={view.level}>
        <div className="flex flex-col gap-1">
          {view.levelLabel !== undefined ? (
            <div>
              <Badge tone={LEVEL_TONE[view.level]}>{view.levelLabel}</Badge>
            </div>
          ) : null}
          <p className="text-sm text-ink">{view.usage}</p>
          {view.levelHelp !== undefined ? (
            <p
              className="text-sm text-ink-soft"
              role={view.level === 'danger' ? 'alert' : undefined}
            >
              {view.levelHelp}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-ink">{copy.lastRunHeading}</h3>
          <p className="text-sm text-ink-soft">{view.lastRun}</p>
          {view.runNotes.map((note) => (
            <p key={note} className="text-sm text-ink-soft">
              {note}
            </p>
          ))}
        </div>
      </div>
    </Card>
  );
}
