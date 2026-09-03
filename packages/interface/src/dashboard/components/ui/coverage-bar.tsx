import type { JSX } from 'react';
import { cn } from '../../lib/cn';

/**
 * The one element this dashboard is built around.
 *
 * A full audit does not run every tool on every page, and the charter's whole
 * coverage vocabulary exists to keep that honest: a URL can be inventoried,
 * content-checked, performance-measured, or omitted behind the continuation
 * guard, and those are four different claims. Every other surface in the tool
 * used to flatten them into one page count, which is exactly the overstatement
 * the coverage rules were written to prevent.
 *
 * So the bar draws them to scale, in nesting order, strongest ink for the
 * strongest claim. The omitted segment is deliberately detached from the
 * inventory block and hatched rather than filled: those URLs were never
 * inventoried, and a solid segment butted against the others would read as if
 * they had been.
 *
 * The bar itself is decoration. Every number it encodes is also written out in
 * the legend below it, so the meaning survives with images off, at any zoom,
 * and in a screen reader.
 */
export type CoverageSegmentKind = 'measured' | 'checked' | 'reached' | 'failed' | 'omitted';

export interface CoverageSegment {
  kind: CoverageSegmentKind;
  label: string;
  /** Drives the bar's width, so this stays the disjoint (nesting-adjusted)
   *  count: double-counting it would misdraw the strip, since a
   *  performance-measured page is also a content-checked one. */
  value: number;
  /** What the legend prints. Defaults to value. The charter's coverage
   *  vocabulary (measured/checked/inventoried) names absolute counts, not
   *  residuals, so the legend shows the real total for each band while the
   *  bar itself still draws the non-overlapping remainder. */
  displayValue?: number;
}

const FILL_STYLES: Record<CoverageSegmentKind, string> = {
  measured: 'bg-accent',
  checked: 'bg-ink-soft',
  reached: 'bg-line-strong',
  failed: 'bg-sev-critical/70',
  omitted: 'hatched bg-raised border border-dashed border-line-strong',
};

const SWATCH_STYLES: Record<CoverageSegmentKind, string> = {
  measured: 'bg-accent',
  checked: 'bg-ink-soft',
  reached: 'bg-line-strong',
  failed: 'bg-sev-critical/70',
  omitted: 'hatched bg-raised border border-dashed border-line-strong',
};

export function CoverageBar(props: {
  segments: CoverageSegment[];
  /** Names what the bar counts, e.g. "URLs of this audit". */
  caption?: string;
  className?: string;
}): JSX.Element {
  const { segments, caption, className } = props;
  const inventory = segments.filter((segment) => segment.kind !== 'omitted');
  const omitted = segments.filter((segment) => segment.kind === 'omitted');
  const inventoryTotal = inventory.reduce((sum, segment) => sum + segment.value, 0);
  const omittedTotal = omitted.reduce((sum, segment) => sum + segment.value, 0);
  const grandTotal = inventoryTotal + omittedTotal;

  // A zero total would divide by zero and, more importantly, would draw a full
  // bar for a scan that measured nothing.
  const width = (value: number): string =>
    grandTotal === 0 ? '0%' : `${(value / grandTotal) * 100}%`;

  return (
    <figure className={cn('m-0', className)}>
      <div className="flex h-2 w-full items-stretch gap-1" aria-hidden="true">
        {inventoryTotal > 0 ? (
          <div
            className="flex overflow-hidden rounded-full"
            style={{ width: width(inventoryTotal) }}
          >
            {inventory.map((segment) =>
              segment.value === 0 ? null : (
                <div
                  key={segment.kind}
                  className={FILL_STYLES[segment.kind]}
                  style={{ width: `${(segment.value / inventoryTotal) * 100}%` }}
                />
              ),
            )}
          </div>
        ) : null}
        {omittedTotal > 0 ? (
          <div
            className={cn('rounded-full', FILL_STYLES.omitted)}
            style={{ width: width(omittedTotal) }}
          />
        ) : null}
      </div>

      <figcaption className="mt-3">
        {caption !== undefined ? <p className="sr-only">{caption}</p> : null}
        <dl className="flex flex-wrap gap-x-6 gap-y-2">
          {segments.map((segment) => (
            <div key={segment.kind} className="flex items-baseline gap-2">
              <span
                className={cn(
                  'size-2 shrink-0 translate-y-[-1px] rounded-sm',
                  SWATCH_STYLES[segment.kind],
                )}
                aria-hidden="true"
              />
              <dt className="text-xs text-ink-muted">{segment.label}</dt>
              <dd className="numeric text-sm font-medium text-ink">
                {segment.displayValue ?? segment.value}
              </dd>
            </div>
          ))}
        </dl>
      </figcaption>
    </figure>
  );
}
