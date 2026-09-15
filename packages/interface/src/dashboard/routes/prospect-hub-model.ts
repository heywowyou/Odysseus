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

function setText(query: URLSearchParams, key: string, value: string): void {
  if (value.trim()) query.set(key, value.trim());
}

export function buildHubProspectsPath(params: {
  q: string;
  status: string;
  sector?: string;
  stars?: string;
  groupStatus?: string;
  websiteKind: string;
  department?: string;
  roomsMin?: string;
  roomsMax?: string;
  hasScan?: string;
  inactive?: string;
  page: number;
}): string {
  const query = new URLSearchParams();
  setText(query, 'q', params.q);
  setText(query, 'status', params.status);
  setText(query, 'sector', params.sector ?? '');
  setText(query, 'stars', params.stars ?? '');
  setText(query, 'groupStatus', params.groupStatus ?? '');
  setText(query, 'websiteKind', params.websiteKind);
  setText(query, 'department', params.department ?? '');
  setText(query, 'roomsMin', params.roomsMin ?? '');
  setText(query, 'roomsMax', params.roomsMax ?? '');
  setText(query, 'hasScan', params.hasScan ?? '');
  setText(query, 'inactive', params.inactive ?? '');
  query.set('page', String(params.page));
  query.set('pageSize', '50');
  return `/api/prospects?${query.toString()}`;
}

export function buildDirectoryPath(params: {
  q: string;
  sector?: string;
  stars: string;
  groupStatus?: string;
  websiteKind: string;
  department?: string;
  roomsMin?: string;
  roomsMax?: string;
  page: number;
}): string {
  const query = new URLSearchParams();
  setText(query, 'q', params.q);
  setText(query, 'sector', params.sector ?? '');
  setText(query, 'stars', params.stars);
  setText(query, 'groupStatus', params.groupStatus ?? '');
  setText(query, 'websiteKind', params.websiteKind);
  setText(query, 'department', params.department ?? '');
  setText(query, 'roomsMin', params.roomsMin ?? '');
  setText(query, 'roomsMax', params.roomsMax ?? '');
  query.set('page', String(params.page));
  query.set('pageSize', '50');
  return `/api/directory?${query.toString()}`;
}
