import type { StorageStrings } from '../i18n/sections/storage';
import type { DashboardLanguage } from '../i18n/types';
import { formatDateTime } from '../lib/format';
import type { DiskLevel, StorageStatusResponse } from '../../retention/storage-status';

export interface StorageStatusView {
  level: DiskLevel | 'unknown';
  levelLabel: string | undefined;
  levelHelp: string | undefined;
  usage: string;
  lastRun: string;
  runNotes: string[];
}

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/gu, (token, key: string) =>
    key in values ? String(values[key]) : token,
  );
}

function formatBytes(bytes: number, language: DashboardLanguage): string {
  const locale = language === 'fr' ? 'fr-FR' : 'en-GB';
  const gigabytes = bytes / 1_000_000_000;
  if (gigabytes >= 1) {
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(gigabytes)} ${language === 'fr' ? 'Go' : 'GB'}`;
  }
  const megabytes = bytes / 1_000_000;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(megabytes)} ${language === 'fr' ? 'Mo' : 'MB'}`;
}

export function buildStorageStatusView(
  status: StorageStatusResponse,
  copy: StorageStrings,
  language: DashboardLanguage,
): StorageStatusView {
  const { disk, lastRetentionRun: run } = status;
  const locale = language === 'fr' ? 'fr-FR' : 'en-GB';
  const runNotes =
    run === null
      ? []
      : [
          ...(run.refused ? [copy.refused] : []),
          ...(run.failureCount > 0 ? [fill(copy.failures, { count: run.failureCount })] : []),
          ...(run.auditsHeld > 0 ? [fill(copy.held, { count: run.auditsHeld })] : []),
        ];
  return {
    level: disk === null ? 'unknown' : disk.level,
    levelLabel: disk === null ? undefined : copy.levels[disk.level],
    levelHelp: disk === null || disk.level === 'ok' ? undefined : copy.levelHelp[disk.level],
    usage:
      disk === null
        ? copy.unavailable
        : fill(copy.usage, {
            used: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
              disk.usedPercent,
            ),
            free: formatBytes(disk.freeBytes, language),
            total: formatBytes(disk.totalBytes, language),
          }),
    lastRun:
      run === null
        ? copy.noRun
        : fill(copy.runSummary, {
            date: formatDateTime(run.finishedAt, language),
            trigger: copy.triggers[run.trigger],
            audits: run.auditsDeleted,
            slimmed: run.auditsSlimmed,
            versions: run.versionsDeleted,
            bytes: formatBytes(run.bytesReclaimedLocal, language),
          }),
    runNotes,
  };
}
