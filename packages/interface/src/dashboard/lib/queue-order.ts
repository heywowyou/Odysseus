/**
 * Plan 061 §6.2 and §11: the complete new order a one-step move produces.
 * The reorder command always sends the whole order with the revision it was
 * computed from, so the server can refuse it as a whole if anything moved.
 * Returns undefined for a move that would leave the list unchanged.
 */
export function moveInOrder(
  jobIds: readonly string[],
  jobId: string,
  direction: 'up' | 'down',
): string[] | undefined {
  const index = jobIds.indexOf(jobId);
  if (index === -1) return undefined;
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= jobIds.length) return undefined;
  const next = [...jobIds];
  next[index] = jobIds[target]!;
  next[target] = jobId;
  return next;
}
