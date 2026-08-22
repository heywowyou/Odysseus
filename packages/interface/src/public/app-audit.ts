import { applyStrings } from './i18n-apply.js';
import { escapeHtml, fetchJson, formatDate, severityBadgesHtml, showError, type SeverityRollup } from './app-shared.js';

const strings = applyStrings();

const params = new URLSearchParams(window.location.search);
const auditId = params.get('id');

const metaSite = document.getElementById('meta-site')!;
const metaDate = document.getElementById('meta-date')!;
const metaPages = document.getElementById('meta-pages')!;
const rollupEl = document.getElementById('rollup')!;
const noReports = document.getElementById('no-reports')!;
const reportLinks = document.getElementById('report-links')!;
const findingsRows = document.getElementById('findings-rows')!;

interface Finding {
  findingId: string;
  severity: 'critical' | 'serious' | 'moderate' | 'minor';
  category: string;
  title: string;
  occurrences: number;
  pageUrls: string[];
}

interface ProvencedField<T> {
  value: T;
  provenance: 'detected' | 'operator';
}

interface AuditManualFields {
  siren?: ProvencedField<string>;
  sirenSourceUrl?: ProvencedField<string>;
  raisonSociale?: ProvencedField<string>;
  nomCommercial?: ProvencedField<string>;
  sector?: ProvencedField<'general' | 'hospitality'>;
  revenueBand?: ProvencedField<string>;
  declarationContactEmail?: ProvencedField<string>;
  recipientName?: ProvencedField<string>;
  updatedAt: string;
}

interface AuditDetail {
  auditId: string;
  siteUrl: string;
  startedAt: string;
  finishedAt: string;
  pagesVisited: number;
  severityRollup: SeverityRollup;
  findings: Finding[];
  reportLanguages: ('fr' | 'en')[];
  manualFields?: AuditManualFields;
}

const MANUAL_TEXT_FIELD_IDS = [
  'sirenSourceUrl',
  'raisonSociale',
  'nomCommercial',
  'recipientName',
  'revenueBand',
  'declarationContactEmail',
] as const;

const manualFieldsForm = document.getElementById('manual-fields-form') as HTMLFormElement;
const sirenInput = document.getElementById('mf-siren') as HTMLInputElement;
const sirenCheckButton = document.getElementById('siren-check-button') as HTMLButtonElement;
const sirenPreviewResult = document.getElementById('siren-preview-result')!;
const sectorSelect = document.getElementById('mf-sector') as HTMLSelectElement;
const manualFieldsStatus = document.getElementById('manual-fields-status')!;
const regenerateReportButton = document.getElementById('regenerate-report-button') as HTMLButtonElement;

/** 2026-08-22, La Corniche report review: a prefilled value carries
 *  provenance:'detected' (packages/store's prefillAuditManualFields) -
 *  the operator should not mistake a scanner-derived guess for something
 *  they or a colleague already confirmed. Only wired for the three
 *  fields that can actually be auto-filled today (siren, raisonSociale,
 *  nomCommercial); every other field's hint element simply does not
 *  exist in the DOM, so the lookup is a no-op for them. */
function toggleDetectedHint(fieldId: string, provenance: 'detected' | 'operator' | undefined): void {
  const hint = document.getElementById(`mf-${fieldId}-hint`) as HTMLElement | null;
  if (!hint) return;
  hint.hidden = provenance !== 'detected';
}

function prefillManualFields(manualFields: AuditManualFields | undefined): void {
  if (!manualFields) return;
  if (manualFields.siren) sirenInput.value = manualFields.siren.value;
  toggleDetectedHint('siren', manualFields.siren?.provenance);
  if (manualFields.sector) sectorSelect.value = manualFields.sector.value;
  for (const id of MANUAL_TEXT_FIELD_IDS) {
    const field = manualFields[id];
    toggleDetectedHint(id, field?.provenance);
    if (!field) continue;
    const input = document.getElementById(`mf-${id}`) as HTMLInputElement | null;
    if (input) input.value = field.value;
  }
}

sirenCheckButton.addEventListener('click', () => {
  void checkSiren();
});

async function checkSiren(): Promise<void> {
  const siren = sirenInput.value.trim();
  if (!siren || !auditId) return;
  sirenPreviewResult.textContent = strings.auditDetail.sirenCheckingMessage;
  try {
    const result = await fetchJson<{ resolved: boolean; denomination?: string; siren: string }>(
      `/api/audits/${encodeURIComponent(auditId)}/manual-fields/siren-preview`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ siren }) },
    );
    sirenPreviewResult.textContent = result.resolved
      ? `${strings.auditDetail.sirenResolvedPrefix} ${result.denomination}`
      : strings.auditDetail.sirenNotResolvedMessage;
  } catch (error) {
    sirenPreviewResult.textContent = error instanceof Error ? error.message : String(error);
  }
}

manualFieldsForm.addEventListener('submit', (event) => {
  event.preventDefault();
  void saveManualFields();
});

async function saveManualFields(): Promise<void> {
  if (!auditId) return;
  manualFieldsStatus.textContent = '';
  const formData = new FormData(manualFieldsForm);
  const body: Record<string, string> = {};
  for (const id of MANUAL_TEXT_FIELD_IDS) {
    const value = String(formData.get(id) ?? '').trim();
    if (value !== '') body[id] = value;
  }
  const sector = String(formData.get('sector') ?? '');
  if (sector !== '') body['sector'] = sector;
  const siren = sirenInput.value.trim();
  if (siren !== '') body['siren'] = siren;

  try {
    await fetchJson(`/api/audits/${encodeURIComponent(auditId)}/manual-fields`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    manualFieldsStatus.textContent = strings.auditDetail.savedMessage;
  } catch (error) {
    manualFieldsStatus.textContent = error instanceof Error ? error.message : String(error);
  }
}

regenerateReportButton.addEventListener('click', () => {
  void regenerateReport();
});

async function regenerateReport(): Promise<void> {
  if (!auditId) return;
  regenerateReportButton.disabled = true;
  manualFieldsStatus.textContent = strings.auditDetail.regeneratingMessage;
  try {
    await fetchJson(`/api/audits/${encodeURIComponent(auditId)}/regenerate-report`, { method: 'POST' });
    manualFieldsStatus.textContent = strings.auditDetail.regeneratedMessage;
    await load();
  } catch (error) {
    manualFieldsStatus.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    regenerateReportButton.disabled = false;
  }
}

const SEVERITY_ORDER: Record<Finding['severity'], number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };

function render(detail: AuditDetail): void {
  metaSite.textContent = detail.siteUrl;
  metaDate.textContent = formatDate(detail.startedAt);
  metaPages.textContent = String(detail.pagesVisited);
  rollupEl.innerHTML = severityBadgesHtml(detail.severityRollup, strings);
  prefillManualFields(detail.manualFields);

  if (detail.reportLanguages.length === 0) {
    noReports.hidden = false;
    reportLinks.innerHTML = '';
  } else {
    noReports.hidden = true;
    reportLinks.innerHTML = detail.reportLanguages
      .map((language) => {
        const href = `/api/audits/${encodeURIComponent(detail.auditId)}/report/${language}`;
        return `<p><a href="${href}">${escapeHtml(strings.common.downloadReport)} (${language.toUpperCase()})</a></p>`;
      })
      .join('');
  }

  const sortedFindings = [...detail.findings].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  findingsRows.innerHTML = sortedFindings
    .map(
      (finding) => `
        <tr>
          <td><span class="badge badge-${finding.severity}">${escapeHtml(strings.common.severityLabels[finding.severity])}</span></td>
          <td>${escapeHtml(finding.category)}</td>
          <td>${escapeHtml(finding.title)}</td>
          <td>${finding.occurrences}</td>
          <td>${finding.pageUrls.length}</td>
        </tr>
      `,
    )
    .join('');
}

async function load(): Promise<void> {
  if (!auditId) {
    showError(strings.common.error);
    return;
  }
  try {
    const detail = await fetchJson<AuditDetail>(`/api/audits/${encodeURIComponent(auditId)}`);
    render(detail);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showError(message);
  }
}

void load();
