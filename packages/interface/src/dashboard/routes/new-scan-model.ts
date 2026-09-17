/** Crawl-shaping options every single-site scan intent shares. Keys use the
 *  API's persisted contract names (routes/scans.ts, JobOptionsSnapshot);
 *  every key is optional and absent means "server default applies", never
 *  "zero". `delayMs` stays in milliseconds on the wire and in storage: the
 *  form collects seconds and converts at this boundary, so no stored value
 *  ever changes meaning. */
export interface ScanCrawlOptions {
  maxPages?: number;
  maxDepth?: number;
  delayMs?: number;
  /** Number of pages scanned at once. The server clamps values above its
   *  configured default downward, so this option can only reduce the load
   *  on the scanned site, never increase it. */
  scanConcurrency?: number;
  seeds?: string[];
  exclusions?: string[];
  bookingEngineUrl?: string;
}

/** Options block of a full-audit POST /api/scans body: the shared crawl
 *  options plus the obligation inputs only a client report uses. */
export interface FullAuditScanOptions extends ScanCrawlOptions {
  siren?: string;
  transactionalFlow?: boolean;
  transactionalFlowReason?: string;
}

/** Body of POST /api/scans, shaped exactly as routes/scans.ts validates it.
 *  Empty or unset form fields are omitted from the built object rather than
 *  sent as empty strings or arrays: the server treats a present-but-empty
 *  option differently from an absent one in several spots. */
export interface FullAuditScanRequest {
  type: 'full-audit';
  url: string;
  prospectId?: string;
  options: FullAuditScanOptions;
}

/** Plan 050: the operator launches exactly two scans. A Full scan captures
 *  the complete evidence once; outreach, analyses, and client reports all
 *  reuse it afterwards, so there is no separate outreach crawl to offer. */
export const NEW_SCAN_TYPES = ['full-audit', 'quick-check'] as const;
export type NewScanType = (typeof NEW_SCAN_TYPES)[number];

export interface ProspectScanRequest {
  type: 'quick-check';
  url: string;
  prospectId?: string;
  options: ScanCrawlOptions;
}

export interface ProspectingScanRequest {
  type: 'prospecting';
  urls: string[];
}

export type ScanRequest = FullAuditScanRequest | ProspectScanRequest | ProspectingScanRequest;

export type AdvancedScanField = keyof ScanCrawlOptions;

/** Which advanced options each intent offers. One table drives both the
 *  form and the request body, so a field is never shown without being sent
 *  or sent without being shown. Quick Check scans exactly one page (the
 *  server pins maxPages to 1), so the crawl-scope options could not change
 *  anything there; its pacing controls still matter on a site that blocks
 *  rapid requests. */
export const ADVANCED_SCAN_FIELDS: Record<NewScanType, readonly AdvancedScanField[]> = {
  'full-audit': [
    'maxPages',
    'maxDepth',
    'delayMs',
    'scanConcurrency',
    'seeds',
    'exclusions',
    'bookingEngineUrl',
  ],
  'quick-check': ['delayMs', 'scanConcurrency'],
};

/** Issue #375: the advanced options a batch shares across every site. Seed
 *  pages and the booking engine address name pages of one particular site, so
 *  a batch never offers them; routes/scans.ts refuses them on the batch
 *  endpoint as well. Derived from ADVANCED_SCAN_FIELDS so the batch can never
 *  offer an option the single-site form does not. */
const SITE_SPECIFIC_SCAN_FIELDS: readonly AdvancedScanField[] = ['seeds', 'bookingEngineUrl'];

export const BATCH_SCAN_FIELDS: Record<NewScanType, readonly AdvancedScanField[]> = {
  'full-audit': ADVANCED_SCAN_FIELDS['full-audit'].filter(
    (field) => !SITE_SPECIFIC_SCAN_FIELDS.includes(field),
  ),
  'quick-check': ADVANCED_SCAN_FIELDS['quick-check'].filter(
    (field) => !SITE_SPECIFIC_SCAN_FIELDS.includes(field),
  ),
};

/** Controlled state of the new-scan form. Numeric advanced options are kept
 *  as raw strings so the input stays editable between valid values; they are
 *  parsed only when the request is built. The page-load pause is entered in
 *  seconds (`delaySeconds`) and becomes the API's `delayMs` only there. */
export interface NewScanFormValues {
  type: NewScanType;
  url: string;
  prospectId: string;
  siren: string;
  transactionalFlow: '' | 'true' | 'false';
  transactionalFlowReason: string;
  maxPages: string;
  maxDepth: string;
  delaySeconds: string;
  scanConcurrency: string;
  seeds: string;
  exclusions: string;
  bookingEngineUrl: string;
}

export function createEmptyFormValues(): NewScanFormValues {
  return {
    type: 'full-audit',
    url: '',
    prospectId: '',
    siren: '',
    transactionalFlow: '',
    transactionalFlowReason: '',
    maxPages: '',
    maxDepth: '',
    delaySeconds: '',
    scanConcurrency: '',
    seeds: '',
    exclusions: '',
    bookingEngineUrl: '',
  };
}

/** The ordinary New Scan entry point is the Full scan. Contexts that
 * explicitly request a Quick check may pass `?type=`; any missing, unknown,
 * or retired value (an old `prospecting-audit` link) opens the Full scan. */
export function initialScanTypeFromQuery(raw: string | null): NewScanType {
  return raw !== null && (NEW_SCAN_TYPES as readonly string[]).includes(raw)
    ? (raw as NewScanType)
    : 'full-audit';
}

/** Duplicated by value from @odysseus/core's isHttpUrlWithoutCredentials
 *  rather than imported: the interface package does not depend on core and
 *  adding that cross package dependency is a package boundary change, while
 *  both validators are small, stable and pure. Client-side validation here
 *  is a UX nicety only: routes/scans.ts re-validates with the real
 *  implementation and stays the boundary that fails a request. */
export function isValidAbsoluteHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    // Same hostname shape rule as core's isHttpUrlWithoutCredentials: a
    // hostname with no alphanumeric character ('..' from 'http://..') is
    // never a real site.
    if (!/[a-zA-Z0-9]/.test(parsed.hostname)) return false;
    return parsed.username === '' && parsed.password === '';
  } catch {
    return false;
  }
}

const BARE_HOST_PATTERN = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(:\d+)?(\/\S*)?$/i;

/** Issue #403: the directory displays sites as bare domains, so a pasted
 *  `exemple.fr` (optionally with a path) becomes `https://exemple.fr/`. Any
 *  other input, valid or not, is returned trimmed and left to the
 *  validator, so real invalid input is still rejected. */
export function normalizeScanUrl(value: string): string {
  const trimmed = value.trim();
  if (!BARE_HOST_PATTERN.test(trimmed)) return trimmed;
  return new URL(`https://${trimmed}`).href;
}

/** Initial url field value from the ?url= query parameter (the prospect
 *  detail page's launch-audit link). The prefill is a convenience, not a
 *  gate: the route boundary (routes/scans.ts) revalidates whatever is
 *  finally submitted, so a query the form cannot use simply starts empty
 *  instead of pre-filling an error. */
export function prefillUrlFromQuery(raw: string | null): string {
  if (raw === null) return '';
  const trimmed = raw.trim();
  return isValidAbsoluteHttpUrl(trimmed) ? trimmed : '';
}

/** Ported unchanged from the old public/app-new-scan.ts (itself a copy of
 *  core's isValidSiren): spaces are ignored, then exactly 9 digits must pass
 *  the Luhn style INSEE checksum over the digits read right to left. */
export function isValidSiren(value: string): boolean {
  const cleaned = value.replace(/\s/g, '');
  if (!/^\d{9}$/.test(cleaned)) return false;
  let sum = 0;
  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[cleaned.length - 1 - i];
    if (char === undefined) continue;
    let digit = Number(char);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

/** Field error slot value for the SIREN input: the localized copy when the
 *  operator typed something that is not a valid SIREN, null when the field
 *  is empty (it is optional) or passes the checksum. The copy is injected by
 *  the caller so this stays a pure function independent of any string
 *  table. */
export function validateSiren(value: string, invalidCopy: string): string | null {
  const trimmed = value.trim();
  if (trimmed === '' || isValidSiren(trimmed)) return null;
  return invalidCopy;
}

/** One trimmed non-empty line per entry, the old page's exact textarea to
 *  array conversion for URLs, seeds, and exclusions. */
function splitLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Positive whole number or nothing. Zero and negatives are dropped rather
 *  than sent: routes/scans.ts rejects non positive options, and "no limit"
 *  is expressed by omitting the key entirely. */
function parsePositiveIntOption(raw: string): number | undefined {
  if (raw.trim() === '') return undefined;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return undefined;
  return parsed;
}

/** Seconds as the operator types them (a comma decimal separator is
 *  accepted, as French keyboards produce it) converted to the API's whole
 *  milliseconds. Anything that is not a positive duration of at least one
 *  millisecond is dropped, the same "omit rather than send" rule as the
 *  other numeric options. */
export function parseDelaySecondsToMs(raw: string): number | undefined {
  const trimmed = raw.trim().replace(',', '.');
  if (trimmed === '') return undefined;
  const seconds = Number(trimmed);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  const ms = Math.round(seconds * 1000);
  return ms >= 1 ? ms : undefined;
}

/** The shared crawl options for one intent, restricted to the fields that
 *  intent offers (ADVANCED_SCAN_FIELDS), so a value typed while another
 *  intent was selected never leaks into the request. */
function buildCrawlOptions(
  form: NewScanFormValues,
  fields: Record<NewScanType, readonly AdvancedScanField[]> = ADVANCED_SCAN_FIELDS,
): ScanCrawlOptions {
  const offered = new Set<AdvancedScanField>(fields[form.type]);
  const maxPages = offered.has('maxPages') ? parsePositiveIntOption(form.maxPages) : undefined;
  const maxDepth = offered.has('maxDepth') ? parsePositiveIntOption(form.maxDepth) : undefined;
  const delayMs = offered.has('delayMs') ? parseDelaySecondsToMs(form.delaySeconds) : undefined;
  const scanConcurrency = offered.has('scanConcurrency')
    ? parsePositiveIntOption(form.scanConcurrency)
    : undefined;
  const seeds = offered.has('seeds') ? splitLines(form.seeds) : [];
  const exclusions = offered.has('exclusions') ? splitLines(form.exclusions) : [];
  const bookingEngineUrl = offered.has('bookingEngineUrl') ? form.bookingEngineUrl.trim() : '';
  return {
    ...(maxPages !== undefined ? { maxPages } : {}),
    ...(maxDepth !== undefined ? { maxDepth } : {}),
    ...(delayMs !== undefined ? { delayMs } : {}),
    ...(scanConcurrency !== undefined ? { scanConcurrency } : {}),
    ...(seeds.length > 0 ? { seeds } : {}),
    ...(exclusions.length > 0 ? { exclusions } : {}),
    ...(bookingEngineUrl !== '' ? { bookingEngineUrl } : {}),
  };
}

/** Builds the POST /api/scans body from the form state. Keys are omitted
 *  up front rather than sent undefined, which produces the same wire body
 *  as the old page's JSON.stringify. */
export function buildScanRequest(form: NewScanFormValues): ScanRequest {
  const prospectId = form.prospectId.trim();
  const crawlOptions = buildCrawlOptions(form);
  if (form.type !== 'full-audit') {
    return {
      type: form.type,
      url: normalizeScanUrl(form.url),
      ...(prospectId !== '' ? { prospectId } : {}),
      options: crawlOptions,
    };
  }

  const siren = form.siren.trim();
  const transactionalFlow = form.transactionalFlow;
  const transactionalFlowReason = form.transactionalFlowReason.trim();
  const options: FullAuditScanOptions = {
    ...crawlOptions,
    ...(siren !== '' ? { siren: siren.replace(/\s/g, '') } : {}),
    ...(transactionalFlow !== '' ? { transactionalFlow: transactionalFlow === 'true' } : {}),
    ...(transactionalFlow !== '' && transactionalFlowReason !== ''
      ? { transactionalFlowReason }
      : {}),
  };
  return {
    type: 'full-audit',
    url: normalizeScanUrl(form.url),
    ...(prospectId !== '' ? { prospectId } : {}),
    options,
  };
}

/** One site of a batch submission, in queue order. */
export interface BatchScanSite {
  prospectId: string;
  url: string;
}

/** Body of POST /api/scans/batch (issue #375). */
export interface BatchScanRequest {
  type: NewScanType;
  items: BatchScanSite[];
  options: ScanCrawlOptions;
}

/** The subset of a prospect row the batch needs. */
export interface BatchScanProspect {
  prospectId: string;
  name: string;
  websites: { url: string; primary: boolean }[];
}

export interface BatchScanPlanRow {
  prospectId: string;
  name: string;
  url: string;
}

/** Selected prospects resolved to the site each would scan, in selection
 *  order. The primary website wins, else the first one listed, the same
 *  choice the prospect page's launch link makes; a prospect with no usable
 *  website cannot be queued and is listed apart so the dialog can say so. */
export function planBatchScan(prospects: readonly BatchScanProspect[]): {
  rows: BatchScanPlanRow[];
  withoutWebsite: string[];
} {
  const rows: BatchScanPlanRow[] = [];
  const withoutWebsite: string[] = [];
  for (const prospect of prospects) {
    const website = prospect.websites.find((site) => site.primary) ?? prospect.websites[0];
    if (website === undefined || !isValidAbsoluteHttpUrl(website.url)) {
      withoutWebsite.push(prospect.name);
      continue;
    }
    rows.push({ prospectId: prospect.prospectId, name: prospect.name, url: website.url });
  }
  return { rows, withoutWebsite };
}

/** Moves one row up or down, for reordering the batch before it is sent.
 *  Out-of-range moves return the same order. */
export function moveBatchRow<T>(rows: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (index < 0 || index >= rows.length || target < 0 || target >= rows.length) return [...rows];
  const next = [...rows];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

/** The batch body: the rows in their final order plus the shared crawl
 *  options the batch offers for this scan type. */
export function buildBatchScanRequest(
  form: NewScanFormValues,
  rows: readonly BatchScanPlanRow[],
): BatchScanRequest {
  return {
    type: form.type,
    items: rows.map((row) => ({ prospectId: row.prospectId, url: row.url })),
    options: buildCrawlOptions(form, BATCH_SCAN_FIELDS),
  };
}

/** One site's outcome in the POST /api/scans/batch response. */
export type BatchScanResult =
  | { index: number; url: string; prospectId?: string; outcome: 'queued'; jobId: string }
  | {
      index: number;
      url: string;
      prospectId?: string;
      outcome: 'skipped';
      reason: 'already-active';
    }
  | {
      index: number;
      url: string;
      prospectId?: string;
      outcome: 'rejected';
      reason: 'invalid-url' | 'suppressed' | 'prospect-unavailable';
    };

export interface BatchScanResponse {
  type: NewScanType;
  queued: number;
  skipped: number;
  rejected: number;
  results: BatchScanResult[];
}
