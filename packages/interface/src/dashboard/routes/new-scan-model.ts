import type { JobType } from '../lib/api-types';

/** Options block of a full-audit POST /api/scans body. Keys use the API's
 *  persisted contract names (routes/scans.ts); every key is optional and
 *  absent means "server default applies", never "zero". */
export interface FullAuditScanOptions {
  maxPages?: number;
  maxDepth?: number;
  delayMs?: number;
  siren?: string;
  transactionalFlow?: boolean;
  transactionalFlowReason?: string;
  seeds?: string[];
  exclusions?: string[];
  bookingEngineUrl?: string;
}

/** Body of POST /api/scans, shaped exactly as routes/scans.ts validates it.
 *  Empty or unset form fields are omitted from the built object rather than
 *  sent as empty strings or arrays: the server treats a present-but-empty
 *  option differently from an absent one in several spots. */
export interface FullAuditScanRequest {
  type: 'full-audit';
  url: string;
  options: FullAuditScanOptions;
}

export interface ProspectingScanRequest {
  type: 'prospecting';
  urls: string[];
}

export type ScanRequest = FullAuditScanRequest | ProspectingScanRequest;

/** Controlled state of the new-scan form. Numeric advanced options are kept
 *  as raw strings so the input stays editable between valid values; they are
 *  parsed only when the request is built. */
export interface NewScanFormValues {
  type: JobType;
  url: string;
  siren: string;
  transactionalFlow: '' | 'true' | 'false';
  transactionalFlowReason: string;
  urls: string;
  maxPages: string;
  maxDepth: string;
  delayMs: string;
  seeds: string;
  exclusions: string;
  bookingEngineUrl: string;
}

export function createEmptyFormValues(): NewScanFormValues {
  return {
    type: 'full-audit',
    url: '',
    siren: '',
    transactionalFlow: '',
    transactionalFlowReason: '',
    urls: '',
    maxPages: '',
    maxDepth: '',
    delayMs: '',
    seeds: '',
    exclusions: '',
    bookingEngineUrl: '',
  };
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

/** Builds the POST /api/scans body from the form state, replicating the old
 *  public/app-new-scan.ts body construction exactly (old file used
 *  JSON.stringify to drop undefined keys; here the keys are omitted up
 *  front, which produces the same wire body). */
export function buildScanRequest(form: NewScanFormValues): ScanRequest {
  if (form.type === 'prospecting') {
    return { type: 'prospecting', urls: splitLines(form.urls) };
  }

  const maxPages = parsePositiveIntOption(form.maxPages);
  const maxDepth = parsePositiveIntOption(form.maxDepth);
  const delayMs = parsePositiveIntOption(form.delayMs);
  const siren = form.siren.trim();
  const transactionalFlow = form.transactionalFlow;
  const transactionalFlowReason = form.transactionalFlowReason.trim();
  const seeds = splitLines(form.seeds);
  const exclusions = splitLines(form.exclusions);
  const bookingEngineUrl = form.bookingEngineUrl.trim();
  const options: FullAuditScanOptions = {
    ...(maxPages !== undefined ? { maxPages } : {}),
    ...(maxDepth !== undefined ? { maxDepth } : {}),
    ...(delayMs !== undefined ? { delayMs } : {}),
    ...(siren !== '' ? { siren: siren.replace(/\s/g, '') } : {}),
    ...(transactionalFlow !== '' ? { transactionalFlow: transactionalFlow === 'true' } : {}),
    ...(transactionalFlow !== '' && transactionalFlowReason !== ''
      ? { transactionalFlowReason }
      : {}),
    ...(seeds.length > 0 ? { seeds } : {}),
    ...(exclusions.length > 0 ? { exclusions } : {}),
    ...(bookingEngineUrl !== '' ? { bookingEngineUrl } : {}),
  };
  return { type: 'full-audit', url: form.url.trim(), options };
}
