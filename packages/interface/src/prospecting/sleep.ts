/**
 * Lives here, not in @odysseus/scanner (which "owns the Chromium
 * lifecycle" and the prospecting cheap-fetch stage must never touch it) -
 * the first shared consumer of this idiom outside scanner, where it is
 * otherwise copy-pasted inline in four places (crawl.ts, render-diff.ts,
 * scan-site.ts, scan-page.ts).
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
