import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Link } from 'react-router';
import { Badge } from '../components/ui/badge';
import { Button, buttonStyles } from '../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '../components/ui/dialog';
import { Field } from '../components/ui/field';
import { Input } from '../components/ui/input';
import { SegmentedControl } from '../components/ui/segmented';
import { Textarea } from '../components/ui/textarea';
import { useI18n } from '../i18n/provider';
import { sendJson } from '../lib/api';
import {
  BATCH_SCAN_FIELDS,
  buildBatchScanRequest,
  createEmptyFormValues,
  moveBatchRow,
  planBatchScan,
  type AdvancedScanField,
  type BatchScanPlanRow,
  type BatchScanProspect,
  type BatchScanResponse,
  type BatchScanResult,
  type NewScanFormValues,
  type NewScanType,
} from './new-scan-model';

/** Issue #375: review and submit several scans at once. The rows are shown in
 *  the order they will run, may be reordered before sending, and share one
 *  scan type and one set of advanced options. After sending, the dialog shows
 *  every site's outcome instead of closing, so a skipped or rejected site is
 *  never missed. */
export function QueueScansDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prospects: readonly BatchScanProspect[];
  onQueued: () => void;
}): JSX.Element {
  const { open, onOpenChange, prospects, onQueued } = props;
  const { strings } = useI18n();
  const copy = strings.scanQueue;
  const scanCopy = strings.newScan;
  const [rows, setRows] = useState<BatchScanPlanRow[]>([]);
  const [withoutWebsite, setWithoutWebsite] = useState<string[]>([]);
  const [form, setForm] = useState<NewScanFormValues>(createEmptyFormValues);
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [result, setResult] = useState<BatchScanResponse | null>(null);

  useEffect(() => {
    if (!open) return;
    const plan = planBatchScan(prospects);
    setRows(plan.rows);
    setWithoutWebsite(plan.withoutWebsite);
    setResult(null);
    setFailed(false);
  }, [open, prospects]);

  const offers = (field: AdvancedScanField): boolean =>
    BATCH_SCAN_FIELDS[form.type].includes(field);
  const setField = (key: keyof NewScanFormValues, value: string): void =>
    setForm((current) => ({ ...current, [key]: value }));
  const typeLabel = (type: NewScanType): string =>
    type === 'full-audit' ? scanCopy.typeFullAudit : scanCopy.typeQuickCheck;

  const submit = async (): Promise<void> => {
    setSubmitting(true);
    setFailed(false);
    try {
      const response = await sendJson<BatchScanResponse>(
        '/api/scans/batch',
        'POST',
        buildBatchScanRequest(form, rows),
      );
      setResult(response);
      onQueued();
    } catch {
      setFailed(true);
    } finally {
      setSubmitting(false);
    }
  };

  const outcomeText = (entry: BatchScanResult): string => {
    if (entry.outcome === 'queued') return copy.outcomeQueued;
    if (entry.outcome === 'skipped') return copy.outcomeSkippedActive;
    switch (entry.reason) {
      case 'suppressed':
        return copy.outcomeRejectedSuppressed;
      case 'prospect-unavailable':
        return copy.outcomeRejectedProspectUnavailable;
      case 'outside-eu':
        return copy.outcomeRejectedOutsideEu;
      case 'invalid-url':
        return copy.outcomeRejectedInvalidUrl;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogTitle>{copy.dialogTitle}</DialogTitle>
        <DialogDescription>{copy.dialogDescription}</DialogDescription>

        {result === null ? (
          <>
            <div className="mt-4">
              <SegmentedControl
                value={form.type}
                onValueChange={(type) => setForm((current) => ({ ...current, type }))}
                options={[
                  { value: 'full-audit', label: scanCopy.typeFullAudit },
                  { value: 'quick-check', label: scanCopy.typeQuickCheck },
                ]}
                ariaLabel={scanCopy.typeLabel}
              />
            </div>

            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-muted">
                  <th className="w-20 py-1.5 font-medium">{copy.orderColumn}</th>
                  <th className="py-1.5 font-medium">{copy.prospectColumn}</th>
                  <th className="py-1.5 font-medium">{copy.websiteColumn}</th>
                  <th className="py-1.5 font-medium">{copy.scanColumn}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.prospectId} className="border-t border-line">
                    <td className="py-1.5">
                      <span className="inline-flex items-center gap-1">
                        <span className="numeric w-5 text-ink-soft">{index + 1}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="px-1"
                          disabled={index === 0}
                          aria-label={copy.moveUpAria.replace('{name}', row.name)}
                          onClick={() => setRows((current) => moveBatchRow(current, index, -1))}
                        >
                          <ArrowUp className="size-3.5" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="px-1"
                          disabled={index === rows.length - 1}
                          aria-label={copy.moveDownAria.replace('{name}', row.name)}
                          onClick={() => setRows((current) => moveBatchRow(current, index, 1))}
                        >
                          <ArrowDown className="size-3.5" aria-hidden="true" />
                        </Button>
                      </span>
                    </td>
                    <td className="py-1.5 text-ink">{row.name}</td>
                    <td className="ident py-1.5 text-ink-soft">{hostOf(row.url)}</td>
                    <td className="py-1.5">
                      <Badge tone={form.type === 'full-audit' ? 'accent' : 'neutral'}>
                        {typeLabel(form.type)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {withoutWebsite.length > 0 ? (
              <p className="mt-3 text-xs text-sev-moderate">
                {copy.withoutWebsite.replace('{names}', withoutWebsite.join(', '))}
              </p>
            ) : null}

            <div className="mt-5 border-t border-line pt-4">
              <p className="mb-3 text-xs text-ink-muted">{copy.sharedOptionsHint}</p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {offers('maxPages') ? (
                  <Field
                    label={scanCopy.maxPagesLabel}
                    htmlFor="batch-scan-max-pages"
                    hint={scanCopy.maxPagesHint}
                  >
                    <Input
                      id="batch-scan-max-pages"
                      type="number"
                      min={1}
                      value={form.maxPages}
                      onChange={(event) => setField('maxPages', event.target.value)}
                    />
                  </Field>
                ) : null}
                {offers('maxDepth') ? (
                  <Field label={scanCopy.maxDepthLabel} htmlFor="batch-scan-max-depth">
                    <Input
                      id="batch-scan-max-depth"
                      type="number"
                      min={0}
                      value={form.maxDepth}
                      onChange={(event) => setField('maxDepth', event.target.value)}
                    />
                  </Field>
                ) : null}
                {offers('delayMs') ? (
                  <Field
                    label={scanCopy.delayLabel}
                    htmlFor="batch-scan-delay-seconds"
                    hint={scanCopy.delayHint}
                  >
                    <Input
                      id="batch-scan-delay-seconds"
                      type="number"
                      min={0}
                      step="any"
                      inputMode="decimal"
                      value={form.delaySeconds}
                      onChange={(event) => setField('delaySeconds', event.target.value)}
                    />
                  </Field>
                ) : null}
                {offers('scanConcurrency') ? (
                  <Field
                    label={scanCopy.scanConcurrencyLabel}
                    htmlFor="batch-scan-scan-concurrency"
                    hint={scanCopy.scanConcurrencyHint}
                  >
                    <Input
                      id="batch-scan-scan-concurrency"
                      type="number"
                      min={1}
                      value={form.scanConcurrency}
                      onChange={(event) => setField('scanConcurrency', event.target.value)}
                    />
                  </Field>
                ) : null}
              </div>
              {offers('exclusions') ? (
                <div className="mt-4">
                  <Field label={scanCopy.exclusionsLabel} htmlFor="batch-scan-exclusions">
                    <Textarea
                      id="batch-scan-exclusions"
                      value={form.exclusions}
                      onChange={(event) => setField('exclusions', event.target.value)}
                      placeholder={scanCopy.exclusionsPlaceholder}
                    />
                  </Field>
                </div>
              ) : null}
            </div>

            {failed ? (
              <p className="mt-4 text-sm text-danger" role="alert">
                {copy.submitFailed}
              </p>
            ) : null}
            <DialogFooter>
              <Button variant="secondary" disabled={submitting} onClick={() => onOpenChange(false)}>
                {strings.common.cancel}
              </Button>
              <Button
                isLoading={submitting}
                disabled={rows.length === 0}
                onClick={() => void submit()}
              >
                {copy.submitAction.replace('{count}', String(rows.length))}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <p className="mt-4 text-sm text-ink" role="status">
              {copy.resultSummary
                .replace('{queued}', String(result.queued))
                .replace('{skipped}', String(result.skipped))
                .replace('{rejected}', String(result.rejected))}
            </p>
            <ul className="mt-3 flex flex-col gap-1.5 text-sm">
              {result.results.map((entry) => (
                <li key={entry.index} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-ink">{rows[entry.index]?.name ?? hostOf(entry.url)}</span>
                  <span className="ident text-xs text-ink-muted">{hostOf(entry.url)}</span>
                  <span
                    className={
                      entry.outcome === 'queued'
                        ? 'text-ink-soft'
                        : entry.outcome === 'skipped'
                          ? 'text-sev-moderate'
                          : 'text-danger'
                    }
                  >
                    {outcomeText(entry)}
                  </span>
                </li>
              ))}
            </ul>
            <DialogFooter>
              <Button variant="secondary" onClick={() => onOpenChange(false)}>
                {copy.closeAction}
              </Button>
              <Link to="/audits" className={buttonStyles('primary')}>
                {copy.openQueueAction}
              </Link>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
