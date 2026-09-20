import { afterEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { getArtifactsRoot, getReportsRoot } from './config.js';

const original = process.env.ODYSSEUS_REPORTS_ROOT;

afterEach(() => {
  if (original === undefined) delete process.env.ODYSSEUS_REPORTS_ROOT;
  else process.env.ODYSSEUS_REPORTS_ROOT = original;
});

describe('getReportsRoot', () => {
  /** What a scan produced and what the operator did to the report afterwards
   *  are different things with different retention; they do not share a tree. */
  it('is a sibling of the artifacts root, not inside it', () => {
    delete process.env.ODYSSEUS_REPORTS_ROOT;

    expect(getReportsRoot()).toBe(path.join(path.dirname(getArtifactsRoot()), 'reports'));
  });

  it('resolves a configured root against the workspace, so the cwd never moves it', () => {
    process.env.ODYSSEUS_REPORTS_ROOT = 'client-reports';

    expect(getReportsRoot()).toBe(path.join(path.dirname(getArtifactsRoot()), 'client-reports'));
  });

  it('keeps an absolute configured root as given', () => {
    process.env.ODYSSEUS_REPORTS_ROOT = '/srv/odysseus-reports';

    expect(getReportsRoot()).toBe('/srv/odysseus-reports');
  });
});
