export type ProspectFilterSource = 'prospects' | 'directory';

/** Plan 050: 'archived' lists prospects taken out of active work; the
 *  other two views only ever show active prospects. */
export type ProspectListView = 'all' | 'results' | 'archived';

function viewFrom(value: string | null): ProspectListView {
  return value === 'results' || value === 'archived' ? value : 'all';
}

export type ProspectFilterKey =
  | 'q'
  | 'status'
  | 'sector'
  | 'stars'
  | 'groupStatus'
  | 'websiteKind'
  | 'department'
  | 'commune'
  | 'postcode'
  | 'roomsMin'
  | 'roomsMax'
  | 'hasScan'
  | 'inactive';

export interface ProspectFilterState {
  view: ProspectListView;
  q: string;
  status: string;
  sector: string;
  stars: string;
  groupStatus: string;
  websiteKind: string;
  department: string;
  commune: string;
  postcode: string;
  roomsMin: string;
  roomsMax: string;
  hasScan: string;
  inactive: string;
  page: number;
}

const PROSPECT_ADVANCED_FILTER_KEYS: readonly ProspectFilterKey[] = [
  'sector',
  'stars',
  'groupStatus',
  'websiteKind',
  'department',
  'commune',
  'roomsMin',
  'roomsMax',
  'hasScan',
  'inactive',
];

const DIRECTORY_ADVANCED_FILTER_KEYS: readonly ProspectFilterKey[] = [
  'sector',
  'groupStatus',
  'websiteKind',
  'commune',
  'postcode',
  'roomsMin',
  'roomsMax',
];

const FILTER_KEYS: readonly ProspectFilterKey[] = [
  'q',
  'status',
  'sector',
  'stars',
  'groupStatus',
  'websiteKind',
  'department',
  'commune',
  'postcode',
  'roomsMin',
  'roomsMax',
  'hasScan',
  'inactive',
];

function pageFrom(params: URLSearchParams): number {
  const value = Number(params.get('page') ?? '1');
  return Number.isInteger(value) && value > 0 ? value : 1;
}

/** Reads the owned filter state without consuming unrelated query parameters. */
export function parseProspectFilters(params: URLSearchParams): ProspectFilterState {
  return {
    view: viewFrom(params.get('view')),
    q: params.get('q') ?? '',
    status: params.get('status') ?? '',
    sector: params.get('sector') ?? '',
    stars: params.get('stars') ?? '',
    groupStatus: params.get('groupStatus') ?? '',
    websiteKind: params.get('websiteKind') ?? '',
    department: params.get('department') ?? '',
    commune: params.get('commune') ?? '',
    postcode: params.get('postcode') ?? '',
    roomsMin: params.get('roomsMin') ?? '',
    roomsMax: params.get('roomsMax') ?? '',
    hasScan: params.get('hasScan') ?? '',
    inactive: params.get('inactive') ?? '',
    page: pageFrom(params),
  };
}

/** Serializes owned state while retaining unrelated query parameters. */
export function serializeProspectFilters(
  state: ProspectFilterState,
  current: URLSearchParams = new URLSearchParams(),
): URLSearchParams {
  const next = new URLSearchParams(current);
  if (state.view === 'all') next.delete('view');
  else next.set('view', state.view);
  for (const key of FILTER_KEYS) {
    const value = state[key].trim();
    if (value === '') next.delete(key);
    else next.set(key, value);
  }
  next.set('page', String(Math.max(1, state.page)));
  return next;
}

export function updateProspectFilter(
  current: URLSearchParams,
  key: ProspectFilterKey,
  value: string,
): URLSearchParams {
  const state = parseProspectFilters(current);
  return serializeProspectFilters(
    { ...state, [key]: value.trim(), page: 1 } as ProspectFilterState,
    current,
  );
}

export function setProspectPage(current: URLSearchParams, page: number): URLSearchParams {
  const state = parseProspectFilters(current);
  return serializeProspectFilters({ ...state, page: Math.max(1, page) }, current);
}

export function setProspectView(current: URLSearchParams, view: ProspectListView): URLSearchParams {
  const state = parseProspectFilters(current);
  return serializeProspectFilters({ ...state, view, status: '', page: 1 }, current);
}

/** Clears only filters owned by the shared module. View and unrelated context remain. */
export function clearProspectFilters(current: URLSearchParams): URLSearchParams {
  const state = parseProspectFilters(current);
  return serializeProspectFilters(
    {
      ...state,
      q: '',
      status: '',
      sector: '',
      stars: '',
      groupStatus: '',
      websiteKind: '',
      department: '',
      commune: '',
      postcode: '',
      roomsMin: '',
      roomsMax: '',
      hasScan: '',
      inactive: '',
      page: 1,
    },
    current,
  );
}

function advancedFilterKeys(source: ProspectFilterSource): readonly ProspectFilterKey[] {
  return source === 'prospects' ? PROSPECT_ADVANCED_FILTER_KEYS : DIRECTORY_ADVANCED_FILTER_KEYS;
}

export function activeFilterCount(
  state: ProspectFilterState,
  source: ProspectFilterSource = 'prospects',
): number {
  return advancedFilterKeys(source).filter((key) => state[key] !== '').length;
}

export function activeAdvancedFilterEntries(
  state: ProspectFilterState,
  source: ProspectFilterSource,
  labels: Partial<Record<ProspectFilterKey, string>>,
): { key: ProspectFilterKey; label: string; value: string }[] {
  return advancedFilterKeys(source)
    .filter((key) => state[key] !== '')
    .map((key) => ({ key, label: labels[key] ?? key, value: state[key] }));
}

export function buildProspectApiQuery(
  state: ProspectFilterState,
  source: ProspectFilterSource,
  view: ProspectListView = state.view,
): URLSearchParams {
  const query = new URLSearchParams();
  if (source === 'prospects' && view === 'results') query.set('view', 'results');
  if (source === 'prospects' && view === 'archived') query.set('archived', 'true');
  for (const key of FILTER_KEYS) {
    if (source === 'directory' && ['status', 'hasScan', 'inactive'].includes(key)) continue;
    if (source === 'prospects' && key === 'postcode') continue;
    const value = state[key].trim();
    if (value !== '') query.set(key, value);
  }
  query.set('page', String(Math.max(1, state.page)));
  query.set('pageSize', '50');
  return query;
}
