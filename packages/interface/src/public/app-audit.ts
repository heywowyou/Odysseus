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

interface ReportCombo {
  language: 'fr' | 'en';
  tier: 'screening' | 'full';
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
  reportCombos: ReportCombo[];
}

const SEVERITY_ORDER: Record<Finding['severity'], number> = { critical: 0, serious: 1, moderate: 2, minor: 3 };

function render(detail: AuditDetail): void {
  metaSite.textContent = detail.siteUrl;
  metaDate.textContent = formatDate(detail.startedAt);
  metaPages.textContent = String(detail.pagesVisited);
  rollupEl.innerHTML = severityBadgesHtml(detail.severityRollup, strings);

  if (detail.reportCombos.length === 0) {
    noReports.hidden = false;
    reportLinks.innerHTML = '';
  } else {
    noReports.hidden = true;
    reportLinks.innerHTML = detail.reportCombos
      .map(({ language, tier }) => {
        const href = `/api/audits/${encodeURIComponent(detail.auditId)}/report/${language}?tier=${tier}`;
        const tierLabel = escapeHtml(strings.common.tierLabels[tier]);
        return `<p><a href="${href}">${escapeHtml(strings.common.downloadReport)} - ${tierLabel} (${language.toUpperCase()})</a></p>`;
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
