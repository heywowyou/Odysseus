/**
 * Tool versions are self-reported by the tools themselves rather than
 * read from installed package.json files: this is ground truth for what
 * actually ran, not what happens to be installed, and axe-core/lighthouse
 * are not even direct dependencies of this package (see axe.ts's comment
 * on why AxeResults is derived structurally instead).
 *
 * Not retrofittable onto stored audits, and that's deliberate: future
 * monitoring work (Milestone 10) compares findings across runs, and an
 * axe-core upgrade between two scans must not read as a phantom
 * regression or phantom fix with no way to attribute it to a tool version
 * change rather than a real change on the client's site.
 */

import { createRequire } from 'node:module';
import type { Browser } from 'playwright';
import type { PageScanResult } from '../scan-page.js';

export interface CollectedToolVersions {
  playwrightVersion: string;
  chromiumVersion: string;
  axeCoreVersion: string | null;
  lighthouseVersion: string | null;
}

const require = createRequire(import.meta.url);

function readPlaywrightVersion(): string {
  const pkg = require('playwright/package.json') as { version: string };
  return pkg.version;
}

export async function collectToolVersions(
  browser: Browser,
  pages: readonly PageScanResult[],
): Promise<CollectedToolVersions> {
  const axeCoreVersion =
    pages.find((page) => page.axe !== undefined)?.axe?.testEngine.version ?? null;
  const lighthouseVersion =
    pages.find((page) => page.lighthouse !== undefined)?.lighthouse?.lighthouseVersion ?? null;

  return {
    playwrightVersion: readPlaywrightVersion(),
    chromiumVersion: browser.version(),
    axeCoreVersion,
    lighthouseVersion,
  };
}
