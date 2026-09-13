/**
 * The audit page's failure card (plan 040 slice 5, moved out of
 * audit-reports-section.tsx by plan 045 stage 3.4 once that file held only
 * the reports list). The failure card no longer regenerates anything: it
 * links to the report panel section to redo, so the page keeps one
 * regenerate affordance per cause.
 */

import type { JSX } from 'react';
import { Link } from 'react-router';
import { Button, buttonStyles } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { useI18n } from '../i18n/provider';
import type { DashboardStrings } from '../i18n/types';
import { failureReasonKind } from './audit-detail-model';
import type { AuditFailureResponse, AuditLifecycle } from './audit-detail-types';

/** Field labels reused from this page's own manual-fields form: the two
 *  identity fields are the same two fields, so the copy cannot drift. */
function failureFieldLabel(field: string, strings: DashboardStrings): string {
  if (field === 'nomCommercial') return strings.auditDetail.nomCommercialLabel;
  if (field === 'raisonSociale') return strings.auditDetail.raisonSocialeLabel;
  return field;
}

// jsdom ships no layout engine, so the scroll targets are resolved lazily
// and the buttons are never clicked in tests without a guard.
function scrollToAnchor(anchor: string): void {
  const target = document.getElementById(anchor);
  if (typeof target?.scrollIntoView === 'function') {
    target.scrollIntoView(true);
  }
}

/** Issue #90: a report-stage failure is a needs-input state, and the
 *  reason exists only on the linked job row until this card surfaces it.
 *  The stored message is the pipeline's own English prescription and is
 *  shown verbatim as a technical detail; the bilingual hint above the
 *  actions carries the remediation, keyed on the typed failure case.
 *  Plan 040 slice 5: the card links to the step to redo instead of
 *  regenerating itself - the identity gate goes to the hotel fields, a
 *  failure after the analysis pair goes back to the PDF production step,
 *  and a `scanned` audit (no pair stored) goes to the writing step, the
 *  only action that creates a pair. */
export function FailureCard(props: {
  failure: AuditFailureResponse;
  lifecycle: AuditLifecycle;
}): JSX.Element {
  const { failure, lifecycle } = props;
  const { strings } = useI18n();
  const isIdentity = failureReasonKind(failure) === 'identity-confirmation';
  const hasPairToRegenerate = lifecycle !== 'scanned';
  const awaitingFields = failure.needsInputFields ?? [];
  return (
    <Card
      title={strings.auditDetail.failureHeading}
      className={isIdentity ? 'border-sev-moderate/40' : 'border-danger/40'}
    >
      {isIdentity && awaitingFields.length > 0 ? (
        <div className="mb-3">
          <p className="text-sm font-medium text-ink">
            {strings.auditDetail.failureAwaitingFieldsLabel}
          </p>
          <ul className="mt-1 flex flex-col gap-1 text-sm text-ink-soft">
            {awaitingFields.map((entry) => (
              <li key={entry.field}>
                <span className="font-medium text-ink">
                  {failureFieldLabel(entry.field, strings)}:
                </span>{' '}
                {entry.value}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-sm text-ink-soft">
        {isIdentity
          ? strings.auditDetail.failureHintIdentity
          : hasPairToRegenerate
            ? strings.auditDetail.failureHintReportStage
            : strings.auditDetail.failureHintAnalysisStage}
      </p>
      {failure.error !== '' ? (
        <div className="mt-3">
          <p className="text-xs font-medium text-ink-muted">
            {strings.auditDetail.failureMessageLabel}
          </p>
          <pre className="mt-1 overflow-x-auto rounded-lg border border-line bg-raised p-3 font-mono text-xs whitespace-pre-wrap text-ink-soft">
            {failure.error}
          </pre>
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {isIdentity ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => scrollToAnchor('audit-hotel-fields')}
          >
            {strings.auditDetail.failureScrollToFields}
          </Button>
        ) : hasPairToRegenerate ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => scrollToAnchor('audit-panel-produce')}
          >
            {strings.auditDetail.failureScrollToProduce}
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => scrollToAnchor('audit-panel-writing')}
          >
            {strings.auditDetail.failureScrollToRedact}
          </Button>
        )}
        <Link
          to={`/scans/${encodeURIComponent(failure.jobId)}`}
          className={buttonStyles('ghost', 'sm')}
        >
          {strings.auditDetail.failureJobLink}
        </Link>
      </div>
    </Card>
  );
}
