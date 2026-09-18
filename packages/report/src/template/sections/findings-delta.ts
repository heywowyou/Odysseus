import type {
  FindingsDelta,
  FindingsDeltaClass,
  FindingsDeltaRow,
  ReportLanguage,
} from '@odysseus/core';
import type { ReportStrings } from '../strings/i18n.js';
import {
  escapeHtml,
  fillTemplate,
  formatDate,
  formatNumber,
  pluralize,
  renderSheetHeader,
  sheet,
} from '../html-utils.js';
import { resolveFindingDisplayLabel } from '../rule-translations.js';
import { renderSeverityBadge } from '../severity-badge.js';

/** Plan 051: the re-audit's findings delta. A deterministic splice of the
 *  record `computeFindingsDelta` built in @odysseus/core: this renderer
 *  classifies nothing and words nothing beyond the fixed strings. The
 *  section exists only when the orchestration layer passed a delta. */

const COUNT_ORDER: readonly FindingsDeltaClass[] = [
  'new',
  'newly-observable',
  'changed-severity',
  'resolved',
  'not-comparable',
  'persistent',
];

function headCell(label: string, width: string): string {
  return `<th style="width:${width};padding:var(--space-2);font-size:11px;letter-spacing:0.02em;text-transform:uppercase;text-align:left;font-weight:400;color:color-mix(in srgb, var(--color-text) 60%, transparent);border-bottom:1px solid var(--color-divider);white-space:nowrap">${escapeHtml(label)}</th>`;
}

function cell(html: string, extra = ''): string {
  return `<td style="padding:var(--space-2);border-bottom:1px solid var(--color-divider);${extra}">${html}</td>`;
}

function findingCell(language: ReportLanguage, row: FindingsDeltaRow): string {
  const label = resolveFindingDisplayLabel(language, row.ruleId, row.title);
  return cell(
    `${escapeHtml(label)}<span class="text-muted" style="display:block;font-size:10.5px;margin-top:2px">${escapeHtml(row.ruleId)}</span>`,
  );
}

function renderSingleSideTable(
  strings: ReportStrings,
  language: ReportLanguage,
  heading: string,
  rows: readonly FindingsDeltaRow[],
  side: 'baseline' | 'current',
): string {
  const d = strings.findingsDelta;
  return `
    <h5 style="margin-top:var(--space-6)">${escapeHtml(heading)}</h5>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr>
          ${headCell(d.findingColumnLabel, 'auto')}
          ${headCell(d.severityColumnLabel, '110px')}
          ${headCell(d.pagesColumnLabel, '70px')}
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((row) => {
            const values = row[side]!;
            return `<tr style="break-inside:avoid">
              ${findingCell(language, row)}
              ${cell(renderSeverityBadge(strings, values.severity))}
              ${cell(formatNumber(values.pageCount, language))}
            </tr>`;
          })
          .join('')}
      </tbody>
    </table>
  `;
}

function renderChangedSeverityTable(
  strings: ReportStrings,
  language: ReportLanguage,
  rows: readonly FindingsDeltaRow[],
): string {
  const d = strings.findingsDelta;
  return `
    <h5 style="margin-top:var(--space-6)">${escapeHtml(d.changedSeverityHeading)}</h5>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr>
          ${headCell(d.findingColumnLabel, 'auto')}
          ${headCell(d.previousColumnLabel, '130px')}
          ${headCell(d.currentColumnLabel, '130px')}
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (row) => `<tr style="break-inside:avoid">
              ${findingCell(language, row)}
              ${cell(renderSeverityBadge(strings, row.baseline!.severity))}
              ${cell(renderSeverityBadge(strings, row.current!.severity))}
            </tr>`,
          )
          .join('')}
      </tbody>
    </table>
  `;
}

function pageLimitText(strings: ReportStrings, language: ReportLanguage, value: number): string {
  return value >= Number.MAX_SAFE_INTEGER
    ? strings.findingsDelta.noPageLimit
    : formatNumber(value, language);
}

function note(text: string): string {
  return `<p style="font-size:12px;opacity:0.7;max-width:var(--measure-prose);margin-top:var(--space-3)">${escapeHtml(text)}</p>`;
}

function renderDisclosures(
  strings: ReportStrings,
  language: ReportLanguage,
  delta: FindingsDelta,
): string {
  const d = strings.findingsDelta;
  const parts: string[] = [];
  if (delta.changedSeveritySuppressed) parts.push(note(d.severitySuppressedNote));
  if (delta.normalizationChanged) parts.push(note(d.normalizationChangedNote));
  if (delta.coverage?.scopeChanged === true) parts.push(note(d.scopeChangedNote));
  if (delta.coverage?.inventoryChanged === true) parts.push(note(d.inventoryChangedNote));
  for (const difference of delta.configDifferences) {
    const template =
      difference.field === 'maxPages' ? d.maxPagesChangedTemplate : d.maxDepthChangedTemplate;
    const format = (value: number): string =>
      difference.field === 'maxPages'
        ? pageLimitText(strings, language, value)
        : formatNumber(value, language);
    parts.push(
      note(
        fillTemplate(template, {
          before: format(difference.baseline),
          after: format(difference.current),
        }),
      ),
    );
  }
  if (delta.versionDifferences.length > 0) {
    const rows = delta.versionDifferences
      .map(
        (difference) =>
          `<li>${escapeHtml(
            fillTemplate(d.versionRowTemplate, {
              tool: d.toolLabels[difference.field],
              before: difference.baseline ?? d.versionUnavailable,
              after: difference.current ?? d.versionUnavailable,
            }),
          )}</li>`,
      )
      .join('');
    parts.push(
      `<h5 style="margin-top:var(--space-6)">${escapeHtml(d.versionsHeading)}</h5><ul style="font-size:12px;opacity:0.8">${rows}</ul>`,
    );
  }
  return parts.join('');
}

export function renderFindingsDelta(
  strings: ReportStrings,
  ordinal: number,
  language: ReportLanguage,
  delta: FindingsDelta,
): string {
  const d = strings.findingsDelta;
  const byClass = (value: FindingsDeltaClass): FindingsDeltaRow[] =>
    delta.rows.filter((row) => row.class === value);
  const added = byClass('new');
  const newlyObservable = byClass('newly-observable');
  const changed = byClass('changed-severity');
  const resolved = byClass('resolved');
  const notComparable = byClass('not-comparable');
  const persistent = delta.counts.persistent;

  /* The observability classes exist only when both runs carried coverage
   * signatures; a legacy comparison shows the four shipped counters and
   * not two permanent zeros implying a judgment it never made. */
  const observabilityCounted = delta.coverage !== undefined;
  const counts = COUNT_ORDER.filter(
    (value) =>
      (value !== 'changed-severity' || !delta.changedSeveritySuppressed) &&
      (observabilityCounted || (value !== 'newly-observable' && value !== 'not-comparable')),
  )
    .map(
      (value) => `
        <div style="flex:1;min-width:110px">
          <div class="numeric" style="font-size:26px;line-height:1.1">${escapeHtml(formatNumber(delta.counts[value], language))}</div>
          <div style="font-size:11.5px;opacity:0.7">${escapeHtml(d.countLabels[value])}</div>
        </div>`,
    )
    .join('');

  const tables = [
    added.length > 0
      ? renderSingleSideTable(strings, language, d.newHeading, added, 'current')
      : '',
    newlyObservable.length > 0
      ? `${renderSingleSideTable(strings, language, d.newlyObservableHeading, newlyObservable, 'current')}${note(d.newlyObservableNote)}`
      : '',
    changed.length > 0 ? renderChangedSeverityTable(strings, language, changed) : '',
    resolved.length > 0
      ? `${renderSingleSideTable(strings, language, d.resolvedHeading, resolved, 'baseline')}${note(d.resolvedNote)}`
      : '',
    notComparable.length > 0
      ? `${renderSingleSideTable(strings, language, d.notComparableHeading, notComparable, 'baseline')}${note(d.notComparableNote)}`
      : '',
  ].join('');
  const noChanges =
    added.length + changed.length + resolved.length === 0 ? note(d.noChangesBody) : '';
  const persistentNote =
    persistent > 0
      ? note(
          fillTemplate(
            pluralize(language, persistent, d.persistentNoteSingular, d.persistentNotePlural),
            { count: formatNumber(persistent, language) },
          ),
        )
      : '';

  return sheet(
    `
    ${renderSheetHeader(ordinal, d.eyebrow, d.heading, 'var(--space-3)')}
    <p style="font-size:13.5px;opacity:0.85;max-width:var(--measure-prose)">${escapeHtml(
      fillTemplate(d.introTemplate, {
        date: formatDate(new Date(delta.baseline.startedAt), language),
      }),
    )}</p>
    <div style="display:flex;flex-wrap:wrap;gap:var(--space-4);margin-top:var(--space-4)">${counts}</div>
    ${tables}
    ${noChanges}
    ${persistentNote}
    ${renderDisclosures(strings, language, delta)}
  `,
    '',
    'section-16',
  );
}
