/**
 * Screenshot refs are written by render-diff.ts as filesystem paths under
 * whatever screenshotDir the caller passed in. Stored/serialized data
 * (scan.json, findings.json, the audits/findings collections) must not
 * carry absolute paths: they break the moment the artifacts root moves or
 * the database is read from another machine. This rewrites both ref
 * fields to be relative to the audit directory, leaving every other field
 * untouched.
 */

import path from 'node:path';
import type { RenderDiffResult } from '@odysseus/core';

export function toAuditRelativeRefs(result: RenderDiffResult, auditDir: string): RenderDiffResult {
  const relativized: RenderDiffResult = { ...result };

  if (result.rawScreenshotRef !== undefined) {
    relativized.rawScreenshotRef = path.relative(auditDir, path.resolve(result.rawScreenshotRef));
  }
  if (result.renderedScreenshotRef !== undefined) {
    relativized.renderedScreenshotRef = path.relative(
      auditDir,
      path.resolve(result.renderedScreenshotRef),
    );
  }

  return relativized;
}
