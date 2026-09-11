/** Render state of a KPI value. Counts never render as a confident zero:
 *  while the first load is in flight the value is a skeleton, and a failed
 *  load shows the explicit unavailable marker instead of a number nobody can
 *  stand behind. A loaded zero stays a legitimate zero. */
export type KpiValueState = 'loaded' | 'loading' | 'unavailable';
