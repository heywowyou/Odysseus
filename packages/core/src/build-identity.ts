/**
 * Build identity: the short commit-like token that ties an artifact or a
 * rendered report back to the exact code that produced it.
 *
 * The sentinel lives here, in core, rather than in whichever package
 * happens to resolve the value, because two very different consumers must
 * agree on it: the scanner stamps it onto every manifest, and the report
 * decides whether it is fit to print. When those two disagreed, the report
 * printed the word "unknown" to a paying client (issue #58).
 */

/**
 * Recorded when no build identity could be resolved. Client-facing copy
 * must never print it: to a reader it looks like a defect in the document
 * and tells them nothing useful. Gate on isKnownBuildId before rendering.
 */
export const UNKNOWN_BUILD_ID = 'unknown';

/** Length of the abbreviated commit hash git itself prints by default. */
const SHORT_COMMIT_LENGTH = 7;

const FULL_COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/i;

/**
 * True when the value identifies a build well enough to show a client or to
 * debug from. Empty strings and the sentinel are both rejected, so callers
 * cannot accidentally treat "no build" as a build.
 */
export function isKnownBuildId(value: string | undefined): value is string {
  if (value === undefined) return false;
  const trimmed = value.trim();
  return trimmed !== '' && trimmed !== UNKNOWN_BUILD_ID;
}

/**
 * Reduce a build identity to the form the rest of the system already uses.
 *
 * A full 40-character commit SHA is abbreviated to git's own short form, so
 * a build stamped from a deployment tag reads the same as one read from a
 * local checkout and lands in report filenames at the same length. Anything
 * that is not a full SHA is passed through trimmed: it may be a tag, a
 * short hash, or something an operator set by hand, and truncating those
 * would corrupt them.
 */
export function normalizeBuildId(value: string): string {
  const trimmed = value.trim();
  if (!isKnownBuildId(trimmed)) return UNKNOWN_BUILD_ID;
  return FULL_COMMIT_SHA_PATTERN.test(trimmed) ? trimmed.slice(0, SHORT_COMMIT_LENGTH) : trimmed;
}
