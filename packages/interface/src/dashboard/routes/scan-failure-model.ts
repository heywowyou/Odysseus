/** Stable, deliberately small classification for scan failures. The server
 *  still keeps the original error for diagnostics, but the dashboard must
 *  not make internal English exceptions the operator's primary explanation. */
export type ScanFailureReason = 'site-unreachable' | 'inventory' | 'generic';

export function scanFailureReason(error: string | undefined): ScanFailureReason {
  const normalized = error?.toLowerCase() ?? '';
  if (
    normalized.includes('network safety blocked') ||
    normalized.includes('unresolvable-host') ||
    normalized.includes('robots target')
  ) {
    return 'site-unreachable';
  }
  if (normalized.includes('inventory ledger') || normalized.includes('inventory remains')) {
    return 'inventory';
  }
  return 'generic';
}
