import { buildProspectApiQuery, type ProspectFilterState } from './prospect-filter-model';

export type ProspectStatus =
  | 'new'
  | 'audited'
  | 'contacted'
  | 'follow-up'
  | 'replied'
  | 'call'
  | 'quoted'
  | 'won'
  | 'lost'
  | 'opted-out';

export const PROSPECT_RESULT_STATUSES = [
  'contacted',
  'follow-up',
  'replied',
  'call',
  'quoted',
  'won',
  'lost',
  'opted-out',
] as const;

export type ProspectResultStatus = (typeof PROSPECT_RESULT_STATUSES)[number];

export interface ProspectHubRow {
  prospectId: string;
  sector: string;
  name: string;
  websites: { url: string; registrableDomain: string; kind: string; primary: boolean }[];
  commune?: string;
  department?: string;
  status: ProspectStatus;
  hotel?: { stars?: number; rooms?: number; groupStatus?: string };
  emails: { address: string; origin: string }[];
  lastActivityAt: string;
  archivedAt?: string;
}

export interface ProspectHubListResponse {
  rows: ProspectHubRow[];
  total: number;
  page: number;
  pageSize: number;
  statusCounts: Record<ProspectResultStatus, number>;
  archivedCount?: number;
}

export interface DirectoryRow {
  directoryId: string;
  sector: string;
  name: string;
  commune?: string;
  department?: string;
  postcode?: string;
  websiteUrl?: string;
  registrableDomain?: string;
  websiteKind: string;
  stars?: number;
  rooms?: number;
  capacity?: number;
  groupStatus?: string;
  prospectId?: string;
  /** Plan 050: lifecycle of the linked prospect, read live from it. */
  prospectState?: 'active' | 'archived';
}

export interface DirectoryResponse {
  rows: DirectoryRow[];
  total: number;
  page: number;
  pageSize: number;
}

/** Plan 050: counts GET /api/prospects/:id/deletion-impact returns. */
export interface ProspectDeletionImpact {
  audits: number;
  findings: number;
  analyses: number;
  reports: number;
  reportApprovals: number;
  previews: number;
  drafts: number;
  threads: number;
  outcomes: number;
  events: number;
  jobs: number;
  directoryEntries: number;
}

/** The permanent-delete confirmation names what goes, non-zero counts only,
 *  in a fixed order, so the operator sees the scope before committing. */
export function deletionImpactSummary(
  impact: ProspectDeletionImpact,
  labels: Record<keyof ProspectDeletionImpact, string>,
): string[] {
  return (Object.keys(labels) as (keyof ProspectDeletionImpact)[])
    .filter((key) => impact[key] > 0)
    .map((key) => labels[key].replace('{count}', String(impact[key])));
}

/** Issue #381: what archiving permanently removes - the audit side of the
 *  deletion impact only. The prospect, correspondence, events, jobs outside
 *  those audits and the directory link are kept. */
const ARCHIVE_PURGED_KEYS = [
  'audits',
  'findings',
  'analyses',
  'reports',
  'reportApprovals',
] as const;

export function archiveImpactSummary(
  impact: ProspectDeletionImpact,
  labels: Record<keyof ProspectDeletionImpact, string>,
): string[] {
  return ARCHIVE_PURGED_KEYS.filter((key) => impact[key] > 0).map((key) =>
    labels[key].replace('{count}', String(impact[key])),
  );
}

export function buildHubProspectsPath(state: ProspectFilterState): string {
  return `/api/prospects?${buildProspectApiQuery(state, 'prospects').toString()}`;
}

export function buildDirectoryPath(state: ProspectFilterState): string {
  return `/api/directory?${buildProspectApiQuery(state, 'directory').toString()}`;
}
