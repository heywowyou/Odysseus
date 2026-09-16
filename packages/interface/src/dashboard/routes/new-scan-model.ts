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

export const NEW_SCAN_TYPES = ['full-audit', 'quick-check', 'prospecting-audit'] as const;
export type NewScanType = (typeof NEW_SCAN_TYPES)[number];

export interface ProspectScanRequest {
  type: 'quick-check' | 'prospecting-audit';
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
  'prospecting-audit': [
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
    type: 'prospecting-audit',
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

/** The ordinary New Scan entry point is the outreach-preparation workflow.
 * Contexts that explicitly request another intent may pass `?type=`; any
 * missing or unknown value stays on the safe ordinary default. */
export function initialScanTypeFromQuery(raw: string | null): NewScanType {
  return raw !== null && (NEW_SCAN_TYPES as readonly string[]).includes(raw)
    ? (raw as NewScanType)
    : 'prospecting-audit';
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
function buildCrawlOptions(form: NewScanFormValues): ScanCrawlOptions {
  const offered = new Set<AdvancedScanField>(ADVANCED_SCAN_FIELDS[form.type]);
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
      url: form.url.trim(),
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
    url: form.url.trim(),
    ...(prospectId !== '' ? { prospectId } : {}),
    options,
  };
}
