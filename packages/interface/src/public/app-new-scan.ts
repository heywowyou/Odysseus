import { applyStrings } from './i18n-apply.js';
import { fetchJson, showError } from './app-shared.js';

const strings = applyStrings();

/** Duplicated from @odysseus/core's isValidSiren rather than imported:
 *  this script is served directly to the browser as a plain ES module
 *  (tsconfig.public.json has no path mapping to workspace packages, and
 *  there is no bundler step to resolve a bare "@odysseus/core" specifier
 *  at runtime), the same reason manifest.ts duplicates scanner's
 *  CrawledPageStatus by value rather than importing it. Client-side
 *  validation here is a UX nicety only - the server (routes/scans.ts)
 *  re-validates with the real implementation and is the actual boundary
 *  that fails a request. */
function isValidSiren(value: string): boolean {
  const cleaned = value.replace(/\s/g, '');
  if (!/^\d{9}$/.test(cleaned)) return false;
  let sum = 0;
  for (let i = 0; i < cleaned.length; i++) {
    let digit = Number(cleaned[cleaned.length - 1 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

const form = document.getElementById('new-scan-form') as HTMLFormElement;
const fullAuditFields = document.getElementById('full-audit-fields')!;
const prospectingFields = document.getElementById('prospecting-fields')!;
const advancedOptions = document.getElementById('advanced-options')!;
const submitButton = document.getElementById('submit-button') as HTMLButtonElement;
const transactionalFlowSelect = document.getElementById('transactionalFlow') as HTMLSelectElement;
const transactionalFlowReasonField = document.getElementById('transactional-flow-reason-field')!;

/** The reason field only makes sense once the operator has actually
 *  asserted yes/no - left visible for "let the tool detect" it would
 *  invite a reason for a fact nobody supplied. */
function updateTransactionalFlowReasonVisibility(): void {
  transactionalFlowReasonField.hidden = transactionalFlowSelect.value === '';
}
transactionalFlowSelect.addEventListener('change', updateTransactionalFlowReasonVisibility);
updateTransactionalFlowReasonVisibility();

function currentType(): 'full-audit' | 'prospecting' {
  const checked = form.querySelector<HTMLInputElement>('input[name="type"]:checked');
  return checked?.value === 'prospecting' ? 'prospecting' : 'full-audit';
}

/** Advanced options (crawl depth, page cap, delay) only apply to a
 *  full-audit scan - prospecting's "lighter checks" are a fixed,
 *  server-enforced ceiling, not something the operator adjusts per
 *  batch, so the whole block is hidden rather than left visible with
 *  nothing to configure. */
function updateFieldVisibility(): void {
  const isFullAudit = currentType() === 'full-audit';
  fullAuditFields.hidden = !isFullAudit;
  prospectingFields.hidden = isFullAudit;
  advancedOptions.hidden = !isFullAudit;
}

for (const input of form.querySelectorAll<HTMLInputElement>('input[name="type"]')) {
  input.addEventListener('change', updateFieldVisibility);
}
updateFieldVisibility();

function parsePositiveIntField(
  formData: FormData,
  name: string,
  allowZero: boolean,
): number | undefined {
  const raw = formData.get(name);
  if (raw === null || raw === '') return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return undefined;
  if (allowZero ? parsed < 0 : parsed <= 0) return undefined;
  return parsed;
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  void submit();
});

async function submit(): Promise<void> {
  submitButton.disabled = true;
  try {
    const formData = new FormData(form);
    const type = currentType();

    const rawSiren = String(formData.get('siren') ?? '').trim();
    if (type === 'full-audit' && rawSiren !== '' && !isValidSiren(rawSiren)) {
      showError(strings.newScan.sirenInvalidError);
      submitButton.disabled = false;
      return;
    }

    const rawTransactionalFlow = String(formData.get('transactionalFlow') ?? '');
    const rawTransactionalFlowReason = String(formData.get('transactionalFlowReason') ?? '').trim();

    const seeds = String(formData.get('seeds') ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const exclusions = String(formData.get('exclusions') ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const rawBookingEngineUrl = String(formData.get('bookingEngineUrl') ?? '').trim();

    const body =
      type === 'full-audit'
        ? {
            type: 'full-audit' as const,
            url: String(formData.get('url') ?? '').trim(),
            options: {
              maxPages: parsePositiveIntField(formData, 'maxPages', false),
              maxDepth: parsePositiveIntField(formData, 'maxDepth', true),
              delayMs: parsePositiveIntField(formData, 'delayMs', true),
              ...(rawSiren !== '' ? { siren: rawSiren.replace(/\s/g, '') } : {}),
              ...(rawTransactionalFlow !== ''
                ? { transactionalFlow: rawTransactionalFlow === 'true' }
                : {}),
              ...(rawTransactionalFlow !== '' && rawTransactionalFlowReason !== ''
                ? { transactionalFlowReason: rawTransactionalFlowReason }
                : {}),
              ...(seeds.length > 0 ? { seeds } : {}),
              ...(exclusions.length > 0 ? { exclusions } : {}),
              ...(rawBookingEngineUrl !== '' ? { bookingEngineUrl: rawBookingEngineUrl } : {}),
            },
          }
        : {
            type: 'prospecting' as const,
            urls: String(formData.get('urls') ?? '')
              .split('\n')
              .map((line) => line.trim())
              .filter((line) => line.length > 0),
          };

    const result = await fetchJson<{ jobId: string }>('/api/scans', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    window.location.href = `/progress.html?job=${encodeURIComponent(result.jobId)}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showError(`${strings.newScan.submitError}: ${message}`);
    submitButton.disabled = false;
  }
}
