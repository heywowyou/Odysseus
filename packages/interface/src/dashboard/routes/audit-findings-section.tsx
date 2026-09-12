/**
 * The Constats section of the audit page (plan 040 slice 5): the findings
 * moved to the top of the page because they are what the audit is. The
 * table with its severity filter and row expansion, and the dedicated
 * publisher-identification alert, moved here unchanged from
 * audit-detail.tsx when the page was split into composed sections.
 */

import { useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import { ChevronDown } from 'lucide-react';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Select } from '../components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '../components/ui/table';
import { useI18n } from '../i18n/provider';
import type { DashboardLanguage } from '../i18n/types';
import { vocabularyLabel } from '../lib/vocabulary';
import { cn } from '../lib/cn';
import {
  SEVERITIES,
  countOccurrences,
  countPages,
  findingDisplayTitle,
  findingExpansionView,
  firstElementSelector,
  isSeverity,
  sortFindings,
} from './audit-detail-model';
import type { RuleCopyMap } from './audit-detail-model';
import type { FindingResponse, Severity } from './audit-detail-types';

type SeverityFilter = '' | Severity;

export function FindingsCard(props: {
  findings: FindingResponse[];
  ruleCopy: RuleCopyMap | undefined;
  language: DashboardLanguage;
  expandedFindingId: string | null;
  onExpandedFindingChange: (findingId: string | null) => void;
}): JSX.Element {
  const { findings, ruleCopy, language, expandedFindingId, onExpandedFindingChange } = props;
  const { strings } = useI18n();
  const [filter, setFilter] = useState<SeverityFilter>('');
  const sorted = useMemo(() => sortFindings(findings), [findings]);
  const visible = filter === '' ? sorted : sorted.filter((finding) => finding.severity === filter);
  // The dedicated alert lands on the same actionable control as a direct
  // table click, so its remediation remains the existing reviewed copy.
  useEffect(() => {
    if (expandedFindingId === null) return;
    const control = document.getElementById(`finding-toggle-${expandedFindingId}`);
    if (typeof control?.scrollIntoView === 'function') {
      control.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    (control as HTMLButtonElement | null)?.focus({ preventScroll: true });
  }, [expandedFindingId]);
  return (
    <Card
      title={strings.auditDetail.findingsHeading}
      actions={
        <div className="w-44">
          <Select
            aria-label={strings.auditDetail.findingsFilterAll}
            value={filter}
            onChange={(event) => {
              const next = event.target.value;
              if (next === '' || isSeverity(next)) {
                setFilter(next);
              }
            }}
          >
            <option value="">{strings.auditDetail.findingsFilterAll}</option>
            {SEVERITIES.map((severity) => (
              <option key={severity} value={severity}>
                {strings.common.severityLabels[severity]}
              </option>
            ))}
          </Select>
        </div>
      }
    >
      {visible.length === 0 ? (
        <p className="text-sm text-ink-muted">{strings.auditDetail.findingsEmpty}</p>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell className="w-24">
                {strings.auditDetail.severityColumn}
              </TableHeaderCell>
              <TableHeaderCell>{strings.auditDetail.categoryColumn}</TableHeaderCell>
              <TableHeaderCell>{strings.auditDetail.titleColumn}</TableHeaderCell>
              <TableHeaderCell className="w-28 text-right">
                {strings.auditDetail.occurrencesColumn}
              </TableHeaderCell>
              <TableHeaderCell className="w-28 text-right">
                {strings.auditDetail.pagesColumn}
              </TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visible.map((finding) => {
              const isExpanded = expandedFindingId === finding.findingId;
              const selector = firstElementSelector(finding);
              return (
                <FindingRowGroup
                  key={finding.findingId}
                  finding={finding}
                  ruleCopy={ruleCopy}
                  language={language}
                  isExpanded={isExpanded}
                  selector={selector}
                  onToggle={() => onExpandedFindingChange(isExpanded ? null : finding.findingId)}
                />
              );
            })}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

/** One finding: the summary row with its visible discriminator (the short
 *  finding id and the first occurrence's selector, which is what makes
 *  repeated detector titles distinguishable), plus the expansion row when
 *  open. The expansion renders the reviewed FR/EN copy the API resolved
 *  for the rule, then the affected pages and the stored element identity
 *  (selector, snippet, page). */
function FindingRowGroup(props: {
  finding: FindingResponse;
  ruleCopy: RuleCopyMap | undefined;
  language: DashboardLanguage;
  isExpanded: boolean;
  selector: string | undefined;
  onToggle: () => void;
}): JSX.Element {
  const { finding, ruleCopy, language, isExpanded, selector, onToggle } = props;
  const { strings } = useI18n();
  const expansion = isExpanded ? findingExpansionView(finding, ruleCopy, language) : undefined;
  return (
    <>
      <TableRow onClick={onToggle} className="cursor-pointer">
        <TableCell>
          <Badge tone={finding.severity}>{strings.common.severityLabels[finding.severity]}</Badge>
        </TableCell>
        <TableCell>
          {vocabularyLabel(strings.auditDetail.categoryLabels, finding.category, finding.category)}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <button
              id={`finding-toggle-${finding.findingId}`}
              type="button"
              className="rounded p-0.5 text-ink-muted transition-colors hover:text-accent-bright"
              aria-expanded={isExpanded}
              aria-label={strings.auditDetail.findingDetailsToggle}
              onClick={(event) => {
                event.stopPropagation();
                onToggle();
              }}
            >
              <ChevronDown
                className={cn('size-4 transition-transform', isExpanded && 'rotate-180')}
                aria-hidden="true"
              />
            </button>
            <span className="min-w-0">
              <span className="block text-ink">
                {findingDisplayTitle(finding, ruleCopy, language)}
              </span>
              <span className="numeric block font-mono text-xs text-ink-muted">
                {finding.findingId}
                {selector !== undefined ? (
                  <span className="ml-2 max-w-72 truncate align-baseline">{selector}</span>
                ) : null}
              </span>
            </span>
          </div>
        </TableCell>
        <TableCell className="numeric text-right">{countOccurrences(finding)}</TableCell>
        <TableCell className="numeric text-right">{countPages(finding)}</TableCell>
      </TableRow>
      {expansion !== undefined ? (
        <TableRow>
          <TableCell colSpan={5} className="bg-raised">
            {expansion.gloss !== undefined ? (
              <p className="max-w-reading text-sm text-ink-soft">
                <span className="font-medium text-ink">
                  {strings.auditDetail.findingGlossLabel} :
                </span>{' '}
                {expansion.gloss}
              </p>
            ) : null}
            {expansion.remediation !== undefined ? (
              <p className="mt-2 max-w-reading text-sm text-ink-soft">
                <span className="font-medium text-ink">
                  {strings.auditDetail.findingRemediationLabel} :
                </span>{' '}
                {expansion.remediation}
              </p>
            ) : null}
            <p className="mt-3 text-xs font-medium text-ink-muted">
              {strings.auditDetail.pagesColumn}
            </p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {expansion.pages.map((pageUrl) => (
                <li key={pageUrl} className="break-all font-mono text-xs text-ink-muted">
                  {pageUrl}
                </li>
              ))}
            </ul>
            {expansion.hiddenPageCount > 0 ? (
              <p className="numeric mt-1 text-xs text-ink-muted">
                {strings.auditDetail.findingMorePages.replace(
                  '{count}',
                  String(expansion.hiddenPageCount),
                )}
              </p>
            ) : null}
            {expansion.elements.length > 0 ? (
              <>
                <p className="mt-3 text-xs font-medium text-ink-muted">
                  {strings.auditDetail.findingElementsLabel}
                </p>
                <ul className="mt-1 flex flex-col gap-2">
                  {expansion.elements.map((element) => (
                    <li
                      key={`${element.pageUrl} ${element.selector}`}
                      className="rounded-lg border border-line bg-panel p-2"
                    >
                      <p className="break-all font-mono text-xs text-ink">{element.selector}</p>
                      <p className="mt-1 text-xs text-ink-soft">{element.snippet}</p>
                      <p className="mt-1 break-all font-mono text-xs text-ink-muted">
                        {element.pageUrl}
                      </p>
                    </li>
                  ))}
                </ul>
                {expansion.hiddenElementCount > 0 ? (
                  <p className="numeric mt-1 text-xs text-ink-muted">
                    {strings.auditDetail.findingMoreElements.replace(
                      '{count}',
                      String(expansion.hiddenElementCount),
                    )}
                  </p>
                ) : null}
              </>
            ) : null}
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

/** Issue #120: the scanner's serious publisher-identification observation
 * gets an obvious entry point, without duplicating its reviewed remediation
 * or turning limited scan coverage into a conclusion about the business. */
export function PublisherIdentificationAlert(props: {
  finding: FindingResponse;
  onRevealFinding: () => void;
}): JSX.Element {
  const { finding, onRevealFinding } = props;
  const { strings } = useI18n();
  return (
    <Card
      title={strings.auditDetail.publisherIdentificationHeading}
      className="border-sev-serious/40"
      actions={
        <Badge tone={finding.severity}>{strings.common.severityLabels[finding.severity]}</Badge>
      }
    >
      <p className="max-w-reading text-sm text-ink-soft">
        {strings.auditDetail.publisherIdentificationObserved}
      </p>
      <p className="mt-2 max-w-reading text-xs text-ink-muted">
        {strings.auditDetail.publisherIdentificationLimit}
      </p>
      <Button variant="secondary" size="sm" className="mt-4" onClick={onRevealFinding}>
        {strings.auditDetail.publisherIdentificationAction}
      </Button>
    </Card>
  );
}
