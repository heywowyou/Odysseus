import { applyStrings } from './i18n-apply.js';
import { fetchJson, showError } from './app-shared.js';

const strings = applyStrings();

const form = document.getElementById('new-scan-form') as HTMLFormElement;
const fullAuditFields = document.getElementById('full-audit-fields')!;
const prospectingFields = document.getElementById('prospecting-fields')!;
const advancedOptions = document.getElementById('advanced-options')!;
const submitButton = document.getElementById('submit-button') as HTMLButtonElement;

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

function parsePositiveIntField(formData: FormData, name: string, allowZero: boolean): number | undefined {
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
    const body =
      type === 'full-audit'
        ? {
            type: 'full-audit' as const,
            url: String(formData.get('url') ?? '').trim(),
            options: {
              maxPages: parsePositiveIntField(formData, 'maxPages', false),
              maxDepth: parsePositiveIntField(formData, 'maxDepth', true),
              delayMs: parsePositiveIntField(formData, 'delayMs', true),
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
