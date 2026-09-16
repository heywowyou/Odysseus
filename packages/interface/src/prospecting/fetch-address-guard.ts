/**
 * The prospecting helpers' view of the shared address guard
 * (@odysseus/scanner's address-guard.ts, which owns the classifier and its
 * rationale). This wrapper only adds the operator allowlist from config.ts,
 * the escape hatch for local smoke against fixture servers.
 */

import {
  checkFetchTarget as checkSharedFetchTarget,
  type FetchTargetVerdict,
  type LookupAddresses,
} from '@odysseus/scanner';
import { getProspectFetchAllowlist } from '../config.js';

export {
  classifyIpAddress,
  type FetchTargetVerdict,
  type LookupAddresses,
  type ResolvedAddress,
} from '@odysseus/scanner';

export interface CheckFetchTargetOptions {
  /** Test seam: injected instead of the real getaddrinfo lookup. */
  lookupAddresses?: LookupAddresses | undefined;
}

export function checkFetchTarget(
  url: string,
  options: CheckFetchTargetOptions = {},
): Promise<FetchTargetVerdict> {
  return checkSharedFetchTarget(url, {
    lookupAddresses: options.lookupAddresses,
    allowHosts: getProspectFetchAllowlist(),
  });
}
