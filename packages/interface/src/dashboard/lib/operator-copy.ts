import type { ActionCapability } from '../../operator/contract';
import type { WorkStateStrings } from '../i18n/sections/work-state';
import { ApiError } from './api';

/**
 * Plan 061 §8.3: recovery copy is chosen from the typed problem code and
 * blocking reason the server returns, never from the English message.
 * Returns undefined for an error that carries no typed problem, so the
 * caller keeps its own generic fallback.
 */
export function problemCopy(error: unknown, copy: WorkStateStrings): string | undefined {
  if (!(error instanceof ApiError) || error.problem === undefined) return undefined;
  const { code, reasonCode } = error.problem;
  if (code === 'action-blocked' && reasonCode !== undefined) return copy.blockReasons[reasonCode];
  return copy.problems[code];
}

/** True when the failure means the page's view is stale and a refresh is
 *  the recovery. */
export function isStateChanged(error: unknown): boolean {
  return error instanceof ApiError && error.problem?.code === 'state-changed';
}

/** Why an action is unavailable, for an aria-disabled control's
 *  description. Undefined when the action is available. */
export function blockedReasonCopy(
  capability: ActionCapability,
  copy: WorkStateStrings,
): string | undefined {
  return capability.state === 'blocked' ? copy.blockReasons[capability.reasonCode] : undefined;
}
