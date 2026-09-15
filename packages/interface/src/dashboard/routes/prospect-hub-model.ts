import {
  buildProspectApiQuery,
  type ProspectFilterState,
} from './prospect-filter-model';

export type { ProspectListView } from './prospect-filter-model';

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
}

export interface ProspectHubListResponse {
  rows: ProspectHubRow[];
  total: number;
  page: number;
  pageSize: number;
  statusCounts: Record<ProspectResultStatus, number>;
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
}

export interface DirectoryResponse {
  rows: DirectoryRow[];
  total: number;
  page: number;
  pageSize: number;
}

export function buildHubProspectsPath(state: ProspectFilterState): string {
  return `/api/prospects?${buildProspectApiQuery(state, 'prospects').toString()}`;
}

export function buildDirectoryPath(state: ProspectFilterState): string {
  return `/api/directory?${buildProspectApiQuery(state, 'directory').toString()}`;
}
